# R3-B2 r5 程序补救证据

本文件处理 r4 独立复查退回的两项撤修盲区。它不构成独立签核；独立复查只能在 r5 冻结副本中完成。

## 修正

- `r3-identity.fixture.ts` 记录由生产 Prefab 创建的 cone `Transform.rotation` 与 `PrefabOrigin.source`；横移场景在开战前完成对角部署，开战后只由 Velocity 进行真实移动。
- `r3-b2-production.test.ts` 新增两组真实生产场景：
  1. 喷火甲虫、寒冬狼首段真实接触后，目标通过 `Velocity{vx:0.035}` 横向移动；四段 cone 均保持启动时 `atan2(1,1.5)` 的捕获方向，且四次物理伤害和对应状态均成立。
  2. 烈焰人首弹出现后，移动的敌对 `Shape → Overlap → Trigger → Hitbox → Resource → Mortal → Destroy` 实际致死来源；余下 `shotIndex` 1/2 不生成。测试不写来源 HP、DestroyRequest 或 VolleyPlan。
- `prefab.ts` 同时将 cone 捕获方向写入 `Hierarchy.localRotation`。这避免父子层级解析在下一相位把新生成 cone 的 Transform rotation 重置为 +X。

## 撤修结果

| 撤修 | 锚点 | 结果 |
|---|---|---|
| 把 channeled cone Caster 的 `useCapturedAim:true` 改为 `false` | 横移锁向场景 | 验红：两种 cone rotation 均变为 `0`，预期 `0.5880026035`。 |
| 删除 volley emitter 的 `!sourceAlive` 取消条件 | 真实来源致死场景 | 验红：shotIndex 从 `{0}` 变为 `{0,1,2}`。 |

## 已完成验证

- B1+B2 定向：7 文件、39 项通过。
- 类型检查：通过。
- R3 四组组合审计：四组均 `cycles=0`、`unknown=0`。
- 构建：通过。\n- 完整 MC Fight 回归：322 通过、1 跳过、3 失败；失败均在正在施工的 B3 与既有 S4 审计计数，和本次 B2 修改无关，详见下方风险。

## 复查边界

B2 保持 `36/84` 程序自证。不得在 r5 冻结包完成逐文件哈希、定向复跑、类型检查、审计和六组撤修前，将 B2 标为独立复查通过。

## 已知隔离风险

全量回归的三个失败为 3-b3-production.test.ts（naga 技能循环）、s4-combat.test.ts（期望系统数 31，实际 34）及其同批 B3 影响；本次复跑的 B2 定向与 R3 身份 54 项均通过。这些红项不作为 B2 绿灯引用，冻结副本将原样保留并要求复查者记录。

- r5 冻结副本内复演新增两项撤修：lock-aim 2 项验红；source-death 1 项验红；均已恢复。
