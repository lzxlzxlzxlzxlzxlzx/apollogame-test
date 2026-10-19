// @vitest-environment happy-dom
// 离线单文件卡带引导（REQ-PKG）：从 window.__APOLLO_INLINE_CART__ 读内联 manifest，
// 走既有 parseManifest+引擎 load 路径直接跑（跳过 fetch）——单文件包无服务器可 fetch。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readInlineCart, mount } from './cartridge-inline-run.js';
import { Engine } from './runtime/engine.js';
import { parseManifest } from './assembly/manifest.js';
import { QueuedInputSource } from './net/host/queued-input.js';
import { ImageAssetLoader } from './assets/image-loader.js';

afterEach(() => {
  delete (window as { __APOLLO_INLINE_CART__?: unknown }).__APOLLO_INLINE_CART__;
  delete window.__APOLLO_INLINE_ART_INDEX__;
  delete window.__APOLLO_INLINE_SLUG__;
  delete (globalThis as { __APOLLO_INLINE_ASSETS__?: unknown }).__APOLLO_INLINE_ASSETS__;
  vi.restoreAllMocks();
});

describe('readInlineCart · 读注入的内联卡带', () => {
  it('返回 window.__APOLLO_INLINE_CART__ 原对象', () => {
    const cart = { capabilities: [], entities: {} };
    expect(readInlineCart({ __APOLLO_INLINE_CART__: cart } as unknown as Window)).toBe(cart);
  });

  it('未注入 → 明确报错（不静默白屏）', () => {
    expect(() => readInlineCart({} as unknown as Window)).toThrow(/__APOLLO_INLINE_CART__/);
  });
});

describe('内联 manifest 空跑 2 tick（离线包核心契约）', () => {
  it('最小空 manifest：parseManifest → 引擎 load → 跑 2 tick 不抛（装载探针语义）', () => {
    const manifest = { capabilities: [], entities: {} };
    const bp = parseManifest(manifest);
    const engine = new Engine({ tickRate: 60 });
    engine.load(bp);
    expect(() => { engine.world.tick(); engine.world.tick(); }).not.toThrow();
  });

  it('mount(el)：注入空 manifest → 挂载即跑出 canvas，cleanup 卸载', async () => {
    (window as { __APOLLO_INLINE_CART__?: unknown }).__APOLLO_INLINE_CART__ = { capabilities: [], entities: {} };
    const el = document.createElement('div');
    document.body.appendChild(el);
    const cleanup = await mount(el);
    expect(el.querySelector('canvas')).toBeTruthy();
    cleanup();
    expect(el.querySelector('canvas')).toBeNull();
    el.remove();
  });

  it('mount(el)：坏 manifest（未知 capability）→ reject（供引导层转错误态·不白屏）', async () => {
    (window as { __APOLLO_INLINE_CART__?: unknown }).__APOLLO_INLINE_CART__ = { capabilities: ['zz-no-such'], entities: {} };
    const el = document.createElement('div');
    await expect(mount(el)).rejects.toThrow(/zz-no-such/);
  });

  it('mask 卡带没有内联索引时明确拒载，不退回矩形', async () => {
    window.__APOLLO_INLINE_CART__ = { entities: { clue: { Clickable: { action: 'inspect', hitMaskKey: 'mask' } } } };
    const el = document.createElement('div');
    await expect(mount(el)).rejects.toThrow(/缺少.*index\.json/);
  });

  it('内联索引让 UI asset: 皮肤解析到内联 data URI，卸载后资产清空', async () => {
    const key = 'demo-cart/lock';
    const path = '/games/demo-cart/art/lock.png';
    window.__APOLLO_INLINE_SLUG__ = 'demo-cart';
    window.__APOLLO_INLINE_ART_INDEX__ = { version: 1, assets: [{ id: key, type: 'texture', status: 'filled', description: 'lock', path, spec: { width: 2, height: 2 } }] };
    (globalThis as { __APOLLO_INLINE_ASSETS__?: unknown }).__APOLLO_INLINE_ASSETS__ = { [path]: 'data:image/png;base64,AAAA' };
    window.__APOLLO_INLINE_CART__ = { capabilities: [], entities: {}, presentation: {
      viewport: { width: 640, height: 400 }, theme: 'apolloOnyx',
      ui: { type: 'Panel', id: 'root', props: {}, children: [{ type: 'Image', id: 'photo', props: { src: `asset:${key}`, alt: 'photo' } }] },
    } };
    vi.spyOn(ImageAssetLoader.prototype, 'load').mockResolvedValue({ handle: { image: {} as CanvasImageSource }, width: 2, height: 2 });
    const el = document.createElement('div');
    document.body.appendChild(el);
    const cleanup = await mount(el);
    expect(el.querySelector<HTMLImageElement>('#photo')?.src).toBe('data:image/png;base64,AAAA');
    cleanup();
    expect(el.querySelector('#photo')).toBeNull();
    el.remove();
  });

  it('mount(el)：真能力 manifest（弹球 10 能力）经懒注册表 await import 装载 → 跑出 canvas', async () => {
    (window as { __APOLLO_INLINE_CART__?: unknown }).__APOLLO_INLINE_CART__ = {
      capabilities: ['a1-transform', 'b1-velocity', 'c1-shape', 'l2-color', 't1-motion-apply'],
      entities: { ball: { Transform: { x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 }, Velocity: { vx: 1, vy: 0, angular: 0 }, Shape: { kind: 'circle', radius: 3 }, Color: { tint: 1, alpha: 1 } } },
    };
    const el = document.createElement('div');
    document.body.appendChild(el);
    const cleanup = await mount(el);
    expect(el.querySelector('canvas')).toBeTruthy();
    cleanup();
    el.remove();
  });

  it('opt-in presentation：内联路径同画布挂 Canvas+LayoutNode，按钮只入 ActionSink 队列，清理无残留', async () => {
    (window as { __APOLLO_INLINE_CART__?: unknown }).__APOLLO_INLINE_CART__ = {
      capabilities: ['f1-resource', 't2-keybind'],
      entities: {
        score: { Resource: { id: 'score', current: 1, min: 0, max: 5 } },
        action: { KeyBinding: { key: 'inspect', signal: 'inspect', phase: 'action' } },
      },
      presentation: {
        viewport: { width: 1440, height: 900 }, theme: 'apolloOnyx',
        ui: { type: 'Panel', id: 'hud', props: {}, children: [
          { type: 'Label', id: 'score-label', props: { text: 'Score ', bind: 'score' } },
          { type: 'Button', id: 'inspect-button', props: { label: 'Inspect', action: 'inspect' } },
        ] },
      },
    };
    const enqueue = vi.spyOn(QueuedInputSource.prototype, 'enqueueAction');
    const el = document.createElement('div');
    el.style.cssText = 'position:relative;width:720px;height:450px';
    document.body.appendChild(el);
    const cleanup = await mount(el);
    expect(el.querySelector('canvas')).toBeTruthy();
    expect(el.querySelector('#score-label')?.textContent).toContain('Score 1');
    const button = el.querySelector<HTMLElement>('[data-action="inspect"]');
    expect(button?.style.pointerEvents).toBe('auto');
    button?.click();
    expect(enqueue).toHaveBeenCalledWith('inspect', expect.anything());
    expect(el.querySelector('canvas')?.style.width).toBe('1440px');
    cleanup();
    enqueue.mockRestore();
    expect(el.querySelector('canvas')).toBeNull();
    expect(el.querySelector('[data-action]')).toBeNull();
    el.remove();
  });
});
