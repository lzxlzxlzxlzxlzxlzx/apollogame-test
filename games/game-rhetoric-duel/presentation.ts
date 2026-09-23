import {
  projectCommittedTransition,
  type PresentationCatalog,
  type PresentationProjection,
} from '@zerocraft/engine/services/presentation/committed-transition.js';
import type { RhetoricSnapshot } from './session.js';

export type RhetoricResourceDelta = Readonly<{ resourceId: 'progress' | 'pressure' | 'focus'; value: number }>;
export type RhetoricPresentationTransition = Readonly<{
  before: RhetoricSnapshot;
  after: RhetoricSnapshot;
  kind: 'enter' | 'card-played' | 'enemy-turn' | 'terminal';
  cardId?: string;
  drawnCardIds?: readonly string[];
  resourceDelta?: readonly RhetoricResourceDelta[];
  intentId?: string;
  outcome?: 'win' | 'loss';
}>;

export const RHETORIC_PRESENTATION_PHASES = [
  'camera', 'reveal-intent', 'deal-opening-hand', 'ready',
  'card-lift', 'card-flight', 'impact', 'opponent-response',
  'round-end', 'enemy-intent', 'enemy-impact', 'focus-refresh', 'deal-new-cards',
  'victory-impact', 'portrait-resolve', 'failure-impact', 'portrait-dominates', 'result-panel',
] as const;

const catalog = (terminal: readonly string[]): PresentationCatalog => ({
  phases: RHETORIC_PRESENTATION_PHASES,
  settledPhases: ['ready', 'result-panel'],
  sequences: {
    enter: ['camera', 'reveal-intent', 'deal-opening-hand', 'ready'],
    'card-played': ['card-lift', 'card-flight', 'impact', 'opponent-response', 'ready'],
    'enemy-turn': ['round-end', 'enemy-intent', 'enemy-impact', 'focus-refresh', 'deal-new-cards', 'ready'],
    terminal,
  },
});

export const RHETORIC_PRESENTATION_CATALOG = catalog(['victory-impact', 'portrait-resolve', 'result-panel']);
export const RHETORIC_LOSS_PRESENTATION_CATALOG = catalog(['failure-impact', 'portrait-dominates', 'result-panel']);

export function resourceDelta(before: RhetoricSnapshot, after: RhetoricSnapshot): RhetoricResourceDelta[] {
  return (['progress', 'pressure', 'focus'] as const)
    .map((resourceId) => ({ resourceId, value: after[resourceId] - before[resourceId] }))
    .filter((entry) => entry.value !== 0);
}

export function drawnCardIds(before: readonly string[], after: readonly string[]): string[] {
  const remaining = new Map<string, number>();
  for (const cardId of before) remaining.set(cardId, (remaining.get(cardId) ?? 0) + 1);
  const drawn: string[] = [];
  for (const cardId of after) {
    const count = remaining.get(cardId) ?? 0;
    if (count > 0) remaining.set(cardId, count - 1); else drawn.push(cardId);
  }
  return drawn;
}

export function enterTransition(before: RhetoricSnapshot, after: RhetoricSnapshot): RhetoricPresentationTransition {
  return { kind: 'enter', before, after, drawnCardIds: drawnCardIds(before.hand, after.hand), resourceDelta: resourceDelta(before, after), intentId: after.intentId };
}

export function cardPlayedTransition(before: RhetoricSnapshot, after: RhetoricSnapshot, cardId: string): RhetoricPresentationTransition {
  return { kind: 'card-played', before, after, cardId, resourceDelta: resourceDelta(before, after) };
}

export function enemyTurnTransition(before: RhetoricSnapshot, after: RhetoricSnapshot, intentId?: string): RhetoricPresentationTransition {
  return { kind: 'enemy-turn', before, after, drawnCardIds: drawnCardIds(before.hand, after.hand), resourceDelta: resourceDelta(before, after), ...(intentId ? { intentId } : {}) };
}

export function terminalTransition(before: RhetoricSnapshot, after: RhetoricSnapshot): RhetoricPresentationTransition {
  return { kind: 'terminal', before, after, resourceDelta: resourceDelta(before, after), outcome: after.phase === 'victory' ? 'win' : 'loss' };
}

export function projectRhetoricTransition(transition: RhetoricPresentationTransition, reducedMotion = false): PresentationProjection<RhetoricSnapshot> {
  const chosen = transition.kind === 'terminal' && transition.outcome === 'loss' ? RHETORIC_LOSS_PRESENTATION_CATALOG : RHETORIC_PRESENTATION_CATALOG;
  return projectCommittedTransition(chosen, transition, reducedMotion);
}
