import { SynthAudioPort, type SfxSpec } from '@zerocraft/engine/services/audio/index.js';
import type { PotionStep } from './recipe.js';
import type { PotionViewState } from './screen.js';

export type PotionCue = 'add' | 'stir' | 'success' | 'failure';

// 纯数据音色表；没有外部音频资产，浏览器无 AudioContext 时引擎端口静默降级。
export const POTION_SFX = {
  add: { partials: [
    { noise: true, dur: 0.09, gain: 0.025 },
    { wave: 'sine', freq: 440, freqTo: 650, at: 0.04, dur: 0.18, gain: 0.055 },
  ] },
  stir: { partials: [
    { wave: 'sine', freq: 265, freqTo: 400, dur: 0.2, gain: 0.05 },
    { wave: 'triangle', freq: 530, freqTo: 600, at: 0.08, dur: 0.13, gain: 0.02 },
  ] },
  success: { partials: [
    { wave: 'triangle', freq: 523, dur: 0.18, gain: 0.06 },
    { wave: 'triangle', freq: 659, at: 0.13, dur: 0.18, gain: 0.06 },
    { wave: 'sine', freq: 784, at: 0.26, dur: 0.36, gain: 0.065 },
  ] },
  failure: { partials: [
    { wave: 'sawtooth', freq: 260, freqTo: 115, dur: 0.32, gain: 0.04 },
    { noise: true, at: 0.08, dur: 0.17, gain: 0.018 },
  ] },
} satisfies Record<PotionCue, SfxSpec>;

export function createPotionAudio(): SynthAudioPort {
  return new SynthAudioPort(POTION_SFX);
}

/** 只读世界投影中的已接受步骤；拒收/锅外释放不触发音效。 */
export function cueForPotionTransition(
  previous: PotionViewState,
  next: PotionViewState,
  steps: readonly PotionStep[],
): PotionCue | undefined {
  if (previous.status !== 'active') return undefined;
  if (next.status === 'failure') return 'failure';
  if (next.status === 'success') return 'success';
  if (next.stepIndex > previous.stepIndex) return steps[previous.stepIndex]?.kind === 'add' ? 'add' : 'stir';
  if (next.stepIndex === previous.stepIndex && next.confirmedCount > previous.confirmedCount) return 'stir';
  return undefined;
}
