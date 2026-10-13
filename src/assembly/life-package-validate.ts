import { inBounds, index } from '@engine/math/grid.js';
import type {
  LifeAction, LifeGamePackage, LifeLayer, LifeLayerName, LifePlacementKind, LifeSpawnKind,
  LifeDialogueSessionPolicy, LifeItemKind, LifeSurfaceKind, LifeTileTag, LifeZoneKind,
} from '@engine/protocol/life-sim.js';
import { LIFE_ACTIONS, LIFE_DIALOGUE_SESSION_POLICIES, LIFE_GAME_PACKAGE_SCHEMA, LIFE_ITEM_KINDS } from '@engine/protocol/life-sim.js';
import { LIFE_VIEWPORT_PROFILE_ID, isLifeViewportProfileId } from '@engine/protocol/life-viewport-profile.js';

export interface LifePackageIssue { path: string; code: string; message: string }
export interface LifePackageValidationReport { ok: boolean; issues: readonly LifePackageIssue[] }

const MAX_SCENE_SIDE = 256;
const MAX_SCENE_CELLS = 65_536;
const LAYERS = ['ground', 'collision', 'interaction'] as const;
const TAGS = new Set<LifeTileTag>(['walkable', 'blocked', 'plantable', 'water', 'forage', 'mineable']);
const SURFACES = new Set<LifeSurfaceKind>(['ground', 'plantable', 'water', 'forage', 'mineable', 'blocked']);
const ACTIONS = new Set<LifeAction>(LIFE_ACTIONS);
const ZONES = new Set<LifeZoneKind>(['farm', 'forage', 'fishing', 'mining', 'town', 'interior']);
const SPAWNS = new Set<LifeSpawnKind>(['player', 'npc', 'warp']);
const PLACEMENTS = new Set<LifePlacementKind>(['npc', 'building', 'resource', 'interactable', 'decoration']);
const ITEM_KINDS = new Set<LifeItemKind>(LIFE_ITEM_KINDS);
const DIALOGUE_SESSION_POLICIES = new Set<LifeDialogueSessionPolicy>(LIFE_DIALOGUE_SESSION_POLICIES);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const opaqueSkinKey = (v: unknown): v is string => text(v) && !/[\\/]|^(?:https?|data|file):/i.test(v);

type IssueSink = (path: string, code: string, message: string) => void;

function validateClosedPackageShape(raw: Record<string, unknown>, issue: IssueSink): void {
  const closed = (value: unknown, path: string, allowed: readonly string[]): void => {
    if (!isRecord(value)) return;
    const fields = new Set(allowed);
    for (const key of Object.keys(value).sort()) if (!fields.has(key)) issue(`${path}.${key}`, 'unknown', `unknown ${path === '$' ? 'package' : 'object'} field`);
  };
  const records = (value: unknown, path: string, visit: (entry: Record<string, unknown>, entryPath: string) => void): void => {
    if (!Array.isArray(value)) return;
    value.forEach((entry, index) => { if (isRecord(entry)) visit(entry, `${path}[${index}]`); });
  };
  const access = (value: unknown, path: string): void => {
    if (!isRecord(value)) return;
    closed(value, path, value.kind === 'flag' ? ['kind', 'id', 'equals'] : value.kind === 'resource' ? ['kind', 'id', 'op', 'value'] : ['kind', 'id', 'equals', 'op', 'value']);
  };
  const questCondition = (value: unknown, path: string): void => {
    if (!isRecord(value)) return;
    const allowed = value.kind === 'always' ? ['kind']
      : value.kind === 'and' || value.kind === 'or' ? ['kind', 'of']
      : value.kind === 'not' ? ['kind', 'of']
      : value.kind === 'flag' ? ['kind', 'id', 'equals']
      : value.kind === 'resource' ? ['kind', 'id', 'value']
      : value.kind === 'calendar' ? ['kind', 'seasonId', 'dayOfSeason', 'slotId']
      : value.kind === 'inventory' ? ['kind', 'inventoryId', 'itemId', 'count']
      : value.kind === 'milestone' ? ['kind', 'id']
      : value.kind === 'resource-node' ? ['kind', 'placementId', 'cmp', 'value']
      : value.kind === 'relationship' ? ['kind','npcId','cmp','value','levelId']
      : ['kind'];
    closed(value, path, allowed);
    if ((value.kind === 'and' || value.kind === 'or') && Array.isArray(value.of)) value.of.forEach((entry, i) => questCondition(entry, `${path}.of[${i}]`));
    if (value.kind === 'not') questCondition(value.of, `${path}.of`);
  };
  const questTrigger = (value: unknown, path: string): void => {
    if (!isRecord(value)) return;
    closed(value, path, value.kind === 'game-start' ? ['kind']
      : value.kind === 'calendar' ? ['kind', 'boundary', 'seasonId', 'dayOfSeason', 'slotId']
      : value.kind === 'life-action' ? ['kind', 'action', 'targetId']
      : value.kind === 'talk-choice' ? ['kind', 'dialogueId', 'choiceId']
      : value.kind === 'harvest' ? ['kind', 'cropId', 'itemId']
      : value.kind === 'gather' ? ['kind', 'action', 'placementId', 'itemId'] : ['kind']);
  };
  const questEffect = (value: unknown, path: string): void => {
    if (!isRecord(value)) return;
    closed(value, path, value.kind === 'set-flag' ? ['kind', 'id', 'value']
      : value.kind === 'add-resource' ? ['kind', 'id', 'amount']
      : value.kind === 'inventory' ? ['kind', 'inventoryId', 'itemId', 'amount']
      : value.kind === 'set-node-state' ? ['kind', 'questId', 'nodeId', 'state']
      : value.kind === 'relationship-delta' ? ['kind','ruleId','priority','exclusiveGroup','npcId','amount']
      : value.kind === 'unlock' ? ['kind', 'flagId'] : ['kind']);
  };

  closed(raw, '$', ['meta', 'world', 'visualSemantics', 'tileCatalog', 'itemCatalog', 'playerInventory', 'cropCatalog', 'calendar', 'movement', 'interaction', 'camera', 'playerVisual', 'logic', 'milestones', 'dialogueCatalog', 'quests', 'relationships', 'constructionProjects', 'scenes']);
  closed(raw.meta, '$.meta', ['schema', 'id', 'title', 'tickRate']);
  closed(raw.world, '$.world', ['startSceneId']);
  closed(raw.visualSemantics, '$.visualSemantics', ['schema', 'farm']);
  if (isRecord(raw.visualSemantics)) closed(raw.visualSemantics.farm, '$.visualSemantics.farm', ['tilledDrySkinKey', 'wateredSkinKey']);
  closed(raw.movement, '$.movement', ['speed']);
  closed(raw.interaction, '$.interaction', ['nearbyRange', 'dialogueSessionPolicy']);
  closed(raw.camera, '$.camera', ['profile']);
  closed(raw.playerVisual, '$.playerVisual', ['skinKey', 'anchor']);

  if (isRecord(raw.tileCatalog)) for (const [tileId, definition] of Object.entries(raw.tileCatalog)) {
    const path = `$.tileCatalog.${jsonKey(tileId)}`;
    closed(definition, path, ['tags', 'visual']);
    if (isRecord(definition)) closed(definition.visual, `${path}.visual`, ['skinKey', 'surface']);
  }
  records(raw.itemCatalog, '$.itemCatalog', (entry, path) => closed(entry, path, ['id', 'kind', 'skinKey']));
  closed(raw.playerInventory, '$.playerInventory', ['slots', 'maxStack', 'items']);
  if (isRecord(raw.playerInventory)) records(raw.playerInventory.items, '$.playerInventory.items', (entry, path) => closed(entry, path, ['itemId', 'count']));
  records(raw.cropCatalog, '$.cropCatalog', (entry, path) => {
    closed(entry, path, ['id', 'seedItemId', 'harvestItemId', 'growthDays', 'visual']);
    closed(entry.visual, `${path}.visual`, ['seededSkinKey', 'growingSkinKey', 'matureSkinKey']);
  });
  closed(raw.calendar, '$.calendar', ['seasons', 'initialSeasonId', 'initialDayOfSeason', 'slots', 'initialSlot']);
  if (isRecord(raw.calendar)) records(raw.calendar.seasons, '$.calendar.seasons', (entry, path) => closed(entry, path, ['id', 'lengthDays']));
  closed(raw.logic, '$.logic', ['flags', 'resources']);
  if (isRecord(raw.logic)) {
    records(raw.logic.flags, '$.logic.flags', (entry, path) => closed(entry, path, ['id', 'initial']));
    records(raw.logic.resources, '$.logic.resources', (entry, path) => closed(entry, path, ['id', 'initial', 'min', 'max']));
  }
  records(raw.milestones, '$.milestones', (entry, path) => {
    closed(entry, path, ['id', 'trigger', 'cropId', 'itemId', 'repeat', 'effects']);
    closed(entry.effects, `${path}.effects`, ['flags', 'resources']);
    if (isRecord(entry.effects)) {
      records(entry.effects.flags, `${path}.effects.flags`, (effect, effectPath) => closed(effect, effectPath, ['id', 'value']));
      records(entry.effects.resources, `${path}.effects.resources`, (effect, effectPath) => closed(effect, effectPath, ['id', 'amount']));
    }
  });
  records(raw.dialogueCatalog, '$.dialogueCatalog', (entry, path) => closed(entry, path, ['id', 'graph']));
  records(raw.quests, '$.quests', (chapter, chapterPath) => {
    closed(chapter, chapterPath, ['id', 'titleKey', 'quests']);
    records(chapter.quests, `${chapterPath}.quests`, (quest, questPath) => {
      closed(quest, questPath, ['id', 'chapterId', 'priority', 'exclusiveGroup', 'initialNodeId', 'terminalNodeIds', 'nodes']);
      records(quest.nodes, `${questPath}.nodes`, (node, nodePath) => {
        closed(node, nodePath, ['id', 'titleKey', 'objectiveKey', 'trigger', 'when', 'effects', 'loop']);
        questTrigger(node.trigger, `${nodePath}.trigger`);
        questCondition(node.when, `${nodePath}.when`);
        records(node.effects, `${nodePath}.effects`, questEffect);
      });
    });
  });
  records(raw.relationships,'$.relationships',(relationship,path)=>{
    closed(relationship,path,['npcId','min','max','initial','levels','dailyCaps','rules']);records(relationship.levels,`${path}.levels`,(level,levelPath)=>closed(level,levelPath,['id','min','titleKey']));closed(relationship.dailyCaps,`${path}.dailyCaps`,['talk','gift','action']);records(relationship.rules,`${path}.rules`,(rule,rulePath)=>{closed(rule,rulePath,['id','priority','exclusiveGroup','trigger','effect']);if(isRecord(rule.trigger))closed(rule.trigger,`${rulePath}.trigger`,rule.trigger.kind==='talk-opened'?['kind']:rule.trigger.kind==='talk-choice'?['kind','dialogueId','choiceId']:rule.trigger.kind==='life-action'?['kind','action','targetId']:rule.trigger.kind==='harvest'?['kind','cropId','itemId']:rule.trigger.kind==='gather'?['kind','action','placementId','itemId']:rule.trigger.kind==='gift'?['kind','itemId','count']:rule.trigger.kind==='quest-effect'?['kind','questId','nodeId']:['kind']);if(isRecord(rule.effect))closed(rule.effect,`${rulePath}.effect`,['kind','amount'])});
  });
  records(raw.constructionProjects, '$.constructionProjects', (project, path) => {
    closed(project, path, ['id', 'placementId', 'materials', 'requires', 'completedSkinKey']);
    records(project.materials, `${path}.materials`, (material, materialPath) => closed(material, materialPath, ['itemId', 'count']));
    access(project.requires, `${path}.requires`);
  });

  records(raw.scenes, '$.scenes', (scene, scenePath) => {
    closed(scene, scenePath, ['id', 'title', 'width', 'height', 'layers', 'spawnPoints', 'zones', 'warps', 'placements']);
    records(scene.layers, `${scenePath}.layers`, (layer, path) => {
      closed(layer, path, ['name', 'tiles']);
      records(layer.tiles, `${path}.tiles`, (run, runPath) => closed(run, runPath, ['tileId', 'count']));
    });
    records(scene.spawnPoints, `${scenePath}.spawnPoints`, (spawn, path) => closed(spawn, path, ['id', 'kind', 'x', 'y']));
    records(scene.zones, `${scenePath}.zones`, (zone, path) => {
      closed(zone, path, ['id', 'kind', 'rect', 'allowedActions', 'requires']);
      closed(zone.rect, `${path}.rect`, ['x', 'y', 'width', 'height']);
      access(zone.requires, `${path}.requires`);
    });
    records(scene.warps, `${scenePath}.warps`, (warp, path) => {
      closed(warp, path, ['id', 'label', 'landmarkPlacementId', 'at', 'toSceneId', 'toSpawnId', 'conditionRef', 'requires']);
      closed(warp.at, `${path}.at`, ['x', 'y']);
      access(warp.requires, `${path}.requires`);
    });
    records(scene.placements, `${scenePath}.placements`, (placement, path) => {
      closed(placement, path, ['id', 'kind', 'x', 'y', 'width', 'height', 'prefabRef', 'skinKey', 'interactionRange', 'resourceNode', 'npcDialogue', 'schedule', 'requires']);
      closed(placement.resourceNode, `${path}.resourceNode`, ['action', 'itemId', 'quantity']);
      closed(placement.npcDialogue, `${path}.npcDialogue`, ['dialogueId']);
      records(placement.schedule, `${path}.schedule`, (entry, entryPath) => closed(entry, entryPath, ['slot', 'sceneId', 'x', 'y', 'visible', 'interactive']));
      access(placement.requires, `${path}.requires`);
    });
  });
}

function jsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  if (isRecord(value)) return Object.values(value).every(jsonValue);
  return false;
}

/** Validates raw JSON author input.  The report order is deterministic and contains JSON paths only. */
export function validateLifeGamePackage(raw: unknown): LifePackageValidationReport {
  const issues: LifePackageIssue[] = [];
  const issue = (path: string, code: string, message: string): void => { issues.push({ path, code, message }); };
  if (!jsonValue(raw)) {
    issue('$', 'non_json', 'package must contain only finite JSON values and plain objects');
    return { ok: false, issues };
  }
  if (!isRecord(raw)) {
    issue('$', 'type', 'package must be an object');
    return { ok: false, issues };
  }
  validateClosedPackageShape(raw, issue);
  const meta = raw.meta; const world = raw.world; const catalog = raw.tileCatalog; const scenes = raw.scenes;
  if (!isRecord(meta)) issue('$.meta', 'type', 'meta must be an object');
  if (!isRecord(world)) issue('$.world', 'type', 'world must be an object');
  if (!isRecord(catalog)) issue('$.tileCatalog', 'type', 'tileCatalog must be an object');
  if (!Array.isArray(scenes)) issue('$.scenes', 'type', 'scenes must be an array');
  if (!isRecord(meta) || !isRecord(world) || !isRecord(catalog) || !Array.isArray(scenes)) return { ok: false, issues };

  if (meta.schema !== LIFE_GAME_PACKAGE_SCHEMA) issue('$.meta.schema', 'schema', `must equal ${LIFE_GAME_PACKAGE_SCHEMA}`);
  if (!text(meta.id)) issue('$.meta.id', 'id', 'must be a non-empty string');
  if (!text(meta.title)) issue('$.meta.title', 'title', 'must be a non-empty string');
  if (meta.tickRate !== undefined && (!integer(meta.tickRate) || meta.tickRate <= 0 || meta.tickRate > 240)) issue('$.meta.tickRate', 'range', 'must be an integer from 1 to 240');
  if (!text(world.startSceneId)) issue('$.world.startSceneId', 'reference', 'must be a non-empty scene id');
  if (raw.movement !== undefined) {
    if (!isRecord(raw.movement)) issue('$.movement', 'type', 'must be an object');
    else if (typeof raw.movement.speed !== 'number' || !Number.isFinite(raw.movement.speed) || raw.movement.speed <= 0 || raw.movement.speed > 1)
      issue('$.movement.speed', 'range', 'must be a finite number greater than 0 and at most 1');
  }
  if (raw.interaction !== undefined) {
    if (!isRecord(raw.interaction)) issue('$.interaction', 'type', 'must be an object');
    else {
      if (!integer(raw.interaction.nearbyRange) || raw.interaction.nearbyRange < 0 || raw.interaction.nearbyRange > 8)
        issue('$.interaction.nearbyRange', 'range', 'must be an integer from 0 to 8');
      if (raw.interaction.dialogueSessionPolicy !== undefined && !DIALOGUE_SESSION_POLICIES.has(raw.interaction.dialogueSessionPolicy as LifeDialogueSessionPolicy))
        issue('$.interaction.dialogueSessionPolicy', 'enum', `must be one of ${LIFE_DIALOGUE_SESSION_POLICIES.join(', ')}`);
    }
  }
  if (raw.camera !== undefined) {
    if (!isRecord(raw.camera)) issue('$.camera', 'type', 'must be a closed camera object');
    else if (!isLifeViewportProfileId(raw.camera.profile)) issue('$.camera.profile', 'enum', `must equal ${LIFE_VIEWPORT_PROFILE_ID}`);
  }
  if (raw.playerVisual !== undefined) {
    if (!isRecord(raw.playerVisual)) issue('$.playerVisual', 'type', 'must be an object');
    else { if (!opaqueSkinKey(raw.playerVisual.skinKey)) issue('$.playerVisual.skinKey', 'skin_key', 'must be an opaque key, not a path or URL'); if (raw.playerVisual.anchor !== 'bottom-center') issue('$.playerVisual.anchor', 'enum', 'must be bottom-center'); }
  }
  if (raw.visualSemantics !== undefined) {
    if (!isRecord(raw.visualSemantics)) issue('$.visualSemantics', 'type', 'must be an object');
    else {
      if (raw.visualSemantics.schema !== 1) issue('$.visualSemantics.schema', 'schema', 'must equal 1');
      if (!isRecord(raw.visualSemantics.farm)) issue('$.visualSemantics.farm', 'type', 'must be an object');
      else {
        if (!opaqueSkinKey(raw.visualSemantics.farm.tilledDrySkinKey)) issue('$.visualSemantics.farm.tilledDrySkinKey', 'skin_key', 'must be an opaque key, not a path or URL');
        if (!opaqueSkinKey(raw.visualSemantics.farm.wateredSkinKey)) issue('$.visualSemantics.farm.wateredSkinKey', 'skin_key', 'must be an opaque key, not a path or URL');
      }
    }
  }
  validateItems(raw.itemCatalog, raw.playerInventory, issue);
  validateCrops(raw.cropCatalog, raw.itemCatalog, issue);
  validateCalendar(raw.calendar, issue);
  validateMilestones(raw.logic, raw.milestones, issue);
  validateAccessRequirements(scenes, raw.logic, raw.constructionProjects, issue);
  validateResourceNodes(scenes, raw.itemCatalog, issue);
  validateDialogues(scenes, raw.dialogueCatalog, issue);
  validateRelationships(raw, issue);
  validateQuests(raw, issue);

  const catalogTags = new Map<string, ReadonlySet<LifeTileTag>>();
  for (const [tileId, def] of Object.entries(catalog)) {
    const path = `$.tileCatalog.${jsonKey(tileId)}`;
    if (!text(tileId)) issue(path, 'id', 'tile id must be non-empty');
    if (!isRecord(def) || !Array.isArray(def.tags)) { issue(path, 'type', 'tile definition must contain tags array'); continue; }
    if (def.visual !== undefined && (!isRecord(def.visual) || !opaqueSkinKey(def.visual.skinKey))) issue(`${path}.visual.skinKey`, 'skin_key', 'must be an opaque key, not a path or URL');
    if (isRecord(def.visual) && def.visual.surface !== undefined && !SURFACES.has(def.visual.surface as LifeSurfaceKind)) issue(`${path}.visual.surface`, 'enum', 'unknown surface kind');
    const tags = new Set<LifeTileTag>();
    for (let i = 0; i < def.tags.length; i++) {
      const tag = def.tags[i];
      if (typeof tag !== 'string' || !TAGS.has(tag as LifeTileTag)) issue(`${path}.tags[${i}]`, 'enum', 'unknown tile tag');
      else if (tags.has(tag as LifeTileTag)) issue(`${path}.tags[${i}]`, 'duplicate', 'tile tag must not repeat');
      else tags.add(tag as LifeTileTag);
    }
    if (tags.has('walkable') && tags.has('blocked')) issue(`${path}.tags`, 'terrain_conflict', 'tile cannot be both walkable and blocked');
    catalogTags.set(tileId, tags);
  }

  const sceneIds = new Set<string>();
  const sceneById = new Map<string, Record<string, unknown>>();
  const globalPlacementIds = new Set<string>();
  const globalSpawnIds = new Set<string>();
  const globalZoneIds = new Set<string>();
  const globalWarpIds = new Set<string>();
  const playerSpawnPaths: string[] = [];
  const graph = new Map<string, string[]>();
  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
    const scene = scenes[sceneIndex]; const base = `$.scenes[${sceneIndex}]`;
    if (!isRecord(scene)) { issue(base, 'type', 'scene must be an object'); continue; }
    if (!text(scene.id)) issue(`${base}.id`, 'id', 'must be a non-empty string');
    else if (sceneIds.has(scene.id)) issue(`${base}.id`, 'duplicate', `duplicate scene id "${scene.id}"`);
    else { sceneIds.add(scene.id); sceneById.set(scene.id, scene); graph.set(scene.id, []); }
    if (scene.title !== undefined && !text(scene.title)) issue(`${base}.title`, 'text', 'must be a non-empty string when present');
    const width = scene.width; const height = scene.height;
    if (!integer(width) || width < 1 || width > MAX_SCENE_SIDE) issue(`${base}.width`, 'range', `must be an integer from 1 to ${MAX_SCENE_SIDE}`);
    if (!integer(height) || height < 1 || height > MAX_SCENE_SIDE) issue(`${base}.height`, 'range', `must be an integer from 1 to ${MAX_SCENE_SIDE}`);
    if (integer(width) && integer(height) && width * height > MAX_SCENE_CELLS) issue(base, 'range', `scene may contain at most ${MAX_SCENE_CELLS} cells`);
    validateSceneCollections(scene, base, catalogTags, globalPlacementIds, globalSpawnIds, globalZoneIds, globalWarpIds, issue);
    if (Array.isArray(scene.spawnPoints)) for (let spawnIndex = 0; spawnIndex < scene.spawnPoints.length; spawnIndex++) {
      const spawn = scene.spawnPoints[spawnIndex];
      if (isRecord(spawn) && spawn.kind === 'player') playerSpawnPaths.push(`${base}.spawnPoints[${spawnIndex}].kind`);
    }
  }
  validateConstructionProjects(raw.constructionProjects, raw.itemCatalog, scenes, issue);
  if (playerSpawnPaths.length === 0) issue('$.scenes', 'player_spawn', 'must contain exactly one player spawn, found none');
  else if (playerSpawnPaths.length > 1) for (let i = 1; i < playerSpawnPaths.length; i++) issue(playerSpawnPaths[i]!, 'player_spawn', 'must contain exactly one player spawn');
  if (text(world.startSceneId) && !sceneIds.has(world.startSceneId)) issue('$.world.startSceneId', 'reference', 'references an unknown scene');

  // Second pass: dimensions and local references are only meaningful once all ids are known.
  const decodedByScene = new Map<string, Map<LifeLayerName, string[]>>();
  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
    const scene = scenes[sceneIndex]; if (!isRecord(scene) || !integer(scene.width) || !integer(scene.height) || !text(scene.id)) continue;
    const base = `$.scenes[${sceneIndex}]`; const width = scene.width; const height = scene.height;
    const decoded = decodeLayers(scene.layers, width, height, catalogTags, `${base}.layers`, issue);
    decodedByScene.set(scene.id, decoded);
    validateSpatialScene(scene, base, width, height, decoded, catalogTags, sceneById, graph, issue);
  }
  validateNpcSchedules(scenes, raw.calendar, sceneById, decodedByScene, catalogTags, issue);

  if (text(world.startSceneId) && sceneIds.has(world.startSceneId)) {
    const reached = new Set<string>([world.startSceneId]); const queue = [world.startSceneId];
    for (let head = 0; head < queue.length; head++) for (const to of graph.get(queue[head]!) ?? []) if (!reached.has(to)) { reached.add(to); queue.push(to); }
    for (let i = 0; i < scenes.length; i++) if (isRecord(scenes[i]) && text(scenes[i].id) && !reached.has(scenes[i].id)) issue(`$.scenes[${i}].id`, 'unreachable', 'scene is not reachable from world.startSceneId');
  }
  return { ok: issues.length === 0, issues };
}

function validateRelationships(raw:Record<string,unknown>,issue:IssueSink):void{
  if(raw.relationships===undefined)return;if(!Array.isArray(raw.relationships)){issue('$.relationships','type','must be an array');return}
  const npcs=new Set<string>();if(Array.isArray(raw.scenes))for(const scene of raw.scenes)if(isRecord(scene)&&Array.isArray(scene.placements))for(const placement of scene.placements)if(isRecord(placement)&&placement.kind==='npc'&&text(placement.id))npcs.add(placement.id);
  const items=new Set<string>();if(Array.isArray(raw.itemCatalog))for(const item of raw.itemCatalog)if(isRecord(item)&&text(item.id))items.add(item.id);
  const dialogueChoices=new Set<string>();if(Array.isArray(raw.dialogueCatalog))for(const dialogue of raw.dialogueCatalog)if(isRecord(dialogue)&&text(dialogue.id)&&isRecord(dialogue.graph))for(const node of Object.values(dialogue.graph))if(isRecord(node)&&node.kind==='choice'&&Array.isArray(node.options))for(const option of node.options)if(isRecord(option)&&text(option.id))dialogueChoices.add(`${dialogue.id}\0${option.id}`);
  const questNodes=new Set<string>();if(Array.isArray(raw.quests))for(const chapter of raw.quests)if(isRecord(chapter)&&Array.isArray(chapter.quests))for(const quest of chapter.quests)if(isRecord(quest)&&text(quest.id)&&Array.isArray(quest.nodes))for(const node of quest.nodes)if(isRecord(node)&&text(node.id))questNodes.add(`${quest.id}\0${node.id}`);
  const npcIds=new Set<string>(),ruleIds=new Set<string>();raw.relationships.forEach((relationship,index)=>{const path=`$.relationships[${index}]`;if(!isRecord(relationship)){issue(path,'type','must be an object');return}if(!text(relationship.npcId)||!npcs.has(relationship.npcId))issue(`${path}.npcId`,'reference','must reference an npc placement');else if(npcIds.has(relationship.npcId))issue(`${path}.npcId`,'duplicate','relationship npc must be unique');else npcIds.add(relationship.npcId);if(!integer(relationship.min)||!integer(relationship.max)||relationship.min>=relationship.max)issue(path,'range','min/max must be increasing integers');if(!integer(relationship.initial)||integer(relationship.min)&&relationship.initial<relationship.min||integer(relationship.max)&&relationship.initial>relationship.max)issue(`${path}.initial`,'range','must be an integer within min/max');if(!Array.isArray(relationship.levels)||relationship.levels.length===0)issue(`${path}.levels`,'required','must contain levels');else{let previous=-Infinity;const ids=new Set<string>();relationship.levels.forEach((level,i)=>{const levelPath=`${path}.levels[${i}]`;if(!isRecord(level)){issue(levelPath,'type','must be an object');return}if(!text(level.id)||ids.has(level.id))issue(`${levelPath}.id`,'duplicate','level id must be unique');else ids.add(level.id);if(!integer(level.min)||level.min<=previous)issue(`${levelPath}.min`,'order','levels must be strictly increasing');if(integer(level.min))previous=level.min;if(!text(level.titleKey))issue(`${levelPath}.titleKey`,'id','must be non-empty')});const first=relationship.levels[0];if(isRecord(first)&&first.min!==relationship.min)issue(`${path}.levels[0].min`,'range','first level must equal relationship min')}
    if(!isRecord(relationship.dailyCaps))issue(`${path}.dailyCaps`,'type','must be an object');else for(const key of ['talk','gift','action'] as const)if(!integer(relationship.dailyCaps[key])||relationship.dailyCaps[key]<0)issue(`${path}.dailyCaps.${key}`,'range','must be a non-negative integer');if(!Array.isArray(relationship.rules))issue(`${path}.rules`,'type','must be an array');else relationship.rules.forEach((rule,i)=>{const rulePath=`${path}.rules[${i}]`;if(!isRecord(rule)){issue(rulePath,'type','must be an object');return}if(!text(rule.id)||ruleIds.has(rule.id))issue(`${rulePath}.id`,'duplicate','rule id must be globally unique');else ruleIds.add(rule.id);if(!integer(rule.priority))issue(`${rulePath}.priority`,'type','must be an integer');if(rule.exclusiveGroup!==undefined&&!text(rule.exclusiveGroup))issue(`${rulePath}.exclusiveGroup`,'id','must be non-empty');if(!isRecord(rule.effect)||rule.effect.kind!=='relationship-delta'||!integer(rule.effect.amount)||rule.effect.amount===0)issue(`${rulePath}.effect`,'type','must be a non-zero integer relationship-delta');const trigger=rule.trigger;if(!isRecord(trigger)){issue(`${rulePath}.trigger`,'type','must be an object');return}switch(trigger.kind){case'talk-opened':break;case'talk-choice':if(!text(trigger.dialogueId)||!text(trigger.choiceId)||!dialogueChoices.has(`${trigger.dialogueId}\0${trigger.choiceId}`))issue(`${rulePath}.trigger`,'reference','unknown dialogue choice');break;case'life-action':if(typeof trigger.action!=='string'||!ACTIONS.has(trigger.action as LifeAction))issue(`${rulePath}.trigger.action`,'enum','unknown action');break;case'harvest':break;case'gather':if(trigger.action!==undefined&&trigger.action!=='forage'&&trigger.action!=='mine')issue(`${rulePath}.trigger.action`,'enum','must be forage or mine');break;case'gift':if(!text(trigger.itemId)||!items.has(trigger.itemId))issue(`${rulePath}.trigger.itemId`,'reference','unknown item');if(!integer(trigger.count)||trigger.count<=0)issue(`${rulePath}.trigger.count`,'range','must be positive');break;case'quest-effect':if(!text(trigger.questId)||!text(trigger.nodeId)||!questNodes.has(`${trigger.questId}\0${trigger.nodeId}`))issue(`${rulePath}.trigger`,'reference','unknown quest node');break;default:issue(`${rulePath}.trigger.kind`,'enum','unknown relationship trigger')}})
  });
}

function validateQuests(raw: Record<string, unknown>, issue: IssueSink): void {
  if (raw.quests === undefined) return;
  if (!Array.isArray(raw.quests)) { issue('$.quests', 'type', 'must be an array'); return; }
  const collectIds = (value: unknown, field = 'id'): Set<string> => new Set(Array.isArray(value) ? value.filter(isRecord).map((entry) => entry[field]).filter(text) : []);
  const logic = isRecord(raw.logic) ? raw.logic : {};
  const flags = collectIds(logic.flags); const resources = collectIds(logic.resources);
  const flagInitial = new Map<string, boolean>();
  if (Array.isArray(logic.flags)) for (const entry of logic.flags) if (isRecord(entry) && text(entry.id) && typeof entry.initial === 'boolean') flagInitial.set(entry.id, entry.initial);
  const items = collectIds(raw.itemCatalog); const crops = collectIds(raw.cropCatalog); const milestones = collectIds(raw.milestones);
  const seasons = collectIds(isRecord(raw.calendar) ? raw.calendar.seasons : undefined);
  const slots = new Set<string>(isRecord(raw.calendar) && Array.isArray(raw.calendar.slots) ? raw.calendar.slots.filter(text) : []);
  const placements = new Set<string>(); const resourceNodes = new Set<string>();
  if (Array.isArray(raw.scenes)) for (const scene of raw.scenes) if (isRecord(scene) && Array.isArray(scene.placements)) for (const placement of scene.placements) {
    if (!isRecord(placement) || !text(placement.id)) continue;
    placements.add(placement.id); if (placement.resourceNode !== undefined) resourceNodes.add(placement.id);
  }
  const dialogueChoices = new Set<string>();
  if (Array.isArray(raw.dialogueCatalog)) for (const dialogue of raw.dialogueCatalog) {
    if (!isRecord(dialogue) || !text(dialogue.id) || !isRecord(dialogue.graph)) continue;
    for (const node of Object.values(dialogue.graph)) if (isRecord(node) && node.kind === 'choice' && Array.isArray(node.options)) {
      for (const option of node.options) if (isRecord(option) && text(option.id)) dialogueChoices.add(`${dialogue.id}\u0000${option.id}`);
    }
  }
  const relationshipLevels=new Map<string,Set<string>>();if(Array.isArray(raw.relationships))for(const relationship of raw.relationships)if(isRecord(relationship)&&text(relationship.npcId))relationshipLevels.set(relationship.npcId,new Set(Array.isArray(relationship.levels)?relationship.levels.filter(isRecord).map((level)=>level.id).filter(text):[]));

  const chapterIds = new Set<string>(); const questIds = new Set<string>();
  const nodesByQuest = new Map<string, Set<string>>();
  const quests: Array<{ path:string; chapterId:string; value:Record<string,unknown> }> = [];
  raw.quests.forEach((chapter, chapterIndex) => {
    const chapterPath = `$.quests[${chapterIndex}]`;
    if (!isRecord(chapter)) { issue(chapterPath, 'type', 'must be an object'); return; }
    if (!text(chapter.id)) issue(`${chapterPath}.id`, 'id', 'must be non-empty');
    else if (chapterIds.has(chapter.id)) issue(`${chapterPath}.id`, 'duplicate', 'chapter id must be unique'); else chapterIds.add(chapter.id);
    if (!text(chapter.titleKey)) issue(`${chapterPath}.titleKey`, 'id', 'must be non-empty');
    if (!Array.isArray(chapter.quests) || chapter.quests.length === 0) { issue(`${chapterPath}.quests`, 'required', 'must contain quests'); return; }
    chapter.quests.forEach((quest, questIndex) => {
      const path = `${chapterPath}.quests[${questIndex}]`;
      if (!isRecord(quest)) { issue(path, 'type', 'must be an object'); return; }
      quests.push({ path, chapterId:text(chapter.id) ? chapter.id : '', value:quest });
      if (!text(quest.id)) issue(`${path}.id`, 'id', 'must be non-empty');
      else if (questIds.has(quest.id)) issue(`${path}.id`, 'duplicate', 'quest id must be globally unique'); else questIds.add(quest.id);
      if (quest.chapterId !== chapter.id) issue(`${path}.chapterId`, 'reference', 'must equal containing chapter id');
      if (!integer(quest.priority)) issue(`${path}.priority`, 'type', 'must be a safe integer');
      if (quest.exclusiveGroup !== undefined && !text(quest.exclusiveGroup)) issue(`${path}.exclusiveGroup`, 'id', 'must be non-empty');
      if (!text(quest.initialNodeId)) issue(`${path}.initialNodeId`, 'id', 'must be non-empty');
      if (!Array.isArray(quest.terminalNodeIds) || quest.terminalNodeIds.length === 0) issue(`${path}.terminalNodeIds`, 'required', 'must contain terminal nodes');
      if (!Array.isArray(quest.nodes) || quest.nodes.length === 0) { issue(`${path}.nodes`, 'required', 'must contain nodes'); return; }
      const ids = new Set<string>();
      quest.nodes.forEach((node, nodeIndex) => {
        const nodePath = `${path}.nodes[${nodeIndex}]`;
        if (!isRecord(node) || !text(node.id)) { issue(`${nodePath}.id`, 'id', 'must be non-empty'); return; }
        if (ids.has(node.id)) issue(`${nodePath}.id`, 'duplicate', 'node id must be unique inside quest'); else ids.add(node.id);
      });
      if (text(quest.id)) nodesByQuest.set(quest.id, ids);
    });
  });

  const validateCondition = (value:unknown, path:string, depth=0):void => {
    if (depth > 32) { issue(path, 'depth', 'condition nesting exceeds 32'); return; }
    if (!isRecord(value)) { issue(path, 'type', 'must be a condition object'); return; }
    switch (value.kind) {
      case 'always': return;
      case 'and': case 'or':
        if (!Array.isArray(value.of) || value.of.length === 0) issue(`${path}.of`, 'required', 'must be non-empty');
        else value.of.forEach((entry, i) => validateCondition(entry, `${path}.of[${i}]`, depth + 1));
        return;
      case 'not': validateCondition(value.of, `${path}.of`, depth + 1); return;
      case 'flag': if (!text(value.id) || !flags.has(value.id)) issue(`${path}.id`, 'reference', 'must reference logic.flags'); if (typeof value.equals !== 'boolean') issue(`${path}.equals`, 'type', 'must be boolean'); return;
      case 'resource': if (!text(value.id) || !resources.has(value.id)) issue(`${path}.id`, 'reference', 'must reference logic.resources'); if (typeof value.value !== 'number' || !Number.isFinite(value.value)) issue(`${path}.value`, 'type', 'must be finite'); return;
      case 'calendar':
        if (value.seasonId === undefined && value.dayOfSeason === undefined && value.slotId === undefined) issue(path, 'required', 'calendar condition needs a field');
        if (value.seasonId !== undefined && (!text(value.seasonId) || !seasons.has(value.seasonId))) issue(`${path}.seasonId`, 'reference', 'unknown season');
        if (value.dayOfSeason !== undefined && (!integer(value.dayOfSeason) || value.dayOfSeason < 1)) issue(`${path}.dayOfSeason`, 'range', 'must be positive');
        if (value.slotId !== undefined && (!text(value.slotId) || !slots.has(value.slotId))) issue(`${path}.slotId`, 'reference', 'unknown slot'); return;
      case 'inventory': if (value.inventoryId !== 'bag:life:player') issue(`${path}.inventoryId`, 'reference', 'must reference bag:life:player'); if (!text(value.itemId) || !items.has(value.itemId)) issue(`${path}.itemId`, 'reference', 'unknown item'); if (!integer(value.count) || value.count < 0) issue(`${path}.count`, 'range', 'must be non-negative'); return;
      case 'milestone': if (!text(value.id) || !milestones.has(value.id)) issue(`${path}.id`, 'reference', 'unknown milestone'); return;
      case 'resource-node': if (!text(value.placementId) || !resourceNodes.has(value.placementId)) issue(`${path}.placementId`, 'reference', 'unknown resource placement'); if (!['gte','lte','eq'].includes(String(value.cmp))) issue(`${path}.cmp`, 'enum', 'must be gte, lte or eq'); if (!integer(value.value) || value.value < 0) issue(`${path}.value`, 'range', 'must be non-negative'); return;
      case 'relationship': {const levels=typeof value.npcId==='string'?relationshipLevels.get(value.npcId):undefined;if(!levels)issue(`${path}.npcId`,'reference','unknown relationship npc');if(value.value===undefined&&value.levelId===undefined)issue(path,'required','requires value or levelId');if(value.value!==undefined&&!integer(value.value))issue(`${path}.value`,'type','must be an integer');if(value.cmp!==undefined&&!['lt','lte','eq','ne','gte','gt'].includes(String(value.cmp)))issue(`${path}.cmp`,'enum','unknown comparator');if(value.levelId!==undefined&&(!text(value.levelId)||!levels?.has(value.levelId)))issue(`${path}.levelId`,'reference','unknown relationship level');return;}
      default: issue(`${path}.kind`, 'enum', 'unknown quest condition kind');
    }
  };
  const writeKey = (effect:Record<string,unknown>):string|undefined => effect.kind === 'set-flag' ? `flag:${effect.id}` : effect.kind === 'unlock' ? `flag:${effect.flagId}` : effect.kind === 'add-resource' ? `resource:${effect.id}` : effect.kind === 'inventory' ? `inventory:${effect.inventoryId}:${effect.itemId}` : effect.kind === 'set-node-state' ? `quest:${effect.questId}:${effect.nodeId}` : effect.kind==='relationship-delta'?`relationship:${effect.npcId}`:undefined;
  const conditionNeedsFlag = (value:unknown, id:string, expected:boolean):boolean => {
    if (!isRecord(value)) return false;
    if (value.kind === 'flag') return value.id === id && value.equals === expected;
    if ((value.kind === 'and' || value.kind === 'or') && Array.isArray(value.of)) return value.of.some((entry) => conditionNeedsFlag(entry,id,expected));
    return value.kind === 'not' ? conditionNeedsFlag(value.of,id,!expected) : false;
  };
  const initial: Array<{ path:string; trigger:string; group?:string; writes:Set<string> }> = [];

  for (const { path, value:quest } of quests) {
    const questId = text(quest.id) ? quest.id : ''; const ids = nodesByQuest.get(questId) ?? new Set<string>();
    if (text(quest.initialNodeId) && !ids.has(quest.initialNodeId)) issue(`${path}.initialNodeId`, 'reference', 'unknown node');
    const terminalIds = new Set<string>();
    if (Array.isArray(quest.terminalNodeIds)) quest.terminalNodeIds.forEach((value, i) => {
      if (!text(value) || !ids.has(value)) issue(`${path}.terminalNodeIds[${i}]`, 'reference', 'unknown node');
      else if (terminalIds.has(value)) issue(`${path}.terminalNodeIds[${i}]`, 'duplicate', 'must not repeat'); else terminalIds.add(value);
    });
    if (!Array.isArray(quest.nodes)) continue;
    const questNodes = quest.nodes; const edges = new Map<string, Set<string>>([...ids].map((id) => [id, new Set<string>()]));
    questNodes.forEach((node, nodeIndex) => {
      const nodePath = `${path}.nodes[${nodeIndex}]`;
      if (!isRecord(node) || !text(node.id)) return;
      if (!text(node.titleKey)) issue(`${nodePath}.titleKey`, 'id', 'must be non-empty');
      if (!text(node.objectiveKey)) issue(`${nodePath}.objectiveKey`, 'id', 'must be non-empty');
      if (node.loop !== undefined && typeof node.loop !== 'boolean') issue(`${nodePath}.loop`, 'type', 'must be boolean');
      const trigger = node.trigger;
      if (!isRecord(trigger)) issue(`${nodePath}.trigger`, 'type', 'must be an object');
      else switch (trigger.kind) {
        case 'game-start': if (node.id !== quest.initialNodeId) issue(`${nodePath}.trigger`, 'phase', 'game-start is valid only on the initial node'); break;
        case 'calendar': if (trigger.boundary !== 'slot' && trigger.boundary !== 'day') issue(`${nodePath}.trigger.boundary`, 'enum', 'must be slot or day'); if (trigger.seasonId !== undefined && (!text(trigger.seasonId) || !seasons.has(trigger.seasonId))) issue(`${nodePath}.trigger.seasonId`, 'reference', 'unknown season'); if (trigger.dayOfSeason !== undefined && (!integer(trigger.dayOfSeason) || trigger.dayOfSeason < 1)) issue(`${nodePath}.trigger.dayOfSeason`, 'range', 'must be positive'); if (trigger.slotId !== undefined && (!text(trigger.slotId) || !slots.has(trigger.slotId))) issue(`${nodePath}.trigger.slotId`, 'reference', 'unknown slot'); break;
        case 'life-action': if (typeof trigger.action !== 'string' || !ACTIONS.has(trigger.action as LifeAction)) issue(`${nodePath}.trigger.action`, 'enum', 'unknown action'); if (trigger.targetId !== undefined && (!text(trigger.targetId) || !placements.has(trigger.targetId))) issue(`${nodePath}.trigger.targetId`, 'reference', 'unknown placement'); break;
        case 'talk-choice': if (!text(trigger.dialogueId) || !text(trigger.choiceId) || !dialogueChoices.has(`${trigger.dialogueId}\u0000${trigger.choiceId}`)) issue(`${nodePath}.trigger`, 'reference', 'unknown dialogue choice id'); break;
        case 'harvest': if (trigger.cropId !== undefined && (!text(trigger.cropId) || !crops.has(trigger.cropId))) issue(`${nodePath}.trigger.cropId`, 'reference', 'unknown crop'); if (trigger.itemId !== undefined && (!text(trigger.itemId) || !items.has(trigger.itemId))) issue(`${nodePath}.trigger.itemId`, 'reference', 'unknown item'); break;
        case 'gather': if (trigger.action !== undefined && trigger.action !== 'forage' && trigger.action !== 'mine') issue(`${nodePath}.trigger.action`, 'enum', 'must be forage or mine'); if (trigger.placementId !== undefined && (!text(trigger.placementId) || !resourceNodes.has(trigger.placementId))) issue(`${nodePath}.trigger.placementId`, 'reference', 'unknown resource placement'); if (trigger.itemId !== undefined && (!text(trigger.itemId) || !items.has(trigger.itemId))) issue(`${nodePath}.trigger.itemId`, 'reference', 'unknown item'); break;
        default: issue(`${nodePath}.trigger.kind`, 'enum', 'unknown quest trigger kind');
      }
      if (node.when !== undefined) validateCondition(node.when, `${nodePath}.when`);
      if (!Array.isArray(node.effects) || node.effects.length === 0) { issue(`${nodePath}.effects`, 'required', 'must contain effects'); return; }
      const writes = new Set<string>(); let selfTerminal = false;
      node.effects.forEach((effect, effectIndex) => {
        const effectPath = `${nodePath}.effects[${effectIndex}]`;
        if (!isRecord(effect)) { issue(effectPath, 'type', 'must be an object'); return; }
        const key = writeKey(effect); if (key && writes.has(key)) issue(effectPath, 'write_conflict', `duplicate logical target ${key}`); if (key) writes.add(key);
        switch (effect.kind) {
          case 'set-flag': if (!text(effect.id) || !flags.has(effect.id)) issue(`${effectPath}.id`, 'reference', 'unknown flag'); if (typeof effect.value !== 'boolean') issue(`${effectPath}.value`, 'type', 'must be boolean'); break;
          case 'unlock': if (!text(effect.flagId) || !flags.has(effect.flagId)) issue(`${effectPath}.flagId`, 'reference', 'unknown flag'); break;
          case 'add-resource': if (!text(effect.id) || !resources.has(effect.id)) issue(`${effectPath}.id`, 'reference', 'unknown resource'); if (typeof effect.amount !== 'number' || !Number.isFinite(effect.amount)) issue(`${effectPath}.amount`, 'type', 'must be finite'); break;
          case 'inventory': if (effect.inventoryId !== 'bag:life:player') issue(`${effectPath}.inventoryId`, 'reference', 'must reference bag:life:player'); if (!text(effect.itemId) || !items.has(effect.itemId)) issue(`${effectPath}.itemId`, 'reference', 'unknown item'); if (!integer(effect.amount) || effect.amount === 0) issue(`${effectPath}.amount`, 'range', 'must be non-zero integer'); break;
          case 'set-node-state':
            if (!text(effect.questId) || !text(effect.nodeId) || !nodesByQuest.get(effect.questId)?.has(effect.nodeId)) issue(effectPath, 'reference', 'unknown quest node');
            if (!['locked','active','completed','failed'].includes(String(effect.state))) issue(`${effectPath}.state`, 'enum', 'unknown node state');
            if (effect.questId === questId && effect.nodeId === node.id && (effect.state === 'completed' || effect.state === 'failed')) selfTerminal = true;
            if (effect.questId === questId && effect.state === 'active' && typeof effect.nodeId === 'string' && effect.nodeId.length > 0) edges.get(String(node.id))?.add(effect.nodeId);
            break;
          case 'relationship-delta': if(!text(effect.ruleId))issue(`${effectPath}.ruleId`,'id','must be non-empty');if(!integer(effect.priority))issue(`${effectPath}.priority`,'type','must be an integer');if(effect.exclusiveGroup!==undefined&&!text(effect.exclusiveGroup))issue(`${effectPath}.exclusiveGroup`,'id','must be non-empty');if(!text(effect.npcId)||!relationshipLevels.has(effect.npcId))issue(`${effectPath}.npcId`,'reference','unknown relationship npc');if(!integer(effect.amount)||effect.amount===0)issue(`${effectPath}.amount`,'range','must be a non-zero integer');break;
          default: issue(`${effectPath}.kind`, 'enum', 'unknown quest effect kind');
        }
      });
      if (!selfTerminal) issue(`${nodePath}.effects`, 'terminal_write', 'node must set itself completed or failed');
      for (const effect of node.effects) if (isRecord(effect)) {
        const id=effect.kind==='set-flag'&&text(effect.id)?effect.id:effect.kind==='unlock'&&text(effect.flagId)?effect.flagId:undefined;
        const value=effect.kind==='set-flag'&&typeof effect.value==='boolean'?effect.value:effect.kind==='unlock'?true:undefined;
        if(id!==undefined&&value!==undefined&&flagInitial.get(id)!==value&&conditionNeedsFlag(node.when,id,value)) issue(`${nodePath}.when`,'self_lock',`node requires flag ${id} that only its own effect establishes`);
      }
      if (node.id === quest.initialNodeId && isRecord(trigger)) initial.push({ path:nodePath, trigger:JSON.stringify(trigger), group:text(quest.exclusiveGroup) ? quest.exclusiveGroup : undefined, writes });
    });
    if (text(quest.initialNodeId) && ids.has(quest.initialNodeId)) {
      const reached = new Set<string>([quest.initialNodeId]); const queue = [quest.initialNodeId];
      for (let i=0;i<queue.length;i++) for (const target of edges.get(queue[i]!) ?? []) if (!reached.has(target)) { reached.add(target); queue.push(target); }
      for (const id of ids) if (!reached.has(id)) issue(`${path}.nodes`, 'dead_node', `node ${id} is unreachable`);
      for (const id of terminalIds) if (!reached.has(id)) issue(`${path}.terminalNodeIds`, 'unreachable', `terminal ${id} is unreachable`);
    }
    const indexMap=new Map<string,number>(), low=new Map<string,number>(), stack:string[]=[], onStack=new Set<string>(); let next=0;
    const visit=(id:string):void=>{indexMap.set(id,next);low.set(id,next++);stack.push(id);onStack.add(id);for(const to of edges.get(id)??[]){if(!indexMap.has(to)){visit(to);low.set(id,Math.min(low.get(id)!,low.get(to)!))}else if(onStack.has(to))low.set(id,Math.min(low.get(id)!,indexMap.get(to)!))}if(low.get(id)!==indexMap.get(id))return;const scc:string[]=[];for(;;){const item=stack.pop()!;onStack.delete(item);scc.push(item);if(item===id)break}if(scc.length===1&&!edges.get(id)?.has(id))return;const members=new Set(scc);const allLoop=scc.every((nodeId)=>{const found=questNodes.find((entry)=>isRecord(entry)&&entry.id===nodeId);return isRecord(found)&&found.loop===true});const hasExit=scc.some((nodeId)=>[...(edges.get(nodeId)??[])].some((to)=>!members.has(to)));if(!allLoop||!hasExit)issue(`${path}.nodes`,'cycle','cycles require loop:true and an explicit exit')};
    for(const id of ids)if(!indexMap.has(id))visit(id);
  }
  for(let i=0;i<initial.length;i++)for(let j=i+1;j<initial.length;j++){const a=initial[i]!,b=initial[j]!;if(a.trigger!==b.trigger)continue;const shared=[...a.writes].find((key)=>b.writes.has(key));if(shared&&(!a.group||a.group!==b.group))issue(b.path,'write_conflict',`concurrent initial nodes write ${shared}`)}
}

function validateMilestones(rawLogic: unknown, rawMilestones: unknown, issue:(p:string,c:string,m:string)=>void): void {
  const flags = new Set<string>(), resources = new Set<string>();
  if (rawLogic !== undefined) {
    if (!isRecord(rawLogic)) issue('$.logic','type','must be an object');
    else {
      for (const [field, ids] of [['flags', flags], ['resources', resources]] as const) if (rawLogic[field] !== undefined) {
        if (!Array.isArray(rawLogic[field])) { issue(`$.logic.${field}`,'type','must be an array'); continue; }
        rawLogic[field].forEach((entry, i) => { const p=`$.logic.${field}[${i}]`; if(!isRecord(entry)||!text(entry.id)) issue(`${p}.id`,'id','must be non-empty'); else if(ids.has(entry.id))issue(`${p}.id`,'duplicate','must be unique'); else ids.add(entry.id); if(field==='flags'&&(!isRecord(entry)||typeof entry.initial!=='boolean'))issue(`${p}.initial`,'type','must be boolean'); if(field==='resources'&&(!isRecord(entry)||![entry.initial,entry.min,entry.max].every((v)=>typeof v==='number'&&Number.isFinite(v))||Number(entry.min)>Number(entry.max)||Number(entry.initial)<Number(entry.min)||Number(entry.initial)>Number(entry.max)))issue(p,'range','resource initial must be within finite min/max'); });
      }
    }
  }
  if (rawMilestones === undefined) return;
  if (!Array.isArray(rawMilestones)) { issue('$.milestones','type','must be an array'); return; }
  const ids = new Set<string>();
  rawMilestones.forEach((value, i) => { const p=`$.milestones[${i}]`; if(!isRecord(value)){issue(p,'type','must be an object');return;} if(!text(value.id))issue(`${p}.id`,'id','must be non-empty');else if(ids.has(value.id))issue(`${p}.id`,'duplicate','must be unique');else ids.add(value.id); if(value.trigger!=='harvest.applied')issue(`${p}.trigger`,'enum','must be harvest.applied'); if(value.repeat!=='once'&&value.repeat!=='always')issue(`${p}.repeat`,'enum','must be once or always'); const effects=value.effects; if(!isRecord(effects)) {issue(`${p}.effects`,'type','must be an object');return;} const fs=effects.flags, rs=effects.resources; if((!Array.isArray(fs)||fs.length===0)&&(!Array.isArray(rs)||rs.length===0))issue(`${p}.effects`,'required','must contain a flag or resource effect'); if(fs!==undefined&&!Array.isArray(fs))issue(`${p}.effects.flags`,'type','must be an array'); if(rs!==undefined&&!Array.isArray(rs))issue(`${p}.effects.resources`,'type','must be an array'); if(Array.isArray(fs))fs.forEach((e,j)=>{if(!isRecord(e)||!text(e.id)||!flags.has(e.id))issue(`${p}.effects.flags[${j}].id`,'reference','must reference logic.flags');if(!isRecord(e)||typeof e.value!=='boolean')issue(`${p}.effects.flags[${j}].value`,'type','must be boolean');}); if(Array.isArray(rs))rs.forEach((e,j)=>{if(!isRecord(e)||!text(e.id)||!resources.has(e.id))issue(`${p}.effects.resources[${j}].id`,'reference','must reference logic.resources');if(!isRecord(e)||typeof e.amount!=='number'||!Number.isFinite(e.amount))issue(`${p}.effects.resources[${j}].amount`,'type','must be finite');}); });
}

function validateAccessRequirements(scenes: unknown[], rawLogic: unknown, rawConstruction: unknown, issue:(p:string,c:string,m:string)=>void): void {
  const flags = new Set<string>(), resources = new Set<string>();
  if (isRecord(rawLogic)) {
    for (const [field, target] of [['flags', flags], ['resources', resources]] as const) if (Array.isArray(rawLogic[field])) for (const entry of rawLogic[field]) if (isRecord(entry) && text(entry.id)) target.add(entry.id);
  }
  const check = (value: unknown, path: string): void => {
    if (value === undefined) return;
    if (!isRecord(value)) { issue(path, 'type', 'must be a closed access requirement'); return; }
    if (value.kind === 'flag') { if (!text(value.id) || !flags.has(value.id)) issue(`${path}.id`, 'reference', 'must reference logic.flags'); if (typeof value.equals !== 'boolean') issue(`${path}.equals`, 'type', 'must be boolean'); return; }
    if (value.kind === 'resource') { if (!text(value.id) || !resources.has(value.id)) issue(`${path}.id`, 'reference', 'must reference logic.resources'); if (value.op !== '>=') issue(`${path}.op`, 'enum', 'must be >='); if (typeof value.value !== 'number' || !Number.isFinite(value.value)) issue(`${path}.value`, 'type', 'must be finite'); return; }
    issue(`${path}.kind`, 'enum', 'must be flag or resource');
  };
  for (let si=0; si<scenes.length; si++) { const scene=scenes[si]; if(!isRecord(scene)) continue; for (const field of ['warps','zones','placements'] as const) if (Array.isArray(scene[field])) scene[field].forEach((value, i) => { if (isRecord(value)) check(value.requires, `$.scenes[${si}].${field}[${i}].requires`); }); }
  if (Array.isArray(rawConstruction)) rawConstruction.forEach((value, index) => { if (isRecord(value)) check(value.requires, `$.constructionProjects[${index}].requires`); });
}

function validateConstructionProjects(rawProjects: unknown, rawItems: unknown, scenes: unknown[], issue: IssueSink): void {
  if (rawProjects === undefined) return;
  if (!Array.isArray(rawProjects)) { issue('$.constructionProjects', 'type', 'must be an array'); return; }
  const itemIds = new Set<string>();
  if (Array.isArray(rawItems)) for (const item of rawItems) if (isRecord(item) && text(item.id)) itemIds.add(item.id);
  const placements = new Map<string, string>();
  for (const scene of scenes) if (isRecord(scene) && Array.isArray(scene.placements)) for (const placement of scene.placements) {
    if (isRecord(placement) && text(placement.id) && typeof placement.kind === 'string') placements.set(placement.id, placement.kind);
  }
  const projectIds = new Set<string>();
  const placementIds = new Set<string>();
  rawProjects.forEach((value, index) => {
    const path = `$.constructionProjects[${index}]`;
    if (!isRecord(value)) { issue(path, 'type', 'must be an object'); return; }
    if (!text(value.id)) issue(`${path}.id`, 'id', 'must be a non-empty string');
    else if (projectIds.has(value.id)) issue(`${path}.id`, 'duplicate', 'construction project id must be unique');
    else projectIds.add(value.id);
    const kind = text(value.placementId) ? placements.get(value.placementId) : undefined;
    if (!kind) issue(`${path}.placementId`, 'reference', 'must reference a placement');
    else if (kind !== 'building' && kind !== 'interactable') issue(`${path}.placementId`, 'kind', 'must reference a building or interactable placement');
    else if (placementIds.has(value.placementId as string)) issue(`${path}.placementId`, 'duplicate', 'a placement may have only one construction project');
    else placementIds.add(value.placementId as string);
    if (!Array.isArray(value.materials) || value.materials.length === 0) issue(`${path}.materials`, 'required', 'must contain at least one material');
    else {
      const materialIds = new Set<string>();
      value.materials.forEach((material, materialIndex) => {
        const materialPath = `${path}.materials[${materialIndex}]`;
        if (!isRecord(material)) { issue(materialPath, 'type', 'must be an object'); return; }
        if (!text(material.itemId) || !itemIds.has(material.itemId)) issue(`${materialPath}.itemId`, 'reference', 'must reference itemCatalog');
        else if (materialIds.has(material.itemId)) issue(`${materialPath}.itemId`, 'duplicate', 'material item must not repeat');
        else materialIds.add(material.itemId);
        if (!integer(material.count) || material.count <= 0) issue(`${materialPath}.count`, 'range', 'must be a positive safe integer');
      });
    }
    if (!opaqueSkinKey(value.completedSkinKey) || !(value.completedSkinKey as string).startsWith('art:')) issue(`${path}.completedSkinKey`, 'skin_key', 'must be an opaque art: skin key');
  });
}

function validateCalendar(raw: unknown, issue:(p:string,c:string,m:string)=>void):void {
  if(raw===undefined)return;
  if(!isRecord(raw)){issue('$.calendar','type','must be an object');return}
  if(!Array.isArray(raw.seasons)||raw.seasons.length===0){issue('$.calendar.seasons','required','must contain at least one season');return}
  const ids=new Set<string>(); let initialLength=0;
  for(let i=0;i<raw.seasons.length;i++){const s=raw.seasons[i],p=`$.calendar.seasons[${i}]`;if(!isRecord(s)){issue(p,'type','season must be an object');continue}if(!text(s.id))issue(`${p}.id`,'id','must be non-empty');else if(ids.has(s.id))issue(`${p}.id`,'duplicate','season id must be unique');else ids.add(s.id);if(!integer(s.lengthDays)||s.lengthDays<=0)issue(`${p}.lengthDays`,'range','must be positive integer');if(s.id===raw.initialSeasonId&&integer(s.lengthDays))initialLength=s.lengthDays}
  if(!text(raw.initialSeasonId)||!ids.has(raw.initialSeasonId))issue('$.calendar.initialSeasonId','reference','must name a season');
  if(!integer(raw.initialDayOfSeason)||raw.initialDayOfSeason<=0||raw.initialDayOfSeason>initialLength)issue('$.calendar.initialDayOfSeason','range','must be within initial season');
  if (raw.slots === undefined) {
    if (raw.initialSlot !== undefined) issue('$.calendar.initialSlot','forbidden','requires calendar.slots');
    return;
  }
  if (!Array.isArray(raw.slots) || raw.slots.length < 2) { issue('$.calendar.slots','range','must contain at least two slots'); return; }
  const slots = new Set<string>();
  raw.slots.forEach((slot, i) => { if(!text(slot))issue(`$.calendar.slots[${i}]`,'id','must be a non-empty string');else if(slots.has(slot))issue(`$.calendar.slots[${i}]`,'duplicate','slot id must be unique');else slots.add(slot); });
  if (!text(raw.initialSlot) || !slots.has(raw.initialSlot)) issue('$.calendar.initialSlot','reference','must name a calendar slot');
}

function validateNpcSchedules(
  scenes: unknown[], rawCalendar: unknown, sceneById: ReadonlyMap<string, Record<string, unknown>>,
  decodedByScene: ReadonlyMap<string, ReadonlyMap<LifeLayerName, string[]>>,
  catalog: ReadonlyMap<string, ReadonlySet<LifeTileTag>>, issue:(p:string,c:string,m:string)=>void,
): void {
  const slots = isRecord(rawCalendar) && Array.isArray(rawCalendar.slots) && rawCalendar.slots.every(text) ? rawCalendar.slots as string[] : ['day'];
  for (let si=0; si<scenes.length; si++) {
    const scene=scenes[si]; if(!isRecord(scene)||!Array.isArray(scene.placements))continue;
    for(let pi=0;pi<scene.placements.length;pi++){
      const placement=scene.placements[pi]; if(!isRecord(placement)||placement.schedule===undefined)continue;
      const base=`$.scenes[${si}].placements[${pi}].schedule`;
      if(!(isRecord(rawCalendar)&&Array.isArray(rawCalendar.slots))){issue(base,'forbidden','requires authored calendar.slots');continue}
      if(placement.kind!=='npc') issue(base,'forbidden','only npc placement may declare schedule');
      if(!Array.isArray(placement.schedule)||placement.schedule.length===0){issue(base,'required','must contain one entry for every calendar slot');continue}
      const seen=new Set<string>();
      for(let ei=0;ei<placement.schedule.length;ei++){
        const entry=placement.schedule[ei], p=`${base}[${ei}]`;
        if(!isRecord(entry)){issue(p,'type','must be an object');continue}
        if(!text(entry.slot)||!slots.includes(entry.slot))issue(`${p}.slot`,'reference','must reference calendar.slots');else if(seen.has(entry.slot))issue(`${p}.slot`,'duplicate','slot must not repeat');else seen.add(entry.slot);
        if(typeof entry.visible!=='boolean')issue(`${p}.visible`,'type','must be boolean');
        if(typeof entry.interactive!=='boolean')issue(`${p}.interactive`,'type','must be boolean');
        const sceneId=text(entry.sceneId)?entry.sceneId:undefined;
        const target=sceneId===undefined?undefined:sceneById.get(sceneId);
        if(!target){issue(`${p}.sceneId`,'reference','references an unknown scene');continue}
        if(!integer(entry.x)||!integer(entry.y)||!integer(target.width)||!integer(target.height)||!inBounds(entry.x,entry.y,target.width,target.height)){issue(p,'bounds','must be an integer coordinate inside target scene');continue}
        const layers=decodedByScene.get(sceneId!); let blocked=false;
        if(layers) for(const cells of layers.values()) for(const tag of catalog.get(cells[index(entry.x,entry.y,target.width)])??[]) if(tag==='blocked')blocked=true;
        if(blocked)issue(p,'blocked_placement','scheduled npc cannot occupy a blocked cell');
      }
      for(const slot of slots)if(!seen.has(slot))issue(base,'coverage',`missing schedule entry for slot "${slot}"`);
    }
  }
}

function validateCrops(rawCrops: unknown, rawItems: unknown, issue: (p:string,c:string,m:string)=>void): void {
  if (rawCrops === undefined) return;
  if (!Array.isArray(rawCrops)) { issue('$.cropCatalog','type','must be an array'); return; }
  const items = new Map<string, string>();
  if (Array.isArray(rawItems)) for (const item of rawItems) if (isRecord(item) && text(item.id) && typeof item.kind === 'string') items.set(item.id,item.kind);
  const ids=new Set<string>(), seeds=new Set<string>();
  for(let i=0;i<rawCrops.length;i++){const crop=rawCrops[i],p=`$.cropCatalog[${i}]`;if(!isRecord(crop)){issue(p,'type','crop must be an object');continue}
    if(!text(crop.id))issue(`${p}.id`,'id','must be a non-empty string');else if(ids.has(crop.id))issue(`${p}.id`,'duplicate','crop id must be unique');else ids.add(crop.id);
    if(!text(crop.seedItemId)||items.get(crop.seedItemId)!=='seed')issue(`${p}.seedItemId`,'reference','must reference a seed item');else if(seeds.has(crop.seedItemId))issue(`${p}.seedItemId`,'duplicate','seed maps to at most one crop');else seeds.add(crop.seedItemId);
    if(!text(crop.harvestItemId)||items.get(crop.harvestItemId)!=='crop')issue(`${p}.harvestItemId`,'reference','must reference a crop item');
    if(!integer(crop.growthDays)||crop.growthDays<=0)issue(`${p}.growthDays`,'range','must be a positive integer');
    if(crop.visual!==undefined){if(!isRecord(crop.visual)){issue(`${p}.visual`,'type','must be an object')}else for(const key of ['seededSkinKey','growingSkinKey','matureSkinKey'])if(!opaqueSkinKey(crop.visual[key]))issue(`${p}.visual.${key}`,'skin_key','must be an opaque key, not a path or URL');}
  }
}

function validateResourceNodes(scenes: unknown[], rawItems: unknown, issue:(p:string,c:string,m:string)=>void):void {
  const items=new Map<string,string>(); if(Array.isArray(rawItems)) for(const item of rawItems) if(isRecord(item)&&text(item.id)&&typeof item.kind==='string') items.set(item.id,item.kind);
  for(let si=0;si<scenes.length;si++){const scene=scenes[si];if(!isRecord(scene)||!Array.isArray(scene.placements))continue;for(let pi=0;pi<scene.placements.length;pi++){const placement=scene.placements[pi];if(!isRecord(placement))continue;const p=`$.scenes[${si}].placements[${pi}]`;const node=placement.resourceNode;if(placement.kind==='resource'&&node===undefined){issue(`${p}.resourceNode`,'required','resource placement requires resourceNode');continue}if(placement.kind!=='resource'&&node!==undefined){issue(`${p}.resourceNode`,'forbidden','only resource placement may declare resourceNode');continue}if(node===undefined)continue;if(!isRecord(node)){issue(`${p}.resourceNode`,'type','must be an object');continue}if(node.action!=='forage'&&node.action!=='mine')issue(`${p}.resourceNode.action`,'enum','must be forage or mine');if(!text(node.itemId)||!['resource','good'].includes(items.get(node.itemId)??''))issue(`${p}.resourceNode.itemId`,'reference','must reference resource or good item');if(!integer(node.quantity)||node.quantity<=0)issue(`${p}.resourceNode.quantity`,'range','must be a positive integer');}}
}

function validateDialogues(scenes: unknown[], raw: unknown, issue:(p:string,c:string,m:string)=>void):void {
  const ids=new Set<string>();
  if(raw!==undefined&&!Array.isArray(raw)){issue('$.dialogueCatalog','type','must be an array');return}
  if(Array.isArray(raw))for(let i=0;i<raw.length;i++){
    const d=raw[i],p=`$.dialogueCatalog[${i}]`;
    if(!isRecord(d)){issue(p,'type','must be an object');continue}
    if(!text(d.id))issue(`${p}.id`,'id','must be non-empty');else if(ids.has(d.id))issue(`${p}.id`,'duplicate','must be unique');else ids.add(d.id);
    if(!isRecord(d.graph)||Object.keys(d.graph).length===0){issue(`${p}.graph`,'type','must be a non-empty node object');continue}
    const choiceIds=new Set<string>();
    for(const [nodeId,node] of Object.entries(d.graph)){
      if(!isRecord(node)||node.kind!=='choice'||!Array.isArray(node.options))continue;
      node.options.forEach((option,index)=>{
        if(!isRecord(option)||option.id===undefined)return;
        const path=`${p}.graph.${jsonKey(nodeId)}.options[${index}].id`;
        if(!text(option.id))issue(path,'id','must be non-empty when present');
        else if(choiceIds.has(option.id))issue(path,'duplicate','choice id must be unique inside dialogue');
        else choiceIds.add(option.id);
      });
    }
  }
  for(let si=0;si<scenes.length;si++){const scene=scenes[si];if(!isRecord(scene)||!Array.isArray(scene.placements))continue;for(let pi=0;pi<scene.placements.length;pi++){const x=scene.placements[pi];if(!isRecord(x))continue;const p=`$.scenes[${si}].placements[${pi}]`;const n=x.npcDialogue;if(x.kind==='npc'&&n===undefined){issue(`${p}.npcDialogue`,'required','npc requires npcDialogue');continue}if(x.kind!=='npc'&&n!==undefined){issue(`${p}.npcDialogue`,'forbidden','only npc may declare npcDialogue');continue}if(n!==undefined&&(!isRecord(n)||!text(n.dialogueId)||!ids.has(n.dialogueId)))issue(`${p}.npcDialogue.dialogueId`,'reference','references an unknown dialogue');}}
}

/** Schema-v1 compatibility: omitted item fields mean an empty static catalog and an empty 10×99 player bag. */
function validateItems(rawCatalog: unknown, rawInventory: unknown, issue: (p: string, c: string, m: string) => void): void {
  if (rawCatalog === undefined && rawInventory === undefined) return;
  if (!Array.isArray(rawCatalog)) { issue('$.itemCatalog', 'type', 'must be an array when item data is declared'); return; }
  const itemIds = new Set<string>();
  for (let i = 0; i < rawCatalog.length; i++) {
    const item = rawCatalog[i]; const path = `$.itemCatalog[${i}]`;
    if (!isRecord(item)) { issue(path, 'type', 'item must be an object'); continue; }
    if (!text(item.id)) issue(`${path}.id`, 'id', 'must be a non-empty string');
    else if (itemIds.has(item.id)) issue(`${path}.id`, 'duplicate', 'item id must be globally unique'); else itemIds.add(item.id);
    if (typeof item.kind !== 'string' || !ITEM_KINDS.has(item.kind as LifeItemKind)) issue(`${path}.kind`, 'enum', 'unknown item kind');
    if (!text(item.skinKey) || /[\\/]|^(?:https?|data|file):/i.test(item.skinKey)) issue(`${path}.skinKey`, 'skin_key', 'must be an opaque key, not a path or URL');
  }
  if (rawInventory === undefined) { issue('$.playerInventory', 'required', 'is required when itemCatalog is declared'); return; }
  if (!isRecord(rawInventory)) { issue('$.playerInventory', 'type', 'must be an object'); return; }
  if (!integer(rawInventory.slots) || rawInventory.slots <= 0) issue('$.playerInventory.slots', 'range', 'must be a positive integer');
  if (!integer(rawInventory.maxStack) || rawInventory.maxStack <= 0) issue('$.playerInventory.maxStack', 'range', 'must be a positive integer');
  if (!Array.isArray(rawInventory.items)) { issue('$.playerInventory.items', 'type', 'must be an array'); return; }
  if (integer(rawInventory.slots) && rawInventory.items.length > rawInventory.slots) issue('$.playerInventory.items', 'slots', 'cannot exceed slots; Inventory stacks are compact');
  for (let i = 0; i < rawInventory.items.length; i++) {
    const stack = rawInventory.items[i]; const path = `$.playerInventory.items[${i}]`;
    if (!isRecord(stack)) { issue(path, 'type', 'stack must be an object'); continue; }
    if (!text(stack.itemId) || !itemIds.has(stack.itemId)) issue(`${path}.itemId`, 'reference', 'references an unknown itemCatalog id');
    if (!integer(stack.count) || stack.count <= 0) issue(`${path}.count`, 'range', 'must be a positive integer');
    else if (integer(rawInventory.maxStack) && rawInventory.maxStack > 0 && stack.count > rawInventory.maxStack) issue(`${path}.count`, 'range', 'cannot exceed playerInventory.maxStack');
  }
}

function validateSceneCollections(scene: Record<string, unknown>, base: string, catalog: ReadonlyMap<string, ReadonlySet<LifeTileTag>>, placementIds: Set<string>, spawnIds: Set<string>, zoneIds: Set<string>, warpIds: Set<string>, issue: (p: string, c: string, m: string) => void): void {
  for (const field of ['layers', 'spawnPoints', 'zones', 'warps', 'placements'] as const) if (!Array.isArray(scene[field])) issue(`${base}.${field}`, 'type', 'must be an array');
  if (!Array.isArray(scene.layers)) return;
  const names = new Set<string>();
  for (let i = 0; i < scene.layers.length; i++) {
    const layer = scene.layers[i]; const p = `${base}.layers[${i}]`;
    if (!isRecord(layer)) { issue(p, 'type', 'layer must be an object'); continue; }
    if (typeof layer.name !== 'string' || !(LAYERS as readonly string[]).includes(layer.name)) issue(`${p}.name`, 'enum', 'must be ground, collision, or interaction');
    else if (names.has(layer.name)) issue(`${p}.name`, 'duplicate', 'layer name must not repeat'); else names.add(layer.name);
    if (!Array.isArray(layer.tiles)) issue(`${p}.tiles`, 'type', 'must be an array');
    else for (let j = 0; j < layer.tiles.length; j++) { const run = layer.tiles[j]; const rp = `${p}.tiles[${j}]`; if (!isRecord(run) || !text(run.tileId) || !integer(run.count) || run.count <= 0) issue(rp, 'rle', 'each run needs a known non-empty tileId and positive integer count'); else if (!catalog.has(run.tileId)) issue(`${rp}.tileId`, 'reference', 'references an unknown tileCatalog entry'); }
  }
  for (const name of LAYERS) if (!names.has(name)) issue(`${base}.layers`, 'required', `missing ${name} layer`);
  validateIds(scene.spawnPoints, `${base}.spawnPoints`, SPAWNS, spawnIds, issue);
  validateIds(scene.zones, `${base}.zones`, ZONES, zoneIds, issue);
  validateIds(scene.warps, `${base}.warps`, undefined, warpIds, issue);
  if (Array.isArray(scene.placements)) for (let i = 0; i < scene.placements.length; i++) { const x = scene.placements[i]; const p = `${base}.placements[${i}]`; if (!isRecord(x) || !text(x.id)) { issue(`${p}.id`, 'id', 'must be a non-empty string'); continue; } if (placementIds.has(x.id)) issue(`${p}.id`, 'duplicate', 'placement id must be globally unique'); else placementIds.add(x.id); if (typeof x.kind !== 'string' || !PLACEMENTS.has(x.kind as LifePlacementKind)) issue(`${p}.kind`, 'enum', 'unknown placement kind'); if (!text(x.prefabRef)) issue(`${p}.prefabRef`, 'reference', 'must be a non-empty prefab reference'); if (!text(x.skinKey) || /[\\/]|:\/\//.test(x.skinKey)) issue(`${p}.skinKey`, 'skin_key', 'must be a key, not a path or URL'); if (x.interactionRange !== undefined && (!integer(x.interactionRange) || x.interactionRange < 0 || x.interactionRange > 8)) issue(`${p}.interactionRange`, 'range', 'must be an integer from 0 to 8'); }
}

function validateIds(items: unknown, path: string, allowed: ReadonlySet<string> | undefined, ids: Set<string>, issue: (p: string, c: string, m: string) => void): void {
  if (!Array.isArray(items)) return;
  for (let i = 0; i < items.length; i++) { const item = items[i]; const p = `${path}[${i}]`; if (!isRecord(item) || !text(item.id)) { issue(`${p}.id`, 'id', 'must be a non-empty string'); continue; } if (ids.has(item.id)) issue(`${p}.id`, 'duplicate', 'id must be globally unique'); else ids.add(item.id); if (allowed && (typeof item.kind !== 'string' || !allowed.has(item.kind))) issue(`${p}.kind`, 'enum', 'unknown kind'); }
}

function decodeLayers(raw: unknown, width: number, height: number, catalog: ReadonlyMap<string, ReadonlySet<LifeTileTag>>, path: string, issue: (p: string, c: string, m: string) => void): Map<LifeLayerName, string[]> {
  const out = new Map<LifeLayerName, string[]>(); if (!Array.isArray(raw)) return out; const expected = width * height;
  for (let i = 0; i < raw.length; i++) { const layer = raw[i]; if (!isRecord(layer) || typeof layer.name !== 'string' || !(LAYERS as readonly string[]).includes(layer.name) || !Array.isArray(layer.tiles)) continue; const cells: string[] = []; for (const run of layer.tiles) if (isRecord(run) && text(run.tileId) && integer(run.count) && run.count > 0 && catalog.has(run.tileId)) for (let n = 0; n < run.count && cells.length <= expected; n++) cells.push(run.tileId); if (cells.length !== expected) issue(`${path}[${i}].tiles`, 'rle_length', `decoded tile count must equal ${expected}, got ${cells.length}`); out.set(layer.name as LifeLayerName, cells); }
  return out;
}

function validateSpatialScene(scene: Record<string, unknown>, base: string, width: number, height: number, layers: ReadonlyMap<LifeLayerName, string[]>, catalog: ReadonlyMap<string, ReadonlySet<LifeTileTag>>, sceneById: ReadonlyMap<string, Record<string, unknown>>, graph: Map<string, string[]>, issue: (p: string, c: string, m: string) => void): void {
  const tagsAt = (x: number, y: number): Set<LifeTileTag> => { const tags = new Set<LifeTileTag>(); for (const cells of layers.values()) for (const tag of catalog.get(cells[index(x, y, width)]) ?? []) tags.add(tag); return tags; };
  const point = (v: unknown, p: string): v is { x: number; y: number } => { if (!isRecord(v) || !integer(v.x) || !integer(v.y) || !inBounds(v.x, v.y, width, height)) { issue(p, 'bounds', 'must be an integer coordinate inside the scene'); return false; } return true; };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const tags = tagsAt(x, y); if (tags.has('walkable') && tags.has('blocked')) issue(`${base}.layers`, 'terrain_conflict', `ground/collision semantics conflict at (${x},${y})`); }
  if (Array.isArray(scene.spawnPoints)) for (let i = 0; i < scene.spawnPoints.length; i++) {
    const sp = scene.spawnPoints[i]; const p = `${base}.spawnPoints[${i}]`;
    if (!isRecord(sp) || !point(sp, p)) continue;
    const spawnKind = (sp as Record<string, unknown>).kind;
    if (spawnKind === 'player' && (!tagsAt(sp.x, sp.y).has('walkable') || tagsAt(sp.x, sp.y).has('blocked')))
      issue(p, 'not_walkable', 'player spawn must land on a walkable, non-blocked cell');
  }
  if (Array.isArray(scene.zones)) for (let i = 0; i < scene.zones.length; i++) { const zone = scene.zones[i]; const p = `${base}.zones[${i}]`; if (!isRecord(zone) || !isRecord(zone.rect) || !integer(zone.rect.x) || !integer(zone.rect.y) || !integer(zone.rect.width) || !integer(zone.rect.height) || zone.rect.width < 1 || zone.rect.height < 1 || !inBounds(zone.rect.x, zone.rect.y, width, height) || zone.rect.x + zone.rect.width > width || zone.rect.y + zone.rect.height > height) { issue(`${p}.rect`, 'bounds', 'must be a positive in-bounds rectangle'); continue; } if (!Array.isArray(zone.allowedActions)) { issue(`${p}.allowedActions`, 'type', 'must be an array'); continue; } const required = zone.kind === 'farm' ? 'plantable' : zone.kind === 'fishing' ? 'water' : zone.kind === 'forage' ? 'forage' : zone.kind === 'mining' ? 'mineable' : undefined; let found = false; for (let y = zone.rect.y; y < zone.rect.y + zone.rect.height; y++) for (let x = zone.rect.x; x < zone.rect.x + zone.rect.width; x++) { const tags = tagsAt(x, y); if (required && tags.has(required)) found = true; if (tags.has('blocked') && zone.allowedActions.length > 0) issue(`${p}.rect`, 'blocked_activity', `actionable zone includes blocked cell (${x},${y})`); } if (required && !found) issue(`${p}.rect`, 'zone_terrain', `${zone.kind} zone must contain at least one ${required} cell`); for (let j = 0; j < zone.allowedActions.length; j++) if (typeof zone.allowedActions[j] !== 'string' || !ACTIONS.has(zone.allowedActions[j] as LifeAction)) issue(`${p}.allowedActions[${j}]`, 'enum', 'unknown action'); }
  if (Array.isArray(scene.warps)) for (let i = 0; i < scene.warps.length; i++) {
    const warp = scene.warps[i]; const p = `${base}.warps[${i}]`;
    if (!isRecord(warp) || !point(warp.at, `${p}.at`)) continue;
    if (warp.label !== undefined && !text(warp.label)) issue(`${p}.label`, 'text', 'must be a non-empty string when present');
    if (!tagsAt(warp.at.x, warp.at.y).has('walkable') || tagsAt(warp.at.x, warp.at.y).has('blocked')) issue(`${p}.at`, 'not_walkable', 'warp must land on a walkable, non-blocked cell');
    if (!text(warp.toSceneId) || !sceneById.has(warp.toSceneId)) { issue(`${p}.toSceneId`, 'reference', 'references an unknown scene'); continue; }
    graph.get(scene.id as string)?.push(warp.toSceneId);
    const target = sceneById.get(warp.toSceneId)!; const targetSpawns = Array.isArray(target.spawnPoints) ? target.spawnPoints : [];
    if (!targetSpawns.some((s) => isRecord(s) && s.id === warp.toSpawnId)) issue(`${p}.toSpawnId`, 'reference', 'references an unknown spawn in target scene');
  }
  if (Array.isArray(scene.placements)) for (let i = 0; i < scene.placements.length; i++) { const item = scene.placements[i]; const p = `${base}.placements[${i}]`; if (!isRecord(item) || !integer(item.x) || !integer(item.y) || !integer(item.width) || !integer(item.height) || item.width < 1 || item.height < 1 || item.x < 0 || item.y < 0 || item.x + item.width > width || item.y + item.height > height) { issue(p, 'bounds', 'placement footprint must be positive and inside the scene'); continue; } if ((item.kind === 'npc' || item.kind === 'resource' || item.kind === 'interactable') && tagsAt(item.x, item.y).has('blocked')) issue(p, 'blocked_placement', `${item.kind} cannot be placed on a blocked cell`); }
}

function jsonKey(key: string): string { return /^[A-Za-z_$][\w$]*$/.test(key) ? key : `[${JSON.stringify(key)}]`; }
