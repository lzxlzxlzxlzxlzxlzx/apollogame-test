import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import type { IWorld } from '@engine/core/types.js';
import type { DebugTrace, LifeActionResult, LifeActor, LifeCrop, LifeCropCatalog, LifeFarmPlot, LifeHarvestActionResult, LifeItemCatalog, LifePosition, LifeScene } from '@engine/protocol/components.js';
import { LIFE_HARVEST_REJECT_REASONS, type LifeHarvestRejectReason } from '@engine/protocol/components/life-planting.js';
import { lifeFarmPlotEntityId } from '@engine/protocol/life-farming.js';
import { invAdd, invCanAdd, type Inventory } from './inventory.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

export const LIFE_HARVEST_CAPABILITY_ID = 't2-life-harvest';

/** Atomically exchanges one mature sparse crop for its catalog-declared crop item. */
export const lifeHarvestCapability = defineCapability({
  id: LIFE_HARVEST_CAPABILITY_ID,
  version: '1.0.0',
  describe: {
    name: 'life harvest',
    summary: 'Consumes an accepted harvest action by atomically adding one valid crop item and removing the mature sparse crop.',
    semantic: ['tier2', 'life-sim', 'farming', 'inventory'],
    whenToUse: 'After t2-life-action and t2-life-crop-growth. It preserves the farm plot and uses t2-inventory helpers for all bag writes.',
    examples: ['accepted harvest + mature turnip → Inventory crop.turnip +1 and LifeCrop removed'],
  },
  components: {
    provides: {
      LifeHarvestActionResult: defineComponent('LifeHarvestActionResult', {
        status: t.enum(['applied', 'rejected'] as const),
        reason: t.opt(t.enum(LIFE_HARVEST_REJECT_REASONS)),
        sceneId: t.str(), x: t.num(), y: t.num(),
        cropId: t.opt(t.str()), itemId: t.opt(t.str()), quantity: t.opt(t.num()),
      }, { category: 'event', describe: 'One-tick harvest outcome. Applied results carry exactly one crop item; rejected results carry only a closed reason.' }),
    },
    reads: ['LifeActionResult', 'LifeActor', 'LifePosition', 'LifeScene', 'LifeFarmPlot', 'LifeCrop', 'LifeCropCatalog', 'LifeItemCatalog', 'Inventory', 'DebugTrace'],
    writes: ['Inventory', 'LifeCrop', 'LifeHarvestActionResult'],
    consumes: [],
  },
  config: {},
  systems: [{
    id: 'life-harvest',
    // Explicitly override shared Inventory/LifeCrop dependency inference with the life pipeline order.
    runsAfter: ['life-item-selection', 'life-action', 'life-farming', 'life-planting', 'life-calendar', 'life-crop-growth'],
    reads: ['LifeActionResult', 'LifeActor', 'LifePosition', 'LifeScene', 'LifeFarmPlot', 'LifeCrop', 'LifeCropCatalog', 'LifeItemCatalog', 'Inventory', 'DebugTrace'],
    writes: ['Inventory', 'LifeCrop', 'LifeHarvestActionResult'],
    consumes: [],
    execute(world: IWorld) {
      for (const actorId of sortedIds(world, 'LifeActor')) if (world.hasComponent(actorId, 'LifeHarvestActionResult')) world.removeComponent(actorId, 'LifeHarvestActionResult');
      const cropCatalogId = world.singleton('LifeCropCatalog');
      const itemCatalogId = world.singleton('LifeItemCatalog');
      const crops = cropCatalogId === undefined ? undefined : world.getComponent<LifeCropCatalog>(cropCatalogId, 'LifeCropCatalog');
      const items = itemCatalogId === undefined ? undefined : world.getComponent<LifeItemCatalog>(itemCatalogId, 'LifeItemCatalog');
      const scenes = new Map<string, LifeScene>();
      for (const sceneEntityId of sortedIds(world, 'LifeScene')) {
        const scene = world.getComponent<LifeScene>(sceneEntityId, 'LifeScene');
        if (scene) scenes.set(scene.sceneId, scene);
      }
      const debugTrace = findDebugTrace(world); let traceCount = 0;
      const record = (kind: 'decision' | 'commit' | 'reject', what: string, why?: string): void => {
        if (!debugTrace || traceCount >= 3) return;
        appendTrace(debugTrace, debugTrace.tick ?? world.getVersion(), 'life-harvest', kind, what, why); traceCount += 1;
      };
      const reject = (actorId: string, position: LifePosition, reason: LifeHarvestRejectReason): void => {
        world.addComponent(actorId, { type: 'LifeHarvestActionResult', status: 'rejected', reason, sceneId: position.sceneId, x: position.x, y: position.y } as LifeHarvestActionResult);
        record('reject', `${actorId} harvest rejected`, reason);
      };

      for (const actorId of sortedIds(world, 'LifeActor', 'LifePosition', 'LifeActionResult', 'Inventory')) {
        const actor = world.getComponent<LifeActor>(actorId, 'LifeActor');
        const position = world.getComponent<LifePosition>(actorId, 'LifePosition');
        const action = world.getComponent<LifeActionResult>(actorId, 'LifeActionResult');
        const inventory = world.getComponent<Inventory>(actorId, 'Inventory');
        if (!actor || !position || !action || !inventory || actor.kind !== 'player' || action.status !== 'accepted' || action.action !== 'harvest') continue;
        const scene = scenes.get(position.sceneId);
        if (!scene || position.x < 0 || position.y < 0 || position.x >= scene.width || position.y >= scene.height) { reject(actorId, position, 'invalid-scene'); continue; }
        const plotId = lifeFarmPlotEntityId(position.sceneId, position.x, position.y);
        const plot = world.getComponent<LifeFarmPlot>(plotId, 'LifeFarmPlot');
        if (!plot) { reject(actorId, position, 'missing-plot'); continue; }
        const crop = world.getComponent<LifeCrop>(plotId, 'LifeCrop');
        if (!crop) { reject(actorId, position, 'missing-crop'); continue; }
        if (crop.stage !== 'mature') { reject(actorId, position, 'not-mature'); continue; }
        const cropDefinition = crops?.crops.find((candidate) => candidate.id === crop.cropId);
        if (!cropDefinition) { reject(actorId, position, 'unknown-crop'); continue; }
        const item = items?.items.find((candidate) => candidate.id === cropDefinition.harvestItemId);
        if (!item || item.kind !== 'crop') { reject(actorId, position, 'invalid-harvest-item'); continue; }
        if (!invCanAdd(inventory, item.id, 1)) { reject(actorId, position, 'inventory-full'); continue; }

        record('decision', `${actorId} harvest ${crop.cropId}`, `item=${item.id}`);
        const added = invAdd(inventory, item.id, 1);
        if (added !== 1) { reject(actorId, position, 'inventory-full'); continue; }
        world.removeComponent(plotId, 'LifeCrop');
        world.addComponent(actorId, { type: 'LifeHarvestActionResult', status: 'applied', sceneId: position.sceneId, x: position.x, y: position.y, cropId: crop.cropId, itemId: item.id, quantity: 1 } as LifeHarvestActionResult);
        record('commit', `${actorId} harvested ${crop.cropId}`, `item=${item.id}`);
      }
    },
  }],
});
