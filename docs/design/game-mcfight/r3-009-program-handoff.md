# REQ-MCFIGHT-009 施工与复查交接

授权：owner明确选择“最小扩展最大生命检查与捕获目标删除”；独眼巨人不治疗、成功启动CD5秒。见r3-owner-decisions.md。施工主体为本程序负责人，独立结论见review/r3-public-008009-independent-20260915.md，不代签整个R3。

公共字段：EntityCheck.resource.field 可选current/max，缺省current；FlowTransition.captureTarget.destroyOnCapture 可选。捕获先通过目标/距离/最大生命检查及已有销毁请求检查，再保存快照、提交DestroyRequest、执行阶段动作。失败不执行启动动作和CD效果。一次Flow扫描的已销毁目标集合防止两实例重复成功。删除不伪造成巨大伤害，也不产生治疗。

实际时序：拍初快照/索敌 → Flow成功捕获并提交销毁 → 移动/接触 → Hitbox检查此前已有销毁意图 → 伤害路由 → Resource结算/转化判定 → Mortal死亡判定 → 层级/实体清理 → 晚段Caster检查/Prefab展开。独立复查已记录实际执行顺序。Hitbox不等待本拍稍后Mortal结果；显式hitbox→mortal保留既有顺序，并阻止DestroyRequest组件级推断出的逆边。尚未产生的新攻击由Caster拒绝；已存在但尚未命中的受sourceCheck约束区域由Hitbox拒绝并清理。

吞噬逐拍合同：Tick1成功删除且CD归0、进入恢复；Tick61恢复结束并产生解锁意图，Tick62提交解锁；Tick101和201可再次成功，CD均归0。恢复沿用旧3秒，5秒CD以成功启动计，未治疗。重击保持独立2秒CD/17伤/48旧像素÷24半径；最大HP51、当前HP1不会误吞，真实重击只记实际1HP。

固定回归：r3-devour.test.ts 8项，含地空50阈值、51拒绝/重击、同目标争抢、已有销毁来源、被吞噬者待释放、双实例三轮及资源字段兼容。r3-devour-pending-hit.test.ts保留原独立探针的两项HP断言，另外检查攻击区域销毁；来源为隔离复查目录review-008009-extra.test.ts。

历史失败不删：self-check/r3/devour-pending-before.log记录150→143，退出1；devour-pending-after.log记录初次补读声明后的真实调度环，虽37项行为通过但不可交付；devour-pending-fixed.log为消除逆边后的37项通过、退出0，无环警告。最终组合图见combination-audit.json。

复跑：`node node_modules/vitest/vitest.mjs run games/game-mcfight/r3-devour.test.ts games/game-mcfight/r3-devour-pending-hit.test.ts games/game-mcfight/r3-source-routing.test.ts src/skills/tier2/hitbox.test.ts --maxWorkers=1 --minWorkers=1`；组合审计：`node node_modules/vite-node/vite-node.mjs scripts/mcfight-r3-audit.ts`。

限制：没有扩展吞噬治疗、尸巫身份装配、其他复杂机制或动作素材。无sourceCheck的历史区域保留既有独立生命周期；本项目主动攻击区域均声明来源有效性。撤修必须在隔离目录进行，不撤共享现场；分别撤最大生命选择、删除、争抢拦截和两处Hitbox待销毁检查，要求命中锚点且HP/行为断言真实失败。
