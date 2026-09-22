import type { Command, InputSource } from '../commands.js';

// ═══════════════════════════════════════════════════════════════
//  本地键盘输入源 — 实时键盘 → 每 tick 命令
// ═══════════════════════════════════════════════════════════════
//
//  按键 → 移动/跳跃意图。实现 InputSource，与网络对端可互换：引擎只问
//  commandsForTick(tick)，不关心命令来自键盘还是网线。键位由 keymap 可配 ——
//  同一份键盘开两个不同 keymap、不同 playerId 的源，再用 MultiInputSource 合并，
//  即本地双人。（仅浏览器使用；headless / 测试用脚本源，不导入本文件。）
// ═══════════════════════════════════════════════════════════════

export interface KeyBinding {
  dx?: number;
  dy?: number;
  jump?: boolean;
  // 离散动作键（边沿触发）：按下时发一条具名动作事件 → Command.actions → 单例 InputQueue，
  // 供 keybind 能力（KeyBinding 组件）匹配 key 产 Signal（技能释放/UI 动作）。区别于 dx/dy 的持续按住。
  action?: string;
}
export type KeyMap = Record<string, KeyBinding>;

// 默认键位（单人）：方向键 + WASD 移动，空格跳。
export const DEFAULT_KEYMAP: KeyMap = {
  ArrowUp: { dy: -1 },
  KeyW: { dy: -1 },
  ArrowDown: { dy: 1 },
  KeyS: { dy: 1 },
  ArrowLeft: { dx: -1 },
  KeyA: { dx: -1 },
  ArrowRight: { dx: 1 },
  KeyD: { dx: 1 },
  Space: { jump: true },
};

export class KeyboardInputSource implements InputSource {
  private readonly pressed = new Set<string>();
  // 待释放的离散动作事件（边沿触发，下一 tick 取走）。
  private pendingActions: { source: string; key: string; phase: string }[] = [];

  private readonly onDown = (e: KeyboardEvent) => {
    const b = this.keymap[e.code];
    if (b) {
      // 动作键：仅在边沿（非 OS 自动重复）发一次具名动作事件。
      if (b.action && !this.pressed.has(e.code)) {
        this.pendingActions.push({ source: this.playerId, key: b.action, phase: 'down' });
      }
      this.pressed.add(e.code);
      e.preventDefault();
    }
  };
  private readonly onUp = (e: KeyboardEvent) => {
    this.pressed.delete(e.code);
  };
  // 丢焦点时 keyup 收不到 → 清空按下集合，防止"按键卡住"持续移动。
  private readonly onBlur = () => {
    this.pressed.clear();
  };

  constructor(
    private readonly playerId: string,
    private readonly target: EventTarget = window,
    private readonly keymap: KeyMap = DEFAULT_KEYMAP,
  ) {
    this.target.addEventListener('keydown', this.onDown as EventListener);
    this.target.addEventListener('keyup', this.onUp as EventListener);
    this.target.addEventListener('blur', this.onBlur as EventListener);
  }

  commandsForTick(tick: number): Command[] {
    let dx = 0;
    let dy = 0;
    let jump = false;
    for (const code of this.pressed) {
      const b = this.keymap[code];
      if (!b) continue;
      dx += b.dx ?? 0;
      dy += b.dy ?? 0;
      if (b.jump) jump = true;
    }
    dx = Math.sign(dx);
    dy = Math.sign(dy);
    const actions = this.pendingActions;
    this.pendingActions = [];
    if (dx === 0 && dy === 0 && !jump && actions.length === 0) return [];
    const cmd: Command = { playerId: this.playerId, tick, move: { dx, dy } };
    if (jump) (cmd as { jump?: boolean }).jump = true;
    if (actions.length) (cmd as { actions?: typeof actions }).actions = actions;
    return [cmd];
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onDown as EventListener);
    this.target.removeEventListener('keyup', this.onUp as EventListener);
    this.target.removeEventListener('blur', this.onBlur as EventListener);
  }
}
