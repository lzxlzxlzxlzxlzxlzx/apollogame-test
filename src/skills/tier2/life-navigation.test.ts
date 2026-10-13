import { describe, expect, it } from 'vitest';
import { Engine } from '@runtime/engine.js';
import type { DebugTrace, Flag, LifeMoveRequest, LifePosition, LifeWarpRequest, Resource } from '@engine/protocol/components.js';
import { hashWorld } from '@net/world-hash.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const position = (engine: Engine) => engine.world.getComponent<LifePosition>('life:player', 'LifePosition')!;
const load = (raw = threeSceneLifePackage()): Engine => {
  const engine = new Engine();
  engine.load(compileAndParseLifeGamePackage(raw).blueprint);
  return engine;
};
const move = (engine: Engine, dx: number, dy: number) => {
  engine.world.addComponent('life:player', { type: 'LifeMoveRequest', dx, dy } as LifeMoveRequest);
  engine.world.tick();
};
const warp = (engine: Engine, warpId: string) => {
  engine.world.addComponent('life:player', { type: 'LifeWarpRequest', warpId } as LifeWarpRequest);
  engine.world.tick();
};
const traceOn = (engine: Engine): DebugTrace => {
  engine.world.createEntity('trace');
  engine.world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace);
  return engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!;
};

describe('t2-life-navigation', () => {
  it('loads the unique player spawn as the sole runtime position truth', () => {
    const engine = load();
    expect(position(engine)).toMatchObject({ sceneId: 'town', x: 0, y: 0 });
    expect(engine.world.getAllEntities()).toContain('life:player');
  });

  it('moves all cardinal directions deterministically', () => {
    const raw = copy(threeSceneLifePackage()) as any;
    raw.scenes[0].spawnPoints[0].x = 1; raw.scenes[0].spawnPoints[0].y = 1;
    const run = () => {
      const engine = load(raw);
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) move(engine, dx, dy);
      return { position: { ...position(engine) }, hash: hashWorld(engine.world) };
    };
    const a = run(); const b = run();
    expect(a.position).toMatchObject({ sceneId: 'town', x: 1, y: 1 });
    expect(a.hash).toBe(b.hash);
  });

  it('rejects invalid, boundary, and blocked moves while consuming requests and tracing the reason', () => {
    const engine = load(); const trace = traceOn(engine); const initial = { ...position(engine) };
    move(engine, 1, 1); // diagonal
    move(engine, 0, 0); // zero
    move(engine, -1, 0); // boundary
    const town = engine.world.getComponent<any>('life:scene:town', 'LifeScene')!;
    town.layers[1].tiles = [{ tileId: 'wall', count: 16 }];
    move(engine, 1, 0); // collision layer
    expect(position(engine)).toEqual(initial);
    expect(engine.world.hasComponent('life:player', 'LifeMoveRequest')).toBe(false);
    expect(trace.events.filter((event) => event.system === 'life-navigation' && event.kind === 'reject')).toHaveLength(4);
  });

  it('warps only on an explicit request at the matching current-scene location', () => {
    const engine = load(); const trace = traceOn(engine);
    engine.world.tick(); // no auto-warp at player spawn
    expect(position(engine)).toMatchObject({ sceneId: 'town', x: 0, y: 0 });
    warp(engine, 'town-farm-door'); // not on door
    expect(position(engine)).toMatchObject({ sceneId: 'town', x: 0, y: 0 });
    move(engine, 1, 0); move(engine, 1, 0); move(engine, 1, 0);
    warp(engine, 'town-farm-door');
    expect(position(engine)).toMatchObject({ sceneId: 'farm', x: 0, y: 0 });
    engine.world.tick(); // arrival shares the reciprocal warp cell but never auto-bounces
    expect(position(engine)).toMatchObject({ sceneId: 'farm', x: 0, y: 0 });
    warp(engine, 'town-river-door'); // valid id, wrong current scene
    expect(position(engine)).toMatchObject({ sceneId: 'farm', x: 0, y: 0 });
    warp(engine, 'farm-town-door'); // explicit interaction is immediately available on arrival
    expect(position(engine)).toMatchObject({ sceneId: 'town', x: 0, y: 0 });
    expect(engine.world.hasComponent('life:player', 'LifeWarpRequest')).toBe(false);
    expect(trace.events.some((event) => event.kind === 'transition')).toBe(true);
    expect(trace.events.filter((event) => event.kind === 'reject')).toHaveLength(2);
  });

  it('rejects simultaneous move and warp without changing position', () => {
    const engine = load(); const trace = traceOn(engine); const before = { ...position(engine) };
    engine.world.addComponent('life:player', { type: 'LifeMoveRequest', dx: 1, dy: 0 } as LifeMoveRequest);
    engine.world.addComponent('life:player', { type: 'LifeWarpRequest', warpId: 'town-farm-door' } as LifeWarpRequest);
    engine.world.tick();
    expect(position(engine)).toEqual(before);
    expect(engine.world.hasComponent('life:player', 'LifeMoveRequest')).toBe(false);
    expect(engine.world.hasComponent('life:player', 'LifeWarpRequest')).toBe(false);
    expect(trace.events).toEqual(expect.arrayContaining([expect.objectContaining({ system: 'life-navigation', kind: 'reject' })]));
  });

  it('rejects a locked data-gated warp without movement, then restores flag and resource gates deterministically', () => {
    const raw = copy(threeSceneLifePackage()) as any;
    raw.logic = { flags: [{ id: 'story.key', initial: false }], resources: [{ id: 'renown', initial: 0, min: 0, max: 9 }] };
    raw.scenes[0].warps[0].requires = { kind: 'flag', id: 'story.key', equals: true };
    const engine = load(raw); const trace = traceOn(engine);
    move(engine, 1, 0); move(engine, 1, 0); move(engine, 1, 0); warp(engine, 'town-farm-door');
    expect(position(engine)).toMatchObject({ sceneId: 'town', x: 3, y: 0 });
    expect(engine.world.getComponent<any>('life:player', 'LifeWarpResult')).toMatchObject({ status: 'rejected', reason: 'locked' });
    expect(trace.events).toEqual(expect.arrayContaining([expect.objectContaining({ system: 'life-navigation', kind: 'reject', why: 'locked' })]));
    engine.world.getComponent<Flag>('life:logic:flag:story.key', 'Flag')!.active = true; warp(engine, 'town-farm-door');
    expect(position(engine)).toMatchObject({ sceneId: 'farm' });
    const resourceRaw = copy(raw); resourceRaw.scenes[0].warps[0].requires = { kind: 'resource', id: 'renown', op: '>=', value: 2 };
    const resourceEngine = load(resourceRaw); move(resourceEngine, 1, 0); move(resourceEngine, 1, 0); move(resourceEngine, 1, 0); warp(resourceEngine, 'town-farm-door');
    expect(resourceEngine.world.getComponent<any>('life:player', 'LifeWarpResult')).toMatchObject({ reason: 'locked' });
    resourceEngine.world.getComponent<Resource>('life:logic:resource:renown', 'Resource')!.current = 2; warp(resourceEngine, 'town-farm-door');
    expect(position(resourceEngine)).toMatchObject({ sceneId: 'farm' });
  });

  it('keeps large RLE scenes cell-entity-free and restores to the same final position and hash', () => {
    const raw = copy(threeSceneLifePackage()) as any;
    raw.scenes[0].width = 256; raw.scenes[0].height = 256;
    for (const layer of raw.scenes[0].layers) layer.tiles = [{ tileId: layer.tiles[0].tileId, count: 65_536 }];
    const engine = load(raw);
    expect(engine.world.getAllEntities()).toHaveLength(38); // static catalogs + milestone catalog, never one entity per cell
    move(engine, 1, 0); const snapshot = engine.world.snapshot(); const order = engine.world.snapshotOrder();
    move(engine, 1, 0); move(engine, 1, 0);
    const expectedPosition = { ...position(engine) }; const expectedHash = hashWorld(engine.world);
    engine.world.restore(snapshot, order);
    move(engine, 1, 0); move(engine, 1, 0);
    expect(position(engine)).toEqual(expectedPosition);
    expect(hashWorld(engine.world)).toBe(expectedHash);
  });
});
