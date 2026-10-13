// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAssetIndex, parseAssetSlotManifest, validateAssetSlotClosure } from '@zerocraft/engine/assets/index.js';
import { lifeEntityId } from '../assembly/life-package-compile.js';
import { gameArtIndexUrl } from '../assets/game-art-load.js';
import type { Flag, LifeConstructionProject, LifeContinuousMotion, LifePosition, LifeQuestProjection, Transform } from '../engine/protocol/components.js';
import { createLifeGameSession } from '../engine/host/life-game-host.js';
import { applyCommands } from '../net/commands.js';
import { MemoryStoragePort } from '../services/storage/index.js';
import { invCount, type Inventory } from '../skills/tier2/inventory.js';
import { mountLifeLauncherItem } from '../launcher/life-game-runner.js';
import { LIFE_LAUNCHER_CATALOG } from '../launcher/life-launcher-catalog.js';
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
    expect(container.textContent).toContain('月影魔王城');
    await Promise.resolve();
    expect(loadedSlugs).toEqual(['game-demon-castle']);
    handle.dispose();
    expect(container.childElementCount).toBe(0);
  });

  it('closes every formal visual consumer against the approved local index and exact served bytes', () => {
    const keys = [...new Set(skinKeys(lifePackage))].sort();
    const parsedIndex = parseAssetIndex(localIndex);
    const parsedSlots = parseAssetSlotManifest(assetSlots);
    expect(validateAssetSlotClosure(parsedSlots, { 'life.json': lifePackage }, parsedIndex, keys)).toEqual([]);
    expect(assetSlots.slots).toHaveLength(26);
    expect(parsedIndex.assets).toHaveLength(26);
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
