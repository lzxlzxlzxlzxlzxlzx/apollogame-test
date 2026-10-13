# GAL-ENG-06F 独立复查（2026-10-12）

**复查人：Codex/review_gal_06f，非施工者。判词：本票局部 PASS；`replay-save-preview-auto` 仍为 active。** 本文不代签 Owner 人门、正式宿主接线、真实 IndexedDB、整屏截图或 S5/S6 视觉验收。

## 范围与独立复跑

- 对照 `docs/design/galgame/requests.md` 的 06F 边界，实查 `src/services/gal-save/gal-browser-preview-capture.ts`、点名测试、静态浏览器审计和 06B `parseGalPreviewRecord`。编码器只从显式传入的背景/立绘 URL 读图；`allowedUrl` 限 data PNG/JPEG/WebP 或同源 HTTP(S)/blob，跨源 URL 在 fetch 前拒绝（编码器第 11–38 行）；输出固定 320×180、至多 256 KiB 且再次经过 06B 解析器（第 55–68 行）。无图、加载失败、无 Canvas 和编码失败返回 `null`（第 76–93 行）。这些是内容场景预览，不含 UI chrome。
- 独立运行 `npx vitest run src/services/gal-save/gal-browser-preview-capture.test.ts`：**3/3 PASS**。`npx vitest run src/services/gal-save src/services/gal-ui`：**10 文件、96/96 PASS**。测试覆盖背景 cover、立绘 contain、sidecar 解析、无图、外域 URL、加载异常、超限 WebP 后回退 PNG、编码器全失败。未运行真实数据库或业务持久化测试。
- 独立运行静态 `file:` 浏览器审计 `node src/services/gal-save/verify-gal-browser-preview-capture.mjs`（设置 `UI_AUDIT_CHROMIUM` 指向本机 Edge，**未传 `--screenshot`**）：退出码 0，`GAL BROWSER PREVIEW: PASS {"ok":true,"mimeType":"image/webp","width":320,"height":180}`。脚本使用已登记 demo 图的 data URL，真实浏览器解码并回经 06B 校验；`finally` 关闭无头浏览器、删除任务级临时构建。未启动应用服务、未覆写施工者截图。已有 `gal-eng-06f-demo-preview.png` 只作只读目视：背景与立绘均可辨；不能用它代替本次独立浏览器产物。

## 撤修验红与告警

- 在内存 Vite pre-transform 中只匹配 `if (background) cover(ctx, background);`，断言唯一锚点命中 **1** 次后替换为不绘背景；点名测试由 3/3 绿转为 **1/3 红**，失败断言是 `gal-browser-preview-capture.test.ts:64` 的两次 draw 预期仅剩一次。未改共享源文件或测试，正常源复跑已在上述 3/3 与 96/96 通过。
- 首次 sandbox 点名测试与浏览器构建因 Windows `realpath EPERM` 在收集/构建前退出，非产品失败；对同命令作只读隔离权限重跑后通过。全库 `npx tsc --noEmit --pretty false` 独立退出 **1**：诊断落在 `games/game-card-reveal`、`games/game-dice`、`games/game-theft` 与 `src/launcher/game-runner.tsx`，未出现 06F/GAL 文件；不能宣称全库门禁绿。

## 边界判定

06F 的浏览器场景缩略编码器及受限降级合同有点名、撤修和真实静态浏览器证据，故本票局部 PASS。真实跨域服务器 CORS、正式作品宿主显式注入、跨会话 IndexedDB、跨控制器并发与整屏/V2 视觉 1:1 尚无本票证据；这些不能随 06F 一起关闭整个 `replay-save-preview-auto` 里程碑。
