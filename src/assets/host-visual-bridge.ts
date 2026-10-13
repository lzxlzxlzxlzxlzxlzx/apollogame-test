import type { AssetLoader } from './asset-types.js';
import { AssetManager } from './asset-manager.js';
import type { HitMaskSpec } from '../engine/protocol/hit-mask.js';
import type { Clickable, Sprite, Transform } from '../engine/protocol/components.js';
import { bindHostHitMaskCatalog, HOST_MASK_PREFIX } from '../engine/protocol/host-hit-mask-catalog.js';

/** Generic one-launch host visual contract. No URL or image bytes are projected into World. */
export interface HostVisual {
  readonly id: string;
  readonly imageUrl: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly placement: {
    readonly x: number; readonly y: number; readonly width: number; readonly height: number;
    readonly zIndex: number; readonly fit: 'cover' | 'contain';
    readonly anchorX: number; readonly anchorY: number; readonly rotation: 0;
  };
  readonly hitMask: {
    readonly encoding: 'bitset-hex-msb'; readonly width: number; readonly height: number;
    readonly rows: readonly string[];
  };
}

export interface PreparedHostVisual {
  readonly id: string;
  readonly textureKey: string;
  readonly hitMaskKey: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly placement: HostVisual['placement'];
  /** Higher value wins; same zIndex follows input order, never load completion order. */
  readonly renderOrder: number;
}

export interface HostVisualWorldProjection {
  readonly transform: Transform;
  readonly sprite: Sprite;
  readonly clickable: Clickable;
}

/** Pure projection only; no URL, bitmap, mask rows or free-form handler enters World. */
export function projectHostVisual(visual: PreparedHostVisual, canvasWidth: number, canvasHeight: number, action: string): HostVisualWorldProjection {
  if (!Number.isSafeInteger(canvasWidth) || canvasWidth < 1 || canvasWidth > 8192
    || !Number.isSafeInteger(canvasHeight) || canvasHeight < 1 || canvasHeight > 8192) fail('invalid logical canvas');
  if (typeof action !== 'string' || !action || action.length > 128) fail('invalid action');
  const p = visual.placement;
  const width = p.width * canvasWidth;
  const height = p.height * canvasHeight;
  const x = p.x * canvasWidth;
  const y = p.y * canvasHeight;
  if (x - p.anchorX * width >= canvasWidth || x + (1 - p.anchorX) * width <= 0
    || y - p.anchorY * height >= canvasHeight || y + (1 - p.anchorY) * height <= 0) fail('placement does not intersect canvas');
  return {
    transform: { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 },
    sprite: { type: 'Sprite', textureKey: visual.textureKey, anchorX: p.anchorX, anchorY: p.anchorY,
      zOrder: visual.renderOrder, width, height, fit: p.fit },
    clickable: { type: 'Clickable', action, hitMaskKey: visual.hitMaskKey },
  };
}

const MAX_MASK_BITS = 131_072;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_VISUALS = 64;

function fail(reason: string): never { throw new Error(`HostVisualBridge: ${reason}`); }
function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(`${name}: expected plain object`);
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== keys.length || Object.keys(r).some((k) => !keys.includes(k))) fail(`${name}: invalid keys`);
  return r;
}
function integer(value: unknown, low: number, high: number, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < low || (value as number) > high) fail(`${name}: invalid integer`);
  return value as number;
}
function unit(value: unknown, allowZero: boolean, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value > 1 || value < 0 || (!allowZero && value === 0)) fail(`${name}: invalid unit`);
  return value;
}
function keyPart(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) fail(`${name}: invalid id`);
  return value;
}
function url(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) fail('imageUrl: invalid URL');
  let parsed: URL;
  try { parsed = new URL(value); } catch { fail('imageUrl: invalid URL'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash
    || !/\.png$/i.test(parsed.pathname)) fail('imageUrl: only credential-free HTTPS PNG URLs are allowed');
  return value;
}
function parseVisual(value: unknown): { visual: HostVisual; maskRows: string[] } {
  const v = record(value, ['id', 'imageUrl', 'pixelWidth', 'pixelHeight', 'placement', 'hitMask'], 'visual');
  const id = keyPart(v.id, 'visual.id');
  const imageUrl = url(v.imageUrl);
  const pixelWidth = integer(v.pixelWidth, 1, 4096, 'pixelWidth');
  const pixelHeight = integer(v.pixelHeight, 1, 4096, 'pixelHeight');
  const p = record(v.placement, ['x', 'y', 'width', 'height', 'zIndex', 'fit', 'anchorX', 'anchorY', 'rotation'], 'placement');
  const placement = {
    x: unit(p.x, true, 'placement.x'), y: unit(p.y, true, 'placement.y'),
    width: unit(p.width, false, 'placement.width'), height: unit(p.height, false, 'placement.height'),
    zIndex: integer(p.zIndex, 0, 255, 'placement.zIndex'),
    fit: p.fit, anchorX: unit(p.anchorX, true, 'placement.anchorX'), anchorY: unit(p.anchorY, true, 'placement.anchorY'), rotation: p.rotation,
  };
  if (placement.fit !== 'cover' && placement.fit !== 'contain') fail('placement.fit: invalid value');
  if (placement.rotation !== 0) fail('placement.rotation: v1 requires zero');
  const m = record(v.hitMask, ['encoding', 'width', 'height', 'rows'], 'hitMask');
  if (m.encoding !== 'bitset-hex-msb') fail('hitMask.encoding: unsupported');
  const width = integer(m.width, 1, 256, 'hitMask.width');
  const height = integer(m.height, 1, 256, 'hitMask.height');
  if (!Array.isArray(m.rows) || m.rows.length !== height) fail('hitMask.rows: invalid row count');
  const chars = Math.ceil(width / 4);
  const rows: string[] = [];
  for (const row of m.rows) {
    if (typeof row !== 'string' || row.length !== chars || !/^[0-9a-f]+$/.test(row)) fail('hitMask.rows: invalid hex');
    const bits = [...row].map((digit) => parseInt(digit, 16).toString(2).padStart(4, '0')).join('');
    if (bits.slice(width).includes('1')) fail('hitMask.rows: nonzero padding');
    rows.push(bits.slice(0, width));
  }
  // A pre-baked mask may be lower resolution, but its aspect must match the PNG.
  if (width * pixelHeight !== height * pixelWidth) fail('hitMask: aspect differs from texture');
  return { visual: { id, imageUrl, pixelWidth, pixelHeight, placement: placement as HostVisual['placement'], hitMask: { encoding: 'bitset-hex-msb', width, height, rows: [...m.rows] as string[] } }, maskRows: rows };
}

export function parseHostVisuals(input: unknown): readonly { visual: HostVisual; maskRows: readonly string[] }[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_VISUALS) fail('visual count out of bounds');
  let bytes: number;
  try { bytes = new TextEncoder().encode(JSON.stringify(input)).byteLength; } catch { fail('invalid JSON input'); }
  if (bytes > MAX_JSON_BYTES) fail('JSON budget exceeded');
  const parsed = input.map(parseVisual);
  const ids = new Set<string>();
  let totalBits = 0;
  for (const item of parsed) {
    if (ids.has(item.visual.id)) fail('duplicate visual id');
    ids.add(item.visual.id);
    totalBits += item.visual.hitMask.width * item.visual.hitMask.height;
    if (totalBits > MAX_MASK_BITS) fail('mask budget exceeded');
  }
  return parsed;
}

/** One session owns only its generated keys. Dispose invalidates catalog and loaded textures. */
export class HostVisualSession {
  private disposed = false;
  private readonly masks = new Map<string, HitMaskSpec>();
  private readonly textureKeys: string[] = [];
  private readonly unbinds = new Set<() => void>();
  private constructor(private readonly manager: AssetManager, readonly sessionId: string) {}

  static async prepare(manager: AssetManager, sessionId: string, input: unknown, options: { preview?: boolean } = {}): Promise<{ session: HostVisualSession; visuals: readonly PreparedHostVisual[] }> {
    keyPart(sessionId, 'sessionId');
    const session = new HostVisualSession(manager, sessionId);
    if (options.preview) return { session, visuals: [] }; // no host URL request or playable World
    const parsed = parseHostVisuals(input);
    const prepared: PreparedHostVisual[] = [];
    try {
      for (const [index, { visual, maskRows }] of parsed.entries()) {
        const textureKey = `host-visual:${sessionId}:${visual.id}`;
        const hitMaskKey = `${HOST_MASK_PREFIX}${sessionId}:${visual.id}`;
        if (manager.has(textureKey)) fail('texture key collision');
        manager.register({ kind: 'texture', key: textureKey, src: visual.imageUrl, width: visual.pixelWidth, height: visual.pixelHeight });
        session.textureKeys.push(textureKey);
        session.masks.set(hitMaskKey, {
          version: 1, width: visual.hitMask.width, height: visual.hitMask.height,
          threshold: 1, sourceTextureKey: textureKey, rows: maskRows,
        });
        prepared.push({ id: visual.id, textureKey, hitMaskKey, pixelWidth: visual.pixelWidth, pixelHeight: visual.pixelHeight,
          placement: visual.placement, renderOrder: visual.placement.zIndex * (MAX_VISUALS + 1) + (parsed.length - index) });
      }
      // Promise.all preserves input order regardless of network completion order.
      const loaded = await Promise.all(prepared.map((v) => manager.load(v.textureKey)));
      for (let i = 0; i < loaded.length; i++) {
        if (loaded[i].width !== prepared[i].pixelWidth || loaded[i].height !== prepared[i].pixelHeight) fail('decoded texture dimensions differ');
      }
      return { session, visuals: prepared };
    } catch (error) {
      session.dispose();
      throw error;
    }
  }

  bindWorld(world: object): () => void {
    if (this.disposed) fail('session disposed');
    const unbind = bindHostHitMaskCatalog(world, { get: (key) => this.disposed ? undefined : this.masks.get(key) });
    this.unbinds.add(unbind);
    return () => { unbind(); this.unbinds.delete(unbind); };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unbind of this.unbinds) unbind();
    this.unbinds.clear();
    this.masks.clear();
    for (const key of this.textureKeys) this.manager.unregister(key);
  }
}

/** Convenience for browser consumers; injecting an AssetLoader keeps tests offline. */
export function createHostVisualAssetManager(loader: AssetLoader = new HostPngAssetLoader()): AssetManager {
  return new AssetManager(loader);
}

/** Strict browser-only loader: CORS fetch without credentials, PNG signature and decode. */
export class HostPngAssetLoader implements AssetLoader {
  async load(descriptor: Parameters<AssetLoader['load']>[0]): ReturnType<AssetLoader['load']> {
    if (descriptor.kind !== 'texture') fail('host loader requires texture');
    url(descriptor.src);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(descriptor.src, { mode: 'cors', credentials: 'omit', signal: controller.signal });
      if (!response.ok || response.type === 'opaque'
        || !/^image\/png(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) fail('HTTPS PNG CORS response required');
      url(response.url); // a redirect must not leave the credential-free HTTPS PNG boundary
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > 16 * 1024 * 1024) fail('PNG byte budget exceeded');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 16 * 1024 * 1024) fail('PNG byte budget exceeded');
      const signature = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
      if (signature.length !== 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => signature[i] === v)) fail('invalid PNG signature');
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      return { handle: { image }, width: image.width, height: image.height };
    } finally {
      clearTimeout(timeout);
    }
  }
}
