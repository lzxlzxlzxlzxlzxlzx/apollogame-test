// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { threeSceneLifePackage } from '../../assembly/life-package.fixture.js';
import { littleValleyHostDescriptorFixture, seasideMarketHostDescriptorFixture } from '../../authoring/life-host-descriptor.fixture.js';
import type { LifeGamePackage } from '../protocol/life-sim.js';
import type { LifeContinuousMotion, LifePosition, LifeZone, State, Transform } from '../protocol/components.js';
import { applyCommands } from '../../net/commands.js';
import { hashWithOrder } from '../../net/index.js';
import { MemoryStoragePort } from '../../services/storage/index.js';
import { validateLayoutNode } from '../../ui/components/index.js';
import littleValleyAssetSlots from '../../../games/game-simlife/little-valley.asset-slots.json';
import { buildLifeStandardHud } from './life-hud.js';
import { buildLifeInteractionOptions, buildLifeInteractionPresentation, CLOSED_LIFE_INTERACTION, LifeInteractionController } from './life-interaction.js';
import { LifeHostSaveAdapter, lifeHostPersistentHash } from './life-save.js';
import { selectLifeHostView } from './life-presenter.js';
import { createLifeGameSession, createPersistentLifeGameSession, lifeHostLayout, mountLifeGame, type LifeGameCoreSession, type LifeGameHostInput } from './life-game-host.js';

function alternateInput() {
  const descriptor = seasideMarketHostDescriptorFixture();
  const assetSlots = structuredClone(littleValleyAssetSlots) as unknown as Record<string, unknown>;
  assetSlots.game = descriptor.slug;
  const lifePackage = threeSceneLifePackage() as unknown as LifeGamePackage;
  lifePackage.camera = { profile: descriptor.viewport.profile };
  return { descriptor, lifePackage, assetSlots };
}

function dialogueInput(): LifeGameHostInput {
  const base = alternateInput();
  const authored = threeSceneLifePackage() as unknown as LifeGamePackage;
  const lifePackage: LifeGamePackage = {
    ...authored,
    camera: base.lifePackage.camera,
    dialogueCatalog: [{ id: 'mayor.greeting', graph: {
      start: { kind: 'line', speaker: 'Mayor', text: 'Choose a route.', next: 'choose' },
      choose: { kind: 'choice', speaker: 'Mayor', prompt: 'Pick one.', options: [
        { id: 'first', text: 'First route', next: 'first' },
        { id: 'second', text: 'Second route', next: 'second' },
      ] },
      first: { kind: 'line', speaker: 'Mayor', text: 'First selected.', next: null },
      second: { kind: 'line', speaker: 'Mayor', text: 'Second selected.', next: null },
    } }],
  };
  return { ...base, lifePackage };
}

function step(session: LifeGameCoreSession, values: ReadonlyArray<readonly [string, string?]> = []): void {
  for (const [name, arg] of values) session.input.enqueueAction(name, arg === undefined ? undefined : { arg });
  applyCommands(session.engine.world, session.input.commandsForTick(session.engine.world.getVersion() + 1));
  session.engine.world.tick();
}

function placeByMayor(session: LifeGameCoreSession): void {
  session.engine.world.addComponent('life:player', { type: 'LifePosition', sceneId: 'town', x: 0, y: 1 } as LifePosition);
  session.engine.world.addComponent('life:player', { type: 'Transform', x: 0, y: 1, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')!.sceneId = 'town';
  step(session);
}

async function seedActiveDialogue(input: LifeGameHostInput, port: MemoryStoragePort, node: 'line' | 'choice'): Promise<string> {
  const session = createLifeGameSession(input);
  const saves = new LifeHostSaveAdapter(session.descriptor, session.engine.world, port);
  placeByMayor(session);
  step(session, [['life.select-target', 'mayor'], ['life.action', 'talk']]);
  if (node === 'choice') step(session, [['dialogue.advance']]);
  expect(session.engine.world.getComponent<State>('life:dialogue-session:player', 'State')?.current).toBe(node === 'line' ? 'start' : 'choose');
  expect(await saves.save(session.engine.world)).toBe(true);
  return saves.slot;
}

function canvasContext(): CanvasRenderingContext2D {
  const values: Record<PropertyKey, unknown> = {
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    measureText: vi.fn(() => ({ width: 24 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
  };
  return new Proxy(values, {
    get: (target, key) => target[key] ?? (target[key] = vi.fn()),
    set: (target, key, value) => { target[key] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

describe('mountLifeGame shared host composition', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext());
    let nextFrame = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => ++nextFrame));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('gives every descriptor selecting the standard profile the same logical field, HUD safe area and responsive fit', () => {
    expect(lifeHostLayout(littleValleyHostDescriptorFixture())).toEqual(lifeHostLayout(seasideMarketHostDescriptorFixture()));
    expect(lifeHostLayout(littleValleyHostDescriptorFixture())).toEqual({
      fieldW: 900,
      fieldH: 620,
      topBarH: 52,
      viewportMode: 'responsive',
      sceneBackground: '#183325',
      wrapperBackground: '#102017',
    });
  });

  it('mounts a second arbitrary descriptor/package/slot bundle with no content branch', () => {
    const core = createLifeGameSession(alternateInput());
    const view = selectLifeHostView(core.engine.world);
    const hud = buildLifeStandardHud(view, core.descriptor.hud);
    expect(core.descriptor.slug).toBe('game-seaside-market');
    expect(core.assetSlots.game).toBe(core.descriptor.slug);
    expect(JSON.stringify(hud)).toContain('海风集市');
    expect(JSON.stringify(hud)).not.toContain('Little Valley');
    expect(validateLayoutNode(hud)).toEqual([]);
  });

  it('projects authored scene and destination copy into HUD and the shared E interaction on an arrival warp', () => {
    const core = createLifeGameSession(alternateInput());
    const player = core.engine.world.getComponent<LifePosition>('life:player', 'LifePosition')!;
    const transform = core.engine.world.getComponent<Transform>('life:player', 'Transform')!;
    player.x = 3; player.y = 0; transform.x = 3; transform.y = 0;
    step(core);
    const view = selectLifeHostView(core.engine.world);
    expect(view).toMatchObject({ placeLabel: 'Harbor Town', nearbyWarps: ['town-farm-door'], warpLabels: { 'town-farm-door': '前往农场' } });
    const hud = buildLifeStandardHud(view, core.descriptor.hud);
    expect(JSON.stringify(hud)).toContain('地点 Harbor Town');
    const options = buildLifeInteractionOptions(view);
    expect(options).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'warp:town-farm-door', label: '前往农场', enabled: true })]));
    const presentation = buildLifeInteractionPresentation(view, options, CLOSED_LIFE_INTERACTION);
    expect(JSON.stringify(presentation)).toContain('前往农场（E）');
    const controller = new LifeInteractionController();
    expect(controller.interact(options, view)).toEqual([{ name: 'life.warp', arg: 'town-farm-door' }]);
  });

  it('supports pointer departure, no arrival bounce, direct keyboard return, and closes the old-scene menu', async () => {
    const frames: FrameRequestCallback[] = []; let raf = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return ++raf; }));
    const input = alternateInput();
    const townNpc = input.lifePackage.scenes[0]!.placements[0]! as { x: number; y: number };
    townNpc.x = 2; townNpc.y = 0; // town door has talk + warp, so E opens a real pointer-selectable menu
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 640 }, clientHeight: { value: 720 } }); document.body.appendChild(container);
    const handle = mountLifeGame(container, { ...input, loadArt: async () => false });
    const mounted = await handle.ready; let now = 0;
    const frame = (): void => { const callback = frames.shift(); expect(callback).toBeDefined(); now += 80; callback!(now); };
    const player = mounted.session.engine.world.getComponent<LifePosition>('life:player', 'LifePosition')!;
    const transform = mounted.session.engine.world.getComponent<Transform>('life:player', 'Transform')!;
    player.x = 3; player.y = 0; transform.x = 3; transform.y = 0;
    step(mounted.session);
    frame(); frame();
    expect(container.textContent).toContain('互动（E）');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', cancelable: true }));
    frame();
    const departureLeaf = container.querySelector<HTMLElement>('[data-arg="warp:town-farm-door"]');
    expect(departureLeaf).not.toBeNull();
    departureLeaf!.click();
    frame(); frame();
    expect(player).toMatchObject({ sceneId: 'farm', x: 0, y: 0 });
    expect(container.querySelector('[data-arg="warp:town-farm-door"]')).toBeNull();
    frame(); frame();
    expect(player.sceneId).toBe('farm'); // reciprocal warp shares the arrival cell but does not auto-trigger
    expect(container.textContent).toContain('地点 Old Farm');
    mounted.session.engine.world.getComponent<LifeZone>('life:zone:farm:farm-field', 'LifeZone')!.allowedActions = [];
    step(mounted.session); frame(); frame();
    expect(selectLifeHostView(mounted.session.engine.world).affordances.filter((entry) => entry.available)).toEqual([
      expect.objectContaining({ action: 'warp', targetId: 'farm-town-door' }),
    ]);
    expect(container.textContent).toContain('返回港镇（E）');

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', cancelable: true }));
    frame(); frame();
    expect(player).toMatchObject({ sceneId: 'town', x: 0, y: 0 });
    handle.dispose();
  });

  it('rejects every authoring boundary before mutating the mount container', () => {
    const container = document.createElement('div');
    const valid = alternateInput();
    const badDescriptor = { ...valid.descriptor, extra: true };
    expect(() => mountLifeGame(container, { ...valid, descriptor: badDescriptor })).toThrow();
    expect(container.childElementCount).toBe(0);
    expect(() => mountLifeGame(container, { ...valid, lifePackage: {} })).toThrow();
    expect(container.childElementCount).toBe(0);
    expect(() => mountLifeGame(container, { ...valid, assetSlots: { ...valid.assetSlots, game: 'wrong-game' } })).toThrow();
    expect(container.childElementCount).toBe(0);

    const missingProfile = structuredClone(valid.lifePackage) as LifeGamePackage;
    delete missingProfile.camera;
    expect(() => mountLifeGame(container, { ...valid, lifePackage: missingProfile })).toThrow(/camera profile/i);
    expect(container.childElementCount).toBe(0);
  });

  it('makes absent, missing and incompatible storage startup explicit and fresh-safe', async () => {
    const input = alternateInput();
    const absent = await createPersistentLifeGameSession(input);
    const freshHash = lifeHostPersistentHash(absent.session.engine.world);
    expect(absent.restoreResult).toBe('not-configured');
    expect(absent.saves).toBeUndefined();

    const missingPort = new MemoryStoragePort();
    const missing = await createPersistentLifeGameSession({ ...input, storage: missingPort });
    expect(missing.restoreResult).toBe('missing');
    expect(lifeHostPersistentHash(missing.session.engine.world)).toEqual(freshHash);

    const incompatiblePort = new MemoryStoragePort();
    const source = createLifeGameSession(input);
    const adapter = new LifeHostSaveAdapter(input.descriptor, source.engine.world, incompatiblePort);
    await adapter.save(source.engine.world);
    const saved = (await incompatiblePort.load(adapter.slot))!;
    await incompatiblePort.save(adapter.slot, { ...saved, meta: { ...saved.meta, label: undefined } });
    const incompatible = await createPersistentLifeGameSession({ ...input, storage: incompatiblePort });
    expect(incompatible.restoreResult).toBe('incompatible');
    expect(lifeHostPersistentHash(incompatible.session.engine.world)).toEqual(freshHash);
  });

  it('rehydrates a real persisted line before the immediate host projection without copying authored runtime into the save', async () => {
    const port = new MemoryStoragePort(); const input = dialogueInput();
    const slot = await seedActiveDialogue(input, port, 'line');
    const stored = (await port.load(slot))!;
    const storedTypes = Object.values(stored.snapshot).flatMap((components) => Object.keys(components));
    expect(storedTypes).not.toEqual(expect.arrayContaining(['DialogueScript', 'Text', 'WorldUI2D', 'DebugTrace']));

    const restored = await createPersistentLifeGameSession({ ...input, storage: port });
    expect(restored.restoreResult).toBe('restored');
    expect(selectLifeHostView(restored.session.engine.world)).toMatchObject({
      dialogueActive: true, dialogue: 'Mayor：Choose a route.', dialogueKind: 'line', dialogueTerminal: false,
    });
    expect(restored.session.engine.world.getComponent('life:dialogue-session:player', 'DialogueScript')).toBeDefined();
    expect(restored.session.engine.world.getComponent('life:dialogue-session:player', 'Text')).toMatchObject({ content: 'Mayor：Choose a route.' });
    expect(restored.session.engine.world.query('DebugTrace')).toHaveLength(0);
    expect(lifeHostPersistentHash(restored.session.engine.world)).toBe(stored.meta.hash);
  });

  it('fails safe by closing an out-of-range restored session under the authored proximity policy', async () => {
    const port = new MemoryStoragePort(); const base = dialogueInput();
    const input: LifeGameHostInput = {
      ...base,
      lifePackage: { ...(base.lifePackage as LifeGamePackage), interaction: { nearbyRange: 1, dialogueSessionPolicy: 'proximity' } },
    };
    const slot = await seedActiveDialogue(input, port, 'line');
    const stored = (await port.load(slot))!;
    const player = stored.snapshot['life:player']!;
    player.LifePosition = { type: 'LifePosition', sceneId: 'town', x: 3, y: 3 } as LifePosition;
    player.Transform = { type: 'Transform', x: 3, y: 3, rotation: 0, scaleX: 1, scaleY: 1 } as Transform;
    stored.meta.hash = hashWithOrder(stored.snapshot, stored.order);
    await port.save(slot, stored);

    const restored = await createPersistentLifeGameSession({ ...input, storage: port });
    expect(restored.restoreResult).toBe('restored');
    expect(restored.session.engine.world.getAllEntities()).not.toContain('life:dialogue-session:player');
    expect(selectLifeHostView(restored.session.engine.world).dialogueActive).toBe(false);
    expect(restored.session.engine.world.query('DebugTrace')).toHaveLength(0);
  });

  it('restores an active choice for first paint and supports Tab, Enter and pointer progression', async () => {
    const frames: FrameRequestCallback[] = []; let raf = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return ++raf; }));
    const port = new MemoryStoragePort(); const input = dialogueInput();
    await seedActiveDialogue(input, port, 'choice');
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 640 }, clientHeight: { value: 720 } }); document.body.appendChild(container);
    const handle = mountLifeGame(container, { ...input, storage: port, loadArt: async () => false });
    const mounted = await handle.ready; let now = 0;
    const frame = (): void => { const callback = frames.shift(); expect(callback).toBeDefined(); now += 80; callback!(now); };

    frame();
    let panel = container.querySelector<HTMLElement>('[data-entity-anchor="life:player"]')!;
    expect(panel.textContent).toContain('Mayor：Pick one.');
    expect(panel.textContent).toContain('First route'); expect(panel.textContent).toContain('Second route');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', cancelable: true }));
    frame(); frame();
    expect(mounted.session.engine.world.getComponent<State>('life:dialogue-session:player', 'State')).toMatchObject({ current: 'second' });
    panel = container.querySelector<HTMLElement>('[data-entity-anchor="life:player"]')!;
    expect(panel.textContent).toContain('Mayor：Second selected.');
    panel.querySelector<HTMLElement>('[data-arg="dialogue:close"]')!.click(); frame(); frame();
    expect(mounted.session.engine.world.getAllEntities()).not.toContain('life:dialogue-session:player');
    handle.dispose();
  });

  it('clears malformed legacy dialogue cursors after restore and immediately accepts movement', async () => {
    const cases: ReadonlyArray<readonly [string, (components: Record<string, unknown>) => void]> = [
      ['catalog-missing-dialogue', (components) => { (components.LifeDialogueSession as { dialogueId: string }).dialogueId = 'removed.dialogue'; }],
      ['missing-state', (components) => { delete components.State; }],
      ['unknown-node', (components) => { (components.State as { current: string }).current = 'removed-node'; }],
    ];
    for (const [, corrupt] of cases) {
      const port = new MemoryStoragePort(); const input = dialogueInput();
      const slot = await seedActiveDialogue(input, port, 'line'); const stored = (await port.load(slot))!;
      corrupt(stored.snapshot['life:dialogue-session:player'] as unknown as Record<string, unknown>);
      stored.meta.hash = hashWithOrder(stored.snapshot, stored.order);
      await port.save(slot, stored);

      const restored = await createPersistentLifeGameSession({ ...input, storage: port });
      expect(restored.restoreResult).toBe('restored');
      expect(restored.session.engine.world.getAllEntities()).not.toContain('life:dialogue-session:player');
      expect(selectLifeHostView(restored.session.engine.world).dialogueActive).toBe(false);
      restored.session.input.enqueueAction('life.move.start', { arg: 'right' });
      const commands = restored.session.input.commandsForTick(restored.session.engine.world.getVersion() + 1);
      expect(commands).toEqual([expect.objectContaining({ actions: [expect.objectContaining({ key: 'life.move.start', arg: 'right' })] })]);
      applyCommands(restored.session.engine.world, commands); restored.session.engine.world.tick();
      expect(restored.session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')?.right).toBe(true);
    }
  });

  it('routes keys through the queue and disposes keyboard, renderer, UI and shell idempotently', async () => {
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 1060 }, clientHeight: { value: 760 } });
    document.body.appendChild(container);
    const loadArt = vi.fn(async () => false);
    const handle = mountLifeGame(container, { ...alternateInput(), loadArt });
    const mounted = await handle.ready;
    expect(mounted.restoreResult).toBe('not-configured');
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(container.textContent).toContain('海风集市');
    expect(loadArt).toHaveBeenCalledWith(mounted.session.assets, mounted.session.descriptor.artSlug);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', cancelable: true }));
    expect(mounted.session.input.commandsForTick(1)).toEqual([
      expect.objectContaining({ actions: [expect.objectContaining({ key: 'life.move.state', arg: '8' })] }),
    ]);
    handle.dispose();
    handle.dispose();
    mounted.session.input.commandsForTick(2); // consume the release emitted by dispose
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', cancelable: true }));
    expect(mounted.session.input.commandsForTick(3)).toEqual([]);
    expect(container.childElementCount).toBe(0);

    const second = mountLifeGame(container, { ...alternateInput(), loadArt: async () => true });
    const secondMounted = await second.ready;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', cancelable: true }));
    expect(secondMounted.session.input.commandsForTick(4)).toHaveLength(1);
    second.dispose();
    expect(container.childElementCount).toBe(0);
  });

  it('paints a real terminal dialogue while directions remain live through pointer close', async () => {
    const frames: FrameRequestCallback[] = []; let raf = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return ++raf; }));
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 640 }, clientHeight: { value: 720 } }); document.body.appendChild(container);
    const handle = mountLifeGame(container, { ...alternateInput(), loadArt: async () => false });
    const mounted = await handle.ready; let now = 0;
    const frame = (): void => { const callback = frames.shift(); expect(callback).toBeDefined(); now += 80; callback!(now); };

    mounted.session.input.enqueueAction('life.move.start', { arg: 'down' }); frame(); frame(); frame(); frame();
    mounted.session.input.enqueueAction('life.move.stop', { arg: 'down' }); frame();
    expect(mounted.session.engine.world.getComponent('life:player', 'LifePosition')).toMatchObject({ x: 0, y: 1 });
    mounted.session.input.enqueueAction('life.select-target', { arg: 'mayor' });
    mounted.session.input.enqueueAction('life.action', { arg: 'talk' });
    frame(); frame();
    expect(mounted.session.engine.world.getComponent('life:dialogue-session:player', 'LifeDialogueSession')).toBeDefined();
    const panel = container.querySelector<HTMLElement>('[data-entity-anchor="life:player"]')!;
    expect(panel.textContent).toContain('Mayor：Welcome.'); expect(panel.textContent).toContain('继续'); expect(panel.style.display).toBe('block');

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', cancelable: true }));
    frame();
    expect(mounted.session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ down: true });
    panel.querySelector<HTMLElement>('[data-arg="dialogue:close"]')!.click(); frame(); frame();
    expect(mounted.session.engine.world.getAllEntities()).not.toContain('life:dialogue-session:player');
    expect(mounted.session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ down: true });

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowDown', cancelable: true })); frame();
    expect(mounted.session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')).toMatchObject({ down: false });
    handle.dispose();
  });
});
