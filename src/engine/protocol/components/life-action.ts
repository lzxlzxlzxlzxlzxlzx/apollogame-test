import type { Component } from '../../core/types.js';
import type { LifeAction } from '../life-sim.js';

export const LIFE_ACTION_REJECT_REASONS = [
  'invalid-action', 'not-player', 'missing-context', 'not-allowed-here', 'ambiguous-action', 'navigation-conflict',
  'missing-selection', 'target-not-nearby', 'invalid-target', 'locked', 'missing-materials', 'already-completed',
] as const;
export type LifeActionRejectReason = typeof LIFE_ACTION_REJECT_REASONS[number];

/** One-tick Life action judgement. Invalid/ambiguous input omits action rather than inventing an action value. */
export interface LifeActionResult extends Component {
  readonly type: 'LifeActionResult';
  action?: LifeAction;
  status: 'accepted' | 'rejected';
  reason?: LifeActionRejectReason;
  sceneId: string;
  x: number;
  y: number;
  zoneIds: string[];
}
