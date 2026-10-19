// ═══════════════════════════════════════════════════════════════
//  engine/math/scalar —— 标量数学（engine-base-tier-review-2026-09-06 §3.2 B-1）
//
//  此前全库没有这一层：clamp 在 tier2/3 里有 1 处具名 + 12 处两种惯用法（`Math.max(lo, Math.min(hi, v))` 与三元），
//  lerp 只在 tween 里内联，sign 在 tilemap 里有一份「0 返回 1」的变体（与 Math.sign 语义分叉）。
//  规矩（sim 面·确定性）：只用 + − × ÷ 比较 与 Math.floor/round/abs/min/max；**不含 sin/cos/hypot/pow/exp**
//  （eslint zerocraft/no-transcendental 围栏）。所有函数纯、无分配、逐位可复现。
//  迁移纪律：替换内联表达式时**运算顺序逐字保持**（浮点不满足结合律·黄金 hash 零变是验收）。
// ═══════════════════════════════════════════════════════════════

/** 钳到 [lo, hi]。NaN 原样透传（与两种旧惯用法同值）。 */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 钳到 [0, 1]。 */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 线性插值 a + (b - a) * t（与 tween 内联式同序）。 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** lerp 的逆：v 在 [a, b] 里的位置（a === b → 0）。 */
export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

/** 把 v 从 [a0, a1] 线性映射到 [b0, b1]（不钳）。 */
export function remap(v: number, a0: number, a1: number, b0: number, b1: number): number {
  return lerp(b0, b1, invLerp(a0, a1, v));
}

/** Hermite 平滑阶跃 3t² − 2t³（t 先钳到 [0,1]）。 */
export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** 三值符号：正 1 · 负 −1 · 0 与 NaN → 0（= Math.sign，显式写出便于围栏 grep）。 */
export function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** 二值符号：正 1 · 负 −1 · **0 → 1**。tilemap 分离方向用的旧变体——零不能没方向，故与 sign 分名不分家。 */
export function signOr1(n: number): number {
  return n < 0 ? -1 : 1;
}

/** 数值比较器（升序·供 sort）。 */
export function cmpNum(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 字符串比较器（升序·按码点·不受 locale 影响——确定性 tie-break 专用；`localeCompare` 禁用于 sim）。 */
export function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 环绕到 [0, n)（负数同样成立·n > 0）。 */
export function wrap(v: number, n: number): number {
  const m = v % n;
  return m < 0 ? m + n : m;
}
