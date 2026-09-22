# game111 · 能力总览 Capability Plan

> **模板**：`docs/design/capability-plan-template.md`（代码游戏·必须过审才动工）
> **前置**：`framework.md` §6 四项缺口已由 **owner 2026-09-12 裁决**：①②③ = **A（下沉引擎）**、④ = **B（不做）**。本 plan 按该裁决编写。
> **状态**：✅ **Lead 有条件通过**（2026-09-12·条件写死在 §6）。游戏层 system 代码按条件开工。
> **实查口径**：§2 的每个能力名均已对 `src/assembly/capability-registry.gen.ts` **逐条 grep 核对存在**（2026-09-12）。未注册的共享模块单列，不冒充 capability。

---

## 1. 游戏一句话

**一个回合推进的小镇活世界：NPC 由 LLM 驱动自主生活，玩家只靠闲聊就能改变他们的动机，改变沿关系网链式扩散。**

参照物：《星布谷地 / 小都会》的涌现叙事层；机制骨架 ≈ *Dwarf Fortress 传闻传播* × *Stardew Valley 关系养成*，决策层换成 LLM。

**架构基石（`framework.md` §1.2）**：**LLM 不是解释器，LLM 是输入源**。一个 LLM 驱动的 NPC 在架构上与一个远端人类玩家完全同构——走 `net/commands.ts` 同一条 `InputSource → applyCommands` 路径。世界层保持确定性；录的是意图流不是模型，重放不调模型即 bit 一致。

---

## 2. 消费的引擎能力（对 `capability-registry` 实名 · 已逐条 grep 核对）

### 2.1 已有能力（✅ 现有）

| capability（注册名） | 用来做什么 | 状态 |
|---|---|---|
| `w1-random` | **一切随机的唯一源**（游戏层禁裸 `Math.random`·硬红线） | ✅ 现有 |
| `t3-flow` | 回合相位机（`TURN_START→NEEDS_DECAY→PERCEIVE→INTENT→COMMIT→SETTLE→TURN_END`），声明式 `GameFlow` 数据·闭语法 | ✅ 现有 |
| `t2-turn-order` | NPC 轮转序（座位序 + 游标 + 跳过旗 + 绕回发 `roundSignal`）。**2026-09-09 新下沉**——正是「回合不是原子」那一格 | ✅ 现有 |
| `t2-over-time` | **需求衰减**（精力/心情/社交欲/好奇心 逐项 `amountPerTick`+`period`）。纯整数 tick 计数·序无关·POD 进 snapshot | ✅ 现有 |
| `f1-resource` | 需求值 · 好感度 · 帖子互动计数 · NPC 画像台账 | ✅ 现有 |
| `g2-relation` | 关系脉络（`kind`+`targetId`）：谁认识谁、谁是谁的朋友、帖子归属 | ✅ 现有 |
| `t2-modifier-stack` | 好感度修正聚合（礼物/事件/称号加成·字段表 + 混合合并策略 + 条件门控） | ✅ 现有 |
| `f2-flag` | 称号解锁位 · 事件闭环位 · 相位门旗 | ✅ 现有 |
| `j1-state` | NPC 心态 FSM（对应 `opponent-ai.md` 坑③：性格=状态机不是代码分支） | ✅ 现有 |
| `x3-string-variable` | 称号文案 · 帖子标题/正文 · NPC 当前所在分区名 | ✅ 现有 |
| `l6-text` | NPC 台词上屏 | ✅ 现有 |
| `k1-spawn` | 帖子实体 · 照片实体 · 事件实体的生成 | ✅ 现有 |
| `k2-destroy` | 过期事件回收 | ✅ 现有 |
| `t2-zone-occupancy` | 分区在场者（小都会六区：图书大楼/后山/研究团/书馆/教堂/音乐所） | ✅ 现有 |
| `w2-spatial-query` | `PERCEIVE` 相位的可感知集（同区在场者） | ✅ 现有 |
| `a1-transform` | NPC 位置 | ✅ 现有 |
| `t2-event-when` | 信号 → 相位推进（`mode:'edge'` 上升沿） | ✅ 现有 |
| `t2-effect-apply` | **意图落地的唯一出口**——意图动词映射成的 `Effect` 列表由它执行（§3 红线） | ✅ 现有 |
| `t2-self-rule` | L2 NPC 的本地自治（读自身需求 → 施自身动作），也是**断网降级路径** | ✅ 现有 |
| `t2-behavior-tree` | L3 NPC 的行为模式选择（selector/sequence/condition/action 纯数据树） | ✅ 现有 |
| `t3-dialogue` | 对话图遍历 · 游标推进 · 表驱动文本 | ✅ 现有 |
| `t3-timeline` | 定点演出 cue（L1 NPC 的固定日程 · 导演的 `schedule_event`） | ✅ 现有 |
| `t2-gauge` | 需求条 / 好感度条的数值绑定 | ✅ 现有 |
| `e1-timer` | 回合内计时辅助 | ✅ 现有 |

### 2.2 已有共享模块（**非注册 capability**·实查结论：registry 无此二 id，不得当能力申报）

| 模块 | 路径 | 用途 |
|---|---|---|
| `condition`（`evaluateCondition` / `ConditionExpr`） | `src/skills/tier2/condition.ts` | 称号解锁条件 · 需求阈值文案查表 · 相位跳转判据。经 `flow`/`self-rule`/`modifier-stack` 消费 |
| `event-log` | `src/skills/tier1/event-log.ts` | 事件流水（编年史视图的底料） |
| `debug-trace` | `src/skills/debug-trace.ts` | §5 的四类 trace 落点（opt-in·已在 `NON_DETERMINISTIC`） |
| `services/character-card` | `src/services/character-card/` | NPC 人设卡的既有桥（`normalizeCharacterCard`/成年硬闸） |
| `net/commands` · `net/queued-input` | `src/net/` | **架构基石**：`InputSource` 接缝 · tick 边界确定性释放 |
| `net/world-hash` · `net/determinism` | `src/net/` | 快照指纹 · `NON_DETERMINISTIC` 名单 |

### 2.3 已下沉能力（✅ 2026-09-12 交付·owner 判 A ×3）

| capability / 模块 | 用来做什么 | 状态 |
|---|---|---|
| `t2-memory` | 记忆条目（主体/客体/回合/强度/标签/**来源**）· 逐标签衰减与遗忘 · **整数** top-K 检索 · 跨实体转述（打折强度） | ✅ **已交**（REQ-111-MEMORY·`src/skills/tier2/memory.ts` + `memory-core.ts`·registry 已登记） |
| `NpcAgentPort`（service 端口） | `decide(ctx): Promise<Intent[]>` + `NullNpcAgentPort`（确定性桩·无网 CI）+ `HttpNpcAgentPort`。**端口不写世界·绝不抛** | ✅ **已交**（REQ-111-AINPC·`src/services/npc-agent/`；契约在 `src/engine/protocol/agent.ts`） |
| `t2-intent-barrier` | 异步意图收齐门：登记待决 id · 超期按**整数回合数**（禁墙钟）确定性降级 · 收齐后**按 npcId 升序**一次性产出 · 闭集外动词拒收留 `reject` | ✅ **已交**（REQ-111-AINPC·`src/skills/tier2/intent-barrier.ts` + `intent-barrier-core.ts`·registry 已登记） |

> **游戏层据此开工的三条硬口径**（交付时定死，别再自己发明）：
> ① `AgentContext` / `Intent` 的形状**从 `@engine/protocol/agent` import**，不在游戏层另定（§6 裁决条件②）。
> ② 意图落地走 `IntentBarrier.resolved` → 动词表映射成 `Effect` 列表 → `t2-effect-apply`；**游戏层不写意图解释器**。
> ③ 降级可观测：`IntentBarrier.filled` 就是「这回合有几个 NPC 没拿到决策」，UI/测试直接读它，别另记一份。
> 交付细节与撤修验红记录见 `docs/design/game111/requests.md` 各单的「✅ 已交」段。

> **裁决 ④ = B**：不设 `Motive` 组件。动机每回合由「需求 + 记忆」现推，只活在 prompt 里，不落世界。
> **附带约束（Lead 记在此备查）**：链式影响必须**另有可观测落点**，否则玩法不可测——落点定为「记忆条目的 `source` 字段」（哪条记忆来自哪次玩家发言）+ `SETTLE` 相位的 `commit` trace。若实测仍不可观测，**回头重开 ④ 走 A**，不许在游戏层偷偷补一个动机结构。

---

## 3. 摆成数据的规则面

| 数据表 | 内容 | **谁解释它** |
|---|---|---|
| `WORLD_ZONES` | 六个分区：id · 名称 · 描述 · 物件清单 | `t2-zone-occupancy` + `w2-spatial-query` |
| `NPC_CARDS` | 人设卡：id · 姓名 · 性格一句话 · **智能等级 L1–L5** · 初始需求 · 初始关系 | `services/character-card` + `f1-resource` + `g2-relation` |
| `NEEDS_TABLE` | 精力/心情/社交欲/好奇心：初值 · `amountPerTick` · `period` · 阈值文案 | `t2-over-time` + `condition` 模块 |
| `TURN_PHASES` | 七相位表（§4.2 framework）：各相位 `onEnter` 动作 + `transitions` | `t3-flow` |
| **`INTENT_VERBS`** | **意图闭集**：动词 → 参数形状 → **映射成的 `Effect` 列表** | `t2-effect-apply`（**不新写解释器**·见下红线） |
| `TITLE_TABLE` | 称号：解锁 `ConditionExpr` · 文案 · 稀有度 · **归属哪个 NPC** | `condition` 模块 + `f2-flag` + `x3-string-variable` |
| `DIRECTOR_VERBS` | 导演闭集：`nudge` / `schedule_event` / `adjust_pacing` | `t3-timeline` + `t2-effect-apply` |
| `BT_TREES` | L3 NPC 的行为模式树（纯数据） | `t2-behavior-tree` |
| `DIALOGUE_GRAPHS` | L1 NPC 的固定对话图 | `t3-dialogue` |
| `MEMORY_TAGS` | 记忆标签闭集 + 各标签衰减率 | `t2-memory`（✅ 已交·表摆成 `MemoryRules.decay:[{tag,amount}]`） |

> **红线自查（模板原文：不许填「数据表 + 待写的游戏层解释器」）**
> 本表**零虚胖**。唯一有被误做成自写解释器风险的是 `INTENT_VERBS`——**已消解**：一个意图动词**不是**一段游戏代码，而是**一份 `Effect` 列表数据**，由现有 `t2-effect-apply` 执行。例：
> `move_to(zoneId)` → `[{kind:'set-string', id:'npc.zone', value:zoneId}, {kind:'set-flag', id:'npc.moved', active:true}]`
> 因此 game111 **不含任何意图解释器代码**。校验闭集成员资格与参数形状的那一层归 `intent-barrier`（引擎侧·**已交**·`checkIntent` 三道门：pending 归属 / 动词在表内 / 参数个数），不归游戏层。

---

## 4. 申请的游戏层代码例外（逐条过审）

| 例外 | 为什么现有能力表达不了 | 预计行数 | Lead 裁决 | 偿还计划 |
|---|---|---|---|---|
| **BT 叶注册** `registerBTLeaves('game111', {...})`：L3 NPC 的 3–5 个行为模式叶（`goRest` / `seekSocial` / `wander`） | `t2-behavior-tree` 的 describe 明写「叶 = 唯一过审 TS 例外」；叶体只读黑板（Resource/Flag/StringVar）写信号，不含自由逻辑 | ~60 | ✅ **准**（§6 条件①） | 记债。若三个以上游戏出现同形叶 → 下沉 |
| **prompt 组装纯函数** `buildAgentContext(snapshotSlice) → AgentContext` | 意图层在 **sim 之外**（不进 hash）。它把快照切片 + 检索到的记忆拼成端口入参。**不写世界、不读墙钟、无随机** | ~80 | ✅ **有条件准**（§6 条件②：`AgentContext` 形状归引擎，已随 ENG-01 导出；游戏层只填） | 若第二个 AI 游戏出现 → 下沉进 `NpcAgentPort` 的 helper |

> **没有第三条。** 特别声明**不申请**以下常见逃生口：
> - ❌ 不写意图解释器（§3 已消解为数据 + `t2-effect-apply`）
> - ❌ 不写记忆系统（owner 判 A·归引擎）
> - ❌ 不写异步对齐逻辑（owner 判 A·归引擎）
> - ❌ 不写任何手写 React 屏 / 自由 DOM（§4.6）
> - ❌ 不写动机结构（owner 判 B = 不做）
>
> 审计红旗（裸 `Math.random` / `innerHTML` / `createElement` / 零能力接入 / 零测试）**不接受申请为例外**。

---

## 4.5 美术接入

- **皮肤槽清单**（主体视觉实体必须有槽·`art-pipeline.md` 红线「禁纯色块游戏」）：

| 视觉实体 | 槽 | 载体 |
|---|---|---|
| NPC 立绘 / 头像（7+ 角色） | `skinKey: npc-<id>-portrait` | UI `Avatar` · 3D 角色 |
| 分区背景（六区） | `skinKey: zone-<id>-bg` | `mountHost` 背景皮肤槽（有图用图·无则程序化回退） |
| 物件图标（各区物件网格） | `skinKey: obj-<id>` | UI `Image` |
| 称号徽记 | `skinKey: title-<id>` | UI `Badge` / `Tag` |
| 小星书帖子配图 | **旁路句柄**（`AishePort` 式·不进 hash·不进台账） | UI `Image` |

- **台账产出**：编译期游戏 → 照 `scripts/game-g-art-requirements.mjs` 样板写推导脚本，**脚本名：`scripts/game111-art-requirements.mjs`**。
- **消费纪律**（owner「换了没反应」铁律）：视觉加载一律先取 `skinMap['<skinKey>']`，硬编码路径**只作回退**。
- **占位最低标准**：每行落账即须有一张**成形矢量 SVG**（看得出是什么东西）。灰块/字框不合法。
- **不申请「全程序化」例外**——NPC 立绘是本作情感载体，必须走真美术。

## 4.6 UI 呈现 · 华丽起手

- **house 主题**：**`apolloOnyx`**（`src/ui/components/apollo-kit.ts`·已实查存在）。理由：素材整体是深色霓虹赛博调，`apolloOnyx` 是最接近的既有 house 皮。**不自写 `UITheme`**。
- **起手包**：主菜单 / 每日结算屏直接 `import` `@ui/starters`（`buildStarterHome` / `buildStarterResult`·`src/ui/starters/starter-kit.ts`）。**不从空白搭朴素屏。**
- **成熟件清单**（对 `catalog.ts` 34 控件闭集**实查挑选**，全部确认存在）：

| 屏 / 元素 | 控件 |
|---|---|
| **关系网可视化** | `Avatar` 节点 + **`Connector`**（catalog 原文：「两目标间连线（VS 连线/攻击指向/**关系线**）」）+ `Float` 定位 |
| 小星书 feed | `VirtualList` + `Card` + `Image` |
| NPC 生活看板（后台视图） | `Table` + `Tabs` + `Badge` |
| 需求条 / 好感度条 | `ProgressBar` + `t2-gauge` + `Label.format` |
| 称号展示 / 解锁庆祝 | `Tag` / `Badge` + **`Particles`** |
| 主 CTA | `Panel.skin` + `sheen-hover` |
| 对话 | `Card` + `Label`（艺术字 `Label.font`） |
| 事件详情 | `Modal` / `Drawer` + `Accordion` |

> **实查更正（对 `framework.md` §8 的一处收紧）**：framework 写「关系网控件待定·若无则走 requests.md 扩控件」。实查 `catalog.ts:248` 确认 **`Connector` 已覆盖关系线**，故 **不提扩控件需求**，用闭集现有件。
> **零成熟件 = 朴素缺陷**；本表 8 项均为成熟件，非缺省 SHELL。
> **开工前必读**：`docs/design/ui-playbook.md` + `docs/playbooks/ui.md`。交付前跑 `/check-ui`。

## 4.65 对手 / NPC AI 设定

> 本作 NPC 决策 **就是核心玩法**，本节为强制项（owner 2026-08-10 规矩）。详设落 `docs/design/game111/gdd.md`「NPC AI」章（待写），本节为摘要。

- **性格一句话**：每张 `NPC_CARDS` 必填（例：娜洛 = 「有边界感的咖啡店主，热心但不讨好」）。性格差 = **数据不改结构**（`opponent-ai.md` 红线）。
- **决策口径**：按智能等级分档，**等级是人设卡上的数据字段，不是代码分支**：

| 级 | 决策者 | 调 LLM | 断网 |
|---|---|---|---|
| L1 脚本化 | `t3-timeline` + `t3-dialogue` | ❌ | ✅ |
| L2 感知响应 | `t2-self-rule` + `condition` | ❌ | ✅ |
| L3 动机决策 | `t2-behavior-tree` 选模式，LLM 只产台词 | 🔶 仅表达 | ✅ 降级 |
| L4 认知规划 | LLM 产意图（闭集）+ 记忆参与 prompt | ✅ | 🔶 降 L2 |
| L5 自主智能体 | L4 + 跨角色记忆流转 + 自主发起社交 | ✅ | 🔶 降 L2 |

- **难度阶 / 世界密度怎么爬**：不是难度而是**活跃度**。v0 配比 L5×2（主角级）· L4×5 · L2×10 · L1×若干背景；随算力放宽逐级上调，**改的是人设卡字段，不是代码**。
- **降级是硬性设计**：L4/L5 必须有 L2 降级路径。「模型挂了世界就停」= 缺陷。
- **对照 `opponent-ai.md` 八件坑的自查**（本作命中四条，全部已在相位设计中封死）：

| 坑 | 本作对应风险 | 封法 |
|---|---|---|
| ① 定手窗 | NPC 在玩家行动**之后**改意图 = 赖皮 | `INTENT` 相位**只开一拍**，`COMMIT` 之后当回合不再收意图 |
| ② 账期 | NPC 读到自己同回合刚产生的意图 = 自我喂招 | 记忆写入挂 `SETTLE` 相位门，`PERCEIVE` 之后才记账 |
| ④ 种子骰 | 意图层降级/抽样用裸 `Math.random` | 一律 `w1-random`；超时降级判据用**回合数**不用墙钟 |
| ⑧ 一级一拍 | 同拍写旗又读旗，读到上一回合的值 | 七相位摊开，每级决策各占一相位 |

- **trace 落痕**（本线红线）：AI 决策必须记 `decision`（选了哪条记忆/哪个模式）与 **`reject`**（解析失败/动词越界/超时降级）。
- **点名测试 + sabotage 锚点**：行为测不到的测结构（坑⑥）。详见 §5.2。

## 4.7 代码准入阶梯申报

| 规则 | 落级 | 说明 |
|---|---|---|
| 世界分区表 / 物件表 | **L0** 纯数据 manifest | 无 |
| NPC 人设卡（含智能等级） | **L0** 纯数据 | 无 |
| 需求表与衰减曲线 | **L0** 纯数据 | `t2-over-time` 参数 |
| 称号解锁条件与文案 | **L0** 纯数据 | `ConditionExpr` |
| 意图闭集动词表 | **L0** 纯数据 | 动词 → `Effect` 列表（§3） |
| 回合七相位 | **L1** 数据 + 现有 capability | `t3-flow` |
| NPC 轮转 | **L1** | `t2-turn-order` |
| 需求衰减结算 | **L1** | `t2-over-time` + `f1-resource` |
| 好感度修正聚合 | **L1** | `t2-modifier-stack` |
| 分区在场 / 感知集 | **L1** | `t2-zone-occupancy` + `w2-spatial-query` |
| 意图落地 | **L1** | `t2-effect-apply` |
| L2 NPC 自治 | **L1** | `t2-self-rule` |
| 导演节奏干预 | **L1** | `t3-timeline` + `t2-effect-apply` |
| **记忆系统** | **L2** capgap 已裁 | owner 判 A → `docs/design/game111/requests.md` **REQ-111-ENG-03** |
| **LLM 决策端口** | **L2** capgap 已裁 | owner 判 A → **REQ-111-ENG-01** |
| **异步意图对齐** | **L2** capgap 已裁 | owner 判 A → **REQ-111-ENG-02** |
| L3 行为模式叶 | **L3** 受控 TS | L0–L2 表达不了：BT 叶体是引擎钦定的 TS 例外口（`t2-behavior-tree` describe 原话）。记债·§4 已申报 |
| prompt 组装纯函数 | **L3** 受控 TS | L0–L2 表达不了：它在 **sim 之外**，产出物是端口入参不是世界状态。记债·§4 已申报 |

> **L4 零申报**——无自由代码 / 无手写 UI / 无自建解释器。

---

## 5. 确定性声明

### 5.1 口径

| 项 | 口径 |
|---|---|
| 随机源 | `w1-random` 种子 PRNG。**游戏层禁裸 `Math.random`**（硬红线） |
| seed 来源 | 世界创建时写入，存档携带 |
| 墙钟 | **全面禁用**。回合号是唯一时间轴（含 `intent-barrier` 超时判据） |
| LLM 输出 | **不进 sim**。只有解析后的闭集意图进，且**按 npcId 排序**应用（`commands.ts` 铁律） |
| 回放 | 需要。**重放意图流，不重调模型** → bit 一致 |
| 双人同步 / lockstep | 需要（多玩家共处一个小镇）。意图走 `applyCommands` 同一路径 |

### 5.2 非确定性风险点（逐条列全 + 封法）

| # | 风险点 | 封法 | 归属 |
|---|---|---|---|
| 1 | LLM 回包**到达次序**随网络抖动 | 收齐后按 npcId 排序一次性注入 | `intent-barrier`（引擎·🔴） |
| 2 | LLM 回包**迟到 / 失败** | 按回合数超时 → 确定性降级补默认意图（`rest()`） | `intent-barrier` |
| 3 | 意图层的缓存/调试组件若挂进世界 | **必须登记 `NON_DETERMINISTIC`**。`determinism.ts` 原文警告：「名单靠手维护，拼错一个名字即静默失效（多算→误报 desync，少算→假绿）」 | 施工方 |
| 4 | 记忆检索用浮点打分 → 跨端 ULP 漂移 | 检索打分**用整数**（强度/时近/标签命中均为整数权重），禁浮点排序 | `t2-memory`（引擎·🔴） |
| 5 | 照片/图片生成走外部服务 | `AishePort` 式旁路，世界只存句柄 id，**不进 hash** | 游戏层 |
| 6 | 新增相位链 `INTENT→COMMIT→SETTLE` **闭合成环** | `topological-sort` **成环只告警不抛**（CLAUDE.md 实证：ENG-03 引入的 Commit 相位环，定序用例全绿仍漏）。→ **必须读 stderr 告警，并加「定序测试断言 warn 为零」** | 施工方 · 复查门 |

> **归属判定（CLAUDE.md「施工与复查」第 1 条）**：风险点 1/2/4/6 碰**定序/相位 · 确定性与快照 hash · lockstep · 新增 system** → **🔴 只归主程**。本 plan 据此把 REQ-111-ENG-01/02/03 全部标为主程面（§6 派工）。

### 5.3 DebugTrace 落点（日志基准守则）

| 类 | 记什么 |
|---|---|
| `decision` | 哪些记忆进了 prompt（只记 top-K 的 id·不 dump 内容）· 导演选了哪个 nudge · BT 选了哪个模式 |
| `transition` | 相位跳转（`INTENT→COMMIT`）· NPC 等级降级（`L5→L2`） |
| **`reject`** | **本作最重要**：解析失败 / 动词不在闭集 / 参数越界 / 目标不存在 / 回包超时补默认 |
| `commit` | 本回合每个 NPC 实际落地的意图摘要（npcId + verb + 主参数） |

密度 ≤3 条/system/tick，无事 0 条。**验收判据：开 trace 跑一回合，只读 trace 能重建出「为什么茉尔去了后山」。**

### 5.4 测试红线

- 零测试 = 审计红旗。每个 L0 数据表至少一例结构守卫；每条 AI 行为点名测试。
- **sabotage 锚点必须带命中断言**（否则「全绿」可能只是根本没改到文件·CLAUDE.md review 铁律②）。
- **定序测试断言 `topological-sort` warn 为零**（§5.2 #6）。
- `NullNpcAgentPort` 使全部测试**无网可跑**——这是 REQ-111-ENG-01 判 A 的直接收益。

---

## 6. 评审记录

- **提交人 / 日期**：game111 程序员 + 策划 session / 2026-09-12
- **前置裁决**：owner 2026-09-12 判 `framework.md` §6：①记忆=**A** ②端口=**A** ③barrier=**A** ④动机层=**B**
- **Lead 裁决**：✅ **有条件通过**（2026-09-12·主程 session）。条件两条，写死在下面「裁决条件」。
- **待裁项**（§4 两条游戏层例外）：✅ BT 叶注册（~60 行·**准**） ✅ prompt 组装纯函数（~80 行·**有条件准**）

### 裁决条件（写死·复查门按这两条核）

1. **BT 叶注册 = 准，原样记债。** 依据是 `t2-behavior-tree` 的 describe 原文把「叶 = 消费方注册表」钉成
   引擎钦定的 TS 例外口，不是本 plan 新开的口子。边界照申报：叶体只读黑板（Resource/Flag/StringVar）写信号，
   **不得**在叶体里调端口、读墙钟、用裸 `Math.random`。
2. **prompt 组装纯函数 = 有条件准。** 条件：`AgentContext` 的**形状归引擎**（随 `REQ-111-ENG-01` 定义并导出），
   游戏层只负责**填**它——不得自定义一套平行的上下文结构。理由：形状一旦在游戏层自定义，第二个 AI 游戏来的
   时候就不是「下沉一个 helper」，而是「两套不兼容的上下文格式二选一」，正是 `modifier-stack` 下沉前的原样。
   偿还计划照申报不变。

> **Lead 另记一条（不构成条件，交付时查）**：④ = B 的附带约束（链式影响须有可观测落点）在引擎侧已备好落点——
> `Memory.entries[].source` 记「这条记忆从哪来」，`share` 产出的副本 source 记 `share:<fromId>`，
> `IntentBarrier.filled` 记「哪些 NPC 是降级补的」。三处都在 hash 内、可断言。若游戏层实测仍不可观测，
> 按 framework §6④ 原路回去重开 A，**不许在游戏层偷偷补一个动机结构**。

### 派工与归属（过审后生效）

| 工件 | 归属 | 理由 |
|---|---|---|
| REQ-111-ENG-01/02/03 | **🔴 主程** | 碰定序/相位 · 确定性与 hash · lockstep · 新增 system（§5.2） |
| game111 数据表（L0）· UI 屏 | 🟢 本游戏 PE | 已有能力的扩写·spec 边界明确 |
| 复查 | **复查人 ≠ 施工人**（红线） | Review 单是导航不是证据，每条须复查人自己复跑 |

> **抢锁纪律**：开工第一动作 = 把对应工单「施工主体」改成自己并推一次；那一行就是锁。

---

## 7. 施工状态（2026-09-14 补）

三条引擎需求已由主程落树（commit `963e34c3`）。game111 框架层已交付并自证：
`games/game111/{world-data,blueprint,agent-context,turn-driver}.ts` + 24 例测试 + DeepSeek 接入代理。
**与本 plan 的三处偏差、撞出的引擎缺口、两条配平教训全部记在 `impl-notes.md`**（偏差 = 债，不默认放着）。

## 8. 下一步

1. Lead 批 §6（本 plan + 两条例外）。
2. 过审 → 写 `docs/design/game111/gdd.md`（含「NPC AI」详设章）。
3. 三条引擎需求落 `docs/design/game111/requests.md`（**游戏级·不占引擎槽**）。
   **为什么不进引擎池**：实测 `context-budget` 报引擎池 **24783/25000 字符**——槽位 4/10 尚有余，**卡的是字符预算**，加三条即红灯拦推送；且按本仓先例（REQ-DIALOGUE 出池原话「下一步触发者不在池内」），本三件的触发者 = Lead 批本 plan，尚未发生。**Lead 过审 + 主程真接单时再原文搬进引擎池并抢锁**（搬前先清池腾字符）。
4. 引擎三件落地后才开 game111 的游戏层。**plan 未过审不写游戏层 system 代码。**
5. 偏差体检：`node scripts/game-skill-audit.mjs game111`。
