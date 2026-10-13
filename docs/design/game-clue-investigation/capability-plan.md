# 能力总览 Capability Plan — `game-clue-investigation`《现场搜证》

> S2 冻结稿，2026-10-12。S1、S2 均已获 Owner 控制台阶段签核；`GCI-S2-01/02` 两项通用引擎能力均已实现并经非施工者独立复查 PASS，DokiWorld 输入输出设计合同已冻结，S3 已解锁。

## 1. 游戏一句话

DokiWorld 提供一张静态调查现场和有序对象数据；玩家以鼠标、触控或键盘调查普通物件与线索物件，首次收录全部 `required` 线索后返回唯一 `completed` 结果，主动离开则为 `cancelled`，宿主独自解释知识、任务与奖励。

定稿原型基准：`prototype.dc.html` 的 1440×900 单场景、七物件、普通记录、线索特写/收录、完成与退出确认九态。正式实现只重组引擎数据能力，绝不复制原型的 DOM、CSS、Canvas 或定时器逻辑。

## 2. 消费的引擎能力（对照 capability registry 实名）

| capability（注册名） | 用来做什么 | 状态 |
|---|---|---|
| `t2-clickable` | 世界坐标命中 → 具名调查 Signal；键鼠触控统一输入入口；可选预烘焙二值 hit-mask 进行透明 PNG 实形命中。 | ✅ 已扩展并独立复查；缺/坏/贴图不符与非零旋转均 fail-closed。 |
| `t2-event-when` | 当“已收录必需线索数”达到要求时，以 edge 信号启动完成流程。 | ✅ 现有 |
| `t2-effect-apply` | 响应调查/收录/退出 Signal，声明式设置 Flag、Resource 与 State。 | ✅ 现有 |
| `t3-flow` | `scene-idle → flavor-result / clue-reveal → clue-collected → completed / cancelled` 的离散状态机；重复线索按已收录 Flag 路由为回看而不结算。 | ✅ 现有 |
| `f1-resource` | `required-collected` 与 `required-total` 的有界整数；HUD 进度只读取这些数据。 | ✅ 现有 |
| `f2-flag` | 每对象 `viewed` / `collected`、演出锁、资源失败与取消语义。 | ✅ 现有 |
| `j1-state` | 世界与对象的可见离散状态投影，供流程、表现与无障碍文本读取。 | ✅ 现有 |
| `t3-timeline` | 调查与收录在固定 tick 的何时：锁输入、发揭示/收录/完成 cue，`skipOnSignal` 直达同一终态。 | ✅ 现有 |
| `t1-tween` | 单字段淡入/位移/缩放表现；不驱动任何 Condition 读取的玩法数据。 | ✅ 现有 |
| `t2-presentation-track` | 线索图抬升、印章、完成卡等多字段并行表现，固定 tick、可跳过、自然/跳过同终态。 | ✅ 现有 |
| `l1-sprite` | 场景、对象及线索特写的贴图 key 消费；保持 `Sprite + Transform + Shape` 的可替换视觉槽。 | ✅ 现有 |
| `l2-color` | 可见性/透明度表现，交给 `t1-tween` 投影。 | ✅ 现有 |
| `t2-keybind` | Escape 与键盘确认相关的具名 action；焦点 UI 本身仍由 LayoutNode 的 `ActionSink` 入队。 | ✅ 现有 |
| `t2-text-binding` | 将 `required-collected / required-total` 投影为 HUD 数字；文字模板不承担完成判定。 | ✅ 现有 |
| `GCI-S2-01` | 可数据声明的透明 PNG alpha hit-mask。 | ✅ Owner 已选 A；`REQ-ENG-ALPHA-HIT-MASK` 已施工且独立复查 PASS，证据见 `review/REQ-ENG-ALPHA-HIT-MASK-independent.md`。 |
| `GCI-S2-02` | 将 DokiWorld 单次启动传入的动态 HTTPS PNG 与宿主预烘焙二值 mask 安全桥接为渲染 key 与可点击 mask key。 | ✅ Owner 已选 A；`REQ-ENG-HOST-VISUAL-HIT-MASK` 已施工且独立复查 PASS。 |

不消费随机、战斗、AI、卡牌、寻路或存档能力；首版无任何随机规则，故不创建 `RandomSeed` 作为伪装性接入。

## 3. 摆成数据的规则面

| 数据表 | 内容 | 谁解释它 |
|---|---|---|
| `InvestigationScene` | 稳定 `investigationId`、标题、目标、背景皮肤槽、对象顺序、必需总数与静态逻辑画布。 | Manifest/宿主合同校验器；`Sprite` 与 `LayoutNode` 只消费已归一数据。 |
| `InvestigationObject[]` | `objectId`、`kind: flavor|clue`、名称/描述、`required`、场景与证物皮肤槽、z-order、声明式 hit geometry。 | `t2-clickable` + `GCI-S2-01`；宿主动态 PNG 经 `GCI-S2-02` 的通用桥生成临时稳定 texture/mask key，随后只发具名 Signal。 |
| `CollectionProjection` | 每个对象的 `viewed/collected` 状态、`required-collected` 资源和已收录顺序。 | `f2-flag`、`f1-resource`、`t2-effect-apply`；`t3-flow` 用条件表达式读取。 |
| `InvestigationFlow` | idle、普通记录、线索揭示、收录、完成、取消与资源失败的状态、转移和 onEnter 效果。 | `t3-flow`，不写游戏层状态机。 |
| `PresentationCues` | 按下、锁输入、证物抬升、盖章/进度、完成卡的 tick、并行轨道和跳过终态。 | `t3-timeline` + `t1-tween` / `t2-presentation-track`；`VisualEffect` 仅用闭集。 |
| `UiProjection` | 顶部目标/进度、线索清单、档案条、特写 Modal、退出确认与 reduced-motion 的 LayoutNode 树及 action 名。 | `LayoutNode` + `mountUI`/`ActionSink`；按钮只发 Signal，不含业务 handler。 |
| `OutcomeContract` | `doki.game.clue-investigation-input/result` v1；`preview`、`completed`、`cancelled` 与非法/资源失败的无成功语义；`completed` 只携带 `requestId`、稳定 `investigationId` 与首次收录的 clue ID。 | `dokiworld-contract-v1.md` 的严格闭集冻结稿；S7 由真实 parser、manifest 与 SDK 宿主测试逐字实现，不由游戏写宿主状态。 |

首次收录的幂等性由对象 `collected` Flag 作为转移门：未收录的 clue 才执行 `required-collected += 1`，已收录 clue 仅进入回看态；普通对象只写 `viewed`，不触碰进度。完成条件由 `EventWhen{resource: required-collected >= required-total, mode: edge}` 发信号，随后由 `t3-flow` 进入唯一成功状态。

## 4. 申请的游戏层代码例外（逐条过审）

| 例外 | 为什么现有能力表达不了 | 预计行数 | Lead 裁决 | 偿还计划 |
|---|---|---:|---|---|
| 无 | 不申请游戏层自由代码、DOM、Canvas 或自写状态/命中解释器。`GCI-S2-01/02` 均走通用引擎能力 A，不得在本游戏实现。 | 0 | 接受；Owner 已批准 S2 | 不适用 |

## 4.5 美术接入

- 皮肤槽：`scene/background`、每个 `object/<objectId>/scene`、每个 clue 的 `object/<objectId>/evidence`、HUD/印章/按钮的主题皮肤槽；正式实体消费 `Sprite.textureKey`/`skinKey`，均须优先通过本地 `skinMap`/资产索引解析，硬编码路径只允许作回退。
- 原型的八张 AI 图仅是定稿设计参考，尚未登记为生产资产；S6 由资产管理线将已审批素材进入游戏本地索引和 `art-ledger.json`，每一行必须回指上述真实消费槽，禁止孤儿。
- 背景无图时可以保留可替换的程序化回退，但不得以纯色块作为终态；任何新素材先入待审区，人工批准后才入索引。

## 4.6 UI 呈现 · 华丽起手

- house 主题：正式调查现场采用 `apolloOnyx`；它与定稿的深色档案现场一致。不是自写主题。
- 起手包：主菜单/结算不使用空白屏；若 App 需要独立进入/重置页，使用 `@ui/starters` 的 `buildStarterHome` / `buildStarterResult` 作为富屏骨架。现场内 HUD、档案条、证物 Modal 与退出确认由 LayoutNode 闭集按原型 1:1 重组。
- 成熟件：主 action 用 `Button.kind:'hero'` + `sheen-hover`；线索特写/退出确认用 `Modal`；完成态使用 `Particles`（stars/sparkle）与 `Label.format` 的进度投影；完成印章/证物使用 `t2-presentation-track`，而不是自由 CSS 动画。S4 固定信息层级，S5 才调整贴图、纹样与粒子密度。

## 4.65 对手/敌人 AI 设定

无对手、敌人或 NPC 决策；不消费 AI capability。

## 4.7 代码准入阶梯申报

| 规则 | 落级 | 说明 |
|---|---|---|
| 场景/对象/线索与必需标记 | L0 纯数据 manifest | 宿主给受限对象表；游戏只消费稳定 ID 与声明式状态。 |
| 普通查看、首次收录、重复回看、完成与取消 | L1 数据 + 现有 capability 重组 | `t2-clickable`、Flag/Resource、`t2-event-when`、`t2-effect-apply`、`t3-flow`。 |
| 收录与完成的时间/表现 | L1 数据 + 现有 capability 重组 | `t3-timeline` + `t1-tween` / `t2-presentation-track`，固定 tick。 |
| PNG alpha 像素命中 | L1 数据 + 通用能力 | `GCI-S2-01` 已走 A：`hitMaskKey` 绑定预烘焙 hit-mask；禁止 L3/L4。 |
| 宿主动态 PNG 的 alpha 命中 | L2 接入 + 通用能力 | `GCI-S2-02` 已走 A：宿主视觉输入先经通用桥验证并生成临时稳定 key；World/输出不含 URL/像素字节。 |
| 宿主严格输入输出合同 | L2 接入合同 | `dokiworld-contract-v1.md` 已按现行 SDK 模板冻结字段、预算、preview/completed/cancelled 与权威边界；`GCI-S2-02` 已独立复查，正式 parser/manifest 留在 S7 实现。 |

L3 受控 TS 卡带和 L4 自由代码均不申请。

## 5. 确定性声明

- 随机源：首版没有随机规则；不调用 `Math.random`、墙钟或任意随机 capability。演出以固定 tick 的 `Timeline`/`PresentationTrack` 推进。
- 回放 / 双人同步 / lockstep：首版不提供联机；仍保持对象 ID、有序表、Signal 与状态转移的确定性。输入先投影为逻辑世界坐标，渲染/贴图字节不进入业务结果 hash。
- 资源/非法输入失败：缺失/不可用资产绝不转化为 `completed`；走 `cancelled`/可见失败投影。若 A 路 alpha mask 无法被验证或解码，必须 fail-closed，不能退化为扩大点击框。

## 6. 评审记录

- 提交人 / 日期：Codex / 2026-10-12
- S1-P 定稿依据：Owner 判词“好的，原型通过，接下来可以参考原型开始正式的游戏实现”。
- Lead 技术判断：**接受**。两项 capability 均已按 Owner A 路进入引擎并独立复查 PASS，严格 DokiWorld 输入输出设计合同已冻结；无游戏层代码例外。S1、S2 已由 Owner 控制台批准，允许进入 S3。
