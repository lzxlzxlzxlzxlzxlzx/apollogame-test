# GAL-PUI-GAL-SKIN-BORDER-WIDTH · 九宫格显示边宽分离 · 自检导航

## 范围与结论

`REQ-PUI-GAL-SKIN-BORDER-WIDTH` 的 PUI 基座闭集扩展已完成自检，结论为 **待独立复查**。

- 新字段：`skinBorderWidth?: number`。
- `skinSlice` 始终是原图的 `border-image-slice`；有 `skinBorderWidth` 时，它单独控制 CSS `border-width` 与 `border-image-width`。
- `Panel`、`Button`、`Modal`、`dialog` 及主题 `buttonSkins` 均消费此字段。
- 仅提供旧 `skinSlice` 时，输出仍使用该值作为显示边宽，维持旧 HTML/CSS 语义。
- 无皮或不完整皮合同仍沿用原有 cover/无皮路径；无效、非正、非有限或脱离非空 skin/skinSlice 的显示边宽会被 `validateLayoutNode` 拒收。

本单只交付通用 9-slice 能力；不签署 GAL V2 原型整体 1:1、`background-size`、伪元素装饰按钮或槽位卡等非九宫格处理。

## 施工文件

- `src/ui/components/types.ts`
- `src/ui/components/render.ts`
- `src/ui/components/validate.ts`
- `src/ui/components/catalog.ts`
- `src/ui/components/skin-border-width.test.ts`
- `games/game-i/gallery.ts`
- `games/game-i/game-i.test.ts`
- `docs/playbooks/ui.md`
- `tools/audits/skin-border-width-dark.audit.ts`
- `tools/audits/skin-border-width-light.audit.ts`

## 已复跑证据

```text
npx vitest run src/ui/components/skin-border-width.test.ts src/ui/components/button-shape.test.ts src/ui/components/panel-skin.test.ts src/ui/components/modal-semantics.test.ts src/ui/components/dialogue.test.ts src/ui/components/catalog-validate.test.ts games/game-i/game-i.test.ts
```

退出码 `0`：7 files / 69 tests 通过。

```text
node tools/ui-audit.mjs tools/audits/skin-border-width-dark.audit.ts --w 1060 --h 760
node tools/ui-audit.mjs tools/audits/skin-border-width-light.audit.ts --w 1060 --h 760
```

退出码 `0`：两套审计均为 0 重叠、0 硬对比失败、0 `border-image` 前提失败；审计所用浏览器为短生命周期进程，已退出，未启动应用服务。

### 补充：真实浏览器 9-slice 量测（复查 CONCERNS 修复）

`tools/ui-audit.mjs` 新增可选 `--skin-measure id:source:width`：在真浏览器内读取 computed `borderImageSlice`、`borderImageWidth`、四边 `border-*Width`、border-box 和内侧内容安全区。任一值不符、元素缺失或内容区塌成零时，审计以非零码失败。

```text
node tools/ui-audit.mjs tools/audits/skin-border-width-dark.audit.ts --w 1060 --h 760 --skin-measure skin-width-dark-root:115:58,skin-width-dark-button:115:36,skin-width-dark-dialog:115:58
node tools/ui-audit.mjs tools/audits/skin-border-width-light.audit.ts --w 1060 --h 760 --skin-measure skin-width-light-root:115:58,skin-width-light-button:115:36,skin-width-light-dialog:115:58
```

退出码均为 `0`。深、亮主题量到的值相同：Panel 为 `slice=115 / imageWidth=58 / borders=58×4 / box=1040×418 / content=924×302`；Button 为 `115 / 36 / 36×4 / 884×100 / 812×28`；dialog 为 `115 / 58 / 58×4 / 884×144 / 768×28`。因此源角花裁边仍为 115px，而显示边宽、外框盒与可放内容的内侧空间按 58px 或 36px 生效。

## 撤修验红

唯一锚点是 `src/ui/components/render.ts` 的 `skinCss` 与 `panelSkinCss`：暂将两处

```ts
const w = borderWidth === undefined ? s : num(borderWidth);
```

替换为 `const w = s;`。当时该定向文件有 10 项，运行 `npx vitest run src/ui/components/skin-border-width.test.ts` 后精确出现 5/10 失败：Panel、Button、Modal、dialog 和主题按钮皮均把 58/36 错渲为 115。其后补入“有 `skinSlice` 但无非空 `skin`”的脱离皮反例，最终文件为 11 项；恢复锚点后为 11/11 通过，随后全套定向回归为 69/69。

## 独立复查步骤

1. 不采信本文结论，先独立运行上述 7-file Vitest 命令与两套审计。
2. 阅读 `skin-border-width.test.ts`，核对 115/58、115/36、旧 `skinSlice:8`、主题继承与坏值边界。
3. 重做撤修：仅把两个 `const w` 回退为 `s`，确认五个指定合同断言转红；恢复后复跑。
4. 核对未改 GAL 消费、资产索引或 V2 原型；若通过，仅为此 PUI 能力给出 PASS/FAIL，不扩大为 GAL 全皮肤验收。
