# GAL-ENG-06F 施工自证与独立复查导航（2026-10-12）

**施工者：Codex/root。此文不是独立复查或 Owner 人门判词。**

## 施工边界

- `BrowserGalPreviewCapturePort` 是显式注入 06E `GalPreviewCapturePort` 的浏览器离屏场景缩略图编码器；不读取 DOM、LayoutNode 或 World，不创建数据库，也不改变权威存档。它只消费 `GalSliceHost` 只读帧中已解析的背景/立绘 URL，输出受 06B `parseGalPreviewRecord` 约束的 320×180 PNG/WebP。
- 背景 cover、立绘 contain；没有可读内容图、跨源/失败资源、无 OffscreenCanvas、输出无效或超过 256 KiB 时返回 `null`。这是一张**内容场景预览**，不包含对话框/工具栏等 UI，不能冒称整屏像素截图或 V2 视觉 1:1。正式作品应用宿主尚未建立，因而没有冒称正式注入。
- 本票未修改 `src/ui/**`、资产索引、剧情 World、Profile、权威存档与真实 IndexedDB；仅用已经登记的 demo 背景/立绘做只读静态浏览器验证。

## 自检与验红

- `npx vitest run src/services/gal-save/gal-browser-preview-capture.test.ts`：3/3 PASS；`npx vitest run src/services/gal-save src/services/gal-ui`：10 文件 96/96 PASS。第一次点名测试因我把 contain 等比结果误写成盒子完整高而 1/3 FAIL，修正断言后复跑绿，不把失败冒称通过。
- PowerShell 中设 `$env:UI_AUDIT_CHROMIUM = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'` 后运行 `node src/services/gal-save/verify-gal-browser-preview-capture.mjs`：退出 0，`image/webp`、320×180；从 `public/games/gal-template/art/index.json` 按 key 取两张已登记 demo 图，临时静态 `file:` 构建喂真实浏览器解码、合成并回到 06B 解析器。结果目视见 [demo 场景缩略图](gal-eng-06f-demo-preview.png)。浏览器和任务级临时构建在 `finally` 关闭/清理；未启动应用服务。首次未指定 Edge 时因 Playwright 默认 headless-shell 文件缺失退出 1，未进入审计，不计通过。
- 自行隔离撤修：临时 Vitest `enforce:'pre'` 插件对 `if (background) cover(ctx, background);` 唯一锚点断言命中 1 次，替换为不绘背景；点名测试 1/3 FAIL（预期两次 draw，实际一次）。临时配置已用 `apply_patch` 删除，`Test-Path=False`，原码复跑 3/3 PASS。
- 全库 `npx tsc --noEmit --pretty false` 退出 1；诊断仅在 `game-card-reveal`、`game-dice`、`game-theft`、`src/launcher/game-runner.tsx`，没有 06F/GAL 诊断。全库门禁不能称绿。

## 请复查人独立核证

独立复跑点名与相关回归、真实静态浏览器编码，复核数据 URL/同源限制、无图降级、WebP→PNG 回退与 256 KiB 上限；带唯一锚点做隔离撤修并读告警。真实/跨会话 IndexedDB、正式应用宿主注入、跨控制器并发及整屏截图仍非本票完成项；`replay-save-preview-auto` 保持 active。
