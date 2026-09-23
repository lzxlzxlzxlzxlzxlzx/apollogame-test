import type { ActionSink } from '@zerocraft/engine/ui/components/index.js';
import { RHETORIC_CATALOG, type RhetoricCard } from './config.js';
import { END_TURN_ACTION, PLAY_CARD_ACTION } from './blueprint.js';
import { projectRhetoricTransition, type RhetoricPresentationTransition } from './presentation.js';
import { RhetoricDuelSession, type RhetoricSnapshot } from './session.js';

export const SKIP_PRESENTATION_ACTION = 'rhetoric.skip-presentation';
export const EXIT_ACTION = 'rhetoric.exit';
export type RhetoricGameResult = 'win' | 'loss' | 'exited';

export type RhetoricPresentationView = Readonly<{
  snapshot: RhetoricSnapshot;
  phase: string;
  busy: boolean;
  reducedMotion: boolean;
  transition?: RhetoricPresentationTransition;
  announcement: string;
  result?: 'win' | 'loss';
}>;

type ControllerOptions = Readonly<{
  reducedMotion?: boolean;
  onResult?: (result: RhetoricGameResult) => void;
  onExit?: () => void;
}>;

const cardById = new Map(RHETORIC_CATALOG.map((card) => [card.cardId, card] as const));
const isTerminal = (snapshot: RhetoricSnapshot): boolean => snapshot.phase === 'victory' || snapshot.phase.startsWith('defeat-');

function phaseSnapshot(transition: RhetoricPresentationTransition, phase: string): RhetoricSnapshot {
  if (transition.kind === 'enter') return phase === 'camera' || phase === 'reveal-intent' ? transition.before : transition.after;
  if (transition.kind === 'card-played') return phase === 'card-lift' || phase === 'card-flight' ? transition.before : transition.after;
  if (transition.kind === 'enemy-turn') {
    if (phase === 'round-end' || phase === 'enemy-intent') return transition.before;
    if (phase === 'enemy-impact') return { ...transition.before, pressure: transition.after.pressure };
    if (phase === 'focus-refresh') return { ...transition.before, pressure: transition.after.pressure, focus: transition.after.focus, turns: transition.after.turns };
    return transition.after;
  }
  return transition.after;
}

function deltaText(transition: RhetoricPresentationTransition, phase: string): string {
  const names = { progress: '论证', pressure: '压力', focus: '专注' } as const;
  const allowed = transition.kind === 'enemy-turn'
    ? phase === 'enemy-impact' ? ['pressure'] : phase === 'focus-refresh' ? ['focus'] : []
    : phase === 'impact' ? ['progress', 'pressure', 'focus'] : [];
  return (transition.resourceDelta ?? [])
    .filter((delta) => allowed.includes(delta.resourceId))
    .map((delta) => `${names[delta.resourceId]}${delta.value > 0 ? '+' : ''}${delta.value}`)
    .join('，');
}

function announcementFor(transition: RhetoricPresentationTransition, phase: string): string {
  if (transition.kind === 'enter' && phase === 'reveal-intent') return `对手意图：${transition.intentId ?? '未知'}`;
  if (transition.kind === 'card-played' && phase === 'impact') {
    const card = transition.cardId ? cardById.get(transition.cardId) : undefined;
    const delta = deltaText(transition, phase);
    return `打出言弹：${card?.displayName ?? transition.cardId ?? '未知'}${delta ? `；${delta}` : ''}`;
  }
  if (transition.kind === 'enemy-turn' && phase === 'enemy-impact') {
    const delta = deltaText(transition, phase);
    return `对手执行意图：${transition.intentId ?? '未知'}${delta ? `；${delta}` : ''}`;
  }
  if (transition.kind === 'enemy-turn' && phase === 'focus-refresh') return deltaText(transition, phase);
  if (transition.kind === 'terminal' && phase === 'result-panel') return transition.outcome === 'win' ? '交锋胜利' : '交锋失败';
  return '';
}

/** Render-only controller. It consumes committed transitions; no phase ever writes to the simulation. */
export class RhetoricPresentationController implements ActionSink {
  private readonly pending: RhetoricPresentationTransition[] = [];
  private active?: RhetoricPresentationTransition;
  private projection?: Extract<ReturnType<typeof projectRhetoricTransition>, { accepted: true }>['controller'];
  private shown: RhetoricSnapshot;
  private phaseName = 'ready';
  private spoken = '';
  private submitted?: RhetoricGameResult;
  private closed = false;

  constructor(readonly session: RhetoricDuelSession, private readonly options: ControllerOptions = {}) {
    this.shown = session.snapshot();
    this.pending.push(...session.takeTransitions());
    this.startNext();
  }

  get view(): RhetoricPresentationView {
    return {
      snapshot: this.shown,
      phase: this.phaseName,
      busy: this.busy,
      reducedMotion: this.options.reducedMotion === true,
      ...(this.active ? { transition: this.active } : {}),
      announcement: this.spoken,
      ...(isTerminal(this.shown) ? { result: this.shown.phase === 'victory' ? 'win' : 'loss' } : {}),
    };
  }

  get busy(): boolean { return this.pending.length > 0 || (this.phaseName !== 'ready' && this.phaseName !== 'result-panel'); }
  get result(): RhetoricGameResult | undefined { return this.submitted; }

  enqueueAction(name: string, value?: { arg?: string }): void {
    if (name === SKIP_PRESENTATION_ACTION) { this.skip(); return; }
    if (name === EXIT_ACTION) {
      if (this.busy) return;
      if (!this.submitted) this.submit('exited');
      if (!this.closed) { this.closed = true; this.options.onExit?.(); }
      return;
    }
    if (this.busy || isTerminal(this.session.snapshot())) return;
    if (name === PLAY_CARD_ACTION && value?.arg) {
      this.session.play(value.arg);
      this.queueCommitted(this.session.takeTransitions());
    } else if (name === END_TURN_ACTION) {
      this.session.endTurn();
      this.queueCommitted(this.session.takeTransitions());
    }
  }

  playVisibleCard(index: number): void {
    const cardId = this.session.snapshot().hand[index];
    if (cardId) this.enqueueAction(PLAY_CARD_ACTION, { arg: cardId });
  }

  advance(): string {
    if (!this.projection || !this.active) return this.phaseName;
    if (this.projection.settled) {
      if (this.pending.length > 0) this.startNext();
      return this.phaseName;
    }
    this.phaseName = this.projection.advance();
    this.shown = phaseSnapshot(this.active, this.phaseName);
    const announcement = announcementFor(this.active, this.phaseName);
    if (announcement) this.spoken = announcement;
    if (this.projection.settled) {
      if (this.active.kind === 'terminal') this.submit(this.active.outcome === 'win' ? 'win' : 'loss');
      if (this.pending.length === 0 && this.phaseName === 'ready') { this.active = undefined; this.projection = undefined; }
    }
    return this.phaseName;
  }

  skip(): void {
    if (!this.active && this.pending.length === 0) return;
    const last = this.pending[this.pending.length - 1] ?? this.active;
    if (!last) return;
    this.shown = last.after;
    this.pending.length = 0;
    this.active = last.kind === 'terminal' ? last : undefined;
    this.projection = undefined;
    this.phaseName = last.kind === 'terminal' ? 'result-panel' : 'ready';
    this.spoken = announcementFor(last, this.phaseName);
    if (last.kind === 'terminal') this.submit(last.outcome === 'win' ? 'win' : 'loss');
  }

  recoverAfterBlur(): void { if (this.busy) this.skip(); }

  private queueCommitted(transitions: readonly RhetoricPresentationTransition[]): void {
    if (transitions.length === 0) return;
    this.pending.push(...transitions);
    if (!this.active) this.startNext();
  }

  private startNext(): void {
    const next = this.pending.shift();
    if (!next) return;
    const projected = projectRhetoricTransition(next, this.options.reducedMotion === true);
    if (!projected.accepted) { this.shown = next.after; this.startNext(); return; }
    this.active = next;
    this.projection = projected.controller;
    this.phaseName = projected.controller.phase;
    this.shown = phaseSnapshot(next, this.phaseName);
    const announcement = announcementFor(next, this.phaseName);
    if (announcement) this.spoken = announcement;
  }

  private submit(result: RhetoricGameResult): void {
    if (this.submitted) return;
    this.submitted = result;
    this.options.onResult?.(result);
  }
}

export function cardForView(cardId: string): RhetoricCard | undefined { return cardById.get(cardId); }
export function visibleDelta(view: RhetoricPresentationView): string { return view.transition ? deltaText(view.transition, view.phase) : ''; }
