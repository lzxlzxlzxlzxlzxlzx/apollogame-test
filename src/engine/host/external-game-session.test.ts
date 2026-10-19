import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_GAME_SESSION_VERSION,
  startExternalGameSession,
} from './external-game-session.js';

type DiceInput = { dice: readonly { sides: 4 | 6 | 8 | 20 }[] };

const request = (overrides: Partial<{ seed: number; preset: unknown; requestId: string; version: number }> = {}) => ({
  version: EXTERNAL_GAME_SESSION_VERSION,
  requestId: 'dice-request-7',
  input: { dice: [{ sides: 6 }] } satisfies DiceInput,
  ...overrides,
});

describe('startExternalGameSession（外部小游戏会话合同）', () => {
  it('调用方提供 seed 时保持确定性，且不请求宿主熵', () => {
    let entropyCalls = 0;
    const entropy = () => { entropyCalls += 1; return 99; };
    const first = startExternalGameSession<DiceInput, { value: number }>(request({ seed: -1 }), entropy);
    const second = startExternalGameSession<DiceInput, { value: number }>(request({ seed: -1 }), entropy);

    expect(first.ok && first.session.seed).toBe(4_294_967_295);
    expect(second.ok && second.session.seed).toBe(4_294_967_295);
    expect(entropyCalls).toBe(0);
  });

  it('预定结果不消耗熵，也不凭空生成 seed', () => {
    let entropyCalls = 0;
    const started = startExternalGameSession<DiceInput, { value: number }>(
      request({ preset: { value: 4 } }),
      () => { entropyCalls += 1; return 123; },
    );

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.session.seed).toBeUndefined();
    expect(started.session.complete({ value: 4 })).toEqual({
      version: 1, requestId: 'dice-request-7', status: 'settled', result: { value: 4 },
    });
    expect(entropyCalls).toBe(0);
  });

  it('调用方未给结果或 seed 时恰好向宿主取一次熵，并把 seed 纳入回传', () => {
    let entropyCalls = 0;
    const started = startExternalGameSession<DiceInput, { value: number }>(request(), () => {
      entropyCalls += 1;
      return 42;
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.session.seed).toBe(42);
    expect(started.session.complete({ value: 3 })).toEqual({
      version: 1, requestId: 'dice-request-7', status: 'settled', seed: 42, result: { value: 3 },
    });
    expect(entropyCalls).toBe(1);
  });

  it('没有可用熵时 fail closed，不让游戏层退回 Math.random', () => {
    const noPort = startExternalGameSession<DiceInput, { value: number }>(request());
    const invalidPort = startExternalGameSession<DiceInput, { value: number }>(request(), () => Number.NaN);

    expect(noPort).toEqual({
      ok: false,
      output: { version: 1, requestId: 'dice-request-7', status: 'rejected', reason: 'entropy-unavailable' },
    });
    expect(invalidPort).toEqual(noPort);
  });

  it('请求参数不合法时拒绝，并且不访问熵端口', () => {
    let entropyCalls = 0;
    const badVersion = startExternalGameSession<DiceInput, { value: number }>(
      request({ version: 2 }),
      () => { entropyCalls += 1; return 1; },
    );
    const badSeed = startExternalGameSession<DiceInput, { value: number }>(request({ seed: 1.5 }));
    const blankId = startExternalGameSession<DiceInput, { value: number }>(request({ requestId: '  ' }));

    expect(!badVersion.ok && badVersion.output.reason).toBe('invalid-request');
    expect(!badSeed.ok && badSeed.output.reason).toBe('invalid-request');
    expect(!blankId.ok && blankId.output.reason).toBe('invalid-request');
    expect(entropyCalls).toBe(0);
  });

  it('第一次结算是最终结算：重复完成或拒绝均不能篡改已回传结果', () => {
    const started = startExternalGameSession<DiceInput, { value: number }>(request({ seed: 7 }));
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const first = started.session.complete({ value: 2 });
    const second = started.session.complete({ value: 6 });
    const rejected = started.session.reject();
    expect(second).toBe(first);
    expect(rejected).toBe(first);
    expect(started.session.output()).toBe(first);
    expect(first).toEqual({
      version: 1, requestId: 'dice-request-7', status: 'settled', seed: 7, result: { value: 2 },
    });
  });
});
