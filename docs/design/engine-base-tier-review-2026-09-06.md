# 底层 tier 评审（原子 + Tier1）—— 「底层到底缺什么」2026-09-06

> owner 问：「我想扩展底层 tier，觉得底层 tier 是不是缺点什么」。本文是回答。
> 方法：三路实查（① 31 原子 + 8 tier1 逐个读契约；② 14 款游戏非测试代码里绕过底层自造的东西 + 各游戏 requests/capability-plan 的裁决记录；③ tier2/tier3 74 个文件里重复造的底层轮子），再对三份证据做交叉裁决。全部结论附 file:line。
> 上一份评审 `engine-architecture-review-2026-09-02.md` 讲的是内核（World/调度/事件/schema/打包），本文只讲**底层词表**：原子该有哪些、底层库该有哪些。

## 0. 一句话结论

**底层缺的不是「更多原子」，而是三样别的东西**：① **两个真原子**（归属/阵营、实体集合）——它们缺席让 6 款游戏和 5 个 tier 能力各自发明了归属编码，让手牌/背包/队伍/座位这类「一堆实体」永远只能塞在某个大组件的数组字段里；② **一层底层库**（标量/向量/网格数学、按 id 找实体的索引、确定性遍历、多计时器）——这不是组件，是纯函数，现在在 tier2/3 里被重造了 6 到 27 份，且已经出现 `floor` 对 `round` 这种同名不同义的分叉；③ **治理**——有 6 件底层件已经下沉却零消费方（event-log、leaderboard、local-store、事件总线、weighted-pick、修正栈），游戏照旧手写。

反过来，**很多「看起来缺」的东西不该进底层**：麻将/德州/掼蛋规则域、回合脚本、下注边池、伤害矩阵——它们是 tier3 或游戏层的事，manifesto 的 rule-of-two 已经正确挡住了它们。

## 1. 底层现在长什么样（事实）

| 维度 | 现状 | 证据 |
|---|---|---|
| 规模 | 31 原子（30 核心 + 1 扩展 string-variable）+ 8 tier1 + 1 数据核 event-log | `src/skills/atoms/index.ts:80-114`；三份文档数字互不一致（README 说 29·wiki 说 26·代码 31），wiki 自标「口径已过期」 |
| 形态 | **22/31 原子是纯数据（零 system）**；9 个带且只带 1 个 system；random / spatial-query 用纯函数代替 system | `atoms/*/index.ts` 各 `systems: []`；`atoms/random/index.ts:8-49`、`atoms/spatial-query/index.ts:56-114` |
| 「原子 = 契约、行为在运行时」 | input-capture / action-map / controllable 三个原子只登记契约，行为在 net 层 `applyMovement`；`RawInput` 全库零读零写 | `atoms/controllable/index.ts:6-16`；上一评审 D6 |
| 无 provider 的协议组件 | `InputQueue`、`Status`、`Collider3D`、`NavMesh` 四个组件被 tier2/3 与运行时读写，**没有任何能力 provides 它们** → 目录查不到、推断推不出、字段不受 schema 校验 | `grep "InputQueue: {\|Status: {\|Collider3D: {\|NavMesh: {" src/skills` = 0 |
| 原子 schema 落后于接口 | `Shape` 接口有 `polygon/vertices/category/mask`，原子只声明 box/circle；`SpawnRequest` 接口有 `overrides/source/originHex`，原子只声明 templateId/x/y；`Tween.keep`、`StringSet.scope` 同病 | `protocol/components/spatial.ts:38-50` vs `atoms/shape/index.ts:25-28`；`spawn.ts:37-51` vs `atoms/spawn/index.ts:25-27` |
| 数学库 | **`src/engine/math` 不存在**；`engine/spatial` 只有几何（SAT/AABB 树/A*/navmesh），无 clamp/lerp/vec2/网格索引 | `ls src/engine/math` → 不存在；`engine/spatial/*.ts` 导出清单见附录 |
| 一实体一组件 | World 每实体每 type 只存一个组件——这是本文一半问题的根 | `engine/protocol/components.ts:18` |

## 2. 先把「缺」分成四种病，不然会开错药

| 病 | 症状 | 处方类型 |
|---|---|---|
| **A · 真缺原子** | 引擎表达不了，≥2 个游戏 + ≥2 个 tier 能力各自发明了同一概念的编码 | 加原子（🔴 改组件形状·owner 判） |
| **B · 缺底层库** | 概念不缺，但纯函数在 tier2/3 被重造 N 份，已出现语义分叉 | 加 `src/engine/math` / `engine/core` 纯函数 + 机械迁移（🟢 零行为变化） |
| **C · 有了没人用** | 已下沉的件零消费方，游戏继续手写；或协议组件没有 provider | 治理（工单 + 守卫），不加代码 |
| **D · 层错位** | 想往底层塞的东西其实是 tier3 或游戏域 | wontfix，写清理由 |

下面每个候选都按这四类判。

## 3. 逐项裁决

### 3.1 A 类 · 真缺的原子（两个）

#### A-1 归属 / 阵营（Owner）

**证据（游戏侧）**：6 款游戏各写一套「谁的 / 哪队」：game-a `teamOf/partnerOf`（`guandan-session.ts:28-30`）、game-f 把队伍写成 Tag 位（`constants.ts` TEAM_A/TEAM_B）、game211 `type Side = 'red'|'blue'` + `countBySide/winnerOf`（`melee-campaign.ts:20,114,122`）、game-g `TurnLane{a,b}`（`turn-combat.ts:67`）、game108 「出招信号两侧共用一个名字，靠 Signal.source 认侧」（`docs/design/game108/capability-plan.md:340`，最后靠给 matrix-duel 加 `intentSignals` 解决）。

**证据（引擎侧）**：tier 里同一概念有 **5 种互不相通的编码**——`CardPile.owner: string`（`cardboard.ts:193`）、`Controllable.playerId`（`input.ts:78`）、Tag 位掩码（`group-count` 注释「owner 维度即再加一个归属 bit」`logic.ts:249`）、`Relation{kind:'owner'}`（`atoms/relation/index.ts:25`）、`PrefabOrigin.source`（`spawn.ts:23`）、`DuelMatrix.sides: string[]`（`matrix-duel.ts:584`）。

**能否重组**：查过三条路。① Tag 位：能表达「阵营」（静态、≤32 类），**不能表达「属于哪个玩家实体」**（玩家是运行时实体，数量不定，不是位）。② `Relation{kind:'owner'}`：**一实体只能挂一个 Relation**（`components.ts:18`），而 `kind:'target'` 已是 aggro/steering/pathfind/caster/pull-anchor 五方争抢的接缝（`combat.ts:86-88,104-105,121-123`；`spatial.ts:206-207`），pull-anchor 甚至有「Relation 另作他用则让位」的礼让口径——把 owner 也塞进去等于第六方抢同一个槽。③ `PrefabOrigin.source`：只有 prefab 生成的实体才有。**重组不成立。**

**这是不是原子**（周期表判据「只回答一个问题·不能由两个原子组合出」）：它回答「这个实体属于谁 / 站哪边」。属于谁 = 到玩家实体的引用（不是空间父子·不是 target），站哪边 = 一个整数。两个字段一个问题。

**两条路（owner 判）**：
- **A 补原子 `g3-owner`**：`Owner { ownerId: EntityId; team: number }`。代价：新组件 + 全库 5 种编码逐步迁到它（CardPile.owner / Controllable.playerId 保留作兼容别名或 refine 校验一致）；影响面：group-count/hitbox/matrix-duel/card-pile 的「按侧」逻辑可改读 Owner；通用性：卡牌/RTS/对战/合作全用；选错代价：如果以后发现「归属」需要多层（玩家→队伍→联盟），`team:number` 不够，要升成 `Relation` 多槽（见 A-2 备注）。
- **B 游戏层继续各自编码**：零引擎改动；代价是下一个多人游戏第七次发明它，且引擎 tier 内 5 种编码永远对不齐（group-count 用位、card-pile 用字符串、matrix-duel 用数组）。

Lead 推荐 **A**。

#### A-2 实体集合（Group / 有序引用列表）

**证据（游戏侧）**：手牌/牌堆/背包/装备栏/队伍名单/座位圈全是「一堆实体 + 顺序 + 容量」：game-f `equip.ts:10-33` 的 3 槽 EquipMap（自评「零引擎」）、game-e `JOKER_SLOTS=5`、game-g `HAND_MAX=8` + 6 个牌组槽、game-a `HAND_SIZE=27` 手牌数组、game-c 座位数组、game-a A-016「缺库存/收藏控件」。

**证据（引擎侧）**：`Relation` 严格单目标（`targetId: EntityId`）；tier 里实体 id 数组只能塞进大组件的字段：`Zone.requiredEntities`（`spatial.ts:163`）、`Pivot3D.children`（`render.ts:171`）、`Timeline.emitted`（`logic.ts:349`）、`DuelMatrix.sides/throws/carriers`、`MatchBoard.kindSkinEntities`、`CardPile.deck/hand`（`cardboard.ts:194-195`·存的是牌码不是实体）；`tray` 和 `queue-slots` 每 tick 从零重建 `members[] + seatOf Map`（`tray.ts:118`、`queue-slots.ts:115`）。resource 原子自己也预告了「真撞到同帧改多个不同局部资源再上 list 形态」（`atoms/resource/index.ts:11`）。

**能否重组**：① 用 N 个 `Relation{kind:'member-of', targetId: 容器}` 反向表达：一实体一 Relation 的限制 + 无逆向索引，每次「容器里有谁」都要全表扫描且顺序靠 id 排序不靠插入序——手牌顺序就丢了。② 用 `Hierarchy` 父子：hierarchy 明确「空间继承」，把背包做成空间父子会让 hierarchy-resolve 去改物品的 Transform。③ 用 Tag 位：无顺序无容量。**重组不成立。**

**这是不是原子**：回答「这个实体装着哪些实体（有序·有上限）」。就一个问题；spawn/destroy/relation 都组不出「有序」。

**两条路（owner 判）**：
- **A 补原子 `g4-group`**：`Group { id: string; members: EntityId[]; capacity?: number }`（`id` 走全局语义 id 路由，同 Resource/Flag 口径）+ 一个 tier1 `group-gc`（成员被 destroy 时从列表摘除·防悬空 id）。代价：新组件 + tier1 一个 system；影响面：tray/queue-slots 可改成 Group 的空间投影而不是每 tick 重建；card-pile 的 hand/deck 可留牌码（不强迁）；UI `repeat` 的 `UIListSpec` 直接能按 Group 投影一张手牌区。通用性：手牌/背包/队伍/座位/技能栏。选错代价：如果 capacity/ordering 语义各游戏差太多（有的要按格、有的要按堆叠），Group 会被要求长出「堆叠数」「格位」字段——到那时应拆 `Inventory` 而不是往 Group 加。
- **B 保持现状**：每个需要集合的能力继续在自己组件里放数组字段。代价：「实体集合」永远没有统一投影，UI 与 AI 每次都得知道是哪个组件的哪个字段。

Lead 推荐 **A**，且**明确不另立 Inventory 原子**：inventory = Group + capacity，格位/堆叠属 tier2。

#### 与 A-1/A-2 相关但**不是**原子的：回合 / 座位轮转

5 款游戏各写座位环（game-a `TURN_ORDER`，game-c `nextLiveSeat/nextPositions`，game-b `seatWind/nextRound`，game-g 双侧交替），game-a 记录了 `t3-flow` 表达不了「四家轮转+墩圈计数+接风」的裁决（`guandan-session.ts:12-13`）。**它是 Group（座位序）+ State（回合相位）+ 一个游标**——两个原子加一个 tier2 system，不是新原子。A-2 落地后立 `t2-turn-order`（rule-of-two 已满足：a/b/c/g 四家）。**在 A-2 之前不要做**，否则又要在它自己组件里放 `order: EntityId[]`。

### 3.2 B 类 · 缺的是底层库（不是组件）

这些全是**零行为变化、可机械迁移、可派工**的活；每条都有「已经分叉」的实证，不是洁癖。

| # | 缺件 | 重造实证 | 处方 |
|---|---|---|---|
| B-1 | **标量/向量数学** `src/engine/math/{scalar,vec2}.ts`：clamp/lerp/sign/cmpStr、len/len2/normalize/dot | `Math.sqrt(dx*dx+dy*dy)` 27 处 13 文件；normalize 内联 6 文件；clamp 1 处具名 + 12 处两种惯用法（`Math.max(min())` 与三元）；`tilemap.ts:34` 的 `sign` **0 返回 1**，与 `Math.sign` 语义分叉 | 建库 + 迁移；`sign` 分叉处显式命名 `signOr1` |
| B-2 | **网格数学** `src/engine/math/grid.ts`：`index(c,r,cols)`/`coordOf(i,cols)`/`cellOf(x,y,origin,size)`/`cellCenter`/`NEIGHBORS4/8`/`HEX_DIRS` | `r*cols+c` **6 个独立定义 + 22 处裸写**（`match3-board.ts` 一个文件 16 处）；`cellIndex` **同名不同签名**两份（flow-field-core:210 vs match3-board:65）+ `bgIndex` 第三份；世界点→格 **3 份且 `floor`（flow-field）对 `round`（grid-drag-square）分叉**；游戏侧 6 款各写 `Math.floor(i/cols)` | 建库 + 迁移；floor/round 分叉逐处确认语义后统一命名（`cellFloor`/`cellNearest`） |
| B-3 | **按语义 id 找实体的索引** 进 World：`world.byId(type, id)`（P2c 已有 typeVersion，缓存失效免费） | `buildIdLookup` 只有 10 文件用；`findByComponentId` 是 **O(n) 线性扫**（`query.ts:14-18`）被 8 文件 14 处调；**7 处手写循环**，其中 gauge/text-binding/card-scoring 三份 `Map<string,Resource>` 懒建**逐字节相同**；`findWorldSeed` 2 份相同 + 4 处内联 | World 内建索引（按 typeVersion 失效）+ 删掉全部手写；`findByComponentId` 改走索引 |
| B-4 | **确定性遍历助手** `sortedIds(world, ...types)` | `world.query('X').map(([id]) => id).sort()` **20 文件 24 处**手写；字符串比较器 6 处手写 | 一个助手 + 迁移；顺便让「漏 sort」在 review 里可 grep |
| B-5 | **多计时器 / 冷却**：Timer 原子「一实体一 Timer」 | **7 个 tier 能力自带 `elapsed` 自己 +1**（tween/anim-state/grid-move/over-time/pathfind/flow/match3-board）+ spawn-director；游戏侧 5 款自算冷却，game101 自己做秒→tick（`blueprint.ts:89-90`） | 两条路见下 |
| B-6 | **卡牌编码/建牌堆** 纯函数进 `tier2/cardboard-codec.ts` | `cardCode = suit*100+rank` 在 game-a（`rules.ts:17`）与 game-c（`holdem-eval.ts:90`）**独立写出逐字相同**；game-b/e/g 各一套；`t2-card-pile` 只定契约不给 encode/decode/buildDeck | 纯函数库（不是能力·无 system）；5 家消费满足 rule-of-two |
| B-7 | **随机流派生** `deriveSeed(seed, label)` 进 random 原子 | game211 整个 `meta-random.ts` 只为包一层「sim 外随机流」；game-a AI 按性格 `mulberry32(种子)` 派生流；game-d 注入 `rnd: () => number`；spawn-director 自带 `seedState` 并**复制了一份 mulberry32**（`spawn-director.ts:67-70`） | 一个纯函数 + spawn-director 改用它；文档写清「sim 内用 RandomSeed·sim 外用 deriveSeed」 |
| B-8 | **Tag 名字糖**（装载期）：manifest 顶层 `tags: { enemy: 1, boss: 2 }`，字段可写 `"enemy|boss"` → 装载折成位 | Tag 只有裸 32 位整数，无名字表（`atoms/tag/index.ts:29`）；每游戏在 TS 常量里自定义位（game-f `constants.ts`）；「最弱 LLM 能否产出同样数据」——让 LLM 算 `1<<5|1<<2` 是在制造 bug | 与 P2d 时长糖同一机制（`coerceDurations` 旁再加 `coerceTags`）·零运行时改动 |
| B-9 | **父子旋转传播**：hierarchy-resolve 「本地偏移不随父旋转」 | 自报限制 `tier1/hierarchy-resolve.ts:23`；orbit-motion 已示范用旋子常量（cosStep/sinStep）避 trig | 给 Hierarchy 加可选 `localCos/localSin` 旋子字段或复用 orbit 的旋子；无 trig |

**B-5 两条路（owner 判·🔴 改 Timer 形状）**：
- **A 改原子**：`Timer` 升成多计时器：`Timers { entries: { id, elapsed, duration, loop }[] }` 或维持 `Timer` 单个 + 新增 `TimerSet`。前者改现有 Timer 的 hash/存档（需 manifest schema 2 + 迁移），后者两套并存但零回归。
- **B 不动原子**：7 个自计时能力保留各自 `elapsed`，只补一个 `tickDown(state)` 纯函数统一「+1·到点·回零/停」这段逻辑（消除分叉，不消除字段）。

Lead 推荐 **B 先行**（纯函数·零风险），`TimerSet` 等第一个真需要「同一实体多个具名冷却」的游戏立项时再判 A——今天 7 处自计时都是「一个组件一个内部计时」，没有一处真需要多计时器，属 YAGNI。

### 3.3 C 类 · 有了没人用（治理，不加代码）

| 已下沉的件 | 位置 | 消费方 | 游戏里还在手写 |
|---|---|---|---|
| 事件日志 `EventLog` | `tier1/event-log.ts:25` | **0** | game-b `core/game-log.ts`、game-c `game-log.ts`（工单 B-013 / REQ-C-115 open · P3） |
| 排行榜 `insertRanked` | `services/persist/leaderboard.ts:15` | **0**（只被 index 再导出） | game-103 `leaderboard.ts`（REQ-103-壳件迁移 open） |
| 本地存档 `localStore` + `services/save` | `services/persist/local-store.ts:121` | 少 | 8 款游戏 66 处 localStorage 手写 try/catch + 钳位；5 张壳件迁移工单 open |
| tick 内事件总线 `world.emit/events` | `engine/core/types.ts:66-67`（P1b） | **0 个能力** | tier2/3 仍用 Signal 载体实体（8 处）、ResourceModify 载体（6 处）、直改 `Resource.current`（**27 处 12 文件**·绕过 resource-apply 的 clamp 与事件） |
| 加权抽取 `weighted-pick` | `tier2/weighted-pick.ts` | 部分 | game-e `rollJokerOffer` 自写 |
| 修正栈 `t2-modifier-stack` | 已下沉 | game-g `disha.ts` 已迁 | game-g/211 `clash-resolve.pEff` 未迁·game-a 自评「结算数值散码可下沉」 |

**同类治理：无 provider 的协议组件**。`InputQueue / Status / Collider3D / NavMesh` 四个组件被系统读写却没有任何能力 provides：目录查不到、manifest 推断推不出、字段不进 schema 校验。处方：一条守卫测试「`protocol/components` 里每个 type 要么有 provider，要么在显式的 `RUNTIME_INJECTED` 白名单里」，然后给 Status 落 `t2-status`（或并入 hitbox provides）、Collider3D/NavMesh 落进 overlap-detect-3d / navmesh-bake 的 provides。

**为什么这类比 A/B 更要紧**：它说明「下沉」这个动作在本仓只完成了一半——件下去了，消费没上来。再加原子而不修这条链，新原子会走同一条路。建议把 `game-skill-audit` 加一条红旗：游戏里出现与引擎件同形的类/函数名（`GameLog`/`recordScore`/`localStorage.getItem`）计红。

### 3.4 D 类 · 不该进底层的（wontfix·附理由）

| 候选 | 为什么不 |
|---|---|
| 麻将核 / 德州下注边池 / 掼蛋回合脚本 | 规则域，tier3 或游戏层；game-c 已裁「无第二消费方不下沉」、game-b 计划 `t3-riichi-core`——都对。但注意 game-g 与 game211 有 **4 个文件 690 行逐字节相同**（clash-resolve/disha/level/hero-codex）——这是「游戏间共享库」缺位，不是原子缺位，另立单 |
| 回合脚本（线性过程）、前向搜索 AI（expectimax） | game-e 立的先例「线性过程脚本是被明确接受的代码形态」；搜索 AI 是 tier4 黑盒 |
| 物理体（restitution/friction 进 Mass） | 现无任何游戏要弹性系数；friction 已是 tier2 能力；周期表把 physics-body 定为 Macro 是对的 |
| 暂停 / 时间缩放 | 引擎无 dt 是设计（定步长·lockstep）；暂停 = 宿主不 step；局部暂停 = `Visibility.active`。加 timeScale 会把「一拍 = 一拍」的确定性契约打破 |
| 每实体随机流 | B-7 的 `deriveSeed` 已够；每实体挂 RandomSeed 会让 hash 与重放校验计数散到 N 处 |
| z-order 独立原子 | `Sprite.zOrder` 够用；game-f `zlift` 哨兵贴图是渲染器缺「无贴图占位」的问题，归渲染线 |
| 2D VFX 通道 | 真缺，但归渲染器（上一评审 D7），不是 sim 原子 |
| 保存标记 | 存档是整世界快照机制（`world.snapshot/restore`），不是组件 |
| 输入三原子重整 | 上一评审 D6/P3 已立（废 RawInput/Action、InputQueue 升原子）；本文不重复裁 |

## 4. 推荐的施工顺序

**第一波 · 🟢 零行为变化·可派 Opus·不需要 owner 判**

1. B-1/B-2 `src/engine/math/{scalar,vec2,grid}.ts` + 迁移 tier2/3（黄金 hash 零变作验收；floor/round 分叉逐处留痕）。
2. B-3 `world.byId` 索引 + 删 7 处手写循环 + `findByComponentId` 改走索引。
3. B-4 `sortedIds` + 24 处迁移。
4. B-6 卡牌编码纯函数库；B-7 `deriveSeed` + spawn-director 去掉私有 mulberry32。
5. B-8 Tag 名字糖（装载期·同时长糖机制）。
6. C 类守卫：协议组件 provider 守卫 + 四个无 provider 组件归位；`game-skill-audit` 加「同形手写」红旗；开 6 张消费迁移工单（现有 5 张壳件迁移 + B-013/REQ-C-115 合并催办）。
7. 文档卫生：wiki 周期表打「以 `capability-registry.gen.ts` 为准」；Shape/Spawn/Tween/StringSet 原子 schema 补齐到接口。

**第二波 · 🔴 改组件形状·owner 判 A/B**

8. A-1 `g3-owner`。
9. A-2 `g4-group` + tier1 `group-gc`。
10. 之后：`t2-turn-order`（座位环 + 回合游标）；tray/queue-slots 改读 Group。
11. B-5 Timer 多计时器：先 `tickDown` 纯函数，`TimerSet` 等真需求。

**不做**：§3.4 全部。

## 5. 对「扩展底层 tier」的直接回答

- **要加的原子只有两个**（Owner、Group），而且都能用「一实体一组件」这条规则解释为什么今天表达不了：归属抢了 Relation 的唯一槽，集合塞在别人组件的数组字段里。
- **别再加「行为原子」**。底层 22/31 已经是纯数据，这是对的；行为放 tier1/2 让原子保持「只回答一个问题」。
- **底层真正缺的一层是库**：数学、索引、遍历、计时。它们不出现在周期表里，所以一直没人建，结果每个 tier2 作者都从 `dx*dx+dy*dy` 重新开始。建这层比加原子收益大、风险零。
- **先修消费链再加件**。6 件零消费方的下沉件是警报：不修 audit 与工单催办，新原子也会落地即闲置。


## 6. 底层功能库地图（owner 2026-09-07 追问「从游戏开发角度底层还缺什么功能库」）

按游戏开发者的工具箱分域列，每条标：**已有** / **本轮补** / **待拉动**（标准工具箱里有、本仓今天没人用——按 manifesto 等第一个消费方立项，不预建）/ **不做**（与确定性契约冲突或归别的层）。所有 sim 面库遵守同一规矩：纯函数、零 trig 零 hypot、逐位可复现。

| 域 | 件 | 状态 | 说明 |
|---|---|---|---|
| 标量 | clamp / lerp / invLerp / remap / smoothstep / sign / signOr1 / wrap / cmpNum / cmpStr | **本轮补** `engine/math/scalar` | 27+12 处内联收敛；sign 分叉分名 |
| 标量 | 定点数 / 整数 sqrt | 不做 | 确定性靠「不把浮点喂给 Condition 比较」这条纪律，全库无一处需要跨架构逐位一致的三角/指数（IEEE 加减乘除 sqrt 本就确定） |
| 向量 | len / len2 / dist / dist2 / dot / cross / normalize / inCircle / inBox | **本轮补** `engine/math/vec2` | 分量式为主，热路径零分配 |
| 向量 | 旋转 / 角度 | 已有（数据化） | 旋子常量 cosStep/sinStep 由 authoring 助手算好写进数据（orbit-motion 先例）；sim 内无 sin/cos，这是设计不是缺口 |
| 网格 | index / colOf / rowOf / inBounds / adjacent4 / cellFloor / cellNearest / cellCenter / NEIGHBORS4/8 / forEachNeighbor | **本轮补** `engine/math/grid` | 6 定义 + 22 处裸写收敛；floor/round 分名 |
| 网格 | 六边形（axial/odd-r/距离/邻接/A*） | 已有 `tier2/hex.ts` | 不并入 grid（另一套坐标系） |
| 网格 | Bresenham 视线 / 泛洪填充 / 连通域 | **本轮补** `grid.bresenhamLine/lineOfSight/floodFill/connectedComponents` | owner 2026-09-08 令补齐 |
| 几何 | AABB / SAT / 接触法线 / 3D SAT / 导航栅格 | 已有 `engine/spatial` | |
| 几何 | 线段相交 / 点在多边形内 / 射线 | **本轮补** `engine/math/geom2` | segmentsIntersect / segmentIntersectT / pointInPolygon / pointSegmentDist2 / raycastAabb / raycastCircle |
| 图 | A*（图无关·整数 id·确定性 tie-break）· 多源 Dijkstra 积分场 | 已有 `spatial/astar` · `tier2/flow-field-core` | hex A* 未迁到通用 astar 是已记的债 |
| 随机 | nextRandom / randomInt / chancePass / mulberry32 / seededShuffle | 已有 `atoms/random` | |
| 随机 | deriveSeed（流派生） | **本轮补** | game211 meta-random / game-a 性格流 / spawn-director 私藏副本的共同缺件 |
| 随机 | 加权抽取 / 抽签袋（shuffle-bag）/ 正态近似 | 已有 + **本轮补** | weighted-pick 已有；`createShuffleBag/drawFromBag`、`gaussianApprox`（12 均匀和·无 log/cos）补齐 |
| 时间 | Timer 原子 / 缓动曲线 | 已有 + **本轮补** `engine/math/ease` | tween 的私有 switch 抽成共享曲线（tween 改薄包装·逐字同） |
| 时间 | 计时步进 · TimerSet 多计时器 | **本轮补** `engine/math/tick.advanceTimer/everyN/remaining/progress`（timer 原子改调它） · 多计时器待 owner 判 | 7 处自计时是否迁看各自语义（不强迁） |
| 索引 | byId（语义 id → 实体）· sortedIds（确定性遍历）· worldSeed | **本轮补** `World.byId` / `engine/core/query` | 三条查找路径归一；28 处手写遍历归一 |
| 集合 | 有序实体集合 Group | 待 owner 判（§3.1 A-2） | 手牌/背包/队伍/座位的共同形 |
| 归属 | Owner | 待 owner 判（§3.1 A-1） | |
| 卡牌 | cardCode / codeSuit / codeRank / buildDeck | **本轮补** `tier2/cardboard-codec` | game-a/c 逐字相同的手写收敛 |
| 卡牌 | 判型 / 压制序 / 计分 | 已有 tier3 | |
| 数据糖 | 时长 "2s" · Tag 名字 "enemy\|boss" | 已有（P2d）· **本轮补**（B-8） | 装载期折算·零运行时改动 |
| 颜色 | hex ↔ rgb / 颜色插值 | 不进 sim | 表现层（渲染器/UI 主题）已有各自实现，sim 不应碰颜色数学 |
| 字符串 | 数字格式化 / 模板代入 | 已有 UI 层 `Label.format` · manifest `{{param}}` | 不进 sim |
| 哈希 | fnv1aHex · fnv1a32 / hashInts / fnvMixInt | 已有 + **本轮补** `engine/math/hash` | flow-field-core 的本地 mix 已改调（逐位同） |
| 事件 | tick 内总线 emit/events | 已有（P1b） | owner 2026-09-08：保留·后续新能力/新游戏用它消费；已写进 `playbooks/base-lib.md` |

**判断**：标准游戏工具箱里的 sim 面件，本轮**全部补齐**（owner 2026-09-08 令「补齐再列」·推翻 Lead 原「等拉动」立场）；有意不做的只剩定点数、颜色数学进 sim、时间缩放（理由 §3.4）。`src/engine/math` 现在是周期表旁边那张「工具表」，入口手册 `docs/playbooks/base-lib.md`——owner 明令：event-log / local-store / 事件总线保留，后面做的时候让他们用这个消费；`game-skill-audit` 的 engineTwin 红旗盯手写同形。

## 施工记录（owner 2026-09-07 令「先开工底层库治理」·第一波 · 零行为变化）

| 项 | 落点 | 说明 |
|---|---|---|
| B-1 / B-2 数学库 | `src/engine/math/{scalar,vec2,grid,index}.ts` + `math.test.ts` | 建库；迁移 tier2/3 + atoms 共 30 文件：sqrt/len2 27 处、normalize、clamp 三元式 8 处、`cmpStr` 8 处、网格索引 22 处 + 6 个定义改成薄包装、世界点→格 3 份分名 `cellFloor`/`cellNearest`、tilemap 的 `sign` 改名 `signOr1`。**运算顺序逐字保持**；黄金 hash 零变（全量门禁）。**有意未迁**：`Math.max(lo, Math.min(hi, v))` 5 处（bounds-clamp / merge-proximity-clear / order-fulfill / slot-payout ×2）——lo > hi 时与三元 clamp 结果不同（前者恒 lo），bounds 比 shape 窄是真实数据形态，不能当零变；orca 的 `norm` 零向量给 NaN 而库给 (0,0)，保留局部适配。flow-field-core 热循环三处保留裸算术（文件自带的性能注释） |
| B-3 语义 id 索引 | `world.ts byId` · `types.ts IWorld.byId` · `system-view.ts`（严格模式按 reads 把关）· `define-system.ts TypedWorld` · `query.ts findByComponentId → byId` · `by-id.test.ts` | (type, idField) → { 类型版本, id → 创建序首个 } 缓存，按 P2c 的 typeVersion 失效；只读路径不失效也不需要。8 文件 14 处 `findByComponentId` 自动由 O(n) 变 O(1)；手写循环 7 处 + 三份逐字相同的懒 Map + 6 处 seed 取法全部收敛（gauge / text-binding / card-scoring / slot-payout / matrix-duel / dice-roll / dialogue / effect-apply / order-fulfill / weighted-spawn）。**唯一一处有意的语义对齐**：card-scoring 旧懒 Map 是「后写者胜」，索引是「创建序首个」——与 resource-apply / buildIdLookup 全局路由口径对齐，同 id 多份本就是数据错 |
| B-4 确定性遍历 | `query.ts sortedIds / worldSeed` | 28 处 `query().map(id).sort()` 迁完（25 文件）；5 处 `for…push…sort()` 同义异形留作后续 |
| B-6 卡牌编码 | `tier2/cardboard-codec.ts`（桶再导出） | cardCode/codeSuit/codeRank/isJoker/buildDeck{decks,jokers,minRank}；游戏侧迁移归各游戏 |
| B-7 随机流派生 | `atoms/random deriveSeed` · spawn-director `draw` 改走 `nextRandom` | spawn-director 不再私藏 mulberry32（序列逐位同） |
| B-8 Tag 名字糖 | `validate-manifest.ts coerceTags` · `manifest-core.ts tags` | manifest 顶层 `tags:{enemy:1,boss:2}`，数字字段写 `"enemy|boss"` 装载折位；未知名硬错点名；非法表拒收；无表时字符串照旧走类型错 |
| C · provider 守卫 | `assembly/provider-guard.test.ts` | COMPONENT_UNIVERSE 每型：有 provider / 3D 渲染线 / 白名单（DebugTrace·ScoreTrace·Coachmark·HeldHand 附理由）。七个孤儿组件归位：Status→hitbox · Collider3D→overlap-detect-3d · NavMesh→navmesh-bake · InputQueue→input-capture（schema 组合子）· PrefabOrigin→prefab · Sensor→trigger-zone · MergeEvent→merge-on-place；懒注册表已重生成 |
| C · audit 红旗 | `scripts/game-skill-audit.mjs engineTwin` · `audit-baseline.json` · `audit-ratchet.test.mjs` | `localStorage.` / `class GameLog|EventLog` / `recordScore` / `Math.imul(` 计红；存量按既往不咎律灌入基线（a2 b1 c4 e2 g8 102:1 103:7 108:9 211:8·Lead 批注）；只许降不许升，消费迁移工单落一处降一处 |
| 文档卫生 | wiki 周期表头注指向 gen 注册表；Shape（polygon/vertices/category/mask）· SpawnRequest（source）· Tween（keep）· StringSet（scope）原子 schema 补齐到接口 | |

**未做（有意）**：A-1 Owner / A-2 Group（等 owner 判）；B-5 多计时器（等真需求）；游戏侧消费迁移（各游戏工单·红旗棘轮盯）；5 处 `for…push…sort()` 异形。

### 第三波 · 两个原子（owner 2026-09-08 判 A：Owner 与 Group 都补；现有游戏不重写）

| 项 | 落点 | 说明 |
|---|---|---|
| G3 owner | `src/skills/atoms/owner/`（`g3-owner`）· 协议 `combat.ts Owner` | `Owner{ownerId, team}` 纯数据原子；助手 `ownerOf`（主人销毁判空）/ `teamOf` / `sameTeam` / `isOwnedBy` |
| G4 group | `src/skills/atoms/group/`（`g4-group`）· 协议 `combat.ts Group` | `Group{id, members[], capacity?}`；助手 `groupAdd/InsertAt/Remove/Move`（拒重复·满则拒·move 原子）· `findGroup`（走 byId） |
| T1 group-gc | `src/skills/tier1/group-gc.ts`（`t1-group-gc`） | Cleanup 相位；销毁成员同拍从所有集合摘除；静止世界零写入（hash/写序号稳定·测试钉） |
| 登记 | `atoms/index.ts`（32 核心）· `tier1/index.ts` · `capability-registry.ts` · 重生成 `component-universe.gen.ts` / `capability-registry.gen.ts` · onboarding / wiki / base-lib 手册各一行 | |
| **不迁**（owner 令） | — | 5 种旧归属编码与既有数组字段原样保留；新能力/新游戏读新卡。`t2-turn-order`（座位环 + 游标）待第一个牌桌游戏拉动时立项 |

### 第四波 · 预建高频件（owner 2026-09-09「都实现了吧，one by one 不要来问我」+「预先写高频控件也可以」）

| 项 | 落点 | 说明 |
|---|---|---|
| 2D 粒子通道 | `atoms/vfx2d/`（`l7-vfx2d`·第 33 核心原子）· `renderer/vfx2d.ts` · `canvas-renderer.ts` 钩子 · `NON_DETERMINISTIC += Vfx2D` | render-only：burst / pop / ring / stream / trail；触发 = 同实体 Signal；渲染器私有粒子池（mulberry32·种子 = 实体 id 哈希）；sim 零感知、不进 hash |
| 多语言串表 | `services/i18n/`（`createStrings` / `interpolate` / `parseTRef` / `withStrings`） | UI 数据源装饰：`@t/key?n=3` 由 value 通道折成串；缺 key 回 key 本身 |
| 回合轮转 | `tier2/turn-order.ts`（`t2-turn-order`·Update） | `TurnOrder{order,current,round,direction,advanceSignal,changedSignal?,roundSignal?,skipFlag?}`；跳过 = Flag `${skipFlag}:${座位}`；入 p0 大 SCC（同 dice-roll 等 Signal 读写者·基线登记） |
| 多冷却 | `tier2/cooldown.ts`（`t2-cooldown`·Commit）· 条件叶 `{kind:'cooldown'}`（`engine/logic` + 协议 + schema）· event-when / self-rule / flow / timeline reads += Cooldowns | 就绪才开·否则 blockedSignal（「什么都没发生」可见）；放 Commit 避开与 event-when 的 Update 环 |
| 骰子修正 | `tier2/dice.ts` 增 | `rollWithMods`（bonus/floor/twice/advantage/disadvantage/rerollBelow/explodeOn·爆炸封顶 8）· `rollDist winProb expectedValue` |
| 背包堆叠 | `tier2/inventory.ts`（`t2-inventory`·无 system） | `Inventory{slots,maxStack,items}` + 14 个纯函数（加/减/拆/合/移/排序·满则拒） |
| 克制表 | `tier2/damage-table.ts`（`t2-damage-table`）· `hitbox.ts` 接线（`Hitbox.damageType`·reads += Armor/DamageTable） | 缺任一 = ×1 → 现有游戏逐字旧伤害（测试以无 damageType 基线对拍） |
| 限流调度 | `tier2/rate-limit.ts`（纯函数） | `planStarts`：同拍最多 N 起 · 最小间隔 · 配对去重（`pairKey`） |
| 成就台账 | `services/persist/achievements-ledger.ts` | 在 localStore/jsonCodec 上：解锁/进度/列举，不进 sim |
| 传送带队列 | `tier2/conveyor-queue.ts`（`t2-conveyor-queue`·PostResolve） | REQ-G102-BURST 下沉：同拍 N 份 enqueueSignal → N 个载体实体各挂 SpawnRequest + Timer{life}（prefab-spawn 展开·lifetime 回收）；容量/突破 Flag/满发 fullSignal/popSignal 出带/成员按 PrefabOrigin.source 归属并排位。**相位教训**：放 Commit 经 Flag→本系统→Signal→effect-apply 闭环；放 PostResolve 且**只写不读 Transform** 才不与 hierarchy-resolve/orbit-motion 结环（SCC 棘轮两次报红实证） |
| 登记 | `tier2/index.ts` · `capability-registry.ts` · `atoms/index.ts`（33 核心）· 重生成 universe / gen 注册表 / manifest 基线 · `PHASE_BASELINE` p14 += conveyor-queue · p20 += cooldown · `SCC_BASELINE` p0 += turn-order · onboarding 原子数 · base-lib 手册 §5/§5b | |

**本波有意未做**：输入层重做（上一轮评审 P3·不是库）；flow-field M2–M4（自有 REQ）；现有游戏迁移到新件（owner 令「前面写过的游戏没必要重写」）。

### 第二波（owner 2026-09-08「补齐再列」）

| 项 | 落点 | 说明 |
|---|---|---|
| 几何 | `engine/math/geom2.ts` | segmentsIntersect / segmentIntersectT / pointInPolygon（射线法·边上算内·凹多边形）/ pointSegmentDist2 / raycastAabb（slab）/ raycastCircle |
| 网格算法 | `engine/math/grid.ts` 增 | bresenhamLine / lineOfSight / floodFill（BFS 确定序）/ connectedComponents |
| 缓动 | `engine/math/ease.ts` | linear/easeIn/easeOut/easeInOut/easeSmooth/easeOutBack；`tier1/tween` 改薄包装（函数体逐字同） |
| 哈希 | `engine/math/hash.ts` | fnv1a32 / hashInts / fnvMixInt；`flow-field-core.bucketKey` 改调（逐位同） |
| 计时步进 | `engine/math/tick.ts` | advanceTimer（= timer-advance 语义·原子改调它）/ everyN / remaining / progress |
| 随机 | `atoms/random` 增 | createShuffleBag / drawFromBag（不放回·抽空重洗·状态可序列化）· gaussianApprox（Irwin–Hall·无 log/cos） |
| 手册 | `docs/playbooks/base-lib.md` + 索引登记（索引封顶 4700→4900·理由在基线 _doc） | 「先查后写」入口：数学 / 查询 / 事件总线 / 随机 / 数据糖 / 共享件（event-log · persist · 牌码 · 修正栈 · 宿主壳）；手写同形 = engineTwin 红旗 |
| 自测 | `engine/math/math-extra.test.ts` · `atoms/random/random.test.ts` | 与被替换实现逐位对拍（ease switch · flow-field mix · timer-advance）+ 边界（凹多边形/共线/零长段/背向射线/停表/loop 归零） |


---

## 附录 A · 证据索引（节选·全部可 grep 复核）

| 结论 | 证据 |
|---|---|
| 22 原子零 system | `src/skills/atoms/{transform,hierarchy,velocity,acceleration,mass,shape,flag,tag,relation,visibility,input-capture,action-map,controllable,spawn,sprite,color,frame,sound,camera,text,random,spatial-query}/index.ts` `systems: []` |
| 一实体一组件 | `src/engine/protocol/components.ts:18` |
| Relation 单目标 · target 槽五方争抢 | `atoms/relation/index.ts:25-26`；`protocol/components/combat.ts:86-88,104-105,121-123`；`spatial.ts:206-207` |
| 归属 5 种编码 | `cardboard.ts:193`、`input.ts:78`、`logic.ts:249`、`spawn.ts:23`、`tier2/matrix-duel.ts:584` |
| 实体数组塞字段 | `spatial.ts:163`、`render.ts:171`、`logic.ts:349`、`cardboard.ts:33,194-195`；`tier2/tray.ts:118`、`tier2/queue-slots.ts:115` |
| 游戏侧座位环/相位 | `games/game-a/guandan-session.ts:12-13,27-30,99`；`games/game-c/betting-engine.ts:33,88,99,110`；`games/game-b/core/game-state.ts:20,101,667`；`games/game-g/turn-combat.ts:67,75` |
| 背包/槽位 | `games/game-f/equip.ts:5,10-33`；`games/game-e/session.ts:31`；`games/game-g/game-g-save.ts:15-16`；`docs/design/game-a/requests.md:64` |
| sqrt 27 处 · normalize 6 文件 · clamp 分叉 · sign 分叉 | `tier2/orca.ts:95-97`、`steering.ts:28-42`、`camera-follow.ts:43`、`tilemap.ts:34` 等（探索报告③ §2） |
| 网格索引 6 定义 · floor/round 分叉 | `tier2/flow-field-core.ts:210,216`、`tier3/match3-board.ts:65`、`tier3/block-grid.ts:35`、`tier2/hex.ts:51`、`tier2/grid-drag-square.ts:24`、`tier2/grid-move.ts:36` |
| id 查找 3 种路径 · 3 份相同懒 Map | `engine/logic/index.ts:61`、`engine/core/query.ts:8-18`、`tier2/gauge.ts:86-90`、`tier2/text-binding.ts:67-72`、`tier3/card-scoring.ts:130-135` |
| 自计时 7 处 | `tier1/tween.ts:126`、`tier2/anim-state.ts:114`、`tier2/grid-move.ts:177`、`tier2/over-time.ts:90`、`tier2/pathfind.ts:179`、`tier3/flow.ts:95`、`tier3/match3-board.ts:654` |
| 私有 mulberry32 | `tier2/spawn-director.ts:65-70` |
| 卡码逐字相同 | `games/game-a/rules.ts:17` ≡ `games/game-c/holdem-eval.ts:90` |
| 零消费方件 | `tier1/event-log.ts`（grep 消费 = 0）；`services/persist/leaderboard.ts:15`（仅 index 再导出）；`IWorld.emit` 在 `src/skills` 调用 = 0 |
| 无 provider 组件 | `grep "InputQueue: {\|Status: {\|Collider3D: {\|NavMesh: {" src/skills` = 0 |
| 直改 Resource.current 27 处 | `tier3/slot-payout.ts:89`、`tier2/card-pile.ts:208`、`tier2/craft-recipe.ts:98,105`、`tier2/group-count.ts:94`、`tier3/card-scoring.ts:54`、`tier3/poker-hand.ts:226` 等 |
| g/211 逐字节相同 690 行 | `cmp games/game-g/{clash-resolve,disha,level,hero-codex}.ts games/game211/…` 全同 |
| 游戏层零自写 system | `grep -rn "defineCapability\|addSystem" games/**` 非测试 = 只有安装引擎能力的调用 |
| capgap 台账 | `.zerocraft/cap-gaps.jsonl` gitignored·本 clone 缺席；2026-08-10 前 CLI 不通（`scripts/capgap.mjs:5-12`） |
