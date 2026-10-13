import { describe, expect, it, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import { topologicalSort } from '@engine/core/topological-sort.js';
import { SystemPhase } from '@engine/core/types.js';
import type { DebugTrace, Effect, Flag, OrderedActionSession, Signal } from '@engine/protocol/components.js';
import { effectApplyCapability } from './effect-apply.js';
import { craftRecipeCapability } from './craft-recipe.js';
import { cooldownCapability } from './cooldown.js';
import { presentationTrackCapability } from './presentation-track.js';
import { discreteCombinationSessionCapability } from '@skills/tier3/discrete-combination-session.js';
import { parseManifest } from '../../assembly/manifest.js';
import { orderedActionSessionCapability, validateOrderedActionSession } from './ordered-action-session.js';
import { expectDeterministic, expectQuiescent, expectRestoreContinues } from '../../test-fixtures/test-kit.js';
import { hashSnapshot } from '@net/determinism.js';

const system = orderedActionSessionCapability.systems[0]!;
const acceptedActions = ['brew.add.moon', 'brew.add.silver', 'brew.add.berry', 'brew.add.pepper', 'brew.add.petals', 'brew.stir.clockwise', 'brew.stir.counterclockwise'];
const moonSteps = [
  { expectedAction: 'brew.add.moon', requiredCount: 1 },
  { expectedAction: 'brew.stir.clockwise', requiredCount: 2 },
  { expectedAction: 'brew.add.silver', requiredCount: 1 },
  { expectedAction: 'brew.stir.counterclockwise', requiredCount: 1 },
];
const emberSteps = [
  { expectedAction: 'brew.add.berry', requiredCount: 1 },
  { expectedAction: 'brew.add.pepper', requiredCount: 1 },
  { expectedAction: 'brew.stir.counterclockwise', requiredCount: 2 },
  { expectedAction: 'brew.add.petals', requiredCount: 1 },
  { expectedAction: 'brew.stir.clockwise', requiredCount: 1 },
];

function config(steps = moonSteps, overrides: Partial<OrderedActionSession> = {}): OrderedActionSession {
  return { type: 'OrderedActionSession', id: 'brew', acceptedActions: [...acceptedActions], steps: steps.map((step) => ({ ...step })), successSignal: 'brew.success', failureSignal: 'brew.failure', ...overrides };
}
function make(steps = moonSteps, trace = false): World {
  const world = new World({ strict: true });
  world.addSystem(system);
  world.createEntity('cauldron'); world.addComponent('cauldron', config(steps));
  if (trace) { world.createEntity('trace'); world.addComponent<DebugTrace>('trace', { type: 'DebugTrace', events: [], max: 100 }); }
  world.tick();
  return world;
}
function state(world: World): OrderedActionSession { return world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession')!; }
function input(world: World, id: string, name: string, source = 'player'): void {
  world.createEntity(id); world.addComponent<Signal>(id, { type: 'Signal', name, source });
}
function outputs(world: World, name: string): Signal[] {
  return world.query('Signal').map(([id]) => world.getComponent<Signal>(id, 'Signal')!).filter((signal) => signal.name === name);
}

describe('t2-ordered-action-session', () => {
  it('Commit 相位在 Signal 消费者前，无定序环告警', () => {
    expect(system.phase).toBe(SystemPhase.Commit);
    expect(system.runsBefore).toContain('effect-apply');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => topologicalSort([system, effectApplyCapability.systems[0]!, craftRecipeCapability.systems[0]!, cooldownCapability.systems[0]!,
      discreteCombinationSessionCapability.systems[0]!, presentationTrackCapability.systems[0]!])).not.toThrow();
    expect(warn).not.toHaveBeenCalled(); warn.mockRestore();
  });

  it.each([['月露', moonSteps, ['brew.add.moon', 'brew.stir.clockwise', 'brew.stir.clockwise', 'brew.add.silver', 'brew.stir.counterclockwise']],
    ['赤焰', emberSteps, ['brew.add.berry', 'brew.add.pepper', 'brew.stir.counterclockwise', 'brew.stir.counterclockwise', 'brew.add.petals', 'brew.stir.clockwise']]] as const)('%s 配方按完整动作名与圈数成功一次', (_name, steps, sequence) => {
    const world = make([...steps]);
    sequence.forEach((name, index) => { input(world, `action-${index}`, name); world.tick(); });
    expect(state(world).status).toBe('success');
    expect(state(world).stepIndex).toBe(steps.length);
    expect(state(world).confirmedCount).toBe(0);
    expect(outputs(world, 'brew.success')).toHaveLength(1);
    input(world, 'after', 'brew.add.berry'); world.tick();
    expect(state(world).status).toBe('success');
    expect(outputs(world, 'brew.success')).toHaveLength(0);
  });

  it('错误材料、已确认的重复材料和反向有效圈立即失败；其它 UI Signal 不误杀', () => {
    const wrong = make(); input(wrong, 'ui', 'ui.open-inventory'); wrong.tick();
    expect(state(wrong).status).toBe('active');
    expect(outputs(wrong, 'ui.open-inventory')).toHaveLength(1);
    input(wrong, 'wrong', 'brew.add.berry'); wrong.tick();
    expect(state(wrong).status).toBe('failure');
    expect(state(wrong).failureExpected).toBe('brew.add.moon');
    expect(outputs(wrong, 'brew.failure')).toHaveLength(1);

    const repeat = make(); input(repeat, 'first', 'brew.add.moon'); repeat.tick();
    input(repeat, 'repeat', 'brew.add.moon'); repeat.tick(); expect(state(repeat).status).toBe('failure');
    const reverse = make(); input(reverse, 'first', 'brew.add.moon'); reverse.tick();
    input(reverse, 'reverse', 'brew.stir.counterclockwise'); reverse.tick(); expect(state(reverse).status).toBe('failure');
  });

  it('同拍按 Signal 实体 id 全序；同源同名去重，尾步后输入不改唯一终局', () => {
    const world = make([{ expectedAction: 'brew.add.moon', requiredCount: 2 }], true);
    input(world, 'z', 'brew.add.moon'); input(world, 'a', 'brew.add.moon'); world.tick();
    expect(state(world).confirmedCount).toBe(1);
    expect(state(world).status).toBe('active');
    input(world, 'later', 'brew.add.moon'); input(world, 'later-wrong', 'brew.add.berry', 'other'); world.tick();
    expect(state(world).status).toBe('success');
    expect(outputs(world, 'brew.success')).toHaveLength(1);
    expect(outputs(world, 'brew.failure')).toHaveLength(0);
    const events = world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events;
    expect(events.filter((event) => event.system === 'ordered-action-session' && event.tick === events.at(-1)!.tick).length).toBeLessThanOrEqual(3);
    expect(events.some((event) => event.what.includes('active→success'))).toBe(true);
    expect(events.some((event) => event.what.includes('终局拒收'))).toBe(true);
  });

  it('同拍不同动作按实体 id 而非插入顺序裁决；首错立即锁失败', () => {
    const world = make([{ expectedAction: 'brew.add.moon', requiredCount: 1 }]);
    input(world, 'z-correct', 'brew.add.moon'); input(world, 'a-wrong', 'brew.add.berry', 'other'); world.tick();
    expect(state(world).status).toBe('failure');
    expect(state(world).lastAction).toBe('brew.add.berry');
    expect(outputs(world, 'brew.failure')).toHaveLength(1);
    expect(outputs(world, 'brew.success')).toHaveLength(0);
  });

  it('最后一步的 success Signal 当拍可被现有 Effect 消费，不靠游戏 handler 改世界', () => {
    const world = new World({ strict: true });
    world.addSystem(system); world.addSystem(effectApplyCapability.systems[0]!);
    world.createEntity('cauldron'); world.addComponent('cauldron', config([{ expectedAction: 'brew.add.moon', requiredCount: 1 }]));
    world.createEntity('outcome'); world.addComponent<Flag>('outcome', { type: 'Flag', id: 'brew.finished', active: false });
    world.createEntity('effect'); world.addComponent<Effect>('effect', { type: 'Effect', onSignal: 'brew.success', kind: 'set-flag', targetId: 'brew.finished', value: true });
    input(world, 'add', 'brew.add.moon'); world.tick();
    expect(world.getComponent<Flag>('outcome', 'Flag')!.active).toBe(true);
    expect(state(world).status).toBe('success');
  });

  it('坏表、重复 id 与跨会话动作路由歧义 fail-closed', () => {
    expect(validateOrderedActionSession(config([], { steps: [] }))).toContain('steps');
    expect(validateOrderedActionSession(config(moonSteps, { acceptedActions: ['brew.add.moon'] }))).toContain('expectedAction');
    expect(validateOrderedActionSession(config(moonSteps, { steps: [{ expectedAction: 'brew.add.moon', requiredCount: Infinity }] }))).toContain('requiredCount');
    const world = make(); world.createEntity('other'); world.addComponent('other', config(moonSteps, { id: 'other' }));
    input(world, 'ambiguous', 'brew.add.moon'); world.tick();
    expect(state(world).stepIndex).toBe(0);
    expect(world.getComponent<OrderedActionSession>('other', 'OrderedActionSession')!.stepIndex).toBe(0);
  });

  it('manifest 装载期拒绝越界计数与未声明动作，合法表可从数据装配', () => {
    const manifest = (session: OrderedActionSession) => ({ capabilities: ['t2-ordered-action-session'], entities: { cauldron: { OrderedActionSession: session } } });
    expect(() => parseManifest(manifest(config()))).not.toThrow();
    expect(() => parseManifest(manifest(config([{ expectedAction: 'brew.add.moon', requiredCount: 65 }])))).toThrow(/requiredCount/);
    expect(() => parseManifest(manifest(config([{ expectedAction: 'brew.add.unknown', requiredCount: 1 }])))).toThrow(/expectedAction/);
  });

  it('双跑同 hash、快照中途续跑同轨、终局静止零写入，trace 不进 hash', () => {
    const build = () => make();
    expectDeterministic(build, (world) => { input(world, 'one', 'brew.add.moon'); world.tick(); input(world, 'two', 'brew.stir.clockwise'); world.tick(); });
    expectRestoreContinues(build, (world) => { input(world, 'one', 'brew.add.moon'); world.tick(); }, (world) => { input(world, 'two', 'brew.stir.clockwise'); world.tick(); input(world, 'three', 'brew.stir.clockwise'); world.tick(); });
    const world = make(); input(world, 'wrong', 'brew.add.berry'); world.tick(); expectQuiescent(world, 4, 1);
    const withTrace = make(moonSteps, true);
    const withoutTrace = make();
    expect(hashSnapshot(withTrace.snapshot())).toBe(hashSnapshot(withoutTrace.snapshot()));
  });
});
