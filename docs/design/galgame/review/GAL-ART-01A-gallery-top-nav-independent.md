# GAL-ART-01A · V2 图库顶栏四入口独立复查（2026-10-13）

结论：**局部 PASS；整项 S5/S6 仍 CONCERNS，不得提 Owner 人门。** 复查人与施工者不同；仅核图库 V2 顶栏、宿主路由与底栏重复入口。共享工作树中的其他改动未触碰。

## 独立实证

- 1440×900 定稿原型的图库顶栏为 `✧ MEMORIES` 与主页／剧情／存档／设置四入口。当前纯 LayoutNode 实现锚在 `gal-gallery-topbar` x84、y16、宽1272；四按钮向右排列、位于框体 y61 上方。真浏览器 `file:` 静态构建 34 态审计退出 0，图库明暗截图在隔离目录 `C:\Users\24652\AppData\Local\Temp\gal-topnav-independent-20261013`；临时构建及浏览器均已关闭。截图目击顶栏位置正确、无框体遮盖，仍与原型的按钮质感/尺寸有差异。
- `npx vitest run src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts --maxWorkers=1 --minWorkers=1` 独立复跑 **41/41 绿**。路由实证覆盖：无剧情时剧情入口不可用；设置返回图库；存档为 save 并能回来源页；从剧情来源回主页遵守 `returnTitle` 确认，取消后可返剧情，关闭确认政策后直达主页；离开图库后同名动作不生效。V2 底栏旧设置入口已去重，无图/旧切片保留该入口。
- `node tools/ui-audit.mjs src/services/gal-ui/gal-gallery-v2-light.audit.ts` 及 dark 均退出 0：各 27 个定位元素，重叠 0、硬对比失败 0、3–4.5 对比警告 0、皮肤前提失败 0、house 主题与 4 处 skin 命中。审计尺寸为 1060×760，真浏览器截图另核 1440×900。
- 锚点撤修验红：隔离临时 Vitest 文件先断言 `gal-gallery-home` 存在且 action 为 `gal.gallery.nav`，再只在内存将 action 改为 `gal.gallery.back`，同断言 **1/1 红**（expected `gal.gallery.nav`, received `gal.gallery.back`）；临时文件已删除，生产源未改。施工者去重后独立测试一度 40/41 红，定位旧断言仍要求 V2 底栏设置；施工者修正断言后复跑 41/41 绿，且核 plain/legacy 回退。

## 范围与未闭差异

本票只证明顶栏四入口的布局与页面动作及无重复设置入口，不证明整页 1:1。截图仍有未获 CG/回想场景资产、锁定剪影、按钮纹样/质感与 V2 原型差异；关键帧动画时序也未在本票验收。保持 `media-and-final-skin` active、里程碑自检/复查 pending、Owner gate required。
