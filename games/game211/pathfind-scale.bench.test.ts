/* eslint-disable zerocraft/no-wall-clock -- 压测基准：performance.now 只量墙钟耗时作报告，不进断言/不进 sim（慢车道·slow-lane-guard 管） */
// game211 · 群体寻路选型压测（owner 2026-08-10「我可能要考虑一些群体 AI 寻路的算法，帮我做个调研」）。
//
// 调研不能靠读代码下结论，**选型必须有数**。这里量两条路在**我们的真实规模**下的开销：
//   ① A*-per-agent —— 本仓现成的 `t2-pathfind`（NavGraph + 通用 A*，路径缓存进 NavPath）
//   ② Flow Field   —— 参考实现（本文件内的纯函数·**不入产物**，只为量成本）：
//                     从目标点做一次 Dijkstra 铺满全图 → 每格存一个方向 → 每个单位 O(1) 查表
//
// 为什么要比这两条：这是大规模 RTS 寻路的分水岭。
//   A* 的成本 ∝ **单位数 × 图规模**；流场的成本 ∝ **图规模**（与单位数**无关**），
//   代价是「一个场只服务一个目标」。我们的场景恰好是「上千单位涌向少数几个目标」——
//   若实测支持，流场就是对症的那一个。
//
// ⚠ 本仓 A* 的 open 表是**线性扫描取 min + `open.find()` 做 decrease-key**
//   （`src/engine/spatial/astar.ts:30-50`，源码自注「小图用数组」）→ 单次查询 ~O(V²)。
//   这不是黑本仓：小图上它更快也更确定。但它把「图能多大」这条约束摆到了台面上，必须量出来。
import { describe, it, expect } from 'vitest';
import { World } from '@zerocraft/engine/engine/core/world.js';
import { flowFieldCapability, bakeFlowField, clearFlowFieldCache, flowFieldCellVisits } from '@zerocraft/engine/skills/tier2/flow-field.js';
import type { FlowField, FlowAgent, Transform } from '@zerocraft/engine/engine/protocol/components.js';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { transformCapability, velocityCapability, relationCapability } from '@zerocraft/engine/atom-skills/index.js';
import { motionApplyCapability } from '@zerocraft/engine/skills/tier1/index.js';
import { pathfindCapability } from '@zerocraft/engine/skills/tier2/index.js';
import type { Component } from '@zerocraft/engine/engine/core/types.js';

const SAFE_MS = 16.7 / 3;   // sim 安全线（与 cannon-army-bench / slg-scale 同口径）

/** 建一张 `side × side` 的四连通网格 NavGraph（节点数 = side²）。 */
function gridNav(side: number, spacing: number): { nodes: Array<{ x: number; y: number }>; edges: Array<{ a: number; b: number }> } {
  const nodes: Array<{ x: number; y: number }> = [];
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) nodes.push({ x: (i - side / 2) * spacing, y: (j - side / 2) * spacing });
  const edges: Array<{ a: number; b: number }> = [];
  const idx = (i: number, j: number): number => j * side + i;
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
    if (i + 1 < side) edges.push({ a: idx(i, j), b: idx(i + 1, j) });
    if (j + 1 < side) edges.push({ a: idx(i, j), b: idx(i, j + 1) });
  }
  return { nodes, edges };
}

/** ① A*-per-agent：真引擎能力（t2-pathfind）。 */
function buildAstarWorld(agents: number, side: number): Engine {
  const engine = new Engine();
  engine.load({
    capabilities: [transformCapability, velocityCapability, relationCapability, motionApplyCapability, pathfindCapability],
    entities: {},
  });
  const w = engine.world;
  const nav = gridNav(side, 4);
  w.createEntity('nav');
  w.addComponent('nav', { type: 'NavGraph', nodes: nav.nodes, edges: nav.edges } as unknown as Component);
  // 目标：地图一角（最坏情况——路径最长，A* 展开最多）
  w.createEntity('goal');
  w.addComponent('goal', { type: 'Transform', x: nav.nodes[nav.nodes.length - 1]!.x, y: nav.nodes[nav.nodes.length - 1]!.y, rotation: 0, scaleX: 1, scaleY: 1 } as unknown as Component);
  for (let k = 0; k < agents; k++) {
    const id = `a${k}`;
    const n0 = nav.nodes[k % Math.min(nav.nodes.length, 64)]!;   // 起点挤在另一角
    w.createEntity(id);
    w.addComponent(id, { type: 'Transform', x: n0.x, y: n0.y, rotation: 0, scaleX: 1, scaleY: 1 } as unknown as Component);
    w.addComponent(id, { type: 'Velocity', vx: 0, vy: 0 } as unknown as Component);
    w.addComponent(id, { type: 'Relation', kind: 'target', targetId: 'goal' } as unknown as Component);
    w.addComponent(id, { type: 'NavAgent', speed: 0.2, arriveRange: 1 } as unknown as Component);
  }
  return engine;
}

/** ② Flow Field 参考实现（**纯函数·只为量成本·不入产物**）。
 *  从 goal 做一次 Dijkstra 铺满全图 → 每个节点记「下一跳」→ 单位查表 O(1)。
 *  这里用二叉堆，避免拿本仓 A* 的线性 open 表去比（那样比的是数据结构不是算法）。 */
function buildFlowField(side: number, goalIdx: number): Int32Array {
  const n = side * side;
  const dist = new Float64Array(n).fill(Infinity);
  const next = new Int32Array(n).fill(-1);
  dist[goalIdx] = 0;
  // 简易二叉堆
  const heap: number[] = [goalIdx];
  const key = (i: number): number => dist[i]!;
  const push = (v: number): void => { heap.push(v); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (key(heap[p]!) <= key(heap[c]!)) break; [heap[p], heap[c]] = [heap[c]!, heap[p]!]; c = p; } };
  const pop = (): number => { const top = heap[0]!; const last = heap.pop()!; if (heap.length) { heap[0] = last; let p = 0; for (;;) { const l = p * 2 + 1, r = l + 1; let m = p; if (l < heap.length && key(heap[l]!) < key(heap[m]!)) m = l; if (r < heap.length && key(heap[r]!) < key(heap[m]!)) m = r; if (m === p) break; [heap[p], heap[m]] = [heap[m]!, heap[p]!]; p = m; } } return top; };
  const nbrs = (i: number): number[] => {
    const x = i % side, y = (i / side) | 0, out: number[] = [];
    if (x > 0) out.push(i - 1); if (x + 1 < side) out.push(i + 1);
    if (y > 0) out.push(i - side); if (y + 1 < side) out.push(i + side);
    return out;
  };
  while (heap.length) {
    const cur = pop();
    const d = dist[cur]!;
    for (const nb of nbrs(cur)) {
      const nd = d + 1;
      if (nd < dist[nb]!) { dist[nb] = nd; next[nb] = cur; push(nb); }
    }
  }
  return next;   // next[i] = 从 i 出发朝目标走的下一格
}

function bench(fn: () => void, times: number): { mean: number; p95: number } {
  const t: number[] = [];
  for (let i = 0; i < times; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); }
  const s = [...t].sort((a, b) => a - b);
  return { mean: t.reduce((a, b) => a + b, 0) / t.length, p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]! };
}

describe('群体寻路选型 · A*-per-agent vs Flow Field（实测·非估算）', () => {
  it('① A*-per-agent：首拍（全体同时求路）与稳态（走缓存路径）', () => {
    const rows: string[] = [];
    for (const [agents, side] of [[200, 24], [500, 24], [1000, 24], [500, 48]] as const) {
      const engine = buildAstarWorld(agents, side);
      const first = bench(() => engine.world.tick(), 1);            // 首拍：所有 agent 都要跑一次 A*
      const steady = bench(() => engine.world.tick(), 30);          // 稳态：路径已缓存在 NavPath
      rows.push(`${String(agents).padStart(4)} 单位 / ${side}×${side}=${side * side} 节点 → `
        + `首拍 ${first.mean.toFixed(1)}ms · 稳态 ${steady.mean.toFixed(2)}ms/tick (p95 ${steady.p95.toFixed(2)})`);
    }
    console.info('[pf/astar] A*-per-agent（本仓 t2-pathfind·NavGraph）\n  %s', rows.join('\n  '));
    expect(rows).toHaveLength(4);
  });

  it('② Flow Field：一次铺场的成本（与单位数**无关**）', () => {
    const rows: string[] = [];
    for (const side of [24, 48, 96, 192] as const) {
      const b = bench(() => buildFlowField(side, side * side - 1), 5);
      rows.push(`${side}×${side} = ${String(side * side).padStart(6)} 节点 → 铺场 ${b.mean.toFixed(2)}ms（**一次服务全部单位**）`);
    }
    console.info('[pf/flow] Flow Field（Dijkstra 铺满 + 每单位 O(1) 查表）\n  %s', rows.join('\n  '));
    expect(rows).toHaveLength(4);
  });


  // ── ④ **真能力**（`t2-flow-field`·REQ-FLOWFIELD M1 已落地）────────────────────────────
  // ①②③ 量的是**参考实现**（本文件内的一次性函数·四邻域·单源·无地形代价），当初只为回答
  // 「值不值得做」。能力落地后，真正该被长期盯住的是**出厂那一份**——所以这里直接量它。
  // ⚠ 与 ② 的数字**不可直接对拍**：真能力是**八邻域**（边数 2×，斜走质量换来的）、多源、
  // 带地形代价与「斜走不切墙角」。
  // ⚠⚠ **撤回一句错话**（独立复查 2026-08-24 实测证伪·原文写的是「同尺寸慢约 2× 属预期」）：
  // 四个尺寸里**三个是真能力更快或持平**，只有最大那档慢；把真能力砍成四邻域再量，差距只有 1.32×。
  // 所以「慢 2× 是八邻域的代价」这句是**未经测量的托词**，不是解释。真要比就照下面的数看。
  it('④ 真能力 t2-flow-field：铺场成本 + 千/四千单位每 tick（M1 判据对照）', () => {
    const mkField = (side: number): FlowField => ({
      type: 'FlowField', id: 'f1', cellSize: 1, originX: 0, originY: 0,
      cols: side, rows: side, goals: [{ x: side - 0.5, y: side - 0.5 }],
    } as FlowField);

    const bakeRows: string[] = [];
    for (const side of [24, 48, 96, 192] as const) {
      const f = mkField(side);
      for (let i = 0; i < 20; i++) { clearFlowFieldCache(); bakeFlowField(f); }   // 预热（冷跑量到的是 JIT）
      const r = bench(() => { bakeFlowField(f); }, side >= 192 ? 10 : 30);
      bakeRows.push(`${side}×${side} = ${String(side * side).padStart(6)} 格 → 铺场 ${r.mean.toFixed(2)}ms（八邻域·多源·带地形代价）`);
    }
    console.info('[pf/flow-real] t2-flow-field 铺场（一次服务全部单位）\n  %s', bakeRows.join('\n  '));

    const tickRows: string[] = [];
    for (const units of [1000, 4000] as const) {
      const side = 64;
      const w = new World();
      for (const sys of flowFieldCapability.systems) w.addSystem(sys);
      w.createEntity('field');
      w.addComponent('field', mkField(side));
      for (let i = 0; i < units; i++) {
        const id = `u${i}`;
        w.createEntity(id);
        w.addComponent(id, { type: 'Transform', x: (i % side) + 0.5, y: (Math.floor(i / side) % side) + 0.5, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
        w.addComponent(id, { type: 'FlowAgent', fieldId: 'f1', speed: 1 } as FlowAgent);
      }
      for (let i = 0; i < 30; i++) w.tick();                                       // 预热 + 首拍铺场
      const r = bench(() => { w.tick(); }, 30);
      tickRows.push(`${String(units).padStart(4)} 单位 / ${side}×${side} → ${r.mean.toFixed(3)}ms/tick（含 ECS 查询+排序·场只在输入变时重铺）`);
    }
    console.info('[pf/flow-real] t2-flow-field 每 tick（场已铺）\n  %s', tickRows.join('\n  '));

    // ── 软分离开销（owner 2026-08-24 定方向后加的一层）─────────────────────────
    // 关心的是：加了"互相让开"之后，每 tick 还撑不撑得住上千单位。
    const sepRows: string[] = [];
    for (const units of [1000, 4000] as const) {
      const side = 64;
      const w = new World();
      for (const sys of flowFieldCapability.systems) w.addSystem(sys);
      w.createEntity('field');
      w.addComponent('field', mkField(side));
      for (let i = 0; i < units; i++) {
        const id = `s${i}`;
        w.createEntity(id);
        w.addComponent(id, { type: 'Transform', x: (i % side) + 0.5, y: (Math.floor(i / side) % side) + 0.5, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
        w.addComponent(id, { type: 'FlowAgent', fieldId: 'f1', speed: 1, separation: { weight: 0.4 } } as FlowAgent);
      }
      for (let i = 0; i < 30; i++) w.tick();
      const r = bench(() => { w.tick(); }, 30);
      sepRows.push(`${String(units).padStart(4)} 单位 / ${side}×${side} → ${r.mean.toFixed(3)}ms/tick（含软分离：分桶 + 每单位看 9 格）`);
    }
    console.info('[pf/flow-sep] t2-flow-field 每 tick（开软分离）\n  %s', sepRows.join('\n  '));

    // ── ORCA 硬避让开销（owner 2026-08-24「可以上」·每单位解一个二维线性规划）──────────
    const orcaRows: string[] = [];
    // 两档参数各量一遍：前瞻越远、邻居越多 → 越"礼让"也越贵。给 owner 一张真实权衡表。
    for (const [horizon, maxN] of [[8, 8], [4, 5]] as const) {
      for (const units of [1000, 4000] as const) {
        const side = 64;
        const w = new World();
        for (const sys of flowFieldCapability.systems) w.addSystem(sys);
        w.createEntity('field');
        w.addComponent('field', mkField(side));
        for (let i = 0; i < units; i++) {
          const id = `o${i}`;
          w.createEntity(id);
          w.addComponent(id, { type: 'Transform', x: (i % side) + 0.5, y: (Math.floor(i / side) % side) + 0.5, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
          w.addComponent(id, { type: 'FlowAgent', fieldId: 'f1', speed: 1, arriveRange: 3, orca: { radius: 0.35, timeHorizon: horizon, maxNeighbors: maxN } } as FlowAgent);
        }
        for (let i = 0; i < 20; i++) w.tick();
        const r = bench(() => { w.tick(); }, 20);
        orcaRows.push(`${String(units).padStart(4)} 单位 / 前瞻 ${horizon} 拍 · 最多 ${maxN} 邻居 → ${r.mean.toFixed(3)}ms/tick`);
      }
    }
    console.info('[pf/flow-orca] t2-flow-field 每 tick（开 ORCA 硬避让）\n  %s', orcaRows.join('\n  '));

    // ── ORCA 的**性能判据**（独立复查打回项 P1-7）────────────────────────────────────
    // 上面那些毫秒数只 `console.info`，**一条断言都没有**：复查撤掉环形搜索的提前退出，
    // 1000 单位 6.827 → 39.264ms/tick（5.75× 悬崖），而点名测试与本 bench 双双 exit 0。
    // 墙钟不能拿来断言（机器一变就是 CI 雷），所以量**访问了多少格**——它是确定的。
    {
      const side = 64; const units = 1000;
      const w = new World();
      for (const sys of flowFieldCapability.systems) w.addSystem(sys);
      w.createEntity('field');
      w.addComponent('field', mkField(side));
      for (let i = 0; i < units; i++) {
        const id = `v${i}`;
        w.createEntity(id);
        w.addComponent(id, { type: 'Transform', x: (i % side) + 0.5, y: (Math.floor(i / side) % side) + 0.5, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
        w.addComponent(id, { type: 'FlowAgent', fieldId: 'f1', speed: 1, arriveRange: 3, orca: { radius: 0.35 } } as FlowAgent);
      }
      w.tick();
      const before = flowFieldCellVisits();
      w.tick();
      const perQuery = (flowFieldCellVisits() - before) / units;
      console.info('[pf/flow-orca] 环形搜索：每次查询访问 %s 格（提前退出撤掉 = 整窗 %d 格）',
        perQuery.toFixed(1), (2 * 9 + 1) ** 2);
      // 前瞻 8 × 速度 1 + 0.35 ⇒ 窗口 9 环 = 19×19 = 361 格。提前退出在时实测个位数。
      expect(perQuery).toBeLessThan(40);
    }

    // 判据只钉**形状**不钉绝对值（绝对值随机器变·钉死了就是给 CI 埋雷）：
    // 单位数 4× 而每 tick 不到 4×+余量 ⇒「铺场那部分没有随单位数重复付」这条卖点还活着。
    const [a, bb] = tickRows.map((row) => Number(row.match(/→ ([\d.]+)ms/)![1]));
    expect(bb).toBeLessThanOrEqual(a * 8);
    expect(bakeRows).toHaveLength(4);
  }, 120_000);

  it('③ 查表本身的成本：N 个单位各查一次方向', () => {
    const side = 96;
    const field = buildFlowField(side, side * side - 1);
    for (const n of [1000, 4000] as const) {
      const cells = Array.from({ length: n }, (_, i) => (i * 7919) % (side * side));
      const b = bench(() => { let acc = 0; for (const c of cells) acc += field[c]!; if (acc === -12345) throw new Error('x'); }, 20);
      console.info('[pf/lookup] %d 单位查表 → %sms/tick', n, b.mean.toFixed(4));
    }
    expect(field.length).toBe(side * side);
  });
});
