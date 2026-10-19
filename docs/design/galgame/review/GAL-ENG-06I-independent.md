# GAL-ENG-06I 真实 IndexedDB 跨会话独立复查（2026-10-12）

**复查者：独立 agent `/root/review_gal_06i`。判词：局部 PASS。** 此判词只覆盖隔离浏览器中 GAL 预览侧车的真实 IndexedDB 跨会话读回、坏 JSON 降级与删除；不签 `replay-save-preview-auto` 整个里程碑，也不代签 Owner 人门。此前的 `PREPARED / UNVERIFIED` 静态判词已由本次实跑更新。

## 范围与隔离核证

- runner `src/services/gal-save/verify-gal-preview-indexeddb-owner.mjs:11-16` 在 OS 临时目录用 `mkdtemp` 创建 `gal-preview-idb-owner-*` 独立目录，profile 是其子目录；固定测试 origin 为 `https://gal-preview.audit.invalid`。`:28-40` 启动无头 Edge 的独立 persistent context；全域 route 只 fulfill 此 origin 的内存静态 `index.html`/`audit.js`，跨域与其他路径 abort；未启动 Vite/API 或访问远程数据库。
- fixture `src/services/gal-save/gal-preview-idb-owner.audit.ts:6-10` 使用独立 DB `gal-preview-owner-audit-v1`、packageId `gal-preview-owner-audit`、槽 2、固定测试 hash，经可注入 `IndexedDbKV`/`IndexedDbGalSavePreviewPort` 操作；没有用默认 `apollo-db`、Owner 浏览器 profile、正式作品槽、权威快照或 GalProfile。此处按新版 `AGENTS.md §2/§3.1` 属允许的隔离本地数据库测试。
- runner `:42-61` 先写入并读取，然后关闭首个浏览器 context，再以同一临时 profile 新开 context 读取；随后写入非法 JSON 并要求 `damaged`，删除后要求 `missing`。`:63-73` 即使关闭 context 抛错也尝试清理，经临时目录相对路径与专用前缀二次核验才递归删除；目录仍存在则非零报错。

## 独立实跑证据

1. 普通沙箱内执行 `UI_AUDIT_CHROMIUM=Edge` + `node src/services/gal-save/verify-gal-preview-indexeddb-owner.mjs`：Edge 在 `launchPersistentContext` 时崩溃（`exit=1`；含 `CoCreateInstance of Elevator failed 80070005`、profile 内 SiteList 更新 `error=-5`、浏览器进程 `3221225477`）。这一次没有到达 fixture `write()`，不能算 DB 失败或通过；脚本 `finally` 清理了任务临时目录。Edge 日志有非致命 USB 拒绝访问、LLM catalog 和 crashpad 错误，不隐去。
2. 同一原 runner 在非沙箱本机权限下独立重跑：`GAL OWNER IDB AUDIT: PASS`，脚本 `exit=0`。`initial` 和关闭浏览器后 `reopened` 均为 `{status:"ready",packageId:"gal-preview-owner-audit",slot:2,saveHash:"12345678",width:8,height:8,mimeType:"image/png"}`；`damaged={status:"damaged"}`，`missing={status:"missing"}`。运行前后列举 OS 临时目录下 `gal-preview-idb-owner-*` 均为空；runner 的退出码 0 还要求 `finally` 中删除与存在性检查成功。浏览器 context 已关闭，隔离 profile 已删除。
3. 撤修验红：未编辑共享源码。独立读入 runner 文本，断言精确锚点 `saveHash: '12345678', width: 8` **仅命中一次**，只在内存副本中把预期 hash 改为 `87654321`；其余 fixture、esbuild 与 Edge 测试路径仍是真实执行。测试因 `initial IDB read mismatch` 转红，包装探针输出 `GAL-ENG-06I SABOTAGE RED: PASS`、`exit=0`（该 0 表示成功观察到预期红灯，不是被破坏 runner 通过）。临时 profile 列表仍为空；原 runner 随后保持未修改的首次实跑 PASS 基线。

## 边界与残余风险

- fixture 对 `read()` 的 `ready` 只返回图像 MIME/宽高等元数据，不验证 PNG 字节可解码或实际画面；损坏测试写的是非法 JSON，不是损坏的图片字节。它验证的是 `IndexedDbGalSavePreviewPort.read()` 的 JSON 降级与侧车删除，不是完整 UI 图像降级。
- 本票不覆盖正式作品宿主显式注入、权威存档写/读、跨标签页/进程事务定序、无存储环境降级、整屏截图或 V2 S5/S6 视觉验收。这些仍按路线图留在 `replay-save-preview-auto` 的未闭项；本次局部 PASS 不可推动整个里程碑 done。

**结论：局部 PASS。** 真实独立浏览器/IndexedDB 路径经非沙箱本机权限实测为绿，锚点撤修可转红，临时数据已清理；其余范围继续待验。
