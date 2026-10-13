// GAL-ENG-06J: browser-only full-port fixture in an isolated local IndexedDB.
import type { GalPackage } from '@engine/protocol/galgame.js';
import { IndexedDbKV } from '../storage/indexeddb-kv.js';
import { GalManualSaveController } from '../gal-save/gal-manual-save.js';
import { IndexedDbGalSavePreviewPort } from '../gal-save/gal-save-preview-indexeddb.js';
import { GalSavePreviewController, type GalPreviewRecord } from '../gal-save/gal-save-preview.js';
import { IndexedDbStoragePort } from '../storage/indexeddb-storage.js';
import { mountGalBrowserGame } from './gal-browser-game-host.js';

const backgroundKey = 'tex/gal-demo-backdrop';
const portraitKey = 'tex/gal-demo-portrait';
const L = (value: string) => ({ 'zh-CN': value });
const pkg: GalPackage = {
  schemaVersion: 1, id: 'gal-preview-idb-live-audit', title: L('月影书简'),
  defaultLocale: 'zh-CN', locales: ['zh-CN'], entry: { chapterId: 'a', nodeId: 'intro' },
  ui: { template: 'gal-template' },
  characters: { mio: { id: 'mio', name: L('澪'), portraits: { neutral: portraitKey,
    expressions: {}, fallback: 'neutral' } } },
  scenes: { moonlit: { id: 'moonlit', background: 'moonlit-bg', cast: { mio: { visible: true } } } },
  preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only',
    bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
  media: { backgrounds: { 'moonlit-bg': { image: backgroundKey } }, cg: {},
    audio: { bgm: {}, sfx: {}, voice: {} }, video: {} },
  gallery: { memories: {}, music: {} }, endings: { done: { title: L('结束') } },
  chapters: { a: { id: 'a', title: L('序章'), start: 'intro', scene: 'moonlit', nodes: {
    intro: { kind: 'line', speaker: 'mio', text: L('今晚的月色，适合留一张照片。'),
      next: { chapterId: 'a', nodeId: 'done' } },
    done: { kind: 'ending', ending: 'done', text: L('留在心中的月光。') },
  } } },
};

async function mount(): Promise<void> {
  const globals = window as typeof window & {
    __galIdbAuditAssets?: Record<string, string>;
    __galIdbAuditNoSidecarStorage?: boolean;
  };
  const contentUrls = globals.__galIdbAuditAssets;
  if (!contentUrls?.[backgroundKey] || !contentUrls[portraitKey])
    throw new Error('GAL 06J missing registered demo asset URLs');
  const kv = new IndexedDbKV({ dbName: 'gal-preview-idb-live-audit-v1', storeName: 'kv' });
  // Failure injection affects only the non-authoritative preview sidecar.
  const unavailableFactory = { open: () => { throw new Error('sidecar storage unavailable'); } } as unknown as IDBFactory;
  const previewKv = globals.__galIdbAuditNoSidecarStorage
    ? new IndexedDbKV({ dbName: 'gal-preview-idb-live-audit-no-sidecar', factory: unavailableFactory })
    : kv;
  const sidecarPort = new IndexedDbGalSavePreviewPort(previewKv);
  const manual = new GalManualSaveController(pkg, new IndexedDbStoragePort({ kv, ls: null }));
  const sidecar = new GalSavePreviewController(pkg, manual, sidecarPort);
  const mounted = await mountGalBrowserGame({ container: document.getElementById('root')!, pkg,
    initial: { schema: 1, entities: { random: { RandomSeed: { seed: 12345, sequence: 0 } } } },
    dbName: 'gal-preview-idb-live-audit-v1', kv, previewKv, contentUrls, now: () => 1000,
  });
  const host = mounted.host;
  Object.assign(window, { __galIdbAudit: {
    page: () => host.uiState.page,
    feedback: () => host.uiState.feedback,
    confirm: () => host.uiState.confirm,
    slot2: () => host.view.manual.slots[1],
    currentHash: async () => (await manual.inspect(2))?.hash ?? null,
    preview: () => sidecar.resolve(2),
    visibleRef: () => host.view.story.refKey,
    exitConfirmation: () => host.view.preferences.confirmations.exitGame,
    keys: () => kv.listKeys(''),
    corruptImage: async () => {
      const record = await sidecarPort.read(pkg.id, 2) as GalPreviewRecord | null;
      if (!record?.image) throw new Error('no preview to corrupt');
      await kv.put(`gal-preview:v1:${JSON.stringify([pkg.id, 2])}`,
        JSON.stringify({ ...record, image: { ...record.image, data: 'YmFk' } }));
    },
    close: async () => { await mounted.close(); await kv.close(); if (previewKv !== kv) await previewKv.close(); },
  } });
}
void mount().catch(error => { Object.assign(window, { __galIdbAuditError: String(error) }); });
