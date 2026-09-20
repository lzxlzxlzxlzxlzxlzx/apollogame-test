# REQ-005 决策资格子项施工交接

2026-09-15，owner 已批准 A。范围仅 EntityCheck / Flow 拍初决策，未改 acceptance、游戏装配、Caster、Hitbox。

- `range.min` 与 `max` 均闭区间，非法数值失败关闭。
- `resource:{id,min?,max?}` 为被查实体自己的 Resource 闭区间；女巫 max 可由数据编译为 0.7×最大 HP。普通 ConditionExpr resource 按全局语义 ID 查找，不可用于多实例同名 HP，此前提议现已更正。
- `neighborhood: {radius, tagMask?, aliveResource?, count:{min?,max?}}` 以被检查实体拍初位置为圆心，排除自身；无目标也可检查。只计入存在拍初位置且符合阵营/当前生命资格的实体；没有递归条件或缓存。计数默认为 0 至无上限。
- `captureTarget.captureAim=true` 可选保存 `targetSnapshot.aim={x,y}`；方向来自源与目标拍初位置，零距离为 +x，缺失或非有限坐标拒绝启动。不启用则不增加快照字段。
- Flow whenEntities 拒绝现在进入既有每拍聚合 reject trace；没有新增系统。
- 删除 Flow 虚假 Transform 读并声明实际 FrameStartTransform。实际 27 系统审计无环；Flow 现在先于 steering / motion，源于删除错误实时位置依赖。最终游戏轨迹应验证此顺序，不能把旧 Flow 后置次序视为合同。

复跑：`node node_modules/vitest/vitest.mjs run src/skills/tier2/entity-check-s4.test.ts src/skills/tier3/flow.test.ts`：14 新增 + 14 旧回归 = 28 通过，退出 0，日志 req005-neighborhood.log。涵盖 3.999/4/4.001 与失败不扣 CD、空场无目标、死敌/友军、双实例、移动源/邻居拍初位置、圆边界、非法参数、方向承诺和零距离，以及同名 HP 隔离与 0/38.5/38.501 阈值。

审计：`node node_modules/vitest/vitest.mjs run games/game-mcfight/s4-combat.test.ts -t "complete current composition"`：1 通过，17 未执行，退出 0。实际扫描 27 系统，SCC/重复 ID 空，15 可选引用均存在于全局库。见 req005-neighborhood-audit.log。

独立复查应分别撤掉 min 下界、邻域计数判断、拍初位置读取或 aim 快照，要求对应测试转红；施工者未把自测写为独立复核通过。公共类型检查与最终全量战斗回归由主程在并行变更合并后统一执行。
