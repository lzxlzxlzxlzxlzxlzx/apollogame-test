import { describe, expect, it } from 'vitest';
import { inputFromContract, lockpickOutput, parseLockpickInput } from '../src/contract.js';

describe('game-lockpick DokiWorld contract', () => {
  it.each(['easy', 'normal', 'hard'] as const)('accepts %s as the sole business input', (difficulty) => {
    expect(parseLockpickInput({ difficulty })).toEqual({ difficulty });
  });
  it('rejects absent, extra, malformed and mismatched input', () => {
    class InputLike { difficulty = 'easy'; }
    for (const value of [{}, { difficulty: 'EASY' }, { difficulty: 3 }, { difficulty: 'easy', seed: 1 }, new InputLike(), [], null]) expect(() => parseLockpickInput(value)).toThrow();
    expect(() => inputFromContract({ contract: 'wrong', version: 1, data: { difficulty: 'easy' } })).toThrow();
  });
  it('emits only the strict outcome envelope', () => {
    expect(lockpickOutput('success')).toEqual({ contract: 'doki.game.lockpick-result', version: 1, data: { outcome: 'success' } });
    expect(Object.keys(lockpickOutput('failure').data)).toEqual(['outcome']);
  });
});
