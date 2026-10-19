import type { Component } from '../../core/types.js';
import type { LifeAccessRequirement, LifeConstructionMaterial } from '../life-sim.js';

/** Runtime state plus immutable authored specification for one fixed-site construction project. */
export interface LifeConstructionProject extends Component {
  readonly type: 'LifeConstructionProject';
  projectId: string;
  placementId: string;
  materials: LifeConstructionMaterial[];
  requires?: LifeAccessRequirement;
  completedSkinKey: string;
  completed: boolean;
}
