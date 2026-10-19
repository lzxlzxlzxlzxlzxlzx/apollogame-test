import { describe, expect, it } from 'vitest';
import { LOCKPICK_SFX, playLockpickSfx } from './sfx.js';

describe('game-lockpick SFX', () => {
  it('keeps every named feedback and terminal cue in the closed SfxSpec table', () => {
    expect(Object.keys(LOCKPICK_SFX)).toEqual(expect.arrayContaining([
      'lockpick.adjust', 'lockpick.feedback.cold', 'lockpick.feedback.dim',
      'lockpick.feedback.warm', 'lockpick.feedback.bright', 'lockpick.unlock',
      'lockpick.give-up', 'ui.confirm', 'ui.cancel',
    ]));
  });

  it('is a safe presentation no-op without AudioContext', () => {
    expect(() => playLockpickSfx('lockpick.adjust')).not.toThrow();
  });
});
