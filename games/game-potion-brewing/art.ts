import type { AssetManager } from '@zerocraft/engine/assets/asset-manager.js';
import type { PotionIngredient } from './recipe.js';

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

export function ingredientArtKey(ingredientId: string, hasHostImage = false): string {
  const localKey = POTION_ART.ingredients[ingredientId as keyof typeof POTION_ART.ingredients];
  if (localKey) return localKey;
  // 未知材料不能共用同一个宿主图 key，否则多个 URL 会互相覆盖。
  return hasHostImage ? `potion/host-ingredient/${ingredientId}` : 'potion/ingredient-placeholder';
}

/** 宿主图只进 render-only AssetManager；先装临时 key，成功后原子替换已加载的本地图。 */
export async function loadHostIngredientImages(
  manager: AssetManager,
  ingredients: readonly PotionIngredient[],
  isActive: () => boolean = () => true,
  timeoutMs = 5000,
): Promise<void> {
  await Promise.all(ingredients.map(async (ingredient) => {
    const src = ingredient.imageUrl;
    if (!src) return;
    const targetKey = ingredientArtKey(ingredient.ingredientId, true);
    const hasFallback = manager.isLoaded(targetKey);
    const incomingKey = hasFallback ? `${targetKey}/host-incoming` : targetKey;
    manager.register({ kind: 'texture', key: incomingKey, src });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        manager.load(incomingKey),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('图片加载超时')), timeoutMs); }),
      ]);
      if (!isActive()) return;
      if (hasFallback && !manager.adoptLoaded(incomingKey, targetKey)) {
        console.warn(`[game-potion-brewing] 宿主材料图换装失败：${ingredient.ingredientId}`);
      }
    } catch {
      // 本地已知材料保留已加载的包内图；未知材料保留 Shape 占位，不改规则。
      console.warn(`[game-potion-brewing] 宿主材料图不可用，使用回退：${ingredient.ingredientId}`);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (hasFallback || !manager.isLoaded(incomingKey) || !isActive()) manager.unregister(incomingKey);
    }
  }));
}

/** 当前获批瓶图只有青蓝月露版；其它配方等待宿主正式图片或各自获批的本地图。 */
export function localResultBottleKey(recipeId: string): string | undefined {
  return recipeId === 'moon-dew' ? POTION_ART.moonBottle : undefined;
}
