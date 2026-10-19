# GAL 施工单

> **Owner 2026-10-11 批量裁决：C2b、C5a、C5b、P1 均选 A。** 四项分别下沉为可复用的通用能力，不采用首作专属定时循环、截图存储、临时回放脚本或手工草稿审核表。P1 的 A 不推翻先用人工审核静态包验证模板的既有 B 顺序判词。以下为分票边界；每票只在自身定向验证、独立复查后报告局部 PASS，不能合并宣称完整 GAL、全库门禁或控制台里程碑 done。Owner 本机禁令继续适用：agent 不执行 Git/GitHub、不修改本地或远程数据库、不启动服务；文件制项目控制台仅按根 `AGENTS.md §2.1` 同步证据，不得代过 Owner 人门。涉及真实数据库写入的历史施工单均以当前根规则为准。

> **本项目抢锁顺序特例（Owner 2026-10-11）：** 当前项目只有 Owner 一人，GAL 工单可先本地登记施工主体并施工，暂不要求先完成 Git 抢锁推送。此特例不放宽任何 Git/GitHub 禁令、跨角色文件归属、共享工作树保护、施工人与独立复查人分离，也不把本地记录说成远端已锁；若项目后来出现并行施工者，应重新启用共享可见的锁流程。

## GAL-UI-04B-2A：可停止的通用文件音频端口

- **施工主体：GAL 主程 `/root`；2026-10-12。** Owner 已选 04B 通用能力 A。边界为 `src/services/audio/web-audio.ts`、新增 `web-audio.test.ts` 及本票证据；不碰 PUI 或其他游戏。说明：回合内先在聊天声明施工范围，工单落盘晚于首次编辑，范围纪律缺陷据实保留，不伪称事先完成本地领工登记。
- **需求：** 既有 one-shot 克隆不受 `stop(clipId)` 控制，不能供 GAL 回滚/读档打断语音；主音量热更新须保留每个播放实例的相对音量，同 clip loop→one-shot 不得继承循环。缺少/失败的浏览器音频能力应降级。
- **本地自证与复查：** 音频与语音 47/47 通过；构造器同步失败由独立复查发现后补保护并重新验证。非施工者在 `review/GAL-UI-04B-audio-base-independent.md` 签局部能力 PASS，独立 9/9、两锚点撤修均验红；领工时序记 CONCERNS。全库类型检查仍有 14 条其他游戏/启动器错误。自证见 `review/GAL-UI-04B-audio-base-self.md`。
- **验收边界：** 本票只改善既有 AudioPort 实现，不放行 GAL 声音设置。作品的 assetKey/URL、BGM/voice/SFX 分通道、剧情进入去重、回滚/读档/回想停播及真浏览器试听仍归 04B-2 后续。

## GAL-UI-04B-2B：剧情文件音频与三类音量真实消费

- **施工主体：GAL 主程 `/root`；2026-10-12，代码施工前本地登记。** 沿用 Owner 04B=A 与 2A 局部独立 PASS。范围：新增 `src/services/gal-ui/gal-audio-coordinator.ts` 及测试/浏览器审计夹具，修改 `gal-ui-slice-host.ts`、`gal-browser-game-host.ts`、`gal-ui-settings.ts`、`gal-ui-structure.ts`，在 `src/services/gal-profile/gal-profile.ts` 增已有三音量字段的串行更新及点名测试；证据和相关手册同步。不碰 `src/ui/**`、其他游戏、正式资产或远程数据库，不启动服务。
- **合同：** BGM、语音、文件 SFX 分别注入独立 AudioPort；已解析 URL 来自作品显式 contentUrls。循环 BGM 保留 defaultVolume，Profile 各通道音量通过 master 热更新，不因重绘/ack 重播。语音和 SFX 每次玩家进入剧情节点最多触发一次；SFX 取当前节点显式 presentation.sfx，不能重播投影中继承的上一句音效。回滚/新游戏/读档/进入或结束回想刷新表现身份并停止旧一次性音频；标题/卸载全停，系统页停语音/SFX但可保留当前 BGM。
- **设置：** 仅存在音频消费端时开放 BGM/语音/SFX 三滑杆，闭集动作校验 0–100，保存成功后才更新显示和播放音量；失败/非法值不伪成功、跨包不串，沿用 Profile V2 不增 schema。缺媒体/端口异常给可观察降级，剧情继续。主音量、语音自动、失焦静音和全局恢复默认保持待接入；合成 SFX/无资产语音只在注入既有对应端口时消费，否则明确 unavailable，不假称全音频完成。
- **验收：** 端口替身验证去重/增益/隔离/失败，真实 Director 宿主的回滚、同 ref 读档、回想、Profile 失败及恢复回归；定稿 V2 声音页 1440×900 真浏览器原型目击与深亮 UI 审计，真实滑杆手势改变实际媒体音量、真实播放/停播，截图和独立撤修验红。仅签本票局部能力与声音页三个控件；整个 settings/media 里程碑保持 active。
- **复查结果（2026-10-12）：** 施工自证 `review/GAL-UI-04B-audio-consumer-self.md`；非施工者 `review/GAL-UI-04B-audio-consumer-independent.md` 对 718/718 定向与相邻测试、隔离静态浏览器真 WAV/音量/滚轮/读档/回想/重开、深亮 UI 审计及两锚点撤修独立通过，判本票**局部功能 PASS**。全库 tsc 当前仍有 16 条非 GAL 诊断，V2 系统页内部约 +57px 偏差及其余禁用设置仍是 CONCERNS；不签 `ui-settings-confirmations` 或 `media-and-final-skin` 整项。

## GAL-UI-04B-2C：主音量与失焦静音

- **施工主体：GAL 主程 `/root`；2026-10-12，代码施工前本地登记。** 沿用 Owner 04B=A 通用能力裁决。范围：通用 GalProfile 新版本迁移、GAL 音频协调器/宿主焦点输入、设置页闭集动作及点名测试/验收；不碰 PUI、其他游戏、真实数据库、应用服务或 Git。
- **合同：** 主音量为 0–100% 且与 BGM/voice/SFX 各通道音量相乘；`focusMute` 仅在实际失焦或不可见时令音量为 0，恢复焦点时还原，不重播、不写 World。两项按 package Profile 持久化，旧 V1/V2 Profile 迁移为安全默认，拒绝坏值，失败回退可见控件；旧三通道行为不回归。语音自动播放关后需要 V2 原型未定义的手动重播入口，先保持禁用并单独裁决交互，不隐式去掉玩家重播能力。
- **验收：** 旧档迁移、跨包隔离与同包串行；同曲音量热更新、失焦/恢复及卸载；真浏览器声音页手势与失败恢复；独立复查、撤修验红。仍不开放语音自动或全局恢复默认，完整声音/设置与 V2 S5/S6 单列。
- **复查结果（2026-10-12）：** `review/GAL-UI-04B-audio-policy-self.md` 与非施工者 `review/GAL-UI-04B-audio-policy-independent.md`：定向 42/42、相邻 722/722、隔离静态浏览器真 WAV/主音量/失焦与焦点恢复、深亮 UI 审计及两处唯一锚点撤修通过；判本票局部功能 PASS。全库类型门及 V2 S5 仍为 CONCERNS。

## GAL-UI-04B-1：逐字完成与画面设置的 PUI 接口缺口（待 PUI 领工）

- **实查：** `Label.typewriter` 在 `src/ui/components/server.ts` 内用定时器改文本，没有 StoryRef 绑定的完成/立即显全 ActionSink；`gal-ui-slice-host.ts` 只能在当前完整渲染的 Label 上调用 `fullyPresented`。`Panel` 的 `layout.opacity` 作用于整棵子树，不能单独调整对话框底纹且保持台词文字不透明；`prefers-reduced-motion` 仅读设备偏好，GAL Profile 尚不能按作品覆盖。现有闭集无法安全表达 V2 文字速度及画面页全部可调项。
- **需要的通用合同：** PUI 提供可绑定内容 token 的逐字完成/立即显全闭集通知，替换/卸载/回滚可取消且旧 token 不得误报；对话框背景与文字分层透明度、受限减少动态/高对比/界面缩放的消费槽须保持旧 LayoutNode 零回归。GAL 只填数据与处理具名动作，不直接监听 PUI DOM 或手写 CSS。
- **归属与门槛：** `src/ui/**` 与 UI 手册归 PUI 专职。本行仅是 GAL 游戏级依赖记录，不冒充已抢引擎锁或 PUI 已接工；正式登记共享 PUI 票前须按当时的共享需求池容量与专职归属复核。待 PUI 接口和独立复查后，GAL 再接 Profile 版本迁移、设置消费者及真浏览器对拍。
- **语音重播交互裁决：** Owner 2026-10-12 在对话选择 A：通用、可见的“重播语音”按钮，并在 1440×900 修订截图目击后明确确认修订稿。`gal-ui-complete-v2.dc.html` 的剧情顶栏 `↻ 语音` 已是当前结构目标；正式 LayoutNode 可按此接线，但仍需逐字完成/媒体行为与真浏览器复查。

## GAL-UI-04B-2D：语音自动与当前句手动重播

- **施工主体：GAL 主程 `/root`；2026-10-12，源码编辑前本地登记。** 沿用 Owner 04B=A 与同日修订原型确认。范围为通用 Profile/迁移、GAL 音频协调器、宿主和已有 LayoutNode 剧情工具栏/设置页，以及点名/真浏览器验收；不碰 PUI 基座、其他游戏、真实数据库或 Git。
- **合同：** 新 `voiceAuto` 偏好默认 true，V1/V2/V3 档逐步迁移且保留已读/解锁/确认与音量。false 时进入台词不自动播放角色语音，但不影响 BGM/SFX/剧情推进；玩家点击修订原型的 `↻ 语音` 时只重播当前 line 的已解析语音，缺资源/无端口/选项节点显示明确不可用，不误放上一句、不会标已读或改 World。true 时仍可手动重播。设置失败显示旧值；回滚/读档/回想/失焦/离页/卸载沿既有停播策略。
- **验收：** Profile 迁移与串行写入、当前 ref 守卫、自动开关与手动多次重播、真浏览器视觉/音频/缺资源、独立复查及撤修验红。仍不开放全局恢复默认、文字/画面未接消费者，S5/S6 与完整里程碑另签。
- **复查结果（2026-10-12）：** 施工自证 `review/GAL-UI-04B-voice-auto-self.md`；非施工者 `review/GAL-UI-04B-voice-auto-independent.md` 独立复跑定向 56/56、相邻 726/726、隔离静态浏览器真 WAV、深亮 UI 审计与两处内存唯一锚点撤修验红，判本票**局部功能 PASS**。全库类型门仍因非 GAL 诊断退出 1；正式顶栏与 V2 原型间距、占位素材差异和亮主题标题 3.57 对比度提示保留 CONCERNS，不签整个 `ui-settings-confirmations`。

## GAL-ART-01A：沿用定稿 V2 的 demo 单件素材（S5 视觉接入）

- **Owner 决定（2026-10-11）：** “继续工作，用当前demo的素材”。接受复用现有图片，不重新生成整页 UI，也不把原型 HTML/CSS/JS 复制进运行时。当前五件通用 UI 皮为对话框、系统外框、按钮、紧凑存档卡、滑杆手柄；背景、立绘、CG 三件仅是 demo 内容，可进演示包但不得成为新 GAL 的隐式剧情素材。旧 `save-slot-v1.png` 不入本轮。
- **职责与边界：** `asset-manager` 专职拥有 `public/games/gal-template/art/**` 的图像副本、本地 AssetIndex、来源/许可/尺寸/透明度审计；GAL 程序主程仅拥有 `src/services/gal-ui/**` 的皮肤槽消费和点名测试。PUI 基座 `src/ui/**` 不改；正式消费只持稳定 assetKey，经本地索引解析为已登记 URL 后喂现有 `Panel.skin`/`Button.skin`/`Slider.thumbSkin`/`Image.src`。缺图 fail-soft；不读 `docs/design/galgame` 相对路径、不内联二进制、不写自由 DOM/CSS、不把装饰纹样和动态文字烘成整页图。
- **接线顺序：** 先登记并审计素材，再为模板提供可注入的已解析皮肤 URL 结构；主页/剧情/系统框/四页设置/4×3 槽、确认框与画廊仍保持 V2 的布局和动作。五件 UI 皮分别有消费位置；背景/立绘/CG 只通过演示内容映射到有权限的已解锁项，锁定 CG 不暴露 URL。保留未配置素材时的旧结构回退和默认皮，以保证其他游戏不受影响。
- **验收边界：** 逐件核对像素、真 alpha、来源和元数据；九宫格源边距按真渲实测，不凭图尺寸猜；1440×900 对主页、剧情、存读档、设置、回想/CG 进行同画布 V2 对拍，含深/亮主题可读性、四态存档卡、按钮状态、锁定 CG、素材加载失败。LayoutNode 校验及 UI 审计零阻断，GAL 定向测试和隔离撤修验红；复查人不得是施工人。视觉与演出仍须分别逐项签，不能由本单宣称整条 `media-and-final-skin` 里程碑完成；全库红项和项目控制台状态单列。
- **当前状态（2026-10-11）：** 8 张原图已由资产专职逐字节登记于 `public/games/gal-template/art/index.json` 并完成尺寸、路径、哈希与来源审计；GAL 消费侧完成稳定 assetKey、可注入 URL、缺图回退和锁定 CG 隔离。非施工者在 `review/GAL-ART-01A.md` 对原消费接口、在 `review/GAL-ART-01A-S2-S3-consumer.md` 对后续 S2/S3 消费与槽卡叠层分别签**局部 PASS**。S1/S2/S3 共享 PUI 接口也分别独立通过，对话框裁切、按钮皮比例、槽卡文字层与确认标题可读性均有新深亮真图；但工具栏亮主题 ghost 字色、设置页和确认框样式差异仍使 **S5 视觉 CONCERNS**，见 `gal-art-01a-s5-diff.md`。不得宣称 V2 1:1 或项目里程碑完成。未执行 Git/GitHub、数据库写入、服务启动或控制台 done。

### GAL-ART-01A/S1 · 大图九宫格源裁边与显示边宽不等（Owner 已选 A）

- **先查原文与重组失败证据：** `docs/playbooks/ui.md` 的 `Panel.skin` / `Button.skin` / `skinSlice` 是唯一现成贴图皮闭集；`src/ui/components/catalog.ts` 的字段只列单一 `skinSlice`；`src/ui/components/render.ts` 第 264–287 行实现为同一 `s` 同时写入 `border-width:${s}px` 与 `border-image:... ${s} fill / ${s}px`。定稿 `gal-ui-complete-v2.dc.html` 的系统外框却写 `border-image:... 115 fill /58px`（确认框同源 115 /36px），来源图 1536×1024；单一数不能同时复刻源切片和 58/36px 显示边宽。原始按钮、对话框、槽卡亦为千像素级，而运行时按钮仅约 30–44px、槽卡 164px；把大源裁边直接当显示边宽会挤占文字与内容。`cover` 可作退化，却不能保证装饰角、姓名牌与图案位置的 V2 1:1。已核对 `docs/playbooks/pick-list.md`、`docs/playbooks/assets.md` 的图库/assetKey 路线，没有另一个可表达“独立源裁边/输出边宽”的 UI 闭集；Owner Git 禁令下不执行手册建议的 `git pull`。
- **A · 补通用 PUI 能力（推荐长期）：** 在共享 `Panel/Button/Modal/dialog` 皮肤合同新增可选的源裁边与显示边宽分离字段，旧 `skinSlice` 保持兼容；由 PUI 专职实现目录、类型、渲染、样例、测试与手册，GAL 只填数据。代价是跨游戏共享 UI 面的变更和回归/复查；影响所有使用贴图皮的 UI，但可复用；若误选，可能引入全库视觉回归和维护面扩大。
- **B · 本模板资产适配：** 资产专职保留原图及哈希，在 `gal-template` 本地索引旁另备按固定消费尺寸规范化的派生图片，记录裁边/缩放/来源，GAL 用现有 `skinSlice` 或纯缩放消费；无游戏层自由代码。代价是多一套派生资产与逐屏核图，未来其它大图可能重做预处理；影响仅 GAL 模板，复用性有限；若误选，会形成资产转换债并可能在不同尺寸下模糊或裁花纹。
- **Owner 裁决（2026-10-11）：A，补通用 PUI 能力。** 原共享施工单 `REQ-PUI-GAL-SKIN-BORDER-WIDTH` 已于 2026-10-12 在接口独立 PASS、GAL 消费点名测试通过后从共享需求池释放；完整合同与裁决保留在本节及 `review/GAL-PUI-GAL-SKIN-BORDER-WIDTH-independent.md`，现行用法见 `docs/playbooks/ui.md`。B 的本模板派生图片路线不做；S5 视觉 1:1、亮色可读性及项目里程碑仍另行验收。
- **V2 源规格边界（2026-10-11 复核）：** A 精确解决 `.panel-skin` 的源 115 / 显示 58 和 `.overlay-panel` 的源 115 / 显示 36；它不自动复刻另外三种纹理策略：`.story-dialogue` 是背景图 `100% 160%`，`.art-button:before` 是伪元素背景图 `100% 220%`，`.slot` 是背景图 `100% 100%`。这三处及亮色主题仍须在 GAL 消费复拍逐项判定现有闭集是否能表达，不能把新九宫格字段一填就宣称五件 UI 皮全部对齐；若再次发现真缺口，另走实查+A/B，不得私加 CSS。
- **A 接口复查进展（2026-10-11）：** PUI 已下沉 `skinBorderWidth` 并交付独立复查；非施工者在 `review/GAL-PUI-GAL-SKIN-BORDER-WIDTH-independent.md` 签**通用九宫格合同局部 PASS**：69/69 点名测试、深亮审计零阻断、内存撤修五合同验红、两主题真实浏览器 computed slice/显示边/四边/外框/内容区各三目标通过，错误 57px 预期准确转红。此判词只放行 GAL 对共享闭集的消费，不签任何原图 S5 对齐。GAL 主程接下来仅在 `src/services/gal-ui/**` 给系统大框及确认框填 `skinSlice:115`、`skinBorderWidth:58/36`，保持无图回退与旧档/动作；按 V2 1440×900 复拍深亮主页、剧情、4×3 槽、设置、画廊及六类确认，再分别判定其余三件 UI 皮的现有闭集可表达性。不能靠本票替代独立 GAL 消费复查。
- **共享槽释放核对（2026-10-12）：** GAL 消费已见 `gal-ui-art.ts` 的系统大框 115/58、确认框 115/36；本回合 PUI 与 GAL 消费点名复跑 8 文件 79/79 通过。原共享票的通用接口范围结清并释放；同画布逐屏视觉偏差仍在 `GAL-ART-01A/S2–S5` 与 `gal-art-01a-s5-diff.md` 跟踪，不随共享票释放而消失。

### GAL-ART-01A/S2 · 对话与按钮的非 cover 贴图尺度（Owner 选 A；PUI 独立局部 PASS）· **PUI 施工主体 = Codex/root（2026-10-11 本地锁）**

- **已完成的可重组部分：** GAL 消费端在已解析系统原图上填 `skinSlice:115`；系统大框 `skinBorderWidth:58`、确认框 `36`。大框原 `padding:65` 与新 58px 边框按 content-box 相加会把外框撑到 1518px；改为 8px 后 1440×900 实测设置/画廊框回到 `x18 y61 1404×824`，存档框 `x18 y60 1404×830`。槽卡原型 `100% 100%` 可由现成 `Image.fit:'fill'` 作为第一 child 铺底，动态预览/文字仍保留为 LayoutNode，实测 4×3 卡为 309×164；但卡面编号/底部文字在真图上尚不清晰，不能仅凭树顺序宣称视觉叠层 1:1。显式旧 `slot.slice` 继续走旧九宫格。34 张深/亮同画布截图见 `review/gal-art-01a-*.png`，脚本 `src/services/gal-ui/verify-gal-art-live.mjs` 静态 `file://` 运行，无服务。
- **先查原文与重组失败：** Owner 定稿 `gal-ui-complete-v2.dc.html` 写明 `.story-dialogue` 的背景 `center/100% 160% no-repeat`，`.art-button:before` 则是 `inset:-5px -8px` + `center/100% 220% no-repeat`（选项另有 180%）。`docs/playbooks/ui.md` 只给 `Panel/Button.skin` 的 cover 或 `skinSlice` 九宫格，以及平铺 `bgTexture`；`src/ui/components/types.ts`、`catalog.ts`、`render.ts` 实查同样只有 cover/9-slice、平铺或 `Image.fit:cover|contain|fill`。`Image.fit:'fill'` 可处理槽卡，但不能表达对话皮的居中纵向超高裁切；普通 `cover` 会按原图宽高比裁，不等于 100%×160%。Button 无 children，不能用闭集 Image 作为底层；现有 `Button.skin` 的 cover/9-slice 也无独立伪元素外扩和 220%/180% 纵向缩放。`buildCapabilityCatalog()` 的 registry 是确定性世界能力，不提供 UI 图层尺寸字段；`docs/playbooks/pick-list.md` 剧情/VN 项只指向 UI 闭集。Owner Git 禁令下不执行手册建议的 `git pull`。真图截图已见对话姓名牌盖正文、按钮皮极细，不能以“图片已加载”冒称 S5 1:1。
- **A · 补通用 PUI 贴图层尺度合同（推荐）：** PUI 专职给 `Panel/Button` 的无九宫格贴图增加受校验的数值缩放/定位闭集（例如横纵百分比与外扩边距，保持旧 cover 缺省、输入上限、可审计）；GAL 只填 V2 数据。代价：跨游戏共享 UI 类型、目录、校验、渲染、审计、样例和回归；影响所有贴图皮消费者但兼容缺省；可复用于其它 VN/菜单。选错会增加共享 API 维护与视觉回归风险。
- **B · GAL 定尺派生皮：** 资产专职保留原图哈希，另产针对 1440×900 对话框与按钮/选项实际尺寸的审计型裁切/缩放变体并登记本地索引；GAL 仅按 key 消费现有 `skin`/`Image`。代价：更多有许可/来源/尺寸记录的图片和逐尺寸人审，按钮高度或响应式变化要重新派生；影响仅本模板，通用性低。选错会形成派生资产债、放大时模糊和后续布局返工。
- **Owner 裁决（2026-10-11）：A，补通用 PUI 非九宫格皮图尺寸/定位/外扩闭集。** 本票只授权 S2 贴图尺度，不捆绑 S3 亮主题颜色；由 PUI 专职独立施工、复查，GAL 只在其独立 PASS 后填闭集数据并按 V2 1440×900 深亮对拍。共享需求池已满 10 槽，本票沿现有 GAL 子票推进，不新增第 11 项。五类可执行确认中“退出游戏”仍是禁用宿主入口，不因本票自动获签；S5/S6 与 `media-and-final-skin` 仍 pending。
- **接口放行与 GAL 消费（2026-10-11）：** 非施工者在 `review/GAL-PUI-S2-SKIN-LAYER-independent.md` 对共享闭集签局部 PASS（46/46、深亮 row/column/grid 真皮图、锚点撤修转红）。GAL 已仅对默认 V2 非九宫格原图填剧情 `skinSize:{x:100,y:160}` / `skinPosition:'center'`，普通 art-button `100×220`、选项 `100×180`、外扩 x8/y5；对话框按原型外框 `x20 y555 1400×345`，旧显式 slice 与无图回退不改。槽卡现用 `Image.fit:'fill'` 先铺图，再以定位的纯数据 Panel 放活文字/预览，避免原先图片盖字。非施工者在 `review/GAL-ART-01A-S2-S3-consumer.md` 对最终 GAL 消费与槽卡叠层签**局部 PASS**：11 文件 98/98、34 态深亮静态截图、9/9 唯一锚点内存撤修验红，隔离浏览器已关；完整 S5 对拍仍 CONCERNS。

### GAL-ART-01A/S3 · 亮主题原图上的文字对比（Owner 选 A；PUI 独立局部 PASS）· **PUI 施工主体 = Codex/root（2026-10-11 本地锁）**

- **真渲证据：** 原图为暗靛背景，而 `apolloToon` 的 `text/sub/gold/ink` 全是深字；`review/gal-art-01a-story-normal-light.png`、`settings-text-light.png`、`confirm-new-game-light.png` 可见台词、标题/说明、确认文案暗字压在暗图上。深主题同画布可读，故不能把亮主题截图当作通过，也不能悄然将亮主题退成暗主题。
- **先修既有 PUI 合同不一致（不是 S2 扩权）：** `src/ui/components/types.ts` 和 `render.ts` 支持 `Label.color:{custom:'#…'}`，但 `catalog.ts` 将 color 列为纯 enum，`validateLayoutNode` 对对象报 `bad-enum props.color='[object Object]'`；试验使 GAL 定向测试 3 项转红，已撤回。此为 PUI 已公开类型/渲染与目录/校验不一致的 bug，应由 PUI 专职独立修复与复查；GAL 不改共享层，也不以无效树出货。**PUI 自检（2026-10-11）：** catalog 已改为 `enum-or-custom-color`；校验器只接受既有 token 或单键、非空、经同一 `safeColor` 净化后不变的 `{custom:string}`，裸色串、注入字符和扩展对象拒收。29 项定向 UI 测试通过；深/亮静态浏览器审计均零阻断（华丽度 0 是此单最小合同夹具的非阻断提示）。全库 TSC 仍被 card-reveal/dice/theft/launcher 既有错误阻断，未出现本票文件。导航：`docs/design/galgame/review/GAL-PUI-LABEL-CUSTOM-COLOR.md`。修复后仍须对 V2 指定色逐屏真渲复测，不能预签亮主题通过。
- **另一个真缺口：** `Modal` 内建 title 在 `src/ui/components/render.ts` 使用主题 `t.text`，GAL `ModalProps` 无标题色字段；子 `Label` 不能同时保留内建标题的无障碍语义、定位与 V2 亮字。`docs/playbooks/ui.md` 与 UI 类型/目录没有等价重组槽。此项独立于 `Label.color` 校验 bug，也不属于 S2 贴图尺度。
- **A · 补 PUI 的 Modal 标题色闭集（推荐）：** 由 PUI 专职给内建标题新增可审计、受校验的颜色令牌或受限指定色，缺省仍用当前主题色；GAL 在已批准的亮主题数据中填 V2 高对比色。代价是共享 UI 类型/目录/校验/渲染/审计及回归，影响其他 Modal 消费者但缺省兼容；通用性适用于深图上的亮主题弹窗。选错会扩大共享 API 维护与视觉回归面。
- **B · GAL 专用视觉重组：** 不扩 Modal 合同，改用现有主题/皮肤与内容结构，使亮主题确认框标题落在可读的浅底或取消暗图，同时保持内建 title 语义。代价是偏离 Owner 定稿 V2 的亮主题外观，需先改原型并请 Owner 重新定稿，可能牵动五类确认框及深亮主题一致性；仅本模板复用。选错会造成原型与运行时漂移或亮主题退化。未获新定稿前不执行此路线。
- **Owner 裁决（2026-10-11）：A，补通用 PUI Modal 内建标题色闭集。** 本票仅授权 S3 标题色，独立于 S2 贴图尺度；PUI 的 `Label.color:{custom}` 既有校验 bug 已按公开合同修复并独立局部 PASS，不借本次新裁决追认。Modal 新接口须由 PUI 专职独立施工、复查，GAL 只在其独立 PASS 后填 V2 高对比色并作深亮真渲。共享需求池已满 10 槽，不另增新项；亮主题与 S5 仍以逐屏复验为准。
- **局部施工与独立复查（2026-10-11）：** PUI 既有 `Label.color:{custom}` 合同修复已由非施工者在 `review/GAL-PUI-LABEL-CUSTOM-COLOR-independent.md` 签局部 PASS。GAL 消费端只在已加载深色对话/系统框原图时，对剧情正文/姓名/辅助字、设置框面标题/说明及确认正文填定稿受限 custom；无图回退与设置浅底卡片仍用原语义令牌。GAL UI 63/63 测试通过，34 张深亮静态浏览器图已重拍。非施工者在 `review/GAL-ART-01A-S3-label-consumer.md` 对本轮 Label 消费签**局部 PASS / S3 整票 CONCERNS**：独立 28/28 点名、三锚点内存撤修 3/3 验红、深亮六态原图 `file://` 真渲且浏览器已关；亮主题剧情正文、设置外框标题、确认正文邻近无字像素代表对比分别约 `14.57:1`、`13.10:1`、`12.15:1`（不是纹理最差值）。Modal 内建标题仍约 `1.26:1`，须等本票独立 A/B；设置浅底卡风格与 S5 1:1 也未签。
- **S3 后续局部事实（2026-10-11）：** 非施工者在 `review/GAL-PUI-S3-MODAL-TITLE-COLOR-independent.md` 对共享 `Modal.titleColor` 签局部 PASS（40/40、深亮确认标题真图、锚点撤修转红）。GAL 仅在系统框原图已加载时填 `titleColor:{custom:'#f5dfad'}`；确认标题与正文在亮主题新图均可读，旧 Modal/无图回退不变。剧情选项提示、存档/画廊外框和槽卡标签也补高对比的受限 Label 颜色。非施工者在 `review/GAL-ART-01A-S2-S3-consumer.md` 对最终消费签**局部 PASS / S5 CONCERNS**；最终 34 态深亮真图和 9/9 撤修验红在档，旧的 1.26:1 仅代表修复前证据。

### GAL-ART-01A/S4 · V2 紧凑 ghost 在亮主题深背景上不可读（Owner 已选 A；PUI 与 GAL 消费均独立局部 PASS，S5 CONCERNS）· **PUI 施工主体 = Codex/root（2026-10-11 本地锁；Git 操作按 Owner 禁令不由 agent 执行）**

- **真图与重组检查（2026-10-11）：** `review/gal-art-01a-story-choice-light.png` 中，V2 七个剧情工具栏键显式 `skin:''` 后不再继承 `apolloToon.buttonSkins` 绿色糖果皮，按钮点击区仍在；但 `Button.kind:'ghost'` 的字色仍来自亮主题 `t.sub`，深字压夜景。`src/ui/components/types.ts` 的 `ButtonProps` 无文字色槽，`src/ui/components/render.ts` 的 `renderButton` 对 ghost 固定 `color:t.sub`；`docs/playbooks/ui.md` 的 `Label.color:{custom}` 仅作用独立 Label。用 `Panel.action` + Label 虽能换色却失去原生 Button 的键盘、disabled、焦点语义；主题级改色会波及其它屏，暗主题强套亮主题又违反深亮双主题验收。现有闭集不能等价重组，不借 S3 的 Modal 裁决扩权。
- **A · PUI 通用按钮文字色闭集（推荐）：** 给 Button 增受限 `labelColor`（语义令牌或经净化的单键 custom），缺省保持 `t.sub`/原 skin 白字，显式关皮时可把 V2 ghost 字指定为亮色；PUI 专职负责类型/目录/校验/渲染/无障碍/样例/回归与独立复查，GAL 只填数据。代价是共享 UI 面和回归成本，但可复用；选错会放大跨主题一致性负担。
- **B · GAL 专用透明 ghost 皮资产：** 资产专职审计并登记透明 ghost 图，让现有 `Button.skin` 触发白字语义；GAL 用 key 消费，保留原生 Button 交互。代价是为字色引入近空图/派生资产、与 V2 纯 ghost 视觉语义偏离，素材失败时又回到不可读；复用性低，选错会留下隐蔽的资产依赖和降级可读性债。共享引擎需求池已满 10 槽，不新增第 11 项。
- **Owner 裁决（2026-10-11）：A，给通用 Button 增加受限文字颜色槽，可复用且无需额外素材。** 本裁决仅授权 S4 字色接口，不等于 S5/S6 视觉签收。PUI 专职施工并交非施工者独立复查；GAL 须等接口局部 PASS 后仅在默认 V2 有图 ghost 按钮填数据，旧显式 slice/无图路径保持既有语义，随后复跑深亮 1440×900 真图、对比/点击审计与独立消费复查。
- **共享接口独立复查（2026-10-11）：** 非 PUI 施工者在 `review/GAL-PUI-S4-BUTTON-LABEL-COLOR-lead-independent.md` 签局部 PASS：独立 528/528 UI 测试、深亮静态审计零阻断、唯一锚点内存撤修两红、四条未填字段旧路径字节一致、四类非法值拒收。只放行 GAL 数据消费；完整 V2 视觉和 S5/S6 仍是 CONCERNS。
- **GAL 消费本地自检（2026-10-11，待独立复查）：** 只在默认 V2 有 `art.button` 且无显式 `slice` 时，给七个剧情 ghost 与 `gal-replay-exit` 填 `skin:''` + `labelColor:{custom:'#e8e8f4'}`；旧显式 slice 与无图回退不填。GAL 64/64、共享 UI 528/528；34 态 1440×900 深亮静态复拍退出 0，脚本对七键逐一核对 computed `rgb(232,232,244)`、无主题糖果皮、中心命中和真实点击发出的具名 ActionSink 信号。原生禁用态点名断言、独立静态 `file://` 剧情推进→选支→回滚改选→读取/设置入口链通过，隔离浏览器均关闭；`tsc` 仍只有 card-reveal/dice/theft/launcher 旧诊断，GAL/UI 零诊断。此为施工侧证据，不代签复查或完整 S5；`gal-art-01a-s5-diff.md` 保留其余差异。
- **GAL 消费独立复查（2026-10-11）：** 非施工者在 `review/GAL-ART-01A-S4-consumer.md` 签 **S4 闭集消费局部 PASS / S5 视觉与对比度 CONCERNS**。独立 101/101 点名测试、38 态深亮静态真图、七键四态真实 ActionSink 28/28、回想退出/disabled/滚轮回滚、唯一锚点内存撤修 8/8 转红、旧 slice/无图 16/16 不漂；浏览器已关闭。真实亮主题夜景纹理上，save/load 按钮文字区域底色采样的对比度第 5 百分位约 3.42:1/3.08:1；此法不等同逐字形或正式无障碍审计，但不能宣称全域达到 4.5:1。V2 深色 ghost 胶囊底仍缺，须留 S5 差异，不以本票代签完整 V2。

## GAL-UI-03E：剧情屏余下 S4 锚点收敛（不改 V2 原型）

- **发现与归属：** `GAL-UI-03A` 独立复查只签“首个结构纵切片”，没有签完整剧情屏像素级 1:1。`review/gal-art-01a-story-dark.png` 真渲可见底部对话皮与动态姓名/台词交叠，不全是贴图处理问题：定稿 `gal-ui-complete-v2.dc.html` `.story-dialogue` 是 left20/right20/bottom0/height345、姓名相对 x102/y70、正文相对 x106/y143，而当前 `src/services/gal-ui/gal-ui-structure.ts` 的对话 Panel 为 x34/y678/width1372/height204，children 为流式 padding24。这是正式 S4 结构差异，不得用 S5 素材票或修改原型追认。
- **施工边界：** GAL 主程仅改 `src/services/gal-ui/**` 的纯 LayoutNode 剧情布局、测试及同画布对拍，保持既有 Director/回滚/选项/自动/历史/确认动作；不触 PUI 基座、原型文件或资产索引。先按无皮 fallback 对齐外框、姓名、正文、选项与立绘容器的 V2 锚点，再叠已登记素材检验遮挡；若现有闭集不能表达定位，留证走 A/B，禁自由 DOM/CSS。
- **验收：** 1440×900 剧情普通/选项/回滚重选、长台词、深亮主题的同画布包围盒及截图；对话框 x20..1420、y555..900，高345，姓名/正文/继续提示与原型锚点逐项记录误差，选项不被台词框遮挡，演示立绘不盖菜单或文字；动作主链和读取/设置入口回归通过，UI 审计零阻断，非施工者独立复查并撤修验红。此票只签 S4 几何，不签皮图裁切或 S5/S6 演出。
- **当前状态（2026-10-11）：** `review/GAL-UI-03E.md` 由非施工者独立签署**本票无皮 S4 几何局部 PASS**：1440×900 八态真浏览器外框/立绘锚点、35/35 定向测试（含真 DOM 对话框点击→选支→回滚重选）、normal-dark/choice-dark/long-light 三态 UI 审计零阻断及唯一锚点隔离撤修验红在档。有图立绘透明容器也已点名实测；原始对话皮令有图外框缩小 2px、亮主题文字低对比等归 `GAL-ART-01A/S1` 的 S5 视觉 CONCERNS，不冒称有图 1:1。全库 `tsc` 仍有非 GAL 红项；未执行受 Owner 禁令覆盖的 Git/服务/数据库操作。

## GAL-ENG-06A：通用自动播放与已读跳过调度（C2b·Owner 选 A）

- **施工主体：gal程序主程（2026-10-11 派工；本地登记，未作 Git 抢锁）。** 本票只授权 GAL 通用宿主/服务侧、相关定向测试和 Review 导航；与 P1 authoring 文件互不覆盖。独立复查必须由非施工者完成。
- **证据与归属：** `t3-narrative-director` 已有具名 advance/back 与已读完成事件，却在 `readInput` 对 `narrative.auto/skip` 明确返回 unsupported；Profile 有 `autoDelayMs`、`skipMode` 和全局已读，仍没有真正的消费调度。`docs/playbooks/pick-list.md` 的 dialogue/timeline 不提供宿主壁钟、UI 遮挡与可取消调度的组合。由 GAL 主程在 GAL 宿主/服务侧实现通用策略；不把定时器放进确定性 World，不改 PUI 共享控件或任何游戏私有代码。
- **最小施工合同：** 宿主注入时钟/可取消调度端口，且同时只允许一个待触发任务；auto 仅在当前可见台词完成阅读、当前 ref 仍相同、无选项/弹窗/设置/历史/读写档/回想遮挡时，按 Profile 延迟派一次具名 `narrative.advance`。skip 依 `read-only|all` 政策，默认只跳全局已读；无论模式都停在 choice、check 待决、ending、错误/加载边界，不能替玩家选支。手动滚轮、回滚、显式选择、读档、换包、失焦/暂停及关模式必须取消旧任务；旧任务迟到时凭 ref/epoch 双校验拒绝，不得跨新剧情继续跳。节流/优先级须有确定的宿主接线与可观察拒绝反馈，不向 sim 注入墙钟。
- **验收：** fake clock 下 auto/skip 的已读/未读、choice、回滚改选、连点/连滚、弹窗开关、读档换包和取消迟到任务点名测试；同输入世界 hash/存档恢复不受定时器扰动；真实浏览器手势走自动推进与上滚夺回控制，设置页原禁用行只有消费者和持久化都接通后才启用。独立复查、带锚点撤修验红、告警及原型差异另记。
- **当前状态（2026-10-11）：** 宿主调度和 LayoutNode/偏好接线已完成，非施工者在 `review/GAL-ENG-06A.md` 签署**本票局部 PASS**：GAL 相关 97/97、真实静态浏览器链、带唯一锚点隔离撤修验红。亮主题设置标题有一条非阻断对比度提示；S5/S6 原型视觉 1:1 未签。全库 `tsc` 仍有 15 条非本票诊断，`scoped-gate` 涉 Git 禁令未运行；未作 Git/推送、真实持久化写入、服务启动或项目控制台 done。

## GAL-ENG-06B：非权威存档预览 sidecar（C5a·Owner 选 A）

- **施工主体：gal程序主程（2026-10-11 派工；本地登记，Owner 已豁免先 Git 抢锁顺序）。** 只在 GAL 存档/宿主只读消费及本票测试/Review 边界内施工；是否需要 PUI 或真实截图采集改动须先给范围证据，不得顺手越域。
- **证据与归属：** 通用 `SaveMeta` 只有 slot/tick/hash/timestamp/label，GAL 手动槽列表没有缩略图；不能把图片混进权威 WorldSnapshot 或为首作私存截图。GAL 存档主程负责 sidecar 合同与槽关联，PUI 仅消费只读预览状态；图像实际采集/编码另按 UI/资产域边界接入。
- **最小施工合同：** 预览以 `packageId + slot + 当前权威 save hash` 定位，记录尺寸、媒体类型和受限字节/资源引用；读槽先验证权威档，再选配预览。缺失、坏图、旧档无预览、写预览失败一律明确降级但不得阻止合法存/读档；覆盖、删除、跨包和并发旧截图迟到不得展示错图或泄漏其他包内容。预览不是存档 hash、进度或解锁事实，也不得改变 `StoragePort` 的旧档载入语义。若底层需新增持久化端口，先写可替换端口与纯/内存测试，不由 agent 运行任何真实持久化写入测试。
- **验收：** 新/旧槽、覆盖时旧 hash 预览失效、删除/跨包隔离、损坏预览不影响权威读档、采集失败/迟到任务及 4×3 槽密度同画布对拍；独立复查证明侧车故障不影响存档，且不将占位图冒称正式视觉完成。
- **当前状态（2026-10-11）：** 非施工者已在 `review/GAL-ENG-06B.md` 签署**本票局部 PASS**。11/11 新点名、39/39 独立组合测试、1440×900 静态浏览器槽位审计与唯一锚点隔离撤修验红通过；空/伪 zlib 图、恶形侧车、挂起读和迟到 hash 均有实证修复。图像仍为测试色块，真实采集/持久化适配及原型完整视觉 1:1 不在本票。全库 `tsc` 仍有非 GAL 错误，`scoped-gate` 涉 Git 禁令未运行；未做 Git/推送、数据库或真实业务持久化写入、服务启动或控制台 done。

### GAL-ENG-06D：存档预览的 IndexedDB 非权威适配器

- **施工主体：Codex/root（2026-10-12 本地登记）。** Owner 已豁免本项目先 Git 抢锁顺序；仍不允许 agent 执行 Git/GitHub、数据库或真实业务持久化写入测试、服务启动。仅施工 `src/services/gal-save/**`、存档手册本行与本票测试/自证；非施工者须独立复查。
- **架构判断：接受现有能力重组，无需新 A/B。** `GAL-ENG-06B` 已给 `GalSavePreviewPort` 和按权威 hash 复验的控制器；`src/services/storage/indexeddb-kv.ts` 已有注入式 JSON 字符串 KV 与 `get/put/delete`。非权威侧车可直接消费这个基座，不能拿局外小态 `localStore` 装 256 KiB 图，不能把图塞进 `WorldSnapshot`、`SaveMeta` 或权威存档 hash，也不另造数据库基础设施。
- **最小合同：** 使用独立 `gal-preview:v1:` 键空间，以 `[packageId,slot]` 无歧义编码；写入前走现有严格 `parseGalPreviewRecord`，读出损坏/超限 JSON 交控制器降级为 damaged，缺失为 missing；`IndexedDbKV` 异常向控制器传播，由其降级为 unavailable。侧车无旧数据迁移；覆写、删除及跨包读取不得触碰 `snap:`/`env:` 权威键。仅通过显式注入的 `GalSavePreviewPort` 消费，不在静态 GAL 宿主中暗开真实数据库。
- **验收：** 内存字符串 KV 替身测试键隔离、跨包、覆盖、删除、损坏/超限、无存储与控制器权威 hash 保护；不得运行真实 IndexedDB/fake-indexeddb 写入测试。定向测试、类型检查据实记退出码，施工者留 Review 导航；非施工者按独立复跑与带锚点隔离撤修验红签局部判词。真实剧情截图采集、视频/音频、S5/S6 和 `replay-save-preview-auto` 整个里程碑仍票外。
- **当前状态（2026-10-12）：** 适配器、公开导出、手册回填与内存 KV 点名测试已施工；GAL 存档+UI 9 文件 88/88、文档引用守卫 PASS。非施工者在 `review/GAL-ENG-06D-independent.md` 独立复跑 14/14，并对键空间和超限守卫完成唯一锚点隔离撤修验红，签**本票局部 PASS**。全库 `tsc` 仍被非 GAL 诊断阻断；首次沙箱测试未收集用例，均已如实记录。真实 IndexedDB/跨会话与截图采集未验，**不签控制台整个里程碑完成**。未做真实 DB/业务持久化写入、Git 或服务启动。

### GAL-ENG-06E：宿主采集接缝与权威存档后的非阻塞缩略图写入

- **施工主体：Codex/root（2026-10-12 本地登记）。** 本项目 Owner 已豁免先 Git 抢锁顺序；范围限 `src/services/gal-ui/gal-ui-slice-host.ts`、`src/services/gal-save/**` 的必要类型/测试、存档手册和本票自证。非施工者独立复查。不得执行 Git/GitHub、真实数据库/业务持久化写入测试或服务启动。
- **架构判断：接受 06B/06D 既有能力重组，不新增数据或 PUI capability。** `GalSliceHost` 已显式注入 `savePreview`，`GalManualSaveController.save` 返回权威 `SaveMeta.hash`，`GalSavePreviewController.write` 已按当前权威 hash 拒绝旧图并验证图片。缺的是应用宿主提供的只读采集端口及保存后的调用时序；不能在确定性 World、LayoutNode action handler 或静态宿主中暗做截图/开数据库。
- **最小合同：** 可选采集端口只接收当前包与剧情投影的不可变纯数据（StoryRef、背景/立绘 asset key 及经宿主已解析 URL），返回现有 `GalPreviewImage` 或无图。仅在权威 `save` 成功后启动采集/侧车写入；不得阻塞权威保存反馈或读档。无采集端口/无侧车时旧行为不变；采集拒绝、抛错、坏图、侧车故障均只让预览降级。旧采集迟到时，06B 的 hash 守卫必须保证不会盖新槽图；返回槽页时按当前权威 hash 刷新，不把预览变成进度/可读性事实。真实图片编码与跨会话 IndexedDB 验收仍属后续适配/Owner 实机门，不在本票冒签。
- **验收：** 内存端口点名权威保存成功后才采集、保存反馈不等待挂起采集、坏图/失败不妨碍读档、两次覆盖与旧采集迟到、跨包/无端口不触发，以及 4×3 槽读模型不泄漏错图。独立复跑、带唯一锚点隔离撤修验红、读告警；全库门禁据实报告。本票局部 PASS 不代表 `replay-save-preview-auto` 完成。
- **当前状态（2026-10-12）：** 非施工者在 `review/GAL-ENG-06E-independent.md` 签署**本票局部 PASS**：只读采集接缝、权威保存后异步侧车接线，以及同一控制器内同槽慢速写入串行保护均已施工；独立先复现旧写盖新图，再复跑修复后的内存探针 1/1、GAL 存档+UI 93/93、补强后定向 44/44，并对控制器队列唯一锚点隔离撤修验红。真实图像编码、真实/跨会话 IndexedDB、跨控制器实例并发、S5/S6 视觉演出仍未验；全库 `tsc` 有非 GAL 红项。不得签整个里程碑、Owner 人门或全库门禁通过；未作 Git、真实数据库/业务持久化写入测试或服务启动。

### GAL-ENG-06F：浏览器场景缩略图编码器（不冒称整屏截图）

- **施工主体：Codex/root（2026-10-12 本地登记；本项目 Owner 已豁免先 Git 抢锁顺序）。** 范围限 `src/services/gal-save/**` 的可替换采集端口、点名测试、存档手册及本票自证；不改 PUI、资产索引、确定性 World、正式游戏或应用启动入口。非施工者独立复查；不得执行 Git/GitHub、真实数据库/业务持久化写入测试或服务启动。
- **架构判断：接受现有能力重组。** 06E 已给 `GalPreviewCapturePort`，GAL 只读投影已给经宿主按 assetKey 解析的背景/立绘 URL，06B 严格限制 PNG/WebP、尺寸与字节数。浏览器可用离屏 Canvas 对当前场景的已审核内容图做受限缩略编码；这不是 DOM/LayoutNode 整屏像素截图，不能据此签 S5/S6 视觉 1:1。没有有效内容图时返回无图，禁止把程序化占位冒称剧情画面。
- **最小合同：** 固定 16:9 小图、同源/CORS 可读内容图、背景 cover 与立绘 contain 的只读组合；加载或编码失败、无 Canvas、输出超限一律返回无图，不影响权威存读档。只输出 06B 可解析的受限 raster，不写数据库、文件、World 或 Profile；应用宿主显式实例化后才会采集。
- **验收：** 纯依赖替身点名构图、无图/加载失败、超限、格式回退；短生命周期隔离无头浏览器打开静态产物，实测有图输出与 06B 解析兼容，浏览器主动关闭；非施工者独立复跑与带唯一锚点隔离撤修验红。正式宿主注入、真实/跨会话 IndexedDB 与整屏截图仍票外，里程碑保持 active。
- **当前状态（2026-10-12）：** `BrowserGalPreviewCapturePort`、公开导出、点名测试、静态浏览器审计与存档手册回填已施工。非施工者在 `review/GAL-ENG-06F-independent.md` 签本票**局部 PASS**：独立定向 3/3、GAL 存档+UI 96/96；已登记 demo 内容图在隔离 Edge 静态 `file:` 浏览器中实编 WebP 320×180，并回经 06B 严格解析；唯一锚点撤去背景绘制使 1/3 转红。浏览器和临时构建已关闭清理。此图是背景+立绘的场景预览，不是整屏截图；正式作品宿主注入、真实/跨会话 IndexedDB、跨控制器并发、S5/S6 尚未验。全库 `tsc` 仍有非 GAL 红项，`replay-save-preview-auto` 保持 active；未做 Git、真实数据库/业务持久化写入测试或服务启动。

### GAL-ENG-06G：同进程多控制器预览写入定序

- **施工主体：Codex/root（2026-10-12 本地登记；本项目 Owner 已豁免先 Git 抢锁顺序）。** 范围限 `src/services/gal-save/gal-save-preview.ts`、点名测试、存档手册和自证；非施工者独立复查。不得执行 Git/GitHub、真实数据库/业务持久化写入测试或服务启动。
- **架构判断：接受现有 06B/06E 能力的窄修正，不新增存储 capability。** 当前 `GalSavePreviewController.writes` 是实例字段；两个控制器即使代表同一 `packageId+slot`，也可同时通过权威 hash 检查，使慢旧 I/O 晚于新图落侧车。删除侧车也未入队，延迟删除可抹去新图。权威读档始终安全，但槽图可能退化为 stale/missing。将侧车写/删队列提升到模块内同进程键空间，跨实例、跨适配器对象按包与槽定序；写前重检权威 hash，等待中的删除执行时若发现新权威档则不删；不同包/槽不互锁。不能把这项声称为跨标签页/跨进程 IndexedDB 原子事务。
- **验收：** 双控制器、不同适配器对象共用内存后端，旧写挂起后产生新权威 hash，新写不得抢跑；释放后旧写 stale、新图 ready，权威快照不变。延迟删除不能抹去新图，等待旧写的清理若发现新权威档则跳过删除。不同包/槽可并发；异常写释放队列，无存储故障不阻断权威存读档。独立复跑、带唯一锚点隔离撤修验红、读全库告警。本票局部 PASS 不关闭 `replay-save-preview-auto`。
- **当前状态（2026-10-12）：** 06G 同进程包+槽队列已覆盖跨控制器写/删；非施工者在 `review/GAL-ENG-06G-independent.md` 签本票**局部 PASS**：最终定向 24/24、GAL save+UI 101/101，删除队列唯一锚点隔离撤修使 2/24 转红，初版写队列撤修使 3/22 转红，临时配置均已清理。真实/跨会话 IndexedDB、跨标签页/进程事务、正式应用宿主及 S5/S6 未验；全库 `tsc` 仍有非 GAL 红项，里程碑保持 active。未做 Git、真实数据库/业务持久化写入测试或服务启动。

### GAL-ENG-06H：静态浏览器整链存档预览验收（内存端口）

- **施工主体：Codex/root（2026-10-12 本地登记；本项目 Owner 已豁免先 Git 抢锁顺序）。** 仅新增 `src/services/gal-ui/` 的验收 fixture/runner 与自证；消费已登记的 demo 背景、立绘 assetKey，保持资产索引只读，不改生产 UI、PUI、权威存档、真实数据库或应用入口。非施工者独立复查。
- **架构判断：接受现有能力重组。** 06E/06F 的独立局部 PASS 尚未证明 `GalSliceHost` 真实浏览器主链把内容图采集结果投到 4×3 存档卡。用短生命周期静态 `file:` 浏览器、真实 LayoutNode 宿主、浏览器编码器、纯内存 Profile/权威槽/侧车按按钮跑“开始→保存槽 2→图就绪→读取”；URL 由本地已登记资产索引按稳定 key 注入，禁止在 World/内容包硬编码 data URL。
- **验收：** 实浏览器存档反馈不等待缩略图、随后槽 2 `preview=ready` 且 `<img>` 可解码；图 hash 等于当前权威槽，读档成功；无预览端口时仍可存读。浏览器和临时构建必须关闭/清理，不启动服务，不碰真实业务持久化。它是测试 fixture，不冒称正式产品宿主注入、跨会话 IndexedDB 或视觉 1:1。
- **当前状态（2026-10-12）：** 非施工者在 `review/GAL-ENG-06H-independent.md` 签本票**局部 PASS**。独立静态 Edge 真 DOM 双链：有预览端口时槽 2 ready、WebP 320×180 可解码且预览/权威 hash 同为 `3165e9f3`，无端口时槽 2 no-preview 仍可存读；GAL save+UI 101/101。唯一锚点隔离撤去浏览器采集注入使 ready 断言转红为 no-preview，权威 hash 保留；浏览器和审计临时目录已清理，docs-ref-guard PASS。正式作品入口、真实/跨会话 IndexedDB、跨标签页事务和 S5/S6 均未验；全库 `tsc` 有非 GAL 红项，整个里程碑保持 active。未做 Git、真实数据库/业务持久化写入测试或服务启动。

### GAL-ENG-06I：隔离本地真实浏览器 IndexedDB 跨会话验收

- **施工主体：Codex/root（2026-10-12 本地登记；本项目 Owner 已豁免先 Git 抢锁顺序）。** 仅限隔离审核 fixture/runner 与说明，不改预览端口或真实数据。Owner 已修订 `AGENTS.md §2`：确认位于本机、任务级隔离的数据库验收可由 agent 执行，远程数据库写入仍严禁。
- **架构判断：接受现有 `IndexedDbKV` 与 `IndexedDbGalSavePreviewPort` 的显式组合。** 用隔离、任务级临时浏览器配置和拦截的固定 HTTPS 测试源，不启动服务或触碰 Owner 日常浏览器；在浏览器会话 A 写入合法侧车、关闭后用同一临时 profile 的会话 B 只读验证，再在该隔离数据库内写入损坏 JSON 验证降级、删除。Runner `finally` 关闭浏览器并验证临时路径后清理。它验的是侧车适配器，不冒称正式作品宿主或权威存档端到端。
- **验收：** 施工与非施工者在隔离本地浏览器分别实测合法图跨会话可读、损坏 JSON 降级、删除后缺失、清理无残留；复查带锚点撤修验红。跨标签页原子竞态另需裁决，不因跨会话单写通过而关闭里程碑。
- **当前状态（2026-10-12）：** 真实 Edge 隔离 profile 下施工与非施工者独立复跑均获 **06I 局部 PASS**；会话 A 写、关闭后会话 B 读一致，坏 JSON `damaged`、删除 `missing`，临时 profile 清理；唯一锚点改坏预期 hash 在隔离副本中转红。见 `review/GAL-ENG-06I-self.md` 与 `review/GAL-ENG-06I-independent.md`。它只验侧车适配器，不覆盖正式宿主、图像像素、无存储或跨标签页定序；里程碑仍 active。

### GAL-ENG-06J：真实浏览器全端口槽预览与降级纵切片

- **施工主体：Codex/root（2026-10-12 本地登记；沿用 Owner 的先 Git 抢锁顺序豁免）。** 仅在 `src/services/gal-ui/` 增加隔离浏览器验收 fixture/runner 与本票自证，不改正式 UI、PUI、资产索引、权威存档或生产宿主；非施工者独立复查。真实数据库仅限任务级隔离本机 profile/DB，所有请求须本地 fulfill 或 abort。
- **架构判断：接受现有能力重组，无需新 A/B。** 06H 真 DOM 主链只用内存端口，06I 真实 IndexedDB 只验侧车原始读写；可显式组合既有 `IndexedDbStoragePort`、`IndexedDbSavePort`、`IndexedDbGalSavePreviewPort` 和 `BrowserGalPreviewCapturePort`，不新增存档 capability。所有端口用独立测试 DB 与 `ls:null`，不读取或迁移日常 localStorage。
- **最小合同：** 静态 1440×900 真浏览器从主页按真实按钮保存槽 2，权威存档、Profile、预览侧车均写入隔离 IDB；关闭浏览器后用同一隔离 profile 新会话显示可解码槽图并成功读档。随后在隔离侧车注入坏图，要求卡片降级且权威仍可读；模拟侧车存储不可用时亦不得阻断权威槽；任何图片/元数据不得进权威快照。浏览器和临时构建必须在成功/失败路径关闭与清理。
- **验收：** 同画布真 DOM 可见结果、权威/侧车 hash 对齐、跨会话、坏图、无侧车存储、正常读档；独立复跑、带唯一锚点隔离撤修验红和告警阅读。此票是正式 Web 宿主接线前的纵切片，不冒充产品入口，也不解决跨标签页原子竞态或 S5/S6。
- **当前状态（2026-10-12）：** `review/GAL-ENG-06J-self.md` 与非施工者 `review/GAL-ENG-06J-independent.md` 均记录**本票局部 PASS**。隔离 Edge 的真实 LayoutNode 操作写入权威槽、设置 Profile 和侧车预览三种 IndexedDB 记录；重开后 `exitGame=false`、槽 2 真图 320×180 与 hash 对齐并可读档。侧车坏图、侧车存储不可用时仍能读权威槽；两枚唯一锚点撤修均由独立复查转红，浏览器与临时目录清理。全库 `tsc` 仍有非 GAL 错误；本票不关闭正式作品宿主、跨进程政策或 V2 S5/S6，里程碑保持 active。

### GAL-ENG-06K：跨标签页/进程槽预览一致性政策（Owner 已选 B）

- **实查：** `docs/playbooks/save-platform.md` 与 `gal-save-preview.ts` 的 `previewWrites` 仅保证同一 JS 进程内排队；侧车键 `[packageId,slot]`，没有跨进程锁或条件写。`gal-save-preview-indexeddb.ts` 的单记录事务不能与权威存档组成原子写；重组不出跨窗口强一致。
- **备选代价：** A 是通用版本键/事务与迁移，能支持跨窗一致预览，但扩大共享协议、容量及测试面；B 保留非权威图片的 hash 核对和降级，低成本，但不支持实时同步或并发冲突解决。选错 B 的代价是将来若要求多窗同槽编辑，需重新设计 A。
- **Owner 裁决（2026-10-12）：B，不要求多窗口。** 正式 GAL 按单窗口、单活动写入者设计；不加跨进程锁、版本键或迁移。意外多窗口同槽写入可能后写覆盖权威存档，产品不保证冲突解决；预览按当前可见权威 hash 核对，旧图/坏图/无存储只显示 `stale/damaged/unavailable`，不冒充当前槽、不阻断权威读档。活动页不保证自动刷新，重新进入槽页或重启后重读。将来改变多窗口目标须另立需求并重新裁决。
- **证据边界：** 06B/06G/06J 局部独立 PASS 覆盖权威/侧车分离、同进程竞态、真实 IndexedDB 跨会话与降级；不代表跨窗口并发或正式宿主已验收。06K 只关闭策略未决，不关闭整个里程碑。

### GAL-ENG-06L：正式 Web/Electron-webview GAL 宿主装配

- **施工主体：GAL 主程；复查主体：独立 reviewer。** 06J 的手工测试页不能充当作品入口。现有 `createGalWorld`、`GalSliceHost`、IndexedDB 三端口、浏览器采集器与播放调度器可直接重组；无需新引擎原语或首作私有代码。
- **合同：** 通用宿主收作品数据包、受限初始 Manifest、稳定 DB 名和显式内容 URL/可选 UI 美术映射；校验后创建 World，注入权威槽、Profile、非权威预览侧车、真图采集与宿主时钟，并提供幂等卸载/连接释放。demo 背景/立绘不能成为新作品隐式默认。仅单活动写入者；Electron 的 webview 可复用此浏览器宿主，实际桌面打包另归发布里程碑。
- **验收：** 把 06J 真浏览器全端口测试页改为调用正式宿主，不再手工构 World/ports；隔离本地 Edge 跑跨会话 320×180 真图、权威 hash、坏图/无侧车降级及自动推进；定向测试和类型诊断据实记录；非施工者独立复跑并做带锚点隔离撤修。06L 局部结论不代签项目 Owner 人门，也不宣称首作或 V2 S5/S6 完成。

## GAL-ENG-06C：隔离回想重播会话（C5b·Owner 选 A）

- **施工主体：gal程序主程（2026-10-11 派工；本地登记，Owner 已豁免先 Git 抢锁顺序）。** 本票限通用 GAL 回想会话、宿主/只读 UI 路由与相应测试，不顺手实现音视频、正式截图采集或写作产线。
- **证据与归属：** Profile 仅持有 `unlockedMemoryIds`，`NarrativeHistory` 仅为活动会话窗口；画廊卡目前是只读，既有存档槽/回滚不能代替从解锁记忆入口开始的隔离重播。GAL 主程负责通用会话合同与主机路由，不写首作私有 World 逻辑。
- **最小施工合同：** 只允许从当前包已解锁且有效的 memory 条目开启；为回想创建独立运行 World/Director 与历史，活动 World、手动槽、全局 Profile/里程碑桥均只读且原样保留。回想中的选择与回滚只影响隔离会话；退出/完成/异常后精确返回原页面、焦点与活动剧情位置，不自动存档、不把重播台词计入全局已读或再次解锁。换包、重复开回想、坏入口和资源缺失须显式拒绝/降级并清理会话。
- **验收：** 开始前/重播中/退出后的活动 World hash、槽 hash、Profile 逐项不变；两条回想分支、回滚、异常退出、重复打开与跨包拒绝；真实浏览器从画廊进入/返回，锁态不泄露资源。独立复查必须用可复现手势与隔离撤修证明不会串入主线。
- **当前状态（2026-10-11）：** `review/GAL-ENG-06C.md` 由非施工者签署本票局部 PASS：GAL 123/123，1440×900 静态真浏览器进入、双分支、回滚、退出与焦点返回通过，活动 World/手动槽/Profile 前中后不变，并发双开缺口修复后两次唯一锚点隔离撤修验红。全库 `tsc` 仍有其他游戏/launcher 诊断，不签完整 GAL 或控制台 done。

## GAL-UI-04C：设置页 S4 几何偏差收敛（沿用 Owner 定稿 V2）

- **策划判断与归属：** 接受现有 LayoutNode 闭集重组，不另造 PUI 控件，也不反向改定稿原型。`gal-ui-04a-structure-diff.md` 已量到共用框和两列卡四轴吻合，但标题高少 9px、四页签高少 13px、底栏高少 20px，顶部场景导航在框内而原型在框外；这些是 S4 结构偏差，不应拖到 S5 素材阶段。施工主体为 GAL 主程，限 `src/services/gal-ui/**` 的模板布局、定向测试/审计与同画布差异单；PUI `src/ui/**`、游戏目录、正式资产和原型文件均不改。
- **写死目标：** 以 `gal-ui-complete-v2.dc.html` 的 1440×900 状态为真相，四页设置共用框保持 x18/y61/1404×824，标题 x84/y109/1272×61，页签 x84/y185/1272×44，网格 x84/y244/1272×320（文本/声音）及画面/确认既定卡高，底栏 x84/y782/1272×51；场景导航按原型移到框外并保持返回精确来源。要同时测文本、声音、画面、确认四页与有/无确认弹窗，不得靠遮住/删掉待接功能行凑尺寸。若框外导航经闭集 catalog/实际 DOM 包围盒证明表达不了，停在 PUI 缺口裁决点，不写自由 DOM/CSS。
- **验收：** 同画布原型/正式页面四页标题、页签、卡、底栏、导航外框包围盒逐项给目标/实际/差值与截图；复跑来源返回、六项确认、Auto/Skip 和设置滚轮隔离，未接音频/画面/恢复默认继续诚实禁用。`validateLayoutNode` 零 issue、深/亮审计四关阻断归零、静态真浏览器完整链及非施工者独立撤修验红；视觉纹样、字体、CG、S5/S6 时序和桌面退出仍票外，不能用本票宣称完整设置里程碑。
- **当前状态（2026-10-11）：** `review/GAL-UI-04C.md` 非施工者签署局部 PASS；四页系统框、框外导航、标题、页签、两卡、底栏的 1440×900 原型/实机包围盒四轴均差 0px，静态真浏览器操作链、103/103 GAL 测试、八态深亮审计及隔离撤修验红通过。原型花纹/按钮皮、禁用的未接功能与全库其他项目类型错误仍未关闭，不签完整设置里程碑。

## GAL-UI-03D：4×3 存读档卡片 S4 高度与网格对齐

- **策划判断与归属：** 接受已有 LayoutNode 闭集数据重组，不申请新 PUI 控件。`review/GAL-ENG-06B.md` 的同画布实测显示原型槽网格 `x84 y238 1272×508`、卡 `309×164`，当前测试色块结构为 `x84 y237 1272×552`、卡 `309×176`；预览卡曾因默认内边距撑高，06B 仅修图片与文字不溢出，未签网格 1:1。这是 S4 几何债，不等真实截图采集或 S5/S6 美术债。GAL 主程只改 `src/services/gal-ui/**` 的槽模板/只读布局与定向测试、量测证据；不动定稿原型、PUI 基座或资产索引。
- **写死目标：** 在 1440×900 与 Owner V2 同浏览器量测下，第一页 12 个槽保持 4×3 可见，网格/卡的 x、y、宽、高和行列间距与原型对齐；空槽、有档无预览、有效预览、坏预览降级四态都不能撑高卡片或把底栏推走。保留既有槽编号、保存/读取/覆盖确认、分页、焦点、坏图/跨包不泄漏及 06B 非权威 sidecar 行为。若原型不同槽态尺寸不同，以同态对拍并记录，而非挑单态冒称零差。
- **验收：** 原型/正式同画布四态包围盒与截图，明确目标/实值/差值；真浏览器分页和槽 2 存读档，空/有图不改变布局，12 卡无重叠/溢出。`validateLayoutNode` 零 issue、深/亮 UI 审计阻断归零、非施工者独立复跑与带锚点撤修验红；测试色块必须标为占位，真实剧情画面采集、持久化后端和视觉皮肤另票，不因本票关闭 `replay-save-preview-auto`。
- **当前状态（2026-10-11）：** 非施工者在 `review/GAL-UI-03D.md` 签署局部 S4 PASS。四态 4×3 网格、12 卡、底栏与定稿原型的 1440×900 包围盒四轴差值均 0px；第 2 页与槽 2 确认存读真实静态浏览器链通过，GAL UI/存档 69/69、UI 基座 506/506、深/亮审计阻断 0。唯一锚点内存撤修卡数据高 142→154 后实测卡 176px（目标 164）验红。逐项截图/差异见 `gal-ui-03d-structure-diff.md`；预览仍为测试色块，真实截图/持久化、S5/S6 和全库门禁未签，未做 Git/数据库写/服务启动或控制台 done。

## GAL-PIPE-01A：P0–P4 通用草稿与人工审核纯合同（P1·Owner 选 A）

- **施工主体：Codex/root（2026-10-11 本地领单）。** Owner 在本会话明确表示当前项目只有一人，可忽略本票“先推送抢锁记录再写代码”的限制；因此本地领单足以继续本票施工，但不冒充已提交或推送。此豁免只针对抢锁顺序，不放宽 Git/GitHub 全禁、数据库/持久化数据写入禁令、启动服务禁令或非施工者独立复查。仅施工本票纯 authoring 合同、校验、事件 reducer、只读投影和点名测试；共享工作树仍须保留并适配其他在途改动。
- **证据与归属：** `creation-p1-spec-research.md` 实查正式 `GalPackage` 校验、Life 生成合同、素材待审和路线图均不能表达逐草稿人审；外部 `WritingEnginePort` 尚无已知实现。通用 authoring/service 面由 GAL 主程负责，**首票只做纯数据合同、确定性校验和审核事件 reducer**；不建工作台、数据库、外部模型适配或 P5–P9 装配，不改运行时包 V1。
- **最小施工合同：** P0 Brief、P1 圣经、P2 路线、P3 图、P4 节拍各闭集 schema 和稳定业务 ID；可信侧分配不可变 `draftId/revision`，规范指纹覆盖 `projectId/kind/schemaVersion/basedOn/data`；模型只提交不可信 `data` 候选。批准、拒绝、取代来自带审核人/理由的追加式可信事件，`status` 为只读投影；审批时验证唯一当前已批准的紧邻上游，旧批准版直到新候选获批才被取代。上游换版使后继 `stale`、撤销且无替代使其 `blocked`，但不删除历史；P0–P4 即使全批准也不得装配成 `GalPackage`，P5/P6/P7 仍是后继门。
- **验收：** 研究稿 §5 六组点名测试全部落实，包括规范 hash/输入不变、坏 schema/跨项目/坏引用、模型伪 approved、拒稿不破坏旧批准链、逐阶段失效矩阵，以及 P3 图结构可达不冒称条件可玩；受限/恶形输入有稳定路径诊断。先交纯合同局部独立复查，再另票设计审计持久化/并发/权限和真实写作项目窄适配；未获准模型接口不得虚构。
- **当前状态（2026-10-11）：** P0–P4 纯合同已由非施工者在 `review/GAL-PIPE-01A.md` 签署**本票局部 PASS**：点名测试 12/12、authoring 目录 64/64，稀疏数组恶形输入复现并修复，basedOn 指纹隔离撤修验红。全库 `tsc` 仍有 15 条非本票诊断，`scoped-gate` 涉 Git 禁令未运行；未作 Git/推送、项目控制台写入或正式包装配，不得称全库完成。

> `REQ-GAL-PROFILE-EVENT` 已于 2026-10-10 获 owner **选择 A（通用引擎能力）**；04A 与 04B 均已完成局部独立复查 PASS。全库既有非 GAL `tsc` 红灯不得称整体门禁绿，且未执行任何 Git/GitHub 操作。

## GAL-PUI-04A：通用 `Toggle.disabled` 闭集语义

- **Owner 裁决（2026-10-10）：A·补通用 PUI 能力。** 不采用 GAL 局部禁用按钮/文字来假装 V2 开关。实查 `src/ui/components/types.ts` 的 `ToggleProps` 当时仅有 label/checked/action，`catalog.ts` 无 disabled，`renderToggle` 即使 action 缺席仍输出可聚焦、可切换的 checkbox；`node scripts/ui-find.mjs "disabled toggle"` 未命中。与已有 `Slider.disabled` 重组不成 Toggle 的键鼠触控禁用语义。A 影响共享控件但可复用且保留原型形态；B 少碰 PUI、却会造成 V2 结构偏差与后续偿债。Owner 已选 A。
- **需求池与归属：** 主池原 10/10；`REQ-GAL-PROFILE-EVENT` 的 04A/04B 均有独立局部 PASS 且本地裁决/Review 在档，按完成出池后原位登记 `REQ-PUI-GAL-TOGGLE-DISABLED`，仍为 10/10。PUI 专职独占 `src/ui/**`、game-i 活范例和 UI 手册；GAL 程序只在后继 `GAL-UI-04A` 消费字段，严禁越域改基座。Owner Git 禁令下，此为本地工单变更，未宣称已提交/推送。
- **最小合同：** `ToggleProps.disabled?: boolean` 缺省 false；catalog/校验器与类型一致。禁用时保留 `checked` 的只读外观、label、可访问描述，但底层输入 native `disabled`、不可进入 Tab 序，鼠标、键盘、触控均不能切换或向 `ActionSink` 派 action；若挂有 action 也必须被禁。启用态的 checked 变化、`'true'/'false'` 参数与旧 Toggle 行为逐字兼容。不得给 Checkbox/Slider/其他控件增加未请求的行为，也不得添加自由 DOM 回调/CSS 逃生。
- **点名验收：** enabled/disabled 的 checked true/false 四态；点击 label、空格/键盘导航、触控/指针、重渲染后禁用状态，`ActionSink` 零发/启用时恰一发；catalog/schema、game-i 活范例、UI 手册同步。`validateLayoutNode` 零 issue，深/亮主题审计阻断归零；共享 `src/ui/components` 与 game-i 相关用例回归，全库既有非本票红项单列。非施工者独立复跑、唯一锚点隔离撤修验红、实证复现、读告警后只签此通用控件票。不得启动应用服务、写数据库或自行做 Git/GitHub 操作。
- **交付（2026-10-10）：** `review/GAL-PUI-04A.md` 最终独立复查 **PASS**：23/23 定向用例、深/亮隔离审计阻断项 0、checked 双态的 action 隔离撤修验红均由非施工者复跑；初次审计环境 CONCERNS 及收敛过程在 Review 保留。此结论仅放行通用 `Toggle.disabled` 消费，不代表设置页完成。

## GAL-UI-04A（可施工）：四页设置结构与六确认真实接线

- **独立复查结论（2026-10-10）：本票局部 PASS，完整 S4/V2 与全库门禁 CONCERNS。** 非施工者已签 `review/GAL-UI-04A.md`：自行复跑 94/94 GAL、506/506 UI、八态设置页审计、04A 与 03A/03B 静态浏览器主链，唯一锚点隔离撤修验红；探针已清理、浏览器已关闭。阶段结构差异见 `gal-ui-04a-structure-diff.md`。`ui-settings-confirmations` 控制台仍 planned，不由本票代写；下方“可由 gal程序领取施工”是开工前置记录，施工主体已于本日领单。
- **状态（2026-10-10）：前置满足，可由 gal程序领取施工。** `GAL-ENG-05A` 已获非施工者独立复查**局部 PASS**（`review/GAL-ENG-05A.md`），Profile V2/六项确认政策可消费；这不等于四页设置已完成。Owner 已批准 `ui-core-slice` **仅 S4 结构纵切片**；Owner 当日亲自执行控制台合法保存并贴回 `success=True`、`autoClosed` 含 `profile-save-bridge`，随后只读核对两项前置在控制台实档均为 `done`。`GAL-PUI-04A` 最终独立复查 **PASS**，通用 `Toggle.disabled` 可消费。`ui-settings-confirmations` 在控制台仍 planned；`ui-gallery-geometry-closure` 亦仍为旧 planned。Owner 禁令下不由 agent 写控制台持久化状态。施工者先按共享工单锁规标记本人为施工主体；需 Git 步骤时按最高禁令交 Owner 本机执行，不自行运行。
- **施工主体：Codex/root（2026-10-10 本地领单）。** 仅在本票授权的 GAL UI/Profile 消费侧与定向测试、差异证据内施工；共享树有其他施工者，保留并适配其改动。Owner 最高禁令下不执行 Git 锁、提交或推送，不修改控制台持久化数据；独立 Review 由非施工者签。
- **策划判断：接受分层交付，回驳伪功能。** V2 定稿的文本/操作、声音、画面、确认窗口四页可用既有 `Panel`、`Button`、`Slider`、`Toggle` 等 LayoutNode 闭集组合；但 `narrative.auto/skip`、真实音频试听、主音量/语音自动/失焦静音、桌面窗口/全屏、转场与画面偏好仍未有对应运行合同。04A 只签四页**部分 S4 信息结构**、六确认开关的真实持久化、以及当前宿主已有五类操作的确认影响；`exitGame` 在本票只验偏好与纯政策，桌面退出另票。其余行必须显式标为待接入且不可伪装为生效设置，后续按能力归属拆票，不能把 04A 说成完整设置系统或完整 V2 结构 1:1。V2 `.dc.html` 只作最终目标，不复制 DOM/CSS/JS，也不反向修改原型追认阶段性缺件。
- **PUI 禁用态 Owner 已选 A 且独立复查 PASS。** 初次实查 `src/ui/components/catalog.ts`/`types.ts`/`render.ts` 时 `Slider.disabled` 已有、`ToggleProps` 缺 disabled、无 action 的 Toggle 仍可交互；Owner 因此选择 PUI 通用 `Toggle.disabled`，保留 V2 控件形态、键鼠触控与 action 同时禁用，不采用 GAL 局部禁用按钮/文字来追认结构偏差。`GAL-PUI-04A` 最终 Review PASS 后，本票可直接消费该闭集字段。
- **施工归属（待前置满足后生效）：** gal程序主程负责 `src/services/gal-ui/**` 的 LayoutNode 模板、只读模型、宿主 action 与定向测试；PUI 专职负责先行的通用禁用态。`src/services/gal-profile/**` 的合同若需扩写仍由 GAL 主程负责；不碰 `assets/**`、其他游戏或正式发行。施工者与复查人不同，不做受禁 Git/数据库/服务启动。

### 04A 写死验收范围

1. 同 1440×900 原型对拍四页：共用系统框 x≈18、y≈61，标题/导航、四页签、两列设置卡、说明与底栏；确认页为 3+3 两组。主页/剧情/槽位/画廊入口进入设置，切页不写 World/Profile，返回精确来源、页码和选中态；故事滚轮与 Modal 不能在设置页透传。
2. 六个确认 `saveEmpty/overwrite/load/newGame/returnTitle/exitGame` 从**当前 package 的 Profile V2** 投影 checked。现有 Toggle 的 ActionSink 值仅为 `'true'/'false'`、不携 key；模板须给六个独立闭集具名 action，由宿主显式映射合法 `GalConfirmationKey`，不得从本地化 label 推断 key。持久化成功后才更新 UI；失败保留旧显示值并给明确反馈。`persistGalConfirmation` 所需 `savedAt` 必须由宿主/app 层明确注入有效安全整数（可在 `GalSlicePorts` 增窄时间提供口并更新调用点），不能由 LayoutNode/控件或确定性 sim 取 `Date.now`，也不能传 `undefined` 伪造成功。并发设置写与里程碑桥仍走 05A 同包串行 lane。跨手动槽、读档、回滚与重启宿主不丢开关，不串 package。关闭某项只跳该类弹窗，不改变合法性或操作本身；保存空位与覆盖、读取、新游戏有/无进度、返回标题这**五类已有宿主操作**分别走真浏览器链。`exitGame` 仅验证 Profile 持久化和 `requiresGalConfirmation` 纯政策；浏览器无退出端口时按钮禁用并说明，不能把它算作第六条实机操作闭环或假报退出成功。
3. V2 的全局“恢复默认”会同时重置文字、音频、画面和六确认；04A 仅有六确认真实生效，因此该按钮必须**可见但禁用**，并标明“待完整设置接入”，不得以同名按钮只重置六项来改变定稿语义。完整恢复默认归 04B：在全部纳管偏好拥有真实消费者后，用单次串行 Profile 事务重置这些偏好与六项确认，保留已读/解锁等非设置事实，失败不刷新为伪成功。文本速度、自动间隔、BGM/语音/SFX 现虽已有 Profile 字段，但其真实播放/打字机消费者未接，04A 可展示只读当前值并标记“待接入”，不能让滑杆写入没有效果的偏好却宣称已实现。`skipMode`、滚轮习惯、主音量、窗口/全屏、显示效果等同理；这些项目的持久化/生效另票。
4. 既有 PUI Modal、`validateLayoutNode` 零 issue，四页默认/hover/pressed/disabled/失败态及深/亮主题审计阻断归零；亮色完整主页/剧情旧低对比要单列，不因孤立设置页绿灯伪称整体绿。真浏览器测 UI 来源返回、六开关与槽 2 主链、设置期间滚轮隔离，并产原型/正式同画布包围盒与截图差异单；未裁偏差不签 S4 结构 1:1。非施工者自行复跑、唯一锚点撤修验红、实证复现与读告警后只签 04A 局部判词。

**票外与下一轮：** `GAL-UI-04B` 再按各能力的 owner 裁决实现文本逐字/auto/skip、实际音频、窗口/画面与可访问性偏好，之后才启用**全局恢复默认**；C5a 真实槽预览、C5b 回想隔离重播、S5/S6 素材时序和桌面退出各自独立。项目里程碑 `ui-settings-confirmations` 不因 04A 的局部结构 PASS 自动 done；04A 的可见禁用行/按钮是明确阶段差异，不能宣称完整 V2 S4 结构 1:1。

**04B 裁决与局部进展（2026-10-12）：** Owner 在当前对话选择 **A·通用表现/设置能力**，不采首作私有实现；证据、现有可重组边界与 04B-1～4 分票见 `gal-ui-04b-settings-gap.md`。Profile 全部当前版本偏好的纯重置/同包串行持久化基础接口已施工，非施工者在 `review/GAL-UI-04B-reset-independent.md` 签**局部 PASS**；定向/相邻 28/28、额外并发探针与带锚点撤修验红在档。未接音画消费者、设置页恢复默认按钮保持禁用；不能据此把 `ui-settings-confirmations`、V2 S5/S6 或全库门禁标为通过。聊天裁决不代替控制台 Owner 人门。

## GAL-ENG-05A：通用 Profile V2 与六类确认政策（C1·Owner 选 A）

- **Owner 裁决（2026-10-10）：A·通用 Profile 与版本迁移。** 不采用首作独立设置存储。实查 `src/services/gal-profile/gal-profile.ts`：当前 `GAL_PROFILE_SCHEMA=1`，`PREFERENCE_FIELDS` 严格拒绝未知键；`galProfileCodec` 尚无迁移链。`src/services/gal-ui/gal-ui-slice-host.ts` 的确认政策只覆盖新游戏、空位保存、覆盖、读取四类，且均未从 Profile 取开关。因此已有字段/控件重组不能表达六项可持久化的独立设置。决策只授权 C1，不含 C2b 自动/快进、C5a 缩略图、C5b 回想重播。
- **架构判断：接受窄范围共享能力。** Profile 是每个 `GalPackage.id` 隔离、跨手动槽共享的局外态，适合六项确认偏好；不改 `GalPackage` V1 作者数据合同，不把开关写入 World/手动槽/启动器角色卡。六类默认均为 `true`，所有未来 GAL 共用一处纯确认政策。`SavePort` 的信封/迁移链已经提供所需基座，不扩通用存档 API。
- **指派：gal程序主程。** 这是共享存档合同和语义变更，按红域由主程施工；施工前按仓库规则登记施工主体，Owner 禁令下不得执行 Git 锁/推送。范围限 `src/services/gal-profile/**`、GAL 专用确认政策及其定向测试/手册；若宿主仅为注入政策所需可最小改 `src/services/gal-ui/gal-ui-slice-host.ts`，但**不在本票画设置页**。不触 `src/ui/**`（PUI）、`assets/**`、其他游戏、数据库或服务启动；施工者与独立复查者分离。
- **施工主体：Codex/root（2026-10-10 本地领单）。** Owner 禁令下不执行 Git 锁、提交或推送；共享树只修改本票列明的 GAL Profile/政策/最小宿主接线、点名测试及本票 Review 导航。基线：GAL-UI-03C 已独立局部 PASS；全库 `tsc` 存在非 GAL 诊断，项目控制台 `ui-settings-confirmations` 仍为 planned/C1 待判，均不冒称已同步。
- **施工自验（2026-10-10）：** Profile V2 严格 V1 迁移、六项纯政策与串行持久化、GAL 宿主确认/取消/旁路接线已落盘；GAL 定向 8 文件 90/90、UI 基座 64 文件 502/502、静态真浏览器画廊/滚轮/槽 2 主链均退出 0。返回标题 Modal 深色故事屏与亮色隔离弹窗 1440×900 审计各零阻断，`validateLayoutNode` 点名零 issue；亮色主题原有 home/story 背景文字仍有低对比（各 3 处），不是本票弹窗自身通过的证据。全库 `tsc` 退出 1，诊断仅在非 GAL 的 game-card-reveal/game-dice/game-simlife/game-theft/launcher，故整体门禁仍 CONCERNS；未执行 Git/GitHub、数据库修改或服务启动。本票不代表 04A 设置页完成。
- **独立复查结果（2026-10-10）：05A 局部 PASS，全库 CONCERNS。** 非施工者独立复跑 GAL 90/90、UI 502/502、两条静态浏览器主链和深/亮返回标题弹窗审计；唯一锚点隔离撤掉 V1 迁移默认值，目标断言准确转红，副本与浏览器均已清理。全库 `tsc` 仅非 GAL 错误但错误集合较旧 Review 有新增，亮色完整 home/story 旧背景低对比继续单列；详证 `review/GAL-ENG-05A.md`。本票不签后继 04A 四页设置、桌面退出、完整 V2 或整体门禁。

### 写死合同与验收

1. `GAL_PROFILE_SCHEMA` 升为 2；`GalProfile.preferences` 增一个闭集 `confirmations`，仅含 `saveEmpty`、`overwrite`、`load`、`newGame`、`returnTitle`、`exitGame` 六个独立布尔值。新 Profile 与 V1→V2 迁移均填六项 `true`。V1 信封仍先经既有 checksum/gameId 校验，再在 `galProfileCodec.migrations[1]` 中**严格校验 V1 形状、package 归属、locale、已读与解锁引用**，只为合法 V1 补六项；不得以宽松 spread/default 使坏档变好档。V2 解析仍拒未知键、缺键、非布尔和未来版本；V0 不造迁移。迁移纯函数、确定性，不取时钟、不写盘；读 V1 只得内存 V2，首次明确保存才写 V2 信封。
2. 保留 V1 的 `readNodeIds`、四类解锁、locale、文字/音量/静音/skip 偏好及 package 隔离；手动槽读取、回滚、重新选支不得回退六开关。提供按合法键更新单项的纯函数，不能用浅合并不慎清掉其他五项；相同值幂等。保存仍由宿主注入有效 `savedAt`，写失败不可让 UI/调用者报告已持久化或继续使用伪成功值。
3. 单处纯政策 `requiresGalConfirmation(kind, preferences, context)` 覆盖六类。`saveEmpty` 只对应空槽保存、`overwrite` 只对应有槽覆盖，`load` 只对可读槽生效；`newGame` 仅已有活动进度时询问。`returnTitle` 与 `exitGame` 各自独立。开关关闭只省略弹窗，**不改变操作合法性、执行意图或错误路径**；取消/Esc 不执行。浏览器无退出能力时仍不得假装成功退出，桌面退出留宿主平台票。
4. 定向测试含：真实 V1 信封迁入且所有旧事实逐字段不变；六项默认/各自关开互不串扰；三种坏 V1（checksum、包归属、无效引用/形状）仍拒；V2 缺/多/非布尔确认字段拒；V0/未来版本拒；保存失败不伪成功；空/有槽及有/无进度政策矩阵；旧 03A/03B/04B 的档案桥、手动槽与 UI 主链回归。测试不得启动服务或修改数据库。带锚点撤修验红、独立复跑、读告警并写 Review；全库非 GAL 既有红项单列，不能把局部绿称全库绿。

**后继单 `GAL-UI-04A`（本票完成独立 Review 后派发）：** 仅以 V2 1440×900 原型拼四页设置和六确认控件，使用纯 LayoutNode 与 `ActionSink`；保存成功后才刷新显示，失败保留旧值并反馈，恢复默认同时覆盖四页已纳管偏好。声音试听、全屏/显示特性、auto/skip 与桌面退出若能力尚无必须诚实禁用或另票裁决，不得以会动的控件冒充功能。项目控制台 `ui-settings-confirmations` 仍为 `planned` 且写着 C1 待判；Owner 本机操作禁令下，本策划单不代写控制台持久化状态。

## GAL-UI-03C：画廊 S4 几何偏差收敛（不改原型）

- **当前状态（2026-10-10）：非施工者独立复查局部 PASS，仅签画廊 S4 几何收敛；全库 CONCERNS。** 定稿 V2 与真实 LayoutNode 在 1440×900 同浏览器量测：回想/CG 外框、标题、页签、网格、首末卡、底栏四轴差 0px，底栏动作区锚位最大差 0.5px；原约 11px 回想网格顶偏差关闭，空态与第 2 页底栏也保持 y782。52/52 定向测试、六态深/亮 UI 审计零阻断、真浏览器历史/画廊及滚轮/槽 2 存读链均退出 0。复查者用唯一锚点隔离撤修准确验出 11px 偏差，细证见 `review/GAL-UI-03C.md`、`gal-ui-03c-geometry-diff.md`。亮色 36px 标题 3.57:1 为大文本合规的非阻断告警；深色 house/华丽度为审计器启发式提示。全库 `tsc` 仅被非 GAL 既有错误阻断，未执行 Git/GitHub；不签完整 V2、S5/S6 或项目交付。
- **策划判断（2026-10-10）：接受已有闭集重组。** `review/GAL-UI-03B.md` 已局部 PASS 信息结构与交互，但明确不签像素级结构 1:1；`gal-ui-03b-structure-diff.md` 实测网格顶 y≈233、定稿 V2 目标 y≈244，卡片略高、底栏随内容漂移。已实查 `src/services/gal-ui/gal-ui-structure.ts` 的 `gal-gallery-shell` padding/gap、`gal-gallery-grid`、`gal-gallery-card` height 均为 GAL 纯 LayoutNode 数据，先在该边界调整，不申请新 PUI capability，不复制原型 DOM/CSS。若真实测量证明底栏固定锚点无法经现有闭集重组，须给 catalog/手册/实际 DOM 包围盒证据并按 A/B 缺口协议请 owner 裁决，不能自行改 PUI 基座或写自由 DOM。
- **指派：** gal程序主程；**施工主体：Codex/root（2026-10-10 本地领单；Owner 禁令下不执行 Git 锁/推送）**。只触 GAL 模板结构、点名测试、审计夹具与差异单；`src/ui/**`、`games/game-i/**` 仍属 PUI，`assets/**` 仍属资产专职。复查人与施工人不同。
- **范围：** 以 owner 定稿 `gal-ui-complete-v2.dc.html` 的 1440×900 同浏览器/同画布截图为唯一布局基准，修正回想 2×3、CG 3×2 的网格顶部、卡片外框高度/间距及底部说明/导航锚位；保持标题、页签、网格、底栏的信息层级与分页可见性。不能修改已定稿原型来追认偏差，不把正式纹样/背景/CG 资产和动画混入本票。

### 验收

1. 在相同 1440×900 环境独立量测定稿原型与正式 `mountUI` 的画廊外框、页签、第一排/末排卡片、底栏关键包围盒；给出原值、实值、差值及截图。原 11px 网格偏差须关闭；卡高和底栏漂移逐项归零或取得 owner 对明确偏差的裁决，不能只写“看着差不多”。如文本/字体差异导致内文尺寸不同，比较结构外框而非文案像素。
2. 覆盖回想与 CG 两页、空/满/第 2 页、锁定/解锁以及 CG 放大后返回原页；结构修改不能暴露锁定资源 key、给回想卡误接重播或让已解锁卡丢动作。保留历史 430px 滚动、Modal 与剧情滚轮隔离。
3. 跑 `validateLayoutNode` 零 issue、深/亮主题的重叠/对比/透明/布局卫生审计阻断归零；读取华丽度告警且不把 `apolloOnyx` 实传误判为无主题。真浏览器重跑 03B 画廊/历史链与 03A 滚轮改选、槽 2 存读档链；浏览器短生命周期关闭、临时构建清理。
4. 更新 `gal-ui-03b-structure-diff.md` 或建立 03C 差异单，附同画布并排关键帧及逐项去向；非施工者独立复跑、带锚点隔离撤修验红、实证对拍和读告警后签 Review。仅签本票 S4 几何收敛，不签完整 V2、正式视觉 S5/S6 或项目交付。全库非 GAL `tsc` 红项继续单列 CONCERNS，不越域修其他游戏。

**后续独立票：** 四页设置/六确认偏好 C1、回想隔离重播 C5b、存档预览 C5a、自动/快进 C2b、真实媒体/素材与桌面发行。03C 不扩大成这些系统。

## GAL-UI-03B：历史浏览与 CG 画廊的 S4 结构切片

- **当前状态（2026-10-10）：非施工者独立复查局部 PASS，仅签 S4 信息结构与交互切片；全库 CONCERNS。** 复查者自行复跑 GAL UI 22/22、Director+GAL UI 52/52、三态 `validateLayoutNode` 零 issue、三态 UI 审计零阻断/零 AA 警告、静态真浏览器历史/混合回想/锁定与放大 CG 链和 03A 滚轮/槽 2 回归；带锚点隔离撤历史游标裁剪准确验红。逐条证据见 `review/GAL-UI-03B.md`、`gal-ui-03b-structure-diff.md`。画廊网格顶仍较原型约 11px、卡片略高且正式素材未入库，**不签像素级 1:1、完整 V2 或 S5/S6**；全库 `tsc` 仅被非 GAL 既有红项阻断，未执行 Git/GitHub。
- **策划判断（2026-10-10）：接受窄范围重组。** 定稿 V2 的历史面板与 CG 画廊尚未覆盖；`NarrativeHistory` 已有最多 512 条只读会话条目，`GalPackage.media.cg` 与 `GalProfile.unlockedCgIds` 已有编目及解锁事实，PUI 02B 的大 Modal 和 03B 的滚轮作用域已获局部独立 PASS。先用现有 LayoutNode 闭集做结构/交互，不新增游戏专属 UI system 或自由 DOM。若实际接线发现闭集仍表达不了滚动/遮挡/图片显示，须记录 registry 与手册的实查证据并按 A/B 缺口协议停在 owner 裁决点，不得私自逃生。
- **前置：** `review/GAL-UI-03A.md` 仅签 S4 首个纵切片局部 PASS；定稿 `gal-ui-complete-v2.dc.html` 为 1440×900 单一视觉真相。全库 tsc 与 game-i 非本单红项保持 CONCERNS，不因本单修其他游戏或 launcher。
- **指派：** gal程序主程负责 GAL 模板消费侧与宿主接线；**施工主体：Codex/root（2026-10-10 本地领单；Owner 禁令下不做 Git 锁/推送）**。领工边界：仅 `src/services/gal-ui/**` 与 `docs/design/galgame/**` 的本票实现、测试、图证与 Review 导航；PUI 独占 `src/ui/**`、`games/game-i/**`、审计工具与 UI 手册；资产导入/索引归 asset-manager，本单不改 `assets/**`。施工者与复查者必须不同。原型 1440×900 回想/CG 截图已真机目击：`gal-ui-v2-memories.png`、`gal-ui-v2-cg.png`。
- **范围：** 在 03A 已有纯 LayoutNode 模板/宿主上新增两个可复用屏：①历史，约 1080×610，显示当前会话窗口中最多 512 个玩家可见条目、当前游标、说话人和已呈现文本，能滚动/关闭并返回原剧情；②CG 画廊，3×2 每页，显示目录、锁定/解锁状态、页码，已解锁 CG 可打开约 1080×610 放大层并关闭。主页“回想/CG”入口可进入统一画廊导航，但**回想卡只允许只读展示锁定/解锁，不提供重播**；若结构尚不合适，可保留回想入口的明确禁用状态，不得假装重播可用。所有文案/标题/页数/锁态来自 package + profile + 当前会话数据，不烘焙成整页图。

### 写死边界与点名验收

1. **历史只读：** 历史展示只消费 `readNarrativeHistory` 的稳定条目与游标，不通过页面浏览、开关面板、滚动或读档恢复改变 World/History/Profile；窗口超过 512 时不虚构更早永久日志。滚动历史时不能泄漏为剧情的 `narrative.back`/`advance`；Modal 打开时背景输入被阻断，关闭后焦点返回且剧情原位。点名覆盖滚动祖先、空历史、窗口裁剪和回滚改选后的旧未来截断。
2. **CG 权限：** 目录顺序及本地化标题稳定；锁定项不显示真实图、缩略图或可用原图 key，点击无放大；解锁项才可打开，关闭返回相同页。不同 package 同 ID 不串档，Profile 更改后刷新锁态；`GalPackage.media.cg` 的资产 key 只经既有资产消费路径使用，未导入素材时保持**显式占位**，绝不把 V2 演示 CG 当正式内容。屏幕和动作不写解锁事实、不读写存档。
3. **结构 1:1：** 1440×900 同画布对拍 V2 历史/CG：历史记录区可用高度、CG 3×2 密度、大图层尺寸/遮挡、底部导航及默认/hover/pressed/disabled/锁态均列逐条差异。依 `module-ui` 与 `check-ui` 跑 `validateLayoutNode` 零 issue、重叠/对比/透明/布局卫生审计阻断项归零；正式素材与纹样不足只列 S5 债，不冒称视觉 1:1。不得改定稿原型追认实现偏差。
4. **行为链：** 从已通过的 03A 主页/剧情入口进入历史→滚动→关闭→继续原剧情；进入画廊→锁定 CG 不可开→解锁 CG 可放大/返回→原页保持；再做滚轮推进/回退和槽 2 存读档零回归。宿主只派具名 action，World 写入仍由既有引擎路径执行，UI 不 import Director 内部可变对象。
5. **复查与门禁：** 定向单测、真实挂载/短生命周期隔离浏览器、同画布关键帧和完整差异单；非施工者独立复跑、带锚点隔离撤修验红、实证复现及读告警，Review 单只签本票局部 S4。全库既有非 GAL 红灯单列 CONCERNS。禁止 Git/GitHub、数据库修改、应用服务启动；短生命周期浏览器关闭、临时目录清理并记录。

**明确票外：** 回想隔离重播 C5b、真实存档缩略图 C5a、四页设置与六确认偏好持久化 C1、自动/快进 C2b、音视频/桌面宿主、S5/S6 正式视觉/演出。上述仍是完整 V2 的必做项，不能因本票局部 PASS 而删除。

## GAL-PUI-03B：通用滚轮方向 → 具名 ActionSink 输入（PUI）

- **owner 裁决（2026-10-10）：A·补 PUI 通用闭集能力**，不准 GAL 宿主写局部 DOM `wheel` 监听特例。裁决时实查与对抗证据见 `gal-ui-03a-structure-diff.md`、`review/GAL-UI-03A.md`：`i1-input-capture` 只定义原始输入注入契约、`i2-action-map` 只翻译已有输入、`t2-keybind` 只消费已有具名动作；当时 `mountUI`/LayoutNode 尚不捕获真实 `WheelEvent`。该历史阻断现已由 PUI-03B 通用能力和 GAL-UI-03A 真浏览器复验关闭。
- **归属：** PUI 通用 UI 基座；owner 已在本项目先前明确授权「引擎程序」聊天承接 PUI Modal 专项，并于 2026-10-10 明确授权其作为 **GAL-PUI-03B** 的 PUI 施工者。**施工主体：** Codex/root（2026-10-10 本地领单；Owner 禁令下无 Git 锁/推送）。GAL 程序只消费声明式 action，不修改 PUI 基座。主引擎需求池 10 槽硬上限仍有效；此 GAL 本地票不等于已入主池。
- **目标：** 在现有 LayoutNode 闭集/`mountUI` 事件边界，提供声明式、受限的滚轮上/下到两个具名 ActionSink action 的映射。GAL 模板仅填 `narrative.back` / `narrative.advance` 等 action 名，PUI 不 import GAL 包、Director 或世界状态；不开放自由 DOM handler/CSS/回调。具体字段形状由 PUI 实查 catalog/类型与 ActionSink 后提出最小契约。
- **当前状态（2026-10-10）：** 非施工者独立复查确认 Wheel 闭集能力 **局部 PASS**，随后对滚动祖先边界收紧再次独立复审通过：真实浏览器上／下各一次、单事件不双发、trackpad 阈值、任意 scroll/vlist 祖先优先、Modal 阻断背景、teardown 清理和 ActionSink-only 均通过；带锚点隔离撤修恢复修复前 descendant-only 条件会精确泄漏 `narrative.advance`，恢复后 5/5 Wheel 测试通过。1440×900 审计阻断项为 0，完整证据见 `review/GAL-PUI-03B.md`。但按要求执行的完整 `games/game-i` 集仍有 `dialogue-world.test.ts` 的非 Wheel 失败（亲和度 8≠14），故 game-i 全量回归为 CONCERNS，不归因本单也不得称整体门禁绿；全库既有 tsc 红项同为 CONCERNS。

### 验收与边界

1. 真浏览器 1440×900 挂载后，剧情有效区域上滚发一次 back、下滚发一次 advance；`deltaY=0`、未配置或非故事屏不发；不让同一 WheelEvent 产生双动作。事件的派发仍经 `ActionSink`/现有具名输入路径，不能直接改 World；GAL 02B 的 512 步历史/选项重选语义仍由 Director 负责。
2. Modal 打开时不把滚轮送到被遮住的剧情屏；有可滚动历史/设置/存档子区时，应优先保留该区正常滚动或以显式作用域阻断剧情推进，不能让阅读历史时误跳台词。处理必须有关闭/更新/重挂清理，不能留下全局监听或重复订阅。
3. 离散鼠标滚轮和触控板连续 `deltaY` 均有明确、可测试的归一化/节流口径；无论口径如何，一次有效派发只能入一个具名 action，不覆盖同拍已有玩家输入。不要用墙钟写 sim 或改变 World hash；缩放/浏览器默认滚动只在消费该事件的闭集作用域内抑制。
4. PUI 按 `module-ui`/`check-ui` 做闭集类型、catalog、校验器、game-i 活范例、UI 手册与独立真实 WheelEvent 测试；真浏览器短生命周期审计和 GAL 真实宿主输入接线分别验收。旧 `mountUI` 调用及现有 Modal/按钮零回归；非施工者按独立复跑、带锚点隔离撤修验红、实证复现、读告警签 Review 单。禁止 Git/GitHub、数据库修改或应用服务启动；全库非 GAL 红灯仍单列 CONCERNS。

**回交条件：** PUI 局部 PASS 后由 GAL 程序撤掉 03A wheel 阻断，补真实浏览器 WheelEvent 主链、确认/hover/pressed/disabled 各态截图与独立审计复跑；仅到此才可重审 03A 的 S4 结构结论。

## GAL-UI-03A：定稿 V2 首个结构纵切片（纯 LayoutNode 模板）

- **当前状态（2026-10-10）：非施工者独立复查局部 PASS，仅签 S4 结构纵切片。** GAL 消费 PUI-03B 的 `Panel.wheel` 闭集映射，无局部 DOM 监听。复查人独立跑 5 GAL 文件 40/40、真浏览器开始→已读→滚轮推进/回退改选→2 号槽保存读取→Profile 保留退出 0、五态 1440×900 审计阻断项 0、`validateLayoutNode` 5/5 零 issue；带锚点隔离撤映射使 mounted `WheelEvent` 测试验红。证据见 `review/GAL-UI-03A.md`、`gal-ui-03a-structure-diff.md`。全库 `tsc` 仍由非 GAL 错误退出 1，整体 CONCERNS；本票不代表完整 V2、S5/S6 或出货。
- **策划判定（2026-10-10）：接受。** GAL-UI-01B 只读投影、02A 显式读完接缝、GAL-PUI-02B 通用大 Modal 均已获非施工者局部 PASS；因此可以开始 S4 的结构/交互 1:1。正式视觉/素材与演出属于 S5/S6，不得把本票叫作完整 UI 或首作出货。Owner 已定稿 `gal-ui-complete-v2.dc.html`（1440×900），不能复制其自由 DOM/CSS/JS 进运行时。
- **指派：** gal程序主程负责 GAL 模板消费侧与宿主接线；**施工主体：** Codex/root（2026-10-10 本地领单；Owner 禁令下无 Git 锁/推送）。PUI 仍独占 `src/ui/**`、`games/game-i/**`、UI 审计工具/手册；缺控件或 PUI 底层行为须实查并报 PUI，不越域修改。资产导入/索引由 asset-manager 专职；本票不触 `assets/**`、不把 `docs/design/galgame/ui-parts` 相对路径直接接进正式运行时。不得改其他游戏或共享 launcher 的既有错误现场。
- **目标：** 以已有 `NarrativeProjection`、`GalUiReadModel`、`PresentationReadGate`、`GalManualSaveController`、`GalProfile`、04B 桥与 PUI Modal 为消费端，做可复用的纯数据 LayoutNode 模板/宿主编排：**主页 → 对话 → 稳定 ID 分支 → 鼠标滚轮↑回滚改选／↓推进 → 第 2 槽保存与读取确认 → 读档后剧情恢复、全局已读/解锁不回退**。不生成游戏专属 React/TS 剧本，不在按钮 handler 中写自由业务逻辑。
- **证据补齐（2026-10-10）：** 五态 GAL 目录静态审计入口、原始 stdout、确认/hover/pressed/disabled 及真浏览器滚轮主链关键帧与逐条差异均在 `gal-ui-03a-structure-diff.md` 定位。非施工者已独立复跑、目击截图与实证撤修验红；同步全文 Label 真实挂载 read-complete 亦经确认。局部 PASS 与全库 CONCERNS 分列，不越域补 DOM 特例。

### S4 写死边界与验收

1. **结构屏：** 1440×900 定尺、主页、剧情底框/顶栏、二选项叠层、4×3/12 槽每页的保存与读取、确认 Modal（约 800px）。每屏覆盖默认/hover/pressed/disabled、空/有槽、已读/未读；12 是页容量非最大槽数，槽 13 可翻页。只用 `LayoutNode` 闭集、`@ui/starters`/house 主题及现有 Panel/Button/Label/Image/Modal/choiceList 能重组的件；台词、槽元数据、按钮字均为实时数据，不做整页烘焙图。可用**显式标记的占位**承担尚未入库的背景/立绘/CG/框皮，但其尺寸、锚点、遮挡关系必须代表目标。
2. **动作链：** 稳定 option id 进 `narrative.choose`；上滚只退一可见步，下滚只进一可见步，同拍动作确定性裁决，回到选择前可重新选。`PresentationReadGate` 只在当前正文完整呈现时由宿主显式通知，read-complete 与玩家 advance 不挤同拍；不能靠首次投影/读档自动标已读。04B 的 Profile 持久化与 ack 不设玩家按钮。
3. **宿主命令/确认：** 页面路由、选槽、保存/读取、开启确认属于通用 GAL 宿主 action dispatcher，不假冒 sim Signal、不卡在每个按钮的自由 handler。六类确认开关的设置页尚未实现；本票只对新游戏、保存空位、覆盖和读取沿定稿默认 **true** 的单一纯政策执行，并在有进度/空有槽事实下正确判定。无 `SavePreview` 时卡片必须显示“暂无预览”，不能把演示 CG/场景冒充槽截图；读取空槽禁用。Modal 仅在确认后执行 I/O，Esc/取消不执行；失败后活动 World 与 Profile 不被伪成功污染。
4. **视觉/交互自证：** 用定稿 V2 的同画布截图逐屏对比**结构**（框体比例、边距、信息层级、12 槽密度、层序、关键路径），列逐条差异/占位/后续资产与演出债，不能把存在偏差的 S4 宣称 1:1。真渲染可用短生命周期隔离无头浏览器访问静态文件或已完成构建，不得间接启动服务；结束主动关闭。按 `module-ui` + `check-ui` 跑 `validateLayoutNode` 零 issue、重叠/对比/透明/布局卫生审计归零，并记录华丽件命中。若审计工具脚本会启动服务，须停交 owner，不能自行运行。
5. **边界/复查：** 历史、CG 放大、回想、四页设置、六开关持久化、真实槽预览、自动/快进、音视频/桌面宿主均不在本票；它们仍是完整 V2 的后续必做，不能默默删。若无合规正式素材，保持明确占位并只签结构，不签 S5/S6。定向交互测试与真实同画布关键帧、相关 GAL/UI 回归、类型检查据实记录；施工与非施工者独立复查分离，按四步铁律交 Review 单。全库非 GAL 红灯仍标 CONCERNS。禁止任何 Git/GitHub、数据库修改或应用服务启动。

**前置证据：** `review/GAL-UI-01B.md`、`review/GAL-UI-02A.md` 与 `review/GAL-PUI-02B.md` 局部 PASS；PUI 02B 的 1080×610 修复已真浏览器复量，不能仅凭施工者自验。

## GAL-UI-02A：当前台词完整呈现 → 具名已读输入的通用宿主接缝

- **owner 裁决（2026-10-10）：** `gal-ui-layoutnode-map.md` C2a 选择 **A·补通用能力**。**指派：** gal程序主程。**施工主体：** Codex/root（2026-10-10 本地领单；Owner 禁令下无 Git 锁/推送）；Owner 禁令下绝不自行 Git/GitHub。只做 GAL 通用展示/宿主服务与测试（优先 `src/services/gal-ui/**`），必要时点名接口文档；不改 PUI 独占 `src/ui/**`，不写正式 LayoutNode 屏、自由 DOM/CSS/React 或游戏专用 handler。
- **架构判断：接受窄接缝，回驳把 auto/skip 一并塞入。** 04A 的 Director 已有 `narrative.read-complete` 与当前 StoryRef 防陈旧校验，04B 已有档案持久化桥；缺的是“完整显示”这一宿主表现事实如何只发一次具名输入。V2 原型没有逐字打字演示，首切片允许正文完整渲染后由表现端显式通知完成，但绝不在初始投影读取或读档/回滚恢复时自动推断已读。此单不是新增 sim 定时器。
- **当前状态（2026-10-10）：** 通用 `PresentationReadGate` 与真实 Director/04B 桥回归已施工，非施工者独立复查签局部 PASS，证据见 `review/GAL-UI-02A.md`。复查中修复“入队动作丢失后无法重试”及“旧档无 outbox 拒发已读”两处缺陷，各有隔离撤修验红。施工者相关回归 4 文件 56/56、独立复查 5 文件 66/66 均退出 0；全库 `tsc` 仍被非 GAL 既有错误阻断，整体判词 CONCERNS。正式 UI 完整呈现回调、PUI 02B 与可玩纵切片均未完成，未执行 Git/DB/服务启动。
- **目标：** 通用 `PresentationReadGate`（名称可按服务命名规范调整）接受活动 World/剧情实体的当前稳定 StoryRef 身份，以及表现端显式 `fullyPresented(ref)` 通知；只在通知仍匹配当前可见节点且输入队列空闲时，将 `NARRATIVE_READ_COMPLETE` + 当前 `storyRefKey` 入现有 `InputQueue`。若玩家输入正占单动作拍，返回明确 pending/retry 状态，不能覆盖；换节点/回滚/读档/换 World 时，旧通知失效。Director 仍是最终判定者，宿主不得直接改 `GalProfile` 或 `NarrativeOutbox`。

### 点名语义与验收

1. **“完整呈现”由表现端声明，不由计时猜。** 打字机（未来）须在最后字符可见后通知；没有打字机时须在当前正文真实显示完成后通知。点击仍在揭示未完成时优先完成显示，已完成后才可按正常 `narrative.advance`；选择/check/ending 的具体显示可见状态按 Director 当前节点合同处理。禁止把 `mountUI` 首次读取投影、空 tick、`World.restore`、回滚重放或菜单预览当作完成通知。
2. 通知身份至少含 package、剧情实体、当前 StoryRef/投影代次；重复通知只产生一次有效 read 动作，换 World 或异步 UI 回调晚到必须 fail-closed。ack 与玩家 action 不同拍；调用方可重试，但不能偷偷 tick 或把 `InputQueue.actions` 清空。
3. 用真实 Director + 04B 桥的内存端口点名走通“完整呈现→read-complete→Profile 落盘→ack”；未通知、未完全呈现、重复、错 ref、回滚、读档、切场景、同拍玩家推进、队列忙与存档失败均须有断言，证明旧节点不误标。相同输入序列的 World hash/事件序列一致；时间只在宿主表现层，sim 不读墙钟。
4. 若现有 PUI 控件没有可供宿主观察“文字已完整呈现”的闭集回调，**先用已核定的 `Panel+Label` 完整文本纵切片**验证窄接缝；需要扩 typewriter 完成通知时另向 PUI 立最小票，GAL 主程不得越域改 `renderDialog`。不得借此把自动/快进、滚轮偏好、音频或六确认持久化混进本票。
5. 定向测试、相关 GAL 回归、类型检查与告警据实记录；施工/复查分离，非施工者独立复跑、带锚点隔离撤修验红、实证复现、读告警后交 Review 单。全库既有非 GAL 红灯仍标 CONCERNS；禁止 Git/GitHub、数据库修改、服务启动。

## GAL-PUI-02B：V2 大确认弹窗的通用 Modal 闭集与键盘语义（PUI 领单）

- **owner 裁决（2026-10-10）：** `gal-ui-layoutnode-map.md` C4 选择 **A·PUI 通用能力**；随后明确指定交给「引擎程序」聊天（`01a1244a-4f76-7990-9f46-5fe33cea4c42`），交接消息已发送。AGENTS.md 仍写 PUI 独占 `src/ui/**`、`games/game-i/**`、UI 审计工具与手册；owner 已在本单明确授权该聊天作为 PUI 施工者实施 `src/ui/**`。**施工主体：** Codex/root（2026-10-10 本地领单；Owner 禁令下无 Git 锁/推送）。GAL 程序不得代改。此处是 GAL 侧需求/验收规格；本地记录不等于全局池已入槽或能力已交付。
- **先查结论：** 现有 `Panel` 可重组 800/1080px 视觉尺寸和按钮，不能提供 `role=dialog`、`aria-modal`、Esc、焦点进入/圈定/返回；现有 `Modal` 只有 320/460/640px，亦无完整键盘语义。V2 定稿确认窗需约 800px，大图/历史约 1080×610。故只请求最小闭集的宽/高/框皮与模态行为，不接受自由 CSS/DOM 逃生。
- **验收：** 通用 Modal 可在 1440×900 逻辑画布内表达上述尺寸与九宫格框皮、可靠遮罩/层序；打开时语义与初始焦点正确，Tab 不逃出，Esc/取消关闭并将焦点还给触发控件，确认执行只投具名 action。遮罩和禁用背景不穿透；无鼠标与 reduced-motion 可用；旧 sm/md/lg 调用零回归。PUI 按 `module-ui`/`check-ui` 真渲染、`validateLayoutNode` 零 issue、UI 审计归零及 V2 同画布截图差异单验收。六确认开关的持久化属后续 C1，非本票。
- **当前状态（2026-10-10）：** 修复后由非施工者独立复审 **局部 PASS**。`data-modal-dialog` 已改为 `box-sizing:border-box`；复查人独立量测 1440×900 Edge 外框为 `wide=1080×610`，并复跑 5 文件/31 测试和 `ui-audit` 阻断项 0。此前 Tab 圈定隔离撤修验红、无 `closeAction` Escape no-op、焦点返回、背景防穿透与旧尺寸回归证据继续成立；完整记录见 `review/GAL-PUI-02B.md`。全库 `tsc` 仍仅由既有 game-dice/game-simlife/game-theft/launcher 诊断退出 1，保持 CONCERNS；本判词不宣称 GAL 正式 UI、V2 视觉 1:1 或项目整体交付。
- **边界：** 不由 GAL 程序实现 PUI 代码；正式主池满槽时须先清槽，不能超 10 硬塞。不得因 C4 待 PUI 而阻断独立的 GAL-UI-02A 服务施工。禁止 Git/GitHub、数据库修改或应用服务启动。

## GAL-UI-01B：首个纵切片的只读 GAL→UI 数据投影（不做正式屏）

- **策划判定（2026-10-10）：接受既有能力重组，不申请 C3 新 capability。** `gal-ui-layoutnode-map.md` 复核证实 `UIDataSource.list + LayoutNode.repeat` 能传稳定 choice option id；`NarrativeProjection`、`GalProfile`、`GalManualSaveController.list()` 已各自提供权威只读源。应只补窄的宿主读模型，不改 `src/ui/**` 或 t3-dialogue 绑定，也不把剧情业务塞进 UI handler。C2a 读完接缝与 C4 通用弹窗另待 owner A/B，不作为本单偷偷实现。
- **指派：** gal程序主程。**施工主体：** Codex/root（2026-10-10 本地领单；Owner 禁令下无 Git 锁/推送）；Git/GitHub 操作一律仅 owner 亲自执行。**边界：** GAL 宿主服务新模块及同伴测试（建议 `src/services/gal-ui/**`），本工单/Review 单；可只读消费 UI 闭集类型与数据源接口，但不得修改 PUI 独占 `src/ui/**`、展示台、UI 审计工具或资产索引。不做正式 LayoutNode 屏、打字机/计时器、Modal、截图预览、回想播放器。
- **当前状态（2026-10-10）：** 01B 只读模型与同伴测试已完成，非施工者复查签局部 PASS，证据见 `review/GAL-UI-01B.md`。初审发现无恢复点仍可 Continue，已改为显式宿主 `hasActiveResume` 或真实手动槽才可用，并由隔离撤修验红证实。施工者相关回归 5 文件 46/46、独立复查 5 文件 64/64 均退出 0；全库 `tsc` 仍被非 GAL 既有错误阻断，整体判词 CONCERNS。未做正式 UI、C2a/C4 或 Git 推送。
- **目标：** 以已验证的 `GalPackage`、同包 `NarrativeProjection`/`GalProfile`、宿主 locale、手动槽列示结果为输入，输出纯、可序列化的首页可用性、剧情当前 ref、已本地化 speaker/text、稳定 `choice[{id,label,disabled}]`、已读状态，以及页容量 12 的 4×3 手动槽行数据；空槽禁读，有槽只用真实 meta，缺缩略图明确标缺。输出可以被现有 `UIDataSource.list`/literal `Panel/Label/Image` 组合消费，但不含已解析资产 URL、DOM、回调函数或引擎 World 写入。

### 点名约束与验收

1. 不复用 `resolveDialogue` 的按 index 选择；`narrative.choose` 的 `actionArg` 必须是稳定 option id。相同 package/locale/投影/档案/槽列表重算字节稳定；选择可用性、已读和当前 StoryRef 由权威源导出，不能靠 UI 自己猜。错 package、缺 locale、重复/损坏 option id、错槽或非规范槽元数据 fail-closed，不编造剧情/预览。
2. 12 是**每页 UI 容量**，不是最大槽数；覆盖槽 1/12/13 和空/有槽、两 package 同槽隔离、分支回滚改选后当前选择列表更新而全局已读/解锁不回退。`SaveMeta` 无预览时显式提供 no-preview 表现状态，绝不借演示 CG/背景冒充真实快照。
3. 用现有 `resolveBindings` 的 `repeat` 真正展开一个只读 choice 列表，断言 Button 的 `actionArg` 保留稳定 id、`disabled` 保留布尔、生成节点 id 唯一；此处只验证数据投影和闭集消费，不实现定稿 V2 屏或宣称 UI 1:1。不能为测试方便在 UI handler 加自由逻辑。
4. 定向测试、类型检查、相关服务回归据实记录退出码与告警；若全库非 GAL 红灯仍在，只标局部结果。施工与复查分离，带锚点隔离撤修验红，交 Review 单。Owner 禁令下禁止任何 Git/GitHub 命令、数据库修改或服务启动。

**依赖边界：** 本单可独立于 C2a/C4 施工；直到 owner 对两项裁决并接上正式 UI/确认流程，均不得称首个可玩纵切片完成。

## GAL-UI-01A：定稿 V2 → LayoutNode 接线预检（先审计，不施工 PUI 基座）

- **策划判定（2026-10-10）：接受。** 04B 后，剧情内核、档案与手动槽已有局部可复用闭环，但玩家还不能通过正式 UI 使用。Owner 已在 `gal-ui-complete-v2.md` 明确定稿 1440×900 原型并选择通用 UI 模板 A；下一步先查闭集控件及现有宿主接线是否足以 1:1 表达，不能把 HTML 原型的自由 DOM/CSS/JS 复制进运行时。全库非 GAL 红灯另归属处理，本单不碰其他游戏。
- **指派：** gal程序负责 GAL 侧需求/数据绑定预检与报告；**PUI 独占** `src/ui/**`、`games/game-i/**`、`tools/ui-audit.mjs`/`tools/audits/**` 和 UI 手册，本单不得擅改。**施工主体：** Codex/root（2026-10-10 本地领单；Owner 禁令下无 Git 锁/推送）。只读实查 `UI_CATALOG`、`types.ts`、`@ui/starters`、game-i VN 范例及 ActionSink/绑定机制；报告落 `docs/design/galgame/gal-ui-layoutnode-map.md`，更新本工单状态。无资产入库、无游戏层自由 UI、无服务启动。
- **预检状态（2026-10-10，重组复核完成）：** 逐屏映射、实证缺口 A/B、归属拆票及纵切片顺序已落 `gal-ui-layoutnode-map.md`；仅为设计预检，正式 LayoutNode/PUI/资产均未施工。gal策划会话只读机读目录导出退出 0；本会话沙箱复跑遇 `vite-node realpath EPERM`，两项证据均已如实记入报告。C3 已以 `UIDataSource.list+LayoutNode.repeat` 重组并撤 owner 问题；C4 的尺寸可用 Panel 重组，但 Escape/焦点/模态语义仍缺。首切片只集中待判 C2a（读完与推进分离）、C4（大确认弹层完整语义）；C1 六确认持久化、C2b 自动/快进、C5a 槽预览、C5b 回想回放分别留后续阶段，不捆成一票。Owner 禁令下未执行 Git/GitHub 操作。
- **目标：** 逐屏形成“V2 目标元素/状态 → 现有 LayoutNode 组合或现有接线 → GAL 侧所需只读数据/action → 缺口归属”的可执行映射，为 PUI 正式实现拆出最小票，不先把大界面用假图整页糊上去。

### 预检必须覆盖

1. 主页、对话、选项、4×3/12 槽每页的保存和读取、历史、回想、CG、设置四页、六种独立确认开关及确认弹窗；列明默认/悬停/按下/禁用、空槽/有槽、锁定/解锁、已读/未读。对话框皮可保留独立贴图，台词与动作仍是实时 LayoutNode；设置/存档必须以可复用单件组合，不得用整页烘焙图。
2. 每个玩家动作标到现有具名输入或宿主服务：`narrative.advance/back/choose/read-complete/ack`、手动槽 API、`GalProfile` 偏好与画廊只读查询。UI handler 不直接改 World/SavePort；确认开关由统一偏好/动作政策消费，不在六个按钮各写一套业务规则。特别实查 03A 偏好合同**是否含六项确认设置**，如无，不得假称已支持。
3. 按 V2 1440×900 对齐框体安全边距、12 槽密度、图层遮挡和关键链；将原型素材分为“仅演示占位”与“可拟入正式资产待审”。记录主题/字体/皮肤/九宫格/按钮状态如何用现有闭集表达；不得因为 house 主题默认色与定稿冲突就擅改原型，若需专用主题也要只走闭集皮肤/令牌并列明归属。
4. 对每个不能重组表达的点，引用 catalog/类型/现有服务和手册原文，给 A 补通用能力 / B 局部特例两路代价与推荐，留给 owner 裁决；能重组的明确等价数据写法，不占引擎需求池。PUI 基座缺口单须经 PUI 边界与当前 `docs/workflow/requests.md` 10 槽容量约束处理，不能越池硬塞。
5. 交付一张依赖/施工拆票表：GAL 服务侧、PUI 基座侧、资产审核/入库侧分别负责什么；给出首个可独立验收的“主页 → 对话 → 分支 → 回滚改选 → 手动保存/读取”纵切片，再列画廊/回想/设置扩展顺序。预检只产报告与票，不写正式 LayoutNode；下一阶段真正施工时再按 `module-ui`/`check-ui` 跑闭集校验、双主题对比/重叠审计和原型同画布 1:1 截图差异单。

**交接门：** 映射表、缺口实证与边界拆票完整才算本单完成；此单不代表任何正式 UI 已实现。若遇到 owner 独裁的新 A/B 缺口，批量提出而不自裁。禁止 Git/GitHub、数据库修改或应用服务启动。

### REQ-GAL-PROFILE-EVENT 裁决单（owner 选 A）

**先查：** `npx vite-node scripts/dump-capability-catalog.mjs --only t2-event-when,t2-effect-apply,t3-narrative-director,t2-keybind` 退出 0。机读合同显示 `event-when` 仅按 Resource/Flag/State 条件发信号，`effect-apply` 只写 World 内 Flag/Resource/State 等，`keybind` 只把输入变信号；`t3-narrative-director` 仅执行 resource/flag 效果。`src/engine/protocol/galgame.ts` 已声明 `unlockCg/unlockMemory/unlockMusic` 和 `reach-node/reach-ending/explicit`，Director 对 unlock 效果仍明确拒绝。`docs/playbooks/events-logic.md`/`pick-list.md` 的信号铁律禁止在游戏 handler 自写解释器。现有重组无法可靠区分投影初显、真正读完、回滚重走与读档恢复，也无法输出 choice/enter 的显式 unlock 到局外档案。Owner 禁令禁止 agent `git pull`；以上仅是当前共享工作树实查，不假定远端状态。

| 方案 | 代价/影响面 | 通用性 | 选错代价 |
|---|---|---|---|
| **A·补通用引擎能力（推荐）** | Director 产稳定、可审计的剧情里程碑/显式 unlock 输出；宿主通用 Profile 桥消费并幂等持久化。UI 文本完成后才发具名已读动作。须改共享确定性内核、trace、存档/回滚测试。 | 所有 GAL/分支 VN 复用。 | 时序不严会重/漏解锁；以回滚、读档、改选、失败重试点名卡住。 |
| **B·首作游戏层例外** | 首个 GAL 宿主观察运行态/历史差量，自己解释包内 unlock 与已读；短期少动引擎，但须记录代码债。 | 低，每作重复。 | 跨回滚/读档/异步存档易漂移；以后迁 A 还要迁语义，偏离纯数据生成目标。 |

**owner 判词：A。** 按通用引擎能力实施；先 04A 产纯数据事件，再 04B 接 Profile 端口。不得把 B 的游戏层观察器混入 A。

## GAL-ENG-04B：剧情里程碑 → 全局档案的可靠持久化桥（无 UI）

- **策划判定（2026-10-10）：接受。** 04A 的 `NarrativeOutbox` 已提供有界待确认事件和 `narrative.ack` 具名输入；03A 的 `loadGalProfile`/`markRead`/`unlock`/`saveGalProfile` 已覆盖包隔离、目录校验和现有 `SavePort`。组合即可实现跨槽全局解锁，不能再新造持久化后端、游戏层观察器或第二套档案格式。接受 owner 对 `REQ-GAL-PROFILE-EVENT` 的 A 裁决。本单碰跨存档共享面，归 gal程序主程施工；复查人与施工者分离。
- **指派：** gal程序主程。**施工主体：** Codex/root（2026-10-10 本地锁；任何 Git/GitHub 操作按 Owner 禁令只能交 owner，本地登记不等于推送）。**边界：** `src/services/gal-profile/**` 中新增宿主桥及测试，必要时 `docs/playbooks/save-platform.md` 路标、本工单与 Review 单；不动 PUI、游戏目录、资产、真实数据库或新存储后端。若现有 `InputQueue`/Director 契约确实无法保证安全确认，先实查并按缺口协议摆 A/B，不能擅改共享定序内核。
- **当前状态：** 04B 已由非施工者按四步独立复查签局部 PASS，证据见 `review/GAL-ENG-04B.md`；修复了同 ID 异内容发布包可能被误认的缺口。独立定向 9 文件 108/108、两次带锚点隔离撤修验红；全库 `tsc` 因非 GAL 错误退出 1，故整体门禁仍为 CONCERNS，不称已推送。
- **目标：** 宿主拿已验证的 `GalPackage`、活动 World/剧情实体、现有 `SavePort` 与注入的有效 `savedAt`，读取待确认里程碑，加载最新 `GalProfile`，纯函数式折叠变更，持久化成功后才通过具名输入请求确认已落盘的连续前缀。返回明确结果（空队列、已保存待确认、可重试失败等），不让调用方把失败误判为完成。

### 写死语义与边界

1. 仅 `read-complete` 调 `markRead(ref)`；仅 `reach-ending` 解锁对应 ending；`unlockCg/unlockMemory/unlockMusic` 分别调用 `unlock(cg/memory/music, contentId)`。`reach-node` 是可审计到达事件，本版不凭到达自行标已读；静态 `reach-*` 目录规则已由 04A 展开成显式 unlock 事件，桥不得重复解释 package 规则。投影初显、回滚、读档、回想均不能直接改档案。重复 `id`/新 `seq`、分支改选和确认丢失后重投递均靠档案集合幂等，不撤销旧解锁。
2. 消费前验证事件属于当前 package、序号连续、事件身份/内容与目录一致；不可信或损坏事件必须 fail-closed，不能跳过坏项却确认其后续项。一次只确认本次**已成功持久化**的连续前缀，不可先 ack 后写档。读取坏 checksum/未来版本/错包、写入失败、无效时间戳：不发 ack，不清 outbox，并给可定位错误；下次可安全重试。无档时用 03A 默认档，绝不借用启动器角色卡。
3. `narrative.ack` 必须走现有 `InputQueue`→Director 的单动作/可回放路径；不得直接改 World 或调用私有确认函数。桥不可覆盖玩家同拍已有输入，也不可在未知调度时序自动 tick。可返回待注入的具名 action，由宿主在空闲拍提交；若封装注入，需检查队列空闲并清楚暴露“已持久化但待 ack”状态。
4. 异步 `SavePort` 期间活动 World 可能读档、换包或换剧情实体：持久化完成后必须对拍**同一活动 World/剧情实体及待确认前缀事件身份**，不匹配时不得向新世界投旧 `seq` 的 ack；已持久化档案可保留，旧 outbox 待以后重新接续。并发 drain 同 package 必须串行化或采用等价防丢更新，不能两次各自读旧档再互相覆盖。跨 package 不得串档。
5. 至少一次投递 + 幂等档案集合 + 持久化后 ack 是本版保证，不许宣称外部副作用 exactly-once。已落盘但 ack 未执行、ack 被拒绝或进程在两步间中断，重试应重读最新档案并安全再次落盘/确认，不丢解锁。04A 的 256 条背压应在成功持久化并确认后解除；存储故障期间背压保留，不得静默覆盖。
6. 本单不做对话打字机/滚轮、主菜单/CG/回想/设置/存读档 UI、BGM/语音播放、创作产线或桌面打包。`GalProfile` 仍不进入 `WorldSnapshot`、剧情条件、随机 hash；全局档案不随手动槽回退。宿主时间仅从参数注入，sim 不读墙钟。

### 点名验收与交接

- 用 `MemorySavePort` 和真实 Director/`InputQueue` 覆盖：read-complete 才标已读、结局与三类 unlock；`reach-node` 不标已读；两包同 ID 隔离；回滚改选后旧解锁保留；重复事件规范化不变；12/13 号手动槽往返不回退全局档案。
- 读损坏/错包档、写失败、无效事件、并发 drain、保存与 ack 间中断、ack 被拒/丢失、异步等待中切换活动 World/剧情实体、256 背压恢复，各有可复现断言；失败时未确认事件和已有档案不得被无声破坏。
- 测试真实具名 ack 的单动作调度及同输入可回放；桥不得触碰 World 组件写接口。运行定向测试、相关组件/注册表/系统图检查和全库类型检查并记录退出码、stderr；Review 单交非施工者按独立复跑、带锚点隔离撤修验红、实证复现、读告警四步签判。全库既有非 GAL 红灯如实记 CONCERNS；禁止 Git/GitHub、数据库修改或应用服务启动。

## GAL-ENG-04A：通用剧情里程碑与显式解锁输出（不写档）

- **owner 裁决：** `REQ-GAL-PROFILE-EVENT=A`。**指派：** gal程序主程；**施工主体：** Codex/root（2026-10-10 本地锁；Git 操作按 owner 禁令由 owner 亲自执行）。施工边界为 `src/skills/tier3/narrative-director.ts`、对应测试、必要的 capability/组件台账与生产线手册、本工单及 Review 单；不碰 `GalProfile`/SavePort、UI、游戏目录或资产。此单碰 Director 定序/确定性/快照，归主程；复查人不得是施工者。
- **当前状态：** 04A 已由非施工者按四步独立复查签局部 PASS，证据见 `review/GAL-ENG-04A.md`；复查定向 9 文件 90/90、另 Profile 6/6，全库 `tsc` 仍因既有非 GAL 错误退出 1，不称全绿或已推送。确认协议已从直写 World 修为 `narrative.ack` 具名输入。
- **目标：** 让已校验 `GalPackage` 中 `reach-node`、`reach-ending` 和 `unlockCg/unlockMemory/unlockMusic` 产生可由宿主消费的稳定纯数据里程碑；UI 将来在对应当前可见节点完成显示后显式发 `narrative.read-complete`，Director 只验证节点身份并产已读事件，不推测浏览器打字机状态。事件不得直接触碰 `GalProfile`、SavePort、墙钟或 UI。数据包的 unlock 字段不能再是“填了但运行时无人解释”。

### 语义与边界

1. 事件须含 `packageId`、稳定内容 ID/StoryRef、种类及足以幂等消费的身份；产生于真实成功提交的节点进入、结局到达、choice/check/enter 效果或显式 read-complete，不由初始投影读取、`World.restore`/读档、回滚恢复、历史向下重放或空 tick 伪造。回滚后再次走到节点可重新产同一内容事件，未来全局档案桥应幂等；已解锁不会因分支改选撤销。
2. `narrative.read-complete` 使用具名 InputQueue action，必须携当前稳定 StoryRef 身份，迟到/错节点/非法输入拒绝并留 trace；不能把“进入/渲染台词”当作已读。与前进/回滚同拍多输入沿用 Director 的确定性单动作裁决，不能偷偷双步。
3. 预检整批 StoryEffect 与目标目录；任何无效 unlock ID、缺资源/旗标或非法引用都必须在写 Resource/Flag/Seed、推进 StoryRef、追加里程碑之前拒绝，不得半提交。`explicit` 规则只可由对应显式 unlock 效果触发；`reach-*` 按静态 UnlockRule 与真实节点/结局触发。
4. 输出必须可在快照/恢复后确定性重放并可被未来异步 04B 桥可靠消费；未确认送达的事件不得因下一 tick 或 512 句历史裁剪而静默丢失。队列/账本若可能无限增长，设明确可测试的界限与满载拒绝/背压，不许静默覆盖。具体闭集组件/信号及确认协议由施工者按现有事件总线/World 约束提出，禁止把回调函数或自由 handler 塞进 package。
5. 04A 不持久化 `GalProfile`，不做 UI 的文字打字机、CG/回想页面、自动/快进、音视频播放、正式存档 UI 或游戏专属观察器。04B 才把已验收事件桥接 `GalProfile` 的 `markRead`/`unlock` 和 SavePort，且须覆盖失败重试。

### 点名验收

- 两章节/分支样本覆盖 reach-node、reach-ending、三种显式 unlock 在 enter/choice/check 中的正确触发、重复前进不重发、回滚/读档/旧未来裁剪不伪造事件；改选后旧已解锁事件保留，全局消费者可幂等。
- read-complete 仅正确当前 StoryRef 可触发；初显、读档、回滚和未收到显式完成动作时无已读事件，迟到 ref 与同拍多输入明确拒绝；同 seed+同输入双跑的 World hash 与事件序列一致。
- 错 unlock ID、缺 effect 目标与满载路径在原子性上点名验红；快照恢复后未确认事件仍可读、确认/去重顺序稳定、无空 tick 增长；DebugTrace 关时 no-op、开时每系统每 tick ≤3。
- 组件/注册表/系统图、定向测试和全库类型检查据实报告，提交 Review 单给非施工者按独立复跑、带锚点撤修验红、实证复现、读告警四步签判。全库非 GAL 红灯不能遮掩。禁止 Git/GitHub、数据库修改或服务启动。

## GAL-ENG-03B：GAL 手动存读档控制器（无 UI）

- **策划判定（2026-10-10）：接受最小通用切片。** 已实查 `SaveSystem`/`StoragePort` 可以保存 `WorldSnapshot + snapshotOrder + hash`，`NarrativeHistory` 当前为有界纯数据 World 组件，`GalProfile` 则独立于 World。故先复用现有快照服务做手动槽；不得平行发明另一个 GAL 存档格式或用 `localStore` 存世界。`SaveSystem.load` 会直接 `world.restore`，所以 GAL 控制器必须在隔离的临时 World 中预检，再一次性恢复到活动 World；坏档/错包不得先污染活动剧情。
- **指派：** gal程序主程；**施工主体：** Codex/root（2026-10-10 本地锁；Git 操作按 owner 禁令由 owner 亲自执行）。施工边界为 `src/services/gal-save/**`、复查发现旧档投影缺口所需的 `src/skills/tier3/narrative-director.ts` 只读投影推导导出、`docs/playbooks/save-platform.md` 路标、本工单和 Review 单；不修改 `SaveSystem`/`StoragePort`、PUI、游戏目录、资产或真实持久化后端。存档/跨游戏共享面归主程，复查人不得是施工者。03A 档案与 02B 回滚已通过局部独立复查；全库既有非 GAL `tsc` 红灯需据实报告。
- **当前状态：** GAL-ENG-03B 局部能力已由非施工者按四步独立复查 PASS（最终定向 53/53、两轮伪投影实证修复、两次带锚点隔离撤修验红）；证据与判词见 `review/GAL-ENG-03B.md`。全库 `tsc` 仍因 game-dice、game-theft、launcher 的非 GAL 既有错误退出 1，不宣称整体门禁绿或已推送。
- **目标：** 通用 `GalManualSaveController`（名称可按现有服务命名规范调整），以已验证的 `GalPackage`、活动 World 和现有 `StoragePort + SaveSystem` 为输入，提供手动槽保存、列示、预检读档及删除 API。只负责手动槽的权威剧情快照；不写 PUI、游戏目录、资产、创作台或新后端。

### 写死语义与边界

1. 手动槽用 package 命名空间 + 稳定正整数槽号，至少支持 1–12；存储层不把 UI 的每页 12 格误当成最多只能有 12 档。列示只返回本 package 的槽，顺序确定；空槽可表示，非法/越界槽号明确拒绝。删除只针对精确手动槽，不碰其他 package、Profile、quick/auto 槽。
2. 保存前验证 World 中唯一 `StoryRuntime` 与 `NarrativePackage` 的 package 身份、当前 StoryRef、投影及 History 游标一致。保存权威剧情态、Resource/Flag/RandomSeed、最近至多 512 步历史和实体创建序；**不保存正在按下的 `InputQueue.actions`**，读档后也不得重放该拍输入。静态 package 不得被当作可由坏档覆盖的发布真相；如现有 `SaveSystem` 会复制它，读档预检必须与当前发布 package 对拍，错包或不兼容版本 fail-closed。
3. 使用隔离 World 调用现有 `SaveSystem.load` 完成 hash/order 校验和历史/包/游标预检；所有校验通过后才修改活动 World。坏 hash、缺失/错包、坏 StoryRef、损坏历史或任一前置失败均保持活动 World 与全局 `GalProfile` 原样。无槽返回可定位的 empty 结果，不伪造成功。
4. 历史旧档缺 `NarrativeHistory` 时，依 02B 合同从加载点新开 512 窗口；已含历史的槽保留游标/分支恢复语义。保存后再改变活动 World 不得反向污染槽；读档后重复前进/回滚结果确定。
5. 本单 `SaveMeta` 只使用现有槽号、tick、时间与安全的人类可读标签；缩略图是非权威且可缺的 `SavePreview`，后续单独接线，不能把预览写入剧情快照。快存/自动存频率、覆盖策略、确认框开关、滚轮映射、CG/回想 UI 与桌面文件桥均不在本单。`GalProfile` 是跨槽局外状态，本单不得随槽回退或删除。
6. 禁止修改 `SaveSystem`/`StoragePort` 的共享契约来图省事。若组合无法保证错包预检、历史恢复或活动 World 不污染，须实查留证并按缺口协议提交 A（补通用引擎能力）/B（GAL 专属逻辑）及代价给 owner；未裁决不得绕行。

### 点名验收

- `MemoryStoragePort` 中 1、12、13 号手动槽往返，证实 12 仅为 UI 页容量；不同 package 同号互不串，列示与删除隔离。禁止测试写真实持久化后端或启动应用服务。
- 保存→活动世界继续改变→加载旧槽，投影/资源/种子/enter 账本/历史游标和 `snapshotOrder` 恢复；加载后首拍输入为空，旧档无历史从当前位置新开窗；跨 choice 回滚改选仍可行，外部 `GalProfile` 解锁不回退。
- 坏 hash、错 package、坏当前 ref、坏历史及端口读/写失败点名 fail-closed，活动 World 快照与实体次序逐字节不变；不删除或覆盖无关槽。静态 package 更新导致不兼容时明确拒绝，不跳到近似节点。
- 点名测试、组件/注册表/真实同装系统图、类型检查据实报告；带锚点隔离撤修验红与独立对抗复现后交 Review 单。不得执行 Git/GitHub、数据库修改或应用服务启动。

## GAL-ENG-03A：GAL 全局档案的纯数据合同与版本化存取

- **策划判定（2026-10-10）：接受。** 02B 已证明运行态回滚可行，但目前只用假 Profile 证明“全局解锁不回退”；真实已读、CG/结局/回想/音乐解锁与偏好尚无跨存档权威。现有 `src/services/profile/profile-port.ts` 的 `PlayerProfile` 是启动器共享角色卡（姓名/头像、只读、键 `apollo.playerProfile`），**不是** GAL 档案；不得改其契约或复用其键。现有 SavePort + 信封已覆盖持久化、校验和迁移，不新增存储后端或自由 localStorage 协议。本单是已定 GAL 设计对既有端口的适配，不扩大到新数据库能力。
- **指派：** gal程序主程；**施工主体：** Codex/root（2026-10-10 本地锁；Git 操作按 owner 禁令由 owner 亲自执行）。此单涉及跨存档共享状态，归主程；独立复查人不得是施工者。02B 局部复查 PASS 为前置；全库 `tsc` 非 GAL 红灯仍须照实报告。
- **当前状态：** 局部能力已通过非施工者独立复查（91/91、隔离撤修验红、跨包信封串档独立复现）；证据与判词见 `review/GAL-ENG-03A.md`。全库 `tsc` 仍有非 GAL 错误，不能宣称整体门禁绿或完整产品交付。
- **目标：** 实现与启动器角色卡严格区分的 `GalProfile`（命名可在实现时明晰，但公共类型不得仍叫裸 `PlayerProfile`），纯数据 v1 合同、形状校验/迁移、只读查询与幂等更新、通过现有 `SavePort` + `sealEnvelope/openEnvelope` 的版本化读写。按 `packageId + stableContentId` 隔离已读及各类解锁，绝不把局外档案放进 WorldSnapshot、NarrativeHistory、剧情条件或随机 hash。

### 写死语义与边界

1. 数据域：已读节点、已解锁 CG/结局/回想/音乐及文本/自动/跳过/音量等既定偏好；ID 使用稳定的 package 命名空间，集合规范化排序且去重。对同一 ID 重复标记无副作用；不同 package 的同名节点/CG 不能串档。
2. “已读”只在玩家完成该句阅读、到达可推进状态后记录；投影初显、读档恢复、回滚和回想重放不能自行标已读。本单先提供显式的 `markRead`/`unlock` 入口与纯测试，不擅自在 Director 的节点进入时写档；运行时事件桥另票接线。
3. 档案版本与 package 归属必须校验。坏 checksum、未来 schema、断裂迁移、坏形状均明确拒绝/报告；无档可创建干净默认档。写入/读取时不从 sim 取墙钟；时间由宿主注入。存储失败不能伪称成功。
4. 存档槽、快存/自动存、预览缩略图与回想运行态不在本单；`SaveSystem` 仍是每槽权威世界快照，`GalProfile` 是跨槽局外状态。不得修改现有启动器 `src/services/profile/**`、`apollo.playerProfile` 键、PUI、游戏目录、资产索引或媒体播放。
5. 先实查 `SavePort`/envelope、`SaveSystem`、`localStore`、现有 `PlayerProfile`、02B 的 Profile 排除测试；若实查发现上述组合仍无法表达合同，按缺口协议提交 A/B 与代价，停在 owner 裁决点，禁止自行新造持久化后端。

### 点名验收

- 用 `MemorySavePort` 完成新档→读写→重载往返；两 package 同 ID 不串档；重复解锁/已读幂等且规范化字节稳定；回滚/重选后已解锁集合仍在。
- 坏 checksum、旧版迁移/缺迁移、未来版、坏形状及端口写失败逐项有测试；旧档未含 GAL Profile 时只新建默认，不借用启动器角色卡。
- 对照 `GalPackage` 的 CG/ending/memory/music 目录，未知或跨 package 内容 ID 不得静默收入档案；偏好范围有明确校验/归一化。
- 组件/注册表/相关定向测试与类型检查据实报告；带锚点撤修验红、实证复现与读告警后交 Review 单，不自签独立 PASS。不得执行 Git/GitHub、数据库修改或应用服务启动。

## GAL-ENG-02B：最近 512 句的逐句回滚与分支改选

- **owner 判词：** 2026-10-10 “历史限定512句”。结合此前判词：上滚回退、下滚前进，跨过选择点允许重新选择；回到选择前恢复该存档内的剧情状态、enter/effect 执行记录与随机种子；全局已读/CG 解锁不回退。玩家可见叙事步（line、choice、check 提示、ending）计入 512，自动 jump 不计；512 包含当前位置。到最旧边界继续上滚只反馈 `history-limit`，不改剧情。这是对“句”的可测试口径，若 owner 进一步修正，以新判词为准。
- **指派：** Opus / 用户指定的 gal程序主程会话。**施工主体：** Codex/root（2026-10-10 本地锁；Git 操作按 owner 禁令不由 agent 执行）；Lead 只出规格，复查人须另会话/非施工者。
- **当前状态：** 02B 局部能力已通过非施工者独立复查（最终定向 47/47、隔离撤修验红、当前点不匹配导入实证修复）；证据与判词见 `review/GAL-ENG-02B.md`。全库 `tsc` 仍被非 GAL 错误阻断，不宣称整体门禁绿；正式存档控制器及滚轮 UI 接线另票推进。
- **前置：** GAL-ENG-02A 定向独立复查 PASS；全库 `tsc` 仍有非 GAL 的既有错误，因此不得宣称整体门禁绿或项目交付。02B 只补通用 Director 的回滚能力，不做 UI、正式存读档、PlayerProfile 持久化或自动/快进。

### 写死的玩家语义

1. UI 未来只把滚轮上/下译为具名输入（如 `narrative.back` / 现有 `narrative.advance`）；输入经 `InputQueue` tick 边界进入引擎，UI handler 不直接恢复世界。一次有效上滚只退一个玩家可见叙事步；一次有效下滚只进一个玩家可见步，自动 jump 不额外消耗玩家一次操作。快速连滚/同拍多输入必须有确定性裁决，不发生双步推进。
2. 回退到 choice 显示选项并等待显式 `choose(option.id)`。旧选择不得被下滚或自动 jump 偷偷重选；玩家重新选择时，从该点截断旧未来，按新分支继续。未重新选择就尝试前进须明确拒绝/保持 choice。回退到 check 前则还原检定前的 `RandomSeed`，同选择和种子重走应得到同一结果。
3. 回退时原子恢复剧情游标、场景/投影、Resource/Flag、RandomSeed、`enteredNodeIds` 及其他属于该存档的 Director 确定性状态；新路径的 `enter`/choice effect 只在真实再次进入/选择时按恢复后的状态执行一次。全局 `PlayerProfile`（已读与画廊解锁）在回滚域外，已有解锁保留；02B 即便尚无完整 Profile 服务，也须用隔离的假档案/端口测试这一边界。
4. 只保留最近 512 个玩家可见状态；第 513 个到来时确定性淘汰最旧状态，永不越过淘汰边界。到边界上滚只给闭集拒绝/提示，既不重放丢弃路径，也不修改 Seed/effects。`checkpoint:'hard'` 可作窗口内恢复锚，不得突破 512 上限，也不得阻止跨 choice 回退。
5. `NarrativeHistory` 同时提供只读的最近窗口条目（稳定 StoryRef、说话人、已呈现的本地化文本快照及可见节点类型）供未来回看 UI 消费；不含静态 `GalPackage`、渲染 URL 或浏览器对象。窗口内条目次序与回滚游标在回退/改选/裁剪后严格一致。

### 状态与实现边界

- 开工先实查并记录 `World.snapshot()/snapshotOrder()/restore()`、现有 recorder/replayer、`SaveSystem`、`SavePort` 与 02A Director 输入/定序；说明为何能复用或不能直接复用。已知逐句历史不能直接用异步持久化存档槽代替；`snapshotDelta/applyDelta` 只有前向增量，不能假装可逆。
- 设计一个**有界、非递归的会话历史容器**，不得把完整 `WorldSnapshot[]` 塞进 World 组件（自包含风险），不得每句重复深拷贝静态 `NarrativePackage`。若使用 World 快照恢复，必须保存/恢复实体创建序 `snapshotOrder()`，并在恢复后清理本拍输入，防止回滚动作被重放成推进。具体压缩/差量策略由施工者提出并以测试证明，不预先指定新存储协议。
- 02B 历史先属于当前运行会话，不写 `localStorage`、数据库、正式存档槽或新的 SavePort blob。未来 GAL 存档控制器要能接入版本化历史序列化；本票至少定义清楚导出/导入边界与“旧档没有历史时从载入点重新起窗”的可定位降级，不擅自修改现有 SaveSystem。包版本/引用不匹配必须拒绝恢复，不能跳到近似节点。
- 自动/快进尚未实现。本票若收到它们的动作名，应明确拒绝或不处理并留 trace；不能默默与回滚并发。未来联合规格再定互斥与取消策略。不得触碰 `src/ui/**`、`games/**`、`assets/index.json`、媒体播放、创作工作台或正式存档服务。

### 点名验收与交接

- 两章节、两选项、检定、资源/旗标与 `enter` 的真实引擎 fixture：前进 → 回退到 choice → 改选 → 新结局；旧未来不可复活，全局假 Profile 解锁仍在。
- 同 seed/同操作序列（含回滚与改选）的世界 hash 一致；从会话/世界快照恢复后继续前进/回退一致；检定前后 Seed sequence 点名相等；无输入静息不产生新历史或重复效果。
- 512/513 边界、连续上滚到边界、下滚恢复、跨自动 jump、hard checkpoint、非法/同拍双输入、损坏/旧版/包不匹配历史导入都有点名断言。至少一条 512 长路径证明历史内存有界且不复制 512 份静态包；测量方式与实际数值写入 Review 单。
- 注册表/组件闭集/真实同装系统图与 trace 均核实；`reject` 覆盖无可回退状态、到界、choice 未确认、坏历史等“无事发生”路径，关 trace 时零事件。施工者自验并交 Review 单；非施工者按独立复跑、带锚点撤修验红、实证复现、读告警四步复查。全库既有红灯原样报告，不跨域修复或宣称整体交付。
- 禁止 agent 执行任何 Git/GitHub 命令、修改数据库、启动前后端；需要受限操作时严格按根 `AGENTS.md` 格式交 owner 亲自执行。

## GAL-ENG-02A：通用 Narrative Director 的确定性前进内核

- **owner 路线：** `GAL-GAP-01=A` 已裁决。`gal-ui-complete-v2.dc.html` 已由 owner 明确作为 1440×900 S1-P 原型定稿；其 SHA-256 为 `225A74C8F6341C7B4144724A72F1E798E001064545E83B0E50DEDC45C35FF402`，定稿记录见同目录 `gal-ui-complete-v2.md`。本单不把 HTML/CSS/JS 移入运行时。
- **施工主体：** Codex/root（2026-10-09 本地锁）；本工单由 GAL Lead 派发，不代替独立复查。
- **复查状态：** 02A 定向能力复查 PASS（独立 38/38、隔离撤修验红、真实共装图无环）；全库门禁 CONCERNS（非 GAL 的既有 `tsc` 10 条诊断），不得宣称整体交付。证据见 `review/GAL-ENG-02A.md`。
- **依赖状态：** `GAL-ENG-01` 的 15/15 定向合同测试已由非施工者独立复跑通过；全库 `tsc` 仍因 game-dice、game-theft、launcher 的非 GAL 错误退出 1。可做本单局部施工与定向验证，不得宣称全库门禁绿、已推送或整体交付。
- **目标：** 使一份已通过 `GalPackage` 静态校验的纯数据剧情，在真实引擎 tick 中完成 `line → choice → check → ending`（含跨章节 `StoryRef` 和条件 `jump`），产出只读 `NarrativeProjection`。这是 runtime 的第一个可测竖切，不是完整 GAL 模板。

### 施工边界与顺序

1. 先实查 `t3-dialogue`、`t3-flow`、ConditionExpr、Resource/Flag、RandomSeed、WorldSnapshot、InputQueue 和 debug-trace 的现有契约，提交一页“复用/适配/确实新增”接线说明。`t3-dialogue` 已会台词、选项、检定；禁止平行复制第二套对话 runner。若确实无法组合，写明源码/手册证据与 A 补通用能力、B 游戏专用代码的代价后停在 owner 裁决点，不得先写绕行代码。
2. 在 `src/engine/**`、`src/skills/tier3/**`、`src/assembly/**` 的 GAL/通用能力边界内实现最小 `StoryRuntime`（package 身份、稳定 `StoryRef` 游标、当前继承后的场景、已执行 enter 身份），以引擎快照可恢复的纯数据为权威；注册真实 capability 并按能力清单更新相应手册。不得新增独立 localStorage/save blob 或在游戏目录写解释器。
3. 一个具名输入在一个 tick 最多推动一个逻辑节点；推进/选项/检定须遵循现有输入队列和相位定序，失败路径有闭集拒绝理由和 opt-in debug trace。`NodeBase.enter` 在该存档首次进入节点时仅执行一次；确认 choice 后效果仅执行一次；相同 seed + 输入序列 + 快照恢复必须得到同一世界状态/投影。`jump`/自动路由必须有有界防循环处理，不得静默卡死。
4. `NarrativeProjection` 只读导出当前背景、cast、CG/媒体引用、说话人、纯文本、可用选项、章节/节点身份与 ending 状态，按 V1 package 的场景默认值 + 章节场景 + 节点 `PresentationDelta` 继承；只引用 asset key，不播放媒体，也不写 UI。无效/缺失引用以可定位错误拒绝，不能悄悄降级为别的剧情。
5. 本票只接 `resource`/`flag` 的存档内 effect。`unlockCg/unlockMemory/unlockMusic`、全局已读与偏好属于后续版本化 `PlayerProfile` 票；遇到本票不支持的效果须在装载或执行前明确拒绝，绝不能静默跳过。存档恢复只消费现有快照能力，不做槽位控制器或持久化服务。

### 复用 / 适配 / 新增接线说明（2026-10-09）

- **复用：** `t3-dialogue` 的 InputQueue tick 边界、`ConditionExpr`、Resource/Flag 写入语义、`RandomSeed` 与世界快照；测试基座的 deterministic / restore / quiescent 三件套；`debug-trace` 的 opt-in `reject` 留痕口径。
- **不能直接重组的证据：** `src/skills/tier3/dialogue.ts` 的 `DialogueScript` 是单一 `Record<nodeId, DialogueNode>`，边为字符串 `next`，仅投影 `Text.content`；不包含 `GalPackage` 的跨章节 `StoryRef`、场景默认值/PresentationDelta 继承、`enter` 身份或只读 NarrativeProjection。把这些硬塞进其字段会改变既有 dialogue 合同且不能表达本单点名验收。
- **新增（已裁决 A）：** 新的通用 `t3-narrative-director` capability，仅解释已校验的 `GalPackage`；不复制条件、随机、输入队列、资源/旗标、快照或 UI 系统。

### 明确留给后续票

- 滚轮↑逐句回滚、滚轮↓逐句前进、跨选择点改选及历史裁剪；这是产品必做，不是可删需求。`GAL-ENG-02B` 必须在 Director 正式对外宣称可用前补齐，并保持选择前剧情状态/随机种子回退、全局解锁保留。02A 不得冻结阻碍 02B 的不可逆 API；历史上限/超限提示已在上方 02B 工单按 owner 的 512 句判词写定。
- CG/回想/已读/偏好、手动/快速/自动存读档、语音/音乐/视频播放、自动/快进、桌面宿主、AI 创作产线，以及 V2 各屏的正式 LayoutNode 实现均不在本票。`src/ui/**`、`games/**`、`assets/index.json` 归相应角色，本程序单不得改。

### 点名验收与交接

- 至少一份两章节纯数据 fixture，能走 `line → choice → check → 两个 ending`；跨章节引用、条件跳转、场景/立绘/背景继承及投影都用断言覆盖。
- 连点、非法选择、条件不满足、缺随机种子、坏引用、未支持 unlock、强制跳转循环分别有“拒绝/不推进/明确错误”的点名断言；不得出现无事发生却无 trace 的路径。
- 用测试基座的 `expectDeterministic`、`expectRestoreContinues`、`expectQuiescent` 做确定性/恢复/静息三件套；额外证明 enter 与 choice effect 在连点、读档恢复后都恰好一次，且相同输入与 seed 的 hash 相同。
- 给出 capability registry/组件清单/系统图与受影响的定向测试退出码；读完整告警。施工者交 Review 单，由非施工者独立复跑、带锚点撤修验红和源规格对拍。全库门禁若仍被非 GAL 错误阻断，原样报告，不跨域偷修或宣称完成。
- 禁止 agent 执行任何 Git/GitHub 命令、修改数据库、启动前后端；如后续需这些动作，按根 `AGENTS.md` 的 owner 交接格式提供命令，由 owner 亲自执行。

## GAL-ENG-01：版本化 `GalPackage` contract 与纯静态校验

- **owner 裁决：** `GAL-GAP-01` 选择 A（通用引擎能力）；`GAL-GAP-02` 选择 B（首个 sample 仅手填已审核 package）；`GAL-GAP-03` 选择 A（后续由 PUI 实现 `gal-template`）。
- **施工主体：** Codex/root（2026-10-09 本地锁）。
- **领工声明：** 代码基线为当前共享工作树。此次只新增 GAL 的 versioned pure-data contract、schema normalizer、纯 validator、最小 fixtures/tests，以及 capability registry / playbook 的必要登记。禁止修改 `src/ui/**`、游戏目录、存档服务、资产索引、音视频播放、DraftEnvelope/AI 工作台或任何 Narrative Director runtime system；不得执行 Git、启动服务或写数据库。
- **状态：** V1 合同闭集的独立定向复查已通过（15/15）；全库 `tsc` 因非 GAL 文件红灯，整体门禁未完成。详见 `review/GAL-ENG-01.md`；本行保留原施工锁记录。

### 写死规格

1. `GalPackage`、`StoryRef`、章节和节点均为纯数据；逻辑身份只由 `{ chapterId, nodeId }` 表示，禁止节点内重复 id、函数、URL、表达式字符串或 DOM/CSS。
2. package schema 必须有显式版本；normalizer 只接受可定位的旧版本迁移，无法迁移时拒绝，绝不静默改写 stable ID。
3. validator 是纯只读函数：稳定地产出 diagnostics，不读墙钟/随机/持久化，不替作者猜测补值。
4. 最小校验覆盖 entry/reference、唯一 choice option id、可达性、无出口强连通环、locale、媒体 asset key、ending/unlock；尚无 runtime 的字段不能被 validator 标成“可播放”。
5. 为后续滚轮逐句回滚预留 cursor/checkpoint 的纯数据边界；本单不实现 rollback 或 UI。跨 choice 是否允许改选、逐次 enter/effect 如何撤销或按快照重放，留待 Narrative Director 联合规格裁决，validator 不得预设其中任一策略。

### 点名验收

- 两章节最小 package（line → choice → check → 两 ending）全引用正确时零 error；
- entry / StoryRef / ending / asset / locale / duplicate option ID 各自给稳定、可定位诊断；
- 不可达节点与无退出强连通环被点名；显式许可回环只警告并保留路径；
- 同一输入连续校验 diagnostics 严格相同；
- 旧 schema 有迁移则 normalizer 输出当前 schema；无迁移则明确拒绝且 stable ID 不变；
- registry、受影响定向测试、确定性检查与全量门禁按工作规则验证；独立复查需再跑并执行撤修验红。

### 自验交接（2026-10-09）

- 产物：`src/engine/protocol/galgame.ts`、`src/assembly/gal-package.ts`、`src/assembly/gal-package.test.ts`；`docs/playbooks/pick-list.md` 增加 validator 路标。
- **注册表结论：** 未改 capability registry。此单没有 Runtime system / component / capability，硬登记会虚构一个可被 manifest 装载的能力；`t3-narrative-director` 在后续获批实现时再登记。
- 定向验证：`npx vitest run src/assembly/gal-package.test.ts` → 3/3 通过。
- 类型检查：新增 GAL 文件无诊断；全库 `npx tsc --noEmit` 仍被既有 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts` 与 `src/launcher/game-runner.tsx` 的非本单 UI 类型错误阻断，未触碰这些文件。
- 独立复查要求：复跑上述定向测试；对 validator 的 `resolveAsset`、schema upgrade 与 choice/reference 守卫做锚点撤修验红；确认未触碰 UI、runtime、storage 或 asset index。
- 复修：所有 StoryRef 先经形状守卫才入图；无出口 SCC 以 error 点名、`loop:true` 以 warning 留痕；`checkpoint` 校验为闭集。定向测试现为 6 项，覆盖 v0 normalizer、缺 locale/entry/ref、重复 option、asset resolver、不可达、无出口环/许可环、恶形输入与 checkpoint；`npx vitest run src/assembly/gal-package.test.ts` 通过 6/6，且无 unhandled error。

### 已裁决：完整 V1 合同的闭集定义

复查要求以两份 GAL 设计文档 §3–§6 的数据模型为 V1 基线。这一方向接受：当前合同只覆盖故事图核心，不能标称为可用的完整 `GalPackage` V1。

已实查的原文边界：

- `galgame-template-data-model.md` §3 要求包顶层含 `ui: GalUiSpec`、`characters`、`scenes`、`gallery`、`media`、`preferences`，而当前核尚未完整表达这些栏目。
- 同一节将 `GalUiSpec`、`EndingSpec`、`PreferenceDefaults`、`UnlockRule` 作为命名类型引用，但 §3–§6 没有给出其字段闭集；§4–§6 对 `ConditionExpr`、`StoryEffect`、`PresentationDelta` 又提出了可校验的语义边界。

不能以自由 `Record<string, unknown>` 或自创字段假装完成该合同，否则会违反「版本化合同 + validator」的目标，并把未裁决的产品语义冻结进引擎。

Lead 已通过 `contract-v1-closure.md` 批准 A 路线内的字段闭集；本单已据此扩展纯 TypeScript 合同和静态校验，未新增 runtime、Director、UI 或存储行为。虚构的 `schemaVersion:0` 迁移已删除，V1 之外版本一律明确拒绝。

自测更新：`npx vitest run src/assembly/gal-package.test.ts src/assembly/gal-package.review.test.ts`，8/8 通过。全库 `npx tsc --noEmit --pretty false` 中 GAL 文件无诊断；仍由既有 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts` 与 `src/launcher/game-runner.tsx` 类型错误阻断。
