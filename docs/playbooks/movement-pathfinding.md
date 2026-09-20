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

## ② 样例指针

自由部署（REQ-MCFIGHT-004，owner 选择 A）：`t2-drag-place` 的 `Draggable.freePlacement` 可声明 `bounds` 矩形、`teamMask`、`deployedMask` 和 `bench` 矩形/固定锚点。仅支持完整等比缩放圆；自由落点必须完整圆在界内，且不与已部署同队圆相交，外切合法；拒绝不写位置或标记、不挤开其他单位。拖入 bench 撤回固定锚点并摘部署位。声明此合同后，投放区也遵守 `onlyFlag`；没有该字段的六角格与自由拖放保留旧语义。生产回归见 `src/skills/tier2/drag-place-free.test.ts`；限定扩展独立复查见 `docs/design/game-mcfight/review/s4-drag-independent-review-20260915.md`。

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
