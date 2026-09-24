import { describe, expect, it } from 'vitest';
import { validateLayoutNode, type LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { DEFAULT_RHETORIC_CONFIG, RHETORIC_CATALOG } from './config.js';
import { RhetoricPresentationController, type RhetoricPresentationView } from './presentation-controller.js';
import { RhetoricDuelSession } from './session.js';
import { buildRhetoricDuelUI, catalogCompleteness, formatRhetoricEffects, RHETORIC_CARD_BACK_KEY, selectLoadedRhetoricSkins } from './ui.js';
import { rhetoricOpponentVisibility, rhetoricPlayFieldBlueprint } from './play-field.js';
import { projectHandVisuals } from './card-presentation.js';

function all(node: LayoutNode): LayoutNode[] { return [node, ...(node.children ?? []).flatMap(all)]; }
function ready(): RhetoricPresentationController {
  const controller = new RhetoricPresentationController(new RhetoricDuelSession());
  controller.skip();
  return controller;
}
function withHand(view: RhetoricPresentationView, hand: readonly string[], focus = view.snapshot.focus): RhetoricPresentationView {
  return { ...view, snapshot: { ...view.snapshot, hand, focus }, handVisuals: projectHandVisuals(hand, hand) };
}
function prefixed(nodes: readonly LayoutNode[], prefix: string): LayoutNode { return nodes.find((node) => node.id.startsWith(prefix))!; }
function visibleCopy(tree: LayoutNode): string {
  return all(tree).flatMap((node) => {
    const props = node.props as { text?: unknown; label?: unknown };
    return [props.text, props.label].filter((value): value is string => typeof value === 'string');
  }).join('\n');
}

describe('game-rhetoric-duel · W5 desktop LayoutNode UI', () => {
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

  it('十张目录卡均在同一纸牌边界内具备费用、图、名称、来源、中文效果、文案和快捷键', () => {
    const controller = ready();
    for (const card of RHETORIC_CATALOG) {
      const tree = buildRhetoricDuelUI(withHand(controller.view, [card.cardId]), DEFAULT_RHETORIC_CONFIG);
      const cardPanel = prefixed(all(tree), `rhetoric-card-${card.cardId}--0`);
      const nodes = all(cardPanel);
      expect((prefixed(nodes, 'rhetoric-card-cost-value-').props as { text: string }).text).toBe(String(card.focusCost));
      expect((prefixed(nodes, 'rhetoric-card-art-').props as { src: string }).src).toMatch(/^data:image\/svg\+xml/);
      expect((prefixed(nodes, 'rhetoric-card-name-').props as { text: string }).text).toBe(card.displayName);
      expect((prefixed(nodes, 'rhetoric-card-source-').props as { text: string }).text).toBe('言弹');
      expect((prefixed(nodes, 'rhetoric-card-effect-').props as { text: string }).text).toBe(formatRhetoricEffects(card.effects));
      expect((prefixed(nodes, 'rhetoric-card-flavor-').props as { text: string }).text).toBe(card.flavorText);
      expect((prefixed(nodes, 'rhetoric-card-hotkey-value-').props as { text: string }).text).toBe('1');
      expect((prefixed(nodes, 'rhetoric-card-effect-').props as { size?: string }).size).not.toBe('xs');
    }
    expect(catalogCompleteness()).toBe(true);
  });

  it('skinMap 按目录 key 优先且路径可替换，缺槽独立回退', () => {
    const controller = ready();
    const first = RHETORIC_CATALOG[0]!;
    const skins = { [first.skinKey]: '/replacement/card-v2.png', [RHETORIC_CARD_BACK_KEY]: '/replacement/back-v2.png' };
    const nodes = all(buildRhetoricDuelUI(withHand(controller.view, [first.cardId]), DEFAULT_RHETORIC_CONFIG, skins));
    expect((prefixed(nodes, 'rhetoric-card-art-').props as { src: string }).src).toBe('/replacement/card-v2.png');
    expect((nodes.find((node) => node.id === 'rhetoric-deck-back')!.props as { src: string }).src).toBe('/replacement/back-v2.png');
    const fallback = all(buildRhetoricDuelUI(withHand(controller.view, [RHETORIC_CATALOG[1]!.cardId]), DEFAULT_RHETORIC_CONFIG, skins));
    expect((prefixed(fallback, 'rhetoric-card-art-').props as { src: string }).src).toMatch(/^data:image\/svg\+xml/);
  });

  it('单图加载失败时只剔除该槽，其余正式图保持命中', () => {
    const first = RHETORIC_CATALOG[0]!;
    const second = RHETORIC_CATALOG[1]!;
    const selected = selectLoadedRhetoricSkins({ [first.skinKey]: '/first.png', [second.skinKey]: '/second.png' }, (key) => key === first.skinKey);
    expect(selected).toEqual({ [first.skinKey]: '/first.png' });
    const controller = ready();
    const nodes = all(buildRhetoricDuelUI(withHand(controller.view, [first.cardId, second.cardId]), DEFAULT_RHETORIC_CONFIG, selected));
    expect((nodes.find((node) => node.id.includes(`rhetoric-card-art-${first.cardId}--0`))!.props as { src: string }).src).toBe('/first.png');
    expect((nodes.find((node) => node.id.includes(`rhetoric-card-art-${second.cardId}--0`))!.props as { src: string }).src).toMatch(/^data:image\/svg\+xml/);
  });

  it('card-flight 只有一个与手牌同构的完整卡实体，Canvas 不再拥有 flight 实体', () => {
    const controller = ready();
    const cardId = controller.view.snapshot.hand[0]!;
    const card = RHETORIC_CATALOG.find((entry) => entry.cardId === cardId)!;
    controller.enqueueAction('rhetoric.play', { arg: cardId });
    expect(controller.view.phase).toBe('card-flight');
    const nodes = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG, { [card.skinKey]: '/flight-icon.svg' }));
    const flightCards = nodes.filter((entry) => entry.id.startsWith('rhetoric-card-flight-'));
    expect(flightCards).toHaveLength(1);
    const flightNodes = all(flightCards[0]!);
    expect((prefixed(flightNodes, 'rhetoric-card-art-flight-').props as { src: string }).src).toBe('/flight-icon.svg');
    expect((prefixed(flightNodes, 'rhetoric-card-name-flight-').props as { text: string }).text).toBe(card.displayName);
    expect((prefixed(flightNodes, 'rhetoric-card-effect-flight-').props as { text: string }).text).toBe(formatRhetoricEffects(card.effects));
    expect(Object.keys(rhetoricPlayFieldBlueprint(DEFAULT_RHETORIC_CONFIG).entities).some((id) => id.startsWith('flight-'))).toBe(false);
    expect(controller.session.snapshot()).toEqual(controller.view.transition?.after);
  });

  it('正式模式不显示 cardId、intentId、phase 或开发徽记，debug 才显示 phase', () => {
    const controller = ready();
    const formal = buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG);
    const copy = visibleCopy(formal);
    expect(copy).not.toContain(controller.view.phase);
    for (const intent of DEFAULT_RHETORIC_CONFIG.encounter.intentions) expect(copy).not.toContain(intent.id);
    for (const card of RHETORIC_CATALOG) expect(copy).not.toContain(card.cardId);
    expect(all(formal).some((node) => node.id === 'rhetoric-debug')).toBe(false);
    expect(visibleCopy(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG, {}, true))).toContain(`phase=${controller.view.phase}`);
  });

  it('不可用牌完整可读并给出专注不足原因', () => {
    const controller = ready();
    const costly = RHETORIC_CATALOG.find((card) => card.focusCost > 0)!;
    const nodes = all(buildRhetoricDuelUI(withHand(controller.view, [costly.cardId], 0), DEFAULT_RHETORIC_CONFIG));
    expect((prefixed(nodes, 'rhetoric-card-name-').props as { text: string }).text).toBe(costly.displayName);
    expect((prefixed(nodes, 'rhetoric-card-disabled-').props as { text: string }).text).toContain('专注不足');
    expect(nodes.some((node) => node.id.startsWith('rhetoric-card-flavor-'))).toBe(false);
    const disabledCard = prefixed(nodes, `rhetoric-card-${costly.cardId}--0`);
    const enabledCard = prefixed(all(buildRhetoricDuelUI(withHand(controller.view, [costly.cardId], costly.focusCost), DEFAULT_RHETORIC_CONFIG)), `rhetoric-card-${costly.cardId}--0`);
    expect(disabledCard.layout?.height).toBe(enabledCard.layout?.height);
  });

  it('真立绘与完整几何后备严格互斥，蓝图只引用命名空间 key', () => {
    expect(rhetoricOpponentVisibility(true)).toEqual({ art: true, fallback: false });
    expect(rhetoricOpponentVisibility(false)).toEqual({ art: false, fallback: true });
    const blueprint = rhetoricPlayFieldBlueprint(DEFAULT_RHETORIC_CONFIG);
    expect(blueprint.entities['opponent-art']?.Sprite?.textureKey).toBe(DEFAULT_RHETORIC_CONFIG.encounter.portraitSkinKey);
    expect(blueprint.entities['opponent-body']?.Shape?.kind).toBe('polygon');
    expect(blueprint.entities['opponent-body']?.Sprite).toBeUndefined();
  });

  it('换装前后不改变 session snapshot 或 hash', () => {
    const session = new RhetoricDuelSession();
    const controller = new RhetoricPresentationController(session);
    controller.skip();
    const before = session.snapshot();
    const hash = session.engine.hash();
    buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG, {
      [RHETORIC_CATALOG[0]!.skinKey]: '/replacement/card.png',
      [DEFAULT_RHETORIC_CONFIG.encounter.backgroundSkinKey]: '/replacement/background.png',
    });
    expect(session.snapshot()).toEqual(before);
    expect(session.engine.hash()).toBe(hash);
  });

  it('ready 暴露 play/end-turn/exit；busy 锁写操作且只在此时显示 skip', () => {
    const controller = new RhetoricPresentationController(new RhetoricDuelSession());
    expect(all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG)).some((node) => node.id === 'rhetoric-end-turn')).toBe(false);
    controller.advance();
    const busy = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG));
    expect((busy.find((node) => node.id === 'rhetoric-end-turn')!.props as { disabled?: boolean }).disabled).toBe(true);
    expect(busy.some((node) => node.id === 'rhetoric-skip')).toBe(true);
    controller.skip();
    const readyNodes = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG));
    expect((readyNodes.find((node) => node.id === 'rhetoric-end-turn')!.props as { disabled?: boolean }).disabled).toBe(false);
    expect(readyNodes.some((node) => node.id === 'rhetoric-skip')).toBe(false);
    expect(readyNodes.filter((node) => (node.props as { action?: string }).action === 'rhetoric.play').length).toBeGreaterThan(0);
  });
});
