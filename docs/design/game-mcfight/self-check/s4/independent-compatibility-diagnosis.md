# 独立兼容性诊断（只读生产代码）— 2026-09-15

诊断者 s4_drag_review。未修改生产源码或旧测试；诊断脚本只在 self-check/s4 复制系统声明进行图分析。

## 当前 closeout 新环

独立执行 `node node_modules/vitest/vitest.mjs run games/game-mcfight/s2-closeout-audit.test.ts`，1 失败，真实 SCC 见 independent-closeout-scc.log。完整逐边数据保存 independent-closeout-edges.json（含各系统原声明）。

核心短环：

- targeted-prefab-spawn → collision-resolve：前者写 Shape/Transform，后者读 Shape/Transform。这是写入新实体的真实声明，但推断要求碰撞读取本拍刚物化实体，与已确认的下一拍接触合同不一致。
- collision-resolve → targeted-prefab-spawn：前者写已碰撞修正 Transform，后者读释放位置 Transform；这是晚物化应读取本拍最终位置的真实依赖。

其余长环完整路径由上述第一条回边闭合：

- collision-resolve → hitbox（Transform）→ damage-route（DamageRequest）→ resource-apply（Resource + 显式）→ mortal（Resource）→ targeted-caster（DestroyRequest + 显式）→ targeted-prefab-spawn（SpawnRequest + 显式）→ collision-resolve（Shape/Transform）。
- collision-resolve → death-conversion（Transform）→ targeted-prefab-spawn（SpawnRequest + 显式）→ collision-resolve。
- collision-resolve → mortal（Transform）→ hierarchy-cascade（DestroyRequest）→ destroy-apply（DestroyRequest）→ targeted-caster（显式）→ targeted-prefab-spawn → collision-resolve。
- collision-resolve → targeted-caster（Transform）→ targeted-prefab-spawn → collision-resolve。

时点：拍初决策读取快照；Resolve 内 overlap读取移动后位置，collision-resolve消费已生成Overlap并修正现有实体，hitbox消费本拍接触；damage-route/resource-apply扣血，death-conversion/mortal/cascade/destroy处理死亡；targeted-caster在死亡及硬控已结算后释放；新实体的接触只能下一拍参与。不得删Shape/Transform声明。

建议一致边界：只将 targeted-prefab-spawn 放到 Resolve(10)之后、Hierarchy PostResolve(14)之前的 Materialize(12)。本拍晚生成区域保留，下一拍碰撞，Hierarchy仍能本拍对新实例挂点定位。只复制声明模拟此变更，29系统无SCC/重复，见 independent-proposed-phase.log。主程已采纳并另行验证生产实现，本诊断不冒充该实现的独立复跑。

## 原21失败：可兼容修复路线

来源为旧隔离基线的实际21同名失败（old-baseline-all-failures.log）。这些不是本次拖放引入，仍必须修复；不同类别不能用一轮刷新断言统一掩盖。

| 类别与数目 | 根因/读时点 | 修复方式与必须保留的行为 |
|---|---|---|
| 组件生成/manifest 3 | 已授权S2新增组件未生成入册 | 执行现有生成器与manifest更新机制，核对新增来源，不手写生成结果；生成后重跑防漂移门。此项可合法更新数据产物，无玩法变化。 |
| cycle-tiebreak 4 | resource-apply已由Update移至Resolve，原测试不再产生其宣称的同相位Resource推断环；注册序不能跨相位反转正式合同 | 不把resource移回Update。纯排序算法的平局测试应用真正同相位的局部声明夹具；另保留真timeline/event/resource组合的实际相位顺序及资源效果断言。这是更新已失效测试构造，不降低确定性合同。 |
| declaration-audit 2 | Phase及SCC基线仍是S2改动前全库结构 | 先落实新旧行为回归和每环理由，再更新phase棘轮；SCC不得只因新输出刷新。区分全库不同时安装的超集环与实际游戏组合环。 |
| ai-lab 2、grid-move 1 | aggro只查FrameStartTransform；这些组合未安装藏在motion能力中的快照生产者，首次索敌为空 | 快照应是所有决策能力共用、恰好安装一次的基础服务，或明确能力依赖自动安装；不要退回实时Transform，也不能要求静态炮塔/hex移动为索敌安装无关自由运动。首拍必须恢复捕获、400拍后相邻停断言保持。 |
| navmesh-bake 1 | 测试取motionApplyCapability.systems[0]；该位置被新快照系统占用，装的是快照而非运动，实际32距离不降 | 保持原motion系统的公开数组首项身份，快照按自身phase仍先执行；更稳健的新调用按ID查，但不应仅改旧测试来掩盖兼容破坏。 |
| flow-field 1 | 精确执行列表新增frame-start-transform | 经首拍位置合同核对后，在顺序契约列入真实快照，不删除该系统；原steering→path-follow→flow-field→motion相对序必须保留。 |
| platformer 1 | overlap已移Resolve，ground-sense仍Update读取上一拍Overlap，旧断言暴露真实相位脱节 | 将接地感知归入Resolve碰撞观察段（overlap之后、jump Commit之前），明确需读取碰撞前/后的Velocity。不能只改顺序断言；落地当拍Grounded与跳跃需行为回归。 |
| game-103、boomerang-compose、path-follow、pull-anchor、resource 5 | Update组合中 agg ro/steering/Flow 与 SelfRule/OverTime 的Resource/State/Status/Transform回读环 | 分清SelfRule条件决策和结算后反应：现在SelfRule声称runsAfter resource/hitbox但自身Update，跨phase引用并不会让它读取本拍结算。其spawn分支读实时Transform又写Resource使后移动坐标→self-rule→aggro资格→移动成环。应明确self-rule采用拍初决策还是结算反应合同，必要时拆成准备意图与Resolve后提交；若整体迁移，必须同时考虑普通prefab Update消费者，否则旧spawn无意迟拍。不能仅添若干runsAfter隐藏。OverTime清Status影响下一次普通决策，硬控新施加仍由释放检查处理。 |
| SLG scale 1 | 机器资源竞争 + 新每拍快照复制所有Transform的成本；旧阈值失败两次 | 空闲固定worker复测保存分布；快照仅有决策消费者时启用、避免重复全表复制是可行成本优化方向，但须真实测量。不可放宽性能阈值当成功。 |

五个Update组合共同依赖链应从实体决策和反应职责划分解决。条件读取Resource/State与spawn读取Transform属于不同用途，不能据组件声明粗宽就删掉实际读写。全库90系统超集并不一定需要无环，但每个既有实装组合不应新增告警。

## 伤害统计审计意见

Resource拍末净差会被同拍治疗抵销。观察生产DamageRequest可避免此误差，但它代表命中请求，不天然等于实际扣血：路由倍率、资源不匹配、死亡后请求和过量必须有明确口径。若S4所有DamageReceiver固定自身hp倍率1，可记录“有效命中请求伤害（包含过量），治疗另列”，交策划核对，不标成实际HP净扣除。不能累加LastDamage来替代（同池多次命中只保留最后一次）。更完整的公共方案是路由结算事件，但未经新范围授权不扩展。observer/adapter不得另写伤害算法。
