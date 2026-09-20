# R2 程序交付证据

最终结论：本批内容装配与校验完成，独立复查 **PASS（仅R2范围）**，见 [独立报告](review/r2-independent-20260915.md)。保留所有待定字段与R3/S6未验证状态。

日期：2026-09-15。施工依据仅为 `r2-program-work-order.md`。开工已读取看板，S4 owner 人门为已签；新增R1/R2文档导致旧机器/复查指纹显示过期，保留历史S4通过，不代签后续阶段。此批是内容装配和校验，不是84单位实战通过。

## 当前交付

- 84张R1卡通过 `legacyUnitIndex` 精确连接84条旧事实；未散读Unity源码或重新提取旧数值。
- 84个UnitDefinition、84个DecisionProfile、84个PresentationProfile、84个legacy-source记录。
- 186个装配：177个完整复原槽（包括子效果、被动与不同普通/重型攻击），另有9个明确限定为 `s4-validated` 的历史已验收变体。
- 33个机制族条目（SK01—24与实际被装配的9个M修饰）；真实能力ID全部存在。模板只表示候选能力组合，不能将 `SKxx` 当作引擎已注册系统。
- 6个隐藏单位完整保留：dread_beast、dread_ghoul、dread_spider、dread_thrall、stradpole、vex。
- 矩阵84行已在完整校验退出0后更新为 `validated-with-pending`，附内容ID、摘要hash、待定数和机制族项。R3/S6仍为pending。

内容摘要：`702039a635181a88036d0d9f731924029d2c9427129570cf03727491c2e14544`。

## 六层与唯一事实来源

| 层 | 文件 | 消费边界 |
|---|---|---|
|legacy-source|games/game-mcfight/content/legacy-source.json|只读事实索引/hash、旧类名、素材引用、冲突/缺参/未消费参数；不进入运行投影|
|adoption|games/game-mcfight/content/adoption.json|逐数值来源选择、理由和待定ID；只在内容校验/策划裁定阶段读取|
|units|games/game-mcfight/content/units.json|唯一正式单位定义；S4六单位和S3历史骨架从此选择|
|loadouts|games/game-mcfight/content/loadouts.json|单位独立装配ID，区分主动/子效果/被动及S4作用域|
|decisions|games/game-mcfight/content/decisions.json|全量候选、锁/CD/目标门控和原始策略；复杂优先级/循环未落实项显式待定|
|presentations|games/game-mcfight/content/presentations.json|主体候选和每技能阶段、根/身体/握持/效果/接触挂点、镜像及缺失VFX/SFX槽|

运行投影 `runtime-selection.ts` 只读后四层；不导入R1、旧事实、legacy-source或adoption。S4的 `s4-balance.ts` 现在仅组合从统一目录投影的units/skills及既有经济/战场常量，没有第二份六单位数值表。原S3三单位body事实也改为目录视图；S3旧100HP隔离断言因此实际失败，已保留红日志并改为“修改第二实例前捕获第一实例HP，随后仍不变”的原隔离合同，CD/阶段/目标断言保持。正式S4数值与商店次序逐字段对照迁移前快照不变。

`self-check/r2/s4-before.json` 是迁移前不可变验证证据，不是运行来源或生成器回退。生成器若正式units文件丢失直接拒绝，不从证据或旧事实恢复假运行表。六单位S4变体仅保留已验收玩法：例如S4女巫定点范围药水不能覆盖R2三种投射药水；两者明确分作用域。

旧vex在复原目录仍是hidden；历史S4已验收六单位商店允许购买vex的子集行为保持。此为两个明确范围，不把S4商店当84单位上线入口，也不借R2改动策划既有acceptance。全量商店上线和各召唤购买政策需R3/策划确认。

## 采用、待定与素材数量

[机读摘要及逐状态单位ID](self-check/r2/readiness-summary.json)；[全部逐字段待定记录](self-check/r2/content-validation.json)。以下按“来源路径/新版字段”计数，同一旧值在SO、JSON及effective路径分别留证，不能误读为5507个独立缺技能。

| 状态 | 字段数 | 涉及单位数 | 含义 |
|---|---:|---:|---|
|adopted|10|5|已确认规则中的友伤倍率、对空资格、转化最大HP档位|
|normalized|0|0|没有已批准的新旧像素/时间/经济统一比例，未擅自换算|
|rebuilt|100|6|保留已验收S4新版单位/技能参数、资格及商店顺序，非R4最终平衡|
|pending-design|5507|84|3050个旧数字来源记录；2457个新版槽/缺参记录，逐项有原因|

53份简单/无主动攻击决策已配置基本候选和门控，31份复杂选择/循环为pending-design；原策略全文与所有候选保留，不能使用候选顺序假装实现复杂AI。任何未批准的单位属性、技能目标资格、命中资格、嵌套效果或子装配都不能通过正式复原运行选择器。6个S4已验证作用域可继续运行，不代表这6个单位完整复原装配已通过R3。

素材：84个idle身份候选；78张攻击图仅 `single-pose-candidate`；6张攻击图missing；84个死亡槽missing。所有动作、挂点坐标、VFX/SFX均missing，S6绑定全部pending。没有用图标拉伸伪造动作。素材路径仅作为旧引用保留，不直接当已加载新版资源。

## 复杂机制与待能力核对

CR01—15均带入装配：冲锋、前摇距离/升空承诺、成功启动CD和硬控取消、同边界俯冲窗口、状态刷新、固定落点、自爆半额友伤、尸巫最后有效标记/源死亡保留/一次转换/节肢优先与20/50档位、轻语灵共享池与仅头减伤、龙卷对空、声波穿透、吞噬对空。已确认字段有拒绝降级的校验，未将未知范围/倍率补0。

同SK重复装配不合并：舐脑魔两次SK05、食人妖普通/重击、女巫三药水均独立槽；＋击退只挂父攻击，不挂其召唤子效果；吸血治疗挂吸血而非普通拳击。分离头部的独立状态作用域保留为待组合方案，未写单位专属战斗解释器。

[按机制族的待核对项](../../../games/game-mcfight/content/issues.json)六项如下。它们是组合/规则待证，不宣称全部都是已确认的引擎缺口；本轮没有新增公共system或扩大A授权。

| 项 | 涉及单位 | 尚需核对 |
|---|---|---|
|SK10 跃击|遗弃者、暝煌龙、珊瑚傀儡、珊瑚巨兽|真实轨迹、高度/落点和控制收尾；禁止瞬移代替|
|SK20 条件处决|独眼巨人|最大生命门、恢复与删除的完整组合；距离/阈值待定|
|SK22 蛇身接触|地面娜迦|多体节共享整单位接触CD、缩节和蛇形路径；现有关系骨架不证明完整机制|
|SK24 骑乘|国王蜘蛛、骷髅德鲁伊|双生命、骑手独立决策与死亡下马；层级清理证据不可替代|
|M06 来源效果|先驱者、悚怖尸巫|尸巫直接Hitbox归属已有公共能力；随从/间接来源未定；先驱者击杀恢复需自身组合|
|M09 穿甲|铜羽泽鹗|护甲最终公式及穿甲参数未裁定，不把乘性修正假装穿甲完成|

需策划批量确认：统一单位/时间/经济比例与38单位覆盖冲突；7单位缺参及未消费参数；2457个新版数值/效果/资格槽；31份复杂优先级/循环；以上族中的未裁定边界。记录已按单位ID定位，R3只能挑已补齐且合法装配，不需重新盘点旧事实。

## 最终验证

日志均在 `self-check/r2/`。未修改四份GD验收剧本；本批无共享引擎源码改动。

| 检查 | 命令 | 结果 |
|---|---|---|
|生成|`MCFIGHT_R2_GENERATE=1 node node_modules/vite-node/vite-node.mjs scripts/mcfight-r2-generate.ts`（PowerShell用环境变量赋值）|84/186；同输入两次摘要一致；缺正式目录拒绝回退|
|内容校验与矩阵|`MCFIGHT_R2_UPDATE_MATRIX=1 node node_modules/vite-node/vite-node.mjs scripts/mcfight-r2-check.ts`|0错误，退出0；validation-final.log|
|R2及相关游戏回归|`node node_modules/vitest/vitest.mjs run games/game-mcfight --maxWorkers=1 --minWorkers=1`|33文件216通过/1历史跳过，退出0；其中R2新增13项；regression-final.log|
|类型|`node node_modules/typescript/bin/tsc --noEmit`|退出0；types-final.log|
|构建|`node node_modules/vite/bin/vite.js build`|退出0；18.05秒，既有大chunk提示保留；build-final.log|
|能力组合审计|`node node_modules/vite-node/vite-node.mjs scripts/mcfight-r2-audit.ts`|实际S4+拖放31系统、33个候选族组合均无SCC/重复/未知引用；退出0；audit-final.log及combination-audit.json|
|原GD验收回归|`ZEROCRAFT_ACCEPTANCE_CLI=1 node node_modules/vite-node/vite-node.mjs scripts/acceptance-run.mjs --game game-mcfight`|4份全部通过、退出0；acceptance-final.log|

额外静态 `game-skill-audit` 退出1：7处历史 `s2-visual.ts` createElement；不在本批改动或正式R2读取链中。没有修改审计基线来消红；独立复查已确认S4冻结同红、同SHA和正式入口调用隔离。组合审计0与此静态红项分别列示，不笼统称所有工具全绿。

## 独立复查交接

请独立复跑内容校验、13项R2及S3/S4相关回归，核对源/内容摘要、矩阵和作用域。隔离撤修须带锚点命中断言并恢复SHA：待定值/资格/嵌套效果绕过、重复或漏装配、CR规则降级、来源和别名/表现引用保护。确认静态S2工具红项历史边界。独立最终报告已附入下文；程序不自签R2复查，也不把R2替代S5/S6/S7/S8。

### 源文件保护与复跑范围

`self-check/r2/shared-engine-protection.json` 对比S4最终冻结的650个共享src文件，SHA差异为空；`acceptance-protection.json` 确认4份GD剧本原字节未变。此次仅内容/投影/校验及一处S3隔离测试契约迁移，因此运行MC Fight整目录相关回归，未宣称重新运行全共享库。S4历史三轮完整回归不冒充本次R2全库复跑。

生成命令的PowerShell写法：`$env:MCFIGHT_R2_GENERATE='1'; node node_modules/vite-node/vite-node.mjs scripts/mcfight-r2-generate.ts; Remove-Item Env:MCFIGHT_R2_GENERATE`。矩阵落账同理使用 `MCFIGHT_R2_UPDATE_MATRIX`。没有Git元数据，未虚构提交或推送；交付以当前文件、摘要和隔离复核为准。


## 最终独立裁决

[独立复查报告](review/r2-independent-20260915.md) 已给出 **PASS（仅R2）**，无本批退回项。隔离内容摘要与本报告一致；先独立9文件111项通过，五组撤修后恢复，再独立33文件216通过/1历史跳过，类型、构建、内容校验、31系统与33族组合审计和4份GD验收均退出0。

五组对抗验证覆盖：运行待定拒绝、同模板多攻击、确认规则字段、运行来源隔离、别名唯一性；各组唯一锚点命中1，均为实际断言失败退出1，恢复SHA一致。第一次大对象差异输出导致复查脚本ENOBUFS，原记录保留、不计成功；改为直接写日志后得到真实验红，未修改生产代码或测试规避。恢复后893个文件与共享源码差异为空。

静态S2工具的7处历史createElement仍是红项：独立复查在S4冻结版重跑同红，文件SHA完全相同；正式入口205文件导入闭包不含该工具、legacy-source、adoption或旧事实库。明确隔离为历史观察工具维护项，不改审计基线，也不冒称静态工具通过。

程序工作已完成并交独立复核。下一步由策划批量裁定待定参数/复杂策略，按R3验证逐单位行为；完整动作资源继续属于S6。此批未签署任何新的流程阶段。
