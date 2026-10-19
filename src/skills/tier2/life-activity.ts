import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import { cmpStr } from '@engine/math/scalar.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { DebugTrace, LifeActivityContext, LifeActor, LifeConstructionProject, LifeCrop, LifeCropCatalog, LifeDialogueCatalog, LifeDialogueSession, LifeFarmPlot, LifeInteractionAffordance, LifeItemCatalog, LifePlacement, LifePosition, LifeRelationshipCatalog, LifeRelationshipState, LifeResourceNode, LifeScene, LifeSpawn, LifeTileCatalog, LifeWarp, LifeZone } from '@engine/protocol/components.js';
import { LIFE_AFFORDANCE_ACTIONS, LIFE_AFFORDANCE_TARGET_KINDS, LIFE_AFFORDANCE_UNAVAILABLE_REASONS } from '@engine/protocol/components/life-activity.js';
import { lifeFarmPlotEntityId } from '@engine/protocol/life-farming.js';
import { LIFE_ACTIONS, type LifeAction } from '@engine/protocol/life-sim.js';
import { lifeGroundTagsAt } from '@engine/protocol/life-tilemap.js';
import { appendTrace, findDebugTrace } from '../debug-trace.js';
import { lifeAccessMet } from './life-access.js';
import { invCanAdd, invHas, type Inventory } from './inventory.js';

export const LIFE_ACTIVITY_CAPABILITY_ID = 't2-life-activity';

function inRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** Manhattan distance from a grid cell to the closest cell in a half-open placement footprint. */
function footprintDistance(x: number, y: number, placement: LifePlacement): number {
  const dx = x < placement.x ? placement.x - x : x >= placement.x + placement.width ? x - (placement.x + placement.width - 1) : 0;
  const dy = y < placement.y ? placement.y - y : y >= placement.y + placement.height ? y - (placement.y + placement.height - 1) : 0;
  return dx + dy;
}

function sameContext(a: LifeActivityContext | undefined, b: Omit<LifeActivityContext, 'type'>): boolean {
  return !!a && a.sceneId === b.sceneId && a.x === b.x && a.y === b.y
    && a.zoneIds.join('\u0000') === b.zoneIds.join('\u0000')
    && a.allowedActions.join('\u0000') === b.allowedActions.join('\u0000')
    && a.nearbyPlacementIds.join('\u0000') === b.nearbyPlacementIds.join('\u0000') && a.nearbyWarpIds.join('\u0000') === b.nearbyWarpIds.join('\u0000');
}

const affordanceSchema = t.union([
  t.obj({ id: t.str(), action: t.enum(LIFE_AFFORDANCE_ACTIONS), targetKind: t.enum(LIFE_AFFORDANCE_TARGET_KINDS), targetId: t.str(), available: t.lit(true), candidateItemIds: t.opt(t.arr(t.str())) }),
  t.obj({ id: t.str(), action: t.enum(LIFE_AFFORDANCE_ACTIONS), targetKind: t.enum(LIFE_AFFORDANCE_TARGET_KINDS), targetId: t.str(), available: t.lit(false), reason: t.enum(LIFE_AFFORDANCE_UNAVAILABLE_REASONS), candidateItemIds: t.opt(t.arr(t.str())) }),
], 'available');

function affordanceId(targetKind: LifeInteractionAffordance['targetKind'], targetId: string, action: LifeInteractionAffordance['action']): string {
  return `${targetKind}:${encodeURIComponent(targetId)}:${action}`;
}

function sameAffordances(a: readonly LifeInteractionAffordance[], b: readonly LifeInteractionAffordance[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface AffordanceDerivation { affordances: LifeInteractionAffordance[]; suppressed: string[] }

/** Purely derives current interaction affordances; action systems remain the final legality gates. */
export function deriveLifeAffordances(world: IWorld, actorId: string, context: LifeActivityContext): AffordanceDerivation {
  const out: LifeInteractionAffordance[] = [];
  const suppressed: string[] = [];
  const add = (value: Omit<LifeInteractionAffordance, 'id'>): void => {
    out.push({ id: affordanceId(value.targetKind, value.targetId, value.action), ...value });
  };
  const allowed = new Set(context.allowedActions);
  const sceneById = new Map<string, LifeScene>();
  for (const entityId of sortedIds(world, 'LifeScene')) {
    const scene = world.getComponent<LifeScene>(entityId, 'LifeScene');
    if (scene && !sceneById.has(scene.sceneId)) sceneById.set(scene.sceneId, scene);
  }
  const placementById = new Map<string, { entityId: string; value: LifePlacement }>();
  for (const entityId of sortedIds(world, 'LifePlacement')) {
    const value = world.getComponent<LifePlacement>(entityId, 'LifePlacement');
    if (value && !placementById.has(value.placementId)) placementById.set(value.placementId, { entityId, value });
  }
  const warpById = new Map<string, LifeWarp>();
  for (const entityId of sortedIds(world, 'LifeWarp')) {
    const value = world.getComponent<LifeWarp>(entityId, 'LifeWarp');
    if (value && !warpById.has(value.warpId)) warpById.set(value.warpId, value);
  }
  const spawnKeys = new Set<string>();
  for (const entityId of sortedIds(world, 'LifeSpawn')) {
    const value = world.getComponent<LifeSpawn>(entityId, 'LifeSpawn');
    if (value) spawnKeys.add(`${value.sceneId}\u0000${value.spawnId}`);
  }
  const tileCatalogId = world.singleton('LifeTileCatalog');
  const itemCatalogId = world.singleton('LifeItemCatalog');
  const cropCatalogId = world.singleton('LifeCropCatalog');
  const dialogueCatalogId = world.singleton('LifeDialogueCatalog');
  const tileCatalog = tileCatalogId === undefined ? undefined : world.getComponent<LifeTileCatalog>(tileCatalogId, 'LifeTileCatalog');
  const itemCatalog = itemCatalogId === undefined ? undefined : world.getComponent<LifeItemCatalog>(itemCatalogId, 'LifeItemCatalog');
  const cropCatalog = cropCatalogId === undefined ? undefined : world.getComponent<LifeCropCatalog>(cropCatalogId, 'LifeCropCatalog');
  const dialogueCatalog = dialogueCatalogId === undefined ? undefined : world.getComponent<LifeDialogueCatalog>(dialogueCatalogId, 'LifeDialogueCatalog');
  const inventory = world.getComponent<Inventory>(actorId, 'Inventory');
  const relationshipCatalogId=world.singleton('LifeRelationshipCatalog'),relationshipStateId=world.singleton('LifeRelationshipState');
  const relationshipCatalog=relationshipCatalogId===undefined?undefined:world.getComponent<LifeRelationshipCatalog>(relationshipCatalogId,'LifeRelationshipCatalog');
  const relationshipState=relationshipStateId===undefined?undefined:world.getComponent<LifeRelationshipState>(relationshipStateId,'LifeRelationshipState');
  const projectByPlacement = new Map<string, LifeConstructionProject>();
  for (const entityId of sortedIds(world, 'LifeConstructionProject')) {
    const project = world.getComponent<LifeConstructionProject>(entityId, 'LifeConstructionProject');
    if (project && !projectByPlacement.has(project.placementId)) projectByPlacement.set(project.placementId, project);
  }
  const validSeeds = (itemCatalog?.items ?? [])
    .filter((item) => item.kind === 'seed' && !!inventory && invHas(inventory, item.id) && cropCatalog?.crops.some((crop) => crop.seedItemId === item.id))
    .map((item) => item.id).sort(cmpStr);

  const scene = sceneById.get(context.sceneId);
  const plantable = !!scene && !!tileCatalog && lifeGroundTagsAt(scene.layers, tileCatalog.tiles, scene.width, context.x, context.y).includes('plantable');
  if (plantable) {
    const tileTarget = `${context.sceneId}:${context.x},${context.y}`;
    const plotId = lifeFarmPlotEntityId(context.sceneId, context.x, context.y);
    const plot = world.getComponent<LifeFarmPlot>(plotId, 'LifeFarmPlot');
    const crop = world.getComponent<LifeCrop>(plotId, 'LifeCrop');
    let action: 'till' | 'water' | 'plant' | 'harvest' | undefined;
    let stateReason: LifeInteractionAffordance['reason'];
    if (!plot) action = 'till';
    else if (crop?.stage === 'mature') action = 'harvest';
    else if (crop) { action = 'water'; if (plot.soil === 'watered') stateReason = 'already-watered'; }
    else action = plot.soil === 'tilled' ? 'water' : 'plant';
    if (action) {
      let reason: LifeInteractionAffordance['reason'];
      if (!allowed.has(action)) reason = 'zone-disallowed';
      else if (stateReason) reason = stateReason;
      else if (action === 'plant' && validSeeds.length === 0) reason = 'missing-seed';
      else if (action === 'harvest') {
        const spec = cropCatalog?.crops.find((candidate) => candidate.id === crop?.cropId);
        const item = itemCatalog?.items.find((candidate) => candidate.id === spec?.harvestItemId);
        if (!spec || !item || item.kind !== 'crop') reason = 'invalid-target';
        else if (!inventory || !invCanAdd(inventory, item.id, 1)) reason = 'inventory-full';
      }
      add({ action, targetKind: 'tile', targetId: tileTarget, available: reason === undefined, ...(reason ? { reason } : {}), ...(action === 'plant' ? { candidateItemIds: validSeeds } : {}) });
    }
  }

  const dialogueOpen = sortedIds(world, 'LifeDialogueSession').some((entityId) => world.getComponent<LifeDialogueSession>(entityId, 'LifeDialogueSession')?.status === 'open');
  for (const placementId of context.nearbyPlacementIds) {
    const pair = placementById.get(placementId);
    if (!pair) { suppressed.push(`${placementId}=invalid-target`); continue; }
    const { entityId, value } = pair;
    const project = projectByPlacement.get(placementId);
    if (project && !project.completed) {
      let reason: LifeInteractionAffordance['reason'];
      if (!allowed.has('build')) reason = 'zone-disallowed';
      else if (!lifeAccessMet(world, value.requires) || !lifeAccessMet(world, project.requires)) reason = 'locked';
      else if (!inventory || !project.materials.every((material) => invHas(inventory, material.itemId, material.count))) reason = 'missing-materials';
      add({ action: 'build', targetKind: 'placement', targetId: placementId, available: reason === undefined, ...(reason ? { reason } : {}) });
    }
    if (value.kind === 'resource') {
      const node = world.getComponent<LifeResourceNode>(entityId, 'LifeResourceNode');
      if (!node) { suppressed.push(`${placementId}=invalid-target`); continue; }
      let reason: LifeInteractionAffordance['reason'];
      if (!allowed.has(node.action)) reason = 'zone-disallowed';
      else if (node.remaining <= 0) reason = 'depleted';
      else {
        const item = itemCatalog?.items.find((candidate) => candidate.id === node.itemId);
        if (!item || (item.kind !== 'resource' && item.kind !== 'good')) reason = 'invalid-target';
        else if (!inventory || !invCanAdd(inventory, node.itemId, 1)) reason = 'inventory-full';
      }
      add({ action: node.action, targetKind: 'placement', targetId: placementId, available: reason === undefined, ...(reason ? { reason } : {}) });
    } else if (value.kind === 'npc') {
      let reason: LifeInteractionAffordance['reason'];
      if (value.visible === false || value.interactive === false) reason = 'invalid-target';
      else if (!allowed.has('talk')) reason = 'zone-disallowed';
      else if (dialogueOpen) reason = 'dialogue-open';
      else if (!value.npcDialogueId || !dialogueCatalog?.dialogues.some((dialogue) => dialogue.id === value.npcDialogueId)) reason = 'missing-dialogue';
      add({ action: 'talk', targetKind: 'placement', targetId: placementId, available: reason === undefined, ...(reason ? { reason } : {}) });
      const relationship=relationshipCatalog?.relationships.find((entry)=>entry.npcId===placementId);const relationshipEntry=relationshipState?.entries.find((entry)=>entry.npcId===placementId);const giftItems=[...new Set((relationship?.rules??[]).filter((rule)=>rule.trigger.kind==='gift').map((rule)=>(rule.trigger as {kind:'gift';itemId:string}).itemId).filter((itemId)=>!!inventory&&invHas(inventory,itemId)))].sort(cmpStr);if(relationship){let giftReason:LifeInteractionAffordance['reason'];if(!allowed.has('gift'))giftReason='zone-disallowed';else if(!relationshipEntry||relationshipEntry.giftSpent>=relationship.dailyCaps.gift)giftReason='relationship-cap';else if(giftItems.length===0)giftReason='missing-gift';add({action:'gift',targetKind:'placement',targetId:placementId,available:giftReason===undefined,...(giftReason?{reason:giftReason}:{}),candidateItemIds:giftItems})}
    }
  }

  for (const warpId of context.nearbyWarpIds) {
    const warp = warpById.get(warpId);
    if (!warp) { add({ action: 'warp', targetKind: 'warp', targetId: warpId, available: false, reason: 'invalid-target' }); continue; }
    const access = lifeAccessMet(world, warp.requires);
    const targetExists = sceneById.has(warp.toSceneId) && spawnKeys.has(`${warp.toSceneId}\u0000${warp.toSpawnId}`);
    const reason: LifeInteractionAffordance['reason'] = !access ? 'locked' : !targetExists ? 'invalid-target' : undefined;
    add({ action: 'warp', targetKind: 'warp', targetId: warpId, available: reason === undefined, ...(reason ? { reason } : {}) });
  }
  out.sort((a, b) => cmpStr(a.id, b.id));
  suppressed.sort(cmpStr);
  return { affordances: out, suppressed };
}

/** LifePosition → zones, author-allowed actions, and nearby static placements. It never resolves an action. */
export const lifeActivityCapability = defineCapability({
  id: LIFE_ACTIVITY_CAPABILITY_ID, version: '1.1.0',
  describe: {
    name: 'life activity context', summary: 'Derives static zone/proximity context plus current-state interaction affordances from the Life world.',
    semantic: ['tier2', 'life-sim', 'spatial-context', 'activity', 'affordance'],
    whenToUse: 'Use after t2-life-navigation when gameplay or UI needs both author-declared zone permissions and a UI-neutral snapshot of actions currently available on tiles, placements, or warps. Effects and final legality remain in action capabilities.',
    examples: ['watered empty plot + held seed → available plant affordance with candidateItemIds', 'depleted resource or locked warp → unavailable affordance with a closed reason'],
  },
  components: { provides: {
    LifeActivityContext: defineComponent('LifeActivityContext', {
      sceneId: t.str(), x: t.num(), y: t.num(), zoneIds: t.arr(t.str()), allowedActions: t.arr(t.enum(LIFE_ACTIONS)), nearbyPlacementIds: t.arr(t.str()), nearbyWarpIds: t.arr(t.str()), affordances: t.arr(affordanceSchema),
    }, { category: 'resource', describe: 'Derived actor action context. Static author permissions/proximity stay separate from the current-state, UI-neutral affordance projection; all arrays are unique and lexically sorted.' }),
  }, reads: ['LifeActor', 'LifePosition', 'LifeScene', 'LifeZone', 'LifePlacement', 'LifeWarp', 'LifeSpawn', 'Flag', 'Resource', 'LifeActivityContext', 'LifeTileCatalog', 'LifeItemCatalog', 'LifeCropCatalog', 'Inventory', 'LifeFarmPlot', 'LifeCrop', 'LifeResourceNode', 'LifeConstructionProject', 'LifeDialogueCatalog', 'LifeDialogueSession','LifeRelationshipCatalog','LifeRelationshipState', 'DebugTrace'], writes: ['LifeActivityContext'], consumes: [] }, config: {},
  systems: [{
    id: 'life-activity', runsAfter: ['life-navigation', 'life-position-sync'],
    reads: ['LifeActor', 'LifePosition', 'LifeScene', 'LifeZone', 'LifePlacement', 'LifeWarp', 'Flag', 'Resource', 'DebugTrace'], writes: ['LifeActivityContext'], consumes: [],
    execute(world: IWorld) {
      const scenes = new Map<string, LifeScene>();
      const zones: LifeZone[] = []; const placements: LifePlacement[] = []; const warps: LifeWarp[] = [];
      for (const id of sortedIds(world, 'LifeScene')) { const value = world.getComponent<LifeScene>(id, 'LifeScene'); if (value) scenes.set(value.sceneId, value); }
      for (const id of sortedIds(world, 'LifeZone')) { const value = world.getComponent<LifeZone>(id, 'LifeZone'); if (value) zones.push(value); }
      for (const id of sortedIds(world, 'LifePlacement')) { const value = world.getComponent<LifePlacement>(id, 'LifePlacement'); if (value) placements.push(value); }
      for (const id of sortedIds(world, 'LifeWarp')) { const value = world.getComponent<LifeWarp>(id, 'LifeWarp'); if (value) warps.push(value); }
      const trace = findDebugTrace(world); let traceCount = 0;
      const record = (kind: 'transition' | 'commit' | 'reject', what: string, why?: string) => {
        if (!trace || traceCount >= 3) return;
        appendTrace(trace, trace.tick ?? world.getVersion(), 'life-activity', kind, what, why); traceCount++;
      };
      for (const actorId of sortedIds(world, 'LifeActor', 'LifePosition')) {
        const actor = world.getComponent<LifeActor>(actorId, 'LifeActor'); const position = world.getComponent<LifePosition>(actorId, 'LifePosition');
        if (!actor || !position) continue;
        if (!scenes.has(position.sceneId)) {
          if (world.hasComponent(actorId, 'LifeActivityContext')) world.removeComponent(actorId, 'LifeActivityContext');
          record('reject', `${actorId} context rejected`, `unknown scene=${position.sceneId}`); continue;
        }
        const zoneIds = new Set<string>(); const actions = new Set<LifeAction>(); const nearby = new Set<string>(); const nearbyWarps = new Set<string>();
        for (const zone of zones) if (zone.sceneId === position.sceneId && inRect(position.x, position.y, zone.geometry) && lifeAccessMet(world, zone.requires)) { zoneIds.add(zone.zoneId); for (const action of zone.allowedActions) actions.add(action); }
        for (const placement of placements) if (placement.visible !== false && placement.interactive !== false && placement.sceneId === position.sceneId && footprintDistance(position.x, position.y, placement) <= placement.interactionRange && lifeAccessMet(world, placement.requires)) nearby.add(placement.placementId);
        for (const warp of warps) if (warp.sceneId === position.sceneId && position.x >= warp.x && position.x < warp.x + warp.width && position.y >= warp.y && position.y < warp.y + warp.height) nearbyWarps.add(warp.warpId);
        const current = world.getComponent<LifeActivityContext>(actorId, 'LifeActivityContext');
        const next = { sceneId: position.sceneId, x: position.x, y: position.y, zoneIds: [...zoneIds].sort(cmpStr), allowedActions: [...actions].sort(cmpStr), nearbyPlacementIds: [...nearby].sort(cmpStr), nearbyWarpIds: [...nearbyWarps].sort(cmpStr), affordances: current?.affordances ?? [] };
        if (sameContext(current, next)) continue;
        record('transition', `${actorId} context ${current?.sceneId ?? 'none'}→${next.sceneId}`, `at=${next.x},${next.y}`);
        world.addComponent(actorId, { type: 'LifeActivityContext', ...next } as LifeActivityContext);
        record('commit', `${actorId} LifeActivityContext`, `zones=${next.zoneIds.join('|') || '-'} actions=${next.allowedActions.join('|') || '-'}`);
      }
    },
  }, {
    id: 'life-affordance',
    phase: SystemPhase.Commit,
    runsBefore: ['life-construction', 'life-relationship', 'life-quest'],
    reads: ['LifeActor', 'LifeActivityContext', 'LifeScene', 'LifePlacement', 'LifeWarp', 'LifeSpawn', 'Flag', 'Resource', 'LifeTileCatalog', 'LifeItemCatalog', 'LifeCropCatalog', 'Inventory', 'LifeFarmPlot', 'LifeCrop', 'LifeResourceNode', 'LifeConstructionProject', 'LifeDialogueCatalog', 'LifeDialogueSession','LifeRelationshipCatalog','LifeRelationshipState', 'DebugTrace'],
    writes: ['LifeActivityContext'], consumes: [],
    execute(world: IWorld) {
      const trace = findDebugTrace(world); let traceCount = 0;
      const record = (kind: 'decision' | 'commit' | 'reject', what: string, why?: string): void => {
        if (!trace || traceCount >= 3) return;
        appendTrace(trace, trace.tick ?? world.getVersion(), 'life-affordance', kind, what, why); traceCount += 1;
      };
      for (const actorId of sortedIds(world, 'LifeActor', 'LifeActivityContext')) {
        const actor = world.getComponent<LifeActor>(actorId, 'LifeActor');
        const current = world.getComponent<LifeActivityContext>(actorId, 'LifeActivityContext');
        if (!actor || !current || actor.kind !== 'player') continue;
        const { affordances, suppressed } = deriveLifeAffordances(world, actorId, current);
        if (sameAffordances(current.affordances, affordances)) continue;
        record('decision', `${actorId} affordances derived`, affordances.map((entry) => entry.id).join('|') || 'none');
        const unavailable = affordances.filter((entry) => !entry.available).map((entry) => `${entry.id}=${entry.reason}`).concat(suppressed);
        if (unavailable.length > 0) record('reject', `${actorId} interactions unavailable`, unavailable.join('|'));
        world.addComponent(actorId, { ...current, affordances } as LifeActivityContext);
        record('commit', `${actorId} LifeActivityContext.affordances`, `count=${affordances.length}`);
      }
    },
  }],
});
