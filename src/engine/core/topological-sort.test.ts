import { describe, it, expect, vi, afterEach } from 'vitest';
import { topologicalSort } from './topological-sort.js';
import { SystemPhase } from './types.js';
import type { SystemDeclaration } from './types.js';

const noop = (): void => {};
function sys(id: string, reads: string[], writes: string[], phase?: number): SystemDeclaration {
  return { id, reads, writes, consumes: [], phase, execute: noop };
}
function order(systems: SystemDeclaration[]): string[] {
  return topologicalSort(systems).map((s) => s.id);
}
// 平局裁决会 console.warn 留痕；单测里默认吞掉（需要断言留痕的用例自己 spy）。
function quietOrder(systems: SystemDeclaration[]): string[] {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    return order(systems);
  } finally {
    spy.mockRestore();
  }
}
afterEach(() => vi.restoreAllMocks());

describe('topologicalSort — 组件依赖定序（缺省阶段，行为不变）', () => {
  it('writer 排在 reader 之前（输入乱序也对）', () => {
    const order = topologicalSort([sys('consumer', ['X'], []), sys('producer', [], ['X'])]).map((s) => s.id);
    expect(order).toEqual(['producer', 'consumer']);
  });

  // REQ-CYCLEHAZ 方案 B 前：此处抛 Circular。B 后：纯推断 RMW 互锁降级为确定性平局裁决（见文末 describe）。
  it('同阶段两个系统都读写同一组件 → 不再抛，按平局键定序', () => {
    expect(quietOrder([sys('a', ['X'], ['X']), sys('b', ['X'], ['X'])])).toEqual(['a', 'b']);
  });
});

describe('topologicalSort — phase 阶段', () => {
  it('跨阶段按阶段号定序，绕过纯组件拓扑会判成环的"读后改"管线', () => {
    // detect 读 Transform、resolve 写 Transform：同阶段会成环。
    // 把 resolve 排到更后阶段 → 不成环，且排在 detect 之后。
    const detect = sys('detect', ['Transform'], ['Overlap']); // Update
    const resolve = sys('resolve', ['Overlap'], ['Transform'], SystemPhase.Resolve);
    expect(topologicalSort([resolve, detect]).map((s) => s.id)).toEqual(['detect', 'resolve']);
  });

  // 同样两系统不分阶段：B 前抛环、B 后按平局键裁决（装得进但顺序由 id 字典序定，语义不保证）——
  // 所以 phase 仍是这条「读后改」管线的**正解**：它表达的是意图，平局裁决只是安全网。
  it('同样的两系统不分阶段 → 裁决只按 id 字典序、与输入序无关（phase 仍是表达意图的正解）', () => {
    const detect = sys('detect', ['Transform'], ['Overlap']);
    const resolve = sys('resolve', ['Overlap'], ['Transform']); // 同 Update 阶段
    // P2d：平局键 = id 字典序（'detect' < 'resolve'），输入序 [resolve, detect] 也得 [detect, resolve]。
    expect(quietOrder([resolve, detect])).toEqual(['detect', 'resolve']);
    expect(quietOrder([detect, resolve])).toEqual(['detect', 'resolve']);
  });

  it('阶段内仍按组件拓扑排序', () => {
    const accel = sys('accel', ['Velocity'], ['Velocity']);
    const motion = sys('motion', ['Velocity'], ['Transform']);
    const order = topologicalSort([motion, accel]).map((s) => s.id);
    expect(order.indexOf('accel')).toBeLessThan(order.indexOf('motion'));
  });

  it('阶段内成环由该阶段自己裁决（phase 不掩盖环，也不跨阶段串味）', () => {
    const a = sys('a', ['X'], ['Y'], SystemPhase.Resolve);
    const b = sys('b', ['Y'], ['X'], SystemPhase.Resolve);
    const c = sys('c', [], [], SystemPhase.Update);
    // Update 桶正常排在前；Resolve 桶内的纯推断环按平局键裁决。
    expect(quietOrder([a, b, c])).toEqual(['c', 'a', 'b']);
  });
});

describe('topologicalSort — 显式定序 runsAfter/runsBefore（R10）', () => {
  it('runsAfter 强制顺序（无组件依赖也能定序）', () => {
    const a = { id: 'a', reads: [], writes: [], consumes: [], execute: noop };
    const b = { id: 'b', reads: [], writes: [], consumes: [], runsAfter: ['a'], execute: noop };
    expect(order([b, a])).toEqual(['a', 'b']);
  });

  it('runsBefore 强制顺序', () => {
    const a = { id: 'a', reads: [], writes: [], consumes: [], runsBefore: ['b'], execute: noop };
    const b = { id: 'b', reads: [], writes: [], consumes: [], execute: noop };
    expect(order([b, a])).toEqual(['a', 'b']);
  });

  it('两系统都 RMW 同组件：声明 runsBefore 即打破伪环并定序', () => {
    // dialogue-runner 与 state-sync 都读改写 State：组件图互为前驱 → 本会成环。
    const runner = { id: 'dialogue-runner', reads: ['State'], writes: ['State'], consumes: [], runsBefore: ['state-sync'], execute: noop };
    const sync = { id: 'state-sync', reads: ['State'], writes: ['State'], consumes: [], execute: noop };
    expect(order([sync, runner])).toEqual(['dialogue-runner', 'state-sync']);
  });

  it('用 runsAfter 表达同一意图，结果一致', () => {
    const runner = { id: 'dialogue-runner', reads: ['State'], writes: ['State'], consumes: [], execute: noop };
    const sync = { id: 'state-sync', reads: ['State'], writes: ['State'], consumes: [], runsAfter: ['dialogue-runner'], execute: noop };
    expect(order([sync, runner])).toEqual(['dialogue-runner', 'state-sync']);
  });

  it('显式边互相矛盾仍判成环（不掩盖真冲突）', () => {
    const a = { id: 'a', reads: [], writes: [], consumes: [], runsBefore: ['b'], execute: noop };
    const b = { id: 'b', reads: [], writes: [], consumes: [], runsBefore: ['a'], execute: noop };
    expect(() => topologicalSort([a, b])).toThrow(/Circular/);
  });

  it('引用不在本 phase 的 id 被忽略（跨 phase 由 phase 号定序）', () => {
    const a = sys('a', [], [], SystemPhase.Update);
    const b = { id: 'b', reads: [], writes: [], consumes: [], phase: SystemPhase.Resolve, runsAfter: ['a'], execute: noop };
    // a 在 Update、b 在 Resolve → 仍是 a 在前；runsAfter 跨 phase 引用不报错。
    expect(order([b, a])).toEqual(['a', 'b']);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  REQ-CYCLEHAZ 方案 B —— 纯推断环的确定性平局裁决（止血安全网）
//
//  契约（钉死·改实现必须同步改这里的理由，不许只改期望值）：
//   · 显式 runsAfter/runsBefore = 硬约束，绝不被裁决推翻；**申报边自成环 = 申报自相矛盾 → 照旧抛**。
//   · 环由组件推断边闭合 → 砍环内推断边、保留环内显式边，按「平局键升序且服从显式边」定环内全序。
//   · 平局键 = **系统 id 字典序**（P2d·engine-architecture-review-2026-09-02 D2b）——与输入数组下标 / 注册序 /
//     manifest capabilities 列序 / JSON 键序全部无关：两端列序不同也得同一执行序。
//   · 裁决结果参与全图传播：环外下游仍排在**整个环**之后。
// ══════════════════════════════════════════════════════════════════════════
describe('topologicalSort — 纯推断环平局裁决（REQ-CYCLEHAZ B）', () => {
  const rmw = (id: string, comp: string): SystemDeclaration => sys(id, [comp], [comp]);

  it('① 2-环（都 RMW 同组件）装得进，且两次排序同序', () => {
    const input = [rmw('timeline', 'Resource'), rmw('resource-apply', 'Resource')];
    const a = quietOrder(input);
    const b = quietOrder([...input]);
    expect(a).toEqual(['resource-apply', 'timeline']); // id 字典序
    expect(b).toEqual(a); // 确定性：同一世界每次装载同序（录放一致）
  });

  it('② 3-环（含一条正确的显式边·event-when→timeline→resource-apply 同构）装得进且显式边被服从', () => {
    // event-when 写 Signal / 读 Resource；timeline runsAfter event-when，且与 resource-apply RMW Resource。
    const eventWhen: SystemDeclaration = { id: 'event-when', reads: ['Resource'], writes: ['Signal'], consumes: [], execute: noop };
    const timeline: SystemDeclaration = { id: 'timeline', reads: ['Signal', 'Resource'], writes: ['Resource'], consumes: [], runsAfter: ['event-when'], execute: noop };
    const resourceApply = rmw('resource-apply', 'Resource');
    const got = quietOrder([eventWhen, timeline, resourceApply]);
    expect(got).toEqual(['event-when', 'resource-apply', 'timeline']); // 显式边 event-when→timeline 服从·其余按 id 字典序
    // 硬约束不被推翻：无论输入序怎么打乱，event-when 恒在 timeline 之前。
    const shuffled = quietOrder([resourceApply, timeline, eventWhen]);
    expect(shuffled.indexOf('event-when')).toBeLessThan(shuffled.indexOf('timeline'));
  });

  it('③ 申报边自成环仍抛（互指 runsBefore）', () => {
    const a = { id: 'a', reads: [], writes: [], consumes: [], runsBefore: ['b'], execute: noop };
    const b = { id: 'b', reads: [], writes: [], consumes: [], runsBefore: ['a'], execute: noop };
    expect(() => topologicalSort([a, b])).toThrow(/Circular/);
    expect(() => topologicalSort([a, b])).toThrow(/申报自相矛盾/);
  });

  it('③b 申报边自成环（三元 runsBefore/runsAfter 混合）仍抛 · 即便同时有推断边可砍', () => {
    const a = { id: 'a', reads: ['X'], writes: ['X'], consumes: [], runsBefore: ['b'], execute: noop };
    const b = { id: 'b', reads: ['X'], writes: ['X'], consumes: [], runsBefore: ['c'], execute: noop };
    const c = { id: 'c', reads: ['X'], writes: ['X'], consumes: [], runsBefore: ['a'], execute: noop };
    expect(() => topologicalSort([a, b, c])).toThrow(/Circular/);
    // 断到具体判词：必须是「申报自相矛盾」这条判定拦下的，不是兜底网兜住的
    // （兜底网也含 Circular 字样 → 只断 /Circular/ 会给假绿·假信心自查实测过）。
    expect(() => topologicalSort([a, b, c])).toThrow(/申报自相矛盾/);
  });

  it('④ 裁决顺序 = 平局键（id 字典序）· 反序装载**不**改变裁决（P2d：执行序不再是游戏数据）', () => {
    const t = rmw('timeline', 'Resource');
    const r = rmw('resource-apply', 'Resource');
    expect(quietOrder([r, t])).toEqual(['resource-apply', 'timeline']);
    expect(quietOrder([t, r])).toEqual(['resource-apply', 'timeline']); // 反序装载同序：两端 manifest 列序不同也不分叉
  });

  it('④b 无边的独立系统也按 id 字典序（最小字典序拓扑序）·与注册序无关', () => {
    const a = sys('alpha', ['A'], []);
    const z = sys('zulu', ['Z'], []);
    const m = sys('mid', ['M'], []);
    expect(order([z, m, a])).toEqual(['alpha', 'mid', 'zulu']);
    expect(order([a, z, m])).toEqual(['alpha', 'mid', 'zulu']);
  });

  it('softCycle:"throw"（严格模式）：软环即抛并点名；缺省 warn 照旧裁决', () => {
    const t = rmw('timeline', 'Resource');
    const r = rmw('resource-apply', 'Resource');
    expect(() => topologicalSort([t, r], { softCycle: 'throw' })).toThrow(/严格模式：软环即错/);
    expect(quietOrder([t, r])).toEqual(['resource-apply', 'timeline']);
  });

  it('⑤ console.warn 留痕：点名环成员 + 闭环组件 + 裁决顺序 + 显式申报可覆盖', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    order([rmw('timeline', 'Resource'), rmw('resource-apply', 'Resource')]);
    expect(spy).toHaveBeenCalledTimes(1);
    const msg = String(spy.mock.calls[0][0]);
    expect(msg).toContain('timeline');
    expect(msg).toContain('resource-apply');
    expect(msg).toContain('Resource'); // 闭环组件点名
    expect(msg).toContain('resource-apply → timeline'); // 裁决顺序（id 字典序）
    expect(msg).toMatch(/runsAfter\/runsBefore/); // 「显式申报可覆盖」提示
    expect(msg).toContain('REQ-CYCLEHAZ');
  });

  it('裁决参与全图传播：环外下游排在**整个环**之后（不是砍一条边了事）', () => {
    const a = rmw('a', 'X');
    const b = rmw('b', 'X');
    const down = sys('down', ['X'], ['Y']); // 读 X → 两个环成员都是它的前驱
    const tail = sys('tail', ['Y'], []); // 再下游
    const got = quietOrder([down, tail, a, b]);
    expect(got.indexOf('a')).toBeLessThan(got.indexOf('down'));
    expect(got.indexOf('b')).toBeLessThan(got.indexOf('down'));
    expect(got.indexOf('down')).toBeLessThan(got.indexOf('tail'));
    expect(got).toHaveLength(4); // 一个系统都不许丢
  });

  it('N-环（三系统链式互锁）整环按平局键定序 · 上游仍在前', () => {
    // a 写 P·b 读 P 写 Q·c 读 Q 写 P → b、c、a 互相闭环；up 只写 P 的上游、无人写它读的组件。
    const up = sys('up', [], ['Seed']);
    const a = sys('a', ['Seed', 'R'], ['P']);
    const b = sys('b', ['P'], ['Q']);
    const c = sys('c', ['Q'], ['R']);
    const got = quietOrder([up, a, b, c]);
    expect(got).toEqual(['up', 'a', 'b', 'c']);
  });

  it('多个独立环各自裁决 · 互不串味', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const input = [rmw('a1', 'X'), rmw('a2', 'X'), rmw('b1', 'Y'), rmw('b2', 'Y')];
    const got = order(input);
    // 两个环各自按平局键定内部相对序（环之间无边 → 由 Kahn 的 FIFO 交错，属既有稳定行为）。
    expect(got.indexOf('a1')).toBeLessThan(got.indexOf('a2'));
    expect(got.indexOf('b1')).toBeLessThan(got.indexOf('b2'));
    expect([...got].sort()).toEqual(['a1', 'a2', 'b1', 'b2']);
    expect(order([...input])).toEqual(got); // 确定性
    expect(spy).toHaveBeenCalledTimes(4); // 两次排序 × 两个环，各留一条痕
    spy.mockRestore();
  });

  it('无环时零 warn（快车道行为逐位不变）', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(order([sys('consumer', ['X'], []), sys('producer', [], ['X'])])).toEqual(['producer', 'consumer']);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
