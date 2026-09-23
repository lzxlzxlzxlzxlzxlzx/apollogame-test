# game-rhetoric-duel｜立项档

暂定中文名：《言弹交锋》。这是一个由 ApolloGame 内部启动、可经引擎独立导出的卡组式言语对抗游戏。

| 文档 | 用途 | 状态 |
| --- | --- | --- |
| [brief.md](brief.md) | 立项边界、体验与冻结结论 | S1 草案 |
| [gdd.md](gdd.md) | 首局规则骨架与内容边界 | S1 草案 |
| [content-v0.md](content-v0.md) | 基础言弹、起始牌组与首发敌人 | 可供程序接线 |
| [presentation-spec-v0.md](presentation-spec-v0.md) | 出牌、抽牌、敌人行动与终局的演出规格 | 程序/美术共同基线 |
| [program-work-order-s4-s5.md](program-work-order-s4-s5.md) | S2 收尾至 DokiWorlds 发布的完整程序施工单 | 待程序执行 |
| [integration-contract-v1.md](integration-contract-v1.md) | DokiWorlds 调用与返回契约 | 待宿主确认 |
| [capability-plan.md](capability-plan.md) | 引擎能力核查与实现准入 | owner 已选 A，待登记/施工 |
| [capability-gaps.json](capability-gaps.json) | 未闭合能力缺口的机器可读台账 | open |
| [internal-game-migration.md](internal-game-migration.md) | owner 对内部游戏唯一实现的迁移裁决 | 生效 |

## 当前闸门

owner 已裁定以 `games/game-rhetoric-duel/` 作为唯一玩法实现；外部 App 原型只保留比对，不再是主线。能力未落地前，不可开始战斗规则、抽牌或结算的程序实现。
