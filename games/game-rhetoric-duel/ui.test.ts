import { describe, expect, it } from 'vitest';
import { validateLayoutNode, type LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { DEFAULT_RHETORIC_CONFIG, RHETORIC_CATALOG } from './config.js';
import { RhetoricPresentationController, type RhetoricPresentationView } from './presentation-controller.js';
import { RhetoricDuelSession } from './session.js';
import { buildRhetoricDuelUI, catalogCompleteness, formatRhetoricEffects, RHETORIC_CARD_BACK_KEY, RHETORIC_CARD_FRAME_KEY, selectLoadedRhetoricSkins } from './ui.js';
import { rhetoricOpponentPose, rhetoricOpponentVisibility, rhetoricPlayFieldBlueprint } from './play-field.js';
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

  it('十张目录卡均使用 demo 比例与排印层级，并具备费用、图、名称、来源、中文效果和快捷键', () => {
    const controller = ready();
    for (const card of RHETORIC_CATALOG) {
      const tree = buildRhetoricDuelUI(withHand(controller.view, [card.cardId]), DEFAULT_RHETORIC_CONFIG);
      const cardPanel = prefixed(all(tree), `rhetoric-card-${card.cardId}--0`);
      const nodes = all(cardPanel);
      expect(cardPanel.layout).toMatchObject({ width: 140, height: 203 });
      expect((prefixed(nodes, 'rhetoric-card-frame-').props as { skin: string }).skin).toBe('/games/game-rhetoric-duel/art/card/frame.svg');
      expect((prefixed(nodes, 'rhetoric-card-cost-value-').props as { text: string }).text).toBe(String(card.focusCost));
      expect((prefixed(nodes, 'rhetoric-card-art-').props as { src: string }).src).toMatch(/^data:image\/svg\+xml/);
      expect((prefixed(nodes, 'rhetoric-card-name-').props as { text: string }).text).toBe(card.displayName);
      expect((prefixed(nodes, 'rhetoric-card-source-').props as { text: string }).text).toBe('言弹');
      expect((prefixed(nodes, 'rhetoric-card-effect-').props as { text: string }).text).toBe(formatRhetoricEffects(card.effects));
      expect(nodes.some((node) => node.id.startsWith('rhetoric-card-flavor-'))).toBe(false);
      expect((prefixed(nodes, 'rhetoric-card-hotkey-value-').props as { text: string }).text).toBe('1');
      expect((prefixed(nodes, 'rhetoric-card-name-').props as { size?: number }).size).toBe(13);
      expect((prefixed(nodes, 'rhetoric-card-source-').props as { size?: number }).size).toBe(10);
      expect((prefixed(nodes, 'rhetoric-card-effect-').props as { size?: number }).size).toBe(11);
      expect((prefixed(nodes, 'rhetoric-card-hotkey-value-').props as { size?: number }).size).toBe(9);
    }
    expect(catalogCompleteness()).toBe(true);
  });

  it('skinMap 按目录 key 优先且路径可替换，缺槽独立回退', () => {
    const controller = ready();
    const first = RHETORIC_CATALOG[0]!;
    const skins = { [first.skinKey]: '/replacement/card-v2.png', [RHETORIC_CARD_BACK_KEY]: '/replacement/back-v2.png', [RHETORIC_CARD_FRAME_KEY]: '/replacement/frame-v2.svg' };
    const nodes = all(buildRhetoricDuelUI(withHand(controller.view, [first.cardId]), DEFAULT_RHETORIC_CONFIG, skins));
    expect((prefixed(nodes, 'rhetoric-card-art-').props as { src: string }).src).toBe('/replacement/card-v2.png');
    expect((nodes.find((node) => node.id === 'rhetoric-deck-back')!.props as { src: string }).src).toBe('/replacement/back-v2.png');
    expect((prefixed(nodes, 'rhetoric-card-frame-').props as { skin: string }).skin).toBe('/replacement/frame-v2.svg');
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
    expect(controller.view.phase).toBe('card-lift');
    controller.advance();
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

  it('专注不足牌保留卡面尺寸，以暗红遮罩和费用呼吸光锁定且不显示警示带文字', () => {
    const controller = ready();
    const costly = RHETORIC_CATALOG.find((card) => card.focusCost > 0)!;
    const nodes = all(buildRhetoricDuelUI(withHand(controller.view, [costly.cardId], 0), DEFAULT_RHETORIC_CONFIG));
    expect((prefixed(nodes, 'rhetoric-card-name-').props as { text: string }).text).toBe(costly.displayName);
    expect(nodes.some((node) => node.id.startsWith('rhetoric-card-unavailable-veil-'))).toBe(true);
    expect(nodes.some((node) => node.id.startsWith('rhetoric-card-unavailable-band-'))).toBe(false);
    expect(nodes.some((node) => node.id.startsWith('rhetoric-card-disabled-'))).toBe(false);
    const cost = prefixed(nodes, 'rhetoric-card-cost-');
    expect(cost.props).toMatchObject({ edge: 'danger' });
    expect(cost.layout?.fx).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'pulse' }),
      expect.objectContaining({ kind: 'glow', color: 'danger' }),
    ]));
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
    expect(blueprint.entities['impact-copy']?.Transform).toMatchObject({ x: 326, y: 352 });
    expect((blueprint.entities['impact-copy']?.Transform as { x: number }).x).toBeLessThan(660);
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

  it('ready 暴露 play/end-turn/exit；busy 锁写操作且不插入会令按钮跳位的可见 skip', () => {
    const controller = new RhetoricPresentationController(new RhetoricDuelSession());
    expect(all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG)).some((node) => node.id === 'rhetoric-end-turn')).toBe(false);
    controller.advance();
    const busy = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG));
    expect((busy.find((node) => node.id === 'rhetoric-end-turn')!.props as { disabled?: boolean }).disabled).toBe(true);
    expect(busy.some((node) => node.id === 'rhetoric-skip')).toBe(false);
    controller.skip();
    const readyNodes = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG));
    expect((readyNodes.find((node) => node.id === 'rhetoric-end-turn')!.props as { disabled?: boolean }).disabled).toBe(false);
    expect(readyNodes.some((node) => node.id === 'rhetoric-skip')).toBe(false);
    expect(readyNodes.filter((node) => (node.props as { action?: string }).action === 'rhetoric.play').length).toBeGreaterThan(0);
    const primary = readyNodes.find((node) => node.id === 'rhetoric-end-turn')!;
    const secondary = readyNodes.find((node) => node.id === 'rhetoric-exit')!;
    expect(primary.props).toMatchObject({ kind: 'hero' });
    expect(secondary.props).toMatchObject({ kind: 'ghost' });
    expect((primary.props as { skin?: string }).skin).toBe('');
    expect((secondary.props as { skin?: string }).skin).toBe('');
    expect(primary.layout).toMatchObject({ width: 176, height: 58 });
    expect(secondary.layout).toMatchObject({ width: 176, height: 48 });
  });

  it('人物前冲与受击各只播放一个快速动作，后续文字阶段立即回正', () => {
    const neutral = rhetoricOpponentPose('ready');
    const attack = rhetoricOpponentPose('enemy-intent');
    const hit = rhetoricOpponentPose('card-flight');
    const impact = rhetoricOpponentPose('impact');
    const enemyImpact = rhetoricOpponentPose('enemy-impact');
    const response = rhetoricOpponentPose('opponent-response');
    expect(neutral.x).toBe(885);
    expect(neutral.x - attack.x).toBeGreaterThanOrEqual(45);
    expect(hit.x - neutral.x).toBeGreaterThanOrEqual(30);
    expect(attack.yShift).toBe(0);
    expect(hit.yShift).toBe(0);
    expect(response.yShift).toBe(0);
    expect(attack.scale).toBe(1);
    expect(hit.scale).toBe(1);
    expect(hit.rotation).toBeGreaterThan(0.02);
    expect(attack.durationTicks).toBeLessThanOrEqual(8);
    expect(rhetoricOpponentPose('card-flight')).toEqual(hit);
    expect(hit.durationTicks).toBeLessThanOrEqual(8);
    expect(impact).toMatchObject({ x: neutral.x, yShift: 0, rotation: 0, durationTicks: 8 });
    expect(enemyImpact).toEqual(impact);
    expect(response).toEqual(impact);
  });

  it('card-flight 阶段并行滚动资源、受击和剩余手牌补位，轨道内层固定高度', () => {
    const controller = ready();
    const playable = controller.view.snapshot.hand
      .map((cardId) => RHETORIC_CATALOG.find((card) => card.cardId === cardId)!)
      .find((card) => card.focusCost <= controller.view.snapshot.focus && card.effects.some((effect) => effect.targetId === 'progress' && effect.value > 0))!;
    controller.enqueueAction('rhetoric.play', { arg: playable.cardId });
    controller.advance();
    expect(controller.view.phase).toBe('card-flight');
    const nodes = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG));
    const value = nodes.find((node) => node.id === 'rhetoric-progress-value-current')!;
    expect((value.props as { tween?: { from: number; to: number; ms: number } }).tween).toMatchObject({
      from: controller.view.transition!.before.progress,
      to: controller.view.snapshot.progress,
      ms: 650,
    });
    const delta = nodes.find((node) => node.id === 'rhetoric-progress-fill-delta')!;
    expect(delta.layout).toMatchObject({ anim: 'flyIn', animFrom: 'left', animMs: 650 });
    expect(nodes.find((node) => node.id === 'rhetoric-progress-rail')?.layout).toMatchObject({ height: 6, padding: 0 });
    const remainingSlots = nodes.filter((node) => node.id.startsWith('rhetoric-hand-x-'));
    expect(remainingSlots.some((node) => node.layout?.anim === 'flyIn' && node.layout.animMs === 260)).toBe(true);
    const playedVisual = controller.view.handVisuals.find((visual) => visual.status === 'played')!;
    expect(nodes.some((node) => node.id === `rhetoric-hand-slot-${playedVisual.visualId}`)).toBe(false);
  });

  it('卡牌提交后其他不可负担牌立即变红，并在飞行与命中阶段持续保持', () => {
    const controller = ready();
    const before = controller.view.snapshot;
    const cards = before.hand.map((cardId, index) => ({ index, card: RHETORIC_CATALOG.find((entry) => entry.cardId === cardId)! }));
    const play = cards.find(({ index, card }) => card.focusCost > 0
      && card.focusCost <= before.focus
      && cards.some((other) => other.index !== index && other.card.focusCost > before.focus - card.focusCost));
    expect(play).toBeDefined();
    controller.playVisibleCard(play!.index);
    const remaining = controller.view.transition!.after.hand.find((cardId) => {
      const card = RHETORIC_CATALOG.find((entry) => entry.cardId === cardId)!;
      return card.focusCost > controller.view.transition!.after.focus;
    });
    expect(remaining).toBeDefined();
    for (const expectedPhase of ['card-lift', 'card-flight', 'impact']) {
      expect(controller.view.phase).toBe(expectedPhase);
      const nodes = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG));
      expect(nodes.some((node) => node.id.startsWith(`rhetoric-card-unavailable-veil-${remaining}`))).toBe(true);
      if (expectedPhase !== 'impact') controller.advance();
    }
  });

  it('补牌阶段保留牌从旧槽位平滑补位，新牌仍从牌库发入', () => {
    const controller = ready();
    controller.enqueueAction('rhetoric.end-turn');
    while (controller.view.phase !== 'deal-new-cards') controller.advance();
    const nodes = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG));
    const kept = controller.view.handVisuals.filter((visual) => visual.status === 'kept');
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.some((visual) => nodes.find((node) => node.id === `rhetoric-hand-x-${visual.visualId}`)?.layout?.animMs === 360)).toBe(true);
    const drawn = controller.view.handVisuals.find((visual) => visual.status === 'drawn')!;
    expect(nodes.find((node) => node.id === `rhetoric-hand-slot-${drawn.visualId}`)?.layout).toMatchObject({ anim: 'flyIn' });
  });

  it('命中后完整卡牌旋转飞向弃牌槽，到达后才显示弃牌顶牌', () => {
    const controller = ready();
    controller.playVisibleCard(0);
    controller.advance();
    controller.advance();
    expect(controller.view.phase).toBe('impact');
    const impactNodes = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG));
    expect(impactNodes.find((node) => node.id === 'rhetoric-discard-flight')?.layout?.flyTo).toEqual({
      to: 'rhetoric-discard-target', ms: 420, arc: 72,
    });
    expect(impactNodes.find((node) => node.id === 'rhetoric-discard-spin')?.layout).toMatchObject({ anim: 'spin', animMs: 420 });
    expect(impactNodes.some((node) => node.id === 'rhetoric-discard-top')).toBe(false);
    controller.advance();
    expect(controller.view.phase).toBe('opponent-response');
    const settledNodes = all(buildRhetoricDuelUI(controller.view, DEFAULT_RHETORIC_CONFIG));
    expect(settledNodes.some((node) => node.id === 'rhetoric-discard-flight')).toBe(false);
    expect(settledNodes.some((node) => node.id === 'rhetoric-discard-top')).toBe(true);
  });
});
