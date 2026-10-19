# GAL-ART-01A/S3 · 深图亮主题 Label 消费独立复查（2026-10-11）

**判词：本轮 GAL Label 消费局部 PASS；S3 整票 CONCERNS。** 本人非施工者，只复查 `src/services/gal-ui/gal-ui-art.ts` 对已登记 V2 深色原图上指定 Label 的受限 `color:{custom}` 消费及伴随回归。本票不签 Modal 内建标题色、亮色设置卡风格、S2 对话/按钮贴图尺度、S5 视觉 1:1 或项目里程碑。

## 独立核证

- 本会话已完整阅读 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/{index,game-production,ui,assets,art-pipeline,testing,self-check,review-gates,visual-scorecard}.md`、`docs/design/ui-playbook.md` 和 `module-ui`、`module-art`、`module-assets`、`check-ui`、`align-check` 技能。接受这轮局部施工：它仅在 GAL 纯 LayoutNode 消费层对原图上需读的 Label 指定受限颜色，无世界数据或 PUI 共享语义变更。
- 已阅读 PUI 独立复查 `GAL-PUI-LABEL-CUSTOM-COLOR-independent.md`：其局部 PASS 只证明 `{custom}` 类型/目录/校验合同，不代替 GAL 真图验收。本人独立执行 `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-story-03e.test.ts src/services/gal-ui/gal-ui-slots-structure.test.ts src/ui/components/label-custom-color.test.ts src/ui/components/skin-border-width.test.ts`，退出 0，5/5 文件、28/28 测试。`gal-ui-art.test.ts` 中 `validateLayoutNode` 对有图故事、设置、确认及其它页面均零 issue；无图回退和设置卡语义色断言通过。终端没有测试告警。
- 源码 `gal-ui-art.ts:85-98` 的 `DIALOGUE_INK` 与 `FRAME_INK` 只按指定 id 且相应原图已加载时生效；`:105-108` 给 Label 写受限 `{custom}`。设置卡内 `gal-settings-text-card-title` 不在白名单；无图同名 Label 保持原 `color:'text'`。`gal-ui-art.test.ts:127-143` 点名上述条件，确认正文 `gal-confirm-message` 单独着浅色，而 `Modal.props.title` 未获新字段。程序侧无自由 CSS/DOM。
- 纯内存撤修验红：先断言 `gal-ui-art.ts` 的剧情正文、设置标题、确认正文三条精确颜色锚点各唯一命中，再将三个值在 esbuild 内存编译副本置空。原版三处均产 `{custom:'#…'}`，破坏版三处均退回原 `text`，输出 `ANCHOR_HITS=3 SABOTAGE_RED=3 NO_ART_UNCHANGED=1 CARD_UNCHANGED=1`。没有改动生产文件。
- 独立短生命周期隔离 Chromium/Edge 访问本地 `file://` 临时静态构建，1440×900，深/亮各渲剧情普通、设置文字页、新游戏确认共六图；每态 5/5 UI 皮加载、破图 0、console/page warning/error 0。截图已目击后删除任务级临时目录，浏览器正常关闭；没有启动应用服务。

## 真图可读性实测与剩余差异

| 亮主题目标 | 浏览器 computed 前景 | 截图邻近无字背景代表点 / 对比估算 | 结论 |
|---|---|---|---|
| 剧情正文 `gal-story-text` | rgb(246,241,233)，27px | 约 14.57:1 | 浅字在深对话皮上清楚；比修正前深字可读。 |
| 章节 `gal-story-chapter` | rgb(227,212,167)，17px | 约 5.96:1 | 可读。 |
| 设置外框标题 `gal-settings-title` | rgb(246,226,181)，36px | 约 13.10:1 | 可读。 |
| 设置外框说明 `gal-settings-disclaimer` | rgb(198,200,220)，14px | 约 10.55:1 | 可读；亮色纸卡内标题仍随主题为 rgb(44,44,52)，未被改成浅字。 |
| 确认正文 `gal-confirm-message` | rgb(208,211,228)，22px | 约 12.15:1 | 可读。 |
| **Modal 内建标题 `gal-confirm-title`** | **rgb(44,44,52)，15px** | **约 1.26:1** | **未修、不可读；Owner 后续已选 S3 A，待 PUI 接口交付。** |

比值依据独立截图中邻近无字像素和 computed 前景按 sRGB/WCAG 公式估算；深图有纹理，这不是全区域最低值或机器 `ui-audit` 的正式逐字评级，但 1.26:1 的 Modal 标题失败与肉眼截图一致。深主题相应剧情正文 rgb(246,241,233)、设置标题 rgb(246,226,181)、确认正文 rgb(208,211,228)；本轮指定颜色不因 house 主题切换而变暗。`gal-ui-complete-v2.dc.html` 与真实截图对照仍可见设置卡亮纸色、按钮皮细条和对话皮缩放差异，故本 PASS 不扩张为原型视觉全对齐。

## 明确保留的裁决边界

- `gal-ui-structure.ts:344` 把“请确认”写入 `Modal.props.title`；PUI `render.ts:855-856` 内建标题固定用主题 `t.text`，GAL 子 Label 的 custom 色无法改变它，同时保留标题无障碍语义。此处属于 **S3 独立 A/B**，不能用本轮消费修正追认，也不能并入 S2。后续 Owner 已为 S3 选择 A，PUI 接口尚未交付，本票仍不签这部分。
- **S2** 仅为 V2 对话皮 100%×160% 和按钮/选项非 cover 尺度。后续 Owner 已为 S2 选择 A，PUI 接口尚未交付；此复查未实施或放行该能力。
- Owner 禁令下未执行任何 Git/GitHub 命令、数据库修改、应用服务启动或控制台签核；`scoped-gate.mjs` 涉 Git 未运行。局部测试通过不等于全库门禁绿。

## 追加独立复查：slots/gallery 外框 Label 白名单（同日）

**局部判词：外框 Label 消费 PASS；S3 整票仍为 CONCERNS，另有 S5 槽卡遮字 concern。** 这轮只复查 GAL 本地 `FRAME_INK` 对存读档/回想画廊外框标题、进度与底栏文字的扩写，不把 Owner 已选 A 但尚未交付的 PUI 接口算作成果，也不签 S5。

- 独立执行 `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-slots-structure.test.ts src/services/gal-ui/gal-ui-story-03e.test.ts src/ui/components/label-custom-color.test.ts`，退出 0，4/4 文件、17/17 测试，无测试告警。点名树验证包括有图 slots/gallery 的 `validateLayoutNode` 零 issue；`gal-slot-2-number`、无图槽卡原主题色断言保持。`gal-ui-art.ts:92-104` 只在系统框原图存在时按明确 id 上色，`:114-115` 是受限 `Label.color:{custom}` 消费，不触碰浅底卡片内文。
- 唯一锚点内存撤修：先断言 slots 标题、页码、gallery 标题、gallery 底栏提示四条 `FRAME_INK` 精确锚点各命中一次，再在内存副本将四个值置空；原版四 Label 均为 `{custom}`，撤修版四 Label 全退回 `text`。输出 `ANCHOR_HITS=4 SABOTAGE_RED=4 INNER_CARD_UNCHANGED=3 NO_ART_UNCHANGED=1`；未写生产文件。
- 独立隔离短生命周期 Chromium/Edge 只访问本地 `file://` 静态审计包，1440×900，复拍深/亮保存槽、读取槽、深/亮回想、深/亮 CG 画廊及一张坏槽图回退。浏览器 computed：slots 标题 `rgb(246,226,181)`、提示 `rgb(185,191,211)`、页码 `rgb(228,213,170)`；gallery 标题 `rgb(246,226,181)`、进度 `rgb(191,197,218)`、提示 `rgb(185,191,211)`、页码 `rgb(228,213,170)`，深亮两主题一致；截图目击均在深系统框上可读。亮主题浅底存档卡的编号/meta **computed 值**仍为主题深字 `rgb(44,44,52)`（但被皮图遮挡，见下一条），画廊浅底卡截图仍为深字，未被白名单涂浅。正常各态 console/page warning/error 为零；故意指向不存在槽图的回退态仅有预期 `net::ERR_FILE_NOT_FOUND`，没有脚本异常。浏览器均已关闭，两个任务级临时目录已清理；未启动应用服务。
- **S5 concern（实证）**：正常槽图存在时，`gal-slot-2-number`、`gal-slot-2-meta`、`gal-slot-2-state` 虽保留正确文字和原主题色，浏览器对三者中心 `elementFromPoint` 均返回 `gal-slot-2-skin`；深亮截图均看不到编号、meta、状态。坏槽图回退截图三者重新可见，且 `elementFromPoint` 回到各自 Label。根因指向 `gal-ui-art.ts` 注入覆盖 309×164 整卡的 `fit:'fill'` 皮图（`gal-ui-art.test.ts:120-121` 固化），不是本次外框色，也不在本轮改 S4 几何；S5 视觉/信息完整性不能因此签收。
