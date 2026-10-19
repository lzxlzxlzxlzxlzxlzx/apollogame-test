/** Deterministic identity for the sole sparse farm state at a LifeScene tile. */
export function lifeFarmPlotEntityId(sceneId: string, x: number, y: number): string {
  return `life:farm-plot:${encodeURIComponent(sceneId)}:${x}:${y}`;
}

export const LIFE_FARM_ACTION_REJECT_REASONS = [
  'not-plantable', 'already-tilled', 'already-watered', 'missing-plot', 'invalid-scene',
] as const;

export type LifeFarmActionRejectReason = typeof LIFE_FARM_ACTION_REJECT_REASONS[number];
