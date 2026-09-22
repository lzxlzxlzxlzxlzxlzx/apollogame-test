import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { DebugTrace } from '@engine/protocol/components.js';
import { findDebugTrace, traceOn, appendTrace, clearDebugTrace, formatTrace, TRACE_DEFAULT_MAX } from './debug-trace.js';
import { NON_DETERMINISTIC } from '@net/determinism.js';
import { readFileSync } from 'node:fs';

// ═══════════════════════════════════════════════════════════════
//  debug-trace 守卫（owner 2026-08-06 立·日志基准守则的机器面）
//    ① opt-in：没挂 DebugTrace 时全程 no-op（零开销·零污染）
//    ② 环形上限：长跑不撑爆
//    ③ 🔴 hash 排除登记——**踩过两次的坑**（Mesh3D/Coachmark 曾漏登记 → lockstep 误报 desync）
// ═══════════════════════════════════════════════════════════════

const withTrace = (max?: number): World => {
  const w = new World();
  w.createEntity('dbg');
  w.addComponent('dbg', { type: 'DebugTrace', events: [], ...(max === undefined ? {} : { max }) } as DebugTrace);
  return w;
};

describe('debug-trace — opt-in（默认不开）', () => {
  it('没挂 DebugTrace → findDebugTrace/traceOn 皆空，appendTrace 无副作用', () => {
    const w = new World();
    expect(findDebugTrace(w)).toBeUndefined();
    expect(traceOn(w)).toBe(false);
    expect(() => appendTrace(undefined, 0, 's', 'decision', 'x')).not.toThrow(); // no-op 不抛
  });

  it('挂了才记；四类 kind 都能落，seq 自增、tick 照传', () => {
    const w = withTrace();
    const t = findDebugTrace(w)!;
    expect(traceOn(w)).toBe(true);
    appendTrace(t, 7, 'matrix-duel', 'decision', 'perSide→p2.charge.rock', 'attacker=p2');
    appendTrace(t, 7, 'matrix-duel', 'reject', '缩放源解析不到 → 退化 base');
    appendTrace(t, 8, 'flow', 'transition', 'T2→T3', '计时到点');
    appendTrace(t, 8, 'matrix-duel', 'commit', 'hp p1 -15');
    expect(t.events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(t.events.map((e) => e.kind)).toEqual(['decision', 'reject', 'transition', 'commit']);
    expect(t.events[0].tick).toBe(7);
    expect(t.events[0].why).toBe('attacker=p2');
    expect(t.events[1].why).toBeUndefined(); // why 可选：不填就不挂字段（形状稳定）
  });

  it('环形上限：超了丢最旧的，seq 不回退（缺省 2000·可配）', () => {
    const w = withTrace(3);
    const t = findDebugTrace(w)!;
    for (let i = 0; i < 5; i++) appendTrace(t, i, 's', 'commit', `e${i}`);
    expect(t.events).toHaveLength(3);
    expect(t.events.map((e) => e.what)).toEqual(['e2', 'e3', 'e4']); // 丢的是最旧的
    expect(t.events.map((e) => e.seq)).toEqual([2, 3, 4]);           // seq 单调，不因裁剪回退
    expect(TRACE_DEFAULT_MAX).toBe(2000);
  });

  it('clear 清空 · format 出人可读一行', () => {
    const w = withTrace();
    const t = findDebugTrace(w)!;
    appendTrace(t, 1, 'sys', 'decision', 'A', 'because');
    expect(formatTrace(t)).toBe('#0 t1 [sys] decision: A ← because');
    expect(formatTrace(undefined)).toBe('(trace 未开启)');
    clearDebugTrace(w);
    expect(t.events).toHaveLength(0);
  });
});

describe('🔴 hash 排除登记（Mesh3D/Coachmark 漏登记的旧案·踩过两次）', () => {
  it('DebugTrace 必须在 NON_DETERMINISTIC 里——否则开 trace 就改 hash、lockstep 误报 desync', () => {
    expect(NON_DETERMINISTIC.has('DebugTrace')).toBe(true);
  });

  it('棘轮：任何 *Trace 结尾的组件都必须登记（新增 trace 类零件时自动兜住）', () => {
    // 组件全集来自基线清单（component-manifest-guard 维护·文本扫 readonly type）。
    const all = manifestBaseline();
    const traceLike = all.filter((n) => /Trace$/.test(n));
    expect(traceLike.length).toBeGreaterThan(0); // 防基线读空导致本条空跑
    for (const name of traceLike) {
      expect(NON_DETERMINISTIC.has(name), `${name} 是 trace 类组件却没进 NON_DETERMINISTIC`).toBe(true);
    }
  });
});

/** 读组件基线清单（守卫的冻结真相），避免本测试自己再抄一份组件名。 */
function manifestBaseline(): string[] {
  const j = JSON.parse(readFileSync(new URL('../../scripts/component-manifest-baseline.json', import.meta.url), 'utf8')) as { components: string[] };
  return j.components;
}
