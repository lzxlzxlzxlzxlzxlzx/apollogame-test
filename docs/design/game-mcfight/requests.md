# MC Fight 程序能力请求

## 当前状态（2026-09-15）

依据 [原始合同独立关闭核对](review/request-contract-closeout-20260915.md)，分别落账：

| 请求 | 状态 | 关闭范围 |
| --- | --- | --- |
| REQ-MCFIGHT-001 | closed | 启动捕获、前摇承诺、取消、重复取消、动作锁与重开隔离的原始公共契约；原独立撤修及后续R1/R3补验已覆盖 |
| REQ-MCFIGHT-002 | closed | 阶段窗口接口及批准后的边界提交时序；窗口撤修、真实接触与B画面补验已覆盖 |
| REQ-MCFIGHT-003 | closed | 动态资格筛选、拍初位置、升空重选与失败启动不扣CD；独立筛选/快照撤修与B补验已覆盖 |
| REQ-MCFIGHT-004 | delivered | owner 选择 A；自由部署完整圆、占位拒绝、回席与阶段门已独立复核，见 [限定复查](review/s4-drag-independent-review-20260915.md)；不代表 S4 或全库门禁通过 |
| REQ-MCFIGHT-005 | delivered | [移动圆邻域资格与最小启动距离](s4-combat-gaps.md)，2026-09-15 owner 选择 A；施工主体：本程序负责人（公共扩展） |
| REQ-MCFIGHT-006 | delivered | [定向光束真实几何及释放绑定](s4-combat-gaps.md)，2026-09-15 owner 选择 A；施工主体：本程序负责人（公共扩展） |

关闭依据来自历史独立实跑与逐请求合同核对；不是程序自签验收。新C1/C3—C6、damage-routing及播放器本批复查独立落账，不把它们倒挂为旧请求永久in-progress。14段真实素材仍待交付；不构成S1/S2签核。

## 历史施工记录（以下旧状态已由上表覆盖，保留定位证据）

## REQ-MCFIGHT-001：启动时目标绑定与失效取消

2026-09-12 用户在本任务明确“选择A请你开始S2测试”。路线A已批准；施工主体：PE-game-mcfight（本任务），状态 in-progress；独立复查未进行。采用CLAUDE.md“发现方拿到owner A/B判词后可自做自验”的施工规则。当前为无Git元数据的本地副本，施工锁在本文件落盘，不伪造推送。影响 S2 第二批 A，A通过前B不启动。

### 最小失败证据

`games/game-mcfight/s2-round2.fixture.ts` 是同一份模板展开的两个单位，只安装既有生产系统。24 tick 逐拍证明两实例各完成三轮阶段与计时，每次 Active 恰好生成一个观察用 prefab marker（不是伤害完成证据）。

失败路径：tick1 开始 Windup，aggro 指向 a-original；测试仅在 tick1 后注入 ResourceModify(-100)，tick2 真实 resource-apply→mortal→destroy 移除该目标；tick3 Caster 对新的 a-alternative 生成 marker。实验契约要求取消、不补打，严格断言为0，实际1，退出码1。另一个反例由 motion-apply 自动移动原目标，不注入目标改写，也会在前摇期间换目标。

命令、轨迹见 `s2-program-evidence.md` 第二批和 `s2-round2-strict.log`。测试不修改阶段、目标关系或窗口；没有测试专用 system。

### 已查与不能解决的连接点

已查 registry（包括 allAtomCapabilities）、战斗/事件/AI/运动手册及以下实现：

- `tier3/aggro.ts`：`else if (rel.kind === 'target') rel.targetId = targetId`，每拍更新追击关系。
- `tier3/caster.ts`：`overrides 原样透传`；输出 SpawnRequest 包含坐标、source、配置 overrides，没有捕获运行时 targetId 的入口。延后到 Active 才调用就读新目标；提前调用只保留当时坐标，也不能判断原目标是否死亡。
- `tier3/prefab.ts`：`@local:` 只重映射“本模板 localId”，不能代表施法时选中的外部目标。PrefabOrigin.source 传施法者，不传敌方目标。静态 overrides 写死一个目标不满足动态选择。
- `atoms/relation/index.ts`：只声明关系组件，`systems: []`。当前实查 Relation 写者 aggro/pull-anchor 分别重选或指向锚点，没有按开始信号复制关系到独立技能实体的生产系统。
- `tier2/condition.ts`/`self-rule.ts`：条件闭集是 resource/flag/state/timer/string 等，没有沿锁定实体关系读取目标生命/存在性的叶子。唯一资源名静态预绑定不等于捕获本次运行时目标。
- `tier2/launch.ts`：锁的是发射方向，且发射时另查最近目标；不能证明前摇锁实体与死亡取消。
- `tier3/flow.ts` + `tier2/effect-apply.ts`：已有 reset-timer、局部命名和转移 do 足以实现本轮循环时序，无需为这一部分新增完整执行器。
- `tier1/hierarchy-cascade.ts`：能对子随父死做清理，值得复用；尚未验证动态技能归属装配和同拍死亡与生效的优先级。不能把未测清理说成第二个已证缺口。

结论限于上述生产能力组合：已经定位运行时目标捕获与目标失效检测这两个缺失接缝，不宣称所有可能的数据组合均已穷举，也不要求整体重写技能系统。

### 两条路线（待裁决，不是新增能力许可）

| | A：补最小公共能力（推荐） | B：受控专属扩展 |
|---|---|---|
| 范围 | 在技能开始信号上，从配置的单位读取当时 Relation，写到技能独立引用；提供按该引用判断存在/生命/待销毁的闭集条件，以及无目标时禁止 Caster 重新索敌的消费策略 | 在经批准的确定性窄接口内实现相同目标捕获、失效检测和取消；继续消费现有 Flow/Timer/Prefab/Hitbox |
| 复用 | 适合所有有前摇锁目标的技能；循环与阶段继续现有组合 | 先限 MC Fight，需要独立审计与技术债记录 |
| 影响面 | 组件协议、注册/校验、关系捕获或生成上下文、条件/Caster消费；主程先裁具体承载形态，涉及定序和快照，PE不越域实现 | 需要明确允许的引擎侧扩展边界，不能写在每怪物逻辑里，也不能另造战斗系统 |
| 成本 | 中等：小接口但跨生产者/消费者与确定性，需组合回归、死亡同拍测试及独立复查；未定工时 | 原型接入可能较小，但专属逻辑审计、维护和将来迁移成本更高；未定工时 |
| 选错代价 | 接口过宽会扩张公共引擎；因此先仅补目标接缝，别提前下沉全部技能执行器 | 形成长期专属语义，后续普攻/技能/AI可能分叉 |

### A 路线交付契约草案（供主程细化）

2026-09-12策划消歧（不改变open状态或裁定A/B）：CR02/CR05/CR06已确认“成功开始近战前摇后，目标离远或升空不取消本次命中”。因此本请求的“失效取消”不能将执行中恢复飞行与死亡一概处理；启动前资格失效须拒绝/重选，执行中按技能承诺检查。公共接口需可配置检查策略，不得写死为每拍重查地面标签即取消。完整接续说明见s2-program-next-step.md。

1. 捕获时点唯一且可追溯：同一 tick 的顺序需明确为本次选择→捕获→后续阶段；不可每拍覆盖。
2. 目标记录逐单位、逐技能隔离；开始无合法目标必须拒绝，不能留下旧引用。捕获值进入确定性快照。
3. 追击可继续重选，执行只读自己的目标引用。目标移动不等于目标失效；不拿坐标快照代替实体身份。
4. 原目标死亡/待销毁时，在 Active 生效前取消，不回退 nearest；清动作锁，保留已启动冷却。本次实验规则不升级为正式产品规则。
5. 显式打断和自身死亡优先级、临时实例回收在原第二批 A 契约继续实证；复用现有层级销毁，先查后扩。
6. 原正常三轮逐拍断言保持通过；两个反例改为正确行为断言；严格死亡用例从红变绿；增加同拍失效、多目标移动、重复取消与重开隔离证据。施工与复查分开。

审批问题：选择 A（主程细化并实现公共目标接缝）或 B（明确授权的受控例外）。本请求没有替用户决定产品冷却/俯冲/打断规则。

### 施工自证更新（2026-09-12）

A 路线已完成最小实现及程序自证；证据、已证边界和未证边界见 `s2-program-evidence.md`。状态仍为 `in-progress`：该请求要求的多技能动作锁、重复取消和重开隔离尚未形成 MC Fight 验证，且独立复查尚未进行。B 真实俯冲发现新的“阶段驱动窗口状态”能力缺口，不能借本请求的 A 授权直接扩张实现。

## REQ-MCFIGHT-002：阶段驱动状态窗口

2026-09-12 用户已选择 A。施工主体：PE-game-mcfight（本任务）；状态 in-progress；独立复查未进行。此请求只补 Flow 阶段进入/退出时以数据设置或清除指定实体 `Status` 位的最小接口，供俯冲接触窗口使用；不新增技能执行器、动画系统或单位专属逻辑。

失败依据：Hitbox 已可用 `requireMask` 检查接触对象的动态状态，但现有 FlowAction 只能改 Flag/State/Resource，不能由阶段打开或关闭施法者的窗口。用测试逐拍改 Status 不能证明“技能阶段 → 实际移动 → 碰撞接触 → 窗口检查 → 扣血”。

A 交付：`FlowAction.set-status` 以实体 id、位掩码与布尔值精确置/清 `Status.flags`；动作仍在既有 Flow 的 onEnter/transition 发生，进入/退出边沿各执行一次，状态缺失时可创建零值容器。需有状态开闭、同一 tick 顺序、接触伤害与清理的回归；不凭此宣布 S2 通过。

## REQ-MCFIGHT-003：索敌按动态窗口资格筛选（历史申请）

在 REQ-MCFIGHT-002 施工后实查：`t3-aggro` 仅按 `Perception.targetTag` 和距离选择目标，不能读取 `Status` 或 `EntityCheck`。因此它无法在飞行目标关闭地面窗口后改选仍合法的地面目标；Flow 启动检查虽可拒绝施放且不扣 CD，却会反复看到同一非法 Relation。测试手动改 Tag、Relation 或窗口会伪造“重新索敌”。

| 路线 | 范围与代价 |
|---|---|
| A：最小公共扩展（推荐） | 为 Perception 增加可选、闭集的目标 `EntityCheck`，由 aggro 在最近目标查询时过滤；适用于地面/对空、免疫与状态筛选。需定序与回归。 |
| B：MC Fight 专用 | 以专属系统或单位代码重选窗口内目标；较快但破坏数据驱动与复用边界。 |

此请求未经 owner A/B 裁决，不施工。它只阻塞 B 中“目标升空后重新索敌”的正式链路，不否定 REQ-MCFIGHT-002 的阶段状态窗口实现。

### REQ-MCFIGHT-003 施工状态（2026-09-12）

用户已选择 A。施工主体：PE-game-mcfight（本任务），状态 `in-progress`，独立复查未进行。

初版实现已为 `Perception.targetCheck?: EntityCheck`，由 aggro 在候选索敌时过滤动态资格；独立用例证明关闭资格的近目标会被排除、剩余合法目标会被重选。该实现与 REQ-MCFIGHT-002 的 Flow 直接写 Status 共装时触发系统图环，**不得作为完成交付**。

失败证据：安装 `t3-flow`、`t3-aggro`、`t1-motion-apply`、`f1-resource` 的调度审计报告 `SYSTEM-GRAPH: FAIL`，闭环为 `aggro, flow, motion-apply, resource-apply`，闭环组件 `Resource, Status, Transform`。将 Flow 改为先于 aggro 虽能改变平局排序，却让既有 MC Fight 生命周期首拍启动从 tick1 推迟，7 项回归中5项失败；该试验已撤回，未以改断言掩盖差异。

后续仅接受明确提交时点的最小修复：窗口写入移出 Flow Update 的直接写路径，保留真实 Status 读写申报，并在完整组合中复跑生命周期和俯冲链路。

## 2026-09-14 请求关闭核对（覆盖上述历史施工状态）

A 路线来源为用户先前对 REQ-001—003 的选择 A；均已施工，旧文中的“待裁决”“未施工”属于历史记录。窗口边界提交、拍初位置与 Resolve 后置已进入当前公共链路。R1—R3 按独立 contact 复核报告标为已修复并复核通过，不能推导三张请求整体关闭。

| 请求 | 已交付/已验证部分 | 关闭前需复查者明确确认 |
|---|---|---|
| REQ-001 目标捕获 | Flow 捕获、目标承诺、死亡与取消固定回归；R1 移动目标承诺复核通过 | 对照原交付契约，明确目标隔离、重复取消、重开隔离与动作锁的请求级覆盖；本批双技能 7 项尚未独立复跑 |
| REQ-002 窗口 | 边界意图提交、真实移动/接触/扣血、清理回归；R2/R3 修复复核通过 | 按 B 对照表检查开关窗和取消画面，确认过期意图、同拍死亡/硬控覆盖并给请求级结论 |
| REQ-003 动态资格 | Perception.targetCheck、拍初位置、Flow 关窗后重选、拒绝启动不扣 CD | 引用最终组合审计与固定探针，明确该请求验收结论；不能继续沿用早期有环结论 |

三项状态暂留 in-progress；这是缺少请求级关闭结论，不是代码仍“未施工”。程序不会代替独立复查者签结论。S1 与 S2 阶段签核保持原状。

2026-09-14 补正：REQ-002 表中的 B 开关窗与取消画面已经独立补验通过，见 s2-b-acceptance-evidence.md。该项不再列为缺口；请求级关闭仍由复查者按原契约确认。新 V02 独立复查不撤销原 B 结论。

2026-09-14 V02 独立复查落账：新增7项及默认UI已通过，见项目同级 mcfight-v02-review-20260914/independent-v02-review.md；上表“本批双技能7项尚未独立复跑”不再是缺项。新模板取消与移动宿主同步不在本次复查范围，请求状态未代签关闭。

2026-09-15：REQ-005/006公共扩展已由非施工复查者独立复跑112项、类型检查，并完成6项锚点撤修及SHA还原。按[限定报告](review/s4-public-005006-independent-20260915.md)更新delivered；不等同S4阶段独立验收或owner签核。

## REQ-MCFIGHT-007：R3 公共护甲结算与可审计回执

2026-09-15。施工主体：MC Fight程序负责人（本任务主程）；状态delivered（公共护甲及统计接口独立复核PASS）。依据review/r3-public-007-independent-20260915.md：14项独立复跑、3组锚点数值撤修与SHA恢复；不等同M09单位身份通过。
授权：owner直接要求实现Minecraft护甲/韧性、真伤绕过与穿甲归零，唯一规则来源r3-program-work-order.md/r3-planner-resolution-batch-1.md；公式见其引用的r3-validation-and-calibration-plan.md §2B。此为现有t2-damage-routing/Hitbox的可选字段扩写，不新建单位系统或改变相位。
实查：damage-route当前仅执行amount×部位倍率及HP夹取；Hitbox→DamageRequest未携带伤害类别。modifier-stack能按固定倍率修正，但不能表达每次命中的伤害/韧性有理式，不能用游戏层计算替代。
限定实现：DamageReceiver可选护甲/韧性；Hitbox/DamageRequest携带普通/真伤及穿甲；保留部位倍率后再护甲的顺序；治疗不走护甲；请求留原伤害/护甲输入/护甲后及实际HP回执，默认无配置行为保持。单元与真实接触测试、现有死亡/统计回归后交独立复查，不自行关闭。

## REQ-MCFIGHT-008：R3 合格来源保留与周期结算回执

施工主体：MC Fight 程序负责人。状态：delivered（本次限定接口已独立复核PASS；不等同尸巫等单位身份或整批R3完成）。依据：review/r3-public-008009-independent-20260915.md，39项独立复跑、6组隔离撤修及SHA恢复。

授权范围：owner 本轮明确要求实现批次一 M06 来源合同及实际扣血/治疗统计；此前已选择“限定扩展伤害路由、来源记录与一次性死亡转换”A路线。本单只扩写已有 `t2-damage-routing` / `t2-over-time` 可选来源字段，保留既有无配置行为，不新增系统或单位分支。

先查：已读 `docs/playbooks/combat.md`、registry 的 `t2-damage-routing` / `t2-over-time`，及实际 producer/consumer。`damage-route` 当前每次正伤害覆盖 `LastDamage`；`death-conversion` 只读该字段，因此普通盟友后续致死会丢弃先前有效尸巫标记。`over-time` 当前直接产 `ResourceModify`，没有来源/实际有符号回执；仅在统计观察器补算HP差不能区分治疗与伤害。二者均不能靠已有配置达到已裁定合同。

限定修复：LastDamage仍保存真正最后伤害；另保存最后满足转换来源掩码的直接正伤害快照；转换可选择该快照，并按来源阵营选择已配置模板。周期效果显式选择伤害路由时产生带来源快照的periodic请求（不覆盖直接标记），缺省仍走原ResourceModify。不得借本单扩展吞噬数值、跃击、蛇身或骑乘规则。需真实接触、间接/周期对照、来源死亡、一次转换及共装审计。

## REQ-MCFIGHT-009：最大生命门与启动时删除捕获目标

状态：delivered（限定公共接口独立复核PASS）。施工主体：MC Fight程序负责人。2026-09-15 owner明确选择“A：最小扩展最大生命检查与捕获目标删除”。影响：SK20/独眼巨人，其他族继续。独立依据：review/r3-public-008009-independent-20260915.md；施工与原始漏伤修复说明：r3-009-program-handoff.md。

已核实：`src/skills/tier2/entity-check.ts` 的 `query` 只比较 `r.current`；`EntityCheck.resource` 无字段选择。`FlowAction.kind`只有set-flag/set-state/modify-resource/set-status，不支持对捕获目标发删除请求。`Hitbox.executeBelow`按当前HP比例，且必须等后续接触，不能代替最大HP阈值与成功启动删除。已读registry、combat手册、Flow/EntityCheck/Hitbox生产代码。

- A（推荐）：EntityCheck可选资源字段current/max；Flow捕获成功后可选一次删除目标请求，复用DestroyRequest清理与Caster待销毁拦截。需验证同拍不会漏出被吞噬者的攻击、两实例隔离、阈值50/51、飞行目标、失败不扣CD和非吞噬范围对照；不新增单位专属系统。
- B：保持吞噬装配阻塞，不用真伤伪造删除，不上线独眼巨人身份。

数值已明确：不治疗，CD5秒；见r3-owner-decisions.md。本裁定只问新增公共接口。

## REQ-MCFIGHT-010：R3-B1 标准直线投射物

施工主体：MC Fight程序负责人（主程）；状态in-progress。授权：owner直接要求按r3-b1-standard-projectile-work-order.md实现通用ProjectileSkill/投射物装配能力及四个身份，本单仅落实其明确接口，不扩追踪/爆炸/状态。

实查：registry、combat和movement-pathfinding手册；Launch负责一次定向，motion负责实际位移，overlap/trigger/hitbox负责接触；Caster/Flow已有目标方向捕获。现有EntityCheck.range不含Shape半径、快照没有有效射程；Hitbox.consumeOnHit允许同拍范围多目标，来源标签从仍存活来源读取；Timer只表达静态寿命，BoundsClamp会停留而非完成投射物清理。因此保留这些旧行为，以可选公共字段和距离终止组件补齐本单合同，不用游戏层系统绕过。

限定：捕获时保存目标/方向/阵营/有效射程×1.15；独立实体沿Launch方向移动；公共距离/边界截断在Update移动后、Resolve碰撞前执行，命中/末端后清理；显式单目标接触不修改旧AOE扇出；已生成弹丸不依赖活来源，可用不可变来源快照结算。测试/迹线/旧行为回归/完整审计后冻结交独立复查。四单位只标passed-program，其他有状态或冲突单位不纳入。
