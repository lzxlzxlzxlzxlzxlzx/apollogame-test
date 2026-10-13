import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { applyCommands } from '@zerocraft/engine/net/commands.js';
import { QueuedInputSource } from '@zerocraft/engine/net/host/queued-input.js';
import type { PresentationPlayback } from '@zerocraft/engine/engine/protocol/components.js';
import { buildCardRevealBlueprint, type CardPresentation } from './blueprint.js';
import { ACTION } from './tracks.js';
import type { MotionMode } from './timing.js';

export type RevealPhase = 'idle' | 'P2' | 'P3' | 'P4' | 'P5';
export interface RevealView { readonly status: 'idle' | 'playing' | 'paused' | 'terminal'; readonly phase: RevealPhase; readonly completion?: 'natural' | 'skipped' }

/** Input adapter and read-only playback projection; no per-frame animation calculation. */
export class CardRevealSession {
  readonly input = new QueuedInputSource('card-reveal');
  readonly engine = new Engine({ input: this.input });
  private readonly count: number;
  constructor(cards: readonly CardPresentation[], mode: MotionMode = 'standard') {
    this.count = cards.length;
    this.engine.load(buildCardRevealBlueprint(cards, mode));
    this.input.enqueueAction(ACTION.start);
  }
  tick(): void {
    applyCommands(this.engine.world, this.input.commandsForTick(this.engine.world.getVersion() + 1));
    this.engine.world.tick();
  }
  action(name: string): void {
    const state = this.view();
    if (name === ACTION.skip && state.status !== 'playing') return;
    if (name === ACTION.pause && state.status !== 'playing') return;
    if (name === ACTION.resume && state.status !== 'paused') return;
    if (name !== ACTION.skip && name !== ACTION.pause && name !== ACTION.resume) return;
    this.input.enqueueAction(name);
  }
  private playback(id: string): PresentationPlayback | undefined { return this.engine.world.getComponent<PresentationPlayback>(id, 'PresentationPlayback'); }
  view(): RevealView {
    if (this.playback('a-final-clock')?.done) return { status: 'terminal', phase: 'P5', completion: 'skipped' };
    if (this.playback('p5-clock')?.done) return { status: 'terminal', phase: 'P5', completion: 'natural' };
    const p5 = this.playback('p5-clock')?.status;
    if (p5 === 'playing' || p5 === 'paused') return { status: p5, phase: 'P5' };
    for (let i = 0; i < this.count; i++) {
      const status = this.playback(`p4-fly-${i}`)?.status;
      if (status === 'playing' || status === 'paused') return { status, phase: 'P4' };
    }
    for (const [phase, id] of [['P3', 'p3-card-0'], ['P2', 'p2-pack-3']] as const) {
      const status = this.playback(id)?.status;
      if (status === 'playing' || status === 'paused') return { status, phase };
    }
    // The capability posts doneSignal on the next Resolve tick; preserve phase during that seam.
    for (let i = 0; i < this.count; i++) if (this.playback(`p4-fly-${i}`)?.done) return { status: 'playing', phase: 'P4' };
    if (this.playback('p3-card-0')?.done) return { status: 'playing', phase: 'P3' };
    if (this.playback('p2-pack-3')?.done) return { status: 'playing', phase: 'P2' };
    return { status: 'idle', phase: 'idle' };
  }
}
