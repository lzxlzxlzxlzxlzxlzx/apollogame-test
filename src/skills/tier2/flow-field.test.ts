import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import type { FlowField, FlowAgent, Transform, Velocity, Status, DebugTrace } from '@engine/protocol/components.js';
import { motionApplyCapability } from '@skills/tier1/index.js';
import {
  flowFieldCapability, bakeFlowField, buildCostField, buildIntegration, buildFlow,
  cellIndex, cellOf, sameInputs, getBakedField, clearFlowFieldCache, flowFieldBakes, flowFieldLookups,
  STRAIGHT, DIAGONAL, UNREACHABLE, SEP_MAX_WEIGHT, orcaNeighbors, flowFieldCellVisits, geoKey,
  type DensityField,
} from './flow-field.js';

const FROZEN = 1 << 0;
const xf = (x: number, y: number): Transform => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const vel = (w: World, e: string): Velocity => w.getComponent<Velocity>(e, 'Velocity')!;
const pos = (w: World, e: string): Transform => w.getComponent<Transform>(e, 'Transform')!;

/** 一张 cols×rows 的场（格边长 1·原点 0,0），goals 用**格中心**坐标给。 */
function field(over: Partial<FlowField> = {}): FlowField {
  return {
    type: 'FlowField', id: 'f1', cellSize: 1, originX: 0, originY: 0,
    cols: 5, rows: 5, goals: [{ x: 4.5, y: 4.5 }], ...over,
  } as FlowField;
}
/** 行主序 blocked：传 [[col,row]…] 更好读。 */
function blockedOf(cols: number, rows: number, cells: Array<[number, number]>): number[] {
  const b = new Array(cols * rows).fill(0);
  for (const [c, r] of cells) b[r * cols + c] = 1;
  return b;
}

function world(f: FlowField, withMotion = true): World {
  const w = new World();
  for (const s of flowFieldCapability.systems) w.addSystem(s);
  if (withMotion) for (const s of motionApplyCapability.systems) w.addSystem(s);
  w.createEntity('field');
  w.addComponent('field', f);
  return w;
}
function agent(w: World, id: string, x: number, y: number, a: Partial<Omit<FlowAgent, 'type'>> = {}): void {
  w.createEntity(id);
  w.addComponent(id, xf(x, y));
  w.addComponent(id, { type: 'FlowAgent', fieldId: 'f1', speed: 1, ...a } as FlowAgent);
}

beforeEach(() => { clearFlowFieldCache(); });

describe('flow-field — 元数据 / 定序 / 申报诚实', () => {
  it('id 与系统名正确 · runsBefore motion-apply（破「读 Transform 写 Velocity」与 motion 的环）', () => {
    expect(flowFieldCapability.id).toBe('t2-flow-field');
    expect(flowFieldCapability.systems[0].id).toBe('flow-field');
    expect(flowFieldCapability.systems[0].runsBefore).toContain('motion-apply');
    expect(flowFieldCapability.systems[0].runsAfter).toEqual(['steering', 'path-follow']);
  });

  // 独立复查逼出来的一条（M1 首版缺）：本系统与 steering/path-follow 都读写 Velocity，
  // 组件图上互为前驱 ⇒ 伪环。而 `topological-sort` **遇环只告警不抛**，所以缺 runsAfter 时
  // 全库 4783 测**一条都不会红**——只因为没有任何测试把它们装进同一个世界。
  // 「告警没出现」≠「没有告警」，可能只是没人组装到那个配置。这条测试就是那个配置。
  it('与 steering/path-follow 同装：零成环告警 · 执行序 steering → path-follow → flow-field → motion-apply', async () => {
    const { steeringCapability } = await import('./steering.js');
    const { pathFollowCapability } = await import('./path-follow.js');
    const warns: string[] = [];
    const origWarn = console.warn; const origErr = console.error;
    console.warn = (...a: unknown[]): void => { warns.push(a.join(' ')); };
    console.error = (...a: unknown[]): void => { warns.push(a.join(' ')); };
    try {
      const w = new World();
      // ⚠ **倒着注册**（独立复查逼出来的）：首版顺着注册、且读的是 `w.systems`（**注册序**），
      // 于是那条 `toEqual([...])` 断言恒真——把 runsAfter 全撤掉它照样绿。
      // 现在读 `getSortedSystems()`（真实拓扑序）+ 倒序注册，定序真错了这里才会红。
      for (const sys of motionApplyCapability.systems) w.addSystem(sys);
      for (const sys of flowFieldCapability.systems) w.addSystem(sys);
      for (const sys of pathFollowCapability.systems) w.addSystem(sys);
      for (const sys of steeringCapability.systems) w.addSystem(sys);
      w.tick();
      const order = w.getSortedSystems().map((sys) => sys.id);
      expect(order).toEqual(['steering', 'path-follow', 'flow-field', 'motion-apply']);
    } finally { console.warn = origWarn; console.error = origErr; }
    // 撤 runsAfter:['steering','path-follow'] → 这里会抓到
    // 「[topological-sort] phase 0：检测到定序环 [steering, path-follow, flow-field]（闭环组件：Velocity）」
    expect(warns.filter((l) => /定序环/.test(l))).toEqual([]);
  });

  // 第二轮独立复查的 N4：我新写的两块组件注释**一块都没挂上成员**——一块落在两个成员之间
  // （TS 只认紧邻成员的最后一块），一块落在接口末尾（后面根本没有成员）。
  // 后果是"我请复查人去判的那条降级披露，作者在 IDE 里根本看不到"。这条把它钉住。
  it('`FlowAgent.separation` / `.orca` 的关键披露**在编译器取到的文档里**（不是"源码里有这段字"）', async () => {
    // 三复查 M2：上一版用例查的是"这段文字所在的 JSDoc 块后面紧跟成员名"，**恒绿**——
    // 因为我在 `separation` 前面又加了一块 JSDoc，TS **只认紧邻成员的最后一块**，
    // 于是原来那块（weight 语义 + 不保证不重叠）被挤成孤儿、有效文档从 500+ 字缩到 186 字，
    // 而用例一声不吭。判据必须是**编译器实际取到的那份文档**，不是源码文本。
    const ts = (await import('typescript')).default;
    const fs = await import('node:fs');
    const file = new URL('../../engine/protocol/components/spatial.ts', import.meta.url);
    const src = ts.createSourceFile('spatial.ts', fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2020, true);
    const docs = new Map<string, string>();
    const walk = (n: import('typescript').Node): void => {
      if (ts.isPropertySignature(n) && ts.isIdentifier(n.name)) {
        const own = ts.getJSDocCommentsAndTags(n).map((d) => d.getText()).join('\n');
        if (own) docs.set(n.name.text, own);
      }
      ts.forEachChild(n, walk);
    };
    walk(src);
    const sep = docs.get('separation') ?? '';
    const orca = docs.get('orca') ?? '';
    // separation：权重语义 + 「不保证不重叠」 + 跨场语义，三样缺一不可
    expect(sep).toMatch(/SEP_MAX_WEIGHT/);
    expect(sep).toMatch(/不保证不重叠/);
    expect(sep).toMatch(/只在同一张场内生效/);
    // orca：改口后的承诺 + 三条降级 + 「没有下界」 + timeHorizon 非单调
    expect(orca).toMatch(/别把它当成"保证不碰"/);
    expect(orca).toMatch(/没有下界/);
    expect(orca).toMatch(/非单调/);
    // 全仓不许再出现被打掉的那句旧口径
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/保证互不碰撞/);
  });

  it('申报 = 真实访问（reads 含 Velocity——本系统缺省时会 addComponent 再改它）', () => {
    const sys = flowFieldCapability.systems[0];
    expect([...sys.reads].sort()).toEqual(['FlowAgent', 'FlowField', 'Status', 'Transform', 'Velocity']);
    expect(sys.writes).toEqual(['Velocity']);
    expect(flowFieldCapability.components.provides).toHaveProperty('FlowField');
    expect(flowFieldCapability.components.provides).toHaveProperty('FlowAgent');
  });
});

describe('flow-field — ① cost field', () => {
  it('blocked=1 → 0（不可走）· cost 缺省 1 · 非整数向上取整 · <1 钳到 1', () => {
    const f = field({ cols: 2, rows: 2, blocked: [0, 1, 0, 0], cost: [1, 9, 2.3, 0.4] });
    expect([...buildCostField(f)]).toEqual([1, 0, 3, 1]); // 墙压过 cost；2.3→3；0.4→1
    expect([...buildCostField(field({ cols: 2, rows: 2 }))]).toEqual([1, 1, 1, 1]); // 全缺省
  });
});

describe('flow-field — ② 积分场（多源 Dijkstra·整数）', () => {
  it('单源：直走 10 / 斜走 14 · 目标格 0', () => {
    const f = field({ cols: 3, rows: 3, goals: [{ x: 0.5, y: 0.5 }] }); // 左下角格
    const integ = buildIntegration(f, buildCostField(f));
    expect(integ[cellIndex(f, 0, 0)]).toBe(0);
    expect(integ[cellIndex(f, 1, 0)]).toBe(STRAIGHT);
    expect(integ[cellIndex(f, 1, 1)]).toBe(DIAGONAL);
    expect(integ[cellIndex(f, 2, 2)]).toBe(DIAGONAL * 2);
    expect(Number.isInteger(integ[cellIndex(f, 2, 2)])).toBe(true); // 全程整数=逐位可复现的根据
  });

  it('多源：每格取到**最近**那个源的代价（两个 goal 一次铺完）', () => {
    const f = field({ cols: 5, rows: 1, goals: [{ x: 0.5, y: 0.5 }, { x: 4.5, y: 0.5 }] });
    const integ = buildIntegration(f, buildCostField(f));
    expect([...integ]).toEqual([0, STRAIGHT, STRAIGHT * 2, STRAIGHT, 0]); // 中间那格离两边一样远
  });

  it('地形代价真影响积分（沼泽 3 倍 → 绕开）', () => {
    // 3×1：左端 goal，中间沼泽 cost=5 → 右端积分 = 10*5 + 10*1
    const f = field({ cols: 3, rows: 1, goals: [{ x: 0.5, y: 0.5 }], cost: [1, 5, 1] });
    const integ = buildIntegration(f, buildCostField(f));
    expect(integ[1]).toBe(STRAIGHT * 5);
    expect(integ[2]).toBe(STRAIGHT * 5 + STRAIGHT * 1);
  });

  it('墙后的孤岛 = UNREACHABLE（不是 0·不会把单位吸进墙里）', () => {
    // 3×1，中间是墙 → 右端到不了左端的 goal
    const f = field({ cols: 3, rows: 1, goals: [{ x: 0.5, y: 0.5 }], blocked: [0, 1, 0] });
    const integ = buildIntegration(f, buildCostField(f));
    expect(integ[2]).toBe(UNREACHABLE);
  });

  it('斜走不切墙角（两堵墙的对角缝不许穿过去）', () => {
    // 2×2：goal 在 (0,0)；(1,0) 与 (0,1) 都是墙 → (1,1) 只能走对角，但对角被墙角封死 ⇒ 到不了
    const f = field({ cols: 2, rows: 2, goals: [{ x: 0.5, y: 0.5 }], blocked: blockedOf(2, 2, [[1, 0], [0, 1]]) });
    const integ = buildIntegration(f, buildCostField(f));
    expect(integ[cellIndex(f, 1, 1)]).toBe(UNREACHABLE); // 撤「斜走不切墙角」→ 这里会变成 14
  });

  it('goal 落在图外 / 落在墙里 → 该源无效，其余源照常铺', () => {
    const f = field({ cols: 3, rows: 1, goals: [{ x: 99, y: 99 }, { x: 2.5, y: 0.5 }] });
    const integ = buildIntegration(f, buildCostField(f));
    expect(integ[2]).toBe(0);
    expect(integ[0]).toBe(STRAIGHT * 2);
    const walled = field({ cols: 3, rows: 1, goals: [{ x: 0.5, y: 0.5 }], blocked: [1, 0, 0] });
    expect([...buildIntegration(walled, buildCostField(walled))]).toEqual([UNREACHABLE, UNREACHABLE, UNREACHABLE]);
  });
});

describe('flow-field — ③ 方向场', () => {
  it('每格指向积分最小的邻格；目标格与墙格 = (0,0) 停', () => {
    const f = field({ cols: 3, rows: 1, goals: [{ x: 0.5, y: 0.5 }] });
    const b = bakeFlowField(f);
    expect([b.dir[0 * 2], b.dir[0 * 2 + 1]]).toEqual([0, 0]);   // 目标格
    expect([b.dir[1 * 2], b.dir[1 * 2 + 1]]).toEqual([-1, 0]);  // 朝左
    expect([b.dir[2 * 2], b.dir[2 * 2 + 1]]).toEqual([-1, 0]);
  });

  it('孤岛格 = (0,0)（到不了就别乱指一个方向）', () => {
    const f = field({ cols: 3, rows: 1, goals: [{ x: 0.5, y: 0.5 }], blocked: [0, 1, 0] });
    const b = bakeFlowField(f);
    expect([b.dir[2 * 2], b.dir[2 * 2 + 1]]).toEqual([0, 0]);
  });
});

describe('flow-field — 🔴 确定性', () => {
  it('同输入逐位相同（连铺两次·三个数组全等）', () => {
    const f = field({ cols: 24, rows: 24, goals: [{ x: 3.5, y: 20.5 }, { x: 20.5, y: 2.5 }], blocked: blockedOf(24, 24, [[10, 10], [10, 11], [10, 12], [11, 12]]) });
    const a = bakeFlowField(f);
    const b = bakeFlowField(f);
    expect([...a.integration]).toEqual([...b.integration]);
    expect([...a.dir]).toEqual([...b.dir]);
    expect([...a.cost]).toEqual([...b.cost]);
  });

  it('**缓存不是状态通道**：清空缓存后重铺，结果逐位相同（清缓存只影响耗时）', () => {
    const f = field({ cols: 16, rows: 16, goals: [{ x: 15.5, y: 15.5 }], cost: Array.from({ length: 256 }, (_, i) => (i % 7 === 0 ? 3 : 1)) });
    const warm = getBakedField(f);
    const snapshot = { integ: [...warm.integration], dir: [...warm.dir] };
    clearFlowFieldCache();
    const cold = getBakedField(f);
    expect([...cold.integration]).toEqual(snapshot.integ);
    expect([...cold.dir]).toEqual(snapshot.dir);
  });

  it('**缓存不许别名**：两张只差 0.0004 的场必须各铺各的（复查实测的那条静默分叉）', () => {
    // 复查实测：曾用 Math.round(x*1000) 量化坐标做缓存键，而 cellOf 吃的是原始浮点 ⇒
    // originX 差 0.0004 的两张场共用一份流场，单位停在不同位置（x=3.0000 vs x=4.0000）。
    clearFlowFieldCache();
    const A = field({ id: 'same-id', cols: 12, rows: 3, cellSize: 1, originX: 0, goals: [{ x: 11.5, y: 1.5 }] });
    const B = field({ id: 'same-id', cols: 12, rows: 3, cellSize: 1, originX: 0.0004, goals: [{ x: 11.5, y: 1.5 }] });
    const bakedA = getBakedField(A);
    const bakedB = getBakedField(B);
    expect(flowFieldBakes()).toBe(2);          // 撤「精确比对」改回量化摘要 → 这里是 1（别名成立）
    expect(bakedA).not.toBe(bakedB);
  });

  it('精确比对逐字段成立：几何/goals/blocked/cost 任一变即判不同（含 undefined↔有值）', () => {
    const base = field({ cols: 4, rows: 4, blocked: new Array(16).fill(0), cost: new Array(16).fill(1) });
    clearFlowFieldCache();
    getBakedField(base);
    const snapOf = (f: FlowField): boolean => { const before = flowFieldBakes(); getBakedField(f); return flowFieldBakes() === before; };
    expect(snapOf(field({ cols: 4, rows: 4, blocked: new Array(16).fill(0), cost: new Array(16).fill(1) }))).toBe(true); // 同输入=命中
    for (const changed of [
      { ...base, goals: [{ x: 1.5, y: 1.5 }] },
      { ...base, blocked: blockedOf(4, 4, [[2, 2]]) },
      { ...base, cost: [...new Array(15).fill(1), 3] },
      { ...base, cellSize: 2 }, { ...base, originX: 5 }, { ...base, originY: 5 },
      { ...base, blocked: undefined }, { ...base, cost: undefined },
    ] as FlowField[]) {
      clearFlowFieldCache(); getBakedField(base);
      expect({ changed: Object.keys(changed).length, hit: snapOf(changed) }).toMatchObject({ hit: false });
    }
    // 纯函数侧也点名：同输入 true、差 0.0004 false
    const snap = { cellSize: 1, originX: 0, originY: 0, cols: 4, rows: 4, goals: [{ x: 3.5, y: 3.5 }] };
    expect(sameInputs(snap as never, field({ cols: 4, rows: 4, goals: [{ x: 3.5, y: 3.5 }] }))).toBe(true);
    expect(sameInputs(snap as never, field({ cols: 4, rows: 4, originX: 0.0004, goals: [{ x: 3.5, y: 3.5 }] }))).toBe(false);
  });

  // ⚠ 改口（第二轮复查实测）：这条**不能当 P0 别名的证据**——把它原样搬回缺陷版 `bb507744` 也照样绿
  // （旧键含摘要，两个世界 goals 不同本就分属两条目）。真正咬住 P0 的是上面那条 0.0004。
  // 它现在的职责是**另一件事**：守住「同 id 不同内容并存时不许退化成每 tick 重铺」——
  // 修 P0 时我把键简化成裸 id，正是这个形状让 192×192 从 3.87 掉到 26.08ms/tick。
  // 教训（流程账）：新增的回归测试，必须在**被修的那一版**上跑一遍，确认它真会红。
  it('跨世界不串味 + 不退化成每 tick 重铺（同 id 不同内容并存）', () => {
    clearFlowFieldCache();
    const mk = (goalX: number): World => {
      const f = field({ id: 'shared', cols: 12, rows: 3, cellSize: 1, goals: [{ x: goalX, y: 1.5 }] });
      const w = world(f, false);
      agent(w, 'u', 5.5, 1.5, { speed: 1, fieldId: 'shared' });   // 场 id = shared（两个世界同 id 不同内容）
      return w;
    };
    const left = mk(0.5); const right = mk(11.5);
    for (let i = 0; i < 5; i++) { left.tick(); right.tick(); }   // 交替跑 = 缓存来回换
    expect(vel(left, 'u').vx).toBeLessThan(0);                   // 撤精确比对 → 两个世界会共用一份场
    expect(vel(right, 'u').vx).toBeGreaterThan(0);
    // 两张场各铺一次就够；退化成裸 id 单键 → 每 tick 每场都 miss ⇒ 这里会变成 10
    expect(flowFieldBakes()).toBe(2);
  });

  it('无墙钟无随机（源码级：本文件零 Date.now/performance.now/Math.random）', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('./flow-field.ts', import.meta.url), 'utf8'));
    const body = src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''); // 剥注释再判（注释里提一句不算调用）
    expect(body).not.toMatch(/Date\.now|performance\.now|Math\.random/);
  });

  it('世界层：同一份世界跑两遍，逐 tick hash 相同（lockstep/录放安全）', () => {
    const run = (): string[] => {
      clearFlowFieldCache();
      const f = field({ cols: 12, rows: 12, goals: [{ x: 11.5, y: 11.5 }], blocked: blockedOf(12, 12, [[5, 5], [5, 6], [6, 5]]) });
      const w = world(f);
      for (let i = 0; i < 20; i++) agent(w, `a${i}`, 0.5 + (i % 4), 0.5 + Math.floor(i / 4), { speed: 0.3 });
      const out: string[] = [];
      for (let t = 0; t < 30; t++) { w.tick(); out.push(JSON.stringify(w.snapshot())); }
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe('flow-field — 单位行为（M1 验收）', () => {
  it('单位朝目标走并真的到达（8 邻域·斜穿）', () => {
    const f = field({ cols: 10, rows: 10, goals: [{ x: 9.5, y: 9.5 }] });
    const w = world(f);
    agent(w, 'u', 0.5, 0.5, { speed: 0.5, arriveRange: 0.6 });
    for (let i = 0; i < 200; i++) w.tick();
    const p = pos(w, 'u');
    expect(Math.hypot(p.x - 9.5, p.y - 9.5)).toBeLessThanOrEqual(0.6);
    expect(vel(w, 'u')).toMatchObject({ vx: 0, vy: 0 }); // 到了就停
  });

  it('**凹形障碍不卡死**（开口**背对**目标的 U——势场法必死在这里·Dijkstra 沿开口绕出去）', () => {
    // ⚠ 夹具是被"撤修验红"逼出来的：第一版的 U 开口朝上、目标也在上方——贪心朝目标走就直接出来了，
    // 于是把方向场换成势场法（朝目标直线最近的邻格）时这条**照样绿**。真陷阱必须让单位**先背离目标**：
    //   15×15 · 目标在右边中间 · U 的开口朝**左**（背对目标）· 单位关在 U 里。
    //   墙 = 右壁 col 8 (row 5..9) + 上盖 row 9 (col 4..8) + 下底 row 5 (col 4..8)。
    //   势场法：一路顶在 col 8 那堵右壁上（离目标最近的方向）→ 永远出不来。
    //   Dijkstra 积分场：铺满全图后 U 内的积分沿开口方向单调下降 → 先向左、绕出去、再向右。
    const cells: Array<[number, number]> = [];
    for (let r = 5; r <= 9; r++) cells.push([8, r]);
    for (let c = 4; c <= 8; c++) { cells.push([c, 9]); cells.push([c, 5]); }
    const f = field({ cols: 15, rows: 15, goals: [{ x: 14.5, y: 7.5 }], blocked: blockedOf(15, 15, cells) });
    const w = world(f);
    agent(w, 'u', 6.5, 7.5, { speed: 0.4, arriveRange: 0.8 });   // U 腔正中
    let leftmost = 6.5;
    for (let i = 0; i < 600; i++) { w.tick(); leftmost = Math.min(leftmost, pos(w, 'u').x); }
    const p = pos(w, 'u');
    expect(leftmost).toBeLessThan(4);                                     // 真的先往**反方向**走了（绕出开口）
    expect(Math.hypot(p.x - 14.5, p.y - 7.5)).toBeLessThanOrEqual(0.8);   // 最终到达
  });

  it('多源：两个单位各走向离自己最近的那个 goal', () => {
    const f = field({ cols: 9, rows: 1, goals: [{ x: 0.5, y: 0.5 }, { x: 8.5, y: 0.5 }] });
    const w = world(f);
    agent(w, 'left', 2.5, 0.5, { speed: 0.5 });
    agent(w, 'right', 6.5, 0.5, { speed: 0.5 });
    w.tick();
    expect(vel(w, 'left').vx).toBeLessThan(0);
    expect(vel(w, 'right').vx).toBeGreaterThan(0);
  });

  it('停的四种情形各自成立：CC 定身 / 场不在 / 网格外 / 站在墙里', () => {
    const f = field({ cols: 5, rows: 5, goals: [{ x: 4.5, y: 4.5 }], blocked: blockedOf(5, 5, [[2, 2]]) });
    const w = world(f, false);
    agent(w, 'frozen', 0.5, 0.5, { speed: 1, haltStatusMask: FROZEN });
    w.addComponent('frozen', { type: 'Status', flags: FROZEN } as Status);
    agent(w, 'nofield', 0.5, 1.5, { speed: 1, fieldId: '不存在的场' });
    agent(w, 'outside', -99, -99, { speed: 1 });
    agent(w, 'inwall', 2.5, 2.5, { speed: 1 });
    agent(w, 'ok', 0.5, 2.5, { speed: 1 });
    w.tick();
    for (const id of ['frozen', 'nofield', 'outside', 'inwall']) {
      expect({ id, ...vel(w, id) }).toMatchObject({ vx: 0, vy: 0 });
    }
    expect(Math.hypot(vel(w, 'ok').vx, vel(w, 'ok').vy)).toBeCloseTo(1, 6); // 正常单位照走
  });

  it('速度写成 speed 模长（斜走也是 speed·不是 speed×√2）', () => {
    const f = field({ cols: 4, rows: 4, goals: [{ x: 3.5, y: 3.5 }] });
    const w = world(f, false);
    agent(w, 'u', 0.5, 0.5, { speed: 2 });
    w.tick();
    const v = vel(w, 'u');
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(2, 6);
  });

  it('没挂 Velocity 的单位会被补上（不因缺组件静默不动）', () => {
    const f = field({ cols: 3, rows: 3, goals: [{ x: 2.5, y: 2.5 }] });
    const w = world(f, false);
    w.createEntity('u');
    w.addComponent('u', xf(0.5, 0.5));
    w.addComponent('u', { type: 'FlowAgent', fieldId: 'f1', speed: 1 } as FlowAgent);
    expect(w.getComponent('u', 'Velocity')).toBeUndefined();
    w.tick();
    expect(Math.hypot(vel(w, 'u').vx, vel(w, 'u').vy)).toBeCloseTo(1, 6);
  });

  it('零单位世界 = 零工作（没有 FlowAgent 时不铺场·不写任何东西）', () => {
    const f = field();
    const w = world(f, false);
    const before = JSON.stringify(w.snapshot());
    w.tick();
    expect(JSON.stringify(w.snapshot())).toBe(before);
  });
});

describe('flow-field — M1 判据（**语义版**·零墙钟）', () => {
  // ⚠ 计时判据不放这儿：`src/**/*.test.ts` 禁墙钟（test-hygiene 守卫会拦·墙钟断言天生 flaky）。
  // 真实耗时的量化在 `games/game211/pathfind-scale.bench.test.ts`（那里本来就是量成本的地方，
  // 且与工单援引的对照数字同文件同机可比）。这里只留**不靠计时也能咬住**的两条语义判据。
  it('**成本与单位数无关**（这条卖点直接用铺场次数咬住·不靠计时）：1000 与 4000 单位跑 30 拍，都只铺 1 次', () => {
    const run = (units: number): { bakes: number; lookups: number } => {
      clearFlowFieldCache();
      const f = field({ cols: 64, rows: 64, cellSize: 1, goals: [{ x: 63.5, y: 63.5 }] });
      const w = world(f, false);
      for (let i = 0; i < units; i++) agent(w, `a${i}`, (i % 64) + 0.5, (Math.floor(i / 64) % 64) + 0.5, { speed: 1 });
      for (let i = 0; i < 30; i++) w.tick();
      return { bakes: flowFieldBakes(), lookups: flowFieldLookups() };
    };
    // ⚠ 判据是**取场次数**不是铺场次数（复查实测：记忆化会把重复取场吸收掉，
    // 真撤掉「取场外提」后 bakes 仍然是 1、25 测全绿，而 4000 单位每 tick 0.909→2.676ms）。
    // 每 tick 每场恰好取一次 ⇒ 30 拍 = 30 次；掉回单位循环里就会变成 30×单位数。
    expect(run(1000)).toEqual({ bakes: 1, lookups: 30 });   // 撤「取场提到单位循环外」→ lookups=30000
    expect(run(4000)).toEqual({ bakes: 1, lookups: 30 });   // 单位翻四倍，两个数都纹丝不动
  }, 120_000);

  it('重建时机确定：输入不变永不重铺 · goals/blocked 一变下一 tick 就重铺（无墙钟无空闲调度）', () => {
    clearFlowFieldCache();
    const f = field({ cols: 16, rows: 16, goals: [{ x: 15.5, y: 15.5 }] });
    const w = world(f, false);
    agent(w, 'u', 0.5, 0.5, { speed: 1 });
    for (let i = 0; i < 10; i++) w.tick();
    expect(flowFieldBakes()).toBe(1);
    // 目标搬家 → 下一拍必重铺（作者改数据，引擎跟上）
    const live = w.getComponent<FlowField>('field', 'FlowField')!;
    (live.goals as Array<{ x: number; y: number }>)[0] = { x: 0.5, y: 15.5 };
    w.tick();
    expect(flowFieldBakes()).toBe(2);
    for (let i = 0; i < 10; i++) w.tick();
    expect(flowFieldBakes()).toBe(2);   // 又不动了 → 不再重铺
  }, 60_000);
});
// ═══ 软分离原型（owner 2026-08-24：「用分离力·soft force·流场力一定是最重要的」）═══
describe('flow-field — 软分离（读密度场·不是两两互推）', () => {
  const sepAgent = (w: World, id: string, x: number, y: number, weight: number, over: Partial<Omit<FlowAgent, 'type'>> = {}): void =>
    agent(w, id, x, y, { speed: 0.5, separation: { weight }, ...over });
  const dist = (w: World, a: string, b: string): number =>
    Math.hypot(pos(w, a).x - pos(w, b).x, pos(w, a).y - pos(w, b).y);

  it('不设 separation = 一个字节不变（零回归·与纯流场逐位相同）', () => {
    const f = () => field({ cols: 8, rows: 8, goals: [{ x: 7.5, y: 7.5 }] });
    const run = (sep: boolean): string => {
      clearFlowFieldCache();
      const w = world(f(), true);
      for (let i = 0; i < 6; i++) agent(w, `a${i}`, 1.5 + i * 0.1, 1.5, { speed: 0.3, ...(sep ? { separation: { weight: 0.3 } } : {}) });
      for (let i = 0; i < 15; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    const plain1 = run(false); const plain2 = run(false);
    expect(plain1).toBe(plain2);                 // 自身确定
    expect(run(true)).not.toBe(plain1);          // 开了就该有区别（否则这条能力没接上）
  });

  it('**叠在一起会被弹开**（两个单位同格 → 距离单调拉开）', () => {
    const w = world(field({ cols: 10, rows: 10, goals: [{ x: 9.5, y: 9.5 }] }), true);
    sepAgent(w, 'a', 2.5, 2.5, 0.5);
    sepAgent(w, 'b', 2.5 + 1e-3, 2.5, 0.5);      // 几乎完全重合
    const d0 = dist(w, 'a', 'b');
    for (let i = 0; i < 10; i++) w.tick();
    expect(dist(w, 'a', 'b')).toBeGreaterThan(d0);
  });

  it('**一团挤住的队伍会散开**（16 个单位塞进一格 → 最挤那格的人数下降）', () => {
    const f = field({ cols: 12, rows: 12, goals: [{ x: 11.5, y: 11.5 }] });
    const w = world(f, true);
    for (let i = 0; i < 16; i++) sepAgent(w, `u${i}`, 3.2 + (i % 4) * 0.02, 3.2 + Math.floor(i / 4) * 0.02, 0.45);
    const busiest = (): number => {
      const cells = new Map<number, number>();
      for (let i = 0; i < 16; i++) {
        const p = pos(w, `u${i}`);
        const { col, row } = cellOf(f, p.x, p.y);
        const k = cellIndex(f, col, row);
        cells.set(k, (cells.get(k) ?? 0) + 1);
      }
      return Math.max(...cells.values());
    };
    const before = busiest();
    expect(before).toBeGreaterThanOrEqual(12);   // 起手确实挤在一两格里
    for (let i = 0; i < 25; i++) w.tick();
    expect(busiest()).toBeLessThan(before);      // 撤软分离 → 它们会整团同速平移，这里恒等
  });

  it('**流场恒主导**：开着分离，队伍照样到得了目标（不会被推得背离）', () => {
    const w = world(field({ cols: 14, rows: 14, goals: [{ x: 13.5, y: 13.5 }] }), true);
    for (let i = 0; i < 12; i++) sepAgent(w, `u${i}`, 1.5 + (i % 3) * 0.05, 1.5 + Math.floor(i / 3) * 0.05, 0.5, { arriveRange: 1.5 });
    for (let i = 0; i < 400; i++) w.tick();
    for (let i = 0; i < 12; i++) {
      const p = pos(w, `u${i}`);
      expect({ id: i, far: Math.hypot(p.x - 13.5, p.y - 13.5) > 3 }).toMatchObject({ far: false });
    }
  });

  it('权重被钳在 SEP_MAX_WEIGHT：填 99 与填 0.6 结果逐位相同（作者填多大都不许压过流场）', () => {
    const run = (weight: number): string => {
      clearFlowFieldCache();
      const w = world(field({ cols: 10, rows: 10, goals: [{ x: 9.5, y: 9.5 }] }), true);
      for (let i = 0; i < 8; i++) sepAgent(w, `u${i}`, 2.5 + i * 0.03, 2.5, weight);
      for (let i = 0; i < 12; i++) w.tick();
      // ⚠ 只比**位置**不比整份快照：快照里含 `separation.weight` 这个入参本身（99 与 0.6 当然不等），
      // 拿它当判据是在比输入不是比行为（第一版就这么写的，被自己咬了一口）。
      return Array.from({ length: 8 }, (_, i) => `${pos(w, `u${i}`).x.toFixed(12)},${pos(w, `u${i}`).y.toFixed(12)}`).join('|');
    };
    expect(run(99)).toBe(run(SEP_MAX_WEIGHT));
    expect(run(-5)).toBe(run(0));                // 负权重当 0（不许反向吸引成一坨）
  });

  it('到了终点也不叠成一个点（流场无方向时分离力仍生效·RTS 里最显眼的那种假）', () => {
    const w = world(field({ cols: 8, rows: 8, goals: [{ x: 4.5, y: 4.5 }] }), true);
    // 给 arriveRange（真实用法）：到点后流场力停、软分离继续 → 摊开成一小片而不是钉在一个点。
    for (let i = 0; i < 6; i++) sepAgent(w, `u${i}`, 4.5 + i * 0.01, 4.5, 0.5, { arriveRange: 1.2 });
    for (let i = 0; i < 30; i++) w.tick();
    let minPair = Infinity;
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) minPair = Math.min(minPair, dist(w, `u${i}`, `u${j}`));
    expect(minPair).toBeGreaterThan(0.05);       // 撤「终点仍让分离力起作用」→ 6 个全叠在 4.5,4.5
  });

  it('只有开了 separation 的单位参与密度（没开的不占位·也不被推）', () => {
    const f = field({ cols: 10, rows: 10, goals: [{ x: 9.5, y: 9.5 }] });
    const w = world(f, true);
    agent(w, 'plain', 3.5, 3.5, { speed: 0.4 });                       // 没开
    sepAgent(w, 'soft', 3.5 + 1e-3, 3.5, 0.5, { speed: 0.4 });          // 开了·与 plain 同格
    const before = { vx: 0, vy: 0 };
    w.tick();
    void before;
    // plain 的速度必须是纯流场方向（x、y 分量相等=正 45°斜走），soft 的会被密度梯度带偏
    const vp = vel(w, 'plain');
    expect(vp.vx).toBeCloseTo(vp.vy, 9);
    const vs = vel(w, 'soft');
    expect(Math.abs(vs.vx - vs.vy)).toBeGreaterThan(1e-9);
  });

  it('确定性：开着分离跑两遍逐位相同 · 实体创建顺序颠倒结果不变', () => {
    const run = (reverse: boolean): string => {
      clearFlowFieldCache();
      const w = world(field({ cols: 12, rows: 12, goals: [{ x: 11.5, y: 11.5 }] }), true);
      const ids = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'];
      for (const id of reverse ? [...ids].reverse() : ids) {
        const i = ids.indexOf(id);
        sepAgent(w, id, 2.5 + (i % 3) * 0.04, 2.5 + Math.floor(i / 3) * 0.04, 0.4);
      }
      for (let i = 0; i < 20; i++) w.tick();
      return ids.map((id) => `${id}:${pos(w, id).x.toFixed(12)},${pos(w, id).y.toFixed(12)}`).join('|');
    };
    expect(run(false)).toBe(run(false));
    expect(run(true)).toBe(run(false));          // 创建序不同、结果必须同（否则 lockstep 分叉）
  });
});

// ═══ 上面两条是「撤修验红没红」逼出来的：我最费劲的两处当时零覆盖 ═══
describe('flow-field — 软分离的两条承重语义（撤修必须转红）', () => {
  it('**夹在中间的几乎不动、站在边上的被弹开**（力保留大小·不许归一化）', () => {
    // 一排 5 个等距单位：中间那个左右受力相消 ≈ 0，两端那个净受力最大。
    // 归一化会把所有人的力抹成一样大 ⇒ 整排同速平移、彼此间距一点不变（我栽过三次的那个病）。
    const f = field({ cols: 12, rows: 12, goals: [{ x: 5.5, y: 5.5 }] });
    const w = world(f, false);
    for (let i = 0; i < 5; i++) {
      agent(w, `u${i}`, 5.3 + i * 0.1, 5.5, { speed: 1, arriveRange: 2, separation: { weight: 0.6 } });
    }
    w.tick();
    const spd = (id: string): number => Math.hypot(vel(w, id).vx, vel(w, id).vy);
    const middle = spd('u2');
    const edge = Math.max(spd('u0'), spd('u4'));
    expect(edge).toBeGreaterThan(middle * 3);   // 撤「不归一化」→ 两者相等，此断言红
    expect(middle).toBeLessThan(0.1);           // 中间那个基本站着不动
  });

  it('**到点后收敛、不来回聚散**（越过到达线要减速·不许满速冲回）', () => {
    // 没有减速带时实测：被挤出到达线的单位以满速冲回、把刚散开的堆重新压实，
    // 队伍以约 40 拍为周期反复聚散（最近间距在 0.41 与 0.0007 之间来回荡）。
    const w = world(field({ cols: 12, rows: 12, goals: [{ x: 5.5, y: 5.5 }] }), true);
    for (let i = 0; i < 6; i++) {
      agent(w, `u${i}`, 5.5 + i * 0.01, 5.5, { speed: 0.5, arriveRange: 1.2, separation: { weight: 0.5 } });
    }
    const minPair = (): number => {
      let m = Infinity;
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
        m = Math.min(m, Math.hypot(pos(w, `u${i}`).x - pos(w, `u${j}`).x, pos(w, `u${i}`).y - pos(w, `u${j}`).y));
      }
      return m;
    };
    for (let t = 0; t < 60; t++) w.tick();          // 先让它安顿
    let worstLate = Infinity;
    for (let t = 0; t < 140; t++) { w.tick(); worstLate = Math.min(worstLate, minPair()); }
    // 安顿之后**再也不许**挤回去（撤减速带 → 这里会掉到 0.001 量级）
    expect(worstLate).toBeGreaterThan(0.2);
  });

  it('**力律 = Reynolds 的 1/d²**（距离减半 → 力翻倍；线性衰减只会是 1.5×）', () => {
    // OpenSteer `steerForSeparation`：`steering += offset / -distanceSquared`（作者注：除两次——
    // 一次归一化方向、一次得 1/d 衰减）。判据取**没被截断的区间**里的两点比值：
    //   1/d 律 → force(0.25R)/force(0.5R) = 2.00
    //   我自创的线性律 (1-d/R) → 0.75/0.5 = 1.50
    // 这条就是把「照文章实现」钉死的地方；换回自创写法 → 本断言红。
    const forceAt = (gap: number): number => {
      clearFlowFieldCache();
      const w = world(field({ cols: 12, rows: 12, goals: [{ x: 5.5, y: 5.5 }] }), false);
      agent(w, 'u0', 5.5, 5.5, { speed: 1, arriveRange: 3, separation: { weight: 0.6 } });
      agent(w, 'n0', 5.5 + gap, 5.5, { speed: 1, arriveRange: 3, separation: { weight: 0.6 } });
      w.tick();
      return Math.hypot(vel(w, 'u0').vx, vel(w, 'u0').vy);
    };
    const near = forceAt(0.25);   // 0.1/0.25 = 0.40（未触顶）
    const far = forceAt(0.5);     // 0.1/0.50 = 0.20（未触顶）
    expect(near / far).toBeGreaterThan(1.8);
    expect(near / far).toBeLessThan(2.2);
  });

  it('**人越挤推得越狠**（力是求和·不是取均值/归一化）', () => {
    // 取均值或归一化的话：「只有一个近邻」与「被四个近邻围住」受力一样大——那不合直觉，
    // 而且会让同一个单位的受力随远处邻居进出而忽大忽小（队伍在终点抖的病根之一）。
    // ⚠ 邻居摆在 0.7·radius 处**是为了让力落在截断线以下**：贴脸时两种写法都会触顶，
    // 触顶就分不出谁大谁小了——测力的定律要在它没被钳的区间里测。
    const speedOf = (n: number): number => {
      clearFlowFieldCache();
      const w = world(field({ cols: 12, rows: 12, goals: [{ x: 5.5, y: 5.5 }] }), false);
      agent(w, 'u0', 5.5, 5.5, { speed: 1, arriveRange: 3, separation: { weight: 0.6 } });
      // 把 n 个邻居摆在 u0 周围同一半径上（等距·方向均匀 → 合力不对消才有可比性：这里摆成扇形）
      for (let i = 0; i < n; i++) {
        const ang = (i / Math.max(n, 1)) * (Math.PI / 2);          // 只占一个象限 ⇒ 合力不抵消
        agent(w, `n${i}`, 5.5 + Math.cos(ang) * 0.7, 5.5 + Math.sin(ang) * 0.7, { speed: 1, arriveRange: 3, separation: { weight: 0.6 } });
      }
      w.tick();
      return Math.hypot(vel(w, 'u0').vx, vel(w, 'u0').vy);
    };
    const one = speedOf(1);
    const four = speedOf(4);
    expect(one).toBeGreaterThan(0);
    expect(four).toBeGreaterThan(one * 1.5);   // 撤成「除以实际邻居数」→ 两者几乎相等，此断言红
  });
});

// ═══ ORCA 硬避让（owner 2026-08-24「可以上」·移植自 RVO2）═══
describe('flow-field × ORCA — 强承诺：真的不重叠', () => {
  const R = 0.35;
  const orcaAgent = (w: World, id: string, x: number, y: number, fieldId: string, over: Partial<Omit<FlowAgent, 'type'>> = {}): void =>
    agent(w, id, x, y, { speed: 0.5, fieldId, orca: { radius: R }, ...over });

  // ⚠ 这条第一版只钉**一个**起始排布，第二轮独立复查把整队沿 y 挪 0.25 就打穿了它想守的承诺：
  //   起始 y=3.5 → 0.70004（过·而且这个 worst 落在**终点安顿**，压根没量到中场）
  //   y=3.75 → 0.68053 · y=4.0 → 0.64442 · y=4.25 → 0.67791（**都是中场对撞**，全不过 0.69）
  // 「承重用例只钉一个初始条件」本身就是缺陷形状，尤其当被测指标对初始条件**混沌**时。
  // 所以现在：扫一族排布 · **中场与终点分开量** · 断言按各自实测的真实边界写。
  it('**两队对穿：一族排布 × 中场/终点分开量**（ORCA 把穿模从 ~90% 压到最坏 8%·但不是 0）', () => {
    const runCrossing = (y0: number, mode: 'none' | 'sep' | 'orca'): { mid: number; end: number } => {
      clearFlowFieldCache();
      const geo = { cellSize: 1, originX: 0, originY: 0, cols: 24, rows: 12 };
      const w = new World();
      for (const sys of flowFieldCapability.systems) w.addSystem(sys);
      for (const sys of motionApplyCapability.systems) w.addSystem(sys);
      w.createEntity('fR'); w.addComponent('fR', { type: 'FlowField', id: 'toRight', ...geo, goals: [{ x: 23.5, y: 5.5 }] } as FlowField);
      w.createEntity('fL'); w.addComponent('fL', { type: 'FlowField', id: 'toLeft', ...geo, goals: [{ x: 0.5, y: 5.5 }] } as FlowField);
      const extra = mode === 'orca' ? { orca: { radius: R } }
        : mode === 'sep' ? { separation: { weight: 0.4 } } : {};
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        // ⚠ 必须给 arriveRange：不给的话 5 个单位会死追**同一个点**，挤到线性规划无可行解，
        // 落 LP3「尽量少撞」⇒ 真的会压进去。这不是 ORCA 的锅——一个点容不下五个单位。
        agent(w, `L${i}`, 2.5, y0 + i, { fieldId: 'toRight', speed: 0.5, arriveRange: 2, ...extra }); ids.push(`L${i}`);
        agent(w, `R${i}`, 21.5, y0 + 0.1 + i, { fieldId: 'toLeft', speed: 0.5, arriveRange: 2, ...extra }); ids.push(`R${i}`);
      }
      let mid = Infinity; let end = Infinity;
      for (let t = 0; t < 120; t++) {
        w.tick();
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const p = pos(w, ids[i]); const q = pos(w, ids[j]);
            const d = Math.hypot(p.x - q.x, p.y - q.y);
            // 中场 = 两个单位离各自最近的目标都还有 >4；其余算终点区（安顿阶段）
            const far = (t2: Transform): boolean => Math.min(Math.abs(t2.x - 23.5), Math.abs(t2.x - 0.5)) > 4;
            if (far(p) && far(q)) mid = Math.min(mid, d); else end = Math.min(end, d);
          }
        }
      }
      return { mid, end };
    };
    const FAMILY = [3.5, 3.75, 4.0, 4.25, 4.5, 4.75] as const;
    const orca = FAMILY.map((y0) => runCrossing(y0, 'orca'));
    const worstMid = Math.min(...orca.map((r) => r.mid));
    const worstEnd = Math.min(...orca.map((r) => r.end));

    // ① **终点区**：安顿阶段每一族排布都守得住半径和（0.70）——这是 ORCA 真正兑现的那半句
    expect(worstEnd).toBeGreaterThan(0.69);
    // ② **中场对撞**：守不住，实测最差 **0.64442**（穿模 ~8%）——这是当前 `timeHorizon=8` 下的
    //    实测值，不是"物理下限"（见 orca.ts：16 能到 0.692，但终点段会塌，是个非单调的活旋钮）。
    //    阈值按实测收到 0.63（余量 2.2%）：既不假装穿模是 0，也不留出能藏真回归的空档。
    //    ⚠ 上一版这里写 0.60 并注"实测最差 0.63113"——那个数是另一次扫参（maxNeighbors≥9）的，
    //    不是本用例的。**注释里的数必须是这条用例自己跑出来的**，否则阈值就是照错数定的。
    expect(worstMid).toBeGreaterThan(0.63);
    // 变好了不设绊线（"变好就红"的门禁最容易被随手放宽）——打出来，人自己看。
    console.info('[orca/crossing] worstMid=%s worstEnd=%s（半径和 %s）', worstMid.toFixed(5), worstEnd.toFixed(5), (2 * R).toFixed(2));
    // ③ 对照组：同一场景下不开避让 / 只开软分离**烂一个数量级**，证明上面那两条是 ORCA 挣来的
    const noneMid = Math.min(...FAMILY.map((y0) => runCrossing(y0, 'none').mid));
    const sepMid = Math.min(...FAMILY.map((y0) => runCrossing(y0, 'sep').mid));
    expect(noneMid).toBeLessThan(0.15);           // 实测 0.04668 = 直接对穿
    expect(sepMid).toBeLessThan(0.15);            // 实测 0.06129 = 软承诺本来就不保证（中场 0.061~0.128）
    expect(worstMid / Math.max(noneMid, sepMid)).toBeGreaterThan(4);
  }, 120_000);

  it('ORCA 不改走位：单位照样到得了目标（避让只挑最接近期望的那个速度）', () => {
    const f = field({ cols: 20, rows: 20, goals: [{ x: 19.5, y: 19.5 }] });
    const w = world(f, true);
    for (let i = 0; i < 6; i++) orcaAgent(w, `u${i}`, 1.5 + (i % 3) * 0.9, 1.5 + Math.floor(i / 3) * 0.9, 'f1', { arriveRange: 2 });
    for (let i = 0; i < 400; i++) w.tick();
    for (let i = 0; i < 6; i++) {
      const p = pos(w, `u${i}`);
      expect({ id: i, arrived: Math.hypot(p.x - 19.5, p.y - 19.5) < 4 }).toMatchObject({ arrived: true });
    }
  }, 60_000);

  it('不设 orca = 一个字节不变（零回归）· 同时设 separation 与 orca → ORCA 优先', () => {
    const run = (opts: Partial<Omit<FlowAgent, 'type'>>): string => {
      clearFlowFieldCache();
      const w = world(field({ cols: 14, rows: 14, goals: [{ x: 13.5, y: 13.5 }] }), true);
      for (let i = 0; i < 4; i++) agent(w, `u${i}`, 2.5 + i * 0.4, 2.5, { speed: 0.5, ...opts });
      for (let i = 0; i < 20; i++) w.tick();
      return Array.from({ length: 4 }, (_, i) => `${pos(w, `u${i}`).x.toFixed(10)},${pos(w, `u${i}`).y.toFixed(10)}`).join('|');
    };
    const plain = run({});
    expect(run({})).toBe(plain);                                          // 自身确定
    expect(run({ orca: { radius: R } })).not.toBe(plain);                  // 开了 ORCA 就该有区别
    // 同时设两个：ORCA 后写（覆盖软分离的结果）⇒ 与只设 ORCA 相同
    expect(run({ orca: { radius: R }, separation: { weight: 0.5 } })).toBe(run({ orca: { radius: R } }));
  }, 60_000);

  it('确定性：开 ORCA 跑两遍逐位相同 · 实体创建序颠倒结果不变', () => {
    const run = (reverse: boolean): string => {
      clearFlowFieldCache();
      const w = world(field({ cols: 16, rows: 16, goals: [{ x: 15.5, y: 15.5 }] }), true);
      const ids = ['u0', 'u1', 'u2', 'u3', 'u4'];
      for (const id of reverse ? [...ids].reverse() : ids) {
        const i = ids.indexOf(id);
        orcaAgent(w, id, 3.5 + (i % 3) * 0.6, 3.5 + Math.floor(i / 3) * 0.6, 'f1');
      }
      for (let i = 0; i < 40; i++) w.tick();
      return ids.map((id) => `${pos(w, id).x.toFixed(12)},${pos(w, id).y.toFixed(12)}`).join('|');
    };
    expect(run(false)).toBe(run(false));
    expect(run(true)).toBe(run(false));
  }, 60_000);
});

// ═══ 独立复查（2026-08-25·orca-review）打回的六条，每条一个承重用例 ═══
// 报告全文：docs/design/game211/orca-review-2026-08-25.md。
// **这些用例的存在理由都是"当时零覆盖"**——六条里有三条是 sabotage 撤掉实现后全库依旧全绿查出来的。
describe('flow-field × ORCA — 复查打回项的承重用例', () => {
  const R = 0.35;

  // ── P0-1：邻居索引的键 ──
  it('**软分离只看同一张场**（多场零回归·ORCA 落地不许改软分离的语义）', () => {
    // ORCA 落地时我把分桶键从 fieldId 顺手统一成了几何键，于是「只开 separation、从不碰 orca」的
    // 多场世界轨迹静默变了（复查实测 40 拍轨迹 hash 变、末拍某单位 x 从 3.357 变 2.088）。
    // 判据：**两张同几何的场各站一个人 == 两个人各自单独在世界里跑**，逐位相同。
    const geo = { cellSize: 1, originX: 0, originY: 0, cols: 12, rows: 12, goals: [{ x: 11.5, y: 5.5 }] };
    const run = (both: boolean): Array<{ x: number; y: number }> => {
      const w = new World();
      for (const sys of flowFieldCapability.systems) w.addSystem(sys);
      for (const sys of motionApplyCapability.systems) w.addSystem(sys);
      w.createEntity('fA'); w.addComponent('fA', { type: 'FlowField', id: 'A', ...geo } as FlowField);
      w.createEntity('fB'); w.addComponent('fB', { type: 'FlowField', id: 'B', ...geo } as FlowField);
      agent(w, 'a', 2.50, 5.50, { fieldId: 'A', speed: 0.5, separation: { weight: 0.4 } });
      if (both) agent(w, 'b', 2.55, 5.52, { fieldId: 'B', speed: 0.5, separation: { weight: 0.4 } });
      const trail: Array<{ x: number; y: number }> = [];
      for (let t = 0; t < 30; t++) { w.tick(); const p = pos(w, 'a'); trail.push({ x: p.x, y: p.y }); }
      return trail;
    };
    // 同几何、不同场 id、贴得极近（0.05）——按几何分桶的话必定互推，按 fieldId 分桶则互不可见。
    expect(run(true)).toEqual(run(false));
  });

  it('**ORCA 反过来必须跨场看见**（两队各跟一张场正面对撞·同一份索引不能退回 fieldId）', () => {
    const geo = { cellSize: 1, originX: 0, originY: 0, cols: 24, rows: 12 };
    const w = new World();
    for (const sys of flowFieldCapability.systems) w.addSystem(sys);
    for (const sys of motionApplyCapability.systems) w.addSystem(sys);
    w.createEntity('fR'); w.addComponent('fR', { type: 'FlowField', id: 'toRight', ...geo, goals: [{ x: 23.5, y: 5.5 }] } as FlowField);
    w.createEntity('fL'); w.addComponent('fL', { type: 'FlowField', id: 'toLeft', ...geo, goals: [{ x: 0.5, y: 5.5 }] } as FlowField);
    agent(w, 'a', 8.5, 5.50, { fieldId: 'toRight', speed: 0.5, arriveRange: 2, orca: { radius: R } });
    agent(w, 'b', 15.5, 5.55, { fieldId: 'toLeft', speed: 0.5, arriveRange: 2, orca: { radius: R } });
    let worst = Infinity;
    for (let t = 0; t < 60; t++) {
      w.tick();
      const p = pos(w, 'a'); const q = pos(w, 'b');
      worst = Math.min(worst, Math.hypot(p.x - q.x, p.y - q.y));
    }
    expect(worst).toBeGreaterThan(0.69);   // 半径和 0.70·跨场看不见的话直接对穿（复查实测 0.10）
  });

  // ── P0-2：完全同位 ──
  it('**完全同位的两个 ORCA 单位会分开**（原码 w/|w| 得 NaN·NaN 约束被静默丢弃）', () => {
    const w = world(field({ cols: 12, rows: 12, goals: [{ x: 11.5, y: 5.5 }] }));
    agent(w, 'a', 5.5, 5.5, { speed: 0.5, arriveRange: 2, orca: { radius: R } });
    agent(w, 'b', 5.5, 5.5, { speed: 0.5, arriveRange: 2, orca: { radius: R } });   // 逐位同一个坐标
    for (let t = 0; t < 40; t++) w.tick();
    const p = pos(w, 'a'); const q = pos(w, 'b');
    expect(Number.isFinite(p.x) && Number.isFinite(q.x)).toBe(true);       // 不出 NaN
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(0.5);         // 真的分开了（撤修前恒 0.000000）
  });

  it('同位分离是**确定性**的（同输入两跑逐位同·方向由下标定不由浮点误差定）', () => {
    const once = (): { x: number; y: number } => {
      clearFlowFieldCache();
      const w = world(field({ cols: 12, rows: 12, goals: [{ x: 11.5, y: 5.5 }] }));
      agent(w, 'a', 5.5, 5.5, { speed: 0.5, arriveRange: 2, orca: { radius: R } });
      agent(w, 'b', 5.5, 5.5, { speed: 0.5, arriveRange: 2, orca: { radius: R } });
      for (let t = 0; t < 10; t++) w.tick();
      const p = pos(w, 'a'); return { x: p.x, y: p.y };
    };
    expect(once()).toEqual(once());
  });

  // ── P1-3：混装单位类型 ──
  it('**没开 ORCA 的单位也得进桶**（ORCA 队对穿纯流场队·复查实测原来 0.1000 = 直接穿过去）', () => {
    // 慢速 1v1 迎面（速度 0.15 / 半径 0.6）——**故意摆得宽松**：这条测的是「看不看得见」，
    // 不是「挤爆时能撑住多少」，所以要让机制本身的效果盖过一拍积分误差。
    const R = 0.6; const SP = 0.15;
    const geo = { cellSize: 2, originX: 0, originY: 0, cols: 16, rows: 8 };
    const w = new World();
    for (const sys of flowFieldCapability.systems) w.addSystem(sys);
    for (const sys of motionApplyCapability.systems) w.addSystem(sys);
    w.createEntity('fR'); w.addComponent('fR', { type: 'FlowField', id: 'toRight', ...geo, goals: [{ x: 31, y: 7 }] } as FlowField);
    w.createEntity('fL'); w.addComponent('fL', { type: 'FlowField', id: 'toLeft', ...geo, goals: [{ x: 1, y: 7 }] } as FlowField);
    agent(w, 'orcaGuy', 11, 7.0, { fieldId: 'toRight', speed: SP, arriveRange: 3, orca: { radius: R } });
    agent(w, 'plainGuy', 21, 7.1, { fieldId: 'toLeft', speed: SP, arriveRange: 3 });   // 什么避让都不开
    let worst = Infinity;
    for (let t = 0; t < 200; t++) {
      w.tick();
      const p = pos(w, 'orcaGuy'); const q = pos(w, 'plainGuy');
      worst = Math.min(worst, Math.hypot(p.x - q.x, p.y - q.y));
    }
    // 同机三档实测：进桶 **0.60333** · 只收开了 ORCA 的（= 落地时的写法）**0.14142** · 半径和 0.60。
    // 纯流场单位没有半径可言（按 0 计），所以强承诺只能给到「自己那半径」这一档——够用，
    // 因为要挡住的是「完全隐形 → 直接对穿」。
    expect(worst).toBeGreaterThan(0.55);
  });

  // ── P1-6：环形搜索提前退出的**正确性** ──
  it('**环形搜索 == 暴力最近 k 个**（随机撒点对照·提前退出撤掉后 3.2% 的查询会拿错邻居）', () => {
    // 确定性 LCG（sim 面禁裸 Math.random·测试同口径：随机数必须可复现）
    let seed = 20260825;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const f = field({ cellSize: 1, originX: 0, originY: 0, cols: 20, rows: 20, goals: [{ x: 19.5, y: 19.5 }] });
    let mismatched = 0; let queries = 0;
    for (let trial = 0; trial < 40; trial++) {
      const n = 6 + Math.floor(rnd() * 40);
      const px = new Float64Array(n); const py = new Float64Array(n);
      for (let i = 0; i < n; i++) { px[i] = rnd() * 20; py[i] = rnd() * 20; }
      // 手工建一份与系统同构的分桶
      const cnt = new Int32Array(f.cols * f.rows);
      const cellIdx = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        const { col, row } = cellOf(f, px[i], py[i]);
        cellIdx[i] = cellIndex(f, col, row); cnt[cellIdx[i]]++;
      }
      const start = new Int32Array(f.cols * f.rows);
      let acc = 0; for (let i = 0; i < start.length; i++) { start[i] = acc; acc += cnt[i]; }
      const cursor = Int32Array.from(start); const items = new Int32Array(n);
      for (let i = 0; i < n; i++) items[cursor[cellIdx[i]]++] = i;
      const dens: DensityField = {
        count: cnt, start, items, px, py,
        vx: new Float64Array(n), vy: new Float64Array(n),
        radius: new Float64Array(n).fill(R), reciprocal: new Uint8Array(n).fill(1),
      };
      for (let self = 0; self < n; self++) {
        const range = 5 + rnd() * 6;
        const maxN = 1 + Math.floor(rnd() * 8);
        const { col, row } = cellOf(f, px[self], py[self]);
        const got = orcaNeighbors(f, dens, self, col, row, px[self], py[self], range, maxN);
        // 暴力：全表按 (距离², 下标) 全序排，取 range 内最近的 maxN 个
        const brute = [...Array(n).keys()]
          .filter((j) => j !== self)
          .map((j) => ({ j, d2: (px[j] - px[self]) ** 2 + (py[j] - py[self]) ** 2 }))
          .filter(({ d2 }) => d2 < range * range)
          .sort((a, b) => (a.d2 !== b.d2 ? a.d2 - b.d2 : a.j - b.j))
          .slice(0, maxN);
        queries++;
        const gotKey = got.map((g) => `${g.x},${g.y}`).join('|');
        const bruteKey = brute.map(({ j }) => `${px[j]},${py[j]}`).join('|');
        if (gotKey !== bruteKey) mismatched++;
      }
    }
    expect(queries).toBeGreaterThan(500);   // 试验量够（否则"零不符"没有说服力）
    expect(mismatched).toBe(0);
  });

  it('**平局按下标定序**（浮点上真会等距·撤掉次键邻居集就变了·全序 = lockstep 的前提）', () => {
    const f = field({ cellSize: 4, originX: 0, originY: 0, cols: 4, rows: 4, goals: [{ x: 14, y: 14 }] });
    // 四个点到自己的距离**逐位相等**（对称摆放），maxNeighbors=2 ⇒ 取哪两个只能由下标决定
    const px = Float64Array.from([6, 6, 6, 2, 10]);
    const py = Float64Array.from([6, 2, 10, 6, 6]);
    const n = px.length;
    const cnt = new Int32Array(16); const cellIdx = new Int32Array(n);
    for (let i = 0; i < n; i++) { const { col, row } = cellOf(f, px[i], py[i]); cellIdx[i] = cellIndex(f, col, row); cnt[cellIdx[i]]++; }
    const start = new Int32Array(16); let acc = 0;
    for (let i = 0; i < 16; i++) { start[i] = acc; acc += cnt[i]; }
    const cursor = Int32Array.from(start); const items = new Int32Array(n);
    for (let i = 0; i < n; i++) items[cursor[cellIdx[i]]++] = i;
    const dens: DensityField = {
      count: cnt, start, items, px, py,
      vx: new Float64Array(n), vy: new Float64Array(n),
      radius: new Float64Array(n).fill(R), reciprocal: new Uint8Array(n).fill(1),
    };
    const { col, row } = cellOf(f, px[0], py[0]);
    const got = orcaNeighbors(f, dens, 0, col, row, px[0], py[0], 8, 2);
    // 四个候选到 self 的距离平方全是 16 —— 唯一的分辨依据是下标 1,2（不是 3,4，也不是遍历序）
    expect(got.map((g) => `${g.x},${g.y}`)).toEqual(['6,2', '6,10']);
  });

  // ── P1-7：提前退出的**性能判据**（墙钟不能进 sim 测试 → 量访问格数）──
  it('**稠密场每次查询只访问一两环**（提前退出的机器判据·撤掉就是整窗 361 格）', () => {
    const w = world(field({ cols: 24, rows: 24, goals: [{ x: 23.5, y: 12.5 }] }));
    // 40 个单位挤在 4×4 的范围里：邻居随手一抓就够 8 个 ⇒ 第 1 环就该收工
    for (let i = 0; i < 40; i++) {
      agent(w, `u${i}`, 4.2 + (i % 8) * 0.5, 10.2 + Math.floor(i / 8) * 0.5,
        { speed: 0.4, arriveRange: 2, orca: { radius: R } });
    }
    const before = flowFieldCellVisits();
    w.tick();
    const perQuery = (flowFieldCellVisits() - before) / 40;
    // 前瞻 8 拍 × 速度 0.4 + 0.35 ⇒ 窗口 4 环 = 81 格；提前退出在时实测 ~9（第 0+1 环）。
    // 取 30 当门槛：既容得下密度变化，又离 81 足够远——撤掉提前退出必然撞线。
    expect(perQuery).toBeLessThan(30);
    expect(perQuery).toBeGreaterThan(0);
  });

  it('ORCA 的四类静默降级**都要留痕**，且一拍不超过 3 条（日志基准守则）', () => {
    // ⚠ 这条第一版写成「非法半径 → 当作没开 ORCA」，撤掉校验**全绿**——因为 `radius > 0`
    // 那道门本来就把 0/负/NaN 全挡在外面了，校验分支的**唯一**增量是那句留痕。
    // 「什么都没发生」的分支必须喊一声（日志基准守则），所以判据改成读 trace。
    const w = world(field({ cols: 12, rows: 12, goals: [{ x: 11.5, y: 5.5 }] }));
    w.createEntity('dbg');
    w.addComponent('dbg', { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace);
    // ⚠ **把每一类留痕分支都点着**（第一版只点了降级那类，于是"折叠"撤掉照样 ≤3 条、全绿）：
    w.createEntity('field2');                                               // 同 id 的第二张场
    w.addComponent('field2', field({ cols: 12, rows: 12, goals: [{ x: 11.5, y: 5.5 }] }));
    agent(w, 'lost', 3.5, 5.5, { speed: 0.5, fieldId: 'nope' });            // 找不到自己的场
    agent(w, 'away', 99.5, 99.5, { speed: 0.5 });                           // 网格外
    agent(w, 'bad', 2.5, 5.5, { speed: 0.5, orca: { radius: -1 } });        // 参数非法
    agent(w, 'ok1', 6.5, 5.5, { speed: 0.5, arriveRange: 2, orca: { radius: 0.35 } });
    agent(w, 'ok2', 6.5, 5.5, { speed: 0.5, arriveRange: 2, orca: { radius: 0.35 } });  // 与 ok1 完全同位
    agent(w, 'plain', 6.6, 5.5, { speed: 0.5, arriveRange: 2 });            // 不还礼的邻居
    w.tick();
    const ev = w.getComponent<DebugTrace>('dbg', 'DebugTrace')!.events;
    const line = ev.filter((e) => e.system === 'flow-field' && /ORCA 降级/.test(e.what));
    expect(line).toHaveLength(1);                                   // 四类合成一条
    expect(line[0].kind).toBe('reject');
    expect(line[0].what).toMatch(/参数非法 1/);
    expect(line[0].what).toMatch(/退化 [1-9]/);
    expect(line[0].what).toMatch(/邻居不还礼 [1-9]/);
    expect(line[0].what).toMatch(/无可行解 \d/);
    // **密度守则**：每 system 每 tick ≤3 条。第二轮复查实测这里一拍能到 5 条
    // （同 id 的场每拍复读 + los + 降级 + 找不到场 + 越界 + commit）。
    expect(ev.filter((e) => e.system === 'flow-field').length).toBeLessThanOrEqual(3);
    // 折叠不许**吞数字**：分项仍要读得出来（折叠 ≠ 少记）
    const commit = ev.find((e) => e.system === 'flow-field' && e.kind === 'commit')!;
    expect(commit.why).toMatch(/1 个找不到自己的场/);
    expect(commit.why).toMatch(/1 个在网格外/);
    expect(commit.why).toMatch(/1 张同 id 的场被忽略/);
    // **`los` 只在真重铺那拍发一次**（复读的留痕等于没有留痕）；`dupes` 反过来**不能**挂那道门——
    // 三复查实测：中途新加一张同 id 的场不触发重铺 ⇒ 它永远不留痕，所以改挂每拍都发的 commit。
    w.createEntity('field3');
    w.addComponent('field3', field({ cols: 12, rows: 12, goals: [{ x: 11.5, y: 5.5 }] }));   // 第三张同 id
    w.tick();
    const late = w.getComponent<DebugTrace>('dbg', 'DebugTrace')!.events;
    expect(late[late.length - 1].why).toMatch(/2 张同 id 的场被忽略/);   // 后加入的也数得到
    // 参数非法的那个照纯流场走（不是被一条塌掉的约束卡住）
    expect(Math.hypot(vel(w, 'bad').vx, vel(w, 'bad').vy)).toBeCloseTo(0.5, 9);
    expect(geoKey(field())).toBe('5x5@1:0,0');                      // 顺带钉一下几何键格式
  });

  it('**一个单位都没动起来时必须喊一声**（折叠的门差点把最该喊的那一拍变成唯一不喊的）', () => {
    // 三复查 M1：`noField`/`offGrid` 折进 commit 后，commit 的门还是 `moved>0||stopped>0`，
    // 而这两类是 continue 掉的、两个计数都不加 ⇒ **全员 fieldId 打错时一拍 0 条 trace**。
    // 上一版用例抓不到，是因为它的世界里永远有走得动的单位。
    for (const broken of ['badField', 'offGrid'] as const) {
      const w = world(field({ cols: 12, rows: 12, goals: [{ x: 11.5, y: 5.5 }] }));
      w.createEntity('dbg');
      w.addComponent('dbg', { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace);
      for (let i = 0; i < 3; i++) {
        if (broken === 'badField') agent(w, `u${i}`, 2.5 + i, 5.5, { speed: 0.5, fieldId: 'typo' });
        else agent(w, `u${i}`, 900 + i, 900, { speed: 0.5 });
      }
      w.tick();
      const ev = w.getComponent<DebugTrace>('dbg', 'DebugTrace')!.events.filter((e) => e.system === 'flow-field');
      expect(ev.length).toBeGreaterThan(0);                 // ← 折叠前这里是 0
      expect(ev[ev.length - 1].kind).toBe('reject');        // 一个都没动 = 什么都没发生，不是 commit
      expect(ev[ev.length - 1].why).toMatch(broken === 'badField' ? /3 个找不到自己的场/ : /3 个在网格外/);
    }
  });

  it('`orca` 的三个参数任一填成怪值都不许炸引擎（数据面填得出的值必须当场兜住）', () => {
    // `maxNeighbors: 0` 实测**当场抛 TypeError**（环形搜索读 `found[-1]`）——这不是推理，
    // 是写第二轮修复时用一个写坏的探针踩出来的。数据驱动面上「作者填得出」= 迟早有人填。
    for (const bad of [
      { radius: 0.35, maxNeighbors: 0 },
      { radius: 0.35, maxNeighbors: -3 },
      { radius: 0.35, timeHorizon: 0 },
      { radius: Number.NaN },
    ] as const) {
      const w = world(field({ cols: 12, rows: 12, goals: [{ x: 11.5, y: 5.5 }] }));
      agent(w, 'a', 2.5, 5.5, { speed: 0.5, orca: bad });
      agent(w, 'b', 2.6, 5.5, { speed: 0.5, orca: bad });
      expect(() => w.tick()).not.toThrow();
      const v = vel(w, 'a');
      expect(Number.isFinite(v.vx) && Number.isFinite(v.vy)).toBe(true);   // 也不许写出 NaN 速度
    }
    // 直接调导出的公开面也不许炸
    const f = field();
    const dens: DensityField = {
      count: new Int32Array(25), start: new Int32Array(25), items: new Int32Array(0),
      px: new Float64Array(0), py: new Float64Array(0), vx: new Float64Array(0),
      vy: new Float64Array(0), radius: new Float64Array(0), reciprocal: new Uint8Array(0),
    };
    expect(orcaNeighbors(f, dens, 0, 2, 2, 2.5, 2.5, 4, 0)).toEqual([]);
  });

  it('**负半径不许串进别人的判定圈**（半径进的是共享邻居表·塌的是别人的 combinedRadius）', () => {
    // 复查的 M6：撤掉 `radius > 0` 那道闸全库全绿。因为闸的下游还有一道 `> 0` 兜着自己，
    // 但**邻居表里的半径是给别人用的**——负半径会把别人的 combinedRadius 缩小。
    const mk = (badRadius: number): number => {
      clearFlowFieldCache();
      const w = world(field({ cols: 16, rows: 12, goals: [{ x: 15.5, y: 5.5 }] }));
      agent(w, 'ghost', 8.5, 5.5, { speed: 0, orca: { radius: badRadius } });   // 挡在路中间
      agent(w, 'runner', 3.5, 5.5, { speed: 0.4, arriveRange: 2, orca: { radius: 0.5 } });
      let worst = Infinity;
      for (let t = 0; t < 60; t++) {
        w.tick();
        const p = pos(w, 'ghost'); const q = pos(w, 'runner');
        worst = Math.min(worst, Math.hypot(p.x - q.x, p.y - q.y));
      }
      return worst;
    };
    // 正常半径 0.5：runner 绕开 ghost 的 1.0 判定圈；ghost 填 −5 时若不净化，
    // combinedRadius = 0.5 + (−5) < 0 ⇒ 约束整个反过来，runner 会从它身上碾过去。
    expect(mk(0.5)).toBeGreaterThan(0.9);
    expect(mk(-5)).toBeGreaterThan(0.4);   // 净化后 ghost 退化成"没开 ORCA"的点障碍
  });
});
