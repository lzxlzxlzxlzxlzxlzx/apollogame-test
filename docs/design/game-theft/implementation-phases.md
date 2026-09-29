# 《潜取》阶段拆分

严格按生产流程板一次只做当前一关；S3 之前不创建 `pipeline.json` 假造状态。

| 阶段 | 本游戏产物 | 退出条件 |
|---|---|---|
| S1 立项 | `brief.md`、`gdd.md` | Owner 确认工作名/核心循环/非目标 |
| S2 能力计划 | `capability-plan.md`、`capability-gaps.json`、SDK 草案 | Lead 审核；P1 缺口有施工归属且未以游戏代码绕过 |
| 引擎前置 | `t3-progressive-risk-session` 或 owner 指定的同义通用能力 | 主程独立施工与复查；确定性、快照、trace、注册测试完成 |
| Doki 前置 | `steal/pickpocket` 小游戏协议与多结果回执 | 主项目能启动会话并把回执映射为事务 Effects |
| S3 骨架 | 纯数据 manifest、空 UI、Doki App 目录与合同校验 | parse/load/2 tick；空输入演示与真实 input 分离 |
| T2/S4 竖切 | 单物品、单 QTE、成长、撤退/暴露的最小闭环 | AC-01/03/05/07 conformance 绿；真手势可见 |
| S4 完整玩法 | 多物品、继续偷、所有终局、权威回执 | AC-01..10；无死路/空按钮/假数据 |
| S5 UI | LayoutNode 正式信息架构与反馈 | `/check-ui`、validate、深/亮主题审计、窄屏压力测试 |
| S6 美术/音频 | 偷窃画框、QTE、物品卡、暴露、战利品袋皮肤与 SFX | 台账无 MOCK、资产闭包完整 |
| S7 品质 | 节奏/反馈/风险可读性调优 | 八维评分全 ≥2；数值目标由 owner 确认 |
| S8 终检/出包 | 自包含 DokiWorld App | scoped gate、SDK 生命周期、哈希/资产闭包、真宿主目击 |

## 实施边界

- 游戏 PE 只消费已交付能力；不修改 `src/engine`、`src/skills` 或 DokiWorld 主项目。
- 新能力施工与复查必须由不同人员完成。
- DokiWorld 主项目改动在其仓库规则、产品 Wiki和独立评审下进行；本目录只定义消费合同。
- 本立项不授权启动服务、数据库写入或任何 Git/GitHub 操作。

