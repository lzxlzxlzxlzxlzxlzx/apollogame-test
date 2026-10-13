import type { DiscreteCombinationSession } from '@zerocraft/engine/engine/protocol/components.js';

/** Render-only projection: it deliberately exposes a tier, never the exact match count. */
export type LockpickView = Readonly<{
  status: DiscreteCombinationSession['status'];
  values: readonly number[];
  slotCount: number;
  /** Render-only 0..1 progress for the signal lens; no numeric count is displayed. */
  correctProgress: number;
  feedbackTier: 'cold' | 'dim' | 'warm' | 'bright' | 'open';
}>;

export function projectLockpick(session: DiscreteCombinationSession): LockpickView {
  const matchCount = session.matchCount ?? 0;
  const current = session.current ?? [];
  const ratio = matchCount / session.slotCount;
  const feedbackTier = session.status === 'success' ? 'open'
    : ratio === 0 ? 'cold'
      : ratio < 0.34 ? 'dim'
        : ratio < 0.67 ? 'warm' : 'bright';
  return Object.freeze({ status: session.status, values: Object.freeze([...current]), slotCount: session.slotCount, correctProgress: ratio, feedbackTier });
}
