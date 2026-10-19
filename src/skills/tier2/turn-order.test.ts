import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { turnOrderCapability, nextIndex, currentSeat, type TurnOrder } from './turn-order.js';
import { eventWhenCapability } from './event-when.js';
import type { Flag, Signal, EventWhen } from '@engine/protocol/components.js';
import type { Component } from '@engine/core/types.js';

// t2-turn-order：推进信号 → 下一未跳过座位；绕圈 round+1 + roundSignal；changedSignal.source = 新座位；
// 全员跳过不动；逆时针；多桌按 id 序；纯函数 nextIndex 边界。

function table(dir = 1): World {
  const w = new World();
  for (const c of [eventWhenCapability, turnOrderCapability]) for (const s of c.systems) w.addSystem(s);
  for (const p of ['p1', 'p2', 'p3', 'p4']) { w.createEntity(p); w.addComponent<Flag>(p, { type: 'Flag', id: 'out', active: false }); }
  w.createEntity('table');
  w.addComponent<TurnOrder>('table', { type: 'TurnOrder', id: 'table', order: ['p1', 'p2', 'p3', 'p4'], current: 0, round: 1, direction: dir, advanceSignal: 'endTurn', changedSignal: 'turn', roundSignal: 'newRound', skipFlag: 'out' });
  // 按钮 = Flag + EventWhen（event-when 每拍先清全场 Signal 再按条件产出·真实游戏里信号来源就是它/keybind/clickable）
  w.createEntity('btn');
  w.addComponent<Flag>('btn', { type: 'Flag', id: 'press', active: false });
  w.addComponent<EventWhen>('btn', { type: 'EventWhen', signal: 'endTurn', when: { kind: 'flag', id: 'press' }, mode: 'level' } as EventWhen);
  return w;
}
const press = (w: World) => { w.getComponent<Flag>('btn', 'Flag')!.active = true; w.tick(); w.getComponent<Flag>('btn', 'Flag')!.active = false; };
const tn = (w: World) => w.getComponent<TurnOrder>('table', 'TurnOrder')!;

describe('t2-turn-order', () => {
  it('推进 → 下一座位·changedSignal.source=新座位；绕圈 round+1 + newRound 信号', () => {
    const w = table();
    press(w);
    expect(tn(w).current).toBe(1);
    expect(w.getComponent<Signal>('table', 'Signal')).toMatchObject({ name: 'turn', source: 'p2' });
    press(w); press(w);
    expect(tn(w).current).toBe(3);
    expect(tn(w).round).toBe(1);
    press(w);
    expect(tn(w).current).toBe(0);
    expect(tn(w).round).toBe(2);
    expect(w.getComponent<Signal>('table:round', 'Signal')).toMatchObject({ name: 'newRound', source: 'p1' });
    // 无信号的拍：不动；上一拍的信号被 event-when 清扫
    w.tick();
    expect(tn(w).current).toBe(0);
    expect(w.getComponent('table', 'Signal')).toBeUndefined();
  });

  it('出局座位（Flag out）被跳过；全员出局不动', () => {
    const w = table();
    w.getComponent<Flag>('p2', 'Flag')!.active = true;
    press(w);
    expect(currentSeat(tn(w))).toBe('p3');
    for (const p of ['p1', 'p3', 'p4']) w.getComponent<Flag>(p, 'Flag')!.active = true;
    press(w);
    expect(currentSeat(tn(w))).toBe('p3');
  });

  it('逆时针 direction=-1；nextIndex 纯函数：空序 -1·绕回判定', () => {
    const w = table(-1);
    press(w);
    expect(currentSeat(tn(w))).toBe('p4');
    expect(tn(w).round).toBe(2); // 逆时针绕回末位 = 新一圈
    const empty: TurnOrder = { type: 'TurnOrder', id: 'x', order: [], current: 0, round: 1, direction: 1, advanceSignal: 'a' };
    expect(nextIndex(empty, () => false)).toEqual({ index: -1, wrapped: false });
    const three: TurnOrder = { ...empty, order: ['a', 'b', 'c'], current: 2 };
    expect(nextIndex(three, () => false)).toEqual({ index: 0, wrapped: true });
    expect(nextIndex(three, (s) => s === 'a')).toEqual({ index: 1, wrapped: true });
  });

  it('多桌同拍推进·各自独立', () => {
    const w = table();
    w.createEntity('table2');
    w.addComponent<TurnOrder>('table2', { type: 'TurnOrder', id: 't2', order: ['p3', 'p4'], current: 0, round: 1, direction: 1, advanceSignal: 'endTurn' });
    press(w);
    expect(tn(w).current).toBe(1);
    expect(w.getComponent<TurnOrder>('table2', 'TurnOrder')!.current).toBe(1);
    expect(w.getComponent('table2', 'Signal')).toBeUndefined(); // 无 changedSignal 不发
    const c: Component | undefined = w.getComponent('table', 'Signal');
    expect(c).toBeDefined();
  });
});
