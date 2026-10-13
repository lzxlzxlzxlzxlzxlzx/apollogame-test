import { describe, expect, it } from 'vitest';
import { Engine } from '@runtime/engine.js';
import { World } from '@engine/core/world.js';
import { QueuedInputSource } from '@net/host/index.js';
import { applyCommands } from '@net/commands.js';
import { hashSnapshot } from '@net/determinism.js';
import type { DebugTrace, LifeActionResult, LifeFarmActionResult, LifeFarmPlot, LifePosition, LifeScene, LifeTileCatalog } from '@engine/protocol/components.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import { lifeFarmPlotEntityId } from '@engine/protocol/life-farming.js';
import { lifeFarmingCapability } from './life-farming.js';

function make(): Engine { const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(threeSceneLifePackage()).blueprint); return engine; }
function enqueue(engine: Engine, source: QueuedInputSource, action: string): void { source.enqueueAction('life.action', { arg: action }); applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1)); engine.world.tick(); }
function move(engine: Engine, dx: number, dy: number): void { engine.world.addComponent('life:player', { type: 'LifeMoveRequest', dx, dy }); engine.world.tick(); }
function warpToFarm(engine: Engine): void { for (let i = 0; i < 3; i++) move(engine, 1, 0); engine.world.addComponent('life:player', { type: 'LifeWarpRequest', warpId: 'town-farm-door' }); engine.world.tick(); }
function farmingResult(engine: Engine): LifeFarmActionResult | undefined { return engine.world.getComponent<LifeFarmActionResult>('life:player', 'LifeFarmActionResult'); }

describe('t2-life-farming', () => {
  it('closes the compiled input → judgement → sparse till chain with a stable plot id', () => {
    const engine = make(); warpToFarm(engine); const input = new QueuedInputSource('host'); enqueue(engine, input, 'till');
    const id = lifeFarmPlotEntityId('farm', 0, 0);
    expect(engine.world.getComponent<LifeActionResult>('life:player', 'LifeActionResult')).toMatchObject({ action: 'till', status: 'accepted' });
    expect(engine.world.getComponent<LifeFarmPlot>(id, 'LifeFarmPlot')).toEqual({ type: 'LifeFarmPlot', sceneId: 'farm', x: 0, y: 0, soil: 'tilled' });
    expect(farmingResult(engine)).toEqual({ type: 'LifeFarmActionResult', action: 'till', status: 'applied', sceneId: 'farm', x: 0, y: 0 });
    enqueue(engine, input, 'till'); expect(farmingResult(engine)).toMatchObject({ action: 'till', status: 'rejected', reason: 'already-tilled' });
    expect(engine.world.getComponent<LifeFarmPlot>(id, 'LifeFarmPlot')?.soil).toBe('tilled');
  });

  it('requires an existing tilled plot to water, retains its identity, and clears results on idle ticks', () => {
    const engine = make(); warpToFarm(engine); const input = new QueuedInputSource('host');
    enqueue(engine, input, 'water'); expect(farmingResult(engine)).toMatchObject({ status: 'rejected', reason: 'missing-plot' });
    enqueue(engine, input, 'till'); const id = lifeFarmPlotEntityId('farm', 0, 0); enqueue(engine, input, 'water');
    expect(farmingResult(engine)).toEqual({ type: 'LifeFarmActionResult', action: 'water', status: 'applied', sceneId: 'farm', x: 0, y: 0 });
    expect(engine.world.getComponent<LifeFarmPlot>(id, 'LifeFarmPlot')).toMatchObject({ soil: 'watered' });
    enqueue(engine, input, 'water'); expect(farmingResult(engine)).toMatchObject({ reason: 'already-watered' });
    applyCommands(engine.world, []); engine.world.tick(); expect(farmingResult(engine)).toBeUndefined();
  });

  it('does not create ghost plots for non-plantable terrain, upstream rejections, or an invalid scene', () => {
    const town = make(); const input = new QueuedInputSource('host'); enqueue(town, input, 'till');
    expect(town.world.query('LifeFarmPlot')).toHaveLength(0); expect(farmingResult(town)).toBeUndefined(); // action layer rejects zone first
    const nonPlantable = new World(); for (const system of lifeFarmingCapability.systems) nonPlantable.addSystem(system);
    nonPlantable.createEntity('catalog'); nonPlantable.addComponent('catalog', { type: 'LifeTileCatalog', tiles: [{ tileId: 'grass', tags: ['walkable', 'forage'] }] } as LifeTileCatalog);
    nonPlantable.createEntity('scene'); nonPlantable.addComponent('scene', { type: 'LifeScene', sceneId: 'grassland', width: 1, height: 1, layers: [{ name: 'ground', tiles: [{ tileId: 'grass', count: 1 }] }, { name: 'collision', tiles: [{ tileId: 'grass', count: 1 }] }, { name: 'interaction', tiles: [{ tileId: 'grass', count: 1 }] }] } as LifeScene);
    nonPlantable.createEntity('actor'); nonPlantable.addComponent('actor', { type: 'LifeActor', actorId: 'p', kind: 'player' }); nonPlantable.addComponent('actor', { type: 'LifePosition', sceneId: 'grassland', x: 0, y: 0 } as LifePosition);
    nonPlantable.addComponent('actor', { type: 'LifeActionResult', action: 'till', status: 'accepted', sceneId: 'grassland', x: 0, y: 0, zoneIds: [] } as LifeActionResult); nonPlantable.tick();
    expect(nonPlantable.query('LifeFarmPlot')).toHaveLength(0); expect(nonPlantable.getComponent<LifeFarmActionResult>('actor', 'LifeFarmActionResult')).toMatchObject({ reason: 'not-plantable' });
    const world = new World(); for (const system of lifeFarmingCapability.systems) world.addSystem(system);
    world.createEntity('actor'); world.addComponent('actor', { type: 'LifeActor', actorId: 'p', kind: 'player' }); world.addComponent('actor', { type: 'LifePosition', sceneId: 'gone', x: 0, y: 0 } as LifePosition);
    world.addComponent('actor', { type: 'LifeActionResult', action: 'till', status: 'accepted', sceneId: 'gone', x: 0, y: 0, zoneIds: [] } as LifeActionResult); world.tick();
    expect(world.query('LifeFarmPlot')).toHaveLength(0); expect(world.getComponent<LifeFarmActionResult>('actor', 'LifeFarmActionResult')).toMatchObject({ reason: 'invalid-scene' });
  });

  it('creates only interacted plot cells and leaves other accepted actions for later consumers', () => {
    const engine = make(); warpToFarm(engine); const input = new QueuedInputSource('host'); enqueue(engine, input, 'till'); const afterFirstPlot = engine.world.getAllEntities().length; move(engine, 1, 0); enqueue(engine, input, 'till');
    expect(engine.world.query('LifeFarmPlot')).toHaveLength(2); expect(engine.world.getAllEntities()).toHaveLength(afterFirstPlot + 1);
    enqueue(engine, input, 'plant'); expect(engine.world.query('LifeFarmPlot')).toHaveLength(2); expect(farmingResult(engine)).toBeUndefined();
  });

  it('orders after action and produces deterministic sparse snapshots with opt-in trace only for work', () => {
    const run = () => { const engine = make(); warpToFarm(engine); const traceId = 'trace'; engine.world.createEntity(traceId); engine.world.addComponent(traceId, { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace); const input = new QueuedInputSource('host'); enqueue(engine, input, 'till'); return engine; };
    const a = run(), b = run(); expect(hashSnapshot(a.world.snapshot())).toBe(hashSnapshot(b.world.snapshot()));
    const ids = a.world.getSortedSystems().map((system) => system.id); expect(ids.indexOf('life-action')).toBeLessThan(ids.indexOf('life-farming')); expect(lifeFarmingCapability.systems[0].runsAfter).toContain('life-action');
    const trace = a.world.getComponent<DebugTrace>('trace', 'DebugTrace')!; let events = trace.events.filter((event) => event.system === 'life-farming');
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'decision' }), expect.objectContaining({ kind: 'commit' })])); expect(events).toHaveLength(2);
    const input = new QueuedInputSource('host'); enqueue(a, input, 'till'); events = trace.events.filter((event) => event.system === 'life-farming');
    expect(events.at(-1)).toMatchObject({ kind: 'reject', why: 'already-tilled' });
    trace.events = []; applyCommands(a.world, []); a.world.tick(); expect(trace.events.filter((event) => event.system === 'life-farming')).toEqual([]);
  });
});
