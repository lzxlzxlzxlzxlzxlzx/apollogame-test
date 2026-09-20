# R3-B2 公共能力实现复查：退回修正单

日期：2026-09-17。复查范围：当前工作区的 `Shape.cone`、`VolleyPlan`、`volley-emitter` 与 B2 目录编译。此文不是独立复查结论；它定义程序继续完成 B2 前必须修正的实现差额。

## 结论

`Shape.cone` 与 `VolleyPlan` 已有第一版公共接口，但两项均未满足 [扇形与多发投射物公共能力合同](r3-b2-cone-volley-contract-v1.md) 的生产验收条件。B2 仍为 28/84，不得将这两项协议的存在记为四个单位的行为通过。

## P1：`volley-emitter` 未实现计划时序与独立子弹合同

当前 `src/skills/tier3/volley-emitter.ts` 每拍直接发射一枚，未读取或推进 `interval` 的到期时刻；`VolleyPlan` 也没有 `nextEmitTick`。因此烈焰人无法保证三枚弹间隔 2 Tick，铜羽泽鹗无法证明同拍原子发射两枚。

必须修正为：

1. `VolleyPlan` 增加并使用 `nextEmitTick`；仅当当前 Tick 到达该值时发射。
2. `intervalTicks > 0` 时每次到期只发一枚，再把 `nextEmitTick` 推进该间隔；`intervalTicks = 0` 时同一拍以 `shotIndex` 升序发完全部余弹。
3. 每次发射生成一个新的 `SpawnRequest`，其位置必须读取来源实体在该发射 Tick 的当前 `Transform`；方向仍采用启动时捕获的方向。不得固定使用世界原点 `(0, 0)`。
4. 每枚弹必须保留 `castId` 与 `shotIndex`。必要时扩展 `ProjectileShot`，测试追踪必须能按这两个字段区分实体。
5. 计划完成、取消或来源销毁后销毁 `VolleyPlan`；已发射弹保留独立命中、超程和生命周期清理。

## P2：散布、来源与目标失效尚未实现

当前实现以 `shotIndex` 和固定 `spread` 计算对称角度；`seed` 未消费，未实现烈焰人的私有 seeded-uniform 随机散布。声明读取 `Resource` 与 `Status`，但未用它们检查来源死亡、硬控或目标失效。

必须修正为：

1. 发射每一枚烈焰火球时，从施放者实例私有的 seeded PRNG 取一次散布值，范围为 `[-0.175, +0.175]` 弧度；同 seed 与同输入的轨迹必须可复现，不同实例不能串扰。
2. 每次发射前检查来源存在、来源存活、来源不处于硬控，以及原目标仍存在且具备受击资格。
3. 条件失效时取消未发射余弹、不消耗它们的随机数、保留已启动 CD；已发射弹不被伪造删除。
4. 原目标移动只影响其位置，不重算后续弹方向；后续弹沿成功启动时捕获的方向飞行。

## P3：B2 目录尚未真正消费公共能力

当前 `B2_SKILL_CONFIG` 的 `volleyCount`、`volleyInterval` 未进入 `CombatCatalog`/生产 Caster；铜羽泽鹗仍表达为两个候选 `projectile` 模板，而不是一次施法的双羽计划。喷火甲虫与寒冬狼仍是普通 `area`，生产模板仍生成 `circle`，没有消费 `Shape.cone`、分段或锁定方向。

必须修正为：

| 单位 | 生产数据与行为 |
|---|---|
| `blaze` | 一个投射物技能，`emission={count:3, intervalTicks:2, seeded-uniform ±0.175}`；每发3伤害、燃烧、5秒CD、160/24施放范围、200/24索敌范围。 |
| `iceandfire_stymphalianbird` | 一个投射物技能，`emission={count:2, intervalTicks:0, none}`；每发1伤害、350/24 px/s、100/24范围、1秒CD、穿甲。不得以两个候选技能代替双羽。 |
| `twilightforest_fire_beetle` | 一个 cone 引导技能：64/24半径、60°完整夹角、4段、每10 Tick一段、每段4伤害、燃烧、2秒CD、成功启动锁定方向。 |
| `twilightforest_winter_wolf` | 与喷火甲虫复用同一 cone 引导模板，只有状态为减速与表现引用不同。 |

生产目录必须把上述字段传入 `buildCombatUnitTemplate` 和 Prefab；它们不能仅停留在内容对象中。

## P4：`Shape.cone` 字段与验收范围不一致

当前实现使用 `Shape.kind='cone'` 与字段 `range`；已批准合同现已裁定为 `radius`。程序必须更新类型、编译器和测试为同一命名；B2 使用的最终公共语义是“扇形顶点到外弧的世界单位距离”。

除现有前方/角度外/半径外探针外，补齐：

1. 外弧边界与角边界包含；
2. 目标圆与扇形任意相交即命中；
3. 同段多目标各命中一次、同目标同段不重复；
4. 锁定方向后目标横移不改变扇形朝向；
5. 硬控、来源死亡、来源销毁取消未发生段并清理区域；
6. 与当前 aggro、Flow、运动、Overlap、Trigger、Hitbox、Resource 和销毁链共装的无环审计。

## 完成门

程序在上述 P1—P4 全部完成后，才可接着建立四个单位的真实身份场景。随后才是 B2 八单位总回归、类型检查、构建、组合审计、矩阵升至 36/84 与冻结独立复查包。
