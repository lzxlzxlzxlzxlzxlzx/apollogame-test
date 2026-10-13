import { SynthAudioPort, type SfxSpec } from '@zerocraft/engine/services/audio/index.js';

/** Declarative SFX palette; host presentation may route named signals to this table. */
export const LOCKPICK_SFX: Readonly<Record<string, SfxSpec>> = Object.freeze({
  'lockpick.adjust': { partials: [{ wave: 'square', freq: 180, freqTo: 145, dur: 0.07, gain: 0.10 }] },
  'lockpick.feedback.cold': { partials: [{ wave: 'sine', freq: 220, dur: 0.09, gain: 0.08 }] },
  'lockpick.feedback.dim': { partials: [{ wave: 'sine', freq: 320, dur: 0.10, gain: 0.09 }] },
  'lockpick.feedback.warm': { partials: [{ wave: 'triangle', freq: 440, dur: 0.12, gain: 0.10 }] },
  'lockpick.feedback.bright': { partials: [{ wave: 'triangle', freq: 620, dur: 0.13, gain: 0.11 }] },
  'lockpick.unlock': { partials: [{ wave: 'triangle', freq: 420, freqTo: 880, dur: 0.30, gain: 0.16 }] },
  'lockpick.give-up': { partials: [{ wave: 'sawtooth', freq: 180, freqTo: 90, dur: 0.22, gain: 0.10 }] },
  'ui.confirm': { partials: [{ wave: 'sine', freq: 560, dur: 0.06, gain: 0.08 }] },
  'ui.cancel': { partials: [{ wave: 'sine', freq: 280, dur: 0.06, gain: 0.06 }] },
});

// Presentation-only bridge: named UI/session events select a closed SfxSpec
// record. SynthAudioPort itself safely becomes a no-op without AudioContext.
let port: SynthAudioPort | undefined;
export function playLockpickSfx(event: keyof typeof LOCKPICK_SFX): void {
  (port ??= new SynthAudioPort(LOCKPICK_SFX)).play(event);
}
