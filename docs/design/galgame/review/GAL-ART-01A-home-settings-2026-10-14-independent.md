# GAL-ART-01A 首页／设置 V2 增量独立复查（2026-10-14）

结论：**本轮指定消费局部 PASS；S5/S6 整体 CONCERNS。** 复查人与施工人不同。本单只核 `titleBackground` 首页投影和有图／缺 URL 分支、V2 首页与设置卡标题／卡面／数据驱动滑轨；不代签素材审批、Owner 人门或整页 1:1。

## 独立四步实证

1. **复跑**：在最终首页 `gap: backgroundSrc ? 14 : 18` 与说明独立锚位落盘后，定向 `npx vitest run src/services/gal-ui/gal-ui-read-model.test.ts src/services/gal-ui/gal-ui-art.test.ts --maxWorkers=1 --minWorkers=1` 为 **2 文件 30/30、退出 0**。此前独立跑全 `src/services/gal-ui` 为 **9 文件 91/91、退出 0**；`npx tsc --noEmit --pretty false` **退出 0、无诊断**（在最终说明锚位前，最终变动由定向测试覆盖）。定向测试点名不同当前剧情背景的标题背景、缺 URL 条纹回退、V2 卡片/轨道与 `validateLayoutNode` 零 issue（`gal-ui-read-model.test.ts:49-58`、`gal-ui-art.test.ts:107-156,177-201`）。首次普通沙箱执行 Vitest 遭 `node_modules/vitest/dist/spy.js` realpath EPERM、0 tests；允许的沙箱外复跑才是上述绿灯，不将 EPERM 记为产品失败。
2. **带锚点撤修验红**：只在内存读取并转译 `gal-ui-art.ts`，断言 `const progress = range.max > range.min` 精确命中 **1 次**。原版以 `Slider{value:30,min:0,max:300}` 得轨道填充宽 **32px**；内存突变为 `const progress = 0 && range.max > range.min` 后填充子节点由 1 变 0，要求“按值有填充”的断言转红。共享施工文件从未覆盖或还原。此对抗验证只证明本轮滑轨数据消费非死常量，不替代整页互动验收。
3. **真渲染及原型对照**：独立运行短生命周期 `verify-gal-art-live.mjs` 的 `home,settings-text` 深/亮 **4 画面，退出 0**；最终首页 gap 和说明锚位后又重截深/亮 **2 画面，退出 0**。脚本自清临时构建和浏览器；独立截图放在隔离 `%TEMP%\gal-review-1014\`，另目击仓库最终证据 `review/gal-art-01a-home-light-v2-home-final-1014.png`，未改原型或素材。以 1440×900 目击最终首页首键约 **y=368**，定稿 `gal-ui-v2-home.png` 约 **y=365**，背景取同一现有演示图、白标题和六键主列成立；说明固定在左下约 y=785，不随按钮列高度漂移。`gal-ui-v2-settings.png` 对照当前设置真图：卡片标题更粗、半透明卡和预览实底均可见，滑轨从先前全蓝改为按值短填充。真图数据为 **30 字/接入、500ms**，原型示例为 **60、3 秒**，不能以示例数值视觉宽度硬判同值；当前文字/页签/按钮状态亦不应伪称逐像素相同。
4. **读告警**：`node tools/ui-audit.mjs src/services/gal-ui/gal-ui-home.audit.ts` 与 `gal-ui-settings-text-light.audit.ts` 均退出 0；重叠、硬对比 `<3`、border-image 前提缺项皆 0。设置标题报告 **3.57:1** 的 3–4.5 警告；36px 大标题达到大字 3:1，但未达到普通正文 4.5:1。首页审计报告华丽件 **2**、house 主题“否”警告；该入口是 1060×760 的无 V2 资产夹具，**不能**拿它为 1440×900 V2 首页盖章。V2 真浏览器脚本只查资源完整性和截图，不做全页对比／遮挡自动审计，故仍需 S5 级完整审计。

## 指定增量判词

| 点位 | 实证与范围 | 判定 |
| --- | --- | --- |
| 首页标题背景投影 | `gal-ui-read-model.ts:214-215` 从 `pkg.ui.titleBackground → pkg.media.backgrounds[id].image` 得 key，与 `projection.backgroundAssetKey` 的剧情值分开；未声明或无映射不投影。单测以 `demo/title` vs `demo/current` 证隔离。 | 局部 PASS |
| 有图／缺 URL 首页 | `gal-ui-structure.ts:41-96` 只在 key 已解析 URL 时用全屏 `Image`、装饰暗罩、V2 文案／尺寸与独立左下说明锚位；否则留条纹占位和旧文案。`gal-ui-art.ts:193-204` V2 皮按钮 21px/700/52px，未载 V2 皮不强加。最终间距 14 只作用有图路径，回退仍 18。 | 局部 PASS；未测损坏但已解析的网络 URL 动态回退 |
| 设置卡与滑轨 | `gal-ui-art.ts:185-188,233-251` V2 标题 18px 粗体，卡片 `#0b1430ba` 金边、预览 `#172140` 金边，轨道 `(value-min)/(max-min)` 夹到 0..1；无 V2 frame 不加轨道。内存撤修和浏览器目击均支持“非恒满轨”。 | 局部 PASS；多取值 DOM 审计非本轮证据 |

## 不可吞并的偏差与范围

- 首页背景虽为与定稿图相同的演示场景，当前运行时在左下树／花枝、暗罩和字排视觉上仍与原型有差异；顶部 `GAL TEMPLATE / UI DEMO 02` 等微文案未见正式屏，菜单退出键因真实宿主未接而禁用，原型键的可用态不同。左下声明文案也非原型逐字。属于后续 S5／宿主状态对账，**本轮局部 PASS 不等于首页全像素 1:1**。
- 设置原型为三页图示、当前正式屏还有“确认窗口”第四页；卡片实景描边比原型更亮更金、内部数值与“快捷说明/恢复默认”待接入不同，不能以两张静态图宣布全设置 S5 完成。首页和设置脚本亦未覆盖完整按钮四态/焦点、跨页交互、完整 S6 动效序列。
- `tex/gal-demo-backdrop` 仍是模板验证素材，未替 Owner 批准首作最终审美、来源／许可和对外分发。`media-and-final-skin` 仍应保持 active，selfCheck/review pending、owner required；S5/S6 对齐单未收敛，不调用阶段 signoff 或把局部复查当整项通过。
