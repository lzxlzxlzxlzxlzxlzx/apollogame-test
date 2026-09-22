import { describe, it, expect, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import { topologicalSort } from '@engine/core/topological-sort.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Resource, Signal, Flag, Effect, EventWhen, StringVar } from '@engine/protocol/components.js';
import {
  matrixDuelCapability,
  checkDuelMatrix,
  validateDuelMatrix,
  resolveDuelMatrix,
  duelVerdict,
  scaleResourceId,
  type DuelMatrix,
  type DuelIntent,
  type DuelPatch,
  type DuelTable,
} from './matrix-duel.js';
import type { DebugTrace } from '@engine/protocol/components.js';
import { formatTrace } from '../debug-trace.js';
import { eventWhenCapability } from './event-when.js';
import { effectApplyCapability } from './effect-apply.js';
import { craftRecipeCapability } from './craft-recipe.js';
import { cardPileCapability } from './card-pile.js';
import { selfRuleCapability } from './self-rule.js';
import { modifierStackCapability } from './modifier-stack.js';
import { statsCapability } from './stats.js';
import { weightedSpawnCapability } from './weighted-spawn.js';
import { resourceCapability, flagCapability, stringVariableCapability } from '@atom-skills/index.js';
import { flowCapability } from '@skills/tier3/index.js';

// ═══════════════════════════════════════════════════════════════
//  matrix-duel 点名测试（REQ-MATRIXDUEL·Lead 附加③）
//    ① 3×3 基础三态（胜 / 负 / 平）各路径 + 附带效果 + 具名信号
//    ② 运行时改 payoff 补丁生效（改单手收益 / 改平局收益）
//    ③ 增设第四手补丁后 4×4 **全 16 格**查表可达（逐格断言真结算的血量增减）
//    ④ intent 清理（结算后同 intent 不再触发二次结算）
//    ⑤ 坏补丁拒收各类型（未知类型 / 引用不存在的手 / 表残缺 / 互克 / 越权改血量资源）
//    ⑥ 定序申报 + 不成环回归（本能力的两系统与 resource-apply/event-when/effect-apply 共存）
// ═══════════════════════════════════════════════════════════════

const BASE_MATRIX = (): Omit<DuelMatrix, 'type'> => ({
  hpResource: 'hp',
  throws: ['rock', 'paper', 'scissors'],
  beats: { rock: ['scissors'], paper: ['rock'], scissors: ['paper'] },
  payoff: {
    rock: { damage: 6 },
    paper: { damage: 4, signal: 'duel_paper_win' },
    scissors: { damage: 5, effects: [{ resource: 'insight', amount: 1 }] },
  },
  tie: { selfDamage: 1, signal: 'duel_tie' },
  winSignal: 'duel_win',
  loseSignal: 'duel_lose',
  resolvedSignal: 'duel_resolved',
});

/** 一张桌：duel(判定表) + p1/p2(各一份 hp) + pool(全局洞察点)。 */
function table(md: Omit<DuelMatrix, 'type'>): World {
  const w = new World();
  for (const s of matrixDuelCapability.systems) w.addSystem(s);
  for (const s of resourceCapability.systems) w.addSystem(s);
  for (const s of flagCapability.systems) w.addSystem(s);
  for (const s of eventWhenCapability.systems) w.addSystem(s);
  for (const s of effectApplyCapability.systems) w.addSystem(s);
  for (const s of stringVariableCapability.systems) w.addSystem(s);
  w.createEntity('duel');
  w.addComponent('duel', { type: 'DuelMatrix', ...md } as DuelMatrix);
  for (const p of ['p1', 'p2']) {
    w.createEntity(p);
    w.addComponent(p, { type: 'Resource', id: 'hp', current: 20, min: 0, max: 100 } as Resource);
  }
  w.createEntity('pool');
  w.addComponent('pool', { type: 'Resource', id: 'insight', current: 0, min: 0, max: 99 } as Resource);
  return w;
}

function intend(w: World, eid: string, thrown: string): void {
  w.addComponent(eid, { type: 'DuelIntent', throw: thrown } as DuelIntent);
}
const hp = (w: World, eid: string): number => w.getComponent<Resource>(eid, 'Resource')!.current;
const insight = (w: World): number => w.getComponent<Resource>('pool', 'Resource')!.current;
const sig = (w: World, eid: string): string | undefined => w.getComponent<Signal>(eid, 'Signal')?.name;
const sigArg = (w: World, eid: string): string | undefined => w.getComponent<Signal>(eid, 'Signal')?.arg;

/** 出招 → tick 一次 → 返回结果（血量/洞察/三处信号）。 */
function duel(w: World, a: string, b: string): { p1: number; p2: number; insight: number } {
  intend(w, 'p1', a);
  intend(w, 'p2', b);
  w.tick();
  return { p1: hp(w, 'p1'), p2: hp(w, 'p2'), insight: insight(w) };
}

// ── ⑥ 定序申报 + 不成环回归 ───────────────────────────────────────────────

describe('matrix-duel — 定序申报（Lead 附加①·R10 范式）', () => {
  it('两系统的 id / 相位 / 显式定序 / 诚实 reads·writes', () => {
    expect(matrixDuelCapability.id).toBe('t2-matrix-duel');
    const [settle, announce] = matrixDuelCapability.systems;

    expect(settle.id).toBe('matrix-duel');
    expect(settle.phase ?? 0).toBe(SystemPhase.Update);
    // 产 ResourceModify → 必须排 resource-apply 前面（当拍扣血生效）；
    // self-rule 是 Resource 直写者 → 同样显式排前（压掉它的反向软边·否则三元环，见下一用例）。
    expect(settle.runsBefore).toEqual(['resource-apply', 'self-rule']);
    // 读 Resource = 诚实申报（根因①·owner 判 C）：resolveDamage 取缩放源是真读，此前瞒报
    // （旧断言 not.toContain('Resource') 是替瞒报背书——已撤）。不成环的机理：显式
    // runsBefore:['resource-apply'] 压掉反向推断边（topological-sort 规则③·下一用例实证）。
    expect(settle.reads).toEqual(['DuelMatrix', 'DuelIntent', 'Resource']);
    expect(settle.writes).toEqual(['ResourceModify', 'DuelIntent', 'DuelOutcome']);
    expect(settle.writes).not.toContain('Resource'); // 写侧仍只发事件，Resource 唯一写者恒为 resource-apply

    expect(announce.id).toBe('matrix-duel-announce');
    expect(announce.phase).toBe(SystemPhase.Commit); // 排在 event-when 的全局 Signal 清扫之后
    expect(announce.runsBefore).toEqual(['effect-apply']);
    // 清零随根因① C 搬回结算拍（op:'set' 载体）→ announce 不再读 Resource / 写 ResourceModify。
    expect(announce.reads).toEqual(['DuelOutcome', 'DuelMatrix']);
    expect(announce.writes).toEqual(['Signal', 'StringSet']);
    expect(announce.consumes).toEqual(['DuelOutcome']);
  });

  it('与 resource-apply / event-when / effect-apply 同世界不成环，且落序正确；**成环告警也必须为零**', () => {
    // 读告警铁律（2026-08-06 review 血训）：topological-sort 的环只打 console.warn 不改退出码——
    // 「定序用例全绿」不等于没环。诚实申报 Resource 后这里必须连 warn 一起断言为零：
    // 显式 runsBefore 压反向推断边（规则③）若哪天被削，本用例就是第一道红。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sys = [
      ...resourceCapability.systems,
      ...flagCapability.systems,
      ...stringVariableCapability.systems,
      ...eventWhenCapability.systems,
      ...effectApplyCapability.systems,
      ...craftRecipeCapability.systems,
      ...cardPileCapability.systems,
      ...selfRuleCapability.systems,
      ...modifierStackCapability.systems,
      ...statsCapability.systems,
      ...weightedSpawnCapability.systems,
      ...flowCapability.systems,
      ...matrixDuelCapability.systems,
    ];
    const order = topologicalSort(sys).map((s) => s.id);
    const cycleWarns = warn.mock.calls.filter((c) => String(c[0]).includes('环') || String(c[0]).toLowerCase().includes('cycle'));
    warn.mockRestore();
    expect(order.length).toBe(sys.length);
    expect(cycleWarns).toEqual([]); // ← 申报 Resource 后不许出现任何成环告警（软边被显式边正确压掉）
    const at = (id: string): number => order.indexOf(id);
    expect(at('matrix-duel')).toBeLessThan(at('resource-apply')); // 扣血当拍生效
    expect(at('matrix-duel-announce')).toBeGreaterThan(at('event-when')); // 信号不被全局清扫误删
    expect(at('matrix-duel-announce')).toBeLessThan(at('effect-apply')); // 信号当拍被消费
  });
});

// ── ① 3×3 基础三态 ────────────────────────────────────────────────────────

describe('matrix-duel — 3×3 基础三态（胜 / 负 / 平）', () => {
  it('胜：石克剪 → 剪方当拍 -6 血，胜方发 winSignal、败方发 loseSignal、对局发 resolvedSignal', () => {
    const w = table(BASE_MATRIX());
    const r = duel(w, 'rock', 'scissors');
    expect(r.p1).toBe(20);
    expect(r.p2).toBe(14);
    expect(sig(w, 'p1')).toBe('duel_win');
    expect(sigArg(w, 'p1')).toBe('rock');
    expect(sig(w, 'p2')).toBe('duel_lose');
    expect(sigArg(w, 'p2')).toBe('scissors');
    expect(sig(w, 'duel')).toBe('duel_resolved');
  });

  it('负：反过来出（剪 vs 石）→ 本方 -6，胜负两侧信号对调', () => {
    const w = table(BASE_MATRIX());
    const r = duel(w, 'scissors', 'rock');
    expect(r.p1).toBe(14);
    expect(r.p2).toBe(20);
    expect(sig(w, 'p2')).toBe('duel_win');
    expect(sig(w, 'p1')).toBe('duel_lose');
  });

  it('平：同手 → 双方各受 1 点僵持伤，双方各发 tie 信号（arg = 各自的手）', () => {
    const w = table(BASE_MATRIX());
    const r = duel(w, 'rock', 'rock');
    expect(r.p1).toBe(19);
    expect(r.p2).toBe(19);
    expect(sig(w, 'p1')).toBe('duel_tie');
    expect(sig(w, 'p2')).toBe('duel_tie');
    expect(sigArg(w, 'p1')).toBe('rock');
  });

  it('胜时附带效果：剪克布 → 布方 -5，胜方拿 +1 洞察（全局 id 路由）', () => {
    const w = table(BASE_MATRIX());
    const r = duel(w, 'scissors', 'paper');
    expect(r.p2).toBe(15);
    expect(r.insight).toBe(1);
  });

  it('具名手信号覆盖通用 winSignal：布克石 → 胜方发 duel_paper_win', () => {
    const w = table(BASE_MATRIX());
    const r = duel(w, 'paper', 'rock');
    expect(r.p2).toBe(16);
    expect(sig(w, 'p1')).toBe('duel_paper_win');
  });

  it('两侧未齐 → 不结算、不清已到的那一侧 intent（等齐）', () => {
    const w = table(BASE_MATRIX());
    intend(w, 'p1', 'rock');
    w.tick();
    expect(hp(w, 'p2')).toBe(20);
    expect(w.hasComponent('p1', 'DuelIntent')).toBe(true);
    intend(w, 'p2', 'scissors');
    w.tick();
    expect(hp(w, 'p2')).toBe(14); // 齐了才结算
  });

  it('多条附带效果各走各的载体实体，互不覆盖；载体不留过拍', () => {
    const md = BASE_MATRIX();
    md.payoff.scissors = {
      damage: 5,
      effects: [
        { resource: 'insight', amount: 2 },
        { resource: 'ticket', amount: 3 },
      ],
    };
    const w = table(md);
    w.createEntity('bank');
    w.addComponent('bank', { type: 'Resource', id: 'ticket', current: 0, min: 0, max: 99 } as Resource);
    duel(w, 'scissors', 'paper');
    expect(insight(w)).toBe(2);
    expect(w.getComponent<Resource>('bank', 'Resource')!.current).toBe(3);
    expect(w.getAllEntities().filter((e) => e.startsWith('duel:'))).toEqual([]); // 瞬时载体已收走
    expect(w.hasComponent('duel', 'DuelOutcome')).toBe(false); // 结算记录已被 consume
  });

  it('信号当拍就被 effect-apply 消费（定序真的对，非纸面声明）', () => {
    const w = table(BASE_MATRIX());
    w.createEntity('fx');
    w.addComponent('fx', { type: 'Flag', id: 'someone_won', active: false } as Flag);
    w.addComponent('fx', { type: 'Effect', onSignal: 'duel_win', kind: 'set-flag', targetId: 'someone_won', value: true } as Effect);
    duel(w, 'rock', 'scissors');
    expect(w.getComponent<Flag>('fx', 'Flag')!.active).toBe(true);
  });
});

// ── ④ intent 清理 ────────────────────────────────────────────────────────

describe('matrix-duel — intent 清理（同一回合绝不二次结算）', () => {
  it('结算后双方 intent 被清；再 tick 若干拍血量纹丝不动', () => {
    const w = table(BASE_MATRIX());
    duel(w, 'rock', 'scissors');
    expect(w.hasComponent('p1', 'DuelIntent')).toBe(false);
    expect(w.hasComponent('p2', 'DuelIntent')).toBe(false);
    for (let i = 0; i < 5; i++) w.tick();
    expect(hp(w, 'p2')).toBe(14); // 只结算过一次
    expect(insight(w)).toBe(0);
  });

  it('下一回合重新挂 intent → 再结算一次（累计生效）', () => {
    const w = table(BASE_MATRIX());
    duel(w, 'rock', 'scissors');
    const r = duel(w, 'rock', 'scissors');
    expect(r.p2).toBe(8); // 6 + 6
  });
});

// ── ② 运行时改 payoff 补丁 ────────────────────────────────────────────────

describe('matrix-duel — 补丁：改收益（payoff）', () => {
  it('改单手收益：剪伤害 5 → 10（剪刀祭）', () => {
    const w = table({ ...BASE_MATRIX(), patches: [{ kind: 'payoff', throw: 'scissors', payoff: { damage: 10 } }] });
    const r = duel(w, 'scissors', 'paper');
    expect(r.p2).toBe(10);
    expect(r.insight).toBe(1); // 只覆盖 damage，effects 原样保留（mergeDefined 不抹未给的字段）
  });

  it('改单手收益：判负自伤（selfDamageOnLose）与胜方伤害叠在同一笔上', () => {
    const w = table({
      ...BASE_MATRIX(),
      patches: [{ kind: 'payoff', throw: 'scissors', payoff: { selfDamageOnLose: 3 } }],
    });
    const r = duel(w, 'scissors', 'rock'); // 石胜(6) + 剪判负自伤(3)
    expect(r.p1).toBe(11);
    expect(r.p2).toBe(20);
  });

  it('改平局收益：tie.selfDamage 取负 → 双方各回 3 血（同调）', () => {
    const w = table({ ...BASE_MATRIX(), patches: [{ kind: 'payoff', tie: { selfDamage: -3 } }] });
    const r = duel(w, 'paper', 'paper');
    expect(r.p1).toBe(23);
    expect(r.p2).toBe(23);
  });

  it('补丁按书写序 fold：后写的覆盖先写的', () => {
    const w = table({
      ...BASE_MATRIX(),
      patches: [
        { kind: 'payoff', throw: 'rock', payoff: { damage: 9 } },
        { kind: 'payoff', throw: 'rock', payoff: { damage: 2 } },
      ],
    });
    expect(duel(w, 'rock', 'scissors').p2).toBe(18);
  });
});

// ── 补丁：改克制 ──────────────────────────────────────────────────────────

describe('matrix-duel — 补丁：改克制（beats）', () => {
  it('反律石板：石↔布 反转（石克布、布不再克石）', () => {
    const patches: DuelPatch[] = [
      { kind: 'beats', throw: 'rock', beats: ['scissors', 'paper'] },
      { kind: 'beats', throw: 'paper', beats: [] },
    ];
    const w = table({ ...BASE_MATRIX(), patches });
    expect(duel(w, 'rock', 'paper').p2).toBe(14); // 反转前是布胜，反转后石胜
    expect(sig(w, 'p1')).toBe('duel_win');
  });
});

// ── ③ 增设第四手：4×4 全查表可达 ─────────────────────────────────────────

const LIZARD_PATCH: DuelPatch = {
  kind: 'add-throw',
  throw: 'lizard',
  beats: ['paper'],
  beatenBy: ['rock', 'scissors'],
  payoff: { damage: 3 },
};
const VOID_PATCH: DuelPatch = { kind: 'add-throw', throw: 'void', beats: [], beatenBy: [], payoff: { damage: 0 } };

describe('matrix-duel — 补丁：增设第四手（3×3 → 4×4 全查表可达）', () => {
  it('增维后 throws / beats / payoff 三张表同步长好（beatenBy 反向登记）', () => {
    const t: DuelTable = resolveDuelMatrix({ type: 'DuelMatrix', ...BASE_MATRIX(), patches: [LIZARD_PATCH] } as DuelMatrix);
    expect(t.throws).toEqual(['rock', 'paper', 'scissors', 'lizard']);
    expect(t.beats.lizard).toEqual(['paper']);
    expect(t.beats.rock).toEqual(['scissors', 'lizard']);
    expect(t.beats.scissors).toEqual(['paper', 'lizard']);
    expect(t.payoff.lizard.damage).toBe(3);
  });

  it('4×4 全 16 格逐格真结算：判决与血量增减与判定表逐格一致', () => {
    const md = { ...BASE_MATRIX(), patches: [LIZARD_PATCH] };
    const t = resolveDuelMatrix({ type: 'DuelMatrix', ...md } as DuelMatrix);
    expect(t.throws.length).toBe(4);

    // 独立于系统实现、直接从判定表算出的期望值（表 = 唯一真相）。
    const expected = (a: string, b: string): { p1: number; p2: number } => {
      const v = duelVerdict(t, a, b);
      if (v === 'tie') return { p1: 20 - t.tie.selfDamage, p2: 20 - t.tie.selfDamage };
      const [winT, loseT] = v === 'a' ? [a, b] : [b, a];
      // damage 现为 DuelDamage（固定整数 | 缩放式）；本用例的表全是固定整数——
      // 显式收窄并在不符时**抛错**，而不是静默取 base 糊过去（表=唯一真相，假设变了要当场炸）。
      const raw = t.payoff[winT].damage;
      if (typeof raw !== 'number') throw new Error(`本用例期望固定伤害，但 ${winT} 是缩放式`);
      const dmg = raw + (t.payoff[loseT].selfDamageOnLose ?? 0);
      return v === 'a' ? { p1: 20, p2: 20 - dmg } : { p1: 20 - dmg, p2: 20 };
    };

    let cells = 0;
    const verdicts: string[] = [];
    for (const a of t.throws) {
      for (const b of t.throws) {
        const w = table(md);
        const r = duel(w, a, b);
        const e = expected(a, b);
        expect({ cell: `${a}|${b}`, ...r, insight: undefined }).toEqual({ cell: `${a}|${b}`, ...e, insight: undefined });
        // 每一格都真的走完了结算（intent 被清 + 有信号播出）
        expect(w.hasComponent('p1', 'DuelIntent')).toBe(false);
        expect(sig(w, 'duel')).toBe('duel_resolved');
        verdicts.push(duelVerdict(t, a, b));
        cells++;
      }
    }
    expect(cells).toBe(16);
    expect(verdicts.filter((v) => v === 'tie').length).toBe(4); // 对角线四格
    expect(verdicts.filter((v) => v !== 'tie').length).toBe(12); // 其余十二格都定得出胜负
    // 新手在两个方向上都真参与了：它克 paper、被 rock/scissors 克。
    expect(duelVerdict(t, 'lizard', 'paper')).toBe('a');
    expect(duelVerdict(t, 'lizard', 'rock')).toBe('b');
    expect(duelVerdict(t, 'lizard', 'scissors')).toBe('b');
  });

  it('第四指·空手（beats:[] + beatenBy:[]）→ 对任何手皆平，双方各受僵持伤', () => {
    const md = { ...BASE_MATRIX(), patches: [VOID_PATCH] };
    const t = resolveDuelMatrix({ type: 'DuelMatrix', ...md } as DuelMatrix);
    for (const other of t.throws) {
      expect(duelVerdict(t, 'void', other)).toBe('tie');
      expect(duelVerdict(t, other, 'void')).toBe('tie');
    }
    const w = table(md);
    const r = duel(w, 'void', 'rock');
    expect(r.p1).toBe(19);
    expect(r.p2).toBe(19);
  });

  it('增维 + 改克制可叠：先增手、后续补丁即可引用它', () => {
    const md = {
      ...BASE_MATRIX(),
      patches: [VOID_PATCH, { kind: 'beats', throw: 'void', beats: ['rock'] } as DuelPatch],
    };
    const t = resolveDuelMatrix({ type: 'DuelMatrix', ...md } as DuelMatrix);
    expect(duelVerdict(t, 'void', 'rock')).toBe('a');
    expect(duelVerdict(t, 'void', 'paper')).toBe('tie');
  });
});

// ── ⑤ 落盘门：坏补丁 / 坏表拒收 ──────────────────────────────────────────

const bad = (patches: DuelPatch[], over: Partial<DuelMatrix> = {}): DuelMatrix =>
  ({ type: 'DuelMatrix', ...BASE_MATRIX(), ...over, patches }) as DuelMatrix;

describe('matrix-duel — 落盘门（Lead 附加②·坏补丁一律拒收，绝不静默跳过）', () => {
  it('未知补丁类型 → 点名闭集', () => {
    const m = bad([{ kind: 'buff', throw: 'rock' } as unknown as DuelPatch]);
    expect(checkDuelMatrix(m).join('|')).toMatch(/未知补丁类型 "buff".*beats \/ payoff \/ add-throw/);
    expect(() => validateDuelMatrix(m)).toThrow(/装载校验失败/);
  });

  it('改克制补丁引用不存在的手（主语 / 宾语两侧都拦）', () => {
    expect(checkDuelMatrix(bad([{ kind: 'beats', throw: 'lizard', beats: ['paper'] }])).join('|')).toMatch(
      /手 "lizard" 不在判定表里/,
    );
    expect(checkDuelMatrix(bad([{ kind: 'beats', throw: 'rock', beats: ['lizard'] }])).join('|')).toMatch(
      /引用了不存在的手 "lizard"/,
    );
  });

  it('改收益补丁引用不存在的手 / 什么都没改', () => {
    expect(checkDuelMatrix(bad([{ kind: 'payoff', throw: 'lizard', payoff: { damage: 1 } }])).join('|')).toMatch(
      /手 "lizard" 不在判定表里/,
    );
    expect(checkDuelMatrix(bad([{ kind: 'payoff' }])).join('|')).toMatch(/既没给 payoff 也没给 tie/);
    expect(checkDuelMatrix(bad([{ kind: 'payoff', payoff: { damage: 1 } }])).join('|')).toMatch(/没说改哪一手/);
  });

  it('增维补丁：手已存在 / beatenBy 引用不存在的手 / 缺收益', () => {
    expect(checkDuelMatrix(bad([{ kind: 'add-throw', throw: 'rock', payoff: { damage: 1 } }])).join('|')).toMatch(
      /已经在判定表里了/,
    );
    expect(
      checkDuelMatrix(bad([{ kind: 'add-throw', throw: 'void', beatenBy: ['lizard'], payoff: { damage: 0 } } as DuelPatch])).join('|'),
    ).toMatch(/beatenBy 引用了不存在的手 "lizard"/);
    expect(
      checkDuelMatrix(bad([{ kind: 'add-throw', throw: 'void' } as unknown as DuelPatch])).join('|'),
    ).toMatch(/缺收益条目/);
  });

  it('beats 表残缺 / payoff 表残缺 → 点名是哪一手', () => {
    const missBeats = bad([], { beats: { rock: ['scissors'], paper: ['rock'] } });
    expect(checkDuelMatrix(missBeats).join('|')).toMatch(/beats 表残缺：手 "scissors" 没有 beats 条目/);
    const missPayoff = bad([], { payoff: { rock: { damage: 6 }, paper: { damage: 4 } } });
    expect(checkDuelMatrix(missPayoff).join('|')).toMatch(/payoff\["scissors"\] 缺收益条目/);
  });

  it('互克矛盾（改克制只反了一半）→ 拒收并提示把反向那条也去掉', () => {
    const half = bad([{ kind: 'beats', throw: 'rock', beats: ['scissors', 'paper'] }]); // 忘了清 paper→rock
    expect(checkDuelMatrix(half).join('|')).toMatch(/互克/);
    // 两条都写全就干净
    expect(
      checkDuelMatrix(
        bad([
          { kind: 'beats', throw: 'rock', beats: ['scissors', 'paper'] },
          { kind: 'beats', throw: 'paper', beats: [] },
        ]),
      ),
    ).toEqual([]);
  });

  it('自克 / 表外多余条目 / hpResource 未填 也拦', () => {
    expect(checkDuelMatrix(bad([{ kind: 'beats', throw: 'rock', beats: ['rock'] }])).join('|')).toMatch(/克制自己/);
    expect(checkDuelMatrix(bad([], { beats: { ...BASE_MATRIX().beats, ghost: [] } })).join('|')).toMatch(
      /beats 有多余条目 "ghost"/,
    );
    expect(checkDuelMatrix(bad([], { hpResource: '' })).join('|')).toMatch(/hpResource 未填/);
  });

  it('effects 越权改血量资源 → 拒收并指路 damage/selfDamageOnLose/tie.selfDamage', () => {
    const m = bad([{ kind: 'payoff', throw: 'rock', payoff: { effects: [{ resource: 'hp', amount: -2 }] } }]);
    expect(checkDuelMatrix(m).join('|')).toMatch(/不能直接改血量资源 "hp".*tie\.selfDamage/s);
  });

  it('干净的表 = 零问题；坏表在**运行期**也按同一把尺子硬抛（不静默跳过）', () => {
    expect(checkDuelMatrix(bad([]))).toEqual([]);
    expect(checkDuelMatrix(bad([LIZARD_PATCH]))).toEqual([]);
    const w = table({ ...BASE_MATRIX(), patches: [{ kind: 'buff' } as unknown as DuelPatch] });
    expect(() => w.tick()).toThrow(/未知补丁类型 "buff"/);
  });

  it('DuelIntent 出了表外的手 → 硬抛点名（静默跳过会让对局永远静止）', () => {
    const w = table(BASE_MATRIX());
    intend(w, 'p1', 'lizard');
    intend(w, 'p2', 'rock');
    expect(() => w.tick()).toThrow(/出了判定表外的手 "lizard"/);
  });

  // 回归（engine-review-2026-08-04 §3.3 · P2）：同一 duelId 挂 ≥3 份 DuelIntent 时，
  // 旧实现 `sides.length !== 2 → continue` 把它和「一侧未提交」混为一谈；但三份**永远不会
  // 自己变回两份** → 对局静止、零报错的永久死锁。与上面「表外的手」同类，同口径硬抛。
  it('同一 duelId 挂 ≥3 份 DuelIntent → 硬抛点名（永不自愈的数据错不得静默死锁）', () => {
    const w = table(BASE_MATRIX());
    w.createEntity('p3');
    w.addComponent('p3', { type: 'Resource', id: 'hp', current: 20, min: 0, max: 100 } as Resource);
    intend(w, 'p1', 'rock');
    intend(w, 'p2', 'scissors');
    intend(w, 'p3', 'paper');
    expect(() => w.tick()).toThrow(/挂了 3 份 DuelIntent/);
  });

  it('只有一侧提交 → 照常静默等齐（瞬时态·不得误抛）', () => {
    const w = table(BASE_MATRIX());
    intend(w, 'p1', 'rock');
    expect(() => w.tick()).not.toThrow();
    expect(hp(w, 'p1')).toBe(20); // 未结算
    expect(hp(w, 'p2')).toBe(20);
  });
});

// ── REQ-108-ENG-01：payoff 伤害按资源线性缩放（owner 2026-08-06 判 A·Lead 施工）──────────
// 伤害 = base + 出手方该资源当前值 × step（game108 蓄力槽 = 10 + 蓄力×10）。
// 缺省固定整数**零回归**；缩放式资源缺失退化成 base（绝不 NaN 污染 hp/快照 hash）。
describe('matrix-duel — 伤害缩放（REQ-108-ENG-01）', () => {
  // 蓄力槽用**各侧唯一 id**（引擎一实体一 Resource：p1/p2 身上那份已被 hp 占用，
  // 故蓄力另居实体，走 resolveDamage 的全局按 id 回落——与 resource-apply 同口径）。
  const charged = (chargeId: string, cur: number): World => {
    const w = table({
      hpResource: 'hp',
      throws: ['rock', 'paper'],
      beats: { rock: [], paper: ['rock'] },
      payoff: {
        rock: { damage: 5 },                                                  // 固定整数（零回归对照）
        // 数值刻意压小：hp min=0 会截断，若伤害超过 20 血则各档结果都=0、断言分辨不出真假。
        paper: { damage: { base: 2, scaleByResource: chargeId, step: 3 } }, // 缩放式
      },
      tie: { selfDamage: 0 },
    });
    w.createEntity('chargeSlot');
    w.addComponent('chargeSlot', { type: 'Resource', id: chargeId, current: cur, min: 0, max: 9 } as Resource);
    return w;
  };

  it('缩放式：蓄力 0/1/3 → 伤害 2/5/11（base + 值×step·各档可分辨）', () => {
    for (const [charge, expectDmg] of [[0, 2], [1, 5], [3, 11]] as [number, number][]) { // base2 + 值×3
      const w = charged('charge', charge);
      const r = duel(w, 'rock', 'paper'); // paper 胜 rock
      expect(r.p1).toBe(20 - expectDmg);  // p1 出 rock 落败，挨 paper 的缩放伤害
    }
  });

  it('缺省固定整数 → 行为与旧版逐位一致（零回归）', () => {
    const w = charged('charge', 4);       // 蓄力值故意非零，证明它只影响缩放式那一手
    const r = duel(w, 'paper', 'rock');   // paper 胜：p2 出 rock 落败，挨缩放伤 = 2 + 4×3 = 14
    expect(r.p2).toBe(20 - 14);
    // 固定伤那手**真取胜的一局**（A1 遗留加强：原来只查自构表数据，等于没测结算路径）：
    // 换一张 rock 能赢的表，蓄力仍非零 → 5 点固定伤经 resolveDamage→ResourceModify→resource-apply
    // 真落到 hp，且不被 charge 污染（若固定伤被误缩放将是 5+4×3=17 → p2=3，可分辨）。
    const w2 = table({
      hpResource: 'hp',
      throws: ['rock', 'paper'],
      beats: { rock: ['paper'], paper: [] },
      payoff: { rock: { damage: 5 }, paper: { damage: { base: 2, scaleByResource: 'charge', step: 3 } } },
      tie: { selfDamage: 0 },
    });
    w2.createEntity('chargeSlot');
    w2.addComponent('chargeSlot', { type: 'Resource', id: 'charge', current: 4, min: 0, max: 9 } as Resource);
    const r2 = duel(w2, 'rock', 'paper'); // rock 胜：p2 挨固定 5 伤
    expect(r2.p2).toBe(15);               // 实跑 golden：20 − 5
    expect(r2.p1).toBe(20);               // 败方 paper 不反伤
  });

  it('缩放资源不存在 → 退化成 base，绝不 NaN 污染 hp', () => {
    const w = table({
      hpResource: 'hp',
      throws: ['rock', 'paper'],
      beats: { rock: [], paper: ['rock'] },
      payoff: { rock: { damage: 5 }, paper: { damage: { base: 10, scaleByResource: '不存在的槽', step: 10 } } },
      tie: { selfDamage: 0 },
    });
    const r = duel(w, 'rock', 'paper');
    expect(r.p1).toBe(10);                 // = base
    expect(Number.isNaN(r.p1)).toBe(false);
  });

  it('落盘门：scaleByResource 缺失 / 非有限 base·step → 报错拒收', () => {
    const bad = (dmg: unknown): string[] => checkDuelMatrix({
      type: 'DuelMatrix', hpResource: 'hp', throws: ['a'], beats: { a: [] },
      payoff: { a: { damage: dmg } }, tie: { selfDamage: 0 },
    } as unknown as DuelMatrix);
    expect(bad({ base: 10, step: 10 }).join()).toMatch(/scaleByResource 未填/);
    expect(bad({ base: NaN, scaleByResource: 'c', step: 1 }).join()).toMatch(/base 不是有限数字/);
    expect(bad({ base: 1, scaleByResource: 'c', step: NaN }).join()).toMatch(/step 不是有限数字/);
  });

  it('落盘门：scaleByResource 不得是 hpResource（两侧同 id 无法全局寻址）', () => {
    const issues = checkDuelMatrix({
      type: 'DuelMatrix', hpResource: 'hp', throws: ['a'], beats: { a: [] },
      payoff: { a: { damage: { base: 10, scaleByResource: 'hp', step: 10 } } }, tie: { selfDamage: 0 },
    } as unknown as DuelMatrix);
    expect(issues.join()).toMatch(/不能是血量资源/);
  });

  // 复查 session 实测撞出（c7d4c2b3·owner 2026-08-06 令开单）：出手方身上没有该 id、而世界里挂着
  // **两份及以上同 id** 时，旧实现的全局回落取「第一个」——p2 用自己蓄力 0 的手，却按 p1 的蓄力 3
  // 算伤害，**无报错无告警、只是数字错**。落盘门抓不到（落盘时看不见世界里有几份同 id），
  // 故按本文件既定规矩（表外的手 / >2 份 DuelIntent）点名硬抛：永不自愈的数据错不许静默。
  it('同 id 蓄力槽挂了两份 → 点名硬抛，不静默取错侧', () => {
    const twoSlots = (): World => {
      const w = table({
        hpResource: 'hp',
        throws: ['rock', 'paper'],
        beats: { rock: [], paper: ['rock'] },
        payoff: { rock: { damage: 5 }, paper: { damage: { base: 2, scaleByResource: 'charge', step: 3 } } },
        tie: { selfDamage: 0 },
      });
      // 两份同 id：p1 侧 3 / p2 侧 0（都不挂在 p1/p2 身上——那两个槽已被 hp 占用）
      w.createEntity('chargeP1');
      w.addComponent('chargeP1', { type: 'Resource', id: 'charge', current: 3, min: 0, max: 9 } as Resource);
      w.createEntity('chargeP2');
      w.addComponent('chargeP2', { type: 'Resource', id: 'charge', current: 0, min: 0, max: 9 } as Resource);
      return w;
    };
    // p2 出 paper 取胜，自己蓄力 0 → 期望伤害 = base 2；旧实现取到 p1 的 3 → 11（静默错 9 点血）
    expect(() => duel(twoSlots(), 'rock', 'paper')).toThrow(/挂了 2 份同 id 的 Resource/);
    // 报错必须点名涉事实体，照 ">2 份 DuelIntent" 的口径
    expect(() => duel(twoSlots(), 'rock', 'paper')).toThrow(/chargeP1[\s\S]*chargeP2/);
  });

  // ── REQ-108-ENG-01 返工（复查侧撤回 PASS 改判打回·owner 2026-08-06 判 A）──────────────
  // 首版做的是「绝对 id + 全局回落」，把 spec 的唯一要点「按侧」丢了：payoff 是双方共用一张表、
  // scaleByResource 只能填一个字符串，故无论同 id 还是各侧唯一 id，两侧出同一手都取到同一条槽。
  // 返工 = perSide:true 时把表里的**相对名**拼成 `<出手方实体 id>.<相对名>`。
  describe('按侧缩放 perSide（REQ-108-ENG-01 返工）', () => {
    /** 同一张表：rock 克 paper·rock 的伤害按「出手方自己那条 charge.rock」缩放。 */
    const perSideWorld = (p1Charge: number, p2Charge: number): World => {
      const w = table({
        hpResource: 'hp',
        throws: ['rock', 'paper'],
        beats: { rock: ['paper'], paper: [] },
        payoff: {
          rock: { damage: { base: 0, scaleByResource: 'charge.rock', step: 5, perSide: true } },
          paper: { damage: 1 },
        },
        tie: { selfDamage: 0 },
      });
      w.createEntity('slotA');
      w.addComponent('slotA', { type: 'Resource', id: 'p1.charge.rock', current: p1Charge, min: 0, max: 9 } as Resource);
      w.createEntity('slotB');
      w.addComponent('slotB', { type: 'Resource', id: 'p2.charge.rock', current: p2Charge, min: 0, max: 9 } as Resource);
      return w;
    };

    // 【返工验收核心】同一张表、同一手 rock，两侧各按自己那条槽结算。
    // 首版在这里必错：两次都会取到同一条槽（表里只能填一个 id）。
    it('两侧对拍：p1 槽=3 / p2 槽=0，同手各取自己的槽', () => {
      // p1 出 rock 取胜 → 按 p1.charge.rock=3 → 伤害 15
      expect(duel(perSideWorld(3, 0), 'rock', 'paper').p2).toBe(20 - 15);
      // p2 出 rock 取胜 → 按 p2.charge.rock=0 → 伤害 0（首版此处会打出 15）
      expect(duel(perSideWorld(3, 0), 'paper', 'rock').p1).toBe(20);
      // 反过来装一遍，证明结果跟着数据走而不是跟着实体创建序走
      expect(duel(perSideWorld(0, 3), 'rock', 'paper').p2).toBe(20);
      expect(duel(perSideWorld(0, 3), 'paper', 'rock').p1).toBe(20 - 15);
    });

    it('perSide 相对名解析不到 → 退化成 base，绝不 NaN', () => {
      const w = table({
        hpResource: 'hp',
        throws: ['rock', 'paper'],
        beats: { rock: ['paper'], paper: [] },
        payoff: { rock: { damage: { base: 7, scaleByResource: '没这条槽', step: 10, perSide: true } }, paper: { damage: 1 } },
        tie: { selfDamage: 0 },
      });
      const r = duel(w, 'rock', 'paper');
      expect(r.p2).toBe(20 - 7);            // = base
      expect(Number.isNaN(r.p2)).toBe(false);
    });

    it('不做隐式回落：perSide 的相对名**不会**去撞同名的绝对 id 槽', () => {
      // 世界里有一条绝对 id 叫 "charge.rock"（正是表里填的相对名）。若实现写成「相对名找不到就试绝对名」，
      // 这里会取到 4 打出 20 伤；正确行为 = 拼出的 p1.charge.rock 不存在 → 退化成 base。
      const w = table({
        hpResource: 'hp',
        throws: ['rock', 'paper'],
        beats: { rock: ['paper'], paper: [] },
        payoff: { rock: { damage: { base: 2, scaleByResource: 'charge.rock', step: 5, perSide: true } }, paper: { damage: 1 } },
        tie: { selfDamage: 0 },
      });
      w.createEntity('trap');
      w.addComponent('trap', { type: 'Resource', id: 'charge.rock', current: 4, min: 0, max: 9 } as Resource);
      expect(duel(w, 'rock', 'paper').p2).toBe(20 - 2); // base，不是 2+4×5
    });

    it('scaleResourceId：perSide 拼出手方前缀·缺省原样（纯函数·确定性）', () => {
      expect(scaleResourceId({ base: 0, scaleByResource: 'charge.rock', step: 1, perSide: true }, 'p2')).toBe('p2.charge.rock');
      expect(scaleResourceId({ base: 0, scaleByResource: 'charge.rock', step: 1 }, 'p2')).toBe('charge.rock');
      expect(scaleResourceId({ base: 0, scaleByResource: 'pot', step: 1, perSide: false }, 'p1')).toBe('pot');
    });

    it('落盘门：perSide 非布尔 → 报错拒收；相对名同样不得指向 hpResource', () => {
      const check = (dmg: unknown): string => checkDuelMatrix({
        type: 'DuelMatrix', hpResource: 'hp', throws: ['a'], beats: { a: [] },
        payoff: { a: { damage: dmg } }, tie: { selfDamage: 0 },
      } as unknown as DuelMatrix).join();
      expect(check({ base: 1, scaleByResource: 'c', step: 1, perSide: 'yes' })).toMatch(/perSide 只能是布尔/);
      expect(check({ base: 1, scaleByResource: 'hp', step: 1, perSide: true })).toMatch(/不能是血量资源/);
      expect(check({ base: 1, scaleByResource: 'c', step: 1, perSide: true })).toBe(''); // 合法写法零误报
    });

    it('绝对 id 旧写法零回归（共享池形态仍照走全局唯一）', () => {
      const w = charged('charge', 3);      // 缺省式：表填绝对 id·世界里唯一一份
      expect(duel(w, 'rock', 'paper').p1).toBe(20 - (2 + 3 * 3));
    });
  });

  it('唯一同 id 槽 + 出手方身上无该资源 → 全局回落照常工作（零回归）', () => {
    const w = charged('charge', 3);        // 只有一份 charge → 回落取它
    expect(duel(w, 'rock', 'paper').p1).toBe(20 - (2 + 3 * 3));
  });
});


// ── REQ-108-ENG-02 输入接缝：信号 → DuelIntent ───────────────────────────────
// 本件此前有出口没入口（describe 原文「双方各挂 DuelIntent」= 假定别人挂好）。已逐条实查：
// Effect.kind 十项 / SelfAction.kind 五项都没有「加组件」，prefab 只建新实体 → 现有能力一条走不通。
// 放 Commit 相位（一拍延迟）而非 Update：本系统读 Signal，而 event-when 是 Signal 写者且排在
// resource-apply 之后，放 Update 会合围成文件头那个真环。
describe('matrix-duel — 输入接缝 intentSignals（REQ-108-ENG-02）', () => {
  const INTENT_TABLE = {
    hpResource: 'hp',
    throws: ['rock', 'paper'],
    beats: { rock: [], paper: ['rock'] },
    payoff: { rock: { damage: 5 }, paper: { damage: 6 } },
    tie: { selfDamage: 0 },
    intentSignals: { rock: 'throw.rock', paper: 'throw.paper' },
  };
  /** 把「发信号」按真实通路装上去：EventWhen 挂在侧实体上 → Signal.source = 该侧。 */
  const arm = (w: World, side: string, signal: string, flagId: string): void => {
    w.addComponent(side, { type: 'EventWhen', signal, when: { kind: 'flag', id: flagId }, mode: 'edge', armed: false } as unknown as EventWhen);
  };
  const setFlag = (w: World, id: string, active: boolean): void => {
    const e = `flag:${id}`;
    if (!w.hasComponent(e, 'Flag')) w.createEntity(e);
    w.addComponent(e, { type: 'Flag', id, active } as Flag);
  };
  const thrownOf = (w: World, eid: string): string | undefined =>
    w.getComponent<DuelIntent>(eid, 'DuelIntent')?.throw;

  it('① 玩家侧 + ② AI 侧：同拍两条信号各自产 intent，下一拍结算', () => {
    const w = table(INTENT_TABLE);
    arm(w, 'p1', 'throw.rock', 'p1_rock');   // 玩家点 UI → 信号
    arm(w, 'p2', 'throw.paper', 'p2_paper'); // AI 由 event-when 发同形信号
    setFlag(w, 'p1_rock', true);
    setFlag(w, 'p2_paper', true);

    w.tick(); // Update: event-when 发两条信号 → Commit: 接缝各自挂 intent（本拍不结算）
    expect(thrownOf(w, 'p1')).toBe('rock');
    expect(thrownOf(w, 'p2')).toBe('paper');
    expect(hp(w, 'p1')).toBe(20); // 一拍延迟：本拍还没结算

    w.tick(); // Update: 两侧齐备 → 结算（paper 胜 rock，p1 挨 6）
    expect(hp(w, 'p1')).toBe(20 - 6);
    expect(hp(w, 'p2')).toBe(20);
    expect(thrownOf(w, 'p1')).toBeUndefined(); // 结算后清 intent（read-then-settle 不变）
  });

  it('③ 同一时区内改主意 = 覆盖（结算按最后一次）', () => {
    const w = table(INTENT_TABLE);
    arm(w, 'p1', 'throw.rock', 'p1_rock');
    setFlag(w, 'p1_rock', true);
    w.tick();
    expect(thrownOf(w, 'p1')).toBe('rock');   // 只有一侧有 intent → 不结算

    // 改主意：同一侧改发 paper（真实里是玩家又点了另一颗按钮）
    w.addComponent('p1', { type: 'EventWhen', signal: 'throw.paper', when: { kind: 'flag', id: 'p1_paper' }, mode: 'edge', armed: false } as unknown as EventWhen);
    setFlag(w, 'p1_paper', true);
    w.tick();
    expect(thrownOf(w, 'p1')).toBe('paper');  // 覆盖成功
    expect(hp(w, 'p1')).toBe(20);             // 仍只有一侧，未结算
  });

  it('④ 不填 intentSignals → 信号来了也不产 intent（零回归）', () => {
    const w = table({ ...INTENT_TABLE, intentSignals: undefined });
    arm(w, 'p1', 'throw.rock', 'p1_rock');
    setFlag(w, 'p1_rock', true);
    w.tick();
    expect(thrownOf(w, 'p1')).toBeUndefined();
  });

  it('接缝只认对局侧实体：信号源不是挂着 hp 的一侧 → 不产 intent', () => {
    const w = table(INTENT_TABLE);
    w.createEntity('ui'); // 路人实体（没有 hp Resource）也发同名信号
    arm(w, 'ui', 'throw.rock', 'ui_rock');
    setFlag(w, 'ui_rock', true);
    w.tick();
    expect(thrownOf(w, 'ui')).toBeUndefined();
  });

  it('⑤ 落盘门：手不在 throws 内 / 信号名空 / 同名两义 → 报错拒收', () => {
    const check = (intentSignals: unknown): string => checkDuelMatrix({
      type: 'DuelMatrix', hpResource: 'hp', throws: ['rock', 'paper'],
      beats: { rock: [], paper: ['rock'] },
      payoff: { rock: { damage: 1 }, paper: { damage: 1 } }, tie: { selfDamage: 0 },
      intentSignals,
    } as unknown as DuelMatrix).join();
    expect(check({ lizard: 'throw.lizard' })).toMatch(/intentSignals 有多余条目 "lizard"/);
    expect(check({ rock: '' })).toMatch(/信号名未填/);
    expect(check({ rock: 'throw.x', paper: 'throw.x' })).toMatch(/同时映射到/);
    expect(check(['throw.rock'])).toMatch(/不是「手 → 信号名」的对象/);
    expect(check({ rock: 'throw.rock', paper: 'throw.paper' })).toBe(''); // 合法写法零误报
  });

  it('接缝系统的契约：Commit 相位 · 诚实 reads·writes · 排在播报之后', () => {
    const seam = matrixDuelCapability.systems.find((s) => s.id === 'matrix-duel-intent')!;
    expect(seam.phase).toBe(SystemPhase.Commit); // 放 Update 会与 event-when 合围成环（下条实测）
    expect(seam.reads).toEqual(['DuelMatrix', 'Signal', 'Flag', 'Resource']); // P1a：hasComponent(side,'Resource') 判对局侧 = 读
    expect(seam.writes).toEqual(['DuelIntent']);
    expect(seam.runsAfter).toEqual(['matrix-duel-announce']); // 播报的胜负信号不得被当成出招输入
  });

  it('定序：加了读 Signal 的接缝系统后仍不成环（文件头那个环的回归守卫）', () => {
    const systems = [...matrixDuelCapability.systems, ...resourceCapability.systems,
      ...eventWhenCapability.systems, ...effectApplyCapability.systems];
    expect(() => topologicalSort(systems)).not.toThrow();
  });
});

// ── ⑨ 结算副作用 clearOnSettle / lastThrowVar（REQ-108-ENG-03·owner 判 A1）─────────────
// 为什么归本件而非扩 effect-apply：本件是唯一同时知道「谁出了什么」的地方；且 Effect.targetId 全局寻址
// 分不清两侧（出招信号两侧共用一个名靠 Signal.source 认侧），Effect.kind 十项也没有「写字符串」。
describe('matrix-duel — 结算副作用（REQ-108-ENG-03）', () => {
  const SIDE_TABLE = (extra: Record<string, unknown>): Omit<DuelMatrix, 'type'> => ({
    hpResource: 'hp',
    throws: ['rock', 'paper', 'scissors'],
    beats: { rock: ['scissors'], paper: ['rock'], scissors: ['paper'] },
    payoff: { rock: { damage: 1 }, paper: { damage: 1 }, scissors: { damage: 1 } },
    tie: { selfDamage: 0 },
    ...extra,
  } as Omit<DuelMatrix, 'type'>);

  /** 建六条 <侧>.charge.<手> 槽（game108 真实形态：一实体一组件 → 槽各居一实体）。 */
  function withSlots(w: World, init: Record<string, number>): void {
    for (const side of ['p1', 'p2']) {
      for (const h of ['rock', 'paper', 'scissors']) {
        const id = `${side}.charge.${h}`;
        const e = `slot:${side}:${h}`;
        w.createEntity(e);
        w.addComponent(e, { type: 'Resource', id, current: init[id] ?? 0, min: 0, max: 3 } as Resource);
      }
    }
  }
  const slotOf = (w: World, side: string, h: string): number =>
    w.getComponent<Resource>(`slot:${side}:${h}`, 'Resource')!.current;

  it('① 清零按侧：各清各出过的那只手，**另外两只不动**——且与结算**同拍**生效（根因① C·op:set 载体）', () => {
    const w = table(SIDE_TABLE({ clearOnSettle: 'charge' }));
    withSlots(w, { 'p1.charge.rock': 3, 'p1.charge.paper': 2, 'p2.charge.scissors': 3, 'p2.charge.rock': 1 });
    duel(w, 'rock', 'scissors'); // p1 出石胜 / p2 出剪负（duel 内含唯一一次 tick）
    // 旧实现清零在 Commit 读当前值发 -current、下一拍才落地；现随结算拍 op:'set' 原子生效——
    // 「这手已用掉」与扣血同拍，少一拍中间态（那一拍里蓄力显示还是旧值）。
    expect(slotOf(w, 'p1', 'rock')).toBe(0);        // 出过 → 清（结算同拍）
    expect(slotOf(w, 'p2', 'scissors')).toBe(0);    // 出过 → 清（败方也清）
    expect(slotOf(w, 'p1', 'paper')).toBe(2);       // 没出 → 原样（诈唬机制的支点）
    expect(slotOf(w, 'p2', 'rock')).toBe(1);        // 没出 → 原样
  });

  it('② 平局也清（胜/负/平三态一致）', () => {
    const w = table(SIDE_TABLE({ clearOnSettle: 'charge' }));
    withSlots(w, { 'p1.charge.rock': 3, 'p2.charge.rock': 2, 'p1.charge.paper': 3 });
    duel(w, 'rock', 'rock');
    expect(slotOf(w, 'p1', 'rock')).toBe(0);
    expect(slotOf(w, 'p2', 'rock')).toBe(0);
    expect(slotOf(w, 'p1', 'paper')).toBe(3); // 没出的仍不动
  });

  it('③ lastThrowVar 按侧写对本回合的手', () => {
    const w = table(SIDE_TABLE({ lastThrowVar: 'lastThrow' }));
    for (const side of ['p1', 'p2']) {
      const e = `var:${side}`;
      w.createEntity(e);
      w.addComponent(e, { type: 'StringVar', id: `${side}.lastThrow`, value: '' } as unknown as StringVar);
    }
    duel(w, 'paper', 'scissors');
    w.tick(); // StringSet 由下一拍 string-apply 落地
    const read = (side: string): string =>
      (w.getComponent(`var:${side}`, 'StringVar') as unknown as { value: string }).value;
    expect(read('p1')).toBe('paper');
    expect(read('p2')).toBe('scissors');
  });

  it('④ 两字段都不填 → 槽与变量都不动（零回归）', () => {
    const w = table(SIDE_TABLE({}));
    withSlots(w, { 'p1.charge.rock': 3 });
    duel(w, 'rock', 'scissors');
    w.tick();
    expect(slotOf(w, 'p1', 'rock')).toBe(3);
  });

  it('⑤ 落盘门：空相对名 / 撞 hpResource 一律拒收', () => {
    const bad = (extra: Record<string, unknown>): string =>
      checkDuelMatrix({ type: 'DuelMatrix', ...SIDE_TABLE(extra) } as DuelMatrix).join();
    expect(bad({ clearOnSettle: '' })).toMatch(/clearOnSettle 要填非空/);
    expect(bad({ lastThrowVar: '' })).toMatch(/lastThrowVar 要填非空/);
    expect(bad({ clearOnSettle: 'hp' })).toMatch(/clearOnSettle 不能是血量资源/);
    expect(bad({ lastThrowVar: 'hp' })).toMatch(/lastThrowVar 不能是血量资源/);
    expect(bad({ clearOnSettle: 'charge', lastThrowVar: 'lastThrow' })).toBe(''); // 正常表零 issue
  });
});

// ── 日志基准守则试点（owner 2026-08-06 判 A·matrix-duel 当标尺）────────────────
// 验的不是"有没有 log"，是守则的两条硬指标：① 关时零污染 ② **只读 trace 能重建因果**。
describe('matrix-duel — DebugTrace 试点（日志基准守则）', () => {
  const traced = (w: World, tick = 0): DebugTrace => {
    w.createEntity('dbg');
    w.addComponent('dbg', { type: 'DebugTrace', events: [], tick } as DebugTrace);
    return w.getComponent<DebugTrace>('dbg', 'DebugTrace')!;
  };

  it('① 默认不开：不挂 DebugTrace 时行为逐位不变（零污染）', () => {
    const a = table(BASE_MATRIX()); const ra = duel(a, 'rock', 'scissors');
    const b = table(BASE_MATRIX()); traced(b); const rb = duel(b, 'rock', 'scissors');
    expect(rb).toEqual(ra); // 开不开 trace，结算结果一模一样
  });

  it('② 密度：一次结算正常路径 ≤ 3 条，且四类只出现该出现的', () => {
    const w = table(BASE_MATRIX());
    const t = traced(w, 7);
    duel(w, 'rock', 'scissors');
    expect(t.events.length).toBeLessThanOrEqual(3);           // 守则：每 system 每 tick ≤ 3 条
    expect(t.events.map((e) => e.kind)).toEqual(['decision', 'commit']); // 正常路径无 reject
    expect(t.events.every((e) => e.tick === 7)).toBe(true);   // 拍号来自宿主，非墙钟
    expect(t.events.every((e) => e.system === 'matrix-duel')).toBe(true);
  });

  it('③ **验收判据**：只读 trace 就能重建「为什么 p2 掉了 6 血」', () => {
    const w = table(BASE_MATRIX());
    const t = traced(w);
    duel(w, 'rock', 'scissors'); // 石克剪 → p2 -6
    const log = formatTrace(t);
    expect(log).toContain('判定 a');                 // 谁赢
    expect(log).toContain('p1:rock vs p2:scissors'); // 依据什么赢
    expect(log).toContain('p2-6');                   // 落到谁身上、多少
    expect(log).toContain('hp');                     // 改的哪个资源
  });

  it('④ **reject 类真的记下了「什么都没发生」**（守则第 3 类的要害）', () => {
    const w = table(BASE_MATRIX());
    const t = traced(w);
    intend(w, 'p1', 'rock');   // 只挂一侧 → 等齐、本拍不结算
    w.tick();
    expect(t.events).toHaveLength(1);
    expect(t.events[0].kind).toBe('reject');
    expect(t.events[0].what).toContain('未齐（1/2）');
  });

  it('⑤ 缩放取不到 → reject 一条（正是本能力吃过两次亏的形态）', () => {
    const w = table({
      hpResource: 'hp', throws: ['rock', 'paper'], beats: { rock: [], paper: ['rock'] },
      payoff: { rock: { damage: 1 }, paper: { damage: { base: 3, scaleByResource: '没这条槽', step: 9 } } },
      tie: { selfDamage: 0 },
    });
    const t = traced(w);
    duel(w, 'rock', 'paper');
    const rej = t.events.filter((e) => e.kind === 'reject');
    expect(rej).toHaveLength(1);
    expect(rej[0].what).toContain('退化 base=3');
  });
});

// 代发 source 打错字的落点（主程 2026-08-07 裁 ENG-04：代发侧不校验实体存在·消费侧必须留痕）
describe('matrix-duel — 接缝对悬空 source 留痕（ENG-04/05 裁决的配套）', () => {
  it('信号 source 不是对局侧 → 不产 intent，且 trace 里有一条 reject', () => {
    const w = table({
      hpResource: 'hp', throws: ['rock', 'paper'], beats: { rock: [], paper: ['rock'] },
      payoff: { rock: { damage: 5 }, paper: { damage: 5 } }, tie: { selfDamage: 0 },
      intentSignals: { rock: 'throw.rock' },
    });
    w.createEntity('dbg');
    w.addComponent('dbg', { type: 'DebugTrace', events: [] } as DebugTrace);
    // 代发到一个打错字的实体（"p11" 不存在）——keybind/event-when 侧刻意不拦这种
    w.createEntity('kb');
    w.addComponent('kb', { type: 'EventWhen', signal: 'throw.rock', when: { kind: 'flag', id: 'go' }, mode: 'edge', armed: false, source: 'p11' } as unknown as EventWhen);
    w.createEntity('flag:go');
    w.addComponent('flag:go', { type: 'Flag', id: 'go', active: true } as Flag);
    w.tick();
    expect(w.hasComponent('p11', 'DuelIntent')).toBe(false);
    const t = w.getComponent<DebugTrace>('dbg', 'DebugTrace')!;
    const rej = t.events.filter((e) => e.kind === 'reject' && e.what.includes('p11'));
    expect(rej).toHaveLength(1);                       // 「点了没反应」现在查得出来
    expect(rej[0].what).toContain('不是对局侧');
  });
});

// ── REQ-108-ENG-07：结算门开了之后 DuelIntent 的生命周期（owner 2026-08-07 判 A）────────
// 来源：主程复查 ENG-04/05/06 第③步的三个探针。ENG-06 制造了「intent 可长期不结算」的窗口，
// 而结算是 DuelIntent 唯一的清理点 → 门关着时没人清 → 滞留到下一回合用旧的手结算（零报错）。
describe('matrix-duel — 结算门下的 intent 生命周期（REQ-108-ENG-07）', () => {
  const gated = (): World => {
    const w = table({
      hpResource: 'hp', throws: ['rock', 'paper'], beats: { rock: [], paper: ['rock'] },
      payoff: { rock: { damage: 5 }, paper: { damage: 7 } }, tie: { selfDamage: 0 },
      settleWhenFlag: 'reveal',
    });
    w.createEntity('flag:reveal');
    w.addComponent('flag:reveal', { type: 'Flag', id: 'reveal', active: true } as Flag);
    return w;
  };
  const gate = (w: World, on: boolean): void => { w.getComponent<Flag>('flag:reveal', 'Flag')!.active = on; };

  // 【验收核心】原缺陷：p2 本回合没出手，却被上一回合滞留的 intent 结算，p1 血 20→13。
  it('滞留 intent 不再带进下一回合（原缺陷：p2 没出手却打出 7 点）', () => {
    const w = gated();
    intend(w, 'p1', 'rock'); intend(w, 'p2', 'paper');
    w.tick();                       // 门开 → 两侧 armed
    gate(w, false);                 // 揭晓窗口过去
    w.addComponent('p1', { type: 'DuelIntent', throw: 'rock' } as DuelIntent); // p1 改主意 → armed 掉
    w.tick(); w.tick();             // 本回合就这么过去了
    expect(w.hasComponent('p2', 'DuelIntent')).toBe(false); // p2 那份已 armed 的被回收
    gate(w, true);                  // 下一回合门开：p2 这回合根本没出手
    w.tick(); w.tick();
    expect(hp(w, 'p1')).toBe(20);   // 原缺陷这里是 13
    expect(hp(w, 'p2')).toBe(20);
  });

  it('只回收 armed 的：门关着提交的 intent 是正常态，不许动', () => {
    const w = gated();
    gate(w, false);                 // 门关着（T2 出招时区）
    intend(w, 'p1', 'rock'); intend(w, 'p2', 'paper');
    w.tick(); w.tick();
    expect(w.hasComponent('p1', 'DuelIntent')).toBe(true);  // 正等门开，不该被回收
    expect(w.hasComponent('p2', 'DuelIntent')).toBe(true);
    gate(w, true);                  // 揭晓
    w.tick(); w.tick();
    expect(hp(w, 'p1')).toBe(20 - 7); // paper 胜 rock → 正常结算
  });

  it('不设 settleWhenFlag → 回收逻辑整段不跑（零回归）', () => {
    const w = table(BASE_MATRIX());
    const r = duel(w, 'rock', 'scissors');
    expect(r.p2).toBe(14);
    expect(w.hasComponent('p1', 'DuelIntent')).toBe(false); // 结算照常清
  });

  it('回收留痕：trace 里有一条 reject（守则第 3 类）', () => {
    const w = gated();
    w.createEntity('dbg');
    w.addComponent('dbg', { type: 'DebugTrace', events: [] } as DebugTrace);
    intend(w, 'p1', 'rock'); intend(w, 'p2', 'paper');
    w.tick();
    gate(w, false);
    w.addComponent('p1', { type: 'DuelIntent', throw: 'rock' } as DuelIntent);
    w.tick();
    const t = w.getComponent<DebugTrace>('dbg', 'DebugTrace')!;
    const rej = t.events.filter((e) => e.kind === 'reject' && e.what.includes('回收过期 intent'));
    expect(rej).toHaveLength(1);
    expect(rej[0].what).toContain('p2');
  });
});
