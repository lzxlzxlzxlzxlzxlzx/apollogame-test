# S4 剩余16项共享失败：独立调用范围核对

日期2026-09-15；s4_drag_review，只读核对，未修改源码/旧测试，未再运行全库。依据策划 `s4-review-disposition-20260915.md`，本报告不按“文件属于别的游戏”自动隔离。

## 证据和消费边界

首次可复现基线统一为独立S3冻结副本 `C:/Users/24652/Desktop/projects/apollpgame/mcfight-s4-baseline-20260915`。原21项逐名红证据：`self-check/s4/old-baseline-all-failures.log`，182通过/21失败、exit1。当前逐名红证据：`self-check/s4/full-regression-final.log`，5103通过/18失败/1skip及worker异常、exit1。其中shape选项及manifest两项已有定点转绿，故本单剩16项，不把两次统计混成一次全绿。

正式消费入口：`games/game-mcfight/s4-world.ts` → `world.ts` 的20项基础能力，再加modifier-stack/stat-bind/damage-routing；部署另装drag-place。会话与Engine真实调用World/topologicalSort/组件协议/快照。不存在运行时自动装入ALL_CAPABILITIES的事实；registry import不是所有系统都执行。

S4未装SelfRule、OverTime、Timeline、PathFollow、FlowField、PullAnchor、GroundSense、Jump、GridMove。**但S2历史验证确实在 s2-capability.test.ts 直接装过SelfRule**；不能只看S4名单便宣布历史S2不受影响。S4直接消费aggro、steering（含separation）、motion（含frame-start）、Flow、Resource、Prefab、Overlap等，因而测试文件归属不代表调用隔离。

下表“当前红”均指最后完整日志中的事实；修复后由主程串行复跑更新，未提前写绿。处理人以职责表示，未冒充外部负责人已接单。

## 逐项清单

|序号|完整定位/测试名|所属、当前失败与冻结来源|MC Fight消费关系|处理人/独立建议|
|---:|---|---|---|---|
|1|games/game-103/game-103.test.ts / VBUG-02 定序面：满蓝图（orbit-motion 与 motion/hierarchy/camera-follow 同装）装载零成环告警|game-103组合；冻结与当前均Update SCC告警|环含直接消费的motion/steering/aggro/Flow；回路另经SelfRule/OverTime，前者S2曾消费|公共主程处理共同SelfRule决策/反应合同，PE-103复跑。当前不能整项隔离；修复共同路径后仅残余orbit/camera专属问题才可另划范围。|
|2|games/game-i/ai-lab.test.ts / 索敌：aggro 给敌人写 Relation(target=player)|PUI/game-i；冻结与当前Relation未生成|aggro为直接消费；该蓝图只装aggro/gridMove，缺FrameStartTransform生产者。不是与MCFight无关的私有算法|公共主程确认快照依赖安装契约，PUI补符合契约的装配；不回退实时位置、不能只改期望undefined。只有证明是显式必需依赖漏装且MCFight完整装配覆盖后，才可将PUI装配残项独立隔离。|
|3|games/game-i/ai-lab.test.ts / 寻路：grid-move 让敌人沿 hex 网格逼近玩家（距离单调下降到相邻停）|PUI/game-i；冻结与当前8未小于8|GridMove不在S4，但根因继承序号2的aggro无目标，不是独立寻路缺陷|同2；不能以MCFight不装GridMove就隔离其共享aggro前因。保持最终相邻距离1行为。|
|4|games/game211/slg-scale.bench.test.ts / 单位数扫描：找出 60fps 预算下的行军单位上限|game211性能；冻结与当前240单位均未满足16.7/3ms|直接消费相同steering.separation/motion/FrameStartTransform，非纯别游戏渲染；规模240—4000大于S4当前10单位|公共主程受控复测、定位成本；不能因文件路径豁免共享能力性能。若确认仅240规模预算不满足，需明确S4单位上限/测量/独立风险隔离，不能宣称能力性能全绿；正式阈值不擅改。|
|5|src/assembly/cycle-tiebreak.test.ts / ① t3-timeline + f1-resource（双方 RMW Resource·2-环）装得进且顺序确定|公共排序；冻结与当前顺序1不小于0|Timeline未装，但Resource与核心相位排序直接消费；Resource已迁Resolve使夹具不再同相位|主程修复测试契约：纯tie-break使用实际同phase夹具，保留生产timeline/resource跨phase行为验证；不得把Resource移回Update或删顺序断言。不可隔离公共守卫。|
|6|src/assembly/cycle-tiebreak.test.ts / ② t2-event-when 叠加成 3-环（event-when→timeline→resource-apply）装得进|公共排序；冻结与当前原环断言false|EventWhen/Resource直接消费，Timeline分支未装；原3环构造已失效|同5，明确现在合法时序及真实资源结果；不可直接隔离。|
|7|src/assembly/cycle-tiebreak.test.ts / ④ 平局键与 tier/注册序一致：按注册表序装载 → 低 tier 在前|公共排序；冻结与当前2不小于0|注册序只在相同phase成立，MCFight依赖跨phase死亡安全|同5；显式区分phase优先与同phase平局键，保留两种行为断言。|
|8|src/assembly/cycle-tiebreak.test.ts / 平局键 = 装载序：反序装载则裁决反转（键就是注册序本身）|公共排序；冻结与当前1不小于0|同5，核心排序实际消费|同5，不能要求装载序跨phase覆盖Resolve合同。|
|9|src/assembly/declaration-audit.test.ts / 非缺省相位的系统集合与基线逐一相等（挪相位必须同提交改基线）|全库相位守卫；冻结与当前基线漂移|MCFight引入/消费frame-start、window、Resolve战斗、Materialize等实际变更|主程对每项已批准时序/回归核对后更新相位基线；该守卫必须恢复绿，不可隔离。|
|10|src/assembly/declaration-audit.test.ts / SCC 集合与基线逐一相等（多一个红·少一个也红）|全库超集图；冻结与当前SCC结构漂移|超集含不共装能力，但MCFight相关相位迁移确实改变SCC|先修真实实装组合环，再逐SCC说明实际同装可能性后维护棘轮；不得仅复制输出压红。超集不共装的单独环可以逐个隔离，整个守卫不可隔离。|
|11|src/skills/tier2/boomerang-compose.test.ts / 定序面：九件同装零成环告警（读告警纪律·绿灯不等于没话说）|往返弹组合；冻结与当前aggro/steering/self-rule/motion SCC|三个正式直接消费者 + S2消费SelfRule；非boomerang私有代码问题|公共主程解决SelfRule写Resource/读位置的时点，再复跑；当前不独立隔离。|
|12|src/skills/tier2/flow-field.test.ts / 与 steering/path-follow 同装：零成环告警 · 执行序 steering → path-follow → flow-field → motion-apply|组合契约；冻结与当前精确列表多frame-start-transform|FlowField/PathFollow未装，但新增motion快照为MCFight直接消费的公开系统集合|新增快照是合法已批准阶段，应保留全部原四系统相对序并补快照实际位置；这属于共享接口契约维护，不是放宽行为；建议修绿，不能删快照。|
|13|src/skills/tier2/path-follow.test.ts / 与 game102 全套能力（destroy-apply/hierarchy-cascade/prefab 等 SpawnRequest/DestroyRequest 消费者）同装不成环·可 tick|game102组合；冻结与当前motion/self-rule/flow/aggro SCC|PathFollow本身未在S4装，但告警回路没有靠PathFollow闭合，涉及直接Flow/aggro/motion及S2 SelfRule|共同公共修复后复跑；不能按测试文件名隔离。|
|14|src/skills/tier2/platformer.integration.test.ts / 管线自动定序：Update(accel→motion→overlap→ground-sense) → Resolve(collision) → Commit(jump)|平台组合；冻结与当前4不小于2|S4直接用Overlap/Motion，GroundSense/Jump未装；Overlap迁Resolve后GroundSense仍Update读旧Overlap，真实兼容时点脱节|公共主程修GroundSense观察相位，保留落地/跳跃行为与碰撞相位；若只修MCFight后隔离此旧组合，必须明确其不执行且另有负责人，不能说Overlap未受影响。建议本轮修绿。|
|15|src/skills/tier2/pull-anchor.test.ts / 与 game-103 蓝图实装的全量能力集（blueprint.ts import 清单）+ bounce-relay/pull-anchor 同装·可 tick|game103组合；冻结与当前含pull-anchor的长SCC|PullAnchor未装，但其余同1且共享Relation消费者；去掉PullAnchor已有同类环|主程先修共同1/11根因，PE-103复跑剩余拉拽关系覆盖；当前不能整体隔离。|
|16|src/skills/atoms/resource/resource.test.ts / 与 game102 全量能力清单同装 · 可 tick|Resource原子组合；冻结与当前motion/self-rule/flow/aggro SCC|Resource是MCFight核心扣血路径；同13共同环|主程修共同SelfRule链，保留命中当拍资源结算/死亡/晚释放；不能隔离Resource测试红。|

## 可以隔离的范围与当前结论

截至本次只读核对，**没有足够证据把某一整项失败直接标为“与MCFight无调用关系、已隔离”**。上述大部分共用能力或内核守卫；仅部分末端分支（PUI hex装配、PullAnchor、FlowField、GroundSense/Jump、240单位性能目标）未在S4运行，但必须先排除共同前因。建议优先一次修复共有三类：快照供给契约、SelfRule时点、相位/排序夹具维护；随后剩余的纯非消费分支才按独立证据定点隔离。

若主程选择隔离，应提交该项失败最小环/调用路径、剔除非消费系统后MCFight实装仍无环/行为绿、以及对应负责人和未修合同。独立复核据此更新本表，而非由程序自行豁免。性能须记录当前S4上限10单位，不以该事实抹去共用能力240单位预算失败。

worker异常由主程按受控串行三轮执行；本报告未跑全库，不影响其测量，也不提前判“已解决”。统计新合同及S3/S4最终复查等待修复后再进行。

## 最新结论入口（2026-09-15收尾）

本表为原16项红的历史范围分析。最终16项均修复，未隔离任何整项；三轮Vitest JSON逐文件独立核对全绿。最新证据与PASS见 [S4收尾独立复核](s4-disposition-independent-20260915.md)。历史分析保留，不表示当前仍红。
