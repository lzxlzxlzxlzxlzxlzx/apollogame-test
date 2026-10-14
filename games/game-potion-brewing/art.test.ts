import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseAssetIndex } from '@zerocraft/engine/assets/asset-index.js';
import { ingredientArtKey, localResultBottleKey, POTION_ART } from './art.js';
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
