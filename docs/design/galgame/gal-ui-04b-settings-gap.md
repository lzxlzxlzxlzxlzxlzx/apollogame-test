# GAL-UI-04B：设置真实生效缺口与施工顺序（2026-10-12）

状态：Owner 于 2026-10-12 在当前对话选择 **A：通用能力**；施工与独立复查仍在进行。此聊天裁决不是项目控制台里程碑人门批准。本文不改变 V2 原型定稿，也不把禁用控件宣称为已实现。

## 实查与现状

- `src/services/gal-ui/gal-ui-settings.ts`：四页 S4 几何已完成；六类确认、自动间隔、已读快进与未读跳过各有真实消费。声音页已把主音量、BGM、语音、音效、语音自动和失焦静音接到真实音频端口；试听在有素材时可用。画面页仅对话框透明度有真实消费者；文字速度、其余画面项和恢复默认仍禁用。
- `src/services/gal-profile/gal-profile.ts`：当前 V6 经 V1→V6 逐级只读迁移，已有文字速度数据位、自动间隔、分立的已读快进/未读跳过、滚轮策略、选择后自动续播、对话框透明度、主音量、BGM/SFX/语音音量、自动语音、失焦静音、全局静音与六类确认；文字速度数据位尚无逐字完成/显全的 PUI 消费合同，转场、减少动态、高对比、界面缩放仍缺完整偏好与消费闭环。已有纯 Profile 全量设置重置与同包串行持久化基础接口，但 UI 按钮须等真实消费者齐备后才能开放。
- `src/ui/components/{types,render,server}.ts` 与 `docs/playbooks/ui.md`：Label/Dialog 的 `typewriter` 可逐字显示；运行时定时器只改 DOM 文本，没有针对具体台词 ref 的“显示完成/立即显全”闭集通知。GAL 的 `PresentationReadGate` 不能把“参数存在”当成真正读完。
- `src/services/audio/{audio-port,web-audio,audio-sync}.ts` 与 `docs/playbooks/audio.md`：已有通用文件播放、停止和总音量端口，`Sound` 可同步世界中持续声源。04B-2B 至 2D 已补 GAL 剧情投影的 BGM/SFX/语音消费、逐句去重/停播、试听、主音量、失焦静音与自动/手动语音；作品仍需提供已审核媒体 URL，完整声音视觉验收另算。
- `src/skills/tier3/narrative-director.ts`：剧情投影已经给出 `bgmAssetKey`、`sfxAssetKeys`、`voiceAssetKey`、`videoAssetKey` 与转场枚举；不是媒体播放或转场呈现本身。现有 `presentation-track`/`CommittedTransitionController` 可用于确定性演出序列，但没有按 GAL ref 取消/重播并在回滚、读档、回想隔离时正确停播的成品适配。
- `docs/design/galgame/gal-ui-layoutnode-map.md`：正式浏览器没有退出能力时退出按钮必须禁用；桌面宿主的真正退出另归发行票，不得调用 `window.close()` 冒充成功。

以上对照能力目录及 UI、音频、事件生产线后，现有能力可重组出控件外观、Profile 部分字段、基础文件播放、通用转场机制；**不能**仅凭这些重组出 V2 四页设置“调节即生效、回滚/读档/回想不串媒体、恢复默认全项一致”的闭环。

## 缺口裁决（Owner A/B）

| 路线 | 施工与影响 | 代价及选错风险 |
| --- | --- | --- |
| A：通用 GAL 表现/设置能力（推荐） | 分小票扩通用 PUI 台词完成/显全信号、GAL 媒体协调器、版本化 Profile/设备偏好及画面消费端；故事包继续只填剧情和素材 key。所有后续 GAL 共用。 | 需改共享 UI/服务/存档合同，迁移和隔离测试多；若接口过宽会增加引擎维护债，须按 V2 最小闭集实施。 |
| B：首作独有逻辑 | 在首作写打字/音频/显示/窗口监听及单独设置存储，短期局部施工面较窄。 | 违背“以后换角色/剧情无需改框架”的既定目标；多份状态与存档会漂移，第二作需搬迁。只可作为明确记债的临时例外，不可称引擎完成。 |

Owner 已选 A。此判词授权按下方分票施工通用能力，但不代签任何一票的独立复查或项目控制台 `ui-settings-confirmations` 的 Owner 人门。

## A 路线获批后的分票顺序

1. 04B-1 文字：复用既有 typewriter 外观，补 ref 绑定的完成/显全通知；快进、跳过和回滚不误标已读。完成后启用文字速度与相关输入项。
2. 04B-2 声音：先在 GAL 宿主消费 BGM/SFX/语音 key 与已审核 URL；分通道音量/静音、单句语音、试听、失焦、回滚/读档/回想隔离。媒体缺失可降级，且每项可观测。
3. 04B-3 画面：对话框透明度、转场开关、减少动态、高对比、界面缩放逐项接实际消费者；全屏/窗口控制通过宿主能力检测，桌面退出仍在发行票。
4. 04B-4 设置合同：仅为已明确消费者的新增偏好做版本迁移和权限/设备归属裁决；全项接通后开放单事务“恢复默认”，保留已读/解锁与手动槽，失败显示旧值。
5. 每票独立复查、撤修验红、静态真浏览器与 V2 同画布 S4/S5/S6 差异；全库已有非 GAL 红项单列。项目控制台 `ui-settings-confirmations` 仍 active，直至全部验收和 Owner 人门。

### 04B-2a 通用文件音频底座（2026-10-12 局部施工）

`WebAudioPort` 原本只跟踪循环播放的缓存元素；一次性语音/SFX 使用克隆，`stop(clipId)` 停不到真实发声克隆，且 `setMasterVolume` 会覆盖单曲原始音量。现于 `src/services/audio/web-audio.ts` 登记可停止的一次性实例，并保留每实例原始增益，使全局音量热更新按乘积生效；同 clip 从循环切到一次性不继承 `loop`，无 `Audio` 或构造器同步失败时静默降级。音频/语音相邻回归 47/47 通过，非施工者在 `review/GAL-UI-04B-audio-base-independent.md` 签局部能力 PASS（独立 9/9、两锚点撤修验红；领工时序 CONCERNS）。这是 GAL 宿主媒体协调器的前置端口修正，不能单独签声音页。

### 04B-2b 剧情音频与三通道音量（2026-10-12 局部施工）

`gal-audio-coordinator.ts` 复用三个独立 `AudioPort`，按已解析资源 URL 消费剧情 BGM、当前节点语音和音效；进入节点去重，回滚、同 ref 读档、回想与卸载时重置一次性播放。设置页三条音量滑杆通过现有 Profile V2 字段串行持久化后热更新播放音量；浏览器静态构建验收已验证真实 WAV 解码、播放/停播、滑杆拖拽、试听和写入失败恢复。定向及相邻回归 718/718、深亮 UI 审计零阻断；施工自证见 `review/GAL-UI-04B-audio-consumer-self.md`。非施工者在 `review/GAL-UI-04B-audio-consumer-independent.md` 复跑 718/718、真浏览器和两锚点撤修，判 **04B-2B 局部功能 PASS**；全库类型检查 16 条非 GAL 诊断与 V2 内部几何/视觉差异仍为 CONCERNS，不签整体里程碑。

### 04B-2c 主音量与失焦静音（2026-10-12 局部施工）

Profile V3 把主音量和失焦政策作为同包偏好，经逐步迁移补旧档默认值；GAL 宿主把焦点与页面可见性作为纯表现输入，协调器乘算增益、失焦归零、恢复不重播。设置页启用原有主音量滑杆与失焦 Toggle；施工自证见 `review/GAL-UI-04B-audio-policy-self.md`。非施工者在 `review/GAL-UI-04B-audio-policy-independent.md` 复跑定向 42/42、真浏览器与两处隔离撤修，签**本票局部功能 PASS**；全库类型门和 V2 S5 仍为 CONCERNS。本票不启用语音自动；Owner 随后确认了修订原型的可见“↻ 语音”入口，接线另票施工。

### 04B-2d 自动语音与当前句重播（2026-10-12 局部施工）

Owner 确认修订 V2 的可见 `↻ 语音` 入口后，Profile V4 版本迁移保存 `voiceAuto`。关闭时新句不自动播放配音，已解析当前句仍可通过具名动作手动重播；剧情、BGM/SFX、已读及 World 不受影响。施工自证 `review/GAL-UI-04B-voice-auto-self.md` 记录定向 46/46、相邻 726/726、真浏览器静态 WAV 与缺资源按钮禁用；非施工者在 `review/GAL-UI-04B-voice-auto-independent.md` 复跑定向 56/56、相邻 726/726、隔离静态 Edge 真 WAV、深亮 UI 审计，并以两处内存唯一锚点撤修验红，判本票**局部功能 PASS**。全库类型门仍有非 GAL 红项，正式顶栏横向间距、占位素材和亮主题标题对比度提示仍归 S5/结构差异账；不能仅因按钮可用就称视觉对齐。

后续局部进展：04B-3 的 Profile V5 滚轮、透明度、选择后自动续播及反例已获非施工者局部 PASS；S6 宿主焦点链也获独立局部 PASS。Profile V6 的已读快进独立开关已有[施工自证](self-check/GAL-UI-04B-3-read-skip-2026-10-14.md)和[非施工独立复查](review/GAL-UI-04B-3-read-skip-2026-10-14-independent.md)，局部 PASS。“跳过未读”与“已读快进”现各有策略消费，不代表文字速度、转场、全屏、减少动态、高对比、缩放或恢复默认已可用。

缺口仍包括文件资源审计和缺失语音资产的作品消费、淡入淡出、上述未接通文字/画面设置、全项恢复默认及完整 V2 视觉演出对齐；这些控件继续禁用或单列施工。设置几何的当前静态浏览器局部核对见 `gal-art-01a-s5-diff.md`，不代替整页视觉验收。不能因此签 04B、S5 或完整 GAL。

### 减少动态与恢复默认的严格前置实查（2026-10-14；Owner 对减少动态具体路线选 A，未施工）

实查 `npx vite-node scripts/dump-capability-catalog.mjs --only t1-animation,t1-tween,t3-narrative-director`：`t1-animation` 管 sim 帧、`t1-tween` 管 sim 数值、`t3-narrative-director` 管 GAL StoryRef；三者均不提供**作品偏好驱动 UI 渲染器内部 CSS 动态**的入口。`docs/playbooks/pick-list.md` 与 `docs/playbooks/ui.md` 指向 LayoutNode/`mountUI`；`mountUI(host, root, handlers, theme, input)` 当前无 motion policy 参数。`src/ui/components/server.ts:302–303` 仅用操作系统 `prefers-reduced-motion: reduce` 覆盖部分 Slider/Transform/Button feedback/cue/modal 动态，且 `apollo-flyIn` 不在这两条选择器内；`gal-ui-art.ts:332–336` 给有图台词、选项、推进 cue 加独立动画，`gal-ui-art.ts:202–203` 给贴图按钮反馈。故“在 GAL 把这三种 LayoutNode 动态清掉”无法使设置页的**作品级减少动态开关**对 PUI 内部动画、滑杆吸附与弹窗一致生效；OS 偏好已部分生效也不等于作品控件已接通。当前 `gal-ui-settings.ts:117` 如实 disabled，Profile V6 无该偏好字段。共享工作树有大量在途改动，本轮未做不安全的 `git pull` 或修改 PUI。

| 路线 | 代价 / 影响面 / 通用性 | 选错后果 |
| --- | --- | --- |
| A：PUI 通用受限 motion policy（推荐，**需 Owner 对具体接口/范围裁决并交 PUI**） | PUI 明确 `mountUI` 可更新的 reduced-motion 作品级输入，并覆盖 flyIn、cue、Button feedback、Modal、Slider 等闭集动态；GAL 后续加版本化 Profile 字段与只读投影，原型控件再按真实消费启用。涉及共享渲染 API、Profile 迁移、深亮/OS 偏好组合和跨作品回归，成本较高但可复用。 | 若遗漏一类动画，开关呈“部分生效”的虚假承诺；若策略无作用域隔离，可能改变其他游戏。 |
| B：GAL 专用静态降格 | 只在 GAL LayoutNode 投影时去掉自身 flyIn/cue/skinFeedback，保留 PUI 内部动态继续跟随 OS 偏好；不改共享 PUI，局部施工快但不是完整作品级开关。控件必须继续 disabled，并向 Owner 明示范围降格。 | 如果把它冒称“减少动态已生效”，用户仍会看到滑杆/弹窗等动画，后续仍须迁到 A；不同作品行为分叉。 |

当时建议 A，但 **Owner 原有“通用设置能力”A 判词不等于批准这个具体 PUI API**；裁决前 GAL/PUI 均未先写。复查点：默认/OS 减动/作品减动及组合态分别测动画时长和动作可达性，作品偏好不进 World/hash、不影响剧情时序，切换/读档/回滚/跨包及失败写入不得串状态。

**Owner 2026-10-14 后续裁决：本项具体选 A**（原话“均选A，授权”，见 `@gal策划` 的三项合批问题/回复）。由 PUI 专职做通用、受限、可更新的作品级 motion policy，覆盖闭集动态且与 OS 减动组合；PUI 合同和独立复查到位后，GAL 才做 Profile 迁移、宿主只读投影和真实消费。该授权不代表 PUI 已实现或 GAL 已可启用开关；目前 `gal-setting-reduced-motion-control` 继续 disabled，`ui-settings-confirmations` 人门仍 pending。前段 A/B 是当时实查和推荐记录，不得改写为早已施工完成。

恢复默认前置不是新视觉缺口：`gal-profile.ts:287–294` 已有只重置版本化偏好、不丢已读/解锁的纯函数，`:369–379` 有同包串行持久化；`gal-profile.test.ts:318–342` 覆盖跨包拒绝、同值、失败保持旧值。`gal-ui-settings.ts:188` 当前 disabled，`gal-ui-slice-host.ts` 无 reset action。必须先列齐并验收**所有页上可见且标为可纳管的偏好**及其真实消费者：文字速度等待 04B-1；转场、减少动态、高对比、界面缩放/显示模式仍缺具体实现或宿主能力；声音/滚轮/自动播放/透明度虽各有局部 PASS，不抵全项。消费端齐备后，才能接单事务 reset action、刷新宿主播放/音频/画面投影、失败恢复旧 UI 值，并分别测进度/已读/解锁/手动槽不变。未满足前不启用按钮，也不凭已有 reset 函数宣称设置页完成。

### V2 其余禁用显示项的裁决前归类（2026-10-14）

本段是对 V2 原型、capability registry 与 UI/事件手册的只读复核，不改变原型，也不把任何禁用控件改成已完成。

| 项 | 原型 / 现有能力证据 | 归类与当前处理 |
| --- | --- | --- |
| 窗口 / 全屏 | `gal-ui-complete-v2.dc.html` 的画面页把窗口/全屏列为选中态；紧随其后的原文明确“**正式桌面版的窗口 / 全屏切换由宿主接线；原型仅展示按钮反馈**”。`Screen` 的“全屏”只代表页面布局，PUI/registry 未提供桌面窗口或浏览器 Fullscreen API 的宿主合同。 | **V2 明确预留的宿主能力**，不是 GAL 把选中态写进 Profile 就能完成的偏好。Web 包继续诚实禁用；有桌面宿主且其合同、失败/退出策略和测试到位后另接。它不阻塞当前设置页的**结构映射**，但当然不等于“所有 V2 设置均真实可用”。 |
| 转场演出 | 原型是已开启的 `switch`，没有“待接入”说明。`t2-presentation-track` / `CommittedTransitionController` 能表达确定性演出序列、跳过与减动终态（`events-logic.md:55–57`），但 registry 和 GAL 宿主没有“按 GAL scene/ref 投影、切换偏好、回滚/读档/回想隔离”的现成消费者。 | **真实消费者缺口**；不能把现有 generic timeline 当作设置已生效。它仍禁用，且阻止把 04B-3 说成完整画面设置。 |
| 高对比度文字 | 原型是可切换 `switch`，没有预留文案。现有 `UITheme` 只提供静态主题令牌；`mountUI.update(root, theme?)` 可换主题，却没有“高对比 policy”、可验证 token 覆盖面或 OS/作品优先级合同。`minimal-dark` 的说明是一个主题样式，不是可由 GAL 设置安全调用的 accessibility consumer。 | **真实共享 PUI 能力缺口**；不得在 GAL 以自由 CSS 或私有主题假装实现。保持禁用。 |
| 界面缩放 | 原型显示可用的 `100%` 按钮，没有预留文案；原型自身的 `stage.style.transform=scale(...)` 只是 1440×900 展示缩放。现有 `LayoutNode.layout.scale` 是逐节点终态几何，不能代替全局 UI 缩放；PUI 的 `Screen.fill` 是填满既定宿主盒，也不是用户倍率、焦点/命中区/安全区策略。 | **真实共享宿主/PUI 能力缺口**；不得给 GAL 根节点强加 transform。保持禁用。 |

因此，当前 `ui-settings-confirmations` 的结构验收可以把四个控件作为已忠实映射的可见禁用态，其中只有全屏有 V2 的明确预留依据；其余三项是被识别、未偷开通的真实缺口。它们不允许被计作 enabled-control consumer，也不允许据此结束 04B、S5/S6 或 Owner 人门。

Owner 已于 2026-10-15 选择 A。经再次核对共享池后，已按职责拆成两个待认领的共享票：`REQ-GAL-PUI-ACCESSIBILITY-POLICY-01`（PUI 的高对比与缩放）和 `REQ-GAL-NARRATIVE-TRANSITION-POLICY-01`（叙事/宿主的转场偏好投影）。这不是实现完成、V2 重确认，也不是任何控制台人门；GAL 不得私写替代实现。

| 路线 | 内容与代价 | 推荐 |
| --- | --- | --- |
| A：补通用能力 | PUI 提供有界、可更新的 accessibility policy（高对比 token 覆盖 + 用户倍率及命中/焦点/安全区语义）；叙事/宿主层提供声明式 GAL 转场偏好消费者，保持 skip/reduce 的同一终态与读档/回想隔离。桌面全屏仍由宿主合同单列。影响共享面，需要 PUI/主程归属、跨主题与多 host 复查，工期较大但可复用。 | **Owner 已选择 A**：三个原型真实可操作项不应靠 GAL 特例各造一套。 |
| B：GAL 首作特例 | 仅在 GAL 宿主做一套高对比配色、根缩放和转场开关。短期可能较快，但会越过 PUI 归属，重复 OS/焦点/多 host/主题语义，并形成后续游戏不可复用的私有 CSS/DOM 路径。 | **不推荐 B**：除非 Owner 明确接受该债务、精确范围及未来收编计划。 |

## 生成作品的边界

引擎与产线完成后，模型应生成通过闭集校验的 `GalPackage`、剧情草稿和资产候选，**不生成每作运行代码**。但模型输出不是可直接发行物：P0–P9 草稿/资产审核、确定性组装、资源闭包、旧档兼容、真机试玩与 Web/桌面打包仍是必要步骤。若新作品提出闭集外的机制，先走能力缺口裁决，不能悄悄在作品中写 TS/DOM 绕过。
