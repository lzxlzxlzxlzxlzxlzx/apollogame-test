import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { cooldownCapability, cooldownReady, cooldownStart, cooldownProgress, type Cooldowns } from './cooldown.js';
import { eventWhenCapability } from './event-when.js';
import type { Signal, EventWhen, Flag } from '@engine/protocol/components.js';

// t2-cooldown：递减/就绪/触发/阻塞三信号；条件叶 cooldown 经 event-when 读就绪；纯函数助手。

function world(): World {
  const w = new World();
  for (const c of [eventWhenCapability, cooldownCapability]) for (const s of c.systems) w.addSystem(s);
  w.createEntity('hero');
  w.addComponent<Cooldowns>('hero', {
    type: 'Cooldowns',
    slots: [{ id: 'dash', duration: 3, remaining: 0 }, { id: 'nova', duration: 5, remaining: 0 }],
    startOn: [{ signal: 'dash', id: 'dash' }],
    readySignal: 'cdReady', startedSignal: 'cdStarted', blockedSignal: 'cdBlocked',
  });
  // 按钮 = Flag + EventWhen（event-when 每拍先清全场 Signal 再按条件产出·真实游戏里信号来源就是它/keybind/clickable）
  w.createEntity('btn');
  w.addComponent<Flag>('btn', { type: 'Flag', id: 'press', active: false });
  w.addComponent<EventWhen>('btn', { type: 'EventWhen', signal: 'dash', when: { kind: 'flag', id: 'press' }, mode: 'level' } as EventWhen);
  return w;
}
const cd = (w: World) => w.getComponent<Cooldowns>('hero', 'Cooldowns')!;
const sig = (w: World) => w.getComponent<Signal>('hero', 'Signal');
const press = (w: World) => { w.getComponent<Flag>('btn', 'Flag')!.active = true; w.tick(); w.getComponent<Flag>('btn', 'Flag')!.active = false; };

describe('t2-cooldown', () => {
  it('信号触发开始冷却（started）→ 冷却中再触发 blocked → 递减归零 ready', () => {
    const w = world();
    press(w);
    expect(cd(w).slots[0].remaining).toBe(3);
    expect(sig(w)).toMatchObject({ name: 'cdStarted', arg: 'dash', source: 'hero' });
    press(w);
    expect(cd(w).slots[0].remaining).toBe(2);
    expect(sig(w)).toMatchObject({ name: 'cdBlocked', arg: 'dash' });
    w.tick();
    expect(cd(w).slots[0].remaining).toBe(1);
    expect(sig(w)).toBeUndefined();
    w.tick();
    expect(cd(w).slots[0].remaining).toBe(0);
    expect(sig(w)).toMatchObject({ name: 'cdReady', arg: 'dash' });
    w.tick();
    expect(sig(w)).toBeUndefined(); // 一拍生命周期
  });

  it('条件叶 {kind:"cooldown"}：event-when 在就绪/未就绪时发/不发信号（global 与 self）', () => {
    const w = world();
    w.createEntity('ew');
    w.addComponent<EventWhen>('ew', { type: 'EventWhen', signal: 'canDash', when: { kind: 'cooldown', id: 'dash', ready: true }, mode: 'level' } as EventWhen);
    w.tick();
    expect(w.getComponent<Signal>('ew', 'Signal')?.name).toBe('canDash');
    press(w); // 冷却中
    w.tick();
    expect(w.getComponent('ew', 'Signal')).toBeUndefined();
    // 未知槽 id → 视为就绪（未配置的技能不受约束）
    w.addComponent<EventWhen>('ew', { type: 'EventWhen', signal: 'x', when: { kind: 'cooldown', id: 'nope', ready: true }, mode: 'level' } as EventWhen);
    w.tick();
    expect(w.getComponent<Signal>('ew', 'Signal')?.name).toBe('x');
  });

  it('纯函数：ready / start / progress', () => {
    const c: Cooldowns = { type: 'Cooldowns', slots: [{ id: 'a', duration: 4, remaining: 0 }] };
    expect(cooldownReady(c, 'a')).toBe(true);
    expect(cooldownStart(c, 'a')).toBe(true);
    expect(cooldownStart(c, 'a')).toBe(false);
    expect(cooldownProgress(c, 'a')).toBe(0);
    c.slots[0].remaining = 1;
    expect(cooldownProgress(c, 'a')).toBe(0.75);
    expect(cooldownReady(c, 'missing')).toBe(true);
    expect(cooldownProgress(c, 'missing')).toBe(1);
  });
});
