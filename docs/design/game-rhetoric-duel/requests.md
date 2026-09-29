# game-rhetoric-duel｜游戏级需求与裁决

## W5.2-UI-FOCUS-001 · LayoutNode Button 键盘焦点可见态 · 2026-09-24 · owner 已选 A · status: independently reviewed; awaiting owner scoped gate

### 实查原文

- 已查 `src/ui/components/types.ts` 的 `ButtonProps`、`src/ui/components/catalog.ts` 的 Button schema、`src/ui/components/render.ts` 的 Button 渲染，以及 `src/ui/components/server.ts` 的共享交互样式；公开数据契约没有焦点皮肤或焦点环闭集字段。
- `render.ts` 当前对 Button 写入 `outline: none`；`server.ts` 只提供 hover/active 交互样式，没有 `:focus-visible` 对应视觉。因此键盘聚焦虽可发生，W5.2 的 focus-visible 截图无法出现可观察状态变化。
- 已查机读 capability catalog 与 `docs/playbooks/ui.md`；模拟 capability 不承载 UI 焦点表现，现有 LayoutNode/Button 也没有可以重组出焦点可见态的公开能力。
- 游戏侧补 DOM、CSS、canvas 或焦点事件逻辑均违反“UI 只用 LayoutNode、不得手写 DOM/CSS/canvas 逃生”；把焦点表现写进本游戏也无法复用。

结论：W5.2 的 hover、pressed、disabled 均已有真渲染证据；focus-visible 是共享 UI Button 的真实表达缺口，须由 owner 裁决路线后才能关闭 W5.2。本项不涉及玩法规则、SDK、卡牌数值或敌人逻辑。

### 路线 A · 补共享 Button 的闭集 focus-visible 表现（推荐）

由 PUI 在共享 Button 渲染面增加通用、确定性的 `:focus-visible` 可见环；优先使用现有主题色/受控默认样式，不开放任意 CSS 字符串。补渲染测试、真浏览器截图、UI audit，以及独立复查和带锚点 sabotage。

- 代价：触及 `src/ui/**` 专职域，须由 PUI 施工；W5.2 要等待该能力通过并由游戏真渲染复验。
- 影响面：所有 LayoutNode Button 的键盘可访问性统一改善；鼠标 hover/pressed、按钮动作与模拟状态不变。
- 通用性：所有键盘可操作菜单和游戏 UI 均可复用，不含言弹交锋专属判断。
- 选错代价：若开放自由 CSS/任意样式透传，会形成 UI 逃生口；若只改本游戏，会留下共享控件无焦点反馈的系统性缺陷。

### 路线 B · 游戏层焦点视觉例外

允许本游戏用专属 DOM/CSS 或事件逻辑绘制焦点态。

- 代价：只改本游戏，短期较快，但需要登记游戏层例外债务。
- 影响面：焦点表现与共享 Button 分裂，后续游戏重复实现。
- 通用性：无。
- 选错代价：直接违反本项目 LayoutNode 闭集和禁止手写 DOM/CSS 的红线，且 W5.2 工作单明确要求成熟共享件；不推荐。

### 推荐与验收

推荐路线 A。验收必须包括：键盘 Tab 聚焦出现清晰且不依赖 hover 的视觉环；失焦后消失；disabled 不可获得交互焦点反馈；既有 click/Signal 行为不变；UI audit 与共享 UI 测试全绿；真渲染截图覆盖 focus-visible；独立复查撤掉焦点修复后必须验红。

### 施工实证

- 共享 Button 输出主题 `text` 焦点令牌；共享交互样式只在 `:not([disabled]):focus-visible` 时绘制 3px 内缩实线环，未增加自由字段或游戏专属逻辑。
- 810×506 真浏览器机器探针：`activeId=rhetoric-end-turn`、`focusVisible=true`、`outlineWidth=3px`、`outlineStyle=solid`、`outlineColor=rgb(238,232,220)`、`outlineOffset=-3px`。
- `button-focus.png` 已刷新；共享 UI 468/468、本游戏 54/54、TypeScript、production build、UI audit、game-skill-audit 均退出 0。
- 独立复查已 PASS：撤掉唯一 focus-visible 规则后，静态测试与真浏览器 probe 均退出 1；逐字恢复后全绿。证据见 `review/W5.2-real-embed-readability.md` 的“路线 A 追加复查”。仅待 owner 亲自运行 scoped gate 后关闭本项。

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
