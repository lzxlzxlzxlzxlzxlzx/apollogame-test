# GAL-ART-01A 设置控件局部独立复查（2026-10-13）

结论：**局部 PASS，仅限四页签框皮与滑轨可见性的 GAL 闭集消费；S5 仍为 CONCERNS，不得作为 `media-and-final-skin` 或 Owner 人门 PASS。** 范围为 `gal-ui-settings.ts`、`gal-ui-art.ts`、`gal-ui-art.test.ts` 与 V2 原型。我不是代码施工者；本次仅修改此报告，不改施工代码、UI 基座或控制台。

## 独立实证

- 独立执行 `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts --maxWorkers=1 --minWorkers=1`，退出码 0，2 文件 **36/36**。首次默认沙箱因 `node_modules/vitest/dist/spy.js` realpath EPERM 而未执行测试；复跑才是有效结果。`gal-ui-art.test.ts:109-137` 已断言四页签皮/132×46、326×6 ProgressBar rail、Slider 宽 326、fallback/旧切片无 rail 及 `validateLayoutNode` 零 issue。
- **带锚点撤修验红**：在内存中读取 `gal-ui-art.ts`，断言精确锚点 `art.systemFrame?.slice === 115 && art.sliderKnob &&` 恰好命中 **1** 次；TypeScript 内存转译原版和将锚点改成 `false && art.sliderKnob &&` 的突变版，使用同一 `gal-setting-speed-control-shell` Slider 节点与 V2 frame/knob 数据。原版 rail 数 **1**，突变版 **0**，要求 rail=1 的断言会转红。未写入突变源文件。
- 独立目击 2026-10-13 01:50 生成的 `docs/design/galgame/review/gal-art-01a-settings-text-light.png`：1440×900 画面里四枚相邻纹样页签约占 x80–648、y179–234；两条轨道约 x294–620、y316–322 和 y370–376，拇指叠在轨道前端。比对 V2 静态图，位置/轨道可见性明显改善。核对 `gal-ui-complete-v2.dc.html:39-41`：原型运行时追加第 4 个“确认窗口”，旧截图不能裁数量。
- 独立执行 `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-settings-text-light.audit.ts` 和对应 `...-dark.audit.ts`，均退出码 0；重叠、硬对比、border-image 前提阻断均为 **0**。亮主题有 `gal-settings-title` 对比 **3.57:1** 的警告；暗主题有华丽度仅 1 命中、未见 house 主题皮的非阻断提示。绿灯不等于无视觉差异。

## 未闭差异（实渲目击）

1. 四页签数量和语义正确，当前也已有框皮；不过单项宽度、连续分隔、选中态与 V2 运行态尚未逐像素量化。当前截图与旧版“窄小 ghost”结论不再一致，旧结论撤回。
2. 两条 326px 轨道已在新截图中可辨，旧版“只有拇指”结论撤回。但拇指位置/数值比例、禁用态、拖拽交互仍未逐帧对齐 V2。
3. V2 Toggle 大约 74×31、淡紫开态及金线；当前实渲开态约 36×22、蓝灰底，禁用文字另占列，视觉及点击目标均未收敛。
4. 当前“快捷说明”为禁用、深绿厚钮；V2 为可见的紧凑“查看”轮廓钮。若尚未有说明能力，应保持诚实禁用，但需在 V2 原型中体现禁用状态或单列差异裁决。

## 复查边界与后续门槛

本报告使用项目新生成的 `file://` 隔离浏览器截图，不访问 Owner 日常浏览器；独立命令仅运行 Vitest、UI audit 和内存突变探针，均已退出，无常驻服务或浏览器。局部四步复查已齐，但没有完整四页/交互态 1:1、自证对齐归零或 S6 动画；不能推进里程碑至 `review`。施工文件或素材再变须重截重审；项目控制台由主施工者同步，Owner 人门不代签。
