import { describe, expect, it } from 'vitest';
import { DICE_VERDICT_VISIBLE_MS, lockSettledDiceStage, outputFromPhysicalResult, requestFromInput, shouldStartDicePreviewImmediately } from './game-dice.js';

describe('game-dice DokiWorld 结果合同', () => {
  it('在把结果回传给宿主前保留足够长的成功/失败展示时间', () => {
    expect(DICE_VERDICT_VISIBLE_MS).toBeGreaterThanOrEqual(700);
  });

  it('只在独立打开时立即显示默认预览，iframe 必须等待宿主输入', () => {
    expect(shouldStartDicePreviewImmediately(false)).toBe(true);
    expect(shouldStartDicePreviewImmediately(true)).toBe(false);
  });

  it('宿主骰局第一次结算后锁定物理舞台并移走画布焦点', () => {
    let blurred = false;
    const stage = {
      inert: false,
      contains: () => true,
    } as unknown as HTMLElement;
    const canvas = { blur: () => { blurred = true; } } as unknown as EventTarget;

    lockSettledDiceStage(stage, canvas);

    expect(stage.inert).toBe(true);
    expect(blurred).toBe(true);
  });

  it('将修正后总点数、难度和成功结果返回给调用方', () => {
    const output = outputFromPhysicalResult({
      dice: [{ sides: 20, value: 10 }], total: 10, modifier: 1, finalTotal: 11,
      difficulty: 10, passed: true, outcome: 'success', randomSource: 'host',
    }, { dice: [{ sides: 20 }], modifier: 1, difficulty: 10 });
    expect(output.data.outcome).toBe('win');
    expect(output.data.metrics).toMatchObject({ total: 10, modifier: 1, finalTotal: 11, difficulty: 10, passed: true, diceOutcome: 'success' });
  });

  it('失败判定返回 loss', () => {
    const output = outputFromPhysicalResult({
      dice: [{ sides: 20, value: 8 }], total: 8, modifier: 1, finalTotal: 9,
      difficulty: 10, passed: false, outcome: 'failure', randomSource: 'host',
    }, { dice: [{ sides: 20 }], modifier: 1, difficulty: 10 });
    expect(output.data.outcome).toBe('loss');
    expect(output.data.metrics.passed).toBe(false);
  });

  it('只接受宿主 v2 合同中逐颗合法的权威骰面', () => {
    expect(requestFromInput({
      contract: 'doki.game.dice-input', version: 2,
      data: { dice: [{ sides: 20 }, { sides: 6 }], result: { values: [17, 4] } },
    }, 'r-1')).toMatchObject({ requestId: 'r-1', preset: { values: [17, 4] } });
    expect(() => requestFromInput({
      contract: 'doki.game.dice-input', version: 2,
      data: { dice: [{ sides: 20 }], result: { values: [21] } },
    }, 'r-2')).toThrow('Invalid dice input');
    expect(() => requestFromInput({
      contract: 'doki.game.dice-input', version: 2,
      data: { dice: [{ sides: 20 }], result: { values: [20] }, ignored: true },
    }, 'r-3')).toThrow('unknown field');
  });
});
