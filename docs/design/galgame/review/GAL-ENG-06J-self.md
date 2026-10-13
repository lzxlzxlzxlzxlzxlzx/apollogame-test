# GAL-ENG-06J 隔离本地 IndexedDB 全端口槽预览纵切片自证（2026-10-12）

**施工者：Codex/root。施工方判词：局部 PASS；待非施工者独立复查。** 本票不签 `replay-save-preview-auto` 整个里程碑或 Owner 人门。

## 范围与架构判断

- 使用现有 `IndexedDbStoragePort`（权威槽）、`IndexedDbSavePort`（GalProfile）、`IndexedDbGalSavePreviewPort`（非权威缩略图侧车）和 `BrowserGalPreviewCapturePort`，通过 `GalSliceHost` 显式注入；没有新 capability、没有正式应用入口或生产 UI 改动。
- `gal-save-preview-idb-live.audit.ts` 只创建隔离 DB `gal-preview-idb-live-audit-v1`。权威/Profile 两端口传 `ls:null`，不会读取或迁移 owner 日常 `localStorage`；测试背景和立绘只通过已登记的 demo assetKey 解析，内容包不写 data URL。
- `verify-gal-save-preview-idb-live.mjs` 在 OS 临时目录构建静态审计页，使用任务级 Edge persistent profile 和固定 `https://gal-preview-live.audit.invalid` 虚拟源。全域 route 仅本地 fulfill `index.html`/`audit.js`，其他请求一律 abort；不启动前后端，不触远程数据库。成功与失败路径均关闭 context，并在确认目标仍位于 OS tmp 且目录前缀正确后删除，残留会抛错。

## 真实浏览器结果

- 命令：`UI_AUDIT_CHROMIUM=Edge node src/services/gal-ui/verify-gal-save-preview-idb-live.mjs`，普通本机进程权限下退出 0，输出 `GAL LIVE IDB PREVIEW: PASS`。1440×900 真实 DOM 从主页进入剧情，保存槽 2；缩略图为可解码 320×180，预览和权威 hash 均为 `6882550b`。
- 关闭浏览器后用同一隔离 profile 新开会话，槽 2 再次 `ready`、图片 320×180、hash 不变，并成功读取到剧情 `["a","intro"]`。在侧车中改坏图像字节后，新会话槽卡显示 `damaged`、`canLoad=true`、图片不显示，权威 hash 不变且读档成功。
- 首会话从真实设置页将 `exitGame` 确认开关关闭，检查隔离 IndexedDB 同时存在实际权威槽 `snap:zerocraft.gal-manual.v1.gal-preview-idb-live-audit.2`、Profile `env:zerocraft.gal-profile.gal-preview-idb-live-audit` 和预览 `gal-preview:v1:["gal-preview-idb-live-audit",2]` 三种记录；重开浏览器后读回 `exitGame=false`。这验证 Profile 的实际写入与跨会话读取，而不只是注入了 Profile 端口。
- 仅让侧车的 IndexedDB factory 抛错模拟无侧车存储，权威槽/Profile 仍用真实隔离 IDB：新会话槽卡显示 `unavailable`、`canLoad=true`，权威 hash 不变且读档成功。此注入是侧车不可用模拟，不代表整个浏览器 IndexedDB 全部禁用时权威存档仍可用。
- `node --check` 退出 0；GAL save+UI 定向 Vitest 在普通本机进程权限下 10 文件 101/101 PASS。普通沙箱内 Vitest 因 Vite `EPERM realpath node_modules/vitest/dist/spy.js` 未收集任何测试，不算测试通过。全库 `tsc --noEmit` 退出 2，但诊断仅在 `game-card-reveal`、`game-dice`、`game-theft` 与 `launcher/game-runner.tsx`，没有 GAL 新诊断。

## 未覆盖与复查导航

- 这是验证通用端口组合的隔离 fixture，不是正式 Web/桌面作品宿主。跨标签页/进程写入仍无原子定序保证；整屏/V2 S5/S6、桌面包、真实用户档均未测。坏图只在侧车独立 key 中注入，权威快照/档案未被更改。
- 非施工者应独立复跑真浏览器四路径、核对浏览器和临时 profile 清理、仔细读告警，并在不改共享源码的隔离副本做唯一锚点撤修验红。整个项目控制台保持 `active`，此票最多登记局部证据。
