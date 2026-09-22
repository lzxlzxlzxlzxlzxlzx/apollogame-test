/* eslint-disable zerocraft/no-wall-clock -- 压测基准：performance.now 只量墙钟耗时作报告，不进断言/不进 sim（慢车道·slow-lane-guard 管） */
// game211 · SLG 规模压测（owner 2026-08-10「战场 4096×4096 或 8192×8192 你能做到吗」）。
//
// 为什么用测试而不是 .mjs：要跑的是**真引擎能力**（steering/separation/motion-apply/pathfind），
// 它们是 TS，vitest 是唯一能直接吃的跑法。抄一份到脚本里 = 测的不是同一个东西。
//
// 这里回答的**不是**「地图能多大」——地图大小几乎不花钱：一块 4096×4096 的地面在渲染上就是
// 两个三角形，在物理上就是一个平面。真正花钱的是 ①同时活跃的单位数 ②每单位每 tick 的空间查询。
// 所以量的是「**多少个行军单位还能保住 60fps 的 sim 预算**」。
//
// 预算口径：60fps = 16.7ms/帧。sim 只是其中一份（还有渲染/物理/UI），取 **1/3 ≈ 5.5ms** 作安全线，
// 与 `scripts/cannon-army-bench.mjs` 同口径。
import { describe, it, expect } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { transformCapability, velocityCapability, tagCapability, relationCapability } from '@zerocraft/engine/atom-skills/index.js';
import { motionApplyCapability } from '@zerocraft/engine/skills/tier1/index.js';
import { steeringCapability } from '@zerocraft/engine/skills/tier2/index.js';
import type { Component } from '@zerocraft/engine/engine/core/types.js';

/** 建 n 个行军单位（红蓝各半·互相索敌·同队分离），铺在 `span × span` 的战场上。 */
function buildArmy(n: number, span: number): Engine {
  const engine = new Engine();
  engine.load({
    capabilities: [transformCapability, velocityCapability, tagCapability, relationCapability, motionApplyCapability, steeringCapability],
    entities: {},
  });
  const w = engine.world;
  const half = span / 2;
  // 确定性铺开：两军各占一侧，方阵排布（不用随机——压测要可复现）。
  const perSide = Math.floor(n / 2);
  const cols = Math.ceil(Math.sqrt(perSide));
  const mk = (side: 'red' | 'blue', i: number): string => {
    const id = `${side}-${i}`;
    const dir = side === 'red' ? -1 : 1;
    const ox = ((i % cols) - cols / 2) * 3;
    const oy = (Math.floor(i / cols) - cols / 2) * 3;
    w.createEntity(id);
    w.addComponent(id, { type: 'Transform', x: dir * half * 0.5 + ox, y: oy, rotation: 0, scaleX: 1, scaleY: 1 } as unknown as Component);
    w.addComponent(id, { type: 'Velocity', vx: 0, vy: 0 } as unknown as Component);
    w.addComponent(id, { type: 'Tag', flags: side === 'red' ? 1 : 2 } as unknown as Component);
    w.addComponent(id, {
      type: 'Steering', mode: 'seek', speed: 0.16, stopRange: 1.2,
      separation: { radius: 2.6, weight: 3.2, tagMask: side === 'red' ? 1 : 2 },
    } as unknown as Component);
    return id;
  };
  for (let i = 0; i < perSide; i++) mk('red', i);
  for (let i = 0; i < perSide; i++) mk('blue', i);
  // 索敌：每个单位盯对面同序号（稳定·不引入随机）
  for (let i = 0; i < perSide; i++) {
    w.addComponent(`red-${i}`, { type: 'Relation', kind: 'target', targetId: `blue-${i}` } as unknown as Component);
    w.addComponent(`blue-${i}`, { type: 'Relation', kind: 'target', targetId: `red-${i}` } as unknown as Component);
  }
  return engine;
}

/** 跑 `ticks` 步，返回每步耗时（ms）的均值与 p95。 */
function benchTicks(engine: Engine, ticks: number): { mean: number; p95: number } {
  const t: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const t0 = performance.now();
    engine.world.tick();
    t.push(performance.now() - t0);
  }
  const sorted = [...t].sort((a, b) => a - b);
  return {
    mean: t.reduce((s, x) => s + x, 0) / t.length,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!,
  };
}

describe('SLG 规模 · 行军单位承载量（真引擎能力·非估算）', () => {
  const SAFE_MS = 16.7 / 3;   // sim 安全线（与 cannon-army-bench 同口径）

  it('地图尺寸本身几乎不花钱：同样 1000 单位，战场 512 vs 8192 耗时同量级', () => {
    const small = benchTicks(buildArmy(1000, 512), 60);
    const huge = benchTicks(buildArmy(1000, 8192), 60);
    console.info('[slg/span] 1000 单位 · 战场 512 → %sms/tick · 战场 8192 → %sms/tick',
      small.mean.toFixed(2), huge.mean.toFixed(2));
    // 判据放宽到 3×：大地图下单位铺得更开、分离查询命中更少，理论上应更快或持平。
    expect(huge.mean).toBeLessThan(Math.max(0.5, small.mean * 3));
  });

  it('单位数扫描：找出 60fps 预算下的行军单位上限', () => {
    const rows: Array<{ n: number; mean: number; p95: number }> = [];
    for (const n of [240, 500, 1000, 2000, 4000]) {
      const r = benchTicks(buildArmy(n, 4096), 40);
      rows.push({ n, ...r });
      console.info('[slg/scale] %d 单位 · %sms/tick (p95 %sms) · %s',
        n, r.mean.toFixed(2), r.p95.toFixed(2), r.mean < SAFE_MS ? '✅ 安全' : r.mean < 16.7 ? '🟡 吃满帧' : '❌ 掉帧');
    }
    // 护栏：240（当前 demo 规模）必须远在安全线内——掉出去说明能力层出了性能回归。
    const base = rows.find((r) => r.n === 240)!;
    expect(base.mean).toBeLessThan(SAFE_MS);
  });
});
