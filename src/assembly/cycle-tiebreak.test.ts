import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '@engine/core/world.js';
import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import { ALL_CAPABILITIES, CAPABILITY_REGISTRY } from './capability-registry.js';

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
  const w = new World({ strict: false }); // 本文件专测软环的 warn+裁决路径；严格模式（vitest 缺省）下软环即抛（P2d）
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

describe('REQ-CYCLEHAZ B — Lead 点名最小复现（真能力）', () => {
  it('① t3-timeline + f1-resource（双方 RMW Resource·2-环）装得进且顺序确定', () => {
    const warns = captureWarn();
    const order = loadTwice(['t3-timeline', 'f1-resource']);
    expect(order).toContain('timeline');
    expect(order).toContain('resource-apply');
    // P2d：平局键 = id 字典序（'resource-apply' < 'timeline'）·与装载序无关。
    expect(order.indexOf('resource-apply')).toBeLessThan(order.indexOf('timeline'));
    expect(warns.some((w) => w.includes('timeline') && w.includes('resource-apply'))).toBe(true);
  });

  it('② t2-event-when 叠加成 3-环（event-when→timeline→resource-apply）装得进', () => {
    const warns = captureWarn();
    const order = loadTwice(['t2-event-when', 't3-timeline', 'f1-resource']);
    for (const id of ['event-when', 'timeline', 'resource-apply']) expect(order).toContain(id);
    // timeline 自带 runsAfter:['event-when'] = 硬约束，平局裁决不许推翻它。
    expect(order.indexOf('event-when')).toBeLessThan(order.indexOf('timeline'));
    // 点名环成员（同 :59 口径·升格自「存在任意 warn」）：实测基线（2026-08-24）该组合恰闭合
    // 这一个三元推断环——告警若换了环成员/消失，都是定序面变动，必须转红被看见。
    expect(warns.some((w) => w.includes('[event-when, resource-apply, timeline]'))).toBe(true); // 环成员按 id 升序点名（P2d）
  });

  it('④ 平局键 = id 字典序（P2d）：显式边 event-when→timeline 服从，其余按 id', () => {
    captureWarn();
    const order = loadTwice(['f1-resource', 't2-event-when', 't3-timeline']);
    const rank = (id: string): number => order.indexOf(id);
    expect(rank('event-when')).toBeLessThan(rank('timeline')); // 硬约束（timeline.runsAfter event-when）
    expect(rank('event-when')).toBeLessThan(rank('resource-apply')); // 'event-when' < 'resource-apply'
  });

  it('平局键与装载序无关（P2d）：反序装载得到**同一**顺序——两端 manifest 列序不同也不分叉', () => {
    captureWarn();
    const forward = loadOrder(inRegistryOrder(['t3-timeline', 'f1-resource']));
    const reversed = loadOrder([...inRegistryOrder(['t3-timeline', 'f1-resource'])].reverse());
    expect(reversed).toEqual(forward);
    expect(forward.indexOf('resource-apply')).toBeLessThan(forward.indexOf('timeline'));
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
      '[card-pile, card-play-input]（闭环组件：Flag, PlayedHand）'], // 环成员按 id 升序点名（P2d）
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
