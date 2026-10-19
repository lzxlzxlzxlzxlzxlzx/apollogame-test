// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { threeSceneLifePackage } from '../assembly/life-package.fixture.js';
import { littleValleyHostDescriptorFixture, seasideMarketHostDescriptorFixture } from '../authoring/life-host-descriptor.fixture.js';
import type { LifeGamePackage } from '../engine/protocol/life-sim.js';
import type { LifeContinuousMotion, LifePosition, LifeZone, State, Transform } from '../engine/protocol/components.js';
import { applyCommands } from '../net/commands.js';
import { hashWithOrder } from '../net/index.js';
import { MemoryStoragePort } from '../services/storage/index.js';
import { validateLayoutNode } from '../ui/components/index.js';
import littleValleyAssetSlots from '../../games/game-simlife/little-valley.asset-slots.json';
import { collectLifeVisualReferences, deriveAssetSlotBriefFingerprint, type AssetSlotBrief, type AssetSlotManifest } from '../assets/index.js';
import { buildLifeStandardHud } from '../assembly/life-host/life-hud.js';
import { buildLifeInteractionOptions, buildLifeInteractionPresentation, CLOSED_LIFE_INTERACTION, LifeInteractionController } from '../assembly/life-host/life-interaction.js';
import { LifeHostSaveAdapter, lifeHostPersistentHash } from '../assembly/life-host/life-save.js';
import { selectLifeHostView } from '../assembly/life-host/life-presenter.js';
import { createLifeGameSession, createPersistentLifeGameSession, lifeHostLayout, mountLifeGame, type LifeGameCoreSession, type LifeGameHostInput } from '../assembly/life-host/life-game-host.js';
import { ImageAssetLoader, type AssetManager } from '../assets/index.js';
import { lifeUiSkinFixture } from '../engine/host/life-ui-skin.fixture.js';
import { parseLifeHostDescriptor } from '../authoring/life-host-descriptor-core.js';

function hostSlotsFor(lifePackage: unknown, game: string): AssetSlotManifest {
  const templates = structuredClone(littleValleyAssetSlots.slots) as unknown as AssetSlotBrief[];
  const slots = collectLifeVisualReferences(lifePackage).map((reference, index) => {
    const source = structuredClone(templates[index % templates.length]!) as AssetSlotBrief;
    const slot = {
      ...source,
      slotId: `host.fixture.${index}`,
      assetKey: reference.key,
      consumers: [{ document: 'life.json', jsonPointer: reference.pointer }],
      governance: { ...source.governance, approval: 'placeholder' as const, contentHash: undefined, briefFingerprint: '' },
    } as AssetSlotBrief;
    return { ...slot, governance: { ...slot.governance, briefFingerprint: deriveAssetSlotBriefFingerprint(slot) } };
  });
  return { version: 1, game, note: 'Host fixture placeholders; asset-manager owns import and registration.', slots };
}

function alternateInput() {
  const descriptor = seasideMarketHostDescriptorFixture();
  const lifePackage = threeSceneLifePackage() as unknown as LifeGamePackage;
  lifePackage.camera = { profile: descriptor.viewport.profile };
  const assetSlots = hostSlotsFor(lifePackage, descriptor.slug);
  return { descriptor, lifePackage, assetSlots };
}

describe('Life Host calendar labels trust boundary', () => {
  it('rejects dangling display-name references before touching the mount container', () => {
    const input = alternateInput();
    const descriptor = { ...input.descriptor, hud: { ...input.descriptor.hud, calendarLabels: { seasons: { missing: '错误季节' } } } };
    const container = document.createElement('div');
    const sentinel = document.createElement('span');
    container.append(sentinel);
    expect(() => mountLifeGame(container, { ...input, descriptor })).toThrow(/calendar_reference/u);
    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild).toBe(sentinel);
    expect(() => createLifeGameSession({ ...input, descriptor })).toThrow(/calendar_reference/u);
  });

  it('accepts default-season display data without changing the simulation or persistent hash', () => {
    const input = alternateInput();
    const first = createLifeGameSession(input);
    const descriptor = { ...input.descriptor, hud: { ...input.descriptor.hud, calendarLabels: { seasons: { spring: '风铃季' } } } };
    const second = createLifeGameSession({ ...input, descriptor });
    expect(second.engine.world.snapshot()).toEqual(first.engine.world.snapshot());
    expect(lifeHostPersistentHash(second.engine.world)).toBe(lifeHostPersistentHash(first.engine.world));
    expect(selectLifeHostView(second.engine.world, {}, {}, second.descriptor.hud.calendarLabels).date).toBe('风铃季·第1天');
  });
});

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

function questPanelInput(): LifeGameHostInput {
  const base = alternateInput();
  const lifePackage = structuredClone(base.lifePackage) as LifeGamePackage;
  lifePackage.quests = [{ id: 'chapter.host', titleKey: 'Host Chapter', quests: [
    { id: 'quest.primary', chapterId: 'chapter.host', priority: 100, initialNodeId: 'primary', terminalNodeIds: ['primary'], nodes: [{
      id: 'primary', titleKey: 'Primary Quest', objectiveKey: 'Visit the harbor', trigger: { kind: 'life-action', action: 'talk' },
      effects: [{ kind: 'set-node-state', questId: 'quest.primary', nodeId: 'primary', state: 'completed' }],
    }] },
    { id: 'quest.side', chapterId: 'chapter.host', priority: 10, initialNodeId: 'side', terminalNodeIds: ['side'], nodes: [{
      id: 'side', titleKey: 'Side Quest', objectiveKey: 'Inspect the old farm', trigger: { kind: 'life-action', action: 'forage' },
      effects: [{ kind: 'set-node-state', questId: 'quest.side', nodeId: 'side', state: 'completed' }],
    }] },
  ] }];
  return {
    ...base,
    lifePackage,
    descriptor: { ...base.descriptor, questPanel: { enabled: true, titleLabelKey: 'quests', defaultTracking: 'first-active' } },
  };
}

function profilePanelInput(): LifeGameHostInput {
  const base = questPanelInput();
  const descriptor = seasideMarketHostDescriptorFixture();
  const lifePackage = structuredClone(base.lifePackage) as LifeGamePackage;
  lifePackage.logic = { ...(lifePackage.logic ?? {}), resources: [{ id: 'renown', initial: 4, min: 0, max: 10 }] };
  lifePackage.relationships = [{
    npcId: 'mayor', min: 0, max: 100, initial: 20,
    levels: [{ id: 'known', min: 0, titleKey: 'Known' }],
    dailyCaps: { talk: 1, gift: 1, action: 1 }, rules: [],
  }];
  lifePackage.profile = {
    titleKey: 'Harbor Keeper',
    attributes: [{ id: 'renown', titleKey: 'Renown', display: 'gauge', source: { kind: 'resource', id: 'renown' }, iconSkinKey: 'art:host:ui-icon:renown' }],
  };
  const rawSlots = hostSlotsFor(lifePackage, descriptor.slug);
  const slots = rawSlots.slots.map((slot) => {
    if (!slot.consumers.some((consumer) => consumer.jsonPointer.startsWith('/profile/'))) return slot;
    const profileSlot: AssetSlotBrief = {
      ...slot,
      kind: 'ui-icon',
      asset: { ...slot.asset, outputPx: { width: 32, height: 32 }, alpha: 'transparent' },
      render: { ...slot.render, display: { unit: 'pixel', width: 24, height: 24 }, anchor: { x: 0.5, y: 0.5 }, fit: 'contain', fallbackRole: 'ui-icon' },
      governance: { ...slot.governance, briefFingerprint: '' },
    };
    return { ...profileSlot, governance: { ...profileSlot.governance, briefFingerprint: deriveAssetSlotBriefFingerprint(profileSlot) } };
  });
  return {
    ...base,
    lifePackage,
    assetSlots: { ...rawSlots, slots },
    descriptor: {
      ...descriptor,
      questPanel: { enabled: true, titleLabelKey: 'quests', defaultTracking: 'first-active' },
      inventoryPanel: { enabled: true, columns: 3, titleLabelKey: 'inventory' },
      profilePanel: { enabled: true, titleLabelKey: 'profile' },
    },
  };
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

  it('keeps overlay filters, item inspection and tracking feedback local to the Host, never input/World/save', async () => {
    vi.spyOn(ImageAssetLoader.prototype, 'load').mockResolvedValue({ handle: { image: document.createElement('canvas') }, width: 64, height: 64 });
    const input = profilePanelInput();
    const lifePackage = structuredClone(input.lifePackage) as LifeGamePackage;
    const fixtureItemId = lifePackage.itemCatalog![0]!.id;
    lifePackage.playerInventory = { slots: 12, maxStack: 99, items: [{ itemId: fixtureItemId, count: 2 }] };
    const descriptor = { ...parseLifeHostDescriptor(input.descriptor), uiSkin: lifeUiSkinFixture,
      questPanel: { enabled: true, defaultTracking: 'none' as const, titleLabelKey: 'quests' as const } };
    let artReady = Promise.resolve();
    const container = document.createElement('div'); document.body.appendChild(container);
    const handle = mountLifeGame(container, { ...input, lifePackage, descriptor, loadArt: (assets) => {
      for (const key of Object.values(lifeUiSkinFixture.slots)) assets.register({ kind: 'texture', key, src: '/fixture/paper.png' });
      artReady = assets.loadAll(); return artReady.then(() => true);
    } });
    try {
      const mounted = await handle.ready; await artReady;
      const before = mounted.session.engine.world.snapshot();
      const hash = lifeHostPersistentHash(mounted.session.engine.world);
      const enqueue = vi.spyOn(mounted.session.input, 'enqueueAction');
      const click = (action: string, arg?: string) => {
        const element = container.querySelector<HTMLElement>(`[data-action="${action}"]${arg ? `[data-arg="${arg}"]` : ''}`);
        expect(element).not.toBeNull(); element!.click();
      };
      click('life.host.quest.toggle');
      click('life.host.tab', 'quest:completed');
      expect(container.querySelector('#life-host-quest-empty-label')?.textContent).toBe('暂无已完成任务');
      click('life.host.tab', 'quest:active');
      click('life.host.quest.track');
      expect(container.querySelector('#life-host-tracked-paper-1')?.getAttribute('data-fx')).toContain('flash');
      click('life.host.inventory.toggle');
      click('life.host.tab', 'inventory:seed');
      click('life.host.tab', 'inventory:all');
      const view = selectLifeHostView(mounted.session.engine.world);
      expect(view.inventoryItems.length).toBeGreaterThan(0);
      const item = view.inventoryItems.at(-1)!;
      click('life.host.inventory.inspect', item.id);
      expect(container.querySelector('#life-host-inventory-detail-title')?.textContent).toBe(item.title);
      expect(container.querySelector('#life-host-inventory-detail-count')?.textContent).toBe(`数量 ×${item.count}`);
      click('life.host.profile.toggle');
      click('life.host.tab', 'profile:relationships');
      click('life.host.tab', 'profile:attributes');
      click('life.host.profile.close');
      expect(enqueue).not.toHaveBeenCalled();
      expect(mounted.session.engine.world.snapshot()).toEqual(before);
      expect(lifeHostPersistentHash(mounted.session.engine.world)).toBe(hash);
    } finally { handle.dispose(); }
  });

  it.each(['texture', 'missing', 'atlas'] as const)('resolves UI skins only from loaded texture assets (%s) across all three real Drawers', async (kind) => {
    vi.spyOn(ImageAssetLoader.prototype, 'load').mockResolvedValue({ handle: { image: document.createElement('canvas') }, width: 64, height: 64 });
    const input = profilePanelInput();
    const descriptor = { ...parseLifeHostDescriptor(input.descriptor), uiSkin: lifeUiSkinFixture };
    let artReady: Promise<void> = Promise.resolve();
    const loadArt = (manager: AssetManager): Promise<boolean> => {
      for (const key of Object.values(lifeUiSkinFixture.slots)) {
        manager.register(kind === 'atlas' ? { kind: 'atlas', key, src: '/fixture/atlas.png', frames: {} } : { kind: 'texture', key, src: `/fixture/${key.split(':').at(-1)}.png` });
      }
      artReady = kind === 'missing' ? Promise.resolve() : manager.loadAll();
      return artReady.then(() => true);
    };
    const container = document.createElement('div'); document.body.appendChild(container);
    const handle = mountLifeGame(container, { ...input, descriptor, loadArt });
    try {
      const mounted = await handle.ready; await artReady;
      const before = mounted.session.engine.world.snapshot();
      const beforeHash = lifeHostPersistentHash(mounted.session.engine.world);
      for (const panel of ['inventory', 'quest', 'profile']) {
        container.querySelector<HTMLElement>(`[data-action="life.host.${panel}.toggle"]`)!.click();
        expect(container.querySelector(`#life-host-${panel}-drawer`)).not.toBeNull();
        const frame = container.querySelector<HTMLElement>(`#life-host-${panel}-frame`);
        if (kind === 'texture') {
          expect(frame).not.toBeNull();
          expect(frame!.getAttribute('style')).toContain('panel.png');
          expect(frame!.style.borderImageSlice).toBe('12 fill');
          expect(container.querySelector('#life-host-tracked-quest')?.getAttribute('style')).toContain('tracker.png');
          expect(container.querySelector('#life-host-world-status')?.getAttribute('style')).toContain('world-status.png');
          expect(container.querySelector('#life-host-resources')?.getAttribute('style')).toContain('chrome.png');
          for (const entry of ['quest', 'inventory', 'profile']) {
            expect(container.querySelector<HTMLImageElement>(`#life-host-${entry}-open img`)?.getAttribute('src')).toBe(`/fixture/entry-${entry}.png`);
          }
        } else {
          expect(frame).toBeNull();
          expect(container.innerHTML).not.toContain('/fixture/');
        }
        container.querySelector<HTMLElement>(`[data-action="life.host.${panel}.close"]`)!.click();
        expect(container.querySelector(`#life-host-${panel}-drawer`)).toBeNull();
      }
      expect(mounted.shell.topHost.style.pointerEvents).toBe('none');
      expect(mounted.session.engine.world.snapshot()).toEqual(before);
      expect(lifeHostPersistentHash(mounted.session.engine.world)).toBe(beforeHash);
    } finally { handle.dispose(); }
  });

  it.each([false, true])('settles partial UI art before repaint without reviving a disposed Host (%s)', async (disposeEarly) => {
    let finishFrames!: () => void;
    const framesReady = new Promise<void>((resolve) => { finishFrames = resolve; });
    vi.spyOn(ImageAssetLoader.prototype, 'load').mockImplementation(async (descriptor) => {
      if (descriptor.key === lifeUiSkinFixture.slots.inventoryIcon) throw new Error('isolated missing icon');
      await framesReady;
      return { handle: { image: document.createElement('canvas') }, width: 64, height: 64 };
    });
    const input = profilePanelInput();
    const descriptor = { ...parseLifeHostDescriptor(input.descriptor), uiSkin: lifeUiSkinFixture };
    const container = document.createElement('div'); document.body.append(container);
    let earlyFailure = false;
    const handle = mountLifeGame(container, { ...input, descriptor, loadArt: (assets) => {
      for (const key of Object.values(lifeUiSkinFixture.slots)) assets.register({ kind: 'texture', key, src: `/fixture/${key.split(':').at(-1)}.png` });
      return assets.loadAll().then(() => true, () => { earlyFailure = true; return false; });
    } });
    vi.useFakeTimers();
    try {
      const mounted = await handle.ready;
      const hash = lifeHostPersistentHash(mounted.session.engine.world);
      await vi.waitFor(() => expect(earlyFailure).toBe(true));
      await vi.advanceTimersByTimeAsync(0);
      if (disposeEarly) handle.dispose();
      finishFrames();
      if (disposeEarly) {
        await vi.advanceTimersByTimeAsync(0);
        expect(container.children.length).toBe(0);
      } else {
        await vi.waitFor(() => expect(container.querySelector('#life-host-world-status')?.getAttribute('style')).toContain('world-status.png'));
        const fallback = container.querySelector<HTMLButtonElement>('#life-host-inventory-open')!;
        expect(fallback.textContent).toBe(descriptor.hud.labels?.inventory);
        expect(fallback.querySelector('img')).toBeNull();
        expect(container.querySelector('#life-host-quest-open img')).not.toBeNull();
        expect(lifeHostPersistentHash(mounted.session.engine.world)).toBe(hash);
      }
    } finally { finishFrames(); handle.dispose(); vi.useRealTimers(); }
  });

  it.each(['absent', 'missing', 'loaded'] as const)('routes real Host native keys only when overlay frames are ready (%s)', async (mode) => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
    vi.spyOn(ImageAssetLoader.prototype, 'load').mockResolvedValue({ handle: { image: document.createElement('canvas') }, width: 64, height: 64 });
    const input = profilePanelInput();
    const npc = (input.lifePackage as LifeGamePackage).scenes[0]!.placements[0]! as { x: number; y: number }; npc.x = 2; npc.y = 0;
    const descriptor = { ...parseLifeHostDescriptor(input.descriptor), ...(mode === 'absent' ? {} : { uiSkin: lifeUiSkinFixture }) };
    let artReady = Promise.resolve();
    const container = document.createElement('div'); document.body.append(container);
    const handle = mountLifeGame(container, { ...input, descriptor, loadArt: (assets) => {
      if (mode !== 'loaded') return Promise.resolve(false);
      for (const key of Object.values(lifeUiSkinFixture.slots)) assets.register({ kind: 'texture', key, src: '/fixture/paper.png' });
      artReady = assets.loadAll(); return artReady.then(() => true);
    } });
    try {
      const mounted = await handle.ready; await artReady; let now = 0;
      const frame = () => { const callback = frames.shift(); expect(callback).toBeDefined(); now += 80; callback!(now); };
      const pos = mounted.session.engine.world.getComponent<LifePosition>('life:player', 'LifePosition')!;
      const transform = mounted.session.engine.world.getComponent<Transform>('life:player', 'Transform')!;
      pos.x = 3; pos.y = 0; transform.x = 3; transform.y = 0; step(mounted.session); frame(); frame();
      const before = mounted.session.engine.world.snapshot(); const hash = lifeHostPersistentHash(mounted.session.engine.world);
      const button = container.querySelector<HTMLButtonElement>('#life-host-quest-open')!;
      const key = (code: string, target: EventTarget) => {
        const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }); target.dispatchEvent(event); return event;
      };
      expect(key('Tab', document.body).defaultPrevented).toBe(mode !== 'loaded');
      button.focus();
      for (const code of ['Tab', 'Enter']) expect(key(code, button).defaultPrevented).toBe(mode !== 'loaded');
      expect(container.querySelector('#life-host-quest-drawer')).toBeNull(); // happy-dom never synthesizes a native click
      expect(mounted.session.engine.world.snapshot()).toEqual(before); expect(lifeHostPersistentHash(mounted.session.engine.world)).toBe(hash);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', cancelable: true })); frame();
      expect(container.querySelector('#life-host-world-menu')).not.toBeNull();
      const cycle = vi.spyOn(LifeInteractionController.prototype, 'cycle');
      const confirm = vi.spyOn(LifeInteractionController.prototype, 'confirm');
      button.focus();
      expect(key('Tab', button).defaultPrevented).toBe(true);
      expect(cycle).toHaveBeenCalledWith(expect.any(Array), 1);
      expect(key('Enter', button).defaultPrevented).toBe(true);
      expect(confirm).toHaveBeenCalledOnce();
      expect(container.querySelector('#life-host-quest-drawer')).toBeNull();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', cancelable: true }));
      button.focus(); expect(key('Tab', button).defaultPrevented).toBe(mode !== 'loaded');
    } finally { handle.dispose(); }
  });

  it('keeps save compatibility when an existing game selects, replaces or removes its UI skin', async () => {
    const port = new MemoryStoragePort();
    const input = profilePanelInput();
    const descriptor = parseLifeHostDescriptor(input.descriptor);
    const original = await createPersistentLifeGameSession({ ...input, storage: port });
    expect(await original.saves!.save(original.session.engine.world)).toBe(true);
    const stored = (await port.load(original.saves!.slot))!;
    for (const uiSkin of [lifeUiSkinFixture, { ...lifeUiSkinFixture, id: 'alternate-frame', slots: { ...lifeUiSkinFixture.slots, questIcon: 'art:game-seaside-market:ui:another-quest' } }, undefined]) {
      const session = await createPersistentLifeGameSession({ ...input, descriptor: { ...descriptor, ...(uiSkin ? { uiSkin } : {}) }, storage: port });
      expect(session.restoreResult).toBe('restored');
      expect(lifeHostPersistentHash(session.session.engine.world)).toBe(stored.meta.hash);
      expect(await session.saves!.save(session.session.engine.world)).toBe(true);
      const next = (await port.load(session.saves!.slot))!;
      expect(next.meta.label).toBe(stored.meta.label);
      expect(next.snapshot).toEqual(stored.snapshot);
      expect(JSON.stringify(next)).not.toContain('moonshadow-courtyard');
    }
  });

  it('keeps old saves byte-compatible when calendar display labels are added, changed, emptied or removed', async () => {
    const port = new MemoryStoragePort();
    const input = alternateInput();
    const original = await createPersistentLifeGameSession({ ...input, storage: port });
    expect(await original.saves!.save(original.session.engine.world)).toBe(true);
    const stored = (await port.load(original.saves!.slot))!;
    for (const calendarLabels of [{ seasons: { spring: '春季' } }, { seasons: { spring: '风铃季' }, slots: {} }, {}, undefined]) {
      const descriptor = { ...input.descriptor, hud: { ...input.descriptor.hud, ...(calendarLabels ? { calendarLabels } : {}) } };
      const session = await createPersistentLifeGameSession({ ...input, descriptor, storage: port });
      expect(session.restoreResult).toBe('restored');
      expect(lifeHostPersistentHash(session.session.engine.world)).toBe(stored.meta.hash);
      expect(await session.saves!.save(session.session.engine.world)).toBe(true);
      const next = (await port.load(session.saves!.slot))!;
      expect(next.meta.label).toBe(stored.meta.label);
      expect(next.snapshot).toEqual(stored.snapshot);
      expect(JSON.stringify(next)).not.toContain('calendarLabels');
    }
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

  it('requires every formal Life visual key to have a catalog rule while keeping render metadata outside snapshot/hash/save authority', () => {
    const input = alternateInput();
    const missing = structuredClone(input.assetSlots) as AssetSlotManifest;
    (missing.slots as AssetSlotBrief[]).splice(0, 1);
    expect(() => createLifeGameSession({ ...input, assetSlots: missing })).toThrow(/missing_visual_rule/);

    const changed = structuredClone(input.assetSlots) as AssetSlotManifest;
    const first = changed.slots[0] as AssetSlotBrief;
    (first.render.display as { unit: 'cell'; width: number; height: number }).unit = 'cell';
    (first.render.display as { width: number; height: number }).width = 3;
    (first.render.display as { width: number; height: number }).height = 2;
    (first.asset as { sampling: 'linear' }).sampling = 'linear';
    (first.governance as { briefFingerprint: string }).briefFingerprint = deriveAssetSlotBriefFingerprint(first);
    const baseline = createLifeGameSession(input);
    const visualOnly = createLifeGameSession({ ...input, assetSlots: changed });
    expect(visualOnly.engine.world.snapshot()).toEqual(baseline.engine.world.snapshot());
    expect(visualOnly.engine.world.snapshotOrder()).toEqual(baseline.engine.world.snapshotOrder());
    expect(hashWithOrder(visualOnly.engine.world.snapshot(), visualOnly.engine.world.snapshotOrder())).toBe(
      hashWithOrder(baseline.engine.world.snapshot(), baseline.engine.world.snapshotOrder()),
    );
    expect(lifeHostPersistentHash(visualOnly.engine.world)).toBe(lifeHostPersistentHash(baseline.engine.world));
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

  it('keeps the optional inventory Drawer render-local across pointer, I, Escape and held movement', async () => {
    const frames: FrameRequestCallback[] = []; let raf = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return ++raf; }));
    const base = alternateInput();
    const input = {
      ...base,
      descriptor: { ...base.descriptor, inventoryPanel: { enabled: true, columns: 3, titleLabelKey: 'inventory' as const } },
    };
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 1060 }, clientHeight: { value: 760 } });
    document.body.appendChild(container);
    const handle = mountLifeGame(container, { ...input, loadArt: async () => false });
    const mounted = await handle.ready; let now = 0;
    const frame = (): void => { const callback = frames.shift(); expect(callback).toBeDefined(); now += 32; callback!(now); };
    frame();
    const before = mounted.session.engine.world.snapshot();
    const open = container.querySelector<HTMLElement>('[data-action="life.host.inventory.toggle"]');
    expect(open).not.toBeNull(); open!.click();
    expect(container.querySelector('#life-host-inventory-drawer')).not.toBeNull();
    expect(container.textContent).toContain('空格 10');
    expect(mounted.session.engine.world.snapshot()).toEqual(before);

    container.querySelector<HTMLElement>('[data-action="life.host.inventory.close"]')!.click();
    expect(container.querySelector('#life-host-inventory-drawer')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', cancelable: true }));
    expect(container.querySelector('#life-host-inventory-drawer')).not.toBeNull();
    expect(mounted.session.input.commandsForTick(1)).toEqual([
      expect.objectContaining({ actions: [expect.objectContaining({ key: 'life.move.state', arg: '8' })] }),
    ]);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', cancelable: true }));
    expect(container.querySelector('#life-host-inventory-drawer')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', cancelable: true }));
    expect(mounted.session.input.commandsForTick(2)).toEqual([
      expect.objectContaining({ actions: [expect.objectContaining({ key: 'life.move.state', arg: '0' })] }),
    ]);
    expect(mounted.session.engine.world.snapshot()).toEqual(before);
    handle.dispose();
  });

  it('does not expose inventory chrome when the descriptor omits the opt-in', async () => {
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 1060 }, clientHeight: { value: 760 } });
    document.body.appendChild(container);
    const handle = mountLifeGame(container, { ...alternateInput(), loadArt: async () => false });
    await handle.ready;
    expect(container.querySelector('[data-action="life.host.inventory.toggle"]')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', cancelable: true }));
    expect(container.querySelector('#life-host-inventory-drawer')).toBeNull();
    handle.dispose();
  });

  it('keeps quest Drawer and tracking render-local across pointer, J, Escape, E, held movement and saves', async () => {
    const frames: FrameRequestCallback[] = []; let raf = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return ++raf; }));
    const port = new MemoryStoragePort();
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 1060 }, clientHeight: { value: 760 } });
    document.body.appendChild(container);
    const handle = mountLifeGame(container, { ...questPanelInput(), storage: port, loadArt: async () => false });
    const mounted = await handle.ready; let now = 0;
    const frame = (): void => { const callback = frames.shift(); expect(callback).toBeDefined(); now += 32; callback!(now); };
    frame();
    const before = mounted.session.engine.world.snapshot();
    const beforeOrder = mounted.session.engine.world.snapshotOrder();
    const beforeHash = hashWithOrder(before, beforeOrder);
    expect(await mounted.saves!.save(mounted.session.engine.world)).toBe(true);
    const savedBefore = (await port.load(mounted.saves!.slot))!;

    const pointerOpen = container.querySelector<HTMLElement>('[data-action="life.host.quest.toggle"]');
    expect(pointerOpen).not.toBeNull(); pointerOpen!.click();
    expect(container.querySelector('#life-host-quest-drawer')).not.toBeNull();
    expect(container.textContent).toContain('Visit the harbor');
    container.querySelector<HTMLElement>('[data-action="life.host.quest.track"][data-arg="quest.side"]')!.click();
    expect(container.querySelector('#life-host-objective')?.textContent).toContain('Inspect the old farm');
    expect(container.querySelector<HTMLElement>('[data-action="life.host.quest.track"][data-arg="quest.side"]')?.hasAttribute('disabled')).toBe(true);
    container.querySelector<HTMLElement>('[data-action="life.host.quest.close"]')!.click();
    expect(container.querySelector('#life-host-quest-drawer')).toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', cancelable: true }));
    expect(container.querySelector('#life-host-quest-drawer')).not.toBeNull();
    expect(mounted.session.input.commandsForTick(1)).toEqual([
      expect.objectContaining({ actions: [expect.objectContaining({ key: 'life.move.state', arg: '8' })] }),
    ]);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', cancelable: true }));
    expect(container.querySelector('#life-host-quest-drawer')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', cancelable: true }));
    expect(mounted.session.input.commandsForTick(2)).toEqual([
      expect.objectContaining({ actions: [expect.objectContaining({ key: 'life.move.state', arg: '0' })] }),
    ]);

    expect(mounted.session.engine.world.snapshot()).toEqual(before);
    expect(hashWithOrder(mounted.session.engine.world.snapshot(), mounted.session.engine.world.snapshotOrder())).toBe(beforeHash);
    expect(lifeHostPersistentHash(mounted.session.engine.world)).toBe(savedBefore.meta.hash);
    expect(await mounted.saves!.save(mounted.session.engine.world)).toBe(true);
    const savedAfter = (await port.load(mounted.saves!.slot))!;
    expect({ snapshot: savedAfter.snapshot, order: savedAfter.order, hash: savedAfter.meta.hash }).toEqual({
      snapshot: savedBefore.snapshot, order: savedBefore.order, hash: savedBefore.meta.hash,
    });
    handle.dispose();
  });

  it('keeps profile, inventory and quest Drawers mutually exclusive while C/E/Escape stay render-local', async () => {
    const frames: FrameRequestCallback[] = []; let raf = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return ++raf; }));
    const port = new MemoryStoragePort();
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 1060 }, clientHeight: { value: 760 } });
    document.body.appendChild(container);
    const handle = mountLifeGame(container, { ...profilePanelInput(), storage: port, loadArt: async () => false });
    const mounted = await handle.ready;
    let now = 0;
    const frame = (): void => { const callback = frames.shift(); expect(callback).toBeDefined(); now += 32; callback!(now); };
    frame();
    const before = mounted.session.engine.world.snapshot();
    const beforeOrder = mounted.session.engine.world.snapshotOrder();
    const beforeHash = hashWithOrder(before, beforeOrder);
    expect(await mounted.saves!.save(mounted.session.engine.world)).toBe(true);
    const savedBefore = (await port.load(mounted.saves!.slot))!;

    container.querySelector<HTMLElement>('[data-action="life.host.profile.toggle"]')!.click();
    expect(container.querySelector('#life-host-profile-drawer')).not.toBeNull();
    expect(container.textContent).toContain('Harbor Keeper');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', cancelable: true }));
    expect(container.querySelector('#life-host-profile-drawer')).toBeNull();
    expect(container.querySelector('#life-host-inventory-drawer')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', cancelable: true }));
    expect(container.querySelector('#life-host-inventory-drawer')).toBeNull();
    expect(container.querySelector('#life-host-quest-drawer')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', cancelable: true }));
    expect(container.querySelector('#life-host-quest-drawer')).toBeNull();
    expect(container.querySelector('#life-host-profile-drawer')).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', cancelable: true }));
    expect(mounted.session.input.commandsForTick(1)).toEqual([
      expect.objectContaining({ actions: [expect.objectContaining({ key: 'life.move.state', arg: '8' })] }),
    ]);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', cancelable: true }));
    expect(container.querySelector('#life-host-profile-drawer')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', cancelable: true }));
    expect(mounted.session.input.commandsForTick(2)).toEqual([
      expect.objectContaining({ actions: [expect.objectContaining({ key: 'life.move.state', arg: '0' })] }),
    ]);

    expect(mounted.session.engine.world.snapshot()).toEqual(before);
    expect(hashWithOrder(mounted.session.engine.world.snapshot(), mounted.session.engine.world.snapshotOrder())).toBe(beforeHash);
    expect(await mounted.saves!.save(mounted.session.engine.world)).toBe(true);
    const savedAfter = (await port.load(mounted.saves!.slot))!;
    expect({ snapshot: savedAfter.snapshot, order: savedAfter.order, hash: savedAfter.meta.hash }).toEqual({
      snapshot: savedBefore.snapshot, order: savedBefore.order, hash: savedBefore.meta.hash,
    });
    handle.dispose();
  });

  it('uses a pointer-transparent full-height chrome host while real I/J/C actions remain clickable', async () => {
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 1060 }, clientHeight: { value: 760 } }); document.body.appendChild(container);
    const handle = mountLifeGame(container, { ...profilePanelInput(), loadArt: async () => false }); await handle.ready;
    const top = Array.from(container.querySelectorAll<HTMLElement>('div')).find((node) => node.style.zIndex === '10' && node.style.top === '0px')!;
    expect(top.style.height).toBe('100%'); expect(top.style.pointerEvents).toBe('none');
    expect((top.firstElementChild as HTMLElement).style.pointerEvents).toBe('auto');
    for (const action of ['life.host.inventory.toggle', 'life.host.quest.toggle', 'life.host.profile.toggle']) expect(container.querySelector<HTMLElement>(`[data-action="${action}"]`)).not.toBeNull();
    container.querySelector<HTMLElement>('[data-action="life.host.inventory.toggle"]')!.click(); expect(container.querySelector('#life-host-inventory-drawer')).not.toBeNull();
    handle.dispose();
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
