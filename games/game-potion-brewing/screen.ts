import { apolloBrocade } from '@zerocraft/engine/ui/components/apollo-kit.js';
import type { LayoutNode, UITheme } from '@zerocraft/engine/ui/components/index.js';
import type { PotionRecipe, PotionStep } from './recipe.js';

// House theme 的字体/面板/按钮保留；透明宿主只关 Screen 会无条件叠加的 wash/texture 两层。
export const POTION_THEME: UITheme = Object.freeze({
  ...apolloBrocade, wash: undefined, texture: undefined,
  // 原型使用微软雅黑；艺术字字体的逐字回退导致“坩埚炼药”笔形不统一。
  fontUi: "'Microsoft YaHei','PingFang SC','Noto Sans SC',sans-serif",
  fontSerif: "Georgia,'Microsoft YaHei',serif",
});
export const POTION_SCENE_HOST = 'potion-scene-host';
export const POTION_RECIPE_HOST = 'potion-recipe-host';
export const POTION_RACK_HOST = 'potion-rack-host';
export const POTION_LIQUID_HOST = 'potion-liquid-host';
export const POTION_STATUS_HOST = 'potion-status-host';
export const POTION_RESULT_HOST = 'potion-result-host';
export const POTION_EXIT_HOST = 'potion-exit-host';
export const POTION_TITLE_HOST = 'potion-title-host';

// S1-P-06 的卷轴/木架指定色。颜色只属于 LayoutNode 外观，不进入配方或世界状态。
const PARCHMENT = { custom: '#f1d39a' } as const;
const PARCHMENT_STEP = { custom: '#f4dfb8' } as const;
const PARCHMENT_ACTIVE = { custom: '#fff0b8' } as const;
const INK_BROWN = { custom: '#382117' } as const;
const MUTED_BROWN = { custom: '#190d0a' } as const;
const CREAM = { custom: '#fff0c7' } as const;
const SCROLL_GRADIENT = { custom: 'linear-gradient(90deg,#9d754d 0%,#e3be83 4%,#f6dfae 13%,#efcf93 82%,#c99c62 97%,#7b573a 100%)' } as const;
const RACK_GRADIENT = { custom: 'linear-gradient(90deg,#2d2621,#5c4832 9%,#332a22 50%,#604832 91%,#241c1c 100%)' } as const;
const SLOT_GRADIENT = { custom: 'linear-gradient(180deg,#474837,#222b29)' } as const;
// 原型五种本地插画的纯展示副文；宿主传入的未知材料只显示宿主名称，不参与规则。
const MATERIAL_CAPTIONS: Readonly<Record<string, string>> = Object.freeze({
  'moon-herb': '冷露叶 · 清香',
  'silver-leaf': '银脉叶 · 微光',
  'red-berry': '朱果 · 甘烈',
  'pepper-seed': '暖色种荚',
  'dawn-petal': '日光瓣 · 柔香',
});

/** 原型的卷边与木架横档以闭集 Panel 叠层表达，纯装饰、没有输入或世界状态。 */
function scrollRoller(position: 'top' | 'bottom'): LayoutNode[] {
  const y = position === 'top' ? -8 : 706;
  return [
    { type: 'Panel', id: `potion-scroll-${position}-roller-shadow`, props: { bg: { custom: 'linear-gradient(180deg,#6d4228,#2d1c15 70%,#815538)' }, shadow: { y: 5, color: 'ink' } }, layout: { x: -9, y, width: 377, height: 27, padding: 0, radius: 14, allowOverlap: true } },
    { type: 'Panel', id: `potion-scroll-${position}-roller-wood`, props: { bg: { custom: 'linear-gradient(180deg,#f3d492 0%,#bd844b 25%,#8b5737 65%,#d49e61 100%)' } }, layout: { x: -6, y: y + 3, width: 371, height: 19, padding: 0, radius: 11, allowOverlap: true } },
    { type: 'Panel', id: `potion-scroll-${position}-roller-highlight`, props: { bg: { custom: 'linear-gradient(180deg,rgba(255,236,167,.9),rgba(255,224,156,0))' } }, layout: { x: -1, y: y + 6, width: 361, height: 5, padding: 0, radius: 3, allowOverlap: true } },
  ];
}

function rackCrossbar(index: 1 | 2): LayoutNode[] {
  const y = index === 1 ? 274 : 460;
  return [
    { type: 'Panel', id: `potion-rack-crossbar-${index}`, props: { bg: { custom: 'linear-gradient(180deg,#b28d59,#745333 45%,#3b291d 100%)' }, shadow: { y: 4, color: 'ink' } }, layout: { x: 13, y, width: 282, height: 14, padding: 0, radius: 3, allowOverlap: true } },
    { type: 'Panel', id: `potion-rack-crossbar-${index}-highlight`, props: { bg: { custom: 'linear-gradient(90deg,transparent,#d3ad6e 12%,#c49a63 86%,transparent)' } }, layout: { x: 13, y, width: 282, height: 4, padding: 0, radius: 2, allowOverlap: true } },
  ];
}

export interface PotionViewState {
  readonly status: 'active' | 'success' | 'failure';
  readonly stepIndex: number;
  readonly confirmedCount: number;
}

/** 三块宿主本身也是 LayoutNode；只挂一次，canvas 和可更新 UI 永不相互覆盖。 */
export function buildPotionShell(): LayoutNode {
  return {
    type: 'Screen', id: 'potion-root', props: { fill: true, bg: 'transparent' },
    layout: { width: 1440, height: 900, padding: 0 },
    children: [
      { type: 'Panel', id: POTION_RECIPE_HOST, props: { bare: true }, layout: { x: 48, y: 104, width: 362, height: 724 }, children: [] },
      { type: 'Panel', id: POTION_RACK_HOST, props: { bare: true }, layout: { x: 1092, y: 115, width: 308, height: 704 }, children: [] },
      // 水面略伸入锅沿贴图之下，避免透视变换的抗锯齿在后沿露出黑缝。
      { type: 'Panel', id: POTION_LIQUID_HOST, props: { bare: true }, layout: { x: 620, y: 292, width: 280, height: 280, allowOverlap: true }, children: [] },
      // 透明 canvas 覆在架面之上：世界材料命中接收真 pointer down/move/up，不借 DOM drag 绕过 G3/G4。
      { type: 'Panel', id: POTION_SCENE_HOST, props: { bare: true }, layout: { x: 0, y: 0, width: 1440, height: 900, allowOverlap: true }, children: [] },
      { type: 'Panel', id: POTION_TITLE_HOST, props: { bare: true }, layout: { x: 440, y: 24, width: 650, height: 110, allowOverlap: true }, children: [] },
      { type: 'Panel', id: POTION_STATUS_HOST, props: { bare: true }, layout: { x: 516, y: 730, width: 486, height: 78, allowOverlap: true }, children: [] },
      // 保留旧 UI 审计的空锚点；真实结算挂 mountHost 的完整舞台 overlay。
      { type: 'Panel', id: POTION_RESULT_HOST, props: { bare: true }, layout: { x: 0, y: 0, width: 1, height: 1, allowOverlap: true }, children: [] },
      { type: 'Panel', id: POTION_EXIT_HOST, props: { bare: true }, layout: { x: 0, y: 0, width: 1, height: 1, allowOverlap: true }, children: [] },
    ],
  };
}

export function buildTitleScreen(recipe: PotionRecipe, state: PotionViewState): LayoutNode {
  return { type: 'Panel', id: 'potion-title', props: { bare: true }, layout: { width: 650, height: 110, direction: 'column', gap: 4, align: 'center' }, children: [
    { type: 'Label', id: 'potion-title-eyebrow', props: { text: "THE ALCHEMIST'S TABLE", size: 'sm', color: { custom: '#e8b86b' }, bold: true, tracking: 3, font: 'serif' } },
    { type: 'Label', id: 'potion-title-main', props: { text: '坩 埚 炼 药', size: 36, color: CREAM, bold: true, font: 'serif' } },
    { type: 'Label', id: 'potion-title-stage', props: { text: state.status === 'active' ? `第 ${state.stepIndex + 1} / ${recipe.steps.length} 步 · ${recipe.name}` : recipe.name, size: 'sm', color: { custom: '#e8b86b' } } },
  ] };
}

function stepLabel(step: PotionStep, ingredients: ReadonlyMap<string, string>): string {
  if (step.kind === 'add') return `加入 ${ingredients.get(step.ingredientId) ?? step.ingredientId}`;
  return `${step.direction === 'clockwise' ? '顺时针' : '逆时针'}搅拌 ${step.turns} 圈`;
}

export function buildRecipeScreen(recipe: PotionRecipe, state: PotionViewState = { status: 'active', stepIndex: 0, confirmedCount: 0 }): LayoutNode {
  const names = new Map(recipe.ingredients.map((ingredient) => [ingredient.ingredientId, ingredient.name]));
  // 宿主可给五步以上；在固定卷轴内压缩行距，避免底部说明压住末步。
  const stepPitch = recipe.steps.length > 4 ? 78 : 93;
  const stepHeight = recipe.steps.length > 4 ? 70 : 83;
  return {
    type: 'Panel', id: 'potion-recipe-scroll', props: { bg: SCROLL_GRADIENT, border: { width: 2, color: { custom: '#5f3b27' } }, shadow: { y: 10, color: 'ink' } },
    layout: { width: 362, height: 724, padding: 0, radius: 24 },
    children: [
      { type: 'Label', id: 'potion-recipe-heading', props: { text: 'OPEN RECIPE · 公开配方', size: 'sm', color: MUTED_BROWN, bold: true, tracking: 2, font: 'serif' }, layout: { x: 29, y: 37 } },
      { type: 'Label', id: 'potion-recipe-name', props: { text: recipe.name, size: 29, color: INK_BROWN, bold: true, font: 'serif' }, layout: { x: 29, y: 68 } },
      { type: 'Label', id: 'potion-recipe-description', props: { text: '按卷轴的顺序投入材料，沿锅口完成指定搅拌。', size: 14, color: MUTED_BROWN }, layout: { x: 29, y: 117, width: 300, height: 42 } },
      { type: 'Label', id: 'potion-recipe-progress', props: { text: state.status === 'active' ? `BREWING STEPS · 第 ${state.stepIndex + 1} / ${recipe.steps.length} 步` : state.status === 'success' ? '炼制完成' : '炼制中止', size: 'sm', color: MUTED_BROWN, bold: true, font: 'serif' }, layout: { x: 29, y: 184 } },
      ...recipe.steps.map((step, index) => ({
        type: 'Panel' as const, id: `potion-step-${index + 1}`,
        props: { bg: index === state.stepIndex && state.status === 'active' ? PARCHMENT_ACTIVE : PARCHMENT_STEP, edge: index === state.stepIndex && state.status === 'active' ? 'gold' as const : undefined, shadow: index === state.stepIndex && state.status === 'active' ? { y: 3, color: 'gold' as const } : undefined },
        layout: { x: 29, y: 219 + index * stepPitch, width: 304, height: stepHeight, padding: 0, radius: 12, allowOverlap: true },
        children: [
          { type: 'Panel' as const, id: `potion-step-index-${index + 1}`, props: { bg: { custom: index < state.stepIndex ? '#3d745e' : '#6b4632' }, border: { width: 0, color: 'gold' as const } }, layout: { x: 12, y: 22, width: 36, height: 36, padding: 0, radius: 18, align: 'center' as const, justify: 'center' as const, allowOverlap: true }, children: [
            { type: 'Label' as const, id: `potion-step-number-${index + 1}`, props: { text: index < state.stepIndex ? '✓' : String(index + 1), size: 'md' as const, color: CREAM, bold: true } },
          ] },
          { type: 'Label' as const, id: `potion-step-label-${index + 1}`, props: { text: `${stepLabel(step, names)}${index === state.stepIndex && step.kind === 'stir' && state.confirmedCount ? ` (${state.confirmedCount}/${step.turns})` : ''}`, size: 'md' as const, color: INK_BROWN, bold: index === state.stepIndex }, layout: { x: 59, y: 16, width: 226 } },
          { type: 'Label' as const, id: `potion-step-note-${index + 1}`, props: { text: step.kind === 'add' ? '将材料投入锅中的液面' : '沿锅口拖动搅拌棒一整圈', size: 'sm' as const, color: MUTED_BROWN }, layout: { x: 59, y: 44, width: 226 } },
        ],
      })),
      { type: 'Panel', id: 'potion-scroll-foot-row', props: { bare: true }, layout: { x: 30, y: 662, width: 302, direction: 'row', justify: 'center' }, children: [
        { type: 'Label', id: 'potion-scroll-foot', props: { text: '遵循卷轴顺序 · 错误操作会使炼制失败', size: 'sm', color: MUTED_BROWN } },
      ] },
      ...scrollRoller('top'),
      ...scrollRoller('bottom'),
    ],
  };
}

export function buildRackScreen(recipe: PotionRecipe, selectedId?: string, hoveredId?: string): LayoutNode {
  return {
    type: 'Panel', id: 'potion-material-rack', props: { bg: RACK_GRADIENT, edge: 'gold', shadow: { y: 10, color: 'ink' }, vignette: true },
    layout: { width: 308, height: 704, padding: 22, radius: 24 },
    children: [
      { type: 'Panel', id: 'potion-rack-heading-row', props: { bare: true }, layout: { x: 22, y: 28, width: 264, direction: 'row', justify: 'center' }, children: [
        { type: 'Label', id: 'potion-rack-heading', props: { text: '✦ 材料架 ✦', size: 'xl', color: CREAM, bold: true } },
      ] },
      { type: 'Panel', id: 'potion-rack-usage-row', props: { bare: true }, layout: { x: 22, y: 68, width: 264, direction: 'row', justify: 'center' }, children: [
        { type: 'Label', id: 'potion-rack-usage', props: { text: '抓取材料投进锅中', size: 'sm', color: { custom: '#e5c58f' } } },
      ] },
      ...rackCrossbar(1),
      ...rackCrossbar(2),
      ...recipe.ingredients.map((ingredient, index) => ({
        type: 'Panel' as const, id: `potion-material-${ingredient.ingredientId}`,
        props: { bg: selectedId === ingredient.ingredientId ? { custom: '#3d4335' } as const : hoveredId === ingredient.ingredientId ? { custom: 'linear-gradient(180deg,#59604a,#303e38)' } as const : SLOT_GRADIENT,
          border: { width: selectedId === ingredient.ingredientId ? 3 : 2, color: { custom: selectedId === ingredient.ingredientId ? '#ffed9d' : hoveredId === ingredient.ingredientId ? '#eac477' : '#ab875b' } },
          shadow: { y: hoveredId === ingredient.ingredientId ? 9 : 5, color: 'ink' as const } },
        layout: { x: 22 + (index % 2) * 142, y: 104 + Math.floor(index / 2) * 186, width: 124, height: 164, padding: 8, radius: 15, direction: 'column' as const, justify: 'end' as const, align: 'center' as const, gap: 3, allowOverlap: true },
        children: [
          { type: 'Label' as const, id: `potion-material-name-${ingredient.ingredientId}`, props: { text: ingredient.name, size: 'md' as const, color: CREAM, bold: true } },
          ...(MATERIAL_CAPTIONS[ingredient.ingredientId] ? [{ type: 'Label' as const, id: `potion-material-caption-${ingredient.ingredientId}`, props: { text: MATERIAL_CAPTIONS[ingredient.ingredientId], size: 'sm' as const, color: { custom: '#e3d5aa' } } }] : []),
          ...(hoveredId === ingredient.ingredientId ? [{ type: 'Panel' as const, id: `potion-material-sheen-shell-${ingredient.ingredientId}`, props: { bare: true as const }, layout: { x: 0, y: 0, width: 124, height: 164, padding: 0, allowOverlap: true }, children: [
            { type: 'Panel' as const, id: `potion-material-sheen-${ingredient.ingredientId}`, props: { bare: true as const }, layout: { width: 124, height: 164, radius: 15, fx: [{ kind: 'sheen' as const }] } },
          ] }] : []),
        ],
      })),
    ],
  };
}

export function liquidColor(recipe: PotionRecipe, state: PotionViewState): string {
  if (state.status === 'failure') return '#615366';
  const previous = state.stepIndex > 0 ? recipe.steps[state.stepIndex - 1]?.liquidColor ?? '#a9dce7' : '#a9dce7';
  const current = recipe.steps[state.stepIndex];
  if (current?.kind !== 'stir' || state.confirmedCount <= 0) return previous;
  const percent = Math.min(100, Math.round(state.confirmedCount / current.turns * 100));
  return `color-mix(in srgb, ${previous} ${100 - percent}%, ${current.liquidColor} ${percent}%)`;
}

export function buildLiquidScreen(recipe: PotionRecipe, state: PotionViewState, reducedMotion = false, cue?: 'add' | 'stir' | 'failure', previousColor?: string, cueKey = 0, cuePhase: 'attack' | 'decay' = 'decay'): LayoutNode {
  const base = liquidColor(recipe, state);
  const agitated = state.stepIndex > 0 || state.status !== 'active' || cue !== undefined;
  const cueGlow = cue === 'failure'
    ? 'radial-gradient(ellipse at 50% 48%,#fff0ff 0%,#e5b8f2 25%,#b474ceaa 49%,transparent 76%)'
    : 'radial-gradient(ellipse at 50% 48%,#ffffff 0%,#eafffa 22%,#8ffff0bb 49%,transparent 76%)';
  const cueAnimation = cuePhase === 'attack' ? { anim: 'fadeIn' as const, animMs: 180 } : { anim: 'fadeOut' as const, animMs: 720 };
  const waterFill = (color: string): string => `radial-gradient(ellipse at 39% 21%,#ffffff3e,transparent 47%),radial-gradient(ellipse at 50% 85%,#14242b44,transparent 73%),${color}`;
  return { type: 'Panel', id: 'potion-liquid-layer', props: { bare: true }, layout: { width: 280, height: 280, allowOverlap: true }, children: [
    { type: 'ProgressBar', id: 'potion-liquid', props: {
      value: 1, max: 1, shape: 'liquid', fillColor: waterFill(base),
      wave: !reducedMotion && state.status === 'active' && agitated,
      bubbles: !reducedMotion && agitated ? state.status === 'failure' ? 6 : 8 : 0,
    }, layout: { width: 280, height: 280, radius: 140, rotateX: 60, perspective: 2000, allowOverlap: true } },
    ...(previousColor && previousColor !== base && !reducedMotion ? [{ type: 'ProgressBar' as const, id: 'potion-liquid-previous', props: { value: 1, max: 1, shape: 'liquid' as const, fillColor: waterFill(previousColor), wave: false, bubbles: 0 }, layout: { x: 0, y: 0, width: 280, height: 280, radius: 140, rotateX: 60, perspective: 2000, anim: 'fadeOut' as const, animMs: 750, allowOverlap: true } }] : []),
    ...(cue ? [
      { type: 'Panel' as const, id: `potion-liquid-glow-${cueKey}-${cuePhase}`, props: { bg: { custom: cueGlow } }, layout: { x: 30, y: 30, width: 220, height: 220, padding: 0, radius: 110, rotateX: 60, perspective: 2000, ...(reducedMotion ? { opacity: 0.55 } : cueAnimation), allowOverlap: true } },
      ...(!reducedMotion ? [
        { type: 'Panel' as const, id: `potion-liquid-cue-ring-outer-${cueKey}-${cuePhase}`, props: { bg: 'transparent' as const, border: { width: 3, color: { custom: cue === 'failure' ? '#f2d4fa' : '#f5ffde' } } }, layout: { x: 48, y: 47, width: 184, height: 184, padding: 0, radius: 92, rotateX: 60, perspective: 2000, ...cueAnimation, allowOverlap: true } },
        { type: 'Panel' as const, id: `potion-liquid-cue-ring-inner-${cueKey}-${cuePhase}`, props: { bg: 'transparent' as const, border: { width: 3, color: { custom: cue === 'failure' ? '#e9bcef' : '#ffffff' } } }, layout: { x: 78, y: 77, width: 124, height: 124, padding: 0, radius: 62, rotateX: 60, perspective: 2000, ...cueAnimation, allowOverlap: true } },
      ] : []),
    ] : []),
    ...(agitated ? [
      { type: 'Panel' as const, id: 'potion-liquid-vortex-outer', props: { bg: 'transparent' as const, border: { width: 2, color: { custom: state.status === 'failure' ? '#cab3d1' : '#e9f9f1' } } }, layout: { x: 48, y: 47, width: 184, height: 184, padding: 0, radius: 92, rotateX: 60, perspective: 2000, opacity: 0.23, allowOverlap: true } },
      { type: 'Panel' as const, id: 'potion-liquid-vortex-inner', props: { bg: 'transparent' as const, border: { width: 2, color: { custom: state.status === 'failure' ? '#bda5c5' : '#f4e6c8' } } }, layout: { x: 78, y: 77, width: 124, height: 124, padding: 0, radius: 62, rotateX: 60, perspective: 2000, opacity: 0.2, allowOverlap: true } },
    ] : []),
  ] };
}

export function buildStatusScreen(recipe: PotionRecipe, state: PotionViewState, _selectedId?: string): LayoutNode {
  const step = recipe.steps[state.stepIndex];
  const label = state.status === 'success' ? '炼制成功' : state.status === 'failure' ? '炼制失败' : step ? `第 ${state.stepIndex + 1} 步 · ${stepLabel(step, new Map(recipe.ingredients.map((i) => [i.ingredientId, i.name])))}` : '准备炼制';
  return { type: 'Panel', id: 'potion-current-status', props: { bg: { custom: 'linear-gradient(180deg,#3a2b25,#171b1f)' }, edge: state.status === 'failure' ? 'danger' : 'gold', shadow: { y: 4, color: 'ink' } }, layout: { width: 486, height: 78, padding: 10, radius: 18, direction: 'row', align: 'center', justify: 'center' }, children: [
    { type: 'Label', id: 'potion-current-label', props: { text: label, size: 23, bold: true, color: CREAM } },
  ] };
}

export function buildResultScreen(recipe: PotionRecipe, state: PotionViewState, bottleSrc?: string): LayoutNode {
  if (state.status === 'active') return { type: 'Panel', id: 'potion-result-empty', props: { bare: true }, children: [] };
  const success = state.status === 'success';
  return { type: 'Modal', id: 'potion-result', props: {
    title: success ? '药剂炼制成功' : '本次炼制失败', titleColor: INK_BROWN,
    size: 'lg', closable: false, visual: { minHeight: success ? 550 : 350, padding: 18, titleSize: 32, titleAlign: 'center', contentAlign: 'center' },
  }, children: [
    { type: 'Panel', id: 'potion-result-body', props: { bg: PARCHMENT, edge: 'gold', shadow: { y: 6, color: 'ink' } }, layout: { width: 560, height: success ? 440 : 245, direction: 'column', align: 'center', justify: 'center', gap: 12, padding: 18, radius: 18 }, children: [
      { type: 'Label', id: 'potion-result-symbol', props: { text: success ? '☾' : '☁', size: 34, color: success ? 'jade' : 'danger' } },
      ...(success ? [bottleSrc ? { type: 'Image' as const, id: 'potion-result-bottle', props: { src: bottleSrc, alt: `${recipe.name}药剂瓶`, fit: 'contain' as const }, layout: { width: 210, height: 230 } } :
        { type: 'Label' as const, id: 'potion-result-bottle-fallback', props: { text: '🧪', size: 112, color: 'jade' as const }, layout: { width: 210, height: 230, align: 'center' as const } }] : []),
      { type: 'Label', id: 'potion-result-name', props: { text: success ? `${recipe.name} 已按公开配方完成` : '药液已失去效力', size: 'lg', color: INK_BROWN, bold: true } },
    ] },
  ] };
}

export function buildExitScreen(open: boolean): LayoutNode {
  if (!open) return { type: 'Panel', id: 'potion-exit-empty', props: { bare: true }, children: [] };
  return { type: 'Modal', id: 'potion-exit-confirm', props: { title: '结束这次炼制？', size: 'md', closable: false, closeAction: 'brew.ui.continue' }, children: [
    { type: 'Panel', id: 'potion-exit-actions', props: { bare: true }, layout: { width: 360, direction: 'row', gap: 16, padding: 18 }, children: [
      { type: 'Button', id: 'potion-exit-continue', props: { label: '继续炼制', kind: 'ghost', labelColor: 'text', action: 'brew.ui.continue' }, layout: { width: 148, height: 52 } },
      { type: 'Button', id: 'potion-exit-confirm-button', props: { label: '确认退出', kind: 'hero', labelColor: { custom: '#211719' }, action: 'brew.ui.cancel' }, layout: { width: 148, height: 52 } },
    ] },
  ] };
}
