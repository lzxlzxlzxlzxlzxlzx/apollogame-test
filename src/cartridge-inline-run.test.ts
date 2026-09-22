// @vitest-environment happy-dom
// 离线单文件卡带引导（REQ-PKG）：从 window.__APOLLO_INLINE_CART__ 读内联 manifest，
// 走既有 parseManifest+引擎 load 路径直接跑（跳过 fetch）——单文件包无服务器可 fetch。
import { describe, it, expect, afterEach } from 'vitest';
import { readInlineCart, mount } from './cartridge-inline-run.js';
import { Engine } from './runtime/engine.js';
import { parseManifest } from './assembly/manifest.js';

afterEach(() => {
  delete (window as { __APOLLO_INLINE_CART__?: unknown }).__APOLLO_INLINE_CART__;
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
});
