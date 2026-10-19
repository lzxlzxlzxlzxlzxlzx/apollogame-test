import type { PotionRound } from './recipe.js';

/** 本地装载/回归样例；正式宿主数据由 S7 严格 parser 注入，不用此样例代替宿主。 */
export const MOON_ROUND: PotionRound = {
  brewingId: 'brew-moon-preview',
  recipe: {
    recipeId: 'moon-dew', name: '月露安神剂',
    ingredients: [
      { ingredientId: 'moon-herb', name: '月露草' },
      { ingredientId: 'silver-leaf', name: '银叶' },
      { ingredientId: 'red-berry', name: '赤莓' },
      { ingredientId: 'pepper-seed', name: '火椒籽' },
      { ingredientId: 'dawn-petal', name: '晨光花瓣' },
    ],
    steps: [
      { kind: 'add', ingredientId: 'moon-herb', liquidColor: '#69adb1' },
      { kind: 'stir', direction: 'clockwise', turns: 2, liquidColor: '#398f93' },
      { kind: 'add', ingredientId: 'silver-leaf', liquidColor: '#478c9e' },
      { kind: 'stir', direction: 'counterclockwise', turns: 1, liquidColor: '#277f83' },
    ],
  },
};

export const EMBER_ROUND: PotionRound = {
  brewingId: 'brew-ember-preview',
  recipe: {
    recipeId: 'ember-tonic', name: '赤焰醒神剂',
    ingredients: [
      { ingredientId: 'moon-herb', name: '月露草' },
      { ingredientId: 'silver-leaf', name: '银叶' },
      { ingredientId: 'red-berry', name: '赤莓' },
      { ingredientId: 'pepper-seed', name: '火椒籽' },
      { ingredientId: 'dawn-petal', name: '晨光花瓣' },
    ],
    steps: [
      { kind: 'add', ingredientId: 'red-berry', liquidColor: '#b98382' },
      { kind: 'add', ingredientId: 'pepper-seed', liquidColor: '#b66c55' },
      { kind: 'stir', direction: 'counterclockwise', turns: 2, liquidColor: '#aa533c' },
      { kind: 'add', ingredientId: 'dawn-petal', liquidColor: '#b2683f' },
      { kind: 'stir', direction: 'clockwise', turns: 1, liquidColor: '#a34d36' },
    ],
  },
};

/** 同一材料 ID 出现两次，验证 G1 按步骤解释而非按材料去重。 */
export const REPEAT_ROUND: PotionRound = {
  brewingId: 'brew-repeat-acceptance',
  recipe: {
    recipeId: 'repeat-moon', name: '双份月露剂',
    ingredients: MOON_ROUND.recipe.ingredients,
    steps: [
      { kind: 'add', ingredientId: 'moon-herb', liquidColor: '#69adb1' },
      { kind: 'add', ingredientId: 'moon-herb', liquidColor: '#5ca3a8' },
      { kind: 'stir', direction: 'clockwise', turns: 2, liquidColor: '#398f93' },
      { kind: 'add', ingredientId: 'silver-leaf', liquidColor: '#478c9e' },
      { kind: 'stir', direction: 'counterclockwise', turns: 1, liquidColor: '#277f83' },
    ],
  },
};
