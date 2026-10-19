# GAL-ART-01A · S5 同画布差异单（2026-10-12）

状态：**CONCERNS**。这是 1440×900 的定稿 V2 与静态 `file://` 真渲对照，不代替独立 GAL 消费复查、Owner 原型验收或 S6 演出验收。深/亮主题 34 态截图由 `src/services/gal-ui/verify-gal-art-live.mjs` 生成；本轮浏览器已关闭。原型是 authoring-time 基准，实际截图使用 GAL 审计夹具，因此已填槽的具体剧情内容不同不单列为皮肤缺陷。

| 对照 | 已缩小的差异 | 尚未对齐 / 去向 |
| --- | --- | --- |
| [V2 首页](gal-ui-v2-home.png) ↔ [实渲首页·亮主题](review/gal-art-01a-home-light-v2-home-final-1014.png) | `GalUiSpec.titleBackground` 经媒体索引投影为独立首页场景图；无 URL 保留条纹回退。1440×900 实渲已呈现同一 demo 夜景、亮色标题、六键菜单和暗罩；首键约 y368 对原型 y365，底部审核说明独立锚到 y785。暗亮两态浏览器检查退出 0，91 个 GAL UI 测试通过。 | 底部说明为真实素材审核提示而非原型演示文案，原型右上 UI DEMO 标识未照搬；按钮默认态较接近，但 hover/pressed/disabled 逐帧与终图 1:1 未签。当前 demo 图仅用于模板，不代表首作审美/来源/许可批准。 |
| [V2 对话](gal-ui-v2-dialogue.png) ↔ [新实渲亮主题](review/gal-art-01a-story-normal-light-ghost-state-b.png)；[V2 选项](gal-ui-v2-choices.png) ↔ [新实渲亮主题](review/gal-art-01a-story-choice-light-ghost-state-b.png) | 对话外框按 x20/y555/1400×345；原图纵向 160% 居中裁切、正文/姓名/选项提示亮字；选项皮 180% 及外扩接近 V2。Owner 对 ghost 四态选 A 后，PUI `Button.stateColors` 已获通用接口局部独立 PASS；GAL 在默认 V2 有图路由填受限半透明底/金边/四态，旧 slice/无图未漂。深亮剧情/选项 4 页静态浏览器对默认/hover、七键点击 ActionSink 与中心命中施工侧通过。 | GAL 四态消费独立复查及真实纹理下的逐字对比度仍待结；先前无暗底时 save/load 区域第 5 百分位 3.42:1/3.08:1 只作历史基线，不套用到新皮。推进/底部辅助字及整体动画节奏仍待逐帧证据；不签完整 S5/S6。 |
| [V2 存读档](gal-ui-v2-save.png) ↔ [当轮实渲读取·亮主题](review/gal-art-01a-four-nav-slots-load-light.png) | 4×3 卡外框为 309×164，槽纹整图 100%×100%；预览位于卡内 x17/y18/275×100。V2 有图路径的“保存/读取”页签为 124×46 纹样钮，顶部/翻页去糖果皮，底部锚点回移 57px。编号为 52×18 金边胶囊，仅空槽中央为菱形；损坏/无预览提示、无图与旧显式切片仍保留。预览底 `{custom:'#172140'}` 的参考/实渲像素为 `(23,33,64)` / `(24,34,64)`；[底色独立复查](review/GAL-ART-01A-slot-preview-fill-independent.md)局部成立。顶栏现有主页/剧情/回想 CG/设置四项，剧情仅可续时可点；34 态真渲及四键 ActionSink 通过，[四入口独立复查](review/GAL-ART-01A-slot-four-nav-independent.md)判局部 PASS。 | ghost 胶囊边线/悬停未逐项对齐。底部元数据靠近花饰、局部拥挤；已填预览内容不同，须同内容再比素材 1:1。 |
| [V2 设置](gal-ui-v2-settings.png) ↔ [实渲文字页·亮主题](review/gal-art-01a-settings-text-light-v2-rail-1014.png) | 系统框 115/58 及 x18/y61/1404×824；V2 有图路径回移内锚点，半透明深靛金边卡、18px 加粗金标题和四页签 132×46。滑轨改用闭集 Panel 由当前值投影蓝色进度，保留原生 Slider 命中；行分隔与 64px 节奏、75×31 开关具名交互仍在。设置页复用当前场景图并叠暗罩，缺图仍条纹回退；文字页深亮实渲退出 0。 | 审计夹具真实值 30ms/500ms 与原型 60/3 秒不同，不能硬改数据伪造视觉；页签、右上说明与底栏未逐像素签核。亮主题审计标题 3.57:1 非阻断警告待复核；不签 S5 1:1。 |
| [V2 确认真交互](review/gal-ui-v2-confirm-exit-live.png) ↔ [实渲新游戏确认·亮主题](review/gal-art-01a-confirm-new-game-light-v2-content.png) | 五类可执行确认由 Modal 闭集承载；115/36 框边、金标题与亮字，按确认类型给标题/动作文案；去多余 X，双 124×44 纹样按钮居中，遮罩/Escape 仍取消。Owner 选 A 后 PUI `Modal.visual` 独立局部 PASS；GAL V2 路由实测内框 800×310、30px 居中标题、正文/双键分组居中及 `aria-labelledby`。 | 当前只签几何/可访问语义局部；逐像素素材与退出游戏宿主入口仍非本项完成。退出游戏为禁用宿主入口，不能假称第六类可执行。 |
| [V2 画廊](gal-ui-v2-memories.png) ↔ [回想图槽夹具亮主题](review/gal-art-01a-gallery-memories-art-light.png)；[CG 实渲](review/gal-art-01a-gallery-top-nav-cg-light.png) | 外框按 115/58 回移 57px；回想为 2×3、CG 为 3×2 暗靛金边卡，页签为 124×46。原型四入口导航和锁定保密保持。Owner 对回想图槽选 A 后，`GallerySpec.memories` 可选预览/锁态 key 已贯穿校验、投影与闭集 Image；无素材保持占位。明暗真浏览器图像加载与深色遮罩施工侧通过，所见 demo 背景和框皮只是功能夹具。 | 具体回想 01–06、锁态剪影与 CG 02–06 均未获 Owner 逐件审美/来源/许可批准，未登记入库；见[候选清单](gal-art-01a-media-candidates-2026-10-13.md)。素材到位前不能签 V2 纹理/分镜 1:1；独立消费复查和动画关键帧仍待结。 |
| 剧情 CG 数据合同 ↔ [当前分镜实渲亮主题](review/gal-art-01a-story-cg-light.png)、[缺素材亮主题](review/gal-art-01a-story-cg-missing-light.png) | CG 成为主视觉时隐藏背景/立绘，台词、选项和顶栏保留；连续 ID 分镜、隐藏切回、回滚与手动读档有定点测试。存档缩略图改为只采当前 CG；CG 缺图不借用被遮挡的场景。四态真渲与[局部自证](self-check/GAL-ART-01A-story-cg-2026-10-13.md)在档。 | 定稿 V2 无剧情 CG 专用画面，不能宣称新屏视觉 1:1；多分镜可按不同 ID 串联，但同组共用画廊条目/解锁尚无合同。局部独立复查待结，S5/S6 仍未完成。 |

已被单独放行的共享能力：`review/GAL-PUI-GAL-SKIN-BORDER-WIDTH-independent.md`（S1）、`review/GAL-PUI-S2-SKIN-LAYER-independent.md`（S2）、`review/GAL-PUI-LABEL-CUSTOM-COLOR-independent.md` 与 `review/GAL-PUI-S3-MODAL-TITLE-COLOR-independent.md`（S3）、`review/GAL-PUI-S4-BUTTON-LABEL-COLOR-lead-independent.md`（S4）、[Button 四态](review/REQ-GAL-PUI-GHOST-STATE-independent.md)。GAL [ghost 消费](review/GAL-ART-01A-ghost-state-consumer-independent.md)与[回想图数据槽](review/GAL-ENG-MEMORY-ART-01-independent.md)亦各获独立局部 PASS。这些只证明局部合同/消费，不会自动使上表视觉差异消失；S5 仍是 CONCERNS。

历史 2026-10-12 本地验证为 GAL+UI 611/611、点名 41/41、34 态静态图；当时 scoped-gate 有 33 项非 GAL 依赖违规。2026-10-13 前一轮 GAL 定向 12 文件 108/108、`tsc --noEmit` 退出 0；ghost 深亮剧情/选项 4 页与回想图槽深亮 2 页隔离静态浏览器通过，浏览器均关闭。共享工作树的 `scoped-gate --run` 一度在 depcruise **37 项**跨项目在途违规处退出 37；最新复跑为 **32 项**，仍不能宣称全库绿。完整 S5/S6 仍未放行；未执行 Git 远程写入、数据库写入或整套应用服务启动，也未把里程碑设为 done。

2026-10-13 V2 第二轮：Owner 对确认窗、cue、贴图按钮反馈均选 A，PUI 通用闭集[独立复查](review/REQ-GAL-PUI-V2-VISUAL-independent.md)局部 PASS。GAL UI 9 文件 89/89；隔离 `file://` 真浏览器全 20 屏×深浅已重跑并关闭，确认窗 800×310/标题 30px、cue 1300ms 中点 .35/下移 4px、分支钮 hover 1.32/8px/160ms 的定点断言通过；设置页场景暗罩与回退有图。GAL [增量独立复查](review/GAL-ART-01A-v2-visual-2026-10-13-independent.md)判四项局部 PASS、S5/S6 仍 CONCERNS。全库 gate 因其他在途模块 32 条 depcruise 越层失败；`tsc` 曾被他域在途 GCI 测试卡住，随后重跑 exit 0。最终素材仍待 Owner 逐件批准；不签 S5/S6 或 Owner 人门。

2026-10-14 S6 真实宿主增量：[键盘/焦点/弹窗自证](self-check/GAL-ART-01A-s6-real-host-focus-2026-10-14.md)以隔离浏览器证明首页→剧情→设置→画廊 Enter 动作、历史/确认/CG Modal 焦点圈与 Esc 出口、取消后返回焦点及遮罩拦截底层剧情动作；3 张 1440×900 结构夹具截图已目击，探针退出 0、浏览器关闭。后续[独立复查](review/GAL-ART-01A-s6-real-host-focus-2026-10-14-independent.md)完成唯一锚点隔离撤修红→绿，判指定增量局部 PASS；终图/全按钮四态/逐帧及 04B-1 未闭，S5/S6 总体 CONCERNS。

2026-10-14 设置消费者接入后，`verify-gal-04c-live.mjs --transient-shots` 在隔离 `file://` 浏览器再次退出 0：四页的系统框、标题行、页签、内容栅格、两张卡、底栏及框外导航包围盒均与定稿 V2 对应值一致（整数像素差 0）；设置/自动/跳过/确认与设置页滚轮隔离链也通过。临时截图与浏览器已清理。这只缩小了**几何**差异，不证明文案、终图、色彩、全部控制项或 S5/S6 完成。

2026-10-14 [存读档系统框细节自证](self-check/GAL-ART-01A-slots-system-chrome-2026-10-14.md)：原型框外左上品牌、标题行容量说明、底栏“操作 + 返回”两枚 124×44 贴图按钮已经出现在已加载 V2 路径，作品标题取数据而非硬编码 demo 英文名。读档[亮态](review/gal-art-01a-slots-load-light-v2-chrome-1014.png)/[暗态](review/gal-art-01a-slots-load-dark-v2-chrome-1014.png)与定稿同画布对拍，真实 ActionSink 返回动作、20/20 点名、789/789 相邻回归、tsc 与 UI 审计 0 阻断。此增量尚待非施工者复查；槽卡底部元数据拥挤、预览内容差异和终图 1:1 仍未关闭，S5/S6 保持 CONCERNS。

存读档系统框随后获[非施工独立复查](review/GAL-ART-01A-slots-system-chrome-2026-10-14-independent.md)指定增量局部 PASS（独立 31/31、宿主 34/34、四态真浏览器、唯一锚点撤修验红）；此判词不涵盖槽卡底部、素材或整页。

2026-10-14 [画廊信息栏自证](self-check/GAL-ART-01A-gallery-chrome-2026-10-14.md)：定稿 V2 框外品牌回到 x31/y14，标题右侧“场景重播 · CG 鉴赏”、页签右侧动态解锁数由闭集 LayoutNode 显示；无图旧树不变。回想/回想有图/CG 暗亮六态 1440×900 真浏览器退出 0，定点 19/19、相邻 789/789、tsc 0、深亮 UI 审计 0 阻断/警告。此为施工侧局部结果，待非施工者复查；终图与完整 S5/S6 仍为 CONCERNS。

画廊信息栏随后获[非施工独立复查](review/GAL-ART-01A-gallery-chrome-2026-10-14-independent.md)指定增量局部 PASS：独立六态同画布、深亮审计与唯一锚点隔离撤修（19 测试中精准 1 项转红，恢复后 19/19）。这不改变终图/完整 S5/S6 的 CONCERNS。

2026-10-14 [设置预览与空槽底栏自证](self-check/GAL-ART-01A-settings-preview-slot-footer-2026-10-14.md)：设置预览不再硬编码原型角色/台词，改由活动剧情只读投影取样，无续玩点显示中性文字；V2 空槽底栏左侧缩为“空存档位”，右侧继续给真实可操作状态，旧树不变。定点 22/22、相邻 792/792、tsc 0、存读档 UI 审计 0 阻断/警告、暗亮八态真浏览器退出 0。仍待非施工复查；花饰/元数据细节与终图、整体 S5/S6 未闭。

设置预览/空槽底栏随后获[非施工独立复查](review/GAL-ART-01A-settings-preview-slot-footer-2026-10-14-independent.md)指定增量局部 PASS：独立 22/22、八态浏览器、唯一防剧透守卫的内存撤修转红。完整设置/S5/S6 不随之通过。

2026-10-14 [首页通用文案实验已撤回](self-check/GAL-ART-01A-home-generic-copy-2026-10-14.md)：曾在未修改、未获 Owner 重新定稿的 V2 原型前，先将运行时有图题签/副标题改为通用文案并删除审核说明；即使当时定点与浏览器探针通过，仍违反原型优先变更规则。现已恢复原 V2 运行时文案与提示，19/19 点名、`tsc`、暗亮隔离浏览器和 UI 审计退出 0；[恢复后亮态](review/gal-art-01a-home-light-restored-v2-1014.png)/[暗态](review/gal-art-01a-home-dark-restored-v2-1014.png)已目击。保留实验截图仅供追溯，不作为现行对齐证据。跨作品文案需先提交原型改稿供 Owner 目击重确认，再决定运行时数据合同；首页及整体 S5/S6 均未因此签核。

2026-10-14 [S6 真实宿主动作链自证](self-check/GAL-ART-01A-s6-action-chain-2026-10-14.md)：结构夹具真浏览器覆盖开局、选择、空槽拒读、存档、回滚改选、读档、隔离回想退出与重开继续；八帧 1440×900 截图已目击。探针退出 0，44/44 相邻回归、`tsc` 退出 0，隔离浏览器/临时构建关闭。此为施工侧功能链证据，待非施工独立撤修复查；无图夹具不证明 V2 终图或 S5/S6 整体完成。

随后[非施工独立复查](review/GAL-ART-01A-s6-action-chain-2026-10-14-independent.md)对指定动作链判局部 PASS：短时隔离 Edge 两轮转绿、真实回想工具栏唯一锚点内存撤修后保存入口从应为 0 变为 1，行为断言转红，恢复后再绿；默认沙箱 Vite `realpath EPERM` 作为环境限制单列。八帧只是施工结构夹具，终图、全按钮四态与完整 S5/S6 仍为 CONCERNS。
