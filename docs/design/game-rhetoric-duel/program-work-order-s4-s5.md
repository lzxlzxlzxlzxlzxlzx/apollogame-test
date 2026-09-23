# 《言弹交锋》下一阶段程序施工单

## 0. 工单目标与当前基线

> **迁移裁决（owner，2026-09-23）**：本施工单中的主实现位置改为 `games/game-rhetoric-duel/`。外部 App 仅保留为迁移比对原型；DokiWorlds 联调移至引擎导出后的薄适配阶段，不得反向承载玩法实现。详见 [internal-game-migration.md](./internal-game-migration.md)。

目标：在不复制 demo 程序、不引入游戏层规则解释器的前提下，完成 S2 引擎交付闭环、S4 完整演出、S5 正式视觉与审计，使 `game-rhetoric-duel` 成为可独立导出的内部游戏。

当前已知基线：

- 引擎能力分支：`capgap/rhetoric-identity-cards`，首版已推送。
- DokiWorlds 应用分支：`game-rhetoric-duel`。
- 应用骨架提交：`d350996 feat: add rhetoric duel DokiWorld app`。
- 应用工作树：`C:\Users\24652\Desktop\projects\games\dokiworlds-apps-rhetoric`。
- 已有：输入校验、内部卡表、引擎能力消费、资源/flow/event 接线、确定性和终局无头测试、LayoutNode 骨架、构建自检。
- 未闭合：受控抽牌能力与 Windows 外部启动器修复尚未形成可复现的远端引擎提交；演出、真实资产、UI 审计、真宿主联调未完成。

策划权威文件：

- `docs/design/game-rhetoric-duel/content-v0.md`
- `docs/design/game-rhetoric-duel/presentation-spec-v0.md`
- `docs/design/game-rhetoric-duel/integration-contract-v1.md`
- `docs/design/game-rhetoric-duel/gdd.md`

## 1. 施工纪律

1. 引擎和 App 两个仓库分别提交，禁止把一边的无关文件带进另一边。
2. 不在当前异常/脏的 ApolloGame 工作树上直接整理提交；从已推送分支建立干净工作树，再移植明确的最小差异。
3. App 最终必须依赖一个已推送、可重新检出的引擎提交；不得依赖本机未提交文件才能构建。
4. UI 写世界只能发送具名 action/Signal；所有规则仍由 capability 消费。禁止 React 自由屏、自由 DOM、自由 CSS 动画、手写 canvas。
5. 动画只表现已提交结果。动画完成、墙钟、图片加载、帧率和 reduced-motion 均不得驱动模拟。
6. 真遇到现有能力表达不了的形态，先查 registry 和手册，留下实查证据，再走 A/B 裁决；禁止游戏层临时特判。

---

## 2. W1｜关闭 S2 引擎交付尾项（最高优先级）

### 2.1 建立干净引擎施工面

1. 从远端 `capgap/rhetoric-identity-cards` 新建干净 clone/worktree。
2. 核对首版身份牌提交完整包含：`t2-identity-card-play`、测试、tier2 export、registry/生成索引和 review 记录。
3. 从旧工作树只提取以下明确差异，逐块审阅后应用：
   - 受控抽牌命令及其测试；
   - Windows 外部游戏启动器将绝对路径转换为 `file://` URL 的修复及测试。
4. 不复制整个目录，不覆盖远端已有文件，不携带 game-dice 或其他项目的在途修改。

### 2.2 受控抽牌验收

受控抽牌必须满足：

- 开局只按 `openingHand` 抽牌；后续只在回合流程发出抽牌命令时按 `drawPerTurn` 抽牌。
- 不再每 tick 自动补满手牌。
- 手牌不得超过 `handLimit`；牌库耗尽时按既定规则确定性洗回弃牌堆。
- 同 seed、同牌组、同抽牌命令序列得到相同牌序。
- 非法数量、重复消费、缺少 RNG 且确需洗牌时 fail-closed，并记录 `DebugTrace.reject`。
- 抽牌能力保持通用，不出现 `rhetoric`、`progress`、敌人或 DokiWorlds 专属语义。

### 2.3 Windows 启动器验收

- Windows 绝对模块路径经 `pathToFileURL` 或等价标准机制转换后再动态 import。
- macOS/Linux 原有路径行为不回归。
- 外部 App 的 `build`、`test`、`run` 三条命令在 Windows 干净工作树可执行。
- 不硬编码用户目录，不写本机专属盘符。

### 2.4 引擎测试与交付

至少执行并记录退出码：

```text
identity-card-play 定向测试
capability registry / registry guard
system graph / declaration audit
TypeScript noEmit
外部 App build / test / run 自检
scoped gate（按共享引擎面）
```

要求：

- 阅读 stderr，确认没有身份牌新增的系统拓扑告警。
- 独立复查人复跑，并至少对“受控抽牌不再自动补牌”和“Windows file URL 转换”各做一次带锚点撤修验红。
- 推送一个新的引擎提交，并记录远端分支和 SHA。
- 更新 `CAPGAP-RHETORIC-001` 状态；只有复查、可重检提交与门禁证据齐全后才允许关闭。

### 2.5 App 固定依赖

在 `game-rhetoric-duel` App 中把引擎依赖固定到上述可重检提交或受控本地包产物：

- 新机器 clone 两个仓库后，可以按 README 一次安装并构建。
- 删除对旧工作树未提交文件的隐式依赖。
- 在 App README 写清引擎版本/SHA、安装命令和构建命令。

**W1 退出条件**：从干净检出开始，App 无需旧工作树即可通过 5 个无头测试、类型检查、Vite 构建和启动自检。

---

## 3. W2｜把策划内容接成唯一数据源

### 3.1 卡牌目录

将 `content-v0.md` 中 10 张基础言弹写入 App 内部版本化目录：

- `cardId`、名称、费用、最大副本、效果、卡面文案、`skinKey`。
- 效果只允许当前批准的 `modify-resource / add|set` 闭集。
- 宿主继续只能传 `cardId + copies`，不能覆盖名称、费用、功能、卡图或最大副本数。
- `catalogVersion` 不匹配、未知卡或副本超限必须在开局前拒绝。

### 3.2 起始牌组与敌人

- 接入 `starter-calm-reason` 的 15 张牌组样例。
- 接入石七、罗掌柜、姜教习三份开发期遭遇 fixture。
- 敌人意图仍是固定、有序、长度覆盖 `turnLimit` 的脚本；v1 不做自适应 AI。
- fixture 只用于本地预览/测试；正式运行仍以宿主 input 为准。

### 3.3 数据测试

- 10 个 `cardId` 全部唯一，效果均在批准资源闭集内。
- 起始牌组总数、副本上限与目录一致。
- 三个遭遇均可验证，意图长度不短于回合上限。
- 使用固定 seed 为三名敌人至少各跑一局胜利路径和一局失败路径。

**W2 退出条件**：卡牌与敌人数据不依赖 UI，headless 会话可完整跑通三份遭遇。

---

## 4. W3｜建立只读演出转场合同

### 4.1 合同

实现 `presentation-spec-v0.md` 中的只读转场数据，至少包含：

```text
before / after / kind / cardId? / drawnCardIds? /
resourceDelta? / intentId? / outcome?
```

允许的 `kind`：`enter`、`card-played`、`enemy-turn`、`terminal`。

### 4.2 边界

- 转场必须从同一条已提交 session 状态变化派生，不得重新计算卡牌效果。
- `resourceDelta` 必须由 before/after 或结算记录得到；不能从卡牌说明文字解析。
- 演出队列、当前视觉 phase、飞行位置等均为 render-only，不进入模拟 hash、存档或结果合同。
- 恢复存档/重新挂载时直接显示最新已提交快照，不重播历史命令。
- 忙碌阶段只负责输入锁；不能把“动画结束”当作回合逻辑条件。

### 4.3 测试

- 一张牌只生成一次 `card-played` 转场，不重复扣费。
- 敌人行动的压力变化和下回合抽牌被拆成可辨识的演出数据。
- 胜利后不再生成敌人行动转场。
- reduced-motion/skip 后最终 view snapshot 与普通播放完全一致。

**W3 退出条件**：可以在无浏览器测试中断言完整阶段序列和最终快照一致。

---

## 5. W4｜S4 完整演出接线

### 5.1 固定播放链

按以下阶段逐项实现，不能把敌人行动、压力变化、专注刷新和抽牌压成一次瞬间刷新：

```text
进入：camera → reveal-intent → deal-opening-hand → ready
出牌：card-lift → card-flight → impact → opponent-response → ready
回合：round-end → enemy-intent → enemy-impact → focus-refresh → deal-new-cards → ready
胜利：victory-impact → portrait-resolve → result-panel
失败：failure-impact → portrait-dominates → result-panel
```

### 5.2 编排能力

- `t3-timeline` 负责“何时发 cue”；cue 只发 Signal/Flag/Resource/SpawnRequest。
- `t1-tween` 负责立绘/卡牌的位移、缩放和透明度。
- `VisualEffect` 闭集负责 `pop / float / shake / glow / sheen / flash / fade`。
- 不使用散落 `setTimeout` 作为游戏演出真相；不在事件 handler 中写规则。
- 提供 `skip-presentation` 信号与 reduced-motion 路径，能直接抵达当前 `after` 快照。

### 5.3 UI 信息层级

使用 `apolloBrocade` 与成熟 LayoutNode 组件完成：

- 顶部/侧部：敌人名称、目标、回合、当前意图、进度条。
- 中央 play-field：背景、敌人立绘、敌人反应、数值飘字与卡牌飞行落点。
- 底部：压力、专注、手牌、牌库/弃牌数量、结束回合与退出。
- 卡牌必须显示费用、名称、功能、内部卡图槽；不可用卡应有明确禁用原因。
- 终局用成熟 result starter；胜/负只有确认/退出行为，不做奖励逻辑。

所有交互节点有唯一 id；写世界只通过 action 信号。禁止在 LayoutNode handler 中修改 session。

### 5.4 必备视觉反馈

- 入场：背景与立绘出现、意图揭示、起始手牌依次发入。
- 抽牌：只给 `drawnCardIds` 播放，从牌库方向按顺序进入手牌。
- 出牌：原牌抬起，残影/投影飞至中央，原手牌位置正确收拢。
- 结算：`progress` 用金色/正向飘字，`pressure` 用危险色与轻微抖动，`focus` 扣除可见。
- 敌人行动：先放大意图，再播敌人反应，之后才改变压力显示。
- 胜负：最后一次资源冲击先完成，再出现终局面板。

### 5.5 输入与无障碍

- 只有 `ready` 阶段允许新的出牌、结束回合或退出命令。
- 1–6 数字键可选择对应手牌；焦点不会在动画后丢失。
- `aria-live` 只播报语义结果，不播报装饰动画。
- reduced-motion 下取消飞行/抖动等强运动，但保留状态变化和文本反馈。
- 图片失败后切换后备视觉，不能导致对局中断或永久 busy。

### 5.6 S4 测试

- 阶段序列测试：入场、单张出牌、结束回合、胜利、失败、退出。
- 重复点击/双击不会产生第二条命令。
- 动画中跳过、窗口失焦、图片失败、重新挂载后都能回到 `ready` 或终局。
- 数值飘字与真实 `resourceDelta` 完全一致。
- 终局屏唯一出口真点后，SDK 只提交一次结果。

**W4 退出条件**：真浏览器完成“开局 → 抽牌 → 出牌 → 敌人行动 → 下一回合 → 胜/负 → 退出”整链，且最终状态与无动画模式一致。

---

## 6. W5｜S5 真实资产与视觉精修

### 6.1 先接消费槽

以下槽位必须先在实际渲染路径可消费，再允许进入资产台账：

- `skin.background`
- `skin.opponent.portrait`
- `skin.card.<cardId>`（10 张）
- `fx.card-flight`
- `fx.progress-impact`
- `fx.pressure-impact`
- `fx.enemy-response`

加载顺序必须是 `skinMap[skinKey]` 优先，硬编码路径只作回退。不得创建无消费端的台账行。

### 6.2 资产管理交接

实际图像的生成/导入/登记交给 asset-manager：

- 10 张基础言弹卡图；
- 石七、罗掌柜、姜教习 3 张敌人立绘；
- 旧巷、药铺、讲堂 3 张背景；
- 必要的图集/序列帧（若演出确实消费）。

资产必须落游戏本地索引并保留授权、来源、风格与 provenance。AI 生成物先进入待审区，人审批准后才登记。

宿主传入的 `https` 背景/立绘仍是 render-only 外部引用，与游戏本地后备皮肤分开；不得进入 sim 或 hash。

### 6.3 视觉精修

- 统一卡框、字体层级、费用徽记、图像裁切和不可用态。
- 敌人立绘至少有待机呼吸、受压反馈、行动压迫、胜败姿态四种可辨识状态；优先用现有 tween/effect 重组。
- 处理 16:9、较窄窗口和常用缩放，不得遮住手牌或终局按钮。
- 禁止靠堆 Glow 掩盖空白素材；按视觉评分表检查构图、层级、材质、色彩、反馈与完成度。

**W5 退出条件**：真实素材全部可见、替换后即时生效、台账零孤儿、素材失败仍可玩。

---

## 7. W6｜UI 自检、真渲染对齐与回归

### 7.1 UI 机械门

- `validateLayoutNode` 对所有屏零 issue。
- 建立本游戏 `ui-audit` 脚本，检查开局、对局、终局三个关键画面。
- overlap、对比度、透明度、布局卫生全部归零；同时检查深色与 daylight/亮主题。
- 任何低对比、意外重叠、弹窗透穿必须修复，不能以“截图看着还行”豁免。

### 7.2 真渲染自证

至少保存以下截图到策划档案：

1. 入场与意图揭示；
2. 起始手牌发完；
3. 卡牌飞行；
4. 进度变化；
5. 敌人行动与压力变化；
6. 下一回合抽牌；
7. 胜利终局；
8. 失败终局；
9. reduced-motion；
10. 图片加载失败的后备视觉。

建立 S4/S5 alignment 单，逐条对照 `gdd.md`、`content-v0.md`、`presentation-spec-v0.md`。循环修正到：

- ❌ 为零；
- 每条 ⚠ 有明确裁决去向；
- `align-count` 退出码为 0。

### 7.3 回归门

- 原 5 个无头测试继续通过。
- 增加演出投影、重复提交、skip/reduced-motion、结果幂等、图片失败测试。
- TypeScript、构建、启动自检、游戏技能审计、资产台账审计、UI 审计全部通过。

---

## 8. W7｜DokiWorlds 真宿主联调与发布

### 8.1 输入联调

用正式宿主分别验证：

- 三份合法遭遇；
- 未知卡、超副本、错误目录版本、意图不足、非法数值、非 HTTPS 图片等拒绝路径；
- 宿主图片成功、失败与无图片三种路径；
- 固定 seed 重复启动得到相同首手与流程。

### 8.2 输出联调

- 达成目标只发送一次 `win`；压力/回合失败只发送一次 `loss`；主动退出发送 `exited`。
- `normalizedScore` 按契约固定映射；不回传奖励、卡组修改或存档补丁。
- 宿主奖励与跳转只在 DokiWorlds 一侧发生。
- 刷新、重复点击、终局动画和 SDK 重连不会重复提交结果。

### 8.3 包与清单

- manifest 的 input/output contract、版本、入口和公开资产路径正确。
- 生产包不依赖工作区绝对路径或开发服务器。
- 在隔离目录解包/启动验证。
- 输出最终 App 分支与提交 SHA；若创建 PR，附到任务。

**W7 退出条件**：正式 DokiWorlds 能调用一局、收到一次正确结果，并由宿主完成后续跳转。

---

## 9. 提交与汇报格式

建议最少拆成以下可审查提交：

1. 引擎：受控抽牌 + Windows 启动器修复及测试。
2. App：固定引擎版本 + 内容目录/敌人 fixtures。
3. App：只读演出转场 + 阶段测试。
4. App：S4 UI/FX 演出完整链。
5. App/资产：消费槽、正式资产与台账。
6. App：审计、自证、DokiWorlds 联调与发布清单。

每次汇报必须包含：

- 仓库、分支、提交 SHA；
- 本次修改文件；
- 实际运行的命令及退出码；
- 真渲染截图/对齐单位置；
- 尚未完成项和是否阻塞下一阶段；
- 不得以“测试已写”“文件已存在”代替实际通过证据。

## 10. 禁止提前宣称完成

出现任一情况，均不得宣布 S4/S5/发布完成：

- App 仍依赖本地未提交引擎文件；
- 抽牌、出牌或敌人行动只有数字跳变，没有规定演出节拍；
- 没有真浏览器自玩和截图序列；
- UI audit、资产 ledger 或 alignment 尚未归零；
- 终局出口未真点；
- DokiWorlds 尚未完成一次真实调用与结果回传。
