# 战斗手册

> 战斗 = 数据：伤害区 / 死亡 / 属性 / 持续效果 / 索敌 / 掷骰全走能力，无游戏层战斗代码。
> 机读真相：各能力 `describe`（`src/skills/tier2`·`tier3`）；组件闭集 `src/assembly/component-map.ts`。先例 = game-g 战斗核（甲）。

## ① 做 X → 用什么

| 任务 | 能力实名 | 怎么接（一句） |
|---|---|---|
| 伤害结算（命中扣血） | `t2-hitbox` | 伤害区挂 `Hitbox`+`Shape`+`Sensor`+`Tag(ZONE_FLAG)`；目标挂 `Tag(阵营)`+`Resource(hp)` |
| 命中特效（击中火花/受击特效，穿透每命中一喷） | `t2-hitbox`（`onHit`） | `Hitbox` 加 `onHit:{spawnTemplate}`：命中即在目标位置发 `SpawnRequest`（配 `t3-prefab` 展开），与伤害同拍、AOE/穿透天然 fan-out |
| 有效伤害/治疗统计 | `t2-damage-routing` | observer在damage-route前持有请求引用，结束后读`appliedAmount`结算回执：正为实际扣除、负为实际恢复；请求当拍消费，不累加原始伤害或拍末净差 |
| 死亡移除 | `t2-mortal` | 挂 `Mortal{resource:"hp",atOrBelow:0}` + destroy 原子执行移除 |
| 装备/buff 改攻防速（实体属性） | `t2-stats` | 挂 `Stats{base,mods,effective}`；装备往 mods push，卸下按 source 滤（只做 (base+Σadd)×Πmul） |
| 修正总表（字段表+混合策略+门控） | `t2-modifier-stack` | 挂多条 `ModifierSource{target,op,value/valueFrom,gate}`（op=add/mul/max/min/or/floor）+ 一个 `ModifierTotals` 单例；消费方读 `totals`。计分修正/逐字段 sum·max·or/buff 汇总 |
| DoT / regen / 定时状态 | `t2-over-time` | 挂 `OverTime{effects:[{resource,amountPerTick,period,duration}]}`（可多个并行） |
| 自动索敌锁最近目标 | `t3-aggro` | 挂 `Perception{targetTag,sightRadius}`；下游读 `Relation(target)`（steering 追、caster at:target） |
| 诱饵/嘲讽盖过默认目标 | `t3-aggro`（`lureTag`） | `Perception` 加 `lureTag`：半径内有带该 Tag 位的实体则优先锁它（盖过 `targetTag`），无则回落默认索敌 |
| 跳弹（命中后转向下一个目标） | `t2-launch`（`bounce`）+ `t2-bounce-relay` | `Launch{bounce:{times,targetTag}}`：自删 Launch 前落地持久 `Bounce`；命中后由 `bounce-relay` 找 `nearestByTag` 下一个目标重定向（保持 speed 模长）、`times-1`；无新目标不再弹 |
| 黑洞/吸附（拉一群敌人向锚点） | `t2-pull-anchor` | 锚点挂 `PullAnchor{radius,tagMask}`：半径内已挂 `Steering` 的实体 `Relation` 改指锚点，复用 `steering` 现成 seek 拉过去（仅对已挂 `Steering` 的实体生效） |
| 按数据放技能/召唤 | `t3-caster` | 技能=`PrefabTemplate`，按键/点击→`Signal`→`Caster` 释放（配 `t3-prefab`） |
| 掷骰判定 / roguelike | `t2-dice-roll`（`DicePool`） | 见 randomness.md；结果 `RolledDice` 供结算 |
| 各掷战力比大小 | `opposedRoll`（纯函数） | `src/skills/tier2/dice.ts` 同骰族纯函数，种子化对掷 |
| per-shot 扣发射源资源（弹药经济） | `f1-resource`（`ResourceModify.scope:'source'`） | 子弹带 `PrefabOrigin.source`=炮台实体 + `ResourceModify{resourceId:'ammo',amount:-1,scope:'source'}`：只扣该炮台自己的 ammo（N 炮各自计数，不像 `global` 扣到第一个同名资源）；源缺失/无该资源→静默跳过（REQ-SPENDONFIRE） |

## ② 样例指针

- 可选护甲/韧性：`DamageReceiver{armor,toughness}` → `t2-damage-routing`，先部位倍率，再 Minecraft 护甲公式；`Hitbox.damageType:'true'` 跳过护甲、`armorPiercing:true` 将护甲/韧性按0。负数治疗不受护甲影响。`DamageRequest` 保留原始量、`afterArmorAmount` 和实际有符号 `appliedAmount`，统计不得累加原始伤害。R3新增字段尚待独立复查，见 MC Fight `REQ-MCFIGHT-007`。

- registry：`t2-hitbox`/`t2-over-time`/`t3-caster`/`t2-dice-roll` 的 `describe.examples`。
- 真实用法：`games/game-g/clash-resolve.ts`（三路对掷战斗核）、`games/game-g/combat-types.ts`。
- 抛射线（火球/弹幕）见 movement-pathfinding.md 的 `t2-launch`。

## ③ 本线红线

- 伤害/死亡/属性**全用能力 + 组件数据**，游戏层不写战斗系统代码（`capability-plan` 未过审不得写）。
- 掷骰/概率一律种子化（randomness.md），**禁裸 `Math.random`**。
- **带逻辑的结算代码同提交接 trace**（日志基准守则·CLAUDE.md）：`src/skills/debug-trace.ts`，只记 decision/transition/**reject**/commit 四类·样板 `matrix-duel.test.ts`「DebugTrace 试点」。
- 数据表必须有现成能力消费——填了 buff 文案却无解释器 = 虚胖数据（比没有更糟）。
- 修正/加成聚合**禁游戏层自写聚合器**（各写一套 add/max/or 循环）：逐字段单策略走 `t2-modifier-stack`，实体属性走 `t2-stats`。应用序固定 add→mul→max→min→or→floor（乘性非交换 → 靠 order/id 定序，禁墙钟/Math.random）。

## ④ 正样例 / 反面教材

- ✅ `src/skills/tier2/hitbox.ts` + `mortal.ts` + `over-time.ts`：整套战斗=数据。
- ✅ game-g 对掷核（clash-resolve）：全程确定性、可回放。
- ✖ 游戏层手写伤害循环 / `Math.random` 掷骰 / 各写一套索敌。

## ⑤ 查不到怎么办

现有能力真表达不了的战斗机制 → `docs/workflow/requests.md` 提缺口（Lead 评审：先看能否用 hitbox/effect/caster 重组，再决定是否下沉新通用能力）。**不在游戏层写 system 逃生。**
