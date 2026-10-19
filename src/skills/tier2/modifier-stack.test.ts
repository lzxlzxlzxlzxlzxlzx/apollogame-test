import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { modifierStackCapability, aggregateModifiers, modifierCtx, type ModifierRow, type ModifierCtx } from './modifier-stack.js';
import type { ModifierSource, ModifierTotals, Resource, Flag } from '@engine/protocol/components.js';

// modifier-stack（REQ-CAP 下沉）：修正聚合栈纯函数核 + Update 系统。对齐 skills 1:1 测试文化。
// 含**表达力验收夹具**：三套真实词汇（game-e 小丑 / game-g 天罡 / game-g 地煞）各抽 ≥6 条改写成 ModifierSource，
// 断言聚合结果与原实现语义一致；**表达不了的用例单列并断言其行为差异**（v2 输入，见文件尾「表达力缺口」段）。

// 无门控、静态量的 ctx（valueFrom 资源表可注入；gate 恒真）。
const staticCtx = (res: Record<string, number> = {}): ModifierCtx => ({
  resource: (id) => res[id],
  gate: () => true,
});

describe('modifier-stack.aggregateModifiers —— 确定性聚合核', () => {
  it('应用序 add→mul（base+Σadd → ×Πmul），对齐 clash-resolve pEff', () => {
    const rows: ModifierRow[] = [
      { id: 'a', target: 'x', op: 'add', value: 4 },
      { id: 'b', target: 'x', op: 'mul', value: 2 },
      { id: 'c', target: 'x', op: 'add', value: 6 },
    ];
    // base 10 → (10 + 4 + 6) × 2 = 40（add 全部先于 mul，与 row 书写序无关）。
    expect(aggregateModifiers(rows, staticCtx(), { x: 10 })).toEqual({ x: 40 });
  });

  it('max/min/or/floor 各字段策略 + 布尔字段', () => {
    const rows: ModifierRow[] = [
      { id: 'm1', target: 'hp', op: 'max', value: 2 },
      { id: 'm2', target: 'hp', op: 'max', value: 3 }, // 取大·非叠加 → 3
      { id: 'c1', target: 'cap', op: 'min', value: 5 },
      { id: 'b1', target: 'flag', op: 'or' }, // 无 value → true
      { id: 'b2', target: 'flag', op: 'or', value: 0 }, // false
      { id: 'f1', target: 'wr', op: 'add', value: 3 },
      { id: 'f2', target: 'wr', op: 'floor', value: 10 }, // 末端下限钳 → max(3,10)=10
    ];
    expect(aggregateModifiers(rows, staticCtx())).toEqual({ hp: 3, cap: 0, flag: true, wr: 10 });
    // cap: base 0，min(0,5)=0（min 是上限钳；无 add → 停在 0）。
  });

  it('valueFrom：贡献量 = Resource.current × scale', () => {
    const rows: ModifierRow[] = [
      { id: 'bull', target: 'chips', op: 'add', valueFrom: { resourceId: 'money', scale: 2 } },
      { id: 'banner', target: 'chips', op: 'add', valueFrom: { resourceId: 'discards', scale: 30 } },
    ];
    // money=7 → 14；discards=3 → 90。
    expect(aggregateModifiers(rows, staticCtx({ money: 7, discards: 3 }), { chips: 100 })).toEqual({ chips: 204 });
  });

  it('gate 剔除不成立的行（含其 mul）', () => {
    const rows: ModifierRow[] = [
      { id: 'base', target: 'm', op: 'add', value: 4 },
      { id: 'cond_add', target: 'm', op: 'add', value: 8, gate: { kind: 'flag', id: 'has_pair' } },
      { id: 'cond_mul', target: 'm', op: 'mul', value: 2, gate: { kind: 'flag', id: 'has_pair' } },
    ];
    const on: ModifierCtx = { resource: () => undefined, gate: () => true };
    const off: ModifierCtx = { resource: () => undefined, gate: () => false };
    expect(aggregateModifiers(rows, on, { m: 10 })).toEqual({ m: (10 + 4 + 8) * 2 }); // 44
    expect(aggregateModifiers(rows, off, { m: 10 })).toEqual({ m: 10 + 4 }); // 14（两条门控行都被剔除）
  });

  it('确定性：mul 顺序由 order→id 定，与输入序无关', () => {
    const a: ModifierRow[] = [
      { id: 'z', target: 'x', op: 'mul', value: 2, order: 1 },
      { id: 'a', target: 'x', op: 'mul', value: 3, order: 0 },
    ];
    const b = [...a].reverse();
    expect(aggregateModifiers(a, staticCtx(), { x: 1 })).toEqual(aggregateModifiers(b, staticCtx(), { x: 1 }));
  });
});

// ════════════════════════════════════════════════════════════════════
//  表达力验收①：game-g 地煞 DishaFx（disha.ts DISHA_SPECS + DISHA_MERGE：sum/max/or）
//  DISHA_MERGE 映射：sum→add · max→max · or→or。逐字段单策略 → **完全可表达**。
//  取材（只读 disha.ts，未 import）：thermopylae/phalanx/laststand/burnboats/overlord/winstreak/mandate/chainboats。
// ════════════════════════════════════════════════════════════════════
describe('表达力验收①·地煞 DishaFx（sum/max/or 逐字段策略）', () => {
  it('8 张地煞聚合 = aggregateDisha 语义（逐字段一致）', () => {
    const rows: ModifierRow[] = [
      // thermopylae { homeHp:2(max), nearBaseSlots:2(max), nearBasePower:1(sum) }
      { id: 'thermopylae:homeHp', target: 'homeHp', op: 'max', value: 2 },
      { id: 'thermopylae:nearBaseSlots', target: 'nearBaseSlots', op: 'max', value: 2 },
      { id: 'thermopylae:nearBasePower', target: 'nearBasePower', op: 'add', value: 1 },
      // phalanx { phalanxPerAdj:4(sum), phalanxCap:12(sum), phalanxAdj8:true(or) }
      { id: 'phalanx:phalanxPerAdj', target: 'phalanxPerAdj', op: 'add', value: 4 },
      { id: 'phalanx:phalanxCap', target: 'phalanxCap', op: 'add', value: 12 },
      { id: 'phalanx:phalanxAdj8', target: 'phalanxAdj8', op: 'or' },
      // laststand { lastStandGeneral:3(max) }
      { id: 'laststand:lastStandGeneral', target: 'lastStandGeneral', op: 'max', value: 3 },
      // burnboats { allWinPct:20(sum), noRout:true(or) }
      { id: 'burnboats:allWinPct', target: 'allWinPct', op: 'add', value: 20 },
      { id: 'burnboats:noRout', target: 'noRout', op: 'or' },
      // overlord { generalWinPct:40(sum) }
      { id: 'overlord:generalWinPct', target: 'generalWinPct', op: 'add', value: 40 },
      // winstreak { winStreakPer:4(sum), winStreakCap:20(sum) }
      { id: 'winstreak:winStreakPer', target: 'winStreakPer', op: 'add', value: 4 },
      { id: 'winstreak:winStreakCap', target: 'winStreakCap', op: 'add', value: 20 },
      // mandate { allWinPct:5(sum) } → 与 burnboats 累加验证 sum
      { id: 'mandate:allWinPct', target: 'allWinPct', op: 'add', value: 5 },
      // chainboats { phalanxPerAdj:3(sum), phalanxCap:9(sum), phalanxAdj8:false(or) }
      { id: 'chainboats:phalanxPerAdj', target: 'phalanxPerAdj', op: 'add', value: 3 },
      { id: 'chainboats:phalanxCap', target: 'phalanxCap', op: 'add', value: 9 },
      { id: 'chainboats:phalanxAdj8', target: 'phalanxAdj8', op: 'or', value: 0 },
    ];
    expect(aggregateModifiers(rows, staticCtx())).toEqual({
      allWinPct: 25, // 20 + 5（sum）
      generalWinPct: 40,
      phalanxPerAdj: 7, // 4 + 3（sum）
      phalanxCap: 21, // 12 + 9（sum）
      phalanxAdj8: true, // true || false（or）
      nearBaseSlots: 2, // max
      nearBasePower: 1,
      homeHp: 2, // max
      lastStandGeneral: 3, // max
      noRout: true, // or
      winStreakPer: 4,
      winStreakCap: 20,
    });
  });
});

// ════════════════════════════════════════════════════════════════════
//  表达力验收②：game-g 天罡 TengangFx（game-g-build.ts TENGANG_OPS，18 op 抽样）
//  op 语义映射：`+=` → add · `Math.max` (powerMulHighest 取最大) → max · `= 1` (noRout) → max value 1。
//  全 18 op 均是「单字段 add 累加」或「powerMulHighest 取大」→ **完全可表达**。
// ════════════════════════════════════════════════════════════════════
describe('表达力验收②·天罡 TengangFx（add 累加 + powerMulHighest 取大）', () => {
  it('抽样 op 聚合 = tengangFxOf 语义', () => {
    const rows: ModifierRow[] = [
      { id: 'odds1', target: 'pEffAdd', op: 'add', value: 3 }, // odds:add 鬼手
      { id: 'odds2', target: 'pEffAdd', op: 'add', value: 2 }, // 再来一张 → 累加 5
      { id: 'power_all', target: 'powerAll', op: 'add', value: 5 }, // power:add 虎符（全军）
      { id: 'power_le3', target: 'powerLE3', op: 'add', value: 4 }, // power:add filter countLE3 寡兵
      { id: 'mul_a', target: 'powerMulHighest', op: 'max', value: 2 }, // power:mul scope highestRank 擎天
      { id: 'mul_b', target: 'powerMulHighest', op: 'max', value: 3 }, // 另一张 → 取大 3（非叠加）
      { id: 'combo_pair', target: 'comboPair', op: 'add', value: 8 }, // combo:pair（用 bonus，改写为 value）
      { id: 'norout', target: 'noRout', op: 'max', value: 1 }, // morale:noRout 督战（=1）
      { id: 'handmax', target: 'handMaxAdd', op: 'add', value: 1 }, // draw:handMax 广纳
      { id: 'noupset', target: 'noUpset', op: 'add', value: 1 }, // odds:noUpset 铁骰（每张 +1 计数）
    ];
    expect(aggregateModifiers(rows, staticCtx())).toEqual({
      pEffAdd: 5, // 3 + 2
      powerAll: 5,
      powerLE3: 4,
      powerMulHighest: 3, // max(2,3)：取最强单张·非叠加
      comboPair: 8,
      noRout: 1,
      handMaxAdd: 1,
      noUpset: 1,
    });
  });
});

// ════════════════════════════════════════════════════════════════════
//  表达力验收③：game-e 小丑计分（jokers.ts：add/mul 作用 chips/mult/money + 门控 + valueFrom + countTag）
//  取材：joker/jolly/cavendish/the_duo/banner/bull/abstract/golden。
//  可表达：静态 add/mul、hand_contains 门控（→ gate flag）、valueFrom（Banner/Bull）、countTag（→ group-count 物化成
//  Resource 后走 valueFrom）。**表达不了**的用例见文件尾「表达力缺口」段（v2 输入）。
// ════════════════════════════════════════════════════════════════════
describe('表达力验收③·小丑计分（add/mul + 门控 + valueFrom + countTag）', () => {
  const ctx = (hasPair: boolean): ModifierCtx => ({
    resource: (id) => ({ money: 7, discards: 3, joker_count: 5 })[id],
    gate: (expr) => (expr.kind === 'flag' && expr.id === 'has_pair' ? hasPair : true),
  });
  // 手牌基础：mult=10、chips=100（消费方 seed base；小丑贡献叠加其上）。
  const base = { mult: 10, chips: 100 };
  const rows: ModifierRow[] = [
    { id: 'joker', target: 'mult', op: 'add', value: 4 }, // +4 倍率（always）
    { id: 'jolly_joker', target: 'mult', op: 'add', value: 8, gate: { kind: 'flag', id: 'has_pair' } }, // 含对子 +8
    { id: 'abstract_joker', target: 'mult', op: 'add', valueFrom: { resourceId: 'joker_count', scale: 3 } }, // 每小丑 +3（countTag→group-count 物化）
    { id: 'cavendish', target: 'mult', op: 'mul', value: 3 }, // ×3 倍率（always）
    { id: 'the_duo', target: 'mult', op: 'mul', value: 2, gate: { kind: 'flag', id: 'has_pair' } }, // 含对子 ×2
    { id: 'banner', target: 'chips', op: 'add', valueFrom: { resourceId: 'discards', scale: 30 } }, // 每剩 1 弃牌 +30
    { id: 'bull', target: 'chips', op: 'add', valueFrom: { resourceId: 'money', scale: 2 } }, // 每 $1 +2 筹
    { id: 'golden_joker', target: 'money', op: 'add', value: 4 }, // 回合结束 +$4
  ];

  it('含对子（门控成立）：add 全过、×3×2', () => {
    // mult = (10 + 4 + 8 + 15) × 3 × 2 = 37 × 6 = 222；chips = 100 + 90 + 14 = 204；money = 4。
    expect(aggregateModifiers(rows, ctx(true), base)).toEqual({ mult: 222, chips: 204, money: 4 });
  });

  it('无对子（门控不成立）：jolly/duo 双双剔除', () => {
    // mult = (10 + 4 + 15) × 3 = 29 × 3 = 87（jolly 的 +8 与 duo 的 ×2 都因 gate 剔除）。
    expect(aggregateModifiers(rows, ctx(false), base)).toEqual({ mult: 87, chips: 204, money: 4 });
  });
});

// ════════════════════════════════════════════════════════════════════
//  表达力缺口（如实记录·v2 输入，禁硬凑）：以下小丑/econ 语义**现版聚合核表达不了**，
//  此处用测试钉死"差异行为"，证明缺口真实存在、非实现 bug。
// ════════════════════════════════════════════════════════════════════
describe('表达力缺口·钉死差异（v2 输入）', () => {
  it('① 顺序交织（×mult 先于 +mult）：相位聚合 ≠ 逐条顺序结算', () => {
    // effect-apply 逐条按 order 结算：base 10 → ×2 → +4 = 24。
    // modifier-stack 相位聚合（add 全先于 mul）：(10 + 4) × 2 = 28。→ 二者不等 = 缺口。
    const rows: ModifierRow[] = [
      { id: 'x_mul', target: 'm', op: 'mul', value: 2, order: 0 },
      { id: 'y_add', target: 'm', op: 'add', value: 4, order: 1 },
    ];
    const phased = aggregateModifiers(rows, staticCtx(), { m: 10 }).m;
    const sequential = (10 * 2) + 4; // effect-apply 语义
    expect(phased).toBe(28);
    expect(sequential).toBe(24);
    expect(phased).not.toBe(sequential); // 交织顺序无法用「相位聚合」表达 → v2（保留在 effect-apply/card-scoring）
  });

  it('② 概率门（Bloodstone 1/2 ×1.5）：gate 只吃确定性 ConditionExpr，无 chance 掷', () => {
    // modifier-stack.gate 是确定性布尔树，没有 num/den 掷 RNG 的位置 → 概率型小丑留在 effect-apply.chance。
    // 这里断言：把概率行当普通 gate=true 处理 → 恒施用（丢失了 1/2 概率语义）= 缺口。
    const rows: ModifierRow[] = [{ id: 'bloodstone', target: 'mult', op: 'mul', value: 1.5 }];
    expect(aggregateModifiers(rows, staticCtx(), { mult: 2 })).toEqual({ mult: 3 }); // 恒施，无概率
  });

  it('③ 非线性 econ（interest = floor(money/5)×v）：valueFrom 只有线性 ×scale', () => {
    // per_boss / per_9_in_deck 是「count × v」→ valueFrom 线性可表达；
    // 但 interest = floor(money/5)×v 含整除，valueFrom 的 current×scale 表达不了（floor-divide 缺失）。
    // 线性可表达一例（per_boss，bosses=3）：
    const linear: ModifierRow[] = [{ id: 'rocket', target: 'money', op: 'add', valueFrom: { resourceId: 'bosses', scale: 2 } }];
    expect(aggregateModifiers(linear, staticCtx({ bosses: 3 }), {}).money).toBe(6);
    // 非线性（interest）：由 aggregateModifiers **真实输出**取得（原断言是 23*0.2 纯字面算术，
    // 与被测核无关·A2 遗留修正）——valueFrom 只有线性 current×scale，最接近的写法 money(23)×0.2
    // 聚合出 4.6（浮点），≠ Balatro interest 语义 floor(23/5)×1 = 4 → 缺口真实存在。
    const interest: ModifierRow[] = [{ id: 'interest', target: 'money', op: 'add', valueFrom: { resourceId: 'money', scale: 0.2 } }];
    const got = aggregateModifiers(interest, staticCtx({ money: 23 }), {}).money;
    expect(got).toBeCloseTo(4.6, 12);     // 实跑：线性 23×0.2（IEEE 4.6000…05）
    const want = Math.floor(23 / 5) * 1;  // interest 真语义 = 4
    expect(got).not.toBe(want);           // 聚合核真实输出 ≠ 整除语义 → 缺口钉死（floor-divide 缺失）
  });
});

// ── Update 相位系统：全场 ModifierSource → ModifierTotals（端到端复用 condition.ts 门控求值）──
describe('modifier-stack 系统 —— 收集全场 ModifierSource → 写 ModifierTotals', () => {
  const src = (w: World, eid: string, row: Omit<ModifierSource, 'type'>): void => {
    w.createEntity(eid);
    w.addComponent(eid, { type: 'ModifierSource', ...row } as ModifierSource);
  };

  it('聚合并写入 totals；gate 读真实 Flag/Resource（复用 evaluateCondition）', () => {
    const w = new World();
    for (const s of modifierStackCapability.systems) w.addSystem(s);
    // 门控读的真实世界值：has_pair Flag=true、money Resource=7。
    w.createEntity('flags');
    w.addComponent('flags', { type: 'Flag', id: 'has_pair', active: true } as Flag);
    w.addComponent('flags', { type: 'Resource', id: 'money', current: 7, min: 0, max: 999 } as Resource);
    src(w, 's1', { id: 'joker', target: 'mult', op: 'add', value: 4 });
    src(w, 's2', { id: 'jolly', target: 'mult', op: 'add', value: 8, gate: { kind: 'flag', id: 'has_pair' } });
    src(w, 's3', { id: 'bull', target: 'chips', op: 'add', valueFrom: { resourceId: 'money', scale: 2 } });
    // 消费口：
    w.createEntity('sink');
    w.addComponent('sink', { type: 'ModifierTotals', totals: {} } as ModifierTotals);

    w.tick();
    const t1 = w.getComponent<ModifierTotals>('sink', 'ModifierTotals')!.totals;
    expect(t1).toEqual({ mult: 12, chips: 14 }); // base 0：mult 4+8、chips 7×2

    // 幂等（set 语义·无累积漂移）：再 tick 一次结果不变。
    w.tick();
    expect(w.getComponent<ModifierTotals>('sink', 'ModifierTotals')!.totals).toEqual(t1);
  });

  it('modifierCtx 复用 buildConditionLookup + evaluateCondition（gate=false 剔除）', () => {
    const w = new World();
    w.createEntity('f');
    w.addComponent('f', { type: 'Flag', id: 'has_pair', active: false } as Flag);
    const ctx = modifierCtx(w);
    const rows: ModifierRow[] = [{ id: 'g', target: 'm', op: 'add', value: 8, gate: { kind: 'flag', id: 'has_pair' } }];
    expect(aggregateModifiers(rows, ctx, { m: 1 })).toEqual({ m: 1 }); // 门控 false → 剔除
  });
});
