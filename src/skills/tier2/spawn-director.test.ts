import { describe, it, expect } from 'vitest';
import { createDirector, tickDirector, type DirectorWave } from './spawn-director.js';

// spawn-director 纯函数测试（REQ-SURVIVOR编排 E3·对齐 skills 1:1 测试文化）。
// 限速累积 / cap 拦截 / 波段切换 / 开波爆发 / 同种子可复现，无 Math.random。

const noneAlive = (): Record<string, number> => ({});

describe('spawn-director.tickDirector — 速率累积', () => {
  it('ratePerSec=2·dt=1s → 攒够 2 个', () => {
    const d = createDirector([{ atTime: 0, template: 'slime', ratePerSec: 2, cap: 100 }]);
    const out = tickDirector(d, { now: 1, aliveCounts: noneAlive() });
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.templateId === 'slime')).toBe(true);
  });
  it('小数速率跨 tick 累积（0.5/s·两个 1s tick → 第 2 tick 才发 1 个）', () => {
    const d = createDirector([{ atTime: 0, template: 'bat', ratePerSec: 0.5, cap: 100 }]);
    expect(tickDirector(d, { now: 1, aliveCounts: noneAlive() })).toHaveLength(0); // 累积 0.5
    expect(tickDirector(d, { now: 2, aliveCounts: noneAlive() })).toHaveLength(1); // 累积 1.0 → 发 1
  });
});

describe('spawn-director.tickDirector — cap 上限拦截', () => {
  it('存活已达 cap → 本 tick 不发', () => {
    const d = createDirector([{ atTime: 0, template: 'slime', ratePerSec: 10, cap: 5 }]);
    const out = tickDirector(d, { now: 1, aliveCounts: { slime: 5 } });
    expect(out).toHaveLength(0);
  });
  it('部分空位 → 只发到填满 cap', () => {
    const d = createDirector([{ atTime: 0, template: 'slime', ratePerSec: 10, cap: 5 }]);
    const out = tickDirector(d, { now: 1, aliveCounts: { slime: 3 } });
    expect(out).toHaveLength(2); // 3 存活 + 发 2 = cap 5
  });
  it('被 cap 挡时信用封顶（不攒无限回填洪流）→ 精确 length（实跑+源码语义钉死）', () => {
    const d = createDirector([{ atTime: 0, template: 'slime', ratePerSec: 100, cap: 3 }]);
    expect(tickDirector(d, { now: 5, aliveCounts: { slime: 3 } })).toHaveLength(0); // 满 → 0 发；acc=min(500,1)=1（spawn-director.ts:111 封顶）
    const out = tickDirector(d, { now: 5.01, aliveCounts: {} }); // 位置全空
    // 封顶语义精确值：上拍残余信用=1，本拍新增 (5.01−5)×100 = 0.99999…（IEEE 略欠 1）→ acc≈1.99999，
    // while(acc≥1) 恰好只够发 1 个。若无封顶，acc 本是 ~500 → 洪流。确定性：纯 IEEE 算术，跨端一致。
    expect(out).toHaveLength(1);
  });
});

describe('spawn-director.tickDirector — 波段时序 + 爆发', () => {
  it('波未起（now<atTime）→ 不发', () => {
    const d = createDirector([{ atTime: 10, template: 'boss', ratePerSec: 1, cap: 1 }]);
    expect(tickDirector(d, { now: 5, aliveCounts: noneAlive() })).toHaveLength(0);
  });
  it('波段切换：第二波到点才加入', () => {
    const waves: DirectorWave[] = [
      { atTime: 0, template: 'slime', ratePerSec: 1, cap: 100 },
      { atTime: 10, template: 'bat', ratePerSec: 1, cap: 100 },
    ];
    const d = createDirector(waves);
    const early = tickDirector(d, { now: 1, aliveCounts: noneAlive() });
    expect(early.every((s) => s.templateId === 'slime')).toBe(true);
    const late = tickDirector(d, { now: 11, aliveCounts: noneAlive() });
    expect(late.some((s) => s.templateId === 'bat')).toBe(true); // 第二波已加入
  });
  it('开波爆发只发一次', () => {
    const d = createDirector([{ atTime: 0, template: 'slime', ratePerSec: 0, cap: 100, burst: 8 }]);
    expect(tickDirector(d, { now: 0.1, aliveCounts: noneAlive() })).toHaveLength(8);
    expect(tickDirector(d, { now: 0.2, aliveCounts: { slime: 8 } })).toHaveLength(0); // 不再爆发
  });
});

describe('spawn-director.tickDirector — 确定性 + 布点', () => {
  it('同种子 + 同 tick 序 → 同环形落点', () => {
    const waves: DirectorWave[] = [{ atTime: 0, template: 'slime', ratePerSec: 3, cap: 100 }];
    const ring = { cx: 100, cy: 100, radius: 50 };
    const a = tickDirector(createDirector(waves, 123), { now: 1, aliveCounts: noneAlive(), ring });
    const b = tickDirector(createDirector(waves, 123), { now: 1, aliveCounts: noneAlive(), ring });
    expect(a).toEqual(b);
    // 落点在半径 50 的圆上
    for (const s of a) {
      const dist = Math.hypot(s.x - 100, s.y - 100);
      expect(dist).toBeCloseTo(50, 5);
    }
  });
  it('无 ring → 原点（消费游戏自放位）', () => {
    const d = createDirector([{ atTime: 0, template: 'slime', ratePerSec: 1, cap: 100 }]);
    const out = tickDirector(d, { now: 1, aliveCounts: noneAlive() });
    expect(out[0]).toEqual({ type: 'SpawnRequest', templateId: 'slime', x: 0, y: 0 });
  });
});
