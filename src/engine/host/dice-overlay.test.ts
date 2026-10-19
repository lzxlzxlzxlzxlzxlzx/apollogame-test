import { describe, expect, it } from 'vitest';
import { judgeDiceTotal, normalizeDiceInput, normalizeDicePreset, normalizeDiceRequest, resolveDiceResult } from './dice-overlay.js';

describe('骰子覆盖层的输入与结算合同', () => {
  it('支持 d4/d6/d8/d20 与最多三颗骰子', () => {
    expect(normalizeDiceInput({ dice: [4, { sides: 6 }, { sides: 20 }] })).toEqual({
      dice: [{ sides: 4 }, { sides: 6 }, { sides: 20 }],
    });
    expect(normalizeDiceInput({ dice: [{ sides: 12 }] })).toBeUndefined();
    expect(normalizeDiceInput({ dice: [6, 6, 6, 6] })).toBeUndefined();
  });

  it('校验并保留调用方提供的检定标题、难度和修正来源', () => {
    expect(normalizeDiceInput({ dice: [20], title: ' 智力检定 ', difficulty: 10, modifier: 1, modifierSource: ' 智力 ' })).toEqual({
      dice: [{ sides: 20 }], title: '智力检定', difficulty: 10, modifier: 1, modifierSource: '智力',
    });
    expect(normalizeDiceInput({ dice: [20], title: '', difficulty: -1 })).toBeUndefined();
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

  it('按调用方区间对修正后的总点数判定，不给 1 或 20 特权', () => {
    const input = normalizeDiceInput({
      dice: [20],
      modifier: -2,
      judgement: { bands: [
        { min: -1, max: 17, outcome: 'failure' },
        { min: 18, max: 18, outcome: 'success' },
      ] },
    })!;
    expect(judgeDiceTotal(input, 20)).toEqual({ modifier: -2, finalTotal: 18, outcome: 'success' });
    expect(judgeDiceTotal(input, 1)).toEqual({ modifier: -2, finalTotal: -1, outcome: 'failure' });
    expect(resolveDiceResult(input, undefined, { values: [20] })).toMatchObject({ total: 20, modifier: -2, finalTotal: 18, outcome: 'success' });
  });

  it('未传自定义区间时，以修正后点数与难度做标准成功判定', () => {
    const success = normalizeDiceInput({ dice: [20], modifier: 1, difficulty: 11 })!;
    expect(judgeDiceTotal(success, 10)).toEqual({ modifier: 1, finalTotal: 11, difficulty: 11, passed: true, outcome: 'success' });
    expect(judgeDiceTotal(success, 9)).toEqual({ modifier: 1, finalTotal: 10, difficulty: 11, passed: false, outcome: 'failure' });
    expect(resolveDiceResult(success, undefined, { values: [10] })).toMatchObject({ total: 10, finalTotal: 11, difficulty: 11, passed: true, outcome: 'success' });
  });

  it('只有修正值时也返回 finalTotal，但不虚构判定结果', () => {
    expect(judgeDiceTotal({ dice: [{ sides: 20 }], modifier: -1 }, 10)).toEqual({ modifier: -1, finalTotal: 9 });
  });

  it('拒绝重叠、留空或不安全的判定区间', () => {
    expect(normalizeDiceInput({ dice: [6], judgement: { bands: [{ min: 1, max: 3, outcome: 'low' }, { min: 3, max: 6, outcome: 'high' }] } })).toBeUndefined();
    expect(normalizeDiceInput({ dice: [6], judgement: { bands: [{ min: 1, max: 5, outcome: 'low' }] } })).toBeUndefined();
    expect(normalizeDiceInput({ dice: [6], modifier: 0.5, judgement: { bands: [{ min: 1, max: 6, outcome: 'all' }] } })).toBeUndefined();
    expect(normalizeDiceInput({ dice: [6], judgement: { bands: [{ min: 1, max: 6, outcome: 'x'.repeat(49) }] } })).toBeUndefined();
  });
});
