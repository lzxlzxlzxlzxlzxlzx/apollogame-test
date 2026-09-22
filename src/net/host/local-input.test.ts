import { describe, it, expect } from 'vitest';
import { KeyboardInputSource } from './local-input.js';

// 用 Node 原生 EventTarget + 合成事件驱动，无需浏览器/jsdom。
function key(type: 'keydown' | 'keyup', code: string): Event {
  const e = new Event(type);
  (e as Event & { code: string }).code = code;
  return e;
}

describe('KeyboardInputSource: 键盘 → 每 tick 命令', () => {
  it('按住的键映射成归一化的移动命令；松开即停', () => {
    const target = new EventTarget();
    const src = new KeyboardInputSource('p1', target);

    expect(src.commandsForTick(1)).toEqual([]); // 无按键 → 无命令

    target.dispatchEvent(key('keydown', 'ArrowRight'));
    expect(src.commandsForTick(2)).toEqual([{ playerId: 'p1', tick: 2, move: { dx: 1, dy: 0 } }]);

    target.dispatchEvent(key('keydown', 'ArrowUp')); // 同时按 → 对角
    expect(src.commandsForTick(3)).toEqual([{ playerId: 'p1', tick: 3, move: { dx: 1, dy: -1 } }]);

    target.dispatchEvent(key('keyup', 'ArrowRight'));
    expect(src.commandsForTick(4)).toEqual([{ playerId: 'p1', tick: 4, move: { dx: 0, dy: -1 } }]);

    target.dispatchEvent(key('keyup', 'ArrowUp'));
    expect(src.commandsForTick(5)).toEqual([]);

    src.dispose();
  });

  it('WASD 别名生效；相反方向相互抵消', () => {
    const target = new EventTarget();
    const src = new KeyboardInputSource('p2', target);

    target.dispatchEvent(key('keydown', 'KeyA')); // 左
    target.dispatchEvent(key('keydown', 'KeyD')); // 右 → 抵消
    expect(src.commandsForTick(1)).toEqual([]); // dx=0,dy=0 → 无命令

    target.dispatchEvent(key('keyup', 'KeyD'));
    expect(src.commandsForTick(2)).toEqual([{ playerId: 'p2', tick: 2, move: { dx: -1, dy: 0 } }]);

    src.dispose();
  });

  it('丢焦点（blur）清空按下集合 —— 切窗口时 keyup 收不到也不会"卡住"', () => {
    const target = new EventTarget();
    const src = new KeyboardInputSource('p1', target);

    target.dispatchEvent(key('keydown', 'ArrowRight')); // 按住右
    expect(src.commandsForTick(1)).toEqual([{ playerId: 'p1', tick: 1, move: { dx: 1, dy: 0 } }]);

    target.dispatchEvent(new Event('blur')); // 切到别的窗口，没有 keyup
    expect(src.commandsForTick(2)).toEqual([]); // 焦点丢失后不再持续移动

    src.dispose();
  });

  it('空格 → 跳跃意图；可边跑边跳；松开即无', () => {
    const target = new EventTarget();
    const src = new KeyboardInputSource('p1', target);

    target.dispatchEvent(key('keydown', 'Space'));
    expect(src.commandsForTick(1)).toEqual([{ playerId: 'p1', tick: 1, move: { dx: 0, dy: 0 }, jump: true }]);

    target.dispatchEvent(key('keydown', 'ArrowRight')); // 边跑边跳：水平 + 跳跃并存
    expect(src.commandsForTick(2)).toEqual([{ playerId: 'p1', tick: 2, move: { dx: 1, dy: 0 }, jump: true }]);

    target.dispatchEvent(key('keyup', 'Space'));
    expect(src.commandsForTick(3)).toEqual([{ playerId: 'p1', tick: 3, move: { dx: 1, dy: 0 } }]); // 无 jump 字段

    src.dispose();
  });
});
