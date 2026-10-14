# 历史快照 · 非当前施工依据

# `game-clue-investigation`《现场搜证》施工单与需求池

## S5 领工声明 · 2026-10-13

- 启动词：Owner 已通过游戏流程板 S4 人门；本聊天领 S5 UI 关，施工主体为本聊天（Codex 主施工者），复查另由非施工者执行。
- 基线：`board game-clue-investigation` 显示 S1–S4 人门已绿、S5 待施工；`manifest.json` 为 1440×900 `apolloOnyx` 灰盒结构，定稿原型与真卡带同画布对照见 `self-check/shots/S4-00-prototype-*.png`、`S4-*.png`。已目击原型/正式 idle、flavor、reveal、completed：布局与路径同构，但正式 HUD 字色、档案条、证物纸张/按钮与完成卡观感明显偏离。
- 允许边界：只改本游戏 `library/game-clue-investigation/manifest.json` 中 `presentation.ui` 的 LayoutNode 视觉数据、必要本游戏定向测试与 `docs/design/game-clue-investigation/{requests.md,self-check/,review/}`、合法流程门与路线图证据。不得修改共享 UI/引擎、原型、S6 正式素材索引、其它游戏、Owner 人门或远程状态。保持 S4 世界规则与交互动作不变；游戏哈希变化后按流程重跑过期门证。
- 验收：按定稿原型同画布复刻 HUD、底部档案条、证物特写、收录、完成和退出 UI 的字体/配色/纹样/交互反馈；`validateLayoutNode` 零 issue、深/亮对比与重叠审计、真浏览器九态/键鼠触控与终局出口、S5 对齐单零未裁决偏差、S5 机器门及异人复查。正式场景/证物 PNG、alpha 洞与资产来源审批明确留在 S6。

## S4 领工声明 · 2026-10-13

- 启动词：Owner 已在游戏流程板通过 S1–S3 人门；本会话领 S4 玩法关。
- 施工主体：本聊天（Codex 主施工者）；复查必须另由非施工者承担。
- 代码基线：S3 `library/game-clue-investigation/manifest.json` 为七对象灰盒；`games/game-clue-investigation/s3-skeleton.test.ts` 仅断言骨架，不含 S4 结果接线。流程板 `next=S4`，S1–S3 `human=ok`。
- 设计稿目击：2026-10-13 真浏览器目击 Owner 已定稿 `prototype.dc.html` 的雨夜书房、顶部目标/0⁄2 进度与七个对象；定稿尺度与九态以 `prototype-notes.md` 为准。当前浏览器窄视口仅显示等比舞台左上区，完整 1440×900 截图另列 S4 自证。
- 本单允许改动：`library/game-clue-investigation/manifest.json`、本游戏专属 S4 测试/验收适配、`docs/design/game-clue-investigation/{requests.md,acceptance/,self-check/,review/}`、必要的本游戏局部 UI 数据与审计文件、`public/games/game-clue-investigation/probe/` 的机器证据。禁止触碰其他游戏、共享引擎、远程 Git/数据库与 Owner 人门；如实查发现引擎缺口，先按 A/B 闸停写该部分。
- 验收：普通调查不计数；线索首次收录、重复回看幂等、两条必需线索完成、主动取消；指针/触控/键盘可达且玩家看得见反馈；GD ≥3 验收剧本、bench 五轴、真浏览器截图序列、结构 1:1 对齐、S4 机器门与非施工复查。

## 当前阶段

- 阶段：游戏流程板 S1–S4 人门均已由 Owner 签核；当前 S5 UI 关由本聊天施工。S2 的 `j1-state`/Resource 条件关注仍见 `review/S2-stale-independent-2026-10-13.md`。正式 PNG、alpha 透明洞、来源许可及逐张审美审批归 S6，不在 S5 伪签。
- 正式游戏：`library/game-clue-investigation/manifest.json` 已有 S4 纯数据玩法/UI 与灰盒反馈；不得冒称 S5/S6 原型视觉 1:1 或已验 PNG 实形素材。S3 证据见 `review/REQ-S3CLICK-independent.md` 与 `review/REQ-S3CART-RENDER-independent.md`；S4 自证见 `self-check/S4-alignment.md`。
- `capability-plan.md`：S2 设计合同已冻结；Owner 对 `GCI-S2-01` 与 `GCI-S2-02` 均选 A，通用能力已实现并经非施工者独立复查 PASS。
- 已满足依赖：`REQ-ENG-ALPHA-HIT-MASK`（预烘焙 PNG 实心 alpha 像素命中），复查证据为 `review/REQ-ENG-ALPHA-HIT-MASK-independent.md`。线索收录会话、完成判断与演出可由现有能力重组。
- S2 依赖现状：`REQ-ENG-HOST-VISUAL-HIT-MASK` 已施工且非施工者独立复查 PASS；`dokiworld-contract-v1.md` 已冻结字段、预算、权威与终局语义。真实 parser/manifest 属 S7 实现与交付门，不与 S2 设计冻结形成循环。

## GCI-S4-UI-01 · 数据卡带的 LayoutNode 可玩界面接缝（Owner 已选 A；通用桥独立复查 PASS）

- 状态：通用桥独立复查 PASS（该结论**仅限桥，不含本游戏 S4**）；施工主体：`引擎程序`聊天负责共享引擎，本会话仅负责本游戏数据/UI 消费与接线。Owner 2026-10-13 已明确选择 A；本游戏已通过真实浏览器 1440×900 与 720×800 视觉/指针/键盘链，仍须完成本游戏自证与复查。
- 实查：`src/studio/cart-run-core.ts` 的 `runBlueprintInto` 只创建 `Engine`、`CanvasRenderer({width:vp.w,height:vp.h})` 与 `PointerInputSource`；`RUN_VP={w:960,h:600}`，未装载 UI 树、`mountUI`、`ActionSink` 或世界→HUD 投影。`src/studio/DataCartridgeRunner.tsx` 的 `RunOnly` 默认用该视口，`src/cartridge-inline-run.ts` 亦复用同核。`src/assembly/manifest-core.ts` 的 manifest 装配只有 capabilities/entities；registry 中没有卡带 UI 装载 capability。已查 `docs/playbooks/{ui,rendering-fx,events-logic,assets,pick-list}.md`：LayoutNode 与 Canvas 各自可用，但现有卡带路径没有把前者接上后者，也没有 1440×900 画布合同。`npx vite-node scripts/dump-capability-catalog.mjs --json` 在本机因该脚本 realpath EPERM 未完成，故以 registry 源码和实际运行核为依据。共享工作树大量未提交变更，未执行 `git pull` 以免覆盖他人现场。
- A（推荐）：引擎层增加通用**声明式卡带 UI/视口宿主桥**：manifest 或邻接严格数据指定 1440×900、LayoutNode、主题、世界只读绑定与 ActionSink→InputQueue；共用在线/内联卡带运行核，场景与 UI 同一缩放坐标。代价：改装配 schema、卡带宿主/渲染/UI 接缝和测试；影响所有 opt-in 数据卡带，默认旧卡带不变。通用性高；若选错，可能把 UI 词表绑死在卡带格式并增加维护面。
- B：本游戏申请受控**专属宿主薄适配代码**（不写规则，只组合已存在 `mountHost`、`CanvasRenderer`、`mountUI`、`ActionSink` 与世界只读投影），从 library 卡带改为可被 launcher 加载的工程游戏，规则仍留纯 manifest。代价：要改 launcher 入口和游戏宿主模块；影响仅本游戏但违背当前 capability-plan 的 0 行游戏层例外与“卡带”路线，须先改 plan 并重新审批。选错会留下每个类似 DokiWorld 游戏都重复写一层宿主的债。
- 裁决结论：Owner 选择 A。共享引擎锁与施工由引擎程序承接；本会话已完成纯 manifest 规则、5 份 GD 剧本适配与真浏览器结构对齐，桥独立复查只证明通用能力，不代替本游戏 S4 复查。

## GCI-S4-POINTER-02 · alpha 实形热点的鼠标悬停/按下可见反馈（Owner 已选 A；共享能力独立复查 PASS）

- 实查原文：`src/skills/tier2/clickable.ts:115–129,147–168` 对 down 命中在 sim 内按已绑定 `hitMaskKey` 调 `maskedHit`，透明像素拒收、缺遮罩 fail-closed；它没有 hover/pressed 对外状态。通用桥 `src/studio/cart-run-core.ts:183–222` 的 `focusTargets` 只给键盘焦点标签，并无 `pointermove/down` 外观投影。`docs/playbooks/rendering-fx.md` 与 `docs/playbooks/pick-list.md` 只提供已有 Canvas render 组件、具名点击 Signal；`docs/playbooks/ui.md` 的按钮 `:hover/:active` 只适用于 LayoutNode Button，不能复用到 Canvas alpha 实形对象。实际 S4 浏览器截图 `self-check/shots/S4-01-idle.png` 与键盘 `S4-10-keyboard-reveal.png` 证明点击与焦点路径可用，但鼠标悬停/按下仍无原型的同形描边/标签/压缩反馈。若在宿主按外接矩形重算 hover，会与正式 PNG 透明像素点击分叉，不能算重组成功。
- A（推荐）：在共享 2D 命中能力内抽出**只读同源 hit-test 结果/表现投影**，让 `pointermove/down` 与 `Clickable` 消费同一 alpha 遮罩、zOrder 和 cover/contain 映射；表现层按闭集样式给 hover 标签/描边、press 瞬态，世界规则仍只认具名 Signal。代价：改共享输入/渲染接缝和测试；影响所有 opt-in Canvas 热点；通用性高。选错会让输入热路径背上额外投影成本，需明确默认关闭和性能预算。
- B：申请本游戏独有宿主适配代码，复制或特化 alpha 命中投影并为七个对象生成 hover/press 反馈；游戏规则仍在 manifest，例外写入 `capability-plan.md` 留债。代价：改游戏宿主接入与例外审计，容易与引擎命中语义、资产映射、旋转 fail-closed 后续演进分叉；只供本游戏复用。选错会重复此前“方框比 PNG 宽”的用户已否决体验，后续仍须回补 A。
- 裁决结论：Owner 2026-10-13 选择 A；共享能力已由非施工者独立复查 PASS，证据见 `review/REQ-GCI-POINTER-PROJECTION.md`（定向 42/42、真浏览器 5 轮、touch、锚点撤修）。本游戏已声明 `pointerFeedback` 金色/145ms，灰盒同一茶杯真实浏览器 hover/pressed 断言及截图 PASS；**正式 PNG 未在 S6 接入前，不把本游戏透明区/视觉 1:1 标为完成**。共享工单因全库其他项目 depcruise 仍 blocked，不冒称全库门禁通过。

## GCI-S4-UIWALK-03 · 通用走查对卡带 0/91 假绿（Owner 已选 A；共享适配器独立复查 PASS）

- `node scripts/ui-walkthrough-probe.mjs --game game-clue-investigation` exit 0，但落盘 `S4-uiwalk.json` 的 91 个 signal 全因 `__zcProbe` 缺失而未驱动；`game-pipeline.mjs` 明示“0% 只报不拦”。本游戏独立真实浏览器鼠标/触屏/键盘旅程 PASS 不能被此通用探针的 exit 0 替代。
- Owner 2026-10-13 选择 A：共享卡带 dev-only 动作读口与通用探针真实 LayoutNode/Canvas 手势，缺失/不支持显式诊断。共享施工主体 `引擎程序` 已完成并获非施工者独立复查 PASS，证据见 `review/REQ-CART-UIWALK-ADAPTER.md`；本游戏合法重跑 S4 gate exit 0、当前 gameHash `a96dcb6bf2a87bb7`，可驱动率 100%（42/42 真动作，49 个 waitUntil 不入分母，18 个世界断言仍由 GD runner 核）。原非施工复查人已依新证据重审并经合法 CLI 将 S4 复查更新为 PASS，见 `review/S4-preliminary-independent-2026-10-13.md`；Owner 人门仍待审批。

## S4 世界层接线实证 · 2026-10-13

- `j1-state` 与 `t3-flow` 在严格 World 同处 Update 时触发 `flow ↔ state-sync` 组件推断软环，定向测试曾 3/4 红；“选中物件”只是有限 0–7 枚举，故重组为 `f1-resource` 的 `selected-object`，由现有 `KeyBinding`、`Effect` 与 `GameFlow` 解释，无游戏专属 system 或共享引擎改动。这是 S2 plan 中 `j1-state` 消费方式的 S4 实现偏差，不改变视觉/玩法合同；数值词表：0 无、1 窗锁、2 书架、3 挂钟、4 茶杯、5 地毯、6 湿脚印、7 信件。
- `npx vite-node scripts/acceptance-run.mjs --game game-clue-investigation`：5 份 GD 剧本、67 检查点 PASS（含完成/取消后重开）；`npx vitest run games/game-clue-investigation/s3-skeleton.test.ts games/game-clue-investigation/s4-interaction.test.ts`：2 文件 9/9 PASS。覆盖真实世界坐标指针、弹层时热点冻结、重复收录幂等、同轨 hash 与 LayoutNode 零 issue。`bench-manifest` 95/100 PASS；ESLint 定向 exit 0；`game-skill-audit` 零红旗、黄色缺正式美术台账（S6 范围）。完整 UI/浏览器证据见 `self-check/S4-alignment.md`。
- 撤修验红：先精确断言 `effect-lock-count` 原值为 `1` 的唯一锚点命中数=1；临时改为 `0` 后验收 exit 1，第 02/03/05 剧本转红，必需线索从 0 无法到 1，完成无法达到 2/2；恢复 `1` 后同一命令 exit 0、5/5 PASS。临时撤修已完全恢复。

## GCI-S2-02：宿主动态 PNG 的实形命中桥（Owner 已选择 A）

### ① 实查证据

- `dokiworld/game-card-reveal/src/card-assets.ts` 已证明：宿主 HTTPS 图片可以在**渲染侧**注册为稳定 `host-card:<index>` key，游戏 World 与输出均不写 URL。
- 但 `REQ-ENG-ALPHA-HIT-MASK` 的已交付契约只接受资产索引中的预烘焙 `hit-mask`；`src/assets/asset-index.ts` 要求 mask 绑定已填充 texture，并由 `manifest-core.ts` 在装配期校验纹理原生尺寸。它不能消费一次 DokiWorld launch 带来的临时 URL，也不能在运行时从图片字节读取 alpha。
- 所以，已有能力能表达“动态图片显示”或“静态资产索引的 alpha 命中”，**不能**表达定稿原型要求的“宿主传入动态透明 PNG、位置与真实轮廓命中”，且不得让游戏层自行 Canvas 解码或把 URL/像素写进 World。

### ② Owner A/B 裁决项

| 路线 | 内容 | 代价与影响面 | 通用性 / 选错代价 |
|---|---|---|---|
| A：补引擎能力（推荐） | 增加通用“宿主视觉资产桥”：装配前在渲染侧加载受限 HTTPS 纹理，并消费宿主预烘焙、尺寸受限的二值 mask 数据（不在 sim 解图）；只把临时稳定 texture/mask key 与已校验的逻辑尺寸交给 World。无 mask/CORS/尺寸不符一律 fail-closed。 | 涉及 Doki adapter、资产桥、`t2-clickable` 运行期 mask catalog、严格 payload/尺寸限制与跨分辨率测试。 | 任何宿主可配置的异形 PNG 互动均可复用；若缺省处理不严，会把远程资源或渲染字节带入确定性面。 |
| B：收缩正式合同 | 动态宿主对象只允许 `rect|circle` 形状；alpha hit-mask 只允许本地已登记资产，动态 PNG 不做真实轮廓命中。同步修订 S1-P 的 1:1 目标并重新定稿。 | 无新引擎面，但动态异形物件重新出现矩形抢点风险。 | 可立刻实现；若实际内容仍需要异形点按，之后仍须重开 A，且原型定稿会失效。 |

**Owner 裁决**：选择 **A**。这是 DokiWorld 内容配置型游戏可复用的宿主-渲染边界；动态 PNG 的实形点击是用户已经定稿的体验，不在本游戏用自由代码旁路。`REQ-ENG-HOST-VISUAL-HIT-MASK` 已完成施工自检与非施工者独立复查 PASS；证据见 `review/REQ-ENG-HOST-VISUAL-HIT-MASK.md` 与 `review/REQ-ENG-HOST-VISUAL-HIT-MASK-independent.md`。该能力缺口已关闭，但 S3 仍受 S1/S2 Owner 控制台人门阻塞。

## S1-P-01：1440×900 调查原型

### 1. 唯一目标

制作一份可离线直接打开的单文件 HTML 原型，验证“场景探索 → 普通调查反馈 → 线索特写收录 → 找齐必需线索 → 完成”的完整体验。原型只定义目标画面、状态与时序，不是生产实现。

### 2. 文件范围

本单只允许创建或修改：

- `docs/design/game-clue-investigation/prototype.dc.html`
- `docs/design/game-clue-investigation/prototype-notes.md`
- `docs/design/game-clue-investigation/ui-refs/**`（仅本地原创占位或验收截图）

禁止修改 `games/**`、`src/**`、`public/games/**`、`dokiworld/**`、SDK、manifest、构建与发布脚本。

### 3. 原型场景内容

使用原创占位的“雨夜旧书房 / 档案室”调查现场，至少放置：

| 物件 | 类型 | 作用 |
|---|---|---|
| 破损窗锁 | clue / required | 线索特写：窗锁被从内侧撬动 |
| 桌上湿脚印 | clue / required | 线索特写：鞋底纹与窗边泥水 |
| 半烧毁信件 | clue / optional | 线索特写：残留日期与署名 |
| 书架 | flavor | 普通调查描述 |
| 挂钟 | flavor | 普通调查描述 |
| 茶杯 | flavor | 普通调查描述 |
| 地毯或壁画 | flavor | 普通调查描述 |

文案只用于验证信息密度，不建立 DokiWorld 正式剧情。

### 4. 必须可交互的状态

1. `scene-idle`：主场景、调查目标、`0 / 2` 必需线索进度、线索清单与退出入口。
2. `object-hover`：物件出现高对比但克制的轮廓 / 标签；不能靠光标变化作为唯一提示。
3. `object-pressed`：按下有明确压缩 / 闪光确认，避免“点了没反应”。
4. `flavor-result`：普通物件轻推焦点并显示短描述；点击空白或继续键返回。
5. `clue-reveal`：背景压暗，线索图片从物件位置或画面中心抬升，名称与简述清楚可读。
6. `clue-collected`：盖章 / 收录标记、进度更新和线索清单新增并行发生；重复点击只回看，不重复进度。
7. `completed`：第二条必需线索收录结束后进入完成态，明确告诉玩家“现场调查完成”。
8. `exit-confirm`：主动退出确认；取消返回原场景，确认仅表示取消演示，不展示失败结果。
9. `disabled`：演出提交期间其它热点短暂不可操作，并有可见但不刺眼的禁用态。

### 5. 关键演出时序

- 普通物件：按下确认 `100–160ms`；焦点轻推 `180–260ms`；描述出现 `180–240ms`；玩家确认后 `160–220ms` 返回。
- 线索取得：按下确认与物件闪光同时开始；`180–260ms` 后压暗现场并抬升证物；证物至少稳定展示 `700ms`；收录盖章与进度更新并行 `320–480ms`；总链目标 `1.2–1.8s`。
- 完成：最后一条线索的收录反馈不能被完成屏截断；收录稳定后再进入 `600–900ms` 的完成演出。
- reduced-motion：取消大位移与闪烁，保留状态切换、文字、进度与最终结果，语义顺序不变。
- 动画不得使用墙钟决定调查规则；原型可用定时器回放，正式实现必须由已提交状态驱动表现。

### 6. 布局基线

- 固定逻辑画布 `1440×900`，浏览器仅等比缩放，不按 810×506 重排逻辑布局。
- 场景图片占满画布；顶部左侧显示场景名与目标，顶部右侧显示必需线索进度。
- 线索清单入口和退出放在安全区内，不遮挡主要热点。
- 描述区使用画面下方约 18% 高度的档案条，但不能永久挡住热点；关闭时完全收起。
- 线索特写主体约占画面高度 52–64%，图片、名称、描述和确认入口均不得越界。

### 7. 可发现性与无障碍

- 鼠标悬停、触控探索与键盘焦点必须有等价可见反馈。
- 不允许只靠颜色区分普通 / 线索 / 已收录；至少结合图形、标签或状态徽记。
- 热点真实命中区应适当大于可见轮廓，但不能覆盖相邻物件导致抢点。
- `Tab` 可遍历全部物件与固定按钮，`Enter/Space` 激活，`Escape` 关闭当前弹层或打开退出确认。
- 所有占位图片提供可理解的替代文本。

### 8. 审阅控制

原型可以有一个明确标为“原型控制”的小面板，提供：

- 重置；
- 自动播放完整关键链；
- 直接切换九种状态；
- 热点区域显示开 / 关；
- reduced-motion 模拟开 / 关。

控制面板不得成为目标游戏 UI 的一部分，也不得把大量参数滑杆交给 owner 自己设计。

### 9. 原型说明必填

`prototype-notes.md` 必须记录：

- 画布、安全区与各 UI 锚点；
- 每个热点的形状与归一化坐标；
- 九种状态及状态转换；
- 逐段时长、easing、并行关系与 z-order；
- 占位素材清单和最终资产槽；
- 鼠标、触控、键盘与 reduced-motion 行为；
- 与生产能力的候选映射，以及尚未实查的 capability 问题；
- 已知偏差，禁止只写“以后再优化”。

### 10. 自验与 owner 人门

施工方交付前必须：

1. 断网直接打开 `.dc.html`，控制台零 error；
2. 完整自动链连续回放 10 次，最终均为相同完成态；
3. 逐个点击 7 个物件，确认相邻热点不抢点；
4. 重复点击已收录线索，进度不重复；
5. 用键盘完成整条主链；
6. 检查 1440×900、等比缩小视口、reduced-motion；
7. 留存至少 8 张关键状态截图。

owner 必须真机目击并明确给出“定稿”或“继续修改”。未定稿前禁止进入 S2、禁止创建正式游戏、禁止接生产资产与 SDK。

## 预备 S2 实查清单（当前不是缺口申请）

原型定稿后，S2 必须逐项对 registry 与源码实查：

1. 是否已有数据化 `rect|circle` 热点命中、悬停 / 聚焦 / 禁用投影；
2. 是否已有“调查对象 → 首次查看 → 首次收录 → 必需集合完成”的通用会话能力；
3. 是否可用 `t3-flow`、具名 Signal 与现有 effect 重组，而无需游戏层解释器；
4. 宿主场景图与线索图作为 render-only URL 的通用安全加载、超时与 fallback；
5. 线索取得演出能否由现有 timeline / tween / EffectKind 闭集表达；
6. DokiWorld 严格 parser、唯一 complete、preview 与 cancelled 语义。

若任一项不能表达，必须留下“查了什么、为什么不能重组”的原文证据，再给 A（补通用能力）/ B（游戏例外）及代价，由 owner 裁决。

## GCI-S2-01：透明 PNG 的实心 alpha 像素命中（P1，Owner 已于 2026-10-12 选择 A）

### ① 实查证据

- 已查 `docs/playbooks/pick-list.md` 的通用输入路径、`docs/playbooks/events-logic.md` 的“点世界实体发信号”，以及 capability registry 中的 `t2-clickable`。
- `t2-clickable` 的 `describe.summary` 是“**AABB 取最上层**”；源码 `src/skills/tier2/clickable.ts` 的 `halfExtents()` 对 `box`、`circle`、`polygon` 都返回外接半宽/半高，点击循环仅比较 `abs(x) <= hw && abs(y) <= hh`。它既不读取贴图 alpha，也没有可声明的 mask/阈值/assetKey 命中字段。
- `l1-sprite` 的 `fit:'contain'` 只负责 render draw plan；`docs/playbooks/rendering-fx.md` 明确该能力不创建临时 Canvas、不读 URL、不改 World，不能重组为点击像素判定。
- 因此，`t2-clickable + Sprite + Shape + Signal` 能表达归一化矩形的确定性命中与点击信号，不能表达定稿原型“仅 alpha ≥150 的实际图片像素可命中/高亮”的要求。原型中的浏览器 Canvas `getImageData()` 是 authoring-time 自由 DOM 实现，禁止移入游戏层。

### ② Owner A/B 裁决项

| 路线 | 内容 | 代价与影响面 | 通用性 / 选错代价 |
|---|---|---|---|
| A：补引擎 capability（推荐） | 在通用 `t2-clickable` / 输入层增加**预烘焙、资产索引引用的二值 alpha hit-mask**（阈值与逻辑尺寸由数据声明），输入采集期将本地指针投影为 `InputQueue` 世界坐标后以同一 mask 判定；sim 不读 URL、不动态 Canvas 解码。 | 需要 Lead 设计资产 spec、加载失败 fail-closed、预烘焙/尺寸上限、hash 与本地表现边界，并补跨分辨率/键鼠触控测试。 | 所有透明 PNG 点击、地图物件和异形互动都可复用；若接口不预烘焙而在 sim 解图，会破确定性/性能与资产边界。 |
| B：收缩为现有声明式形状 | 正式宿主合同仅允许经策划标注的 box（当前可用）命中；删除“真实 PNG alpha 命中”的 1:1 要求，素材透明边缘以内再放置保守 box，键盘仍走同一 action。 | 无引擎改动，但会与已定稿原型的“透明处不响应”交互产生偏差；窄/弯曲物件需要额外留白与布局回避。 | 立即可用且纯数据；若玩家再次遇到大矩形抢点，只能重开引擎缺口，不能在本游戏塞 Canvas/DOM 旁路。 |

**Owner 裁决**：选择 **A**。原型已暴露 box 命中会显著伤害调查类体验，且“透明素材按真实轮廓互动”是可复用的引擎能力。该项已提升为 `REQ-ENG-ALPHA-HIT-MASK`；在其通用实现及独立复查通过前，仍禁止 S3+ 的正式实现。
