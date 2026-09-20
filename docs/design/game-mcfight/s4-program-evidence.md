# S4 程序证据

更新：2026-09-15。本轮按 `s4-review-disposition-20260915.md` 收尾，最新结果见文末“CONCERNS处理后的最终复跑”。造成伤害已改为实际HP扣除，治疗单列；16项旧失败全部修复，受控三轮完整回归均5139通过、1历史跳过、退出0。下文早期“含过量伤害”“16项仍失败”及CONCERNS均保留为历史记录，以文末本轮证据及独立复核为准。Owner人门不由程序代签，不启动R2。

## 基线与保护

玩法依据 `s4-playable-vertical-slice.md`，交付依据 `s4-program-handoff.md`。未修改策划 acceptance 剧本；四份原文件修改前后 SHA256 保存于 `self-check/s4/acceptance-before.json` 与 `acceptance-after.json`，对比一致。

## 初次准备产物（历史）

- `games/game-mcfight/content/s4-balance.ts`：六单位、九技能的 S4 参数、20Hz 单位换算、动作词表、只读观测名称及敌方预设。尚未接入正式世界，不能视为六单位实战通过。
- `games/game-mcfight/s4-input-contract.test.ts`：验证参数引用、时间换算及策划剧本输入与观测词表的一致性；不是验收 adapter 执行结果。
- `scripts/acceptance-schema.d.mts`：为现有 JSONC 解析与验证器补充类型声明，不改变解析行为或剧本。
- `games/game-mcfight/s4-placement-gap.test.ts`：生产自由拖放接受敌区、完整圆越界及友军重叠的三个反例。
- `s4-placement-gap.md`：实查记录、最小复现及限定 A/B 方案；`capability-gaps.json` 登记 REQ-MCFIGHT-004 为 open，阻塞 S4。

## 初次准备执行结果（历史）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 准备与缺口探针 | `node node_modules/vitest/vitest.mjs run games/game-mcfight/s4-input-contract.test.ts games/game-mcfight/s4-placement-gap.test.ts` | 2 文件、6 项通过，退出 0；其中 3 项是成功复现风险，不能计作部署通过 |
| 类型检查 | `node node_modules/typescript/bin/tsc --noEmit` | 退出 0 |

日志：`self-check/s4/preparation-tests.log`、`self-check/s4/types-preparation.log`。准备阶段曾因解析器缺少声明而类型检查失败；补充声明后实际复跑退出 0。

## 初次准备时未完成范围（历史，已被后文进度更新）

正式入口仍为 S3 骨架。本轮未完成购买与退款、合法自由部署、六单位实战、结算返回商店、薄 adapter。完整回归、构建、完整 S4 组合审计、浏览器旅程、全部 acceptance、S4 gate 及独立复查均尚未执行，不能用本轮准备测试替代。

自由部署后续实现等待 owner 对 REQ-MCFIGHT-004 选择 A（限定扩展公共 drag-place）或 B（明确许可单一游戏会话规则例外）。详细边界与要求见缺口单，不把任何选择扩大为其他公共能力的授权。

## owner 选择 A 后的实现与复核

- 公共 `Draggable.freePlacement`：完整圆边界、同队重叠拒绝、外切允许、非法输入零写入、回席锚点与部署位、严格阶段门。默认六角格行为不变。
- 固定测试 20 项通过；独立复查另检出非法邻居负半径漏洞，修复后原探针转绿。三处撤修均有锚点命中断言、退出1，恢复SHA一致。见 [限定独立报告](review/s4-drag-independent-review-20260915.md)。REQ-004 落账 delivered，不代签 S4。
- `s4-session.ts` / `s4-render.ts` / `s4-mount.ts`：统一生产经济、阶段、部署、敌军、结算与清理；UI只转发输入。会话7项固定测试通过，包含超时比值优先、人数次级比较、双方零、奖励一次和历史保留；被动世界结算单测不冒充真实战斗。
- `s4-world.ts` / `content/s4-catalog.ts`：六种实例和目前可表达技能子集。修复了阵营位与 ZONE_FLAG 冲突及无效 Hitbox 字段；当前仍将冲锋、激光、自疗标为未接通。
- `acceptance-adapter.ts`：同一生产命令入口，观测值只读真实会话/世界。四份原剧本已通过；四份 SHA256 未变，见 `self-check/s4/acceptance-protection.json`。这四个场景不覆盖全部代表技能，不能替代缺口验收。

## 实际浏览器证据

入口：`http://localhost:5173/games/game-mcfight/s4-preview.html`。正式 `?game=game-mcfight` 仍保持 S3 入口，避免将不完整战斗装配作为正式 S4 发布。

`node docs/design/game-mcfight/self-check/s4/browser-preview.mjs` 与 `browser-roundtrip.mjs` 均实际退出0，无 pageerror。使用 Edge、真实鼠标按下/移动/释放、正常20Hz时钟，不注入世界状态。

首轮购买卫道士金币30→25；从待命栏拖到(-12,0)后开战；实际5.70秒结束，结果失败、我方伤害36/敌方60、双方剩余0/4、奖励5；继续后第2轮、金币30、持有0。日志与6张连续画面：`self-check/s4/browser-roundtrip.json`、`roundtrip-01-shop.png` 至 `roundtrip-06-next-shop.png`。这是当时子集装配的真实闭环证据，不是六技能最终验收画面。主程已逐张检查关键购买、部署、结算和返回商店画面。

## 全库回归与兼容性风险

完整回归实际退出1：4982通过、21失败、1跳过。15个失败文件在 S3 冻结源码的隔离副本中重新运行，21个同名失败全部复现；没有撤掉共享修复或改断言消红。全90系统旧/新均4 SCC，但既有Update大环的依赖组件新增真实Tag写入，图不完全相同。详细 [回归对照](self-check/s4/shared-regression-comparison.md)。不得写为全库全绿。

## 本次收尾的最终执行结果

| 检查 | 实际结果 | 日志 |
| --- | --- | --- |
| MC Fight 全目录 + 新旧拖放测试 | 31文件、163通过、1跳过，退出0；含历史与新缺口反例，不全部计作功能通过 | `self-check/s4/mcfight-current-regression.log` |
| 最后审计测试修正后的战斗相关回归 | 5文件46通过，退出0；S4的18项含3个缺口反例 | `self-check/s4/combat-regression.log` |
| 类型检查 `tsc --noEmit` | 最后源码退出0 | `self-check/s4/combat-types.log` |
| 项目构建 `vite build` | 退出0；保留大于500kB分块警告。正式入口仍S3，不能据此称S4已发布 | `self-check/s4/build-current.log` |
| 当前子集战斗组合 | 22能力27系统，无SCC/重复；15个可选引用全局存在 | `self-check/s4/combat-audit.log` |
| 当前战斗+新拖放共装 | 29系统，无SCC/重复；可选引用全局存在，退出0 | `self-check/s4/s4-combination-audit.json` |
| 策划原剧本 conformance | 4场景全部PASS，退出0；CLI握手开启 | `self-check/s4/acceptance-current.log` |
| 当前子集浏览器闭环 | 正常时钟、真实pointer、6张连续截图，退出0 | `self-check/s4/browser-roundtrip.json` |
| 全库回归 | 21失败在旧副本全部同名复现，仍为退出1，不豁免 | `self-check/s4/shared-regression-comparison.md` |

主程发现早期 S4 审计调用误传系统数组，造成扫描0系统的假无环；该结果已作废。修正后断言真实扫描数量等于排序数量并为27，重新通过。此前 MC Fight 163项日志中的错误审计不作证，采用后续 `combat-audit.log`、`combat-regression.log` 和主程29系统额外共装结果；没有以删除依赖隐藏问题。

俯冲9/7/9数据装配已补双实例各三轮和实际扣血；前摇后目标自身Flow升空并真实退远仍T8生成、T9命中；近战双实例三轮及生产硬控/来源死/目标死取消通过。完整逐拍轨迹在最后战斗回归日志。来源绑定自身释放及重叠邻居单体过滤仍在缺口范围，不将上述通过扩大为所有释放形式安全。

## 当前未完成及交审边界

REQ-005 包含移动圆邻域安全、闭区间最小启动距离和单体锁定命中过滤；REQ-006 包含定向光束真实几何与释放绑定。详见 [新缺口单](s4-combat-gaps.md)，均未获本项裁决，004的A不自动覆盖。

俯冲/取消和目标承诺的当前组合证据继续以 `self-check/s4/combat-partial.log` 的具体轨迹为准；来源绑定自身释放、单体误伤邻居、未接通代表技能和自疗后的统计仍不能写为通过。完整对照见 [S4-alignment.md](S4-alignment.md)。当前未执行最终 S4 gate，未提交整批最终独立复查，未登记阶段 review/signoff。


## 2026-09-15 A 路线实现交付

### 实现和实际时序

- 正式入口 `http://localhost:5173/?game=game-mcfight`；preview同一mount，不另写演示。
- 六单位共享内容结构，九技能均有生产释放和HP变化证据；charge、beam、heal已接通。来源生命/硬控检查在本拍伤害后执行，区域只命中捕获目标的选项不改AOE语义。
- EntityCheck使用拍初位置及本实体hp；min4闭区间、3范围无敌、hp≤70%、双实例均有边界测试。
- 新capsule的length是圆心距、radius是半宽，S4光束range10宽.6配置length9.4/radius.3；朝向为启动捕获向量，总轮廓从源起0到10，Canvas/SVG与实际碰撞共享几何。
- 完整共装暴露了晚生成写Shape/Transform回到collision-resolve的真环；采用Materialize(12)，不删除读写声明。Resolve(10)完成接触→Hitbox→damage-route→resource→mortal→destroy→targeted-caster，再物化新实体，之后Hierarchy(14)。新实体次拍参与接触。
- Flow已使用拍初位置，不再虚报实时Transform；实际排在motion之前。近战前摇承诺仍T8生成/T9命中；S4俯冲由早释放T11命中变为T11生成/T12接触，T2开窗下降和T27完成回升关窗不变。历史逐拍日志保留。
- 源失效区域以DestroyRequest清理并阻止接触，支持持续区；同一次Hitbox循环先硬控后接触也会重新检查，取消不退款不补发。

### 固定正向验证

- `s4-six-skills.test.ts`：56通过，九技能真实HP效果，冲锋min/速度/地面资格、斜向激光多目标与友军过滤、自疗距离/局部生命/优先级，每技能前摇及释放同拍真实硬控/致死取消；每组有无控制成功参考世界。
- `resolve-release-binding.test.ts`：16通过，独立放置点/身份、移动承诺、固定AOE、源死亡/硬控、持续清理、Launch与capsule捕获朝向；仿真只初始化/推进，不注入Trigger。
- EntityCheck新增14项＋旧Flow14项通过。历史counterexample仍单独标识，不把成功复现风险算功能通过。
- `s4-walkthrough.test.ts`：生产购买→部署→胜利→冻结→第二轮再购买，三次同seed逐拍hash对照。
- REQ004拖放20测试及独立撤修结论保留。恢复motionApply系统数组旧首项兼容，并为grid-move测试补明确快照provider；未改距离断言。其他游戏历史失败另列，不假报全库绿。

### 浏览器与统计

`self-check/shots/roundtrip-01-shop.png`到`roundtrip-06-next-shop.png`：正式入口、正常20Hz、真实pointer、开战、失败奖励、继续第二轮；`browser-roundtrip.json`存可见文本轨迹。无直接写世界或加速测试开关。

摘要统计生产DamageRequest的正向有效命中量，包含过量伤害，治疗不抵扣；UI已标注。它不是实际HP净下降，过量口径交策划复核。九技能真实HP断言仍独立保留。

### 复跑与交审

所有日志均位于 `self-check/s4/`，截图位于 `self-check/shots/`。实际命令退出码见下表及最终交付记录；独立报告由非施工复查者写入review目录，程序不代owner签核。


### REQ-005/006 限定独立复核

[公共独立报告](review/s4-public-005006-independent-20260915.md)：隔离副本7文件112项通过、tsc退出0；neighborhood/min/source guard/onlyTarget/aim/Materialize六项撤修均锚点1次、退出1、恢复SHA一致。005/006已据此交付，不自行宣称S4通过。


### 当前最终检查记录

| 检查 | 实际命令/产物 | 结果 |
|---|---|---|
| 当前游戏+绑定/承诺回归 | vitest games/game-mcfight + resolve-release-binding + targeted-caster | 32文件231通过、1跳过，退出0；此后新增walkthrough在整库及独立复跑中覆盖 |
| 最终类型检查 | `node node_modules/typescript/bin/tsc --noEmit` | types-final.log，退出0 |
| 最终构建 | `node node_modules/vite/bin/vite.js build` | build-final.log，退出0；既有>500kB包体告警保留 |
| 战斗+部署联合审计 | `vite-node self-check/s4/s4-combination-audit.ts` | combination-final.json，31实际系统、SCC/duplicate为空，所有20可选引用在registry存在；退出0 |
| 四份策划验收 | `ZEROCRAFT_ACCEPTANCE_CLI=1 vite-node scripts/acceptance-run.mjs --game game-mcfight` | 四份全通过，退出0；acceptance-final-protection.json四SHA不变 |
| 浏览器正式旅程 | `node self-check/s4/browser-final.mjs` | 正常时钟真实pointer，6连续截图，pageerror为空；退出0 |
| 通用UI探针 | `node scripts/ui-walkthrough-probe.mjs --game game-mcfight` | 退出0、无页面异常；**0/21可驱动**，现通用探针不匹配JSON参数/拖拽，不能当操作验证。操作证据用上行及独立真实浏览器旅程 |
| 全库回归 | `vitest run --maxWorkers=2 --minWorkers=1` | 551文件、5103通过/18失败/1跳过＋1worker异常，退出1；其中2项后续定点转绿16测试，其余16原冻结失败保留。详见shared-regression-comparison.md |

S4 gate首次执行退出1，原因是capability-plan增补使S2前置review过期；已经交非施工复查者按实际增量核对，未撤文档或绕过硬闸。后续gate及整批独立报告单独追加最终结论。



### 2026-09-15 最终交付与独立结论

A路线的限定公共扩展、六单位九技能、购买/出售、真实拖放、结算和返回商店已交付。部署页补齐直接出售入口，拖拽中禁售；区域标签下移仅属表现坐标调整。最后标签版本的真实浏览器旅程及构建均退出0，类型检查退出0。六张连续运行截图已刷新，部署标签完整可读。

[整批独立报告](review/s4-independent-review-20260915.md)已完成并登记 **S4 CONCERNS**：S4限定玩法及真实操作闭环复核通过，无待修的本游戏定点缺陷；不等同整个共享库绿或owner签核。

- 独立回归36文件255通过、1历史跳过，退出0；独立类型、构建、四份GD剧本及31系统联合审计均退出0。
- 原GD剧本的购买扣款、奖励入账、下一轮清场三组隔离撤修分别检出4/2/2份剧本失败，每组锚点1、退出1且SHA原样恢复。公共005/006六组撤修结论保留。
- 联合审计实际20条可选排序引用均在完整registry存在；无SCC及重复系统。未删除声明规避审计。
- 完整共享回归的16项原冻结同名失败及1次worker异常仍是具体风险，未以局部测试推导全库通过。共享兼容性处理需按所属能力/专职域另行落实；本轮未擅改PUI域或旧游戏规则。
- 通用UI探针0/21可驱动不是交互验收证据；实际操作以程序及独立浏览器的真实pointer旅程和出售/非法部署边界为准。
- 统计显示有效命中量（含过量伤害，治疗不抵扣），该口径已公开，待策划核对；实际HP变化由独立技能测试另证。

本次不代owner签核，不自动进入后续阶段，不将几何占位当正式动作素材通过。四份策划acceptance原始SHA均保留不变。

最终S4机器门：2026-09-15T10:18:27.956Z，`gameHash=1664753572539bc3`，退出 **0**；31文件200通过/1历史跳过，4份GD验收通过。见 `self-check/s4/gate-final.log`。前一次同hash通用探针导航超时退出1原样保留 `gate-probe-timeout.log`；停止并行复查负载后单独重跑恢复0，未修改探针或断言。机器门通过不覆盖上述独立CONCERNS与owner签核。

## CONCERNS处理后的最终复跑（2026-09-15）

本轮施工及16项原失败逐项对账见 [处理证据](s4-disposition-program-evidence.md)，原始失败名称、冻结基线和消费关系见 [独立范围清单](review/s4-shared-failure-scope-20260915.md)。16项全部选择修复，没有整项隔离或豁免。历史失败和两次明确主动中止的诊断批次继续保存；它们不计入最终三轮，也不混作未解释的worker崩溃。

### 统计合同与固定回归

`damage-route` 在真实资源结算后写入本次 `DamageRequest.appliedAmount` 回执；会话仅观测该回执，正值累计造成伤害，负值累计实际治疗，分别按来源阵营归账。伤害不包含过量部分，治疗不抵扣伤害、不含过量治疗。界面、结算摘要与adapter均消费同一统计。

`s4-statistics.test.ts` 三项均经真实Overlap→Trigger→Hitbox→DamageRoute链路：普通12点伤害（100→88）；同拍5+12点请求对7HP目标合计只计7；90HP先受12再治疗50，实际伤害12、治疗22。区域清理后不能重复记账。未注入接触结果，也未用首尾净HP替代逐笔结算。

### 受控完整回归：三轮均完成

证据目录：[disposition-final-stability](self-check/s4/disposition-final-stability/summary.json)。Node v24.15.0，单worker、关闭文件并行，三轮串行；期间无并行测试、构建、浏览器旅程。命令为 `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 --no-file-parallelism --reporter=default --reporter=json --outputFile=<本轮JSON>`。

| 轮次 | 北京时间 | 文件/通过/失败/跳过 | 耗时 | 实际退出码 |
|---|---|---|---|---|
|1|19:20:11—19:29:33|555 / 5139 / 0 / 1|559.53秒|0|
|2|19:29:33—19:39:30|555 / 5139 / 0 / 1|594.90秒|0|
|3|19:39:30—19:48:39|555 / 5139 / 0 / 1|545.38秒|0|

三轮workerErrors均0：仅结论为历史worker异常在这三轮**未复现**，不宣称永久消除。1项跳过是既存S2 C5昂贵规模用例，未新增跳过。前后1328个源码/测试/脚本SHA一致，并重新枚举文件检查新增/遗漏，差异为空。原始日志、JSON、时间与进程退出码分别保留。性能护栏原阈值不改；Steering只复用单次执行的有序邻居引用，不跨拍缓存，也未凭此承诺MC Fight百单位实时性能。

### 最终定点、构建与验收

| 检查 | 结果 | 日志（self-check/s4下） |
|---|---|---|
|MC Fight全目录回归|32文件、203通过、1历史跳过，退出0|disposition-s4-tests.log|
|类型检查|退出0|disposition-final-types.log|
|生产构建|退出0；保留既有大chunk提示|disposition-final-build.log|
|完整战斗+拖放组合审计|31系统，SCC=0，重复ID=0，退出0|disposition-final-audit.log|
|四份原GD剧本|全部通过，共14检查点，退出0|disposition-final-acceptance.log|
|策划剧本保护|四份SHA全部与施工前一致|disposition-acceptance-protection.json|

审计的20条可选排序引用均能在完整能力registry找到，属于当前组合未安装的可选能力，不是拼错或缺失的必需系统；没有删除真实依赖。真实2D组合和game108组合另由严格声明回归约束，超集历史环签名保留，不以全registry超集等同实际游戏装配。

S3/S4最终机器门、浏览器画面与独立裁决紧接下文记最终结果。当前静态文档与游戏指纹冻结为 `fa44cf15c26e5769`；本证据文件不改变游戏指纹。仅交程序与复查证据，不代owner签署人门。

### 最终机器门、画面与独立交付结论

最终同一 `gameHash=fa44cf15c26e5769`：

| 项目 | 最终事实 |
|---|---|
|S3 gate|2026-09-15 20:01:05北京时间，退出0；渲染探针通过，12控件中11个点击后DOM实际变化，零控制台错误。日志disposition-final-s3-gate.log|
|正式浏览器旅程|退出0；正常20Hz、真实鼠标购买→拖放→战斗→结算→第二轮商店；六张连续画面、pageerror空。日志disposition-final-browser.log、self-check/shots/browser-roundtrip.json|
|S4 gate|2026-09-15 20:02:10北京时间，退出0；32文件203通过/1历史跳过、4份GD剧本绿。日志disposition-final-s4-gate.log|
|S3独立复核|PASS，[当前源码报告](review/s3-disposition-independent-20260915.md)，同hash已落账|
|S4独立复核|PASS，[最终独立报告](review/s4-disposition-independent-20260915.md)，同hash已落账|
|流程板|S3机器与复查均有效；S4机器与复查均有效，**仅owner人门待签**。日志disposition-final-board.log|

程序和独立复查均实际打开结果截图，造成伤害为我方36/敌方60，治疗0/0；原71中的过量伤害已排除。伤害、治疗、解释文字与继续按钮显示完整。该卫道士旅程没有治疗，0/0不冒称发生了正治疗；实际恢复22由前述真实生产接触测试证明。独立侧另复跑六实例出售及拖拽中禁售，退出0。

通用UI探针虽退出0，其可驱动率仍为0/21（不匹配当前JSON动作参数与拖放），故不把该摘要当作操作验收。真实操作依据上述程序与独立浏览器旅程；四份GD条件另经CLI执行，未修改acceptance迁就实现。

独立隔离回归39文件256通过、1历史跳过，退出0；本轮四项撤修分别修改实际伤害回执、治疗分账、自动快照与SelfRule相位，均锚点1、真实退出1、原字节SHA恢复。独立侧另从正式三轮JSON抽取原16失败所属11文件逐一核对，三轮全passed。历史005/006六组撤修及原GD三组撤修保留。

门禁期间再次核对1328源码/测试/脚本与三轮冻结指纹，无变化（disposition-source-final-verification.json）。最终未新增单位、技能或素材装配；本轮程序收尾与独立复核完成，owner自行签核，R2未启动。
