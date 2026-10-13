# GAL-ART-01A · S2/S3 GAL 消费与槽卡叠层独立复查（2026-10-11）

**判词：S2/S3 GAL 消费与本地槽卡叠层修正局部 PASS；S5 视觉 1:1 仍 CONCERNS。本单不签 S5/S6 或项目里程碑。** 本人不是施工者，只复查最终候选 `src/services/gal-ui/gal-ui-art.ts` 及伴随测试；PUI 的 S2 `skinSize/skinOutset`、S3 `Modal.titleColor` 通用合同另有非施工者局部 PASS（`GAL-PUI-S2-SKIN-LAYER-independent.md`、`GAL-PUI-S3-MODAL-TITLE-COLOR-independent.md`），本单不代签共享 PUI。

## 独立核证

- 已在本会话完整阅读 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/{index,game-production,ui,assets,art-pipeline,testing,self-check,review-gates,visual-scorecard}.md`、`docs/design/ui-playbook.md`，以及 `module-ui`、`module-art`、`module-assets`、`check-ui`、`align-check` 技能；本轮重读两份 PUI 独立复查和 `gal-ui-complete-v2.dc.html` 中 `.art-button`、`.ghost`、对话框、存档槽与确认层规格。需求判断为接受 GAL 局部闭集消费复查：未发现需要游戏层自由 CSS/DOM 或新共享接口的理由；S5 未对齐项仍须另裁。
- 最终候选独立运行 `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-slots-structure.test.ts src/services/gal-ui/gal-ui-story-03e.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts src/services/gal-ui/gal-ui-read-model.test.ts src/ui/components/skin-layer-and-modal-title.test.ts src/ui/components/label-custom-color.test.ts src/ui/components/panel-skin.test.ts src/ui/components/button-shape.test.ts src/ui/components/modal-semantics.test.ts src/ui/components/catalog-validate.test.ts`，**11/11 文件、98/98 测试，exit 0**，无测试告警。首次默认沙箱曾在 `node_modules/vitest/dist/spy.js` `realpath` 遭 EPERM、没有运行测试；提权纯本地复跑后全绿，不将前者误记为断言失败。`gal-ui-art.test.ts` 对有图树执行 `validateLayoutNode` 零 issue，覆盖 S2 尺度、S3 标题色、旧 slice、无图回退和槽卡内容。
- **唯一锚点内存撤修验红**：在 `gal-ui-art.ts` 对剧情 `100×160`、选项 `180`/普通 `220`、Modal 标题色、story ghost 空皮、对话框 `1400×345`、槽卡 positioned content、No/meta 坐标、SYSTEM 金字共九条精确源码锚点分别断言唯一命中后，逐一只在 esbuild 内存副本撤修。九项原版断言通过、九个撤修版各自转红，输出 `ANCHOR_HITS=9 SABOTAGE_RED=9 GHOST_IDS=8 OLD_SLICE_UNCHANGED=1 NO_ART_UNCHANGED=1`。未改生产文件。
- 独立短生命周期隔离 Chromium/Edge 只访问临时 `file://` 静态包，**1440×900、17 状态×深亮=34 张**，涵盖 home、choice/普通剧情、存读档、设置四页、回想/CG、五类可执行确认及坏槽图回退；浏览器均关闭，未启动应用服务。正常 32 态 `console/pageerror` 为零，坏槽图两态仅有故意不存在 URL 的预期 `net::ERR_FILE_NOT_FOUND`，没有脚本异常；正常 5/5 UI 皮通过预检，坏图为 4/5。已目击真图而非只检查 HTML 字符串。

## 逐项对照 V2 与交互

| 项目 | 独立实测 | 局部结论 |
|---|---|---|
| S2 剧情皮 | 深亮 `gal-story-dialogue` 均为 `[20,555,1400,345]`，浏览器 `background-size:100% 160%`；正文/人名浅字在夜色原图上可读。无图和显式旧 `slice` 仍保留原 `1398×343` 数据与旧渲染路由。 | PASS；与 V2 `.story-dialogue` 的主锚点/皮图比例一致。 |
| S2 art-button 与 ghost | 两个选项为 `[365,296/377,710,66]`、皮层 `100% 180%`；普通 art-button 皮层 `100% 220%`、外扩 `8px/5px`。七个 story 顶部 ghost 与 `gal-replay-exit` 明确 `skin:''`，未误消费 art-button；旧 slice 按旧路由。 | 闭集选择/尺度 PASS；ghost 亮主题可读性单列 S5 concern。 |
| S3 确认 | `new-game`、`save-empty`、`overwrite`、`load`、`return-title` 五类均在深亮图上显示金色内建标题 `rgb(245,223,173)` 与浅正文；`aria-labelledby=gal-confirm-title` 保留，确认/取消均可命中。未将宿主“退出游戏”冒充可执行确认。 | 局部 PASS；内建标题不再沿亮主题深色。 |
| 槽卡叠层 | 正常有图时 `gal-slot-2` 外框 `[405,238,309,164]`；No、meta、state 的中心 `elementFromPoint` 各返回自身，深亮图均看得见，中心点击仍落在可操作槽卡内。预览的深底、浅字与装饰图共存；坏图回退不注入皮图/重排，保留主题原色。 | 原先“整幅 Image 遮字”已修，局部 PASS；底部纹样附近细节留 S5。 |
| 关键路径 | 最终静态浏览器中 choice `gal-choice#yes`、回想入口 `gal-memory-play-memory-1`、槽卡 `gal-slot-2` 的中心均在各自可操作元素内；普通剧情框中心在剧情框子节点内。`gal-ui-slice-host.test.ts` 独立 25/25 覆盖点击推进、选择/回滚改选、隔离 replay、槽位存读档与确认。 | 命中/纯本地交互回归 PASS；静态夹具无真实持久化，不把它当完整游戏自玩。 |

## S5 明确保留的差异与告警

- **亮主题 story ghost 严重暗字**：空皮避免了错误绿糖果皮，但截图中七个顶部导航文字直接压在夜景上，`gal-story-save` computed 为 `rgb(90,85,96)`（深主题为 `rgb(126,140,155)`），亮主题肉眼很难辨认；V2 `.ghost` 有半透明深底和浅字。此处仍是可读性/视觉表达缺口，不能因 S2 尺度 PASS 而签 S5。策划侧 Owner A/B 待决，不在本 Review 越界补 PUI 或改定稿原型。
- **设置页与 V2 仍有结构/皮肤差异**：SYSTEM 标签经本轮 `FRAME_INK` 在深亮均为 `rgb(246,226,181)`、可读，但顶部导航在亮主题仍呈绿色糖果按钮并换行；双设置卡为亮纸色，V2 为暗玻璃卡；说明/预览区域与 V2 也未 1:1。确认框内建标题虽已可读，真实尺寸约 15px 且左对齐，V2 `.overlay-panel h3` 为居中 30px，属于 S5 几何/风格差异。
- **槽卡由遮字变为可读，但未达 V2 细节 1:1**：最终 No 为 `[434,259]`、meta `[423,370]`、state `[617,370]`；动态文字不再被图层压住，但截图底部 meta 靠近花饰和边框，仍需与 V2 的 `.slot-index`、`.slot-meta` 精修对照。此处不得用局部叠层 PASS 宣称全部槽卡 1:1。
- `npx tsc --noEmit` 独立检查曾 exit 1；诊断文件仅 `games/game-card-reveal`、`games/game-dice`、`games/game-theft` 和 `src/launcher/game-runner.tsx`，GAL/PUI 相关诊断 0。该次类型检查早于最终槽卡微调，因此本单不声称最终全库类型门禁已绿。未执行 Git/GitHub、数据库修改、应用服务启动或控制台签核；`scoped-gate.mjs` 涉 Git 未运行。
