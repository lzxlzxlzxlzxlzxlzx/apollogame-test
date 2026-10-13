export type MotionMode = 'standard' | 'reduced';
export const TICK_RATE = 60;
export const msToTicks = (ms: number): number => Math.round(ms * TICK_RATE / 1000);
export const STAGE_MS = Object.freeze({
  standard: Object.freeze({ p2: 2000, p3: 1050, p4Card: 950, p5Base: 1200, p5Stagger: 120 }),
  reduced: Object.freeze({ p2: 800, p3: 280, p4Card: 300, p5Base: 760, p5Stagger: 70 }),
});
export function stageTicks(mode: MotionMode, count: number): Readonly<{ p2: number; p3: number; p4Card: number; p5: number; total: number }> {
  if (!Number.isInteger(count) || count < 1 || count > 5) throw new RangeError('Expected 1–5 cards.');
  const ms = STAGE_MS[mode];
  const p2 = msToTicks(ms.p2), p3 = msToTicks(ms.p3), p4Card = msToTicks(ms.p4Card);
  const p5 = msToTicks(ms.p5Base + (count - 1) * ms.p5Stagger);
  return Object.freeze({ p2, p3, p4Card, p5, total: p2 + p3 + count * p4Card + p5 });
}
export const FINAL_LAYOUT = Object.freeze({
  1: Object.freeze({ width: 300, height: 450, x: [720] as const }),
  2: Object.freeze({ width: 270, height: 405, x: [550, 890] as const }),
  3: Object.freeze({ width: 240, height: 360, x: [430, 720, 1010] as const }),
  4: Object.freeze({ width: 220, height: 330, x: [330, 590, 850, 1110] as const }),
  5: Object.freeze({ width: 200, height: 300, x: [260, 490, 720, 950, 1180] as const }),
});
export function finalLayout(count: number): (typeof FINAL_LAYOUT)[keyof typeof FINAL_LAYOUT] {
  if (!Number.isInteger(count) || count < 1 || count > 5) throw new RangeError('Expected 1–5 cards.');
  return FINAL_LAYOUT[count as keyof typeof FINAL_LAYOUT];
}
