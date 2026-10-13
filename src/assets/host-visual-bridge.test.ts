import { afterEach, describe, expect, it, vi } from 'vitest';
import { World } from '../engine/core/world.js';
import type { AssetDescriptor, AssetLoader } from './asset-types.js';
import { AssetManager } from './asset-manager.js';
import { HostPngAssetLoader, HostVisualSession, parseHostVisuals, projectHostVisual } from './host-visual-bridge.js';
import { clickableCapability } from '../skills/tier2/clickable.js';
import { resolveHostHitMask } from '../engine/protocol/host-hit-mask-catalog.js';
import type { Clickable, DebugTrace, InputQueue, KeyBinding, Shape, Signal, Sprite, Transform } from '../engine/protocol/components.js';
import { keybindCapability } from '../skills/tier2/keybind.js';

const visual = (id = 'object-a', changes: Record<string, unknown> = {}) => ({
  id, imageUrl: 'https://example.test/same.png', pixelWidth: 4, pixelHeight: 2,
  placement: { x: 0.5, y: 0.5, width: 0.5, height: 0.5, zIndex: 1, fit: 'contain', anchorX: 0.5, anchorY: 0.5, rotation: 0 },
  hitMask: { encoding: 'bitset-hex-msb', width: 4, height: 2, rows: ['9', '6'] },
  ...changes,
});

function manager(load: AssetLoader['load'] = async (d) => ({ handle: { image: d.key }, width: 4, height: 2 })) {
  const requested: string[] = [];
  const m = new AssetManager({ load: (d) => { requested.push(d.key); return load(d); } });
  return { m, requested };
}

function scene(result: Awaited<ReturnType<typeof HostVisualSession.prepare>>, i = 0): World {
  const w = new World();
  for (const system of clickableCapability.systems) w.addSystem(system);
  const v = result.visuals[i];
  w.createEntity(v.id);
  w.addComponent(v.id, { type: 'Transform', x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(v.id, { type: 'Shape', kind: 'box', width: 8, height: 8 } as Shape);
  w.addComponent(v.id, { type: 'Sprite', textureKey: v.textureKey, zOrder: v.renderOrder, anchorX: v.placement.anchorX, anchorY: v.placement.anchorY, width: 8, height: 8, fit: v.placement.fit } as Sprite);
  w.addComponent(v.id, { type: 'Clickable', action: 'inspect', hitMaskKey: v.hitMaskKey } as Clickable);
  w.createEntity('input');
  result.session.bindWorld(w);
  return w;
}
function click(w: World, x: number, y: number, source = 'mouse'): string | undefined {
  w.addComponent('input', { type: 'InputQueue', actions: [{ source, x, y, phase: 'down' }] } as InputQueue);
  w.tick();
  return w.getComponent<Signal>('object-a', 'Signal')?.name;
}

describe('host visual bridge — strict, session-bound, fail-closed', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('keeps duplicate URLs as distinct ordered keys; reverse completion does not reorder', async () => {
    const releases: Array<() => void> = [];
    const { m, requested } = manager((d) => new Promise((resolve) => {
      releases.push(() => resolve({ handle: d.key, width: 4, height: 2 }));
    }));
    const pending = HostVisualSession.prepare(m, 'run-1', [visual(), visual('object-b')]);
    await Promise.resolve();
    expect(requested).toEqual(['host-visual:run-1:object-a', 'host-visual:run-1:object-b']);
    releases[1](); releases[0]();
    const result = await pending;
    expect(result.visuals.map((v) => v.id)).toEqual(['object-a', 'object-b']);
    expect(result.visuals[0].renderOrder).toBeGreaterThan(result.visuals[1].renderOrder);
    const projection = projectHostVisual(result.visuals[0], 1440, 900, 'inspect');
    expect(projection.transform).toMatchObject({ x: 720, y: 450, rotation: 0 });
    expect(projection.sprite).toMatchObject({ textureKey: result.visuals[0].textureKey, width: 720, height: 450, zOrder: result.visuals[0].renderOrder });
    expect(JSON.stringify(projection)).not.toContain('https://');
    expect(result.visuals[0].textureKey).not.toBe(result.visuals[1].textureKey);
    result.session.dispose();
    expect(m.has(result.visuals[0].textureKey)).toBe(false);
  });

  it('opaque pixel rejects; solid mouse/touch accepts; contain gap and cover crop reuse Sprite plan', async () => {
    const { m } = manager();
    const result = await HostVisualSession.prepare(m, 'run-1', [visual()]);
    const w = scene(result);
    expect(resolveHostHitMask(w, result.visuals[0].hitMaskKey)?.rows).toEqual(['1001', '0110']);
    w.createEntity('trace'); w.addComponent('trace', { type: 'DebugTrace', events: [] } as DebugTrace);
    expect(click(w, 7, 19, 'mouse'), JSON.stringify(w.getComponent<DebugTrace>('trace', 'DebugTrace')?.events)).toBe('inspect'); // first solid bit
    expect(click(w, 11, 19, 'touch')).toBeUndefined(); // transparent second bit
    expect(click(w, 10, 17, 'touch')).toBeUndefined(); // contain letterbox
    expect(click(w, 7, 19, 'touch')).toBe('inspect');
    w.addComponent('object-a', { type: 'Sprite', textureKey: result.visuals[0].textureKey, zOrder: 1, anchorX: 0.5, anchorY: 0.5, width: 2, height: 2, fit: 'cover' } as Sprite);
    expect(click(w, 9.1, 20.1)).toBe('inspect');
    result.session.dispose();
    expect(click(w, 9.1, 20.1)).toBeUndefined();
  });

  it('anchor projection, z-order and same-z input order are stable; missing binding never falls back to box', async () => {
    const { m } = manager();
    const result = await HostVisualSession.prepare(m, 'run-1', [visual(), visual('object-b')]);
    const w = scene(result);
    w.createEntity('object-b');
    w.addComponent('object-b', { type: 'Transform', x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('object-b', { type: 'Shape', kind: 'box', width: 8, height: 8 } as Shape);
    w.addComponent('object-b', { type: 'Sprite', textureKey: result.visuals[1].textureKey, zOrder: result.visuals[1].renderOrder, anchorX: 0.5, anchorY: 0.5, width: 8, height: 8, fit: 'contain' } as Sprite);
    w.addComponent('object-b', { type: 'Clickable', action: 'inspect-b', hitMaskKey: result.visuals[1].hitMaskKey } as Clickable);
    expect(click(w, 7, 19)).toBe('inspect');
    expect(w.getComponent<Signal>('object-b', 'Signal')).toBeUndefined();
    w.addComponent('object-a', { type: 'Sprite', textureKey: result.visuals[0].textureKey, zOrder: result.visuals[0].renderOrder, anchorX: 0, anchorY: 0, width: 8, height: 8, fit: 'contain' } as Sprite);
    // Top-left anchor moves the solid bit from x=7,y=19 to x=10,y=22.
    w.addComponent('input', { type: 'InputQueue', actions: [{ source: 'mouse', x: 10.1, y: 22.1, phase: 'down' }] } as InputQueue);
    w.tick();
    expect(w.getComponent<Signal>('object-a', 'Signal')?.name).toBe('inspect');
    expect(w.getComponent<Signal>('object-b', 'Signal')).toBeUndefined();
    result.session.dispose();
    w.tick();
    expect(w.getComponent<Signal>('object-a', 'Signal')).toBeUndefined();
    expect(w.getComponent<Signal>('object-b', 'Signal')).toBeUndefined();
  });

  it('keyboard activation emits the same named Signal without pixel sampling', async () => {
    const { m } = manager();
    const result = await HostVisualSession.prepare(m, 'run-1', [visual()]);
    const w = scene(result);
    for (const system of keybindCapability.systems) w.addSystem(system);
    w.createEntity('keyboard');
    w.addComponent('keyboard', { type: 'KeyBinding', key: 'inspect-focused', signal: 'inspect' } as KeyBinding);
    w.addComponent('input', { type: 'InputQueue', actions: [{ source: 'keyboard', key: 'inspect-focused', phase: 'down' }] } as InputQueue);
    w.tick();
    expect(w.getComponent<Signal>('keyboard', 'Signal')?.name).toBe('inspect');
    result.session.dispose();
  });

  it('rejects mask absence/invalid bit padding, malformed URL, dimensions, duplicate ids and budgets before requests', () => {
    const invalid = [
      visual('object-a', { hitMask: undefined }),
      visual('object-a', { imageUrl: 'http://example.test/same.png' }),
      visual('object-a', { imageUrl: 'https://user:pass@example.test/a.png' }),
      visual('object-a', { imageUrl: 'data:image/png;base64,AA==' }),
      visual('object-a', { pixelWidth: 5 }),
      visual('object-a', { hitMask: { encoding: 'bitset-hex-msb', width: 3, height: 2, rows: ['91', '60'] } }),
      visual('object-a', { placement: { ...visual().placement, rotation: 1 } }),
      visual('object-a', { unexpected: true }),
    ];
    for (const bad of invalid) expect(() => parseHostVisuals([bad])).toThrow();
    expect(() => parseHostVisuals([visual(), visual()])).toThrow(/duplicate/);
    expect(() => parseHostVisuals(Array.from({ length: 65 }, (_, i) => visual(`v-${i}`)))).toThrow(/count/);
  });

  it('CORS/decode rejection and decoded-size mismatch leave no temporary registration', async () => {
    for (const load of [
      async (_d: AssetDescriptor): Promise<{handle: unknown; width: number; height: number}> => { throw new Error('CORS/decode failed'); },
      async (_d: AssetDescriptor) => ({ handle: {}, width: 5, height: 2 }),
    ]) {
      const { m } = manager(load);
      await expect(HostVisualSession.prepare(m, 'run-1', [visual()])).rejects.toThrow();
      expect(m.has('host-visual:run-1:object-a')).toBe(false);
    }
  });

  it('preview makes zero remote requests; World/snapshot have keys but no URL or bit rows', async () => {
    const { m, requested } = manager();
    const preview = await HostVisualSession.prepare(m, 'preview', [visual()], { preview: true });
    expect(preview.visuals).toEqual([]);
    expect(requested).toEqual([]);
    const result = await HostVisualSession.prepare(m, 'run-1', [visual()]);
    const w = scene(result);
    const snapshot = JSON.stringify(w.snapshot());
    expect(snapshot).toContain(result.visuals[0].hitMaskKey);
    expect(snapshot).not.toContain('https://');
    expect(snapshot).not.toContain('1001');
    expect(snapshot).not.toContain('0110');
    result.session.dispose();
    preview.session.dispose();
  });

  it('disposing a successful session removes its registered texture', async () => {
    let release!: () => void;
    const { m } = manager((d) => new Promise((resolve) => { release = () => resolve({ handle: d.key, width: 4, height: 2 }); }));
    const pending = HostVisualSession.prepare(m, 'run-1', [visual()]);
    await Promise.resolve();
    // The API only exposes a session on successful prepare; the failed load path must clean up.
    release();
    const result = await pending;
    result.session.dispose();
    expect(m.get(result.visuals[0].textureKey)).toBeUndefined();
  });

  it('unregister during inflight load cannot repopulate cache, and closes late bitmap', async () => {
    let release!: () => void;
    const close = vi.fn();
    const { m } = manager(() => new Promise((resolve) => { release = () => resolve({ handle: { image: { close } }, width: 4, height: 2 }); }));
    m.register({ kind: 'texture', key: 'temp', src: 'https://example.test/a.png' });
    const pending = m.load('temp');
    m.unregister('temp');
    release();
    await pending;
    expect(m.get('temp')).toBeUndefined();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('strict loader omits credentials, enforces CORS + PNG signature + decoded dimensions', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const fetcher = vi.fn(async () => ({
      ok: true, type: 'cors', url: 'https://example.test/a.png',
      headers: { get: (name: string) => name === 'content-type' ? 'image/png' : null },
      arrayBuffer: async () => png.buffer,
    }));
    const decoder = vi.fn(async () => ({ width: 4, height: 2, close: vi.fn() }));
    vi.stubGlobal('fetch', fetcher); vi.stubGlobal('createImageBitmap', decoder);
    const asset = await new HostPngAssetLoader().load({ kind: 'texture', key: 'a', src: 'https://example.test/a.png' });
    expect(asset).toMatchObject({ width: 4, height: 2 });
    expect(fetcher).toHaveBeenCalledWith('https://example.test/a.png', expect.objectContaining({ mode: 'cors', credentials: 'omit' }));
    expect(decoder).toHaveBeenCalledTimes(1);
    fetcher.mockImplementationOnce(async () => ({
      ok: true, type: 'cors', url: 'https://example.test/a.png',
      headers: { get: (name: string) => name === 'content-type' ? 'image/png' : null },
      arrayBuffer: async () => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).buffer,
    }));
    await expect(new HostPngAssetLoader().load({ kind: 'texture', key: 'a', src: 'https://example.test/a.png' })).rejects.toThrow(/signature/);
  });
});
