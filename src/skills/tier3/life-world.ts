import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { t } from '@engine/core/schema.js';

const layerSchema = t.obj({ name: t.enum(['ground', 'collision', 'interaction'] as const), tiles: t.arr(t.obj({ tileId: t.str(), count: t.num() })) });
const rectSchema = t.obj({ x: t.num(), y: t.num(), width: t.num(), height: t.num() });
const tileCatalogEntrySchema = t.obj({ tileId: t.str(), tags: t.arr(t.enum(['walkable', 'blocked', 'plantable', 'water', 'forage', 'mineable'] as const)), skinKey: t.opt(t.str('opaque skin key; not an asset path')) });
const itemCatalogEntrySchema = t.obj({ id: t.str(), kind: t.enum(['seed', 'crop', 'resource', 'tool', 'good', 'quest'] as const), skinKey: t.str('opaque skin key; not an asset path') });
const cropCatalogEntrySchema = t.obj({ id:t.str(), seedItemId:t.str(), harvestItemId:t.str(), growthDays:t.num(), visual:t.opt(t.obj({seededSkinKey:t.str(),growingSkinKey:t.str(),matureSkinKey:t.str()})) });
const seasonSchema=t.obj({id:t.str(),lengthDays:t.num()});
const profileSourceSchema=t.union([
  t.obj({kind:t.lit('resource'),id:t.str()}),
  t.obj({kind:t.lit('relationship'),npcId:t.str()}),
], 'kind');
const profileAttributeSchema=t.obj({id:t.str(),titleKey:t.str(),display:t.enum(['value','gauge'] as const),source:profileSourceSchema,iconSkinKey:t.str('opaque skin key; not an asset path'),surfaces:t.opt(t.arr(t.enum(['profile','hud'] as const)))});

/** Static LifeGamePackage projection; its runtime interpreter is intentionally a later capability. */
export const lifeWorldCapability = defineCapability({
  id: 't3-life-world', version: '1.0.0',
  describe: {
    name: 'life world', summary: 'Validated LifeGamePackage spatial data compiled into Manifest components; no runtime system or implicit map generation.',
    semantic: ['tier3', 'life-sim', 'authoring', 'world', 'scene', 'static-data'],
    whenToUse: 'Use as the explicit Manifest bridge for a validated LifeGamePackage. It stores world, tile/item catalogs, scenes, zones, warps, spawn points, and placements as POD data for later simulation capabilities.',
    examples: ['LifeWorld{startSceneId:"town"}', 'LifeScene{sceneId:"farm",width:32,height:24,layers:[…]}'],
  },
  components: { provides: {
    LifeWorld: defineComponent('LifeWorld', { startSceneId: t.str('LifeScene.sceneId') }, { category: 'config', describe: 'Static world root compiled from LifeGamePackage.world.', singleton: true }),
    LifeTileCatalog: defineComponent('LifeTileCatalog', { tiles: t.arr(tileCatalogEntrySchema) }, { category: 'config', describe: 'Static tile id → semantic tag table compiled from LifeGamePackage.tileCatalog.', singleton: true }),
    LifeItemCatalog: defineComponent('LifeItemCatalog', { items: t.arr(itemCatalogEntrySchema) }, { category: 'config', describe: 'Static model-authored item metadata. Entries are id-sorted; runtime stack counts remain only in Inventory.', singleton: true }),
    LifeCropCatalog: defineComponent('LifeCropCatalog', { crops:t.arr(cropCatalogEntrySchema) }, { category:'config', describe:'Static seed-to-crop metadata, id-sorted.' }),
    LifeCalendarConfig: defineComponent('LifeCalendarConfig',{seasons:t.arr(seasonSchema),slots:t.opt(t.arr(t.str())),initialSlot:t.opt(t.str())},{category:'config',describe:'Static ordered season cycle with optional intra-day slots.'}),
    LifeCalendar: defineComponent('LifeCalendar',{totalDay:t.num(),seasonId:t.str(),dayOfSeason:t.num(),slotId:t.opt(t.str())},{category:'resource',describe:'Explicitly advanced simulation date and optional intra-day slot.'}),
    LifeScene: defineComponent('LifeScene', { sceneId: t.str(), title: t.opt(t.str()), width: t.num(), height: t.num(), layers: t.arr(layerSchema, 'RLE layers; never expanded into cell entities') }, { category: 'config', describe: 'Static scene geometry, optional player-facing title, and RLE layers.' }),
    LifeZone: defineComponent('LifeZone', { sceneId: t.str(), zoneId: t.str(), kind: t.enum(['farm', 'forage', 'fishing', 'mining', 'town', 'interior'] as const), geometry: rectSchema, allowedActions: t.arr(t.enum(['till', 'water', 'plant', 'harvest', 'forage', 'fish', 'mine', 'buy', 'talk','gift','build'] as const)) }, { category: 'config', describe: 'Static actionable rectangle in a LifeScene.' }),
    LifeWarp: defineComponent('LifeWarp', { sceneId: t.str(), warpId: t.str(), label: t.opt(t.str()), x: t.num(), y: t.num(), width: t.num(), height: t.num(), toSceneId: t.str(), toSpawnId: t.str(), conditionRef: t.opt(t.str()) }, { category: 'config', describe: 'Static scene-graph edge with a half-open explicit-interaction footprint; conditionRef is stored only.' }),
    LifeSpawn: defineComponent('LifeSpawn', { sceneId: t.str(), spawnId: t.str(), kind: t.enum(['player', 'npc', 'warp'] as const), x: t.num(), y: t.num() }, { category: 'config', describe: 'Static named spawn point.' }),
    LifePlayerVisual: defineComponent('LifePlayerVisual', { skinKey: t.str('opaque skin key; not an asset path'), anchor: t.enum(['bottom-center'] as const) }, { category: 'render', describe: 'Optional player sprite key and fixed foot anchor; render-only consumer data.' }),
    LifeProfileCatalog: defineComponent('LifeProfileCatalog', { titleKey:t.str(), attributes:t.arr(profileAttributeSchema) }, { category:'config', describe:'Static read-only profile presentation catalog; current values remain in Resource and LifeRelationshipProjection.', singleton:true }),
    LifePlacement: defineComponent('LifePlacement', { sceneId: t.str(), placementId: t.str(), kind: t.enum(['npc', 'building', 'resource', 'interactable', 'decoration'] as const), x: t.num(), y: t.num(), width: t.num(), height: t.num(), prefabRef: t.str(), skinKey: t.str('opaque skin key; not an asset path'), interactionRange: t.num(), visible:t.opt(t.bool()), interactive:t.opt(t.bool()) }, { category: 'config', describe: 'Authored placement plus an optional current deterministic schedule projection.' }),
  }, reads: [], writes: [], consumes: [] },
  config: {}, systems: [],
});
