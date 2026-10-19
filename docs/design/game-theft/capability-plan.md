# 能力总览 Capability Plan — game-theft《潜取》

## 1. 游戏一句话

DokiWorld 悬浮偷窃会话：玩家在持续上涨的暴露压力下完成精准 QTE，并在 4+12 双环的隐藏槽位中逐格寻找物品，随时可带所得撤退。

## 2. 消费能力

| capability / 基座件 | 用途 | 状态 |
|---|---|---|
| `w1-random` | 开局槽位布局的唯一确定性随机源 | ✅ 现有 |
| `t3-risk-reveal-wheel` | 风险、QTE 偏移、翻格权、种子布局、取得与终局回执 | ✅ 本轮下沉 |
| LayoutNode + `apolloOnyx` | 透明悬浮框、双环槽位、暴露环、QTE 与撤退 | ✅ 现有 |
| `external-game-session` / Doki App SDK | 版本化输入、初始熵、一次完成与回传 | ✅ 有先例；Doki 接缝另案 |

旧 `t3-progressive-risk-session` 已完成并保留给“有序目标 + 概率成长”类游戏，但新方案的 game-theft 不再消费它。

## 3. 数据面

| 数据 | 内容 | 解释方 |
|---|---|---|
| `TheftDifficultyProfile` | 总难度映射后的 `blackSlotCount`、`exposureRateBpPerSecond` | game-theft 纯数据表 |
| `RiskRevealWheel` | `[4,12]` 环组、目标目录、QTE 参数、风险与快照运行态；`bank-perfect-during-qte` 开门规则和 `reshuffle-on-perfect` 目标换向 | `t3-risk-reveal-wheel` |
| `RiskRevealInput` | `start/qte-press/reveal(slot)/withdraw` | `t3-risk-reveal-wheel` |
| `RiskRevealReceipt` | 终局、取得、翻格、风险、QTE 统计 | `t3-risk-reveal-wheel` |
| `TheftPresentation` | 标题、目标名、皮肤、展示名 | LayoutNode 投影 |

## 4. 游戏层例外

无玩法例外。游戏目录只包含配置、蓝图装配、SDK/动作薄适配和 LayoutNode 只读投影；不得写随机布局、QTE 判定、翻格、风险或终局解释器。

## 5. 缺口实查与裁决

### GAP-THEFT-01（历史）：渐进风险会话

Owner 曾选择 A，下沉并独立复查 `t3-progressive-risk-session`。该能力继续保留，但新设计不再使用。

### GAP-THEFT-02：风险翻格轮盘

实查 registry 与随机、事件、UI 手册后确认：

- `t3-progressive-risk-session` 的目标严格按数组推进并做概率抽取，无法表达空间槽位、公开封锁位和玩家选格。
- grid/flow 能表达格与状态流，却没有种子化“封锁/目标/空位”布局、完美 QTE 累计且不中断旋转的翻格权、连续偏移风险公式与结构化回执。
- 游戏层自行组合会新增专属解释器，违反能力总览和确定性审计边界。

两条路：A 下沉通用 `t3-risk-reveal-wheel`；B 申请游戏层 TS 例外。Owner 2026-09-29 选择 A。

能力边界：引擎只消费最终 `blackSlotCount` 和 `riskRateBpPerSecond`，不解释业务难度。它可复用于拆弹、危险勘探、黑客节点和搜刮轮盘。

## 6. 确定性

- 固定 tick；禁墙钟。
- 开局 Fisher–Yates 只消费世界 `RandomSeed`；布局写入快照，恢复不重洗。
- QTE 偏移与惩罚使用整数运算；翻格无二次随机。
- 同配置、seed、输入序列必须得到相同布局和逐字段回执。
- opt-in DebugTrace 记录布局决策、相位转换、拒收与取得/终局提交，每 system/tick 最多 3 条。
