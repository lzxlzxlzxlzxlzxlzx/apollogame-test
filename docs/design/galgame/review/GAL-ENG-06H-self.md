# GAL-ENG-06H 静态浏览器整链自证（2026-10-12）

**施工者：Codex/root。本文不是独立复查或 Owner 人门判词。**

## 范围与真浏览器结果

- 新增 `gal-save-preview-live.audit.ts` 和 `verify-gal-save-preview-live.mjs`，只作为验收 fixture。Node runner 从 `public/games/gal-template/art/index.json` 按稳定 key 取已登记 demo 背景与立绘，约束在 demo 目录内，再把 URL 显式传给真实浏览器 `GalSliceHost`。World/包只持 key；浏览器端组合 `BrowserGalPreviewCapturePort`、`MemoryGalSavePreviewPort`、`MemoryStoragePort`、`MemorySavePort`，无 IndexedDB、localStorage、常驻服务或正式作品入口。
- 静态 `file:` 隔离 Edge 在 1440×900 完成“主页开始→剧情→保存槽 2→确认→异步图就绪→回剧情→读取槽 2”。槽卡 `preview=ready`、WebP 可解码为 320×180，预览 hash 与权威槽 hash 均为 `3165e9f3`；截图目视见 [06H 槽页](gal-eng-06h-live-preview.png)，卡图是背景和立绘而非整屏 UI。第二个全新内存会话显式不注入预览端口，同样按钮链可存读，槽卡为 `no-preview`，权威 hash 仍有效。两页浏览器和任务级临时构建在 `finally` 关闭/清理。
- PowerShell：`$env:UI_AUDIT_CHROMIUM = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'; node src/services/gal-ui/verify-gal-save-preview-live.mjs` 退出 0，输出 `GAL LIVE PREVIEW: PASS`（withPreview 与 noPreviewPort 双路径）。首跑沙箱 Vite `realpath EPERM` 在构建前退出；隔离权限重跑后首个脚本断言误用只读卡不存在的 `saveHash` 字段而退出 1，此为验收脚本假设错误，改以卡 `previewSrc` 与侧车/权威 hash 对账后通过。上述失败均未被冒称通过。

## 限制与复查点

- 相关 GAL save+UI 纯内存测试最终 10 文件 101/101 PASS；全库 `tsc` 退出 1，只有非 GAL 的 game-card-reveal、game-dice、game-theft、launcher 诊断。浏览器整链并未证明正式作品宿主注入、真实/跨会话 IndexedDB、跨标签页事务、整屏截图或 V2 S5/S6 视觉 1:1；本票不能关闭整个 `replay-save-preview-auto`。
- 请非施工者独立复跑无截图模式，检查 registered assetKey→URL 只读解析、真按钮链、可解码卡图、权威 hash、不注入预览端口降级，以及 browser/临时构建清理。带唯一锚点隔离撤去 `previewCapture` 注入应使有图路径转红；不得修改共享实现或覆盖施工截图。
