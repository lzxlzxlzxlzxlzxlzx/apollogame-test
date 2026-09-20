# R3-B2 生产接线即时审阅（2026-09-17）

审阅范围：`r3-catalog.ts`、`s4-world.ts`、`r3-b2-runtime-wiring.test.ts`。这是代码静态审阅，不是程序自证或独立复查。

## 结论

本次配置字段已能编译入目录，但**仍未进入真实 Caster、Flow、Prefab 或 Hitbox 链路**。B2 状态维持未完成，矩阵必须保持 28/84。

## 必须修复的阻塞项

1. **铜羽泽鹗没有真正的 volley 配置。** 当前仍是 `forms:['projectile','projectile']`，而没有 `volleyCount:2`。运行时接线测试已期望 `volleyCount=2`、`volleyIntervalTicks=0`，因此当前代码与自身测试不一致。应改为一个 projectile 模板 + `volleyCount:2, volleyInterval:0`。
2. **Caster 仍只创建普通单发 SpawnRequest。** `buildCombatUnitTemplate` 对所有技能无条件创建 Caster；其 Caster 数据没有任何 volley 计划字段。必须在 Volley 模板释放时创建一个 Plan，而不是直接以 Caster 创建攻击区域。
3. **Prefab 仍只生产圆形区域。** `assembleCombatWorld` 仅为 beam 创建 capsule，其余均是 circle；未读取 `shape='cone'`、`coneRadius`、`coneAngleRadians`。喷火甲虫与寒冬狼当前会按普通圆形区域运行。
4. **脉冲字段未被消费。** `pulseCount`、`pulseIntervalTicks`、`lockAimOnStart` 只存于目录对象，未被 Flow 或区域生命周期读取；不能产生四段、10 Tick 间隔或锁定方向。
5. **齐射中的状态与装甲穿透尚未落到每枚独立弹。** `VolleyPlan` 可生成 `ProjectileShot`，但生产模板没有使每枚 SpawnRequest 继承 B2 的 Hitbox 状态载荷和 armorPiercing。

## 接线完成的最小结构性验收

- `r3-b2-runtime-wiring.test.ts` 必须实际运行并通过；它现在应先暴露铜羽泽鹗缺少 volley 的红灯。
- 增加 Caster 释放后的世界断言：烈焰人与铜羽泽鹗生成的是 `VolleyPlan`；普通单发单位不生成。
- 增加 Prefab 断言：两种 B2 cone 模板的 `Shape.kind==='cone'`，并保留 apex、radius、angle 的真实数据。
- 增加单次 cast 追踪：`castId` 相同、shotIndex 递增；烈焰人发射 Tick 间隔 2，铜羽泽鹗相同 Tick 发射 2 枚。

完成以上“结构性接线”后，才进入八单位真实行为场景；不可把此文中的审阅发现改为测试白名单或跳过项。
