// ═══════════════════════════════════════════════════════════════
//  engine/math/tick —— 整数拍计时步进（engine-base-tier-review-2026-09-06 §3.2 B-5 的第一步）。
//  Timer 原子的语义（elapsed += 1；到 duration 触发；loop 则归零，否则停在 duration）被 7 个能力各自重写
//  （tween / anim-state / grid-move / over-time / pathfind / flow / match3-board）。这里给唯一的一份；
//  timer-advance 本体改调它（逐字同值）。别的能力是否迁移看各自语义是否真相同（不强迁）。
// ═══════════════════════════════════════════════════════════════

export interface TickTimer {
  elapsed: number;
  duration: number;
  loop?: boolean;
}

/**
 * 推进一拍。返回 true = 本拍到点（触发一次）。非 loop 且已到点 → 不再推进、返回 false（停表）。
 * loop 到点后 elapsed 归零。与 atoms/timer 的 timer-advance 逐字同语义。
 */
export function advanceTimer(t: TickTimer): boolean {
  if (!t.loop && t.elapsed >= t.duration) return false;
  t.elapsed += 1;
  if (t.elapsed >= t.duration) {
    if (t.loop) t.elapsed = 0;
    return true;
  }
  return false;
}

/** 周期触发：每 period 拍返回 true 一次（elapsed 自增·period ≤ 0 → 永不）。over-time 类「每 N 拍一跳」的共同形。 */
export function everyN(t: { elapsed: number }, period: number): boolean {
  t.elapsed += 1;
  return period > 0 && t.elapsed % period === 0;
}

/** 剩余拍数（≥0）。 */
export function remaining(t: TickTimer): number {
  const r = t.duration - t.elapsed;
  return r < 0 ? 0 : r;
}

/** 进度 [0,1]（duration ≤ 0 → 1）。 */
export function progress(t: TickTimer): number {
  if (t.duration <= 0) return 1;
  const p = t.elapsed / t.duration;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
