import { describe, it, expect, vi } from 'vitest';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import type { SystemDeclaration } from '@engine/core/types.js';
import { topologicalSort } from '@engine/core/topological-sort.js';
import { ALL_CAPABILITIES } from './capability-registry.js';
import { analyzeSystemGraph, collectSystems, findDanglingEdges, findDuplicateSystemIds } from './system-graph.js';

// 合成系统/能力工厂（analyzer 只读 .id/.systems·其余字段占位）。
function sys(id: string, o: Partial<SystemDeclaration> = {}): SystemDeclaration {
  return { id, phase: 0, reads: [], writes: [], consumes: [], execute: () => {}, ...o } as SystemDeclaration;
}
function cap(id: string, systems: SystemDeclaration[]): CapabilityDefinition {
  return { id, systems } as unknown as CapabilityDefinition;
}

// ── 真数据硬不变量（门禁）─────────────────────────────────────────
describe('system-graph — 全局硬不变量', () => {
  const report = analyzeSystemGraph(ALL_CAPABILITIES);

  it('无悬空显式边（runsBefore/runsAfter 指向不存在系统=静默失效）', () => {
    expect(report.danglingEdges).toEqual([]);
  });

  it('无重复 system id（同 id 多能力=定序静默覆盖）', () => {
    expect(report.duplicateIds).toEqual([]);
  });

  it('每个能力**单独装**其自身系统可排（不内部成环·**连成环告警也必须为零**）', () => {
    // 读告警铁律（2026-08-06 review 血训）：REQ-CYCLEHAZ B 后，纯组件推断环只 console.warn
    // 不抛——原来的 not.toThrow 对这类环**不设防**（恒绿）。改为捕 warn 断零（样板
    // matrix-duel.test.ts「成环告警也必须为零」）。实测基线（2026-08-24·101 能力逐个单独装）：
    // 零告警零抛 → 直接钉零，任何能力内部新出现推断环/申报环即转红。
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (const c of ALL_CAPABILITIES) {
        spy.mockClear();
        expect(() => topologicalSort([...(c.systems ?? [])]), `${c.id} 申报边自成环（抛）`).not.toThrow();
        const cycleWarns = spy.mock.calls
          .map((call) => String(call[0]))
          .filter((w) => w.includes('[topological-sort]') || w.includes('Circular'));
        expect(cycleWarns, `${c.id} 自身系统内部成环（推断环只 warn 不抛·此处必须为零）`).toEqual([]);
      }
    } finally {
      spy.mockRestore();
    }
  });
});

// ── 与引擎 topological-sort 逐条对齐（fidelity·防两套模型漂移）─────────────
describe('system-graph — 与引擎 topo-sort fidelity', () => {
  it('RMW 伪环：analyzer 检出 SCC；引擎（REQ-CYCLEHAZ B 后）平局裁决降级不抛', () => {
    // A、B 都读写同一组件 X → 互为前驱 → 环。
    const A = sys('A', { reads: ['X'], writes: ['X'] });
    const B = sys('B', { reads: ['X'], writes: ['X'] });
    const rep = analyzeSystemGraph([cap('c', [A, B])]);
    expect(rep.sccs.length).toBe(1);
    expect(rep.sccs[0].systems.map((s) => s.id).sort()).toEqual(['A', 'B']);
    expect(rep.sccs[0].viaComponents).toContain('X');
    // B 后：纯推断环不再炸装载，改为确定性平局裁决 + console.warn 留痕。
    // → **analyzer 的 SCC 报告因此更重要**：它是这类隐患唯一的静态可见面。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(topologicalSort([A, B]).map((s) => s.id)).toEqual(['A', 'B']);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('事件推断边（P1b）：emitter→listener 与引擎同向；互 emit/listens 成 SCC 且点名 event:<E>', () => {
    const P = cap('p', [{ id: 'P', reads: [], writes: [], consumes: [], emits: ['ev'], listens: ['ack'], execute() {} }]);
    const L = cap('l', [{ id: 'L', reads: [], writes: [], consumes: [], emits: ['ack'], listens: ['ev'], execute() {} }]);
    const rep = analyzeSystemGraph([P, L]);
    expect(rep.sccs.length).toBe(1);
    expect(rep.sccs[0].viaComponents).toEqual(['event:ack', 'event:ev']);
    // 引擎：软环 → 平局裁决不抛，且单向时严格按 emitter→listener
    expect(() => topologicalSort([...P.systems, ...L.systems])).not.toThrow();
    const onlyL = cap('l2', [{ id: 'L2', reads: [], writes: [], consumes: [], listens: ['ev'], execute() {} }]);
    expect(topologicalSort([...onlyL.systems, ...P.systems]).map((s) => s.id)).toEqual(['P', 'L2']);
  });

  it('显式 runsBefore 破环：analyzer 无 SCC 且引擎不抛', () => {
    const A = sys('A', { reads: ['X'], writes: ['X'], runsBefore: ['B'] });
    const B = sys('B', { reads: ['X'], writes: ['X'] });
    const rep = analyzeSystemGraph([cap('c', [A, B])]);
    expect(rep.sccs).toEqual([]);
    expect(() => topologicalSort([A, B])).not.toThrow();
  });

  it('跨 phase 不成环（不同 phase 桶各自排）', () => {
    const A = sys('A', { phase: 0, reads: ['X'], writes: ['X'] });
    const B = sys('B', { phase: 10, reads: ['X'], writes: ['X'] });
    expect(analyzeSystemGraph([cap('c', [A, B])]).sccs).toEqual([]);
    expect(() => topologicalSort([A, B])).not.toThrow();
  });

  it('三元环（A→B→C→A 经组件）被切成一个 SCC', () => {
    // A 写 P·B 读 P 写 Q·C 读 Q 写 R·A 读 R → A→B→C→A
    const A = sys('A', { reads: ['R'], writes: ['P'] });
    const B = sys('B', { reads: ['P'], writes: ['Q'] });
    const C = sys('C', { reads: ['Q'], writes: ['R'] });
    const rep = analyzeSystemGraph([cap('c', [A, B, C])]);
    expect(rep.sccs.length).toBe(1);
    expect(rep.sccs[0].systems.map((s) => s.id).sort()).toEqual(['A', 'B', 'C']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(topologicalSort([A, B, C]).map((s) => s.id)).toEqual(['A', 'B', 'C']); // 平局键=注册序
    warn.mockRestore();
  });

  it('申报边自成环：analyzer 检出 SCC 且引擎照旧抛（真申报 bug 必须拦）', () => {
    const A = sys('A', { runsBefore: ['B'] });
    const B = sys('B', { runsBefore: ['A'] });
    expect(analyzeSystemGraph([cap('c', [A, B])]).sccs.length).toBe(1);
    expect(() => topologicalSort([A, B])).toThrow(/Circular/);
    expect(() => topologicalSort([A, B])).toThrow(/申报自相矛盾/); // 断到判词·防兜底网给假绿
  });
});

// ── 悬空/重复 检出正确性 ──────────────────────────────────────────
describe('system-graph — 悬空/重复 检出', () => {
  it('悬空显式边点名', () => {
    const A = sys('A', { runsBefore: ['ghost'] });
    const d = findDanglingEdges(collectSystems([cap('c', [A])]));
    expect(d).toEqual([{ system: 'A', capId: 'c', kind: 'runsBefore', ref: 'ghost' }]);
  });
  it('跨能力真实存在的 runsBefore 不算悬空', () => {
    const A = sys('A', { runsBefore: ['B'] });
    const B = sys('B');
    expect(findDanglingEdges(collectSystems([cap('c1', [A]), cap('c2', [B])]))).toEqual([]);
  });
  it('重复 system id 点名', () => {
    const dups = findDuplicateSystemIds(collectSystems([cap('c1', [sys('dup')]), cap('c2', [sys('dup')])]));
    expect(dups).toEqual([{ id: 'dup', caps: ['c1', 'c2'] }]);
  });
});
