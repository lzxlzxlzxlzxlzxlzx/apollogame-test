import { describe, it, expect, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import type { GameFlow, Resource, Flag, State, Tag, GroupCount } from '@engine/protocol/components.js';
import { flowCapability } from './flow.js';
import { zoneOccupancyCapability } from '../tier2/zone-occupancy.js';
import { groupCountCapability } from '../tier2/group-count.js';
import { hashSnapshot } from '@net/determinism.js';

function mk(flow: Omit<GameFlow, 'type'>): World {
  const w = new World();
  for (const s of flowCapability.systems) w.addSystem(s);
  w.createEntity('flow');
  w.addComponent('flow', { type: 'GameFlow', ...flow } as GameFlow);
  return w;
}
const res = (w: World, id: string, cur: number, min = 0, max = 1e9) => {
  w.createEntity(`r_${id}`); w.addComponent(`r_${id}`, { type: 'Resource', id, current: cur, min, max } as Resource);
};
const flag = (w: World, id: string) => { w.createEntity(`f_${id}`); w.addComponent(`f_${id}`, { type: 'Flag', id, active: false } as Flag); };
const stateC = (w: World, fsmId: string, cur: string) => { w.createEntity(`s_${fsmId}`); w.addComponent(`s_${fsmId}`, { type: 'State', fsmId, current: cur } as State); };
const cur = (w: World) => w.getComponent<GameFlow>('flow', 'GameFlow')!.current;
const rget = (w: World, id: string) => w.getComponent<Resource>(`r_${id}`, 'Resource')!.current;
const fget = (w: World, id: string) => w.getComponent<Flag>(`f_${id}`, 'Flag')!.active;

describe('flow · 分支转移（回合 won/lost 收成一份 GameFlow，消解散件）', () => {
  const rounds = (): Omit<GameFlow, 'type'> => ({
    id: 'round', current: 'playing', states: [
      { id: 'playing', transitions: [
        { when: { kind: 'resource', id: 'round_score', cmp: 'gte', value: 0, vsResource: 'blind' }, to: 'won', do: [{ kind: 'set-flag', targetId: 'cleared', value: true }] },
        { when: { kind: 'resource', id: 'hands_left', cmp: 'lte', value: 0 }, to: 'lost' },
      ] },
      { id: 'won' }, { id: 'lost' },
    ],
  });
  it('round_score≥blind → won（带 do 动作置 cleared）', () => {
    const w = mk(rounds()); res(w, 'round_score', 300); res(w, 'blind', 200); res(w, 'hands_left', 3); flag(w, 'cleared');
    w.tick();
    expect(cur(w)).toBe('won');
    expect(fget(w, 'cleared')).toBe(true);
  });
  it('未达线 + hands 耗尽 → lost（按声明序首个命中）', () => {
    const w = mk(rounds()); res(w, 'round_score', 50); res(w, 'blind', 200); res(w, 'hands_left', 0); flag(w, 'cleared');
    w.tick();
    expect(cur(w)).toBe('lost');
    expect(fget(w, 'cleared')).toBe(false);
  });
  it('都不满足 → 停在 playing', () => {
    const w = mk(rounds()); res(w, 'round_score', 50); res(w, 'blind', 200); res(w, 'hands_left', 3); flag(w, 'cleared');
    w.tick();
    expect(cur(w)).toBe('playing');
  });
});

describe('flow · 线性瀑布 + onEnter 边沿', () => {
  it('always 转移把 deal→select→play 线性推进；onEnter 各跑一次', () => {
    const w = mk({ id: 'f', current: 'deal', states: [
      { id: 'deal', onEnter: [{ kind: 'modify-resource', targetId: 'dealt', op: 'set', value: 8 }], transitions: [{ when: { kind: 'always' }, to: 'select' }] },
      { id: 'select', onEnter: [{ kind: 'set-flag', targetId: 'ready', value: true }], transitions: [{ when: { kind: 'always' }, to: 'play' }] },
      { id: 'play' },
    ] });
    res(w, 'dealt', 0); flag(w, 'ready');
    w.tick(); // deal: onEnter dealt=8 → 转 select
    w.tick(); // select: onEnter ready=true → 转 play
    w.tick(); // play 终态
    expect(cur(w)).toBe('play');
    expect(rget(w, 'dealt')).toBe(8);
    expect(fget(w, 'ready')).toBe(true);
  });
  it('onEnter 只在进入时跑一次（edge，不每拍重复）', () => {
    const w = mk({ id: 'f', current: 'A', states: [{ id: 'A', onEnter: [{ kind: 'modify-resource', targetId: 'n', op: 'add', value: 1 }] }] }); // A 无转移，停留
    res(w, 'n', 0);
    w.tick(); w.tick(); w.tick();
    expect(rget(w, 'n')).toBe(1); // onEnter 仅进入 A 时跑一次
  });
});

describe('flow · 确定性', () => {
  it('同数据同输入 → 双世界整快照 hash 一致（升格：不只比 current，elapsed 等隐藏态一并背书）', () => {
    const build = () => { const w = mk({ id: 'f', current: 'a', states: [{ id: 'a', transitions: [{ when: { kind: 'always' }, to: 'b' }] }, { id: 'b' }] }); w.tick(); w.tick(); return w; };
    const w1 = build();
    const w2 = build();
    expect(cur(w1)).toBe('b'); // 钉具体终态（不只互等）
    expect(hashSnapshot(w1.snapshot())).toBe(hashSnapshot(w2.snapshot())); // 整快照等价（lockstep/录放口径）
  });
  it('set-state 动作可驱动另一个 fsm（流程间联动）', () => {
    const w = mk({ id: 'f', current: 'go', states: [{ id: 'go', onEnter: [{ kind: 'set-state', targetId: 'other', value: 'opened' }] }] });
    stateC(w, 'other', 'closed');
    w.tick();
    expect(w.getComponent<State>('s_other', 'State')!.current).toBe('opened');
  });
});

describe('flow · Matinee/sequence 时序门（after：等 N 拍再转，零代码时间轴）', () => {
  it('after:2 → 进入状态后第 3 拍才转移（线性时间轴；when 缺省 always）', () => {
    const w = mk({ id: 'f', current: 'wait', states: [
      { id: 'wait', transitions: [{ after: 2, to: 'done' }] }, { id: 'done' },
    ] });
    w.tick(); expect(cur(w)).toBe('wait'); // elapsed 0
    w.tick(); expect(cur(w)).toBe('wait'); // elapsed 1
    w.tick(); expect(cur(w)).toBe('done'); // elapsed 2 ≥ 2 → 转
  });
  it('after 与 when 是「与」：两者都满足才转', () => {
    const w = mk({ id: 'f', current: 'a', states: [
      { id: 'a', transitions: [{ after: 1, when: { kind: 'flag', id: 'go' }, to: 'b' }] }, { id: 'b' },
    ] });
    flag(w, 'go'); // 初始 false
    w.tick(); w.tick(); w.tick();
    expect(cur(w)).toBe('a'); // after 满足但 when(go) 仍 false → 不转
    w.getComponent<Flag>('f_go', 'Flag')!.active = true;
    w.tick();
    expect(cur(w)).toBe('b'); // 两者皆满足 → 转
  });
  it('转移后 elapsed 归零：新状态的 after 重新起算', () => {
    const w = mk({ id: 'f', current: 'a', states: [
      { id: 'a', transitions: [{ after: 1, to: 'b' }] },
      { id: 'b', transitions: [{ after: 1, to: 'c' }] },
      { id: 'c' },
    ] });
    w.tick(); expect(cur(w)).toBe('a'); // a elapsed 0
    w.tick(); expect(cur(w)).toBe('b'); // a elapsed 1 → b（归零）
    w.tick(); expect(cur(w)).toBe('b'); // b elapsed 0
    w.tick(); expect(cur(w)).toBe('c'); // b elapsed 1 → c
  });
});

// ── REQ-F-028 回归：flow 与 zone-occupancy(RMW Flag)/group-count(RMW Resource) 同场不成环 ──
describe('flow · REQ-F-028 与 zone-occupancy/group-count 同场不成环', () => {
  it('三者同跑：拓扑排序不抛 + flow 据 group-count 计数转移（定序：先计数后判阶段）', () => {
    // 读告警纪律：推断环只 warn 不抛，收进断言（ENG-03 形状）
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const w = new World();
      for (const s of zoneOccupancyCapability.systems) w.addSystem(s); // 制造 RMW Flag 边（无 Zone 数据亦触发排序）
      for (const s of groupCountCapability.systems) w.addSystem(s);
      for (const s of flowCapability.systems) w.addSystem(s);
      const ENEMY = 1 << 2;
      w.createEntity('gc'); w.addComponent('gc', { type: 'GroupCount', countResource: 'enemies_alive', requiredTag: ENEMY } as GroupCount);
      w.createEntity('res'); w.addComponent('res', { type: 'Resource', id: 'enemies_alive', current: 0, min: 0, max: 99 } as Resource);
      w.createEntity('e1'); w.addComponent('e1', { type: 'Tag', flags: ENEMY } as Tag);
      w.createEntity('flow'); w.addComponent('flow', { type: 'GameFlow', id: 'g', current: 'combat', entered: false, states: [
        { id: 'combat', transitions: [{ when: { kind: 'resource', id: 'enemies_alive', cmp: 'lte', value: 0 }, to: 'done' }] },
        { id: 'done' },
      ] } as GameFlow);
      const fcur = () => w.getComponent<GameFlow>('flow', 'GameFlow')!.current;
      expect(() => { for (let i = 0; i < 3; i++) w.tick(); }).not.toThrow(); // 修复前此处抛环
      expect(fcur()).toBe('combat'); // 有敌(enemies_alive=1) → 停留
      w.destroyEntity('e1');         // 清场
      for (let i = 0; i < 2; i++) w.tick();
      expect(fcur()).toBe('done');   // group-count 先写 0 → flow 据此转移（runsAfter 定序正确）
      const bad = warn.mock.calls.map((c) => c.map(String).join(' ')).filter((m) => m.includes('[topological-sort]') || m.includes('Circular'));
      expect(bad).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});
