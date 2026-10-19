import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import type { IWorld } from '@engine/core/types.js';
import type { DebugTrace, LifeActionResult, LifeActor, LifeCrop, LifeCropCatalog, LifeFarmPlot, LifeItemCatalog, LifePlantActionResult, LifePosition, LifeSelectedItem, Signal } from '@engine/protocol/components.js';
import { invHas, invRemove, type Inventory } from './inventory.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';

const SELECT_SIGNAL = 'life.select-item';
const PLANT_REASONS = ['missing-plot', 'unprepared-soil', 'already-planted', 'missing-selection', 'selected-not-seed', 'unknown-crop', 'inventory-empty', 'invalid-scene'] as const;
type PlantReason = typeof PLANT_REASONS[number];

export const lifeItemSelectionCapability = defineCapability({
  id: 't2-life-item-selection', version: '1.0.0',
  describe: { name: 'life item selection', summary: 'Accepts one held catalog item selection per player tick.', semantic: ['tier2', 'life-sim', 'inventory'], whenToUse: 'Bind semantic life.select-item with the candidate item id in Signal.arg.', examples: ['life.select-item seed.turnip → LifeSelectedItem'] },
  components: { provides: { LifeSelectedItem: defineComponent('LifeSelectedItem', { itemId: t.str() }, { category: 'resource', describe: 'Persistent chosen item. Invalid choices preserve the prior selection.' }) }, reads: ['Signal', 'LifeActor', 'Inventory', 'LifeItemCatalog'], writes: ['LifeSelectedItem'], consumes: [] }, config: {},
  systems: [{ id: 'life-item-selection', runsAfter: ['life-activity'], reads: ['Signal', 'LifeActor', 'Inventory', 'LifeItemCatalog'], writes: ['LifeSelectedItem'], consumes: [], execute(world: IWorld) {
    const catalogId = world.singleton('LifeItemCatalog'); const catalog = catalogId === undefined ? undefined : world.getComponent<LifeItemCatalog>(catalogId, 'LifeItemCatalog'); const trace=findDebugTrace(world); let traced=0; const log=(kind:'decision'|'commit'|'reject',what:string,why?:string)=>{if(trace&&traced++<3)appendTrace(trace,trace.tick??world.getVersion(),'life-item-selection',kind,what,why)};
    const intents = new Map<string, Set<string>>();
    for (const signalId of sortedIds(world, 'Signal')) { const signal = world.getComponent<Signal>(signalId, 'Signal'); if (signal?.name === SELECT_SIGNAL && typeof signal.arg === 'string') (intents.get(signal.source) ?? intents.set(signal.source, new Set()).get(signal.source)!).add(signal.arg); }
    for (const [source, choices] of [...intents.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (choices.size !== 1 || !catalog) { log('reject',`${source} selection rejected`,choices.size!==1?'ambiguous-selection':'missing-catalog'); continue; }
      const actor = world.getComponent<LifeActor>(source, 'LifeActor'); const inventory = world.getComponent<Inventory>(source, 'Inventory'); const itemId = [...choices][0]!;
      if (actor?.kind === 'player' && inventory && catalog.items.some((item) => item.id === itemId) && invHas(inventory, itemId)) { log('decision',`${source} selected ${itemId}`); world.addComponent(source, { type: 'LifeSelectedItem', itemId } as LifeSelectedItem); log('commit',`${source} LifeSelectedItem`,itemId); } else log('reject',`${source} selection rejected`,'not-held-or-unknown');
    }
  }}],
});

export const lifePlantingCapability = defineCapability({
  id: 't2-life-planting', version: '1.1.0',
  describe: { name: 'life planting', summary: 'Consumes accepted plant intent and one selected seed into a LifeCrop on an existing watered sparse plot.', semantic: ['tier2', 'life-sim', 'farming'], whenToUse: 'After t2-life-farming; watering is a required preparation step, selection is preserved, and no second plot entity is created.', examples: ['watered plot + selected seed + accepted plant → crop and Inventory -1'] },
  components: { provides: {
    LifeCrop: defineComponent('LifeCrop', { cropId: t.str(), plantedBy: t.opt(t.str()), daysGrown:t.num(), stage:t.enum(['seeded','growing','mature'] as const) }, { category: 'resource', describe: 'Persistent crop state stored on its existing sparse LifeFarmPlot entity.' }),
    LifePlantActionResult: defineComponent('LifePlantActionResult', { status: t.enum(['applied', 'rejected'] as const), reason: t.opt(t.enum(PLANT_REASONS)), sceneId: t.str(), x: t.num(), y: t.num(), cropId: t.opt(t.str()) }, { category: 'event', describe: 'One-tick planting outcome; applied has cropId and no reason.' }),
  }, reads: ['LifeActionResult', 'LifeActor', 'LifePosition', 'LifeSelectedItem', 'Inventory', 'LifeItemCatalog', 'LifeCropCatalog', 'LifeFarmPlot', 'LifeCrop'], writes: ['Inventory', 'LifeCrop', 'LifePlantActionResult'], consumes: [] }, config: {},
  systems: [{ id: 'life-planting', runsAfter: ['life-farming', 'life-item-selection'], reads: ['LifeActionResult', 'LifeActor', 'LifePosition', 'LifeSelectedItem', 'Inventory', 'LifeItemCatalog', 'LifeCropCatalog', 'LifeFarmPlot', 'LifeCrop'], writes: ['Inventory', 'LifeCrop', 'LifePlantActionResult'], consumes: [], execute(world: IWorld) {
    for (const actorId of sortedIds(world, 'LifeActor')) if (world.hasComponent(actorId, 'LifePlantActionResult')) world.removeComponent(actorId, 'LifePlantActionResult');
    const itemCatalogId = world.singleton('LifeItemCatalog'); const cropCatalogId = world.singleton('LifeCropCatalog'); const trace=findDebugTrace(world); let traced=0; const log=(kind:'decision'|'commit'|'reject',what:string,why?:string)=>{if(trace&&traced++<3)appendTrace(trace,trace.tick??world.getVersion(),'life-planting',kind,what,why)};
    const items = itemCatalogId === undefined ? undefined : world.getComponent<LifeItemCatalog>(itemCatalogId, 'LifeItemCatalog'); const crops = cropCatalogId === undefined ? undefined : world.getComponent<LifeCropCatalog>(cropCatalogId, 'LifeCropCatalog');
    for (const actorId of sortedIds(world, 'LifeActor', 'LifePosition', 'LifeActionResult')) {
      const result = world.getComponent<LifeActionResult>(actorId, 'LifeActionResult'); const position = world.getComponent<LifePosition>(actorId, 'LifePosition');
      if (!result || !position || result.status !== 'accepted' || result.action !== 'plant') continue;
      const plotId = `life:farm-plot:${encodeURIComponent(position.sceneId)}:${position.x}:${position.y}`; const plot = world.getComponent<LifeFarmPlot>(plotId, 'LifeFarmPlot'); const selected = world.getComponent<LifeSelectedItem>(actorId, 'LifeSelectedItem'); const inventory = world.getComponent<Inventory>(actorId, 'Inventory'); const item = items?.items.find((entry) => entry.id === selected?.itemId); const crop = crops?.crops.find((entry) => entry.seedItemId === selected?.itemId);
      let reason: PlantReason = 'missing-selection';
      if (!plot) reason = 'missing-plot'; else if (plot.soil !== 'watered') reason = 'unprepared-soil'; else if (world.hasComponent(plotId, 'LifeCrop')) reason = 'already-planted'; else if (!selected) reason = 'missing-selection'; else if (item?.kind !== 'seed') reason = 'selected-not-seed'; else if (!crop) reason = 'unknown-crop'; else if (!inventory || !invHas(inventory, selected.itemId)) reason = 'inventory-empty'; else { log('decision',`${actorId} plant ${crop.id}`); invRemove(inventory, selected.itemId, 1); world.addComponent(plotId, { type: 'LifeCrop', cropId: crop.id, plantedBy: actorId, daysGrown:0, stage:'seeded' } as LifeCrop); world.addComponent(actorId, { type: 'LifePlantActionResult', status: 'applied', sceneId: position.sceneId, x: position.x, y: position.y, cropId: crop.id } as LifePlantActionResult); log('commit',`${actorId} LifeCrop`,crop.id); continue; }
      world.addComponent(actorId, { type: 'LifePlantActionResult', status: 'rejected', reason, sceneId: position.sceneId, x: position.x, y: position.y } as LifePlantActionResult);
      log('reject',`${actorId} plant rejected`,reason);
    }
  }}],
});
