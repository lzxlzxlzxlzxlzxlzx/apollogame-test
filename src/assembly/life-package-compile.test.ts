import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage, compileLifeGamePackage, lifeEntityId, INVENTORY_CAPABILITY_ID, LIFE_ACTION_CAPABILITY_ID, LIFE_ACTION_INPUT, LIFE_ACTIVITY_CAPABILITY_ID, LIFE_CALENDAR_CAPABILITY_ID, LIFE_CONTINUOUS_MOTION_CAPABILITY_ID, LIFE_CROP_GROWTH_CAPABILITY_ID, LIFE_FARMING_CAPABILITY_ID, LIFE_HARVEST_CAPABILITY_ID, LIFE_MILESTONE_CAPABILITY_ID, LIFE_NPC_SCHEDULE_CAPABILITY_ID, LIFE_INPUT_ACTIONS, LIFE_INPUT_CAPABILITY_ID, LIFE_KEYBIND_CAPABILITY_ID, LIFE_NAVIGATION_CAPABILITY_ID, LIFE_PLANTING_CAPABILITY_ID, LIFE_QUEST_CAPABILITY_ID, LIFE_RESOURCE_GATHER_CAPABILITY_ID, LIFE_SELECTION_CAPABILITY_ID, LIFE_TARGET_SELECTION_CAPABILITY_ID, LIFE_TALK_CAPABILITY_ID, LIFE_WORLD_CAPABILITY_ID, TRANSFORM_CAPABILITY_ID, VELOCITY_CAPABILITY_ID, CAMERA_CAPABILITY_ID, CAMERA_FOLLOW_CAPABILITY_ID, BOUNDS_CLAMP_CAPABILITY_ID } from './life-package-compile.js';
import { LifePackageValidationError } from './life-package.js';
import { threeSceneLifePackage } from './life-package.fixture.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('LifeGamePackage static Manifest compiler', () => {
  it('compiles the ENG-01 farm/town/river fixture with explicit capability and complete static entities', () => {
    const manifest = compileLifeGamePackage(threeSceneLifePackage());
    expect(manifest.capabilities).toEqual([LIFE_WORLD_CAPABILITY_ID, INVENTORY_CAPABILITY_ID, LIFE_KEYBIND_CAPABILITY_ID, LIFE_INPUT_CAPABILITY_ID, TRANSFORM_CAPABILITY_ID, VELOCITY_CAPABILITY_ID, CAMERA_CAPABILITY_ID, CAMERA_FOLLOW_CAPABILITY_ID, LIFE_CONTINUOUS_MOTION_CAPABILITY_ID, 't1-motion-apply', LIFE_NAVIGATION_CAPABILITY_ID, LIFE_ACTIVITY_CAPABILITY_ID, LIFE_SELECTION_CAPABILITY_ID, LIFE_TARGET_SELECTION_CAPABILITY_ID, LIFE_ACTION_CAPABILITY_ID, LIFE_FARMING_CAPABILITY_ID, LIFE_PLANTING_CAPABILITY_ID, LIFE_CALENDAR_CAPABILITY_ID, LIFE_CROP_GROWTH_CAPABILITY_ID, LIFE_HARVEST_CAPABILITY_ID, LIFE_MILESTONE_CAPABILITY_ID, LIFE_RESOURCE_GATHER_CAPABILITY_ID, LIFE_TALK_CAPABILITY_ID, 't3-dialogue']);
    expect(Object.keys(manifest.entities)).toHaveLength(38); // static catalogs + milestone config/ledger + bindings
    expect(manifest.entities['life:world']).toEqual({ LifeWorld: { startSceneId: 'town' } });
    expect(manifest.entities['life:tile-catalog']).toEqual({ LifeTileCatalog: { tiles: expect.arrayContaining([{ tileId: 'grass', tags: ['walkable', 'forage'] }]) } });
    expect(manifest.entities['life:item-catalog']).toEqual({ LifeItemCatalog: { items: [{ id: 'resource.berry', kind: 'resource', skinKey: 'item:berry' }] } });
    expect(manifest.entities['life:player']).toMatchObject({ LifeActor: { actorId: 'player', kind: 'player' }, Transform: { x: 0, y: 0 }, Velocity: { vx: 0, vy: 0 }, LifeContinuousMotion: { sceneId: 'town', speed: 0.25 }, LifePosition: { sceneId: 'town', x: 0, y: 0 }, Inventory: { id: 'bag:life:player', slots: 10, maxStack: 99, items: [] } });
    expect(manifest.entities['life:camera']).toEqual({ Camera: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, viewportW: 20, viewportH: 15 } });
    expect([...LIFE_INPUT_ACTIONS, LIFE_ACTION_INPUT, 'life.select-item', 'life.select-target', 'life.advance-day'].map((action) => manifest.entities[lifeEntityId('keybind', 'player', action)])).toEqual([...LIFE_INPUT_ACTIONS, LIFE_ACTION_INPUT, 'life.select-item', 'life.select-target', 'life.advance-day'].map((action) => ({ KeyBinding: { key: action, signal: action, phase: 'action', source: 'life:player' } })));
    expect(manifest.entities['life:calendar-config']).toEqual({ LifeCalendarConfig: { seasons: [{ id: 'spring', lengthDays: 28 }] } });
    expect(manifest.entities['life:calendar']).toEqual({ LifeCalendar: { totalDay: 1, seasonId: 'spring', dayOfSeason: 1 } });
    expect(manifest.entities[lifeEntityId('scene', 'farm')]).toMatchObject({ LifeScene: { sceneId: 'farm', title: 'Old Farm', width: 4, height: 4 } });
    expect(manifest.entities[lifeEntityId('zone', 'farm', 'farm-field')]).toMatchObject({ LifeZone: { sceneId: 'farm', zoneId: 'farm-field', kind: 'farm', geometry: { x: 0, y: 0, width: 4, height: 4 } } });
    expect(manifest.entities[lifeEntityId('warp', 'town', 'town-farm-door')]).toMatchObject({ LifeWarp: { label: '前往农场', toSceneId: 'farm', toSpawnId: 'farm-door' } });
    expect(manifest.entities[lifeEntityId('spawn', 'town', 'town-player')]).toMatchObject({ LifeSpawn: { kind: 'player', x: 0, y: 0 } });
    expect(manifest.entities[lifeEntityId('placement', 'town', 'mayor')]).toMatchObject({ LifePlacement: { prefabRef: 'npc.mayor', skinKey: 'npc:mayor' } });
    expect(manifest.entities[lifeEntityId('placement', 'farm', 'berry-bush')]).toMatchObject({ LifeResourceNode: { action: 'forage', itemId: 'resource.berry', remaining: 3 } });
  });

  it('compiles an explicit placement footprint while legacy and landmark-only warps remain exact 1x1', () => {
    const raw = copy(threeSceneLifePackage()) as any;
    raw.scenes[0].placements.push({ id: 'farm-gate', kind: 'building', x: 2, y: 0, width: 2, height: 2, prefabRef: 'building.farm-gate', skinKey: 'building:farm-gate' });
    raw.scenes[0].warps[0].interactionPlacementId = 'farm-gate';
    raw.scenes[0].warps[1].landmarkPlacementId = 'farm-gate';
    const manifest = compileLifeGamePackage(raw);
    expect(manifest.entities[lifeEntityId('warp', 'town', 'town-farm-door')]!.LifeWarp).toMatchObject({ x: 2, y: 0, width: 2, height: 2 });
    expect(manifest.entities[lifeEntityId('warp', 'town', 'town-river-door')]!.LifeWarp).toMatchObject({ x: 3, y: 3, width: 1, height: 1 });
  });

  it('compiles profile metadata without copying current authoritative values',()=>{
    const raw=copy(threeSceneLifePackage()) as any;
    raw.logic={resources:[{id:'renown',initial:4,min:0,max:10}]};
    raw.profile={titleKey:'Profile',attributes:[{id:'renown',titleKey:'Renown',display:'gauge',source:{kind:'resource',id:'renown'},iconSkinKey:'art:ui:renown'}]};
    expect(compileLifeGamePackage(raw).entities['life:profile-catalog']).toEqual({LifeProfileCatalog:{titleKey:'Profile',attributes:raw.profile.attributes}});
    expect(JSON.stringify(compileLifeGamePackage(raw).entities['life:profile-catalog'])).not.toContain('current');
  });

  it('compiles the engine-owned Life viewport profile and start-scene Bounds without changing the legacy default', () => {
    const raw = threeSceneLifePackage() as any;
    raw.camera = { profile: 'life-standard-v1' };
    const manifest = compileLifeGamePackage(raw);
    expect(manifest.capabilities).toContain(BOUNDS_CLAMP_CAPABILITY_ID);
    expect(manifest.entities['life:camera']).toEqual({
      Camera: { zoom: 1, offsetX: 0.5, offsetY: 1, rotation: 0, viewportW: 28, viewportH: 19, followMargin: 0, followMinZoom: 1, followMaxZoom: 1, followOffsetX: 0.5, followOffsetY: 1, followDeadZone: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3 } },
      Bounds: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
    });
    expect(compileAndParseLifeGamePackage(raw).warnings.some((warning) => warning.includes('无对应 provider'))).toBe(false);
  });

  it('rejects free camera tuning instead of silently creating a game-specific viewport', () => {
    const raw = threeSceneLifePackage() as any;
    raw.camera = { viewportWidthCells: 28, viewportHeightCells: 19, follow: { marginCells: 0, minZoom: 1, maxZoom: 1 } };
    expect(() => compileLifeGamePackage(raw)).toThrow('$.camera');
  });

  it('is deterministic, isolated, and uses collision-free reversible entity ids', () => {
    const raw = threeSceneLifePackage(); const before = JSON.stringify(raw);
    expect(compileLifeGamePackage(raw)).toEqual(compileLifeGamePackage(raw));
    expect(JSON.stringify(raw)).toBe(before);
    expect(lifeEntityId('placement', 'town/a', 'mayor%2Fwest')).not.toBe(lifeEntityId('placement', 'town%2Fa', 'mayor/west'));
    expect(lifeEntityId('scene', '河岸/π:入口')).toBe('life:scene:%E6%B2%B3%E5%B2%B8%2F%CF%80%3A%E5%85%A5%E5%8F%A3');
  });

  it('compiles interaction ranges and the optional dialogue session policy into static data', () => {
    const legacy = compileLifeGamePackage(threeSceneLifePackage());
    expect(legacy.entities['life:dialogue-catalog']).toEqual({ LifeDialogueCatalog: { dialogues: expect.any(Array), sessionPolicy: 'persistent' } });
    const raw = threeSceneLifePackage() as any; raw.interaction = { nearbyRange: 2, dialogueSessionPolicy: 'proximity' }; raw.scenes[0].placements[0].interactionRange = 0;
    const compiled = compileLifeGamePackage(raw);
    expect(compiled.entities[lifeEntityId('placement', 'town', 'mayor')]).toMatchObject({ LifePlacement: { interactionRange: 0 } });
    expect(compiled.entities[lifeEntityId('placement', 'farm', 'berry-bush')]).toMatchObject({ LifePlacement: { interactionRange: 2 } });
    expect(compiled.entities['life:dialogue-catalog']).toMatchObject({ LifeDialogueCatalog: { sessionPolicy: 'proximity' } });
  });

  it('compiles optional render-only visual keys without requiring assets to exist', () => {
    const raw = threeSceneLifePackage() as any; raw.tileCatalog.grass.visual = { skinKey: 'tile:grass' }; raw.playerVisual = { skinKey: 'actor:farmer', anchor: 'bottom-center' };
    const compiled = compileLifeGamePackage(raw);
    expect(compiled.entities['life:tile-catalog']).toMatchObject({ LifeTileCatalog: { tiles: expect.arrayContaining([expect.objectContaining({ tileId: 'grass', skinKey: 'tile:grass' })]) } });
    expect(compiled.entities['life:player']).toMatchObject({ LifePlayerVisual: { skinKey: 'actor:farmer', anchor: 'bottom-center' } });
  });

  it('compiles authored slots and complete NPC schedules without changing legacy manifests', () => {
    const legacy=compileLifeGamePackage(threeSceneLifePackage());
    expect(legacy.capabilities).not.toContain(LIFE_NPC_SCHEDULE_CAPABILITY_ID);
    expect(legacy.entities['life:calendar-config']).toEqual({LifeCalendarConfig:{seasons:[{id:'spring',lengthDays:28}]}});
    const raw=copy(threeSceneLifePackage()) as any;
    raw.calendar={seasons:[{id:'spring',lengthDays:28}],initialSeasonId:'spring',initialDayOfSeason:1,slots:['morning','afternoon'],initialSlot:'morning'};
    raw.scenes[0].placements[0].schedule=[
      {slot:'morning',sceneId:'town',x:1,y:1,visible:true,interactive:true},
      {slot:'afternoon',sceneId:'farm',x:2,y:1,visible:false,interactive:false},
    ];
    const compiled=compileLifeGamePackage(raw);const id=lifeEntityId('placement','town','mayor');
    expect(compiled.capabilities).toContain(LIFE_NPC_SCHEDULE_CAPABILITY_ID);
    expect(compiled.entities['life:calendar-config']).toEqual({LifeCalendarConfig:{seasons:[{id:'spring',lengthDays:28}],slots:['morning','afternoon'],initialSlot:'morning'}});
    expect(compiled.entities[lifeEntityId('keybind','player','life.advance-time')]).toEqual({KeyBinding:{key:'life.advance-time',signal:'life.advance-time',phase:'action',source:'life:player'}});
    expect(compiled.entities[id]).toMatchObject({LifeActor:{kind:'npc'},LifePlacement:{sceneId:'town',x:1,y:1,visible:true,interactive:true},Transform:{x:1,y:1},LifePosition:{sceneId:'town',x:1,y:1},LifeNpcSchedule:{currentSlot:'morning',entries:raw.scenes[0].placements[0].schedule}});
  });

  it('conditionally compiles canonical quest catalog, persistent state, and read-only projection', () => {
    const raw=copy(threeSceneLifePackage()) as any;
    raw.quests=[{id:'chapter',titleKey:'Chapter',quests:[{id:'quest',chapterId:'chapter',priority:1,initialNodeId:'start',terminalNodeIds:['start'],nodes:[{id:'start',titleKey:'Start',objectiveKey:'Begin',trigger:{kind:'game-start'},effects:[{kind:'set-node-state',questId:'quest',nodeId:'start',state:'completed'}]}]}]}];
    const compiled=compileLifeGamePackage(raw);
    expect(compiled.capabilities!.at(-1)).toBe(LIFE_QUEST_CAPABILITY_ID);
    expect(compiled.entities['life:quest-catalog']).toMatchObject({LifeQuestCatalog:{chapters:[{id:'chapter'}]}});
    expect(compiled.entities['life:quest-state']).toEqual({LifeQuestState:{entries:[{questId:'quest',nodeId:'start',state:'active'}],receipts:[]}});
    expect(compiled.entities['life:quest-projection']).toEqual({LifeQuestProjection:{entries:[{chapterId:'chapter',questId:'quest',nodeId:'start',state:'active',titleKey:'Start',objectiveKey:'Begin'}]}});
    expect(compileAndParseLifeGamePackage(raw).warnings.some((warning)=>warning.includes('无对应 provider'))).toBe(false);
  });

  it('feeds the standard Manifest parser without missing-provider warnings', () => {
    const result = compileAndParseLifeGamePackage(threeSceneLifePackage());
    expect(result.blueprint.capabilities.map((cap) => cap.id)).toEqual([LIFE_WORLD_CAPABILITY_ID, INVENTORY_CAPABILITY_ID, LIFE_KEYBIND_CAPABILITY_ID, LIFE_INPUT_CAPABILITY_ID, TRANSFORM_CAPABILITY_ID, VELOCITY_CAPABILITY_ID, CAMERA_CAPABILITY_ID, CAMERA_FOLLOW_CAPABILITY_ID, LIFE_CONTINUOUS_MOTION_CAPABILITY_ID, 't1-motion-apply', LIFE_NAVIGATION_CAPABILITY_ID, LIFE_ACTIVITY_CAPABILITY_ID, LIFE_SELECTION_CAPABILITY_ID, LIFE_TARGET_SELECTION_CAPABILITY_ID, LIFE_ACTION_CAPABILITY_ID, LIFE_FARMING_CAPABILITY_ID, LIFE_PLANTING_CAPABILITY_ID, LIFE_CALENDAR_CAPABILITY_ID, LIFE_CROP_GROWTH_CAPABILITY_ID, LIFE_HARVEST_CAPABILITY_ID, LIFE_MILESTONE_CAPABILITY_ID, LIFE_RESOURCE_GATHER_CAPABILITY_ID, LIFE_TALK_CAPABILITY_ID, 't3-dialogue']);
    expect(result.warnings.some((warning) => warning.includes('无对应 provider'))).toBe(false);
  });

  it('does not allow compile to bypass ENG-01 fail-closed errors', () => {
    const raw = copy(threeSceneLifePackage()) as any;
    raw.scenes[0].layers[0].tiles[0].tileId = 'unknown-tile';
    try { compileLifeGamePackage(raw); throw new Error('expected compiler to reject invalid source'); }
    catch (error) {
      expect(error).toBeInstanceOf(LifePackageValidationError);
      expect((error as LifePackageValidationError).issues.map((issue) => issue.path)).toContain('$.scenes[0].layers[0].tiles[0].tileId');
    }
  });

  it('keeps entity count independent of a scene grid size', () => {
    const raw = copy(threeSceneLifePackage()) as any;
    raw.scenes[0].width = 256; raw.scenes[0].height = 256;
    for (const layer of raw.scenes[0].layers) layer.tiles = [{ tileId: layer.tiles[0].tileId, count: 65_536 }];
    const compiled = compileLifeGamePackage(raw);
    expect(Object.keys(compiled.entities)).toHaveLength(38);
    expect(compiled.entities[lifeEntityId('scene', 'town')]).toMatchObject({ LifeScene: { width: 256, height: 256 } });
  });
});
