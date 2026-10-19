import { createGalWorld, type GalInitialManifest } from '../../assembly/gal-world.js';
import type { GalPackage } from '@engine/protocol/galgame.js';
import { BrowserGalPreviewCapturePort } from '../gal-save/gal-browser-preview-capture.js';
import { IndexedDbGalSavePreviewPort } from '../gal-save/gal-save-preview-indexeddb.js';
import { IndexedDbSavePort } from '../save/indexeddb-save-port.js';
import { IndexedDbKV } from '../storage/indexeddb-kv.js';
import { IndexedDbStoragePort } from '../storage/indexeddb-storage.js';
import { GalSliceHost } from './gal-ui-slice-host.js';
import type { GalUiArt } from './gal-ui-art.js';
/* AI START */
import type { HostExitPort } from '../platform/host-exit.js';
/* AI END */
import { createGalBrowserAudioPorts, type GalAudioPorts, type GalAudioStatus } from './gal-audio-coordinator.js';

/** Product Web/Electron-webview composition; the game contributes data, never a custom UI or save system. */
export interface GalBrowserGameOptions {
  readonly container: HTMLElement;
  readonly pkg: GalPackage;
  readonly initial: GalInitialManifest;
  /** Stable, product-specific database name. Only one active writer is supported. */
  readonly dbName: string;
  /** Package asset keys mapped to resolved image/audio URLs. No demo content is implicit. */
  readonly contentUrls: Readonly<Record<string, string>>;
  /** Default composes existing browser audio ports. false disables audio, ports enable isolated tests. */
  readonly audio?: GalAudioPorts | false;
  readonly audioDiagnostic?: (status: GalAudioStatus) => void;
  readonly uiArt?: GalUiArt;
  readonly locale?: string;
  /** Optional injected KV seams for isolated browser verification. */
  readonly kv?: IndexedDbKV;
  readonly previewKv?: IndexedDbKV;
  readonly now?: () => number;
  /* AI START */
  /** Browser preview feedback. Desktop shells set this false and inject hostExit instead. */
  readonly previewExitFeedback?: boolean;
  readonly hostExit?: HostExitPort;
  /* AI END */
}

export interface GalBrowserGameHandle {
  readonly host: GalSliceHost;
  readonly kv: IndexedDbKV;
  readonly previewKv: IndexedDbKV;
  /** Unmount first, then release owned database connections. Idempotent. */
  close(): Promise<void>;
}

export async function mountGalBrowserGame(options: GalBrowserGameOptions): Promise<GalBrowserGameHandle> {
  if (!(options.container instanceof HTMLElement)) throw new Error('GAL browser host requires an HTMLElement');
  if (!options.dbName.trim()) throw new Error('GAL browser host requires a stable dbName');
  const { pkg, world, storyEntity } = createGalWorld(options.pkg, options.initial);
  const ownsKv = !options.kv, ownsPreviewKv = !options.previewKv;
  const kv = options.kv ?? new IndexedDbKV({ dbName: options.dbName, storeName: 'kv' });
  const previewKv = options.previewKv ?? kv;
  try {
    const host = await GalSliceHost.create(pkg, world, storyEntity, {
      profile: new IndexedDbSavePort({ kv, ls: null }),
      manual: new IndexedDbStoragePort({ kv, ls: null }),
      savePreview: new IndexedDbGalSavePreviewPort(previewKv),
      previewCapture: new BrowserGalPreviewCapturePort(),
      savedAt: options.now ?? (() => Date.now()),
      playbackClock: {
        now: () => performance.now(),
        schedule: (delayMs, fire) => {
          const timer = window.setTimeout(fire, delayMs);
          return () => window.clearTimeout(timer);
        },
      },
      contentUrls: options.contentUrls,
      audio: options.audio === false ? undefined : options.audio ??
        (typeof Audio === 'undefined' ? undefined : createGalBrowserAudioPorts(pkg, options.contentUrls)),
      audioDiagnostic: options.audioDiagnostic,
      uiArt: options.uiArt,
      /* AI START */
      previewExitFeedback: options.previewExitFeedback ?? true,
      hostExit: options.hostExit,
      /* AI END */
    }, options.locale);
    const detach = host.attach(options.container);
    let closed = false;
    return { host, kv, previewKv, close: async () => {
      if (closed) return;
      closed = true;
      detach();
      if (ownsPreviewKv && previewKv !== kv) await previewKv.close();
      if (ownsKv) await kv.close();
    } };
  } catch (error) {
    if (ownsPreviewKv && previewKv !== kv) await previewKv.close();
    if (ownsKv) await kv.close();
    throw error;
  }
}
