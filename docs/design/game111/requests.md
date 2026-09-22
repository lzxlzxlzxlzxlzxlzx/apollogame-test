# game111 · 需求单（游戏级·不占引擎槽）

> **为什么放这里而不是 `docs/workflow/requests.md`**：
> ① **实测**引擎池字符预算已满——`context-budget` 报 **24783/25000 字符**（槽位 4/10 尚有余，卡的是字符），加三条即红灯拦推送。
> ② **本仓先例**（`requests.md` 内 REQ-DIALOGUE 2026-08-16 出池原话）：「**下一步触发者不在池内**」的需求不占槽。本三件的下一步触发者 = **Lead 批 `capability-plan.md` §6**，尚未发生，现在占引擎槽属抢跑。
>
> **晋升规则**：`capability-plan.md` 过审、且有主程真接单时，把对应条目**原文搬进** `docs/workflow/requests.md` 并抢锁（改「施工主体」为自己并推一次）。搬之前先清池腾字符。
>
> **编号唯一**：开单前 `grep` 同名防重号（2026-08-08 game108 GD-01 重号复盘）。

---

## REQ-111-ENG-01 · LLM NPC 决策端口 `NpcAgentPort`

- **owner 裁决**：2026-09-12 判 **A（下沉引擎）**（`framework.md` §6 缺口②）
- **归属**：🔴 主程面 · **指派：Opus** · **施工主体 = 主程（2026-09-12 抢锁·已交）** · status: **✅ done（2026-09-12·门禁全绿·已推送）· 等独立复查** · P1 · **已晋升引擎池 = `REQ-111-AINPC`**
- **捆绑**：与 `REQ-111-ENG-02` 同批做。**只做端口不做 barrier = 最坏组合**（有了调模型的能力，却没有把结果确定性落地的能力，不确定性直漏 sim）。

**想实现的行为**
照 `EnginePort` / `AishePort` 风格定一个窄契约：

```
interface NpcAgentPort {
  decide(ctx: AgentContext): Promise<Intent[]>;
}
```

配两个实现：
- `NullNpcAgentPort` —— **确定性桩**。固定规则产意图（如按需求最低项选动词），无网可跑。**这是全库测试基建**：没有它，任何 AI 游戏的测试都进不了 CI。
- `HttpNpcAgentPort` —— 真后端。

**已经试了什么（实查留痕）**
- `grep -rilE "llm|openai|anthropic|prompt" src/ --include=*.ts` → 命中全部为无关词（UI 文案 + AIGP 提示词）。registry 无任何 LLM 端口。
- `src/services/aigp/aishe-port.ts` 是唯一外部 AI 先例，但文件头原文：「**绝不碰 world / snapshot / hash**（异步旁路，与资产、音频同纪律）」。而 NPC 决策**必须**写世界 → **不能照抄**，只能照其**端口哲学**另立一件。

**卡在哪**
缺「外部 AI 服务 → 确定性 sim」的入口契约。

**边界（复查门核对用）**
- 新增 `src/services/npc-agent/**`；registry 登记；同提交回填 `docs/playbooks/opponent-ai.md` 一行（手册与 registry 同步是下沉工作的一部分）。
- **端口不写世界**——只产 `Intent[]`，落地归 `REQ-111-ENG-02`。
- **不碰 sim / snapshot / hash**。

**图纸**：`framework.md` §1.2 · §6② · `capability-plan.md` §2.3

**✅ 已交（2026-09-12·主程 session）**
- 契约落 `src/engine/protocol/agent.ts`（`Intent` / `IntentVerbSpec` / `AgentContext` / `AgentMemoryView` / `NpcAgentPort`）。
  **为什么不落在端口文件里**：生产者在 services（sim 外·异步·可失败），消费者在 skills（sim 内·确定性），
  形状归任一侧另一侧就得跨层依赖（`.dependency-cruiser` 的 `skills-no-presentation` 只放过 type-only）；归 protocol 两边都只依赖最底层。
  这同时满足 Lead 批 capability-plan §4 第二条例外时写死的条件「AgentContext 的形状归引擎，游戏层只负责填」。
- 实现落 `src/services/npc-agent/`：`NullNpcAgentPort`（规则表驱动·同入参恒同出参·无网无墙钟）+ `HttpNpcAgentPort`（失败恒落 `[]`+`lastError`·**绝不抛**）。
- **端口刻意不判闭集**：动词是否在表内归 barrier。端口先过滤掉的那些就永远不留 `reject` 痕迹 —— 正是「什么都没发生」最难查的形状。
- **回包里的 `npcId` 一律不采信**（用本地的）：否则后端一句 `npcId:"<别人>"` 就能代别的 NPC 下指令。
- 测试 `src/services/npc-agent/npc-agent.test.ts`（18 条）。撤修验红：采信回包 npcId → ④ 转红；`lowestNeed` 去掉 key 升序 → ② 转红。

---

## REQ-111-ENG-02 · 异步意图收齐门 `intent-barrier`

- **owner 裁决**：2026-09-12 判 **A（下沉引擎）**（`framework.md` §6 缺口③）
- **归属**：🔴 **主程面**（碰定序/相位 · 确定性与快照 hash · lockstep · 新增 system）· **指派：Opus** · **施工主体 = 主程（2026-09-12 抢锁·已交）** · status: **✅ done（2026-09-12·门禁全绿·已推送）· 等独立复查** · P1 · **已晋升引擎池 = `REQ-111-AINPC`**

**想实现的行为**
1. 本回合登记 N 个待决 NPC。
2. 异步回包收齐后，**按 npcId 排序**一次性注入 `applyCommands`。
3. 超时 / 失败 → 按**回合数**判据（**禁墙钟**）确定性降级，补默认意图（如 `rest()`）。

**已经试了什么（实查留痕）**
- `src/skills/tier3/flow.ts` 管相位跳转，**不等异步回包**。
- `src/net/lockstep.ts` 有「收齐再步进」的 barrier 形状，但它等的是**同步到达的对端命令**，不是 Promise。
- `src/net/commands.ts` 已钉死「应用前一律按 playerId 排序——顺序只由内容决定，与网络到达次序无关」，但**未覆盖「回包迟到 / 失败」**。
- 三者之间缺这一格。

**卡在哪**
这是整条链上**唯一会污染确定性的地方**。按到达序应用 → 每次跑出的世界都不同 → 存档 / 录放 / lockstep 全废。症状是「偶发 desync / 存档读出来不一样」，属本仓最难查的 bug 形状。

**红线（施工必读）**
- 判据用整数回合数，零浮点、零墙钟（`debug-trace` 红线②同源：回放要对得上）。
- **定序**：新增相位链 `INTENT → COMMIT → SETTLE` 有闭环风险，而 `topological-sort` 在 CYCLEHAZ B 后**只告警不抛**，落序不合语义仍照跑 → 接缝静默失效（ENG-03 实证：引入的 Commit 相位环，**定序用例全绿**、第一轮复查仍漏）。
  → **必须读 stderr 告警**，并加一条「断言 `topological-sort` warn 数为零」的定序测试。**绿灯不等于没话说。**
- 任何新增的意图缓存/调试组件**必须登记 `NON_DETERMINISTIC`**（`determinism.ts` 原文：「名单靠手维护，拼错一个名字即静默失效——多算→误报 desync，少算→假绿」）。

**边界**：`src/net/**` 或 `src/skills/tier2/**` + `determinism.ts` 名单核对 + 定序测试。

**图纸**：`framework.md` §6③ · `capability-plan.md` §5.2

**✅ 已交（2026-09-12·主程 session）**`src/skills/tier2/intent-barrier.ts` = `t2-intent-barrier`（registry 已登记）。
- 组件两个：`IntentBarrier`（**进 hash**·pending 登记即排序 + 整数回合判据 + 动词闭集 + 产物 `resolved`/`filled`）、
  `IntentInbox`（**不进 hash**·已登记 `NON_DETERMINISTIC`，装「谁先回包」这种纯本地事实）。
- 超期判据两条路都是整数自增、零墙钟：回合时钟的主人用 `setBarrierTurn` 推回合号；没人推则退化成本门拍计数。
- **定序踩到了单子里预警的那个坑，且是实撞不是推演·我还判错过一次，记下全过程**：
  首版让门自己读 `TurnOrder.round` 当回合号 → 本系统 reads TurnOrder / writes Signal，`turn-order` 反向
  → 组件推断边两头成立即闭成 **真 2-环**。`topological-sort` 对纯推断软环**只告警不抛**，按「系统 id 字典序」
  平局裁决，那次排出来**恰好是对的**（intent-barrier → turn-order），纯属字典序碰巧：改个系统名就反过来且全绿。
  · 第一版修法 = 显式 `runsBefore:['turn-order']` 压掉反向推断边。单文件定序测试因此全绿，
    但**全库 SCC 棘轮（`declaration-audit.test.ts`）照样红** —— 压住了环，没去掉成因。
  · 治本 = **去掉那条读边**：回合号改由 `setBarrierTurn` 推。2-环消失，显式边也不必要了。
  · **我当时判错的一点**：以为去掉读边就连「全库软环 blob 成员资格」也一起没了。实测并没有——
    本系统仍在 p0 那个 blob 里，入边 `runsAfter event-when`、出边 `writes Signal`，与
    turn-order / keybind / clickable **同款形状**：凡「排在事件清扫之后且发信号」必然在里面。
    那是 CYCLEHAZ 的类问题（正解是方案 C 相位化），不是本件的申报缺陷 → 按棘轮纪律**有意识更新基线并留理由**。
  测试按单子要求断言「严格模式不抛 + `console.warn` 一次不响 + 系统不读 TurnOrder + 不靠显式边压环」。
- **lockstep 多补一条单子里没写的**：非权威端 `authority:false` 永不自结算，只接 `applySettled`。
  少了这条，权威端收到真意图、对端全部超期补默认 → 第一回合就分叉，而两端各自全绿。
- 测试 `src/skills/tier2/intent-barrier.test.ts`（26 条·含六种投递次序全排列同 hash）。撤修验红四刀：
  产出改按到达序 → ② 承重点红；撤 `authority` 判断 → ⑥ 红；`IntentInbox` 漏登记名单 → ⑤ 红；
  `barrierNow` 无视 `currentTurn` → ③ 回合时钟那条红；SCC 基线里删掉 intent-barrier → 棘轮红（证它真咬）。
  （首版那刀「撤 `runsBefore` → ⑦ 三条红」随读边一起作废，留档说明为何不再需要那条边。）

---

## REQ-111-ENG-03 · 记忆能力 `t2-memory`

- **owner 裁决**：2026-09-12 判 **A（下沉引擎）**（`framework.md` §6 缺口①）
- **归属**：🔴 主程面（进 hash · 影响快照体积与存档）· **指派：Opus** · **施工主体 = 主程（2026-09-12 抢锁·已交）** · status: **✅ done（2026-09-12·门禁全绿·已推送）· 等独立复查** · P1 · **已晋升引擎池 = `REQ-111-MEMORY`**

**想实现的行为**
- 记忆条目 = 数据：主体 / 客体 / 时刻（回合号）/ 强度 / 标签 / **来源**。
- 逐回合强度衰减（可复用 `t2-over-time` 的形状与确定性口径）。
- **确定性 top-K 检索**：标签命中 + 强度 + 时近打分排序。**整数权重，禁浮点排序**——浮点跨端 JIT/FMA 可能 1 ULP 漂移，纳入排序即误报 desync（`determinism.ts` 对 Camera 的同款理由）。
- `share`：把一条记忆复制给另一 NPC 并**打折强度**。这是涌现叙事「链式影响」的唯一载体。

**已经试了什么（实查留痕）**
- registry 实查：**无任何记忆能力**（无编码/遗忘/联想/检索，无跨实体流转）。
- `src/skills/tier1/event-log.ts` 只是**平铺事件流水**——无衰减、无检索、无归属，且**未注册为 capability**。
- `f1-resource` + `x3-string-variable` 硬凑 = 在游戏层写一个检索解释器 = 宪法明禁的「数据表 + 游戏层自写解释器」虚胖数据（game-g 天罡/地煞教训）。

**卡在哪**
「谁在何时对谁做了什么，且这件事会淡忘、会被传开」——现有能力零表达。

**通用性证据（owner 判 A 的依据）**
`docs/design/game101/`（海港绯闻）以「绯闻传播」为名，与本原语同构。判 B 则 101 / 108 / 111 各写一套，正是 `modifier-stack` 下沉前「库里出现三次却各写一套」的原样。

**边界**
- `src/skills/tier2/memory.ts` + registry 登记 + 同提交回填 `docs/playbooks/opponent-ai.md`（该手册现有「记忆=资源台账」一行需同步更新）。
- 注意快照体积与**存档兼容**（进 hash 的新组件会改变旧档指纹语义，需给迁移口径）。

**图纸**：`framework.md` §6① · `capability-plan.md` §2.3

**✅ 已交（2026-09-12·主程 session）**`src/skills/tier2/memory.ts` = `t2-memory`（registry 已登记）。
- `Memory{entries,rulesId?}` + `MemoryRules{decay:[{tag,amount}],defaultDecay,forgetBelow,max,shareDiscount,decaySignal|period}`。
  衰减触发二选一：具名信号（回合制一回合恰好一次）或拍周期（照 `t2-over-time` 的形状）；多标签命中取**最快**那个速率。
- 检索 `recall`/`recallFrom`：`命中×100 + 强度×1 + max(0,窗口-距今)×2`，**全整数**；同分按条目 id 升序兜底。
- `shareMemory`：副本 id `<原>><收方>`、强度 `floor(原×折扣/1000)`、`source` 记 `share:<转述方>`（链式影响的可观测落点）；
  再转述同 id 走刷新路径不增殖；折后为 0 / 原条目不存在 → 不写并记 `reject`。
- **存档口径（单子点名要的）**：两个组件都是新增，旧档里不存在 → 缺席即不进 canonical，**旧档 hash 语义原样不变**。
  已有档要加记忆就挂空 `Memory{entries:[]}`，但空 entries 本身也改 hash，故属**新世代存档**，不做旧档原地迁移。
- **多做了一条**：`entries` 恒按 id 升序存。数组序会进 canonical = 进 hash，按插入序存就等于把「谁先被记」焊进世界指纹，
  而那是个本地事实（哪个 NPC 先回包）。排序存之后「记忆集合相同 ⇒ hash 相同」。
- 测试 `src/skills/tier2/memory.test.ts`（21 条）。撤修验红三刀：撤排序存 → ⑤「插入序不改 hash」红；
  撤检索同分兜底 → ③ 红；撤整数归一 → ① 两条红。

---

## REQ-111-ENG-04 · `ComponentDataMap` 漏登（游戏蓝图写不出这些组件名）

- **提出**：game111 PE 2026-09-14（撞到 `MemoryRules` / `TurnOrder` 挂不进蓝图，只能在宿主层手挂）
- **归属**：🔴 主程面（跨游戏共享面）· **施工主体 = 主程（2026-09-14 接单）** · status: **✅ done（门禁全绿·已推送）· 等独立复查** · P1
- **PE 做对的一件事**：没有自己动手改共享面，按域红线报上来。这条正是「别的 session 勿擅改」要的行为。

**实查结论：报的是 5 个，实际是 28 个。**

PE 报 `TurnOrder` / `Memory` / `MemoryRules` / `IntentBarrier` / `IntentInbox` 五型。对着
`component-universe.gen.ts`（从源码生成的组件全集·166）与 `ComponentDataMap`（手维护闭集·当时 138）
逐一对差，漏登 **28** 个：

```
Armor BlockGrid BlockTrayPiece Bounce ConveyorQueue Cooldowns DamageTable DebugTrace
FlowAgent FlowField Group IntentBarrier IntentInbox Inventory LineWins Memory MemoryRules
Orbit Owner PathFollow PhysicsWorld3D PlaceBlockIntent PullAnchor QueueMember QueueSlots
SlotMachine TurnOrder Vfx2D
```

里面有 2026-09-09 那批「预建高频件」（cooldown / damage-table / inventory / conveyor-queue），
也有 flow-field、block-grid、slot-payout 这些更早的。**这不是本次下沉的疏忽，是一条积了很久的系统性漂移。**
症状之所以没人发现：能力照常注册、照常跑、门禁全绿，唯一的后果是游戏层在蓝图里**写不出那个组件名**
（闭集牙在编译期咬掉），只能退回宿主层手挂——正是数据驱动宣言最不该出现的形状，也正是 PE 撞到的那个。

**PE 的第二个建议成立，而且它才是本单的根因半边。**

「registry 登了、component-map 没登，没有任何门会挡」——实查确认：`registry-guard` 只对「能力 id ↔ loader」，
`build-component-map.test.mjs` 只对「生成物 vs 现算」，**两张组件表之间此前零对账**。补两道，各咬各的：

1. **编译期**（`component-map.ts` 末尾）：`Exclude<RuntimeComponentName, keyof ComponentDataMap>` 必须为 `never`，
   反向同理。漏登那一刻 `tsc` 就报错并**点名**（撤修实测：删掉 `TurnOrder` 一行 →
   `Type '"TurnOrder"' does not satisfy the constraint 'never'`）。scoped-gate 任何一档都跑 tsc，天然接在推送路径上。
2. **跑时**（`src/assembly/component-map.test.ts`·7 条）：给出可读差集清单，并且是可撤修验红的那一半——
   只有类型断言的话，撤掉它 tsc 红但没有任何测试红；只有测试的话，撤掉测试就全无。

---

## 定序问询答复 · 七相位要不要用 `t3-flow` 摊开

**PE 报的理由复现不出来。** 报的是「INTENT 相位要等异步回包，并进 flow 会和 barrier 互为前驱成环，
而 `topological-sort` 只告警不抛」。真跑一遍（flow + barrier + event-when + turn-order + memory +
effect-apply + zone-occupancy）：

```
落序: zone-occupancy → flow → event-when → intent-barrier → turn-order → memory-decay → effect-apply
warn 数: 0      严格模式(softCycle:'throw'): 不抛
```

原因很直白：**两者共享零个组件**。flow 碰 `GameFlow/Resource/Flag/State/Cooldowns/Timer/StringVar`，
门碰 `IntentBarrier/IntentInbox/Signal`，任一方向都推不出边。所以「成环」不构成不摊开七相位的理由。
（PE 提到「主程为同一件事已经改过一版」——那一版改的是**门自己去读 `TurnOrder`** 引起的 2-环，
与 flow 无关；治法是把回合号交给 `setBarrierTurn` 推，读边一去环就没了。）

**真正的约束是另一件事，PE 没说到但确实存在**：flow **读不到 `IntentBarrier.state`**（不在它的 reads 里，
条件树也没有对应 kind）⇒ 不能直接拿「门结算了」当转移条件。桥是现成的纯数据，零新代码：

```
门 settleSignal:"intentsReady"
  → Effect{ onSignal:"intentsReady", kind:"set-flag", targetId:"intentsReady", value:true }   （effect-apply·Commit 相位·同拍）
  → GameFlow 的 INTENT 态 transitions:[{ when:{kind:"flag", id:"intentsReady"}, to:"COMMIT" }]  （下一拍读到）
```

**⚠ 一个会咬人的细节，务必照办**：`IntentBarrier.resolved` **只活一拍**（同 Signal 口径，防同一批意图被应用两次）。
等 flow 把相位转到 COMMIT 的时候，`resolved` 已经被收走了。所以——

> **意图的消费挂在结算信号上（同拍 Commit 相位），不要等相位转移过去再读。**
> flow 的相位推进只承担「摊开 + 上屏 + 记账」，不承担「取意图」。

**结论：七相位照 plan 摊开，不必偏差。** 以上三条（不成环 · 落序语义 · 桥 + 一拍陷阱）已全部钉成测试，
不是口头结论：`src/skills/tier2/intent-barrier.test.ts` ⑧ 组（撤掉 settleSignal → 红；让 resolved 活两拍 → 红）。

**另两处偏差**：`impl-notes.md` 还没推上来（仓库里查无此文件），等它到了再逐条看。PE 不自裁、先记账再问，做法对。

---

## 已结案

三件全部 **✅ 已交并推送**（2026-09-12·主程 session·门禁全绿）。各单原位保留「✅ 已交」段做交接依据，
待**独立复查**（复查人 ≠ 施工人·红线）过后再删条目，全文留 git 历史。

**下一步不在本三件**：引擎侧已齐，接下来是 game111 游戏层——写 `gdd.md`「NPC AI」章 → 摆 L0 数据表
（`INTENT_VERBS` / `MEMORY_TAGS` / `NPC_CARDS` / `TURN_PHASES`）→ 按 §2.3 的三条硬口径接线。
**别再在游戏层重造这三件**：记忆用 `t2-memory`、决策端口用 `services/npc-agent`、异步对齐用 `t2-intent-barrier`。

---

## REQ-111-ENG-04 · `ComponentDataMap` 未登记五个新组件（blueprint 声明不了）

- **发现**：2026-09-14 game111 框架层施工实撞
- **归属**：🔴 **主程**（`src/assembly/component-map.ts` = 跨游戏共享面）· status: open · P2
- **本层不自行改动**：CLAUDE.md 施工归属第 1 条，跨游戏共享面只归主程；拿不准按 🔴 走。

**现象**

把 `Memory` / `MemoryRules` / `IntentBarrier` / `IntentInbox` / `TurnOrder` 写进 `WorldBlueprint.entities`
的任一实体，TS 当场拒：

```
error TS2353: Object literal may only specify known properties,
and 'Memory' does not exist in type 'EntityBlueprint'.
```

**根因**

`src/assembly/demo.assembly.ts:18`：

```ts
export type EntityBlueprint = { [K in keyof ComponentDataMap]?: Record<string, unknown> };
```

而 `src/assembly/component-map.ts` 的 `ComponentDataMap` 里没有这五型。`t2-turn-order`（2026-09-09）
与 LLM 三件套（2026-09-13）都只登了 `capability-registry.gen.ts`，**没登 blueprint 的组件映射**。
两处登记不同步，registry 绿而 blueprint 用不了。

**影响**

任何游戏都无法在蓝图里声明这五个组件。对 `IntentBarrier`/`Memory` 影响小（`openBarrier`/`remember`
本就是引擎给的运行时路径），但 `MemoryRules` / `TurnOrder` 是**纯配置组件**——它们本该和 `OverTime`、
`EventWhen` 一样躺在蓝图数据里，现在只能在宿主层 `addComponent`，等于把一份配置从数据面挪进了代码面。

**建议**（主程裁）

补 `ComponentDataMap` 五行 + 相应 import。顺带查一下**下沉流程是否缺一道门**：能力下沉时
registry 与 component-map 应当同步登记，现在缺同步守卫，所以这类漏登不会被任何门挡住
（同「手册与 registry 同步是下沉工作的一部分」的既有纪律）。

**当前绕法**：`games/game111/blueprint.ts` 的 `setupTown()`，零自造语义，缺口补上后可搬回蓝图。

**证据**：`docs/design/game111/impl-notes.md` §3。

---

## REQ-111-UI-01 · `Connector.label` 在深色主题下读不清（报 PUI）

- **发现**：2026-09-14 game111 看板 `/check-ui` 实测
- **归属**：PUI（`src/ui/components` 域）· status: open · P3（有零损失绕法，不阻塞）

**现象**：`Connector` 的线中点标 `label` 在 `apolloOnyx` 深底上，`tools/ui-audit.mjs` 判

```
✕ <text>  "同在中央广场"  ratio=1.21   （tone: 'jade'）
✕ <text>  "同在中央广场"  ratio=1.05   （tone: 'gold'，换亮色也没救）
```

**分析**：渲染侧 `render.ts:1276` 写的是
`<text fill="${col}" style="paint-order:stroke;stroke:${t.bg0};stroke-width:3px">`——
靠 `paint-order` 描边保可读，真浏览器里大概率是看得清的。但 `ui-audit` 的 `solidBgUp(el)`
**量不到 SVG 的实底**，于是把描边的效果算丢了。所以这更像**审计器的盲区**而非渲染缺陷，
但两者必须有一个动：要么审计认 `paint-order` 描边，要么控件换一种保可读的做法（如给标一个不透明小胶囊底）。

**当前绕法**：game111 不给 `label`（该信息由每张 NPC 卡的分区 `Tag` 重复承载，去掉零损失），
并在 `ui.test.ts` 钉了断言防人加回来。

---

## REQ-111-UI-02 · `ui-audit` 的「house 主题」判据对 `apolloOnyx`/`apolloBrocade` 永远为否（报 PUI）

- **发现**：同上 · status: open · P3（非阻断警告）

**现象**：看板显式传了 house 主题 `apolloOnyx`，审计仍报 `house 主题：否`：

```
[华丽度] 7 处华丽件命中（shape:1 fx:1 glass:2 juice:3）· house 主题：否
```

**根因**：`tools/ui-audit.mjs:171`

```js
const houseTheme = !!host.querySelector('[data-apollo-skin]') || flair.skin > 0;
```

判据是「有没有按钮贴图皮 / border-image」。而 `src/ui/components/apollo-kit.ts` 里
`apolloOnyx` 与 `apolloBrocade` **都没有 `buttonSkins`**（只有 `apolloToon`/`STARTER_THEME` 有糖果厚唇钮皮）。
于是手册钦定的三款 house 皮里，**有两款永远点不亮这个信号**，用它们的游戏会被恒定警告「疑似朴素默认屏」。

**建议**（PUI 裁）：二选一——① 判据改为认主题级信号（如 `UITheme.texture`/`panelTexture` 在场）；
② 给 `apolloOnyx`/`apolloBrocade` 补 `buttonSkins`（那样三款 house 皮才名副其实等价）。


---

## REQ-111-UI-03 · `portrait` / `Avatar` 的首字占位在暗皮上读不清（报 PUI）

- **发现**：2026-09-14 game111 对话屏 `/check-ui` 实测 · status: open · P3（有程序化绕法）

**现象**：`portrait` 缺 `art`、`Avatar` 缺 `src` 时都会回落成「名字首字」。在 house 暗皮 `apolloOnyx` 上：

```
✕ <div>  "娜"  ratio=2.46   （portrait 占位·硬失败）
!  <span> "娜"  ratio=3.51   （Avatar 占位·AA 未达）
```

**根因**：`src/ui/components/render.ts:1254`

```js
`<div style="…background:linear-gradient(160deg,${t.bg2},${t.bg0});color:${t.dim};…">`
```

首字色**烤死成 `t.dim`**，底是 `bg2→bg0`。暗皮里这三个令牌本来就挨得近，比值必然低，
而且**数据侧无法干预**（没有任何 prop 能改这个回落色）。亮皮（apolloBrocade/apolloToon）大概率不显。

**建议**（PUI 裁）：回落色别用 `t.dim`——用 `t.text` 或按底色明度二选一；底也可加深以拉开差。
这条影响所有「还没有真立绘」的游戏，而那正是每个新游戏的起手状态。

**当前绕法**：`games/game111/portrait-art.ts` 程序化矢量占位（深底 + 亮色肩颈剪影 + 首字），
满足 art-pipeline「占位最低标准=成形矢量图」，真美术到位即让位。
