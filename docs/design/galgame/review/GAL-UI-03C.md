# GAL-UI-03C · 非施工者独立复查（2026-10-10）

**判词：局部 PASS，仅签画廊 S4 几何收敛；全库 CONCERNS。** 本单不签完整 V2、原型逐像素一致、正式素材/视觉演出 S5/S6 或项目交付。复查者没有修改施工源码、原型或 PUI；所有隔离副本在验红后清理。

## 独立复跑与同画布实测

- 读 `requests.md` 的 03C 票、`gal-ui-03c-geometry-diff.md`、定稿 `gal-ui-complete-v2.dc.html`、画廊 LayoutNode 与量测/浏览器脚本；先确认脚本不会启动应用服务或碰数据库。为避免重写施工者证据，将 `measure-gal-03c.mjs`、`verify-gal-live-gallery.mjs`、`verify-gal-live-wheel.mjs` 复制到工作区内任务级 `.review-gal-03c-probe/`，仅把源码根路径和截图/JSON 输出改到其 `out/`。三条隔离副本的静态浏览器运行退出码均为 **0**；脚本 `finally` 关闭 Edge，临时构建清除。
- `npx vitest run src/skills/tier3/narrative-director.test.ts src/services/gal-ui`：4 文件 **52/52，退出 0**。GAL 宿主测试覆盖 `validateLayoutNode` 历史、画廊和放大态零 issue；Director 的 512 条历史测试仅打印 `[GAL-ENG-02B] 512-entry history bytes=721111` 信息，无测试告警。首次沙箱运行遇 Vite `realpath EPERM`、未收集任何测试，随后只对短生命周期测试申请非沙箱复跑；不把首次环境错误算通过或产品失败。
- `node src/services/gal-ui/verify-gal-03c-audit.mjs`：首次沙箱构建因 `realpath EPERM` 退出 1；非沙箱重跑 **退出 0**。深色回想、CG、CG 放大及亮色回想、CG、CG 放大共六态，均重叠 0、对比硬失败 0、border-image 前提失败 0。亮色三态各有标题 `gal-gallery-title` 的 **3.57:1** 非阻断告警；该标题为 36px 大文本，已目视截图，可按大文本 3:1 门槛接受。深色三态的“house 主题：否/华丽件少”是审计器贴图命中启发式提示，不是无主题事实：静态夹具实传 `apolloOnyx`；亮色 `apolloToon` 被识别为 house。正式皮/素材留 S5。
- 隔离 `measure.mjs`：**退出 0**。复查者读取自己生成的包围盒 JSON，再计算每项最大绝对差：回想与 CG 的外框、标题区、页签、网格、首卡、末卡、底栏四轴均 **0px**；底栏动作区 `y/height/right` 最大差 **0.5px**。回想网格顶 `y=244`、首/末卡高 `152`；CG 网格顶 `y=242`、首/末卡高 `240`；两页底栏均 `x=84,y=782,w=1272,h=51`。空 CG 与仅一张卡的第 2 页底栏也独立实测为相同锚点。本人目击同画布原型/真实回想及 CG 截图、空态、第 2 页和亮色关键帧：外部几何对齐；内文排版、装饰、背景和真实 CG 图片仍有明确视觉差异，不能据此宣称像素级 1:1。第 2 页与空态并无定稿原型对应帧，只核对既定布局锚点。
- 隔离 `gallery.mjs`：**退出 0**，真实静态浏览器链覆盖历史开/滚/关且剧情滚轮不泄漏、回想已解锁仍无动作、锁定 CG 无 key/动作且点不开、Profile 解锁刷新、第 2 页放大/关闭后仍在第 2 页、剧情恢复与后退；长历史列表实际滚动。隔离 `wheel.mjs`：**退出 0**，覆盖剧情滚轮推进/回退、改选、2 号槽存读档与 Profile 不回滚。均为本地 `file:` 静态构建、1440×900 隔离无头 Edge，未启动服务；浏览器已关闭。

## 带锚点隔离撤修验红

复制 `gal-ui-structure.ts` 与回想审计入口到 `.review-gal-03c-probe/`，让量测副本只在回想态消费复制的结构。先断言共享源码 `y: isCg ? 180 : 182` **恰好 1 次**，复制源也恰好 1 次；再只把复制源的回想网格 y 改回 `171`，加唯一 `ISOLATED REVIEW SABOTAGE` 标记，断言共享源码仍是 `182` 1 次、复制源旧锚点 0 次/撤修锚点 1 次/标记 1 次。运行同一量测脚本 **退出 1**，明确报 `memories grid.y differs by 11px`。这证明 03C 的 11px 修复确实被量测抓住，并非只改了未消费文件或放松判据；共享实现未被破坏。

## CONCERNS 与边界

- `npx tsc --noEmit --pretty false` **退出 1**；诊断仅来自 `games/game-card-reveal`、`game-dice`、`game-simlife`、`game-theft` 及 `src/launcher/game-runner.tsx`，没有 GAL 文件。全库门禁不能宣称绿，也不在本票越域修复。
- 原型的纹样、图片、文字内容与真实 LayoutNode 的占位画面仍显著不同；底栏真实动作区因分页控件比原型单个返回按钮更宽，但右沿/高度及锚位达标。此为已披露的 S4 内容与 S5/S6 视觉边界，不把几何 PASS 扩大成整体原型一致。
- 六态审计的亮色标题对比提示及深色华丽度启发式提示已逐条读取；不将退出 0 误述为“无告警”。
