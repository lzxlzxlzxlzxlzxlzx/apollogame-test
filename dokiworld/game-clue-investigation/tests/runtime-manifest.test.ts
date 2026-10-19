import { afterEach, describe, expect, it, vi } from 'vitest';
import baseManifest from '../../../library/game-clue-investigation/manifest.json';
import { parseManifestDetailedAsync } from '../../../src/assembly/manifest-async.js';
import { buildFormalManifest } from '../src/scene-data.js';
import { isLoopbackPngUrl, LoopbackPngAssetLoader } from '../src/loopback-png-loader.js';

const image = (name: string) => ({ imageUrl: `https://assets.example.test/${name}.png`, alt: name, pixelWidth: 100, pixelHeight: 100 });
const mask = { encoding: 'bitset-hex-msb' as const, width: 2, height: 2, rows: ['c', 'c'] };
const placement = { x: .1, y: .1, width: .1, height: .1, zIndex: 5, fit: 'contain' as const, anchorX: .5, anchorY: .5, rotation: 0 as const };

describe('formal runtime manifest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the local-image exception scoped to the DokiWorld loopback origin and same-loopback PNGs', () => {
    expect(isLoopbackPngUrl('http://127.0.0.1:4173/images/scene.png', 'http://127.0.0.1:5173')).toBe(true);
    expect(isLoopbackPngUrl('http://localhost:4173/images/scene.png', 'http://127.0.0.1:5173')).toBe(false);
    expect(isLoopbackPngUrl('http://127.0.0.2:4173/images/scene.png', 'http://127.0.0.1:5173')).toBe(false);
    expect(isLoopbackPngUrl('http://127.0.0.1:4173/images/scene.jpg', 'http://127.0.0.1:5173')).toBe(false);
    expect(isLoopbackPngUrl('http://127.0.0.1:4173/images/scene.png', 'https://127.0.0.1:5173')).toBe(false);
    const loader = new LoopbackPngAssetLoader('http://127.0.0.1:5173');
    expect(loader.hostVisualUrl('clue_1', 'http://127.0.0.1:4173/images/scene.png')).toMatch(/^https:\/\/loopback-host-visual\.invalid\/clue_1\.png$/);
    expect(loader.hostVisualUrl('clue_1', 'https://cdn.example.test/scene.png')).toBe('https://cdn.example.test/scene.png');
  });

  it('loads a mapped loopback PNG with CORS and rejects redirects away from loopback', async () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const response = (url: string) => {
      const result = new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
      Object.defineProperty(result, 'url', { value: url });
      return result;
    };
    const fetchMock = vi.fn(async () => response('http://127.0.0.1:4173/images/clue.png'));
    const bitmapMock = vi.fn(async () => ({ width: 2, height: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('createImageBitmap', bitmapMock);
    const loader = new LoopbackPngAssetLoader('http://127.0.0.1:5173');
    const alias = loader.hostVisualUrl('clue_1', 'http://127.0.0.1:4173/images/clue.png');
    const loaded = await loader.load({ kind: 'texture', key: 'host-visual:req:clue_1', src: alias });
    expect(loaded.width).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:4173/images/clue.png', expect.objectContaining({
      mode: 'cors', credentials: 'omit', redirect: 'follow',
    }));

    fetchMock.mockImplementationOnce(async () => response('http://assets.example.test/redirected.png'));
    await expect(loader.load({ kind: 'texture', key: 'other', src: 'http://127.0.0.1:4173/images/clue.png' }))
      .rejects.toThrow(/redirects must remain on 127\.0\.0\.1/);
  });

  it.each([1, 7, 12])('parses the generated %i-object investigation through engine registry and LayoutNode validation', async (count) => {
    const objects = Array.from({ length: count }, (_, index) => {
      const objectId = `item_${index}`;
      const isClue = index % 2 === 0;
      return { objectId, kind: isClue ? 'clue' as const : 'flavor' as const, required: index === 0,
        name: `Name ${index}`, description: `Description ${index}`, sceneImage: image(`${objectId}-scene`),
        ...(isClue ? { evidenceImage: image(`${objectId}-evidence`) } : {}), placement, hitMask: mask };
    });
    const data = { requestId: 'req_test', investigationId: 'case_test', title: 'Case', objective: 'Find required evidence', background: image('background'), objects };
    const prepared = objects.map((item, index) => ({ id: item.objectId, textureKey: `host-visual:req_test:${item.objectId}`,
      hitMaskKey: `host-hit-mask:req_test:${item.objectId}`, pixelWidth: 100, pixelHeight: 100, placement: item.placement, renderOrder: 20 + index }));
    const projected = prepared.map((visual) => ({ id: visual.id,
      transform: { type: 'Transform', x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
      sprite: { type: 'Sprite', textureKey: visual.textureKey, anchorX: .5, anchorY: .5, zOrder: visual.renderOrder, width: 144, height: 90, fit: 'contain' },
      clickable: { type: 'Clickable', action: `investigate.${visual.id}`, hitMaskKey: visual.hitMaskKey },
    }));
    const raw = buildFormalManifest(baseManifest, data, data.requestId, prepared, projected, `host-background:${data.requestId}`);
    const parsed = await parseManifestDetailedAsync(raw);
    expect(Object.keys(parsed.blueprint.entities).filter((id) => id.startsWith('object-item_'))).toHaveLength(count);
    expect(parsed.presentation?.focusTargets).toHaveLength(count);
    expect(parsed.blueprint.entities['object-item_0']?.Clickable?.hitMaskKey).toBe('host-hit-mask:req_test:item_0');
    expect(parsed.warnings.filter((warning) => /未绑定有效掩码/.test(warning))).toHaveLength(count);
  });
});
