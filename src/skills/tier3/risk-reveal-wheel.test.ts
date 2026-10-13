/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import { topologicalSort } from '@engine/core/topological-sort.js';
import { SystemPhase } from '@engine/core/types.js';
import type {
  DebugTrace, RandomSeed, RiskRevealAction, RiskRevealInput,
  RiskRevealReceipt, RiskRevealWheel,
} from '@engine/protocol/components.js';
import { riskRevealQtePenaltyBp, riskRevealWheelCapability, validateRiskRevealConfig } from './risk-reveal-wheel.js';

const system = riskRevealWheelCapability.systems[0]!;

function config(overrides: Partial<RiskRevealWheel> = {}): RiskRevealWheel {
  return {
    type: 'RiskRevealWheel', id: 'run', slotCount: 8, ringSizes: [2, 6],
    targets: [{ id: 'a' }, { id: 'b' }], blackSlotCount: 2,
    riskRateBpPerSecond: 60, ticksPerSecond: 60, riskLimitBp: 10_000,
    qteCycleTicks: 10, qteIdealTick: 5, qtePerfectRadiusTicks: 1, qteMaxPenaltyBp: 1_000,
    ...overrides,
  };
}

function make(session = config(), seed: number | null = 7, trace = false): World {
  const world = new World({ strict: true });
  world.addSystem(system);
  world.createEntity('session'); world.addComponent('session', session);
  if (seed !== null) { world.createEntity('rng'); world.addComponent('rng', { type: 'RandomSeed', seed, sequence: 0 } as RandomSeed); }
  if (trace) { world.createEntity('trace'); world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 0 } as DebugTrace); }
  return world;
}

function command(world: World, seq: number, action: RiskRevealAction | string, slot?: number): void {
  const id = `command:${seq}:${world.getVersion()}`;
  world.createEntity(id);
  world.addComponent(id, { type: 'RiskRevealInput', sessionId: 'run', action, seq, ...(slot === undefined ? {} : { slot }) } as RiskRevealInput);
}
function state(world: World): RiskRevealWheel { return world.getComponent<RiskRevealWheel>('session', 'RiskRevealWheel')!; }
function receipt(world: World): RiskRevealReceipt | undefined { return world.getComponent<RiskRevealReceipt>('session', 'RiskRevealReceipt'); }
function start(world: World): void { command(world, 0, 'start'); world.tick(); }
function perfect(world: World, seq = 1): void { state(world).qteTick = state(world).qteIdealTick; command(world, seq, 'qte-press'); world.tick(); }

describe('t3-risk-reveal-wheel · 协议与公式', () => {
  it('注册三组件、Commit 定序且单能力图无告警', () => {
    expect(riskRevealWheelCapability.id).toBe('t3-risk-reveal-wheel');
    expect(Object.keys(riskRevealWheelCapability.components.provides)).toEqual(['RiskRevealWheel', 'RiskRevealInput', 'RiskRevealReceipt']);
    expect(system.phase).toBe(SystemPhase.Commit);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => topologicalSort([system])).not.toThrow();
    expect(warn).not.toHaveBeenCalled(); warn.mockRestore();
  });

  it('拒绝环总和、容量和 QTE 区间非法配置', () => {
    expect(validateRiskRevealConfig(config())).toBeUndefined();
    expect(validateRiskRevealConfig(config({ ringSizes: [3, 6] }))).toContain('ringSizes');
    expect(validateRiskRevealConfig(config({ blackSlotCount: 7 }))).toContain('超过槽位');
    expect(validateRiskRevealConfig(config({ qtePerfectRadiusTicks: 9 }))).toContain('qtePerfectRadiusTicks');
    expect(validateRiskRevealConfig(config({ revealRule: 'free-loot' as never }))).toContain('revealRule');
    expect(validateRiskRevealConfig(config({ qtePressRule: 'teleport' as never }))).toContain('qtePressRule');
    expect(validateRiskRevealConfig(config({ qtePressPauseTicks: 11 }))).toContain('qtePressPauseTicks');
  });

  it('完美半径为零惩罚，离理想点越远惩罚单调且端点达上限', () => {
    const s = config();
    expect(riskRevealQtePenaltyBp(s, 5)).toBe(0);
    expect(riskRevealQtePenaltyBp(s, 6)).toBe(0);
    expect(riskRevealQtePenaltyBp(s, 7)).toBeLessThan(riskRevealQtePenaltyBp(s, 8));
    expect(riskRevealQtePenaltyBp(s, 0)).toBe(1_000);
  });

  it('最大惩罚为 0 时仍以几何精准区判 perfect，不把窗外按压误记为完美', () => {
    const world = make(config({ qtePerfectRadiusTicks: 0, qteMaxPenaltyBp: 0 }));
    start(world);
    state(world).qteTick = 0;
    command(world, 1, 'qte-press');
    world.tick();
    expect(state(world)).toMatchObject({ perfectQtes: 0, lastQtePenaltyBp: 0, lastQteOffsetTicks: 5 });
  });
});

describe('t3-risk-reveal-wheel · 布局 / 确定性 / 快照', () => {
  it('同 seed 同布局，不同 seed 形成不同布局，且黑位必空、目标恰放一次', () => {
    const run = (seed: number) => { const w = make(config(), seed); start(w); return state(w); };
    const a = run(41); const b = run(41); const c = run(42);
    expect(a.blackSlots).toEqual(b.blackSlots); expect(a.slotTargetIds).toEqual(b.slotTargetIds);
    expect({ black: a.blackSlots, slots: a.slotTargetIds }).not.toEqual({ black: c.blackSlots, slots: c.slotTargetIds });
    expect(a.blackSlots).toHaveLength(2);
    expect(a.blackSlots!.every((slot) => a.slotTargetIds![slot] === null)).toBe(true);
    expect(a.slotTargetIds!.filter(Boolean).sort()).toEqual(['a', 'b']);
  });

  it('快照恢复后继续同一组输入保持逐字段同轨', () => {
    const live = make(config(), 88); start(live); perfect(live);
    const snap = live.snapshot(); const order = live.getAllEntities();
    const restored = make(config(), null); restored.restore(snap, order);
    const slot = state(live).slotTargetIds!.findIndex((id) => id === 'a');
    command(live, 2, 'reveal', slot); command(restored, 2, 'reveal', slot);
    live.tick(); restored.tick();
    expect(state(restored)).toEqual(state(live));
    expect(receipt(restored)).toEqual(receipt(live));
    expect(restored.getComponent<RandomSeed>('rng', 'RandomSeed')).toEqual(live.getComponent<RandomSeed>('rng', 'RandomSeed'));
  });

  it('缺 RandomSeed 在 start 时 fail-closed 为 aborted', () => {
    const world = make(config(), null); start(world);
    expect(receipt(world)?.status).toBe('aborted');
  });
});

describe('t3-risk-reveal-wheel · QTE / 风险 / 翻格', () => {
  it('完美 QTE 风险 +0 并授予一次翻格权，偏移 QTE 增加连续惩罚', () => {
    const exact = make(); start(exact); const before = state(exact).riskBp!; perfect(exact);
    expect(state(exact)).toMatchObject({ phase: 'reveal', revealCredits: 1, lastQtePenaltyBp: 0, perfectQtes: 1 });
    expect(state(exact).riskBp).toBe(before + 1);

    const offset = make(); start(offset); state(offset).qteTick = 8; command(offset, 1, 'qte-press'); offset.tick();
    expect(state(offset).lastQtePenaltyBp).toBeGreaterThan(0);
    expect(state(offset).phase).toBe('reveal');
  });

  it('超时取最大惩罚，但未暴露时仍授予翻格权', () => {
    const world = make(config({ qteCycleTicks: 4, qteIdealTick: 2, qtePerfectRadiusTicks: 0, qteMaxPenaltyBp: 700 }));
    start(world); while (state(world).phase === 'qte') world.tick();
    expect(state(world)).toMatchObject({ phase: 'reveal', revealCredits: 1, lastQtePenaltyBp: 700, qteAttempts: 1 });
  });

  it('可选无惩罚超时只复位指针，不把未点击记作失误或发放翻格权', () => {
    const world = make(config({ revealRule: 'bank-perfect-during-qte', qteCycleTicks: 4, qteIdealTick: 0, qtePerfectRadiusTicks: 0, qteTimeoutRule: 'reset-no-penalty' }));
    start(world); while (state(world).qteTick !== 0 || state(world).elapsedTicks! < 5) world.tick();
    expect(state(world)).toMatchObject({ phase: 'qte', qteTick: 0, qteAttempts: 0, revealCredits: 0 });
    expect(state(world).riskBp).toBeGreaterThan(0);
  });

  it('持续 QTE 模式只让黄区命中累积开门权，失误与超时都不中断轮盘', () => {
    const hit = make(config({ revealRule: 'bank-perfect-during-qte' })); start(hit); perfect(hit);
    expect(state(hit)).toMatchObject({ phase: 'qte', revealCredits: 1, perfectQtes: 1, lastQtePenaltyBp: 0 });

    const miss = make(config({ revealRule: 'bank-perfect-during-qte' })); start(miss);
    state(miss).qteTick = 8; command(miss, 1, 'qte-press'); miss.tick();
    expect(state(miss)).toMatchObject({ phase: 'qte', revealCredits: 0, perfectQtes: 0 });
    expect(state(miss).lastQtePenaltyBp).toBeGreaterThan(0);

    const timeout = make(config({ revealRule: 'bank-perfect-during-qte', qteCycleTicks: 4, qteIdealTick: 2, qtePerfectRadiusTicks: 0, qteMaxPenaltyBp: 700 }));
    start(timeout); while (state(timeout).qteAttempts === 0) timeout.tick();
    expect(state(timeout)).toMatchObject({ phase: 'qte', revealCredits: 0, lastQtePenaltyBp: 700 });
  });

  it('可选连续按压规则保留指针所在相位，默认规则仍回到周期起点', () => {
    const continuing = make(config({ revealRule: 'bank-perfect-during-qte', qtePressRule: 'continue-from-press' }));
    start(continuing); state(continuing).qteTick = 6; command(continuing, 1, 'qte-press'); continuing.tick();
    // 结算后同一固定 tick 的自然推进只加 1；没有回到 0 再起跑。
    expect(state(continuing).qteTick).toBe(7);

    const resetting = make(config({ revealRule: 'bank-perfect-during-qte' }));
    start(resetting); state(resetting).qteTick = 6; command(resetting, 1, 'qte-press'); resetting.tick();
    expect(state(resetting).qteTick).toBe(1);
  });

  it('QTE 按下可暂停确定性刻度而不暂停被动风险，暂停中的重复按压被拒收', () => {
    const world = make(config({
      revealRule: 'bank-perfect-during-qte', qtePressRule: 'continue-from-press', qtePressPauseTicks: 3,
    }));
    start(world);
    state(world).qteTick = state(world).qteIdealTick;
    command(world, 1, 'qte-press'); world.tick();
    expect(state(world)).toMatchObject({ qteTick: 5, qtePauseTicks: 2, riskBp: 1, qteAttempts: 1 });

    command(world, 2, 'qte-press'); world.tick();
    expect(state(world)).toMatchObject({ qteTick: 5, qtePauseTicks: 1, riskBp: 2, qteAttempts: 1 });

    world.tick();
    expect(state(world)).toMatchObject({ qteTick: 5, qtePauseTicks: 0, riskBp: 3 });
    world.tick();
    expect(state(world)).toMatchObject({ qteTick: 6, qtePauseTicks: 0, riskBp: 4 });
  });

  it('可选的种子规则会在完美 QTE 后换到不同理想刻度，并且同 seed 可重演', () => {
    const run = () => {
      const world = make(config({ revealRule: 'bank-perfect-during-qte', qteTargetRule: 'reshuffle-on-perfect', qteIdealTick: 0 }), 91);
      start(world); perfect(world); return state(world);
    };
    const a = run(); const b = run();
    expect(a.qteIdealTick).not.toBe(0);
    expect(a.qteIdealTick).toBe(b.qteIdealTick);
    expect(a.revealCredits).toBe(1);
  });

  it('持续 QTE 模式可积累多份开门权，并可在轮盘继续转动时逐扇消费', () => {
    const world = make(config({ revealRule: 'bank-perfect-during-qte' })); start(world);
    perfect(world, 1); state(world).qteTick = state(world).qteIdealTick; command(world, 2, 'qte-press'); world.tick();
    expect(state(world)).toMatchObject({ phase: 'qte', revealCredits: 2 });
    const first = state(world).slotTargetIds!.findIndex((id, slot) => id === null && !state(world).blackSlots!.includes(slot));
    const second = state(world).slotTargetIds!.findIndex((id, slot) => id === null && !state(world).blackSlots!.includes(slot) && slot !== first);
    state(world).qteTick = 3;
    command(world, 3, 'reveal', first); world.tick();
    expect(state(world)).toMatchObject({ phase: 'qte', revealCredits: 1 });
    expect(state(world).qteTick).toBe(4);
    command(world, 4, 'reveal', second); world.tick();
    expect(state(world)).toMatchObject({ phase: 'qte', revealCredits: 0 });
    expect(state(world).revealedSlots).toEqual(expect.arrayContaining([first, second]));
  });

  it('被动风险先于同拍 withdraw，满值时必须 exposed', () => {
    const world = make(); start(world); state(world).riskBp = 9_999;
    command(world, 1, 'withdraw'); world.tick();
    expect(receipt(world)?.status).toBe('exposed');
  });

  it('封锁/越界翻格拒收且不消耗权；合法空格消费权并回到 QTE', () => {
    const world = make(); start(world); perfect(world);
    const black = state(world).blackSlots![0]!;
    command(world, 2, 'reveal', black); world.tick();
    expect(state(world)).toMatchObject({ phase: 'reveal', revealCredits: 1 });
    command(world, 3, 'reveal', 99); world.tick();
    expect(state(world).revealCredits).toBe(1);
    const empty = state(world).slotTargetIds!.findIndex((id, slot) => id === null && !state(world).blackSlots!.includes(slot));
    command(world, 4, 'reveal', empty); world.tick();
    expect(state(world)).toMatchObject({ phase: 'qte', revealCredits: 0 });
    expect(state(world).revealedSlots).toContain(empty);
  });

  it('翻到目标立即取得；取得全部目标 clear，暴露/撤退均保留所得', () => {
    const cleared = make(config({ targets: [{ id: 'a' }] })); start(cleared); perfect(cleared);
    const target = state(cleared).slotTargetIds!.findIndex((id) => id === 'a');
    command(cleared, 2, 'reveal', target); cleared.tick();
    expect(receipt(cleared)).toMatchObject({ status: 'cleared', acquiredIds: ['a'] });

    const withdrew = make(); start(withdrew); perfect(withdrew);
    const first = state(withdrew).slotTargetIds!.findIndex((id) => id === 'a');
    command(withdrew, 2, 'reveal', first); withdrew.tick(); command(withdrew, 3, 'withdraw'); withdrew.tick();
    expect(receipt(withdrew)).toMatchObject({ status: 'withdrew', acquiredIds: ['a'] });
  });

  it('终局不可变、坏动作被消费，trace 每 tick 最多三条且足以重建关键路径', () => {
    const world = make(config({ targets: [{ id: 'a' }] }), 7, true); start(world);
    world.getComponent<DebugTrace>('trace', 'DebugTrace')!.tick = 1; perfect(world);
    const target = state(world).slotTargetIds!.findIndex((id) => id === 'a');
    world.getComponent<DebugTrace>('trace', 'DebugTrace')!.tick = 2;
    command(world, 2, 'reveal', target); world.tick(); const done = structuredClone(receipt(world));
    world.getComponent<DebugTrace>('trace', 'DebugTrace')!.tick = 3;
    command(world, 3, 'reveal', target); world.tick(); expect(receipt(world)).toEqual(done);
    const trace = world.getComponent<DebugTrace>('trace', 'DebugTrace')!;
    const byTick = new Map<number, number>();
    trace.events.forEach((event) => byTick.set(event.tick, (byTick.get(event.tick) ?? 0) + 1));
    expect(Math.max(...byTick.values())).toBeLessThanOrEqual(3);
    expect(trace.events.some((event) => event.kind === 'decision' && event.what.includes('slot='))).toBe(true);
    expect(trace.events.some((event) => event.kind === 'transition' && event.what.includes('→terminal') && event.why === 'cleared')).toBe(true);
  });
});
