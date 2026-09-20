# S2 死亡掉落收尾合同

2026-09-15，主程执行既有合同。依据：mortal.test.ts 原严格测试在一次tick后要求尸体移除、loot位于(33,44)；prefab.ts原注释要求同拍消费本拍请求。此前相位拆分令死亡请求错过Update消费者，是实现回归，不采用延后断言消红。

正式技术合同：本拍resource结算→mortal确认死亡并保存掉落坐标→销毁来源→Resolve后段展开掉落；本拍可观察实体存在，下一拍才进入移动/碰撞/命中。SpawnRequest新增可选spawnPhase=resolve承载明确的后段生成请求。未指定的普通生成时点不变；定向近战仍Tick3生成、Tick4命中。死亡转换现有默认普通请求仍保持其原时点，不把修掉落扩大成所有生成行为改拍。

回归必须保留原mortal断言，并补后段区域下一拍才造成碰撞伤害、请求不重复/不残留；独立复查撤去mortal的后段字段应使原测试恢复红灯。

## 2026-09-15 修复后结果

原mortal测试保持不变，5/5通过。新增s2-mortal-drop-order.test.ts严格断言：Tick1死亡+区域存在+目标HP30；Tick2接触HP25、区域清空；Tick3仍25且无请求/载体。36文件225项通过、1项昂贵规模测量按约定跳过，实际退出0；类型检查、构建退出0。

正式独立复查已在修复全绿后开始。冻结位置为项目同级mcfight-s2-closeout-20260915-review，区别于上批仍有旧失败的冻结版本。旧失败日志保留在历史证据中。

## 当前实际执行顺序

`evidence/closeout-actual-order.json`由真实World.getSortedSystems输出，退出0。Resolve段：overlap/trigger→collision-resolve→hitbox→damage-route→resource-apply→death-conversion→mortal→hierarchy-cascade→destroy-apply→targeted-caster→targeted-prefab-spawn。mortal写spawnPhase=resolve后由最后这个消费者处理，来源已经销毁，坐标来自请求本身；没有让新掉落倒流到本拍已结束的碰撞。

原mortal.test.ts与修复前冻结副本SHA256均为6D3228488C7C7B2888A9E9622F61FA1AFAECA6C2EF7C89D8173B34311657ADDE，严格原断言未改。

独立复核最终通过：225项同清单exit0，撤去spawnPhase单锚点命中1次，原掉落测试恢复1项失败/exit1；恢复原字节。详见本轮独立报告。
