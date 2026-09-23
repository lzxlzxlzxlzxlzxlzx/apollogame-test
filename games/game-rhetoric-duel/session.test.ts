import { describe, expect, it } from 'vitest';
import { RHETORIC_CATALOG, RHETORIC_FIXTURES, type RhetoricGameConfig } from './config.js';
import { RhetoricDuelSession, type RhetoricSnapshot } from './session.js';
import { buildBlueprint } from './blueprint.js';
import { validateComponentData } from '@zerocraft/engine/assembly/validate-manifest.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const terminal = (state: RhetoricSnapshot): boolean => state.phase === 'victory' || state.phase.startsWith('defeat-');

function finishRound(duel: RhetoricDuelSession): RhetoricSnapshot {
  const before = duel.snapshot().turns;
  duel.endTurn();
  for (let i = 0; i < 10; i += 1) {
    const state = duel.snapshot();
    if (terminal(state) || (state.turns > before && state.phase.startsWith('player-') && state.canPlay)) return state;
    duel.tick();
  }
  throw new Error(`round did not settle: ${JSON.stringify(duel.snapshot())}`);
}

function playAndCommit(duel: RhetoricDuelSession, cardId: string): RhetoricSnapshot {
  duel.play(cardId);
  duel.tick(); // resource-apply 已提交后，flow 下一拍执行立即终局检查。
  return duel.snapshot();
}

function winEncounter(config: RhetoricGameConfig): RhetoricSnapshot {
  const duel = new RhetoricDuelSession(config);
  for (let guard = 0; guard < 60 && !terminal(duel.snapshot()); guard += 1) {
    const state = duel.snapshot();
    const choices = state.hand
      .map((cardId) => RHETORIC_CATALOG.find((card) => card.cardId === cardId)!)
      .filter((card) => card.focusCost <= state.focus && card.effects.some((effect) => effect.targetId === 'progress' && effect.value > 0))
      .sort((a, b) => {
        const progress = (card: typeof a) => card.effects.filter((effect) => effect.targetId === 'progress').reduce((sum, effect) => sum + effect.value, 0);
        const pressure = (card: typeof a) => card.effects.filter((effect) => effect.targetId === 'pressure').reduce((sum, effect) => sum + effect.value, 0);
        return pressure(a) - pressure(b) || progress(b) - progress(a) || a.cardId.localeCompare(b.cardId);
      });
    if (choices.length > 0) playAndCommit(duel, choices[0]!.cardId);
    else finishRound(duel);
  }
  return duel.snapshot();
}

describe('game-rhetoric-duel · W2 deterministic encounter flow', () => {
  it('三份正式 fixture 装配后的 capability 数据均通过递归 schema 落盘门', () => {
    for (const fixture of RHETORIC_FIXTURES) {
      const blueprint = buildBlueprint(fixture);
      const report = validateComponentData(blueprint.capabilities, blueprint.entities);
      expect(report.errors, `${fixture.encounter.encounterId}: ${JSON.stringify(report.errors)}`).toEqual([]);
    }
  });

  it('同 encounter、seed、输入脚本双跑逐拍 hash 一致', () => {
    const run = (): string[] => {
      const duel = new RhetoricDuelSession();
      const frames = [duel.engine.hash()];
      const first = duel.snapshot().hand[0]!;
      duel.play(first); frames.push(duel.engine.hash());
      duel.tick(); frames.push(duel.engine.hash());
      duel.endTurn(); frames.push(duel.engine.hash());
      for (let i = 0; i < 5; i += 1) { duel.tick(); frames.push(duel.engine.hash()); }
      return frames;
    };
    expect(run()).toEqual(run());
  });

  it.each(RHETORIC_FIXTURES.map((fixture) => [fixture.encounter.encounterId, fixture] as const))(
    '%s：公开 play/endTurn 路径均可胜利，也可零出牌耗尽回合失败',
    (_id, fixture) => {
      expect(winEncounter(fixture).phase).toBe('victory');
      const loss = new RhetoricDuelSession(fixture);
      while (!terminal(loss.snapshot())) finishRound(loss);
      expect(loss.snapshot().phase).toBe('defeat-turns');
    },
  );

  it('结束回合严格按：意图施压 → 失败检查 → 专注刷新 → 受控抽牌 → 下一玩家态', () => {
    const duel = new RhetoricDuelSession();
    const opening = duel.snapshot();
    expect(opening).toMatchObject({ phase: 'player-1', canPlay: true, turns: 0 });
    expect(opening.hand).toHaveLength(duel.config.encounter.openingHand);
    const after = finishRound(duel);
    expect(after).toMatchObject({ phase: 'player-2', canPlay: true, turns: 1, pressure: 1, focus: duel.config.encounter.focusPerTurn });
    expect(after.hand.length).toBeLessThanOrEqual(duel.config.encounter.handLimit);
    expect(after.hand.length).toBe(Math.min(duel.config.encounter.handLimit, opening.hand.length + duel.config.encounter.drawPerTurn));
    expect(duel.trace().map((event) => `${event.kind}:${event.what}`)).toEqual(expect.arrayContaining([
      expect.stringContaining('transition:player-1→intent-1'),
      expect.stringContaining('decision:intent=cold-question'),
      expect.stringContaining('commit:pressure 0→1'),
      expect.stringContaining('commit:draw='),
    ]));
  });

  it('压力越线优先判 defeat-pressure；终局后 play/endTurn 均 fail-closed', () => {
    const config = copy(RHETORIC_FIXTURES[0]) as RhetoricGameConfig;
    (config.encounter as { pressureLimit: number }).pressureLimit = 1;
    const duel = new RhetoricDuelSession(config);
    expect(finishRound(duel).phase).toBe('defeat-pressure');
    const frozen = duel.snapshot();
    duel.endTurn(); duel.tick(); duel.play('probe-question'); duel.tick();
    expect(duel.snapshot()).toEqual(frozen);
    expect(duel.trace().filter((event) => event.kind === 'reject').map((event) => event.what).join('\n')).toMatch(/条件门关闭/);
  });

  it('真实出牌达到目标立即胜利，不再结算敌人意图', () => {
    const config = copy(RHETORIC_FIXTURES[0]) as RhetoricGameConfig;
    (config as any).deck = [{ cardId: 'probe-question', copies: 1 }];
    Object.assign(config.encounter as object, { target: 1, openingHand: 1, drawPerTurn: 1, handLimit: 1 });
    const duel = new RhetoricDuelSession(config);
    expect(playAndCommit(duel, 'probe-question')).toMatchObject({ phase: 'victory', progress: 1, pressure: 0, turns: 0, canPlay: false });
    expect(duel.trace().some((event) => event.what.includes('intent='))).toBe(false);
  });

  it('未知卡、手牌外出牌、专注不足均拒绝；降压不低于 0', () => {
    const duel = new RhetoricDuelSession();
    const before = duel.snapshot();
    duel.play('unknown-card');
    expect(duel.snapshot()).toEqual(before);
    const outside = RHETORIC_CATALOG.find((card) => !before.hand.includes(card.cardId))!;
    duel.play(outside.cardId);
    expect(duel.snapshot()).toEqual(before);

    const costly = copy(RHETORIC_FIXTURES[0]) as RhetoricGameConfig;
    (costly as any).deck = [{ cardId: 'press-the-point', copies: 1 }];
    Object.assign(costly.encounter as object, { openingHand: 1, handLimit: 1, drawPerTurn: 1, focusPerTurn: 2 });
    const noFocus = new RhetoricDuelSession(costly);
    const costlyBefore = noFocus.snapshot(); noFocus.play('press-the-point');
    expect(noFocus.snapshot()).toEqual(costlyBefore);

    const calm = copy(RHETORIC_FIXTURES[0]) as RhetoricGameConfig;
    (calm as any).deck = [{ cardId: 'steady-breath', copies: 1 }];
    Object.assign(calm.encounter as object, { openingHand: 1, handLimit: 1, drawPerTurn: 1 });
    const clamped = new RhetoricDuelSession(calm); playAndCommit(clamped, 'steady-breath');
    expect(clamped.snapshot().pressure).toBe(0);
  });

  it('牌库耗尽后按 seed 确定性洗回弃牌，且手牌始终不超过 handLimit', () => {
    const config = copy(RHETORIC_FIXTURES[0]) as RhetoricGameConfig;
    (config as any).deck = [{ cardId: 'probe-question', copies: 2 }];
    Object.assign(config.encounter as object, { target: 100, pressureLimit: 100, openingHand: 1, drawPerTurn: 2, handLimit: 2 });
    const duel = new RhetoricDuelSession(config);
    playAndCommit(duel, 'probe-question');
    expect(finishRound(duel).hand.length).toBeLessThanOrEqual(2);
    for (const cardId of [...duel.snapshot().hand]) playAndCommit(duel, cardId);
    const recycled = finishRound(duel);
    expect(recycled.hand).toHaveLength(2);
    expect(recycled.deck).toHaveLength(0);
    expect(recycled.discard).toHaveLength(0);
  });
});
