/* AI START */
import type { GalPackage } from '@engine/protocol/galgame.js';
import type { AssetIndex } from '../../assets/asset-index.js';
import { parseAssetIndex } from '../../assets/asset-index.js';
import type { HostExitPort } from '../platform/host-exit.js';
import { mountGalBrowserGame, type GalBrowserGameHandle } from './gal-browser-game-host.js';
import { galUiUrlsFromIndex, resolveGalUiArt } from './gal-ui-art.js';

const PACKAGE_URL = '/games/manor-escape/package.json';
const CONTENT_URL = '/games/manor-escape/content-urls.json';
const CHROME_URL = '/games/gal-template/art/index.json';

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} 返回 ${response.status}`);
  return response.json();
}

/** Loads the approved package and image map. The host remains the shared GAL browser game. */
export async function openManorEscape(container: HTMLElement, options?: {
  readonly previewExitFeedback?: boolean;
  readonly hostExit?: HostExitPort;
}): Promise<GalBrowserGameHandle> {
  const [pkg, contentUrls, chrome] = await Promise.all([
    readJson(PACKAGE_URL), readJson(CONTENT_URL), readJson(CHROME_URL),
  ]);
  if (contentUrls === null || typeof contentUrls !== 'object' || Array.isArray(contentUrls))
    throw new Error('庄园出逃图片地址表不是对象');
  return mountGalBrowserGame({
    container, pkg: pkg as GalPackage,
    initial: { schema: 1, entities: { random: { RandomSeed: { seed: 20261016, sequence: 0 } } } },
    dbName: 'zerocraft-manor-escape',
    contentUrls: contentUrls as Readonly<Record<string, string>>,
    uiArt: resolveGalUiArt(galUiUrlsFromIndex(parseAssetIndex(chrome as AssetIndex))),
    previewExitFeedback: options?.previewExitFeedback,
    hostExit: options?.hostExit,
  });
}

export function mount(el: HTMLElement): () => void {
  let closed = false;
  let handle: GalBrowserGameHandle | undefined;
  void openManorEscape(el).then(opened => {
    if (closed) void opened.close();
    else handle = opened;
  }).catch(error => {
    if (!closed) el.textContent = error instanceof Error ? error.message : String(error);
  });
  return () => { closed = true; void handle?.close(); };
}
/* AI END */
