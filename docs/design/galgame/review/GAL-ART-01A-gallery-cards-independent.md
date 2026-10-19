# GAL-ART-01A 画廊卡片局部独立复查（2026-10-13）

复查主体：`/root/gal_gallery_cards_review`，非施工者。判词：**CONCERNS（局部几何与闭集消费通过；V2 视觉未 1:1）**。仅覆盖画廊 memory 卡与 CG 卡，不替代 GAL S5/S6、全库门禁或 Owner 人门。

## 独立实证

- `npx vitest run src/services/gal-ui/gal-ui-art.test.ts --maxWorkers=1 --minWorkers=1`：退出 0，14/14。沙箱内首次运行因 `node_modules/vitest/dist/spy.js` `realpath EPERM` 导致 0 tests，随后在本地越沙箱复跑成功，前者不计作通过。
- `node tools/ui-audit.mjs src/services/gal-ui/gal-gallery-v2-light.audit.ts` 与 dark 对应命令：均退出 0；每套报告 26 个带 id 的绝对定位元素、0 重叠、0 对比硬失败、0 对比警告、0 border-image 前提缺失，4 处 skin 华丽件。审计是临时构建加短生命周期浏览器，执行结束无常驻服务/浏览器。入口分别见 `src/services/gal-ui/gal-gallery-v2-{light,dark}.audit.ts:1-14`。
- 带锚点的**纯内存撤修验红**：Vite pre-transform 只处理 `src/services/gal-ui/gal-ui-structure.ts`，断言精确锚点 `layout: { height: 149, padding: 0 }` 命中恰好 1 次，再将 149 临时换为 210。结果 `SABOTAGE_ANCHOR_HITS=1`，测试退出 1，14 条中 1 条按预期转红，断言位置 `src/services/gal-ui/gal-ui-art.test.ts:178`。未改动磁盘上的实现。
- 代码对账：V2 仅在 `systemFrame.slice === 115` 且 memories tab 使用专属卡 (`src/services/gal-ui/gal-ui-structure.ts:156-173,207-210`)；CG 卡仍保留动态素材/解锁点击 (`:210-235`)；V2 深色覆盖由 `src/services/gal-ui/gal-ui-art.ts:191-197` 提供，测试检验无图回退/旧切片保留 (`gal-ui-art.test.ts:161-182`)。

## 同画布视觉复核

- 对照 `docs/design/galgame/gal-ui-v2-memories.png` 与 `docs/design/galgame/review/gal-art-01a-gallery-cards-memories-light.png`（以及施工暂存截图 `C:/Users/24652/AppData/Local/Temp/gal-gallery-cards-v2-20261013/gal-art-01a-gallery-memories-light.png`）：六卡的 2×3 网格、约 629×150 的卡片外框与 V2 锚位基本相符；已解锁标题、重播动作和未解锁态可见。**仍不 1:1**：V2 卡片是带场景纹理的低对比蓝金薄边，当前是均匀深蓝填充与醒目金边；V2 大号标签/标题/提示的字重、间距与按钮呈现也不同。`gal-ui-structure.ts:156-173` 仍用文字“场景素材待入库”，没有 V2 的场景纹理。
- 对照 `docs/design/galgame/gal-ui-v2-cg.png` 与 `C:/Users/24652/AppData/Local/Temp/gal-gallery-cg-geometry-20261013/gal-art-01a-gallery-cg-light.png`：3×2 外框、首格已解锁图像与题注位置接近；其余 V2 已解锁图（第 2、3 格）在当前 audit fixture 中无内容，不能据此断言资产消费错误。锁定格的模糊剪影/星号背景与 V2 显著不同，当前为纯色矩形和文字。首格图像宽高/裁切接近，但卡片边色和底色偏重。当前代码的 CG 静态图缺口/锁态见 `gal-ui-structure.ts:217-232`。
- 上述暂存截图在最后一次 `gal-ui-art.ts` 字色调整之前生成；只能证明当时的几何和内容。**最近字色的逐像素视觉结果尚未由本复查新截图证明**，但亮/暗 UI 审计与单测是在调整之后独立复跑的。

## 边界与后续裁决

本次认定 V2 memory 卡结构、真实动作和局部 UI 卫生通过；S5 视觉未结案。需继续用已批准素材与闭集槽收敛场景纹理、细边、锁定剪影与文字层级，并在最新代码上留同画布截图重新复查。不得把本局部 CONCERNS 写成 `media-and-final-skin` done 或代替 Owner 人门。
