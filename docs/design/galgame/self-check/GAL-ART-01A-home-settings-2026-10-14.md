# GAL-ART-01A · V2 首页与设置增量自检（2026-10-14）

结论：局部自检通过，S5/S6 仍为 CONCERNS；不能替代非施工者复查或 Owner 素材/阶段人门。

- 架构判断：接受使用现有 `GalUiSpec.titleBackground`、媒体索引、`LayoutNode` Image/Panel/Slider 和既有 demo 背景。没有新增引擎能力、自由 DOM/CSS 或新美术资产；首页无 URL 仍走原条纹回退。
- 首页：定稿 1440×900 [原型](../gal-ui-v2-home.png) 对 [亮态实渲](../review/gal-art-01a-home-light-v2-home-final-1014.png)，夜景、亮标题、菜单层次已接入。首键约 y368 对原型 y365；底部审核说明锚点 y785，文案与原型演示文案不同，尚未宣称 1:1。
- 设置：[原型](../gal-ui-v2-settings.png) 对 [亮态实渲](../review/gal-art-01a-settings-text-light-v2-rail-1014.png)。卡片半透明深靛/金边和暗轨蓝色进度由闭集数据节点表达；进度跟随实际偏好值，不把 30ms/500ms 夹具值伪造为原型 60/3 秒。可交互 Slider 原生命中仍保留。页签、右上说明、底栏及字体未逐像素签核。
- 证据：`npx vitest run src/services/gal-ui` 为 9 文件、91 测试通过；`npx tsc --noEmit --pretty false` 退出 0；短生命周期 `verify-gal-art-live.mjs` 的首页暗亮 2 图及四个设置页签暗亮 8 图退出 0，浏览器及临时目录已关闭/清理。`ui-audit.mjs` 首页/设置文字页各退出 0、阻断 0；仍报设置标题 3.57:1 非阻断 WARN，待标题字号/实际背景判据独立复核。
- 保留项：demo 素材只准模板验证，首作审美/来源/许可/发行未批；首页按钮四态、设置全部页签与整页同画布、关键帧演出仍要逐项核验。本轮 `node scripts/scoped-gate.mjs --run` 退出 1：本地缺 `origin/claude/mainbranch` 参照，depcruise 仍报 32 条非 GAL 的 Life 等依赖违规（退出码 32）；不能声称全库绿，亦不改他域在途代码。
