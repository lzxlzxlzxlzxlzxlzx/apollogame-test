import { describe, expect, it, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import { topologicalSort } from '@engine/core/topological-sort.js';
import { SystemPhase } from '@engine/core/types.js';
import type { DebugTrace, DiscreteCombinationInput, DiscreteCombinationReceipt, DiscreteCombinationSession, RandomSeed, Signal } from '@engine/protocol/components.js';
import { discreteCombinationSessionCapability } from './discrete-combination-session.js';
import { effectApplyCapability } from '@skills/tier2/effect-apply.js';
import { hashSnapshot } from '@net/determinism.js';

const system = discreteCombinationSessionCapability.systems[0]!;

function config(overrides: Partial<DiscreteCombinationSession> = {}): DiscreteCombinationSession {
  return { type: 'DiscreteCombinationSession', id: 'lock', slotCount: 3, valueCount: 3, initialValue: 1,
    setSignal: 'lock.set', giveUpSignal: 'lock.give-up', feedbackSignal: 'lock.feedback', successSignal: 'lock.success', failureSignal: 'lock.failure', ...overrides };
}

function make(seed = 7, trace = false, overrides: Partial<DiscreteCombinationSession> = {}): World {
  const world = new World({ strict: true });
  world.addSystem(system); world.createEntity('lock'); world.addComponent('lock', config(overrides));
  world.createEntity('rng'); world.addComponent('rng', { type: 'RandomSeed', seed, sequence: 0 } as RandomSeed);
  if (trace) { world.createEntity('trace'); world.addComponent('trace', { type: 'DebugTrace', events: [], max: 100 } as DebugTrace); }
  world.tick();
  return world;
}

function state(world: World): DiscreteCombinationSession { return world.getComponent<DiscreteCombinationSession>('lock', 'DiscreteCombinationSession')!; }
function command(world: World, id: string, input: Omit<DiscreteCombinationInput, 'type' | 'sessionId'>): void {
  world.createEntity(id); world.addComponent(id, { type: 'DiscreteCombinationInput', sessionId: 'lock', ...input } as DiscreteCombinationInput);
}
function output(world: World, name: string): Signal[] {
  return world.query('Signal').map(([id]) => world.getComponent<Signal>(id, 'Signal')!).filter((signal) => signal.name === name);
}

describe('t3-discrete-combination-session', () => {
  it('注册于 Commit、先于 Signal 消费者且无定序告警', () => {
    expect(system.phase).toBe(SystemPhase.Commit);
    expect(system.runsBefore).toContain('effect-apply');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => topologicalSort([system, effectApplyCapability.systems[0]!])).not.toThrow();
    expect(warn).not.toHaveBeenCalled(); warn.mockRestore();
  });

  it('constant 是默认回归：初始全为 initialValue、目标不同且同 seed 完全一致', () => {
    const a = make(11); const b = make(11);
    expect(state(a).status).toBe('playing');
    expect(state(a).current).toEqual([1, 1, 1]);
    expect(state(a).target).toEqual(state(b).target);
    expect(state(a).target!.every((value) => value === 1)).toBe(false);
  });

  it('random 初始与目标共用 RandomSeed：同 seed 一致、异 seed 有不同向量，且开局绝不终局', () => {
    const first = make(101, true, { initialStrategy: 'random' });
    const same = make(101, false, { initialStrategy: 'random' });
    const different = make(202, false, { initialStrategy: 'random' });
    const firstState = state(first);
    expect(firstState.current).toEqual(state(same).current);
    expect(firstState.target).toEqual(state(same).target);
    expect({ current: firstState.current, target: firstState.target }).not.toEqual({ current: state(different).current, target: state(different).target });
    expect(firstState.current).not.toEqual(firstState.target);
    expect(firstState.matchCount).toBe(firstState.current!.reduce((count, value, slot) => count + Number(value === firstState.target![slot]), 0));
    expect(firstState.matchCount).toBeLessThan(firstState.slotCount);
    expect(firstState.status).toBe('playing');
    expect(first.getComponent<DiscreteCombinationReceipt>('lock', 'DiscreteCombinationReceipt')).toBeUndefined();
    expect(first.getComponent<RandomSeed>('rng', 'RandomSeed')!.sequence).toBeGreaterThanOrEqual(6);
    expect(first.getComponent<DebugTrace>('trace', 'DebugTrace')!.events.some((event) => event.what.includes('initial=random'))).toBe(true);
  });

  it('合法 set 即时反馈；仅全精确匹配成功且终局输入被拒收', () => {
    const world = make(); const target = [...state(world).target!];
    for (let slot = 0; slot < target.length; slot++) { command(world, `set-${slot}`, { action: 'set', slot, value: target[slot]! }); world.tick(); }
    expect(state(world).status).toBe('success');
    expect(world.getComponent<DiscreteCombinationReceipt>('lock', 'DiscreteCombinationReceipt')).toEqual({ type: 'DiscreteCombinationReceipt', sessionId: 'lock', outcome: 'success' });
    expect(output(world, 'lock.success')).toHaveLength(1);
    command(world, 'after', { action: 'give-up' }); world.tick();
    expect(world.getComponent<DiscreteCombinationReceipt>('lock', 'DiscreteCombinationReceipt')!.outcome).toBe('success');
  });

  it('hard 1000 次错误提交仍 playing；非法输入不改状态', () => {
    const world = make(9); const before = structuredClone(state(world).current!); const target = state(world).target!;
    const slot = target.findIndex((value) => value !== 1); const wrong = target[slot] === 0 ? 2 : 0;
    for (let index = 0; index < 1000; index++) { command(world, `wrong-${index}`, { action: 'set', slot, value: wrong }); world.tick(); }
    command(world, 'bad', { action: 'set', slot: -1, value: 3 }); world.tick();
    expect(state(world).status).toBe('playing');
    expect(state(world).current![slot]).toBe(wrong);
    expect(state(world).current).not.toEqual(before);
    expect('attempts' in state(world)).toBe(false);
    expect('timer' in state(world)).toBe(false);
  });

  it('Signal 输入严格解析并使用配置的具名输出', () => {
    const world = make(); const target = [...state(world).target!];
    for (let slot = 0; slot < target.length; slot++) {
      const id = `signal-${slot}`; world.createEntity(id); world.addComponent(id, { type: 'Signal', name: 'lock.set', source: id, arg: `${slot}:${target[slot]}` } as Signal); world.tick();
    }
    expect(state(world).status).toBe('success'); expect(output(world, 'lock.feedback')).toHaveLength(1); expect(output(world, 'lock.success')).toHaveLength(1);
  });

  it('无 seed 或 Infinity 配置 fail-closed：不抛、不终局且不推进 RNG', () => {
    const world = new World({ strict: true }); world.addSystem(system); world.createEntity('bad');
    world.addComponent('bad', config({ id: 'bad', slotCount: Infinity as unknown as number }));
    expect(() => world.tick()).not.toThrow();
    expect(world.getComponent<DiscreteCombinationSession>('bad', 'DiscreteCombinationSession')!.status).toBe('ready');
    expect(world.getComponent<DiscreteCombinationReceipt>('bad', 'DiscreteCombinationReceipt')).toBeUndefined();
    const noSeed = new World({ strict: true }); noSeed.addSystem(system); noSeed.createEntity('lock'); noSeed.addComponent('lock', config());
    expect(() => noSeed.tick()).not.toThrow(); expect(state(noSeed).status).toBe('ready');
    noSeed.createEntity('rng'); noSeed.addComponent('rng', { type: 'RandomSeed', seed: 12, sequence: 0 } as RandomSeed); noSeed.tick();
    expect(state(noSeed).status).toBe('playing'); expect(state(noSeed).current).toEqual([1, 1, 1]);
    const badStrategy = new World({ strict: true }); badStrategy.addSystem(system); badStrategy.createEntity('lock'); badStrategy.createEntity('rng');
    badStrategy.addComponent('lock', config({ initialStrategy: 'shuffle' as never })); badStrategy.addComponent('rng', { type: 'RandomSeed', seed: 1, sequence: 0 } as RandomSeed);
    badStrategy.tick(); expect(state(badStrategy).status).toBe('ready');
  });

  it('同拍多次 set 直达终局时，trace 仍保留终局原因且最多三条', () => {
    const world = new World({ strict: true }); world.addSystem(system); world.createEntity('lock');
    world.addComponent('lock', config({ slotCount: 1 })); world.createEntity('rng'); world.addComponent('rng', { type: 'RandomSeed', seed: 5, sequence: 0 } as RandomSeed);
    world.createEntity('trace'); world.addComponent('trace', { type: 'DebugTrace', events: [], max: 100 } as DebugTrace); world.tick();
    const target = state(world).target![0]!; const wrong = target === 0 ? 1 : 0;
    command(world, 'a', { action: 'set', slot: 0, value: wrong }); command(world, 'b', { action: 'set', slot: 0, value: wrong }); command(world, 'c', { action: 'set', slot: 0, value: target }); world.tick();
    const events = world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events;
    expect(events.filter((event) => event.system === 'discrete-combination-session').slice(-3)).toHaveLength(3);
    expect(events.some((event) => event.what.includes('→success'))).toBe(true);
  });

  it('success 只终局一次：之后 set/give-up 不改回执、RNG，且 reject 留 trace', () => {
    const world = make(7, true); const target = [...state(world).target!];
    for (let slot = 0; slot < target.length; slot++) { command(world, `win-${slot}`, { action: 'set', slot, value: target[slot]! }); world.tick(); }
    const receipt = world.getComponent<DiscreteCombinationReceipt>('lock', 'DiscreteCombinationReceipt')!;
    const sequence = world.getComponent<RandomSeed>('rng', 'RandomSeed')!.sequence;
    command(world, 'late-set', { action: 'set', slot: 0, value: 0 }); command(world, 'late-give', { action: 'give-up' }); world.tick();
    expect(world.getComponent<DiscreteCombinationReceipt>('lock', 'DiscreteCombinationReceipt')).toBe(receipt);
    expect(receipt.outcome).toBe('success'); expect(world.getComponent<RandomSeed>('rng', 'RandomSeed')!.sequence).toBe(sequence);
    expect(world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events.some((event) => event.kind === 'reject')).toBe(true);
  });

  it('give-up 是唯一 failure 且 fire-once：之后 set/give-up 不改回执、RNG，且 reject 留 trace', () => {
    const world = make(7, true); command(world, 'give', { action: 'give-up' }); world.tick();
    const receipt = world.getComponent<DiscreteCombinationReceipt>('lock', 'DiscreteCombinationReceipt')!;
    const sequence = world.getComponent<RandomSeed>('rng', 'RandomSeed')!.sequence;
    command(world, 'late-set', { action: 'set', slot: 0, value: 0 }); command(world, 'late-give', { action: 'give-up' }); world.tick();
    expect(world.getComponent<DiscreteCombinationReceipt>('lock', 'DiscreteCombinationReceipt')).toBe(receipt);
    expect(receipt.outcome).toBe('failure'); expect(world.getComponent<RandomSeed>('rng', 'RandomSeed')!.sequence).toBe(sequence);
    expect(world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events.some((event) => event.kind === 'reject')).toBe(true);
  });

  it('一条具名 set Signal 只消费一次，不会跨 tick 重放反馈', () => {
    const world = make(); world.createEntity('one-signal');
    world.addComponent('one-signal', { type: 'Signal', name: 'lock.set', source: 'one-signal', arg: '0:0' } as Signal);
    world.tick(); expect(output(world, 'lock.feedback')).toHaveLength(1);
    world.tick(); expect(output(world, 'lock.feedback')).toHaveLength(0);
    expect(world.getComponent<Signal>('one-signal', 'Signal')).toBeUndefined();
  });

  it('random 初始快照恢复后下一个输入逐字段同轨，DebugTrace 不进入状态 hash', () => {
    const a = make(88, false, { initialStrategy: 'random' }); const snapshot = a.snapshot(); const order = a.snapshotOrder();
    const b = new World({ strict: true }); b.addSystem(system); b.restore(snapshot, order);
    expect(state(b).current).toEqual(state(a).current); expect(state(b).target).toEqual(state(a).target);
    command(a, 'next', { action: 'set', slot: 0, value: 0 }); command(b, 'next', { action: 'set', slot: 0, value: 0 }); a.tick(); b.tick();
    expect(b.snapshot()).toEqual(a.snapshot());
    const withoutTrace = make(88); const withTrace = make(88, true);
    expect(hashSnapshot(withoutTrace.snapshot())).toBe(hashSnapshot(withTrace.snapshot()));
  });
});
