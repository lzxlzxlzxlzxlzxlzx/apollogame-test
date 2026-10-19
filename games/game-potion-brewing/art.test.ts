import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseAssetIndex } from '@zerocraft/engine/assets/asset-index.js';
import { AssetManager } from '@zerocraft/engine/assets/asset-manager.js';
import type { AssetDescriptor, AssetLoader } from '@zerocraft/engine/assets/asset-types.js';
import { ingredientArtKey, loadHostIngredientImages, localResultBottleKey, POTION_ART } from './art.js';
import { EMBER_ROUND, MOON_ROUND } from './fixtures.js';
import { buildPotionBlueprint } from './blueprint.js';

describe('S6 美术消费槽', () => {
  it('锅体仅引用正式资产 key，并保持 398px 定稿尺寸', () => {
    const blueprint = buildPotionBlueprint(MOON_ROUND);
    const cauldron = blueprint.entities.cauldron as { Sprite: { textureKey: string; width: number; height: number; sampling: string } };
    expect(cauldron.Sprite).toMatchObject({ textureKey: POTION_ART.cauldron, width: 398, height: 398, sampling: 'smooth' });
    const rod = blueprint.entities.rod as { Sprite: { textureKey: string; width: number; height: number; anchorX: number; anchorY: number } };
    expect(rod.Sprite).toMatchObject({ textureKey: POTION_ART.rod, width: 58, height: 205, anchorX: 0.5, anchorY: 1 });
    expect(blueprint.entities['pot-foot-left']).toBeUndefined();
    expect(blueprint.entities['pot-handle-left']).toBeUndefined();
  });

  it('月露瓶不能误作赤焰配方成品', () => {
    expect(localResultBottleKey(MOON_ROUND.recipe.recipeId)).toBe(POTION_ART.moonBottle);
    expect(localResultBottleKey(EMBER_ROUND.recipe.recipeId)).toBeUndefined();
  });

  it('原型五种材料都消费各自稳定 key，未知宿主材料安全降级', () => {
    const blueprint = buildPotionBlueprint(MOON_ROUND);
    for (const ingredient of MOON_ROUND.recipe.ingredients) {
      const entity = blueprint.entities[`ingredient:${ingredient.ingredientId}`] as { Sprite: { textureKey: string; width: number; height: number } };
      expect(entity.Sprite).toMatchObject({ textureKey: ingredientArtKey(ingredient.ingredientId), width: 80, height: 88 });
      expect(Object.values(POTION_ART.ingredients)).toContain(entity.Sprite.textureKey);
    }
    expect(ingredientArtKey('host-unknown-material')).toBe('potion/ingredient-placeholder');
    expect(ingredientArtKey('host-unknown-material', true)).toBe('potion/host-ingredient/host-unknown-material');
    expect(ingredientArtKey('another-material', true)).not.toBe(ingredientArtKey('host-unknown-material', true));
  });

  it('宿主图 URL 不入 World，同名原型材料仍只存稳定 key', () => {
    const round = {
      ...MOON_ROUND,
      recipe: { ...MOON_ROUND.recipe, ingredients: [
        { ingredientId: 'moon-herb', name: '月露草', imageUrl: 'https://example.test/moon.png' },
        { ingredientId: 'unknown-a', name: '甲', imageUrl: 'https://example.test/a.png' },
        { ingredientId: 'unknown-b', name: '乙', imageUrl: 'https://example.test/b.png' },
      ] },
    };
    const blueprint = buildPotionBlueprint(round);
    const keys = round.recipe.ingredients.map((item) => (blueprint.entities[`ingredient:${item.ingredientId}`] as { Sprite: { textureKey: string } }).Sprite.textureKey);
    expect(keys).toEqual([POTION_ART.ingredients['moon-herb'], 'potion/host-ingredient/unknown-a', 'potion/host-ingredient/unknown-b']);
    expect(JSON.stringify(blueprint)).not.toContain('https://example.test/');
  });

  it('宿主图加载成功后替换本地图；失败时本地图或未知材料占位保持', async () => {
    const calls: string[] = [];
    const loader: AssetLoader = { async load(descriptor: AssetDescriptor) {
      calls.push(descriptor.src);
      if (descriptor.src.includes('/broken')) throw new Error('unavailable');
      return { handle: { image: descriptor.src }, width: 64, height: 64 };
    } };
    const manager = new AssetManager(loader);
    manager.register({ kind: 'texture', key: POTION_ART.ingredients['moon-herb'], src: '/games/game-potion-brewing/art/moon.png' });
    manager.register({ kind: 'texture', key: POTION_ART.ingredients['silver-leaf'], src: '/games/game-potion-brewing/art/silver.png' });
    await manager.load(POTION_ART.ingredients['moon-herb']);
    await manager.load(POTION_ART.ingredients['silver-leaf']);
    const warn = console.warn;
    console.warn = () => {};
    try {
      await loadHostIngredientImages(manager, [
        { ingredientId: 'moon-herb', name: '月露草', imageUrl: 'https://example.test/moon.png' },
        { ingredientId: 'silver-leaf', name: '银叶', imageUrl: 'https://example.test/broken-silver.png' },
        { ingredientId: 'unknown-a', name: '甲', imageUrl: 'https://example.test/a.png' },
        { ingredientId: 'unknown-b', name: '乙', imageUrl: 'https://example.test/b.png' },
        { ingredientId: 'unknown-c', name: '丙', imageUrl: 'https://example.test/broken-c.png' },
      ]);
    } finally { console.warn = warn; }
    expect(manager.get(POTION_ART.ingredients['moon-herb'])?.descriptor.src).toBe('https://example.test/moon.png');
    expect(manager.get(POTION_ART.ingredients['silver-leaf'])?.descriptor.src).toBe('/games/game-potion-brewing/art/silver.png');
    expect(manager.has(`${POTION_ART.ingredients['moon-herb']}/host-incoming`)).toBe(false);
    expect(manager.get('potion/host-ingredient/unknown-a')?.descriptor.src).toBe('https://example.test/a.png');
    expect(manager.get('potion/host-ingredient/unknown-b')?.descriptor.src).toBe('https://example.test/b.png');
    expect(manager.resolve('potion/host-ingredient/unknown-a')?.asset.handle).toEqual({ image: 'https://example.test/a.png' });
    expect(manager.resolve('potion/host-ingredient/unknown-b')?.asset.handle).toEqual({ image: 'https://example.test/b.png' });
    expect(manager.has('potion/host-ingredient/unknown-c')).toBe(false);
    expect(calls).toContain('https://example.test/broken-silver.png');
  });

  it('已知材料在宿主图尚未加载时持续解析本地图，完成后才原子换图', async () => {
    let finishHost!: (value: { handle: unknown; width: number; height: number }) => void;
    const loader: AssetLoader = { load(descriptor) {
      if (descriptor.src.startsWith('https:')) return new Promise((resolve) => { finishHost = resolve; });
      return Promise.resolve({ handle: { image: descriptor.src }, width: 64, height: 64 });
    } };
    const manager = new AssetManager(loader);
    const key = POTION_ART.ingredients['moon-herb'];
    manager.register({ kind: 'texture', key, src: '/games/game-potion-brewing/art/moon.png' });
    await manager.load(key);
    const pending = loadHostIngredientImages(manager, [{ ingredientId: 'moon-herb', name: '月露草', imageUrl: 'https://example.test/moon.png' }]);
    expect(manager.resolve(key)?.asset.descriptor.src).toBe('/games/game-potion-brewing/art/moon.png');
    finishHost({ handle: { image: 'host' }, width: 80, height: 80 });
    await pending;
    expect(manager.resolve(key)?.asset.descriptor.src).toBe('https://example.test/moon.png');
  });

  it('页面卸载后即使宿主图才完成，也不会覆盖本地图', async () => {
    let finishHost!: (value: { handle: unknown; width: number; height: number }) => void;
    const loader: AssetLoader = { load(descriptor) {
      if (descriptor.src.startsWith('https:')) return new Promise((resolve) => { finishHost = resolve; });
      return Promise.resolve({ handle: { image: descriptor.src }, width: 64, height: 64 });
    } };
    const manager = new AssetManager(loader);
    const key = POTION_ART.ingredients['moon-herb'];
    manager.register({ kind: 'texture', key, src: '/local/moon.png' });
    await manager.load(key);
    let active = true;
    const pending = loadHostIngredientImages(manager, [{ ingredientId: 'moon-herb', name: '月露草', imageUrl: 'https://example.test/moon.png' }], () => active);
    active = false;
    finishHost({ handle: { image: 'late-host' }, width: 80, height: 80 });
    await pending;
    expect(manager.resolve(key)?.asset.descriptor.src).toBe('/local/moon.png');
    expect(manager.has(`${key}/host-incoming`)).toBe(false);
  });

  it('宿主图超时后才完成时仍保留本地图，并清理临时 key', async () => {
    vi.useFakeTimers();
    const warn = console.warn;
    console.warn = () => {};
    try {
      let finishHost!: (value: { handle: unknown; width: number; height: number }) => void;
      const loader: AssetLoader = { load(descriptor) {
        if (descriptor.src.startsWith('https:')) return new Promise((resolve) => { finishHost = resolve; });
        return Promise.resolve({ handle: { image: descriptor.src }, width: 64, height: 64 });
      } };
      const manager = new AssetManager(loader);
      const key = POTION_ART.ingredients['moon-herb'];
      manager.register({ kind: 'texture', key, src: '/local/moon.png' });
      await manager.load(key);
      const pending = loadHostIngredientImages(manager, [{ ingredientId: 'moon-herb', name: '月露草', imageUrl: 'https://example.test/moon.png' }], () => true, 10);
      await vi.advanceTimersByTimeAsync(10);
      await pending;
      expect(manager.resolve(key)?.asset.descriptor.src).toBe('/local/moon.png');
      expect(manager.has(`${key}/host-incoming`)).toBe(false);
      finishHost({ handle: { image: 'late-host' }, width: 80, height: 80 });
      await Promise.resolve();
      expect(manager.resolve(key)?.asset.descriptor.src).toBe('/local/moon.png');
      expect(manager.has(`${key}/host-incoming`)).toBe(false);
    } finally { console.warn = warn; vi.useRealTimers(); }
  });

  it('本地正式索引可解析且八张填充素材均有真实文件', () => {
    const index = parseAssetIndex(JSON.parse(readFileSync('public/games/game-potion-brewing/art/index.json', 'utf8')));
    expect(index.assets).toHaveLength(8);
    for (const entry of index.assets) {
      expect(entry.status).toBe('filled');
      expect(entry.spec).toMatchObject({ usage: 'sprite', colorSpace: 'srgb' });
      expect(existsSync(`public${entry.path}`)).toBe(true);
    }
  });
});
