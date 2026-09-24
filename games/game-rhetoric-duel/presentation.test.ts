import { describe, expect, it } from 'vitest';
import { RHETORIC_CATALOG, RHETORIC_FIXTURES, type RhetoricGameConfig } from './config.js';
import {
  projectRhetoricTransition,
  resourceDelta,
  type RhetoricPresentationTransition,
} from './presentation.js';
import { RhetoricDuelSession, type RhetoricSnapshot } from './session.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function projectedPhases(transition: RhetoricPresentationTransition, reducedMotion = false): string[] {
  const projection = projectRhetoricTransition(transition, reducedMotion);
  expect(projection.accepted).toBe(true);
  if (!projection.accepted) return [];
  const phases = [projection.controller.phase];
  while (!projection.controller.settled) phases.push(projection.controller.advance());
  expect(projection.controller.after).toBe(transition.after);
  return phases;
}

function oneCardConfig(cardId: string, extra: Partial<RhetoricGameConfig['encounter']> = {}): RhetoricGameConfig {
  const config = copy(RHETORIC_FIXTURES[0]) as RhetoricGameConfig;
  (config as any).deck = [{ cardId, copies: 1 }];
  Object.assign(config.encounter as object, { openingHand: 1, drawPerTurn: 1, handLimit: 1, ...extra });
  return config;
}

describe('game-rhetoric-duel · W3 committed presentation transitions', () => {
  it('入场仅投影已提交的开局抽牌，并且转场队列只消费一次', () => {
    const duel = new RhetoricDuelSession();
    const transitions = duel.takeTransitions();
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ kind: 'enter', after: duel.snapshot(), drawnCardIds: duel.snapshot().hand });
    expect(projectedPhases(transitions[0]!)).toEqual(['camera', 'reveal-intent', 'deal-opening-hand', 'ready']);
    expect(duel.takeTransitions()).toEqual([]);
  });

  it('合法出牌产生唯一 card-played 转场；未知卡与专注不足不产生演出', () => {
    const duel = new RhetoricDuelSession(oneCardConfig('probe-question', { target: 99 }));
    duel.takeTransitions();
    const accepted = duel.play('probe-question');
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ kind: 'card-played', cardId: 'probe-question' });
    expect(projectedPhases(accepted[0]!)).toEqual(['card-flight', 'impact', 'opponent-response', 'ready']);
    expect(duel.play('unknown-card')).toEqual([]);

    const noFocus = new RhetoricDuelSession(oneCardConfig('press-the-point', { focusPerTurn: 2, target: 99 }));
    noFocus.takeTransitions();
    expect(noFocus.play('press-the-point')).toEqual([]);
    expect(noFocus.takeTransitions()).toEqual([]);
  });

  it('多效果牌的 delta 固定按 progress → pressure → focus 排列', () => {
    const duel = new RhetoricDuelSession(oneCardConfig('state-the-line', { target: 99 }));
    duel.takeTransitions();
    const transition = duel.play('state-the-line')[0]!;
    expect(transition.resourceDelta).toEqual([
      { resourceId: 'progress', value: 3 },
      { resourceId: 'pressure', value: 1 },
      { resourceId: 'focus', value: -2 },
    ]);
  });

  it('零费牌不伪造专注 delta，回收专注牌只报告真实回收量', () => {
    const free = new RhetoricDuelSession(oneCardConfig('hold-the-answer', { target: 99 }));
    free.takeTransitions();
    expect(free.play('hold-the-answer')[0]!.resourceDelta).toEqual([]);

    const config = copy(RHETORIC_FIXTURES[0]) as RhetoricGameConfig;
    (config as any).deck = [
      { cardId: 'probe-question', copies: 1 },
      { cardId: 'gather-your-thoughts', copies: 1 },
    ];
    Object.assign(config.encounter as object, { target: 99, openingHand: 2, handLimit: 2, drawPerTurn: 1 });
    const regain = new RhetoricDuelSession(config);
    regain.takeTransitions();
    regain.play('probe-question');
    const recovered = regain.play('gather-your-thoughts')[0]!;
    expect(recovered.resourceDelta).toEqual([{ resourceId: 'focus', value: 1 }]);
  });

  it('敌方回合把意图、资源变化和新增手牌封装成一个只读转场', () => {
    const duel = new RhetoricDuelSession();
    duel.takeTransitions();
    const playable = duel.snapshot().hand
      .map((cardId) => RHETORIC_CATALOG.find((card) => card.cardId === cardId)!)
      .find((card) => card.focusCost > 0 && card.focusCost <= duel.snapshot().focus)!;
    duel.play(playable.cardId);
    duel.takeTransitions();
    const before = duel.snapshot();
    const transitions = duel.endTurn();
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      kind: 'enemy-turn',
      intentId: before.intentId,
      resourceDelta: expect.arrayContaining([
        { resourceId: 'pressure', value: 1 },
        { resourceId: 'focus', value: duel.config.encounter.focusPerTurn - before.focus },
      ]),
    });
    expect(transitions[0]!.drawnCardIds).toHaveLength(Math.min(
      duel.config.encounter.drawPerTurn,
      duel.config.encounter.handLimit - before.hand.length,
    ));
    expect(projectedPhases(transitions[0]!)).toEqual(['round-end', 'enemy-intent', 'enemy-impact', 'focus-refresh', 'deal-new-cards', 'ready']);
  });

  it('胜利即时终止，只投影出牌与胜利终局，不伪造敌方回合', () => {
    const duel = new RhetoricDuelSession(oneCardConfig('probe-question', { target: 1 }));
    duel.takeTransitions();
    const transitions = duel.play('probe-question');
    expect(transitions.map((entry) => entry.kind)).toEqual(['card-played', 'terminal']);
    expect(transitions[1]).toMatchObject({ outcome: 'win', after: { phase: 'victory' } });
    expect(projectedPhases(transitions[1]!)).toEqual(['victory-impact', 'portrait-resolve', 'result-panel']);
    expect(duel.endTurn()).toEqual([]);
  });

  it('压力失败使用失败演出词表，终局结果始终来自已提交 after', () => {
    const duel = new RhetoricDuelSession(oneCardConfig('probe-question', { pressureLimit: 1 }));
    duel.takeTransitions();
    const transitions = duel.endTurn();
    expect(transitions.map((entry) => entry.kind)).toEqual(['enemy-turn', 'terminal']);
    const terminal = transitions[1]!;
    expect(terminal).toMatchObject({ outcome: 'loss', after: { phase: 'defeat-pressure' } });
    expect(projectedPhases(terminal)).toEqual(['failure-impact', 'portrait-dominates', 'result-panel']);
  });

  it('回合耗尽只产生一次 terminal，重新消费或终局后输入不重放历史', () => {
    const config = copy(RHETORIC_FIXTURES[0]) as RhetoricGameConfig;
    Object.assign(config.encounter as object, { pressureLimit: 99 });
    const duel = new RhetoricDuelSession(config);
    duel.takeTransitions();
    const all: RhetoricPresentationTransition[] = [];
    for (let turn = 0; turn < config.encounter.turnLimit; turn += 1) all.push(...duel.endTurn());
    expect(duel.snapshot().phase).toBe('defeat-turns');
    expect(all.filter((entry) => entry.kind === 'terminal')).toHaveLength(1);
    expect(duel.takeTransitions().filter((entry) => entry.kind === 'terminal')).toHaveLength(1);
    expect(duel.takeTransitions()).toEqual([]);
    expect(duel.endTurn()).toEqual([]);
  });

  it('正常播放、跳过与 reduced-motion 只改变 render cursor，共享同一提交结果', () => {
    const duel = new RhetoricDuelSession();
    const transition = duel.takeTransitions()[0]!;
    const normal = projectRhetoricTransition(transition);
    const reduced = projectRhetoricTransition(transition, true);
    expect(normal.accepted && reduced.accepted).toBe(true);
    if (!normal.accepted || !reduced.accepted) return;
    const committed = transition.after;
    normal.controller.advance();
    expect(normal.controller.after).toBe(committed);
    expect(reduced.controller.reducedMotion).toBe(true);
    expect(reduced.controller.skip()).toBe('ready');
    expect(reduced.controller.after).toBe(committed);
    expect(duel.snapshot()).toEqual(committed);
  });

  it('转场队列和播放 cursor 都不参与模拟 hash', () => {
    const projected = new RhetoricDuelSession();
    const untouched = new RhetoricDuelSession();
    const transition = projected.takeTransitions()[0]!;
    const view = projectRhetoricTransition(transition);
    expect(view.accepted).toBe(true);
    if (view.accepted) view.controller.skip();
    expect(projected.engine.hash()).toBe(untouched.engine.hash());
  });

  it('合同可纯 JSON 序列化，不含 URL、墙钟、函数或视觉运行时字段', () => {
    const transition = new RhetoricDuelSession().takeTransitions()[0]!;
    const json = JSON.stringify(transition);
    expect(JSON.parse(json)).toEqual(transition);
    expect(json).not.toMatch(/https?:/i);
    const forbiddenKey = /^(?:timer|duration|promise|callback|frame|coordinate|imageUrl)$/i;
    const containsForbiddenKey = (value: unknown): boolean => {
      if (!value || typeof value !== 'object') return false;
      return Object.entries(value).some(([key, nested]) => forbiddenKey.test(key) || containsForbiddenKey(nested));
    };
    expect(containsForbiddenKey(transition)).toBe(false);
    const containsFunction = (value: unknown): boolean => {
      if (typeof value === 'function') return true;
      if (!value || typeof value !== 'object') return false;
      return Object.values(value).some(containsFunction);
    };
    expect(containsFunction(transition)).toBe(false);
  });

  it('资源差值只含变化项且不会改写任一快照', () => {
    const before = { progress: 1, pressure: 2, focus: 3 } as RhetoricSnapshot;
    const after = { progress: 4, pressure: 2, focus: 1 } as RhetoricSnapshot;
    expect(resourceDelta(before, after)).toEqual([
      { resourceId: 'progress', value: 3 },
      { resourceId: 'focus', value: -2 },
    ]);
    expect(before).toMatchObject({ progress: 1, pressure: 2, focus: 3 });
    expect(after).toMatchObject({ progress: 4, pressure: 2, focus: 1 });
  });
});
