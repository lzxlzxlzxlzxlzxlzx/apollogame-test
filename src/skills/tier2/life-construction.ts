import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { DebugTrace, LifeActionResult, LifeActivityContext, LifeActor, LifeConstructionProject, LifePlacement, LifeSelectedTarget } from '@engine/protocol/components.js';
import type { LifeActionRejectReason } from '@engine/protocol/components/life-action.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';
import { lifeAccessMet } from './life-access.js';
import { invHas, invRemove, type Inventory } from './inventory.js';

export const LIFE_CONSTRUCTION_CAPABILITY_ID = 't2-life-construction';

const accessSchema = t.union([
  t.obj({ kind: t.lit('flag'), id: t.str(), equals: t.bool() }),
  t.obj({ kind: t.lit('resource'), id: t.str(), op: t.lit('>='), value: t.num() }),
], 'kind');

function copyInventory(inventory: Inventory): Inventory {
  return { ...inventory, items: inventory.items.map((stack) => ({ ...stack })) };
}

/** Fixed-site, one-time construction. Every rejection is a zero-write recheck; success commits inventory and completion together. */
export const lifeConstructionCapability = defineCapability({
  id: LIFE_CONSTRUCTION_CAPABILITY_ID,
  version: '1.0.0',
  describe: {
    name: 'life construction',
    summary: 'Atomically completes an authored fixed-site construction project by consuming its full material list once.',
    semantic: ['tier2', 'life-sim', 'construction', 'inventory', 'atomic-commit'],
    whenToUse: 'After life-action for data-authored, fixed placement upgrades. It deliberately does not support timers, scripts, free placement, removal, random ids, or project-specific code.',
    examples: ['build + nearby unfinished bridge + 20 wood → deduct 20 wood and mark bridge completed', 'repeat build → rejected already-completed with no inventory write'],
  },
  components: {
    provides: {
      LifeConstructionProject: defineComponent('LifeConstructionProject', {
        projectId: t.str(),
        placementId: t.str(),
        materials: t.arr(t.obj({ itemId: t.str(), count: t.num() })),
        requires: t.opt(accessSchema),
        completedSkinKey: t.str('opaque completed art: skin key'),
        completed: t.bool(),
      }, { category: 'resource', describe: 'Authored fixed-site construction specification plus its one-time snapshot-safe completion bit.' }),
    },
    reads: ['LifeActionResult', 'LifeActor', 'LifeActivityContext', 'LifeSelectedTarget', 'LifePlacement', 'LifeConstructionProject', 'Inventory', 'Flag', 'Resource', 'DebugTrace'],
    writes: ['LifeActionResult', 'LifeConstructionProject', 'Inventory'],
    consumes: [],
  },
  config: {},
  systems: [{
    id: 'life-construction',
    phase: SystemPhase.Commit,
    runsAfter: ['life-affordance'],
    runsBefore: ['life-relationship', 'life-quest'],
    reads: ['LifeActionResult', 'LifeActor', 'LifeActivityContext', 'LifeSelectedTarget', 'LifePlacement', 'LifeConstructionProject', 'Inventory', 'Flag', 'Resource', 'DebugTrace'],
    writes: ['LifeActionResult', 'LifeConstructionProject', 'Inventory'],
    consumes: [],
    execute(world: IWorld) {
      const projects = new Map<string, { entityId: string; value: LifeConstructionProject }>();
      for (const entityId of sortedIds(world, 'LifeConstructionProject')) {
        const value = world.getComponent<LifeConstructionProject>(entityId, 'LifeConstructionProject');
        if (value && !projects.has(value.placementId)) projects.set(value.placementId, { entityId, value });
      }
      if (projects.size === 0) return;
      const placements = new Map<string, LifePlacement>();
      for (const entityId of sortedIds(world, 'LifePlacement')) {
        const value = world.getComponent<LifePlacement>(entityId, 'LifePlacement');
        if (value && !placements.has(value.placementId)) placements.set(value.placementId, value);
      }
      const trace = findDebugTrace(world);
      let traceCount = 0;
      const record = (kind: 'decision' | 'transition' | 'commit' | 'reject', what: string, why?: string) => {
        if (!trace || traceCount >= 3) return;
        appendTrace(trace, trace.tick ?? world.getVersion(), 'life-construction', kind, what, why);
        traceCount++;
      };
      for (const actorId of sortedIds(world, 'LifeActor', 'LifeActionResult')) {
        const actor = world.getComponent<LifeActor>(actorId, 'LifeActor');
        const result = world.getComponent<LifeActionResult>(actorId, 'LifeActionResult');
        if (actor?.kind !== 'player' || result?.status !== 'accepted' || result.action !== 'build') continue;
        const reject = (reason: LifeActionRejectReason) => {
          world.addComponent(actorId, { ...result, status: 'rejected', reason } as LifeActionResult);
          record('reject', `${actorId} build rejected`, reason);
        };
        const context = world.getComponent<LifeActivityContext>(actorId, 'LifeActivityContext');
        const selection = world.getComponent<LifeSelectedTarget>(actorId, 'LifeSelectedTarget');
        const inventory = world.getComponent<Inventory>(actorId, 'Inventory');
        if (!context || !inventory) { reject('invalid-target'); continue; }
        if (!selection) { reject('missing-selection'); continue; }
        if (!context.nearbyPlacementIds.includes(selection.placementId)) { reject('target-not-nearby'); continue; }
        const placement = placements.get(selection.placementId);
        const pair = projects.get(selection.placementId);
        if (!placement || !pair || (placement.kind !== 'building' && placement.kind !== 'interactable')) { reject('invalid-target'); continue; }
        if (pair.value.completed) { reject('already-completed'); continue; }
        const affordances = context.affordances.filter((entry) => entry.action === 'build' && entry.targetKind === 'placement' && entry.targetId === selection.placementId);
        if (affordances.length !== 1) { reject('invalid-target'); continue; }
        if (!affordances[0]!.available) {
          reject(affordances[0]!.reason === 'locked' ? 'locked' : affordances[0]!.reason === 'missing-materials' ? 'missing-materials' : 'invalid-target');
          continue;
        }
        if (!lifeAccessMet(world, placement.requires) || !lifeAccessMet(world, pair.value.requires)) { reject('locked'); continue; }
        if (!pair.value.materials.every((material) => invHas(inventory, material.itemId, material.count))) { reject('missing-materials'); continue; }

        const nextInventory = copyInventory(inventory);
        for (const material of pair.value.materials) invRemove(nextInventory, material.itemId, material.count);
        record('decision', `${pair.value.projectId} build accepted`, `placement=${pair.value.placementId}`);
        world.addComponent(actorId, nextInventory);
        world.addComponent(pair.entityId, { ...pair.value, completed: true } as LifeConstructionProject);
        record('transition', `${pair.value.projectId} incomplete→completed`);
        record('commit', `${actorId} materials deducted`, pair.value.materials.map((material) => `${material.itemId}:${material.count}`).join(','));
      }
    },
  }],
});
