// Protocol · 输入 ─────────────────────────────
// 外部原始信号 → 语义动作 → 单例输入队列 → 具名键位/点击/操控。命中测试/语义解析归游戏层数据，
// 富输入（牌码、菜单多选）经确定性命令流注入 → lockstep 安全。
import type { Component } from '../../core/types.js';
import type { ConditionExpr } from './logic.js';

// ── I1 input-capture ── 这帧的外部原始信号（由 runtime 注入）
export interface RawInput extends Component {
  readonly type: 'RawInput';
  source: string;
  key?: string;
  x?: number;
  y?: number;
  phase?: string;
}

// ── I2 action-map ── 原始信号对应的语义动作
export interface Action extends Component {
  readonly type: 'Action';
  name: string;
  value: number;
}

// 一条原始输入事件（指针/点击/UI 动作）。x/y=屏幕或世界坐标，phase 如 'down'|'up'|'move'|'action'，
// key 可承载语义动作名（如 'choice:2'）。命中测试/语义解析归游戏层。
export interface RawInputData {
  readonly source: string;
  readonly key?: string;
  readonly x?: number;
  readonly y?: number;
  readonly phase?: string;
  // 结构化数值载荷（REQ-016/017）：承载列表型输入（如卡牌游戏「出哪几张牌」的牌码 suit*100+rank、菜单多选下标）。
  // 让富输入（不止指针 x/y）也能经确定性命令流注入 → lockstep 安全。
  readonly values?: readonly number[];
  // 具名动作的字符串参数（带参 UI 动作用·如「买哪件」card_42 / 拖放被拖 id / 下拉所选 value）：
  // 经确定性命令流注入，keybind 命中后透传进 Signal.arg。区别于 key（=动作名，keybind 匹配的对象）。
  readonly arg?: string;
}

// ── 输入队列（单例）── 本 tick 的原始输入事件列表。挂在唯一实体上，每 tick 整体覆写（零实体分配），
// 取代"每次点击建/毁 RawInput 实体"的高频 GC 范式。游戏层读 actions 做命中/语义解析。
export interface InputQueue extends Component {
  readonly type: 'InputQueue';
  actions: ReadonlyArray<RawInputData>;
}

// ── keybind ── 具名输入动作 → Signal（D-步骤1）。clickable 的"非空间孪生"：读单例 InputQueue 的动作事件，
// 若某事件 key 命中 KeyBinding.key（且相位匹配）→ 产出 Signal{name:signal}。键位映射=数据（蓝图里填，
// 最弱 LLM 可填、可重绑），下游 caster/craft-recipe/effect 等照常按名消费。确定性：只读 InputQueue + 字符串比较。
export interface KeyBinding extends Component {
  readonly type: 'KeyBinding';
  key: string; // 匹配 InputQueue 事件的 key（物理键如 '1'/'q'，或语义动作名如 'cast_nova'）
  signal: string; // 命中时产出的 Signal.name
  phase?: string; // 仅匹配此相位（如 'down'|'action'）；缺省=任意相位
  when?: ConditionExpr; // 可选声明式条件门；不成立时命中的输入 fail-closed，不产 Signal
  // 代发（REQ-108-ENG-04·owner 2026-08-07 判 A）：产出的 Signal.source 填这个实体，而不是挂本组件的实体。
  // 治的病：房屋 UI 接线范式是「一动作一个专属 kb-* 实体」，于是 Signal.source 永远是那个 kb 实体；
  // 而**按 source 认人**的消费方（如 t2-matrix-duel 的出招接缝按侧认人）就永远认不到真正的行为主体。
  // 一实体一组件 ⇒ 也不能把多份 KeyBinding 挤到主体实体上。代发在引擎里已有先例
  // （t2-drag-place / t3-timeline 都发 source ≠ 宿主的信号），本字段只是把它开放给数据填。
  // 缺省=挂本组件的实体（**零回归**）。空串 = 数据错，硬抛。
  source?: string;
}

// ── clickable ── 指针命中该实体的 Shape 时，在该实体上产出一个配置好的 Signal（命中→信号，REQ-C-002）。
// 通用「可点击实体」：棋盘格 / 商店按钮 / 选项 / 拖拽起点都用它，免得每游戏自己写命中测试（违反数据驱动）。
// 命中走「读单例 InputQueue 的指针坐标 → screenToWorld 逆投影 → 对 Transform+Shape 做 AABB」，确定性。
export interface Clickable extends Component {
  readonly type: 'Clickable';
  // 相位/模式门（REQ-F-059，与 Draggable.onlyFlag 同款纪律）：设了且全局 Flag 非真 → 点击不产信号。
  // 「卖出模式才可点卖」「选秀期才可选」等模式化点击的数据门；读上一拍 Flag（人手速不可感知）。
  onlyFlag?: string;
  action: string; // 命中时产出的 Signal.name（下游 effect-apply / craft-recipe / match3 等按名消费）
  phase?: string; // 触发的指针相位 'down'|'up'，缺省 'down'
}

// ── net: controllable ── 该实体由哪个玩家(playerId)操控；input 命令按 speed 写入其 Velocity
export interface Controllable extends Component {
  readonly type: 'Controllable';
  playerId: string;
  speed: number;
}
