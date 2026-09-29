import { apolloOnyx } from '@zerocraft/engine/ui/components/apollo-kit.js';
import type { DiceBackdrop, DiceRollInput } from '@engine/host/dice-overlay.js';
import type { LayoutNode, UITheme } from '@zerocraft/engine/ui/components/index.js';

// 外层 Screen 必须真透明，DokiWorld 的场景才能透出；只有画框内部承担可读性。
export const DICE_WINDOW_THEME: UITheme = { ...apolloOnyx, pageBg: 'transparent', texture: '', wash: '' };

export const DICE_MAIN_FRAME = '/games/game-dice/art/arcane-judgement-frame-v2.png';
export const DICE_ROYAL_VELVET_FRAME = '/games/game-dice/art/royal-velvet-judgement-frame-v1.png';
export const DICE_MOONLIT_RUINS_FRAME = '/games/game-dice/art/moonlit-ruins-judgement-frame-v1.png';
export const DICE_INFERNAL_FORGE_FRAME = '/games/game-dice/art/infernal-forge-judgement-frame-v1.png';
export const DICE_MODIFIER_FRAME = '/games/game-dice/art/arcane-modifier-card-v1.png';
export const DICE_ROYAL_VELVET_MODIFIER_FRAME = '/games/game-dice/art/royal-velvet-modifier-card-v1.png';
export const DICE_MOONLIT_RUINS_MODIFIER_FRAME = '/games/game-dice/art/moonlit-ruins-modifier-card-v1.png';
export const DICE_INFERNAL_FORGE_MODIFIER_FRAME = '/games/game-dice/art/infernal-forge-modifier-card-v1.png';

const WINDOW_SKIN: Readonly<Record<DiceBackdrop, string>> = {
  'arcane-vault': DICE_MAIN_FRAME,
  'royal-velvet': DICE_ROYAL_VELVET_FRAME,
  'moonlit-ruins': DICE_MOONLIT_RUINS_FRAME,
  'infernal-forge': DICE_INFERNAL_FORGE_FRAME,
};

const MODIFIER_SKIN: Readonly<Record<DiceBackdrop, string>> = {
  'arcane-vault': DICE_MODIFIER_FRAME,
  'royal-velvet': DICE_ROYAL_VELVET_MODIFIER_FRAME,
  'moonlit-ruins': DICE_MOONLIT_RUINS_MODIFIER_FRAME,
  'infernal-forge': DICE_INFERNAL_FORGE_MODIFIER_FRAME,
};

function signed(value: number): string { return value > 0 ? `+${value}` : String(value); }

function debugField(id: string, label: string, control: LayoutNode): LayoutNode {
  return {
    type: 'Panel', id, props: { bare: true }, layout: { direction: 'column', gap: 3 },
    children: [
      { type: 'Label', id: `${id}-label`, props: { text: label, size: 'xs', color: 'sub' } },
      control,
    ],
  };
}

function buildDebugPanel(input: DiceRollInput): LayoutNode {
  const sideOptions = [4, 6, 8, 20].map((sides) => ({ value: String(sides), label: `D${sides}` }));
  const backdropOptions = [
    { value: 'arcane-vault', label: '奥术画框' },
    { value: 'royal-velvet', label: '皇家绒幕' },
    { value: 'moonlit-ruins', label: '月夜遗迹' },
    { value: 'infernal-forge', label: '炼狱熔炉' },
  ];
  const children: LayoutNode[] = [
    { type: 'Label', id: 'dice-debug-title', props: { text: '骰子调试参数', size: 'lg', color: 'jade', bold: true } },
    { type: 'Label', id: 'dice-debug-note', props: { text: '修改后即时生效，并同步到当前 URL', size: 'xs', color: 'sub' } },
    debugField('dice-debug-count-field', '骰子数量', {
      type: 'Dropdown', id: 'dice-debug-count', props: {
        value: String(input.dice.length), action: 'dice.debug.count',
        options: [1, 2, 3].map((count) => ({ value: String(count), label: `${count} 颗` })),
      },
    }),
  ];
  input.dice.forEach((die, index) => children.push(debugField(`dice-debug-die-${index}-field`, `第 ${index + 1} 颗`, {
    type: 'Dropdown', id: `dice-debug-die-${index}`, props: { value: String(die.sides), options: sideOptions, action: `dice.debug.die.${index}` },
  })));
  children.push(
    debugField('dice-debug-backdrop-field', '画框背景', {
      type: 'Dropdown', id: 'dice-debug-backdrop', props: { value: input.backdrop ?? 'arcane-vault', options: backdropOptions, action: 'dice.debug.backdrop' },
    }),
    debugField('dice-debug-title-field', '检定标题', {
      type: 'Input', id: 'dice-debug-check-title', props: { value: input.title ?? '', action: 'dice.debug.title' },
    }),
    debugField('dice-debug-difficulty-field', '难度等级', {
      type: 'Input', id: 'dice-debug-difficulty', props: { type: 'number', value: String(input.difficulty ?? 0), action: 'dice.debug.difficulty' },
    }),
    debugField('dice-debug-modifier-field', '修正值', {
      type: 'Input', id: 'dice-debug-modifier', props: { type: 'number', value: String(input.modifier ?? 0), action: 'dice.debug.modifier' },
    }),
    debugField('dice-debug-source-field', '修正来源', {
      type: 'Input', id: 'dice-debug-source', props: { value: input.modifierSource ?? '', action: 'dice.debug.source' },
    }),
  );
  return {
    type: 'Panel', id: 'dice-debug-panel', props: { bg: 'ink-deep', edge: 'jade', glass: true },
    layout: { x: 680, y: 48, width: 238, direction: 'column', gap: 7, padding: 14, anim: 'flyIn', animFrom: 'right' },
    children,
  };
}

/** 悬浮判定窗的纯 LayoutNode 描述；标题、难度、骰子和修正卡严格分层。 */
export function buildDiceWindow(input?: DiceRollInput, options: Readonly<{ debug?: boolean }> = {}): LayoutNode {
  const modifier = input?.modifier ?? 0;
  const skin = input?.backdrop ?? 'arcane-vault';
  const hasCustomJudgement = (input?.judgement?.bands.length ?? 0) > 0;
  const showModifier = modifier !== 0 || !!input?.modifierSource;
  const frameProps = { skin: WINDOW_SKIN[skin] };
  const mainChildren: LayoutNode[] = [
    // 本次检定名属于 DokiWorld 上的浮层标题，不烤进画框，也不压在 Three Canvas 上。
    // 标题在透明宿主背景上也必须可读：放大并用闭集 stroke 加深色轮廓。
    { type: 'Label', id: 'dice-window-title', props: { text: input?.title ?? '掷骰检定', size: 38, color: 'text', font: 'ui', bold: true, stroke: true } },
    {
      type: 'Panel', id: 'dice-window-frame', props: frameProps,
      // DokiWorld 导出壳与引擎预览统一使用 border-box；430×645 即画框最终外尺寸。
      // 该比例与 1024×1536 画框原图一致，使点击文字落回 PNG 的金色槽位。
      layout: { width: 430, height: 645, direction: 'column', gap: 6, padding: 48, align: 'center', anim: 'pop', animMs: 420 },
      children: [
        { type: 'Panel', id: 'dice-window-top-spacer', props: { bare: true }, layout: { height: 38 } },
        // 自定义 band 没有通用难度语义；最终结果直接展示命中的 outcome，不能误导玩家看阈值。
        ...(hasCustomJudgement ? [] : [
          { type: 'Label' as const, id: 'dice-window-difficulty-label', props: { text: '难度等级', size: 'lg', color: 'sub', font: 'ui' as const } },
          { type: 'Label' as const, id: 'dice-window-difficulty', props: { text: input?.difficulty === undefined ? '—' : String(input.difficulty), size: 48, color: 'text', font: 'serif' as const, bold: true } },
        ]),
        // 独立流式槽位：物理骰子再高也只在 Canvas 内，不会钻到难度文字图层下。
        { type: 'Panel', id: 'dice-3d-stage', props: { bare: true }, layout: { width: 334, height: 250 } },
        {
          // 文字落在 PNG 自带的金边空槽中，不再叠第二层矩形框。
          type: 'Panel', id: 'dice-window-prompt-box', props: { bare: true },
          layout: { width: 238, direction: 'column', align: 'center', padding: 8 },
          children: [{ type: 'Label', id: 'dice-window-hint', props: { text: '点击骰子', size: 'lg', color: 'text', font: 'ui', bold: true } }],
        },
      ],
    },
  ];
  if (showModifier) mainChildren.push({
    type: 'Panel', id: 'dice-window-modifier-card', props: { skin: MODIFIER_SKIN[skin] },
    layout: { width: 120, height: 180, direction: 'column', gap: 7, padding: 30, align: 'center', justify: 'center', anim: 'flyIn', animFrom: 'bottom' },
    children: [
      { type: 'Label', id: 'dice-window-modifier-value', props: { text: signed(modifier), size: 34, color: 'text', font: 'serif', bold: true } },
      { type: 'Label', id: 'dice-window-modifier-source', props: { text: input?.modifierSource ?? '修正', size: 'md', color: 'sub', font: 'ui' } },
    ],
  });
  const main: LayoutNode = {
    type: 'Panel', id: 'dice-window-stack', props: { bare: true },
    layout: { direction: 'column', gap: 6, align: 'center' }, children: mainChildren,
  };
  return {
    type: 'Screen', id: 'dice-window-root', props: { center: true, bg: 'transparent', fill: true },
    layout: { direction: 'column', padding: 8 },
    children: [main, ...(options.debug && input ? [buildDebugPanel(input)] : [])],
  };
}
