import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import { Engine } from '@runtime/engine.js';
import { SystemPhase } from '@engine/core/types.js';
import { validate } from '@engine/core/schema.js';
import { applyCommands } from '@net/commands.js';
import { QueuedInputSource } from '@net/host/index.js';
import { hashSnapshot } from '@net/determinism.js';
import type { DebugTrace, Flag, LifeActivityContext, LifeActor, LifeCrop, LifeDialogueCatalog, LifeDialogueSession, LifeFarmPlot, LifeItemCatalog, LifePlacement, LifePosition, LifeResourceNode, LifeScene, LifeSpawn, LifeTileCatalog, LifeWarp, LifeZone } from '@engine/protocol/components.js';
import { lifeFarmPlotEntityId } from '@engine/protocol/life-farming.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import { lifeActivityCapability } from './life-activity.js';
import type { Inventory } from './inventory.js';

const context = (world: World, id = 'life:player') => world.getComponent<LifeActivityContext>(id, 'LifeActivityContext')!;
function engine(): Engine { const value = new Engine(); value.load(compileAndParseLifeGamePackage(threeSceneLifePackage()).blueprint); return value; }
function requestMove(value: Engine, dx: number, dy: number): void { value.world.addComponent('life:player', { type: 'LifeMoveRequest', dx, dy }); value.world.tick(); }
function requestWarp(value: Engine, warpId: string): void { value.world.addComponent('life:player', { type: 'LifeWarpRequest', warpId }); value.world.tick(); }
function requestAction(value: Engine, source: QueuedInputSource, action: string): void { source.enqueueAction('life.action', { arg: action }); applyCommands(value.world, source.commandsForTick(value.world.getVersion() + 1)); value.world.tick(); }

function spatialWorld(): World {
  const world = new World(); for (const system of lifeActivityCapability.systems) world.addSystem(system);
  world.createEntity('scene'); world.addComponent('scene', { type: 'LifeScene', sceneId: 's', width: 8, height: 8, layers: [], zones: [], warps: [], spawnPoints: [], placements: [] } as LifeScene);
  for (const zone of [
    { id: 'b-zone', x: 0, y: 0, width: 2, height: 2, allowedActions: ['talk', 'forage'] },
    { id: 'a-zone', x: 1, y: 1, width: 2, height: 2, allowedActions: ['plant', 'forage'] },
  ]) { world.createEntity(`zone:${zone.id}`); world.addComponent(`zone:${zone.id}`, { type: 'LifeZone', sceneId: 's', zoneId: zone.id, kind: 'town', geometry: { x: zone.x, y: zone.y, width: zone.width, height: zone.height }, allowedActions: zone.allowedActions } as LifeZone); }
  for (const placement of [
    { id: 'on', sceneId: 's', x: 1, y: 1, width: 1, height: 1, interactionRange: 0 }, { id: 'wide', sceneId: 's', x: 2, y: 1, width: 2, height: 2, interactionRange: 1 },
    { id: 'diagonal', sceneId: 's', x: 2, y: 2, width: 1, height: 1, interactionRange: 1 }, { id: 'far', sceneId: 's', x: 7, y: 7, width: 1, height: 1, interactionRange: 1 }, { id: 'other-scene', sceneId: 'other', x: 1, y: 1, width: 1, height: 1, interactionRange: 1 },
  ]) { world.createEntity(`placement:${placement.id}`); world.addComponent(`placement:${placement.id}`, { type: 'LifePlacement', sceneId: placement.sceneId, placementId: placement.id, x: placement.x, y: placement.y, width: placement.width, height: placement.height, interactionRange: placement.interactionRange, kind: 'resource', prefabRef: 'resource.test', skinKey: 'resource:test' } as LifePlacement); }
  world.createEntity('actor'); world.addComponent('actor', { type: 'LifeActor', actorId: 'actor', kind: 'player' } as LifeActor); world.addComponent('actor', { type: 'LifePosition', sceneId: 's', x: 1, y: 1 } as LifePosition);
  return world;
}

function affordanceWorld(reversePlacements = false, withTrace = false): World {
  const world = new World({ strict: true });
  for (const system of lifeActivityCapability.systems) world.addSystem(system);
  const add = (id: string, component: any): void => { world.createEntity(id); world.addComponent(id, component); };
  add('catalog:tiles', { type: 'LifeTileCatalog', tiles: [{ tileId: 'soil', tags: ['walkable', 'plantable'] }] } as LifeTileCatalog);
  add('catalog:items', { type: 'LifeItemCatalog', items: [
    { id: 'seed.zeta', kind: 'seed', skinKey: 'seed:zeta' }, { id: 'crop.alpha', kind: 'crop', skinKey: 'crop:alpha' },
    { id: 'seed.alpha', kind: 'seed', skinKey: 'seed:alpha' }, { id: 'resource.wood', kind: 'resource', skinKey: 'resource:wood' },
  ] } as LifeItemCatalog);
  add('catalog:crops', { type: 'LifeCropCatalog', crops: [
    { id: 'zeta', seedItemId: 'seed.zeta', harvestItemId: 'crop.alpha', growthDays: 2 },
    { id: 'alpha', seedItemId: 'seed.alpha', harvestItemId: 'crop.alpha', growthDays: 2 },
  ] });
  add('catalog:dialogue', { type: 'LifeDialogueCatalog', dialogues: [{ id: 'npc.hello', graph: { start: { kind: 'line', speaker: 'npc', text: 'hello', next: null } } }] } as LifeDialogueCatalog);
  add('scene:s', { type: 'LifeScene', sceneId: 's', width: 3, height: 3, layers: [{ name: 'ground', tiles: [{ tileId: 'soil', count: 9 }] }] } as LifeScene);
  add('spawn:elsewhere', { type: 'LifeSpawn', sceneId: 's', spawnId: 'elsewhere', kind: 'warp', x: 2, y: 2 } as LifeSpawn);
  add('zone:s', { type: 'LifeZone', sceneId: 's', zoneId: 'all', kind: 'farm', geometry: { x: 0, y: 0, width: 3, height: 3 }, allowedActions: ['forage', 'harvest', 'plant', 'talk', 'till', 'water'] } as LifeZone);
  const placements = [
    ['placement:npc', { type: 'LifePlacement', sceneId: 's', placementId: 'npc', kind: 'npc', x: 1, y: 0, width: 1, height: 1, prefabRef: 'npc', skinKey: 'npc', interactionRange: 1, npcDialogueId: 'npc.hello' } as LifePlacement],
    ['placement:node', { type: 'LifePlacement', sceneId: 's', placementId: 'node', kind: 'resource', x: 0, y: 1, width: 1, height: 1, prefabRef: 'node', skinKey: 'node', interactionRange: 1 } as LifePlacement],
  ] as const;
  for (const [id, placement] of reversePlacements ? [...placements].reverse() : placements) add(id, placement);
  world.addComponent('placement:node', { type: 'LifeResourceNode', action: 'forage', itemId: 'resource.wood', remaining: 2 } as LifeResourceNode);
  add('warp:gate', { type: 'LifeWarp', sceneId: 's', warpId: 'gate', x: 0, y: 0, width: 1, height: 1, toSceneId: 's', toSpawnId: 'elsewhere', requires: { kind: 'flag', id: 'gate.open', equals: true } } as LifeWarp);
  add('flag:gate', { type: 'Flag', id: 'gate.open', active: false } as Flag);
  add('actor', { type: 'LifeActor', actorId: 'actor', kind: 'player' } as LifeActor);
  world.addComponent('actor', { type: 'LifePosition', sceneId: 's', x: 0, y: 0 } as LifePosition);
  world.addComponent('actor', { type: 'Inventory', id: 'bag:actor', slots: 4, maxStack: 9, items: [{ kind: 'seed.zeta', count: 1 }, { kind: 'seed.alpha', count: 2 }] } as Inventory);
  if (withTrace) add('trace', { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace);
  return world;
}

const findAffordance = (world: World, action: string, targetId?: string) => context(world, 'actor').affordances.find((entry) => entry.action === action && (targetId === undefined || entry.targetId === targetId));

describe('t2-life-activity', () => {
  it('derives fixture zones from author JSON and follows navigation/warp in the same tick', () => {
    const value = engine(); value.world.tick();
    expect(context(value.world)).toMatchObject({ sceneId: 'town', zoneIds: ['town-forage'], allowedActions: ['forage', 'talk'] });
    requestMove(value, 1, 0); requestMove(value, 1, 0); requestMove(value, 1, 0); requestWarp(value, 'town-farm-door');
    // The shared ENG fixture's farm field also owns its berry-bush forage node;
    // activity projects the authored zone vocabulary in sorted order.
    expect(context(value.world)).toMatchObject({ sceneId: 'farm', x: 0, y: 0, zoneIds: ['farm-field'], allowedActions: ['forage', 'harvest', 'plant', 'till', 'water'] });
    requestWarp(value, 'farm-town-door');
    for (let i = 0; i < 3; i++) requestMove(value, 1, 0);
    for (let i = 0; i < 3; i++) requestMove(value, 0, 1);
    requestWarp(value, 'town-river-door');
    expect(context(value.world)).toMatchObject({ sceneId: 'river', zoneIds: ['river-fishing'], allowedActions: ['fish'] });
    const ids = value.world.getSortedSystems().map((system) => system.id);
    expect(ids.indexOf('keybind')).toBeLessThan(ids.indexOf('life-input'));
    expect(ids.indexOf('life-input')).toBeLessThan(ids.indexOf('life-navigation'));
    expect(ids.indexOf('life-navigation')).toBeLessThan(ids.indexOf('life-activity'));
  });

  it('uses half-open zone rects, unions sorted actions, and applies precise footprint proximity', () => {
    const world = spatialWorld(); world.tick();
    expect(context(world, 'actor')).toMatchObject({ zoneIds: ['a-zone', 'b-zone'], allowedActions: ['forage', 'plant', 'talk'], nearbyPlacementIds: ['on', 'wide'] });
    const position = world.getComponent<LifePosition>('actor', 'LifePosition')!; position.x = 2; position.y = 0; world.tick();
    expect(context(world, 'actor')).toMatchObject({ zoneIds: [], allowedActions: [], nearbyPlacementIds: ['wide'] }); // x=2 is outside b-zone's [0,2), still adjacent to wide footprint
  });

  it('uses compiled placement interactionRange instead of a fixed nearby threshold', () => {
    const world = spatialWorld(); const position = world.getComponent<LifePosition>('actor', 'LifePosition')!;
    position.x = 0; position.y = 1; world.tick();
    expect(context(world, 'actor').nearbyPlacementIds).not.toContain('wide'); // distance 2 > authored range 1
    world.getComponent<LifePlacement>('placement:wide', 'LifePlacement')!.interactionRange = 2; world.tick();
    expect(context(world, 'actor').nearbyPlacementIds).toContain('wide'); // distance 2 == authored range 2
  });

  it('projects the same explicit warp affordance on all 2x2 footprint cells and nowhere adjacent', () => {
    const world = affordanceWorld();
    const warp = world.getComponent<LifeWarp>('warp:gate', 'LifeWarp')!;
    warp.x = 1; warp.y = 1; warp.width = 2; warp.height = 2;
    const position = world.getComponent<LifePosition>('actor', 'LifePosition')!;
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) {
      position.x = x; position.y = y; world.tick();
      expect(context(world, 'actor').nearbyWarpIds, `${x},${y}`).toEqual(['gate']);
      expect(findAffordance(world, 'warp', 'gate')).toBeDefined();
    }
    for (const [x, y] of [[0, 1], [1, 0]]) {
      position.x = x; position.y = y; world.tick();
      expect(context(world, 'actor').nearbyWarpIds, `${x},${y}`).toEqual([]);
      expect(findAffordance(world, 'warp', 'gate')).toBeUndefined();
    }
  });

  it('keeps visibility and interaction eligibility as independent dynamic gates', () => {
    const world=affordanceWorld();const npc=world.getComponent<LifePlacement>('placement:npc','LifePlacement')!;
    npc.visible=true;npc.interactive=false;world.tick();
    expect(context(world,'actor').nearbyPlacementIds).not.toContain('npc');
    npc.visible=false;npc.interactive=true;world.tick();
    expect(context(world,'actor').nearbyPlacementIds).not.toContain('npc');
    npc.visible=true;npc.interactive=true;world.tick();
    expect(context(world,'actor').nearbyPlacementIds).toContain('npc');
  });

  it('keeps an explicit empty context, removes stale context for unknown scenes, and traces only changes/rejects', () => {
    const world = spatialWorld(); world.createEntity('trace'); world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace);
    world.tick(); const trace = world.getComponent<DebugTrace>('trace', 'DebugTrace')!; expect(trace.events).toHaveLength(2);
    trace.events = []; world.tick(); expect(trace.events).toEqual([]);
    const position = world.getComponent<LifePosition>('actor', 'LifePosition')!; position.sceneId = 'missing'; world.tick();
    expect(world.hasComponent('actor', 'LifeActivityContext')).toBe(false);
    expect(trace.events).toEqual([expect.objectContaining({ system: 'life-activity', kind: 'reject', why: 'unknown scene=missing' })]);
  });

  it('is snapshot deterministic and exposes an activity capability after navigation', () => {
    const a = spatialWorld(), b = spatialWorld(); a.tick(); b.tick();
    expect(a.snapshot()).toEqual(b.snapshot()); expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(b.snapshot()));
    expect(lifeActivityCapability.systems[0].runsAfter).toContain('life-navigation');
  });

  it('derives farm affordances from sparse soil, crop, held seeds, and bag capacity without changing authored permissions', () => {
    const world = affordanceWorld(); world.tick();
    expect(findAffordance(world, 'till')).toMatchObject({ targetKind: 'tile', available: true });
    const authored = [...context(world, 'actor').allowedActions];
    const plotId = lifeFarmPlotEntityId('s', 0, 0); world.createEntity(plotId);
    world.addComponent(plotId, { type: 'LifeFarmPlot', sceneId: 's', x: 0, y: 0, soil: 'tilled' } as LifeFarmPlot); world.tick();
    expect(findAffordance(world, 'water')).toMatchObject({ available: true });
    world.addComponent(plotId, { type: 'LifeFarmPlot', sceneId: 's', x: 0, y: 0, soil: 'watered' } as LifeFarmPlot); world.tick();
    expect(findAffordance(world, 'plant')).toMatchObject({ available: true, candidateItemIds: ['seed.alpha', 'seed.zeta'] });
    world.getComponent<Inventory>('actor', 'Inventory')!.items = []; world.tick();
    expect(findAffordance(world, 'plant')).toMatchObject({ available: false, reason: 'missing-seed', candidateItemIds: [] });
    world.addComponent(plotId, { type: 'LifeFarmPlot', sceneId: 's', x: 0, y: 0, soil: 'tilled' } as LifeFarmPlot);
    world.addComponent(plotId, { type: 'LifeCrop', cropId: 'alpha', daysGrown: 0, stage: 'growing' } as LifeCrop); world.tick();
    expect(findAffordance(world, 'water')).toMatchObject({ available: true });
    world.addComponent(plotId, { type: 'LifeFarmPlot', sceneId: 's', x: 0, y: 0, soil: 'watered' } as LifeFarmPlot); world.tick();
    expect(findAffordance(world, 'water')).toMatchObject({ available: false, reason: 'already-watered' });
    world.addComponent(plotId, { type: 'LifeCrop', cropId: 'alpha', daysGrown: 2, stage: 'mature' } as LifeCrop); world.tick();
    expect(findAffordance(world, 'harvest')).toMatchObject({ available: true });
    expect(context(world, 'actor').allowedActions).toEqual(authored);
  });

  it('projects resource depletion, dialogue session state, and warp access as closed unavailable reasons', () => {
    const world = affordanceWorld(true); world.tick();
    expect(findAffordance(world, 'forage', 'node')).toMatchObject({ available: true });
    expect(findAffordance(world, 'talk', 'npc')).toMatchObject({ available: true });
    expect(findAffordance(world, 'warp', 'gate')).toMatchObject({ available: false, reason: 'locked' });
    world.addComponent('placement:node', { type: 'LifeResourceNode', action: 'forage', itemId: 'resource.wood', remaining: 0 } as LifeResourceNode);
    world.createEntity('dialogue'); world.addComponent('dialogue', { type: 'LifeDialogueSession', npcPlacementId: 'npc', dialogueId: 'npc.hello', status: 'open' } as LifeDialogueSession);
    world.getComponent<Flag>('flag:gate', 'Flag')!.active = true; world.tick();
    expect(findAffordance(world, 'forage', 'node')).toMatchObject({ available: false, reason: 'depleted' });
    expect(findAffordance(world, 'talk', 'npc')).toMatchObject({ available: false, reason: 'dialogue-open' });
    expect(findAffordance(world, 'warp', 'gate')).toMatchObject({ available: true });
  });

  it('refreshes after actual action effects in the same tick and stays independent of entity insertion order', () => {
    const value = engine(); value.world.tick();
    requestMove(value, 1, 0); requestMove(value, 1, 0); requestMove(value, 1, 0); requestWarp(value, 'town-farm-door');
    expect(context(value.world).affordances.find((entry) => entry.action === 'till')).toMatchObject({ available: true });
    requestAction(value, new QueuedInputSource('host'), 'till');
    expect(context(value.world).affordances.find((entry) => entry.action === 'water')).toMatchObject({ available: true });
    const a = affordanceWorld(false), b = affordanceWorld(true); a.tick(); b.tick();
    expect(context(a, 'actor').affordances).toEqual(context(b, 'actor').affordances);
    expect(hashSnapshot(a.snapshot())).toBe(hashSnapshot(b.snapshot()));
    expect(lifeActivityCapability.systems[1]?.phase).toBe(SystemPhase.Commit);
  });

  it('fails closed on invalid affordance data and traces changed decisions, unavailable reasons, and commits only', () => {
    const schema = lifeActivityCapability.components.provides.LifeActivityContext.schema!;
    const base = { sceneId: 's', x: 0, y: 0, zoneIds: [], allowedActions: [], nearbyPlacementIds: [], nearbyWarpIds: [] };
    expect(validate(schema, { ...base, affordances: [{ id: 'x', action: 'teleport', targetKind: 'warp', targetId: 'w', available: true }] }).some((issue) => issue.severity === 'error')).toBe(true);
    expect(validate(schema, { ...base, affordances: [{ id: 'x', action: 'warp', targetKind: 'warp', targetId: 'w', available: false }] }).some((issue) => issue.severity === 'error')).toBe(true);
    expect(validate(schema, { ...base, affordances: [{ id: 'x', action: 'warp', targetKind: 'warp', targetId: 'w', available: false, reason: 'locked' }] }).some((issue) => issue.severity === 'error')).toBe(false);
    const world = affordanceWorld(false, true); world.tick();
    const trace = world.getComponent<DebugTrace>('trace', 'DebugTrace')!;
    const events = trace.events.filter((event) => event.system === 'life-affordance');
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.kind)).toEqual(['decision', 'reject', 'commit']);
    expect(events[1]?.why).toContain('warp:gate:warp=locked');
    trace.events = []; world.tick(); expect(trace.events.filter((event) => event.system === 'life-affordance')).toEqual([]);
  });
});
