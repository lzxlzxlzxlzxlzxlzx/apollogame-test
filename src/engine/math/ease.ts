// ═══════════════════════════════════════════════════════════════
//  engine/math/ease —— 缓动曲线（多项式·零 trig 零 pow）。此前只活在 tier1/tween.ts 的私有 switch 里；
//  抽出来让 UI 动效 / 镜头 / 表现层同一套曲线，tween 改为薄包装（函数体逐字同 → 零行为变化）。
// ═══════════════════════════════════════════════════════════════

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export const EASINGS: readonly Easing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut'];

export function easeLinear(x: number): number { return x; }
export function easeIn(x: number): number { return x * x; }
export function easeOut(x: number): number { return x * (2 - x); }
export function easeInOut(x: number): number { return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) * (-2 * x + 2)) / 2; }

/** 按名字取曲线值（tween.easing 的运行时入口·未知名按 linear）。 */
export function ease(kind: Easing | string, x: number): number {
  switch (kind) {
    case 'easeIn': return easeIn(x);
    case 'easeOut': return easeOut(x);
    case 'easeInOut': return easeInOut(x);
    default: return x;
  }
}

/** 三次 Hermite 平滑（同 scalar.smoothstep·不钳）。 */
export function easeSmooth(x: number): number { return x * x * (3 - 2 * x); }

/** 弹回（回弹过冲·多项式 s=1.70158·常用于 UI 弹出）。 */
export function easeOutBack(x: number): number {
  const s = 1.70158;
  const y = x - 1;
  return y * y * ((s + 1) * y + s) + 1;
}
