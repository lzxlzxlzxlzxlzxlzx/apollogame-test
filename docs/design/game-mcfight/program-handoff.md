# 给程序agent的项目介绍与首任务

> 2026-09-15 阶段切换：S2 已完成机器门、独立复查和 owner 人门。以下“S2第一任务”保留为历史，不再作为当前施工指令。当前程序只执行 [S3 游戏骨架设计 v1.0](s3-skeleton-design.md)，完成整批后统一自测、跑 S3 gate 并交独立复查。

> 当前收尾（2026-09-15）：[程序收尾结论](s2-program-closeout-20260915.md)。225项回归、类型/构建全绿；C1/C3—C6及播放器接口独立复查通过，六组撤修验红；REQ-001～003已按原合同closed。真实14段动作素材仍未验收，S2人审不代签。以下旧待办/失败状态保留为历史。
> 2026-09-15 收尾更新：原mortal死亡当拍掉落合同已恢复，225项相关回归通过、类型/构建通过；REQ-001～003按独立历史合同核对已closed。旧195通过/1失败记录为修复前历史。详见 [死亡掉落合同](s2-mortal-closeout.md)、[可选排序核对](s2-optional-order-audit.md)、[性能风险](s2-performance-risk.md)。本批独立复查结论另行落账；真实14段动作素材未验收。
> 2026-09-15 最新程序证据与具体退回/待复核项见 [连续批次总交接](s2-batch-delivery-20260915.md)。历史B/V02通过结论保留。
你将担任MC Fight的程序负责人（PE-game-mcfight）。项目owner是用户，另一会话负责策划、规则与验收设计。请先做S2能力验证，不直接移植完整游戏。

## 目录

- ApolloGame：C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone
- Unity原型：C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main
- 正式游戏ID：game-mcfight；显示名MC Fight。
- 正式策划入口：docs/design/game-mcfight/README.md。
- 旧版研究：docs/design/mc-fight/，其中规则和数值不是新版已批准设计。
- 游戏登记：src/launcher.tsx，状态coming-soon；games/game-mcfight/仅为项目枚举占位。
- 看板：在ApolloGame根执行 node scripts/game-pipeline.mjs board game-mcfight。

## 项目目的

我们要重建一个怪物军团配军布阵、自动战斗游戏。旧版缺少统一索敌、攻击和技能规范，每个单位专属实现较多。目标是在ApolloGame数据驱动架构中统一技能与决策，用公共能力表达单位差异，保留玩法创意而非复制旧bug。

用户已确认：仅PvAI；直接进入商店；商店→部署→战斗→结算→重新购买；商店点击单位看详情代替图鉴；允许拖拽部署；地面近战可在俯冲窗口反击飞行单位。普攻与主动技能统一为技能是设计方向。成功启动即进入CD且打断不退款、近战前摇保命中、硬控打断和俯冲地面资格等已确认规则，以combat-rulings-v0.2.md为准；其余伤害数值、护甲和未定边界见gdd.md及decisions.md。

## 先读什么

项目CLAUDE.md、AGENTS.md及docs/roles/PE.md；docs/llm-onboarding.md、docs/playbooks/game-production.md；正式GDD、decisions.md和s2-validation-spec.md；战斗/AI/运动/事件对应生产线手册。随后实查capability-registry和实现。

## 已知技术事实（请以现代码复核）

引擎有aggro、steering、State、SelfRule、Flow、Caster、prefab、hitbox和BT。此前aggro/state/self-rule/behavior-tree/flow/caster六组现有测试共68例通过，但未验证MC Fight机制组合。

注意：aggro每拍按标签找最近目标；标签多bit是OR；单位Relation只有一份；State主要记录状态；Flow多处全局ID寻址；BT无running和自动推进system；Caster按同名信号响应，不是完整技能生命周期。空间查询有本拍缓存，需要关注俯冲可攻击状态与查询顺序。

## 你的第一任务

当前交接优先读s2-program-next-step.md。保留第二批已有三轮时序证据，按目标捕获与失效取消 → 完整生命周期及打断清理 → 真实俯冲 → 少量动作素材适配的顺序推进。REQ-MCFIGHT-001仍open，A/B尚未裁定，不直接施工公共扩展。用真实引擎及临时测试fixture，提交可复跑证据。规则不完整的地方列出假设和对设计的影响，不把实验数值写成正式规则。

需要缺口时，先查现有组合，再给公共扩展与受控例外两条路径；不得擅自写另一套战斗引擎、每怪物私有状态机、手写React游戏屏或自行改用户规则。现有能力验证可先做，新增能力按项目协议裁决后实现。

## 协作与完成标准

策划出规则和独立验收剧本，程序实现与自测，复查人不得是施工人，人门不得代签。发现规则疑点在decisions.md对应项下反馈；提出技术证据与建议，最终产品规则由用户决定。

首轮交付是能力验证报告和可复跑场景，不是“游戏完成”。勿直接修改gdd.md的已确认规则，不伪造pipeline证据。未发现两份目录各自的.git，操作版本控制前核实真实仓库，不机械执行历史分支重置、push或stash。
