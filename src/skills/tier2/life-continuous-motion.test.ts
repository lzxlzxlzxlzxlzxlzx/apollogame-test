import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import type { DebugTrace, LifeActivityContext, LifeActor, LifeContinuousMotion, LifePosition, Signal, Transform, Velocity } from '@engine/protocol/components.js';
import { hashWorld } from '@net/world-hash.js';
import { applyCommands } from '@net/commands.js';
import { QueuedInputSource } from '@net/host/queued-input.js';
import { Engine } from '@runtime/engine.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const load = (raw = threeSceneLifePackage()) => { const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(raw).blueprint); return engine; };
const signal = (engine: Engine, name: string, direction: string) => {
  const id = `motion-signal:${direction}`;
  if (!engine.world.getAllEntities().includes(id)) { engine.world.createEntity(id); engine.world.addComponent(id, { type: 'Signal', name, source: 'life:player', arg: direction } as Signal); }
  else engine.world.getComponent<Signal>(id, 'Signal')!.name = name;
};
const start = (engine: Engine, direction: string) => signal(engine, 'life.move.start', direction);
const stop = (engine: Engine, direction: string) => signal(engine, 'life.move.stop', direction);
const transform = (engine: Engine) => engine.world.getComponent<Transform>('life:player', 'Transform')!;
const position = (engine: Engine) => engine.world.getComponent<LifePosition>('life:player', 'LifePosition')!;
const movementState = (engine: Engine, source: QueuedInputSource, ...masks: string[]) => {
  for (const mask of masks) source.enqueueAction('life.move.state', { arg: mask });
  applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1));
};

describe('t2-life-continuous-motion', () => {
  it('integrates held semantic directions, normalizes diagonals, and derives logical context from Transform', () => {
    const engine = load(); start(engine, 'right');
    engine.world.tick();
    expect(transform(engine)).toMatchObject({ x: 0.25, y: 0 });
    expect(position(engine)).toMatchObject({ sceneId: 'town', x: 0, y: 0 });
    stop(engine, 'right'); start(engine, 'down');
    engine.world.tick();
    const velocity = engine.world.getComponent<Velocity>('life:player', 'Velocity')!;
    expect(Math.hypot(velocity.vx, velocity.vy)).toBeCloseTo(0.25);
    expect(transform(engine)).toMatchObject({ x: 0.25, y: 0.25 });

    const raw = copy(threeSceneLifePackage()) as any; raw.interaction = { nearbyRange: 0 };
    const contextRun = load(raw); start(contextRun, 'right'); start(contextRun, 'down');
    for (let tick = 0; tick < 6; tick++) contextRun.world.tick();
    expect(position(contextRun)).toMatchObject({ sceneId: 'town', x: 1, y: 1 });
    expect(contextRun.world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext')!.nearbyPlacementIds).toContain('mayor');
  });

  it('commits the exact positive-side grid boundary before deriving interaction context', () => {
    const engine = load();
    transform(engine).x = 0.999_999; transform(engine).y = 0.999_999; engine.world.tick();
    expect(position(engine)).toMatchObject({ x: 0, y: 0 });
    expect(engine.world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext')).toMatchObject({ x: 0, y: 0 });
    transform(engine).x = 1; transform(engine).y = 1; engine.world.tick();
    expect(position(engine)).toMatchObject({ x: 1, y: 1 });
    expect(engine.world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext')).toMatchObject({ x: 1, y: 1 });
  });

  it('rejects continuous motion at blocked tiles and scene boundaries without mutating static world data', () => {
    const engine = load(); const scene = engine.world.getComponent<any>('life:scene:town', 'LifeScene')!;
    scene.layers[1].tiles = [{ tileId: 'clear', count: 1 }, { tileId: 'wall', count: 15 }];
    const before = JSON.stringify(scene.layers);
    start(engine, 'right');
    for (let tick = 0; tick < 5; tick++) engine.world.tick();
    expect(transform(engine).x).toBeCloseTo(0.75);
    expect(JSON.stringify(scene.layers)).toBe(before);

    const edge = load(); start(edge, 'left'); edge.world.tick();
    expect(transform(edge)).toMatchObject({ x: 0, y: 0 });
  });

  it('is snapshot/hash deterministic across the same held-direction packet sequence', () => {
    const run = () => {
      const engine = load(); start(engine, 'right'); start(engine, 'down');
      for (let tick = 0; tick < 3; tick++) engine.world.tick();
      stop(engine, 'right'); engine.world.tick();
      return { snapshot: engine.world.snapshot(), hash: hashWorld(engine.world) };
    };
    expect(run()).toEqual(run());
  });

  it('uses the last complete physical-state packet when several transitions share one tick', () => {
    const engine = load(); const source = new QueuedInputSource('life:player');
    movementState(engine, source, '4', '5', '13', '5', '4', '0');
    engine.world.tick();
    expect(engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ up: false, down: false, left: false, right: false });
    expect(engine.world.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: 0, vy: 0 });
    const stopped = { ...transform(engine) };
    applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1)); engine.world.tick();
    expect(transform(engine)).toMatchObject({ x: stopped.x, y: stopped.y });
  });

  it('keeps complete-state packet replay and hash deterministic', () => {
    const run = () => {
      const engine = load(); const source = new QueuedInputSource('life:player');
      movementState(engine, source, '5'); engine.world.tick();
      movementState(engine, source, '13', '5', '0'); engine.world.tick();
      return { snapshot: engine.world.snapshot(), hash: hashWorld(engine.world) };
    };
    expect(run()).toEqual(run());
  });

  it('projects complete-state packets only onto their matching player source', () => {
    const engine = load();
    engine.world.createEntity('life:player:two');
    engine.world.addComponent('life:player:two', { type: 'LifeActor', actorId: 'player-two', kind: 'player' } as LifeActor);
    engine.world.addComponent('life:player:two', { type: 'LifeContinuousMotion', sceneId: 'town', speed: 0.25, up: false, down: false, left: false, right: false } as LifeContinuousMotion);
    engine.world.addComponent('life:player:two', { type: 'LifePosition', sceneId: 'town', x: 2, y: 2 } as LifePosition);
    engine.world.addComponent('life:player:two', { type: 'Transform', x: 2, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    engine.world.addComponent('life:player:two', { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
    const first = new QueuedInputSource('life:player'); const second = new QueuedInputSource('life:player:two');
    first.enqueueAction('life.move.state', { arg: '8' }); second.enqueueAction('life.move.state', { arg: '2' });
    applyCommands(engine.world, [...first.commandsForTick(engine.world.getVersion() + 1), ...second.commandsForTick(engine.world.getVersion() + 1)]);
    engine.world.tick();
    expect(engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ up: false, down: false, left: false, right: true });
    expect(engine.world.getComponent<Velocity>('life:player', 'Velocity')).toMatchObject({ vx: 0.25, vy: 0 });
    expect(engine.world.getComponent<LifeContinuousMotion>('life:player:two', 'LifeContinuousMotion')).toMatchObject({ up: false, down: true, left: false, right: false });
    expect(engine.world.getComponent<Velocity>('life:player:two', 'Velocity')).toMatchObject({ vx: 0, vy: 0.25 });
  });

  it('traces accepted and rejected state snapshots only when DebugTrace is present', () => {
    const engine = load(); const source = new QueuedInputSource('life:player');
    engine.world.createEntity('trace'); engine.world.addComponent('trace', { type: 'DebugTrace', events: [], max: 12 } as DebugTrace);
    movementState(engine, source, '5'); engine.world.tick();
    const trace = engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!;
    expect(trace.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ system: 'life-continuous-motion', kind: 'transition', what: 'life:player held directions', why: 'none→up+left' }),
      expect.objectContaining({ system: 'life-continuous-motion', kind: 'decision', what: 'life:player velocity projection', why: '-1,-1' }),
    ]));
    trace.events = [];
    movementState(engine, source, 'invalid'); engine.world.tick();
    expect(engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ up: true, down: false, left: true, right: false });
    expect(trace.events).toEqual(expect.arrayContaining([expect.objectContaining({ system: 'life-continuous-motion', kind: 'reject', what: 'life:player movement state rejected', why: 'arg=invalid' })]));
    expect(trace.events).not.toEqual(expect.arrayContaining([expect.objectContaining({ system: 'life-continuous-motion', kind: 'decision' })]));

    const noTrace = load(); const noTraceSource = new QueuedInputSource('life:player');
    movementState(noTrace, noTraceSource, '0'); noTrace.world.tick();
    expect(noTrace.world.queryEntities('DebugTrace')).toEqual([]);
  });
});
