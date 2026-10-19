import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENT_UNIVERSE } from './component-universe.gen.js';

// ═══════════════════════════════════════════════════════════════
//  ComponentDataMap ⇔ 组件全集 对账（REQ-111-ENG-04·2026-09-14）
//
//  **这道门以前不存在**，这就是病根。两张表一手一机：
//    · `component-map.ts` 的 `ComponentDataMap` = **手维护**的编译期闭集（蓝图能写哪些组件名）；
//    · `component-universe.gen.ts` = 从源码**生成**的运行时全集。
//  谁都不管「新组件进没进手维护那张」：registry 只对「能力 id ↔ loader」，
//  `build-component-map.test.mjs` 只对「生成物 vs 现算」。于是每下沉一件带新组件的能力就可能漏登一次，
//  而且**全绿**——能力真能跑，只是游戏层在蓝图里写不出那个组件名，被迫退回宿主层手挂。
//  攒到 game111 PE 撞上时已经积了 28 个（他报了 5 个，实查是 28 个，含 2026-09-09 那批预建高频件）。
//
//  两半守法，缺一不可：
//    ① 编译期（`component-map.ts` 末尾的 `_NoMissingComponent` / `_NoStaleComponent`）——
//       漏登那一刻 tsc 就报错并**点名**，且 scoped-gate 任何一档都跑 tsc。
//    ② 本文件（跑时）——给出**可读的差集清单**，并且是可撤修验红的那一半：
//       类型断言撤掉之后 tsc 红是红了，但没有任何测试会红；反过来也一样。两道各咬各的。
//
//  为什么用正则刮源码而不是反射：TS 接口在运行期不存在，键只能从源码文本取。
//  同库既有先例：`declaration-audit.test.ts` 也是刮源码对账。
// ═══════════════════════════════════════════════════════════════

const MAP_FILE = join(dirname(fileURLToPath(import.meta.url)), 'component-map.ts');

/** 刮出 `ComponentDataMap` 的全部键（只取接口体内、缩进两格的 `Xxx: …` 行）。 */
export function mapKeysOf(src: string): string[] {
  const start = src.indexOf('export interface ComponentDataMap');
  if (start < 0) return [];
  const body = src.slice(start);
  const end = body.indexOf('\n}');
  return [...body.slice(0, end).matchAll(/^ {2}([A-Za-z0-9_]+)\??:/gm)].map((m) => m[1]);
}

describe('ComponentDataMap ⇔ 组件全集（手维护表 vs 生成表·此前无门）', () => {
  const keys = mapKeysOf(readFileSync(MAP_FILE, 'utf8'));

  it('刮键这件事本身没坏（刮不到键会让下面两条静默全绿）', () => {
    expect(keys.length).toBeGreaterThan(100);
    expect(new Set(keys).size).toBe(keys.length);   // 无重复键
    expect(keys).toContain('Transform');            // 锚一个谁都有的
  });

  it('**零漏登**：源码里有的组件，蓝图里必须写得出来', () => {
    const missing = COMPONENT_UNIVERSE.filter((c) => !keys.includes(c));
    // 出红时照着这份清单补：在 component-map.ts 加 import + 一行 `Xxx: Omit<Xxx,'type'>;`。
    expect(missing).toEqual([]);
  });

  it('**零过期**：表里登的组件源码里都还在（组件被删/改名时咬）', () => {
    const stale = keys.filter((k) => !COMPONENT_UNIVERSE.includes(k as never));
    expect(stale).toEqual([]);
  });

  it('两张表逐一相等（集合相等·不只是互相包含）', () => {
    expect([...keys].sort()).toEqual([...COMPONENT_UNIVERSE].sort());
  });

  it('game111 PE 点名的五型在位（REQ-111-ENG-04 的原始报告·回归钉）', () => {
    for (const c of ['TurnOrder', 'Memory', 'MemoryRules', 'IntentBarrier', 'IntentInbox']) {
      expect(keys).toContain(c);
    }
  });

  it('2026-09-09 那批预建高频件也在位（同一次漏登·报告没提到但同因）', () => {
    for (const c of ['Cooldowns', 'DamageTable', 'Armor', 'Inventory', 'ConveyorQueue']) {
      expect(keys).toContain(c);
    }
  });

  it('编译期那一半还在（两道门互为备份·谁被撤掉都要有人知道）', () => {
    const src = readFileSync(MAP_FILE, 'utf8');
    expect(src).toContain('_NoMissingComponent');
    expect(src).toContain('_NoStaleComponent');
    expect(src).toContain('RuntimeComponentName');
  });
});
