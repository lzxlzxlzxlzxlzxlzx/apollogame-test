import { createArtAssets, loadGameArtInto, parseAssetSlotManifest, compileLifeVisualCatalog, type AssetManager } from '@zerocraft/engine/assets/index.js';
import { createStoragePort, type StoragePort } from '@zerocraft/engine/services/storage/index.js';
import {
  createLifeGameSession, createPersistentLifeGameSession, lifeHostLayout, mountLifeGame,
  type LifeGameCoreSession, type LifeGameHostContext,
} from '../../src/engine/host/life-game-host.js';
import { LifeHostAutosave, LifeHostSaveAdapter } from '../../src/engine/host/life-save.js';
import type { CanvasRenderer } from '@zerocraft/engine/renderer/index.js';
import { LITTLE_VALLEY_PACKAGE } from './life-demo-package.js';
import { LIFE_DEMO_HOST_DESCRIPTOR } from './host-descriptor.js';
import type { LifeDemoRestoreResult } from './save.js';
import littleValleyAssetSlots from './little-valley.asset-slots.json';

export const LIFE_DEMO_ART_SLUG = LIFE_DEMO_HOST_DESCRIPTOR.artSlug;
export const LITTLE_VALLEY_ASSET_SLOTS = parseAssetSlotManifest(littleValleyAssetSlots);
export const LITTLE_VALLEY_VISUAL_CATALOG = compileLifeVisualCatalog(LITTLE_VALLEY_ASSET_SLOTS);
export const LIFE_DEMO_HOST_LAYOUT = lifeHostLayout(LIFE_DEMO_HOST_DESCRIPTOR);

const LIFE_DEMO_INPUT = {
  descriptor: LIFE_DEMO_HOST_DESCRIPTOR,
  lifePackage: LITTLE_VALLEY_PACKAGE,
  assetSlots: LITTLE_VALLEY_ASSET_SLOTS,
} as const;

export type LifeDemoCoreSession = LifeGameCoreSession;
export interface LifeDemoSession extends LifeDemoCoreSession { readonly renderer: CanvasRenderer }

/** Render-only bridge; missing/unapproved art keeps the semantic preview fallback. */
export function loadLifeDemoArtInto(assets: AssetManager): Promise<boolean> {
  return loadGameArtInto(assets, LIFE_DEMO_ART_SLUG);
}

export function createLifeDemoSession(assets: AssetManager = createArtAssets()): LifeDemoCoreSession {
  return createLifeGameSession(LIFE_DEMO_INPUT, assets);
}

export interface PersistentLifeDemoSession {
  readonly session: LifeDemoCoreSession;
  readonly saves: LifeHostSaveAdapter;
  readonly autosave: LifeHostAutosave;
  readonly restoreResult: LifeDemoRestoreResult;
}

export async function createPersistentLifeDemoSession(
  assets: AssetManager = createArtAssets(),
  port: StoragePort = createStoragePort(),
): Promise<PersistentLifeDemoSession> {
  const persistent = await createPersistentLifeGameSession({ ...LIFE_DEMO_INPUT, storage: port }, assets);
  return {
    session: persistent.session,
    saves: persistent.saves!,
    autosave: persistent.autosave!,
    restoreResult: persistent.restoreResult as LifeDemoRestoreResult,
  };
}

export interface LifeDemoMountHost extends LifeGameHostContext { exit(): void; readonly storage?: StoragePort }

/** Little Valley is now a data-only thin entry over the shared Life host lifecycle. */
export function mount(container: HTMLElement, host?: LifeDemoMountHost): () => void {
  const mounted = mountLifeGame(container, {
    ...LIFE_DEMO_INPUT,
    host,
    // Preserve the existing browser persistence default; tests can omit storage on the generic host.
    storage: host?.storage ?? createStoragePort(),
  });
  return () => mounted.dispose();
}
