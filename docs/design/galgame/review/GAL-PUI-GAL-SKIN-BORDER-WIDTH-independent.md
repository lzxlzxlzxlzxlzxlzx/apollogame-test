# REQ-PUI-GAL-SKIN-BORDER-WIDTH · 独立复查（root，2026-10-11）

**最终判词：PUI 通用九宫格合同局部 PASS，可交 GAL 消费。** 初审为 CONCERNS，原因是缺少真实浏览器 computed 样式与盒尺寸；PUI 补证后由本人独立复跑收敛。复查人与 PUI 施工者不同；本单不签 GAL V2 整体 S5。

## 本人独立证据

- 在普通沙箱直接跑 7 文件 Vitest，`EPERM realpath .../vitest/dist/spy.js`、0 tests；两套 `ui-audit` 普通沙箱分别受 Vite `realpath` 和共用临时目录并发冲突阻断。已确认 `.ui-audit-tmp` 不存在，再以允许只读本地测试/短生命周期无头浏览器的隔离权限**串行**复跑，没有启动应用服务。
- `npx vitest run src/ui/components/skin-border-width.test.ts src/ui/components/button-shape.test.ts src/ui/components/panel-skin.test.ts src/ui/components/modal-semantics.test.ts src/ui/components/dialogue.test.ts src/ui/components/catalog-validate.test.ts games/game-i/game-i.test.ts`：退出 0，7/7 文件、69/69 测试。
- 深、亮两条 `tools/ui-audit.mjs` 静态夹具：各退出 0；重叠、硬低对比、3–4.5 告警、`border-image` 前提失败均为 0；各有 3 处贴图皮华丽件，house 主题命中。浏览器进程已退出。
- 自行阅读 `types.ts`、`catalog.ts`、`validate.ts`、`render.ts`：四类节点与主题按钮皮均有 `skinBorderWidth`；输出边宽要求正有限数并同时有非空 `skin` 与 `skinSlice`；省略输出宽时沿用旧 `skinSlice`。节点级皮/主题级皮优先级未在本单改写。
- 纯内存撤修脚本 `verify-pui-skin-border-width-review.mjs`：先断言 `render.ts` 中唯一目标表达式恰好命中 2 处；分别构建原版与在内存中将两处输出宽退回源边宽的版本，Panel、Button、Modal、dialog、主题皮五项均由 58/36 变为 115，旧 `skinSlice:8` HTML 保持相同。退出 0：`ANCHOR_HITS=2 SABOTAGE_RED=5 LEGACY_UNCHANGED=1`。未改生产文件。

## 初审 CONCERNS 与补证复核

初审时，工单要求的真浏览器角花裁边、内容安全区及边框盒尺寸未在审计报告中量化，因此暂缓放行。PUI 在 `tools/ui-audit.mjs` 增加可选 `--skin-measure id:source:width` 后，本人独立串行复跑两主题、三个目标：

- 深色：`node tools/ui-audit.mjs tools/audits/skin-border-width-dark.audit.ts --w 1060 --h 760 --skin-measure skin-width-dark-root:115:58,skin-width-dark-button:115:36,skin-width-dark-dialog:115:58`，退出 0。
- 亮色：`node tools/ui-audit.mjs tools/audits/skin-border-width-light.audit.ts --w 1060 --h 760 --skin-measure skin-width-light-root:115:58,skin-width-light-button:115:36,skin-width-light-dialog:115:58`，退出 0。
- 两主题均读得 Panel `slice=115,imageWidth=58,border=58×4,box=1040×418,content=924×302`；Button 为 `115,36,36×4,884×100,812×28`；dialog 为 `115,58,58×4,884×144,768×28`。三目标皆无重叠、低对比或 border-image 前提阻断。
- 审计守卫负例：把深色 Panel 预期故意写成 `115:57`，真实值仍是 `115:58`，审计退出 1 且仅报 1 个 9-slice 实测失败；证明新量测不是无条件绿灯。之后保留的生产代码与正确预期未改。

因此本票通用 CSS/浏览器边宽与内容盒合同可签**局部 PASS**。这一判词不证明 V2 的对话皮、伪元素按钮、槽卡背景缩放或亮色主题有图可读性；GAL S5 仍需用已登记原图逐屏对拍。

本复查未执行 Git/GitHub、数据库或控制台写入，也未启动应用服务。
