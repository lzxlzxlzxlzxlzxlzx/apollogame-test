import { describe, it, expect } from 'vitest';
import type { RandomSeed, DieSpec, RolledDie } from '@engine/protocol/components.js';
import { rollDicePool, applyBanFilter, opposedRoll, OPPOSED_MAX_REROLL, rollWithMods, rollDist, winProb, expectedValue, NO_ROLL_MODS, EXPLODE_CAP, type RollMods } from './dice.js';

// 骰能力族纯函数测试（对齐 skills 1:1 测试文化）。种子化、确定性、无 Math.random。
const seed = (s: number): RandomSeed => ({ type: 'RandomSeed', seed: s, sequence: 0 });
const d6 = (el?: number): DieSpec => ({ faces: [1, 2, 3, 4, 5, 6].map((v) => (el === undefined ? { value: v } : { value: v, element: el })) });

describe('dice.rollDicePool — 掷骰池 / 锁定重掷', () => {
  it('同种子 → 同结果（确定性）', () => {
    const pool = [d6(), d6(), d6()];
    expect(rollDicePool(pool, new Set(), undefined, seed(12345))).toEqual(rollDicePool(pool, new Set(), undefined, seed(12345)));
  });
  it('faceIndex/value 合法、element 透传', () => {
    const a = rollDicePool([d6(3)], new Set(), undefined, seed(7));
    expect(a[0].faceIndex).toBeGreaterThanOrEqual(0);
    expect(a[0].faceIndex).toBeLessThan(6);
    expect(a[0].value).toBe(a[0].faceIndex + 1);
    expect(a[0].element).toBe(3);
  });
  it('锁定位保留、只重掷未锁（rng 仅推进 #未锁）', () => {
    const pool = [d6(), d6(), d6(), d6()];
    const rng = seed(999);
    const r1 = rollDicePool(pool, new Set(), undefined, rng);
    expect(rng.sequence).toBe(4);
    const before = rng.sequence;
    const r2 = rollDicePool(pool, new Set([0, 2]), r1, rng);
    expect(rng.sequence - before).toBe(2); // 仅下标 1、3 重掷
    expect(r2[0].value).toBe(r1[0].value);
    expect(r2[0].faceIndex).toBe(r1[0].faceIndex);
    expect(r2[2].value).toBe(r1[2].value);
    expect(r2[2].faceIndex).toBe(r1[2].faceIndex);
  });
  it('锁定下标但无前值（首掷）→ 照常掷', () => {
    const rng = seed(3);
    const r = rollDicePool([d6(), d6()], new Set([0, 1]), undefined, rng);
    expect(r).toHaveLength(2);
    expect(rng.sequence).toBe(2); // 两颗都掷了（无前值可保留）
  });
});

describe('dice.applyBanFilter — 结算前禁骰边界', () => {
  const mk = (vals: number[]): RolledDie[] => vals.map((v, i) => ({ value: v, faceIndex: i }));
  it('banHighest n=2 → 最高两颗 banned（保留在 results）', () => {
    const r = mk([3, 1, 5, 2]);
    applyBanFilter(r, { kind: 'banHighest', n: 2 });
    expect(r.map((x) => !!x.banned)).toEqual([true, false, true, false]);
    expect(r).toHaveLength(4);
  });
  it('banLowest n=2 → 最低两颗 banned', () => {
    const r = mk([3, 1, 5, 2]);
    applyBanFilter(r, { kind: 'banLowest', n: 2 });
    expect(r.map((x) => !!x.banned)).toEqual([false, true, false, true]);
  });
  it('n=0 → 全不禁', () => {
    const r = mk([3, 1, 5, 2]);
    applyBanFilter(r, { kind: 'banHighest', n: 0 });
    expect(r.some((x) => x.banned)).toBe(false);
  });
  it('n≥骰数 → 全禁', () => {
    const r = mk([3, 1, 5]);
    applyBanFilter(r, { kind: 'banLowest', n: 9 });
    expect(r.every((x) => x.banned)).toBe(true);
  });
  it('undefined ban → 清空既有 banned（幂等重算）', () => {
    const r = mk([3, 1]);
    r[0].banned = true;
    applyBanFilter(r, undefined);
    expect(r.some((x) => x.banned)).toBe(false);
  });
  it('同值 tie-break 按下标升序', () => {
    const r = mk([4, 4, 2]);
    applyBanFilter(r, { kind: 'banHighest', n: 1 });
    expect(r.map((x) => !!x.banned)).toEqual([true, false, false]);
  });
});

describe('dice.opposedRoll — 对掷平局阶梯', () => {
  it('确定性：同种子同结果', () => {
    expect(opposedRoll(seed(42), 6, 4, 'reroll')).toEqual(opposedRoll(seed(42), 6, 4, 'reroll'));
  });
  it('rollerWins：强制平局(1v1) → A 胜、rerolls 0', () => {
    expect(opposedRoll(seed(1), 1, 1, 'rollerWins')).toEqual({ winner: 'A', rollA: 1, rollB: 1, rerolls: 0 });
  });
  it('defenderWins：强制平局(1v1) → B 胜', () => {
    expect(opposedRoll(seed(1), 1, 1, 'defenderWins').winner).toBe('B');
  });
  it('reroll：强制平局(1v1) → 触安全阀终结于 A（rerolls=上限+1）', () => {
    const r = opposedRoll(seed(1), 1, 1, 'reroll');
    expect(r.winner).toBe('A');
    expect(r.rerolls).toBe(OPPOSED_MAX_REROLL + 1);
  });
  it('reroll：守方 pB=1 恒掷 1 → 掷者必胜且 rollA>rollB', () => {
    const r = opposedRoll(seed(5), 6, 1, 'reroll');
    expect(r.winner).toBe('A');
    expect(r.rollA).toBeGreaterThan(r.rollB);
  });
  it('战力越高地板越高：pA=20 vs pB=1，掷者胜', () => {
    expect(opposedRoll(seed(11), 20, 1, 'rollerWins').winner).toBe('A');
  });
});

// ── 改掷层（RollMods）：确定性 · 零 mods ≡ 裸掷 · 精确分布 vs 蒙特卡洛 · 胜率对称 ──
describe('dice.rollWithMods / rollDist / winProb / expectedValue — 改掷层', () => {
  const nextRandomRef = (s: RandomSeed): number => { // 与 atoms/random 同算法（mulberry32）·测试内独立复现「裸掷」基准
    s.seed = (s.seed + 0x6d2b79f5) | 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    s.sequence = (s.sequence ?? 0) + 1;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const sumP = (d: Map<number, number>): number => [...d.values()].reduce((a, b) => a + b, 0);
  const monteCarlo = (sides: number, m: RollMods, n: number, s: number): Map<number, number> => {
    const rng = seed(s);
    const cnt = new Map<number, number>();
    for (let i = 0; i < n; i++) { const v = rollWithMods(sides, rng, m); cnt.set(v, (cnt.get(v) ?? 0) + 1); }
    const out = new Map<number, number>();
    for (const [k, c] of cnt) out.set(k, c / n);
    return out;
  };
  const assertClose = (exact: Map<number, number>, emp: Map<number, number>, tol: number): void => {
    const keys = new Set([...exact.keys(), ...emp.keys()]);
    for (const k of keys) expect(Math.abs((exact.get(k) ?? 0) - (emp.get(k) ?? 0)), `value ${k}`).toBeLessThanOrEqual(tol);
  };

  it('同种子同 mods → 同结果（确定性）', () => {
    const m: RollMods = { bonus: 2, floor: 1, twice: 1, advantage: 1, rerollBelow: 3, explodeOn: 6 };
    const a: number[] = [], b: number[] = [];
    const ra = seed(777), rb = seed(777);
    for (let i = 0; i < 100; i++) { a.push(rollWithMods(6, ra, m)); b.push(rollWithMods(6, rb, m)); }
    expect(a).toEqual(b);
    expect(ra.sequence).toBe(rb.sequence);
  });
  it('零 mods ≡ 裸掷 1+floor(nextRandom*sides)（逐字节同序列）', () => {
    const r1 = seed(2024), r2 = seed(2024);
    const got: number[] = [], ref: number[] = [];
    for (let i = 0; i < 300; i++) { got.push(rollWithMods(17, r1, NO_ROLL_MODS)); ref.push(1 + Math.floor(nextRandomRef(r2) * 17)); }
    expect(got).toEqual(ref);
    expect(r1.sequence).toBe(300); // 每掷恰消费 1 次
  });
  it('零 mods 分解 ≡ opposedRoll 双方各一掷', () => {
    const o = opposedRoll(seed(99), 12, 7, 'rollerWins');
    const r = seed(99);
    expect(rollWithMods(12, r, NO_ROLL_MODS)).toBe(o.rollA);
    expect(rollWithMods(7, r, NO_ROLL_MODS)).toBe(o.rollB);
  });
  it('rng 消费次数 = mods 的纯函数（twice/advantage/disadvantage 不数据依赖）', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      const r = seed(s);
      rollWithMods(6, r, { bonus: 0, floor: 0, twice: 2 }); expect(r.sequence).toBe(3);
      rollWithMods(6, r, { bonus: 0, floor: 0, twice: 0, advantage: 1 }); expect(r.sequence).toBe(5);
      rollWithMods(6, r, { bonus: 0, floor: 0, twice: 0, disadvantage: 2 }); expect(r.sequence).toBe(8);
      rollWithMods(6, r, { bonus: 0, floor: 0, twice: 1, advantage: 1, disadvantage: 2 }); expect(r.sequence).toBe(9); // 对消 → 单样本
    }
  });
  it('rerollBelow 消费 1 或 2；explodeOn 消费 ≤ 1+EXPLODE_CAP（固有数据依赖·有界）', () => {
    let sawReroll = false, sawExplode = false;
    for (let s = 0; s < 200; s++) {
      const r = seed(s);
      rollWithMods(6, r, { bonus: 0, floor: 0, twice: 0, rerollBelow: 4 });
      expect([1, 2]).toContain(r.sequence);
      if (r.sequence === 2) sawReroll = true;
      const r2 = seed(s);
      const v = rollWithMods(6, r2, { bonus: 0, floor: 0, twice: 0, explodeOn: 6 });
      expect(r2.sequence).toBeGreaterThanOrEqual(1);
      expect(r2.sequence).toBeLessThanOrEqual(1 + EXPLODE_CAP);
      expect(v).toBeGreaterThanOrEqual(r2.sequence * 1 + (r2.sequence - 1) * 5); // 每次爆骰前一抽必为 6
      if (r2.sequence > 1) sawExplode = true;
    }
    expect(sawReroll).toBe(true);
    expect(sawExplode).toBe(true);
  });
  it('explodeOn ≤ lo（每抽必爆）→ 恰消费 1+EXPLODE_CAP 次（上限生效）', () => {
    const r = seed(5);
    rollWithMods(6, r, { bonus: 0, floor: 0, twice: 0, explodeOn: 1 });
    expect(r.sequence).toBe(1 + EXPLODE_CAP);
  });
  it('零 mods 分布 = 均匀 1/sides（精确）', () => {
    const d = rollDist(6, NO_ROLL_MODS);
    expect([...d.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const p of d.values()) expect(p).toBe(1 / 6);
  });
  it('分布求和 = 1（±1e-12）·多组 mods', () => {
    const combos: RollMods[] = [
      NO_ROLL_MODS,
      { bonus: 2, floor: 1, twice: 1 },
      { bonus: 0, floor: 0, twice: 0, advantage: 2 },
      { bonus: -1, floor: 0, twice: 0, disadvantage: 3 },
      { bonus: 0, floor: 0, twice: 0, rerollBelow: 3 },
      { bonus: 0, floor: 0, twice: 0, explodeOn: 6 },
      { bonus: 1, floor: 2, twice: 1, rerollBelow: 4, explodeOn: 8 },
      { bonus: 0, floor: 9, twice: 0, explodeOn: 1 }, // floor 越界退化 + 每抽必爆
    ];
    for (const m of combos) expect(Math.abs(sumP(rollDist(8, m)) - 1), JSON.stringify(m)).toBeLessThan(1e-12);
  });
  it('精确分布 vs 蒙特卡洛 10k（tol 0.03）：bonus+floor+twice', () => {
    const m: RollMods = { bonus: 2, floor: 1, twice: 1 };
    assertClose(rollDist(6, m), monteCarlo(6, m, 10000, 31), 0.03);
  });
  it('精确分布 vs 蒙特卡洛 10k（tol 0.03）：advantage+rerollBelow+explodeOn', () => {
    const m: RollMods = { bonus: 0, floor: 0, twice: 0, advantage: 1, rerollBelow: 3, explodeOn: 6 };
    assertClose(rollDist(6, m), monteCarlo(6, m, 10000, 32), 0.03);
  });
  it('精确分布 vs 蒙特卡洛 10k（tol 0.03）：disadvantage', () => {
    const m: RollMods = { bonus: 0, floor: 0, twice: 0, disadvantage: 2 };
    assertClose(rollDist(8, m), monteCarlo(8, m, 10000, 33), 0.03);
  });
  it('advantage 抬 EV、disadvantage 压 EV、bonus 平移 EV', () => {
    const base = expectedValue(rollDist(20, NO_ROLL_MODS));
    expect(base).toBeCloseTo(10.5, 12);
    expect(expectedValue(rollDist(20, { bonus: 0, floor: 0, twice: 0, advantage: 1 }))).toBeGreaterThan(base);
    expect(expectedValue(rollDist(20, { bonus: 0, floor: 0, twice: 0, disadvantage: 1 }))).toBeLessThan(base);
    expect(expectedValue(rollDist(20, { bonus: 3, floor: 0, twice: 0 }))).toBeCloseTo(base + 3, 12);
    // twice 与 advantage 同向：twice=1 ≡ advantage=1
    expect(expectedValue(rollDist(20, { bonus: 0, floor: 0, twice: 1 }))).toBeCloseTo(expectedValue(rollDist(20, { bonus: 0, floor: 0, twice: 0, advantage: 1 })), 12);
  });
  it('floor 抬最小值（分布 + 实掷）', () => {
    const d = rollDist(6, { bonus: 0, floor: 3, twice: 0 });
    expect(Math.min(...d.keys())).toBe(4);
    const r = seed(8);
    for (let i = 0; i < 200; i++) expect(rollWithMods(6, r, { bonus: 0, floor: 3, twice: 0 })).toBeGreaterThanOrEqual(4);
    // 越过 S → 恒 S
    const d2 = rollDist(6, { bonus: 0, floor: 99, twice: 0 });
    expect([...d2.entries()]).toEqual([[6, 1]]);
  });
  it('rerollBelow 精确分布：d6 reroll<3 → P(1)=P(2)=1/18、P(3..6)=4/18', () => {
    const d = rollDist(6, { bonus: 0, floor: 0, twice: 0, rerollBelow: 3 });
    expect(d.get(1)).toBeCloseTo(1 / 18, 12);
    expect(d.get(2)).toBeCloseTo(1 / 18, 12);
    for (const v of [3, 4, 5, 6]) expect(d.get(v)).toBeCloseTo(4 / 18, 12);
  });
  it('winProb 对称：A>B + B>A + 平 = 1；零 mods 与 game-g rollWinProb 闭式一致', () => {
    const mA: RollMods = { bonus: 1, floor: 0, twice: 1, explodeOn: 9 };
    const mB: RollMods = { bonus: 0, floor: 2, twice: 0, disadvantage: 1, rerollBelow: 2 };
    const dA = rollDist(9, mA), dB = rollDist(12, mB);
    const ab = winProb(dA, dB), ba = winProb(dB, dA);
    expect(ab.pEqual).toBeCloseTo(ba.pEqual, 12);
    expect(ab.pGreater + ba.pGreater + ab.pEqual).toBeCloseTo(1, 12);
    // 闭式：a~U{1..17}, b~U{1..9}
    const a = 17, b = 9;
    let g = 0; for (let x = 1; x <= a; x++) g += Math.min(x - 1, b);
    const w = winProb(rollDist(a, NO_ROLL_MODS), rollDist(b, NO_ROLL_MODS));
    expect(w.pGreater).toBeCloseTo(g / (a * b), 12);
    expect(w.pEqual).toBeCloseTo(Math.min(a, b) / (a * b), 12);
  });
});
