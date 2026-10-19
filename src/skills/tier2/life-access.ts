import { sortedIds } from '@engine/core/query.js';
import type { IWorld } from '@engine/core/types.js';
import type { Flag, Resource } from '@engine/protocol/components.js';
import type { LifeAccessRequirement } from '@engine/protocol/life-sim.js';

/** Shared deterministic evaluator for validated Life package access gates. */
export function lifeAccessMet(world: IWorld, requirement: LifeAccessRequirement | undefined): boolean {
  if (!requirement) return true;
  if (requirement.kind === 'flag') {
    for (const entity of sortedIds(world, 'Flag')) { const flag = world.getComponent<Flag>(entity, 'Flag'); if (flag?.id === requirement.id) return flag.active === requirement.equals; }
    return false;
  }
  for (const entity of sortedIds(world, 'Resource')) { const resource = world.getComponent<Resource>(entity, 'Resource'); if (resource?.id === requirement.id) return resource.current >= requirement.value; }
  return false;
}
