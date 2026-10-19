// package-web.mjs 纯函数单测（REQ-PKG）：内联注入 / 自包含体检 / 卡带读取。
// 不跑真 vite 构建（重·见 scripts/package-web-smoke.mjs 端到端）；只钉纯变换正确性。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { injectInline, scanSelfContainment, readCartManifest, readCartMeta, readCartArtBundle, resolveCartCapabilities, packageWeb } from './package-web.mjs';

const SHELL = '<!doctype html><html><head><title>ZeroCraft OS</title></head><body><script type="module">/*bundle*/console.log("run")</script></body></html>';

describe('injectInline · 注入内联卡带 globals', () => {
  it('把 __APOLLO_INLINE_CART__ 注进 <head>，且在 module bundle 之前执行', () => {
    const out = injectInline(SHELL, { cart: { capabilities: [], entities: {} }, meta: { title: 'X', subtitle: 'y' }, title: 'X' });
    expect(out).toContain('window.__APOLLO_INLINE_CART__=');
    expect(out).toContain('window.__APOLLO_INLINE_META__=');
    // 注入脚本必须在 </head> 之前（=在 body 里的 module bundle 之前执行·经典脚本先于 deferred module）。
    expect(out.indexOf('__APOLLO_INLINE_CART__')).toBeLessThan(out.indexOf('</head>'));
    expect(out.indexOf('__APOLLO_INLINE_CART__')).toBeLessThan(out.indexOf('type="module"'));
  });

  it('覆盖 <title> 为游戏名', () => {
    const out = injectInline(SHELL, { cart: {}, title: '翻命扑克' });
    expect(out).toContain('<title>翻命扑克</title>');
    expect(out).not.toContain('<title>ZeroCraft OS</title>');
  });

  it('manifest 里的 "</script>" 被转义（不提前闭合内联 script）', () => {
    const out = injectInline(SHELL, { cart: { note: 'evil</script><script>alert(1)</script>' } });
    expect(out).toContain('\\u003c/script\\u003e');
    // 全文 </script> 仅剩 2 个真实闭合：注入的内联 script + 外壳原有的 module script。
    expect((out.match(/<\/script>/g) || []).length).toBe(2);
  });

  it('可选注入 __APOLLO_INLINE_ASSETS__（有资产才注）', () => {
    const withAssets = injectInline(SHELL, { cart: {}, assets: { 'assets/FreeArtLib/a.png': 'data:image/png;base64,AAAA' } });
    expect(withAssets).toContain('__APOLLO_INLINE_ASSETS__');
    const noAssets = injectInline(SHELL, { cart: {}, assets: {} });
    expect(noAssets).not.toContain('__APOLLO_INLINE_ASSETS__');
  });

  it('有本地索引时先于 bundle 注入索引与 slug，像素以同一 URL key 内联', () => {
    const out = injectInline(SHELL, { cart: {}, slug: 'demo-cart', artIndex: { version: 1, assets: [] }, assets: { '/games/demo-cart/art/a.png': 'data:image/png;base64,AAAA' } });
    expect(out).toContain('window.__APOLLO_INLINE_ART_INDEX__=');
    expect(out).toContain('window.__APOLLO_INLINE_SLUG__="demo-cart"');
    expect(out).toContain('"/games/demo-cart/art/a.png":"data:image/png;base64,AAAA"');
    expect(out.indexOf('__APOLLO_INLINE_ART_INDEX__')).toBeLessThan(out.indexOf('type="module"'));
  });

  it('外壳缺 </head> → 明确抛错', () => {
    expect(() => injectInline('<html><body>x</body></html>', { cart: {} })).toThrow(/head/i);
  });
});

describe('scanSelfContainment · 自包含体检', () => {
  it('内联 data: 与相对路径 → 零问题（自包含）', () => {
    const clean = injectInline(SHELL, { cart: { capabilities: [], entities: {} }, title: 'X' });
    expect(scanSelfContainment(clean)).toEqual([]);
  });

  it('外部 script/link/img/css url/@import → 逐类点名（有外链就非空）', () => {
    expect(scanSelfContainment('<script src="https://cdn.example.com/x.js"></script>')).toHaveLength(1);
    expect(scanSelfContainment('<link href="http://fonts.example.com/f.css" rel="stylesheet">')).toHaveLength(1);
    expect(scanSelfContainment('<img src="https://img.example.com/a.png">')).toHaveLength(1);
    expect(scanSelfContainment('<style>body{background:url(https://x/y.png)}</style>')).toHaveLength(1);
    // @import url("http…") 同时命中 @import 与 url() 两条规则（重复标记无害·仍判非自包含）。
    expect(scanSelfContainment('<style>@import url("https://x/z.css");</style>').length).toBeGreaterThanOrEqual(1);
  });

  it('xmlns 命名空间 URL 不误报（不发网络请求）', () => {
    expect(scanSelfContainment('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toEqual([]);
  });
});

describe('readCartManifest / readCartMeta · 卡带读取（临时 fixture）', () => {
  let root;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'pkgweb-'));
    const dir = join(root, 'library', 'demo-cart');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ capabilities: ['a1-transform'], entities: {} }));
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ name: '演示卡带', tagline: '一句话简介' }));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('读 library/<slug>/manifest.json', () => {
    expect(readCartManifest(root, 'demo-cart').capabilities).toEqual(['a1-transform']);
  });

  it('缺失 slug → 抛（点名路径）', () => {
    expect(() => readCartManifest(root, 'nope')).toThrow(/manifest\.json/);
  });

  it('读 meta.name/tagline 作 title/subtitle', () => {
    expect(readCartMeta(root, 'demo-cart')).toEqual({ title: '演示卡带', subtitle: '一句话简介' });
  });

  it('无 meta.json → 回退 slug', () => {
    expect(readCartMeta(root, 'unknown-slug').title).toBe('unknown-slug');
  });
});

describe('readCartArtBundle · local cartridge closure', () => {
  let root;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'cart-art-pkg-'));
    const art = join(root, 'library', 'demo-cart', 'art');
    mkdirSync(art, { recursive: true });
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(2, 16);
    png.writeUInt32BE(2, 20);
    writeFileSync(join(art, 'lock.png'), png);
    writeFileSync(join(art, 'index.json'), JSON.stringify({ version: 1, assets: [
      { id: 'demo-cart/lock', type: 'texture', status: 'filled', path: '/games/demo-cart/art/lock.png', spec: { width: 2, height: 2 } },
    ] }));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('embeds only referenced local texture, including UI skin refs', () => {
    const art = readCartArtBundle(root, 'demo-cart', { entities: {}, presentation: { ui: { props: { src: 'asset:demo-cart/lock' } } } });
    expect(art.index.assets).toHaveLength(1);
    expect(art.assets['/games/demo-cart/art/lock.png']).toMatch(/^data:image\/png;base64,/);
  });

  it('missing referenced texture and escaped path fail closed; old no-index cart stays valid', () => {
    expect(() => readCartArtBundle(root, 'demo-cart', { entities: { x: { Sprite: { textureKey: 'missing' } } } })).toThrow(/未在本地索引/);
    expect(readCartArtBundle(root, 'legacy-cart', { entities: { x: { Sprite: { textureKey: 'legacy-placeholder' } } } })).toEqual({ index: null, assets: {} });
    expect(() => readCartArtBundle(root, 'legacy-cart', { entities: { x: { Clickable: { hitMaskKey: 'mask' } } } })).toThrow(/缺少 art\/index.json/);
  });

  it('wrong PNG dimensions fail before packaging', () => {
    const indexFile = join(root, 'library', 'demo-cart', 'art', 'index.json');
    const original = readCartArtBundle(root, 'demo-cart', { entities: { x: { Sprite: { textureKey: 'demo-cart/lock' } } } }).index;
    try {
      writeFileSync(indexFile, JSON.stringify({ ...original, assets: [{ ...original.assets[0], spec: { width: 3, height: 2 } }] }));
      expect(() => readCartArtBundle(root, 'demo-cart', { entities: { x: { Sprite: { textureKey: 'demo-cart/lock' } } } })).toThrow(/PNG 尺寸/);
    } finally { writeFileSync(indexFile, JSON.stringify(original)); }
  });

  it('rejects a missing or wrong-source mask before an offline shell is written', () => {
    const indexFile = join(root, 'library', 'demo-cart', 'art', 'index.json');
    const original = readCartArtBundle(root, 'demo-cart', { entities: {} }).index;
    const cart = { entities: { lock: { Sprite: { textureKey: 'demo-cart/lock' }, Clickable: { hitMaskKey: 'demo-cart/mask/lock' } } } };
    expect(() => readCartArtBundle(root, 'demo-cart', cart)).toThrow(/hit-mask.*未登记/);
    try {
      writeFileSync(indexFile, JSON.stringify({ ...original, assets: [
        ...original.assets,
        { id: 'demo-cart/mask/lock', type: 'hit-mask', status: 'filled', spec: { sourceTextureKey: 'demo-cart/other' } },
      ] }));
      expect(() => readCartArtBundle(root, 'demo-cart', cart)).toThrow(/同源/);
      writeFileSync(indexFile, JSON.stringify({ ...original, assets: [
        ...original.assets,
        { id: 'demo-cart/mask/lock', type: 'hit-mask', status: 'filled', spec: { sourceTextureKey: 'demo-cart/lock' } },
      ] }));
      expect(Object.keys(readCartArtBundle(root, 'demo-cart', cart).assets)).toEqual(['/games/demo-cart/art/lock.png']);
    } finally { writeFileSync(indexFile, JSON.stringify(original)); }
  });
});

describe('packageWeb · native child-process gate', () => {
  it('runs the real manifest checker through Node and packages an injected shell', async () => {
    const root = process.cwd();
    const slug = 'game-clue-investigation';
    const cart = readCartManifest(root, slug);
    expect(resolveCartCapabilities(root, cart, slug)).toContain('a1-transform');
    const temp = mkdtempSync(join(tmpdir(), 'cart-art-shell-'));
    try {
      const out = join(temp, 'cart.html');
      await packageWeb(root, slug, out, { shellHtml: SHELL });
      expect(readFileSync(out, 'utf8')).toContain('__APOLLO_INLINE_CART__');
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }, 30_000);
});
