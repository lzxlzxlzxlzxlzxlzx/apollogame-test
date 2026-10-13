// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import rawSlots from '../../games/game-simlife/little-valley.asset-slots.json';
import { threeSceneLifePackage } from '../assembly/life-package.fixture.js';
import { seasideMarketHostDescriptorFixture } from '../authoring/life-host-descriptor.fixture.js';
import { deriveLifeHostSaveSlot } from '../engine/host/life-save.js';
import { LIFE_VIEWPORT_PROFILE_ID } from '../engine/protocol/life-viewport-profile.js';
import { MemoryStoragePort } from '../services/storage/index.js';
import { mountLifeLauncherItem } from './life-game-runner.js';
import { LIFE_LAUNCHER_SCHEMA, discoverLifeLauncherCatalog } from './life-launcher-catalog.js';

function canvasContext(): CanvasRenderingContext2D {
  const values: Record<PropertyKey, unknown> = {
    globalAlpha: 1, imageSmoothingEnabled: true,
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

function discoveredItem() {
  const directory = 'game-seaside-market'; const root = `../../games/${directory}`;
  const descriptor = structuredClone(seasideMarketHostDescriptorFixture());
  const lifePackage = structuredClone(threeSceneLifePackage()) as any;
  lifePackage.meta.id = directory; lifePackage.meta.title = 'Seaside Market';
  lifePackage.camera = { profile: LIFE_VIEWPORT_PROFILE_ID };
  const slots = structuredClone(rawSlots) as any; slots.game = directory;
  const catalog = discoverLifeLauncherCatalog(
    { [`${root}/life-launcher.json`]: { schema: LIFE_LAUNCHER_SCHEMA, id: directory, title: '海风集市', subtitle: '潮汐经营', description: '独立 Life 内容', color: '#17364a', accentColor: '#62d6c5', icon: '🐚' } },
    { [`${root}/life-host.json`]: descriptor }, { [`${root}/life.json`]: lifePackage }, { [`${root}/asset-slots.json`]: slots },
  );
  return catalog.items[0]!;
}

describe('Life launcher integration', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext());
    let frame = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => ++frame));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
  });
  afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('mounts a discovered second game through the launcher bridge and preserves descriptor-derived save identity', async () => {
    const container = document.createElement('div');
    Object.defineProperties(container, { clientWidth: { value: 1060 }, clientHeight: { value: 760 } });
    document.body.appendChild(container);
    const item = discoveredItem(); const storage = new MemoryStoragePort();
    const handle = mountLifeLauncherItem(container, item, { storage, loadArt: async () => false });
    const mounted = await handle.ready;
    expect(container.textContent).toContain('海风集市');
    expect(container.textContent).not.toContain('小山谷');
    expect(mounted.saves?.slot).toBe(deriveLifeHostSaveSlot(item.bundle!.descriptor));
    expect(mounted.session.descriptor.slug).toBe('game-seaside-market');
    const authority = JSON.stringify(mounted.session.engine.world.snapshot());
    expect(authority).not.toContain('zerocraft.life-launcher.v1');
    expect(authority).not.toContain('海风集市');
    expect(authority).not.toContain('humanApprovalRequired');
    handle.dispose();
    expect(container.childElementCount).toBe(0);
  });
});
