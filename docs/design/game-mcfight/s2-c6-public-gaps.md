# C6 公共能力缺口与最小处理方案

> 2026-09-15本轮独立复查已通过七项直接Hitbox路由/转化实验及针对性撤修，见 [最终程序结论](s2-program-closeout-20260915.md)。不外推DoT/治疗/执行类或未裁定正式规则。
> 当前：用户已选择A，已实现可选直接伤害路由与转换，七项程序自证通过；以下反例为施工前能力证据。最终范围和局限见 [总交接](s2-batch-delivery-20260915.md)。

2026-09-15，程序实查。B、V02 历史通过结论不变。本单不授权扩展引擎。

## 可复现反例

`games/game-mcfight/s2-c6-gap-probes.test.ts`：生产弹丸击中可独立选择的 head，初始 head HP10、body HP30；12拍后 head HP5、body HP30。Hierarchy只关联位置与清理，不共享资源。测试通过表示反例稳定复现，**共享生命要求失败**。

查询了能力注册表、组件映射、combat / movement-pathfinding / rendering-fx / randomness 生产线手册，以及 Hitbox、ResourceModify、Mortal 和 Prefab 的实现。

| 需求 | 当前能力与证据 | 实际缺口 |
| --- | --- | --- |
| 轻语灵头/本体分别索敌，共享生命，只有头减伤 | Tag/Perception可以分开选择；Hierarchy可跟随；上述反例 | Hitbox直接对命中实体调用 queueResourceMod 的 local scope；没有受击部位→共享池路由及部位倍率 |
| 骑乘、蛇身关系与级联清理 | s2-c6.test.ts relationshipSkeleton：四个有来源的层级实体，主人死亡后清空 | 仅关系骨架通过；不证明共享生命或正式蛇身运动 |
| 尸巫只转化一次，归属最后伤害它的尸巫，按最大HP/节肢标签分型 | Mortal提供死亡及固定dropTemplate，Prefab提供来源 | ResourceModify只有资源/数额/scope/op，合并请求不保留末次攻击来源；Hitbox spawnOnHit只构造templateId/x/y，不能表达死亡时最后尸巫与条件分型 |

## 供 owner 裁决

A（建议）：限定公共扩展为①伤害接收路由与部位倍率；②按实际伤害结算顺序记录有效来源；③一次性死亡转换请求与数据条件分支。默认路径完全保留，补源死亡、同拍多源、共享池死亡只处理一次的组合与隔离撤修。先提交协议与顺序方案，不顺带扩展全部怪物。

B：上述两个机制明确留后续，本轮只接收关系骨架证据；由策划明确 S2 对代表性能力覆盖的例外，不由程序自动降低结束标准。

待策划裁定：最后尸巫先死亡后是否仍能转化；同拍多个伤害来源的归属以实际结算先后还是其他规则。当前未写进正式GDD。

## A路线批准与施工时序（2026-09-15）

用户已明确选择A。最小实现采用可选DamageReceiver/DeathConversion数据：普通未配置实体保留原Hitbox局部资源路径。配置实体命中后写入DamageRequest，由Resolve内的damage-route在Hitbox之后、resource-apply之前按实际接触顺序结算共享池及部位倍率，只在HP确实减少时更新LastDamage。死亡转换在resource-apply之后、mortal之前检查最终生命，按表中优先顺序匹配最大HP/Tag规则，发携带source的SpawnRequest并记一次性处理标记。生成模板的转换次数同步递减。

实验合同：同拍以确定的Trigger遍历/结算顺序为准；已经扣空后的后续命中不抢归属；记录命中时的source Tag，即来源随后死亡仍保留标记（不是正式尸巫规则）。初批路由仅覆盖直接Hitbox伤害，不把DoT/治疗自动宣称具备来源归属；混合来源需独立回归后扩展。
