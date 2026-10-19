import { describe, expect, it } from 'vitest';
import { isPreviewInput, parsePotionInput, potionOutput } from './contract.js';

const data = {
  brewingId: 'brew-001',
  recipe: {
    recipeId: 'moon-dew', name: '月露安神剂',
    ingredients: [{ ingredientId: 'moon-herb', name: '月露草' }, { ingredientId: 'silver-leaf', name: '银叶' }],
    steps: [{ kind: 'add', ingredientId: 'moon-herb', liquidColor: '#69adb1' }, { kind: 'stir', direction: 'clockwise', turns: 2, liquidColor: '#398f93' }],
  },
};
const input = { contract: 'doki.game.potion-brewing-input', version: 1, data };

describe('炼药 DokiWorld 合同 v1', () => {
  it('文档示例可解析并输出固定结果闭集', () => {
    const round = parsePotionInput(input);
    expect(round.brewingId).toBe('brew-001');
    expect(potionOutput(round, 'success')).toEqual({ contract: 'doki.game.potion-brewing-result', version: 1, data: { brewingId: 'brew-001', recipeId: 'moon-dew', outcome: 'success' } });
    expect(potionOutput(round, 'failure').data.outcome).toBe('failure');
  });
  it('材料与结算图片 URL 原样接收，药剂名称只用 recipe.name，输出不回传展示字段', () => {
    const imageInput = { ...input, data: { ...data, recipe: {
      ...data.recipe,
      resultImageUrl: 'https://assets.example.invalid/moon-bottle.png',
      ingredients: [
        { ...data.recipe.ingredients[0], imageUrl: 'https://assets.example.invalid/moon-herb.png' },
        { ...data.recipe.ingredients[1], imageUrl: 'https://assets.example.invalid/silver-leaf.png' },
      ],
    } } };
    const round = parsePotionInput(imageInput);
    expect(round.recipe.name).toBe('月露安神剂');
    expect(round.recipe.resultImageUrl).toBe(imageInput.data.recipe.resultImageUrl);
    expect(round.recipe.ingredients.map((item) => item.imageUrl)).toEqual(imageInput.data.recipe.ingredients.map((item) => item.imageUrl));
    expect(Object.keys(round.recipe).sort()).toEqual(['ingredients', 'name', 'recipeId', 'resultImageUrl', 'steps']);
    expect(Object.keys(potionOutput(round, 'success').data).sort()).toEqual(['brewingId', 'outcome', 'recipeId']);
  });
  it('仅空 data 进入预览，且严格拒绝未知键、跨类字段、重复材料、越界和 URL 凭据', () => {
    expect(isPreviewInput({})).toBe(true);
    expect(isPreviewInput(data)).toBe(false);
    expect(() => parsePotionInput({ ...input, extra: true })).toThrow('未知字段');
    expect(() => parsePotionInput({ ...input, data: { ...data, recipe: { ...data.recipe, steps: [{ ...data.recipe.steps[0], turns: 2 }, data.recipe.steps[1]] } } })).toThrow('未知字段');
    expect(() => parsePotionInput({ ...input, data: { ...data, recipe: { ...data.recipe, ingredients: [data.recipe.ingredients[0], data.recipe.ingredients[0]] } } })).toThrow('重复');
    expect(() => parsePotionInput({ ...input, data: { ...data, recipe: { ...data.recipe, steps: [data.recipe.steps[0], { ...data.recipe.steps[1], turns: 4 }] } } })).toThrow('turns');
    expect(() => parsePotionInput({ ...input, data: { ...data, recipe: { ...data.recipe, resultImageUrl: 'https://user:password@example.com/bottle.png' } } })).toThrow('resultImageUrl');
    expect(() => parsePotionInput({ ...input, data: { ...data, recipe: { ...data.recipe, productName: '额外产物名' } } })).toThrow('未知字段');
  });
});
