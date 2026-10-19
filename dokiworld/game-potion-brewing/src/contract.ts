import type { PotionIngredient, PotionRecipe, PotionRound, PotionStep } from '../../../games/game-potion-brewing/recipe.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const ENCODER = new TextEncoder();

function record(value: unknown, keys: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${path} 必须是普通对象`);
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) if (!keys.includes(key)) throw new Error(`${path}.${key} 是未知字段`);
  for (const key of required) if (!Object.hasOwn(object, key)) throw new Error(`${path}.${key} 缺失`);
  return object;
}

function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(`${path} 非法`);
  return value;
}

function name(value: unknown, max: number, path: string): string {
  if (typeof value !== 'string' || value !== value.normalize('NFC') || value.trim() !== value || [...value].length < 1 || [...value].length > max || /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(value)) throw new Error(`${path} 非法`);
  return value;
}

function url(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 2048) throw new Error(`${path} 非法`);
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${path} 非法`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || !parsed.hostname) throw new Error(`${path} 非法`);
  return value;
}

function step(value: unknown, ingredients: ReadonlySet<string>, path: string): PotionStep {
  const kind = record(value, ['kind', 'ingredientId', 'direction', 'turns', 'liquidColor'], ['kind', 'liquidColor'], path);
  if (typeof kind.liquidColor !== 'string' || !COLOR.test(kind.liquidColor)) throw new Error(`${path}.liquidColor 非法`);
  if (kind.kind === 'add') {
    record(value, ['kind', 'ingredientId', 'liquidColor'], ['kind', 'ingredientId', 'liquidColor'], path);
    const ingredientId = id(kind.ingredientId, `${path}.ingredientId`);
    if (!ingredients.has(ingredientId)) throw new Error(`${path}.ingredientId 未登记`);
    return { kind: 'add', ingredientId, liquidColor: kind.liquidColor };
  }
  if (kind.kind === 'stir') {
    record(value, ['kind', 'direction', 'turns', 'liquidColor'], ['kind', 'direction', 'turns', 'liquidColor'], path);
    if (kind.direction !== 'clockwise' && kind.direction !== 'counterclockwise') throw new Error(`${path}.direction 非法`);
    if (!Number.isSafeInteger(kind.turns) || (kind.turns as number) < 1 || (kind.turns as number) > 3) throw new Error(`${path}.turns 非法`);
    return { kind: 'stir', direction: kind.direction, turns: kind.turns as number, liquidColor: kind.liquidColor };
  }
  throw new Error(`${path}.kind 非法`);
}

export function isPreviewInput(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === 0;
}

export function parsePotionInput(input: unknown): PotionRound {
  if (ENCODER.encode(JSON.stringify(input)).length > 32 * 1024) throw new Error('输入超过 32 KiB');
  const envelope = record(input, ['contract', 'version', 'data'], ['contract', 'version', 'data'], 'input');
  if (envelope.contract !== 'doki.game.potion-brewing-input' || envelope.version !== 1) throw new Error('不支持的炼药合同');
  const data = record(envelope.data, ['brewingId', 'recipe'], ['brewingId', 'recipe'], 'data');
  const recipeData = record(data.recipe, ['recipeId', 'name', 'resultImageUrl', 'ingredients', 'steps'], ['recipeId', 'name', 'ingredients', 'steps'], 'recipe');
  if (!Array.isArray(recipeData.ingredients) || recipeData.ingredients.length < 2 || recipeData.ingredients.length > 5) throw new Error('ingredients 数量非法');
  const ingredients: PotionIngredient[] = recipeData.ingredients.map((raw, index) => {
    const item = record(raw, ['ingredientId', 'name', 'imageUrl'], ['ingredientId', 'name'], `ingredients[${index}]`);
    return { ingredientId: id(item.ingredientId, `ingredients[${index}].ingredientId`), name: name(item.name, 24, `ingredients[${index}].name`), ...(item.imageUrl === undefined ? {} : { imageUrl: url(item.imageUrl, `ingredients[${index}].imageUrl`) }) };
  });
  const ingredientIds = new Set(ingredients.map((item) => item.ingredientId));
  if (ingredientIds.size !== ingredients.length) throw new Error('ingredientId 重复');
  if (!Array.isArray(recipeData.steps) || recipeData.steps.length < 2 || recipeData.steps.length > 5) throw new Error('steps 数量非法');
  const steps = recipeData.steps.map((raw, index) => step(raw, ingredientIds, `steps[${index}]`));
  if (!steps.some((item) => item.kind === 'add') || !steps.some((item) => item.kind === 'stir')) throw new Error('配方必须同时有投料与搅拌');
  const recipe: PotionRecipe = { recipeId: id(recipeData.recipeId, 'recipe.recipeId'), name: name(recipeData.name, 40, 'recipe.name'), ingredients, steps, ...(recipeData.resultImageUrl === undefined ? {} : { resultImageUrl: url(recipeData.resultImageUrl, 'recipe.resultImageUrl') }) };
  return { brewingId: id(data.brewingId, 'data.brewingId'), recipe };
}

export function potionOutput(round: PotionRound, outcome: 'success' | 'failure') {
  return { contract: 'doki.game.potion-brewing-result', version: 1, data: { brewingId: round.brewingId, recipeId: round.recipe.recipeId, outcome } } as const;
}
