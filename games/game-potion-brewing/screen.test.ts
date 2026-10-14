import { describe, expect, it } from 'vitest';
import { validateLayoutNode } from '@zerocraft/engine/ui/components/validate.js';
import { renderNode } from '@zerocraft/engine/ui/components/render.js';
import { EMBER_ROUND, MOON_ROUND } from './fixtures.js';
import { POTION_THEME, buildPotionShell, buildRackScreen, buildRecipeScreen, buildLiquidScreen, buildStatusScreen, buildResultScreen, buildExitScreen, buildTitleScreen, liquidColor } from './screen.js';

describe('game-potion-brewing S3 LayoutNode shell', () => {
  it('透明画布、配方与材料架三宿主均为闭集且零校验 issue', () => {
    expect(validateLayoutNode(buildPotionShell())).toEqual([]);
    for (const round of [MOON_ROUND, EMBER_ROUND]) {
      expect(validateLayoutNode(buildRecipeScreen(round.recipe))).toEqual([]);
      expect(validateLayoutNode(buildRackScreen(round.recipe))).toEqual([]);
      expect(validateLayoutNode(buildRackScreen(round.recipe, round.recipe.ingredients[0]?.ingredientId))).toEqual([]);
      for (const state of [
        { status: 'active' as const, stepIndex: 0, confirmedCount: 0 },
        { status: 'active' as const, stepIndex: 1, confirmedCount: 1 },
        { status: 'success' as const, stepIndex: round.recipe.steps.length, confirmedCount: 0 },
        { status: 'failure' as const, stepIndex: 0, confirmedCount: 0 },
      ]) {
        expect(validateLayoutNode(buildRecipeScreen(round.recipe, state))).toEqual([]);
        expect(validateLayoutNode(buildTitleScreen(round.recipe, state))).toEqual([]);
        expect(validateLayoutNode(buildLiquidScreen(round.recipe, state))).toEqual([]);
        expect(validateLayoutNode(buildStatusScreen(round.recipe, state, 'moon-herb'))).toEqual([]);
        expect(validateLayoutNode(buildResultScreen(round.recipe, state))).toEqual([]);
        expect(validateLayoutNode(buildResultScreen(round.recipe, state, '/games/game-potion-brewing/art/textures/potion-bottle-v1.png'))).toEqual([]);
      }
    }
    expect(validateLayoutNode(buildExitScreen(false))).toEqual([]);
    expect(validateLayoutNode(buildExitScreen(true))).toEqual([]);
  });

  it('初始清水、步骤色与错误紫色仅投影到药液屏，不改锅身', () => {
    const recipe = MOON_ROUND.recipe;
    expect(liquidColor(recipe, { status: 'active', stepIndex: 0, confirmedCount: 0 })).toBe('#a9dce7');
    expect(liquidColor(recipe, { status: 'active', stepIndex: 1, confirmedCount: 0 })).toBe('#69adb1');
    expect(liquidColor(recipe, { status: 'active', stepIndex: 1, confirmedCount: 1 })).toBe('color-mix(in srgb, #69adb1 50%, #398f93 50%)');
    expect(liquidColor(recipe, { status: 'active', stepIndex: 2, confirmedCount: 0 })).toBe('#398f93');
    expect(liquidColor(recipe, { status: 'failure', stepIndex: 1, confirmedCount: 0 })).toBe('#615366');
    const active = { status: 'active' as const, stepIndex: 1, confirmedCount: 0 };
    expect((buildLiquidScreen(recipe, active).children?.[0]?.props as { wave: boolean; bubbles: number })).toMatchObject({ wave: true, bubbles: 8 });
    expect((buildLiquidScreen(recipe, active, true).children?.[0]?.props as { wave: boolean; bubbles: number })).toMatchObject({ wave: false, bubbles: 0 });
    const idle = renderNode(buildLiquidScreen(recipe, active), POTION_THEME);
    const afterAdd = renderNode(buildLiquidScreen(recipe, active, false, 'add'), POTION_THEME);
    const afterStir = renderNode(buildLiquidScreen(recipe, active, false, 'stir'), POTION_THEME);
    const fading = renderNode(buildLiquidScreen(recipe, active, false, 'add', '#a9dce7', 3), POTION_THEME);
    const attack = renderNode(buildLiquidScreen(recipe, active, false, 'add', '#a9dce7', 3, 'attack'), POTION_THEME);
    const failed = renderNode(buildLiquidScreen(recipe, { status: 'failure', stepIndex: 1, confirmedCount: 0 }, false, 'failure'), POTION_THEME);
    expect(validateLayoutNode(buildLiquidScreen(recipe, active, false, 'add'))).toEqual([]);
    expect(validateLayoutNode(buildLiquidScreen(recipe, active, false, 'add', '#a9dce7', 3))).toEqual([]);
    expect(idle).not.toContain('potion-liquid-glow');
    expect(afterAdd).toContain('potion-liquid-glow');
    expect(afterAdd).toContain('#8ffff0bb');
    expect(afterStir).toContain('#8ffff0bb');
    expect(fading).toContain('potion-liquid-previous');
    expect(fading).toContain('apollo-fadeOut 750ms');
    expect(fading).toContain('potion-liquid-glow-3');
    expect(attack).toContain('potion-liquid-glow-3-attack');
    expect(attack).toContain('apollo-fadeIn 180ms');
    expect(fading).toContain('apollo-fadeOut 720ms');
    expect(failed).toContain('#b474ceaa');
    const reducedCue = renderNode(buildLiquidScreen(recipe, active, true, 'add', '#a9dce7'), POTION_THEME);
    expect(reducedCue).toContain('potion-liquid-glow');
    expect(reducedCue).not.toContain('potion-liquid-previous');
    expect(reducedCue).not.toContain('data-fx="flash"');
  });

  it('house 主题保留控件样式但根屏不注入不透明 wash/texture', () => {
    const html = renderNode(buildPotionShell(), POTION_THEME);
    expect(html).toContain('background:transparent');
    expect(POTION_THEME.wash).toBeUndefined();
    expect(POTION_THEME.texture).toBeUndefined();
  });

  it('定稿舞台的液面尺寸、统一中文字体与无限取料卡片', () => {
    const shell = renderNode(buildPotionShell(), POTION_THEME);
    expect(shell).toContain('left:620px;top:292px');
    expect(shell).toContain('width:280px;height:280px');
    const liquid = renderNode(buildLiquidScreen(MOON_ROUND.recipe, { status: 'active', stepIndex: 0, confirmedCount: 0 }), POTION_THEME);
    expect(liquid).toContain('rotateX(60deg)');
    const title = renderNode(buildTitleScreen(MOON_ROUND.recipe, { status: 'active', stepIndex: 0, confirmedCount: 0 }), POTION_THEME);
    const rack = renderNode(buildRackScreen(MOON_ROUND.recipe), POTION_THEME);
    expect(title).not.toContain('Ma Shan Zheng');
    expect(rack).not.toContain('ZCOOL XiaoWei');
    expect(POTION_THEME.fontUi).toContain('Microsoft YaHei');
    expect(rack).not.toContain('剩余');
    expect(rack).not.toContain('potion-material-count-');
    expect(shell).not.toContain('potion-rack-controls-host');
    expect(shell).toContain('potion-result-host');
    const hovered = renderNode(buildRackScreen(MOON_ROUND.recipe, undefined, 'moon-herb'), POTION_THEME);
    expect(hovered).toContain('linear-gradient(180deg,#59604a,#303e38)');
    expect(hovered).toContain('potion-material-sheen-moon-herb');
    expect(hovered).toContain('data-fx="sheen"');
    expect(renderNode(buildRackScreen(MOON_ROUND.recipe, 'moon-herb', 'moon-herb'), POTION_THEME)).toContain('#ffed9d');
  });

  it('S6 结算按定稿原型放大，正式瓶图只出现在成功屏', () => {
    const success = buildResultScreen(MOON_ROUND.recipe, { status: 'success', stepIndex: 4, confirmedCount: 0 }, '/games/game-potion-brewing/art/textures/potion-bottle-v1.png');
    const failure = buildResultScreen(MOON_ROUND.recipe, { status: 'failure', stepIndex: 0, confirmedCount: 0 }, '/games/game-potion-brewing/art/textures/potion-bottle-v1.png');
    const successHtml = renderNode(success, POTION_THEME);
    expect(successHtml).toContain('width:640px');
    expect(successHtml).toContain('potion-result-bottle');
    expect(successHtml).toContain('potion-bottle-v1.png');
    expect(renderNode(failure, POTION_THEME)).not.toContain('potion-result-bottle"');
    const failureHtml = renderNode(failure, POTION_THEME);
    expect(failureHtml.match(/id="potion-result-symbol"/g)).toHaveLength(1);
    expect(failureHtml).not.toContain('potion-result-restart');
    expect(failureHtml).not.toContain('重新炼制');
    const statusHtml = renderNode(buildStatusScreen(MOON_ROUND.recipe, { status: 'active', stepIndex: 1, confirmedCount: 0 }), POTION_THEME);
    expect(statusHtml).not.toContain('Q/E');
    expect(statusHtml).not.toContain('投入锅口');
  });
});
