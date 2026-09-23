# game-rhetoric-duel｜游戏级需求与裁决

## W4-UI-ARIA-001 · LayoutNode 语义播报槽 · 2026-09-23 · owner 已选 A · status: pending PUI

### 实查原文

- 已查 `src/ui/components/types.ts` 的 `LabelProps`、`ComponentProps`，以及 `src/ui/components/render.ts` 的 `renderLabel`；当前公开字段没有 `aria-live`、`role=status` 或同义闭集槽。
- 已查全库 `aria-live` / `liveRegion`；没有可由游戏数据重组消费的现有控件。
- 当前游戏已把语义结果收敛到唯一可见节点 `rhetoric-semantic-live`，但可见文字不能等价为读屏器 live region。

### 路线 A · 扩写共享 Label 可访问性字段（owner 已选）

由 PUI 为 `LabelProps` 增加可选闭集字段（建议 `live?: 'polite' | 'assertive'`），渲染器只映射受控 `aria-live`，校验器拒绝未知值，并补渲染/校验/零回归测试。所有需要播报确定性语义结果的游戏均可复用。

- 代价：触及 `src/ui/**` 专职域，须由 PUI 施工和独立复查。
- 影响面：字段可选，既有 LayoutNode 输出保持不变。
- 选错代价：若改成任意 aria 属性透传，会形成自由 DOM 逃生口，因此只接受闭集枚举。

### 路线 B · 只保留可见语义文字（未选）

不改共享 UI，继续显示 `rhetoric-semantic-live` 的文字，但读屏器不保证按变化主动播报。代价是 W4 无障碍条款不能完整验收。

### W4 处置

本项不影响规则、输入、结果幂等或普通浏览器可玩性；在 S4 对齐单中保留为有去向的 `⚠`，进入独立复查门时由 PUI 接单。PUI 能力合入并由游戏消费前，不宣称无障碍验收完成。

## CAPGAP-RHETORIC-003 · 玩法输入的声明式条件门 · 2026-09-23 · owner 已选 A · status: done

交付：`3fc05a59`（运行期门控）+ `4938f11d`（递归 schema 返修）；独立复查最终 **PASS**，见 [review/CAPGAP-RHETORIC-003.md](review/CAPGAP-RHETORIC-003.md)。共享需求池条目已按完结纪律删除。

### 实查原文

- 机读 capability catalog 已点名核对 `t2-identity-card-play`、`t2-keybind`、`t3-flow`、`t2-event-when`、`t2-effect-apply`、`t3-caster`、`t3-prefab`。
- `t3-flow` 能以 `onEnter/do` 闭集动作写 `Flag/State/Resource`，但 `ConditionExpr` 不能直接读取 `GameFlow.current`。
- `t2-keybind` 只按 `key/phase` 匹配 `InputQueue`，没有条件门；终局后仍会产生结束回合 Signal。
- `t2-identity-card-play` 只比较 `IdentityCardPile.phase === playPhase`；现有 capability 没有任何数据接缝把该字段同步到 `GameFlow.current`，因此终局后直接注入的 `IdentityCardCommand` 仍可能结算。
- `event-when/effect-apply` 不能在不新增解释器的前提下给“输入事件”加条件；`caster/prefab` 可以声明式生成 `IdentityCardDrawCommand`，但不解决输入门控。

结论：W2 的“只有 `player-N` 可出牌/结束回合、终局后所有玩法输入 fail-closed”无法由当前公开 capability 完整重组。若只在 `session.ts` 检查阶段，将把规则写回游戏宿主，并且 UI 的 `ActionSink` 仍可绕过该检查。

### 路线 A · 补通用条件门（推荐）

为共享输入/身份牌能力增加可选 `ConditionExpr` 门：`KeyBinding.when` 控制是否产 Signal；`IdentityCardPile.playWhen` 在任何出牌命令结算前复用同一条件求值。游戏用 `GameFlow.onEnter` 维护 `can-play` Flag，两个入口都声明 `when:{kind:'flag',id:'can-play',equals:true}`。

- 代价：改共享引擎、组件协议、registry schema 和测试；属于确定性/跨游戏面，必须独立复查与撤修验红。
- 影响面：字段可选，旧蓝图逐字保持原行为；所有需要菜单/暂停/终局输入冻结的游戏可复用。
- 通用性：不是言弹专属，不读取 cardId，也不把 GameFlow 特例塞进输入系统。
- 选错代价：若条件语义未统一，会产生第二套门控；因此必须直接复用既有 `ConditionExpr/evaluateCondition`。

### 路线 B · 游戏层例外

允许 `RhetoricDuelSession` 在 `play/endTurn` 中读取 flow 并提前返回，同时为 UI 自写一层 action 过滤。

- 代价：规则分散到游戏宿主和 UI 适配层，需要登记 TS 例外债务。
- 影响面：只改本游戏，但公开输入、UI ActionSink 和测试辅助入口容易形成多套判定。
- 通用性：无；后续目录化卡牌游戏还要复制。
- 选错代价：会破坏“UI 只发 Signal”和“游戏层不建结算 system”的既定边界，未来仍需迁回引擎。

### 推荐与验收

推荐路线 A。验收必须包括：门开时输入生效；门关时 keybind 与直接卡牌命令均 fail-closed；reject trace 可说明原因；字段缺省时既有游戏与 golden 行为不变；同输入同 seed 双跑 hash 一致；独立复查和撤修验红通过。
