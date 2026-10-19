import type { Component } from '../../core/types.js';
import { LIFE_ACTIONS, type LifeAction } from '../life-sim.js';

export const LIFE_AFFORDANCE_ACTIONS = [...LIFE_ACTIONS, 'warp'] as const;
export type LifeAffordanceAction = typeof LIFE_AFFORDANCE_ACTIONS[number];
export const LIFE_AFFORDANCE_TARGET_KINDS = ['tile', 'placement', 'warp'] as const;
export type LifeAffordanceTargetKind = typeof LIFE_AFFORDANCE_TARGET_KINDS[number];
export const LIFE_AFFORDANCE_UNAVAILABLE_REASONS = [
  'zone-disallowed', 'already-watered', 'missing-seed', 'missing-gift', 'missing-materials', 'relationship-cap', 'depleted', 'dialogue-open', 'missing-dialogue', 'locked', 'invalid-target', 'inventory-full',
] as const;
export type LifeAffordanceUnavailableReason = typeof LIFE_AFFORDANCE_UNAVAILABLE_REASONS[number];

/** Snapshot-safe, UI-neutral projection of one interaction target in its current world state. */
export interface LifeInteractionAffordance {
  id: string;
  action: LifeAffordanceAction;
  targetKind: LifeAffordanceTargetKind;
  targetId: string;
  available: boolean;
  reason?: LifeAffordanceUnavailableReason;
  /** Held, catalog-valid seeds for a plant affordance; always lexically sorted when present. */
  candidateItemIds?: string[];
}

/** Derived, authoritative spatial action context for one LifeActor. */
export interface LifeActivityContext extends Component {
  readonly type: 'LifeActivityContext';
  sceneId: string;
  x: number;
  y: number;
  zoneIds: string[];
  allowedActions: LifeAction[];
  nearbyPlacementIds: string[];
  nearbyWarpIds: string[];
  /** Dynamic projection only; allowedActions remains the static authored zone permission set. */
  affordances: LifeInteractionAffordance[];
}
