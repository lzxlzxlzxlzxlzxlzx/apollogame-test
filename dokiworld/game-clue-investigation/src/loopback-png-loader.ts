import type { AssetLoader } from '../../../src/assets/asset-types.js';
import { HostPngAssetLoader } from '../../../src/assets/host-visual-bridge.js';

const ALIAS_ORIGIN = 'https://loopback-host-visual.invalid';
const MAX_BYTES = 16 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function isLoopbackPngUrl(value: string, appOrigin: string): boolean {
  try {
    const url = new URL(value);
    const app = new URL(appOrigin);
    return app.protocol === 'http:' && app.hostname === '127.0.0.1'
      && url.protocol === 'http:' && url.hostname === '127.0.0.1'
      && !url.username && !url.password && !url.hash && /\.png$/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** App-scoped adapter: HTTPS stays on the shared strict loader; local HTTP is loopback-only. */
export class LoopbackPngAssetLoader implements AssetLoader {
  private readonly aliases = new Map<string, string>();
  private readonly httpsLoader = new HostPngAssetLoader();

  constructor(private readonly appOrigin: string) {}

  hostVisualUrl(id: string, sourceUrl: string): string {
    if (!isLoopbackPngUrl(sourceUrl, this.appOrigin)) return sourceUrl;
    const alias = `${ALIAS_ORIGIN}/${encodeURIComponent(id)}.png`;
    this.aliases.set(alias, sourceUrl);
    return alias;
  }

  async load(descriptor: Parameters<AssetLoader['load']>[0]): ReturnType<AssetLoader['load']> {
    if (descriptor.kind !== 'texture') throw new Error('Investigation image loader only accepts textures');
    const source = this.aliases.get(descriptor.src);
    if (source === undefined) {
      if (descriptor.src.startsWith('https:')) return this.httpsLoader.load(descriptor);
      if (!isLoopbackPngUrl(descriptor.src, this.appOrigin)) throw new Error('Only HTTPS or local 127.0.0.1 PNG URLs are allowed');
    }
    return this.loadLocalPng(source ?? descriptor.src);
  }

  private async loadLocalPng(sourceUrl: string): ReturnType<AssetLoader['load']> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(sourceUrl, { mode: 'cors', credentials: 'omit', redirect: 'follow', signal: controller.signal });
      if (!response.ok || response.type === 'opaque'
        || !/^image\/png(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')
        || !isLoopbackPngUrl(response.url, this.appOrigin)) {
        throw new Error('Local images need a PNG CORS response from 127.0.0.1; redirects must remain on 127.0.0.1');
      }
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('PNG byte budget exceeded');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_BYTES) throw new Error('PNG byte budget exceeded');
      const signature = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
      if (signature.length !== 8 || !PNG_SIGNATURE.every((byte, index) => signature[index] === byte)) throw new Error('Invalid PNG signature');
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      return { handle: { image }, width: image.width, height: image.height };
    } catch (error) {
      if (error instanceof TypeError) throw new Error('Local PNG fetch failed; enable CORS for the DokiWorld origin', { cause: error });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
