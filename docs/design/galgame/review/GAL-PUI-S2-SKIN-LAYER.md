# GAL-PUI-S2-SKIN-LAYER · 自检导航

范围仅 Panel/Button 无九宫格 skin：`skinSize:{x,y}`、`skinPosition:'center'`、`skinOutset:{x,y}`。默认 cover 与 skinSlice/skinBorderWidth 原样兼容。

- 最终定向：相关 UI 回归 46/46；Panel 内容 wrapper 曾破坏 column 布局，已改为 `isolation:isolate` + 皮层 `z-index:-1`，保持原始 children 的 row/column/grid 语义。
- 浏览器：`node tools/ui-audit.mjs tools/audits/gal-s2-skin-layer.audit.ts --w 720 --h 420`（exit 0）。
- 合同锚点：Panel `100% 160%`；Button `100% 220%` 与 `inset:-5px -8px`；旧 Button skin 仍输出 `center/cover`，skinSlice 仍走 border-image。
- 撤修：把 `skinLayer` 的 `inset:-${y}px -${x}px` 临时回退为 `inset:0`，S2 Button inset 断言必须转红；恢复后重跑。

独立复查：`GAL-PUI-S2-SKIN-LAYER-independent.md` 局部 PASS；不签 GAL 资产、原型或 S5 对拍。
