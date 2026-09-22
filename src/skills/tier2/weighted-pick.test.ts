import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { WeightedSpawn, Transform, Signal, RandomSeed, SpawnRequest } from '@engine/protocol/components.js';
import { mulberry32 } from '@atom-skills/random/index.js';
import { weightedPick } from './weighted-pick.js';
import { weightedSpawnCapability } from './weighted-spawn.js';

// weighted-pick 共享纯函数核测试（非 capability·对齐 dice.ts/hex.ts 纯函数测试先例）。
// 覆盖：区间落位精确边界 / 确定性（mulberry32 同种子）/ 空表·零权拒绝 / 浮点越界末元素兜底 /
// 经真 World.tick 的消费方（weighted-spawn）行为。golden 值全部先实跑真实现取值再钉。
const abc = [
  { id: 'a', weight: 1 },
  { id: 'b', weight: 2 },
  { id: 'c', weight: 3 },
] as const;

describe('weightedPick — 区间落位（total=6：a=[0,1) b=[1,3) c=[3,6) 按 rand*total 落位）', () => {
  it('rand=0 → 首元素（r=-w0<0 立即命中）', () => {
    expect(weightedPick(abc, () => 0)?.id).toBe('a');
  });
  it('rand 恰在 a/b 边界（1/6）→ 归 b（r-w0=0 不 <0，越过 a）', () => {
    expect(weightedPick(abc, () => 1 / 6)?.id).toBe('b');
  });
  it('边界左邻（0.16<1/6）→ 仍是 a', () => {
    expect(weightedPick(abc, () => 0.16)?.id).toBe('a');
  });
  it('rand=0.5（r=3 恰在 b/c 边界）→ 归 c', () => {
    expect(weightedPick(abc, () => 0.5)?.id).toBe('c');
  });
  it('零权首元素在 rand=0 时不可命中（r-0=0 不 <0 → 落到下一个正权元素）', () => {
    const entries = [{ id: 'zero', weight: 0 }, { id: 'one', weight: 1 }];
    expect(weightedPick(entries, () => 0)?.id).toBe('one');
  });
  it('单元素表：任意 rand 都选它', () => {
    for (const r of [0, 0.5, 0.999]) expect(weightedPick([{ id: 'solo', weight: 2 }], () => r)?.id).toBe('solo');
  });
});

describe('weightedPick — 确定性 + 分布 golden（mulberry32·实跑取值钉死）', () => {
  it('同 seed 同 entries → 双跑序列逐位一致', () => {
    const run = (): string[] => {
      const rand = mulberry32(123);
      return Array.from({ length: 100 }, () => (weightedPick(abc, rand) as { id: string }).id);
    };
    expect(run()).toEqual(run());
  });

  it('golden：seed=7 前 12 抽序列逐位钉死', () => {
    const rand = mulberry32(7);
    const seq = Array.from({ length: 12 }, () => (weightedPick(abc, rand) as { id: string }).id);
    // 实跑真实现取值（mulberry32(7) + weightedPick）——任何区间/推进变化都会翻红。
    expect(seq).toEqual(['a', 'a', 'c', 'c', 'c', 'b', 'b', 'b', 'c', 'c', 'b', 'a']);
  });

  it('golden：seed=42 抽 6000 次，1:2:3 权重的精确命中数', () => {
    const rand = mulberry32(42);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 6000; i++) counts[(weightedPick(abc, rand) as { id: string }).id]++;
    // 实跑取值：≈1000/2000/3000 的确定性精确值（区间划分或 PRNG 漂移即翻红）。
    expect(counts).toEqual({ a: 973, b: 2009, c: 3018 });
  });
});

describe('weightedPick — 拒绝路径（「什么都没发生」分支）', () => {
  it('空表 → undefined 且不消费 rand（不推进调用方 PRNG 序列）', () => {
    let calls = 0;
    const rand = (): number => { calls++; return 0.5; };
    expect(weightedPick([], rand)).toBeUndefined();
    expect(calls).toBe(0);
  });
  it('权重全零 → undefined 且不消费 rand', () => {
    let calls = 0;
    const rand = (): number => { calls++; return 0.5; };
    expect(weightedPick([{ weight: 0 }, { weight: 0 }], rand)).toBeUndefined();
    expect(calls).toBe(0);
  });
  it('权重总和为负 → undefined（!(total>0) 兜住 NaN/负数）', () => {
    expect(weightedPick([{ weight: -1 }, { weight: 0.5 }], () => 0)).toBeUndefined();
  });
  it('浮点越界兜底：in-contract rand（最大双精度 <1）× 权重 [0.1,0.2,0.3] 累减不归负 → 选末元素', () => {
    // 实跑验证：0.9999999999999999*0.6000000000000001 累减三项后余 ≈4e-17 ≥ 0 → idx 越界回退末元素。
    const entries = [{ id: 'x', weight: 0.1 }, { id: 'y', weight: 0.2 }, { id: 'z', weight: 0.3 }];
    expect(weightedPick(entries, () => 0.9999999999999999)?.id).toBe('z');
  });
});

// ── 经真 World.tick 的消费方行为（weighted-spawn 用本核抽模板）──────────────────
describe('weightedPick — 共享核在真 World 内（经 weighted-spawn 消费方）', () => {
  function spawnWorld(table: { templateId: string; weight: number }[]): World {
    const w = new World();
    for (const s of weightedSpawnCapability.systems) w.addSystem(s);
    w.createEntity('rng');
    w.addComponent('rng', { type: 'RandomSeed', seed: 42, sequence: 0 } as RandomSeed);
    w.createEntity('gen');
    w.addComponent('gen', { type: 'Transform', x: 7, y: 8, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('gen', { type: 'WeightedSpawn', onSignal: 'go', table } as WeightedSpawn);
    w.createEntity('sig');
    w.addComponent('sig', { type: 'Signal', name: 'go', source: 'test' } as Signal);
    return w;
  }

  it('零权项被真跳过：表 [dud:0, hit:5] → tick 后 SpawnRequest 必是 hit', () => {
    const w = spawnWorld([{ templateId: 'dud', weight: 0 }, { templateId: 'hit', weight: 5 }]);
    w.tick();
    const req = w.getComponent<SpawnRequest>('gen', 'SpawnRequest');
    expect(req?.templateId).toBe('hit');
    expect(req?.x).toBe(7);
  });

  it('空表 → 收到信号也不产 SpawnRequest、不崩（安全退化）', () => {
    const w = spawnWorld([]);
    expect(() => w.tick()).not.toThrow();
    expect(w.getComponent('gen', 'SpawnRequest')).toBeUndefined();
  });
});
