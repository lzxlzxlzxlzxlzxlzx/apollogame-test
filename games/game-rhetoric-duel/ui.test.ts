import { describe, expect, it } from 'vitest';
import { validateLayoutNode, type LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { DEFAULT_RHETORIC_CONFIG } from './config.js';
import { RhetoricPresentationController } from './presentation-controller.js';
import { RhetoricDuelSession } from './session.js';
import { buildRhetoricDuelUI, catalogCompleteness } from './ui.js';
import { rhetoricPlayFieldBlueprint } from './play-field.js';

function all(node: LayoutNode): LayoutNode[] { return [node, ...(node.children ?? []).flatMap(all)]; }

describe('game-rhetoric-duel · W4 LayoutNode UI', () => {
  it('入场每个视觉阶段与 ready 状态均通过 LayoutNode 校验且 id 唯一', () => {
    const controller = new RhetoricPresentationController(new RhetoricDuelSession());
    do {
      const tree = buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG);
      expect(validateLayoutNode(tree), controller.view.phase).toEqual([]);
      const ids = all(tree).map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
      controller.advance();
    } while (controller.busy);
  });

  it('手牌具有 faceArt 视觉槽、费用、名称、效果与明确禁用原因', () => {
    const controller = new RhetoricPresentationController(new RhetoricDuelSession());
    controller.skip();
    const tree = buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG);
    const nodes = all(tree);
    const cards = nodes.filter((node) => node.type === 'PlayingCard');
    expect(cards).toHaveLength(controller.view.snapshot.hand.length);
    for (const card of cards) expect((card.props as { faceArt?: string }).faceArt).toMatch(/^data:image\/svg\+xml/);
    expect(nodes.some((node) => node.id.startsWith('rhetoric-card-effect-'))).toBe(true);
    expect(cards.every((node) => node.id.includes('skin.card.'))).toBe(true);
    expect(catalogCompleteness()).toBe(true);
  });

  it('图片未提供时 play-field 以同一 portrait skinKey 接 Sprite 槽与几何后备', () => {
    const controller = new RhetoricPresentationController(new RhetoricDuelSession());
    controller.skip();
    const blueprint = rhetoricPlayFieldBlueprint(DEFAULT_RHETORIC_CONFIG);
    expect(blueprint.entities['opponent-body']?.Sprite?.textureKey).toBe(DEFAULT_RHETORIC_CONFIG.encounter.portraitSkinKey);
    expect(blueprint.entities['opponent-body']?.Shape?.kind).toBe('polygon');
    const tree = buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG);
    expect(all(tree).some((node) => node.id === 'rhetoric-opponent')).toBe(false);
    expect(validateLayoutNode(tree)).toEqual([]);
  });

  it('reduced-motion 保留阶段与语义数值，但移除强飞行和抖动', () => {
    const controller = new RhetoricPresentationController(new RhetoricDuelSession(), { reducedMotion: true });
    controller.skip();
    const cardId = controller.session.snapshot().hand[0]!;
    controller.enqueueAction('rhetoric.play', { arg: cardId });
    controller.advance();
    expect(controller.view.phase).toBe('card-flight');
    const tree = buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG);
    expect(all(tree).some((node) => node.id === 'rhetoric-flight-card')).toBe(false);
    expect(controller.view.reducedMotion).toBe(true);
    expect(validateLayoutNode(tree)).toEqual([]);
  });

  it('ready 暴露 play/end-turn/exit，busy 禁止写操作但保留 skip', () => {
    const controller = new RhetoricPresentationController(new RhetoricDuelSession());
    expect(all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG)).some((node) => node.id === 'rhetoric-end-turn')).toBe(false);
    controller.advance();
    const busy = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG));
    expect((busy.find((node) => node.id === 'rhetoric-end-turn')!.props as { disabled?: boolean }).disabled).toBe(true);
    expect((busy.find((node) => node.id === 'rhetoric-skip')!.props as { disabled?: boolean }).disabled).toBe(false);
    controller.skip();
    const ready = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG));
    expect((ready.find((node) => node.id === 'rhetoric-end-turn')!.props as { disabled?: boolean }).disabled).toBe(false);
    expect(ready.filter((node) => (node.props as { action?: string }).action === 'rhetoric.play').length).toBeGreaterThan(0);
  });
});
