import type { Component } from '../../core/types.js';
import type { LifeFarmActionRejectReason } from '../life-farming.js';

/** Persistent sparse state: absent means the static plantable tile has never been tilled. */
export interface LifeFarmPlot extends Component {
  readonly type: 'LifeFarmPlot';
  sceneId: string;
  x: number;
  y: number;
  soil: 'tilled' | 'watered';
}

/** One-tick outcome of a farming action after its LifeActionResult was accepted. */
export interface LifeFarmActionResult extends Component {
  readonly type: 'LifeFarmActionResult';
  action: 'till' | 'water';
  status: 'applied' | 'rejected';
  reason?: LifeFarmActionRejectReason;
  sceneId: string;
  x: number;
  y: number;
}
