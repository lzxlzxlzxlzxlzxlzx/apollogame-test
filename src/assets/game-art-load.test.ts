// game-art-load 契约测试（REQ-SHELL ②）：两形态装载 · 失败静默回退 · 真图信号筛选。
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  gameArtIndexUrl, loadGameArtInto, loadGameArtOverrides, pickArtOverrides, createArtAssets,
} from './game-art-load.js';
import { AssetManager, StubAssetLoader } from './asset-manager.js';
import type { AssetDescriptor } from './asset-types.js';

const INDEX = {
  version: 1,
  assets: [
    { id: 'sample-game/tower-pulse', type: 'texture', description: '塔皮', status: 'filled', path: '/games/sample-game/art/textures/tower.png', source: 'gen:qwen', spec: { usage: 'sprite' } },
    { id: 'sample-game/creep', type: 'texture', description: '兵皮', status: 'filled', path: '/games/sample-game/art/textures/creep.png', tags: ['skin'], spec: { usage: 'sprite' } },
    { id: 'sample-game/vendored-bg', type: 'texture', description: '货架背景', status: 'filled', path: '/games/sample-game/art/textures/bg.png', source: 'vendored:kenney', spec: { usage: 'sprite' } },
    { id: 'sample-game/pending', type: 'texture', description: '未生成', status: 'tbf', source: 'gen:qwen' },
    { id: 'shelf/plank', type: 'texture', description: '原生货架（无 skinKey 前缀）', status: 'filled', path: '/games/sample-game/art/textures/plank.png', source: 'gen:qwen', spec: { usage: 'sprite' } },
    { id: 'sample-game/procedural', type: 'texture', description: '程序占位（无正向信号）', status: 'filled', path: '/games/sample-game/art/textures/proc.png', source: '手动', spec: { usage: 'sprite' } },
  ],
};

function stubFetch(impl: (url: string, init?: RequestInit) => unknown): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => impl(url, init)));
}
const okJson = (body: unknown) => ({ ok: true, json: async () => body });

describe('game-art-load（游戏本地美术索引装载·REQ-SHELL ②）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('索引 URL 单一真相：/games/<slug>/art/index.json', () => {
    expect(gameArtIndexUrl('game-103')).toBe('/games/game-103/art/index.json');
  });

  it('形态①：拉到索引 → 注册进 AssetManager 并 loadAll（按 key 可解析·src=索引 path 全路径）', async () => {
    stubFetch(() => okJson(INDEX));
    const mgr = new AssetManager(new StubAssetLoader());
    expect(await loadGameArtInto(mgr, 'sample-game')).toBe(true);
    // 加强（测试加固 2026-08-24）：toBeDefined → 断注册进去的 descriptor.src 是索引里的全路径
    //（照本文件形态②同口径）——只断 defined 抓不到「注了 key 但 src 指错图」。
    expect(mgr.get('sample-game/tower-pulse')?.descriptor.src).toBe('/games/sample-game/art/textures/tower.png');
    expect(mgr.get('sample-game/pending')).toBeUndefined(); // tbf 无 path → 不注册
  });

  it('形态①：默认 cache=no-store（工坊换图刷新即见）', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    stubFetch((url, init) => { calls.push([url, init]); return okJson(INDEX); });
    await loadGameArtInto(new AssetManager(new StubAssetLoader()), 'sample-game');
    expect(calls[0][0]).toBe('/games/sample-game/art/index.json');
    expect(calls[0][1]).toEqual({ cache: 'no-store' });
  });

  it('形态①：onlyKeys 只加载指定 key，去重且保持请求顺序；其余资产仍已登记', async () => {
    stubFetch(() => okJson(INDEX));
    const loaded: string[] = [];
    const mgr = new AssetManager({ async load(descriptor: AssetDescriptor) {
      loaded.push(descriptor.key);
      return { handle: {}, width: 1, height: 1 };
    } });
    expect(await loadGameArtInto(mgr, 'sample-game', {
      onlyKeys: ['sample-game/creep', 'sample-game/tower-pulse', 'sample-game/creep'],
    })).toBe(true);
    expect(loaded).toEqual(['sample-game/creep', 'sample-game/tower-pulse']);
    expect(mgr.has('sample-game/vendored-bg')).toBe(true);
    expect(mgr.get('sample-game/vendored-bg')).toBeUndefined();
  });

  it('形态①：未知 onlyKey 或单项加载失败返回 false，不暗加载其他条目', async () => {
    stubFetch(() => okJson(INDEX));
    const loaded: string[] = [];
    const mgr = new AssetManager({ async load(descriptor: AssetDescriptor) {
      loaded.push(descriptor.key);
      if (descriptor.key === 'sample-game/creep') throw new Error('failed');
      return { handle: {}, width: 1, height: 1 };
    } });
    expect(await loadGameArtInto(mgr, 'sample-game', { onlyKeys: ['sample-game/missing'] })).toBe(false);
    expect(loaded).toEqual([]);
    expect(await loadGameArtInto(mgr, 'sample-game', { onlyKeys: ['sample-game/creep'] })).toBe(false);
    expect(loaded).toEqual(['sample-game/creep']);
  });

  it('形态②：只收真图替换条目（skinKey 前缀 + gen:/vendored/tags:skin 正向信号）', async () => {
    stubFetch(() => okJson(INDEX));
    expect(await loadGameArtOverrides('sample-game')).toEqual({
      'sample-game/tower-pulse': '/games/sample-game/art/textures/tower.png',
      'sample-game/creep': '/games/sample-game/art/textures/creep.png',
      'sample-game/vendored-bg': '/games/sample-game/art/textures/bg.png',
    });
  });

  it('形态②纯函数：原生货架（无 slug 前缀）/ 程序占位（无信号）/ 无 path 一律不进 = 观感零变', () => {
    const out = pickArtOverrides(INDEX, 'sample-game');
    expect(out['shelf/plank']).toBeUndefined();
    expect(out['sample-game/procedural']).toBeUndefined();
    expect(out['sample-game/pending']).toBeUndefined();
  });

  it('失败静默回退：非 200 / 坏 JSON / schema 不合法 / 无 fetch —— 一律不抛', async () => {
    stubFetch(() => ({ ok: false, json: async () => ({}) }));
    expect(await loadGameArtOverrides('sample-game')).toEqual({});
    expect(await loadGameArtInto(new AssetManager(new StubAssetLoader()), 'sample-game')).toBe(false);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(loadGameArtOverrides('sample-game')).resolves.toEqual({});
    await expect(loadGameArtInto(new AssetManager(new StubAssetLoader()), 'sample-game')).resolves.toBe(false);

    stubFetch(() => okJson({ 不是: '合法索引' })); // parseAssetIndex 会抛 → 必须被吞掉
    await expect(loadGameArtInto(new AssetManager(new StubAssetLoader()), 'sample-game')).resolves.toBe(false);
    expect(pickArtOverrides({ 不是: '合法索引' }, 'sample-game')).toEqual({});
    expect(pickArtOverrides(null, 'sample-game')).toEqual({});

    vi.stubGlobal('fetch', undefined); // headless（node 测试/服务端）
    await expect(loadGameArtOverrides('sample-game')).resolves.toEqual({});
    await expect(loadGameArtInto(new AssetManager(new StubAssetLoader()), 'sample-game')).resolves.toBe(false);
  });

  it('createArtAssets：建出空管理器（未装载时按 key 解析不到 → 渲染器回退程序化）', () => {
    expect(createArtAssets().get('sample-game/tower-pulse')).toBeUndefined();
  });
});
