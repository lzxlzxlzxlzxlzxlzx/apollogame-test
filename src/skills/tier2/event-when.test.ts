import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Resource, Flag, EventWhen, Signal, ConditionExpr } from '@engine/protocol/components.js';
import { eventWhenCapability } from './event-when.js';

function worldWithEventWhen(): World {
  const w = new World();
  for (const s of eventWhenCapability.systems) w.addSystem(s);
  return w;
}
function res(w: World, id: string, current: number): void {
  const e = `res:${id}`;
  if (!w.hasComponent(e, 'Resource')) w.createEntity(e);
  w.addComponent(e, { type: 'Resource', id, current, min: -Infinity, max: Infinity } as Resource);
}
function flag(w: World, id: string, active: boolean): void {
  const e = `flag:${id}`;
  if (!w.hasComponent(e, 'Flag')) w.createEntity(e);
  w.addComponent(e, { type: 'Flag', id, active } as Flag);
}
function eventWhen(w: World, eid: string, signal: string, when: ConditionExpr, mode: 'edge' | 'level'): void {
  w.createEntity(eid);
  w.addComponent(eid, { type: 'EventWhen', signal, when, mode, armed: false } as EventWhen);
}
function signalName(w: World, eid: string): string | undefined {
  return w.getComponent<Signal>(eid, 'Signal')?.name;
}

describe('T2 event-when — metadata', () => {
  it('id / 读 EventWhen+Resource+Flag+State / 写 Signal', () => {
    expect(eventWhenCapability.id).toBe('t2-event-when');
    expect(eventWhenCapability.components.reads).toEqual(['EventWhen', 'Resource', 'Flag', 'State', 'Timer', 'StringVar', 'Cooldowns']);
    expect(eventWhenCapability.components.writes).toEqual(['Signal', 'EventWhen']); // P1a 严格模式补齐：edge 模式改自身 armed = 写
    expect(eventWhenCapability.components.provides.Signal.category).toBe('event');
  });
});

describe('T2 event-when — level 模式', () => {
  it('条件为真时每帧持续发信号；转假即停', () => {
    const w = worldWithEventWhen();
    flag(w, 'p1', true);
    flag(w, 'p2', true);
    eventWhen(w, 'plate', 'plate_on', { kind: 'and', of: [{ kind: 'flag', id: 'p1' }, { kind: 'flag', id: 'p2' }] }, 'level');

    w.tick();
    expect(signalName(w, 'plate')).toBe('plate_on');
    w.tick(); // 仍为真 → 仍发
    expect(signalName(w, 'plate')).toBe('plate_on');

    flag(w, 'p2', false); // 一人离台
    w.tick();
    expect(w.hasComponent('plate', 'Signal')).toBe(false);
  });
});

describe('T2 event-when — edge 模式（迟滞）', () => {
  it('上升沿只发一次，条件持续为真后续不再发；回落复位后可再发', () => {
    const w = worldWithEventWhen();
    res(w, 'affection_S', 40);
    eventWhen(w, 'love', 'S_love_60', { kind: 'resource', id: 'affection_S', cmp: 'gte', value: 60 }, 'edge');

    w.tick(); // 40 < 60 → 不发
    expect(w.hasComponent('love', 'Signal')).toBe(false);

    res(w, 'affection_S', 65); // 越线
    w.tick(); // 上升沿 → 发一次
    expect(signalName(w, 'love')).toBe('S_love_60');

    res(w, 'affection_S', 70); // 仍 ≥60
    w.tick(); // 已 armed → 不重复发
    expect(w.hasComponent('love', 'Signal')).toBe(false);

    res(w, 'affection_S', 55); // 回落 → 复位
    w.tick();
    expect(w.hasComponent('love', 'Signal')).toBe(false);

    res(w, 'affection_S', 80); // 再次越线
    w.tick(); // 再发
    expect(signalName(w, 'love')).toBe('S_love_60');
  });

  it('armed 进 snapshot：edge 状态可随存档回滚', () => {
    const w = worldWithEventWhen();
    res(w, 'hp', 100);
    eventWhen(w, 'dead', 'died', { kind: 'resource', id: 'hp', cmp: 'lte', value: 0 }, 'edge');
    res(w, 'hp', 0);
    w.tick(); // 上升沿发一次，armed=true
    expect(signalName(w, 'dead')).toBe('died');
    expect(w.getComponent<EventWhen>('dead', 'EventWhen')?.armed).toBe(true);
  });
});

describe('T2 event-when — 每帧先清后标 + 多触发器独立', () => {
  it('两个 EventWhen 互不干扰；信号每帧重算', () => {
    const w = worldWithEventWhen();
    flag(w, 'a', true);
    flag(w, 'b', false);
    eventWhen(w, 'ew_a', 'sig_a', { kind: 'flag', id: 'a' }, 'level');
    eventWhen(w, 'ew_b', 'sig_b', { kind: 'flag', id: 'b' }, 'level');

    w.tick();
    expect(signalName(w, 'ew_a')).toBe('sig_a');
    expect(w.hasComponent('ew_b', 'Signal')).toBe(false);

    flag(w, 'a', false);
    flag(w, 'b', true);
    w.tick();
    expect(w.hasComponent('ew_a', 'Signal')).toBe(false); // 上帧信号被清
    expect(signalName(w, 'ew_b')).toBe('sig_b');
  });
});

// ── 代发 source（REQ-108-ENG-05·owner 2026-08-07 判 A·与 KeyBinding.source 对称）──────
function eventWhenSrc(w: World, eid: string, signal: string, when: ConditionExpr, source?: string): void {
  w.createEntity(eid);
  w.addComponent(eid, { type: 'EventWhen', signal, when, mode: 'level', armed: false, ...(source !== undefined ? { source } : {}) } as EventWhen);
}
const sigOf = (w: World, eid: string): Signal | undefined => w.getComponent<Signal>(eid, 'Signal');
const GO: ConditionExpr = { kind: 'flag', id: 'go' };

describe('event-when — 代发 Signal.source（REQ-108-ENG-05）', () => {
  it('填了 source → Signal.source = 该实体（信号组件仍挂在 EventWhen 实体上）', () => {
    const w = worldWithEventWhen();
    flag(w, 'go', true);
    eventWhenSrc(w, 'ew1', 'throw.rock', GO, 'p2');
    w.tick();
    // 认人的是 source 字段，不是挂载实体——接缝（matrix-duel）据此认侧。
    expect(sigOf(w, 'ew1')).toMatchObject({ name: 'throw.rock', source: 'p2' });
    expect(sigOf(w, 'p2')).toBeUndefined();   // 生命周期不变：信号仍挂规则实体
  });

  it('不填 source → 零回归：仍是挂载实体自己', () => {
    const w = worldWithEventWhen();
    flag(w, 'go', true);
    eventWhenSrc(w, 'ew2', 's', GO);
    w.tick();
    expect(sigOf(w, 'ew2')!.source).toBe('ew2');
  });

  it('多条规则各自代发到不同主体（同一动作名按主体分流·AI 双人同屏就靠这个）', () => {
    const w = worldWithEventWhen();
    flag(w, 'go', true);
    eventWhenSrc(w, 'ew:p1', 'throw', GO, 'p1');
    eventWhenSrc(w, 'ew:p2', 'throw', GO, 'p2');
    w.tick();
    expect(sigOf(w, 'ew:p1')!.source).toBe('p1');
    expect(sigOf(w, 'ew:p2')!.source).toBe('p2');
  });

  it('source 空串 = 数据错 → 点名硬抛（不静默退回本实体）', () => {
    const w = worldWithEventWhen();
    flag(w, 'go', true);
    eventWhenSrc(w, 'ew-bad', 's', GO, '');
    expect(() => w.tick()).toThrow(/EventWhen\.source 是空串/);
  });
});
