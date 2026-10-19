# GAL 当前需求与施工入口

> 本文件只保留当前控制面；历史施工单已归档于 [2026-10-12 快照](archive/requests-through-2026-10-12.md)。项目级状态以 [路线图](../../projects/galgame-generation-engine/project-roadmap.json) 为准，局部证据见 `review/`。

## 1. 当前结论

- 当前阶段：通用 GAL 引擎的 `media-and-final-skin` 仍为 active；创作产线并行推进。
- 当前出口：完成定稿 V2 的逐屏同画布视觉与演出对齐，独立复查后才申请 Owner 人门。
- 最近有效 Owner 判词：允许使用当前 demo 素材；设置能力选通用实现；1440×900 V2 顶栏可见“↻ 语音”按钮已确认。聊天判词不代替控制台人门。
- 2026-10-13 Owner 对 [S5 A/B 单](gal-art-01a-owner-ab-2026-10-13.md)两项均选 A：ghost 交 PUI 通用 Button 闭集；回想条目增加可选已审核图像槽。该判词不批准任何具体图片、来源许可或发行权。
- 2026-10-14/15 Owner 对合批问题及剩余显示设置均选择 A：桌面退出走可复用可选宿主端口、浏览器预览仅反馈；作品级减少动态走 PUI 通用 motion policy；高对比与界面缩放走 `REQ-GAL-PUI-ACCESSIBILITY-POLICY-01`。转场共享合同 `REQ-GAL-NARRATIVE-TRANSITION-POLICY-01` 已于 2026-10-16 出共享池，证据见 [复查](review/REQ-GAL-NARRATIVE-TRANSITION-POLICY-01-independent-2026-10-15.md)。这些是施工方向，**不是**控制台人门、接口完成或素材审批。

## 2. 当前有效约束

- 产品边界：新 GAL 只替换人物、剧本、分支和已审核素材，不另写框架；demo 素材不等于发行许可。
- 输入/输出合同：剧情、Profile、存档、已读、回想和资源引用走现有闭集；历史最多 512 句，回滚跨分支可重新选择；单窗口是正式保证。
- 冻结原型/画布/时序：[V2 可运行原型](gal-ui-complete-v2.dc.html)，1440×900，改视觉或时序须先修原型并由 Owner 重确认。
- 禁止：GAL 不改 `src/ui/**`、不写自由 DOM/CSS/JS、不代签独立复查或 Owner 人门、不把局部 PASS 冒充完整 S5/S6。

## 3. 当前活动工单

### GAL-ART-01A · V2 demo 素材与 S5/S6 对齐

- 状态：active
- 施工主体：GAL 主程 `/root`；PUI 专属缺口另派，不由 GAL 越界施工。
- 目标：用现有素材和 LayoutNode 闭集，使主页、剧情/选项、4×3 存读档、四页设置、历史、回想/CG 和确认窗对齐 V2 深亮两主题。
- 验收判据：同画布逐屏/关键帧差异归零或有 Owner 裁决；UI 审计、真实交互、点名测试与独立撤修验红通过；S5 视觉和 S6 演出分别验收。
- 允许改动：`src/services/gal-ui/` 的 GAL 消费数据、点名测试、本票自证与差异单。
- 禁止改动：PUI 基座、素材索引、已冻结原型、其他游戏、禁用功能的真实能力状态。
- 证据：[S5 差异单](gal-art-01a-s5-diff.md)、[终图/素材逐件 Owner 审核包](gal-art-01a-owner-media-review-batch-2026-10-14.md)、[存读档系统框独立局部 PASS](review/GAL-ART-01A-slots-system-chrome-2026-10-14-independent.md)、[S6 动作链独立局部 PASS](review/GAL-ART-01A-s6-action-chain-2026-10-14-independent.md)、`review/GAL-ART-01A-settings-controls-independent.md`、`review/GAL-ART-01A-slots-v2-independent.md`、`review/GAL-ART-01A-slot-four-nav-independent.md`、`review/GAL-ART-01A-gallery-cards-independent.md`、`review/GAL-ART-01A-gallery-top-nav-independent.md`；局部复查不代替完整 S5/S6。

### GAL-UI-04B-1 · 文字逐字与画面设置闭环

- 状态：review（PUI 通用逐字接口与 GAL 消费均获非施工者独立局部 PASS；完整设置、S5/S6 与 Owner 人门未收束）
- 施工主体：PUI 子代理 `/root/pui_gal_04b1` 已完成 `src/ui/**` 通用逐字接口；**GAL 主程 `/root` 于 2026-10-14 领取并锁定 `src/services/gal-ui/**` 消费段**。现有共享工作树在途改动不覆盖。
- 目标：逐字完成/立即显全通知绑定 StoryRef token；底纹独立透明度及画面设置拥有真实消费者。
- 验收判据：点击显全、自动/快进、回滚改选、读档已读判定；Profile 迁移、跨包隔离、深亮主题与失败回退；恢复默认只在全部消费者接通后启用。
- 允许改动：PUI 经裁决的闭集接口及 GAL Profile/UI 消费各归本域。
- 禁止改动：GAL 自建打字机或 DOM 特例、没有消费者却启用开关。
- 证据：[缺口实查与裁决](gal-ui-04b-settings-gap.md)、[PUI 自证](self-check/GAL-UI-04B-1-pui-typewriter-2026-10-14.md)、[GAL 消费独立复查](review/GAL-UI-04B-1-consumer-2026-10-14-independent.md)、[历史票](archive/requests-through-2026-10-12.md)。

### GAL-UI-04B-3 · 显示与输入设置真实消费（Owner A 的 GAL 域子票）

- 状态：review（前批和已读快进 V6 指定增量均获非施工者局部 PASS；完整设置与 S5/S6 未收束）
- 施工主体：GAL 主程 `/root`；PUI 的 StoryRef 逐字完成/立即显全接口仍由 PUI 专职施工。
- 目标：以版本化 Profile 和 GAL 宿主只读表现/输入投影接通现有闭集可表达的画面、滚轮与播放习惯；不把模拟选中态误当宿主全屏。
- 验收判据：旧档迁移、跨包隔离、失败保持旧值、回滚/读档/重开不串偏好；每项 enabled 控件有真实消费者及点名测试，暗亮同画布与独立撤修复查。
- 允许改动：`src/services/gal-profile/`、`src/services/gal-ui/` 的通用 GAL 合同、消费与测试；本票自证、需求单及项目路线图的合法证据保存。
- 禁止改动：`src/ui/**`、冻结 V2 原型、终图/资产索引、远程状态；文字速度和全局恢复默认在 PUI 前置及全部纳管设置生效前继续禁用。
- 证据：[04B 已裁缺口](gal-ui-04b-settings-gap.md)、[V2 定稿](gal-ui-complete-v2.md)、[GAL 域输入显示自证](self-check/GAL-UI-04B-3-input-display-2026-10-14.md)、[前批独立局部 PASS 与四项自动续播反例复审](review/GAL-UI-04B-3-input-display-2026-10-14-independent.md)、[已读快进 V6 独立局部 PASS](review/GAL-UI-04B-3-read-skip-2026-10-14-independent.md)、[恢复默认 UI 禁用/拒写独立 PASS](review/GAL-UI-04B-reset-ui-disabled-2026-10-15-independent.md)；04B-1 仍 blocked。

#### 04B 剩余显示设置的共享前置

- `转场演出` 的 Profile V8 与宿主遮罩已获非施工者局部 PASS：[复查](review/GAL-UI-04B-story-transitions-2026-10-15-independent.md)。默认开启；只在剧本声明转场时加遮罩，关闭或减少动态时硬切。当前 7 句 demo 没有声明，画面不变。不关里程碑。
- `界面缩放`：Owner 2026-10-15 核对定稿原型后决定保持 100%。原型只有一颗静态「100%」按钮，没有 90/110，也不改变画面。GAL 只显示禁用的 100%，不接三档缩放，不改原型。
- `高对比度文字` 的共享 PUI 合同已获局部独立 PASS（[复查](review/REQ-GAL-PUI-ACCESSIBILITY-POLICY-01-independent-2026-10-15.md)）。原型开关不改变任何像素，GAL 控件仍禁用；要启用必须先有打开后的视觉定稿。`窗口 / 全屏` 继续随桌面发行后置。

### GAL-ENG-HOST-EXIT-01 · 受控宿主退出（H1 局部 PASS；H2 桌面段 Owner B 后置）

- 状态：H1 共享 `HostExitPort` 已独立局部 PASS；H2 的独立 GAL 壳/窗口归属与桌面 H3 被 Owner 2026-10-14 B 裁决后置到 `web-desktop-release`，当前 deferred。H3-preview 可按既有 `exitGame` 确认政策另票施工/复查；不得接现有 Electron 壳。
- 目标：未来独立桌面壳走可选共享退出端口与白名单适配；当前浏览器预览仅确认后反馈，绝不 `window.close()` 伪退出。
- 验收判据与分段归属：[写死合同](gal-eng-host-exit-01.md)。此票不授权修改 PUI、启动整套 ZeroCraft、远程发布或代签 Owner 人门。

#### GAL-ENG-HOST-EXIT-01-H3-preview · 浏览器预览退出反馈

- 状态：review（非施工者已签 Web 预览局部 PASS；桌面 H2/正式 Web 装配 E2E/S5/S6/Owner 人门不在本票范围）
- 施工主体：GAL 主程 `/root`（2026-10-14 领取并锁定）；仅 Web 预览消费，不触碰 H2、桌面 IPC 或 `src/ui/**`。
- 目标：以既有 `exitGame` 确认政策接通主页具名入口与 `exit-game` 确认窗；接受后仅反馈“预览不会关闭浏览器，桌面版由宿主处理”，不调用原生关闭、不能改变 World/手动槽/Profile。
- 验收判据：确认开/关、取消/Escape/遮罩、重复点击、回滚/读档/重开以及深亮审计均证明不误写状态；真实浏览器入口可达；定点测试、独立撤修验红。桌面端口缺失时仍为浏览器预览的诚实反馈，绝不假报真正退出。
- 允许改动：`src/services/gal-ui/**` 的闭集入口、确认与反馈、点名测试及本票证据。禁止改动：`src/ui/**`、`electron/**`、`src/services/platform/**`、冻结原型、资产或远程状态。
- 依据：[退出合同](gal-eng-host-exit-01.md) §3–4；[施工自证](self-check/GAL-ENG-HOST-EXIT-01-H3-preview-2026-10-14.md)、[独立复查](review/GAL-ENG-HOST-EXIT-01-H3-preview-2026-10-14-independent.md)。Owner 已将桌面 H2/H3 后置，未后置浏览器预览反馈。

### GAL-PIPE-01 · 创作产线后继阶段

- 状态：active（创作台三栏、素材库、角色引用、模型工具目录、文稿和逐句合同已有自检，等待独立复查；生图回传和组装未做）
- 施工主体：GAL 产线。计划见 [创作台](gal-authoring-flow-plan.md)。《庄园出逃》的正文和生图不在本计划内。
- 目标：创作台三栏、素材库、角色步、文稿/逐句草稿、模型工具目录、生图回传和确定性装配。
- 验收判据：每阶段真实证据及独立复查；模型只能产候选，不能自批；P0–P4 草稿局部 PASS 不算完整产线。
- 允许改动：对应产线合同、验证器、测试及经授权的本地工程文件。
- 禁止改动：猜写作项目协议、跳过人审、写远程数据库或推送远程 Git。
- 证据：`review/GAL-PIPE-01A.md`、[P1 研究](creation-p1-spec-research.md)、[路线图](../../projects/galgame-generation-engine/project-roadmap.json)。
- 已批准的 P1 角色按一部游戏写入同一个 `groups.json` 分组，关系只挂在起点角色上。生成时只读该组。已有档案或分组显示名冲突时不覆盖。立绘仍等 P5 审核。
- 《庄园出逃》当前批准是 `bible-3`、`routes-4`、`graph-3`、`beats-3`，逐句稿于 2026-10-16 由 Owner 批准。27 张图同日批准，来源为本机部署的 AI，只用于这部作品，未声明外部分发权。配乐不在该批素材中。

## 4. 阻塞与待 Owner 裁决

- `GAL-ART-01A` V2 确认弹窗的 310px 内框/30px 居中标题、推进 cue 位移/透明度、分支按钮 hover 强度/时长，Owner 已对[同批 A/B 单](gal-art-01a-modal-gap-2026-10-13.md)三项均选 A（PUI 通用受限视觉字段）；[PUI 通用接口独立复查](review/REQ-GAL-PUI-V2-VISUAL-independent.md)与 GAL 消费均仅局部 PASS，终图/完整 S5/S6 尚非 1:1。
- 04B-1 PUI 通用接口已获非施工者局部 PASS；GAL 消费施工中，仍须自证与独立复查。[GAL 消费验收约定](gal-ui-04b-1-consumer-contract-2026-10-14.md)写清 token/已读/显全门，具体缺口见[设置缺口单](gal-ui-04b-settings-gap.md)。局部 PASS 不等于完整 04B 或 Owner 人门。
- 作品级减少动态的 PUI 通用 policy 与 GAL Profile V7/恢复默认消费者均获独立局部 PASS；证据见 [PUI policy](review/REQ-GAL-PUI-MOTION-POLICY-01-2026-10-14-independent.md)、[PUI teardown](review/GAL-UI-04B-PUI-motion-teardown-2026-10-14-independent.md) 和 [GAL consumer 复验](review/GAL-UI-04B-reduced-motion-consumer-recheck-2026-10-14-independent.md)。完整设置、S5/S6 与 Owner 人门仍未签；[实查与判词](gal-ui-04b-settings-gap.md) 保留未接消费者边界。
- [GAL-ENG-HOST-EXIT-01](gal-eng-host-exit-01.md)的 H1 共享端口已局部 PASS；Owner 将缺少独立 GAL 桌面壳的 H2/桌面 H3 后置到发行阶段，当前浏览器不得假报第六类退出成功。H3-preview 是否可由既有确认政策重组，按合同另票验收。
- `media-and-final-skin` 尚有 [S5 差异](gal-art-01a-s5-diff.md)，未到控制台 Owner 人门。
- `GAL-ART-01A` 的两项缺口已由 Owner 分别选择 A（通用 Button 四态、可选回想图槽）；[裁决单](gal-art-01a-owner-ab-2026-10-13.md)保留原始 A/B。PUI 四态、GAL ghost 消费与回想图槽均获[局部独立复查](review/GAL-ENG-MEMORY-ART-01-independent.md)；[逐件审核包](gal-art-01a-owner-media-review-batch-2026-10-14.md)明确当前 demo 仅获模板开发/内部 Web 预览授权，首作内容与外部分发仍待逐件审美、来源、许可和发行范围裁决。剧情多分镜消费局部 PASS 不抵整票 S5/S6。

## 5. 证据索引

| 主题 | 权威文件 |
| --- | --- |
| 原型 | [V2](gal-ui-complete-v2.dc.html) |
| S5 视觉差异 | [差异单](gal-art-01a-s5-diff.md) |
| 设置局部复查 | `review/GAL-ART-01A-settings-controls-independent.md` |
| 存读档局部复查 | `review/GAL-ART-01A-slots-v2-independent.md` |
| 包/回滚/存档阶段 | `review/GAL-ENG-*.md` |
| 创作产线 P0–P4 | `review/GAL-PIPE-01A.md` |
| 项目状态 | [控制台路线图](../../projects/galgame-generation-engine/project-roadmap.json) |

## 6. 归档入口

- [旧需求与施工单全文](archive/requests-through-2026-10-12.md)仅供追溯，不作为当前施工授权；完成票的结论以各自独立复查报告为准。
