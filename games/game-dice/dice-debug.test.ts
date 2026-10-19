import { describe, expect, it } from 'vitest';
import { applyDiceDebugAction, dicePreviewInput } from './dice-debug.js';

describe('game-dice 本地调试参数', () => {
  it('从 URL 恢复骰池、标题、难度、修正与背景', () => {
    expect(dicePreviewInput('?dice=d20,d6&title=%E6%99%BA%E5%8A%9B%E6%A3%80%E5%AE%9A&difficulty=15&modifier=-2&source=%E8%A3%85%E5%A4%87&backdrop=moonlit-ruins')).toEqual({
      dice: [{ sides: 20 }, { sides: 6 }], title: '智力检定', difficulty: 15,
      modifier: -2, modifierSource: '装备', backdrop: 'moonlit-ruins',
    });
  });

  it('用闭集动作切换数量和骰型，并清掉已不适用的判定区间', () => {
    const base = dicePreviewInput('');
    const two = applyDiceDebugAction(base, 'dice.debug.count', '2');
    expect(two.dice).toEqual([{ sides: 20 }, { sides: 20 }]);
    expect(applyDiceDebugAction(two, 'dice.debug.die.1', '8').dice).toEqual([{ sides: 20 }, { sides: 8 }]);
    expect(applyDiceDebugAction(two, 'dice.debug.die.1', '12')).toBe(two);
  });
});
