// ═══════════════════════════════════════════════════════════════
//  dice —— 骰能力族的**确定性纯函数核**（REQ-GAMED；非 capability，先例见 hex.ts）。
//
//  「骰池/骰面/对掷策略 = 数据；掷骰/锁定/禁骰/对掷比大小 = 引擎确定性算法」（宪法对齐）。本模块只含
//  **确定性纯函数**（消费 RandomSeed 整数 PRNG，绝不 Math.random）：
//    · rollDicePool —— 按锁定掩码掷骰池（未锁位掷新、锁定位保留上次结果）。dice-roll 系统的算法核。
//    · applyBanFilter —— 结算前禁骰（禁最高/最低 n 颗，标 banned 不移出）。同上。
//    · opposedRoll —— 对掷判定：双方各掷 [1,战力] 比大小，平局按 tiePolicy 数据决定（game-g 对掷下沉）。
//  确定性（lockstep/录放安全）：同一 RandomSeed 状态 → 同一序列；禁骰同值按下标升序 tie-break、
//  对掷平局按固定 tiePolicy 阶梯 → 结果唯一确定，不依赖遍历序/浮点超越函数。
// ═══════════════════════════════════════════════════════════════
import type { RandomSeed, DieSpec, RolledDie } from '@engine/protocol/components.js';
import { nextRandom, randomInt } from '@atom-skills/index.js';

// ── 掷骰池（锁定重掷）─────────────────────────────────────────────
// 按下标逐颗掷：locked 含该下标且 prev 有对应结果 → 保留上次（清 banned，禁骰在 applyBanFilter 重算）；
// 否则在 [0, faces.length) 内确定性取一面（消费 rng、推进序列）。返回与 dice 等长、下标对齐的结果数组。
// 纯函数（除推进 rng 状态外无副作用）：同 rng 状态 + 同 dice/locked/prev → 同结果。
export function rollDicePool(
  dice: readonly DieSpec[],
  locked: ReadonlySet<number>,
  prev: readonly RolledDie[] | undefined,
  rng: RandomSeed,
): RolledDie[] {
  const out: RolledDie[] = [];
  for (let i = 0; i < dice.length; i++) {
    const die = dice[i];
    const keep = locked.has(i) ? prev?.[i] : undefined;
    if (keep) {
      // 锁定位：保留上次点数/元素/面下标；banned 由后续 applyBanFilter 在全量结果上重算（先清）。
      out.push({ value: keep.value, element: keep.element, faceIndex: keep.faceIndex });
      continue;
    }
    const n = die.faces.length;
    if (n === 0) { out.push({ value: 0, faceIndex: -1 }); continue; } // 空骰（退化）：点数 0、面下标 -1，仍推进不了 rng（无面可掷）
    const faceIndex = randomInt(rng, 0, n); // 均匀取一面（推进 rng 一次）
    const face = die.faces[faceIndex];
    out.push(face.element === undefined ? { value: face.value, faceIndex } : { value: face.value, element: face.element, faceIndex });
  }
  return out;
}

// ── 结算前禁骰 ───────────────────────────────────────────────────
// 把最高/最低的 n 颗标 banned=true（不移出，保下标对齐）。先清全体 banned，再选取。
// 同值按下标升序 tie-break（确定性）。n≤0 → 全不禁（no-op）；n≥results 数 → 全禁。
export function applyBanFilter(results: RolledDie[], ban: { kind: 'banHighest' | 'banLowest'; n: number } | undefined): void {
  for (const r of results) r.banned = false;
  if (!ban || ban.n <= 0 || results.length === 0) return;
  const n = Math.min(ban.n, results.length);
  const order = results
    .map((r, i) => ({ v: r.value, i }))
    .sort((a, b) => (ban.kind === 'banHighest' ? b.v - a.v || a.i - b.i : a.v - b.v || a.i - b.i));
  for (let k = 0; k < n; k++) results[order[k].i].banned = true;
}

// ── 对掷判定（game-g 战力对掷下沉）───────────────────────────────
export type TiePolicy = 'rollerWins' | 'defenderWins' | 'reroll';
export interface OpposedResult {
  winner: 'A' | 'B'; // A=掷者(roller/pA)、B=守方(defender/pB)
  rollA: number; // A 掷出的点数（最终决胜那次；reroll 时为最后一次）
  rollB: number;
  rerolls: number; // 平局重掷次数（tiePolicy='reroll' 时>0；其余恒 0）
}
// reroll 安全阀：极端(pA=pB=1)时永远平局 → 上限次重掷后按 rollerWins 终结（确定、不死循环）。
export const OPPOSED_MAX_REROLL = 64;

// 双方各在 [1, max(1,round(power))] 内掷一整数、大者胜；平局按 tiePolicy：
//   'rollerWins'=掷者(A)胜、'defenderWins'=守方(B)胜、'reroll'=双方重掷直到分出（上限见 OPPOSED_MAX_REROLL）。
// 消费 rng（每掷一次推进一次；reroll 每轮推进两次）→ 确定/录放安全。
export function opposedRoll(rng: RandomSeed, pA: number, pB: number, tiePolicy: TiePolicy = 'rollerWins'): OpposedResult {
  const A = Math.max(1, Math.round(pA));
  const B = Math.max(1, Math.round(pB));
  let rerolls = 0;
  for (;;) {
    const rollA = 1 + Math.floor(nextRandom(rng) * A);
    const rollB = 1 + Math.floor(nextRandom(rng) * B);
    if (rollA > rollB) return { winner: 'A', rollA, rollB, rerolls };
    if (rollB > rollA) return { winner: 'B', rollA, rollB, rerolls };
    // 平局：
    if (tiePolicy === 'rollerWins') return { winner: 'A', rollA, rollB, rerolls };
    if (tiePolicy === 'defenderWins') return { winner: 'B', rollA, rollB, rerolls };
    rerolls += 1;
    if (rerolls > OPPOSED_MAX_REROLL) return { winner: 'A', rollA, rollB, rerolls }; // 安全阀：终结于掷者胜
  }
}

// ── 改掷层（game-g `clash-resolve.ts` 的 RollMods/rollWithMods/rollDist/rollWinProbMods 下沉通用化）──
// 「改掷修饰 = 数据（RollMods）；实掷/精确分布/胜率 = 引擎确定性算法」。全部纯函数、只消费 `nextRandom`。
//
// 语义（单颗 `sides` 面骰·S = max(1,round(sides))）：
//   · floor       —— 掷值下界抬 N：单次抽样落在 [lo,S]，lo = min(S, 1+floor)（越过 S 则退化恒 S）。
//   · rerollBelow —— 首抽 < rerollBelow 时**重抽一次并采用新值**（只作用于每个样本的首抽·爆骰续抽不重抽）。
//   · explodeOn   —— 抽值 ≥ explodeOn 时再抽一次（同区间 [lo,S]）累加，续抽仍 ≥ explodeOn 则继续，
//                    **最多 EXPLODE_CAP=8 次爆骰**（第 8 次爆骰的抽值照加、但不再触发第 9 次）。
//                    explodeOn=S 即「掷出最大面爆骰」；≤0/undefined = 关闭。
//   · twice / advantage —— 多抽样本取最高；disadvantage —— 多抽样本取最低。三者合成
//                    extra = twice + advantage − disadvantage：extra>0 → 1+extra 个样本取最高；
//                    extra<0 → 1+|extra| 个样本取最低；=0 → 单样本（优/劣势对消·D&D 惯例）。
//   · bonus       —— 最后加到选中样本上（允许负=减值）。
//
// ⚖ 确定性 / rng 消费规则（lockstep·录放安全）：
//   样本数 = 1+|extra|，**纯由 mods 决定**；每个样本消费 nextRandom：
//     1（首抽）+ [1 当且仅当 rerollBelow>0 且首抽 < rerollBelow] + e（爆骰次数·e ≤ 8·每次 1 抽）。
//   除 rerollBelow/explodeOn 这两项**固有**的数据依赖外，消费次数是 mods 的纯函数（无数据相关早退）。
//   mods 全零（NO_ROLL_MODS）时严格等于 `1 + floor(nextRandom(rng) * S)`（与 opposedRoll 每方一掷逐字节一致）。
//   无 Math.pow/随机/超越函数：整数幂用 ipow 循环（zerocraft/no-transcendental 围栏）。
export interface RollMods {
  bonus: number; // 掷后加值（可负）
  floor: number; // 下界抬升 N（掷 [1+N,S]）
  twice: number; // 额外抽样本数·取最高（灌铅骰）
  advantage?: number; // 额外抽样本数·取最高（与 twice 同向叠加）
  disadvantage?: number; // 额外抽样本数·取最低（与 twice/advantage 对消）
  rerollBelow?: number; // 首抽 < 此值 → 重抽一次采用新值（0/undefined 关）
  explodeOn?: number; // 抽值 ≥ 此值 → 再抽累加（上限 EXPLODE_CAP 次；0/undefined 关）
}
export const NO_ROLL_MODS: RollMods = { bonus: 0, floor: 0, twice: 0 };
export const EXPLODE_CAP = 8;

interface RollPlan { S: number; lo: number; n: number; samples: number; pickMin: boolean; reroll: number; explode: number; bonus: number }
const nz = (x: number | undefined): number => Math.max(0, Math.trunc(x ?? 0)); // 非负整数化（NaN→NaN 由调用方保证不传）

function planRoll(sides: number, m: RollMods): RollPlan {
  const S = Math.max(1, Math.round(sides));
  const lo = Math.min(S, 1 + nz(m.floor));
  const extra = nz(m.twice) + nz(m.advantage) - nz(m.disadvantage);
  return {
    S, lo, n: S - lo + 1,
    samples: 1 + (extra < 0 ? -extra : extra), pickMin: extra < 0,
    reroll: nz(m.rerollBelow), explode: nz(m.explodeOn),
    bonus: Math.trunc(m.bonus),
  };
}

// 整数幂（循环乘·不用 Math.pow）：k≥0。
function ipow(x: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r *= x;
  return r;
}

// 单个样本：首抽 → [重抽] → [爆骰链]。消费次数见文件头规则。
function drawSample(rng: RandomSeed, p: RollPlan): number {
  let v = p.lo + Math.floor(nextRandom(rng) * p.n);
  if (p.reroll > 0 && v < p.reroll) v = p.lo + Math.floor(nextRandom(rng) * p.n); // 重抽一次·采用新值
  let total = v;
  if (p.explode > 0) {
    let last = v;
    for (let e = 0; e < EXPLODE_CAP && last >= p.explode; e++) {
      last = p.lo + Math.floor(nextRandom(rng) * p.n);
      total += last;
    }
  }
  return total;
}

// 改掷实掷：1+|extra| 个样本取最高/最低 + bonus。同 rng 状态 + 同 mods → 同结果。
export function rollWithMods(sides: number, rng: RandomSeed, mods: RollMods): number {
  const p = planRoll(sides, mods);
  let best = 0;
  for (let i = 0; i < p.samples; i++) {
    const v = drawSample(rng, p);
    if (i === 0 || (p.pickMin ? v < best : v > best)) best = v;
  }
  return best + p.bonus;
}

const addMass = (map: Map<number, number>, k: number, p: number): void => { map.set(k, (map.get(k) ?? 0) + p); };
const sortedKeys = (map: ReadonlyMap<number, number>): number[] => [...map.keys()].sort((a, b) => a - b);

// 改掷后掷值的**精确**概率分布（key=掷值·value=概率）——精确对象是 rollWithMods 实际实现的过程：
//   bonus/floor/twice/advantage/disadvantage/rerollBelow 均为闭式精确；explodeOn 按 EXPLODE_CAP=8 截断
//   （与实掷同一上限 → 对实掷过程精确；相对「无限爆骰」的理论分布则截断于第 8 层）。
// 零 mods → 每面恰 1/S（不经 CDF 变换·无浮点误差）。求和/遍历一律按 key 升序 → 浮点结果确定。
export function rollDist(sides: number, mods: RollMods): Map<number, number> {
  const p = planRoll(sides, mods);
  // 1) 首抽 + 重抽：P(v) = (1[v≥R] + q)/n，q = P(首抽<R) = #{u∈[lo,S]: u<R}/n。
  let q = 0;
  if (p.reroll > 0) { let c = 0; for (let u = p.lo; u <= p.S; u++) if (u < p.reroll) c++; q = c / p.n; }
  const baseP = (u: number): number => (p.reroll > 0 ? ((u >= p.reroll ? 1 : 0) + q) / p.n : 1 / p.n);
  // 2) 爆骰链 DP：pending = 「和为 s 且仍在爆」的质量；每层对 [lo,S] 续抽一次，第 EXPLODE_CAP 层后全部落定。
  const single = new Map<number, number>();
  let pending = new Map<number, number>();
  for (let u = p.lo; u <= p.S; u++) {
    const pu = baseP(u);
    if (p.explode > 0 && u >= p.explode) addMass(pending, u, pu); else addMass(single, u, pu);
  }
  for (let level = 1; level <= EXPLODE_CAP && pending.size > 0; level++) {
    const next = new Map<number, number>();
    for (const s of sortedKeys(pending)) {
      const m = (pending.get(s) ?? 0) / p.n;
      for (let u = p.lo; u <= p.S; u++) {
        if (level < EXPLODE_CAP && u >= p.explode) addMass(next, s + u, m); else addMass(single, s + u, m);
      }
    }
    pending = next;
  }
  // 3) 多样本取最高/最低：P(max=v) = F(v)^k − F(v−1)^k；P(min=v) = (1−F(v−1))^k − (1−F(v))^k。
  const out = new Map<number, number>();
  const keys = sortedKeys(single);
  if (p.samples === 1) {
    for (const v of keys) out.set(v + p.bonus, single.get(v) ?? 0);
    return out;
  }
  let F = 0; // 累积分布 F(v−1)
  for (const v of keys) {
    const Fv = F + (single.get(v) ?? 0);
    const pv = p.pickMin ? ipow(1 - F, p.samples) - ipow(1 - Fv, p.samples) : ipow(Fv, p.samples) - ipow(F, p.samples);
    out.set(v + p.bonus, pv < 0 ? 0 : pv); // 浮点负零保护
    F = Fv;
  }
  return out;
}

// 两分布独立对掷 → P(a>b) / P(a==b)（离散精确·供预报/EV·非 100/0）。按 key 升序双重求和 → 结果确定。
export function winProb(distA: ReadonlyMap<number, number>, distB: ReadonlyMap<number, number>): { pGreater: number; pEqual: number } {
  let g = 0, e = 0;
  const kb = sortedKeys(distB);
  for (const av of sortedKeys(distA)) {
    const pa = distA.get(av) ?? 0;
    for (const bv of kb) {
      const pb = distB.get(bv) ?? 0;
      if (av > bv) g += pa * pb; else if (av === bv) e += pa * pb;
    }
  }
  return { pGreater: g, pEqual: e };
}

// 分布期望 Σ v·p（按 key 升序求和 → 确定）。
export function expectedValue(dist: ReadonlyMap<number, number>): number {
  let ev = 0;
  for (const v of sortedKeys(dist)) ev += v * (dist.get(v) ?? 0);
  return ev;
}
