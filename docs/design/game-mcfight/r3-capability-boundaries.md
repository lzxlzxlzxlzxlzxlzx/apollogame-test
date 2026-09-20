# R3 三类专门机制的真实组合边界

基线：r3-program-work-order.md、r3-planner-resolution-batch-1.md §5。这里只交探针与方案，不批准玩法合同，不把探针测试通过写成单位身份通过。

复跑：`node node_modules/vitest/vitest.mjs run games/game-mcfight/r3-boundary.test.ts --maxWorkers=1 --minWorkers=1`。三项测试分别断言实际可用部分或真实限制。逐拍证据为 self-check/r3/boundary-SK10.json、boundary-SK22.json、boundary-SK24.json。

| 机制 | 已实查的生产能力与实测 | 尚不能证明 |
|---|---|---|
| SK10 | registry 的 path-follow、motion、overlap、trigger、hitbox；两实例沿平面路径以每拍0.2连续移动至固定端点，落点真实接触，各扣5HP | 这是实验速度/伤害，不是珊瑚单位装配；没有战斗显示高度弧线、空中资格、受控和途中目标死亡合同。平台 jump 的 Grounded/固定纵向速度不能等同平面战斗跃击 |
| SK22 | damage-routing 将两个可命中部位路由至本实例头部资源池；A部位受3伤仅A池50→47。两个真实接触区域各扣5，目标50→40 | 入伤共享池已成立，出伤共享CD不成立；未验证蛇形历史路径、缩节、部位数量或头身资格 |
| SK24 | 两份真实单位Prefab、两份资源、两套独立攻击；以Hierarchy连接骑手与坐骑。杀死坐骑后层级销毁同时删除骑手 | 现有层级生命周期不等同下马；还没有独立生死后的重挂、合法落点、目标资格与顺序合同 |

实查依据：src/assembly/capability-registry.ts、docs/playbooks/combat.md；src/skills/tier2/path-follow.ts、jump.ts、damage-routing.ts，及生产Hierarchy/cascade实现。实验只布置初始实体与外部攻击区域、推进和观测；没有注入Trigger或逐拍代写位置。

## A / B 方案

- SK10 A：策划先裁定途中受击/控制、目标死亡与阻挡落点；再对现有路径和阶段窗口做最小公共组合/缺口扩展，分离逻辑平面位置与显示高度。影响轨迹和取消时序，需真实中断探针。B：保持相关单位不开放，保留平面落点探针；不能以瞬移或省略弧线冒充跃击。
- SK22 A：先裁定数量、缩节与受击关系，再提供共享出伤次数/CD域及路径历史的最小公共能力；保留已验入伤路由。影响多区域确定性与实例清理。B：暂不开放蛇身单位；不能以单实体或多个独立冷却区域代替。
- SK24 A：先裁定两种死亡、购买和下马位置，再组合/扩展公共关系解除与生命周期策略；双资源、决策沿用现有能力。B：暂不开放骑乘身份；不写单位专属骑乘状态机。

本轮owner对REQ-009最大生命/捕获删除的A裁定不覆盖这三项。它们保持合同待定，其他族并未因此自动通过或被撤销。
