import { describe, it, expect } from 'vitest';
import {
  scoreEntry, recallFrom, decayAmount, decayEntries, normalizeEntry, evictWeakest, sortById,
  DEFAULT_WEIGHTS, type MemoryEntry, type MemoryRules,
} from './memory-core.js';

// memory-core 纯函数核（零 World）：打分 / 排序 / 衰减 / 淘汰 / 归一。
// 这里钉的是「不需要世界就能判对错」的那四件，反例能摆得很干净——
// 壳（memory.ts）那边钉的是「读写世界 + 系统触发」。

const E = (over: Partial<MemoryEntry> & { id: string }): MemoryEntry => ({
  subject: 'player', object: 'npc-a', turn: 0, strength: 50, tags: ['gossip'], source: 'talk:1', ...over,
});
const RULES = (over: Partial<MemoryRules> = {}): MemoryRules => ({
  type: 'MemoryRules', id: 'town', decay: [{ tag: 'gossip', amount: 5 }, { tag: 'trauma', amount: 1 }],
  defaultDecay: 2, forgetBelow: 1, ...over,
});

describe('打分 scoreEntry：全整数', () => {
  it('命中×tagHit + 强度×strength + max(0,窗口-距今)×recency', () => {
    const e = E({ id: 'x', strength: 40, turn: 10 });
    expect(scoreEntry(e, { tags: ['gossip'], now: 12 })).toBe(1 * 100 + 40 + (50 - 2) * 2);
    expect(scoreEntry(e, { tags: ['gossip'], now: 70 })).toBe(140);   // 窗口外 → 时近项截零
    expect(scoreEntry(e, { now: 12 })).toBe(40 + 96);                 // 不给 tags → 不看标签
  });

  it('任何权重组合下结果都是整数（浮点进排序 = 跨端 1 ULP 漂移 → 误报 desync）', () => {
    const e = E({ id: 'x', strength: 37, turn: 3, tags: ['gossip', 'trauma'] });
    for (const w of [{}, { tagHit: 7 }, { strength: 3 }, { recency: 11, recencyWindow: 9 }]) {
      expect(Number.isInteger(scoreEntry(e, { tags: ['gossip', 'trauma'], now: 5, weights: w }))).toBe(true);
    }
  });

  it('缺省权重就是在档那一组（改了要有人知道）', () => {
    expect(DEFAULT_WEIGHTS).toEqual({ tagHit: 100, strength: 1, recency: 2, recencyWindow: 50 });
  });
});

describe('检索 recallFrom：同分全序 + 筛选 + 截断', () => {
  it('分数降序；**同分按 id 升序**，且与入参数组序无关', () => {
    const es = [E({ id: 'zz', strength: 50 }), E({ id: 'aa', strength: 50 }), E({ id: 'mm', strength: 90 })];
    expect(recallFrom(es, { k: 3 }).map((e) => e.id)).toEqual(['mm', 'aa', 'zz']);
    expect(recallFrom([...es].reverse(), { k: 3 }).map((e) => e.id)).toEqual(['mm', 'aa', 'zz']);
  });

  it('全同分（强度/回合/标签都一样）→ 纯按 id 给出全序，没有「看谁先来」的缝', () => {
    const es = ['c', 'a', 'b'].map((id) => E({ id }));
    expect(recallFrom(es, { k: 3 }).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('object / subject 筛选；k 缺省 5；空集不抛', () => {
    const es = [E({ id: 'm1', object: 'npc-a' }), E({ id: 'm2', object: 'npc-b' }), E({ id: 'm3', subject: 'npc-c' })];
    expect(recallFrom(es, { object: 'npc-b' }).map((e) => e.id)).toEqual(['m2']);
    expect(recallFrom(es, { subject: 'npc-c' }).map((e) => e.id)).toEqual(['m3']);
    expect(recallFrom(Array.from({ length: 9 }, (_, i) => E({ id: `e${i}` })))).toHaveLength(5);
    expect(recallFrom([])).toEqual([]);
  });
});

describe('衰减 decayAmount / decayEntries', () => {
  it('命中多标签取**最快**那个；无命中用 defaultDecay；小数速率被 trunc', () => {
    expect(decayAmount(E({ id: 'x', tags: ['gossip', 'trauma'] }), RULES())).toBe(5);
    expect(decayAmount(E({ id: 'x', tags: ['nope'] }), RULES())).toBe(2);
    expect(decayAmount(E({ id: 'x', tags: [] }), RULES({ defaultDecay: undefined }))).toBe(1);
    expect(decayAmount(E({ id: 'x', tags: ['gossip'] }), RULES({ decay: [{ tag: 'gossip', amount: 3.9 }] }))).toBe(3);
  });

  it('就地减强度、钳到 0、低于 forgetBelow 的不再返回；入序即出序', () => {
    const es = [E({ id: 'a', strength: 12, tags: ['gossip'] }), E({ id: 'b', strength: 3, tags: ['gossip'] }), E({ id: 'c', strength: 9, tags: ['trauma'] })];
    const r = decayEntries(es, RULES());
    expect(r.survivors.map((e) => `${e.id}:${e.strength}`)).toEqual(['a:7', 'c:8']);
    expect(r.forgot).toBe(1);
    expect(es[1].strength).toBe(0);                 // 钳到 0，不出现负强度
  });

  it('forgetBelow 缺省 1（降到 0 就忘）；给 0 则 0 也留着', () => {
    expect(decayEntries([E({ id: 'a', strength: 6, tags: ['gossip'] })], RULES({ forgetBelow: undefined })).survivors).toHaveLength(1);   // 6-5=1 ≥ 1 → 留
    expect(decayEntries([E({ id: 'a', strength: 3, tags: ['gossip'] })], RULES({ forgetBelow: undefined })).survivors).toHaveLength(0);   // 3-5→0 < 1 → 忘
    expect(decayEntries([E({ id: 'a', strength: 3, tags: ['gossip'] })], RULES({ forgetBelow: 0 })).survivors).toHaveLength(1);
  });
});

describe('归一 normalizeEntry / 淘汰 evictWeakest / 存序 sortById', () => {
  it('强度与回合号 trunc；负强度归零；tags 是拷贝（不与调用方共享别名）', () => {
    const tags = ['gossip'];
    const n = normalizeEntry(E({ id: 'x', strength: -3.7, turn: 9.9, tags }));
    expect(n.strength).toBe(0);
    expect(n.turn).toBe(9);
    tags.push('mutated');
    expect(n.tags).toEqual(['gossip']);
  });

  it('淘汰：强度降序、同强度 id 升序，留前 max', () => {
    const es = [E({ id: 'b', strength: 10 }), E({ id: 'a', strength: 10 }), E({ id: 'hi', strength: 90 })];
    expect(evictWeakest(es, 2).map((e) => e.id)).toEqual(['hi', 'a']);
    expect(evictWeakest(es, 9).map((e) => e.id)).toEqual(['hi', 'a', 'b']);   // 没超就全留（按强度序返回）
  });

  it('sortById 就地按 id 升序（entries 的唯一合法存序）', () => {
    const es = ['c', 'a', 'b'].map((id) => E({ id }));
    sortById(es);
    expect(es.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
