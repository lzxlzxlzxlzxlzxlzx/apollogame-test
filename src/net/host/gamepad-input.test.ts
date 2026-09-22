import { describe, it, expect } from 'vitest';
import { GamepadInputSource, DEFAULT_PAD_MAP, type GamepadLike } from './gamepad-input.js';

// 造一个假手柄状态（16 键、4 轴），便于 headless 注入测试。
const pad = (over: { buttons?: number[]; axes?: number[]; connected?: boolean } = {}): GamepadLike => ({
  connected: over.connected ?? true,
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: (over.buttons ?? []).includes(i) })),
  axes: over.axes ?? [0, 0, 0, 0],
});

describe('GamepadInputSource · Gamepad API → 每 tick 命令', () => {
  it('无手柄 / 未连接 → 空命令', () => {
    expect(new GamepadInputSource('p1', 0, DEFAULT_PAD_MAP, () => []).commandsForTick(1)).toEqual([]);
    expect(new GamepadInputSource('p1', 0, DEFAULT_PAD_MAP, () => [pad({ connected: false })]).commandsForTick(1)).toEqual([]);
  });

  it('D-Pad 右 → move.dx=1；左摇杆超死区 → 量化为 sign（不把浮点喂进 sim）', () => {
    const s1 = new GamepadInputSource('p1', 0, DEFAULT_PAD_MAP, () => [pad({ buttons: [15] })]); // D-Pad 右
    expect(s1.commandsForTick(1)).toEqual([{ playerId: 'p1', tick: 1, move: { dx: 1, dy: 0 } }]);
    const s2 = new GamepadInputSource('p1', 0, DEFAULT_PAD_MAP, () => [pad({ axes: [0, -0.9, 0, 0] })]); // 左摇杆上
    expect(s2.commandsForTick(1)).toEqual([{ playerId: 'p1', tick: 1, move: { dx: 0, dy: -1 } }]);
  });

  it('左摇杆死区内 → 不计入方向（无漂移）', () => {
    const s = new GamepadInputSource('p1', 0, DEFAULT_PAD_MAP, () => [pad({ axes: [0.3, -0.2, 0, 0] })]);
    expect(s.commandsForTick(1)).toEqual([]); // 都在死区 → 无命令
  });

  it('A 键 → jump + confirm 动作；离散动作走上升沿（按住不重发，jump 仍持续）', () => {
    const src = new GamepadInputSource('p1', 0, DEFAULT_PAD_MAP, () => [pad({ buttons: [0] })]); // 一直按住 A
    const c1 = src.commandsForTick(1);
    expect(c1[0].jump).toBe(true);
    expect(c1[0].actions).toEqual([{ source: 'p1', key: 'confirm', phase: 'down' }]);
    const c2 = src.commandsForTick(2); // 同键按住
    expect(c2[0].jump).toBe(true);
    expect(c2[0].actions).toBeUndefined(); // 上升沿已过 → 不再发 confirm
  });
});
