# game109《暂名》· S2 能力总览（capability plan）

> 依据 `docs/design/capability-plan-template.md`。**状态：S2 施工完成；§7 的 A/B 已由 owner 裁 A 并已施工落 [`REQ-G109-001`](requests.md)；待独立复查 + owner 人签。**
> 本文所有「✅ 已实证」结论都可复跑：`npx vitest run games/game109/probe.test.ts`（**11/11 绿**，P1-a 已由「断言缺陷行为」翻为「断言修复后行为」）。
> S1 立项卡：[brief.md](brief.md)

---

## 1. 游戏一句话

**每天有一定的体力，点地块干农活；干完睡觉，作物长一天；卖货攒够目标金币就算通关。**
参照物：星露谷物语的「种—长—收—卖—睡」核心循环，**剥离**实时时钟、战斗、社交、下矿、建造，并把时间改成**回合制日**（owner 已定）。

## 2. 消费的引擎能力（对照 `capability-registry` 实名）

| capability（注册名） | 用来做什么 | 状态 |
|---|---|---|
| `a1-transform` + `c1-shape` | 地块/作物的位置与命中盒 | ✅ 现有 |
| `l1-sprite` + `l2-color` | 地块与作物的视觉（带皮肤槽） | ✅ 现有 |
| `g1-tag` | `TILE` 掩码——**批量寻址的钥匙**（`set-flag-tagged` 靠它） | ✅ 现有·实证 P2-a |
| `f2-flag` | 「今日已浇」标记（同时是生长规则的触发源） | ✅ 现有·实证 P2-a/b/c |
| `f1-resource` | 体力 / 金币 / 生长阶 / 背包各物 | ✅ 现有·实证 P3 |
| `j1-state` | 地块生命周期（荒地→已翻→已播→成熟）——`State.current` 是**字符串**，一个槽装得下整条链 | ✅ 现有·实证 P4 |
| `i1-input-capture` + `t2-clickable` | 指针采集与 AABB 命中 → 发具名 Signal | ✅ 现有·实证 P1/P2/P3 |
| `t2-effect-apply` | 信号 → 置旗 / 改资源 / 设状态 | ✅ 现有·实证 P1-a（§7 缺口已补齐） |
| `t2-self-rule` | **每格自读自写**：读自身 watered+state → 长自身 stage → 自清旗 | ✅ 现有·实证 P2-b/c |
| `t2-craft-recipe` | 扣体力（可负担才成交·原子） | ✅ 现有·实证 P3-a |
| `t3-flow` | 通关判据与流程（playing → won → 结算） | ✅ 现有·实证 P5-a |
| `@ui/starters`（`buildStarterHome`/`buildStarterResult`） | 主菜单 / 结算屏 | ✅ 现有·见 §4.6 |

**零 tier3 卡带、零游戏层专属系统、零下沉申请。**

## 3. 摆成数据的规则面

| 数据表 | 内容 | 谁解释它 |
|---|---|---|
| `CROPS` | 3 种作物：{id, 成熟所需天数, 卖价, 皮肤槽} | `t2-self-rule`（按 stage 比对成熟线）+ `t2-craft-recipe`（卖价） |
| `TOOLS` | 4 个动作：{id, 体力消耗, 目标前置 state} | `t2-craft-recipe`（成本）+ 动作门（见 §7 缺口：门的落法取决于 A/B） |
| `FARM` | 6×6=36 格的初始坐标与 tag 位 | `parseManifest` 展开为实体数据 |
| `BALANCE` | 起始体力 / 每日回复 / 目标金币 | `f1-resource` 的 min/max/current + `t3-flow` 的 `when` 阈值 |

> 红线自查：本表**没有**「数据 + 待写的游戏层解释器」——四个表的解释器都是上面 §2 的实名 capability。`FARM` 由装配期的数据生成（同 game102 的 `pool-${i}` 模式），不是运行期解释器。

## 4. 申请的游戏层代码例外（逐条过审）

| 例外 | 为什么现有能力表达不了 | 预计行数 | Lead 裁决 | 偿还计划 |
|---|---|---|---|---|
| （无） | — | 0 | 待评 | — |

**本次申请为零例外。** 目标形态 = 纯 manifest + 现有能力，无 TS 卡带、无手写 UI、无自建解释器。

## 4.5 美术接入

- **皮肤槽清单**：地块、作物、玩家（若有立绘）、UI 图标——**全部主体视觉实体必须带 `Sprite` 皮肤槽**（`art-pipeline.md` 红线）。本作视觉主体 = 36 格地块 + 3 种作物 × 各生长阶 + 背包/工具图标。
- **占位最低标准**：成形矢量图（非色块）。程序化观感作回退保留，皮肤就绪即盖过。
- **台账产出**：照 `scripts/game-g-art-requirements.mjs` 样板写推导脚本（脚本名：**待 S6 定**）。
- **S1 已记方向**：俯视 2D、像素/卡通、温暖色调。**本 demo 不追求商业化观感**——但 S4 定布局、S5 定观感精修的两层纪律照走。

## 4.6 UI 呈现 · 华丽起手

- **house 主题**：`STARTER_THEME`（apollo-toon）——温暖卡通，与种田题材同调。
- **起手包**：**用** `@ui/starters`——`buildStarterHome`（主菜单）+ `buildStarterResult`（通关结算屏）。不自建朴素屏。
- **成熟件清单**（按「有什么」列）：
  - 主 CTA（开始/睡觉/卖货）→ `sheen-hover` + `Panel.skin`
  - 数值（体力/金币/日期）→ `Label.format`
  - 背包/工具栏格子 → 网格容器（复用成熟件，不自画）
  - 通关庆祝 → `Particles`
  - 地块/作物 → 非 UI，走渲染器（§4.5）
- **零成熟件申辩**：不适用——上列五项都真用得上，没有「该玩法确实用不上」的情况。

## 4.65 对手/敌人 AI 设定

**不适用。** 本 demo 无对手、无敌人、无 NPC 决策（S1 已把 NPC 好感/送礼/剧情列 Out of Scope）。故本节无内容——不是漏填。
（若后续批次加入 NPC，届时按 `docs/playbooks/opponent-ai.md` 补设。）

## 4.7 代码准入阶梯申报

| 规则 | 落级 | 说明 |
|---|---|---|
| 通关判据（金币 ≥ 目标 → 结算） | **L0 纯数据** | `GameFlow.states[].transitions[].when` 直接写条件树；实证 P5-a |
| 睡觉结算（全场浇水旗置位 → 各格生长 → 自清 → 体力回满 → 日+1） | **L1 重组** | `set-flag-tagged` + `SelfRule` + `craft-recipe`/`effect-apply`；实证 P2-a/b |
| 生长门（只长浇过水的、只长已播种的） | **L1 重组** | `SelfRule.when` = `and[flag(watered), state(sown)]`；实证 P2-c |
| 体力扣减（不够则动作被拒） | **L1 重组** | `t2-craft-recipe` 的可负担检查天然原子；实证 P3-a |
| 地块生命周期（荒地→已翻→已播→成熟） | **L1 重组** | 单个 `State.current` 字符串装整条链；实证 P4 |
| **「点某格 → 只改那一格」的 4 个动作** | **L1 重组** | 曾为 L2 缺口，owner 2026-09-17 裁 A 并已补齐引擎（[`REQ-G109-001`](requests.md)，`@signal-source` 覆盖三个逻辑 kind）。**本行不再有 capgap**：4 个动作 = 4 个 `Effect` 共用，格数不涨数据量。实证 P1-a / P1-a2 |
| 卖货（背包作物 → 金币） | **L1 重组** | `t2-craft-recipe`：costs=背包物、gains=金币（同 P3-a 机制，未单独实证——**列入 S3 首验清单**） |

> L4 未申报。

## 5. 确定性声明

- **随机源**：**本 demo 零随机**——无天气、无暴击、无随机掉落、无随机生长。作物按天确定生长，卖价固定。
  - 即便如此，仍**不引入裸 `Math.random`**（游戏层红线）；若后续批次要加随机（如品质分级），一律走 `w1-random`（`RandomSeed` + `nextRandom` 种子 PRNG）。
  - Manifest 仍建议带一枚 `RandomSeed` 单例占位，避免将来接入时改动全局 hash 口径——**此项待 S3 定**。
- **需要回放 / lockstep**：**否**（单机、无同步）。但 `World.snapshot()`/`restore()` 可用于「睡觉存档」，是本作的免费收益（S2 不需要开工，记在此备查）。

## 6. 评审记录

- 提交人 / 日期：Lead，2026-09-17
- owner 裁决：**已裁 A·补引擎**（2026-09-17，§7），已施工落 [`REQ-G109-001`](requests.md)
- 独立复查人（≠施工人）：**独立复查 agent（另开 fresh-context·复跑全部证据）**，2026-09-17
  - 判词 **CONCERNS**（有条件过·不阻断施工）。四步铁律全部做实：独立复跑（哈希+107/30 绿+tsc）·
    撤修验红（隔离副本·红输出与 §7.1 修复前实查**逐字一致**）· 实证复现（多源 6/6·`condition.ts` 等价性实核·8 hunk diff 零溢出）·
    读告警（仅存量 `[state-sync, flow]`，来自 P5-a 的世界，与本件无关）。
  - 四条 minor 挂在 **owner 人门的 ⚠** 上（全文在 `public/games/game109/pipeline.json` 的 `reviews.S2.note`，
    其中 a/c 已回填 [requests.md](requests.md) §7 债务）。
  - **`gapsHash` 会随缺口台账变动而失效**——本条复查绑的是落账时刻的指纹，台账再动须重查。

### 6.1 owner 裁决（2026-09-18）：判词以复查人留档为准

- owner 原话：**「docs/design/game109/review/REQ-G109-001.md:69 为准」**——即复查人留档的结论行
  **PASS**（把握高·四条 minor 均不阻断）为**权威判词**，优先于机读记录里写的 CONCERNS。
- **机读原件本卡不手改**：`public/games/game109/pipeline.json` 的 `reviews.S2.verdict = "CONCERNS"`
  是复查人经 `game-pipeline.mjs review` 落的原件，施工方手改它=伪造证据（红线）。**两者的归一，
  由下一次复查落账时写明裁决依据完成**（见下条），不是靠改文件对齐。
- **该裁决并不解开复查门**：板上 S2 复查门现为
  `⚠ 复查过期（S2 策划/能力输入已变动·须重查）`——卡的是**指纹**不是判词。
  指纹变动的实因有二：①`capability-gaps.json` 因 `REQ-G109-003` 翻 `delivered` 而改（正是 `gapsHash`
  设计要拦的「改一条 state 就解开缺口锁」）；②`REQ-G109-003` 的引擎改动（`Effect.whenGlobal`）
  **落在那次复查之后，从未被任何人复查过**。故重查是**实体需要**，不是走形式。

### 6.2 S2 重查的接单范围（派给非施工 agent）

1. **-001 部分**：按 owner 上述裁决，**PASS 沿用**，复查人可判 PASS 但须在 `--note` 里引本裁决；
   若复查人复跑后不认，照实写自己的判词（复查人不受 owner 判词约束·只受证据约束）。
2. **-003 新增部分（无历史判词·须从头四步铁律）**：`src/engine/protocol/components/logic.ts` 的
   `Effect.when` / `Effect.whenGlobal` 两门 + `src/skills/tier2/effect-apply.ts` 的命中级施放判定。
   实查原文、三文件清单、探针 P7 与撤修验红原文见 [`requests.md`](requests.md) §6。
3. 落账：`node scripts/game-pipeline.mjs review game109 S2 --verdict … --note "…" --by 复查人`
   ——重查后 `reviewHash`/`gapsHash` 随当下指纹重绑，S2 复查门转绿，S3 的
   **复查前置硬闸**（现实测拒跑，原文：`✗ 复查前置硬闸：S3 的前置里有「已施工未复查」的关`）随之解开。

---

## 7. 缺口 `REQ-G109-001`：实查 → 裁决 → 施工（**已结**）

> 状态：**A 路已施工并落 [`requests.md`](requests.md)**。`capability-gaps.json` 已由 `open` 翻 `delivered`。
> 遗留：**独立复查（复查人须 ≠ 施工人）与 owner 人签均未做**——本卡不得自签，S2 门仍在此处。

### 7.1 实查原文（协议第①步）

`npx vitest run games/game109/probe.test.ts` → 11/11。**修复前**（当时的红证）：

```
[P1-a] 点 tile-b → tile-a.tilled=true   tile-b.tilled=false
```

**点的是 B 格，被改的是 A 格。** 这不是「没生效」，是「生效在别的格上」——更坏。

根因（读实现留原文）：[effect-apply.ts:102](../../../src/skills/tier2/effect-apply.ts#L102) 定义了指针寻址 `targetsOf()`，
但它**只被物理 kind 调用**（[207](../../../src/skills/tier2/effect-apply.ts#L207) `set-sensor`、[219](../../../src/skills/tier2/effect-apply.ts#L219) `set-visible`、
[245](../../../src/skills/tier2/effect-apply.ts#L245) `destroy`、[287](../../../src/skills/tier2/effect-apply.ts#L287) `reset-timer`）；
三个**逻辑 kind**（[125](../../../src/skills/tier2/effect-apply.ts#L125) `set-flag`、[153](../../../src/skills/tier2/effect-apply.ts#L153) `modify-resource`、
[198](../../../src/skills/tier2/effect-apply.ts#L198) `set-state`）走的是全局 `lookup.xxx(targetId)`，**`targetEntity` 被静默忽略**。

三重佐证这不是孤例：
1. `REQ-F-041` 的注释自己写明 `@signal-source` 是「**点谁卖谁/点谁选谁**的指针标配寻址」——需求本来就是为指针写的，三个 kind 没实现。
2. `set-flag-tagged` 的注释自陈 `set-flag` 的全局单点 lookup「表达不了『一整片区域各自的 Flag 逐个置位』」——**引擎里那个批量件，就是为绕开这个洞造的**。
3. `docs/playbooks/events-logic.md` ③′ 记的「全局 id 路由 vs 按侧寻址」陷阱，为这条出过**五次事故**。

**回归面（应尽调查）**：全仓 grep `@signal-source` —— 现有用法**无一例外都是 `destroy`**（game-f 卖席 `blueprint.ts:738`、game102 消费槽位 `blueprint.ts:229`）。
**没有任何现存数据用「逻辑 kind + targetEntity」**，故 A 路零回归是**构造性的**，不是估计。

### 7.2 两条路（协议第②步·留档）

| | **A 路 · 补引擎** | **B 路 · 游戏侧重组** |
|---|---|---|
| 做什么 | 让 `set-flag`/`modify-resource`/`set-state` 在 `targetEntity` 在场时按 `targetsOf()` 逐个施于目标实体（并沿用 `set-flag-tagged` 的「id 必须匹配」纪律） | 每格一个**唯一信号名** + 每格一套 `EventWhen`(工具门)→`Effect`(写本格) 链（即 game102 `deploy_${i}` 的扩写） |
| 改动量 | `effect-apply.ts` 三个 case 各加一支，**约 15 行** + 一处回归测试 | **零引擎改动**；数据量 36 格 × ~10 实体 ≈ **370 个实体**（6×6），且随农场面积 **O(N)×9** 增长 |
| 数据形态 | 36 格共用 4 个动作（每工具一个 Effect）→ **≈44 个实体** | 每格自带 4 条工具链 → **≈370 个实体**（差 ~45 倍） |
| 能力性质 | **补齐 `REQ-F-041` 未完成的三个 kind**（非新增能力） | 用 `set-flag-tagged`/`EventWhen` 现成件硬拼 |
| 影响面 | 全引擎逻辑链。**零回归有构造性证明**（7.1 末段），但仍须：独立复查人复跑 + owner 签 | 仅 game109 数据。不碰引擎，**无需裁决即可开工** |
| 债务 | 记债：`REQ-F-041` 补完回执 + 一处回归测试 | 记债：每格手写 4 条工具链，农场一大就爆；且「点格子」这个玩家的**最高频动作**被写成了 O(N) 数据 |
| 谁受影响 | 未来所有「点某物→改某物自身状态」的游戏（选择、卡牌选中、建筑摆放…） | 只有 game109 |

### 7.3 裁决结果：**owner 2026-09-17 判 A·补引擎**

（施工前 Lead 的推荐留档：倾向 A——「不是加能力，是把一个写了一半的需求补完」；
引擎里 `set-flag-tagged` 的存在本身证明团队已经需要它；15 行换 45 倍数据差 + 一个通用洞的封堵。
同时摆明 B 的优点：不需要裁决即可开工。**Lead 只推荐，不自裁——A 由 owner 定。**）

**施工内容与证据全在 [`requests.md`](requests.md)**，此处只留结论：

- 改 `src/skills/tier2/effect-apply.ts`：三个逻辑 kind 在 `targetEntity` 在场时按 `targetsOf()` 逐个施于目标实体；缺省时原全局路径逐字不变。纪律同 `set-flag-tagged`（id 必须匹配；不匹配**不回落全局**）。
- 零回归是**构造性**的：全仓 grep 确认 `targetEntity` 今天只被物理 kind 使用，三逻辑 kind 的这个字段此前是**死数据**（详见 7.1 末段 + 工单 §3）。
- 证据：`effect-apply.test.ts` **50 通过**（含 4 条新增契约测试）、`probe.test.ts` **11 通过**（`[P1-a] 点 tile-b → tile-a.tilled=false  tile-b.tilled=true`）、**最大消费方 mc-fight 的 r3-b3 定向 15 项对活树全绿**、`tsc` **0 处新增错误**。
- 债务：`id 不符则静默不施`（孪生件同款纪律）；「逻辑链寻址失配要不要告警」另立评估，不在本请求内。

### 7.4 附：本次实证已排除的疑点（不必再查）

| 曾是疑点 | 实查结论 |
|---|---|
| 睡觉能不能让全场各长一阶 | ✅ 能。`set-flag-tagged` + `SelfRule`，P2-b 证「各长各的、恰好 +1、可连续多天」 |
| 生长会不会误长（没浇水/没播种） | ✅ 不会。P2-c 三格对照：`{ok:1, dry:0, bare:0}` |
| 体力不够会不会白送 | ✅ 不会。`craft-recipe` 的 `current - amount < min` 天然原子，P3-a：0→0、5→4 |
| 通关判据能不能数据化 | ✅ 能。`GameFlow` 条件转移，P5-a：9→playing、10→won |
| 一格能挂几个 Flag/State/Resource | ⚠️ **各只能一个**（第二次 `addComponent` 覆盖，P4）。故地块实体设计为：`Flag` 槽放「今日已浇」、`State` 槽放整条生命周期（`current` 是字符串）、`Resource` 槽放生长阶——**七件套刚好够用，但不能多挂** |
| 睡觉结算要几拍 | ⚠️ **2 拍**（先置旗在 Commit，再生长在 Resolve；Resolve 先于 Commit）。玩家无感（2 帧 ≈33ms），但 S3 写验收剧本时按 2 tick 计 |
| `InputQueue` 会不会自动清空 | ⚠️ **不会**（夹具保真度坑，非引擎缺陷）。真输入源每帧重投；S3 的宿主必须每帧重投，否则残留按下事件会**每拍重复产信号**（首轮实测：作物每拍长一阶） |
