import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { END_TURN_ACTION, PLAY_CARD_ACTION } from './blueprint.js';
import { RHETORIC_CATALOG, type RhetoricCard, type RhetoricEffect, type RhetoricGameConfig } from './config.js';
import { cardForView, EXIT_ACTION, type RhetoricPresentationView } from './presentation-controller.js';
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
export const RHETORIC_CARD_FRAME_KEY = 'game-rhetoric-duel/card/frame';

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

function disabledReason(cardId: string, view: RhetoricPresentationView, availableFocus = view.snapshot.focus): string | undefined {
  const card = cardForView(cardId);
  if (!card) return '未知卡牌';
  if (view.result) return '交锋已结束';
  // Affordability is a committed rule result, so it must remain visible while the
  // presentation is busy instead of being hidden by the generic busy reason.
  if (card.focusCost > availableFocus) return `专注不足（需要 ${card.focusCost}）`;
  if (view.busy) return '演出进行中';
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
    props: { label, kind: primary ? 'hero' : 'ghost', action, disabled: !enabled, skin: '' },
    layout: { width: 176, height: primary ? 58 : 48, press3d: enabled },
  };
}

const METER_TWEEN_MS = 650;

function meterNode(
  id: string,
  label: string,
  value: number,
  max: number,
  tone: 'gold' | 'danger',
  trackWidth = 100,
  previousValue?: number,
): LayoutNode {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const previousRatio = max > 0 && previousValue !== undefined
    ? Math.max(0, Math.min(1, previousValue / max))
    : ratio;
  const innerWidth = trackWidth - 4;
  const fillWidth = Math.round(innerWidth * ratio);
  const previousWidth = Math.round(innerWidth * previousRatio);
  const moving = previousValue !== undefined && previousValue !== value;
  const valueNode: LayoutNode = {
    type: 'Panel', id: `${id}-value`, props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 0 }, children: [
      {
        type: 'Label', id: `${id}-value-current`,
        props: {
          text: String(value), size: 19, bold: true, color: tone,
          ...(moving ? { tween: { from: previousValue, to: value, ms: METER_TWEEN_MS } } : {}),
        },
      },
      { type: 'Label', id: `${id}-value-max`, props: { text: `/${max}`, size: 19, bold: true, color: tone } },
    ],
  };
  const fillChildren: LayoutNode[] = moving && fillWidth > previousWidth
    ? [
      { type: 'Panel', id: `${id}-fill-base`, props: { bg: tone }, layout: { x: 0, y: 0, width: previousWidth, height: 6, padding: 0, radius: 3, allowOverlap: true } },
      {
        type: 'Panel', id: `${id}-fill-delta`, props: { bg: tone },
        layout: {
          x: previousWidth, y: 0, width: fillWidth - previousWidth, height: 6, padding: 0, radius: 3, allowOverlap: true,
          anim: 'flyIn', animFrom: 'left', animDist: fillWidth - previousWidth, animMs: METER_TWEEN_MS,
        },
      },
    ]
    : moving && fillWidth < previousWidth
      ? [
        { type: 'Panel', id: `${id}-fill-base`, props: { bg: tone }, layout: { x: 0, y: 0, width: previousWidth, height: 6, padding: 0, radius: 3, allowOverlap: true } },
        {
          type: 'Panel', id: `${id}-fill-drain`, props: { bg: 'raised' },
          layout: {
            x: fillWidth, y: 0, width: previousWidth - fillWidth, height: 6, padding: 0, radius: 3, allowOverlap: true,
            anim: 'fadeIn', animMs: METER_TWEEN_MS,
          },
        },
      ]
      : [{ type: 'Panel', id: `${id}-fill`, props: { bg: tone }, layout: { width: fillWidth, height: 6, padding: 0, radius: 3 } }];
  return {
    type: 'Panel', id, props: { bare: true }, layout: { direction: 'column', gap: 4 }, children: [
      { type: 'Panel', id: `${id}-copy`, props: { bare: true }, layout: { direction: 'row', justify: 'between', align: 'center' }, children: [
        { type: 'Label', id: `${id}-label`, props: { text: label, size: 17, color: 'text' } },
        valueNode,
      ] },
      { type: 'Panel', id: `${id}-track`, props: { bg: 'raised', edge: tone }, layout: { width: trackWidth, height: 12, padding: 2, radius: 6 }, children: [
        { type: 'Panel', id: `${id}-rail`, props: { bare: true }, layout: { width: innerWidth, height: 6, padding: 0, radius: 3, allowOverlap: true }, children: fillChildren },
      ] },
    ],
  };
}

function previousMeterValue(view: RhetoricPresentationView, resource: 'progress' | 'pressure'): number | undefined {
  if (view.reducedMotion || !view.transition) return undefined;
  if (view.transition.kind === 'card-played' && view.phase === 'card-flight') return view.transition.before[resource];
  if (resource === 'pressure' && view.transition.kind === 'enemy-turn' && view.phase === 'enemy-impact') {
    return view.transition.before.pressure;
  }
  return undefined;
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
  const spec = RHETORIC_CARD_VISUAL_SPEC;
  const frame = resolveRhetoricSkin(skins, RHETORIC_CARD_FRAME_KEY, '/games/game-rhetoric-duel/art/card/frame.svg');
  const unavailableCopy = disabled?.startsWith('专注不足') ? disabled : undefined;
  return {
    type: 'Panel', id: `rhetoric-card-${instanceId}`,
    props: {
      bg: { custom: 'radial-gradient(ellipse at top,#eee1c2,#c8b48e)' },
      ...(actionArg && !disabled ? { action: PLAY_CARD_ACTION, actionArg } : {}),
    },
    layout: {
      width, height: spec.height, padding: 0, radius: 5, allowOverlap: true,
      ...(animation ? { anim: 'dealIn' as const, animDelay: animation.delayMs, animMs: animation.durationMs } : {}),
      press3d: !disabled,
    },
    children: [
      { type: 'Panel', id: `rhetoric-card-frame-${instanceId}`, props: { skin: frame }, layout: { x: -spec.frameBleed - 1, y: -spec.frameBleed - 1, width: spec.frameWidth, height: spec.frameHeight, padding: 0, radius: 0, allowOverlap: true } },
      { type: 'Image', id: `rhetoric-card-art-${instanceId}`, props: { src: resolveRhetoricSkin(skins, card.skinKey, FALLBACK_CARD_ICON), alt: card.displayName, fit: 'contain' }, layout: { x: 8, y: 8, width: width - 18, height: spec.imageHeight, allowOverlap: true } },
      { type: 'Panel', id: `rhetoric-card-cost-${instanceId}`, props: { bg: { custom: unavailableCopy ? '#6b241f' : '#322a1b' }, ...(unavailableCopy ? { edge: 'danger' as const } : {}) }, layout: { x: 3, y: 3, width: spec.costSize - 2, height: spec.costSize - 2, radius: 11, padding: 0, align: 'center', justify: 'center', allowOverlap: true, ...(unavailableCopy ? { fx: [{ kind: 'pulse' as const, ms: 1200 }, { kind: 'glow' as const, color: 'danger' as const, intensity: 0.8 }] } : {}) }, children: [
        { type: 'Label', id: `rhetoric-card-cost-value-${instanceId}`, props: { text: String(card.focusCost), size: 16, font: 'serif', color: 'gold' } },
      ] },
      { type: 'Panel', id: `rhetoric-card-row-name-${instanceId}`, props: { bare: true }, layout: { x: 8, y: 76, width: width - 18, height: 17, align: 'center', justify: 'center', allowOverlap: true }, children: [
        { type: 'Label', id: `rhetoric-card-name-${instanceId}`, props: { text: card.displayName, size: 13, font: 'serif', bold: true, color: 'ink' } },
      ] },
      { type: 'Panel', id: `rhetoric-card-row-source-${instanceId}`, props: { bare: true }, layout: { x: 8, y: 95, width: width - 18, height: 13, align: 'center', justify: 'center', opacity: 0.78, allowOverlap: true }, children: [
        { type: 'Label', id: `rhetoric-card-source-${instanceId}`, props: { text: '言弹', size: 10, font: 'serif', color: 'ink' } },
      ] },
      { type: 'Panel', id: `rhetoric-card-copy-${instanceId}`, props: { bare: true }, layout: { x: 8, y: 112, width: width - 18, height: 42, align: 'center', justify: 'center', allowOverlap: true }, children: [
        { type: 'Label', id: `rhetoric-card-effect-${instanceId}`, props: { text: formatRhetoricEffects(card.effects), size: 11, font: 'serif', color: 'ink' } },
      ] },
      ...(unavailableCopy ? [
        { type: 'Panel', id: `rhetoric-card-unavailable-veil-${instanceId}`, props: { bg: { custom: 'rgba(43,8,7,.30)' }, edge: 'danger' }, layout: { x: 1, y: 1, width: width - 2, height: spec.height - 2, padding: 0, radius: 5, allowOverlap: true } },
      ] as LayoutNode[] : []),
      { type: 'Label', id: `rhetoric-card-hotkey-value-${instanceId}`, props: { text: String(hotkey), size: 9, font: 'serif', color: 'ink' }, layout: { x: width - 13, y: spec.height - 16, opacity: 0.5, allowOverlap: true } },
    ],
  };
}

const beforeHandPhases = new Set(['card-lift', 'round-end', 'enemy-intent', 'enemy-impact', 'focus-refresh']);
function visualForSlot(view: RhetoricPresentationView, cardId: string, index: number): RhetoricHandVisual {
  const field = beforeHandPhases.has(view.phase) ? 'previousIndex' : 'nextIndex';
  return view.handVisuals.find((visual) => visual.cardId === cardId && visual[field] === index)
    ?? { visualId: `${cardId}--slot-${index}`, cardId, status: 'kept', previousIndex: index, nextIndex: index };
}

function handCardNode(cardId: string, index: number, view: RhetoricPresentationView, skins: RhetoricSkinMap, handLayout: RhetoricHandLayout, drawnCount: number): LayoutNode {
  const visual = visualForSlot(view, cardId, index);
  const selected = view.phase === 'card-lift' && view.playedIndex === index;
  const committedFocus = view.transition?.kind === 'card-played' && !selected
    ? view.transition.after.focus
    : view.snapshot.focus;
  const disabled = disabledReason(cardId, view, committedFocus);
  const isDrawn = (view.phase === 'deal-opening-hand' || view.phase === 'deal-new-cards') && visual.status === 'drawn';
  const timing = computeDealTiming(drawnCount, RHETORIC_DEAL_PHASE_FRAMES * RHETORIC_FRAME_MS);
  const slot = handLayout.slots[index]!;
  const previousLayout = view.transition ? computeHandLayout(view.transition.before.hand.length) : undefined;
  const previousSlot = visual.previousIndex === undefined ? undefined : previousLayout?.slots[visual.previousIndex];
  const reflowDistance = previousSlot ? slot.cx - previousSlot.cx : 0;
  const isPlayedCardReflow = view.phase === 'card-flight' && view.transition?.kind === 'card-played';
  const isDrawReflow = view.phase === 'deal-new-cards' && view.transition?.kind === 'enemy-turn';
  const isReflowing = (isPlayedCardReflow || isDrawReflow) && visual.status === 'kept' && Math.abs(reflowDistance) > 0.5;
  const reflowDurationMs = isDrawReflow
    ? RHETORIC_CARD_VISUAL_SPEC.drawReflowDurationMs
    : RHETORIC_CARD_VISUAL_SPEC.handReflowDurationMs;
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
      ...(isReflowing && !view.reducedMotion ? {
        anim: 'flyIn', animFrom: reflowDistance > 0 ? 'left' : 'right',
        animDist: Math.abs(reflowDistance), animMs: reflowDurationMs,
      } as const : {}),
    },
    children: [face],
  };
  return {
    type: 'Panel', id: `rhetoric-hand-slot-${visual.visualId}`, props: { bare: true },
    layout: {
      width: handLayout.cardWidth, height: handLayout.cardHeight,
      ...(view.phase === 'card-lift' && selected && !view.reducedMotion ? { anim: 'pop' as const, animMs: RHETORIC_CARD_VISUAL_SPEC.liftDurationMs } : {}),
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

function discardFlightCardNode(view: RhetoricPresentationView, skins: RhetoricSkinMap): LayoutNode | undefined {
  if (view.phase !== 'impact' || view.transition?.kind !== 'card-played' || !view.transition.cardId) return undefined;
  const card = cardForView(view.transition.cardId);
  if (!card) return undefined;
  const face = buildRhetoricCardFace(card, skins, {
    instanceId: `discard-${view.transition.cardId}`,
    hotkey: (view.playedIndex ?? 0) + 1,
    width: RHETORIC_CARD_VISUAL_SPEC.width,
  });
  return {
    type: 'Panel', id: 'rhetoric-discard-flight', props: { bare: true },
    layout: {
      x: RHETORIC_CARD_VISUAL_SPEC.targetAnchor.x - RHETORIC_CARD_VISUAL_SPEC.width / 2,
      y: RHETORIC_CARD_VISUAL_SPEC.targetAnchor.y - RHETORIC_CARD_VISUAL_SPEC.height / 2,
      width: RHETORIC_CARD_VISUAL_SPEC.width, height: RHETORIC_CARD_VISUAL_SPEC.height,
      allowOverlap: true,
      ...(!view.reducedMotion ? { flyTo: { to: 'rhetoric-discard-target', ms: RHETORIC_CARD_VISUAL_SPEC.discardDurationMs, arc: 72 } } : {}),
    },
    children: [{
      type: 'Panel', id: 'rhetoric-discard-spin', props: { bare: true },
      layout: {
        width: RHETORIC_CARD_VISUAL_SPEC.width, height: RHETORIC_CARD_VISUAL_SPEC.height,
        ...(!view.reducedMotion ? { anim: 'spin', animMs: RHETORIC_CARD_VISUAL_SPEC.discardSpinDurationMs } : {}),
      },
      children: [face],
    }],
  };
}

function discardPileNode(view: RhetoricPresentationView, skins: RhetoricSkinMap): LayoutNode {
  const cardInFlight = view.transition?.kind === 'card-played'
    && ['card-lift', 'card-flight', 'impact'].includes(view.phase);
  const visibleDiscard = cardInFlight ? view.transition!.before.discard : view.snapshot.discard;
  const card = cardForView(visibleDiscard[visibleDiscard.length - 1] ?? '');
  return {
    type: 'Panel', id: 'rhetoric-discard-target', props: { bg: 'sunken', edge: 'gold' },
    layout: { width: 48, height: 68, padding: 2, radius: 4, align: 'center', justify: 'center' },
    children: card ? [{
      type: 'Image', id: 'rhetoric-discard-top',
      props: { src: resolveRhetoricSkin(skins, card.skinKey, FALLBACK_CARD_ICON), alt: `弃牌：${card.displayName}`, fit: 'cover', radius: 3 },
      layout: { width: 42, height: 60 },
    }] : [{ type: 'Label', id: 'rhetoric-discard-empty', props: { text: '弃', size: 18, color: 'sub' } }],
  };
}

function resultScreen(view: RhetoricPresentationView): LayoutNode {
  const win = view.result === 'win';
  return {
    type: 'Screen', id: 'rhetoric-duel', props: { fill: true, bg: { custom: 'transparent' } }, layout: { padding: 0 },
    children: [{
      type: 'Panel', id: 'rhetoric-result-panel', props: { bg: { custom: 'rgba(6,8,9,.76)' }, edge: 'gold' },
      layout: { x: 48, y: 522, width: 645, direction: 'column', gap: 12, padding: 20 },
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
  const visibleHand = view.phase === 'card-flight' && view.transition?.kind === 'card-played'
    ? view.transition.after.hand
    : view.snapshot.hand;
  const handLayout = computeHandLayout(visibleHand.length);
  const drawnCount = view.handVisuals.filter((visual) => visual.status === 'drawn').length;
  const flightCard = flightCardNode(view, skins);
  const discardFlightCard = discardFlightCardNode(view, skins);
  return {
    type: 'Screen', id: 'rhetoric-duel', props: { fill: true, bg: { custom: 'transparent' } }, layout: { padding: 0 },
    children: [
      { type: 'Panel', id: 'rhetoric-record-shade', props: { bg: { custom: 'linear-gradient(90deg,rgba(4,6,7,.96),rgba(4,6,7,.72) 72%,rgba(4,6,7,0))' }, bare: true }, layout: { x: 15, y: 18, width: 660, height: 450, padding: 18, allowOverlap: true } },
      { type: 'Panel', id: 'rhetoric-record', props: { bare: true }, layout: { x: 36, y: 33, width: 585, direction: 'column', gap: 8, padding: 0 }, children: [
        { type: 'Panel', id: 'rhetoric-title-group', props: { bare: true }, layout: { direction: 'row', align: 'center', justify: 'between' }, children: [
          { type: 'Label', id: 'rhetoric-title', props: { text: '言弹交锋', font: 'serif', size: 26, bold: true, color: 'gold' } },
          ...(debug ? [{ type: 'Badge', id: 'rhetoric-debug', props: { text: '调试', tone: 'warn' } } as LayoutNode] : []),
        ] },
        { type: 'Divider', id: 'rhetoric-title-rule', props: {} },
        { type: 'Label', id: 'rhetoric-objective', props: { text: config.encounter.objective, size: 17, color: 'text' } },
        { type: 'Panel', id: 'rhetoric-intent', props: { bare: true }, layout: { direction: 'column', gap: 6, padding: 0, ...(!view.reducedMotion && (view.phase === 'reveal-intent' || view.phase === 'enemy-intent') ? { anim: 'pop' } : {}) }, children: [
          { type: 'Label', id: 'rhetoric-intent-title', props: { text: `对手意图 · ${intent.label}`, size: 20, bold: true, color: 'gold' } },
          { type: 'Label', id: 'rhetoric-intent-preview', props: { text: intent.preview, size: 17, color: 'text' } },
          { type: 'Label', id: 'rhetoric-intent-pressure', props: { text: `影响：压力 +${pressure}`, size: 17, color: 'danger' } },
        ] },
        { type: 'Label', id: 'rhetoric-semantic-live', props: { text: publicAnnouncement(view, config), size: 17, color: 'sub' } },
        ...(debug ? [{ type: 'Label', id: 'rhetoric-debug-phase', props: { text: `phase=${view.phase}`, size: 'xs', color: 'sub' } } as LayoutNode] : []),
      ] },
      { type: 'Panel', id: 'rhetoric-opponent-shade', props: { bg: { custom: 'linear-gradient(270deg,rgba(4,6,7,.96),rgba(4,6,7,.58) 72%,rgba(4,6,7,0))' }, bare: true }, layout: { x: 1077, y: 18, width: 363, height: 336, padding: 14, allowOverlap: true } },
      { type: 'Panel', id: 'rhetoric-opponent-copy', props: { bare: true }, layout: { x: 1113, y: 33, width: 291, direction: 'column', gap: 7, padding: 0 }, children: [
        { type: 'Label', id: 'rhetoric-opponent-name', props: { text: config.encounter.displayName, font: 'serif', size: 26, bold: true, color: 'gold', stroke: true } },
        { type: 'Label', id: 'rhetoric-opponent-subtitle', props: { text: config.encounter.opponentSubtitle, size: 17, color: 'sub' } },
        meterNode('rhetoric-progress', '进度', view.snapshot.progress, config.encounter.target, 'gold', 291, previousMeterValue(view, 'progress')),
        { type: 'Label', id: 'rhetoric-turn', props: { text: `${Math.min(config.encounter.turnLimit, view.snapshot.turns + 1)} / ${config.encounter.turnLimit} 回合`, size: 17, bold: true, color: 'gold' } },
      ] },
      ...(flightCard ? [flightCard] : []),
      { type: 'Panel', id: 'rhetoric-bottom-shade', props: { bg: { custom: 'linear-gradient(180deg,rgba(3,5,7,0),rgba(3,5,7,.96) 24%)' }, bare: true }, layout: { x: 0, y: 495, width: 1440, height: 405, padding: 0, allowOverlap: true } },
      { type: 'Panel', id: 'rhetoric-resources', props: { bg: { custom: 'rgba(5,7,10,.94)' }, edge: 'gold' }, layout: { x: 12, y: 603, width: 177, direction: 'column', gap: 9, padding: 8, radius: 8 }, children: [
        { ...meterNode('rhetoric-pressure', '压力', view.snapshot.pressure, config.encounter.pressureLimit, 'danger', 100, previousMeterValue(view, 'pressure')), layout: { ...meterNode('rhetoric-pressure', '压力', view.snapshot.pressure, config.encounter.pressureLimit, 'danger', 100, previousMeterValue(view, 'pressure')).layout, ...(!view.reducedMotion && view.phase === 'enemy-impact' ? { fx: [{ kind: 'shake' as const, once: true }] } : {}) } },
        { type: 'Panel', id: 'rhetoric-focus', props: { bare: true }, layout: { direction: 'row', align: 'center', justify: 'between', ...(!view.reducedMotion && view.phase === 'focus-refresh' ? { fx: [{ kind: 'pop' as const, once: true }] } : {}) }, children: [
          { type: 'Label', id: 'rhetoric-focus-label', props: { text: '专注', size: 17, color: 'text' } },
          { type: 'Label', id: 'rhetoric-focus-value', props: { text: `${'●'.repeat(Math.max(0, view.snapshot.focus))}${'○'.repeat(Math.max(0, config.encounter.focusPerTurn - view.snapshot.focus))}`, size: 17, bold: true, color: 'gold' } },
        ] },
        { type: 'Label', id: 'rhetoric-piles', props: { text: `牌库 ${view.snapshot.deck.length} · 弃牌 ${view.snapshot.discard.length}`, size: 17, color: 'sub' } },
      ] },
      { type: 'Panel', id: 'rhetoric-hand', props: { bare: true }, layout: { x: handLayout.x, y: handLayout.y, width: handLayout.width, height: handLayout.height, direction: 'row', align: 'center', justify: 'center', gap: handLayout.gap }, children: visibleHand.map((cardId, index) => handCardNode(cardId, index, view, skins, handLayout, drawnCount)) },
      { type: 'Panel', id: 'rhetoric-actions', props: { bare: true }, layout: { x: 1185, y: 561, width: 255, direction: 'column', align: 'center', gap: 8 }, children: [
        { type: 'Panel', id: 'rhetoric-pile-row', props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 12, padding: 0 }, children: [
          { type: 'Image', id: 'rhetoric-deck-back', props: { src: resolveRhetoricSkin(skins, RHETORIC_CARD_BACK_KEY, FALLBACK_CARD_BACK), alt: '牌库', fit: 'cover', radius: 4 }, layout: { width: 48, height: 68 } },
          discardPileNode(view, skins),
        ] },
        commandNode('rhetoric-end-turn', '结束回合', END_TURN_ACTION, !view.busy && !view.result, true),
        commandNode('rhetoric-exit', '退出', EXIT_ACTION, !view.busy),
      ] },
      ...(discardFlightCard ? [discardFlightCard] : []),
    ],
  };
}

export function catalogCompleteness(): boolean {
  return RHETORIC_CATALOG.every((card) => card.skinKey === `game-rhetoric-duel/card/${card.cardId}`);
}
