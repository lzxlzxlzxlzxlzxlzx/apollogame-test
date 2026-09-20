import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '@engine/core/world.js';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import { ALL_CAPABILITIES, CAPABILITY_REGISTRY } from './capability-registry.js';
import { SystemPhase, type SystemDeclaration } from '@engine/core/types.js';
import type { Resource } from '@engine/protocol/components.js';

// ══════════════════════════════════════════════════════════════════════════
//  REQ-CYCLEHAZ 方案 B —— 真能力装载冒烟（引擎单测在 engine/core/topological-sort.test.ts 钉算法，
//  这里钉「Lead 核查点名的真组合确实装得进 + 顺序确定」）。
//
//  背景：组件推断边规则下两系统 RMW 同一黑板组件即互为前驱成 2-环，全库普查 101 能力两两配对
//  得 65 对成环（热点 = Resource/Flag/State/CardPile）。B 前这些组合 load 即抛 Circular。
//  本文件取 Lead 点名的最小复现 + 三对代表组合，走**真实装载路径**（World.addSystem → tick）验收。
// ══════════════════════════════════════════════════════════════════════════

/** 按能力**注册表序**（atoms→tier1→tier2→tier3）取能力 = 模拟按注册序装载。 */
function inRegistryOrder(ids: string[]): CapabilityDefinition[] {
  const want = new Set(ids);
  const caps = ALL_CAPABILITIES.filter((c) => want.has(c.id));
  const missing = ids.filter((id) => !CAPABILITY_REGISTRY.has(id));
  if (missing.length) throw new Error(`测试引用了未注册能力：${missing.join(', ')}`);
  return caps;
}

/** 真实装载：新建 world、按给定顺序 addSystem，返回定序后的 system id 序列。 */
function loadOrder(caps: CapabilityDefinition[]): string[] {
  const w = new World();
  for (const c of caps) for (const s of c.systems ?? []) w.addSystem(s);
  const ids = w.getSortedSystems().map((s) => s.id); // 触发 topologicalSort
  expect(() => w.tick()).not.toThrow(); // 空世界跑一拍：装得进也跑得动
  return ids;
}

/** 装两次（各自新 world）→ 顺序必须逐位一致（同一世界每次装载同序·录放一致）。 */
function loadTwice(ids: string[]): string[] {
  const first = loadOrder(inRegistryOrder(ids));
  const second = loadOrder(inRegistryOrder(ids));
  expect(second).toEqual(first);
  return first;
}

let warnSpy: ReturnType<typeof vi.spyOn>;
function captureWarn(): string[] {
  const seen: string[] = [];
  warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    seen.push(String(args[0]));
  });
  return seen;
}
afterEach(() => vi.restoreAllMocks());

describe('正式相位合同 — timeline/event Update，resource Resolve', () => {
  it('timeline + resource 按相位排序，不再伪称同相位二元环', () => {
    const warns = captureWarn();
    const order = loadTwice(['t3-timeline', 'f1-resource']);
    expect(order).toContain('timeline');
    expect(order).toContain('resource-apply');
    expect(order.indexOf('timeline')).toBeLessThan(order.indexOf('resource-apply'));
    expect(warns).toEqual([]);
  });

  it('event-when → timeline → resource-apply 实际组合无环且保持显式顺序', () => {
    const warns = captureWarn();
    const order = loadTwice(['t2-event-when', 't3-timeline', 'f1-resource']);
    for (const id of ['event-when', 'timeline', 'resource-apply']) expect(order).toContain(id);
    // timeline 自带 runsAfter:['event-when'] = 硬约束，平局裁决不许推翻它。
    expect(order.indexOf('event-when')).toBeLessThan(order.indexOf('timeline'));
    expect(order.indexOf('timeline')).toBeLessThan(order.indexOf('resource-apply'));
    expect(warns).toEqual([]);
  });

  it('正式相位优先于能力 tier/注册顺序', () => {
    captureWarn();
    const order = loadTwice(['f1-resource', 't2-event-when', 't3-timeline']);
    const rank = (id: string): number => order.indexOf(id);
    expect(rank('event-when')).toBeLessThan(rank('timeline'));
    expect(rank('timeline')).toBeLessThan(rank('resource-apply'));
  });

  it('反序装载不能推翻 Update → Resolve 正式时序', () => {
    captureWarn();
    const forward = loadOrder(inRegistryOrder(['t3-timeline', 'f1-resource']));
    const reversed = loadOrder([...inRegistryOrder(['t3-timeline', 'f1-resource'])].reverse());
    expect(forward.indexOf('timeline')).toBeLessThan(forward.indexOf('resource-apply'));
    expect(reversed.indexOf('timeline')).toBeLessThan(reversed.indexOf('resource-apply'));
  });
  it('真实事件起播、Timeline资源写入及Resolve修改在当拍按合同生效', () => {
    const warns = captureWarn();
    const run = (reverse: boolean) => {
      const w = new World();
      const caps = inRegistryOrder(['f1-resource', 't2-event-when', 't3-timeline']);
      for (const c of reverse ? caps.reverse() : caps) for (const s of c.systems) w.addSystem(s);
      w.createEntity('counter');
      w.addComponent('counter', { type: 'Resource', id: 'counter', current: 0, min: 0, max: 100 });
      w.addComponent('counter', { type: 'ResourceModify', resourceId: 'counter', amount: 5, scope: 'local' });
      w.createEntity('start');
      w.addComponent('start', { type: 'EventWhen', signal: 'play', mode: 'edge', when: { kind: 'resource', id: 'counter', cmp: 'eq', value: 0 } });
      w.createEntity('timeline');
      w.addComponent('timeline', { type: 'Timeline', id: 'timeline', playOnSignal: 'play', cues: [{ at: 0, do: { kind: 'resource', resourceId: 'counter', op: 'set', amount: 10 } }] });
      const values: number[] = [];
      for (let i = 0; i < 3; i++) { w.tick(); values.push(w.getComponent<Resource>('counter', 'Resource')!.current); }
      expect(w.hasComponent('counter', 'ResourceModify')).toBe(false);
      return values;
    };
    expect(run(false)).toEqual([15, 15, 15]);
    expect(run(true)).toEqual([15, 15, 15]);
    expect(warns).toEqual([]);
  });
});

describe('REQ-CYCLEHAZ B — 真正同相位的RMW平局夹具', () => {
  function run(reverse = false, explicit = false) {
    const w = new World();
    const systems: SystemDeclaration[] = ['atom-like', 'tier-like'].map((id, i) => ({
      id, phase: SystemPhase.Update, reads: ['Resource'], writes: ['Resource'], consumes: [],
      ...(explicit && i === 1 ? { runsBefore: ['atom-like'] } : {}),
      execute(world) { const r = world.getComponent<Resource>('counter', 'Resource')!; r.current = r.current * 10 + i + 1; },
    }));
    for (const s of reverse ? systems.reverse() : systems) w.addSystem(s);
    w.createEntity('counter'); w.addComponent('counter', { type: 'Resource', id: 'counter', current: 0, min: 0, max: 999 });
    const order = w.getSortedSystems().map(s => s.id); w.tick();
    return { order, value: w.getComponent<Resource>('counter', 'Resource')!.current };
  }
  it('同相位Resource推断环确实发生，注册顺序决定实际RMW结果且重复运行一致', () => {
    const warns = captureWarn();
    const forward = run(), again = run(), reverse = run(true);
    expect(forward).toEqual({ order: ['atom-like', 'tier-like'], value: 12 });
    expect(again).toEqual(forward);
    expect(reverse).toEqual({ order: ['tier-like', 'atom-like'], value: 21 });
    expect(warns).toHaveLength(3);
    expect(warns.every(w => w.includes('闭环组件：Resource') && w.includes('atom-like') && w.includes('tier-like'))).toBe(true);
  });
  it('同相位显式硬约束优先于装载平局键', () => {
    const warns = captureWarn();
    expect(run(false, true)).toEqual({ order: ['tier-like', 'atom-like'], value: 21 });
    expect(run(true, true)).toEqual({ order: ['tier-like', 'atom-like'], value: 21 });
    expect(warns).toEqual([]);
  });
});

// 65 对成环清单里的三对代表组合（剧情线/卡牌线必然同装）——装得进 + 顺序确定。
// 第 4 列 = 该组合的**成环告警基线签名**（实测 2026-08-24·从 warn 原文抄录·禁凭印象改）：
// 每次 loadOrder 恰出 1 条推断环裁决告警，loadTwice = 2 条同签名。基线钉死 → 新环/环成员
// 变动/闭环组件变动/告警消失，任一发生即红（真防线；原实现捕了 warn 从不断言内容=白捕）。
describe('REQ-CYCLEHAZ B — 代表组合装载冒烟', () => {
  const combos: Array<[string, string[], string[], string]> = [
    ['dialogue × flow（剧情线 M4 必踩·闭环组件 Flag/Resource/State）', ['t3-dialogue', 't3-flow'], ['dialogue', 'flow'],
      '[dialogue, flow]（闭环组件：Flag, Resource, State）'],
    ['card-play × card-pile（卡牌线·闭环组件 Flag/PlayedHand）', ['t2-card-play', 't2-card-pile'], ['card-play-input', 'card-pile'],
      '[card-play-input, card-pile]（闭环组件：Flag, PlayedHand）'],
    ['dialogue × timeline（剧情线 M4 必踩·闭环组件 Flag/Resource）', ['t3-dialogue', 't3-timeline'], ['dialogue', 'timeline'],
      '[dialogue, timeline]（闭环组件：Flag, Resource）'],
  ];

  for (const [label, capIds, sysIds, cycleSig] of combos) {
    it(`${label} 装得进且顺序确定·成环告警逐条等于基线`, () => {
      const warns = captureWarn();
      const order = loadTwice(capIds);
      for (const id of sysIds) expect(order).toContain(id);
      expect(new Set(order).size).toBe(order.length); // 无重复
      // 告警集合 = 基线 ×2（loadTwice 两次装载）·逐条相等。非定序环告警不许混入（归一化落空即红）。
      const sigs = warns.map((w) => {
        const m = /定序环 (\[[^\]]+\]（闭环组件：[^）]*）)/.exec(w);
        return m ? m[1] : `非定序环告警：${w}`;
      });
      expect(sigs).toEqual([cycleSig, cycleSig]);
    });
  }
});
