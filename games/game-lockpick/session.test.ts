import { describe, expect, it } from 'vitest';
import { LockpickSession } from './session.js';

function solve(game: LockpickSession): void {
  for (const [slot, value] of (game.state().target ?? []).entries()) { game.set(slot, value); game.tick(); }
}

describe('game-lockpick consumes the discrete-combination capability', () => {
  it.each([['easy', 3], ['normal', 4], ['hard', 5]] as const)('maps %s to %i three-position tumblers', (difficulty, slots) => {
    const game = new LockpickSession(difficulty, 11);
    const state = game.state();
    expect(state).toMatchObject({ status: 'playing', slotCount: slots, valueCount: 3 });
    expect(state.current).toHaveLength(slots);
    expect(state.current?.every((value) => Number.isInteger(value) && value >= 0 && value < 3)).toBe(true);
    expect(state.target).not.toEqual(state.current);
    expect(state.matchCount).toBeLessThan(slots); // 初始随机向量绝不自动成功
  });

  it('derives reproducible but seed-varying random initial vectors', () => {
    const sameA = new LockpickSession('hard', 11).state();
    const sameB = new LockpickSession('hard', 11).state();
    const other = new LockpickSession('hard', 12).state();
    expect(sameA.current).toEqual(sameB.current);
    expect(sameA.target).toEqual(sameB.target);
    expect(other.current).not.toEqual(sameA.current);
  });

  it('permits unlimited non-completing moves and only confirmed give-up fails', () => {
    const game = new LockpickSession('hard', 11);
    for (let i = 0; i < 1_000; i += 1) { game.set(0, 0); game.tick(); }
    expect(game.state().status).toBe('playing');
    expect(game.receipt()).toBeUndefined();
    game.giveUp(); game.tick();
    expect(game.state().status).toBe('failure');
    expect(game.receipt()?.outcome).toBe('failure');
  });

  it('finishes success atomically and cannot complete twice', () => {
    const game = new LockpickSession('normal', 7);
    solve(game);
    expect(game.state().status).toBe('success');
    expect(game.receipt()).toEqual({ type: 'DiscreteCombinationReceipt', sessionId: 'lockpick-session', outcome: 'success' });
    game.giveUp(); game.set(0, 0); game.tick();
    expect(game.receipt()?.outcome).toBe('success');
  });

  it('is deterministic for an identical seed and input sequence', () => {
    const left = new LockpickSession('hard', 42); const right = new LockpickSession('hard', 42);
    for (const [slot, value] of [[0, 0], [3, 2], [1, 0], [4, 2]] as const) { left.set(slot, value); right.set(slot, value); left.tick(); right.tick(); }
    expect(right.state()).toEqual(left.state());
  });
});
