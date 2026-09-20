# MC Fight S4 程序整批交接

日期：2026-09-15。当前阶段：S4 设计准备；只有 S3 三门通过后方可开始本单施工。

## 唯一规则基线

程序先读 [S4可玩竖切设计](s4-playable-vertical-slice.md)、[S3骨架设计](s3-skeleton-design.md)、[战斗裁定](combat-rulings-v0.2.md)和[能力计划](capability-plan.md)。冲突时按“用户后续决定 → 战斗裁定 → S4设计 → S3架构 → 早期提案”的顺序处理。

## 工作方式

这是一个整批任务。程序在 S3 已冻结的结构上连续完成商店、部署、六单位战斗、结算与再购买循环，不逐小项等待策划确认。遇到实现选择时优先遵守现有 capability 和生产手册；只有规则矛盾或现有能力无法表达时登记具体阻塞，不自行发明公共机制。

不得修改 `docs/design/game-mcfight/acceptance/*.scenario.jsonc` 来配合程序结果。这些剧本属于策划验收输入。若剧本自身有误，报告具体条款，由策划修订并记录。

## 交付包

- 可从正式游戏入口完成一整局并继续第二轮。
- 六个首批单位和基础敌军预设。
- 真实拖放、非法落点回退、购买/出售、胜负及清理。
- `acceptance-adapter.ts` 和程序侧 walkthrough 测试。
- `docs/design/game-mcfight/S4-alignment.md`。
- `docs/design/game-mcfight/self-check/shots/` 至少5张连续截图。
- `docs/design/game-mcfight/s4-program-evidence.md`，包含命令、退出码、浏览器路径、参数表、证据路径、已知风险。

## 交审门槛

相关测试、类型检查、构建、组合审计、全部策划验收剧本、真实浏览器旅程及 `node scripts/game-pipeline.mjs gate game-mcfight S4` 全绿后，一次性交给非施工复查者。程序不得登记独立 review 或 owner signoff。

S4三门通过后的下一项不是直接做S5，而是执行 [84单位全量内容复原路线](full-restoration-roadmap.md)。S4的六单位实现必须能够作为全量装配的稳定样板，不得以“原型以后会丢弃”为由另写临时代码。
