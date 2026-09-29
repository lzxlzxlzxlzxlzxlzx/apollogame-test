# 能力总览 Capability Plan — game-theft《潜取》

## 1. 游戏一句话

DokiWorld 悬浮偷窃会话：暴露持续上涨，玩家循环命中 QTE 来递增当前物品的偷取概率，逐件得手后可继续贪取或随时撤退。

## 2. 消费的引擎能力（对照 registry / 生产线手册实名）

| capability / 基座件 | 用来做什么 | 状态 |
|---|---|---|
| `e1-timer` | 固定 tick 推进暴露与 QTE 周期 | ✅ 现有 |
| `f1-resource` | 暴露、累计失败次数、命中/失误、已取得数量 | ✅ 现有 |
| `j1-state` | 当前会话与终局状态 | ✅ 现有 |
| `t2-keybind` | 鼠标/触屏/键盘语义动作转具名 Signal | ✅ 现有 |
| `t2-event-when` | 暴露满、清空物品等条件转事件 | ✅ 现有 |
| `t2-effect-apply` | 静态资源/状态效果及种子化静态概率门 | ✅ 现有，但不足以解释动态成功率与运行时物品 |
| `t3-flow` | `ready/selecting/qte/loot/terminal` 状态流 | ✅ 现有 |
| `w1-random` | 唯一规则随机源；同 seed 同结果 | ✅ 现有 |
| `t3-progressive-risk-session`（暂名） | 动态概率、运行时目标目录、持续风险、逐件取得、操作日志与确定性回执 | ⏳ Owner 已选 A；需通用能力下沉 |
| `external-game-session` / Doki App SDK | 版本化输入、一次完成、结果回传 | ✅ 有先例；需新业务合同 |

## 3. 摆成数据的规则面

| 数据表 | 内容 | 谁解释它 |
|---|---|---|
| `TheftSessionConfig` | 版本化内部常数、调用方给出的单一暴露速度 | `t3-progressive-risk-session` |
| `TheftTargetCatalog` | 目标和 1–12 个按调用方顺序排列、各自带最终 DC 的物品条目 | `t3-progressive-risk-session` |
| `TheftInputLog` | qte/continue/withdraw 的 tick 序列 | `t3-progressive-risk-session` |
| `TheftReceipt` | 终局、暴露、取得清单、统计、回放摘要 | `t3-progressive-risk-session` + 外部会话桥 |
| `TheftPresentation` | 皮肤与展示文案 | LayoutNode 投影；不影响 sim |
| `DokiEffectMapping` | 回执 outcome/acquired → inventory/crime/relationship/memory/history | DokiWorld verb 结算器（主项目域） |

## 4. 游戏层代码例外

无玩法例外。游戏目录只允许纯配置、LayoutNode 数据、资产引用、验收剧本和 SDK 薄投影；禁止在游戏层写动态概率循环、物品转移解释器、随机、DOM 或墙钟计时。

## 4.5 美术接入

- 主视觉实体皮肤槽：悬浮偷窃画框、QTE 轨道/指针、暴露环、物品卡、战利品袋、撤退按钮、四类反馈标记。
- 所有文字和数值实时渲染，不烘焙进背景图。
- 候选物品图片来自宿主 HTTPS 展示数据，失败回退包内图标；规则只保存稳定 item id。
- S6 前产出本地 AssetIndex 与美术台账；当前立项不生成或接入资产。

## 4.6 UI 呈现 · 华丽起手

- house 主题：S4 起手 `apolloOnyx`；S5 在闭集主题能力上换成“冷暗潜行→警戒红”专属皮肤，不自写 DOM/CSS。
- 常见屏：本作是一屏持续会话，不强套主菜单；终局使用 `buildStarterResult` 的结构语义改造为撤退/暴露/清空摘要。
- 成熟件：`ProgressBar.shape:'ring'` 暴露环、`buildItemSlot` 候选物、`Float` 命中反馈、`Particles` 得手反馈、`Panel.skin` 主框、`sheen-hover` 撤退 CTA、`Label.format` 数值、`fx:wobble/flash` 高危警报。
- 所有输入以 LayoutNode `action` 信号入队；交付前 `/check-ui`、`validateLayoutNode`、`ui-audit` 归零。

## 4.65 对手/敌人 AI

无小游戏内 AI。NPC 警觉与目击者由 DokiWorld 宿主折算为参数和后果；小游戏不运行 NPC 决策。

## 4.7 代码准入阶梯

| 规则 | 落级 | 说明 |
|---|---|---|
| 皮肤、文案、权威顺序物品目录、最终 DC、暴露速度 | L0 纯数据 | SDK 输入与 LayoutNode |
| 状态流、静态阈值、具名动作 | L1 现有 capability 重组 | timer/resource/state/keybind/event/flow |
| 动态概率 + 多目标逐件取得 + 权威回执 | L2 通用 capability 缺口 | Owner 已选 A：下沉 `t3-progressive-risk-session`，禁止游戏层解释器 |
| SDK 生命周期与回执投影 | 平台薄适配 | 零玩法规则 |

## 4.8 缺口实查与 Owner 裁决

### GAP-THEFT-01：渐进风险会话

实查：

- `t2-effect-apply` 的 `chance{num,den}` 只接受静态数值，不能按 DC 标定表取得初始值，再从 Resource 动态计算失败成长后的本次概率。
- `t2-keybind` 可透传一个字符串 `arg`，但 `Effect.targetId/value` 是装配期静态数据，不能按运行时 item/instance 目录逐件取得。
- `t3-flow` 只能闭集写 flag/state/resource，不生成含操作日志和取得清单的结构化回执。
- 因而用现有散件只能为固定物品数硬展开静态分支，无法支持 SDK 任意 1–12 个条目；这是虚胖数据，不是可接受重组。

两条路：

- **A（Owner 已选）**：下沉通用 `t3-progressive-risk-session`，服务偷窃、拆弹、黑客入侵、危险采集等“持续风险 + 循环技能检定 + 多目标收获”场景。代价是引擎新增解释器、确定性/快照/trace/注册测试。
- **B**：游戏层编写偷窃专属循环。短期代码少，但破坏数据驱动、确定性审计和第二消费者复用，且审计会判零能力/自由解释器红旗。

裁决：A。实施归引擎主程域，本立项不施工。

### DokiWorld 接缝缺口

实查主项目 `frontend/src/free-roam/minigames.ts`：`MiniGameDefinition.kind` 仅允许 `craft | unlock | combat_round`，并强制 kind 与 verb 相等；receipt 只有 `success | failure | aborted`。它不能表示 `steal/pickpocket`，也不能表示“取得物品且暴露”。需在 DokiWorld 主项目扩展小游戏协议/结算器；不得在 App 内直接写宿主背包。

## 5. 确定性声明

- 规则时间仅用固定 tick；禁 `Date.now/performance.now/setTimeout` 进入 sim。
- QTE 序列与偷取概率只消费 `RandomSeed`；表现随机使用独立、非规则随机流。
- item 遍历严格保持规范化输入数组顺序；同 tick 输入按连续 `seq` 处理。
- 同规范化输入、seed 与操作日志必须产出同一逐字段 receipt 和 replay digest。
- 需要快照/恢复：是；恢复后下一 tick 结果与不中断运行一致。

## 6. 评审记录

- 提交人 / 日期：Codex / 2026-09-28
- Owner 裁决：✅ A 方案（统一偷窃会话能力下沉）
- Lead 评审：待 S2 人门
