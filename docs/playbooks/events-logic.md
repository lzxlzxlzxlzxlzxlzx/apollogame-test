# 事件与逻辑链手册

> 「条件成立 → 发信号 → 改世界」全用能力串起，游戏层不写规则代码。
> **信号铁律**：写世界 = 具名 `Signal` 经 enqueue 入队 → 由能力系统消费；**handler / 触发点里绝不塞自由逻辑**。
> 机读真相：`describe`（`src/skills/tier2·tier3`）；条件表达式 `src/skills/tier2/condition.ts`（`ConditionExpr`，被多能力复用）。

## ① 做 X → 用什么

| 任务 | 能力实名 | 怎么接（一句） |
|---|---|---|
| 条件成立时发信号 | `t2-event-when` | 挂 `EventWhen{signal,when,mode}`（threshold/状态/门控）；下游 query Signal 消费 |
| 信号直接改世界 | `t2-effect-apply` | 挂 `Effect{onSignal,kind,targetId,value}`（Commit 相位，下拍生效） |
| 按 Tag 掩码批量解锁一片区域的 Flag | `t2-effect-apply`（`kind:'set-flag-tagged'`） | `Effect{onSignal,kind:'set-flag-tagged',tagMask,targetId,value}`：tagMask 命中的实体里 `Flag.id===targetId` 者批量置 active（destroy-tagged/set-visible-tagged 的 Flag 孪生·webbed 区域解锁同款） |
| 顾客点单/收集类多槽交付 + 集齐续单 | `t2-order-fulfill` | 挂 `Order{needItems,filled,reward,pool?,rotateMode?,cursor?}`；`DeliverDrop` 消费落格；`pool` 非空则集齐发奖后轮换下一单（`sequence` 按 cursor 环回 / `weighted` 用世界 `RandomSeed` 加权抽） |
| 点世界实体发信号 | `t2-clickable` | 缺省 `Clickable{action}` 按旧 Shape AABB；透明贴图实形点击加 `hitMaskKey`，只消费 AssetIndex 预烘焙二值数据，缺/坏不回退 AABB |
| 按键/具名动作发信号 | `t2-keybind` | 挂 `KeyBinding{key,signal}`；人/AI 共用动作总线 |
| 拖动椭圆轨道判顺逆圈数 | `t2-angular-gesture` | `AngularGesture` 存唯一整数角、半轴和阈值；`PointerInputSource({move:true})` 先逆投影/量化，满圈发具名 Signal。可选 `grabSegment:{startX,startY,endX,endY,radius}` 为相对当前 Transform 锚点的可见棒身胶囊命中区；命中后仍只按轨道角积分，未配置时保留旧环命中。需要键盘等价信号的游戏可另接 keybind，本作炼药已移除 Q/E。 |
| 生活模拟连续方向状态 | `t2-life-continuous-motion` | 高频方向键不用单个 `KeyBinding` 的一拍单 `Signal` 承载多条 delta；宿主向 `InputQueue` 发完整 `life.move.state` 位掩码，系统按 source 取同 tick 最后一份快照原子投影。离散/AI 兼容输入仍可发 `life.move.start/stop` Signal |
| 生活模拟实时可交互集 | `t2-life-activity` | `LifeActivityContext.allowedActions` 仍是静态 zone permission；`affordances` 在 Commit 按当前农田/作物/资源/NPC会话/warp gate 投影 available + 闭集 reason，UI/AI 只读这份数据而不重写规则 |
| 生活模拟行动判定 | `t2-life-action` | `life.action` Signal（source=LifeActor、arg=闭集 LifeAction）在 `t2-life-activity` 后变为一拍 `LifeActionResult`；耕种/采集/对话等效果另由消费能力处理 |
| 固定点一次性建设 | `t2-life-construction` | `constructionProjects[]` 把一个 `building|interactable` placement、非空材料表、可选 access gate 与完成皮肤绑定；近邻 `build` 经 Commit 复检后原子扣料并只写一次 `completed`，Quest/关系继续复用标准 `life-action(build)` |
| 生活模拟对话会话 | `t2-life-talk` + `t3-dialogue` | `interaction.dialogueSessionPolicy` 只可为 `persistent|proximity`；后者让 `t2-life-talk` 按同 tick `LifeActivityContext.nearbyPlacementIds` 结束越界会话，UI 不得私自隐藏而保留权威 session |
| 稀疏农田状态 | `t2-life-farming` | 在 `t2-life-action` 后消费 accepted till/water；仅为实际耕作的 plantable 静态地表创建 `LifeFarmPlot`，并输出一拍 `LifeFarmActionResult` |
| 生活模拟播种 | `t2-life-planting` | 要求已有 **watered** `LifeFarmPlot` + 持有且已选的种子；播种后保留选择，不创建第二个 plot 实体 |
| 成熟作物收获 | `t2-life-harvest` | 在 `t2-life-crop-growth` 后消费 accepted harvest；先以 `invCanAdd` 验证背包，再 `invAdd` 一件目录声明的 crop 物品并移除同格成熟 `LifeCrop` |
| 生活模拟章节 / 任务图 | `t2-life-quest` | 在 `LifeGamePackage.quests` 写严格 chapter→quest→node 图；只用闭集 trigger/condition/effect。解释器按 `priority→questId→nodeId` 稳定裁决，整批预检后原子 Commit；UI/AI 只读 `LifeQuestProjection`，不从 flag 重判剧情 |
| 进入触发区 | `t2-trigger-zone` | 挂 `Tag(ZONE_FLAG)`；靠 overlap-detect 的 Overlap，写 `Trigger` |
| 花费换取 / 一次改多值 | `t2-craft-recipe` | 挂 `CraftRecipe{onSignal,costs,gains}`（商店/合成） |
| 整局流程状态机 | `t3-flow` | 挂 `GameFlow{id,current,states}`；when 复用 `ConditionExpr` |
| GAL 剧情解释与里程碑 | `t3-narrative-director` | 先用 `parseGalPackage` 静态校验；同实体挂 `NarrativePackage{package}` + `createStoryRuntime(package)`。`InputQueue` 发 `narrative.advance`、`narrative.choose`（`arg=option.id`）、`narrative.back` 或 `narrative.read-complete`（`arg=storyRefKey(当前 StoryRef)`）。只读 `NarrativeProjection`；用 `readNarrativeEvents` 读取待投递 `NarrativeOutbox`，宿主**持久化成功后**才在输入流发 `narrative.ack`（`arg=连续前缀序号`），由 Director 在 tick 内确认。队列上限 256，满载拒绝剧情提交，不静默丢失；04A 不直接写 `GalProfile`，接桥留给 04B。 |
| 已提交换场的表现投影 | `NarrativeTransitionPolicy` | 宿主传入已提交 ref、闭集 `cut/fade/wipe/dissolve` 与 `{enabled,reducedMotion}`，再自行 `advance`。关闭或减动都收成 `cut` 终态；回滚、读档、回想和失败先 `stop`。服务不持有包、Profile、计时器或 DOM，不写 World。样例 `src/services/presentation/narrative-transition-policy.test.ts`。 |
| 实体各自读条件施自身效 | `t2-self-rule` | 挂 `SelfRule{when,do,once?}`（自走棋/弹幕群自治） |
| 胜负/占据/到达判定 | `t2-zone-occupancy` | 挂 `Zone{outFlag,矩形,requiredTag,count}`；下游读 outFlag |
| 组数量作为可读数值 | `t2-group-count` | 挂 `GroupCount{countResource,requiredTag}`；阈值配 event-when |
| 演出时序（第 N tick 发什么） | `t3-timeline` | 挂 `Timeline{id,cues:[{at,do}],playOnSignal,skipOnSignal?}`；do=signal/flag/resource/spawn 四闭集；播完发 `timeline:done:<id>` |
| 持续风险 + 时机 QTE + 有序多目标 | `t3-progressive-risk-session` | 配周期/命中窗，只投递 `start/qte-press/continue/withdraw`；系统按固定 tick 判按压/timeout 并发 Signal/回执，调用方不传 hit |
| 持续风险 + 精准 QTE + 隐藏槽位翻格 | `t3-risk-reveal-wheel` | 配槽位组、封锁数、目标目录与整数偏移惩罚；只投递 `start/qte-press/reveal(slot)/withdraw`，系统管理翻格权与终局回执 |
| 离散密码盘 / 滑钮组合猜解 | `t3-discrete-combination-session` | 配 `slotCount/valueCount/initialValue`、可选 `initialStrategy:'random'` 与五个具名 Signal；`setSignal` 只收 `slot:value`，`giveUpSignal` 是唯一 failure 路径；系统用 `RandomSeed` 生成初始向量及不同的隐藏目标，只发整体反馈 |
| 炼药/装配有序动作与圈数 | `t2-ordered-action-session` + `t2-drag-place` | `acceptedActions` 列完整具名动作，`steps[{expectedAction,requiredCount,completedSignal?}]` 按序判定；`completedSignal` 仅正确完成该步后发一次，可被同拍 Effect 扣资源，未配置旧行为不变；每步信号须唯一且不与输入/终局重名。DropZone 可设 `hitShape:'ellipse'` 用 Shape 宽高缩放半轴判锅口，缺省仍 AABB；拖放/KeyBinding 等发 Signal，非玩法 UI Signal 不误杀 |
| 双方同时出招 → 查表定胜负收益 | `t2-matrix-duel` | 对局实体挂 `DuelMatrix{hpResource,throws,beats,payoff,tie,patches?}`，双方实体各挂 `Resource{id:hpResource}` + 本回合 `DuelIntent{throw}`；两侧齐备即结算（写 ResourceModify + 发具名 Signal + 清 intent）。遗物/变体 = `patches` 三闭集（改克制 / 改收益 / 增设一手），坏补丁装载期拒收（`validateDuelMatrix`）。AI 选招 / 手牌 / 押注不归它 |

## ② 样例指针

### 透明贴图命中（REQ-ENG-ALPHA-HIT-MASK）

作者态用 `bakeHitMaskFromPng`（`src/assets/import/hit-mask.ts`）从 PNG alpha 烘焙 `version:1,width,height,threshold,sourceTextureKey,rows`，在游戏本地 AssetIndex 登记 `type:'hit-mask',status:'filled',spec:<烘焙结果>`，无需 `path`；源 texture 须同索引已填充，且必须声明与 mask 精确相等的原生 `spec.width/height`。实体用 `Clickable{action,hitMaskKey}` + 相同 `Sprite.textureKey` + `Transform`；装载时调用 `parseManifest(raw,{assetIndex:parsedIndex})`，同步和异步门面共用绑定逻辑。输入仍是世界坐标 `InputQueue`，输出仍是具名 `Signal`。没有 `hitMaskKey` 的旧 Shape AABB 路径不变。

遮罩只存二值玩法数据，不携带 PNG/URL/Canvas 或 RGB 渲染字节；`cover/contain`、锚点和缩放与 Sprite 绘制共用纯数据布局。v1 仅支持 `Transform.rotation===0`，非零旋转与缺失/非法/尺寸或贴图不符均 fail-closed，并在开启 `DebugTrace` 时记 `reject`。触控/鼠标同走世界坐标；键位由 `t2-keybind` 产生同名 Signal。

- registry：`t2-event-when`/`t2-effect-apply`/`t3-flow`/`t3-timeline` 的 `describe.examples`。
- 真实用法：`games/game-g/flow-walk.test.ts`（流程机）、`games/game-i/fsm-lab.ts`（状态机台）。
- UI 侧信号入队见 ui.md（`mountUI` 的 `ActionSink`）。

### 演出时序（timeline·管「何时」）

- **flow vs timeline**：flow=状态机（分支/门控/流程），timeline=固定节拍编排（第 N tick 发什么）。转场/开场三连 cue/演出节拍用 timeline；胜负流程/回合状态用 flow。
- **timeline 管「何时」、tween / presentation-track 管「怎么动」**：cue 只发 `Signal`/写 `Flag`/写 `Resource`/发 `SpawnRequest`（四闭集）；单段单字段由 `t1-tween`，多段并行和统一跳过终态由 `t2-presentation-track` 消费具名 Signal。handler 里绝不塞自由演出逻辑。
- **快进**：`skipOnSignal` 一 tick 内按序补发全部剩余 cue，**终态与逐 tick 播放完全一致**（回放安全）。**绝不走墙钟**：游标 t 按 tick 推进。

## ③ 本线红线

- **handler 里绝不塞自由逻辑**：UI/交互只发具名 `Signal`，一切世界改动由 effect/craft/flow 等能力在 sim 里做。
- 条件用 `ConditionExpr`（event-when/flow 复用），不各写一套判定。
- 概率门用 `chancePass` 种子化（randomness.md），**禁裸 `Math.random`**。

## ③′ ⚠ 全局 id 路由 vs 按侧寻址（**对称双方玩法头号坑**·2026-08-07 立·五次事故换来）

> 症状永远一个样：**不报错、就是不生效**。写的人以为接上了，跑起来静悄悄。

引擎里「谁被作用」绝大多数是**全局 id 路由**：`Effect.targetId`、`ConditionExpr{kind:'resource',id}`、`ProgressBar.bind` 都按一个字符串找目标、**没有 `entity` 字段**。单主角天然对；一旦做**对称双方**（对战/双打/多座），两侧常必须共用同一 id（解释器按侧 local 寻址），全局路由就**分不清哪一侧**。
game108 一个游戏撞了五次，全是这条：

| 想干的事 | 撞在哪 | 解法 |
|---|---|---|
| 伤害按出手方蓄力缩放 | `payoff` 两侧共用，`scaleByResource` 只吃一个字符串 | 引擎加 `perSide` 相对名（运行期拼 `<侧>.<相对名>`） |
| 出过的手清零 | `Effect.targetId` 全局，分不清清哪侧的槽 | 收进解释器当结算副作用（它才知道谁出了什么） |
| 血量归零判负 | `ConditionExpr` 的 resource **无 `entity` 字段** | **重组**：各侧 `t2-self-rule` 读**自身** → 置各侧唯一 id 的 Flag，再按该 flag 读 |
| 血条绑世界值 | `ProgressBar.bind` 是全局 resourceId | 不 bind，宿主投影按侧填 |
| 玩家动作接进接缝 | **反过来**：消费方按 `Signal.source` 认侧，而「一动作一个 `kb-*` 实体」让 source 永远是 kb 实体 | `KeyBinding.source` 代发 |

**开工前自问三句**（比事后查省一整轮）：① 目标两侧会不会**同名**？同名就别指望全局 id 分得清。② 要读的是「世界上某个 id」还是「**这一侧自己的**」？后者用 `t2-self-rule`，或让各侧持一个
**各侧唯一 id** 的中间物（Flag/Resource）当转接口。③ 我的消费方若按 `Signal.source` 认人，
**输入侧接得上吗**？—— source 默认是 kb 实体不是行为主体，要认人就填 `KeyBinding.source`。

**给写引擎能力的人**：新解释器若按 source/按侧路由，**必须在 `whenToUse` 写清「上游怎么把 source 填对」**，
且**输入接缝要和输出一起设计**——game108 的 ENG-02(输出)与 ENG-04(输入接不上)本该是同一张单，
拆成两轮就是因为第一轮只想了输出。对不上时是**静默**的。

## ③″ 日志基准（写规则解释器必接）

带逻辑的判定/路由代码**同提交接 trace**（CLAUDE.md 日志基准守则）：`src/skills/debug-trace.ts` opt-in 零开销，「什么都没发生」的分支必记 `reject`；样板 `matrix-duel.test.ts`。

## ④ 正样例 / 反面教材
- ✅ `src/skills/tier2/event-when.ts` + `effect-apply.ts`：条件→信号→效果全数据。
- ✖ 在点击/按键回调里直接改 Resource/State（绕过信号入队 → 破确定性、AI 复用不了）。

## ⑤ 查不到怎么办

现有条件算子/效果 kind 表达不了的规则 → `docs/workflow/requests.md` 提缺口（先看 event-when `when` + effect kind 能否重组）。**不在游戏层写规则 system。** Life 的 `landmarkPlacementId` 只把 warp 与可见出口地标绑定，不是触发器；warp 仍由既有 E/鼠标显式 action 进入信号队列，renderer、碰撞重叠或地标 placement 不得自动写世界/传送。
