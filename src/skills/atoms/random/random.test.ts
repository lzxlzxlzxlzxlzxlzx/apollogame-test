import { describe, it, expect } from 'vitest';
import { randomCapability, nextRandom, randomInt } from './index.js';
import type { RandomSeed } from '@engine/protocol/components.js';

function seed(s: number): RandomSeed {
  return { type: 'RandomSeed', seed: s, sequence: 0 };
}

describe('random atom', () => {
  it('is a world-service atom with no per-tick system', () => {
    expect(randomCapability.systems).toHaveLength(0);
  });

  it('produces a deterministic sequence for the same seed', () => {
    const a = seed(42);
    const b = seed(42);
    const seqA = [nextRandom(a), nextRandom(a), nextRandom(a)];
    const seqB = [nextRandom(b), nextRandom(b), nextRandom(b)];
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    expect(nextRandom(seed(1))).not.toBe(nextRandom(seed(2)));
  });

  it('returns values in [0, 1) and advances sequence', () => {
    const s = seed(7);
    for (let i = 0; i < 100; i++) {
      const v = nextRandom(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(s.sequence).toBe(100);
  });

  it('sequence 缺省（蓝图只给 {seed}）→ 首次取数后为 1 而非 NaN（深审 A1 探针带出）', () => {
    const s = { type: 'RandomSeed', seed: 108 } as never as ReturnType<typeof seed>;
    nextRandom(s);
    expect(s.sequence).toBe(1); // 撤修（sequence += 1）→ NaN，本断言红
  });

  it('randomInt stays within [min, max)', () => {
    const s = seed(123);
    for (let i = 0; i < 200; i++) {
      const n = randomInt(s, 5, 10);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThan(10);
    }
  });
});

describe('deriveSeed（B-7）', () => {
  it('同 seed 同 label 同结果；不同 label / 不同 seed 分流；返回 int32；派生流可照常 nextRandom', async () => {
    const { deriveSeed, nextRandom } = await import('./index.js');
    expect(deriveSeed(42, 'ai:p1')).toBe(deriveSeed(42, 'ai:p1'));
    expect(deriveSeed(42, 'ai:p1')).not.toBe(deriveSeed(42, 'ai:p2'));
    expect(deriveSeed(42, 'ai:p1')).not.toBe(deriveSeed(43, 'ai:p1'));
    const s = deriveSeed(7, 'meta');
    expect(Number.isInteger(s) && s >= -2147483648 && s <= 2147483647).toBe(true);
    const a = { type: 'RandomSeed', seed: s, sequence: 0 } as { type: 'RandomSeed'; seed: number; sequence: number };
    const b = { type: 'RandomSeed', seed: s, sequence: 0 } as { type: 'RandomSeed'; seed: number; sequence: number };
    expect([nextRandom(a), nextRandom(a)]).toEqual([nextRandom(b), nextRandom(b)]);
  });
});

describe('shuffleBag / gaussianApprox（§6 补齐）', () => {
  it('抽签袋：一轮内每项恰出现一次·抽空自动重洗·同 seed 同序列·空袋 undefined', async () => {
    const { createShuffleBag, drawFromBag } = await import('./index.js');
    const seed = { type: 'RandomSeed', seed: 99, sequence: 0 } as { type: 'RandomSeed'; seed: number; sequence: number };
    const bag = createShuffleBag(['a', 'b', 'c', 'd'], seed);
    const round1 = [drawFromBag(bag), drawFromBag(bag), drawFromBag(bag), drawFromBag(bag)];
    expect([...round1].sort()).toEqual(['a', 'b', 'c', 'd']);
    const round2 = [drawFromBag(bag), drawFromBag(bag), drawFromBag(bag), drawFromBag(bag)];
    expect([...round2].sort()).toEqual(['a', 'b', 'c', 'd']);
    const seed2 = { type: 'RandomSeed', seed: 99, sequence: 0 } as typeof seed;
    const bag2 = createShuffleBag(['a', 'b', 'c', 'd'], seed2);
    expect([drawFromBag(bag2), drawFromBag(bag2), drawFromBag(bag2), drawFromBag(bag2)]).toEqual(round1);
    expect(drawFromBag(createShuffleBag([], seed))).toBeUndefined();
  });

  it('正态近似：确定性·均值/方差落在合理范围·推进 sequence 12/次', async () => {
    const { gaussianApprox } = await import('./index.js');
    const s = { type: 'RandomSeed', seed: 7, sequence: 0 } as { type: 'RandomSeed'; seed: number; sequence: number };
    const xs: number[] = [];
    for (let i = 0; i < 2000; i++) xs.push(gaussianApprox(s, 10, 2));
    expect(s.sequence).toBe(24000);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const varc = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length;
    expect(Math.abs(mean - 10)).toBeLessThan(0.2);
    expect(Math.abs(Math.sqrt(varc) - 2)).toBeLessThan(0.2);
    const t = { type: 'RandomSeed', seed: 7, sequence: 0 } as typeof s;
    expect(gaussianApprox(t, 10, 2)).toBe(xs[0]);
  });
});
