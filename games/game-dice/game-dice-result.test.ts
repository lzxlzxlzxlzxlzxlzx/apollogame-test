import { describe, expect, it } from 'vitest';
import { DICE_VERDICT_VISIBLE_MS, outputFromPhysicalResult } from './game-dice.js';

describe('game-dice DokiWorld 结果合同', () => {
  it('在把结果回传给宿主前保留足够长的成功/失败展示时间', () => {
    expect(DICE_VERDICT_VISIBLE_MS).toBeGreaterThanOrEqual(1_000);
  });

  it('将修正后总点数、难度和成功结果返回给调用方', () => {
    const output = outputFromPhysicalResult({
      dice: [{ sides: 20, value: 10 }], total: 10, modifier: 1, finalTotal: 11,
      difficulty: 10, passed: true, outcome: 'success', randomSource: 'physics',
    }, { dice: [{ sides: 20 }], modifier: 1, difficulty: 10 });
    expect(output.data.outcome).toBe('win');
    expect(output.data.metrics).toMatchObject({ total: 10, modifier: 1, finalTotal: 11, difficulty: 10, passed: true, diceOutcome: 'success' });
  });

  it('失败判定返回 loss', () => {
    const output = outputFromPhysicalResult({
      dice: [{ sides: 20, value: 8 }], total: 8, modifier: 1, finalTotal: 9,
      difficulty: 10, passed: false, outcome: 'failure', randomSource: 'physics',
    }, { dice: [{ sides: 20 }], modifier: 1, difficulty: 10 });
    expect(output.data.outcome).toBe('loss');
    expect(output.data.metrics.passed).toBe(false);
  });
});
