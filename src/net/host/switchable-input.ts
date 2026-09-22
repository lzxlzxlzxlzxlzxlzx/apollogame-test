import type { Command, InputSource } from '../commands.js';
import { DEFAULT_KEYMAP, type KeyMap } from './local-input.js';

// ═══════════════════════════════════════════════════════════════
//  可切换输入源 — 单人轮替操控多个角色（"切换双人玩"）
// ═══════════════════════════════════════════════════════════════
//
//  一套键盘只驱动「当前激活」的那个 playerId；按切换键（缺省 Tab）在 playerIds
//  间循环轮换。非激活角色本 tick 收不到命令 → applyMovement 把其 vx 清零（原地
//  待命，重力照常下落/支撑），于是"停 B、操 A 过关；再切回 B"的协作解谜成立。
//
//  纯输入层、零协议/引擎改动：emit 的 Command 与任何源同构，路由仍走既有的
//  Controllable.playerId（findControlled）。与 MultiInputSource(两套键盘=本地双人)
//  互为两种接线方式：真有两名玩家就用后者，单人想轮替就用本源。
//
//  注：active 是输入层的本地可变状态（不入世界快照）→ 仅用于单机轮替；联机
//  lockstep 的"换人"应做成世界内的 control-assignment 组件（见 requests），不走这里。
//  仅浏览器使用（监听键盘事件）；headless/测试用 commandsForTick + 注入事件验证。
// ═══════════════════════════════════════════════════════════════

export class SwitchableInputSource implements InputSource {
  private readonly pressed = new Set<string>();
  private active = 0;
  // 待释放的离散动作事件（边沿触发，归属当前激活 playerId）。
  private pendingActions: { source: string; key: string; phase: string }[] = [];

  private readonly onDown = (e: KeyboardEvent) => {
    // 切换键：仅边沿（非 OS 自动重复）轮换激活角色；吃掉默认行为（Tab 焦点跳转）。
    if (e.code === this.switchKey) {
      if (!this.pressed.has(e.code)) this.active = (this.active + 1) % this.playerIds.length;
      this.pressed.add(e.code);
      e.preventDefault();
      return;
    }
    const b = this.keymap[e.code];
    if (b) {
      if (b.action && !this.pressed.has(e.code)) {
        this.pendingActions.push({ source: this.playerIds[this.active], key: b.action, phase: 'down' });
      }
      this.pressed.add(e.code);
      e.preventDefault();
    }
  };
  private readonly onUp = (e: KeyboardEvent) => {
    this.pressed.delete(e.code);
  };
  // 丢焦点时清空按下集合，防止"按键卡住"。
  private readonly onBlur = () => {
    this.pressed.clear();
  };

  constructor(
    private readonly playerIds: readonly string[],
    private readonly target: EventTarget = window,
    private readonly keymap: KeyMap = DEFAULT_KEYMAP,
    private readonly switchKey: string = 'Tab',
  ) {
    if (playerIds.length === 0) throw new Error('SwitchableInputSource 需要至少 1 个 playerId');
    this.target.addEventListener('keydown', this.onDown as EventListener);
    this.target.addEventListener('keyup', this.onUp as EventListener);
    this.target.addEventListener('blur', this.onBlur as EventListener);
  }

  /** 当前被操控的 playerId（表现层据此高亮激活角色）。 */
  activePlayerId(): string {
    return this.playerIds[this.active];
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
    const cmd: Command = { playerId: this.playerIds[this.active], tick, move: { dx, dy } };
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
