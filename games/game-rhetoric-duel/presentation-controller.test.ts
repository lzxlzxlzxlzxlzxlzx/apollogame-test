import { describe, expect, it } from 'vitest';
import { END_TURN_ACTION, PLAY_CARD_ACTION } from './blueprint.js';
import { RHETORIC_FIXTURES, type RhetoricGameConfig } from './config.js';
import { EXIT_ACTION, RhetoricPresentationController, SKIP_PRESENTATION_ACTION, type RhetoricGameResult } from './presentation-controller.js';
import { RhetoricDuelSession } from './session.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function configFor(cardId: string, encounter: Partial<RhetoricGameConfig['encounter']> = {}): RhetoricGameConfig {
  const config = copy(RHETORIC_FIXTURES[0]) as RhetoricGameConfig;
  (config as any).deck = [{ cardId, copies: 1 }];
  Object.assign(config.encounter as object, { openingHand: 1, drawPerTurn: 1, handLimit: 1, ...encounter });
  return config;
}

function settle(controller: RhetoricPresentationController): string[] {
  const phases = [controller.view.phase];
  for (let guard = 0; guard < 40 && controller.busy; guard += 1) {
    const phase = controller.advance();
    if (phase !== phases[phases.length - 1]) phases.push(phase);
  }
  expect(controller.busy).toBe(false);
  return phases;
}

describe('game-rhetoric-duel · W4 presentation controller', () => {
  it('按固定闭集播放入场、出牌与敌方回合，阶段不写回 sim', () => {
    const controller = new RhetoricPresentationController(new RhetoricDuelSession());
    expect(settle(controller)).toEqual(['camera', 'reveal-intent', 'deal-opening-hand', 'ready']);
    const cardId = controller.session.snapshot().hand[0]!;
    controller.enqueueAction(PLAY_CARD_ACTION, { arg: cardId });
    expect(settle(controller)).toEqual(['card-flight', 'impact', 'opponent-response', 'ready']);
    controller.enqueueAction(END_TURN_ACTION);
    expect(settle(controller)).toEqual(['round-end', 'enemy-intent', 'enemy-impact', 'focus-refresh', 'deal-new-cards', 'ready']);
  });

  it('动画期间双击、键盘与鼠标并发只提交一张牌', () => {
    const controller = new RhetoricPresentationController(new RhetoricDuelSession());
    settle(controller);
    const before = controller.session.snapshot();
    const cardId = before.hand[0]!;
    controller.enqueueAction(PLAY_CARD_ACTION, { arg: cardId });
    controller.enqueueAction(PLAY_CARD_ACTION, { arg: cardId });
    controller.playVisibleCard(0);
    expect(controller.session.snapshot().hand.length).toBe(before.hand.length - 1);
    expect(controller.view.phase).toBe('card-flight');
  });

  it('点击第 5 卡位从真实槽位飞行，impact 前保留其余槽位、impact 后才收拢', () => {
    const controller = new RhetoricPresentationController(new RhetoricDuelSession());
    settle(controller);
    const before = controller.view.snapshot;
    controller.playVisibleCard(4);
    expect(controller.view.phase).toBe('card-flight');
    expect(controller.view.playedIndex).toBe(4);
    expect(controller.view.snapshot.hand).toEqual(before.hand);
    expect(controller.view.handVisuals.find((visual) => visual.previousIndex === 4)?.status).toBe('played');
    controller.advance();
    expect(controller.view.phase).toBe('impact');
    expect(controller.view.snapshot.hand).toEqual(controller.session.snapshot().hand);
    expect(controller.view.snapshot.hand).toHaveLength(before.hand.length - 1);
  });

  it('即时胜利先播资源冲击，再播终局且绝不插入 enemy-turn', () => {
    const results: RhetoricGameResult[] = [];
    const controller = new RhetoricPresentationController(new RhetoricDuelSession(configFor('probe-question', { target: 1 })), { onResult: (result) => results.push(result) });
    settle(controller);
    controller.enqueueAction(PLAY_CARD_ACTION, { arg: 'probe-question' });
    expect(settle(controller)).toEqual([
      'card-flight', 'impact', 'opponent-response', 'ready',
      'victory-impact', 'portrait-resolve', 'result-panel',
    ]);
    expect(results).toEqual(['win']);
    controller.enqueueAction(END_TURN_ACTION);
    expect(results).toEqual(['win']);
  });

  it('压力失败与回合耗尽分别进入失败序列，结果只提交一次', () => {
    for (const [mode, config] of [
      ['pressure', configFor('probe-question', { pressureLimit: 1 })],
      ['turns', (() => { const value = copy(RHETORIC_FIXTURES[0]) as RhetoricGameConfig; Object.assign(value.encounter as object, { pressureLimit: 99 }); return value; })()],
    ] as const) {
      const results: RhetoricGameResult[] = [];
      const controller = new RhetoricPresentationController(new RhetoricDuelSession(config), { onResult: (result) => results.push(result) });
      settle(controller);
      do {
        controller.enqueueAction(END_TURN_ACTION);
        settle(controller);
      } while (!controller.view.result);
      expect(controller.session.snapshot().phase).toBe(mode === 'pressure' ? 'defeat-pressure' : 'defeat-turns');
      expect(results).toEqual(['loss']);
      controller.enqueueAction(EXIT_ACTION);
      controller.enqueueAction(EXIT_ACTION);
      expect(results).toEqual(['loss']);
    }
  });

  it('skip、reduced-motion 与普通播放抵达深度相等的最终快照', () => {
    const normal = new RhetoricPresentationController(new RhetoricDuelSession());
    const skipped = new RhetoricPresentationController(new RhetoricDuelSession());
    const reduced = new RhetoricPresentationController(new RhetoricDuelSession(), { reducedMotion: true });
    settle(normal); skipped.enqueueAction(SKIP_PRESENTATION_ACTION); settle(reduced);
    const cardId = normal.session.snapshot().hand[0]!;
    normal.enqueueAction(PLAY_CARD_ACTION, { arg: cardId }); settle(normal);
    skipped.enqueueAction(PLAY_CARD_ACTION, { arg: cardId }); skipped.enqueueAction(SKIP_PRESENTATION_ACTION);
    reduced.enqueueAction(PLAY_CARD_ACTION, { arg: cardId }); settle(reduced);
    expect(skipped.view.snapshot).toEqual(normal.view.snapshot);
    expect(reduced.view.snapshot).toEqual(normal.view.snapshot);
    expect(reduced.view.reducedMotion).toBe(true);
  });

  it('窗口失焦恢复会对齐 committed after，不会永久 busy', () => {
    const controller = new RhetoricPresentationController(new RhetoricDuelSession());
    expect(controller.busy).toBe(true);
    controller.recoverAfterBlur();
    expect(controller.busy).toBe(false);
    expect(controller.view.phase).toBe('ready');
    expect(controller.view.snapshot).toEqual(controller.session.snapshot());
  });

  it('主动退出只提交 exited 一次，装饰性重复退出不覆盖结果', () => {
    const results: RhetoricGameResult[] = [];
    let exits = 0;
    const controller = new RhetoricPresentationController(new RhetoricDuelSession(), { onResult: (result) => results.push(result), onExit: () => { exits += 1; } });
    settle(controller);
    controller.enqueueAction(EXIT_ACTION);
    controller.enqueueAction(EXIT_ACTION);
    expect(results).toEqual(['exited']);
    expect(exits).toBe(1);
  });
});
