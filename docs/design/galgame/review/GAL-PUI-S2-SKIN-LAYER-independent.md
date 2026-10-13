# GAL-PUI-S2-SKIN-LAYER · 非施工者独立复查

## 判词

**PUI 通用非九宫格皮图层合同局部 PASS。** 只放行 GAL 用闭集数据消费 `Panel/Button.skinSize`、居中定位与受限外扩；不签 GAL 原图 S5 对齐、音视频、动画或整项目里程碑。

## 独立证据 · 2026-10-11

- `skinSize:{x,y}` 受有限正数及上限校验，`skinOutset:{x,y}` 受有限非负 px 上限校验；仅非空、无九宫格 `skin` 可用，任意自由位置、缺皮、与 `skinSlice` 混用均拒收。原来的 cover 缺省、`skinSlice`/`skinBorderWidth` 九宫格路由不变。
- 初次独立真浏览器复查发现阻断：`Panel.skinOutset` 的 z=1 内容包装层让 `direction:'column'` 的原始 children 失去直接 flex 子项身份，正文和按钮挤成同一行。保留的复现脚本为 `verify-pui-s2-opaque-live.mjs`，初次 exit 1；PUI 随后移除包装层，改用 Panel `isolation:isolate` 与受控皮层 `z-index:-1`，不改子项结构。
- 修后独立用不透明皮分别运行 `node docs/design/galgame/review/verify-pui-s2-opaque-live.mjs column|row|grid`，三次 **exit 0**。column 量得正文 y=24、普通按钮 y=55、hero y=96、禁用键 y≈174；row 顺序 x≈24/177/261/403；两列 grid 第二行 y=65。三态的 Panel 皮层 z=-1、隔离 isolate，正文和 hero 副标在皮上可见，普通按钮中心属于按钮而左侧外扩 3px 不属于按钮，禁用键 `disabled=true`。隔离无头浏览器每次已关闭，截图分别为 `pui-s2-opaque-layer-{column,row,grid}-independent.png`。
- 修后独立复跑 `skin-layer-and-modal-title.test.ts`、`panel-skin.test.ts`、`button-shape.test.ts`、`modal-semantics.test.ts`、`catalog-validate.test.ts`：**5 文件 46/46，exit 0**。独立 S2 静态 UI 审计 720×420 exit 0：重叠、硬低对比、警告、border-image 前提均 0；华丽件 3 命中。真实浏览器检查与定向测试互补，不拿 HTML 字符串当视觉证明。
- 按 `check-ui` 交付门另独立复跑 `npx vitest run src/ui/components`：**68 文件、525/525，exit 0**；这覆盖其它共享控件的回归，但不替代 GAL 真实游戏对拍。
- `verify-pui-s2-s3-review.mjs` 使用唯一源码锚点的 esbuild 内存撤修：把外扩 inset 退成 0 后 S2 断言精确转红；旧 cover 和九宫格输出逐字不变，非法组合被校验拒收。输出 `ANCHOR_HITS=1+1 SABOTAGE_RED=2 LEGACY_UNCHANGED=3 VALIDATION_REJECTS=2`；另一锚点是 S3，未编辑生产源码。
- 独立 `npx tsc --noEmit` 整体 exit 1，诊断仅在既有 `game-card-reveal`、`game-dice`、`game-theft`、`src/launcher`，无本票 PUI/GAL 新诊断。未执行 Git/GitHub、数据库写入或应用服务启动。

## GAL 消费边界

GAL 现在可对剧情框填定稿 `100%×160%`，对普通/选项按钮填受限外扩和 `100%×220%/180%`，但必须再次按 1440×900 深亮真图测姓名、正文、按钮和选项的锚点及点击链。通用合同 PASS 不等于当前 demo 素材 1:1；有图失效回退与未读/已读、回滚改选仍需在 GAL 消费票单独复验。
