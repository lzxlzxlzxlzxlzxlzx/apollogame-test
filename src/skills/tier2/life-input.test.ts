import { describe, expect, it } from 'vitest';
import { Engine } from '@runtime/engine.js';
import { applyCommands } from '@net/commands.js';
import { QueuedInputSource } from '@net/host/index.js';
import type { DebugTrace, InputQueue, LifeMoveRequest, LifePosition, LifeWarpRequest, Signal } from '@engine/protocol/components.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import { LIFE_INPUT_SIGNALS, lifeInputCapability } from './life-input.js';
import { LIFE_ACTION_SIGNAL } from './life-action.js';

function make(): Engine { const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(threeSceneLifePackage()).blueprint); return engine; }
const pos = (engine: Engine) => engine.world.getComponent<LifePosition>('life:player', 'LifePosition')!;
function action(engine: Engine, source: QueuedInputSource, name: string, arg?: string): void {
  source.enqueueAction(name, arg === undefined ? undefined : { arg });
  applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1)); engine.world.tick();
}
function externalSignal(engine: Engine, id: string, signal: Omit<Signal, 'type'>): void {
  engine.world.createEntity(id); engine.world.addComponent(id, { type: 'Signal', ...signal } as Signal);
}

describe('t2-life-input', () => {
  it('runs InputQueue → keybind → life-input → navigation in one tick through semantic enqueueAction', () => {
    const engine = make(); const source = new QueuedInputSource('host');
    source.enqueueAction('life.move.right');
    applyCommands(engine.world, source.commandsForTick(1)); engine.world.tick();
    expect(pos(engine)).toMatchObject({ sceneId: 'town', x: 1, y: 0 });
    expect(engine.world.hasComponent('life:player', 'LifeMoveRequest')).toBe(false);
    const ids = engine.world.getSortedSystems().map((system) => system.id);
    expect(ids.indexOf('keybind')).toBeLessThan(ids.indexOf('life-input'));
    expect(ids.indexOf('life-input')).toBeLessThan(ids.indexOf('life-navigation'));
  });

  it('compiles only closed semantic action bindings with phase action and player source', () => {
    const engine = make();
    const bindings = engine.world.query('KeyBinding').map(([id]) => [id, engine.world.getComponent<any>(id, 'KeyBinding')]);
    expect(bindings).toHaveLength(11);
    expect(bindings.map(([, binding]) => binding.key).sort()).toEqual([...LIFE_INPUT_SIGNALS, 'life.move.start', 'life.move.stop', LIFE_ACTION_SIGNAL, 'life.select-item', 'life.select-target', 'life.advance-day'].sort());
    for (const [, binding] of bindings) expect(binding).toMatchObject({ key: binding.signal, phase: 'action', source: 'life:player' });
  });

  it('maps every direction and explicit warp while rejecting malformed warp args', () => {
    const engine = make(); const source = new QueuedInputSource('host');
    action(engine, source, 'life.move.right'); action(engine, source, 'life.move.down'); action(engine, source, 'life.move.left'); action(engine, source, 'life.move.up');
    expect(pos(engine)).toMatchObject({ sceneId: 'town', x: 0, y: 0 });
    action(engine, source, 'life.move.right'); action(engine, source, 'life.move.right'); action(engine, source, 'life.move.right'); action(engine, source, 'life.warp', 'town-farm-door');
    expect(pos(engine)).toMatchObject({ sceneId: 'farm', x: 0, y: 0 });
    const before = { ...pos(engine) }; action(engine, source, 'life.warp', '   ');
    expect(pos(engine)).toEqual(before);
  });

  it('folds exact duplicates but rejects different intents without choosing queue order', () => {
    const duplicated = make();
    externalSignal(duplicated, 'a', { name: 'life.move.right', source: 'life:player' }); externalSignal(duplicated, 'b', { name: 'life.move.right', source: 'life:player' });
    duplicated.world.tick(); expect(pos(duplicated).x).toBe(1);
    const conflicting = make(); const before = { ...pos(conflicting) };
    externalSignal(conflicting, 'a', { name: 'life.move.right', source: 'life:player' }); externalSignal(conflicting, 'b', { name: 'life.warp', source: 'life:player', arg: 'town-farm-door' });
    conflicting.world.tick(); expect(pos(conflicting)).toEqual(before);
  });

  it('does not overwrite direct navigation requests and ignores unrelated input without altering InputQueue', () => {
    const engine = make(); const source = new QueuedInputSource('host');
    engine.world.addComponent('life:player', { type: 'LifeMoveRequest', dx: -1, dy: 0 } as LifeMoveRequest);
    action(engine, source, 'life.move.right');
    expect(pos(engine)).toMatchObject({ x: 0, y: 0 }); // direct left request, not bridged right, reaches navigation
    source.enqueueAction('not.life.action'); applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1));
    const queue = engine.world.getComponent<InputQueue>('global-input', 'InputQueue')!; const before = JSON.stringify(queue.actions);
    engine.world.tick();
    expect(JSON.stringify(engine.world.getComponent<InputQueue>('global-input', 'InputQueue')!.actions)).toBe(before);
  });

  it('traces accepted and rejected routing, while no input is a trace no-op', () => {
    const engine = make(); engine.world.tick(); engine.world.createEntity('trace'); engine.world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace);
    engine.world.tick(); expect(engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events).toEqual([]);
    const source = new QueuedInputSource('host'); action(engine, source, 'life.move.right');
    let events = engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events;
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ system: 'life-input', kind: 'decision' }), expect.objectContaining({ system: 'life-input', kind: 'commit' })]));
    externalSignal(engine, 'bad-warp', { name: 'life.warp', source: 'life:player', arg: '' }); engine.world.tick();
    events = engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events;
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ system: 'life-input', kind: 'reject' })]));
  });

  it('declares the ordering contract explicitly', () => {
    expect(lifeInputCapability.systems[0].runsAfter).toContain('keybind');
    expect(lifeInputCapability.systems[0].runsBefore).toContain('life-navigation');
  });
});
