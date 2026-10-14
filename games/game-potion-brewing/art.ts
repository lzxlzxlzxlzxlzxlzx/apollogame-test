/** 与本地 AssetIndex 对账的稳定视觉槽。游戏只持 key，不拼接素材路径。 */
export const POTION_ART = {
  cauldron: 'potion/cauldron',
  rod: 'potion/stirring-rod',
  moonBottle: 'potion/result-bottle',
  ingredients: {
    'moon-herb': 'potion/ingredient/moon-herb',
    'silver-leaf': 'potion/ingredient/silver-leaf',
    'red-berry': 'potion/ingredient/red-berry',
    'pepper-seed': 'potion/ingredient/pepper-seed',
    'dawn-petal': 'potion/ingredient/dawn-petal',
  },
} as const;

export function ingredientArtKey(ingredientId: string): string {
  return POTION_ART.ingredients[ingredientId as keyof typeof POTION_ART.ingredients] ?? 'potion/ingredient-placeholder';
}

/** 当前获批瓶图只有青蓝月露版；其它配方等待宿主正式图片或各自获批的本地图。 */
export function localResultBottleKey(recipeId: string): string | undefined {
  return recipeId === 'moon-dew' ? POTION_ART.moonBottle : undefined;
}
