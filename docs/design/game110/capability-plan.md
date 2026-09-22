# game110《关键时刻》· 能力总览 Capability Plan

> 模板 = `docs/design/capability-plan-template.md`。**状态：待 Lead/owner 评审（S2 人门）。**
> 形态 = DokiWorld App 卡带，但**引擎+游戏打成 bundle 的编译期游戏**（非纯数据 library 卡带），
> 故按模板 §适用范围裁定走**正式 plan**，不吃「纯数据卡带免 plan」豁免。
> **plan 未过审不写游戏层 system 代码**（CLAUDE.md 游戏能力总览铁律）。

---

## 0. 实查记录（缺口裁决协议第①步·留原文·禁凭印象）

评审请以本节为准——下面每条结论都跑过/读过源码，不是印象：

| 查了什么 | 原文位置 | 结论 |
|---|---|---|
| 牌码是否只能是扑克牌 | `src/engine/protocol/components/cardboard.ts:194` `deck: number[]`；`src/skills/tier2/card-play.ts` `decodeCard`= `{suit:floor(code/100), rank:code%100}` | **牌码是任意整数**。suit/rank 只是解码约定，`card-pile` 搬运时不校验取值域。**语义卡可用整数 id 承载**——先例原文在 `cardboard.ts:197`「商店/锦囊/**事件卡**同形」（game-f 已这么用） |
| 组合出牌有没有消费者 | `src/skills/tier2/card-pile.ts` `takeFromHand` 按下标升序取多张 → `ph.cards = taken.map(decodeCard)`；`src/skills/tier3/card-scoring.ts` `matchPerCardWhen` 谓词闭集 = `always / suit / rankIn / index / and / or` | **有**。`card-scoring` 逐张迭代有序卡集，`index` 谓词=出牌顺序、`suit` 谓词=卡的层、`rankIn`=具体哪张卡，`and/or` 可组合 → **概念图④「顺序可影响结果」可纯数据表达** |
| 效果能不能写任意状态条 | `card-scoring` 的 `PerCardRule{op,targetResource,value}`；`Effect.kind` 闭集 `logic.ts:125`，含 `modify-resource`（`op:'add'/'mul'/'set'`·`chance` 概率门·`order` 结算序） | **能**。五条场景状态条 = 五个 `Resource`，卡效果 = 纯数据规则表 |
| 数据层能不能改牌池 | `Effect.kind` 闭集（`logic.ts:125`）= set-flag / set-flag-tagged / modify-resource / set-state / set-sensor / set-visible / set-visible-tagged / destroy / destroy-tagged / reset-timer | **不能**。闭集里**没有任何 kind 能写 `CardPile.deck/hand/handSize``。局中改牌池的唯一现成途径 = `card-pile` 自己的 `returnOnSignal`+`returnCodeResource`（`cardboard.ts:213`·一拍一张·**插 deck 底部**）与 `refreshOnSignal`（全手牌回袋重抽）→ **见 GAP-110-01** |
| 牌码要不要手写乘 100 | `docs/playbooks/base-lib.md:53` → `@skills/tier2/cardboard-codec.js`: `cardCode / codeSuit / codeRank / isJoker / buildDeck` | 用现成 codec，**禁手写同形编码**（同形手写=审计红旗） |
| AI 剧情演出有没有引擎端口 | `src/services/aigp/aishe-port.ts` 文件头：AIGP 是「表现层旁路…**绝不碰 world / snapshot / hash**」；`docs/design/dokiworld/sdk-surface-2.1.0.md:15` `./dialogue` = `generateDialogue / regenerateDialogue / generateOpening / generateSuggestions / generateTagline`——「**宿主的 LLM 替你生成对话**」 | **零缺口**。AI 演出走宿主 SDK 能力，按 AishePort 同一条旁路纪律接（不进 sim）。Chat Game Host 的 profile 明确含 `dialogue`（`playbooks/dokiworld-pack.md:27`） |

## 1. 游戏一句话

把小说的关键时刻变成一局卡牌冲突：抽一手行动卡 → 组合打出 → 规则引擎结算场景状态条 → AI 演出剧情 → 改写结局。
参照物 = owner 交付的 DokiWorld 概念图《红楼梦·宝玉挨打》。

## 2. 消费的引擎能力（对照 `capability-registry` 实名）

| capability（注册名） | 用来做什么 | 状态 |
|---|---|---|
| `t2-card-pile` | 三层牌库 → 每回合抽 5 张 → 出牌/弃牌 → 补牌，全进 sim（确定性、可快照恢复） | ✅ 现有 |
| `t3-card-scoring` | **本作结算核**：对本次打出的有序卡集逐张过规则表，把效果写进状态条 Resource。顺序敏感=`index` 谓词、卡的层=`suit` 谓词、具体卡=`rankIn` | ✅ 现有 |
| `t2-effect-apply` | 卡外的规则：目标达成、连锁事件、概率分支（`chance` 种子骰）、结算顺序（`order`） | ✅ 现有 |
| `t2-event-when` | 条件→信号：机会卡解锁条件（概念图②的 ✓ 清单）、回合推进、终局判定 | ✅ 现有 |
| `t3-flow` | 回合相位机（抽牌→选牌→结算→演出→下一回合→终局），声明式 GameFlow 数据 | ✅ 现有 |
| `t2-gauge` + `t2-text-binding` | 五条场景状态条的条形与数字呈现（概念图①左栏） | ✅ 现有 |
| `t2-clickable` | 选牌/出牌/确认的交互 → 信号（配 `card-pile.playOnSignals` 信号出牌桥） | ✅ 现有 |
| `t2-group-count` | 按 Tag 计数（如「本局打出过几张社交类卡」→ 衍生条件） | ✅ 现有 |
| RandomSeed + `seededShuffle` + `cardboard-codec.buildDeck` | 洗牌与一切随机（**游戏层禁裸 `Math.random`**） | ✅ 现有 |
| `t3-dialogue`（备选） | 若 Encounter 前后要挂叙事节点/选项，用对话图而非手写屏 | ✅ 现有（首版可不挂） |

## 3. 摆成数据的规则面

| 数据表 | 内容 | 谁解释它 |
|---|---|---|
| `ACTION_CARDS` 行动卡目录 | 每张卡：`code`（cardboard-codec 编）· 层（通用/情境/机会）· 标签（情绪·干扰 / 社交·辩护 / 物品·证据）· 文案 · 效果 | `t3-card-scoring` 的 `PerCardRule`（**不在游戏层写结算循环**） |
| `SCENE_STATE` 场景状态条表 | 五条状态条的 id / 初值 / min / max | `Resource` + `t2-gauge` |
| `OPPORTUNITY_UNLOCKS` 机会卡出现条件 | 概念图②的 ✓ 清单（认识贾母 / 知道贾母宠宝玉 / 当前冲突涉及宝玉 / 未得罪贾母） | `t2-event-when` 的 `ConditionExpr` |
| `COMBO_RULES` 组合规则 | 「哭喊 + 搬出贾母」这类组合的额外效果 | `card-scoring` 的 `and(index, rankIn)` 谓词 + `t2-effect-apply` 的 `order` |
| `OUTCOME_TABLE` 结局判定表 | 状态条阈值 → 结局分支 → 上报宿主的 outcome/score | `t2-event-when` + `t3-flow` |
| `NARRATION_PROMPTS` 演出提示词表 | 「结算事实 → 提示词」的纯数据投影 | **sim 外**的薄接线（同 AIGP「外观→提示词」纯数据表先例），喂宿主 `./dialogue` |

> 红线自查：本表**没有一行**填的是「数据表 + 待写的游戏层解释器」。每行的解释器都已实名在册（§0 有出处）。

## 4. 申请的游戏层代码例外（逐条过审）

| 例外 | 为什么现有能力表达不了 | 预计行数 | Lead 裁决 | 偿还计划 |
|---|---|---|---|---|
| `blueprint.ts` 装配（建实体、挂组件、按场景预洗牌池） | 装配层本就是游戏侧职责（所有游戏同形），非自由逻辑 | ~250 | ⬜ 待裁 | 无（正常装配） |
| `cards-catalog.ts` 等纯数据表 | 纯数据，零逻辑 | ~400（数据） | ⬜ 待裁 | 无 |
| `ui/*.ts` LayoutNode 屏构建 | 纯数据 UI 树（闭集控件），非手写 DOM | ~350 | ⬜ 待裁 | 无 |
| DokiWorld 薄接线（`toGameResult` / SDK 生命周期 / checkpoint 编解码） | 出包线要求，且手册明令「薄接线零规则」 | ~150 | ⬜ 待裁 | 无（照 game108 先例） |
| **零**「玩法解释器」例外 | 本作不申请任何结算/抽牌/判定的自写解释器 | 0 | — | — |

> 审计五红旗（裸 `Math.random` / `innerHTML` / `createElement` / 零能力接入 / 零测试）**一条不申请豁免**。

## 4.5 美术接入

- **皮肤槽**：每张行动卡 = `PlayingCard.faceArt`（整牌面插画·已解析 URL·sim 只持资产 key）；
  牌背 `backArt`；场景立绘 `portrait`/`Image`。**主体视觉实体全部有槽**（美术管线红线）。
- **台账**：编译期游戏 → 照 `scripts/game-g-art-requirements.mjs` 样板写推导脚本（脚本名：`scripts/game110-art-requirements.mjs`）。
- **不走纯程序化**：三层卡的插画是本作卖点（概念图每张卡都有画），程序化占位只作 S3/S4 期间的回退，S6 逐行替换为真图。

## 4.6 UI 呈现 · 华丽起手

- **house 主题**：`apolloBrocade`「锦霞」（UI 手册适配栏原文含「卡牌」「宫廷」）——非缺省 SHELL、非自写皮。
- **起手包**：主菜单/结算屏 import `@ui/starters`（`buildStarterHome` / `buildStarterResult`）。
- **成熟件清单**（按本作「有什么」挑）：
  `PlayingCard.faceArt/backArt` 整牌面 · `flipped` 状态驱动翻面（机会卡揭晓）· `layout.allowOverlap` 扇形手牌 ·
  `ProgressBar`/`Gauge` 五条状态条 · `Label.format` 数值格式化 + `Label.stroke` 描边 ·
  `Particles{kind:'sparkle'}` 机会卡登场 · `Panel.shadow` 卡面浮空投影 · `sheen-hover` 主 CTA ·
  `Label.font:'cnbrush'`（中文毛笔行楷·国风标题）· `dialog`/`portrait` 演出文本框。
- 选型归 S4（信息层级），观感精修归 S5（两层 1:1 律）。交付看 `ui-audit` 的「[华丽度] N 处命中」行。

## 4.65 对手 / 敌人 AI 设定

- **本作没有决策型对手 AI**：贾政/王夫人等是**场景反应**，由规则表（`event-when` + `effect-apply`）确定性驱动，
  不是会挑策略的 AI 座位。故 `docs/playbooks/opponent-ai.md` 的定手窗/心态机不适用。
- **但「AI」在本作另有所指**：剧情文本生成（宿主 LLM），属表现层旁路，见 §5。
- ⚠ 若评审认为场景人物应当「有脾气会还手」（owner「做完以后敌人没有 AI 算什么」的同类要求），
  请在 S2 评审时点明——那会新增一个 `t3-caster` / `behavior-tree` 的消费面，本 plan 需回炉补章。

## 4.7 代码准入阶梯申报

| 规则 | 落级 | 说明 |
|---|---|---|
| 场景状态条与初值 | **L0** 纯数据 | Resource 组件数据 |
| 行动卡目录（文案/标签/层） | **L0** 纯数据 | 卡表 |
| 单卡效果（状态条增减） | **L1** 数据 + 现有 capability | `card-scoring` 的 `PerCardRule` |
| 组合/顺序效果 | **L1** 数据 + 现有 capability | `PerCardWhen` 的 `and(index, rankIn)` |
| 机会卡解锁条件 | **L1** 数据 + 现有 capability | `event-when` 的 `ConditionExpr` |
| 回合相位与终局 | **L1** 数据 + 现有 capability | `t3-flow` + `event-when` |
| 洗牌/概率 | **L1** 数据 + 现有 capability | RandomSeed + `seededShuffle` + `Effect.chance` |
| **局中解锁新卡进牌池** | **L2 capgap 待裁** | **GAP-110-01**（台账 `capability-gaps.json`·下方 §4.8 摆 A/B） |
| AI 剧情演出 | **L1**（sim 外旁路） | 宿主 SDK `./dialogue` + 纯数据提示词表；拿不到则降级模板文案 |

> L4（自由代码 / 手写 UI / 自建解释器）**零申报**。

## 4.8 GAP-110-01 ·「局中牌池可变性」缺口裁决（⚖ 三步协议·Lead 给推荐不下裁决·**owner 判 A/B**）

**① 先查（原文见 §0 第 4 行）**：`Effect.kind` 闭集十种，**无一能写 `CardPile.deck/hand/handSize`**。
局中改牌池的现成途径只有 `card-pile` 自带的 `returnOnSignal`+`returnCodeResource`（一拍一张、**插袋底**）
与 `refreshOnSignal`（全手牌回袋重抽）。**重组不成的点**：概念图②「剧情机会卡在条件满足时出现」
与⑥「解读新卡」要的是「**当下这局、这只手**里多出一张卡」，而现有算子只能让它**落到牌库底部**排队等抽。

**② 两条路**

| | **A · 补引擎缺口** | **B · 用现有算子做语义降格（零引擎改动）** |
|---|---|---|
| 做法 | 给 `card-pile` 加一条纯数据算子，如 `injectOnSignals:[{signal, code, to:'hand'\|'deckTop'\|'deckBottom'}]` | 机会卡走现成 `returnOnSignal`+`returnCodeResource`：条件满足 → `event-when` 发信号 → `effect-apply` 把卡码 `set` 进码资源 → 卡插入**袋底**；配 `refreshOnSignal` 在回合起手重抽 |
| 代价 | 碰**新增写面 + 定序**（`card-pile` 已在 cp→ew→clickable 三元环里，见 `card-pile.ts` runsBefore 注释）→ 按施工与复查第 1 条属 **🔴 只归主程**；要进引擎 10 硬槽 | 每张机会卡一条 Effect 链（数据膨胀）；**玩法手感打折**：机会卡当局可能抽不到，概念图「往往能扭转局势」的戏剧性变弱 |
| 影响面 | 引擎面（跨游戏共享）· 需回填 `cards.md` 手册 | 只在 game110 数据层 |
| 通用性 | **高**：任何「局中获得卡」的卡牌游戏都要（deck-builder / 爬塔 / TCG 全族） | 无（本作一次性写法） |
| 选错要付什么 | 若只此一家要用 = 为一款游戏加宽引擎（YAGNI·CLAUDE.md 明令警惕） | 若后续 101/102/A/B/C 里再出现同款需求 = 同一条降格链抄第二遍，攒成技术债才回头下沉 |

**③ Lead 推荐（不下裁决）**：**先 B 后 A**。理由：本缺口**不锁 S3/S4 的最小闭环**（单场 Encounter 不解锁新卡也能从
开局打到结局再重开），按 rule-of-three 该等第二个消费方出现再下沉；若 owner 判 A，按 🔴 归属应由主程施工、
本 session 只提单不动手。**故台账标 `priority:"P2"`（不锁关）、`state:"open"`（待 owner 判）。**

## 5. 确定性声明

- **随机源**：世界 `RandomSeed`（mulberry32 种子 PRNG）；洗牌 `seededShuffle`；概率分支 `Effect.chance`。
  **游戏层零裸 `Math.random`**（审计硬红线）。
- **回放 / 快照**：需要——DokiWorld §6 checkpoint 挂起恢复走 `world.snapshot()/restore()`（先例 game108，
  含 deflate-raw+base64 传输编码，因宿主 payload 三上限 64KB/2000 节点/深 12）。
- **非确定性风险点清单**：
  1. **AI 剧情演出**（宿主 LLM 返回文本）——**不进 world、不进 snapshot、不进 hash**，只喂表现层。
     纪律出处 = `aishe-port.ts` 文件头「绝不碰 world / snapshot / hash」。违反此条即破坏回放与挂起恢复。
  2. 宿主注入的场景数据（角色卡/persona）——在**开局装配期**一次性投影进蓝图，局中不再读，避免中途变量。
  3. 无浮点超越函数、无遍历序依赖（所用能力均已声明确定性，见各自 describe）。
- **lockstep**：不需要（单人）。

## 6. 评审记录

- 提交人 / 日期：PE-110 session（兼 GD 起草）/ 2026-09-12
- Lead 裁决：⬜ 待裁（✅ 通过 / 🔶 有条件通过 / ❌ 驳回）
- **owner 需单独判的一项**：§4.8 的 GAP-110-01 选 A 还是 B。
- 评审通过后方可动 S3 骨架（`blueprint.ts`）——在此之前本 session 不写任何游戏层代码。
