import { describe, it, expect } from 'vitest';
import { planStarts, pairKey, pairMembers } from './rate-limit.js';
import type { Candidate, RateLimitConfig, RateLimitState } from './rate-limit.js';

// rate-limit 纯函数测试（提升自 game211 duel-scheduler 的四条规则）。无 Math.random·无壁钟。
const CFG: RateLimitConfig = { maxConcurrent: 2, gapTicks: 10, maxPerTick: 1 };
const state = (over: Partial<RateLimitState> = {}): RateLimitState => ({
  active: new Map(), lastStartTick: -Infinity, tick: 100, ...over,
});
const pair = (a: string, b: string, priority: number): Candidate => ({ key: pairKey(a, b), priority, uses: [a, b] });

describe('rate-limit.pairKey / pairMembers', () => {
  it('无序对稳定键 + 还原', () => {
    expect(pairKey('r1', 'b2')).toBe('b2|r1');
    expect(pairKey('b2', 'r1')).toBe('b2|r1');
    expect(pairMembers('b2|r1')).toEqual(['b2', 'r1']);
  });
});

describe('rate-limit.planStarts', () => {
  it('① 错峰闸：距上次开始不足 gapTicks → 一个都不开；够了才开', () => {
    const cands = [pair('r1', 'b1', 5)];
    expect(planStarts(state({ lastStartTick: 95, tick: 100 }), cands, CFG)).toEqual([]);
    expect(planStarts(state({ lastStartTick: 90, tick: 100 }), cands, CFG)).toEqual(['b1|r1']);
    expect(planStarts(state({ lastStartTick: 90, tick: 99 }), cands, CFG)).toEqual([]);
  });

  it('② 并发闸：active 已满 → 不开；有空位时只补到上限', () => {
    const cands = [pair('r1', 'b1', 1), pair('r2', 'b2', 2), pair('r3', 'b3', 3)];
    const full = new Map([['x|y', ['x', 'y']], ['u|v', ['u', 'v']]]);
    expect(planStarts(state({ active: full }), cands, CFG)).toEqual([]);
    const one = new Map([['x|y', ['x', 'y']]]);
    expect(planStarts(state({ active: one }), cands, { ...CFG, maxPerTick: 9 })).toEqual(['b1|r1']);
  });

  it('④ 每 tick 上限：并发额度够也只开 maxPerTick 个', () => {
    const cands = [pair('r1', 'b1', 1), pair('r2', 'b2', 2), pair('r3', 'b3', 3)];
    expect(planStarts(state(), cands, { maxConcurrent: 9, gapTicks: 0, maxPerTick: 2 })).toEqual(['b1|r1', 'b2|r2']);
    expect(planStarts(state(), cands, { maxConcurrent: 9, gapTicks: 0, maxPerTick: 1 })).toEqual(['b1|r1']);
  });

  it('③ 资源忙：active 占用的资源本 tick 不可再用；本 tick 刚选中的资源同样不可再用；已 active 的 key 跳过', () => {
    const cfg = { maxConcurrent: 9, gapTicks: 0, maxPerTick: 9 };
    // r1 正被 active 占用 → r1|b1 跳过，b2|r2 可开
    const active = new Map([['r1|z', ['r1', 'z']]]);
    expect(planStarts(state({ active }), [pair('r1', 'b1', 1), pair('r2', 'b2', 2)], cfg)).toEqual(['b2|r2']);
    // 同 tick 内 r1 被第一候选占后，第二候选（也用 r1）跳过，第三可开
    expect(planStarts(state(), [pair('r1', 'b1', 1), pair('r1', 'b2', 2), pair('r3', 'b3', 3)], cfg))
      .toEqual(['b1|r1', 'b3|r3']);
    // 已在 active 的 key 不重复开
    const act2 = new Map([['b1|r1', ['r1', 'b1']]]);
    expect(planStarts(state({ active: act2 }), [pair('r1', 'b1', 1)], cfg)).toEqual([]);
    // uses 为空的候选只吃名额，不受资源忙影响
    expect(planStarts(state({ active }), [{ key: 'fx', priority: 0, uses: [] }], cfg)).toEqual(['fx']);
  });

  it('优先级升序 + key 字典序 tie-break：打乱输入顺序结果不变（确定性）', () => {
    const cfg = { maxConcurrent: 9, gapTicks: 0, maxPerTick: 2 };
    const cands: Candidate[] = [
      { key: 'c', priority: 1, uses: [] },
      { key: 'a', priority: 1, uses: [] },
      { key: 'b', priority: 1, uses: [] },
      { key: 'z', priority: 0.5, uses: [] },
    ];
    const expected = ['z', 'a'];
    expect(planStarts(state(), cands, cfg)).toEqual(expected);
    // 几种固定置换（不用随机）——同集合任何顺序同输出
    const perms = [
      [...cands].reverse(),
      [cands[1], cands[3], cands[0], cands[2]],
      [cands[3], cands[2], cands[1], cands[0]],
      [cands[2], cands[0], cands[3], cands[1]],
    ];
    for (const p of perms) expect(planStarts(state(), p, cfg)).toEqual(expected);
  });

  it('同 key 重复候选只取一次；不改入参', () => {
    const cfg = { maxConcurrent: 9, gapTicks: 0, maxPerTick: 9 };
    const cands = [pair('r1', 'b1', 2), pair('b1', 'r1', 1)];
    const snapshot = JSON.stringify(cands);
    const active = new Map<string, readonly string[]>();
    expect(planStarts(state({ active }), cands, cfg)).toEqual(['b1|r1']);
    expect(JSON.stringify(cands)).toBe(snapshot);
    expect(active.size).toBe(0);
  });
});
