import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { END_TURN_ACTION, PLAY_CARD_ACTION } from './blueprint.js';
import { RHETORIC_CATALOG, type RhetoricCard, type RhetoricEffect, type RhetoricGameConfig } from './config.js';
import { cardForView, EXIT_ACTION, SKIP_PRESENTATION_ACTION, type RhetoricPresentationView } from './presentation-controller.js';
import {
  RHETORIC_CARD_VISUAL_SPEC,
  RHETORIC_DEAL_PHASE_FRAMES,
  RHETORIC_FRAME_MS,
  computeCardFlightGeometry,
  computeDealTiming,
  computeHandLayout,
  encodeVisualCardAction,
  type RhetoricHandVisual,
  type RhetoricHandLayout,
} from './card-presentation.js';

export type RhetoricSkinMap = Readonly<Record<string, string>>;
export const RHETORIC_CARD_BACK_KEY = 'game-rhetoric-duel/card/back';

const FALLBACK_CARD_ICON = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 160 160%22%3E%3Ccircle cx=%2280%22 cy=%2280%22 r=%2252%22 fill=%22none%22 stroke=%22%238a6536%22 stroke-width=%226%22/%3E%3Cpath d=%22M36 80h88M80 36v88%22 stroke=%22%238a6536%22 stroke-width=%224%22 opacity=%22.55%22/%3E%3Ctext x=%2280%22 y=%22102%22 text-anchor=%22middle%22 font-size=%2264%22 fill=%22%236b4627%22%3E%E8%A8%80%3C/text%3E%3C/svg%3E';
const FALLBACK_CARD_BACK = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 140%22%3E%3Cdefs%3E%3Cpattern id=%22p%22 width=%2212%22 height=%2212%22 patternUnits=%22userSpaceOnUse%22 patternTransform=%22rotate(35)%22%3E%3Crect width=%226%22 height=%2212%22 fill=%22%23121718%22/%3E%3Crect x=%226%22 width=%226%22 height=%2212%22 fill=%22%231a2221%22/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=%22100%22 height=%22140%22 rx=%226%22 fill=%22url(%23p)%22/%3E%3Crect x=%227%22 y=%227%22 width=%2286%22 height=%22126%22 rx=%224%22 fill=%22none%22 stroke=%22%23b58a49%22 stroke-width=%222%22/%3E%3Crect x=%2212%22 y=%2212%22 width=%2276%22 height=%22116%22 rx=%223%22 fill=%22none%22 stroke=%22%237a5a31%22/%3E%3C/svg%3E';

const RESOURCE_NAMES = { progress: '进度', pressure: '压力', focus: '专注' } as const;

export function resolveRhetoricSkin(skins: RhetoricSkinMap, key: string, fallback: string): string {
  return skins[key] ?? fallback;
}

export function selectLoadedRhetoricSkins(
  skins: RhetoricSkinMap,
  isLoaded: (key: string) => boolean,
): RhetoricSkinMap {
  return Object.fromEntries(Object.entries(skins).filter(([key]) => isLoaded(key)));
}

export function formatRhetoricEffects(effects: readonly RhetoricEffect[]): string {
  return effects.map((effect) => {
    if (effect.targetId === 'focus' && effect.value > 0) return `获得 ${effect.value} 专注`;
    const sign = effect.value > 0 ? '+' : effect.value < 0 ? '−' : '';
    return `${RESOURCE_NAMES[effect.targetId]} ${sign}${Math.abs(effect.value)}`;
  }).join(' · ');
}

function disabledReason(cardId: string, view: RhetoricPresentationView): string | undefined {
  const card = cardForView(cardId);
  if (!card) return '未知卡牌';
  if (view.result) return '交锋已结束';
  if (view.busy) return '演出进行中';
  if (card.focusCost > view.snapshot.focus) return `专注不足（需要 ${card.focusCost}）`;
  return undefined;
}

function publicAnnouncement(view: RhetoricPresentationView, config: RhetoricGameConfig): string {
  let copy = view.announcement || '选择手牌，展开交锋';
  for (const intent of config.encounter.intentions) copy = copy.replaceAll(intent.id, intent.label);
  for (const card of RHETORIC_CATALOG) copy = copy.replaceAll(card.cardId, card.displayName);
  return copy;
}

function commandNode(id: string, label: string, action: string, enabled: boolean, primary = false): LayoutNode {
  return {
    type: 'Button', id,
    props: { label, kind: primary ? 'primary' : 'ghost', action, disabled: !enabled, skin: '' },
    layout: { height: 44, press3d: enabled },
  };
}

type CardFaceOptions = Readonly<{
  instanceId: string;
  hotkey: number;
  disabled?: string;
  actionArg?: string;
  width: number;
  animation?: Readonly<{ delayMs: number; durationMs: number }>;
}>;

/** Single visual owner for hand and flight. It projects catalog data and never interprets cardId. */
export function buildRhetoricCardFace(card: RhetoricCard, skins: RhetoricSkinMap, options: CardFaceOptions): LayoutNode {
  const { instanceId, hotkey, disabled, actionArg, width, animation } = options;
  return {
    type: 'Panel', id: `rhetoric-card-${instanceId}`,
    props: {
      bg: { custom: disabled ? 'rgba(188,176,149,.95)' : 'rgba(221,195,142,.98)' },
      edge: 'gold', shadow: { y: 3, color: 'ink' },
      ...(actionArg && !disabled ? { action: PLAY_CARD_ACTION, actionArg } : {}),
    },
    layout: {
      direction: 'column', align: 'stretch', gap: 0, padding: 4, width, height: RHETORIC_CARD_VISUAL_SPEC.height, radius: 5,
      opacity: disabled ? 0.84 : 1,
      ...(animation ? { anim: 'dealIn' as const, animDelay: animation.delayMs, animMs: animation.durationMs } : {}),
      press3d: !disabled,
    },
    children: [{
      type: 'Panel', id: `rhetoric-card-inner-${instanceId}`,
      props: { bg: { custom: disabled ? 'rgba(204,190,158,.96)' : 'rgba(242,225,185,.99)' }, edge: 'gold', pattern: 'stripe' },
      layout: { direction: 'column', align: 'stretch', gap: 4, padding: 6, height: RHETORIC_CARD_VISUAL_SPEC.height - 10, radius: 3 },
      children: [
        { type: 'Panel', id: `rhetoric-card-meta-${instanceId}`, props: { bare: true }, layout: { direction: 'row', align: 'center', justify: 'between', height: 28 }, children: [
          { type: 'Panel', id: `rhetoric-card-cost-${instanceId}`, props: { bg: 'ink', edge: 'gold' }, layout: { width: RHETORIC_CARD_VISUAL_SPEC.costSize, height: RHETORIC_CARD_VISUAL_SPEC.costSize, radius: 13, padding: 2, align: 'center', justify: 'center' }, children: [
            { type: 'Label', id: `rhetoric-card-cost-value-${instanceId}`, props: { text: String(card.focusCost), size: 'sm', bold: true, color: 'gold' } },
          ] },
          { type: 'Panel', id: `rhetoric-card-hotkey-${instanceId}`, props: { bg: 'ink', edge: 'gold' }, layout: { width: RHETORIC_CARD_VISUAL_SPEC.hotkeySize, height: RHETORIC_CARD_VISUAL_SPEC.hotkeySize, radius: 4, padding: 1, align: 'center', justify: 'center' }, children: [
            { type: 'Label', id: `rhetoric-card-hotkey-value-${instanceId}`, props: { text: String(hotkey), size: 'sm', bold: true, color: 'gold' } },
          ] },
        ] },
        { type: 'Image', id: `rhetoric-card-art-${instanceId}`, props: { src: resolveRhetoricSkin(skins, card.skinKey, FALLBACK_CARD_ICON), alt: card.displayName, fit: 'contain', radius: 2 }, layout: { height: RHETORIC_CARD_VISUAL_SPEC.imageHeight } },
        { type: 'Panel', id: `rhetoric-card-identity-band-${instanceId}`, props: { bare: true }, layout: { direction: 'column', gap: 1 }, children: [
          { type: 'Label', id: `rhetoric-card-name-${instanceId}`, props: { text: card.displayName, size: 'md', bold: true, color: 'ink' } },
          { type: 'Label', id: `rhetoric-card-source-${instanceId}`, props: { text: '言弹', size: 'sm', color: 'ink' } },
        ] },
        { type: 'Panel', id: `rhetoric-card-copy-${instanceId}`, props: { bare: true }, layout: { direction: 'column', gap: 2, height: 58 }, children: [
          { type: 'Label', id: `rhetoric-card-effect-${instanceId}`, props: { text: formatRhetoricEffects(card.effects), size: 'sm', bold: true, color: 'ink' } },
          ...(disabled
            ? [{ type: 'Panel', id: `rhetoric-card-unavailable-band-${instanceId}`, props: { bg: 'ink', edge: 'danger' }, layout: { height: 24, padding: 3, align: 'center', justify: 'center' }, children: [
                { type: 'Label', id: `rhetoric-card-disabled-${instanceId}`, props: { text: disabled, size: 'sm', bold: true, color: 'danger' } },
              ] } as LayoutNode]
            : [{ type: 'Label', id: `rhetoric-card-flavor-${instanceId}`, props: { text: card.flavorText, size: 'sm', color: 'ink' } } as LayoutNode]),
        ] },
      ],
    }],
  };
}

const beforeHandPhases = new Set(['card-flight', 'round-end', 'enemy-intent', 'enemy-impact', 'focus-refresh']);
function visualForSlot(view: RhetoricPresentationView, cardId: string, index: number): RhetoricHandVisual {
  const field = beforeHandPhases.has(view.phase) ? 'previousIndex' : 'nextIndex';
  return view.handVisuals.find((visual) => visual.cardId === cardId && visual[field] === index)
    ?? { visualId: `${cardId}--slot-${index}`, cardId, status: 'kept', previousIndex: index, nextIndex: index };
}

function handCardNode(cardId: string, index: number, view: RhetoricPresentationView, skins: RhetoricSkinMap, handLayout: RhetoricHandLayout, drawnCount: number): LayoutNode {
  const visual = visualForSlot(view, cardId, index);
  const disabled = disabledReason(cardId, view);
  const selected = view.phase === 'card-flight' && view.playedIndex === index;
  const isDrawn = (view.phase === 'deal-opening-hand' || view.phase === 'deal-new-cards') && visual.status === 'drawn';
  const timing = computeDealTiming(drawnCount, RHETORIC_DEAL_PHASE_FRAMES * RHETORIC_FRAME_MS);
  const slot = handLayout.slots[index]!;
  const delayMs = isDrawn ? (visual.drawOrdinal ?? 0) * timing.staggerMs : 0;
  const face = buildRhetoricCardFace(cardForView(cardId)!, skins, {
    instanceId: visual.visualId,
    hotkey: index + 1,
    disabled,
    actionArg: encodeVisualCardAction(cardId, index),
    width: handLayout.cardWidth,
    ...(isDrawn && !view.reducedMotion ? { animation: { delayMs, durationMs: timing.durationMs } } : {}),
  });
  const horizontal: LayoutNode = {
    type: 'Panel', id: `rhetoric-hand-x-${visual.visualId}`, props: { bare: true },
    layout: {
      width: handLayout.cardWidth, height: handLayout.cardHeight,
      ...(isDrawn && !view.reducedMotion ? {
        anim: 'flyIn', animFrom: RHETORIC_CARD_VISUAL_SPEC.deckAnchor.x < slot.cx ? 'left' : 'right',
        animDist: Math.abs(RHETORIC_CARD_VISUAL_SPEC.deckAnchor.x - slot.cx), animDelay: delayMs, animMs: timing.durationMs,
      } as const : {}),
    },
    children: [face],
  };
  return {
    type: 'Panel', id: `rhetoric-hand-slot-${visual.visualId}`, props: { bare: true },
    layout: {
      width: handLayout.cardWidth, height: handLayout.cardHeight, opacity: selected ? 0 : 1,
      ...(isDrawn && !view.reducedMotion ? {
        anim: 'flyIn', animFrom: RHETORIC_CARD_VISUAL_SPEC.deckAnchor.y < slot.cy ? 'top' : 'bottom',
        animDist: Math.abs(RHETORIC_CARD_VISUAL_SPEC.deckAnchor.y - slot.cy), animDelay: delayMs, animMs: timing.durationMs,
      } as const : {}),
    },
    children: [horizontal],
  };
}

function flightCardNode(view: RhetoricPresentationView, skins: RhetoricSkinMap): LayoutNode | undefined {
  if (view.phase !== 'card-flight' || view.transition?.kind !== 'card-played' || !view.transition.cardId) return undefined;
  const playedIndex = view.playedIndex ?? view.transition.before.hand.indexOf(view.transition.cardId);
  const handLayout = computeHandLayout(view.transition.before.hand.length);
  const geometry = computeCardFlightGeometry(handLayout, playedIndex);
  const visual = view.handVisuals.find((entry) => entry.previousIndex === playedIndex) ?? visualForSlot(view, view.transition.cardId, playedIndex);
  const card = cardForView(view.transition.cardId);
  if (!card) return undefined;
  const face = buildRhetoricCardFace(card, skins, { instanceId: `flight-${visual.visualId}`, hotkey: playedIndex + 1, width: handLayout.cardWidth });
  return {
    type: 'Panel', id: 'rhetoric-flight-y', props: { bare: true },
    layout: {
      x: geometry.end.x - handLayout.cardWidth / 2, y: geometry.end.y - handLayout.cardHeight / 2,
      width: handLayout.cardWidth, height: handLayout.cardHeight, allowOverlap: true,
      ...(!view.reducedMotion ? { anim: 'flyIn' as const, animFrom: geometry.yFrom, animDist: Math.abs(geometry.delta.y), animMs: RHETORIC_CARD_VISUAL_SPEC.flightDurationMs } : {}),
    },
    children: [{
      type: 'Panel', id: 'rhetoric-flight-x', props: { bare: true },
      layout: {
        width: handLayout.cardWidth, height: handLayout.cardHeight,
        ...(!view.reducedMotion ? { anim: 'flyIn' as const, animFrom: geometry.xFrom, animDist: Math.abs(geometry.delta.x), animMs: RHETORIC_CARD_VISUAL_SPEC.flightDurationMs } : {}),
      },
      children: [face],
    }],
  };
}

function resultScreen(view: RhetoricPresentationView): LayoutNode {
  const win = view.result === 'win';
  return {
    type: 'Screen', id: 'rhetoric-duel', props: { fill: true, bg: { custom: 'transparent' } }, layout: { padding: 0 },
    children: [{
      type: 'Panel', id: 'rhetoric-result-panel', props: { bg: { custom: 'rgba(6,8,9,.76)' }, edge: 'gold' },
      layout: { x: 58, y: 536, width: 520, direction: 'column', gap: 13, padding: 23 },
      children: [
        { type: 'Label', id: 'rhetoric-result-title', props: { text: win ? '论证成立' : '交锋失利', font: 'serif', size: 'xxxl', bold: true, color: win ? 'gold' : 'danger' } },
        { type: 'Divider', id: 'rhetoric-result-rule', props: {} },
        { type: 'Label', id: 'rhetoric-result-reason', props: { text: win ? '对手已接受你的论证。' : view.snapshot.phase === 'defeat-pressure' ? '压力达到上限，论证被迫中止。' : '回合耗尽，未能及时完成论证。', size: 'md', color: 'text' } },
        commandNode('rhetoric-result-exit', '返回游戏库', EXIT_ACTION, true, true),
      ],
    }],
  };
}

export function buildRhetoricDuelUI(
  view: RhetoricPresentationView,
  config: RhetoricGameConfig,
  skins: RhetoricSkinMap = {},
  debug = false,
): LayoutNode {
  if (view.phase === 'result-panel' && view.result) return resultScreen(view);
  if (view.phase === 'camera') return { type: 'Screen', id: 'rhetoric-duel', props: { fill: true, bg: { custom: 'transparent' } }, layout: { padding: 0 }, children: [] };
  const intent = config.encounter.intentions[Math.min(config.encounter.intentions.length - 1, view.snapshot.turns)]!;
  const pressure = intent.effects.filter((entry) => entry.targetId === 'pressure').reduce((sum, entry) => sum + entry.value, 0);
  const handLayout = computeHandLayout(view.snapshot.hand.length);
  const drawnCount = view.handVisuals.filter((visual) => visual.status === 'drawn').length;
  const flightCard = flightCardNode(view, skins);
  return {
    type: 'Screen', id: 'rhetoric-duel', props: { fill: true, bg: { custom: 'transparent' } }, layout: { padding: 0 },
    children: [
      { type: 'Panel', id: 'rhetoric-record-shade', props: { bg: { custom: 'linear-gradient(90deg,rgba(4,6,7,.78),rgba(4,6,7,.20))' }, bare: true }, layout: { x: 34, y: 40, width: 555, height: 440, padding: 18, allowOverlap: true } },
      { type: 'Panel', id: 'rhetoric-record', props: { bare: true }, layout: { x: 58, y: 58, width: 500, direction: 'column', gap: 10, padding: 0 }, children: [
        { type: 'Panel', id: 'rhetoric-title-group', props: { bare: true }, layout: { direction: 'row', align: 'center', justify: 'between' }, children: [
          { type: 'Label', id: 'rhetoric-title', props: { text: '言弹交锋', font: 'serif', size: 'xxxl', color: 'gold' } },
          ...(debug ? [{ type: 'Badge', id: 'rhetoric-debug', props: { text: '调试', tone: 'warn' } } as LayoutNode] : []),
        ] },
        { type: 'Divider', id: 'rhetoric-title-rule', props: {} },
        { type: 'Label', id: 'rhetoric-objective', props: { text: config.encounter.objective, size: 'md', color: 'text' } },
        { type: 'Panel', id: 'rhetoric-intent', props: { bare: true }, layout: { direction: 'column', gap: 6, padding: 0, ...(!view.reducedMotion && (view.phase === 'reveal-intent' || view.phase === 'enemy-intent') ? { anim: 'pop' } : {}) }, children: [
          { type: 'Label', id: 'rhetoric-intent-title', props: { text: `对手意图 · ${intent.label}`, size: 'xxl', bold: true, color: 'gold' } },
          { type: 'Label', id: 'rhetoric-intent-preview', props: { text: intent.preview, size: 'md', color: 'text' } },
          { type: 'Label', id: 'rhetoric-intent-pressure', props: { text: `影响：压力 +${pressure}`, size: 'sm', color: 'danger' } },
        ] },
        { type: 'Label', id: 'rhetoric-semantic-live', props: { text: publicAnnouncement(view, config), size: 'sm', color: 'sub' } },
        ...(debug ? [{ type: 'Label', id: 'rhetoric-debug-phase', props: { text: `phase=${view.phase}`, size: 'xs', color: 'sub' } } as LayoutNode] : []),
      ] },
      { type: 'Panel', id: 'rhetoric-opponent-shade', props: { bg: { custom: 'linear-gradient(270deg,rgba(4,6,7,.78),rgba(4,6,7,.08))' }, bare: true }, layout: { x: 1070, y: 42, width: 330, height: 274, padding: 16, allowOverlap: true } },
      { type: 'Panel', id: 'rhetoric-opponent-copy', props: { bare: true }, layout: { x: 1090, y: 57, width: 280, direction: 'column', gap: 8, padding: 0 }, children: [
        { type: 'Label', id: 'rhetoric-opponent-name', props: { text: config.encounter.displayName, font: 'serif', size: 'xxxl', bold: true, color: 'gold', stroke: true } },
        { type: 'Label', id: 'rhetoric-opponent-subtitle', props: { text: config.encounter.opponentSubtitle, size: 'md', color: 'sub' } },
        { type: 'ProgressBar', id: 'rhetoric-progress', props: { label: '进度', value: view.snapshot.progress, max: config.encounter.target, tone: 'gold', showValue: true } },
        { type: 'Badge', id: 'rhetoric-turn', props: { text: `第 ${Math.min(config.encounter.turnLimit, view.snapshot.turns + 1)} / ${config.encounter.turnLimit} 回合`, tone: 'gold' } },
      ] },
      ...(flightCard ? [flightCard] : []),
      { type: 'Panel', id: 'rhetoric-bottom-shade', props: { bg: { custom: 'linear-gradient(180deg,rgba(3,5,7,0),rgba(3,5,7,.94) 36%)' }, bare: true }, layout: { x: 0, y: 600, width: 1440, height: 300, padding: 0, allowOverlap: true } },
      { type: 'Panel', id: 'rhetoric-resources', props: { bare: true }, layout: { x: 42, y: 680, width: 190, direction: 'column', gap: 10 }, children: [
        { type: 'ProgressBar', id: 'rhetoric-pressure', props: { label: '压力', value: view.snapshot.pressure, max: config.encounter.pressureLimit, tone: 'danger', showValue: true }, layout: !view.reducedMotion && view.phase === 'enemy-impact' ? { fx: [{ kind: 'shake' as const, once: true }] } : {} },
        { type: 'Panel', id: 'rhetoric-focus', props: { bare: true }, layout: { direction: 'row', align: 'center', justify: 'between', ...(!view.reducedMotion && view.phase === 'focus-refresh' ? { fx: [{ kind: 'pop' as const, once: true }] } : {}) }, children: [
          { type: 'Label', id: 'rhetoric-focus-label', props: { text: '专注', size: 'sm', color: 'text' } },
          { type: 'Label', id: 'rhetoric-focus-value', props: { text: `${'●'.repeat(Math.max(0, view.snapshot.focus))}${'○'.repeat(Math.max(0, config.encounter.focusPerTurn - view.snapshot.focus))}`, size: 'md', bold: true, color: 'gold' } },
        ] },
        { type: 'Label', id: 'rhetoric-piles', props: { text: `牌库 ${view.snapshot.deck.length}　弃牌 ${view.snapshot.discard.length}`, size: 'sm', color: 'sub' } },
      ] },
      { type: 'Panel', id: 'rhetoric-hand', props: { bare: true }, layout: { x: handLayout.x, y: handLayout.y, width: handLayout.width, height: handLayout.height, direction: 'row', align: 'center', justify: 'center', gap: handLayout.gap }, children: view.snapshot.hand.map((cardId, index) => handCardNode(cardId, index, view, skins, handLayout, drawnCount)) },
      { type: 'Panel', id: 'rhetoric-actions', props: { bare: true }, layout: { x: 1168, y: 654, width: 204, direction: 'column', align: 'stretch', gap: 10 }, children: [
        { type: 'Image', id: 'rhetoric-deck-back', props: { src: resolveRhetoricSkin(skins, RHETORIC_CARD_BACK_KEY, FALLBACK_CARD_BACK), alt: '牌库', fit: 'cover', radius: 4 }, layout: { width: 55, height: 78, align: 'center' } },
        commandNode('rhetoric-end-turn', '结束回合', END_TURN_ACTION, !view.busy && !view.result, true),
        ...(view.busy ? [commandNode('rhetoric-skip', '跳过演出', SKIP_PRESENTATION_ACTION, true)] : []),
        commandNode('rhetoric-exit', '退出', EXIT_ACTION, !view.busy),
      ] },
    ],
  };
}

export function catalogCompleteness(): boolean {
  return RHETORIC_CATALOG.every((card) => card.skinKey === `game-rhetoric-duel/card/${card.cardId}`);
}
