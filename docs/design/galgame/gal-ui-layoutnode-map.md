# GAL-UI-01A · 定稿 V2 → LayoutNode 接线预检

> 2026-10-10，状态：**预检与重组复核完成；owner 已对 C1、C2a、C4 选择 A**。本文是早期接线预检，正式 UI 已另有 03A–03C 局部结构切片，现态以施工单/Review 为准。目标基准为 `gal-ui-complete-v2.dc.html`，1440×900，SHA-256 `225A74C8F6341C7B4144724A72F1E798E001064545E83B0E50DEDC45C35FF402`；`gal-ui-complete-v2.md` 记录 owner 定稿。本文只定义数据、接线、边界和拆票，不把原型 DOM/CSS/JS 移入运行时，也不等同 S4/S5 验收。

## 0. 评判与证据边界

**接受**以既有 LayoutNode 拼接屏幕，并补一层只读 GAL 宿主投影。**回驳**“`t3-dialogue` 的 `bind` 三件可直接吃 GAL”“03A 已支持六确认偏好”“按钮发 `narrative.auto/skip` 即能工作”“整页图可替代存档/设置”。以上均与当前合同不符。可重组的皮肤、网格、开关、状态卡不报引擎缺口；不能重组的先列 A/B，不替 owner 下裁决。

实查：`src/ui/components/{catalog,types,bindings,render,server}.ts`、`src/ui/starters/{index,story-starter,starter-kit}.ts`、`games/game-i/dialogue-demo.ts`、`src/skills/tier3/narrative-director.ts`、`src/services/gal-{profile,save}/`、`src/services/storage/storage-port.ts`、`src/engine/protocol/galgame.ts`；对照 `docs/playbooks/{pick-list,ui,events-logic,save-platform,assets,art-pipeline}.md`。`node scripts/ui-find.mjs dialogue/slider` 成功命中现有控件。能力目录由 gal策划会话在同一工作树只读执行 `npx vite-node scripts/dump-capability-catalog.mjs --only t2-keybind,t3-dialogue,t3-narrative-director`，**退出 0**；输出证实 `t2-keybind` 是具名输入→Signal，`t3-dialogue` 的选择是 `DialogueChoose{index:number}`，`t3-narrative-director` 独立提供 `NarrativeProjection/NarrativeHistory/NarrativeOutbox`，示例为 `NarrativePackage + StoryRuntime + InputQueue → NarrativeProjection`，并**未**列 GAL→LayoutNode 适配。本会话同命令在沙箱内的 Vite `realpath` 报 `EPERM`；成功证据来自可核对的 gal策划会话真实输出，不冒称本会话本地复跑成功，也不把三件定向目录说成全量目录排查。Owner 禁令禁止为刷新代码自行执行 Git。

UI 写入边界：`ActionSink.enqueueAction(name,{arg})` 只入 `InputQueue`；`mountUI` 本地 handler 优先，不能借 handler 直写 World/SavePort。GAL Director **直接读具名 InputQueue**，不依赖 t3-dialogue 的 `dialogue.*` 默认名。宿主服务命令（页面路由、槽位 I/O、偏好）须走明确的宿主 action dispatcher，不冒充 sim Signal。`narrative.ack` 只由 04B 持久化桥在成功保存后发送，**不设玩家按钮**。

## 1. 画布、层与可重组货架

| V2 目标 | 闭集等价写法与数据边界 | 1:1 注意 |
|---|---|---|
| 1440×900 固定逻辑画布、满幅月夜背景 | 定尺 UI host + `Screen.image`；背景资源 key 经资产索引解析为 URL；`layout.x/y/width/height` 定绝对锚 | 等比缩放交宿主，不改原型锚点；不可把全屏截图做 `Screen.image` |
| 主页左侧题签与六钮 | `@ui/starters` 的 house 主题/主页组合为起点；`Panel`/`Label`/`Button`。左菜单约 x=108、y=148，宽约 288；按钮默认/hover/pressed 由 `Button.skin`、`UITheme.buttonSkins`、`layout.press3d` 等闭集承载 | 主页 Logo/正文与钮字实时层；`STARTER_THEME` 只作底座，定稿月金配色需主题令牌/皮槽精调，不能默认色覆盖原稿 |
| 剧情场景、立绘、顶部工具栏 | `Screen.image` + 已解析角色 `Image`（`fit:'contain'`、独立透明剪影）+ `Panel`/`Button`；顶部 y≈23、左 x≈32；立绘约 x=675、y=38、高 845 | 现有 `portrait` 强制边框/裁切，虽可隐藏姓名但与 V2 无框剪影不同；此处用 `Image` 重组，不报新件 |
| 底部独立对话框皮 | `Panel.skin`/`skinSlice` + 子 `Label` 说话人、正文、推进提示；外框 x=20..1420、底对齐、高≈345，姓名 x≈102/y≈70、正文 x≈106/y≈143（相对框） | `dialog.skin` 可吃图，但 `renderDialog` 固定 13px 名字、内边距和提示位置，无法直接 1:1；用 `Panel` 子节点实现实时文本/可点动作，非整页烘焙图 |
| 分支叠层 | `Panel` 遮罩 + `choiceList` literal 或 `Panel.repeat` 中的 `Button` 行；宿主 `UIDataSource.list('gal.options')` 给 `{id,label,disabled}`，模板 `actionArg:'{{item.id}}'`、`disabled:'{{item.disabled}}'`；中心约 x=365..1075、y≈265 | 250ms 入场、第二项延迟 90ms 可用 `layout.anim/animMs/animDelay`；旧 `resolveDialogue(bind)` 会丢 option id，**绕开它用现有 repeat**，详见 §4 |
| 系统共用外框/导航 | `Panel.skin`/九宫格 + `Panel` row/Label/Button；外框 x≈18、y≈61、下≈15，内容 x≈84..1356、y≈109..833 | 统一框皮只承载边框，不烘焙文字、按钮或卡片；系统页顶部导航状态由宿主页面状态投影 |
| 反馈和遮挡 | `Toast{duration:2200}`；`Modal` 或闭集 `Panel` 遮罩/内容/按钮 | `Modal` 原生仅 320/460/640px 且遮罩 0.9；V2 确认约 800px、历史/CG 约 1080×610。`Panel` 可重组尺寸/图层/按钮关闭，但 Esc/焦点/遮罩关闭语义仍须 §4 的精确核对。遮罩高于系统页，选择层高于剧情框；不能让立绘盖住按钮 |

主题与字体：从 house 主题（`apolloOnyx`/`apolloBrocade` 或已存在适合暗金的 house）取结构与语义色；由主题作者调 `UITheme` 令牌、`fontSerif`/`webfonts`、`buttonSkins`，必要时 `Panel.skin`/`Button.skin` 节点级覆盖。`fontUi`、标题衬线和正文可读性均需真实字体/皮图审核。`Slider.thumbSkin`、`trackSkin`、`thumbSize`、`thumbInset`、`releaseSnap` 已有，月石手柄**不是**新控件缺口。图片 URL 仅可由资产 key 解析，不能写原型相对路径到正式数据。

## 2. 逐屏数据与动作映射

| 屏/状态 | LayoutNode 组合；读数据 | 玩家动作与归属 | 待办/风险 |
|---|---|---|---|
| 主页：开始/继续/读取/回想/设置/退出，默认/hover/pressed/disabled | `Screen+Panel+Label+Button`；宿主只读 `hasProgress`、最近可恢复槽、平台是否支持退出 | 宿主 `home.new/continue/open-load/open-gallery/open-settings/exit`；有进度时新游戏经统一确认政策 | Continue 无可恢复点禁用；**正式浏览器宿主无退出端口时退出项禁用并说明**，不能沿用原型的模拟反馈冒充真正退出；桌面退出另由宿主接线，不用游戏层 handler 写 World |
| 剧情：章节、场景、立绘、对话，已读/未读 | `NarrativeProjection` 的 `backgroundAssetKey/cast/speakerName/text/kind` + `GalProfile.readNodeIds` 映射实时 `Screen/Image/Panel/Label`；`readNarrativeHistory` 给历史 | 台词点击/滚轮↓→`narrative.advance`；滚轮↑→`narrative.back`；实际文字读完才送 `narrative.read-complete`，arg 为当前 StoryRef key；顶部为宿主开页 | `narrative.ack` 非 UI；打字机完成回调与推进分离、输入节流/竞态属 §4；`text`/`speakerName` 是本地化数据，需 locale 投影 |
| 选项：两项、可用/禁用、回滚改选 | `NarrativeProjection.options[{id,text,available}]` → `choiceList` literal `options[{label,available,actionArg:id}]`，或现有 `UIDataSource.list` + `repeat` 克隆 `Button`；未读可视标记由 Profile 查当前 ref | `narrative.choose` + **稳定 option id**；回滚 `narrative.back`，回到选择点后可再选 | 不能用 t3-dialogue 默认 index；`resolveDialogue(bind)` 不直接适配 GAL，但闭集重组成立，无须新 PUI 绑定 |
| 保存/读取：4×3、12/页、24 演示槽/2页 | `Panel{direction:'grid',cols:4,gap}` + 单槽 `Panel.skin+Image+Label+Button/Panel.action`，槽高 164、列距约 12/行距 8；`GalManualSaveController.list()` → `{number,meta}`，空槽由 1..24 补齐；`SaveMeta.label/timestamp/tick` 可实时显示 | 选槽/翻页/模式切换是宿主页面状态；最终确认后宿主 `save(number,active,label?)`/`load(number,active)`，空槽读取禁用；成功后重新 `list` + Toast | 单槽 selected/hover/pressed/empty/filled 都从状态重投影；`SaveMeta` 没缩略图，不能拿演示背景冒充真实截图，见 §4；保存空/覆盖/读取确认分别受三开关控制 |
| 历史：记录、滚动、关闭 | `readNarrativeHistory` 的 `{cursor,entries}` → `Panel` 行/`VirtualList` 或滚动页，约 1080×610、记录区高≈430；当前游标与未来历史状态明确 | 宿主 open/close；若允许点旧行回溯，须另核对输入契约，现阶段仅只读浏览 | 历史不是回想画廊；记录保留当前会话窗口、最多 512 可见节点，不假称永久日志 |
| 回想：2列×3行、锁定/解锁 | `GalPackage.gallery.memories` + `GalProfile.unlockedMemoryIds` → `Panel grid(cols:2)` 的 6 个 `Card/Panel+Image+Label`；锁定用闭集 tone/disabled/遮片，解锁露标题图 | 解锁项宿主 `gallery.play-memory(id)`，须定义只读回放/返回当前会话政策 | 03A 提供解锁事实但未提供回放播放器/临时世界隔离；不直接覆盖活动 World，见 §4 |
| CG：3×2、锁定/解锁、放大 | `GalPackage.media.cg`/画廊编目 + `GalProfile.unlockedCgIds` → `Panel grid(cols:3)` + 单卡 `Image`；解锁项可展开大图 | 宿主 `gallery.open-cg(id)` / close；仅展示已解锁资产 | 大图目标约 1080×610；不泄漏锁定 CG 原图；不要把演示 CG 当正式解锁 |
| 设置：四页共用 | `Tabs` 可内建切页但标签是固定 12px 下划线；若 1:1 要皮按钮，使用 `Panel+Button` 页签，宿主只读 activeTab 控制子页可见。每页 `Panel` 二列卡 + `Label/Slider/Toggle/RadioGroup/Button` | 值动作进入统一宿主 preference dispatcher；页面切换不写 World | 所有显示值来自持久化偏好/宿主状态，非页面内临时按钮自管；`Tabs` 精确视觉是否可用需 PUI 真渲染对比 |
| 确认弹窗：六类/取消/确定 | `Modal` 或 `Panel` 遮罩+框皮+标题/说明/两 `Button`；宿主 `pendingOperation` 只存**待决意图** | confirm 执行原操作，cancel 只关闭；关闭某类开关只绕过该类弹窗，**仍执行操作** | 同一政策函数按 operation kind 映射六 flag；保存到空/覆盖须依据 `list` 当前事实判别；I/O 仍失败闭合并反馈 |

保存界面密度按内容宽约 1272px，四列净宽约 `(1272-3×12)/4=309px`；三行占高 `3×164+2×8=508px`，须留顶部模式/翻页与底部操作栏，不能让最后一行压底栏。`repeat` 只消费宿主提供的只读列表，不让 LayoutNode 自己查询 SavePort。`Panel.skin+children` 能表达一槽独立装饰、缩略图、动态槽号/章名/时间；不使用单张整页图。选中态需由宿主选中槽 id 投影到对应单槽的 `edge`/皮/可见标记，禁用状态由 `Button.disabled`。

## 3. 四页设置与六项确认矩阵

| V2 设置项 | 现有事实/数据源 | 接线判定 |
|---|---|---|
| 文本：文字速度、自动间隔、已读快进、跳过未读 | `GalProfilePreferences.textSpeedMsPerChar`、`autoDelayMs`、`skipMode`；UI 为 `Slider/Toggle`，V2 0..100 显示速度必须定义到 0..500 ms/字的换算 | 字段部分已有；`narrative.auto/skip` 当前明确 unsupported；不能只改 toggle 外观 |
| 操作：滚轮↑回滚、↓推进、选择后继续自动、帮助 | 现有 `narrative.back/advance` 可作为具名输入；滚轮绑定/三项习惯字段在 Profile 中不存在 | 控件可组合；习惯持久化与输入策略待服务裁决；帮助仅静态 `Modal/Panel` |
| 声音：主、BGM、语音、SFX、语音自动、失焦静音、试听 | Profile 仅 `bgmVolume/sfxVolume/voiceVolume/muted`；`Slider.trackSkin/thumbSkin`、`Toggle` 已有 | 主音量、自动语音、失焦静音及真实播放/试听端口未接；本单只认 UI 状态，不宣称音频完成 |
| 画面：框透明度、窗口/全屏、转场、减少动效、高对比、UI 100% | `Slider/RadioGroup/Toggle` 可画；Profile 无这些字段；全屏由桌面宿主，reduced-motion 应约束表现时序 | 需统一宿主显示/可访问性偏好与平台能力；不能往 sim 写 CSS 状态 |
| 确认：六个独立开关 | **预检时的 V1 事实**：`PreferenceDefaults`/旧 `GalProfilePreferences` 无确认字段，旧 `PREFERENCE_FIELDS` 拒未知键；**现状**：`GAL-ENG-05A` 已补 Profile V2 的六项 `confirmations` 与严格 V1 迁移 | C1 已按 Owner A 解决数据合同；04A 尚须接设置 UI，未实现的全局“恢复默认”不可只重置六项 |

六项政策键现按 owner C1=A 定为 `saveEmpty`、`overwrite`、`load`、`newGame`、`returnTitle`、`exitGame`，已由 `GAL-ENG-05A` 在每包隔离的 `GalProfile.preferences.confirmations` 中版本化持久化；`GalPackage` V1 作者合同不扩。普通保存与覆盖分开；新游戏仅在已有本次剧情进度时弹确认。策略 `requiresGalConfirmation(kind,prefs,context)` 为单处纯规则，确认窗口只提交/取消待决意图。**原型的全局“恢复默认”覆盖文字、音频、画面与六开关**；04A 阶段该按钮只可见且禁用，待 04B 实现全部纳管偏好后才启用，绝不以同名按钮偷换为六项局部重置。合同与阶段验收以 `requests.md` 的 `GAL-ENG-05A`/`GAL-UI-04A` 为准。

## 4. 重组结论与剩余真缺口

**C3 撤出 owner 裁决，归 GAL 只读接线任务。** `t3-dialogue` 的 `resolveDialogue` 不适配 GAL（`DialogueView.options` 没 id，旧选择用 index），但这不意味着必须扩 PUI：`bindings.ts:UIDataSource.list` 接受标量列表，`LayoutNode.repeat` 可在模板全部字符串/布尔字段中代入 `{{item.*}}`，`Button.actionArg` 可直接放稳定 option id，`Button.disabled` 可放布尔。GAL 宿主仅需从只读 `NarrativeProjection.options` 展平 `{id,label,disabled}`，并按 locale 解析 `LocalizedText`；另以现有 `Panel/Label/Image` literal 或单项 `repeat` 投影 speaker/text/cast。等价数据形状：`repeat:{source:'gal.options',key:'id',template:{type:'Button',id:'choice',props:{label:'{{item.label}}',action:'narrative.choose',actionArg:'{{item.id}}',disabled:'{{item.disabled}}'}}}`。`resolveBindings` 先展开再渲染，不改 `src/ui/**`，不把 t3-dialogue 行为挪进 GAL。若实施中发现纯标量来源无法承载某项，才重新提出有证据的新缺口；目前**没有 C3 A/B 问题**。

**C4 部分可重组，剩余仍是真缺口。** `Panel` 的 `layout.x/y/width/height`、`skin`/`skinSlice`、`action` 与子 `Button` 能拼出 800/1080px 框、精确遮挡、显式关闭/确认/取消，所以“尺寸和视觉”本身不报缺件。但 V2 原型 `aria-modal="true" role="dialog"` 且 Escape 关闭；`Panel` 渲染普通 `<div>`，`Modal` 虽有遮罩点击/×，却把宽固定 320/460/640px，`renderModal` 未输出 role/aria-modal，`mountUI` 也没有弹层 Escape/焦点进入、圈定和返回的处理。现有 `Panel` 闭集叠层**不能完整**覆盖键盘/可访问性语义；不能把 Modal 现有能力说成已提供焦点/Esc。下表 C4 只请求这部分通用语义及可配置大框，PUI 归属。

阶段拆分：首个纵切片以默认 **全 true** 的确认政策完成；C1 现已选 A，先由 `GAL-ENG-05A` 独立实现 Profile V2/迁移/纯政策并复查，再由 `GAL-UI-04A` 接四页设置。自动/快进、滚轮习惯与音频/显示偏好另审，不混入 C1。首个结构切片的有槽预览仍须如实标“暂无预览”，C5 的真实缩略图和独立回想播放拆为**两个后续票**，不得借结构占位宣称视觉 1:1。

### 缺口 A/B（C1、C2a、C4、C2b、C5a、C5b 均获 owner A 裁决）

| 编号与不能重组的证据 | A · 补通用能力（代价/影响面/通用性/选错代价） | B · GAL 局部特例（代价/影响面/通用性/选错代价） | 推荐 |
|---|---|---|---|
| **C1·后续设置票：六确认偏好持久化**。预检时 `PreferenceDefaults` 及旧 `gal-profile.ts:PREFERENCE_FIELDS` 无六项确认，`exactKeys` 拒未知字段；该证据解释当时为何需要扩合同，**不再代表 05A 后的源码现状**。主音量/音画习惯另拆，不夹在本票。 | A：版本化扩展通用 GAL Profile 偏好和迁移、六项独立政策测试；改共享服务/存档合同，所有 GAL 可复用；选错会污染旧档或把设备级状态误纳包级。 | B：首作独立设置存储/局部政策，短期少碰 Profile 但多一份 codec/一致性债，复用低；选错会跨槽漂移、未来迁移难。 | **Owner 已选 A（2026-10-10）；05A 独立 Review 局部 PASS**。04A 设置 UI 尚未施工。 |
| **C2a·首切片：读完与推进分离**。`dialog.typewriter` 仅 render-only，`renderDialog` 点击即 advance；现有 LayoutNode 无“当前 ref 文字真正完成→发 `narrative.read-complete`”回调。 | A：通用展示状态接缝，仅对当前 ref 完成一次、发具名 InputQueue、旧 ref/回滚/读档丢弃，正文点击先揭示再推进；改宿主展示/可能 PUI 回调，所有 GAL 可用；选错会重复/漏标已读或污染确定性。 | B：首作私有计时/点击 handler，短期少改共享面但需大量竞态测试，复用低；选错会回滚/换行时发陈旧完成。 | **A**；这是首切片的真正先决裁决。 |
| **C2b·后续自动/快进票**。Director `readInput` 把 `narrative.auto/skip` 标为 `unsupported`；滚轮偏好也未持久化。 | A：通用宿主调度器按 Profile/已读和当前 ref 策略排定具名 advance/back，计时不入 sim；共享宿主，所有 GAL 可用；选错会误跳未读/锁选项。 | B：首作私有定时器与快进循环，短期独立但复用低；选错会选项/弹窗/读档后继续乱跳。 | **A**；不进入首切片，不和 C2a 混票。 |
| **C4·首切片：大确认弹层的完整语义**。`Panel` 能重组 800/1080px 尺寸与按钮关闭，却不提供 role/aria-modal、Escape、焦点进入/圈定/返回；`Modal` 只有 320/460/640px 且自身也无完整键盘语义。原型明确 `role="dialog" aria-modal="true"`，Escape 关闭。 | A：PUI 扩通用 Modal 的受限大尺寸/框皮及 Esc/焦点/遮罩规则；改共享 UI，其他游戏可复用；选错会让通用控件变自由 CSS 逃生或旧 Modal 回归。 | B：GAL 宿主以 Panel+统一键盘/焦点适配器做局部模态，尺寸好贴但承担键盘/无障碍/恢复焦点债，复用低；选错会遮罩穿透或键盘困住玩家。 | **A**；PUI 施工且先核主池容量，不由 GAL 改 `src/ui/**`。 |
| **C5a·后续视觉票：真实槽预览**。`SaveMeta` 仅 slot/tick/hash/timestamp/label，`GalManualSaveController.list` 仅 `{number,meta}`，无截图或 preview key。 | A：通用非权威 SavePreview sidecar，写/读/删与槽关联且旧档缺图可降级；服务/资产跨面，GAL 复用；选错会预览与档不同步。 | B：首作另存截图，短期快但孤儿图和后端差异债，复用低；选错会错图/泄漏。 | **A**；首切片如实占位，只验结构，S5 视觉 1:1 前必补。 |
| **C5b·后续回想票：隔离重播**。`GalProfile` 只有 unlock id，`readNarrativeHistory` 是当前会话窗口，未提供从记忆条目开独立回放且保留活动 World 的控制器。 | A：通用隔离回放会话及返回点合同，改 GAL 服务，可跨作品复用；选错会将回想写回活动存档。 | B：首作临时 World/私有回放路线，短期少动共享面但测试/清理债大、复用低；选错会串档或改变活动剧情。 | **A**；与槽预览完全分票，非首切片。 |

**owner 判词（2026-10-10、2026-10-11）：C1=A、C2a=A、C4=A；随后 C2b=A、C5a=A、C5b=A，均补通用能力。** C1 归 GAL Profile/政策服务侧主程，C2a/C2b/C5a/C5b 归各自 GAL 服务票；C4 只归 PUI 共享基座，GAL 会话不可越域改 `src/ui/**`。四项新增分票规格见 `requests.md` 的 `GAL-ENG-06A/06B/06C` 与 `GAL-PIPE-01A`。因 UI 池 `docs/workflow/requests.md` 最多 10 槽，**本单不擅写主池**；PUI 归属与容量须按规则路由。B 虽列为比较路线，也不得用自由 React/DOM/CSS 绕开 UI 铁律。

## 5. 素材审查与依赖拆票

| 素材 | 归类/正式候选槽 | 验收前置 |
|---|---|---|
| `dialogue-panel-concept-v1.png`、`ui-parts/panel-frame-v1.png`、`button-default-v1.png`、`save-slot-compact-v2.png`、`moonstone-knob-v1.png` | 可拟入正式 UI 框/按钮/单槽/滑杆皮，分别到 `Panel/Dialog.skin`、主题 `buttonSkins`、`Slider.thumbSkin` | asset-manager 审美/授权/尺寸/九宫格边距、透明度、可读性审核，登记索引 key；无消费槽资产不入册 |
| `moonlit-backdrop-v2.png`、`demo-portrait-v2.png`、`demo-cg-v2.png` | **演示内容占位**：背景、角色、CG 各自独立，不代表最终剧情设定 | 正式内容资产另审并映射 `NarrativeProjection` key；锁定 CG 不在 UI 直接暴露原图 |

| 拆票/归属 | 工作与完成条件 | 依赖 |
|---|---|---|
| **GAL 服务侧 G1·首切片** | 只读 `NarrativeProjection`/`GalProfile`/History/Slots → `UIDataSource.list`/literal view model；稳定 option id、locale、back、存档服务命令边界；默认全 true 的单一确认政策；无 UI 业务 handler | C3 已重组可做；读完动作需 C2a 裁决，确认弹层需 C4 裁决 |
| **GAL 服务侧 G2·设置/自动扩展** | 六确认偏好 codec/迁移（C1）；auto/skip/滚轮策略（C2b）；音频/显示/设备偏好**另开票**，不捆绑到六确认 | 各后续票分别裁决；不阻断 G1 |
| **GAL 服务侧 G3·画廊扩展** | C5a 非权威槽预览、C5b 回想隔离回放分别实施；CG/回想只读查询消费既有 Profile unlock，活动剧情与全局档案分离 | C5a/C5b 分别裁决；纵切片后 |
| **PUI 专属 U1** | C4 大 Modal 闭集尺寸/框皮/Esc/焦点合同；`Tabs` 与定稿样式仅先对照，既有 `Panel+Button` 能重组则不扩件；确需扩件才改 `src/ui/**` | C4 裁决、主池容量核对；GAL 不代改 |
| **资产专属 A1** | 候选框皮/钮/手柄与正式内容素材入索引，按 skinKey/资产 key 消费；只保留有消费槽的台账行 | 美术审核；不在本预检导入 |
| **正式 UI 数据施工 U2/GAL** | 纯 LayoutNode 编排、可观察完整状态、双主题/对比/重叠/防透明审计；按 PUI 边界分工 | G1/U1/A1 及 owner 决策 |

首个独立纵切片：**主页 → 真实 `NarrativeProjection` 对话 → 稳定 id 分支 → `narrative.back` 改选 → 槽 2 保存/读取 → 活动剧情及全局 Profile 各自恢复/不回退**。C3 只读映射现有闭集足够；确认政策先固定原型默认全 true，槽预览诚实显示暂无预览。C2a 读完时机和 C4 弹层语义须 owner 判路后实施。验收必须有同 1440×900 原型/真游戏并排关键帧和差异单，覆盖默认/悬停/按下/禁用、空/有槽、已读/未读；有槽预览未完成时只称**结构纵切片**，不称视觉 1:1。第二批加历史、CG 锁/放大；第三批分别补 C5b 回想重播、C1 四页设置/六确认、C5a 槽预览；C2b 自动/快进、音频/窗口平台能力另票，最后完成时序与 S5/S6 视觉演出 1:1。

本次未写正式 LayoutNode、未改 PUI/资产/游戏层、未启动服务/数据库、未执行 Git/GitHub。`check-ui` 属正式 LayoutNode 施工后的自检，本报告不冒充其通过。全库既有非 GAL `tsc` 红灯仍不得称全库门禁绿。
