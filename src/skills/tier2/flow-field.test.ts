import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@engine/core/world.js';
import type { FlowField, FlowAgent, Transform, Velocity, Status } from '@engine/protocol/components.js';
import { motionApplyCapability } from '@skills/tier1/index.js';
import {
  flowFieldCapability, bakeFlowField, buildCostField, buildIntegration, buildFlow,
  cellIndex, cellOf, sameInputs, getBakedField, clearFlowFieldCache, flowFieldBakes, flowFieldLookups,
  STRAIGHT, DIAGONAL, UNREACHABLE, SEP_MAX_WEIGHT,
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
      for (const sys of steeringCapability.systems) w.addSystem(sys);
      for (const sys of pathFollowCapability.systems) w.addSystem(sys);
      for (const sys of flowFieldCapability.systems) w.addSystem(sys);
      for (const sys of motionApplyCapability.systems) w.addSystem(sys);
      w.tick();
      const order = w.getSortedSystems().map((sys) => sys.id);
      expect(order).toEqual(['frame-start-transform', 'steering', 'path-follow', 'flow-field', 'motion-apply']);
    } finally { console.warn = origWarn; console.error = origErr; }
    // 撤 runsAfter:['steering','path-follow'] → 这里会抓到
    // 「[topological-sort] phase 0：检测到定序环 [steering, path-follow, flow-field]（闭环组件：Velocity）」
    expect(warns.filter((l) => /定序环/.test(l))).toEqual([]);
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

  it('**人越挤推得越狠**（力除以固定参考数·不是除以实际邻居数）', () => {
    // 除以实际邻居数（均值）的话：「只有一个近邻」与「被四个近邻围住」受力一样大 ——
    // 那不合直觉，而且会让同一个单位的受力随远处邻居进出而忽大忽小（队伍在终点抖的病根之一）。
    const speedOf = (n: number): number => {
      clearFlowFieldCache();
      const w = world(field({ cols: 12, rows: 12, goals: [{ x: 5.5, y: 5.5 }] }), false);
      agent(w, 'u0', 5.5, 5.5, { speed: 1, arriveRange: 3, separation: { weight: 0.6 } });
      // 把 n 个邻居摆在 u0 周围同一半径上（等距·方向均匀 → 合力不对消才有可比性：这里摆成扇形）
      for (let i = 0; i < n; i++) {
        const ang = (i / Math.max(n, 1)) * (Math.PI / 2);          // 只占一个象限 ⇒ 合力不抵消
        agent(w, `n${i}`, 5.5 + Math.cos(ang) * 0.12, 5.5 + Math.sin(ang) * 0.12, { speed: 1, arriveRange: 3, separation: { weight: 0.6 } });
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

