import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import { Engine } from '@runtime/engine.js';
import { applyCommands } from '@net/commands.js';
import { QueuedInputSource } from '@net/host/index.js';
import { hashSnapshot } from '@net/determinism.js';
import type { DebugTrace, LifeActionResult, LifeActor, LifePosition, Signal } from '@engine/protocol/components.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import { lifeActionCapability, LIFE_ACTION_SIGNAL } from './life-action.js';

function make(): Engine { const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(threeSceneLifePackage()).blueprint); return engine; }
const result = (engine: Engine, id = 'life:player') => engine.world.getComponent<LifeActionResult>(id, 'LifeActionResult');
function enqueue(engine: Engine, source: QueuedInputSource, name: string, arg?: string): void {
  source.enqueueAction(name, arg === undefined ? undefined : { arg }); applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1)); engine.world.tick();
}
function signal(engine: Engine, id: string, value: Omit<Signal, 'type'>): void { engine.world.createEntity(id); engine.world.addComponent(id, { type: 'Signal', ...value } as Signal); }
function move(engine: Engine, dx: number, dy: number): void { engine.world.addComponent('life:player', { type: 'LifeMoveRequest', dx, dy }); engine.world.tick(); }
function warp(engine: Engine, warpId: string): void { engine.world.addComponent('life:player', { type: 'LifeWarpRequest', warpId }); engine.world.tick(); }

describe('t2-life-action', () => {
  it('runs InputQueue → KeyBinding → Signal → action judgement in one tick and accepts author-allowed till in farm', () => {
    const engine = make(); for (let i = 0; i < 3; i++) move(engine, 1, 0); warp(engine, 'town-farm-door');
    const input = new QueuedInputSource('host'); enqueue(engine, input, 'life.action', 'till');
    expect(result(engine)).toEqual({ type: 'LifeActionResult', action: 'till', status: 'accepted', sceneId: 'farm', x: 0, y: 0, zoneIds: ['farm-field'] });
  });

  it('uses only author-declared allowedActions rather than scene or zone-kind code', () => {
    const town = make(); const input = new QueuedInputSource('host'); enqueue(town, input, 'life.action', 'till');
    expect(result(town)).toMatchObject({ action: 'till', status: 'rejected', reason: 'not-allowed-here', sceneId: 'town' });
    enqueue(town, input, 'life.action', 'forage'); expect(result(town)).toMatchObject({ action: 'forage', status: 'accepted', zoneIds: ['town-forage'] });
  });

  it('rejects invalid action payloads, folds exact duplicates, and rejects different actions', () => {
    for (const arg of [undefined, '', '   ', 'not-an-action', 7] as unknown[]) {
      const engine = make(); signal(engine, 'action', { name: LIFE_ACTION_SIGNAL, source: 'life:player', ...(arg === undefined ? {} : { arg: arg as string }) }); engine.world.tick();
      expect(result(engine)).toMatchObject({ status: 'rejected', reason: 'invalid-action' }); expect(result(engine)?.action).toBeUndefined();
    }
    const duplicate = make(); signal(duplicate, 'a', { name: LIFE_ACTION_SIGNAL, source: 'life:player', arg: 'forage' }); signal(duplicate, 'b', { name: LIFE_ACTION_SIGNAL, source: 'life:player', arg: 'forage' }); duplicate.world.tick();
    expect(result(duplicate)).toMatchObject({ action: 'forage', status: 'accepted' });
    const ambiguous = make(); signal(ambiguous, 'a', { name: LIFE_ACTION_SIGNAL, source: 'life:player', arg: 'forage' }); signal(ambiguous, 'b', { name: LIFE_ACTION_SIGNAL, source: 'life:player', arg: 'talk' }); ambiguous.world.tick();
    expect(result(ambiguous)).toMatchObject({ status: 'rejected', reason: 'ambiguous-action' });
  });

  it('rejects navigation conflict and bad sources without contaminating the player', () => {
    const conflict = make(); const input = new QueuedInputSource('host'); input.enqueueAction('life.move.right'); input.enqueueAction('life.action', { arg: 'forage' }); applyCommands(conflict.world, input.commandsForTick(1)); conflict.world.tick();
    expect(result(conflict)).toMatchObject({ action: 'forage', status: 'rejected', reason: 'navigation-conflict' });
    const bad = make(); bad.world.createEntity('npc'); bad.world.addComponent('npc', { type: 'LifeActor', actorId: 'npc', kind: 'npc' } as LifeActor); bad.world.addComponent('npc', { type: 'LifePosition', sceneId: 'town', x: 0, y: 0 } as LifePosition);
    signal(bad, 'npc-action', { name: LIFE_ACTION_SIGNAL, source: 'npc', arg: 'forage' }); bad.world.tick();
    expect(result(bad, 'npc')).toMatchObject({ action: 'forage', status: 'rejected', reason: 'not-player' }); expect(result(bad)).toBeUndefined();
  });

  it('fails closed for missing context, clears stale results, and traces only action work', () => {
    const isolated = new World(); for (const system of lifeActionCapability.systems) isolated.addSystem(system);
    isolated.createEntity('actor'); isolated.addComponent('actor', { type: 'LifeActor', actorId: 'actor', kind: 'player' } as LifeActor); isolated.addComponent('actor', { type: 'LifePosition', sceneId: 's', x: 0, y: 0 } as LifePosition);
    isolated.createEntity('signal'); isolated.addComponent('signal', { type: 'Signal', name: LIFE_ACTION_SIGNAL, source: 'actor', arg: 'till' } as Signal); isolated.tick();
    expect(isolated.getComponent<LifeActionResult>('actor', 'LifeActionResult')).toMatchObject({ status: 'rejected', reason: 'missing-context' });
    const engine = make(); engine.world.tick(); engine.world.createEntity('trace'); engine.world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace);
    const input = new QueuedInputSource('host'); enqueue(engine, input, 'life.action', 'forage');
    let trace = engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!;
    expect(trace.events).toEqual(expect.arrayContaining([expect.objectContaining({ system: 'life-action', kind: 'decision' }), expect.objectContaining({ system: 'life-action', kind: 'commit' })]));
    trace.events = []; applyCommands(engine.world, []); engine.world.tick(); expect(result(engine)).toBeUndefined(); expect(trace.events).toEqual([]);
  });

  it('has explicit scheduler placement, sixth semantic binding, and deterministic result snapshots', () => {
    const run = () => { const engine = make(); const input = new QueuedInputSource('host'); enqueue(engine, input, 'life.action', 'forage'); return engine; };
    const a = run(), b = run(); expect(hashSnapshot(a.world.snapshot())).toBe(hashSnapshot(b.world.snapshot()));
    const bindings = a.world.query('KeyBinding').map(([id]) => a.world.getComponent<any>(id, 'KeyBinding')!);
    expect(bindings).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'life.action', signal: 'life.action', phase: 'action', source: 'life:player' })]));
    const ids = a.world.getSortedSystems().map((system) => system.id);
    expect(ids.indexOf('life-activity')).toBeLessThan(ids.indexOf('life-action'));
    expect(lifeActionCapability.systems[0].runsAfter).toContain('life-activity');
  });
});
