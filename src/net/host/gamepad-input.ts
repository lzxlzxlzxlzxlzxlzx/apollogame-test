import type { Command, InputSource } from '../commands.js';

// ═══════════════════════════════════════════════════════════════
//  手柄输入源 — Gamepad API → 每 tick 命令（Steam Deck / 主机 / PC 手柄）
//
//  与 KeyboardInputSource 互换：引擎只问 commandsForTick(tick)，不关心命令来自键盘还是手柄。
//  手柄是"轮询"设备（无事件）→ 每 tick 读一次手柄状态；离散按钮按**上升沿**发具名动作。
//  确定性：摇杆/扳机是浮点，但 dx/dy 一律 sign() 量化成 {-1,0,1}（同键盘）→ **不把浮点喂进 sim**。
//  可测：poll 函数可注入（默认 navigator.getGamepads），headless 测试喂假手柄状态。
//
//  （真实 Steam Deck / Steam Input 的高级重映射跑在原生壳里；浏览器 Gamepad API 已够基础手柄。）
// ═══════════════════════════════════════════════════════════════

// 手柄状态的最小结构（Gamepad 子集；便于注入测试，避免硬绑 DOM 类型）。
export interface GamepadLike {
  readonly connected: boolean;
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

// 按钮绑定（同 KeyBinding）：方向 / 跳 / 具名离散动作。键用标准 Gamepad 按钮索引。
export interface PadButtonBinding { dx?: number; dy?: number; jump?: boolean; action?: string; }
export type PadButtonMap = Record<number, PadButtonBinding>;

// 默认映射（标准布局）：D-Pad 方向；A(0)=确认/跳、B(1)=返回、X(2)=动作、Start(9)=菜单。
export const DEFAULT_PAD_MAP: PadButtonMap = {
  12: { dy: -1 }, 13: { dy: 1 }, 14: { dx: -1 }, 15: { dx: 1 }, // D-Pad ↑↓←→
  0: { jump: true, action: 'confirm' }, // A
  1: { action: 'cancel' }, // B
  2: { action: 'action' }, // X
  9: { action: 'menu' }, // Start
};

const DEADZONE = 0.5; // 左摇杆死区：超过才计入方向（避免漂移）。

type DiscreteAction = { source: string; key: string; phase: string };

export class GamepadInputSource implements InputSource {
  private prevPressed = new Set<number>(); // 上一 tick 按下的按钮（边沿检测离散动作）

  constructor(
    private readonly playerId: string,
    private readonly padIndex = 0,
    private readonly map: PadButtonMap = DEFAULT_PAD_MAP,
    private readonly getPads: () => readonly (GamepadLike | null)[] =
      () => (typeof navigator !== 'undefined' && navigator.getGamepads
        ? (navigator.getGamepads() as unknown as readonly (GamepadLike | null)[])
        : []),
  ) {}

  commandsForTick(tick: number): Command[] {
    const pad = this.getPads()[this.padIndex];
    if (!pad || !pad.connected) { this.prevPressed.clear(); return []; }

    let dx = 0, dy = 0, jump = false;
    const actions: DiscreteAction[] = [];
    const nowPressed = new Set<number>();

    // 左摇杆 → 方向（超死区，sign 量化）。
    const lx = pad.axes[0] ?? 0, ly = pad.axes[1] ?? 0;
    if (Math.abs(lx) > DEADZONE) dx += Math.sign(lx);
    if (Math.abs(ly) > DEADZONE) dy += Math.sign(ly);

    // 按钮 → 方向 / 跳 / 离散动作（离散动作走上升沿，按住不重发）。
    for (let i = 0; i < pad.buttons.length; i++) {
      if (!pad.buttons[i].pressed) continue;
      nowPressed.add(i);
      const b = this.map[i];
      if (!b) continue;
      dx += b.dx ?? 0; dy += b.dy ?? 0;
      if (b.jump) jump = true;
      if (b.action && !this.prevPressed.has(i)) {
        actions.push({ source: this.playerId, key: b.action, phase: 'down' });
      }
    }
    this.prevPressed = nowPressed;

    dx = Math.sign(dx); dy = Math.sign(dy);
    if (dx === 0 && dy === 0 && !jump && actions.length === 0) return [];
    const cmd: Command = { playerId: this.playerId, tick, move: { dx, dy } };
    if (jump) (cmd as { jump?: boolean }).jump = true;
    if (actions.length) (cmd as { actions?: DiscreteAction[] }).actions = actions;
    return [cmd];
  }

  dispose(): void { this.prevPressed.clear(); } // 无事件监听；保留 dispose 与键盘源对称
}
