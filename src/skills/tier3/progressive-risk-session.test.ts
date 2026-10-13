/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import { topologicalSort } from '@engine/core/topological-sort.js';
import { SystemPhase } from '@engine/core/types.js';
import type {
  DebugTrace,
  Effect,
  Flag,
  ProgressiveRiskAction,
  ProgressiveRiskInput,
  ProgressiveRiskReceipt,
  ProgressiveRiskSession,
  RandomSeed,
} from '@engine/protocol/components.js';
import { progressiveChanceBp, progressiveRiskSessionCapability } from './progressive-risk-session.js';
import { effectApplyCapability } from '@skills/tier2/effect-apply.js';

const system = progressiveRiskSessionCapability.systems[0]!;

function session(overrides: Partial<ProgressiveRiskSession> = {}): ProgressiveRiskSession {
  return {
    type: 'ProgressiveRiskSession',
    id: 'run',
    targets: [{ id: 'a', initialChanceBp: 10_000 }, { id: 'b', initialChanceBp: 10_000 }],
    riskRateBpPerSecond: 60,
    ticksPerSecond: 60,
    riskLimitBp: 10_000,
    qteMissRiskBp: 1_000,
    qteCycleTicks: 10,
    qteWindowStartTick: 0,
    qteWindowEndTick: 4,
    qteDirection: 'contract',
    growthFactorBp: 1_500,
    maxRollChanceBp: 10_000,
    ...overrides,
  };
}

function make(config: ProgressiveRiskSession = session(), seed: number | null = 7, trace = false): World {
  const world = new World({ strict: true });
  world.addSystem(system);
  world.createEntity('session');
  world.addComponent('session', config);
  if (seed !== null) {
    world.createEntity('rng');
    world.addComponent('rng', { type: 'RandomSeed', seed, sequence: 0 } as RandomSeed);
  }
  if (trace) {
    world.createEntity('trace');
    world.addComponent('trace', { type: 'DebugTrace', events: [], tick: 0, max: 100 } as DebugTrace);
  }
  return world;
}

function command(world: World, seq: number, action: ProgressiveRiskAction | string): void {
  const occupied = new Set(world.getAllEntities());
  let suffix = 0;
  let id = `command:${seq}:${suffix}`;
  while (occupied.has(id)) id = `command:${seq}:${++suffix}`;
  world.createEntity(id);
  world.addComponent(id, { type: 'ProgressiveRiskInput', sessionId: 'run', action, seq } as ProgressiveRiskInput);
}

function state(world: World): ProgressiveRiskSession {
  return world.getComponent<ProgressiveRiskSession>('session', 'ProgressiveRiskSession')!;
}

function receipt(world: World): ProgressiveRiskReceipt | undefined {
  return world.getComponent<ProgressiveRiskReceipt>('session', 'ProgressiveRiskReceipt');
}

function start(world: World): void {
  command(world, 0, 'start');
  world.tick();
}

describe('t3-progressive-risk-session · 元数据 / 整数公式', () => {
  it('注册形状、声明面和单能力系统图无告警', () => {
    expect(progressiveRiskSessionCapability.id).toBe('t3-progressive-risk-session');
    expect(progressiveRiskSessionCapability.components.provides).toHaveProperty('ProgressiveRiskSession');
    expect(progressiveRiskSessionCapability.components.provides).toHaveProperty('ProgressiveRiskInput');
    expect(progressiveRiskSessionCapability.components.provides).toHaveProperty('ProgressiveRiskReceipt');
    expect(system.phase).toBe(SystemPhase.Commit);
    expect(system.runsBefore).toEqual(expect.arrayContaining(['effect-apply', 'craft-recipe', 'weighted-spawn', 'matrix-duel-intent', 'cooldown']));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => topologicalSort([system])).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('抽取未中次数按工单整数公式成长并钳上限', () => {
    expect(progressiveChanceBp(910, 0, 1_500, 9_500)).toBe(910);
    expect(progressiveChanceBp(910, 1, 1_500, 9_500)).toBe(1_046);
    expect(progressiveChanceBp(910, 2, 1_500, 9_500)).toBe(1_183);
    expect(progressiveChanceBp(9_000, 10, 10_000, 9_500)).toBe(9_500);
  });
});

describe('t3-progressive-risk-session · 确定性 / 快照', () => {
  it('同 seed + 同配置 + 同 tick 输入 → 逐字段同状态、同回执、同 RNG', () => {
    const run = (): ReturnType<World['snapshot']> => {
      const world = make(session({ targets: [{ id: 'a', initialChanceBp: 5_000 }] }), 123);
      start(world);
      command(world, 1, 'qte-press');
      world.tick();
      if (state(world).phase !== 'terminal') {
        command(world, 2, 'qte-press');
        world.tick();
      }
      command(world, 3, 'withdraw');
      world.tick();
      return world.snapshot();
    };
    expect(run()).toEqual(run());
  });

  it('快照恢复后下一拍与不中断运行同轨', () => {
    const uninterrupted = make(session({ targets: [{ id: 'a', initialChanceBp: 10_000 }] }), 88);
    start(uninterrupted);
    const snap = uninterrupted.snapshot();
    const order = uninterrupted.snapshotOrder();

    const restored = new World({ strict: true });
    restored.addSystem(system);
    restored.restore(snap, order);
    command(uninterrupted, 1, 'qte-press');
    command(restored, 1, 'qte-press');
    uninterrupted.tick();
    restored.tick();
    expect(restored.snapshot()).toEqual(uninterrupted.snapshot());
  });
});

describe('t3-progressive-risk-session · 风险 / 输入 / 随机边界', () => {
  it('无输入有限拍进入 exposed', () => {
    const world = make(session({ riskLimitBp: 3 }));
    start(world);
    world.tick();
    world.tick();
    world.tick();
    expect(receipt(world)?.status).toBe('exposed');
    expect(state(world).riskBp).toBe(3);
  });

  it('固定 tick 窗内原始按压由引擎判 hit', () => {
    const world = make(session({
      targets: [{ id: 'a', initialChanceBp: 10_000 }],
      qteCycleTicks: 6,
      qteWindowStartTick: 2,
      qteWindowEndTick: 3,
    }));
    start(world); // qteTick=1
    world.tick(); // qteTick=2
    command(world, 1, 'qte-press');
    world.tick();
    expect(receipt(world)?.status).toBe('cleared');
    expect(receipt(world)?.qteHits).toBe(1);
    expect(receipt(world)?.qteMisses).toBe(0);
  });

  it('窗外按压为 miss，同周期第二次按压 fail-closed', () => {
    const world = make(session({ qteCycleTicks: 6, qteWindowStartTick: 3, qteWindowEndTick: 4 }), 7, true);
    start(world); // qteTick=1，窗外
    command(world, 1, 'qte-press');
    world.tick();
    command(world, 2, 'qte-press');
    world.tick();
    expect(state(world).qteAttempts).toBe(1);
    expect(state(world).qteMisses).toBe(1);
    expect(world.getComponent<RandomSeed>('rng', 'RandomSeed')!.sequence).toBe(0);
    const events = world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events;
    expect(events.some((event) => event.kind === 'reject' && event.why === '本周期已结算')).toBe(true);
  });

  it('周期末未按压自动 timeout miss，且不消费 RNG', () => {
    const world = make(session({ qteCycleTicks: 3, qteWindowStartTick: 1, qteWindowEndTick: 1 }), 7, true);
    start(world); // qteTick=1
    world.tick(); // qteTick=2
    world.tick(); // 周期末 timeout → reset
    expect(state(world).qteAttempts).toBe(1);
    expect(state(world).qteMisses).toBe(1);
    expect(state(world).riskBp).toBeGreaterThanOrEqual(1_000);
    expect(world.getComponent<RandomSeed>('rng', 'RandomSeed')!.sequence).toBe(0);
    const events = world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events;
    expect(events.some((event) => event.kind === 'decision' && event.what.includes('qte=timeout'))).toBe(true);
  });

  it('QTE 错按不消费 RNG；窗口命中后的 loot roll 才消费', () => {
    const world = make(session({
      targets: [{ id: 'a', initialChanceBp: 0 }],
      qteCycleTicks: 4,
      qteWindowStartTick: 2,
      qteWindowEndTick: 2,
    }), 99);
    start(world);
    command(world, 1, 'qte-press'); // start 后游标=1，窗外
    world.tick();
    expect(world.getComponent<RandomSeed>('rng', 'RandomSeed')!.sequence).toBe(0);
    world.tick(); // 已结算周期推进到末端
    world.tick(); // 新周期 tick=0
    world.tick(); // tick=1
    world.tick(); // tick=2
    command(world, 2, 'qte-press');
    world.tick();
    expect(world.getComponent<RandomSeed>('rng', 'RandomSeed')!.sequence).toBe(1);
    expect(state(world).failedRollsByTarget).toEqual([1]);
  });

  it('两目标严格按数组序；首件成功后风险不清零', () => {
    const world = make();
    start(world);
    command(world, 1, 'qte-press');
    world.tick();
    expect(state(world).phase).toBe('awaiting-continue');
    expect(state(world).acquiredIds).toEqual(['a']);
    const afterFirst = state(world).riskBp!;

    command(world, 2, 'continue');
    world.tick();
    expect(state(world).targetIndex).toBe(1);
    expect(state(world).riskBp).toBeGreaterThan(afterFirst);
    command(world, 3, 'qte-press');
    world.tick();
    expect(receipt(world)?.status).toBe('cleared');
    expect(receipt(world)?.acquiredIds).toEqual(['a', 'b']);
  });

  it('Commit 相位具名 Signal 可被 effect-apply 同拍消费', () => {
    const world = make(session({ targets: [{ id: 'a', initialChanceBp: 10_000 }] }));
    world.addSystem(effectApplyCapability.systems[0]!);
    world.createEntity('done-flag');
    world.addComponent('done-flag', { type: 'Flag', id: 'done', active: false } as Flag);
    world.createEntity('done-effect');
    world.addComponent('done-effect', { type: 'Effect', onSignal: 'progressive-risk:terminal', kind: 'set-flag', targetId: 'done', value: true } as Effect);
    start(world);
    command(world, 1, 'qte-press');
    world.tick();
    expect(world.getComponent<Flag>('done-flag', 'Flag')!.active).toBe(true);
  });

  it('同拍风险满优先于 withdraw，已取得目标仍保留于 exposed 回执', () => {
    const world = make(session({ riskLimitBp: 2 }));
    start(world);
    command(world, 1, 'qte-press');
    world.tick(); // risk=1，取得 a，进入 awaiting-continue
    command(world, 2, 'withdraw');
    world.tick(); // 被动风险先到 2 → exposed；withdraw 随后拒收
    expect(receipt(world)?.status).toBe('exposed');
    expect(receipt(world)?.acquiredIds).toEqual(['a']);
  });

  it('无 RandomSeed fail-closed：命中 QTE 也不发奖、不记 loot roll/失败成长', () => {
    const world = make(session({ targets: [{ id: 'a', initialChanceBp: 10_000 }] }), null, true);
    start(world);
    command(world, 1, 'qte-press');
    world.tick();
    expect(state(world).phase).toBe('active');
    expect(state(world).acquiredIds).toEqual([]);
    expect(state(world).lootRolls).toBe(0);
    expect(state(world).failedRollsByTarget).toEqual([0]);
    const events = world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events;
    expect(events.some((event) => event.kind === 'reject' && event.what.includes('loot-roll'))).toBe(true);
  });

  it('非法 select/skip、倒序 seq、终局后输入全部 fail-closed 并留 reject trace', () => {
    const world = make(undefined, 7, true);
    start(world);
    command(world, 1, 'select');
    world.tick();
    command(world, 0, 'skip');
    world.tick();
    command(world, 2, 'withdraw');
    world.tick();
    command(world, 3, 'qte-press');
    world.tick();
    const rejects = world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events.filter((event) => event.kind === 'reject');
    expect(rejects.some((event) => event.what.includes('select'))).toBe(true);
    expect(rejects.some((event) => event.what.includes('seq=0'))).toBe(true);
    expect(rejects.some((event) => event.why === '会话已终局')).toBe(true);
    expect(receipt(world)?.status).toBe('withdrew');
  });

  it('trace 正常路径每 tick 不超过三条；取得和终局均可由 commit 重建', () => {
    const world = make(session({ targets: [{ id: 'a', initialChanceBp: 10_000 }] }), 7, true);
    start(world);
    const trace = world.getComponent<DebugTrace>('trace', 'DebugTrace')!;
    trace.tick = 1;
    command(world, 1, 'qte-press');
    world.tick();
    const tick = trace.events.filter((event) => event.tick === 1);
    expect(tick.length).toBeLessThanOrEqual(3);
    expect(tick.some((event) => event.kind === 'commit' && event.what.includes('terminal=cleared'))).toBe(true);
    expect(receipt(world)?.acquiredIds).toEqual(['a']);
  });
});
