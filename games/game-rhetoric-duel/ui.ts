import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { buildStarterResult } from '@zerocraft/engine/ui/starters/index.js';
import { END_TURN_ACTION, PLAY_CARD_ACTION } from './blueprint.js';
import { RHETORIC_CATALOG, type RhetoricGameConfig } from './config.js';
import { cardForView, EXIT_ACTION, SKIP_PRESENTATION_ACTION, type RhetoricPresentationView } from './presentation-controller.js';

const FALLBACK_CARD_FACE = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 140%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x2=%221%22 y2=%221%22%3E%3Cstop stop-color=%22%23351b2a%22/%3E%3Cstop offset=%221%22 stop-color=%22%2376424e%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%22100%22 height=%22140%22 rx=%2210%22 fill=%22url(%23g)%22/%3E%3Cpath d=%22M14 16h72M14 124h72%22 stroke=%22%23d9ad62%22 stroke-width=%222%22/%3E%3Ccircle cx=%2250%22 cy=%2270%22 r=%2227%22 fill=%22none%22 stroke=%22%23d9ad62%22 stroke-width=%222%22/%3E%3Ctext x=%2250%22 y=%2283%22 text-anchor=%22middle%22 font-size=%2244%22 fill=%22%23f4dfae%22%3E%E8%A8%80%3C/text%3E%3C/svg%3E';

function disabledReason(cardId: string, view: RhetoricPresentationView): string | undefined {
  const card = cardForView(cardId);
  if (view.busy) return `演出中：${view.phase}`;
  if (!card) return '未知卡牌';
  if (card.focusCost > view.snapshot.focus) return `专注不足（需要 ${card.focusCost}）`;
  if (view.result) return '交锋已结束';
  return undefined;
}

function cardNode(cardId: string, index: number, view: RhetoricPresentationView): LayoutNode {
  const card = cardForView(cardId)!;
  const disabled = disabledReason(cardId, view);
  const playedIndex = view.transition?.kind === 'card-played' && view.transition.cardId
    ? view.transition.before.hand.indexOf(view.transition.cardId) : -1;
  const selected = playedIndex === index && (view.phase === 'card-lift' || view.phase === 'card-flight');
  const previous = new Map<string, number>();
  for (const previousId of view.transition?.before.hand ?? []) previous.set(previousId, (previous.get(previousId) ?? 0) + 1);
  const drawnIndexes = new Set<number>();
  view.snapshot.hand.forEach((id, handIndex) => {
    const count = previous.get(id) ?? 0;
    if (count > 0) previous.set(id, count - 1); else drawnIndexes.add(handIndex);
  });
  const isDrawn = (view.phase === 'deal-opening-hand' || view.phase === 'deal-new-cards') && drawnIndexes.has(index);
  return {
    type: 'Panel', id: `rhetoric-card-${index}-${cardId}`,
    props: { bg: disabled ? 'panel' : 'raised', edge: selected ? 'gold' : 'jade', ...(!disabled ? { action: PLAY_CARD_ACTION, actionArg: cardId } : {}) },
    layout: {
      direction: 'column', align: 'center', gap: 4, padding: 7, width: 118, height: 206,
      ...(selected ? { scale: 1.08, opacity: view.phase === 'card-flight' ? 0 : 1, fx: [{ kind: 'glow', color: 'gold' as const }] } : {}),
      ...(isDrawn && !view.reducedMotion ? { anim: 'dealIn', animDelay: index * 90, animMs: 420 } : {}),
      press3d: !disabled,
    },
    children: [
      { type: 'PlayingCard', id: `rhetoric-card-face-${index}-${card.skinKey}`, props: { rank: String(card.focusCost), suit: '✦', face: 'dark', size: 'md', faceArt: FALLBACK_CARD_FACE, label: card.displayName, value: `◈${card.focusCost}`, dimmed: Boolean(disabled) } },
      { type: 'Label', id: `rhetoric-card-name-${index}`, props: { text: card.displayName, size: 'sm', bold: true, color: disabled ? 'dim' : 'gold' } },
      { type: 'Label', id: `rhetoric-card-effect-${index}`, props: { text: card.effects.map((effect) => `${effect.targetId}${effect.value >= 0 ? '+' : ''}${effect.value}`).join(' · '), size: 'xs', bold: true, color: disabled ? 'dim' : 'text' } },
      { type: 'Label', id: `rhetoric-card-flavor-${index}`, props: { text: card.flavorText, size: 'xs', color: 'sub' } },
      ...(disabled ? [{ type: 'Label', id: `rhetoric-card-disabled-${index}`, props: { text: disabled, size: 'xs', color: 'danger' } } as LayoutNode] : []),
    ],
  };
}

function resultScreen(view: RhetoricPresentationView): LayoutNode {
  const win = view.result === 'win';
  const tree = buildStarterResult({ title: win ? '论证成立' : '交锋失利', stars: win ? 3 : 0, score: view.snapshot.progress, retryAction: EXIT_ACTION });
  const card = tree.children?.find((node) => node.id === 'starter-res-card');
  tree.props = { fill: true, bg: { custom: 'linear-gradient(90deg,rgba(3,5,8,.62),transparent 62%)' } };
  tree.layout = { direction: 'column', padding: 0 };
  if (card?.children) {
    card.layout = { ...card.layout, x: 64, y: 252, width: 430, padding: 28 };
    card.children.splice(1, 0, {
      type: 'Label', id: 'rhetoric-result-reason',
      props: { text: win ? '对手已接受你的论证。' : view.snapshot.phase === 'defeat-pressure' ? '压力达到上限，论证被迫中止。' : '回合耗尽，未能及时完成论证。', size: 'md', color: win ? 'ok' : 'danger' },
    });
    const button = card.children.flatMap((node) => node.children ?? []).find((node) => node.id === 'starter-res-retry');
    if (button?.type === 'Button') button.props = { label: '返回游戏库', kind: 'hero', action: EXIT_ACTION };
  }
  return tree;
}

export function buildRhetoricDuelUI(view: RhetoricPresentationView, config: RhetoricGameConfig, preview = true): LayoutNode {
  if (view.phase === 'result-panel' && view.result) return resultScreen(view);
  if (view.phase === 'camera') return {
    type: 'Screen', id: 'rhetoric-duel', props: { fill: true, bg: { custom: 'transparent' } },
    layout: { padding: 0 },
    children: [{ type: 'Particles', id: 'rhetoric-camera-dust', props: { kind: 'sparkle', count: 12, loop: true, color: '#d6af69' } }],
  };
  const intent = config.encounter.intentions[Math.min(config.encounter.intentions.length - 1, view.snapshot.turns)]!;
  return {
    type: 'Screen', id: 'rhetoric-duel', props: { fill: true, bg: { custom: 'transparent' } },
    layout: { padding: 0 },
    children: [
      { type: 'Particles', id: 'rhetoric-ambience', props: { kind: 'sparkle', count: 16, loop: true, color: '#d6af69' } },
      { type: 'Panel', id: 'rhetoric-record', props: { bg: { custom: 'rgba(3,5,8,.70)' }, edge: 'gold', glass: true }, layout: { x: 52, y: 54, width: 470, height: 320, direction: 'column', gap: 9, padding: 18 }, children: [
        { type: 'Panel', id: 'rhetoric-title-group', props: { bare: true }, layout: { direction: 'row', align: 'center', justify: 'between' }, children: [
          { type: 'Label', id: 'rhetoric-title', props: { text: '言弹交锋', font: 'cnbrush', size: 'xxxl', bold: true, color: 'gold', stroke: true } },
          ...(preview ? [{ type: 'Badge', id: 'rhetoric-preview', props: { text: '开发预览', tone: 'warn' } } as LayoutNode] : []),
        ] },
        { type: 'Label', id: 'rhetoric-objective', props: { text: config.encounter.objective, size: 'md', color: 'text' } },
        { type: 'Divider', id: 'rhetoric-record-divider', props: {} },
        { type: 'Panel', id: 'rhetoric-intent', props: { bg: { custom: 'rgba(92,35,45,.38)' }, edge: view.phase === 'reveal-intent' || view.phase === 'enemy-intent' ? 'danger' : 'gold', shape: 'ribbon' }, layout: { direction: 'column', gap: 7, padding: 13, ...(!view.reducedMotion && (view.phase === 'reveal-intent' || view.phase === 'enemy-intent') ? { anim: 'pop', fx: [{ kind: 'glow', color: 'danger' as const }] } : {}) }, children: [
          { type: 'Label', id: 'rhetoric-intent-title', props: { text: `下一意图 · ${intent.label}`, size: 'xl', bold: true, color: 'danger' } },
          { type: 'Label', id: 'rhetoric-intent-preview', props: { text: `“${intent.preview}”`, size: 'md', color: 'text' } },
          { type: 'Badge', id: 'rhetoric-intent-pressure', props: { text: `预告压力 +${intent.effects.filter((effect) => effect.targetId === 'pressure').reduce((sum, effect) => sum + effect.value, 0)}`, tone: 'danger' } },
        ] },
        { type: 'Label', id: 'rhetoric-semantic-live', props: { text: view.announcement || '准备交锋', size: 'sm', color: 'sub' } },
      ] },
      { type: 'Panel', id: 'rhetoric-opponent-copy', props: { bg: { custom: 'rgba(3,5,8,.66)' }, edge: 'gold', glass: true }, layout: { x: 1082, y: 54, width: 306, direction: 'column', gap: 10, padding: 16 }, children: [
        { type: 'Label', id: 'rhetoric-opponent-name', props: { text: config.encounter.displayName, font: 'serif', size: 'xxxl', bold: true, color: 'gold' } },
        { type: 'Label', id: 'rhetoric-opponent-subtitle', props: { text: config.encounter.opponentSubtitle, size: 'md', color: 'sub' } },
        { type: 'Label', id: 'rhetoric-goal-copy', props: { text: `目标：${config.encounter.objective}`, size: 'sm', color: 'text' } },
        { type: 'ProgressBar', id: 'rhetoric-progress', props: { label: '论证进度', value: view.snapshot.progress, max: config.encounter.target, tone: 'gold', showValue: true } },
        { type: 'Panel', id: 'rhetoric-meta', props: { bare: true }, layout: { direction: 'row', justify: 'between' }, children: [
          { type: 'Badge', id: 'rhetoric-turn', props: { text: `回合 ${Math.min(config.encounter.turnLimit, view.snapshot.turns + 1)} / ${config.encounter.turnLimit}`, tone: 'gold' } },
          { type: 'Badge', id: 'rhetoric-phase', props: { text: view.phase, tone: view.busy ? 'warn' : 'ok' } },
        ] },
      ] },
      { type: 'Panel', id: 'rhetoric-bottom-shade', props: { bg: { custom: 'rgba(3,5,8,.88)' }, edge: 'gold' }, layout: { x: 28, y: 628, width: 1384, height: 246, padding: 12, allowOverlap: true } },
      { type: 'Panel', id: 'rhetoric-resources', props: { bare: true }, layout: { x: 46, y: 653, width: 250, direction: 'column', gap: 12 }, children: [
        { type: 'ProgressBar', id: 'rhetoric-pressure', props: { label: '压力', value: view.snapshot.pressure, max: config.encounter.pressureLimit, tone: 'danger', showValue: true }, layout: !view.reducedMotion && view.phase === 'enemy-impact' ? { fx: [{ kind: 'shake' as const, once: true }] } : {} },
        { type: 'ProgressBar', id: 'rhetoric-focus', props: { label: '专注', value: view.snapshot.focus, max: config.encounter.focusPerTurn, tone: 'accent', showValue: true }, layout: !view.reducedMotion && view.phase === 'focus-refresh' ? { fx: [{ kind: 'pop' as const, once: true }] } : {} },
        { type: 'Badge', id: 'rhetoric-piles', props: { text: `牌库 ${view.snapshot.deck.length} · 弃牌 ${view.snapshot.discard.length}`, tone: 'dim' } },
      ] },
      { type: 'Panel', id: 'rhetoric-hand', props: { bare: true }, layout: { x: 312, y: 646, width: 830, height: 220, direction: 'row', align: 'end', justify: 'center', gap: 8 }, children: view.snapshot.hand.map((cardId, index) => cardNode(cardId, index, view)) },
      { type: 'Panel', id: 'rhetoric-actions', props: { bare: true }, layout: { x: 1162, y: 660, width: 220, direction: 'column', align: 'stretch', gap: 12 }, children: [
        { type: 'Button', id: 'rhetoric-end-turn', props: { label: '结束回合', kind: 'hero', action: END_TURN_ACTION, disabled: view.busy || Boolean(view.result) }, layout: { press3d: true, fx: [{ kind: 'sheen-hover' }] } },
        { type: 'Button', id: 'rhetoric-skip', props: { label: '跳过演出', kind: 'primary', action: SKIP_PRESENTATION_ACTION, disabled: !view.busy } },
        { type: 'Button', id: 'rhetoric-exit', props: { label: '退出', kind: 'quiet', action: EXIT_ACTION, disabled: view.busy } },
      ] },
    ],
  };
}

export function catalogCompleteness(): boolean { return RHETORIC_CATALOG.every((card) => card.skinKey === `skin.card.${card.cardId}`); }
