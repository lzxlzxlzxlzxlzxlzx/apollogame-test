# 运动与寻路手册

> 位移 = 数据：速度积分 / 缓动 / 转向 / 网格寻路 / 自由空间寻路各有能力，游戏层不写移动代码。
> 机读真相：`describe`（`src/skills/tier1·tier2`）；组件闭集 `src/assembly/component-map.ts`。

## ① 做 X → 用什么

| 任务 | 能力实名 | 怎么接（一句） |
|---|---|---|
| 按速度移动 | `t1-motion-apply` | 实体挂 `Velocity`；读 Transform+Velocity 写 Transform |
| 持续加速度（重力/推进） | `t1-accel-apply` | 挂 `Acceleration`；读 Velocity+Acceleration 写 Velocity |
| 表现字段平滑过渡 | `t1-tween` | 挂 `Tween{target,from,to,duration,easing}`（滑入/淡入/镜头）；不驱动被 Condition 读的值 |
| 朝/背目标移动（AI） | `t2-steering` | 挂 `Steering{mode,speed,stopRange}`；配 `t3-aggro` 写 target + motion-apply |
| 六边形棋盘沿格寻路 | `t2-grid-move` | 单位挂 `HexPos`+`GridMover{period}`+`Relation(target)`；世界放 `HexBoard`（内建 A*） |
| 连续坐标绕障寻路 | `t2-pathfind` | 世界放 `NavGraph{nodes,edges}`；单位挂 `NavAgent{speed,arriveRange}`+`Relation(target)` |
| 固定航点轨道匀速跑（巡逻/传送带） | `t2-path-follow` | 挂 `PathFollow{waypoints,speed,loop?}`（`pathFollowAt` 生成）；不索敌不绕障 |
| 传送带队列：有序不重叠占位 + 递进（不超车） | `t2-path-follow` | 同上 + `queueId,minGap?`（REQ-CONVEYOR-CAP M1）：同 `queueId` 按 path 进度排序，每个非排头成员夹在「前一名进度 − minGap」；容量 full 旗标/空槽分配/死锁**不建新能力**，组合 `group-count`+`event-when(level 双向)`+`effect-apply`（空槽用既有 `t2-tray`），见 `conveyor-queue-compose.test.ts` |
| 绕完一圈到末点→落一件+自毁（belt/巡逻收尾） | `t2-path-follow` | 同上 + `onEnd:{dropTemplate?,destroy?}`（REQ-PATHEND-DROP，非 loop 到末点触发一次，`ended` 布尔守卫防重发，=Mortal 的 path-完成版） |
| 排队叫号/消费队首（或队中任一个）后**全体前移补位**（槽间不留空洞） | `t2-queue-slots`（REQ-POOL-ADVANCE 缺口） | 挂 `QueueSlots{originX,originY,gap,headCount,memberTag,action}`；成员挂 `Tag`(含 memberTag)+`Transform`。每 tick 按既有 `QueueMember.index`（新成员排末尾）+id 升序稳定重排成连续 0..N-1、钉位、前 headCount 个自动挂/摘 `Clickable`。与 `t2-tray`（占坑制、老成员不前移）互补：占坑用 tray，消费即整体递补用本能力 |
| 定向抛射（火球/弹幕） | `t2-launch` | 飞弹 prefab 挂 `Launch{speed,toward}`+`Velocity`+`Hitbox`+`Timer(life)` |
| 摩擦减速 / 不越界 | `t2-friction` / `t2-bounds-clamp` | 挂 `Bounds`+`Shape` 限界；friction 靠 Overlap 法线 |
| 碰撞分层（跳过不该碰的组合，如 enemy-enemy） | `d1-overlap-detect` | `Shape.category/mask` 位掩码（Box2D 双向语义：`(catA&maskB)&&(catB&maskA)` 才碰）；缺省=全 1，两边不设=零回归 |
| 导航网格烘焙 | `d2-navmesh-bake`（原子） | 静态几何烘焙成可走网格供寻路消费 |
| **大规模同目标行军**（成百上千单位走向同一处） | `t2-flow-field` | 世界放 `FlowField{cellSize,cols,rows,goals[],blocked?,cost?}`（**多源** Dijkstra 铺满一次·无局部极小）；单位挂 `FlowAgent{fieldId,speed,arriveRange?}`。**一次铺场服务全部单位**——与 `t2-pathfind` 的「每单位各算一次」是**成本形状**之别，不是好坏之别 |
| 大军别叠成一条线（软避让） | `t2-flow-field` + `FlowAgent.separation{weight}` | Reynolds 分离力（`offset/-d²`），**权重恒被钳在流场之下**（永不掉头）。**软承诺**：允许瞬时重叠、靠力弹开 |
| 「不许穿模」的小队（硬避让） | `t2-flow-field` + `FlowAgent.orca{radius,timeHorizon?,maxNeighbors?}` | 移植自 RVO2（`src/skills/tier2/orca.ts`·Apache-2.0）。**与 separation 二选一**（同填 ORCA 优先）。⚠ 不是"保证不碰"——线性规划无可行解时落「最不违反」，实测把穿模从 ~90% 压到最坏 8%，不是 0 |

### 走位四选一（成本形状分诊·别按"哪个高级"选）

| 你的场景 | 用 | 为什么不是别的 |
|---|---|---|
| 固定轨/巡逻/传送带 | `t2-path-follow` | 不索敌不绕障，最便宜 |
| 少量单位·各走各的目标·连续空间绕障 | `t2-pathfind`（NavGraph + A*） | 目标各不相同时流场没有共享收益；但**图一大就超线性**（实测 500 单位 / 2304 节点：首拍 534ms · 稳态 20.4ms/tick） |
| 棋盘格逐格走（自走棋/战棋/塔防） | `t2-grid-move` | 六边格 A*，走位要"贴格" |
| **大量单位·奔同一处**（RTS 行军/塔防怪潮） | `t2-flow-field` | 铺一次全场共享：2304 格铺场 ~0.9ms，之后每单位 O(1) 查表。**同规模比 A*-per-agent 每 tick 快两个数量级** |

避让分三档（都不改走位·流场恒主导）：**不设**（会叠）→ **`separation`**（软·涌流观感·1000 单位 ~1.0ms/tick）→ **`orca`**（强·1000 单位 ~8.6ms/tick·**4000 单位超一帧预算**）。
调参与实测全表见 `docs/design/game211/crowd-pathfinding-research.md` §10；**`timeHorizon` 非单调**（为中场调大会把终点段调塌），改它必须中场/终点一起量。

## ② 样例指针

- registry：`t2-grid-move`/`t2-pathfind`/`t2-steering`/`t2-launch` 的 `describe.examples`。
- 真实用法：`games/game-i/physics-lab.ts`（运动台）、`games/game-i/ai-lab.ts`（转向/索敌台）。
- 平台跳跃另见 `t2-jump`/`t2-ground-sense`；`src/skills/tier2/platformer.integration.test.ts`。

## ③ 本线红线

- 位移**全用能力 + 组件**，游戏层不写坐标积分/寻路循环。
- 任何随机抖动（散射/AI 抖）走种子 PRNG（randomness.md），**禁裸 `Math.random`**。
- Tween 只驱动**表现**字段，不驱动进 hash / 被 Condition 读的 sim 值。

## ④ 正样例 / 反面教材

- ✅ `src/skills/tier2/grid-move.ts`（hex A* 内建）+ `pathfind.ts`（NavGraph）：寻路=数据。
- ✖ 游戏层手写 `dx/dy` 逐帧移动 / 自写 A*（各游戏重复造轮子）。

## ⑤ 查不到怎么办

新运动模式（如四向网格、飞行 3D 寻路）现有能力表达不了 → `docs/workflow/requests.md` 提缺口（3D 寻路进 `requests-3d.md`）。**不在游戏层写 movement system。**
