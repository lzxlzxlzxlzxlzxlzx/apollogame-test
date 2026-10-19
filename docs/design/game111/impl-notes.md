# game111 · 施工笔记（框架层·2026-09-14）

> 记两类东西：**与 plan 的偏差（= 债，须销）** 和 **施工中撞出来的引擎缺口（= 报给主程）**。
> 口径：plan 与实现不一致 = 债，要么改实现要么改 plan（重审）。不许默认放着。

## 1. 已交付（框架层·可跑可测）

| 件 | 位置 | 说明 |
|---|---|---|
| L0 世界数据表 | `games/game111/world-data.ts` | 分区 / 人设卡（含智能等级）/ 需求曲线 / 意图闭集 / 记忆标签 / 称号表 |
| 世界装配 | `games/game111/blueprint.ts` | 纯数据 + 宿主层 `setupTown`；意图落地 = 预展开的 `KeyBinding`+`Effect` 表 |
| prompt 组装 | `games/game111/agent-context.ts` | plan §4 例外②（Lead 有条件准）——只填引擎给定的 `AgentContext` 形状 |
| 回合驱动 | `games/game111/turn-driver.ts` | 宿主层六步；坑①定手窗 / 坑②账期 已封 |
| 测试 | `games/game111/game111.test.ts` | 24 例·含 sabotage 锚点与尺子自证 |
| DeepSeek 接入 | `scripts/game111-deepseek-proxy.mjs` | 开发期代理（形状翻译 + key 不进浏览器）·`--selftest` 15 例零网络 |
| 无头演示 | `scripts/game111-demo.ts` | 自证用；可切 Null 桩 / 真后端 |

**架构落点（framework.md §1.2 的论点在代码上的证据）**：意图不是宿主直接塞进世界的，而是
`QueuedInputSource.enqueueAction` → `net/applyCommands` → `t2-keybind` → `Signal` → `t2-effect-apply`。
**LLM NPC 与远端人类玩家走的确实是同一条路。** 这不是设计上的比喻，是实现上的同一段代码。

> 为什么必须这样：`t2-event-when` 每拍开头 `for (const [sid] of world.query('Signal')) removeComponent(...)`
> **清全场 Signal**，所以宿主在拍间塞的信号必被清掉；而 `keybind` 申报了 `runsAfter event-when`，
> 是数据驱动的合法入口。首版想直接塞信号，是读了 `event-when.ts:71` 才改的。

## 2. 与 capability-plan 的偏差（债）

### 偏差 ①：回合七相位未用 `t3-flow` 摊开

- **plan §3 原文**：`TURN_PHASES` → `t3-flow`。
- **实现**：相位在**宿主层**（`turn-driver.ts` 的六步）摊开，`GameFlow` 仅承载粗粒度世界态。
- **理由**：`INTENT` 相位要等异步回包。把它并进 flow，会让 flow 与 `t2-intent-barrier` 互为前驱
  ——正是 🔴 主程面那类「一放 Update 就闭合成环，而 `topological-sort` 只告警不抛、落序不合语义仍照跑」
  的坑（CLAUDE.md ENG-02/03 实证）。`intent-barrier.ts` 的系统声明里，主程已经为同一件事改过一版
  （首版让门自己读 `TurnOrder.round` → 真 2-环）。
- **销账路径**：要摊开，需主程先给定序结论（flow 与 barrier 谁在谁之前、怎么不成环）。在那之前，
  宿主层摊开是**语义等价且无环**的写法。**不自裁改 plan，等复查门裁。**

### 偏差 ②：意图闭集 v0 只有四个动词

- **plan §2.3 / framework §2.3** 列了五类动词（含 `feed_post` / `take_photo` 等社区类）。
- **实现**：v0 = `move_to` / `talk_to` / `rest` / `observe`。
- **理由**：社区类动词要 spawn 帖子实体，而 `Effect` 的 kind 闭集里**没有 spawn**
  （`set-flag|set-flag-tagged|modify-resource|set-state|set-sensor|set-visible|set-visible-tagged|destroy|destroy-tagged|reset-timer`）。
  硬上就得在游戏层写一个「读 verb → 造实体」的分支 = plan §4 明令不申请的解释器。
- **销账路径**：小星书那一段等 UI 阶段一并处理；届时若仍表达不了，走缺口裁决协议摆 A/B，**不偷偷写解释器**。

### 偏差 ③：BT 叶尚未注册（plan §4 例外①已准，但本阶段没用上）

L3 NPC 的行为模式树在 v0 未接（现有 NPC 是 L1/L2/L4，没有 L3）。例外①**已批未用**，不算债，
但记在此以免复查门误判「批了没做 = 漏做」。

## 3. 撞出来的引擎缺口（报主程·本层不自行改）

### 缺口：`ComponentDataMap` 未登记五个新组件

- **现象**：`TurnOrder` / `Memory` / `MemoryRules` / `IntentBarrier` / `IntentInbox` 写进 `WorldBlueprint`
  的实体表会被 TS 拒绝：`Object literal may only specify known properties, and 'Memory' does not exist in type 'EntityBlueprint'`。
- **根因**：`src/assembly/demo.assembly.ts:18` 的 `EntityBlueprint = { [K in keyof ComponentDataMap]?: ... }`，
  而 `src/assembly/component-map.ts` 的 `ComponentDataMap` 里没有这五型。`t2-turn-order`（2026-09-09 下沉）
  与 LLM 三件套（2026-09-13 下沉）都只登了 registry，没登 blueprint 的组件映射。
- **影响**：**任何游戏都无法在 blueprint 里声明这五个组件**，只能运行时 `addComponent` 补。
  对 `IntentBarrier`/`Memory` 尚可（`openBarrier`/`remember` 本就是引擎给的运行时路径），
  但 `MemoryRules`/`TurnOrder` 是**纯配置组件**，本该躺在 blueprint 里，现在只能在宿主层 addComponent。
- **归属**：`src/assembly/component-map.ts` = **跨游戏共享面 → 🔴 只归主程**（CLAUDE.md 施工归属第 1 条；
  「拿不准按 🔴 走」）。本层**不自行改动**，已开单：`docs/design/game111/requests.md` REQ-111-ENG-04。
- **当前绕法**：`blueprint.ts` 的 `setupTown()` —— 走引擎自己的挂载路径，语义等价、零自造。

## 4. 自证实测撞出的两条配平教训（已修·记着别再犯）

1. **衰减必须明显小于单动作回复量**。首版四项衰减合计 16、单动作回复 25，实跑六回合全员归零——
   一回合只能做一件事，所以「四项之和」对的是「一个动作」，不是「四个动作」。现 11 < 18。
2. **每条降级/规则的动词必须真能回补那一项需求**。首版 Null 桩把 `curiosity` 垫底映射到 `move_to`，
   而 `move_to` 只改所在地、不回好奇心 → 十回合全员卡在「动身去后山」刷屏。**活锁不是模型的毛病，
   是规则表自己把自己锁死了。** 真后端也吃这条：prompt 里给的动词语义要和 Effect 表真实对得上。

## 4.5 表现层（2026-09-14 追加·华丽起手三步 + `/check-ui` 实测）

**交付**：`ui.ts`（LayoutNode 纯数据屏）· `project.ts`（世界→视图只读投影）· `game111.ts`（卡带宿主 mount）·
`ui.test.ts`（15 例）· `tools/audits/game111-board.audit.ts` · launcher 注册（`game111` 可在游戏库直接开）。

**华丽起手三步的落点**：① house 主题 `apolloOnyx`（不自写 UITheme）② 主菜单走 `@ui/starters` 的
`buildStarterHome`（不从空白搭）③ 成熟件：`Avatar.ring`(好感环) · `Connector`(关系线) · `VirtualList`(小星书)
· `ProgressBar`(需求条) · `Particles`(称号庆祝) · `Panel.glass`(磨砂) · `press3d`(卡实体感) ·
`Label.tween`(回合号滚动) · `Button.shape:'cut'`+`sheen-hover`(主 CTA)。

**UI 侧零世界访问**：`ui.ts` 只吃 `TownView` 这样的 POD，世界读取全在 `project.ts`。所以 UI 可无世界单测，
也不会有人在 LayoutNode 里偷偷读组件。

**`/check-ui` 实测记录（四处硬失败 → 零）**——每一条都是量出来的，没有一条是看出来的：

| 症状 | 实测 | 根因 | 修法 |
|---|---|---|---|
| 降级文案读不清 | ratio=2.46 | `color:'dim'`(#56657a) 落在 raised 面 | 改 `warn`（语义上也更对） |
| 两处面板小标题读不清 | ratio=2.93 | `Panel.title` 的阔字距小标题**字色不可由数据指定** | 换成能指定 `color` 令牌的 `Label` |
| 关系线中点标读不清 | ratio=1.21→1.05 | 换亮色也没救（见下） | **去掉 label**（信息由分区 Tag 重复承载·零损失）+ 报 PUI |
| 称号药丸未达 AA | ratio=3.38 | **`tone:'normal'` 根本不在 Badge 闭集**（闭集=ok/warn/dim/accent/gold/danger），schema 不认 → 退默认灰 | 按稀有度映射 ok/accent/gold |

末态：**重叠 0 · 硬性低对比 0 · border-image 前提齐 · 华丽件 7 处命中**。余 20 处 AA 警告已复核：
全部是控件内部 span（`Avatar` 首字、`ProgressBar` 的标签/数值），非游戏数据可控面，且审计明标非阻断。

**顺带报给 PUI 两条**（`requests.md` REQ-111-UI-01/02）：`Connector.label` 与审计 `solidBgUp` 的盲区；
`ui-audit` 的 house 主题判据对 `apolloOnyx`/`apolloBrocade` 恒为否（那两款 house 皮没有 `buttonSkins`）。

## 4.6 玩家 ↔ NPC 对话（2026-09-14 追加·owner 令「先用一个假的」）

**核心卖点的入口通了**：素材那句「玩家只需在闲聊中自然说话，就能改变 NPC 后续的行动意图」现在可玩。

**机制**（一句话）：玩家选一个话题 → 写进该 NPC 的记忆（tag `player`·**衰减最慢**）+ 好感增量
→ **下一回合它的 prompt 里就带着你说过的话** → 模型看到的东西变了 → 它的意图跟着变。

**玩家和 LLM 走的是同一条路**：`saySignal(npc,topic)` → `QueuedInputSource` → `applyCommands`
→ `t2-keybind` → `Signal` → `t2-effect-apply`。和 NPC 意图逐字同构，只是信号名前缀不同。
这不是「设计上像」，是**同一段代码**。

**唯一「假」的地方 = `STUB_REPLIES` 一张表**（`world-data.ts`）。它只决定屏幕上显示哪句话，
**不参与任何世界状态**——好感、记忆、下一回合的意图全走真链路。真模型上线后这张表由端口回包顶替，
世界那一侧一行都不用改，因为世界从来没读过它。UI 上有一行小字明着标注这一点，不让人误以为已接模型。

### 真机实测撞出来的四条（`tools/ui-audit.mjs` 全绿也没拦住的）

审计跑的是**离线树 + 1060×760 + 最坏数据**；真机跑的是**launcher 壳层里 + 1280×900 + 真数据**。
四条全部只在真机出现，已各钉一条回归测试：

| # | 症状 | 根因 | 修法 |
|---|---|---|---|
| 1 | 标题贴死屏幕左上角 | **`Screen` 会丢掉 `layout`**——`render.ts:1315` 的 `renderScreen(id, props, children, t)` 压根不接 `ls` 参数 | padding/gap/maxWidth 挂内层 bare Panel（`page()` 工具） |
| 2 | 顶栏右侧的按钮点不动 | **右上角是壳层保留区**：launcher 的 ⚙ 菜单钉死在那儿，其 subtree 吃掉命中测试（Playwright：「⚙ from `<div>` subtree intercepts pointer events」，**连 force 点击也只打到齿轮上**） | 两屏的可点控件一律移出顶栏右侧；主 CTA 改放底部动作条（顺带也是更对的位置） |
| 3 | 「第 1 回合」渲成光秃秃的「1」 | **`Label.tween` 会顶替 `text`** | 数字单独一个 tween 节点，前后缀两个静态 Label |
| 4 | 小星书出现「和说了会儿话。」半句话 | 模板有 `{o}` 占位，但 `rest`/`observe` 的记忆没有 object | 加 `FEED_TEXT_NOOBJ` 无宾语分支；**玩家说的话则原样显示**（从 `source` 的 `player:<topicId>` 现推原句） |

> **教训**：ui-audit 是必要不充分。它能量重叠和对比，量不到「壳层压住了你的按钮」「控件的某个 prop 会顶替另一个」
> 「模板的空占位分支」。**这几条只有把真东西跑起来、点一遍才会掉出来。**

另修一条控件回落缺陷：`portrait` 缺 `art` 时回落的「名字首字」颜色被烤死成 `t.dim`
（`render.ts:1254`），暗皮上实测 `ratio=2.46` 硬失败。做了程序化矢量占位 `portrait-art.ts`
（深底 + 亮色肩颈剪影 + 首字·满足美术手册「占位最低标准=成形矢量图」），真美术到位即让位。
`Avatar` 的首字占位同病同治。已报 PUI（REQ-111-UI-03）。

### demo 怎么看

```bash
npm run dev                      # → http://localhost:5173/?game=game111
```

一条完整闭环（实测走通）：进小镇 → 推两回合看需求衰减与记忆累积 → 点「说句话」→ 说三句
→ 好感 0→22 → 回看板再推一回合 → **娜洛给了称号「老位子那位」**，小星书里留着你说过的原话。

## 5. 下一阶段（未做·不是欠账清单，是 owner 定过的分期）

表现层（§4.5）与对话入口（§4.6）已落地。**仍未做**的三件：

1. **接上真 DeepSeek 跑一遍**——链路已端到端验过（本地 OpenAI 形状桩），但还没用真 key 真跑。
   owner 有 key 时一条命令即可：起 `scripts/game111-deepseek-proxy.mjs`，游戏侧传 `VITE_GAME111_ENDPOINT`。
2. **NPC 回话换成模型产出**——现在是 `STUB_REPLIES` 一张表（§4.6）。端口回包顶替它即可，世界侧零改动。
3. **小星书的真帖子**——现在 feed 是拿记忆渲的（素材原话「NPC 用记忆发帖」，语义对得上），
   但 `feed_post` 动词仍缺（偏差②：`Effect` 的 kind 闭集里没有 spawn）。真帖子实体要等那条缺口有结论。

美术台账（capability-plan §4.5 的 `scripts/game111-art-requirements.mjs`）也未做——现在全是程序化观感，
`game-skill-audit` 为此报一条 🟡。**不伪造台账**：等真有皮肤槽要填时一并做。
