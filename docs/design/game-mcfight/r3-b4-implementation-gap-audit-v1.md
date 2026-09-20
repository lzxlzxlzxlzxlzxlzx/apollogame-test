# R3-B4 实施前能力缺口审计 v1.0

日期：2026-09-17。该审计在实际读取现有 R3 生产装配、协议和运行系统后形成，用于避免把 `r3-catalog.ts` 的配置记录误记为真实战斗接入。范围是 B4 的 14 个单位；炽燃遗魂的声波/骨弹仍由 `REQ-B4-REVENANT-01` 阻塞，本文不替它补数值。

## 结论

B4 尚不能开始“13 个单位连续生产装配”。当前 R3 的正式数据翻译器只消费近战、单发投射物、圆形区域、冲锋、俯冲和胶囊 beam 的最小字段；它没有消费 B4 所需的击退、伤害类别过滤、引信后自毁、圆形距离衰减、恐慌、冻结、持续区域、条件优先级、治疗或落点区域字段。若直接把 13 单位加入 `B2_SKILL_CONFIG`，它们会被降格为普通攻击或静默丢失字段，违反施工单。

这不是 owner 参数阻塞：除炽燃遗魂声波/骨弹外，B4 其余单位的数值和规则均已裁定。阻塞是可施工的公共运行时能力，需先按以下顺序完成。

## 已核验的代码事实

| 位置 | 已有能力 | 对 B4 的限制 |
|---|---|---|
| `games/game-mcfight/content/r3-catalog.ts` | `BatchForm` 仅为 melee/projectile/area/charge/dive/beam；编译器只转发 B2/B3 字段。 | 无 B4 技能形态、伤害类别、防御、爆炸、区域、治疗、优先级等正式翻译。 |
| `games/game-mcfight/s4-world.ts` | Hitbox 只接受 `normal` / `true` damageType；区域默认 `consumeOnHit:true`；Caster 只在 self/target 生成模板。 | 无 ranged/beam/explosion 分类、每目标一次穿透、可持续区域、落点创建后续区域、自毁和定向条件选择。 |
| `src/engine/protocol/components/combat.ts` | 有 `onHitStatus`（burn/wither/slow/poison）和 `MobilityLock`。 | 没有 freeze 状态载荷、knockback、damage category filter、爆炸 falloff、fuse/self-destruct。 |
| `src/skills/tier2/damage-routing.ts` | 处理护甲、真伤、armorPiercing。 | 不处理目标的伤害类别免疫，也不提供防御掩码。 |
| `src/skills/tier2/hitbox.ts` | 真实 Trigger→DamageRequest、状态和单次消耗。 | 无按目标历史去重的穿透、无击退、无落点区域链。 |

## 公共能力施工顺序与验收门

### CAP-B4-01：伤害类别与目标防御过滤

新增唯一正式枚举 `melee | ranged | beam | explosion | true`，从技能模板传到 Hitbox、DamageRequest 和周期伤害。新增目标配置 `DamageCategoryFilter{ reject: [...] }` 与 `DamageMitigationProfile{ multipliers }`。过滤须在护甲之前运行；被拒绝请求必须产生零实际伤害且不写状态。

- 食人妖：拒绝 ranged、beam；melee/explosion/true 正常。
- 炽燃遗魂：防御期 melee ×0.1，ranged/beam ×0，其他正常；仅迁移旋转和近战，声波/骨弹不装配。
- 探针：四类别逐一验证、撤除 filter 必须验红。

### CAP-B4-02：命中后击退

`Hitbox.knockback` 只在合法实际命中后产生，方向为来源命中时位置→目标位置的归一化方向；来源/目标死亡不保留悬挂位移。目标带 `knockbackImmune` 配置或标签时拒绝位移但不拒绝伤害。位移必须进入拍末运动提交，不能反写同拍 aggro/steering。

- 磁控机兵：启动时快照敌数，伤害 `2 + count`，目标击退 20。
- 链锤哥布林：80/24 圆形内每合法目标伤害 8 且击退 10。
- 食人妖：击退免疫。
- 探针：源方向、两目标各一次、免疫、死亡清理、快照不被同拍死亡改写。

### CAP-B4-03：可配置引信、自毁与爆炸衰减

新增 `FusePlan` 或等价的公共 Flow/Pulse 组合：成功启动后记录来源与爆心快照；按技能数据决定硬控/目标死亡是否取消。完成时创建独立爆炸区域，区域可携带 `damageAtDistance` 线性配置并在结算后请求来源自毁。友军倍率必须是区域数据，而不是单位 if。

- 苦力怕：1.5 秒、49、60/24、友军 0.5、自毁。
- 核能苦力怕：10 秒、200/24、中心 500→边缘 100 线性、伤及双方、自毁、无辐照实体。
- 探针：引信启动/CD、取消、爆心/边缘/外部、友军倍率、来源自毁、核爆没有区域残留。

### CAP-B4-04：持久区域、脉冲和落点链

现有 `pulseCount` 是连续多次 Caster 释放，不等于持久区域。新增区域实体的 `duration/pulseInterval/perTargetHitPolicy`，在每一段对当前合格目标各命中一次；每段重做资格检查。落点区域必须由投射物实际接触/爆炸位置创建，不能在施放位置或目标快照位置提前创建。

- 霜冻巨兽：冰雾 140/24、2 秒、10 段、每段1+Slow；冰球真实命中后 Freeze 2 秒。
- 雪怪首领：冰弹真实爆炸后创建 50/24、5 秒、每秒2+Slow 的区域；仅敌方地面资格，俯冲窗口按每段重检。
- 撼地斯拉：光束 15 段/5秒，每段按目标一次。
- 探针：区域位置、两目标、段间目标升空、来源死亡清理、区域寿命。

### CAP-B4-05：硬控状态载荷与恐慌

现有 `onHitStatus` 不接受 freeze/fear。扩展状态载荷使 freeze/fear 写入既有 CONTROL mask 和 OverTime；冻结 2 秒，恐慌只在下一 Flow 决策取消未释放技能。恐慌不能回滚已发生伤害。

- 撼地龙：140/24 圆形内非 Boss 的合法地面敌人 fear，CD10；无旧随机附加 CD。
- 霜冻巨兽：冰球附 2 秒 freeze。
- 探针：范围内外、Boss、已释放/未释放、状态到期与来源。

### CAP-B4-06：数据驱动技能选择与自疗

正式选择器需同时表达：优先条件、可选条件、对局种子等权选择及独立 CD；不能以 unit id 在 Caster 内分支。治疗应经同一资源路由写负量，并保持来源/回执。

- 女巫：受伤且 200/24 无合法敌人→heal10/CD2；否则等权纯伤害、伤害+poison、伤害+slow 三包（6/48/24/CD2）。
- 霜冻巨兽：近地面90/24猛砸优先；其他冰球/冰雾/近战 seeded 选择。
- 雪怪首领：近地面80/24狂暴优先；否则冰弹链。
- 食人妖：重击独立 CD 优先、否则普攻。
- 撼地斯拉：践踏与光束互斥、各自 CD。
- 探针：优先条件、种子重现、独立 CD、无敌人治疗、不可用候选跳过。

## 单位进入生产装配的依赖

| 单位 | 最小依赖 |
|---|---|
| 磁控机兵、链锤哥布林 | CAP-01, CAP-02 |
| 苦力怕、核能苦力怕 | CAP-01, CAP-03 |
| 撼地龙 | CAP-05, CAP-06 |
| 撼地斯拉、监守者 | CAP-01, CAP-04, CAP-06 |
| 洞穴蜈蚣 | CAP-01（标准 melee+poison 可作为首个生产样例） |
| 炽燃狂魂 | CAP-04, CAP-06 |
| 炽燃遗魂 | CAP-01, CAP-04, CAP-06；声波/骨弹继续阻塞 |
| 食人妖 | CAP-01, CAP-02, CAP-06 |
| 霜冻巨兽、雪怪首领 | CAP-04, CAP-05, CAP-06 |
| 女巫 | CAP-04, CAP-06 |

## 下一步

先实施 CAP-B4-01 与 CAP-B4-02，附公共探针和撤修检查；它们解锁 B4-A、食人妖和遗魂防御旋转的部分装配。之后依序 CAP-B4-03 到 06。任何公共能力完成都不得单独将 B4 单位标为通过；每个单位仍须经生产身份、双实例三轮、取消/清理和可视化场景验证。
