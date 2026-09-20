# 原版内容差异与迁移风险

日期：2026-09-11。以下均为静态源代码/配置证据。没有执行Unity战斗复现，不能据此称为“已复现bug”。原文、字段和行号见units.json、ability-code-evidence.json与source-manifest.json。这里登记的是旧作内容问题，不是已批准的Apollo引擎缺口单。

## P0：先澄清再作为新版验收基线

| 编号 | 范围 | 已见证据与静态推论 | 新版处理建议与程序验证 |
|---|---|---|---|
| INV-001 | 7种单位 | 配置缺少代码直接请求的参数，加载器缺键返回0；详见下表 | 配置缺键应阻止加载，不能静默0；不从旧错误结果反推设计数值 |
| INV-002 | 20种/56个参数键 | 绑定技能未通过GetAbilityParam读取这些键，逐单位见units.md | 每个战斗字段必须有唯一消费路径；变更伤害/范围/CD后用结果证明有效 |
| INV-003 | 原版通用攻击6种带状态单位 | 洞穴蜈蚣、观测者、鸡蛇、流浪者、骷髅德鲁伊、凋零骷髅声明onHitEffects；通用近战只查另一套标签、通用远程不传状态 | 把命中状态纳入技能效果链；旧声明与实际施加分开验收 |
| INV-004 | 唤魔者/悚怖尸巫 | 召唤通过直接Units.Add，未走CreateUnit/RegisterAbility；SetAbility未发现调用处 | 验证召唤体是否能攻击；新召唤必须走统一单位实例化、技能绑定与生命周期 |
| INV-005 | 娜迦(地面) | IsBusy始终true，主循环因此不调用TryExecute；接触CD只在TryExecute递减 | 复现首次接触后再次攻击；CD统一时钟推进，蛇身接触技能与移动分开 |
| INV-006 | 区域效果/沙暴 | AreaEffectData是struct；Tick对Lava/Frost/Pollution在达到1秒前不写回DotTimer/Remaining，Shockwave也不写回Remaining；Create*缺SourceId，沙暴创建亦缺来源 | 复现持续伤害是否发生、效果是否结束、是否跟随；来源与生命周期必须明确，不复制这些路径 |
| INV-007 | 控制与施法 | Busy分支先于Fear；Freeze/Stun改移速/间隔，不统一停止技能；多处私有CD/回血仅TryExecute推进 | S2验证打断、不可打断、暂停/继续计时、死亡清理；不把每单位不同结果当作设计 |
| INV-008 | 单位攻击素材 | 全局搜索脚本只见attackSprite/deadSprite字段声明，BattleBridge创建时读取idleSprite，UnitView没有攻击图片切换 | 新版建立单位技能表现绑定和阶段事件；素材存在不代表已经有可用挥砍动画 |

### 缺参明细（7种、30个必需键）

| 单位 | 缺少的键 |
|---|---|
| 珊瑚傀儡 cataclysm_coral_golem | leapDamage, leapDuration, leapMaxRange, leapRadius |
| 珊瑚巨兽 cataclysm_coralssus | leapDamage, leapDuration, leapMaxRange, leapRadius |
| 渊灵术士 cataclysm_deepling_warlock | abilityCooldown, laserRadius, laserTickDamage, laserTickInterval, laserTicks, markDelay, markRange |
| 炽燃狂魂 cataclysm_ignited_berserker | spinDamage, spinInterval, spinRadius, spinTicks |
| 炽燃遗魂 cataclysm_ignited_revenant | projDamage, projRange, sonicDamage, sonicRadius, sonicTickInterval, sonicTicks, spinTickInterval |
| 苦力怕 creeper | centerDamage |
| 米诺菇 twilightforest_minoshroom | chargeDamage, chargeThreshold, normalDamage |

这里“必需”指代码调用，不表示已确认设计需要这些名称。读入零可能导致无伤害、零范围、不能启动或无重复伤害等不同后果，须按单位复现。

## P1：设计意图、代码、表现不一致

| 编号 | 范围 | 差异 | 新版需裁定 |
|---|---|---|---|
| INV-009 | 多技能单位 | 属性Attack/AttackInterval/AttackRange经常不是技能的最终伤害/CD/施法距离；大量固定值在C# | 属性面板显示什么、单位绑定如何覆盖模板、随机伤害怎样介绍 |
| INV-010 | 先驱者 | 旧文档写冲撞位移/沿线碰撞，当前第三技能只等待0.55秒后扣目标HP；旧死亡射线写穿透，当前仅对目标扣血 | 冲撞是位移技能还是延迟单击；光束是单体还是几何AOE |
| INV-011 | 徘徊者/末影傀儡/核能苦力怕 | 光束伤害长度和画面长度不同；虚空符文为前向线段+起点圆而非十字；核爆表现边长写死400 | 从同一命中几何生成范围预览和表现缩放，实测边界 |
| INV-012 | 瓦吉特/远古遗魂 | 旧文档有逐环下落，当前某一时刻一次生成全环并立即扣血；环数/半径/间隔也有差异 | 逐环技能阶段、预警时间、单次去重与跨环多次命中 |
| INV-013 | 跨座兽/悚怖尸巫 | 文档有蝌蚪产出、尸巫击杀转化；绑定类未见相应生成/转化逻辑 | 是恢复原意还是简化删除，不能标成已有完整玩法 |
| INV-014 | 国王蜘蛛/轻语灵 | 坐骑死亡解绑代码在可能不再运行的TickCast中；头部活跃减伤标志未见复位 | 附属体是否独立受击、主人死亡、分离后行为和清理 |
| INV-015 | 飞行/对空 | 选敌、技能启动、圆AOE的groundOnly、弹丸命中分别判断；AOE可打到不能直接索敌的空中单位；旧窗口由攻击赋值而非完整俯冲 | 逐技能目标掩码，俯冲窗口的空间位置、打开/关闭与中断 |
| INV-016 | 地面近战、双模式、复杂Boss | 交战距离、基础射程和子技能范围三套值；可能“已经在交战区但所有技能都不能用” | 无可用技能时接近哪个施法位置，目标换选和卡位超时策略 |
| INV-017 | 光束/多段攻击/烈焰人 | 施法时读取当前TargetId，忙碌时全局死目标清理被跳过；部分技能不在每段重新校验距离和存活 | 锁实体/锁点/跟随三种合同；目标死亡、越界、阵营变化时的处理 |
| INV-018 | 持续状态与统计 | 状态直接扣血，绕过普通事件；True被普通伤害事件标为IsDot；吞噬直接死亡；已有燃烧时其他DoT也可能触发传播 | 所有伤害和击杀统一来源、事件与统计；定义友伤、传播触发、免伤优先级 |
| INV-019 | 素材引用 | lava_circle直接播放要求VFX/lava_circle_spritesheet，盘点未找到该资源；AreaEffectView另走VFX/lava_circle路径 | 两条路径分别核对；用明确资源ID，不以相似名字猜测接线 |
| INV-020 | 核能苦力怕/炽燃遗魂 | 核爆4键、遗魂3键重复；当前重复值相同且first-wins | 重复键作为配置错误，避免后续修改后误以为最后一项生效 |
| INV-021 | 超时/同时死亡 | 超时只用存活单位总HP/存活单位总MaxHp；双方全灭先返回未结束，超时平局偏蓝 | 新PvAI胜负、平局、超时和结果文案一起定义 |

## 证据复核方法

对每项按“旧设计意图 → SO/JSON → 绑定类 → 共享系统 → 表现路径”复核。只靠更改一张数据表无法说明技能已修好。程序复现应固定种子/步长/位置，记录技能阶段、目标、伤害、CD、来源ID与清理事件；对应证据交回后再升级为已复现或排除。

新引擎是否已有能力表达这些机制，继续按既有S2任务验证；这份盘点不裁定必须扩引擎，也不授权按每单位重建C#式专属代码。
