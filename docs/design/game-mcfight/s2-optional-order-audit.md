# MC Fight S2 可选排序引用核对

2026-09-15。当前23能力29系统的完整组合无环、无重复ID；analyzeSystemGraph将对子集之外系统的显式排序引用列为danglingEdges，共16条。全注册表存在性断言为零缺失，不是删依赖或忽略告警。

| 系统 | 声明 | 未安装的可选系统 | 本组合是否需要其行为 |
| --- | --- | --- | --- |
| flow | before | poker-eval | 否，无扑克求值 |
| flow | before | string-apply | 否，无字符串修改动作 |
| flow | after | zone-occupancy | 否，无占区计数条件；碰撞用overlap/trigger |
| flow | after | group-count | 否，无集合计数条件 |
| caster | after | clickable | 否，样例输入来自EventWhen/Flow，无Clickable组件 |
| prefab-spawn | after | merge-rule | 否，无合成规则 |
| prefab-spawn | after | merge-on-place | 否，无落格合成 |
| prefab-spawn | after | merge-proximity-clear | 否，无邻近合成清理 |
| prefab-spawn | after | order-fulfill | 否，无订单 |
| prefab-spawn | after | group-count | 否，无集合计数驱动生成 |
| prefab-spawn | after | tray | 否，无托盘系统 |
| prefab-spawn | after | drag-place | 否，无拖放系统 |
| prefab-spawn | after | grid-move | 否，无网格移动；样例使用Motion |
| hitbox | before | over-time | 否，当前样例不配dotPerTick/dotDuration/statusDuration |
| steering | before | over-time | 否，同上 |
| nav-follow | before | over-time | 否，同上 |

三段/持续区域通过Flow按段生成真实Hitbox，不能因为名字为“持续”就认定必须安装OverTime。以上引用全是能力库共享系统对其他可组合能力的可选顺序约束；对应功能一旦在游戏数据启用，必须安装其能力并重新审计，不能沿用本结论。

核对依据：src/assembly/capability-registry.ts 全注册表，src/assembly/system-graph.ts 子集分析语义，games/game-mcfight/s2-closeout-audit.test.ts 全组合与全局存在性断言，以及当前MC Fight数据工厂。没有把这些可选能力空装进游戏来消提示，也没有删除排序声明。

实际必需链已装入：拍初位置/Flow边界提交/aggro/steering/motion/overlap/trigger/hitbox/resource/mortal/destroy/prefab/caster/hierarchy，外加launch/lifetime/pathfind/AnimState/damage-routing。mortal后段掉落复用已有Resolve消费者，不增加系统节点。最终原始报告随 closeout-green-20260915.log 保留，独立复查须复核此分类。
