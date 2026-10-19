import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseAssetIndex } from './asset-index.js';
import { cartArtIndexUrl, fetchCartArtIndex, requireCartAssetIndex, cartSkinKeys, resolveCartSkins, loadCartArt, assertCartMasksBound } from './cart-art.js';
import type { CartPresentation } from '../assembly/cart-presentation.js';
import type { WorldBlueprint } from '../assembly/demo.assembly.js';
import { parseManifestDetailed } from '../assembly/manifest.js';

const slug = 'case-cart';
const texture = { id: 'case-cart/object/lock', type: 'texture', status: 'filled', description: 'lock',
  path: '/games/case-cart/art/lock.png', spec: { width: 2, height: 2, usage: 'sprite' } };
const mask = { id: 'case-cart/mask/lock', type: 'hit-mask', status: 'filled', description: 'lock silhouette',
  spec: { version: 1, width: 2, height: 2, threshold: 150, sourceTextureKey: texture.id, rows: ['10', '01'] } };
const rawIndex = { version: 1, assets: [texture, mask] };
const entities = { clue: { Sprite: { textureKey: texture.id }, Clickable: { action: 'inspect', hitMaskKey: mask.id } } };
const presentation = { viewport: { width: 1440, height: 900 }, theme: 'apolloOnyx',
  ui: { type: 'Panel', id: 'root', props: {}, children: [{ type: 'Image', id: 'evidence', props: { src: `asset:${texture.id}`, alt: 'evidence' } }] } } as CartPresentation;

afterEach(() => vi.unstubAllGlobals());

describe('cart-art · local index to render-only consumers', () => {
  it('old cartridges without index stay unchanged; masked or skinned carts explicitly reject missing index', () => {
    expect(requireCartAssetIndex({ entities: { a: { Sprite: { textureKey: 'old-placeholder' } } } }, slug, null)).toBeUndefined();
    expect(() => requireCartAssetIndex({ entities }, slug, null)).toThrow(/缺少.*index\.json/);
    expect(() => requireCartAssetIndex({ entities: {}, presentation }, slug, null)).toThrow(/缺少.*index\.json/);
    expect(cartArtIndexUrl(slug)).toBe('/games/case-cart/art/index.json');
  });

  it('skinMap resolves the same texture key for UI without mutating authored data', () => {
    const index = requireCartAssetIndex({ entities, presentation }, slug, rawIndex)!;
    expect(cartSkinKeys(presentation)).toEqual([texture.id]);
    const resolved = resolveCartSkins(presentation, index)!;
    expect((resolved.ui.children![0].props as { src: string }).src).toBe(texture.path);
    expect((presentation.ui.children![0].props as { src: string }).src).toBe(`asset:${texture.id}`);
    vi.stubGlobal('__APOLLO_INLINE_ASSETS__', { [texture.path]: 'data:image/png;base64,AAAA' });
    expect((resolveCartSkins(presentation, index)!.ui.children![0].props as { src: string }).src).toBe('data:image/png;base64,AAAA');
  });

  it('404, Vite HTML fallback and network failure preserve legacy carts; required consumers reject missing index', async () => {
    const response = (status: number, kind: string) => ({ status, ok: status === 200, headers: { get: () => kind }, json: async () => rawIndex });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(404, 'text/html')).mockResolvedValueOnce(response(200, 'text/html')).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(200, 'application/json')));
    expect(await fetchCartArtIndex(slug)).toBeNull();
    expect(await fetchCartArtIndex(slug)).toBeNull();
    expect(await fetchCartArtIndex(slug)).toBeNull();
    expect(await fetchCartArtIndex(slug)).toBe(rawIndex);
  });

  it('missing texture, wrong mask source, wrong dimensions, and path escape fail before play', () => {
    expect(() => requireCartAssetIndex({ entities }, slug, { version: 1, assets: [mask] })).toThrow(/sourceTextureKey/);
    const wrongMask = { ...mask, spec: { ...mask.spec, sourceTextureKey: 'case-cart/object/other' } };
    expect(() => requireCartAssetIndex({ entities }, slug, { version: 1, assets: [texture, { ...texture, id: 'case-cart/object/other' }, wrongMask] })).toThrow(/错绑/);
    expect(() => requireCartAssetIndex({ entities }, slug, { version: 1, assets: [{ ...texture, spec: { width: 3, height: 2 } }, mask] })).toThrow(/逻辑尺寸不符/);
    expect(() => requireCartAssetIndex({ entities }, slug, { version: 1, assets: [{ ...texture, path: '/games/other/art/lock.png' }, mask] })).toThrow(/路径必须/);
  });

  it('only a parser-bound binary mask is playable; no AABB fallback', () => {
    const bp = { entities: { clue: { Clickable: { hitMaskKey: mask.id } } } } as unknown as WorldBlueprint;
    expect(() => assertCartMasksBound(bp)).toThrow(/拒绝矩形回退/);
    (bp.entities.clue.Clickable as { hitMask?: unknown }).hitMask = mask.spec;
    expect(() => assertCartMasksBound(bp)).not.toThrow();
    const manifest = { capabilities: ['a1-transform', 'l1-sprite', 't2-clickable'], entities: {
      clue: { Transform: { x: 1, y: 1, rotation: 0, scaleX: 1, scaleY: 1 }, Sprite: { textureKey: texture.id, anchorX: 0.5, anchorY: 0.5, zOrder: 1, width: 4, height: 4, fit: 'contain' }, Clickable: { action: 'inspect', hitMaskKey: mask.id } },
    } };
    const index = requireCartAssetIndex(manifest, slug, rawIndex)!;
    const parsed = parseManifestDetailed(manifest, { assetIndex: index, assetKeys: new Set(index.assets.map((asset) => asset.id)) });
    expect(() => assertCartMasksBound(parsed.blueprint)).not.toThrow();
    expect((parsed.blueprint.entities.clue.Clickable as { hitMask: { rows: string[] } }).hitMask.rows).toEqual(['10', '01']);
  });

  it('preloads real image, checks decoded dimensions and releases session-owned handles', async () => {
    class GoodImage {
      naturalWidth = 2; naturalHeight = 2;
      onload: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', GoodImage);
    const index = parseAssetIndex(rawIndex);
    const session = await loadCartArt(index, entities, presentation);
    expect(session?.assets.resolve(texture.id)?.sw).toBe(2);
    session?.dispose();
    expect(session?.assets.resolve(texture.id)).toBeUndefined();
    class WrongImage extends GoodImage { naturalWidth = 3; }
    vi.stubGlobal('Image', WrongImage);
    await expect(loadCartArt(index, entities)).rejects.toThrow(/PNG 尺寸/);
  });
});
