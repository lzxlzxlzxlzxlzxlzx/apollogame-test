import { apolloOnyx } from '@zerocraft/engine/ui/components/apollo-kit.js';
import type { LayoutNode, UITheme } from '@zerocraft/engine/ui/components/index.js';
import { THEFT_SKINS, theftSkinUrl, type TheftSkinMap } from './assets.js';
import type { TheftSlotView, TheftView } from './project.js';
import type { RiskRevealReceipt } from '@zerocraft/engine/engine/protocol/components.js';

const WHEEL_SIZE = 524;
const OUTER_SLOT_SIZE = 52;
const INNER_SLOT_SIZE = 62;

// 轮盘图不是严格正圆：两侧嵌槽比上下嵌槽更外扩。逐槽消费原图中心，避免规则圆分布造成侧边门漂向内侧。
// 校准量表：以内环下方(索引 2)为基准；其余位置按 2026-09-30 的逐槽视觉复核微调，禁回退成公式圆。
const SLOT_CENTERS: readonly { readonly x: number; readonly y: number; readonly size: number }[] = [
  { x: 262, y: 158, size: INNER_SLOT_SIZE }, { x: 366, y: 262, size: INNER_SLOT_SIZE },
  { x: 262, y: 360, size: INNER_SLOT_SIZE }, { x: 158, y: 262, size: INNER_SLOT_SIZE },
  { x: 262, y: 73, size: OUTER_SLOT_SIZE }, { x: 358, y: 100, size: OUTER_SLOT_SIZE },
  { x: 430, y: 167, size: OUTER_SLOT_SIZE }, { x: 455, y: 259, size: OUTER_SLOT_SIZE },
  { x: 430, y: 349, size: OUTER_SLOT_SIZE }, { x: 361, y: 416, size: OUTER_SLOT_SIZE },
  { x: 262, y: 442, size: OUTER_SLOT_SIZE }, { x: 163, y: 416, size: OUTER_SLOT_SIZE },
  { x: 94, y: 349, size: OUTER_SLOT_SIZE }, { x: 69, y: 259, size: OUTER_SLOT_SIZE },
  { x: 94, y: 167, size: OUTER_SLOT_SIZE }, { x: 165, y: 100, size: OUTER_SLOT_SIZE },
];

/** 与 wheel 原图的嵌槽中心共用一套坐标，门和战利品飞出点绝不各算一遍。 */
function slotLayout(index: number): { x: number; y: number; size: number } {
  const center = SLOT_CENTERS[index]!;
  return { x: center.x - center.size / 2, y: center.y - center.size / 2, size: center.size };
}

export const THEFT_THEME: UITheme = { ...apolloOnyx, pageBg: 'transparent', texture: '', wash: '' };

/** 首次入场提示可由表现层重新打开；不参与潜取会话，也绝不影响结算回执。 */
export const THEFT_TUTORIAL_OPEN_ACTION = 'theft.tutorial.open';

/** 已冻结的权威回执的纯展示投影；不会参与潜取规则或改变回传内容。 */
export interface TheftSettlementView {
  readonly outcome: 'success' | 'exposed' | 'escaped';
  readonly title: '成功' | '暴露' | '逃跑';
  readonly receipt: RiskRevealReceipt;
}

/** 暴露值只决定一个连续的实体填充色：绿→黄→橙→红之间按通道插值，绝不阈值跳色。 */
function exposureFillColor(view: TheftView): string {
  const ratio = Math.max(0, Math.min(1, view.riskLimitBp > 0 ? view.riskBp / view.riskLimitBp : 1));
  const stops = [
    { at: 0, rgb: [70, 209, 122] },    // ok
    { at: 0.42, rgb: [255, 203, 61] }, // gold
    { at: 0.72, rgb: [255, 178, 74] }, // warn
    { at: 1, rgb: [255, 64, 79] },     // danger
  ] as const;
  const upperIndex = stops.findIndex((stop) => ratio <= stop.at);
  const upper = stops[Math.max(1, upperIndex)]!;
  const lower = stops[Math.max(0, Math.max(1, upperIndex) - 1)]!;
  const local = (ratio - lower.at) / (upper.at - lower.at);
  const rgb = lower.rgb.map((channel, index) => Math.round(channel + (upper.rgb[index]! - channel) * local));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function slotNode(slot: TheftSlotView, skins: TheftSkinMap): LayoutNode {
  const { x, y, size } = slotLayout(slot.index);
  const actionable = slot.action !== undefined;
  return {
    type: 'Button', id: `theft-slot-${slot.index}`,
    props: {
      label: '', kind: 'quiet', shape: 'pill',
      // 黑位是封墙死门；未开位是与嵌槽等大的蓝铜锁门，二者绝不以透明模糊区分。
      skin: theftSkinUrl(skins, slot.state === 'black' ? THEFT_SKINS.doorSealed
        : slot.state === 'hidden' ? THEFT_SKINS.doorUnopened : THEFT_SKINS.doorOpen),
      // 封墙位不放 action 即不能开；不能用 disabled，因为通用禁用态会降 opacity，把实体石墙误画成半透明/发虚。
      ...(actionable ? { action: slot.action, actionArg: slot.actionArg } : {}),
    },
    layout: {
      // 门位在视觉和命中上都压过中央 QTE 热区，避免内环门点击落到中盘。
      x, y, z: 4, width: size, height: size, press3d: actionable, allowOverlap: true,
      ...(slot.state === 'acquired' ? { anim: 'pop', animMs: 300 } : {}),
    },
  };
}

function wheelStage(view: TheftView, skins: TheftSkinMap): LayoutNode {
  const outer = view.slots.filter((slot) => slot.ring === 'outer');
  const inner = view.slots.filter((slot) => slot.ring === 'inner');
  const qteFxTone = view.qteInPerfectRange ? 'gold' : 'jade';
  return {
    type: 'Panel', id: 'theft-wheel-stage',
    props: { bg: 'transparent', skin: theftSkinUrl(skins, THEFT_SKINS.wheel) },
    layout: { width: WHEEL_SIZE, height: WHEEL_SIZE, padding: 0, allowOverlap: true },
    children: [
      {
        type: 'Panel', id: 'theft-qte-core',
        props: { bg: 'transparent' },
        layout: {
          x: 174, y: 174, width: 176, height: 176, direction: 'column', align: 'center', justify: 'center',
          padding: 0, allowOverlap: true, z: 1,
          fx: view.qteInPerfectRange ? [{ kind: 'pulse', color: qteFxTone, ms: 620 }] : undefined,
        },
        children: [
          {
            type: 'Panel', id: 'theft-qte-dial',
            props: { bg: 'transparent', skin: theftSkinUrl(skins, THEFT_SKINS.qteDial) },
            layout: { x: 0, y: 0, width: 176, height: 176, padding: 0, allowOverlap: true, rotate: view.qteTargetAngleDeg },
          },
          {
            type: 'Panel', id: 'theft-qte-pointer',
            props: { bg: 'transparent', skin: theftSkinUrl(skins, THEFT_SKINS.qtePointer) },
            layout: { x: 0, y: 0, width: 176, height: 176, padding: 0, allowOverlap: true, rotate: view.qteAngleDeg },
          },
          ...(view.qteFlashTone ? [{
            // 特效不能直接挂绝对定位节点；定位壳内的圆形光环只围住指针，不会铺成方形闪白。
            type: 'Panel' as const, id: 'theft-qte-result-aura-positioner', props: { bare: true },
            layout: { x: 8, y: 8, width: 160, height: 160, padding: 0, allowOverlap: true },
            children: [{
              type: 'Panel' as const, id: 'theft-qte-result-aura',
              props: { bg: 'transparent' as const, skin: theftSkinUrl(skins, THEFT_SKINS.qteTarget), shape: 'pill' as const },
              // 只脉冲透明圆环与外发光，不能用 flash 填满圆盘、遮住指针。
              layout: { width: 160, height: 160, padding: 0, allowOverlap: true, fx: [{ kind: 'pulse' as const, color: view.qteFlashTone, ms: 500, once: true }, { kind: 'glow' as const, color: view.qteFlashTone, intensity: 1.8 }] },
            }],
          }] : []),
        ],
      },
      // 透明原生 Button 是中盘唯一的命中层。不能让 QTE 依赖贴图子层向可点 Panel 的冒泡：
      // 它在鼠标、触摸和无障碍操作里都以同一个具名 action 进入确定性会话。
      {
        type: 'Button', id: 'theft-qte-hitbox',
        props: {
          label: '', kind: 'quiet', shape: 'pill',
          // 画面已有圆形指针与刻度作为焦点提示；关闭原生 Button 的矩形键盘描边。
          focusRing: false,
          ...(view.primaryAction ? { action: view.primaryAction } : {}),
          disabled: view.primaryAction === undefined,
        },
        // 交互区只覆盖轴心，避开四个内环门位；判定仍只取本拍的指针角度。
        // 不加 press3d，避免透明 Button 被渲染成一块方形半透边框。
        layout: { x: 200, y: 200, z: 2, width: 124, height: 124, allowOverlap: true },
      },
      // 与 wheel-dial 原图中的 12+4 个嵌槽中心逐一对齐。门在中盘热区之后挂载并拥有更高 z，
      // 因此内环门既可见也优先接收点击；飞行起点仍消费同一坐标来源。
      ...outer.map((slot) => slotNode(slot, skins)),
      ...inner.map((slot) => slotNode(slot, skins)),
      ...(view.lootFlight ? [((): LayoutNode => {
        const origin = slotLayout(view.lootFlight.slotIndex);
        const iconSize = Math.min(origin.size - 6, 48);
        return {
          type: 'Image', id: `theft-loot-flight-${view.lootFlight.entryId}`,
          props: { src: view.lootFlight.imageUrl, alt: '取得的战利品', fit: 'contain' },
          layout: {
            x: origin.x + Math.round((origin.size - iconSize) / 2), y: origin.y + Math.round((origin.size - iconSize) / 2),
            width: iconSize, height: iconSize, z: 6, allowOverlap: true,
            flyTo: { to: 'theft-loot-bag', ms: 900, arc: 92 },
          },
        };
      })()] : []),
    ],
  };
}

function settlementOverlay(view: TheftView, settlement: TheftSettlementView, skins: TheftSkinMap): LayoutNode {
  const tone = settlement.outcome === 'success' ? 'ok' as const : settlement.outcome === 'exposed' ? 'danger' as const : 'gold' as const;
  const caption = settlement.outcome === 'success' ? '无声取走战利品' : settlement.outcome === 'exposed' ? '警觉已被惊动' : '及时脱离险境';
  const items = view.acquiredLoot;
  return {
    // 仅作为全尺寸的结算内容定位层：不绘制暗幕、不做磨砂，保留底下完整清晰的潜取画面。
    type: 'Panel', id: 'theft-settlement-scrim', props: { bare: true },
    layout: { x: 0, y: 0, z: 12, width: 620, height: 930, padding: 0, allowOverlap: true },
    children: [
      { type: 'Particles', id: 'theft-settlement-particles', props: { kind: settlement.outcome === 'success' ? 'stars' : 'sparkle', count: settlement.outcome === 'success' ? 22 : 12, loop: false }, layout: { x: 0, y: 0, width: 620, height: 930, allowOverlap: true } },
      {
        type: 'Panel', id: 'theft-settlement-card', props: { bg: 'ink-deep', edge: tone, accent: settlement.outcome === 'success', vignette: true },
        layout: { x: 72, y: 250, z: 1, width: 476, height: 392, padding: 30, direction: 'column', gap: 14, align: 'center', justify: 'center', allowOverlap: true, anim: 'pop', animMs: 560 },
        children: [
          // 终局关键词固定白色，独立于成功/暴露/逃跑的边框色，暗底下始终一眼可读。
          // 描边保留字形边界，移除白色 glow，避免毛笔字相邻笔画被光晕糊成一片。
          { type: 'Label', id: 'theft-settlement-title', props: { text: settlement.title, font: 'cnbrush', size: 58, bold: true, color: 'text', stroke: true }, layout: { anim: 'slideUp', animMs: 520 } },
          // 毛笔只留给两字终局标题；叙述信息统一使用主题无衬线，在嵌入宿主缩放后仍清晰可读。
          { type: 'Label', id: 'theft-settlement-caption', props: { text: caption, font: 'ui', size: 'lg', color: 'text' } },
          {
            type: 'Panel', id: 'theft-settlement-loot', props: { bare: true },
            layout: { width: 380, height: 128, direction: 'row', gap: 14, align: 'center', justify: 'center', allowOverlap: true },
            children: items.length > 0
              ? items.map((item, index): LayoutNode => ({
                type: 'Panel', id: `theft-settlement-loot-frame-${item.entryId}`, props: { bg: 'sunken', edge: 'gold' },
                layout: { width: 88, height: 108, padding: 9, direction: 'column', gap: 4, align: 'center', justify: 'center', allowOverlap: true, anim: 'flyIn', animFrom: index % 2 === 0 ? 'left' : 'right', animDelay: 140 + index * 90, animMs: 480 },
                children: [
                  { type: 'Image', id: `theft-settlement-loot-${item.entryId}`, props: { src: item.imageUrl || theftSkinUrl(skins, THEFT_SKINS.demoLoot), alt: item.displayName, fit: 'contain' }, layout: { width: 60, height: 60, allowOverlap: true, fx: [{ kind: 'glow', color: 'gold', intensity: 1.2 }] } },
                  { type: 'Label', id: `theft-settlement-loot-name-${item.entryId}`, props: { text: item.displayName, size: 'sm', color: 'text' } },
                ],
              }))
              : [{ type: 'Label', id: 'theft-settlement-empty', props: { text: '一无所获', font: 'ui', size: 'xxl', bold: true, color: 'text' }, layout: { anim: 'fadeIn', animMs: 700 } }],
          },
          { type: 'Label', id: 'theft-settlement-hint', props: { text: '正在返回旅程…', font: 'ui', size: 'md', color: 'sub' } },
        ],
      },
    ],
  };
}

/** AI 画框与机械双环的透明悬浮界面；文字仅占用题牌、状态带和底部托盘。 */
export function buildTheftScreen(
  view: TheftView,
  skins: TheftSkinMap = {},
  settlement?: TheftSettlementView,
  tutorialVisible = true,
): LayoutNode {
  const meterColor = exposureFillColor(view);
  return {
    type: 'Screen', id: 'theft-root', props: { center: true, fill: true, bg: 'transparent' },
    layout: { direction: 'column', align: 'center', justify: 'center', padding: 8 },
    children: [{
      type: 'Panel', id: 'theft-floating-frame',
      props: { bg: 'transparent', skin: theftSkinUrl(skins, THEFT_SKINS.frame) },
      // 嵌入 DokiWorlds 的演示框比独立页短，整体上移以露出最下方“立即撤退”按钮。
      // 仅设 y：横向仍由 Screen 的 align:center 保持居中。
      layout: { y: -42, width: 620, height: 930, padding: 0, allowOverlap: true, anim: 'pop', animMs: 420 },
      children: [
        {
          type: 'Panel', id: 'theft-exposure-shell', props: { bg: 'ink' as const, edge: 'gold' as const, shape: 'pill' as const },
          layout: {
            x: 92, y: 98, width: 436, height: 46, padding: 5, allowOverlap: true,
            // 外框不另加固定色光晕；光由进度自身按当前填充色投出，避免与风险色脱节。
          },
          children: [{
            type: 'ProgressBar', id: 'theft-exposure-meter',
            props: { value: view.riskBp, max: view.riskLimitBp, showValue: false, shape: 'bar', barHeight: 34, fillColor: meterColor, fillGlow: true },
            layout: { width: 426, height: 34, allowOverlap: true },
          }],
        },
        {
          type: 'Panel', id: 'theft-wheel-positioner', props: { bare: true },
          layout: { x: 48, y: 154, width: 524, height: 524, allowOverlap: true }, children: [wheelStage(view, skins)],
        },
        // 首次说明只暂借转盘最上缘的非交互装饰区；首次校准后收起，不会遮住开门区。
        ...(tutorialVisible && !settlement ? [{
          type: 'Panel' as const, id: 'theft-tutorial-card', props: { bg: 'ink-deep' as const, edge: 'gold' as const, vignette: true },
          // 嵌入宿主缩放后 sm 字号不足以阅读：改为两行 lg，并增高实底卡片保证行距和对比度。
          layout: { x: 58, y: 146, z: 8, width: 504, height: 82, padding: 12, direction: 'column' as const, align: 'center' as const, justify: 'center' as const, allowOverlap: true, anim: 'fadeIn' as const, animMs: 360 },
          children: [{
            type: 'Label' as const, id: 'theft-tutorial-copy',
            props: { text: '点击中央区域或按下空格进行校准，获得钥匙\n使用钥匙打开锁住的大门，在暴露值满之前撤退', font: 'ui' as const, size: 'lg' as const, bold: true, color: 'text' as const },
          }],
        }] : []),
        // 提示被首次操作收起后仍有低干扰入口，避免新玩家误以为说明永久消失。
        ...(!settlement ? [{
          type: 'Button' as const, id: 'theft-tutorial-open',
          props: { label: '?', kind: 'quiet' as const, shape: 'pill' as const, focusRing: false, action: THEFT_TUTORIAL_OPEN_ACTION },
          layout: { x: 536, y: 105, z: 9, width: 30, height: 30, press3d: true, allowOverlap: true },
        }] : []),
        ...(view.revealCredits > 0 ? [{
          type: 'Panel' as const, id: 'theft-reveal-key-rack', props: { bare: true },
          layout: { x: 158, y: 674, width: 304, height: 28, direction: 'row' as const, gap: 3, align: 'center' as const, justify: 'center' as const, padding: 0, allowOverlap: true },
          children: Array.from({ length: view.revealCredits }, (_, index) => ({
            type: 'Image' as const, id: `theft-reveal-key-${index}`,
            props: { src: theftSkinUrl(skins, THEFT_SKINS.revealKey), alt: '开门钥匙', fit: 'contain' as const },
            layout: { width: 26, height: 26, allowOverlap: true, anim: 'pop' as const, animMs: 240, fx: [{ kind: 'glow' as const, color: 'gold' as const, intensity: 1.1 }] },
          })),
        }] : []),
        {
          type: 'Panel', id: 'theft-loot-bag',
          props: { bg: 'transparent', skin: theftSkinUrl(skins, THEFT_SKINS.lootTray) },
          layout: { x: 62, y: 704, width: 496, height: 112, direction: 'row', gap: 12, align: 'center', justify: 'center', padding: 22, allowOverlap: true },
          children: view.acquiredLoot.map((item) => ({
            type: 'Image' as const, id: `theft-loot-${item.entryId}`,
            props: { src: item.imageUrl || theftSkinUrl(skins, THEFT_SKINS.demoLoot), alt: item.displayName, fit: 'contain' as const },
            layout: { width: 62, height: 62, allowOverlap: true, anim: 'pop' as const, animMs: 320, fx: [{ kind: 'glow' as const, color: 'gold' as const, intensity: 1.1 }] },
          })),
        },
        {
          type: 'Button', id: 'theft-withdraw',
          props: {
            label: '立即撤退', sub: '带走已取得的物品', kind: 'quiet', skin: theftSkinUrl(skins, THEFT_SKINS.withdraw),
            action: 'theft.withdraw', disabled: !view.canWithdraw,
          },
          layout: { x: 150, y: 826, width: 320, height: 72, press3d: true, allowOverlap: true },
        },
        ...(settlement ? [settlementOverlay(view, settlement, skins)] : []),
      ],
    }],
  };
}
