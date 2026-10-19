# GAL-PUI-S4-BUTTON-LABEL-COLOR · Lead 独立复查

判词：**PUI 通用 `Button.labelColor` 合同局部 PASS；GAL 消费与 V2 S5/S6 仍未签。** 复查人不是 PUI 施工人。本判词仅放行 GAL 在纯 LayoutNode 数据中消费此字段。

## 实证

- 独立复跑 `npx vitest run src/ui/components`：68 文件、528/528 通过，退出 0；点名的 `skin-layer-and-modal-title.test.ts` 包括自定义色、语义色、非法值、缺省和原生 Button 行为。
- 独立运行 `node tools/ui-audit.mjs tools/audits/gal-s4-button-label-color-{light,dark}.audit.ts --w 720 --h 420`（分别执行）：两个静态 `file://` 真浏览器审计均退出 0，重叠、硬性低对比、border-image 前提各为 0；短生命周期浏览器已退出。两份最小合同夹具的「华丽度 0」仅是非阻断提示，不代表 GAL 成品画面。
- 独立运行 `node docs/design/galgame/review/verify-pui-s4-button-label-color-lead.mjs`：`ANCHOR_HITS=1 SABOTAGE_RED=2 LEGACY_IDENTICAL=4 INVALID_REJECTED=4`，退出 0。脚本在 esbuild 内存副本中精确移除唯一 `labelColorStyle` 锚点，不改共享源码；custom 与 token 两种显式输出均转红，四种未填新字段的旧 Button（ghost、贴皮、hero、disabled）HTML 在正常/撤修版本字节一致；裸色、空 custom、注入和额外键均被校验拒收。
- 核对 `types.ts`、`catalog.ts`、`validate.ts`、`render.ts`：新字段复用既有 `LabelColor` 与 `enum-or-custom-color` 安全合同；只有显式填值才在最终按钮样式追加颜色。`<button>`、`data-action`、原生 `disabled`、node/theme 皮图与显式 `skin:''` 路径未被替换成游戏侧 DOM/CSS。UI 手册及 game-i 样例已回填。

## 边界与告警

`npx tsc --noEmit` 仍有施工者报告的 card-reveal、dice、theft、launcher 既有诊断；本次独立复查未把全库类型检查宣称为绿。PUI 局部 PASS 不证明 GAL 的夜景工具栏已经接线或与 V2 1:1；GAL 须单独做深浅 1440×900 真图、真实按钮动作/禁用态及独立消费复查。未执行 Git/GitHub、数据库写入或应用服务启动。
