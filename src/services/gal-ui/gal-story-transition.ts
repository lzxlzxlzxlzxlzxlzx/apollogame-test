import type { NarrativeProjection } from '@skills/tier3/narrative-director.js';
import { NarrativeTransitionPolicy, type NarrativeTransitionPhase } from '../presentation/narrative-transition-policy.js';
import type { GalPlaybackClock } from './gal-playback-scheduler.js';

export interface GalStoryTransitionVeil {
  readonly phase: Exclude<NarrativeTransitionPhase, 'settled'>;
  readonly opacity: number;
}
const OPACITY: Readonly<Record<GalStoryTransitionVeil['phase'], number>> = {
  'fade-out': 0.86, 'fade-in': 0.34, wipe: 0.72, dissolve: 0.5,
};
const STEP_MS = 280;

/** Host-owned scene veil. A line without a scripted transition, or a disabled preference, stays cut. */
export class GalStoryTransitionPresenter {
  private readonly policy = new NarrativeTransitionPolicy();
  private key = '';
  private cancel?: () => void;
  veil: GalStoryTransitionVeil | null = null;

  constructor(private readonly clock: GalPlaybackClock | undefined, private readonly onStep: () => void) {}

  sync(source: (Pick<NarrativeProjection, 'packageId' | 'chapterId' | 'nodeId' | 'transition'> & { readonly visit?: string }) | null,
    preferences: { readonly storyTransitions: boolean; readonly reducedMotion: boolean }, active: boolean): void {
    if (!active || !source) { this.halt(); return; }
    const key = `${source.visit ?? ''}\0${source.packageId}\0${source.chapterId}\0${source.nodeId}\0${source.transition ?? ''}\0${preferences.storyTransitions}\0${preferences.reducedMotion}`;
    if (key === this.key) return;
    this.cancel?.();
    this.cancel = undefined;
    this.key = key;
    const result = this.policy.project({
      packageId: source.packageId, chapterId: source.chapterId, nodeId: source.nodeId,
      ...(source.transition ? { transition: source.transition } : {}),
    }, { enabled: preferences.storyTransitions, reducedMotion: preferences.reducedMotion });
    this.veil = result.accepted ? veilOf(result.frame.phase) : null;
    if (result.accepted && !result.frame.settled) this.arm(result.token);
  }

  stop(): void { this.halt(); this.policy.stop(); }

  private arm(token: { readonly kind: 'narrative-transition-token' }): void {
    if (!this.clock) {
      this.policy.skip(token);
      this.veil = null;
      return;
    }
    this.cancel = this.clock.schedule(STEP_MS, () => {
      this.cancel = undefined;
      const next = this.policy.advance(token);
      this.veil = next.accepted ? veilOf(next.frame.phase) : null;
      this.onStep();
      if (next.accepted && !next.frame.settled) this.arm(token);
    });
  }

  private halt(): void {
    this.cancel?.();
    this.cancel = undefined;
    this.key = '';
    this.veil = null;
    this.policy.stop();
  }
}

function veilOf(phase: NarrativeTransitionPhase): GalStoryTransitionVeil | null {
  if (phase === 'settled') return null;
  return { phase, opacity: OPACITY[phase] };
}
