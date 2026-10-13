import { describe, expect, it } from 'vitest';
import { Engine } from '@runtime/engine.js';
import { applyCommands } from '@net/commands.js';
import { QueuedInputSource } from '@net/host/index.js';
import { hashSnapshot } from '@net/determinism.js';
import { compileAndParseLifeGamePackage } from '@assembly/life-package-compile.js';
import { threeSceneLifePackage } from '@assembly/life-package.fixture.js';
import type { DebugTrace, LifeContinuousMotion, LifePosition, LifeSelectedTarget, LifeTalkActionResult, Transform } from '@engine/protocol/components.js';
import { LIFE_DIALOGUE_CLOSE_ACTION } from './life-talk.js';

function make(raw: unknown = threeSceneLifePackage()): Engine { const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(raw).blueprint); return engine; }
function proximityPackage(nearbyRange = 1, placementRange?: number): Record<string, unknown> {
  const raw = threeSceneLifePackage() as any;
  raw.interaction = { nearbyRange, dialogueSessionPolicy: 'proximity' };
  if (placementRange !== undefined) raw.scenes[0].placements[0].interactionRange = placementRange;
  return raw;
}
function place(engine: Engine, x: number, y: number): void {
  engine.world.addComponent('life:player', { type: 'LifePosition', sceneId: 'town', x, y } as LifePosition);
  engine.world.addComponent('life:player', { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')!.sceneId = 'town';
}
function actions(engine: Engine, source: QueuedInputSource, values: Array<[string, string?]>): void {
  for (const [name, arg] of values) source.enqueueAction(name, arg === undefined ? undefined : { arg });
  applyCommands(engine.world, source.commandsForTick(engine.world.getVersion() + 1)); engine.world.tick();
}

describe('t2-life-talk', () => {
  it('opens an existing t3-dialogue session from nearby selected NPC talk', () => {
    const engine = make(); place(engine, 0, 1); const source = new QueuedInputSource('host');
    actions(engine, source, [['life.select-target', 'mayor'], ['life.action', 'talk']]);
    expect(engine.world.getComponent<any>('life:dialogue-session:player', 'LifeDialogueSession')).toMatchObject({ dialogueId: 'mayor.greeting', status: 'open' });
    expect(engine.world.getComponent<any>('life:dialogue-session:player', 'State')).toMatchObject({ current: 'start' });
    expect(engine.world.getComponent<LifeTalkActionResult>('life:player', 'LifeTalkActionResult')).toMatchObject({ status: 'opened' });
  });

  it('keeps target proximity and open-session state as final legality gates with reconstructable trace', () => {
    const far = make(); place(far, 3, 3); far.world.addComponent('life:player', { type: 'LifeSelectedTarget', placementId: 'mayor' } as LifeSelectedTarget);
    far.world.createEntity('trace'); far.world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace);
    actions(far, new QueuedInputSource('host'), [['life.action', 'talk']]);
    expect(far.world.getComponent<LifeTalkActionResult>('life:player', 'LifeTalkActionResult')).toMatchObject({ status: 'rejected', reason: 'target-not-nearby' });
    expect(far.world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events).toContainEqual(expect.objectContaining({ system: 'life-talk', kind: 'reject', why: 'target-not-nearby' }));

    const conflict = make(); place(conflict, 0, 1); const source = new QueuedInputSource('host');
    actions(conflict, source, [['life.select-target', 'mayor'], ['life.action', 'talk']]);
    actions(conflict, source, [['life.action', 'talk']]);
    expect(conflict.world.getComponent<LifeTalkActionResult>('life:player', 'LifeTalkActionResult')).toMatchObject({ status: 'rejected', reason: 'session-conflict' });
  });

  it('rehydrates authored runtime components from the catalog before dialogue runs, with trace optional', () => {
    const engine = make(); place(engine, 0, 1); const source = new QueuedInputSource('host');
    engine.world.createEntity('trace'); engine.world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 9 } as DebugTrace);
    actions(engine, source, [['life.select-target', 'mayor'], ['life.action', 'talk']]);
    const trace = engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!; trace.events = [];
    engine.world.removeComponent('life:dialogue-session:player', 'DialogueScript');
    engine.world.removeComponent('life:dialogue-session:player', 'Text');
    engine.world.tick();
    expect(engine.world.getComponent<any>('life:dialogue-session:player', 'DialogueScript')).toMatchObject({ fsmId: 'life-dialogue', nodes: { start: expect.any(Object) } });
    expect(engine.world.getComponent<any>('life:dialogue-session:player', 'Text')).toMatchObject({ content: 'Mayor：Welcome.' });
    expect(trace.events).toContainEqual(expect.objectContaining({ system: 'life-talk', kind: 'transition', what: expect.stringContaining('rehydrated'), why: 'mayor.greeting:start' }));

    engine.world.destroyEntity('trace');
    engine.world.removeComponent('life:dialogue-session:player', 'DialogueScript');
    engine.world.removeComponent('life:dialogue-session:player', 'Text');
    engine.world.tick();
    expect(engine.world.query('DebugTrace')).toHaveLength(0);
    expect(engine.world.getComponent('life:dialogue-session:player', 'DialogueScript')).toBeDefined();
  });

  it('clears an invalid persisted cursor and records why instead of leaving an open lock', () => {
    const engine = make(); place(engine, 0, 1); const source = new QueuedInputSource('host');
    engine.world.createEntity('trace'); engine.world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 11 } as DebugTrace);
    actions(engine, source, [['life.select-target', 'mayor'], ['life.action', 'talk']]);
    const trace = engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!; trace.events = [];
    engine.world.getComponent<any>('life:dialogue-session:player', 'State').current = 'legacy-missing-node';
    engine.world.tick();
    expect(engine.world.getAllEntities()).not.toContain('life:dialogue-session:player');
    expect(trace.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ system: 'life-talk', kind: 'reject', why: 'unknown-dialogue-node' }),
      expect.objectContaining({ system: 'life-talk', kind: 'transition', what: expect.stringContaining('open→cleared') }),
    ]));
  });

  it('closes the dedicated terminal session only through the queued semantic action and can reopen', () => {
    const engine = make(); place(engine, 0, 1); const source = new QueuedInputSource('host');
    engine.world.createEntity('trace'); engine.world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 3 } as DebugTrace);
    actions(engine, source, [['life.select-target', 'mayor'], ['life.action', 'talk']]);
    expect(engine.world.getComponent('life:dialogue-session:player', 'LifeDialogueSession')).toBeDefined();
    actions(engine, source, [[LIFE_DIALOGUE_CLOSE_ACTION]]);
    expect(engine.world.getAllEntities()).not.toContain('life:dialogue-session:player');
    expect(engine.world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events).toContainEqual(expect.objectContaining({ system: 'life-talk', kind: 'commit', what: expect.stringContaining('LifeDialogueSession=closed') }));
    actions(engine, source, [['life.action', 'talk']]);
    expect(engine.world.getComponent('life:dialogue-session:player', 'LifeDialogueSession')).toBeDefined();
  });

  it('keeps legacy sessions persistent but deterministically expires proximity sessions out of range', () => {
    const legacy = make(); place(legacy, 0, 1); const legacySource = new QueuedInputSource('host');
    actions(legacy, legacySource, [['life.select-target', 'mayor'], ['life.action', 'talk']]);
    place(legacy, 3, 3); legacy.world.tick();
    expect(legacy.world.getComponent('life:dialogue-session:player', 'LifeDialogueSession')).toBeDefined();

    const proximity = make(proximityPackage()); place(proximity, 0, 1); const source = new QueuedInputSource('host');
    proximity.world.createEntity('trace'); proximity.world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 17 } as DebugTrace);
    actions(proximity, source, [['life.select-target', 'mayor'], ['life.action', 'talk']]);
    place(proximity, 3, 3); proximity.world.tick();
    expect(proximity.world.getAllEntities()).not.toContain('life:dialogue-session:player');
    expect(proximity.world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ system: 'life-talk', kind: 'decision', what: 'life:player proximity dialogue expired', why: 'target-out-of-range' }),
      expect.objectContaining({ system: 'life-talk', kind: 'transition', what: 'life:player LifeDialogueSession=open→cleared', why: 'target-out-of-range' }),
    ]));
  });

  it('uses the compiled per-placement range rather than the wider package default for session expiry', () => {
    const engine = make(proximityPackage(8, 0)); place(engine, 1, 1); const source = new QueuedInputSource('host');
    actions(engine, source, [['life.select-target', 'mayor'], ['life.action', 'talk']]);
    expect(engine.world.getComponent('life:dialogue-session:player', 'LifeDialogueSession')).toBeDefined();
    place(engine, 0, 1); engine.world.tick();
    expect(engine.world.getAllEntities()).not.toContain('life:dialogue-session:player');
  });

  it('produces the same post-expiry snapshot hash for identical proximity runs', () => {
    const run = (): string => {
      const engine = make(proximityPackage()); place(engine, 0, 1); const source = new QueuedInputSource('host');
      actions(engine, source, [['life.select-target', 'mayor'], ['life.action', 'talk']]);
      place(engine, 3, 3); engine.world.tick();
      return hashSnapshot(engine.world.snapshot());
    };
    expect(run()).toBe(run());
  });
});
