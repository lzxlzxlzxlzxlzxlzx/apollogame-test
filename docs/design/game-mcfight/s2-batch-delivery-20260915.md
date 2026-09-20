# S2 连续批次程序交付与总复查入口

> 当前收尾（2026-09-15）：[程序收尾结论](s2-program-closeout-20260915.md)。225项回归、类型/构建全绿；C1/C3—C6及播放器接口独立复查通过，六组撤修验红；REQ-001～003已按原合同closed。真实14段动作素材仍未验收，S2人审不代签。以下旧待办/失败状态保留为历史。
> 2026-09-15 收尾更新：原mortal死亡当拍掉落合同已恢复，225项相关回归通过、类型/构建通过；REQ-001～003按独立历史合同核对已closed。旧195通过/1失败记录为修复前历史。详见 [死亡掉落合同](s2-mortal-closeout.md)、[可选排序核对](s2-optional-order-audit.md)、[性能风险](s2-performance-risk.md)。本批独立复查结论另行落账；真实14段动作素材未验收。
2026-09-15。对应 s2-remaining-program-batch.md。B、V02及已有公共修复的独立通过结论保持；本批结论仅为程序自证，不能代签S2。

## 六包结果

| 包 | 当前状态 | 证据与具体范围 | 剩余 |
| --- | --- | --- | --- |
| C1 双技能取消/挂点 | 部分通过 | s2-c1-closeout-evidence.md，原5项和V02回归保留 | 原独立复查者复核；不重复施工 |
| C2 播放器 | 部分通过 | s2-clip-player / s2-bound-playback 与原action-observation/axe测试；帧时长、循环、夹止、镜像挂点、只读阶段、真实HP反馈、中断清理。浏览器axe-release Tick3目标30、区域1；axe Tick4目标23、区域0 | 14个真实片段、真实像素/握持/斩击边界验收仍缺；僵尸/恼鬼目前数据绑定与占位读数，不能称合格动作 |
| C3 接敌避让 | 部分通过 | 原V06七项+C3三项：3/6围攻100拍、步长上限、间隔、前摇不重启、双向转角；surround/unreachable画面 | 独立复核；不可达采用已允许的墙挡停实验回退，不宣称完整导航 |
| C4 多段效果 | 部分通过 | C4五项：三段间隔2、每段3伤害、两敌移动进出、友伤0/.5、首段后生产硬控/死亡、来源和区域清理、新局隔离 | 独立复核；使用任务单允许的3伤害，不改为4重做语义 |
| C5 确定性/规模 | 部分通过 | s2-c5.test.ts：相同seed/input三次100拍，完整权威快照逐拍相同；覆盖移动、双技能、三段、死亡、清理 | 三规模九轮测量已完成，见下表；待独立复核，没有正式性能阈值 |
| C6 代表机制 | 部分通过 | s2-c6.test.ts 11项：弹丸飞行/命中/寿命，横纵穿透光束、持续穿透及中断，追踪后固定落点/躲避，召唤位置归属/死亡、骑乘蛇身级联；C4复用为持续区域 | [共享血量及死亡转换A施工记录](s2-c6-public-gaps.md)已补七项自证；待独立复核与限定外的伤害形态 |

## 需求到能力映射

| 代表需求 | 数据模板 | 注册能力 | 证据 |
| --- | --- | --- | --- |
| 远程弹丸（未来骷髅） | bolt | Caster/Prefab/Launch/Motion/Overlap/Trigger/Hitbox/Lifetime | C6 projectile，禁止把V02定点区域算弹丸 |
| 穿透光束 | beam / sustainedBeam | Flow/EventWhen/Caster/Prefab/Shape/Hitbox | C6 beam两朝向与三段中断 |
| 固定落点轰击 | blast | Perception/Steering/Flow/Status提交/Caster | C6 bombardment stationary与moving对照 |
| 持续区域 | pulse | Flow/EventWhen/Caster/Prefab/Hitbox/Resource | C4：Tick1/3/5真实HP结算 |
| 召唤与归属 | minion | PrefabOrigin/Hierarchy/Mortal/HierarchyCascade | C6 summon及relationSkeleton |
| 特殊关系 | body/rider/segment1/segment2 | HierarchyResolve/Cascade | 仅骨架；共享HP、尸巫转换缺口另单 |

## V01—V08口径

V01、V04：B已独立通过范围继续通过。V02：原样例通过，C1与新动作绑定扩展部分通过。V03/V05：按既有capability-plan逐条保留历史证据，真实素材及特殊机制未覆盖项不自动转绿。V06：部分通过（C3）。V07：部分通过（C4及持续光束）。V08：部分通过（C5；性能仅测量）。整个S2未签核。

## 画面索引

`evidence/batch-visual-20260915/observations.json`是程序通过页面下拉框和单步按钮实际读取的记录，与同目录PNG一一对应。

- axe-release：Tick3生成区但目标HP30；axe/axe-left：Tick4目标HP23且区清空。原单姿态明确标临时。
- axe-control：Tick3控制flags32，逻辑Flow仍Active，但AnimState显示Recovery且不释放；axe-death：攻击者消失，目标HP30。
- pulse-tick5：两敌41/47、友军45.5；pulse-control/death：只发生首段47/50/48.5。
- projectile：Tick8 HP25、区域0；beam：两个敌人26、友军30；持续光束及硬控分别留图。
- bombardment-dodge/hit：相同固定落点时序，移动目标30、静止目标25。
- surround、unreachable、relations：围攻、不可达挡停、来源死亡级联。
- two-bindings、vex-binding：两个近战实例及真实Dive阶段读取，missingArt=true。

图片只能证明几何机制和接口可观察，不能替代真实动作验收。

## 独立复查交接

由原复查者复跑最终命令、核对上述PNG与逐拍日志。C1重点隔离撤去HierarchyCascade Resolve时序应验红；本批仅新增数据装配与观察器，不重复推翻已通过B。共享生命探针是能力不足反例，不计成功验收。

原复查agent额度不可用，尚无本批独立结论；未使用重置额度、未代签请求。真实素材待策划/美术提供。公共缺口已获owner选择A，施工结果与局限见下文。

## 最终程序结果与限制（A后）

A路线已获用户明确选择并施工。`t2-damage-routing`已登记，协议/组件映射与声明同步；七项生产接触测试覆盖共享池、头部0.5倍率/本体1倍、最大HP与标签分型、有效伤害归属、死后不抢归属、零伤害、转换次数递减以及源同拍死亡的实验分支。读取模板库只读templates，不读取本拍生成seq；显式安排death-conversion在targeted-prefab-spawn前，解决原来PrefabLibrary组件级回边。原失败日志保留 c6-a-first.log。

23能力29系统无环、无重复ID；仍报告16条指向未安装可选系统的排序引用（均在全注册表存在），没有删除这些声明。不能将该报告写成“零悬空引用”。见 c6-a-final.log。

直接Hitbox伤害走可选路由，HP直接在damage-route结算，resource-apply随后处理普通ResourceModify；未配置的普通伤害保持原路径。局限：尚不覆盖同池DoT/治疗与直接伤害的来源合并、执行类伤害/所有条件门的部位路由。不得据七项样例宣称所有伤害形态支持共享生命。来源死亡仍保留命中标签是明确实验分支，不是正式尸巫裁定。

### 最终验证

- 本批及相关公共回归：32文件，195通过、1失败、1跳过，命令实际退出1；日志 `evidence/batch-regression-final-20260915.log`。
- 跳过项为昂贵规模测量，已单独完成2/2、退出0，记录 `evidence/c5-final-20260915.log`；常规回归不重复跑30分钟测量。今后需设置 `$env:MCFIGHT_SCALE='1'` 显式运行 s2-c5.test.ts。
- 唯一失败：mortal.test.ts 的死亡掉落要求Tick1已经展开，当前已有普通prefab消费者在Update，死亡在Resolve，实际需后续Tick消费。该测试的World没有Hitbox、damage-routing，未安装本次A能力。保留失败，不修改断言、未借本次A扩大修改旧掉落时序。需要主程单列合同处理，整体回归不能写全绿。
- 类型检查退出0，构建退出0（日志 batch-typecheck-20260915.log / batch-build-20260915.log）；源码组件声明检查2项通过、2项未选，退出0（c6-a-declaration.log），不是全库SCC棘轮通过。
- scoped-gate脚本Windows直接入口条件未执行main；同目录临时副本显式调用main后，因无.git按0文件NONE退出0，**此门禁无有效比较基线，不能当作通过证据**。执行记录 batch-gate-20260915.log，临时脚本已删除。

复跑受影响链：

```powershell
node node_modules/vitest/vitest.mjs run games/game-mcfight src/skills/tier3/flow.test.ts src/skills/tier3/caster.test.ts src/skills/tier2/steering.test.ts src/skills/tier2/hitbox.test.ts src/skills/tier2/mortal.test.ts src/skills/tier2/anim-state.test.ts src/skills/tier1/hierarchy-resolve.test.ts src/skills/tier1/hierarchy-cascade.test.ts src/skills/tier2/collision-resolve.test.ts --maxWorkers 2 --minWorkers 1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run games/game-mcfight/s2-closeout-audit.test.ts
node node_modules/vite/bin/vite.js build
```

### C5测量

Windows 10.0.26200，Node v24.15.0，Intel i7-14700HX。每组预热1000Tick一次，随后三轮各1000Tick。20/50/100指战斗单位数，含一个目标；技能/事件挂件使结束ECS实体数为135/345/695，三轮一致。结束及停止索敌后10拍的攻击区均为0。

| 单位 | 三轮总耗时ms | 单Tick中位数ms | P95ms | 最大ms |
| --- | --- | --- | --- | --- |
| 20 | 2586.5 / 2771.0 / 2496.1 | 2.33 / 2.42 / 2.28 | 3.93 / 4.47 / 3.75 | 7.06 / 8.14 / 6.24 |
| 50 | 33416.9 / 35029.3 / 33330.2 | 28.84 / 29.90 / 28.65 | 82.37 / 84.27 / 82.61 | 123.37 / 195.79 / 113.76 |
| 100 | 337788.6 / 400777.6 / 642534.6 | 264.34 / 311.70 / 520.16 | 1175.54 / 1346.34 / 1950.26 | 2095.52 / 2399.14 / 4184.45 |

测量期间存在编辑、类型检查及后段诊断运行的资源竞争，100单位后两轮不是独占机器基准。即使最低一轮也明显非线性；只证明完成测量与当前样例无攻击区累积，不能证明所有内存无泄漏或性能可上线。测量工厂未安装新damage-routing，报告不冒称测了新增转换负载。

### 总复查仍需处理的具体项

1. C1与本批新样例独立复跑，针对A新增路由/倍率/LastDamage/转换次数进行隔离撤修；原复查agent当前额度不可用，未伪造独立结论。
2. 旧mortal掉落时序失败及16条可选排序引用由主程核对；无Git环境门禁需要有效冻结/差异基线。
3. 真实14动作片段、像素挂点、武器握持和5%斩击边界由素材交付后验收。
4. 策划确认来源先死亡的转换分支，以及普通非尸巫伤害介入时“最后尸巫标记”与“最后任意伤害来源”的优先规则；本次只自证有序有效来源与显式sourceMask过滤。
5. C6同池DoT/治疗/执行类伤害与条件门扩展尚未覆盖；规模性能阈值及是否优化需另立范围。

不关闭REQ-001～003，不代签S1/S2。B历史通过继续保留；新增公共链路仅按本批实际回归与限制交复核。

## 独立复跑副本

已准备项目同级 `mcfight-s2-batch-20260915-freeze`：独立源码与MC Fight场景、共享只读依赖junction、源码SHA256清单。程序在该副本复跑新A七项+组合审计一项，共8项退出0，仅证明副本可运行，不冒称独立复核。副本不含全游戏库/全部素材/Git，整库构建和门禁仍以共享工作区记录为准。

浏览器本轮保存21张PNG，暂停后读数保持Tick15，重开回Tick0；controls.json保存控件复验。最终转换画面读到source=lich、HP10；原图缺失与质量状态保持明确提示。
