# MC Fight 策划入口

> 当前阶段（2026-09-15）：S2 三门已通过，进入 S3 骨架关。程序当前唯一施工基线为 [S3 游戏骨架设计 v1.0](s3-skeleton-design.md)。S3 冻结长期分层和数据关系，只搭正式入口、统一目录、三个代表单位及真实装载/点击骨架；完整玩法循环归 S4。

> S4 已提前完成策划设计，待 S3 三门通过后启用：[S4 可玩竖切设计 v1.0](s4-playable-vertical-slice.md)及[S4 程序整批交接](s4-program-handoff.md)。S4 完成时应得到“购买→部署→自动战斗→结算→再购买”的首个可玩原型。

> 最终交付目标不是6单位原型。S4通过后必须完成 [84单位全量内容复原路线](full-restoration-roadmap.md)，作为S5前置里程碑；最终版本须完整继承旧版单位内容，并用新版统一架构重新实现。

> 当前S4独立复查为CONCERNS。策划处理决定见 [S4 CONCERNS处理](s4-review-disposition-20260915.md)：R1旧版事实冻结可先行，R2全量程序装配等待S3证据刷新、S4 PASS、人门以及共享回归处置完成。

> R1事实冻结已完成：[R1全量复原数据交接](r1-restoration-data-handoff.md)、[84张程序单位卡](r1-unit-cards-v1.json)与[84行复原矩阵](full-restoration-matrix.json)。程序R2须直接消费既有旧版事实库，不能再散读Unity代码或自行猜值。

> S4完成后的程序下一项是 [R2：84单位数据装配施工单](r2-program-work-order.md)。R2一次性建立84单位的正式内容目录、技能/决策/表现槽和校验器；真实逐单位行为验证留在R3。

> R2已独立复查PASS（仅内容装配范围）。下一项是 [R3全量行为验证与数值裁定计划](r3-validation-and-calibration-plan.md)：先由owner裁定兼容换算、护甲和验收策略，再批量进行真实行为验证。

> owner已确认R3三项全局方案。当前程序施工单为 [R3程序施工单](r3-program-work-order.md)，策划第一批已裁定参数及机制边界见 [R3策划裁定第一批](r3-planner-resolution-batch-1.md)。

> 2026-09-15策划结项建议：依据225项全绿、独立复查与六组撤修验红，建议结束S2技术验证并进入小规模可玩纵切。真实14段动作素材明确转为下一阶段首个内容门槛，不记为已完成。详见 [S2结项建议](s2-exit-recommendation-20260915.md)。阶段人审仍由owner落账。

> 当前收尾（2026-09-15）：[程序收尾结论](s2-program-closeout-20260915.md)。225项回归、类型/构建全绿；C1/C3—C6及播放器接口独立复查通过，六组撤修验红；REQ-001～003已按原合同closed。真实14段动作素材仍未验收，S2人审不代签。以下旧待办/失败状态保留为历史。
> 2026-09-15 收尾更新：原mortal死亡当拍掉落合同已恢复，225项相关回归通过、类型/构建通过；REQ-001～003按独立历史合同核对已closed。旧195通过/1失败记录为修复前历史。详见 [死亡掉落合同](s2-mortal-closeout.md)、[可选排序核对](s2-optional-order-audit.md)、[性能风险](s2-performance-risk.md)。本批独立复查结论另行落账；真实14段动作素材未验收。
> 2026-09-15 最新程序证据与具体退回/待复核项见 [连续批次总交接](s2-batch-delivery-20260915.md)。历史B/V02通过结论保留。
更新：2026-09-15。正式项目标识game-mcfight，显示名MC Fight。

**当前程序施工入口：[S3 游戏骨架设计 v1.0](s3-skeleton-design.md)**。旧 S2 任务单和证据只作为历史与能力依据，不再包含当前待施工事项。真实动作素材仍是后续内容依赖，不因机制测试通过而自动完成。

## 文档顺序

**给程序的当前接续任务：**[S3 游戏骨架设计 v1.0](s3-skeleton-design.md)。S2 任务、规则消歧与验证记录均已转为历史证据。

素材准备见 [S2准备与素材范围](s2-readiness-and-art.md)。先做一套端到端样例减少返工，不要求84种完整素材齐备；临时单姿态不算合格动画。

**最新用户规则确认：**[战斗规则确认记录 v0.2](<C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/combat-rulings-v0.2.md>)。CR01—CR15及其验收场景优先于早期提案。

技能初版：[技能详细设计 v0.1](C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/skill-design-v0.1.md)定义24类参数化模板及共享执行规则；[84种单位技能装配建议](C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/unit-skill-loadouts-v0.1.md)说明各单位如何组合与选择技能。均为S1提案，未冻结正式数值，也不代表引擎能力验证通过。

**单位玩法优先阅读：[84种单位的技能与战斗逻辑](C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/unit-gameplay-descriptions.md)。** 每个单位用一段策划文字描述技能与战斗行为，供重新设计和实现；inventory中的代码拆解仅作为参考附件，不约束新版实现。

1. brief.md：S1立项与范围。
2. gdd.md：新版规则；只有标记“已确认”的项目视为用户已定。
3. decisions.md：待讨论问题与影响。
4. s2-validation-spec.md：程序第一任务、测试参数边界与交付要求。
5. program-handoff.md：可直接发送给程序agent的介绍。
6. s2-round2-task.md：首批探针之后的第二批程序任务与实验契约。
7. unit-skill-presentation-design.md：S1补充，单位/技能/表现/素材关系与攻击范围对齐原则（设计稿，待S2验证）。
8. unit-gameplay-descriptions.md：S1单位玩法文字稿，84种单位逐一总结技能、使用时机与战斗逻辑，文末集中列出待确认内容。
9. [inventory/README.md](C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/game-mcfight/inventory/README.md)：原版技术与资源参考附件（静态证据，不是新版玩法描述或实现约束）。

## 事实与建议的优先级

用户后续明确决定 > 本目录已确认规则 > 本目录待确认建议。../mc-fight/下的source-baseline.md与source-monsters.json是旧版研究，engine-targeting-skill-assessment.md和s2-combat-validation-proposal.md是技术研究，不是新版已签核GDD。

## 状态

立项、注册与 [能力计划](capability-plan.md) 已建立。REQ-001—003均已交付，S2 的机器门、独立复查和 owner 人门于 2026-09-15 通过。当前唯一未完成阶段是 S3 及以后；阶段签核仍分别由独立复查者和 owner 完成。

当前会话负责策划；用户创建的程序agent负责技术验证与实现。程序不替代用户决定未定规则，策划不代写游戏战斗代码或程序自证。独立复查不由施工者代签。

- [R3-B1 标准投射物施工单](r3-b1-standard-projectile-work-order.md)：R3下一批程序实施范围。
- [R3-B2 状态、扇形与齐射施工单](r3-b2-status-cone-volley-work-order.md)：命中状态、持续扇形攻击和多发齐射的程序合同。
- [R3-B2 扇形与多发投射物公共能力合同](r3-b2-cone-volley-contract-v1.md)：已裁定的 `Shape.cone`、引导分段、多发实体、散布与中断语义；它关闭当前 B2 的两项公共能力定义缺口。
- [R3-B2 公共能力实现复查](r3-b2-public-capability-review-20260917.md)：当前第一版 cone/VolleyPlan 与正式合同的实现差额及程序修正门。
- [R3-B2 八单位身份验收矩阵](r3-b2-identity-acceptance-matrix-v1.md)：八个单位及跨机制场景的生产链路验收与矩阵更新条件。
- [R3-B3 施工就绪与身份验收](r3-b3-readiness-and-acceptance-v1.md)：冲锋、俯冲、循环、禁足、变身和环绕的八单位数据边界与验收门。
- [R3-B2 独立复查清单](review/r3-b2-independent-review-checklist-v1.md)：冻结副本、生产链、逐单位核对与六组撤修验红要求。
- [R3-B4 旧版参数提取](r3-b4-legacy-parameter-extract-v1.json)：14个 B4 单位的旧配置快照，供后续机制裁定与正式内容装配使用。
- [R3-B4 能力预研与施工顺序](r3-b4-capability-preflight-v1.md)：B4共享能力、单位基线、身份重点和仍需冻结的旧版事实。
- [R3-B2+B3 批量施工单](r3-b2-b3-batch-work-order.md)：16个单位的状态、齐射、冲锋、俯冲与形态施工范围。
- [R3 剩余56个单位行为设计](r3-remaining-56-design-v1.md)：剩余单位的机制分组、行为合同与身份验收。
- [R3/S6 剩余56个单位素材绑定清单](r3-s6-remaining-56-art-manifest-v1.md)：旧图接入、动作缺口与正式表现要求。

- [R3-B2 生产接线与收口施工单 v1.0](r3-b2-production-closeout-work-order-v1.md)：VolleyPlan 完成后的唯一 B2 收口任务。

- [R3-B2 生产接线即时审阅](r3-b2-production-wiring-review-20260917.md)：配置进入目录后尚未接入真实战斗链的阻塞清单。

- [R3-B2 齐射生产接线复核](r3-b2-volley-production-review-20260917.md)：Caster 创建计划后仍须修复的四项正式合同偏差。

- [R3-B5 参数预冻结 v1.0](r3-b5-parameter-preflight-v1.md)：B5 14单位已核实旧参数、缺口与公共能力门。

- [R3-B4 连续施工单 v1.0](r3-b4-continuous-work-order-v1.md)：B4 14单位的公共能力分组、顺序与通过门。

- [冻结包发布门 v1.0](review/freeze-package-release-gate-v1.md)：所有 R3 批次独立复查前的完整性与可构建性要求。

- [R3-B3 r3 可构建冻结包](review/r3-b3-freeze-20260917-r3-complete/README.md)：含五类公共能力边界撤修、全量门、截图、日志和哈希；等待独立复查，不代表签核。

- [REQ-B4-REVENANT-01](requests/REQ-B4-REVENANT-01.md)：炽燃遗魂声波与骨弹的推荐参数裁定单。

- [B4 实施前能力缺口审计](r3-b4-implementation-gap-audit-v1.md)：真实生产链与当前公共能力的差额。
