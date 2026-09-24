# game-rhetoric-duel｜立项档

暂定中文名：《言弹交锋》。这是一个由 ApolloGame 内部启动、可经引擎独立导出的卡组式言语对抗游戏。

| 文档 | 用途 | 状态 |
| --- | --- | --- |
| [brief.md](brief.md) | 立项边界、体验与冻结结论 | S1 草案 |
| [gdd.md](gdd.md) | 首局规则骨架与内容边界 | S1 草案 |
| [content-v0.md](content-v0.md) | 基础言弹、起始牌组与首发敌人 | 可供程序接线 |
| [demo-reference-bible.md](demo-reference-bible.md) | demo 画面、卡牌、动画、素材与像素验收的第一交付基准 | 已完成实查拆解 |
| [presentation-spec-v0.md](presentation-spec-v0.md) | 出牌、抽牌、敌人行动与终局的演出规格 | 程序/美术共同基线 |
| [program-work-order-s4-s5.md](program-work-order-s4-s5.md) | S2 收尾至 DokiWorlds 发布的完整程序施工单 | 待程序执行 |
| [program-work-order-w5-demo-parity.md](program-work-order-w5-demo-parity.md) | W4 复查通过后的 demo 视觉对齐、正式资产与 W5 出口 | 当前下一施工单 |
| [integration-contract-v1.md](integration-contract-v1.md) | DokiWorlds 调用与返回契约 | 待宿主确认 |
| [capability-plan.md](capability-plan.md) | 引擎能力核查与实现准入 | CAPGAP-001/002 已完成并复查；W1 配置施工中 |
| [capability-gaps.json](capability-gaps.json) | 未闭合能力缺口的机器可读台账 | 无未闭合共享缺口 |
| [internal-game-migration.md](internal-game-migration.md) | owner 对内部游戏唯一实现的迁移裁决 | 生效 |

## 当前闸门

owner 已裁定以 `games/game-rhetoric-duel/` 作为唯一玩法实现；外部 App 原型只保留比对，不再是主线。身份牌与已提交转场能力均已落地并复查；后续按 [内部迁移施工单](internal-game-migration.md) 的 W0–W8 阶段出口推进。
