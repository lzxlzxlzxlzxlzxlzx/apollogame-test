// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Draggable, Shape, Sprite, Transform } from '@engine/protocol/components.js';
import { hashSnapshot } from '@net/determinism.js';
import { DragPreviewLayer } from '../runtime/drag-preview.js';
import { CanvasRenderer } from './canvas-renderer.js';
import type { AssetManager } from '@assets/index.js';

describe('CanvasRenderer opt-in drag preview', () => {
  it('缺图时只画表现占位；默认关闭零回归，销毁清理预览且 World/hash 不变', () => {
    const context = new Proxy({ globalAlpha: 1, imageSmoothingEnabled: true } as Record<string, unknown>, {
      get: (target, key: string) => target[key] ?? (target[key] = vi.fn()),
      set: (target, key: string, value) => { target[key] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => context;
    const world = new World({ strict: true });
    world.createEntity('material');
    world.addComponent<Draggable>('material', { type: 'Draggable' });
    world.addComponent<Transform>('material', { type: 'Transform', x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 });
    world.addComponent<Shape>('material', { type: 'Shape', kind: 'box', width: 20, height: 12 });
    world.addComponent<Sprite>('material', { type: 'Sprite', textureKey: 'missing', anchorX: 0.5, anchorY: 0.5, zOrder: 1 });
    const before = JSON.stringify(world.snapshot()), hash = hashSnapshot(world.snapshot());
    const host = document.createElement('div');
    const legacy = new CanvasRenderer({ width: 100, height: 100, background: 'transparent' });
    legacy.init(host); legacy.sync(world);
    const legacyCount = (context.fillRect as ReturnType<typeof vi.fn>).mock.calls.length;
    legacy.destroy();
    (context.fillRect as ReturnType<typeof vi.fn>).mockClear();
    const preview = new DragPreviewLayer({ entityIds: ['material'] });
    preview.sample({ source: 'p', phase: 'down', pointerId: 1, x: 10, y: 20 }, world, 0);
    const renderer = new CanvasRenderer({ width: 100, height: 100, background: 'transparent', dragPreview: preview });
    renderer.init(host); renderer.sync(world);
    expect((context.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(legacyCount + 1);
    expect(JSON.stringify(world.snapshot())).toBe(before);
    expect(hashSnapshot(world.snapshot())).toBe(hash);
    renderer.destroy();
    expect(preview.frame(world, 300)).toBeNull();
    expect(host.children).toHaveLength(0);
  });

  it('贴图就绪时预览复用 Sprite frame drawImage，不产生第二张素材或额外 World 实体', () => {
    const context = new Proxy({ globalAlpha: 1, imageSmoothingEnabled: true } as Record<string, unknown>, {
      get: (target, key: string) => target[key] ?? (target[key] = vi.fn()),
      set: (target, key: string, value) => { target[key] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => context;
    const world = new World({ strict: true });
    world.createEntity('material');
    world.addComponent<Draggable>('material', { type: 'Draggable' });
    world.addComponent<Transform>('material', { type: 'Transform', x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 });
    world.addComponent<Shape>('material', { type: 'Shape', kind: 'box', width: 20, height: 12 });
    world.addComponent<Sprite>('material', { type: 'Sprite', textureKey: 'ingredient-art', anchorX: 0.5, anchorY: 0.5, zOrder: 1 });
    const image = {} as CanvasImageSource;
    const resolve = vi.fn(() => ({ asset: { handle: { image } }, sx: 0, sy: 0, sw: 20, sh: 12 }));
    const preview = new DragPreviewLayer({ entityIds: ['material'] });
    preview.sample({ source: 'p', phase: 'down', pointerId: 1, x: 10, y: 20 }, world, 0);
    const renderer = new CanvasRenderer({ width: 100, height: 100, background: 'transparent', dragPreview: preview, assets: { resolve } as unknown as AssetManager });
    renderer.init(document.createElement('div')); renderer.sync(world);
    expect((context.drawImage as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    expect(resolve.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(world.getAllEntities()).toEqual(['material']);
    renderer.destroy();
  });
});
