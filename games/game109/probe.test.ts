// game109 · S2 接线探针（缺口裁决协议第①步·实查留原文）
//
// 目的：在写任何游戏数据之前，**用最小 manifest 真跑一遍**最危险的几条组合，判断
// 「种田循环」能否全程 L0/L1（纯数据 + 现有能力重组），还是存在真缺口。
//
//   P1  点某格 → 只改那一格的状态
//   P2  睡觉信号 → 所有作物各长一阶；只长浇过水的
//   P3  体力不够 → 动作被拒（负路径）
//   P4  一实体一组件槽（Flag/Resource/State 各只有一个）—— 地块实体设计的前提
//
// 相位事实（读实现 + 首轮实跑证实）：clickable=Update → self-rule=Resolve → effect-apply/craft-recipe=Commit。
// 故「Commit 写旗 → 下一拍 Resolve 读旗」，跨拍反馈是 1 tick，不是同拍。

import { describe, it, expect } from 'vitest';
import { parseManifest } from '@zerocraft/engine/assembly/manifest.js';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { World } from '@zerocraft/engine/engine/core/world.js';
import type { Resource, Flag, State, StringVar, GameFlow, InputQueue, RawInputData } from '@zerocraft/engine/engine/protocol/components.js';

// ── 通用夹具 ──────────────────────────────────────────────────────────────

const TILE = 1; // Tag 位：地块

/** 一台装了「农田」最小世界的引擎。manifest = 纯 JSON（这就是要证的形态）。 */
function farmWorld(entities: Record<string, Record<string, unknown>>, capabilities: string[]): Engine {
  const bp = parseManifest({ capabilities, entities });
  const e = new Engine();
  e.load(bp);
  return e;
}

/** 设定本帧指针输入（模拟真指针；真链路由输入源采集期完成）。
 *  ⚠️ 夹具保真度：InputQueue **不会**被 clickable 消费/清空——真输入源每帧重投一份。
 *  故跨多拍时必须每拍显式重投（clearInput），否则残留的按下事件会**每拍重复产信号**
 *  （首轮实测：残留 → 每拍都置 watering → 作物每拍长一阶，4 tick 长了 3 阶）。 */
function setInput(e: Engine, actions: RawInputData[]): void {
  const w = e.world;
  if (!w.hasComponent('input', 'InputQueue')) w.createEntity('input');
  w.addComponent('input', { type: 'InputQueue', actions } as InputQueue);
}
function click(e: Engine, x: number, y: number): void {
  setInput(e, [{ source: 'p1', x, y, phase: 'down' } as RawInputData]);
}
const clearInput = (e: Engine): void => setInput(e, []);

const flagOf = (e: Engine, id: string, flagId: string): boolean | undefined => {
  const f = e.world.getComponent<Flag>(id, 'Flag');
  return f && f.id === flagId ? f.active : undefined;
};
const resOf = (e: Engine, id: string, resId: string): number | undefined => {
  const r = e.world.getComponent<Resource>(id, 'Resource');
  return r && r.id === resId ? r.current : undefined;
};

const BASE_CAPS = ['a1-transform', 'c1-shape', 'g1-tag', 'f2-flag', 'f1-resource', 'j1-state'];
const box = (x: number, y: number) => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const hit = (w = 40, h = 40) => ({ type: 'Shape', kind: 'box', width: w, height: h });

// ═══════════════════════════════════════════════════════════════════════════
// P1 · 点某格 → 只改那一格
// ═══════════════════════════════════════════════════════════════════════════

describe('P1 · 点某格 → 只改那一格', () => {
  // 修复前实查红：点 tile-b，被改的是 tile-a（effect-apply 的逻辑 kind 走 lookup.flag 全局查找，
  // 只有物理 kind 用 targetsOf()）。owner 2026-09-17 裁 A·补引擎，REQ-F-041 补齐三个逻辑 kind。
  // 本条现断言**修复后**行为，同时充当引擎改动的跨包回归（引擎侧另有 effect-apply.test.ts 单测）。
  it('P1-a 【绿】Effect{set-flag, @signal-source} 点谁改谁', () => {
    const e = farmWorld(
      {
        'tile-a': {
          Transform: box(0, 0), Shape: hit(), Tag: { type: 'Tag', flags: TILE },
          Clickable: { type: 'Clickable', action: 'act' },
          Flag: { type: 'Flag', id: 'tilled', active: false },
        },
        'tile-b': {
          Transform: box(100, 0), Shape: hit(), Tag: { type: 'Tag', flags: TILE },
          Clickable: { type: 'Clickable', action: 'act' },
          Flag: { type: 'Flag', id: 'tilled', active: false },
        },
        'rule': {
          Effect: {
            type: 'Effect', onSignal: 'act', kind: 'set-flag',
            targetId: 'tilled', targetEntity: '@signal-source', value: true,
          },
        },
      },
      [...BASE_CAPS, 't2-clickable', 't2-effect-apply'],
    );

    click(e, 100, 0); // 点的是 tile-b
    e.world.tick();

    const a = flagOf(e, 'tile-a', 'tilled');
    const b = flagOf(e, 'tile-b', 'tilled');
    console.log(`[P1-a] 点 tile-b → tile-a.tilled=${a}  tile-b.tilled=${b}`);
    expect(b).toBe(true); // 被点的那格变了
    expect(a).toBe(false); // 没被点的那格**没**变
  });

  // 同一修复的另两个逻辑 kind：地块生命周期靠 set-state、道具栏/背包靠 modify-resource。
  it('P1-a2 【绿】set-state / modify-resource 也点谁改谁', () => {
    const mkTile = (x: number, stage: number) => ({
      Transform: box(x, 0), Shape: hit(), Tag: { type: 'Tag', flags: TILE },
      Clickable: { type: 'Clickable', action: 'act' },
      State: { type: 'State', fsmId: 'tile', current: 'wild', previous: 'wild' },
      Resource: { type: 'Resource', id: 'stage', current: stage, min: 0, max: 9 },
    });
    const e = farmWorld(
      {
        'tile-a': mkTile(0, 0),
        'tile-b': mkTile(100, 0),
        'fx-state': {
          Effect: {
            type: 'Effect', onSignal: 'act', kind: 'set-state',
            targetId: 'tile', targetEntity: '@signal-source', value: 'tilled',
          },
        },
        'fx-res': {
          Effect: {
            type: 'Effect', onSignal: 'act', kind: 'modify-resource', targetId: 'stage',
            targetEntity: '@signal-source', op: 'add', value: 3,
          },
        },
      },
      [...BASE_CAPS, 't2-clickable', 't2-effect-apply'],
    );

    click(e, 100, 0); // 只点 tile-b
    e.world.tick();

    const s = (id: string) => e.world.getComponent<State>(id, 'State')?.current;
    const r = (id: string) => resOf(e, id, 'stage');
    console.log(`[P1-a2] tile-a={state:${s('tile-a')},stage:${r('tile-a')}}  tile-b={state:${s('tile-b')},stage:${r('tile-b')}}`);
    expect({ a: s('tile-a'), b: s('tile-b') }).toEqual({ a: 'wild', b: 'tilled' });
    expect({ a: r('tile-a'), b: r('tile-b') }).toEqual({ a: 0, b: 3 });
  });

  // 实查绿：唯一信号名（game102 先例：deploy_${i}）。这是 P1 的 B 路（O(N) 命名）。
  it('P1-b 【绿】B 路可行：每格唯一信号名 → 点谁改谁', () => {
    const e = farmWorld(
      {
        'tile-a': {
          Transform: box(0, 0), Shape: hit(), Tag: { type: 'Tag', flags: TILE },
          Clickable: { type: 'Clickable', action: 'act_a' },
          Flag: { type: 'Flag', id: 'tilled_a', active: false },
        },
        'tile-b': {
          Transform: box(100, 0), Shape: hit(), Tag: { type: 'Tag', flags: TILE },
          Clickable: { type: 'Clickable', action: 'act_b' },
          Flag: { type: 'Flag', id: 'tilled_b', active: false },
        },
        'fx-a': { Effect: { type: 'Effect', onSignal: 'act_a', kind: 'set-flag', targetId: 'tilled_a', value: true } },
        'fx-b': { Effect: { type: 'Effect', onSignal: 'act_b', kind: 'set-flag', targetId: 'tilled_b', value: true } },
      },
      [...BASE_CAPS, 't2-clickable', 't2-effect-apply'],
    );

    click(e, 100, 0); // 点的是 tile-b
    e.world.tick();

    const a = flagOf(e, 'tile-a', 'tilled_a');
    const b = flagOf(e, 'tile-b', 'tilled_b');
    console.log(`[P1-b] 点 tile-b → tile-a.tilled_a=${a}  tile-b.tilled_b=${b}`);
    expect(a).toBe(false);
    expect(b).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P2 · 睡觉 → 各作物各长一阶（且只长浇过水的）
// ═══════════════════════════════════════════════════════════════════════════

/** 地块 = 一实体七件套：Transform/Shape/Tag/Clickable/Flag(浇水)/State(生命周期)/Resource(生长阶)。
 *  注意 Flag、State、Resource **各只有一个槽**（见 P4），故「浇水」占 Flag、「荒地→已翻→已播→成熟」
 *  占 State 的单字符串、生长阶占 Resource 的唯一数值。 */
function tile(id: string, x: number, y: number, o: { watered: boolean; fsm: string; stage: number }) {
  return {
    Transform: box(x, y), Shape: hit(), Tag: { type: 'Tag', flags: TILE },
    Flag: { type: 'Flag', id: 'watered', active: o.watered },
    State: { type: 'State', fsmId: 'tile', current: o.fsm, previous: o.fsm },
    Resource: { type: 'Resource', id: 'stage', current: o.stage, min: 0, max: 9 },
    // 生长规则施于**自身**：读自身 watered 旗 + 自身 state，长自身 stage 一阶，并**自清**浇水旗
    // （不清则 Resolve 每拍都满足条件 → 每拍长一阶，首轮实测 4 tick 长了 3 阶）。
    SelfRule: {
      type: 'SelfRule',
      when: {
        kind: 'and',
        of: [
          { kind: 'flag', id: 'watered' },
          { kind: 'state', fsmId: 'tile', equals: 'sown' },
        ],
      },
      do: [
        { kind: 'modify-resource', op: 'add', value: 1 },
        { kind: 'set-flag', value: false },
      ],
    },
  };
}

const SLEEP_FX = {
  Effect: {
    type: 'Effect', onSignal: 'sleep', kind: 'set-flag-tagged',
    tagMask: TILE, targetId: 'watered', value: true,
  },
};
const SLEEP_BTN = {
  Transform: box(0, 300), Shape: hit(), Tag: { type: 'Tag', flags: 0 },
  Clickable: { type: 'Clickable', action: 'sleep' },
};
const GROW_CAPS = [...BASE_CAPS, 't2-clickable', 't2-effect-apply', 't2-self-rule'];

describe('P2 · 睡觉 → 各作物各长一阶', () => {
  // 实查绿：set-flag-tagged 按 Tag 掩码对**每个**命中实体各自的同 id Flag 置位（它就是为这个造的）。
  it('P2-a 【绿】批量置旗：一次信号把全场地块各自的 watered 置真', () => {
    const e = farmWorld(
      {
        'tile-1': tile('tile-1', 0, 0, { watered: false, fsm: 'sown', stage: 0 }),
        'tile-2': tile('tile-2', 50, 0, { watered: false, fsm: 'sown', stage: 0 }),
        'tile-3': tile('tile-3', 100, 0, { watered: false, fsm: 'sown', stage: 0 }),
        'sleep-btn': SLEEP_BTN,
        'sleep-fx': SLEEP_FX,
      },
      GROW_CAPS,
    );

    click(e, 0, 300);
    e.world.tick();

    const got = ['tile-1', 'tile-2', 'tile-3'].map((id) => flagOf(e, id, 'watered'));
    console.log(`[P2-a] 睡觉后各格 watered=${JSON.stringify(got)}`);
    expect(got).toEqual([true, true, true]);
  });

  // 实查绿：self-rule 的 when 读自身组件、do 施于自身 —— 正是 ③′ 全局路由坑的解药。
  // 「自清」是关键：不自清则每拍长一阶（首轮实测 4tick=+3）。
  it('P2-b 【绿】各长各的：睡一觉全场每种作物恰好 +1 阶，且可连续两天重复', () => {
    const e = farmWorld(
      {
        'tile-1': tile('tile-1', 0, 0, { watered: false, fsm: 'sown', stage: 0 }),
        'tile-2': tile('tile-2', 50, 0, { watered: false, fsm: 'sown', stage: 0 }),
        'tile-3': tile('tile-3', 100, 0, { watered: false, fsm: 'sown', stage: 0 }),
        'sleep-btn': SLEEP_BTN,
        'sleep-fx': SLEEP_FX,
      },
      GROW_CAPS,
    );

    // 睡觉结算＝跨 2 拍（第 1 拍置旗、第 2 拍各格读旗生长），这是相位决定的形状：
    // 置旗在 effect-apply(Commit)，生长在 self-rule(Resolve)，Resolve 先于 Commit。
    const night = () => {
      click(e, 0, 300);   // 本帧：指针按下
      e.world.tick();     // Update 产 sleep 信号 → Commit 全场 watered=true
      clearInput(e);      // 下一帧：指针已抬起，输入源重投空表
      e.world.tick();     // Resolve 各格读自身 watered → +1 阶 + 自清
    };

    night();
    const day1 = ['tile-1', 'tile-2', 'tile-3'].map((id) => resOf(e, id, 'stage'));
    night();
    const day2 = ['tile-1', 'tile-2', 'tile-3'].map((id) => resOf(e, id, 'stage'));

    console.log(`[P2-b] 第1天 stage=${JSON.stringify(day1)}  第2天 stage=${JSON.stringify(day2)}`);
    expect(day1).toEqual([1, 1, 1]); // 每样各长一阶（不是某个实体被加了 3）
    expect(day2).toEqual([2, 2, 2]); // 第二天还能再长（自清复位 → 不是 once 一次性）
  });

  // 负路径：浇水门 + 阶段门都要挡住。首值直接写在 manifest 里（Flag.active 是数据字段，非作弊）。
  it('P2-c 【绿】不长的情况：没浇水的不长、不是「已播种」的不长', () => {
    const e = farmWorld(
      {
        // 浇过水 + 已播种 → 该长
        'ok': tile('ok', 0, 0, { watered: true, fsm: 'sown', stage: 0 }),
        // 没浇水 → 不长（即「当天不浇则当天不生长」）
        'dry': tile('dry', 50, 0, { watered: false, fsm: 'sown', stage: 0 }),
        // 浇了水但还没播种（已翻土）→ 不长
        'bare': tile('bare', 100, 0, { watered: true, fsm: 'tilled', stage: 0 }),
      },
      GROW_CAPS,
    );

    e.world.tick();
    e.world.tick();

    const got = { ok: resOf(e, 'ok', 'stage'), dry: resOf(e, 'dry', 'stage'), bare: resOf(e, 'bare', 'stage') };
    console.log(`[P2-c] stage=${JSON.stringify(got)}`);
    expect(got).toEqual({ ok: 1, dry: 0, bare: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P3 · 体力不够 → 动作被拒
// ═══════════════════════════════════════════════════════════════════════════

describe('P3 · 体力不够 → 动作被拒（负路径）', () => {
  // 实查绿：craft-recipe 的可负担检查是 `current - amount < min` → 不够则整单放弃（原子）。
  it('P3-a 【绿】可负担才成交：energy=0 拒不动、energy=5 扣 1', () => {
    const mk = (energy: number) =>
      farmWorld(
        {
          // 体力是全局单例 → 用全局 Resource（lookup 全局 id 路由，正合用）
          'wallet': { Resource: { type: 'Resource', id: 'energy', current: energy, min: 0, max: 20 } },
          'till-btn': {
            Transform: box(0, 0), Shape: hit(), Tag: { type: 'Tag', flags: 0 },
            Clickable: { type: 'Clickable', action: 'till' },
          },
          'till-recipe': {
            CraftRecipe: {
              type: 'CraftRecipe', onSignal: 'till',
              costs: [{ id: 'energy', amount: 1 }],
            },
          },
        },
        [...BASE_CAPS, 't2-clickable', 't2-craft-recipe'],
      );

    const poor = mk(0);
    click(poor, 0, 0);
    poor.world.tick();
    const afterPoor = resOf(poor, 'wallet', 'energy');

    const rich = mk(5);
    click(rich, 0, 0);
    rich.world.tick();
    const afterRich = resOf(rich, 'wallet', 'energy');

    console.log(`[P3-a] energy 0 → ${afterPoor}｜energy 5 → ${afterRich}`);
    expect(afterPoor).toBe(0); // 不够就不动
    expect(afterRich).toBe(4); // 够就扣 1
  });

  // 与 P3-a 相反的方向：craft-recipe 的 lookup 是**全局**的，所以它够不着「每格各自的资源」。
  // 记下来当边界（本作体力/金币都是全局单例，故不受影响；但若哪天要「每格本地成本」就不成立）。
  it('P3-b 【绿·边界】craft-recipe 的 costs 只认全局单例资源', () => {
    const e = farmWorld(
      {
        'wallet': { Resource: { type: 'Resource', id: 'energy', current: 5, min: 0, max: 20 } },
        'till-btn': {
          Transform: box(0, 0), Shape: hit(), Tag: { type: 'Tag', flags: 0 },
          Clickable: { type: 'Clickable', action: 'till' },
        },
        'till-recipe': {
          CraftRecipe: { type: 'CraftRecipe', onSignal: 'till', costs: [{ id: 'energy', amount: 1 }] },
        },
      },
      [...BASE_CAPS, 't2-clickable', 't2-craft-recipe'],
    );

    click(e, 0, 0);
    e.world.tick();
    console.log(`[P3-b] 全局 energy 5 → ${resOf(e, 'wallet', 'energy')}`);
    expect(resOf(e, 'wallet', 'energy')).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P4 · 一实体一组件槽 —— 地块实体设计的前提
// ═══════════════════════════════════════════════════════════════════════════

describe('P4 · 一实体一组件槽', () => {
  // manifest 里同一实体写两次同名组件本就不可表达（对象键唯一）；这里查的是**运行期**语义：
  // addComponent 第二份是同类型覆盖还是并存？答案决定地块实体能挂几个 Flag/State/Resource。
  it('同一实体第二次 addComponent(Flag) → 覆盖而非并存（每类只有一个槽）', () => {
    const w = new World();
    w.createEntity('e');
    w.addComponent('e', { type: 'Flag', id: 'watered', active: true } as Flag);
    w.addComponent('e', { type: 'Flag', id: 'tilled', active: true } as Flag);

    const f = w.getComponent<Flag>('e', 'Flag');
    console.log(`[P4] 第二份 Flag 后，getComponent(Flag) = ${JSON.stringify(f)}`);
    expect(f?.id).toBe('tilled'); // 只剩后写的那份
  });

  it('State 的 current 是**字符串** → 一个 State 槽可当「地块生命周期」用', () => {
    const w = new World();
    w.createEntity('e');
    w.addComponent('e', { type: 'State', fsmId: 'tile', current: 'wild', previous: 'wild' } as State);
    const s = w.getComponent<State>('e', 'State');
    console.log(`[P4] State = ${JSON.stringify(s)}`);
    expect(s?.current).toBe('wild');
    expect(typeof s?.current).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P5 · 通关判据（T2 闭环门的推进出口：攒够金币 → 结算）
// ═══════════════════════════════════════════════════════════════════════════

describe('P5 · 攒够目标金币 → 结算', () => {
  // flow 的动作也是全局 id 路由 —— 但金币本就是全局单例，此处全局路由**正确**，
  // 与 P1 的坑（每格同名状态）不同性质。故通关判据不需要 P1 那条路。
  const TARGET = 10;
  const mk = (gold: number) =>
    farmWorld(
      {
        'wallet': { Resource: { type: 'Resource', id: 'gold', current: gold, min: 0, max: 9999 } },
        'flow': {
          GameFlow: {
            type: 'GameFlow', id: 'main', current: 'playing',
            states: [
              {
                id: 'playing',
                transitions: [
                  { when: { kind: 'resource', id: 'gold', cmp: 'gte', value: TARGET }, to: 'won' },
                ],
              },
              { id: 'won', onEnter: [] },
            ],
          },
        },
      },
      [...BASE_CAPS, 't3-flow'],
    );

  it('P5-a 【绿】没攒够停在 playing、攒够了转 won', () => {
    const poor = mk(TARGET - 1);
    poor.world.tick();
    poor.world.tick();

    const rich = mk(TARGET);
    rich.world.tick();
    rich.world.tick();

    const sPoor = poor.world.getComponent<GameFlow>('flow', 'GameFlow')?.current;
    const sRich = rich.world.getComponent<GameFlow>('flow', 'GameFlow')?.current;
    console.log(`[P5-a] gold=${TARGET - 1} → ${sPoor}｜gold=${TARGET} → ${sRich}`);
    expect(sPoor).toBe('playing');
    expect(sRich).toBe('won');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P6 · 条件门 when（REQ-G109-002，owner 2026-09-17 判 A·补引擎）
//      —— 三条被阻塞的需求逐条实证
// ═══════════════════════════════════════════════════════════════════════════
//
// 缺的是「**要不要写**」：REQ-G109-001 让 `@signal-source` 能指定「写谁」，但「**被点那一格自身的
// 状态决定这次动作成不成立**」此前无件可表达（见 requests.md 的 REQ-G109-002 §2 实查表）。
// 三条设计需求同时撞在这上面，逐条真跑一遍。

describe('P6 · 条件门 when：工具前置门 / 成熟判定 / 按作物路由', () => {
  const GATE_CAPS = [...BASE_CAPS, 't2-clickable', 't2-effect-apply', 'x3-string-variable'];
  /** 一格：生命周期 state + 生长阶 stage + 种的是什么 crop（crop 只读，装配期定）。 */
  const fieldTile = (x: number, o: { fsm: string; stage: number; crop: string }) => ({
    Transform: box(x, 0), Shape: hit(), Tag: { type: 'Tag', flags: TILE },
    Clickable: { type: 'Clickable', action: 'tool' },
    State: { type: 'State', fsmId: 'tile', current: o.fsm, previous: o.fsm },
    Resource: { type: 'Resource', id: 'stage', current: o.stage, min: 0, max: 9 },
    StringVar: { type: 'StringVar', id: 'crop', value: o.crop },
  });
  const stateOf = (e: Engine, id: string): string | undefined =>
    e.world.getComponent<State>(id, 'State')?.current;
  /** 点一下、只让它响一拍（InputQueue 不自动清 → 每拍须重投，见夹具保真度注）。 */
  const tap = (e: Engine, x: number, y: number): void => {
    clearInput(e); click(e, x, y); e.world.tick(); clearInput(e);
  };

  // 需求 1（计划 §3 `TOOLS` 表的「目标前置 state」栏）：sow 只在 `tilled` 格上成立。
  it('P6-a 【绿】工具前置门：点荒地不施，且**不回落**改到旁边那格', () => {
    const e = farmWorld(
      {
        'tile-a': fieldTile(0, { fsm: 'tilled', stage: 0, crop: '' }),
        'tile-b': fieldTile(50, { fsm: 'wild', stage: 0, crop: '' }),
        'sow-fx': {
          Effect: {
            type: 'Effect', onSignal: 'tool', kind: 'set-state',
            targetId: 'tile', targetEntity: '@signal-source', value: 'sown',
            when: { kind: 'state', fsmId: 'tile', equals: 'tilled' },
          },
        },
      },
      GATE_CAPS,
    );

    tap(e, 50, 0); // 点荒地
    console.log(`[P6-a] 点荒地 → tile-a=${stateOf(e, 'tile-a')}  tile-b=${stateOf(e, 'tile-b')}`);
    expect(stateOf(e, 'tile-b')).toBe('wild'); // 门没过 → 不施
    // ↓ 最要紧的一条：门把目标滤空后，三个逻辑 kind 的 `if (direct.length) … 否则回落全局` 老路径
    // 会去改**全局唯一持有者**——那就又写错实体（正是 REQ-G109-001 治的病）。hit 级的 some 门须拦住它。
    expect(stateOf(e, 'tile-a')).toBe('tilled');

    tap(e, 0, 0); // 点已翻土的
    console.log(`[P6-a] 点已翻土 → tile-a=${stateOf(e, 'tile-a')}  tile-b=${stateOf(e, 'tile-b')}`);
    expect(stateOf(e, 'tile-a')).toBe('sown'); // 门过了 → 只施于被点那格
    expect(stateOf(e, 'tile-b')).toBe('wild');
  });

  // 需求 2：成熟判定——该格生长阶 vs 该作物成熟天数；数据在**这一格**身上。
  it('P6-b 【绿】成熟判定：没熟不施、熟了才施（本格 stage ≥ 3）', () => {
    const e = farmWorld(
      {
        'tile-a': fieldTile(0, { fsm: 'sown', stage: 2, crop: 'turnip' }), // 差一阶
        'tile-b': fieldTile(50, { fsm: 'sown', stage: 3, crop: 'turnip' }), // 熟了
        'reap-fx': {
          Effect: {
            type: 'Effect', onSignal: 'tool', kind: 'set-state',
            targetId: 'tile', targetEntity: '@signal-source', value: 'mature',
            when: {
              kind: 'and',
              of: [
                { kind: 'state', fsmId: 'tile', equals: 'sown' },
                { kind: 'resource', id: 'stage', cmp: 'gte', value: 3 },
              ],
            },
          },
        },
      },
      GATE_CAPS,
    );

    tap(e, 0, 0);
    console.log(`[P6-b] stage=2 → tile-a=${stateOf(e, 'tile-a')}`);
    expect(stateOf(e, 'tile-a')).toBe('sown'); // 没熟 → 不施
    tap(e, 50, 0);
    console.log(`[P6-b] stage=3 → tile-b=${stateOf(e, 'tile-b')}`);
    expect(stateOf(e, 'tile-b')).toBe('mature'); // 熟了 → 施
  });

  // 需求 3：按作物路由收获——门读**本格**种的是哪一种，效果写**全局**背包。
  // 这是「目标 ≠ 发起者」的形态，故 hit 级的 some 门对**无 targetEntity** 的效果 =「任一源过门即施放一次」。
  it('P6-c 【绿】按作物路由收获：点胡萝卜不进芜菁账，点芜菁才进', () => {
    const e = farmWorld(
      {
        'tile-a': fieldTile(0, { fsm: 'sown', stage: 3, crop: 'turnip' }),
        'tile-b': fieldTile(50, { fsm: 'sown', stage: 3, crop: 'carrot' }), // 同样熟，另一种作物
        'barn': { Resource: { type: 'Resource', id: 'turnip_count', current: 0, min: 0, max: 999 } },
        'reap-fx': {
          Effect: {
            type: 'Effect', onSignal: 'tool', kind: 'modify-resource',
            targetId: 'turnip_count', op: 'add', value: 1,
            when: {
              kind: 'and',
              of: [
                { kind: 'state', fsmId: 'tile', equals: 'sown' },
                { kind: 'resource', id: 'stage', cmp: 'gte', value: 3 },
                { kind: 'string', id: 'crop', equals: 'turnip' },
              ],
            },
          },
        },
      },
      GATE_CAPS,
    );

    tap(e, 50, 0); // 点胡萝卜
    console.log(`[P6-c] 点胡萝卜 → turnip_count=${resOf(e, 'barn', 'turnip_count')}`);
    expect(resOf(e, 'barn', 'turnip_count')).toBe(0); // 路由不对 → 一本背包不动
    tap(e, 0, 0); // 点芜菁
    console.log(`[P6-c] 点芜菁 → turnip_count=${resOf(e, 'barn', 'turnip_count')}`);
    expect(resOf(e, 'barn', 'turnip_count')).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// P7 · 全局条件门 whenGlobal（REQ-G109-003，owner 2026-09-18 判 A·补引擎）
//      —— S1 卡的核心机制：体力不够则动作被拒
// ═══════════════════════════════════════════════════════════════════════════
//
// P6 的 `when` 读的是**被点那一格自己**的组件；而 S1 卡写的是「每天有一定的体力，点地块干农活」——
// 体力挂在**全局单例**（`wallet`）上，格子身上没有。于是「点某格翻土 ∧ 全局体力 ≥1」这种合取，
// self 门恒 false、`CraftRecipe` 又够不着被点那格（它没有 targetEntity），两边各有一半、合不起来。
// `whenGlobal` 补的就是这半边：按**全局 id** 求值，与 `when` 取 AND。

describe('P7 · 全局条件门 whenGlobal：体力够才干活、干活扣体力', () => {
  const CAPS = [...BASE_CAPS, 't2-clickable', 't2-effect-apply'];
  const tile = (x: number, fsm: string) => ({
    Transform: box(x, 0), Shape: hit(), Tag: { type: 'Tag', flags: TILE },
    Clickable: { type: 'Clickable', action: 'tool' },
    State: { type: 'State', fsmId: 'tile', current: fsm, previous: fsm },
  });
  const stateOf = (e: Engine, id: string): string | undefined =>
    e.world.getComponent<State>(id, 'State')?.current;
  const tap = (e: Engine, x: number, y: number): void => {
    clearInput(e); click(e, x, y); e.world.tick(); clearInput(e);
  };

  /** 「干活」= 三拍握手：①认领（荒地→busy）②扣费（全局一次）③落定（busy→tilled）。
   *
   *  ⚠️ 装配要点（本轮实查所得·S3 必须照办）：effect-apply 的 hits 按 `Effect.order` 升序结算、
   *  **并列按 eid 字典序** tie-break（effect-apply.ts:143）。而「干活」与「扣费」两半**互相读对方写的量**：
   *  扣费写 `energy`、活的那半读 `energy`（whenGlobal）；活的那半写地块 State、扣费的门若读 State 也会被它改。
   *  → **结算序成了语义的一部分**，两半直接对读必然自锁：
   *    · 扣费先跑 → 体力已扣到 0 → 活那半的 whenGlobal 看到 0 → **活没干成、体力却没了**（P7-e 留档就是这个指纹）。
   *    · 活先跑 → 地块已变 tilled → 扣费那半若以 State 为门 → **门被自己刚改的 State 挡下 → 活干了、体力没扣**（本轮实测）。
   *  两者都错，且都不是 `whenGlobal` 的缺陷——是**同一批 hits 内的读写序**没有中立快照。
   *
   *  解法（重组·不新造引擎件）：让两半**不同时读同一个量**。中间插一个**临时态** `busy`——
   *  ①认领写 busy，②扣费的门读 busy（读到的是「本次点击已完成认领」这个**瞬时事实**，
   *  而**不是**「这格已翻土」这个**持久事实**），③落定再把 busy 抹成 tilled。
   *  于是「点已翻土格」时①的门(state=wild)先挡住，busy 根本没出现 → ②③连带不成立 → **不白扣体力**；
   *  而「点荒地但没体力」时①的 whenGlobal 挡住 → 同样不出现 busy → 不扣。
   *  busy 只活在同一拍 Commit 内，拍末已是 tilled，渲染读的是拍后状态。 */
  const WORK_ENTITIES = (energy: number, tiles: Record<string, unknown>) => ({
    ...tiles,
    'wallet': { Resource: { type: 'Resource', id: 'energy', current: energy, min: 0, max: 20 } },
    'a-claim-fx': {
      Effect: {
        type: 'Effect', onSignal: 'tool', kind: 'set-state', order: 0,
        targetId: 'tile', targetEntity: '@signal-source', value: 'busy',
        when: { kind: 'state', fsmId: 'tile', equals: 'wild' },
        whenGlobal: { kind: 'resource', id: 'energy', cmp: 'gte', value: 1 },
      },
    },
    'b-spend-fx': {
      Effect: {
        type: 'Effect', onSignal: 'tool', kind: 'modify-resource', order: 1,
        targetId: 'energy', op: 'add', value: -1,
        when: { kind: 'state', fsmId: 'tile', equals: 'busy' }, // ← 读临时态，不是持久态
        whenGlobal: { kind: 'resource', id: 'energy', cmp: 'gte', value: 1 },
      },
    },
    'c-settle-fx': {
      Effect: {
        type: 'Effect', onSignal: 'tool', kind: 'set-state', order: 2,
        targetId: 'tile', targetEntity: '@signal-source', value: 'tilled',
        when: { kind: 'state', fsmId: 'tile', equals: 'busy' },
      },
    },
  });

  // 正路径：有体力 → 翻土成立 + 扣 1。
  it('P7-a 【绿】体力 1 → 点荒地：翻土成立 且 体力扣到 0', () => {
    const e = farmWorld(WORK_ENTITIES(1, { 'tile-a': tile(0, 'wild') }), CAPS);
    tap(e, 0, 0);
    console.log(`[P7-a] energy=1 点荒地 → tile-a=${stateOf(e, 'tile-a')}  energy=${resOf(e, 'wallet', 'energy')}`);
    expect(stateOf(e, 'tile-a')).toBe('tilled');
    expect(resOf(e, 'wallet', 'energy')).toBe(0);
  });

  // 负路径（S1 卡原话「体力不够则动作被拒」）：全局门挡下，**土也没翻、体力也没扣**。
  it('P7-b 【绿】体力 0 → 点荒地：动作被拒（土不翻、体力不动）', () => {
    const e = farmWorld(WORK_ENTITIES(0, { 'tile-a': tile(0, 'wild') }), CAPS);
    tap(e, 0, 0);
    console.log(`[P7-b] energy=0 点荒地 → tile-a=${stateOf(e, 'tile-a')}  energy=${resOf(e, 'wallet', 'energy')}`);
    expect(stateOf(e, 'tile-a')).toBe('wild'); // 门没过 → 不施
    expect(resOf(e, 'wallet', 'energy')).toBe(0); // 负值也不施
  });

  // AND 而非 OR：体力够，但这格已翻过土 → 两半都不成立（**不能白扣体力**）。
  it('P7-c 【绿】self 门与全局门取 AND：体力够但格子已翻土 → 不施且不扣体力', () => {
    const e = farmWorld(WORK_ENTITIES(3, { 'tile-a': tile(0, 'tilled') }), CAPS);
    tap(e, 0, 0);
    console.log(`[P7-c] 已翻土格 → tile-a=${stateOf(e, 'tile-a')}  energy=${resOf(e, 'wallet', 'energy')}`);
    expect(stateOf(e, 'tile-a')).toBe('tilled');
    expect(resOf(e, 'wallet', 'energy')).toBe(3); // 没白扣
  });

  // 实证留档：`when` 对**无 targetEntity** 的效果 =「任一源过门即施放一次」。
  // 于是同拍点两格荒地时：翻土**逐格**成立（@signal-source 逐源过滤），而扣体力是**全局一次**。
  // 这是 S3/S4 装配必须知道的边界（一回合一动作的回合制下天然回避；真并击时非 1:1）。
  it('P7-d 【绿·留档】同拍点两格荒地：两格都翻土，但全局扣费只一次（逐源 ≠ 逐次计费）', () => {
    const e = farmWorld(
      WORK_ENTITIES(1, { 'tile-a': tile(0, 'wild'), 'tile-b': tile(50, 'wild') }),
      CAPS,
    );
    clearInput(e);
    setInput(e, [
      { source: 'p1', x: 0, y: 0, phase: 'down' } as RawInputData,
      { source: 'p1', x: 50, y: 0, phase: 'down' } as RawInputData,
    ]);
    e.world.tick();
    clearInput(e);
    console.log(
      `[P7-d] 同拍点两格 → tile-a=${stateOf(e, 'tile-a')} tile-b=${stateOf(e, 'tile-b')} energy=${resOf(e, 'wallet', 'energy')}`,
    );
    expect(stateOf(e, 'tile-a')).toBe('tilled');
    expect(stateOf(e, 'tile-b')).toBe('tilled');
    expect(resOf(e, 'wallet', 'energy')).toBe(0); // 只扣 1（不是 2）
  });

  // ⚠️ 留档负例（**两半直接对读**的陷阱·P7-e）：钉死「结算序是语义的一部分，不能听凭 eid 字典序」。
  // 实查原文（不给 order、两半都以 State=wild 为门、活那半额外以 energy≥1 为全局门）：
  // 字典序 `'spend-fx' < 'till-fx'` → **扣费先跑**，体力 1→0，随后翻土那半的 whenGlobal 看到 0
  // → **活没干成、体力却没了**。反过来的序同样错（门被自己刚写的 State 挡下 → 活干了、体力没扣）。
  // 这正是不能用「两半直接对读」而必须走上面三拍握手的原因。
  it('P7-e 【留档】两半直接对读 + 不给 order → 字典序扣费先跑：活没干成、体力却没了', () => {
    const e = farmWorld(
      {
        'tile-a': tile(0, 'wild'),
        'wallet': { Resource: { type: 'Resource', id: 'energy', current: 1, min: 0, max: 20 } },
        'till-fx': {
          Effect: {
            type: 'Effect', onSignal: 'tool', kind: 'set-state',
            targetId: 'tile', targetEntity: '@signal-source', value: 'tilled',
            when: { kind: 'state', fsmId: 'tile', equals: 'wild' },
            whenGlobal: { kind: 'resource', id: 'energy', cmp: 'gte', value: 1 },
          },
        },
        'spend-fx': {
          Effect: {
            type: 'Effect', onSignal: 'tool', kind: 'modify-resource',
            targetId: 'energy', op: 'add', value: -1,
            when: { kind: 'state', fsmId: 'tile', equals: 'wild' },
            whenGlobal: { kind: 'resource', id: 'energy', cmp: 'gte', value: 1 },
          },
        },
      },
      CAPS,
    );
    tap(e, 0, 0);
    console.log(
      `[P7-e] 两半直接对读 → tile-a=${stateOf(e, 'tile-a')}  energy=${resOf(e, 'wallet', 'energy')}（活没干成·体力却没了）`,
    );
    expect(stateOf(e, 'tile-a')).toBe('wild'); // ← 就是这个陷阱的指纹：门被扣费自己挡下
    expect(resOf(e, 'wallet', 'energy')).toBe(0); // ← 体力却实打实扣了
  });
});
