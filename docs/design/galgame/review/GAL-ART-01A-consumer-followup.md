# GAL-ART-01A 消费侧续票独立复查（2026-10-11）

**判词：CONCERNS；GAL-ART-01A/S2 与 S3 分票待 Owner 裁决。** 本人不是本票施工者；只写本复查单，未修改 GAL 实现、PUI 基座、资产索引、原型或其它 Review。系统框 115 源切边 / 58 显示边、确认框 115 / 36，以及槽卡全幅 `Image.fit:'fill'` 的局部消费合同通过。S2 仅处理定稿 V2 的对话皮 100%×160%、按钮伪元素 100%×220%（选项 180%）与当前 cover/九宫格闭集不等价的问题；S3 另处理亮主题在深色原图上的正文与标题低可读性。两票不能合并裁决，亦不得宣称 GAL S5、V2 视觉 1:1 或项目里程碑完成。

## 独立核证

- 完整阅读本会话的 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/{index,game-production,ui,assets,art-pipeline,testing,self-check,review-gates,visual-scorecard}.md`、`docs/design/ui-playbook.md`，以及 `module-ui`、`module-art`、`module-assets`、`check-ui`、`align-check` 技能。复查遵守 Owner Git/数据库/服务禁令。
- 独立运行 `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-story-03e.test.ts src/services/gal-ui/gal-ui-slots-structure.test.ts src/ui/components/skin-border-width.test.ts`：退出 0，4/4 文件、24/24 测试。首次运行期间施工方并发试用 `Label.color:{custom}`，校验器报 `bad-enum`，25 项中 3 项红；施工方撤回后由本人重跑转绿。此首次红灯作为下述闭集不一致的实证，不能倒写成从未发生。
- 独立短生命周期 Chromium/Edge 访问本地 `file://` 静态临时构建，无应用服务：1440×900；每页五张 UI 原图均加载、破图 0。`slots:dark` 的 `gal-slots-shell` 包围盒 x18/y60、1404×830，computed `border-image-slice:115 fill`、上边宽 58px；`gal-slot-2-skin` 307×164，computed `object-fit:fill`。`story-normal:dark/light` 对话框 x20/y555、1398×343；dark 正文颜色 rgb(231,237,243)，light 为 rgb(44,44,52)，章节标题同样从浅色变为深墨。浏览器已关闭，任务级临时构建已清除。
- 源码 `gal-ui-art.ts:28-46` 从稳定 key/已登记 URL 得到五件皮，缺失不接；`:97-116` 给三类系统大框 115/58、确认框 115/36，并使无图/显式旧 slice 不吃新边宽；`:98-104` 给槽卡首层 Image `fit:'fill'`，预览和动态文案仍是 LayoutNode。`gal-ui-art.test.ts:108-125` 点名缺图回退、锁定 CG 不泄 URL、旧显式 slice 与槽卡动作。仅本票消费字段的静态核证，不替代全部交互验收。
- 纯内存撤修验红：先断言 `gal-ui-art.ts` 的大框边宽、确认边宽和槽卡 `fit:'fill'` 三个锚点各恰命中 1 次；用 esbuild 在内存分别编译原版与删除边宽/改 `fit:'cover'` 版，原版得到 `[58,36,"fill"]`，破坏版得到 `[undefined,undefined,"cover"]`（JSON 打印为 `[null,null,"cover"]`）。`ANCHOR_HITS=3`、`SABOTAGE_RED=3`；未修改生产文件。

## V2 对拍与未收敛项

| 项 | 独立证据 | 判定 |
|---|---|---|
| 系统/确认框 | 上述真实浏览器 computed 115/58；`gal-ui-art.test.ts:75-100` 断言确认 115/36。V2 源规格 `gal-ui-complete-v2.dc.html:17,21`。 | 本次闭集接线局部 PASS；不代表框内画面 1:1。 |
| 槽卡 | V2 `.slot` 用 `100% 100%`（原型 `:18`）；现有 Image `fit:'fill'` 真渲 307×164。对照 `gal-ui-v2-save.png` 与 `review/gal-art-01a-slots-dark.png`：源卡纹样已铺满但运行时预览大块深底覆盖纹样，已存/空槽动态内容和按钮视觉尚不同。 | 尺度可重组；整体槽卡视觉 CONCERNS。 |
| S2 · 剧情皮/按钮尺度 | 原型 `:13,15-16`：对话皮 100%×160%，按钮伪元素外扩 -5/-8 且 100%×220%，选项 180%。`render.ts:263-286` 当前 Panel/Button 仅 cover 或九宫格，`types.ts:293-304` 同合同；`Image.fit:'fill'` 只给 Image（`:363`），Button 无 children。对照 `gal-ui-v2-dialogue.png` 与 `review/gal-art-01a-story-normal-dark.png`，图虽加载，按钮显著变成细条、对话皮文字/花纹的相对位置和字号观感不等。 | 真表达缺口，等待 S2 的 Owner A/B；不可用自由 CSS/DOM 逃生。 |
| S3 · 亮主题可读性 | `review/gal-art-01a-story-normal-light.png` 的深色原图上正文/章节标题肉眼极暗；独立浏览器分别量到 `rgb(44,44,52)`，而 dark 同点为 `rgb(231,237,243)`。`review/gal-art-01a-settings-text-light.png` 的深色框皮又叠亮主题纸色设置卡，视觉风格明显偏离 `gal-ui-v2-settings.png` 的深蓝卡。 | 实见视觉阻断；独立于 S2，须另票裁决，不能凭测试绿签 S5。 |

## 闭集实查与告警

- **S3 / PUI 既有缺陷：** `types.ts:189-199` 明示 `LabelColor = ColorToken | {custom:string}`；`render.ts:378-381` 会解析并净化 `{custom}`，`catalog.ts:124` 的描述也称可用。但同一 catalog 把 `color` 定成 `type:'enum'`，`validate.ts:69-72` 对任何对象按 `String(v)` 检 enum，造成 `color='[object Object]' bad-enum`。这不是 GAL 自己可安全绕过的输入；施工方试验已撤回。该类型/目录/校验不一致是 PUI 已有 bug，不能追溯并入 S2 贴图尺度票。
- **S3 / 独立 A/B：** `gal-ui-structure.ts:344` 的确认框标题放在 `Modal.props.title`；`render.ts:845-865` 把该内建标题写死为 `t.text`，没有节点级 `Label.color` 槽。亮主题深色原图的此处不能靠 GAL 给子 Label 填色解决；Modal 标题色表达路线需单独摆 A/B 由 Owner 裁，不追溯并入 S2。
- 未执行 `scoped-gate.mjs`：其流程涉及被 Owner 明令禁止的 Git 操作。未执行 Git/GitHub、数据库写入、应用服务启动或控制台签核；本地静态浏览器验收已关闭清理。以上局部 24/24 与浏览器证据不等于全库门禁绿。

**交回施工方/Owner 的分票决定点：** `docs/design/galgame/requests.md` 中 `GAL-ART-01A/S2` 的 A/B 只针对对话/按钮的非 cover 贴图尺度，不含颜色。亮主题另列 `GAL-ART-01A/S3`：PUI 既有 `Label.color:{custom}` 校验 bug 需按其归属修复；Modal 内建标题色须另摆 A/B 供 Owner 裁决，并连同深图上亮主题文字/卡面可读性做真渲复验。S2 与 S3 未分别获裁、复查前，本票仅局部消费 PASS，整体视觉 CONCERNS。
