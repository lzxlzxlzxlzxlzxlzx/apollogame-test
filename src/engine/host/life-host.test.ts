// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { compileAndParseLifeGamePackage } from '../../assembly/life-package-compile.js';
import { threeSceneLifePackage } from '../../assembly/life-package.fixture.js';
import { seasideMarketHostDescriptorFixture } from '../../authoring/life-host-descriptor.fixture.js';
import type { DebugTrace } from '../protocol/components.js';
import { World } from '../core/world.js';
import { Engine } from '../../runtime/engine.js';
import { hashSnapshot } from '../../net/determinism.js';
import { validateLayoutNode } from '../../ui/components/index.js';
import { buildLifeStandardHud, buildLifeStandardUi } from './life-hud.js';
import { EMPTY_LIFE_INPUT_STATE, installLifeKeyboard, reduceLifeInput } from './life-input.js';
import { buildLifeInteractionNode, buildLifeInteractionOptions, buildLifeInteractionPresentation, createLifeInteractionTraceSink, LifeInteractionController, type LifeInteractionOption } from './life-interaction.js';
import { humanizeLifeId, selectLifeHostView, type LifeHostViewModel } from './life-presenter.js';

function alienPackage(): Record<string, unknown> {
  const source = JSON.stringify(threeSceneLifePackage());
  return JSON.parse(source
    .replaceAll('three-scene-life', 'orbital-bazaar')
    .replaceAll('Three Scene Life', 'Orbital Bazaar')
    .replaceAll('town', 'orbital-hub')
    .replaceAll('farm', 'glasshouse')
    .replaceAll('river', 'tidal-canal')
    .replaceAll('mayor', 'archivist')
    .replaceAll('berry', 'moonfruit')
    .replaceAll('"kind":"orbital-hub"', '"kind":"town"')
    .replaceAll('"kind":"glasshouse"', '"kind":"farm"')) as Record<string, unknown>;
}

function view(overrides: Partial<LifeHostViewModel> = {}): LifeHostViewModel {
  return {
    scene: 'orbital-hub', x: 2, y: 3, poseX: 2, poseY: 3, date: 'Cycle 4', slot: 'Blue Shift', placeLabel: 'Orbital Hub', canInteract: true,
    interactionSummary: '', inventory: [], allowedActions: [], nearby: [], nearbyWarps: [], affordances: [], results: {}, objective: 'Serve the first visitor', relationships: [],
    ...overrides,
  };
}

describe('generic Life host', () => {
  it('projects a second package with arbitrary ids without content branches or World writes', () => {
    const engine = new Engine();
    engine.load(compileAndParseLifeGamePackage(alienPackage()).blueprint);
    engine.world.tick();
    const before = engine.world.snapshot();
    const projected = selectLifeHostView(engine.world);
    expect(projected).toMatchObject({ scene: 'orbital-hub', placeLabel: 'Orbital Hub Forage' });
    expect(projected.interactionSummary).not.toContain('镇长');
    expect(engine.world.snapshot()).toEqual(before);
  });

  it('anchors render-local WorldUI to the continuous player foot while keeping interaction context discrete', () => {
    const engine = new Engine(); engine.load(compileAndParseLifeGamePackage(alienPackage()).blueprint);
    const position = engine.world.getComponent<any>('life:player', 'LifePosition')!;
    const transform = engine.world.getComponent<any>('life:player', 'Transform')!;
    transform.x = 2.75; transform.y = 3.25;
    const before = engine.world.snapshot(); const projected = selectLifeHostView(engine.world);
    const root: readonly LifeInteractionOption[] = [{ id: 'probe', label: 'Probe', enabled: true, actions: [{ name: 'life.action', arg: 'talk' }] }];
    const presentation = buildLifeInteractionPresentation(projected, root, { open: false, path: [], selected: 0, sourceKey: '' })!;
    expect(projected).toMatchObject({ x: position.x, y: position.y, poseX: 2.75, poseY: 3.25 });
    expect(presentation.transform).toEqual({ x: 2.75, y: 3.25 });
    expect(engine.world.snapshot()).toEqual(before);
  });

  it('consumes the 17A descriptor HUD title and labels into a valid LayoutNode tree', () => {
    const descriptor = seasideMarketHostDescriptorFixture();
    const model = view({ inventory: [{ itemId: 'cargo.star-fruit', count: 3 }], relationships: [{ npcId: 'dock-keeper', value: 7, levelId: 'trusted', levelTitle: 'Trusted' }] });
    const hud = buildLifeStandardHud(model, descriptor.hud);
    const ui = buildLifeStandardUi(model, descriptor.hud, null);
    const text = JSON.stringify(hud);
    expect(text).toContain('海风集市');
    expect(text).toContain('营业日');
    expect(text).toContain('货箱');
    expect(text).toContain('Dock Keeper');
    expect(validateLayoutNode(ui)).toEqual([]);
  });

  it('humanizes arbitrary authored ids deterministically', () => {
    expect(humanizeLifeId('npc:deep_space.vendor')).toBe('Deep Space Vendor');
    expect(humanizeLifeId('潮汐-集市')).toBe('潮汐 集市');
  });

  it('supports recursive item choice and identical keyboard/pointer leaf results', () => {
    const model = view({ affordances: [
      { id: 'placement:archive-terminal:gift', action: 'gift', targetKind: 'placement', targetId: 'archive-terminal', available: true, candidateItemIds: ['relic.blue-key', 'relic.red-key'] },
      { id: 'placement:archivist:talk', action: 'talk', targetKind: 'placement', targetId: 'archivist', available: true },
    ] });
    const options = buildLifeInteractionOptions(model);
    const keyboard = new LifeInteractionController(); keyboard.interact(options, model); keyboard.confirm(options); keyboard.cycle(options, 1);
    const expected = keyboard.confirm(options);
    const pointer = new LifeInteractionController(); pointer.interact(options, model); pointer.activate(options, 'gift:archive-terminal');
    expect(pointer.activate(options, 'gift:relic.red-key')).toEqual(expected);
    expect(expected).toEqual([
      { name: 'life.select-target', arg: 'archive-terminal' },
      { name: 'life.select-item', arg: 'relic.red-key' },
      { name: 'life.action', arg: 'gift' },
    ]);
  });

  it('closes an open menu when position or recursive content changes', () => {
    const root: readonly LifeInteractionOption[] = [
      { id: 'a', label: 'A', enabled: true, children: [{ id: 'a.1', label: 'One', enabled: true, actions: [{ name: 'life.action', arg: 'talk' }] }] },
      { id: 'b', label: 'B', enabled: true, actions: [{ name: 'life.action', arg: 'mine' }] },
    ];
    const controller = new LifeInteractionController(); controller.interact(root, view());
    controller.reconcile(view({ x: 4 }), root);
    expect(controller.current.open).toBe(false);
    controller.interact(root, view());
    const changed = [{ ...root[0]!, children: [{ ...root[0]!.children![0]!, label: 'Changed' }] }, root[1]!] as const;
    controller.reconcile(view(), changed);
    expect(controller.current.open).toBe(false);
  });

  it('builds valid prompt and recursive menu nodes without Modal', () => {
    const model = view({ affordances: [{ id: 'tile:x:plant', action: 'plant', targetKind: 'tile', targetId: 'x', available: true, candidateItemIds: ['seed.nebula'] }] });
    const options = buildLifeInteractionOptions(model);
    expect(validateLayoutNode(buildLifeInteractionNode(options, { open: false, path: [], selected: 0, sourceKey: '' })!)).toEqual([]);
    const controller = new LifeInteractionController(); controller.interact(options, model);
    expect(validateLayoutNode(buildLifeInteractionNode(options, controller.current)!)).toEqual([]);
    expect(JSON.stringify(buildLifeInteractionNode(options, controller.current))).not.toContain('Modal');
  });

  it('reduces aliases, repeat, edge controls and release events without DOM state', () => {
    let result = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyW' });
    expect(result).toMatchObject({ preventDefault: true, effects: [{ kind: 'interaction', operation: 'close' }, { kind: 'action', name: 'life.move.state', arg: '1' }] });
    const repeated = reduceLifeInput(result.state, { kind: 'keydown', code: 'KeyW', repeat: true });
    expect(repeated).toMatchObject({ state: result.state, preventDefault: true, effects: [] });
    result = reduceLifeInput(result.state, { kind: 'keydown', code: 'ArrowUp' });
    expect(result.effects).toEqual([{ kind: 'interaction', operation: 'close' }, { kind: 'action', name: 'life.move.state', arg: '1' }]);
    result = reduceLifeInput(result.state, { kind: 'keyup', code: 'KeyW' });
    expect(result.effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '1' }]);
    result = reduceLifeInput(result.state, { kind: 'keydown', code: 'Tab', shiftKey: true });
    expect(result.effects).toEqual([{ kind: 'interaction', operation: 'previous' }]);
    expect(result.state.heldCodes).toEqual(['ArrowUp']);
    expect(reduceLifeInput(result.state, { kind: 'keydown', code: 'KeyN', repeat: true })).toMatchObject({ preventDefault: true, effects: [] });
  });

  it.each([
    ['KeyE', { kind: 'interaction', operation: 'request' }],
    ['Tab', { kind: 'interaction', operation: 'next' }],
    ['Enter', { kind: 'interaction', operation: 'confirm' }],
    ['Escape', { kind: 'interaction', operation: 'back' }],
  ] as const)('preserves held movement through %s once and ignores its repeat', (code, effect) => {
    const held = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyD' });
    const first = reduceLifeInput(held.state, { kind: 'keydown', code });
    expect(first).toMatchObject({ state: held.state, effects: [effect] });
    expect(reduceLifeInput(first.state, { kind: 'keydown', code, repeat: true })).toMatchObject({ state: held.state, effects: [] });
  });

  it.each([
    ['KeyN', { kind: 'action', name: 'life.advance-day' }],
    ['KeyT', { kind: 'action', name: 'life.advance-time' }],
  ] as const)('retains the existing release-before-time-action behavior for %s', (code, effect) => {
    const held = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyD' });
    expect(reduceLifeInput(held.state, { kind: 'keydown', code })).toMatchObject({ state: EMPTY_LIFE_INPUT_STATE, effects: [{ kind: 'action', name: 'life.move.state', arg: '0' }, effect] });
  });

  it('keeps the physical direction active across interaction repeat and stops only on keyup', () => {
    const held = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyD' });
    const interaction = reduceLifeInput(held.state, { kind: 'keydown', code: 'KeyE' });
    const staleRepeat = reduceLifeInput(interaction.state, { kind: 'keydown', code: 'KeyD', repeat: true });
    expect(staleRepeat).toMatchObject({ state: held.state, effects: [] });
    expect(reduceLifeInput(staleRepeat.state, { kind: 'keyup', code: 'KeyD' })).toMatchObject({ state: EMPTY_LIFE_INPUT_STATE, effects: [{ kind: 'action', name: 'life.move.state', arg: '0' }] });
  });

  it('does not let stale alias releases stop a fresh same-direction key', () => {
    const first = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyW' });
    const alias = reduceLifeInput(first.state, { kind: 'keydown', code: 'ArrowUp' });
    const afterBlur = reduceLifeInput(alias.state, { kind: 'blur' });
    const fresh = reduceLifeInput(afterBlur.state, { kind: 'keydown', code: 'ArrowUp' });
    expect(reduceLifeInput(fresh.state, { kind: 'keyup', code: 'KeyW' })).toMatchObject({ state: fresh.state, effects: [] });
    expect(reduceLifeInput(fresh.state, { kind: 'keyup', code: 'ArrowUp' }).effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '0' }]);
  });

  it('preserves Up+Left through E and its repeat, then emits complete states in physical keyup order', () => {
    const up = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyW' });
    const diagonal = reduceLifeInput(up.state, { kind: 'keydown', code: 'KeyA' });
    const interact = reduceLifeInput(diagonal.state, { kind: 'keydown', code: 'KeyE' });
    expect(interact).toMatchObject({ state: diagonal.state, effects: [{ kind: 'interaction', operation: 'request' }] });
    expect(reduceLifeInput(interact.state, { kind: 'keydown', code: 'KeyE', repeat: true })).toMatchObject({ state: diagonal.state, effects: [] });
    const leftReleased = reduceLifeInput(interact.state, { kind: 'keyup', code: 'KeyA' });
    expect(leftReleased.effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '1' }]);
    expect(reduceLifeInput(leftReleased.state, { kind: 'keyup', code: 'KeyW' }).effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '0' }]);
  });

  it('projects each direction transition as one complete physical held-state snapshot', () => {
    const left = reduceLifeInput(EMPTY_LIFE_INPUT_STATE, { kind: 'keydown', code: 'KeyA' });
    expect(left.effects).toEqual([
      { kind: 'interaction', operation: 'close' },
      { kind: 'action', name: 'life.move.state', arg: '4' },
    ]);
    const diagonal = reduceLifeInput(left.state, { kind: 'keydown', code: 'KeyW' });
    expect(diagonal.effects.at(-1)).toEqual({ kind: 'action', name: 'life.move.state', arg: '5' });
    const opposed = reduceLifeInput(diagonal.state, { kind: 'keydown', code: 'KeyD' });
    expect(opposed.effects.at(-1)).toEqual({ kind: 'action', name: 'life.move.state', arg: '13' });
    const rightReleased = reduceLifeInput(opposed.state, { kind: 'keyup', code: 'KeyD' });
    expect(rightReleased.effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '5' }]);
    const upReleased = reduceLifeInput(rightReleased.state, { kind: 'keyup', code: 'KeyW' });
    expect(upReleased.effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '4' }]);
    expect(reduceLifeInput(upReleased.state, { kind: 'keyup', code: 'KeyA' })).toMatchObject({
      state: EMPTY_LIFE_INPUT_STATE,
      effects: [{ kind: 'action', name: 'life.move.state', arg: '0' }],
    });
  });

  it('auto-opens an authoritative dialogue panel and closes it when the session projection disappears', () => {
    const events: string[] = [];
    const controller = new LifeInteractionController({ record: (kind, what) => events.push(`${kind}:${what}`) });
    const active = view({ dialogueActive: true, dialogueTarget: 'archivist', dialogue: '档案员：请继续。', dialogueKind: 'line', nearby: ['archivist'] });
    const options = buildLifeInteractionOptions(active);
    controller.reconcile(active, options);
    expect(controller.current).toMatchObject({ open: true, selected: 0 });
    const closed = view({ x: 9, nearby: [] });
    controller.reconcile(closed, buildLifeInteractionOptions(closed));
    expect(controller.current.open).toBe(false);
    expect(events).toContain('transition:dialogue:active→closed');
  });

  it.each(['blur', 'visibility'] as const)('releases every active direction on %s', (kind) => {
    const state = { heldCodes: ['KeyW', 'ArrowUp', 'KeyD'] };
    expect(reduceLifeInput(state, { kind }).effects).toEqual([{ kind: 'action', name: 'life.move.state', arg: '0' }]);
  });

  it('keeps DOM installation a thin adapter and prevents handled page keys', () => {
    const target = new EventTarget(); const calls: string[] = [];
    const dispose = installLifeKeyboard(target, {
      enqueueAction: (name, arg) => calls.push(`${name}:${arg?.arg ?? ''}`), requestInteraction: () => calls.push('request'), cycleInteraction: (delta) => calls.push(`cycle:${delta}`), confirmInteraction: () => calls.push('confirm'), backInteraction: () => calls.push('back'), closeInteraction: () => calls.push('close'),
    });
    const event = new KeyboardEvent('keydown', { code: 'ArrowDown', cancelable: true }); target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    target.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', cancelable: true }));
    expect(calls).toEqual(['close', 'life.move.state:2', 'request']);
    dispose();
  });

  it('records optional bounded host trace while leaving deterministic hash unchanged', () => {
    const world = new World(); world.createEntity('trace');
    world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 9, max: 8 } satisfies DebugTrace);
    const before = hashSnapshot(world.snapshot());
    const controller = new LifeInteractionController(createLifeInteractionTraceSink(world));
    controller.interact([]);
    const trace = world.getComponent<DebugTrace>('trace', 'DebugTrace')!;
    expect(trace.events).toEqual([expect.objectContaining({ tick: 9, system: 'life-host-interaction', kind: 'reject', what: 'interaction:none' })]);
    expect(hashSnapshot(world.snapshot())).toBe(before);
    expect(new LifeInteractionController().interact([])).toEqual([]);
  });

  it('records dialogue panel lifecycle with opt-in trace, but is a true no-op when trace is absent', () => {
    const active = view({ dialogueActive: true, dialogueTarget: 'archivist', dialogue: '档案员：请继续。', dialogueKind: 'line', nearby: ['archivist'] });
    const options = buildLifeInteractionOptions(active);
    const traced = new World(); traced.createEntity('trace'); traced.addComponent('trace', { type: 'DebugTrace', events: [], tick: 12, max: 8 } satisfies DebugTrace);
    const beforeHash = hashSnapshot(traced.snapshot()); const controller = new LifeInteractionController(createLifeInteractionTraceSink(traced));
    controller.reconcile(active, options); controller.reconcile(view(), []);
    const events = traced.getComponent<DebugTrace>('trace', 'DebugTrace')!.events;
    expect(events).toContainEqual(expect.objectContaining({ kind: 'transition', what: 'dialogue:panel-open' }));
    expect(events).toContainEqual(expect.objectContaining({ kind: 'transition', what: 'dialogue:active→closed' }));
    expect(events.filter((event) => event.tick === 12 && event.system === 'life-host-interaction')).toHaveLength(3);
    expect(hashSnapshot(traced.snapshot())).toBe(beforeHash);

    const silent = new World(); const silentBefore = silent.snapshot(); const silentController = new LifeInteractionController(createLifeInteractionTraceSink(silent));
    silentController.reconcile(active, options); silentController.reconcile(view(), []); expect(silent.snapshot()).toEqual(silentBefore);
  });
});
