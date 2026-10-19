import { describe, it, expect } from 'vitest';
import { SwitchableInputSource } from './switchable-input.js';
import type { KeyMap } from './local-input.js';

// 单人轮替操控：一套键盘驱动「当前激活」角色，Tab 在 A/B 间轮换。
// 用假 EventTarget 注入键盘事件（只读 e.code + e.preventDefault），不依赖真实 DOM。
class FakeTarget implements EventTarget {
  private handlers: Record<string, EventListener[]> = {};
  addEventListener(type: string, h: EventListenerOrEventListenerObject | null): void {
    if (h) (this.handlers[type] ??= []).push(h as EventListener);
  }
  removeEventListener(type: string, h: EventListenerOrEventListenerObject | null): void {
    if (h) this.handlers[type] = (this.handlers[type] ?? []).filter((x) => x !== h);
  }
  dispatchEvent(): boolean {
    return true;
  }
  fire(type: string, code: string): void {
    for (const h of this.handlers[type] ?? []) h({ code, preventDefault() {} } as unknown as Event);
  }
  count(type: string): number {
    return (this.handlers[type] ?? []).length;
  }
}

const KEYMAP: KeyMap = {
  KeyA: { dx: -1 },
  KeyD: { dx: 1 },
  Space: { jump: true },
  KeyF: { action: 'fire' },
};

describe('SwitchableInputSource — 单人轮替操控', () => {
  it('一套键盘驱动当前激活 playerId；命令归属随激活角色变', () => {
    const t = new FakeTarget();
    const src = new SwitchableInputSource(['A', 'B'], t, KEYMAP);
    expect(src.activePlayerId()).toBe('A');

    t.fire('keydown', 'KeyD'); // 按住右
    let cmds = src.commandsForTick(0);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ playerId: 'A', move: { dx: 1, dy: 0 } });

    // 切换 → 激活 B；同样按着右键，命令现在归 B（A 本 tick 无命令 → 会被清零=原地待命）
    t.fire('keydown', 'Tab');
    expect(src.activePlayerId()).toBe('B');
    cmds = src.commandsForTick(1);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ playerId: 'B', move: { dx: 1, dy: 0 } });
  });

  it('切换键边沿触发：按住不放只轮换一次', () => {
    const t = new FakeTarget();
    const src = new SwitchableInputSource(['A', 'B'], t, KEYMAP);
    t.fire('keydown', 'Tab'); // A→B
    t.fire('keydown', 'Tab'); // 自动重复（未先 keyup）→ 不应再轮换
    expect(src.activePlayerId()).toBe('B');
    t.fire('keyup', 'Tab');
    t.fire('keydown', 'Tab'); // 真正再次按下 → B→A（2 人循环）
    expect(src.activePlayerId()).toBe('A');
  });

  it('循环轮换三名角色', () => {
    const t = new FakeTarget();
    const src = new SwitchableInputSource(['A', 'B', 'C'], t, KEYMAP);
    const press = () => { t.fire('keydown', 'Tab'); t.fire('keyup', 'Tab'); };
    press(); expect(src.activePlayerId()).toBe('B');
    press(); expect(src.activePlayerId()).toBe('C');
    press(); expect(src.activePlayerId()).toBe('A');
  });

  it('跳跃与离散动作随激活角色归属，且动作边沿触发一次', () => {
    const t = new FakeTarget();
    const src = new SwitchableInputSource(['A', 'B'], t, KEYMAP);
    t.fire('keydown', 'Space');
    expect(src.commandsForTick(0)[0]).toMatchObject({ playerId: 'A', jump: true });

    t.fire('keydown', 'KeyF'); // 开火动作（边沿）
    const c1 = src.commandsForTick(1)[0];
    expect(c1.actions).toEqual([{ source: 'A', key: 'fire', phase: 'down' }]);
    // 同一次按住不再重复发动作
    const c2 = src.commandsForTick(2);
    expect(c2.find((c) => c.actions)?.actions ?? []).toEqual([]);
  });

  it('无输入 → 空命令；dispose 摘除全部监听', () => {
    const t = new FakeTarget();
    const src = new SwitchableInputSource(['A', 'B'], t, KEYMAP);
    expect(src.commandsForTick(0)).toEqual([]);
    expect(t.count('keydown')).toBe(1);
    src.dispose();
    expect(t.count('keydown')).toBe(0);
    expect(t.count('keyup')).toBe(0);
    expect(t.count('blur')).toBe(0);
  });

  it('空 playerIds 抛错（接线错误早暴露）', () => {
    expect(() => new SwitchableInputSource([], new FakeTarget())).toThrow();
  });
});
