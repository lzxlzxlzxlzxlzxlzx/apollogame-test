import { describe, expect, it } from 'vitest';
import { renderNode, validateLayoutNode } from '@zerocraft/engine/ui/components/index.js';
import {
  buildDiceWindow,
  DICE_INFERNAL_FORGE_FRAME,
  DICE_INFERNAL_FORGE_MODIFIER_FRAME,
  DICE_MOONLIT_RUINS_FRAME,
  DICE_MOONLIT_RUINS_MODIFIER_FRAME,
  DICE_ROYAL_VELVET_FRAME,
  DICE_ROYAL_VELVET_MODIFIER_FRAME,
  DICE_WINDOW_THEME,
} from './dice-window.js';

describe('game-dice 悬浮判定窗', () => {
  it('是合法的透明 LayoutNode 窗体，并保留 DokiWorld 背景', () => {
    const tree = buildDiceWindow({ dice: [{ sides: 20 }], modifier: 3, modifierSource: '智力', title: '智力检定', difficulty: 10, backdrop: 'arcane-vault' });
    expect(validateLayoutNode(tree)).toEqual([]);
    expect(tree.props).toMatchObject({ center: true, bg: 'transparent', fill: true });
    expect(DICE_WINDOW_THEME.pageBg).toBe('transparent');
    const html = renderNode(tree, DICE_WINDOW_THEME);
    expect(html).toContain('/games/game-dice/art/arcane-judgement-frame-v2.png');
    expect(html).toContain('/games/game-dice/art/arcane-modifier-card-v1.png');
    expect(html).toContain('智力检定');
    expect(html).toContain('难度等级');
    expect(html).toContain('id="dice-window-difficulty-label"');
    expect(html).toContain('>10<');
    expect(html).toContain('id="dice-window-title" style="font-size:38px');
    expect(html).toContain('-webkit-text-stroke:2px');
    expect(html).toContain('id="dice-window-frame" style="display:flex;flex-direction:column;gap:6px;align-items:center;padding:48px');
    expect(html).toContain('width:430px;height:645px');
    expect(html).toContain('id="dice-window-modifier-card"');
    expect(html).toContain('width:120px;height:180px');
  });

  it('把难度、Three 舞台和点击框分成不重叠的流式槽位', () => {
    const html = renderNode(buildDiceWindow({ dice: [{ sides: 6 }], modifier: -2, modifierSource: '装备', difficulty: 14, backdrop: 'infernal-forge' }), DICE_WINDOW_THEME);
    expect(html).toContain('id="dice-3d-stage"');
    expect(html.indexOf('dice-window-difficulty')).toBeLessThan(html.indexOf('dice-3d-stage'));
    expect(html.indexOf('dice-3d-stage')).toBeLessThan(html.indexOf('dice-window-prompt-box'));
    expect(html).toContain('点击骰子');
    expect(html).toContain('>-2<');
    expect(html).toContain('装备');
    expect(html).not.toContain('rgba(0,0,0,0.9)');
  });

  it('自定义 judgement.bands 隐藏没有业务含义的难度等级与数字', () => {
    const tree = buildDiceWindow({
      dice: [{ sides: 20 }], modifier: 1, difficulty: 10,
      judgement: { bands: [
        { min: 2, max: 10, outcome: '失败' },
        { min: 11, max: 21, outcome: '大成功' },
      ] },
    });
    expect(validateLayoutNode(tree)).toEqual([]);
    const html = renderNode(tree, DICE_WINDOW_THEME);
    expect(html).not.toContain('难度等级');
    expect(html).not.toContain('id="dice-window-difficulty"');
    expect(html).toContain('id="dice-3d-stage"');
  });

  it('为其余三种背景使用同规格的 AI 透明异形画框', () => {
    const cases = [
      ['royal-velvet', DICE_ROYAL_VELVET_FRAME, DICE_ROYAL_VELVET_MODIFIER_FRAME],
      ['moonlit-ruins', DICE_MOONLIT_RUINS_FRAME, DICE_MOONLIT_RUINS_MODIFIER_FRAME],
      ['infernal-forge', DICE_INFERNAL_FORGE_FRAME, DICE_INFERNAL_FORGE_MODIFIER_FRAME],
    ] as const;
    for (const [backdrop, framePath, modifierPath] of cases) {
      const tree = buildDiceWindow({ dice: [{ sides: 20 }], difficulty: 12, modifier: 1, backdrop });
      expect(validateLayoutNode(tree)).toEqual([]);
      const html = renderNode(tree, DICE_WINDOW_THEME);
      expect(html).toContain(framePath);
      expect(html).toContain(modifierPath);
    }
  });

  it('调试模式仍是合法 LayoutNode，并提供骰池与背景控件', () => {
    const tree = buildDiceWindow({ dice: [{ sides: 20 }, { sides: 6 }], title: '调查', difficulty: 12, backdrop: 'arcane-vault' }, { debug: true });
    expect(validateLayoutNode(tree)).toEqual([]);
    const html = renderNode(tree, DICE_WINDOW_THEME);
    expect(html).toContain('骰子调试参数');
    expect(html).toContain('id="dice-debug-die-1"');
    expect(html).toContain('皇家绒幕');
  });
});
