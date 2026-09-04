import { BLOCK_COUNT, BLOCK_LENGTH } from './tower-blueprint.js';

export type TowerPhase = 'settling' | 'ready' | 'pulling' | 'toppled';

// A block remains part of the supporting tower until at least 92% of its length clears the stack.
export const EXTRACTION_DISTANCE = BLOCK_LENGTH * 0.92;
export const STABLE_FRAME_WINDOW = 30;
export const COLLAPSE_BLOCK_COUNT = 3;
export const SETTLING_TIMEOUT_FRAMES = 900;

export function phaseAfterRelease(current: TowerPhase, requested: TowerPhase = 'settling'): TowerPhase {
  return current === 'toppled' ? 'toppled' : requested;
}

export function isInitialTowerReady(settledBlocks: ReadonlySet<string>): boolean {
  return settledBlocks.size === BLOCK_COUNT;
}

export function isExtracted(pullDistance: number): boolean {
  return pullDistance >= EXTRACTION_DISTANCE;
}

export function pullDistanceFromPosition(
  baseline: { x: number; z: number },
  current: { x: number; z: number },
  axis: readonly [number, number, number],
): number {
  return (current.x - baseline.x) * axis[0] + (current.z - baseline.z) * axis[2];
}

/** A non-held block has genuinely left the stack only after a substantial vertical drop and lateral departure.
 * This consumes Cannon-synchronised transforms in the shared executor; it is never exposed to Local AI. */
export function hasFallenFromTower(
  baseline: { x: number; y: number; z: number },
  current: { x: number; y: number; z: number },
  blockWidth: number,
  blockHeight: number,
): boolean {
  const dropped = baseline.y - current.y >= blockHeight * 1.5;
  const lateralDistance = Math.hypot(current.x - baseline.x, current.z - baseline.z);
  return dropped && lateralDistance >= blockWidth * 0.5;
}

export function syncExtractedBlock(extractedBlocks: Set<string>, id: string, pullDistance: number): void {
  if (isExtracted(pullDistance)) extractedBlocks.add(id);
  else extractedBlocks.delete(id);
}

export function isTowerBlock(id: string, extractedBlocks: ReadonlySet<string>): boolean {
  return !extractedBlocks.has(id);
}

export function hasStableTowerWindow(stableFrames: number): boolean {
  return stableFrames >= STABLE_FRAME_WINDOW;
}
