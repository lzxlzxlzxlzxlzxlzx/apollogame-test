import { describe, expect, it } from 'vitest';
import { MOON_ROUND } from './fixtures.js';
import { createPotionAudio, cueForPotionTransition, POTION_SFX } from './potion-sfx.js';
import type { PotionViewState } from './screen.js';

const state = (stepIndex: number, confirmedCount = 0, status: PotionViewState['status'] = 'active'): PotionViewState => ({
  status, stepIndex, confirmedCount,
});

describe('炼药音效投影', () => {
  const steps = MOON_ROUND.recipe.steps;

  it('仅正确接受的材料和整圈触发对应提示，不把投料选择或半圈当提交', () => {
    expect(cueForPotionTransition(state(0), state(0), steps)).toBeUndefined();
    expect(cueForPotionTransition(state(0), state(1), steps)).toBe('add');
    expect(cueForPotionTransition(state(1), state(1, 1), steps)).toBe('stir');
    expect(cueForPotionTransition(state(1, 1), state(2), steps)).toBe('stir');
    expect(cueForPotionTransition(state(2), state(3), steps)).toBe('add');
  });

  it('终局只播一次，失败与成功不借锅体动画表达', () => {
    expect(cueForPotionTransition(state(1), state(1, 0, 'failure'), steps)).toBe('failure');
    expect(cueForPotionTransition(state(3), state(4, 0, 'success'), steps)).toBe('success');
    expect(cueForPotionTransition(state(4, 0, 'success'), state(4, 0, 'success'), steps)).toBeUndefined();
    expect(cueForPotionTransition(state(1, 0, 'failure'), state(1, 0, 'failure'), steps)).toBeUndefined();
  });

  it('音色表全部由闭集波形/频率/时长/音量数据组成', () => {
    for (const cue of ['add', 'stir', 'success', 'failure'] as const) {
      expect(POTION_SFX[cue].partials.length).toBeGreaterThan(0);
      for (const partial of POTION_SFX[cue].partials) {
        expect(partial.dur).toBeGreaterThan(0);
        expect(partial.gain).toBeGreaterThan(0);
      }
    }
  });

  it('无音频设备的测试环境仍可静默播放和清场', () => {
    const port = createPotionAudio();
    expect(() => {
      port.play('add');
      port.play('stir');
      port.play('success');
      port.play('failure');
      port.stopAll();
    }).not.toThrow();
  });
});
