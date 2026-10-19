# GAL V2 · S6 演出时序自证对齐单（2026-10-13）

基准 `../gal-ui-complete-v2.dc.html`；仅记录这轮已实测动画，不以 CSS 存在代替关键帧视觉/交互验收。

| # | GDD 承诺 | 结论 | 证据 / 说明 |
| --- | --- | --- | --- |
| 1 | 【V2】台词自下方 7px 淡入 240ms | ✅ | GAL V2 `layout.anim:'flyIn'`/bottom/7/240；暗亮真浏览器 `computedStyle.animationName=apollo-flyIn`、duration 0.24s，`verify-gal-art-live.mjs` 断言。 |
| 2 | 【V2】选择键入场 250ms、第二项再延迟 90ms | ✅ | `LayoutNode.repeat` 的确定序号投影填延迟 0/90ms；暗亮真浏览器 computed duration 0.25s、delay 0/0.09s，点名测试及浏览器断言。 |
| 3 | 【V2】推进提示符 1300ms 循环时透明度至 .35 并下移 4px | ✅ 局部 | Owner 选 A 后的 PUI `fx:cue` 已独立局部 PASS；GAL V2 有图路由消费，深浅真浏览器实测周期 1.3s，暂停到 650ms 时 computed opacity .35、translateY 4px。无图/旧切片不加 cue；GAL [增量独立复查](../review/GAL-ART-01A-v2-visual-2026-10-13-independent.md)局部 PASS。 |
| 4 | 【V2】按钮 hover/active 约 160ms 且亮化/下压，覆盖所有可点态 | ⚠ 待完整演出复查 | 20 屏×深浅 40 页实例的 [逐键审计](GAL-ART-01A-s5-s6-triage-2026-10-14.md)：270 个可见可点按钮均有 hover/pressed 变化，44 个禁用被记录、60 个模态下按钮仅经中心点 hit test 判为遮挡；六类全屏状态截图与逐屏 JSON 在 `../review/`。首页贴图键样例为 hover 1.32/8px、pressed 下移 2px；静态夹具不能证明完整四态、真实宿主跨页/焦点/全部模态出口。去向：报主程补真实动作链与键盘/模态出口探针，再送独立复查。 |
| 5 | 【V2】台词与选项关键帧顺序可目击 | ✅ 局部 | 暗亮真浏览器全屏序列：`../review/gal-art-01a-story-normal-light-frame-0120-frames-1014.png`、`../review/gal-art-01a-story-choice-light-frame-0120-frames-1014.png` 等。台词 0ms 为透明/y+7，240ms 完成；选项 120ms 第一项透明度 .663、第二项 .191，250ms 第一项完成、340ms 第二项完成；cue 650ms 为 .35/y+4、1300ms 回到 1/y0。仅签这条局部时序。 |
| 6 | 【V2】提示浮层 2200ms；演示自动推进间隔 2700ms | ✅ 局部 | GAL 复用既有 PUI Toast 而不在 LayoutNode 常驻反馈；宿主测试 2199ms 仍在、2200ms 自消，同一句再次触发会重显。偏好设为 2700ms 时调度 2699ms 不推进、2700ms 才推进；不覆盖其他合法包偏好。独立复查首次发现重显缺陷，修复后以唯一锚点内存撤修验红、基线 30/30 再绿，局部 PASS；仍需真浏览器完整操作链，不代表全部 S6 完成。 |

第 2 轮：提示节拍和分支键反馈已在真浏览器核算。第 3 轮：40 页逐键状态与台词/选项全屏关键帧、2200/2700ms 定点测试；仍有 ⚠ 1（真实宿主完整动作链与独立复查）。`S6` 尚未完成，不送 Owner 人门。隔离浏览器已关闭，未运行整套系统。
