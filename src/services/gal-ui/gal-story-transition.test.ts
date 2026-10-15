import { describe, expect, it } from 'vitest';
import { GalStoryTransitionPresenter } from './gal-story-transition.js';
import type { GalPlaybackClock } from './gal-playback-scheduler.js';

const line = (nodeId: string, transition?: 'cut' | 'fade' | 'wipe' | 'dissolve') =>
  ({ packageId: 'pkg', chapterId: 'a', nodeId, transition });

function clock(): { clock: GalPlaybackClock; fire: () => void } {
  let pending: (() => void) | undefined;
  return { clock: { now: () => 0, schedule: (_delay, fire) => { pending = fire; return () => { pending = undefined; }; } },
    fire: () => { const current = pending; pending = undefined; current?.(); } };
}

describe('GAL story transition consumer', () => {
  it('keeps an unscripted demo line cut even when the preference is on', () => {
    const steps = clock();
    const presenter = new GalStoryTransitionPresenter(steps.clock, () => undefined);
    presenter.sync(line('intro'), { storyTransitions: true, reducedMotion: false }, true);
    expect(presenter.veil).toBeNull();
    steps.fire();
    expect(presenter.veil).toBeNull();
  });

  it('shows a scripted fade and settles after the host clock steps it', () => {
    const steps = clock();
    let redraws = 0;
    const presenter = new GalStoryTransitionPresenter(steps.clock, () => { redraws += 1; });
    presenter.sync(line('door', 'fade'), { storyTransitions: true, reducedMotion: false }, true);
    expect(presenter.veil).toEqual({ phase: 'fade-out', opacity: 0.86 });
    steps.fire();
    expect(presenter.veil).toEqual({ phase: 'fade-in', opacity: 0.34 });
    steps.fire();
    expect(presenter.veil).toBeNull();
    expect(redraws).toBe(2);
  });

  it('cuts a scripted wipe when the preference or reduced motion is off', () => {
    const presenter = new GalStoryTransitionPresenter(undefined, () => undefined);
    presenter.sync(line('door', 'wipe'), { storyTransitions: false, reducedMotion: false }, true);
    expect(presenter.veil).toBeNull();
    presenter.sync(line('door', 'wipe'), { storyTransitions: true, reducedMotion: true }, true);
    expect(presenter.veil).toBeNull();
  });
});
