/** S2 宿主合同的游戏侧只读数据形状；严格 wire parser 属 S7 接入关。 */
export type PotionDirection = 'clockwise' | 'counterclockwise';

export interface PotionIngredient {
  readonly ingredientId: string;
  readonly name: string;
  readonly imageUrl?: string;
}

export type PotionStep =
  | { readonly kind: 'add'; readonly ingredientId: string; readonly liquidColor: string }
  | { readonly kind: 'stir'; readonly direction: PotionDirection; readonly turns: number; readonly liquidColor: string };

export interface PotionRecipe {
  readonly recipeId: string;
  readonly name: string;
  readonly resultImageUrl?: string;
  readonly ingredients: readonly PotionIngredient[];
  readonly steps: readonly PotionStep[];
}

export interface PotionRound {
  readonly brewingId: string;
  readonly recipe: PotionRecipe;
}

export const POTION_SIGNALS = {
  clockwise: 'brew.stir.clockwise',
  counterclockwise: 'brew.stir.counterclockwise',
  success: 'brew.success',
  failure: 'brew.failure',
} as const;

export function addSignal(ingredientId: string): string { return `brew.add.${ingredientId}`; }
