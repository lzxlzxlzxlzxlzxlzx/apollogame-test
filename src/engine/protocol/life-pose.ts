import { cellFloor } from '../math/grid.js';
import type { LifePosition } from './components/life-navigation.js';
import type { Transform } from './components/spatial.js';

/**
 * Authoritative read-only Life pose projection.
 *
 * Transform is the continuous footpoint in tile units. LifePosition is the
 * deterministic floor-cell cache and remains the scene/progress authority.
 * Renderers and hosts may project this value, but must never write it back.
 */
export interface LifePose {
  readonly sceneId: string;
  readonly x: number;
  readonly y: number;
  readonly cellX: number;
  readonly cellY: number;
}

/** Boundaries belong to the cell on their positive side; negative values floor. */
export function lifePoseCell(x: number, y: number): { readonly x: number; readonly y: number } {
  const cell = cellFloor(x, y, 0, 0, 1);
  return { x: cell.col, y: cell.row };
}

/** Resolve one shared footpoint, falling back to legacy discrete-only actors. */
export function resolveLifePose(position: LifePosition, transform?: Readonly<Pick<Transform, 'x' | 'y'>>): LifePose {
  const x = transform?.x ?? position.x;
  const y = transform?.y ?? position.y;
  const cell = lifePoseCell(x, y);
  return { sceneId: position.sceneId, x, y, cellX: cell.x, cellY: cell.y };
}
