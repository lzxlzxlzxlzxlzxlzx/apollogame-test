import { describe, expect, it } from 'vitest';
import { normalizeDiceInput, normalizeDicePreset, normalizeDiceRequest, resolveDiceResult } from './dice-overlay.js';

describe('骰子覆盖层的输入与结算合同', () => {
  it('支持 d4/d6/d8/d20 与最多三颗骰子', () => {
    expect(normalizeDiceInput({ dice: [4, { sides: 6 }, { sides: 20 }] })).toEqual({
      dice: [{ sides: 4 }, { sides: 6 }, { sides: 20 }],
    });
    expect(normalizeDiceInput({ dice: [{ sides: 12 }] })).toBeUndefined();
    expect(normalizeDiceInput({ dice: [6, 6, 6, 6] })).toBeUndefined();
  });

  it('预设点数逐颗验界，不会落成随机', () => {
    const input = normalizeDiceInput({ dice: [4, 20] })!;
    expect(normalizeDicePreset({ values: [4, 20] }, input)).toEqual({ values: [4, 20] });
    expect(normalizeDicePreset({ values: [5, 20] }, input)).toBeUndefined();
  });

  it('同 seed 产生相同骰面，且返回总点数', () => {
    const input = normalizeDiceInput({ dice: [4, 6, 20] })!;
    const first = resolveDiceResult(input, 77, undefined);
    expect(resolveDiceResult(input, 77, undefined)).toEqual(first);
    expect(first.total).toBe(first.dice.reduce((total, die) => total + die.value, 0));
    expect(first.dice[0]!.value).toBeGreaterThanOrEqual(1);
    expect(first.dice[0]!.value).toBeLessThanOrEqual(4);
  });

  it('桥接请求不能以非法预设或未知面数进入会话', () => {
    expect(normalizeDiceRequest({ version: 1, requestId: 'a', input: { dice: [8] }, preset: { values: [9] } })).toBeUndefined();
    expect(normalizeDiceRequest({ version: 1, requestId: 'a', input: { dice: [10] } })).toBeUndefined();
  });
});
