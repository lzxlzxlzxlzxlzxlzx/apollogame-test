# 原版共享规则与流程盘点

日期：2026-09-11。静态证据，不是新版规则签核。每个单位的完整定义须结合本文件、units.md、issues.md 阅读。

## 配置读取顺序

`MonsterDatabase`读取Resources/Monsters下的SO，`MonsterConfigLoader.ApplyTo`以monster_config.json覆盖价格、HP、攻击、护甲、韧性、移速、射程、攻击间隔、半径。名称、标签、移动/攻击类型、技能类型字符串、onHitEffects、精灵引用继续取SO。技能类再独立读取abilityParams或使用硬编码。

技能类型工厂优先；未识别或空类型则按explosive → Ranged → aoe_melee → Melee回退。ElephantAbility和MinoshroomAbility都映射ChargeMeleeAbility。一个单位绑定一个旧技能类，但该类可能包含多个主动、普攻、被动和决策分支，类数不等于技能数。

技能参数同名键取列表第一个；找不到键打印错误并返回0；整数参数额外RoundToInt。没有统一参数合法性校验。逐单位原列表、首项生效值、缺值、重复与读取情况均保存在units.json。

证据：[加载器](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Scripts/Data/MonsterConfigLoader.cs>)、[技能注册](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Scripts/Simulation/BattleSimulator.cs>)、[工厂](<C:/Users/24652/Desktop/projects/apollpgame/mcfight-unity-main/Assets/Scripts/Simulation/Abilities/AbilityFactory.cs>)。

## 每帧调度、索敌与移动

1. 全局区域效果、弹丸先结算；随后依单位列表顺序处理单位。
2. 死亡跳过；状态效果推进；攻击CD、动画计时、技能CD和重选计时递减。
3. 若技能IsBusy，执行TickCast后直接跳过余下逻辑。Fear检查、普通索敌和TryExecute均不会运行。
4. 非忙碌单位若Fear则游走；否则清理死目标，约2.5秒强制重选一次，执行TickCast，然后尝试技能。
5. 有目标但无法释放时，根据交战距离和冷却游走或接近；最后统一分离和边界钳制。

因此每个技能私有CD或回血计时若放在TryExecute，忙碌、恐惧、没有目标时可能停走；不能把参数“冷却10秒”解释为任意状态下10秒后可用。

索敌为全场最近合法敌人，不是真正的视野半径扫描；相同分数保留列表先出现者。旧目标在交战距离+30内可保持。anti_arthropod对飞行节肢单位使用距离×0.75偏好。合法选敌和最终伤害过滤分散：允许选空中目标不保证所有子技能能打空中。

对空：allowAntiAir、攻击者Fly、攻击者Ranged、目标Ground任一成立即允许；否则要求目标VulnerableWindow>0。原版飞行近战窗口为0.55秒，普通近战、部分专属攻击以及某些弹丸命中可设置。并非完整俯冲动作的空间窗口。新版只确认“地面近战可在俯冲窗口反击”，没有采纳0.55秒。

移动使用直接接近+圆形碰撞分离，没有地图障碍寻路图。分离力180，敌对推力倍数2.5，同队1；完全重叠的极小距离被跳过。技能位移和普通游走可能使用不同的速度字段。需区分寻路、局部避让、攻击站位与技能强制位移。

## 伤害与状态

普通伤害顺序：死亡/非正伤害忽略 → 埋地免伤 → 遗魂防御 → 远程格挡 → 食人妖远程免疫 → 轻语灵减伤 → 护甲 → 扣血/死亡 → 伤害事件。

护甲公式：`g=min(20,max(armor/5,armor-4*damage/(toughness+8)))`，`final=damage*(1-g/25)`；True或攻击者armor_piercing跳过护甲，仍可能先受前置免伤过滤。普通伤害不应混同于状态DoT与吞噬直接写HP。

| 状态 | 配置持续秒数 | 实现作用 |
|---|---:|---|
| Poison | 5 | 每秒直接扣2HP |
| Burn | 10 | 每秒直接扣1HP；fire_immune免疫；传播另见问题单 |
| Wither | 4 | 每秒直接扣3HP |
| Slow | 5 | 移速×0.7，攻击间隔÷0.7；写死技能CD不一定受影响 |
| Fear | 2 | 非忙碌时游走；不是统一打断 |
| Freeze | 2 | 移速0、攻击间隔设极大；不统一取消已开始技能 |
| Stun | 30 | 移速0、转为地面，结束恢复原移动类型；未统一禁止攻击 |

同状态重复施加刷新时长，不增加独立层数，也不清空已累积DoT计时。先扣剩余时间、到期移除，再处理DoT，因此“持续秒数×DPS”并不自动等于实际伤害。状态DoT直接扣血，绕过普通伤害事件和免伤管线。

## 几何、弹丸与持续区域

圆AOE使用`效果半径+受击者半径`；groundOnly默认为false，传true则直接排除Fly，未使用俯冲窗口。扇形额外按目标半径做角度补偿。光束用点到线段距离≤halfWidth+目标半径；复合图形为起点圆与前向线段的并集。

普通弹默认速度280、最大行程=传入range×1.15；按当前帧位置作圆形碰撞，不是扫掠线段检测。碰到首个敌方单位命中；穿透弹记录已命中ID、每帧最多命中一个找到的敌人。追踪弹移动后修正方向。弹丸爆炸只伤敌方，范围内都受伤，但StatusOnHit只施加给直接碰到的目标。许多专属弹设置MaxTravel=0，以出界结束。

熔岩只影响地面且排除fire_immune；冰区、污染区只影响地面；沙暴不排除飞行。圆形区域可同时施加状态。区域来源与生命周期存在静态风险，见issues.md；这些故障不应成为新设计。

## 商店、部署、战斗、结算与辅助内容

| 内容 | 原版证据基线 | 新版已确认处理 |
|---|---|---|
| 商店经济 | 双方初始各1000；价格≤0隐藏；可重复购买；批量10且受余额限制 | 仅玩家购买；预算和数值待定 |
| 对手 | 本地双方购买或AI随机购买可负担单位，有尝试次数限制 | 仅PvAI；AI组队策略待设计 |
| 部署 | 左右半场，中线禁区；点选后放置；可随机部署；边界钳制 | 支持拖拽；具体摆放约束待定 |
| 战斗 | 固定步长1/60，正式桥接seed42，速度1/2/4 | 自动战斗；新确定性规则由S2验证 |
| 结束 | 一方全灭；120秒超时按存活单位剩余HP比值，平局蓝方赢；双方全灭先返回未结束 | 胜负、超时和同归于尽须重新确认 |
| 详情 | 原版单位文档/图鉴相关设计与UI | 商店点击单位详情，替代独立图鉴 |
| 主菜单/PvP/联机 | 原版文档包含相关目标；不能据文档宣称均实现 | 不纳入新版 |
| BalanceLab | 有计划编辑、批量模拟、存档报告、策略/平衡知识JSON | 开发工具候选，不作为玩家功能自动迁入 |
| 场景/第三方示例 | BattleScene、SampleScene及第三方VFX演示场景 | 不当作玩法地图或关卡数量 |

流程原始证据与更细部署数值沿用[原版规则基线](<C:/Users/24652/Desktop/projects/apollpgame/apollogame-test-game-105-standalone/docs/design/mc-fight/source-baseline.md>)。全量脚本与资源JSON来源哈希见source-manifest.json；归档平衡结果是历史实验，不是当前84种单位的有效配置。
