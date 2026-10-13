import type { Manifest, ParseResult } from './manifest-core.js';
import { parseManifestDetailed } from './manifest.js';
import { parseLifeGamePackage } from './life-package.js';
import { DEFAULT_LIFE_DIALOGUE_SESSION_POLICY, type LifeGamePackage } from '@engine/protocol/life-sim.js';
import { resolveLifeViewportProfile } from '@engine/protocol/life-viewport-profile.js';

export const LIFE_WORLD_CAPABILITY_ID = 't3-life-world';
export const LIFE_NAVIGATION_CAPABILITY_ID = 't2-life-navigation';
export const LIFE_INPUT_CAPABILITY_ID = 't2-life-input';
export const LIFE_ACTIVITY_CAPABILITY_ID = 't2-life-activity';
export const LIFE_ACTION_CAPABILITY_ID = 't2-life-action';
export const LIFE_CONSTRUCTION_CAPABILITY_ID = 't2-life-construction';
export const LIFE_FARMING_CAPABILITY_ID = 't2-life-farming';
export const INVENTORY_CAPABILITY_ID = 't2-inventory';
export const LIFE_PLANTING_CAPABILITY_ID = 't2-life-planting';
export const LIFE_SELECTION_CAPABILITY_ID = 't2-life-item-selection';
export const LIFE_CALENDAR_CAPABILITY_ID = 't2-life-calendar';
export const LIFE_NPC_SCHEDULE_CAPABILITY_ID = 't2-life-npc-schedule';
export const LIFE_CROP_GROWTH_CAPABILITY_ID = 't2-life-crop-growth';
export const LIFE_HARVEST_CAPABILITY_ID = 't2-life-harvest';
export const LIFE_MILESTONE_CAPABILITY_ID = 't2-life-milestone';
export const LIFE_TARGET_SELECTION_CAPABILITY_ID = 't2-life-target-selection';
export const LIFE_RESOURCE_GATHER_CAPABILITY_ID = 't2-life-resource-gather';
export const LIFE_TALK_CAPABILITY_ID = 't2-life-talk';
export const LIFE_QUEST_CAPABILITY_ID = 't2-life-quest';
export const LIFE_RELATIONSHIP_CAPABILITY_ID = 't2-life-relationship';
export const LIFE_ACTION_INPUT = 'life.action';
export const LIFE_KEYBIND_CAPABILITY_ID = 't2-keybind';
export const LIFE_INPUT_ACTIONS = ['life.move.up', 'life.move.down', 'life.move.left', 'life.move.right', 'life.warp'] as const;
export const LIFE_CONTINUOUS_MOTION_CAPABILITY_ID = 't2-life-continuous-motion';
export const TRANSFORM_CAPABILITY_ID = 'a1-transform';
export const VELOCITY_CAPABILITY_ID = 'b1-velocity';
export const CAMERA_CAPABILITY_ID = 'l5-camera';
export const CAMERA_FOLLOW_CAPABILITY_ID = 't2-camera-follow';
export const BOUNDS_CLAMP_CAPABILITY_ID = 't2-bounds-clamp';

/** Reversible, delimiter-safe entity ids; component semantic ids remain unmodified. */
export function lifeEntityId(kind: 'scene' | 'zone' | 'warp' | 'spawn' | 'placement' | 'keybind' | 'construction', sceneId?: string, localId?: string): string {
  if (kind === 'scene') return `life:scene:${encodeURIComponent(sceneId!)}`;
  if (kind === 'construction') return `life:construction:${encodeURIComponent(sceneId!)}`;
  return `life:${kind}:${encodeURIComponent(sceneId!)}:${encodeURIComponent(localId!)}`;
}

function copyLayers(pkg: LifeGamePackage['scenes'][number]['layers']) {
  return pkg.map((layer) => ({ name: layer.name, tiles: layer.tiles.map((tile) => ({ tileId: tile.tileId, count: tile.count })) }));
}

function canonicalQuestChapters(chapters: NonNullable<LifeGamePackage['quests']>) {
  return chapters.map((chapter) => ({
    ...chapter,
    quests: chapter.quests.map((quest) => ({
      ...quest,
      terminalNodeIds: [...quest.terminalNodeIds].sort(),
      nodes: quest.nodes.map((node) => ({
        ...node,
        effects: node.effects.map((effect) => ({ ...effect })),
      })).sort((a, b) => a.id.localeCompare(b.id)),
    })).sort((a, b) => a.id.localeCompare(b.id)),
  })).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Compiles validated LifeGamePackage author input to the existing raw Manifest
 * shape. It emits static POD only: no cell entities, world writes, or runtime
 * systems are created here.
 */
export function compileLifeGamePackage(raw: unknown): Manifest {
  const pkg = parseLifeGamePackage(raw);
  const questChapters = pkg.quests?.length ? canonicalQuestChapters(pkg.quests) : undefined;
  const relationships=pkg.relationships?.length?[...pkg.relationships].map((entry)=>({...entry,levels:[...entry.levels].map((level)=>({...level})).sort((a,b)=>a.min-b.min||a.id.localeCompare(b.id)),dailyCaps:{...entry.dailyCaps},rules:[...entry.rules].map((rule)=>({...rule,trigger:{...rule.trigger},effect:{...rule.effect}})).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))})).sort((a,b)=>a.npcId.localeCompare(b.npcId)):undefined;
  const entities: Manifest['entities'] = {
    'life:world': { LifeWorld: { startSceneId: pkg.world.startSceneId } },
    'life:tile-catalog': { LifeTileCatalog: { tiles: Object.keys(pkg.tileCatalog).sort().map((tileId) => ({ tileId, tags: [...pkg.tileCatalog[tileId]!.tags], ...(pkg.tileCatalog[tileId]!.visual === undefined ? {} : { skinKey: pkg.tileCatalog[tileId]!.visual!.skinKey }) })) } },
    'life:item-catalog': { LifeItemCatalog: { items: [...(pkg.itemCatalog ?? [])].map((item) => ({ ...item })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) } },
    'life:crop-catalog': { LifeCropCatalog: { crops: [...(pkg.cropCatalog ?? [])].map((crop) => ({ ...crop })).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0) } },
    'life:calendar-config': { LifeCalendarConfig: { seasons: (pkg.calendar?.seasons ?? [{ id:'spring',lengthDays:28 }]).map((season) => ({ ...season })), ...(pkg.calendar?.slots === undefined ? {} : { slots:[...pkg.calendar.slots], initialSlot:pkg.calendar.initialSlot }) } },
    'life:calendar': { LifeCalendar: { totalDay: 1, seasonId: pkg.calendar?.initialSeasonId ?? 'spring', dayOfSeason: pkg.calendar?.initialDayOfSeason ?? 1, ...(pkg.calendar?.slots === undefined ? {} : { slotId:pkg.calendar.initialSlot }) } },
    'life:dialogue-catalog': { LifeDialogueCatalog: { dialogues: (pkg.dialogueCatalog ?? []).map((dialogue) => ({ id: dialogue.id, graph: dialogue.graph })), sessionPolicy: pkg.interaction?.dialogueSessionPolicy ?? DEFAULT_LIFE_DIALOGUE_SESSION_POLICY } },
    'life:milestone-catalog': { LifeMilestoneCatalog: { milestones: (pkg.milestones ?? []).map((milestone) => ({ ...milestone, effects: { ...(milestone.effects.flags === undefined ? {} : { flags: milestone.effects.flags.map((effect) => ({ ...effect })) }), ...(milestone.effects.resources === undefined ? {} : { resources: milestone.effects.resources.map((effect) => ({ ...effect })) }) } })).sort((a,b)=>a.id.localeCompare(b.id)) } },
    'life:milestone-ledger': { LifeMilestoneLedger: { completedIds: [] } },
    ...(questChapters ? {
      'life:quest-catalog': { LifeQuestCatalog: { chapters: questChapters } },
      'life:quest-state': { LifeQuestState: { entries: questChapters.flatMap((chapter) => chapter.quests.flatMap((quest) => quest.nodes.map((node) => ({ questId:quest.id, nodeId:node.id, state:node.id===quest.initialNodeId?'active':'locked' })))).sort((a,b)=>a.questId.localeCompare(b.questId)||a.nodeId.localeCompare(b.nodeId)), receipts: [] } },
      'life:quest-projection': { LifeQuestProjection: { entries: questChapters.flatMap((chapter) => chapter.quests.flatMap((quest) => quest.nodes.map((node) => ({ chapterId:chapter.id, questId:quest.id, nodeId:node.id, state:node.id===quest.initialNodeId?'active':'locked', titleKey:node.titleKey, objectiveKey:node.objectiveKey })))).sort((a,b)=>a.chapterId.localeCompare(b.chapterId)||a.questId.localeCompare(b.questId)||a.nodeId.localeCompare(b.nodeId)) } },
    } : {}),
    ...(relationships?{
      'life:relationship-catalog':{LifeRelationshipCatalog:{relationships}},
      'life:relationship-state':{LifeRelationshipState:{entries:relationships.map((entry)=>({npcId:entry.npcId,value:entry.initial,levelId:[...entry.levels].filter((level)=>level.min<=entry.initial).at(-1)!.id,day:1,talkSpent:0,giftSpent:0,actionSpent:0})),receipts:[]}},
      'life:relationship-projection':{LifeRelationshipProjection:{entries:relationships.map((entry)=>{const level=[...entry.levels].filter((candidate)=>candidate.min<=entry.initial).at(-1)!;const next=entry.levels.find((candidate)=>candidate.min>entry.initial);return {npcId:entry.npcId,value:entry.initial,min:entry.min,max:entry.max,levelId:level.id,levelTitleKey:level.titleKey,...(next?{nextLevelAt:next.min}:{}),talkRemaining:entry.dailyCaps.talk,giftRemaining:entry.dailyCaps.gift,actionRemaining:entry.dailyCaps.action}})}},
    }:{}),
  };
  let player: { sceneId: string; x: number; y: number } | undefined;
  for (const scene of pkg.scenes) {
    entities[lifeEntityId('scene', scene.id)] = { LifeScene: { sceneId: scene.id, ...(scene.title === undefined ? {} : { title: scene.title }), width: scene.width, height: scene.height, layers: copyLayers(scene.layers) } };
    for (const zone of scene.zones) entities[lifeEntityId('zone', scene.id, zone.id)] = { LifeZone: { sceneId: scene.id, zoneId: zone.id, kind: zone.kind, geometry: { ...zone.rect }, allowedActions: [...zone.allowedActions], ...(zone.requires === undefined ? {} : { requires: { ...zone.requires } }) } };
    for (const warp of scene.warps) entities[lifeEntityId('warp', scene.id, warp.id)] = { LifeWarp: { sceneId: scene.id, warpId: warp.id, ...(warp.label === undefined ? {} : { label: warp.label }), x: warp.at.x, y: warp.at.y, toSceneId: warp.toSceneId, toSpawnId: warp.toSpawnId, ...(warp.conditionRef === undefined ? {} : { conditionRef: warp.conditionRef }), ...(warp.requires === undefined ? {} : { requires: { ...warp.requires } }) } };
    for (const spawn of scene.spawnPoints) {
      entities[lifeEntityId('spawn', scene.id, spawn.id)] = { LifeSpawn: { sceneId: scene.id, spawnId: spawn.id, kind: spawn.kind, x: spawn.x, y: spawn.y } };
      if (spawn.kind === 'player') player = { sceneId: scene.id, x: spawn.x, y: spawn.y };
    }
    for (const placement of scene.placements) {
      const schedule = placement.schedule;
      const initial = schedule?.find((entry) => entry.slot === pkg.calendar?.initialSlot);
      const projected = initial ?? { sceneId:scene.id, x:placement.x, y:placement.y, visible:true, interactive:true };
      const entity: Manifest['entities'][string] = {
        LifePlacement: { sceneId: projected.sceneId, placementId: placement.id, kind: placement.kind, x: projected.x, y: projected.y, width: placement.width, height: placement.height, prefabRef: placement.prefabRef, skinKey: placement.skinKey, interactionRange: placement.interactionRange ?? pkg.interaction?.nearbyRange ?? 1, ...(schedule === undefined ? {} : { visible:projected.visible, interactive:projected.interactive }), ...(placement.npcDialogue === undefined ? {} : { npcDialogueId: placement.npcDialogue.dialogueId }), ...(placement.requires === undefined ? {} : { requires: { ...placement.requires } }) },
        ...(placement.resourceNode === undefined ? {} : { LifeResourceNode: { action: placement.resourceNode.action, itemId: placement.resourceNode.itemId, remaining: placement.resourceNode.quantity } }),
      };
      if (schedule !== undefined) {
        entity.LifeActor = { actorId:placement.id, kind:'npc' };
        entity.Transform = { x:projected.x, y:projected.y, rotation:0, scaleX:1, scaleY:1 };
        entity.LifePosition = { sceneId:projected.sceneId, x:projected.x, y:projected.y };
        entity.LifeNpcSchedule = { entries:schedule.map((entry) => ({ ...entry })), currentSlot:pkg.calendar!.initialSlot! };
      }
      entities[lifeEntityId('placement', scene.id, placement.id)] = entity;
    }
  }
  for (const flag of pkg.logic?.flags ?? []) entities[`life:logic:flag:${encodeURIComponent(flag.id)}`] = { Flag: { id: flag.id, active: flag.initial } };
  for (const resource of pkg.logic?.resources ?? []) entities[`life:logic:resource:${encodeURIComponent(resource.id)}`] = { Resource: { id: resource.id, current: resource.initial, min: resource.min, max: resource.max } };
  for (const project of [...(pkg.constructionProjects ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    entities[lifeEntityId('construction', project.id)] = { LifeConstructionProject: {
      projectId: project.id,
      placementId: project.placementId,
      materials: [...project.materials].map((material) => ({ ...material })).sort((a, b) => a.itemId.localeCompare(b.itemId)),
      ...(project.requires === undefined ? {} : { requires: { ...project.requires } }),
      completedSkinKey: project.completedSkinKey,
      completed: false,
    } };
  }
  // parseLifeGamePackage already fail-closed guarantees this exists exactly once.
  const bag = pkg.playerInventory ?? { slots: 10, maxStack: 99, items: [] };
  entities['life:player'] = { LifeActor: { actorId: 'player', kind: 'player' }, Transform: { x: player!.x, y: player!.y, rotation: 0, scaleX: 1, scaleY: 1 }, Velocity: { vx: 0, vy: 0, angular: 0 }, LifeContinuousMotion: { sceneId: player!.sceneId, speed: pkg.movement?.speed ?? 0.25, up: false, down: false, left: false, right: false }, ...(pkg.playerVisual === undefined ? {} : { LifePlayerVisual: { ...pkg.playerVisual } }), LifePosition: player!, Inventory: { id: 'bag:life:player', slots: bag.slots, maxStack: bag.maxStack, items: bag.items.map((item) => ({ kind: item.itemId, count: item.count })) } };
  entities['life:player']!.CameraTarget = {};
  const cameraScene = pkg.scenes.find((scene) => scene.id === player!.sceneId)!;
  const viewportProfile = pkg.camera === undefined ? undefined : resolveLifeViewportProfile(pkg.camera.profile);
  entities['life:camera'] = viewportProfile === undefined
    ? { Camera: { zoom: 1, offsetX: player!.x, offsetY: player!.y, rotation: 0, viewportW: 20, viewportH: 15 } }
    : {
        Camera: {
          zoom: 1, offsetX: player!.x + 0.5, offsetY: player!.y + 1, rotation: 0,
          viewportW: viewportProfile.camera.viewportWidthCells, viewportH: viewportProfile.camera.viewportHeightCells,
          followMargin: viewportProfile.camera.follow.marginCells, followMinZoom: viewportProfile.camera.follow.minZoom, followMaxZoom: viewportProfile.camera.follow.maxZoom,
          followOffsetX: 0.5, followOffsetY: 1,
          followDeadZone: { ...viewportProfile.camera.follow.deadZone },
        },
        Bounds: { minX: 0, minY: 0, maxX: cameraScene.width, maxY: cameraScene.height },
      };
  for (const action of [...LIFE_INPUT_ACTIONS, 'life.move.start', 'life.move.stop', LIFE_ACTION_INPUT, 'life.select-item', 'life.select-target', 'life.advance-day', ...(pkg.calendar?.slots === undefined ? [] : ['life.advance-time'])]) {
    entities[lifeEntityId('keybind', 'player', action)] = { KeyBinding: { key: action, signal: action, phase: 'action', source: 'life:player' } };
  }
  const hasNpcSchedule = pkg.scenes.some((scene) => scene.placements.some((placement) => placement.schedule !== undefined));
  return { capabilities: [LIFE_WORLD_CAPABILITY_ID, INVENTORY_CAPABILITY_ID, LIFE_KEYBIND_CAPABILITY_ID, LIFE_INPUT_CAPABILITY_ID, TRANSFORM_CAPABILITY_ID, VELOCITY_CAPABILITY_ID, CAMERA_CAPABILITY_ID, ...(pkg.camera === undefined ? [] : [BOUNDS_CLAMP_CAPABILITY_ID]), CAMERA_FOLLOW_CAPABILITY_ID, LIFE_CONTINUOUS_MOTION_CAPABILITY_ID, 't1-motion-apply', LIFE_NAVIGATION_CAPABILITY_ID, LIFE_ACTIVITY_CAPABILITY_ID, LIFE_SELECTION_CAPABILITY_ID, LIFE_TARGET_SELECTION_CAPABILITY_ID, LIFE_ACTION_CAPABILITY_ID, ...(pkg.constructionProjects?.length ? [LIFE_CONSTRUCTION_CAPABILITY_ID] : []), LIFE_FARMING_CAPABILITY_ID, LIFE_PLANTING_CAPABILITY_ID, LIFE_CALENDAR_CAPABILITY_ID, ...(hasNpcSchedule ? [LIFE_NPC_SCHEDULE_CAPABILITY_ID] : []), LIFE_CROP_GROWTH_CAPABILITY_ID, LIFE_HARVEST_CAPABILITY_ID, LIFE_MILESTONE_CAPABILITY_ID, ...(pkg.logic?.resources?.length ? ['f1-resource'] : []), LIFE_RESOURCE_GATHER_CAPABILITY_ID, LIFE_TALK_CAPABILITY_ID, 't3-dialogue', ...(relationships ? [LIFE_RELATIONSHIP_CAPABILITY_ID] : []), ...(pkg.quests?.length ? [LIFE_QUEST_CAPABILITY_ID] : [])], ...(pkg.meta.tickRate === undefined ? {} : { meta: { tickRate: pkg.meta.tickRate } }), entities };
}

/** Compiles then enters the standard Manifest parser; it intentionally has no parallel loader or validator. */
export function compileAndParseLifeGamePackage(raw: unknown): ParseResult {
  return parseManifestDetailed(compileLifeGamePackage(raw));
}
