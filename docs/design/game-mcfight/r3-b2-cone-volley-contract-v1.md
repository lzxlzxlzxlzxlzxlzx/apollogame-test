# R3-B2 公共能力合同：扇形引导与多发投射物 v1.0

日期：2026-09-16。本文关闭 R3-B2 的两项策划定义缺口：数据驱动扇形命中与一次施法的多发独立投射物。它是对旧 Unity 配置的兼容性复原，同时采用 S2 已裁定的生命周期、打断与清理规则。

## 1. 公共原则

- 新能力必须由技能配置表达；战斗系统不得按单位 ID 分支。
- 一次成功启动技能时扣一次 CD；未成功启动不扣 CD。硬控、来源死亡或销毁会取消尚未发生的阶段和未发射子弹，已启动 CD 不返还。
- 已经发射的投射物是独立实体，保留来源与来源 Tag 快照；施放者随后死亡不直接删除已发射实体。它们按自己的命中、生命周期或来源清理规则结束。
- 真实命中只能来自既有 `Flow → 运动 → Overlap → Trigger → Hitbox → Damage/Status → Cleanup` 链；测试不得直接注入伤害、Trigger 或状态。

## 2. `Shape.cone`：数据驱动扇形

### 2.1 数据格式与坐标

扇形区域使用：

```ts
Shape: {
  kind: 'cone',
  radius: number,       // 世界单位，扇形顶点到外弧距离
  angle: number         // 完整夹角，弧度，范围 (0, 2π]
}
```

- `Transform` 的位置是扇形顶点。
- **字段裁定：**公共协议统一使用 `radius`，不使用 `range`。旧实现或过渡配置中的 `range` 必须在内容编译时迁移或报错，不能让两种字段同时作为运行时语义存在。
- `Transform.rotation = 0` 指向世界坐标 +X；逆时针为正。
- 技能成功启动时捕获目标方向，写入该次引导的扇形 `Transform.rotation`。引导期间不随目标重定向。
- 边界采用**包含**规则，浮点比较容差为 `1e-9`。
- 本批必须实现 cone 对 circle 的真实相交。目标圆与扇形有任意有效交集即命中；外弧和两条边界都属于扇形。其他形状的支持可后续扩展，不能把 circle、box 或 capsule 冒充 cone。

### 2.2 引导分段

技能配置新增通用引导字段：

```ts
channel: {
  pulses: number,
  intervalTicks: number,
  lockDirectionOnStart: true
}
```

- 成功启动后，按 `intervalTicks` 产生恰好 `pulses` 个独立扇形命中段。
- 同一段内，一个目标最多命中一次；不同段可再次命中。
- 引导期间硬控、来源死亡、来源销毁会停止未发生段，并清理仍存在的区域和表现事件。
- CD 在引导成功开始时进入冷却；不因中断返还。
- 该能力属于远程范围攻击，地面与飞行目标都按普通远程目标资格判断。

### 2.3 B2 两个单位的权威配置

以下值来自旧 `monster_config.json`，距离统一由 px 转为世界单位（除以 24）：

| 单位 | 半径 | 完整夹角 | 段数 | 段间隔 | 每段伤害 | 状态 | 技能 CD |
|---|---:|---:|---:|---:|---:|---|---:|
| `twilightforest_fire_beetle` | `64/24` | `60°` | 4 | 10 Tick | 4 | `burn` | 2 秒 |
| `twilightforest_winter_wolf` | `64/24` | `60°` | 4 | 10 Tick | 4 | `slow` | 2 秒 |

两者必须共享同一扇形引导模板。差异只能来自技能数据、状态载荷与表现引用。

## 3. 一次施法的多发投射物

### 3.1 数据格式

投射物模板增加可选发射配置：

```ts
emission: {
  count: number,
  intervalTicks: number,
  aim: 'captured-direction',
  spread: { kind: 'none' } | {
    kind: 'seeded-uniform',
    halfAngleRadians: number
  }
}
```

- `count` 是一次施法将尝试发射的实体数，必须为正整数。
- 每个子弹实体具有不可变的 `castId`、`shotIndex`、来源实体、来源 Tag 快照、方向、命中记录和自身生命周期。
- `intervalTicks = 0` 表示同一拍依次创建多个不同实体，绝不表示重复使用同一实体。
- `aim: 'captured-direction'` 表示方向以成功启动时的目标快照为基线，后续发射不重新锁定或改指向新目标。
- `seeded-uniform` 只在每一枚实际发射时从该施放者私有的 seeded PRNG 取一次值；复现相同 seed 和输入必须得到同一序列。
- 多发过程视为一次技能施放：第一枚排入发射计划时开始 CD；硬控或死亡会阻止尚未发射的余弹，但已发射的弹体继续按公共投射物合同运行。

### 3.1.1 `VolleyPlan` 公共运行时合同

`ProjectileShot` 继续只描述一枚已经发射的弹体；它不承担齐射调度。一次成功的多发施放由 Caster 创建一个独立、短生命周期的 `VolleyPlan` 实体。该实体不是单位专用逻辑，也不是 Prefab 内复制的多个同一实体。

```ts
VolleyPlan: {
  castId: string,
  source: EntityId,
  sourceTagSnapshot: number,
  templateId: string,
  targetId: EntityId,
  aimX: number,
  aimY: number,
  count: number,
  nextShotIndex: number,
  intervalTicks: number,
  nextEmitTick: number,
  spread: EmissionSpread,
  cancelled: boolean
}
```

- Caster 成功启动时原子捕获来源、来源 Tag、原目标、目标方向和技能模板，并生成一个 `VolleyPlan`。此刻即视为技能成功启动并开始 CD。
- `castId` 在同一场战斗内唯一；第 `n` 枚弹的稳定身份为 `castId + ':' + n`。实体 ID、`PrefabOrigin`、`ProjectileShot` 与测试追踪都应保留该 `castId` 和 `shotIndex`。
- `aimX/aimY` 是成功启动时由来源指向目标的单位方向；后续子弹使用同一基线，不重新索敌、不追踪目标当前位置。
- `volley-emitter` 每拍只消费已经到期的计划。`intervalTicks = 0` 时同一拍按 `shotIndex` 升序发射所有余弹；其他值按 `nextEmitTick` 发射一枚后推进到下一间隔。
- 每次实际发射都通过既有 `SpawnRequest → Prefab` 链创建一个**新**投射物实体。生成后写入独立 `ProjectileShot`、运动、形状、Hitbox、来源快照、`castId` 和 `shotIndex`；不得复制或重置旧投射物实体。
- 每枚弹在其实际发射 Tick 从来源实体的**当前** `Transform` 位置生成；它的方向仍使用成功启动时捕获的 `aimX/aimY`，不因来源移动或目标移动改变。这复原旧烈焰人在轮内短暂游走时从当前位置发射的行为。
- 散布角在某一枚实际发射时由该施放者私有 seeded PRNG 取得。已发射弹的方向不可变；取消的未发射弹不消耗随机数。
- 当 `nextShotIndex === count` 时销毁 `VolleyPlan`；每一枚弹仍按普通弹体命中、超程或生命周期独立清理。

### 3.1.2 取消、目标失效与固定方向

- 来源死亡、来源销毁、来源获得硬控，或原目标在余弹发射前死亡/失去受击资格时，`VolleyPlan` 取消所有未发射子弹并销毁自身；已发射子弹保持独立生命周期。
- 原目标移动或转向不取消计划，也不改变 `aimX/aimY`。已发射弹及后续仍会沿启动时方向飞行；它们可以真实碰撞到弹道上的其他合法目标。
- 同拍 `intervalTicks = 0` 的全部子弹在检查取消前作为同一原子批次发射；下一拍才接受新的硬控、死亡或目标失效。`intervalTicks > 0` 的后续子弹逐拍检查取消。
- 命中、伤害、状态、目标死亡或投射物销毁不能回写本拍 aggro、Flow 或 Steering；影响从下一拍生效，沿用 S2 的结算边界。

### 3.1.3 调度位置

`volley-emitter` 必须是公共系统，依赖已提交的 Flow/Caster 结果，只写 `SpawnRequest`；它不读 Overlap、Trigger、Hitbox 或 Resource 的本拍结算结果。发射出的请求由既有 Prefab 链展开，弹体从既有投射物运动阶段开始移动。组合审计必须证明：

`Flow/Caster → VolleyPlan → volley-emitter → SpawnRequest/Prefab → projectile motion → overlap → trigger → hitbox → resource`

不存在反向同拍依赖或未知引用。

### 3.2 烈焰人配置

旧 Unity 配置为：`shotCount=3`、`shotInterval=0.1s`、`volleyInterval=5s`、`shotDamage=3`、`engageRange=200px`；旧代码在执行上没有完全使用这些配置。本项目采用配置值，避免继承旧实现错误。

```ts
form: 'projectile'
damage: 3
castRange: 160 / 24
acquireRange: 200 / 24
cd: 5 seconds
speed: (280 / 24) / 20
maxTravel: (160 / 24) * 1.15
onHitStatus: 'burn'
emission: {
  count: 3,
  intervalTicks: 2,
  aim: 'captured-direction',
  spread: { kind: 'seeded-uniform', halfAngleRadians: 0.175 }
}
```

每枚火球独立命中、独立清理。三枚命中同一目标时，直接伤害分别结算，`burn` 只形成一个状态实例并刷新其时间。

### 3.3 铜羽泽鹗配置

旧 Unity 行为为一次启动连续创建两枚同方向羽毛。本项目保持同方向、同拍发射，但要求产生两个独立实体：

```ts
form: 'projectile'
damage: 1
castRange: 100 / 24
cd: 1 second
speed: (350 / 24) / 20
maxTravel: (100 / 24) * 1.15
armorPiercing: true
emission: {
  count: 2,
  intervalTicks: 0,
  aim: 'captured-direction',
  spread: { kind: 'none' }
}
```

`armorPiercing: true` 的含义是该次直接伤害在统一伤害管线中按目标护甲与韧性均为 0 计算；它不绕过阵营过滤、目标资格、无敌、死亡或清理规则。

## 4. 必须的公共验证

### 扇形

1. 指向 +X 的扇形，对内侧目标、外弧边界目标、角度边界目标命中。
2. 半径外和角度外目标不命中。
3. 同段多目标各命中一次；同一目标不重复命中；连续四段可各命中一次。
4. 开始引导后目标移动，扇形方向仍保持启动时方向。
5. 硬控、死亡与来源销毁取消未发生段并清理区域。
6. 与普通索敌、移动、伤害、状态、死亡和清理共装时组合审计无环、无未知引用。

### 多发投射物

1. 一次烈焰人施放创建 3 个不同实体，`shotIndex` 为 0、1、2，间隔为 2 Tick。
2. 一次铜羽泽鹗施放同拍创建 2 个不同实体，`shotIndex` 为 0、1。
3. 每枚弹均有至少两帧不同位置，至多一次真实命中，命中或超程后销毁。
4. 同 seed、同输入的烈焰人三轮齐射轨迹和散布完全一致；不同实例的随机序列不串扰。
5. 施放启动后、第二或第三枚发射前遭硬控或死亡时，未发射子弹取消，已发射子弹不被伪造删除，CD 保留。
6. 铜羽命中有护甲和韧性目标时，实际伤害符合穿甲计算；对无敌、友军和非法目标仍为零命中。

## 5. B2 收口顺序

1. 先完成上述两项公共能力及其独立测试；不将单位测试当作公共能力测试的替代品。
2. 再接入烈焰人、喷火甲虫、寒冬狼和铜羽泽鹗的权威配置。
3. 随后完成 B2 八单位的真实身份场景、全量回归、类型检查、构建和完整组合审计。
4. 所有程序门通过后更新矩阵至 36/84，冻结副本，再提交独立复查。

S6 的正式攻击动作、弹体特效、火焰/冰雾特效和声音不阻塞本合同；R3 可使用几何观察形状，但必须与实际 `Shape` 和 `Transform` 读取同一份战斗数据。

## Volley 目标失效裁定（2026-09-17）

一次施法的所有子弹共享同一 `castId`；`shotIndex` 从 0 递增并唯一标识子弹。若捕获目标在后续子弹发射前死亡、被销毁或不再属于敌对合法目标，`VolleyPlan` 必须清理，未发射子弹不会生成。已发射子弹不回滚，仍按其启动时方向快照飞行，并只对后续真实接触到的合法目标造成一次伤害。

此裁定补足既有的来源死亡、硬控与显式取消语义；B2 Caster/volley-emitter 接线与跨机制测试必须实现它。
