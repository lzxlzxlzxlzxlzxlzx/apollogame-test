import { describe, expect, it } from 'vitest';
import { RhetoricDuelSession } from './session.js';

describe('game-rhetoric-duel · 内部规则核', () => {
  it('同 encounter、seed、输入脚本双跑逐拍一致', () => {
    const run = (): string[] => {
      const duel = new RhetoricDuelSession();
      const frames = [duel.engine.hash()];
      const first = duel.snapshot().hand[0]!;
      duel.play(first); frames.push(duel.engine.hash());
      duel.endTurn(); frames.push(duel.engine.hash());
      duel.tick(); frames.push(duel.engine.hash());
      return frames;
    };
    expect(run()).toEqual(run());
  });

  it('ActionSink 形状的 cardId 参数经 IdentityCardInput 真正出牌并扣费用', () => {
    const duel = new RhetoricDuelSession();
    const before = duel.snapshot();
    const cardId = before.hand[0]!;
    duel.play(cardId);
    const after = duel.snapshot();
    expect(after.hand.length).toBe(before.hand.length - 1);
    expect(after.discard).toContain(cardId);
    expect(after.focus).toBeLessThanOrEqual(before.focus);
  });

  it('对手有序意图由 event-when 消费；回合结束重置专注', () => {
    const duel = new RhetoricDuelSession();
    duel.endTurn();
    expect(duel.snapshot().turns).toBe(1);
    duel.tick();
    expect(duel.snapshot().pressure).toBe(1);
    expect(duel.snapshot().focus).toBe(3);
  });

  it('进度胜利、压力失败与回合耗尽失败均由 t3-flow 终局', () => {
    const win = new RhetoricDuelSession();
    const progress = win.engine.world.getComponent<any>('progress', 'Resource')!;
    progress.current = progress.max;
    win.tick();
    expect(win.snapshot().phase).toBe('victory');

    const pressure = new RhetoricDuelSession();
    const pressureResource = pressure.engine.world.getComponent<any>('pressure', 'Resource')!;
    pressureResource.current = pressureResource.max;
    pressure.tick();
    expect(pressure.snapshot().phase).toBe('defeat-pressure');

    const turns = new RhetoricDuelSession();
    const turnResource = turns.engine.world.getComponent<any>('turns', 'Resource')!;
    turnResource.current = turnResource.max;
    turns.tick();
    expect(turns.snapshot().phase).toBe('defeat-turns');
  });
});
