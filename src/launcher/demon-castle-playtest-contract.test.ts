// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAssetIndex, parseAssetSlotManifest, validateAssetSlotClosure } from '@zerocraft/engine/assets/index.js';
import { lifeEntityId } from '../assembly/life-package-compile.js';
import { gameArtIndexUrl } from '../assets/game-art-load.js';
import type { Flag, LifeActivityContext, LifeConstructionProject, LifeContinuousMotion, LifePosition, LifeQuestProjection, LifeWarp, Transform } from '../engine/protocol/components.js';
import { createLifeGameSession } from '../assembly/life-host/life-game-host.js';
import { selectLifeHostView } from '../assembly/life-host/life-presenter.js';
import { buildLifeProfileReview } from '../authoring/life-profile-review.js';
import { applyCommands } from '../net/commands.js';
import { MemoryStoragePort } from '../services/storage/index.js';
import { invCount, type Inventory } from '../skills/tier2/inventory.js';
import { mountLifeLauncherItem } from './life-game-runner.js';
import { LIFE_LAUNCHER_CATALOG } from './life-launcher-catalog.js';
import localIndex from '../../public/games/game-demon-castle/art/index.json';
import assetSlots from '../../games/game-demon-castle/asset-slots.json';
import descriptor from '../../games/game-demon-castle/life-host.json';
import lifePackage from '../../games/game-demon-castle/life.json';

function skinKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(skinKeys);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => key.toLowerCase().endsWith('skinkey') && typeof child === 'string' ? [child] : skinKeys(child));
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

describe('Demon Castle shared Life Host playtest contract', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext());
    let frame = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => ++frame));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('discovers the formal four-file group as a runnable life: entry and mounts it through the shared host', async () => {
    const item = LIFE_LAUNCHER_CATALOG.items.find((entry) => entry.directory === 'game-demon-castle');
    expect(item).toBeDefined();
    expect(item).toMatchObject({ runtimeId: 'life:game-demon-castle', diagnostics: [], gameEntry: { status: 'playable', title: '月影魔王城' } });
    expect(item?.bundle?.descriptor).toEqual(descriptor);
    expect(item?.bundle?.lifePackage).toEqual(lifePackage);
    expect(item?.bundle?.assetSlots).toEqual(assetSlots);

    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 1440 }, clientHeight: { value: 900 } });
    document.body.appendChild(container);
    const loadedSlugs: string[] = [];
    const handle = mountLifeLauncherItem(container, item!, {
      storage: new MemoryStoragePort(),
      loadArt: async (_assets, slug) => { loadedSlugs.push(slug); return false; },
    });
    const mounted = await handle.ready;
    expect(mounted.session.descriptor.slug).toBe('game-demon-castle');
    expect(mounted.session.descriptor.questPanel).toEqual({ enabled: true, titleLabelKey: 'quests', defaultTracking: 'first-active' });
    expect(mounted.session.descriptor.profilePanel).toEqual({ enabled: true, titleLabelKey: 'profile' });
    expect(selectLifeHostView(mounted.session.engine.world).profile).toMatchObject({
      title: '月影魔王档案',
      attributes: [
        { id: 'dread', value: 30, min: 0, max: 100 },
        { id: 'artisan-bond', value: 20, levelId: 'stranger' },
      ],
    });
    expect(selectLifeHostView(mounted.session.engine.world).questItems[0]).toMatchObject({
      chapterId: 'chapter.return-of-moonshadow', questId: 'quest.restore-moonshadow', state: 'active', tracked: true,
      title: '点亮王座厅', nextObjective: '收集月木与影矿，修复庭院中的王座厅。',
    });
    expect(container.textContent).toContain('月影魔王城');
    expect(container.textContent).toContain('收集月木与影矿，修复庭院中的王座厅。');
    expect(container.querySelector('[data-action="life.host.quest.toggle"]')).not.toBeNull();
    container.querySelector<HTMLElement>('[data-action="life.host.profile.toggle"]')!.click();
    expect(container.querySelector('#life-host-profile-drawer')).not.toBeNull();
    expect(container.textContent).toContain('魔王威仪');
    expect(container.textContent).toContain('工匠盟约');
    await Promise.resolve();
    expect(loadedSlugs).toEqual(['game-demon-castle']);
    handle.dispose();
    expect(container.childElementCount).toBe(0);
  });

  it('closes every formal visual consumer against the approved local index and exact served bytes', () => {
    const keys = [...new Set(skinKeys(lifePackage))].sort();
    const parsedIndex = parseAssetIndex(localIndex);
    const parsedSlots = parseAssetSlotManifest(assetSlots);
    expect(validateAssetSlotClosure(parsedSlots, { 'life.json': lifePackage }, parsedIndex, keys)).toEqual([
      { path: 'slot:demon-castle.ui-icon.dread', code: 'missing_asset', message: 'art:demon-castle:ui-icon:dread must resolve to a filled texture' },
      { path: 'slot:demon-castle.ui-icon.artisan-bond', code: 'missing_asset', message: 'art:demon-castle:ui-icon:artisan-bond must resolve to a filled texture' },
    ]);
    // The 31 world slots include two intentionally unresolved profile icons.
    // UI assets are a separate descriptor contract; never approve the missing
    // profile icons by substituting gold/crystal/leaf artwork of another meaning.
    expect(assetSlots.slots).toHaveLength(31);
    const expectedKeys = [
      'art:demon-castle:building:forest-arch',
      'art:demon-castle:building:forge-core',
      'art:demon-castle:building:forge-core-awakened',
      'art:demon-castle:building:greenhouse-restored',
      'art:demon-castle:building:greenhouse-ruin',
      'art:demon-castle:building:moonwell',
      'art:demon-castle:building:sealed-vault',
      'art:demon-castle:building:throne-hall',
      'art:demon-castle:building:throne-hall-restored',
      'art:demon-castle:building:undercrypt-stairs',
      'art:demon-castle:crop:moonbell-growing',
      'art:demon-castle:crop:moonbell-mature',
      'art:demon-castle:crop:moonbell-seeded',
      'art:demon-castle:decoration:ancient-grove',
      'art:demon-castle:item:moonbell',
      'art:demon-castle:item:moonbell-seed',
      'art:demon-castle:item:moonwood',
      'art:demon-castle:item:shadow-ore',
      'art:demon-castle:npc:gargoyle-artisan',
      'art:demon-castle:npc:moonwell-keeper',
      'art:demon-castle:player:moon-demon',
      'art:demon-castle:resource:moonwood-log',
      'art:demon-castle:resource:shadow-ore-vein',
      'art:demon-castle:tile:moon-courtyard',
      'art:demon-castle:tile:moon-garden-earth',
      'art:demon-castle:tile:moon-garden-tilled',
      'art:demon-castle:tile:moon-garden-watered',
      'art:demon-castle:tile:moonshadow-forest',
      'art:demon-castle:tile:undercrypt-workshop',
      'art:game-demon-castle:ui:entry-backpack',
      'art:game-demon-castle:ui:entry-profile',
      'art:game-demon-castle:ui:entry-quest-scroll',
      'art:game-demon-castle:ui:panel-frame',
      'art:game-demon-castle:ui:resource-gold',
      'art:game-demon-castle:ui:resource-moon-crystal',
      'art:game-demon-castle:ui:resource-moonleaf',
      'art:game-demon-castle:ui:tracked-quest-frame',
      'art:game-demon-castle:ui:world-status-ribbon',
    ];
    expect(parsedIndex.assets.map((asset) => asset.id).sort()).toEqual(expectedKeys);
    expect(descriptor.uiSkin).toMatchObject({
      id: 'moonshadow-courtyard',
      slots: {
        panelFrame: 'art:game-demon-castle:ui:panel-frame',
        worldStatusRibbon: 'art:game-demon-castle:ui:world-status-ribbon',
        trackedQuestFrame: 'art:game-demon-castle:ui:tracked-quest-frame',
        questIcon: 'art:game-demon-castle:ui:entry-quest-scroll',
        inventoryIcon: 'art:game-demon-castle:ui:entry-backpack',
        profileIcon: 'art:game-demon-castle:ui:entry-profile',
      },
    });
    expect(descriptor.uiSkin?.slots).not.toHaveProperty('hudChrome');
    const activeUi = Object.values(descriptor.uiSkin!.slots);
    const reserved = ['resource-gold', 'resource-moon-crystal', 'resource-moonleaf'].map((name) => `art:game-demon-castle:ui:${name}`);
    expect(activeUi).toHaveLength(6);
    for (const key of activeUi) expect(parsedIndex.assets.find((asset) => asset.id === key)?.status).toBe('filled');
    for (const key of reserved) {
      expect(activeUi).not.toContain(key);
      expect(keys).not.toContain(key);
    }
    expect(lifePackage.profile.attributes.map((attribute) => attribute.source)).toEqual([
      { kind: 'resource', id: 'profile.dread' },
      { kind: 'relationship', npcId: 'gargoyle-artisan' },
    ]);
    expect(gameArtIndexUrl(descriptor.artSlug)).toBe('/games/game-demon-castle/art/index.json');

    for (const asset of parsedIndex.assets) {
      expect(asset.status).toBe('filled');
      expect(asset.provenance).toMatchObject({ ownerDecision: 'approved', reviewedBy: 'owner' });
      expect(asset.path).toMatch(/^\/games\/game-demon-castle\/art\//);
      if (!asset.path) throw new Error(`missing served path for ${asset.id}`);
      const file = resolve('public', asset.path.replace(/^\//, ''));
      expect(existsSync(file), asset.path).toBe(true);
      const hash = `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
      expect(hash, asset.path).toBe(asset.provenance?.contentHash);
    }
  });

  it('keeps the candidate profile review closed over both authoritative sources and exact ui-icon consumers', () => {
    const bundle = JSON.parse(readFileSync(resolve('docs/design/game-demon-castle/bundle.candidate.json'), 'utf8')) as unknown;
    const result = buildLifeProfileReview(bundle);
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.review.rows).toMatchObject([
      { id: 'dread', source: { kind: 'resource', id: 'profile.dread' }, initial: 30, range: { min: 0, max: 100 }, icon: { slotId: 'demon-castle.ui-icon.dread', status: 'placeholder' } },
      { id: 'artisan-bond', source: { kind: 'relationship', npcId: 'gargoyle-artisan' }, initial: 20, range: { min: 0, max: 100 }, icon: { slotId: 'demon-castle.ui-icon.artisan-bond', status: 'placeholder' } },
    ]);
  });

  it('keeps the approved illustrated core high-resolution and linear while logical cells stay independent', () => {
    const expected = {
      'demon-castle.player.moon-demon': { width: 384, height: 512, transparent: true, display: [1, 1.5], anchor: [0.5, 1] },
      'demon-castle.tile.moon-courtyard': { width: 256, height: 256, transparent: false, display: [1, 1], anchor: [0.5, 0.5] },
      'demon-castle.npc.gargoyle-artisan': { width: 384, height: 512, transparent: true, display: [1, 1.5], anchor: [0.5, 1] },
      'demon-castle.building.forest-arch': { width: 512, height: 512, transparent: true, display: [2, 2], anchor: [0.5, 1] },
    } as const;
    for (const [slotId, contract] of Object.entries(expected)) {
      const slot = assetSlots.slots.find((entry) => entry.slotId === slotId);
      expect(slot, slotId).toBeDefined();
      expect(slot?.generation.styleId, slotId).toBe('life.illustrated-2d.v1');
      expect(slot?.asset).toMatchObject({ outputPx: { width: contract.width, height: contract.height }, alpha: contract.transparent ? 'transparent' : 'opaque', sampling: 'linear' });
      expect(slot?.render).toMatchObject({ display: { unit: 'cell', width: contract.display[0], height: contract.display[1] }, anchor: { x: contract.anchor[0], y: contract.anchor[1] } });
      const asset = localIndex.assets.find((entry) => entry.id === slot?.assetKey);
      expect(asset, slotId).toMatchObject({ style: 'life.illustrated-2d.v1', spec: { width: contract.width, height: contract.height, transparent: contract.transparent, sampling: 'linear' } });
    }
  });

  it('compiles every building-bound entrance to the exact visual placement footprint', () => {
    const session = createLifeGameSession({ descriptor, lifePackage, assetSlots });
    const cases = [
      ['moon-courtyard', 'courtyard-to-forest', 'forest-arch'],
      ['moon-courtyard', 'courtyard-to-workshop', 'undercrypt-stairs'],
      ['moonshadow-forest', 'forest-to-courtyard', 'forest-return-arch'],
      ['undercrypt-workshop', 'workshop-to-courtyard', 'workshop-return-stairs'],
    ] as const;
    for (const [sceneId, warpId, placementId] of cases) {
      const scene = lifePackage.scenes.find((entry) => entry.id === sceneId)!;
      const authoredWarp = scene.warps.find((entry) => entry.id === warpId)!;
      const placement = scene.placements.find((entry) => entry.id === placementId)!;
      const runtime = session.engine.world.getComponent<LifeWarp>(lifeEntityId('warp', sceneId, warpId), 'LifeWarp')!;
      expect(authoredWarp.interactionPlacementId, warpId).toBe(placementId);
      expect(runtime, warpId).toMatchObject({ x: placement.x, y: placement.y, width: placement.width, height: placement.height });
      const slot = assetSlots.slots.find((entry) => entry.assetKey === placement.skinKey)!;
      const scale = slot.render.display.unit === 'pixel' ? 32 : 1;
      expect(slot.render.display, placementId).toMatchObject({ width: placement.width * scale, height: placement.height * scale });
    }

    const forestWarp = session.engine.world.getComponent<LifeWarp>(lifeEntityId('warp', 'moon-courtyard', 'courtyard-to-forest'), 'LifeWarp')!;
    const position = session.engine.world.getComponent<LifePosition>('life:player', 'LifePosition')!;
    const transform = session.engine.world.getComponent<Transform>('life:player', 'Transform')!;
    const motion = session.engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')!;
    for (const [x, y] of [[17, 5], [18, 5], [17, 6], [18, 6]]) {
      Object.assign(position, { sceneId: forestWarp.sceneId, x, y }); Object.assign(transform, { x, y }); motion.sceneId = forestWarp.sceneId;
      session.engine.world.tick();
      expect(session.engine.world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext')?.nearbyWarpIds, `${x},${y}`).toContain(forestWarp.warpId);
    }
    Object.assign(position, { sceneId: forestWarp.sceneId, x: 16, y: 5 }); Object.assign(transform, { x: 16, y: 5 }); motion.sceneId = forestWarp.sceneId;
    session.engine.world.tick();
    expect(session.engine.world.getComponent<LifeActivityContext>('life:player', 'LifeActivityContext')?.nearbyWarpIds).not.toContain(forestWarp.warpId);
  });

  it('completes the authored three-build chapter through the real semantic action pipeline', () => {
    const session = createLifeGameSession({ descriptor, lifePackage, assetSlots });
    const { engine, input } = session;
    const moveTo = (sceneId: string, x: number, y: number): void => {
      const position = engine.world.getComponent<LifePosition>('life:player', 'LifePosition')!;
      const transform = engine.world.getComponent<Transform>('life:player', 'Transform')!;
      const motion = engine.world.getComponent<LifeContinuousMotion>('life:player', 'LifeContinuousMotion')!;
      engine.world.addComponent('life:player', { ...position, sceneId, x, y } as LifePosition);
      engine.world.addComponent('life:player', { ...transform, x, y } as Transform);
      engine.world.addComponent('life:player', { ...motion, sceneId, up: false, down: false, left: false, right: false } as LifeContinuousMotion);
      engine.world.tick();
    };
    const act = (...actions: Array<[string, string?]>): void => {
      for (const [name, arg] of actions) input.enqueueAction(name, arg === undefined ? undefined : { arg });
      applyCommands(engine.world, input.commandsForTick(engine.world.getVersion() + 1));
      engine.world.tick();
    };
    const inventory = (): Inventory => engine.world.getComponent<Inventory>('life:player', 'Inventory')!;
    const gather = (sceneId: string, x: number, y: number, targetId: string, action: string, count: number): void => {
      moveTo(sceneId, x, y);
      for (let index = 0; index < count; index += 1) act(['life.select-target', targetId], ['life.action', action]);
    };
    const build = (sceneId: string, x: number, y: number, placementId: string): void => {
      moveTo(sceneId, x, y);
      act(['life.select-target', placementId], ['life.action', 'build']);
    };
    const farm = (x: number, y: number): void => {
      moveTo('moon-courtyard', x, y);
      act(['life.action', 'till']);
      act(['life.action', 'water']);
      act(['life.select-item', 'seed.moonbell'], ['life.action', 'plant']);
    };

    gather('moonshadow-forest', 5, 10, 'moonwood-fallen-log', 'forage', 4);
    gather('undercrypt-workshop', 5, 9, 'shadow-ore-vein', 'mine', 3);
    expect(invCount(inventory(), 'resource.moonwood')).toBe(4);
    expect(invCount(inventory(), 'resource.shadow-ore')).toBe(3);

    build('moon-courtyard', 7, 4, 'throne-hall');
    expect(engine.world.getComponent<LifeConstructionProject>(lifeEntityId('construction', 'restore-throne-hall'), 'LifeConstructionProject')?.completed).toBe(true);
    expect(engine.world.getComponent<Flag>('life:logic:flag:flag.throne-lit', 'Flag')?.active).toBe(true);

    farm(2, 8);
    farm(3, 8);
    act(['life.advance-day']);
    moveTo('moon-courtyard', 2, 8); act(['life.action', 'water']);
    moveTo('moon-courtyard', 3, 8); act(['life.action', 'water']);
    act(['life.advance-day']);
    moveTo('moon-courtyard', 2, 8); act(['life.action', 'harvest']);
    moveTo('moon-courtyard', 3, 8); act(['life.action', 'harvest']);
    expect(invCount(inventory(), 'crop.moonbell')).toBe(2);

    build('moon-courtyard', 1, 5, 'greenhouse-ruin');
    expect(engine.world.getComponent<LifeConstructionProject>(lifeEntityId('construction', 'restore-greenhouse'), 'LifeConstructionProject')?.completed).toBe(true);
    expect(engine.world.getComponent<Flag>('life:logic:flag:flag.greenhouse-restored', 'Flag')?.active).toBe(true);
    build('undercrypt-workshop', 8, 9, 'forge-core');
    expect(engine.world.getComponent<LifeConstructionProject>(lifeEntityId('construction', 'awaken-forge-core'), 'LifeConstructionProject')?.completed).toBe(true);
    expect(engine.world.getComponent<Flag>('life:logic:flag:flag.forge-awakened', 'Flag')?.active).toBe(true);
    expect(invCount(inventory(), 'resource.moonwood')).toBe(0);
    expect(invCount(inventory(), 'resource.shadow-ore')).toBe(0);
    expect(invCount(inventory(), 'crop.moonbell')).toBe(0);
    const quest = engine.world.getComponent<LifeQuestProjection>('life:quest-projection', 'LifeQuestProjection')!;
    expect(quest.entries.filter((entry) => entry.questId === 'quest.restore-moonshadow').map((entry) => [entry.nodeId, entry.state])).toEqual([
      ['awaken-forge-core', 'completed'],
      ['light-throne-hall', 'completed'],
      ['restore-greenhouse', 'completed'],
    ]);
  });
});
