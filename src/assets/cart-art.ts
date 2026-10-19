import { parseAssetIndex, filledSrc, registerAssetIndex, type AssetIndex } from './asset-index.js';
import { AssetManager } from './asset-manager.js';
import { ImageAssetLoader } from './image-loader.js';
import type { CartPresentation } from '../assembly/cart-presentation.js';
import { parseHitMaskSpec } from '../engine/protocol/hit-mask.js';
import type { WorldBlueprint } from '../assembly/demo.assembly.js';

/** The cartridge owns this local index. Shared-library assets must be vendored first. */
export function cartArtIndexUrl(slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`cart-art: 非法卡带 slug ${slug}`);
  return `/games/${slug}/art/index.json`;
}

/** A missing/unavailable index remains optional for legacy carts; required consumers reject it below. */
export async function fetchCartArtIndex(slug: string): Promise<unknown | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch(cartArtIndexUrl(slug), { cache: 'no-store' });
    if (!response.ok) return null;
    // Vite SPA fallback may answer a missing JSON URL with index.html/HTTP 200.
    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('json')) return null;
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

const SKIN_PROPS = new Set(['src', 'image', 'skin', 'icon', 'poster', 'trackSkin', 'thumbSkin']);
const SKIN_PREFIX = 'asset:';

/** UI URLs remain render-only; authored LayoutNode data names stable asset keys. */
export function cartSkinKeys(presentation?: CartPresentation): string[] {
  if (!presentation) return [];
  const keys = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    for (const [name, field] of Object.entries(value)) {
      if (SKIN_PROPS.has(name) && typeof field === 'string' && field.startsWith(SKIN_PREFIX)) keys.add(field.slice(SKIN_PREFIX.length));
      else visit(field);
    }
  };
  visit(presentation.ui);
  return [...keys].sort();
}

export function cartSpriteKeys(entities: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  for (const components of Object.values(entities)) {
    const sprite = (components as { Sprite?: { textureKey?: unknown } })?.Sprite;
    if (typeof sprite?.textureKey === 'string' && sprite.textureKey && !sprite.textureKey.startsWith('art:')) keys.add(sprite.textureKey);
  }
  return [...keys].sort();
}

export function requireCartAssetIndex(raw: unknown, slug: string, rawIndex: unknown | null): AssetIndex | undefined {
  const manifest = raw as { entities?: Record<string, { Clickable?: { hitMaskKey?: unknown } }>; presentation?: CartPresentation };
  const hasMask = Object.values(manifest?.entities ?? {}).some((c) => !!c?.Clickable?.hitMaskKey);
  const skins = cartSkinKeys(manifest?.presentation);
  if (rawIndex === null) {
    if (hasMask || skins.length) throw new Error(`cart-art: ${slug} 缺少 ${cartArtIndexUrl(slug)}；hit-mask/asset: 皮肤不能回退成矩形或空图`);
    return undefined;
  }
  const index = parseAssetIndex(rawIndex);
  const prefix = `/games/${slug}/art/`;
  for (const entry of index.assets) {
    if (!entry.path) continue;
    if (!entry.path.startsWith(prefix) || entry.path.includes('..') || entry.path.includes('\\') || entry.path.includes('?') || entry.path.includes('#')) {
      throw new Error(`cart-art: ${entry.id} 路径必须位于 ${prefix} 且不得穿越目录`);
    }
  }
  const byId = new Map(index.assets.map((entry) => [entry.id, entry]));
  const spriteKeys = cartSpriteKeys(manifest?.entities ?? {});
  for (const key of [...spriteKeys, ...skins]) {
    const entry = byId.get(key);
    if (!entry || entry.type !== 'texture' || entry.status !== 'filled') throw new Error(`cart-art: ${slug} 贴图 ${key} 未在本地索引登记为 filled texture`);
  }
  for (const [entityId, components] of Object.entries(manifest?.entities ?? {})) {
    const maskKey = components?.Clickable?.hitMaskKey;
    if (typeof maskKey !== 'string') continue;
    const entry = byId.get(maskKey);
    if (!entry || entry.type !== 'hit-mask' || entry.status !== 'filled') throw new Error(`cart-art: ${entityId} hit-mask ${maskKey} 未在本地索引登记`);
    const mask = parseHitMaskSpec(entry.spec);
    const sprite = (components as { Sprite?: { textureKey?: unknown } }).Sprite;
    if (!mask || sprite?.textureKey !== mask.sourceTextureKey) throw new Error(`cart-art: ${entityId} hit-mask ${maskKey} 与 Sprite.textureKey 错绑`);
  }
  return index;
}

/** The parser warns for legacy callers; an asset-backed cartridge must never present an inert mask as playable. */
export function assertCartMasksBound(blueprint: WorldBlueprint): void {
  for (const [entityId, components] of Object.entries(blueprint.entities)) {
    const clickable = (components as { Clickable?: { hitMaskKey?: unknown; hitMask?: unknown } }).Clickable;
    if (clickable?.hitMaskKey !== undefined && !parseHitMaskSpec(clickable.hitMask)) {
      throw new Error(`cart-art: ${entityId} hit-mask ${String(clickable.hitMaskKey)} 未绑定；拒绝矩形回退`);
    }
  }
}

export function cartSkinMap(index: AssetIndex): Readonly<Record<string, string>> {
  const map: Record<string, string> = Object.create(null);
  const inline = (globalThis as { __APOLLO_INLINE_ASSETS__?: Record<string, string> }).__APOLLO_INLINE_ASSETS__;
  for (const entry of index.assets) {
    if (entry.type !== 'texture' || entry.status !== 'filled') continue;
    const src = filledSrc(index, entry.id);
    if (src) map[entry.id] = inline?.[src] ?? src;
  }
  return map;
}

export function resolveCartSkins(presentation: CartPresentation | undefined, index: AssetIndex | undefined): CartPresentation | undefined {
  if (!presentation) return undefined;
  const keys = cartSkinKeys(presentation);
  if (!keys.length) return presentation;
  if (!index) throw new Error('cart-art: asset: UI 皮肤缺本地资产索引');
  const skinMap = cartSkinMap(index);
  const clone = structuredClone(presentation);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    for (const [name, field] of Object.entries(value)) {
      if (SKIN_PROPS.has(name) && typeof field === 'string' && field.startsWith(SKIN_PREFIX)) {
        const key = field.slice(SKIN_PREFIX.length);
        const src = skinMap[key];
        if (!src) throw new Error(`cart-art: UI 皮肤 ${key} 没有可用本地图片`);
        (value as Record<string, unknown>)[name] = src;
      } else visit(field);
    }
  };
  visit(clone.ui);
  return clone;
}

export interface CartArtSession { readonly assets: AssetManager; dispose(): void }

/** Preload before starting the World: a missing/mismatched PNG is a loading error, not a phantom hotspot. */
export async function loadCartArt(index: AssetIndex | undefined, entities: Record<string, unknown>, presentation?: CartPresentation): Promise<CartArtSession | undefined> {
  if (!index) return undefined;
  const keys = new Set([...cartSpriteKeys(entities), ...cartSkinKeys(presentation)]);
  const manager = new AssetManager(new ImageAssetLoader());
  try {
    registerAssetIndex(manager, index);
    await Promise.all([...keys].map(async (key) => {
      const loaded = await manager.load(key);
      const entry = index.assets.find((asset) => asset.id === key);
      if (entry?.spec?.width !== undefined && loaded.width !== entry.spec.width
        || entry?.spec?.height !== undefined && loaded.height !== entry.spec.height) {
        throw new Error(`cart-art: ${key} PNG 尺寸 ${loaded.width}×${loaded.height} 与索引 ${String(entry?.spec?.width)}×${String(entry?.spec?.height)} 不符`);
      }
    }));
    return { assets: manager, dispose: () => manager.clear() };
  } catch (error) {
    manager.clear();
    throw error;
  }
}
