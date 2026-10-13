# SIMLIFE-ENG-15A Review 单

| 项 | 内容 |
|---|---|
| 施工 | BDM程序 |
| 复查 | 本会话策划（非施工主体） |
| 状态 | ✅ 已独立验收（2026-10-09） |
| Git | 未执行；项目规则禁止 agent 执行任何 Git/GitHub 操作 |

## 实现摘要

- 新增 `t2-life-relationship`，权威组件为 `LifeRelationshipCatalog/State/Projection`，gift outcome 为 `LifeGiftActionResult`。
- 单一写口 `applyRelationshipBatch`：候选按 `priority DESC → npcId → ruleId → sourceId`；同 NPC 同拍非互斥写 fail-closed；日预算后再做 min/max；gift 的库存、关系、预算、receipt 全预检后提交，零 applied 不扣物。
- 定序：`life-calendar / Life outcomes / dialogue → life-relationship (Commit) → life-quest (Commit read)`。跨日只清预算与当日 receipts，不改关系值。
- Life Quest 增加 relationship value/level condition 与 delta effect，并复用关系写核；Dialogue `ConditionExpr.relationship` 与 `relationshipEffects` 同样进入该写核。
- Little Valley JSON：Mayor/merchant 独立账本；Mayor 交谈 +2/day、芜菁礼物扣 1 后 +5/day；friendly=5 解锁友好对话；HUD 只读 projection。

## 施工验证

- 定向核心 Vitest：`life-relationship + life-quest + raw JSON + game-simlife`，4 files / 34 tests（含新增 7 项）全绿；连同 component map / registry / system graph 共 7 files / 60 tests。
- TypeScript：本单文件无错误；全库仍被既有 game-dice/game-theft/gal-package/launcher 错误阻断。
- 撤修验红锚点：把 `mayor.turnip-gift.trigger.itemId` 改成未声明 id，validator 必须在精确路径拒绝；把 same-NPC 冲突检查撤掉，冲突测试必须转红。
- 三尺寸 UI audit（640×720 / 1060×760 / 1440×900）阻断、重叠、硬对比、AA 警告均为 0；短生命周期 Edge 已关闭、临时目录由工具清理。未启动服务、未修改数据库、未执行 Git/GitHub、未导入资产。
- 真 LayoutNode 截图：`self-check/shots/eng15/relationship-hud-1060x760.png`，可见 HUD 只读的 `镇长 neutral 0` 与 NPC 互动菜单。Trace 锚点测试重建 `decision candidates=mayor/mayor.daily-greeting` → `commit mayor:0→2 / neutral→neutral`，同 tick 2 条（≤3）。

## 独立复查重点

1. 独立复跑 strict schema/ref、两 NPC 隔离、gift 原子回滚、同拍冲突、跨日重置、snapshot/hash/restore。
2. 撤修须带上述 validator 或 conflict 锚点命中断言；本单仅作导航，不作为证据。
3. 复核 system graph 中 relationship 位于 dialogue/outcomes 后、quest 前，并阅读告警而非只看退出码。

## 独立复查结论（2026-10-09）

- 独立复跑关系、任务、严格 JSON、Little Valley、registry/component/system graph：**7 文件 / 60 测试**通过。system graph stderr 仅来自其自身 L/P 合成环夹具；真实 Life 子图无环。
- 独立撤修：将 Mayor 送礼规则的 itemId 改为 `crop.unknown`；运行时 JSON 管道准确 **1 红 / 2 skipped**，在 `$.relationships[0].rules[1].trigger.itemId` 以 `unknown item` fail-closed。已精确恢复；JSON 与关系锚点 **2 文件 / 10 测试**重跑通过。
- 架构核查：送礼条件/库存扣减/日预算/receipt 由单一关系写核处理，任务与对话不直写关系状态；UI 只读 projection。Mayor 与 Merchant 均为独立实体账本。
- 结论：**PASS**。NPC 好感现已可由严格 JSON 产出并确定性地驱动对话与剧情，不依赖小山谷专属 Flag/Resource 解释器。
