import {
  normalizeDiceInput,
  type DiceBackdrop,
  type DiceRollInput,
  type DiceSides,
} from '@engine/host/dice-overlay.js';

export const DEFAULT_DICE_PREVIEW: DiceRollInput = {
  dice: [{ sides: 20 }],
  modifier: 1,
  modifierSource: '智力',
  title: '智力检定',
  difficulty: 10,
  backdrop: 'arcane-vault',
};

const SIDE_VALUES = new Set<number>([4, 6, 8, 20]);

function integer(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function diceFromParam(value: string | null): { sides: DiceSides }[] | undefined {
  if (!value) return undefined;
  const sides = value.split(',').map((entry) => Number(entry.trim().replace(/^d/i, '')));
  if (sides.length < 1 || sides.length > 3 || sides.some((side) => !SIDE_VALUES.has(side))) return undefined;
  return sides.map((side) => ({ sides: side as DiceSides }));
}

/** 本地 5173 预览的 URL 数据入口；非法参数整组回退到稳定示例。 */
export function dicePreviewInput(search: string): DiceRollInput {
  const params = new URLSearchParams(search);
  const candidate = {
    dice: diceFromParam(params.get('dice')) ?? DEFAULT_DICE_PREVIEW.dice,
    modifier: integer(params.get('modifier')) ?? DEFAULT_DICE_PREVIEW.modifier,
    modifierSource: params.get('source') ?? DEFAULT_DICE_PREVIEW.modifierSource,
    title: params.get('title') ?? DEFAULT_DICE_PREVIEW.title,
    difficulty: integer(params.get('difficulty')) ?? DEFAULT_DICE_PREVIEW.difficulty,
    backdrop: (params.get('backdrop') ?? DEFAULT_DICE_PREVIEW.backdrop) as DiceBackdrop,
  };
  return normalizeDiceInput(candidate) ?? DEFAULT_DICE_PREVIEW;
}

/** 调试面板只产生闭集动作；这里是唯一的预览配置适配器，不写模拟世界。 */
export function applyDiceDebugAction(input: DiceRollInput, action: string, arg?: string): DiceRollInput {
  const next: Record<string, unknown> = { ...input, dice: [...input.dice] };
  if (action === 'dice.debug.count') {
    const count = Math.min(3, Math.max(1, Number(arg) || 1));
    const dice = [...input.dice];
    while (dice.length < count) dice.push({ sides: dice.at(-1)?.sides ?? 20 });
    next.dice = dice.slice(0, count);
    next.judgement = undefined;
  } else if (action.startsWith('dice.debug.die.')) {
    const index = Number(action.slice('dice.debug.die.'.length));
    const sides = Number(arg);
    if (!Number.isInteger(index) || index < 0 || index >= input.dice.length || !SIDE_VALUES.has(sides)) return input;
    const dice = [...input.dice]; dice[index] = { sides: sides as DiceSides }; next.dice = dice; next.judgement = undefined;
  } else if (action === 'dice.debug.backdrop') next.backdrop = arg;
  else if (action === 'dice.debug.title') next.title = arg;
  else if (action === 'dice.debug.difficulty') next.difficulty = integer(arg ?? null);
  else if (action === 'dice.debug.modifier') next.modifier = integer(arg ?? null) ?? 0;
  else if (action === 'dice.debug.source') next.modifierSource = arg;
  else return input;
  return normalizeDiceInput(next) ?? input;
}

export function diceDebugEnabled(search: string): boolean {
  return new URLSearchParams(search).get('diceDebug') === '1';
}

/** 把面板状态写回地址栏，复制当前 URL 即可复现同一套视觉参数。 */
export function syncDiceDebugUrl(input: DiceRollInput): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('diceDebug', '1');
  url.searchParams.set('dice', input.dice.map((die) => `d${die.sides}`).join(','));
  url.searchParams.set('modifier', String(input.modifier ?? 0));
  url.searchParams.set('source', input.modifierSource ?? '');
  url.searchParams.set('title', input.title ?? '');
  url.searchParams.set('difficulty', String(input.difficulty ?? 0));
  url.searchParams.set('backdrop', input.backdrop ?? 'arcane-vault');
  window.history.replaceState(null, '', url);
}
