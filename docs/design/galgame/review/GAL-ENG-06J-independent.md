# GAL-ENG-06J 独立复查（2026-10-12）

**复查主体：独立于施工者的 `review_gal_06j`。局部判词：PASS。** 真实 UI 的权威槽、Profile 与预览侧车三端口路径已独立核证；不签 `replay-save-preview-auto` 整体里程碑或 Owner 人门。初版缺少 Profile 写入断言，复查曾判 CONCERNS；施工方补强后，本报告按新版重新复跑与撤修验红，才改判局部 PASS。

## 范围与静态核证

- `src/services/gal-ui/gal-save-preview-idb-live.audit.ts:44-52` 使用明确命名的本地 IndexedDB；权威槽和 Profile 的 `ls:null` 排除 owner 日常 `localStorage` 读取/迁移，故障工厂只施加给非权威侧车。`src/services/gal-ui/gal-save-preview-idb-live.audit.ts:61-63` 将端口与浏览器采集器显式注入 `GalSliceHost`。这是隔离验收 fixture，不是正式作品宿主。
- `src/services/gal-ui/verify-gal-save-preview-idb-live.mjs:11-12,42-55,145-154` 使用 OS 临时目录下的独立 persistent profile、阻断 Service Worker、对所有页面请求设 route；只有 `.invalid` 同源的 `/index.html` 与 `/audit.js` 被本地 fulfill，其余 abort。没有应用服务启动或远程数据库请求。异常路径关闭 context，并在检查临时路径与前缀后递归清理。
- `src/services/gal-ui/verify-gal-save-preview-idb-live.mjs:16-31` 从登记索引只读解析两枚 demo assetKey，并验证来源位于 demo 贴图目录；包内只保留 assetKey，页面用本地读取的 PNG data URL 供测试。无对索引或素材的写入。
- `src/services/gal-ui/verify-gal-save-preview-idb-live.mjs:74-83,94-159` 点击真实 LayoutNode 按钮保存/读槽 2，并在设置页点击 `exitGame` 确认 Toggle；比较权威 hash、侧车 hash、槽状态、图片自然尺寸、恢复的剧情 ref、三类 IndexedDB 键和跨会话 Profile 偏好。没有仅凭 fixture 内部状态伪造 UI 成功。

## 四步复查实证

1. **独立复跑**：普通沙箱首次运行 Edge 在 `launchPersistentContext` 崩溃，脚本真实退出码 `1`，不可算 PASS。按已确认的隔离边界在普通本机权限重跑原版和补强版，各退出码 `0`，补强版输出 `GAL LIVE IDB PREVIEW: PASS`：`saved`/`reopened` 均 `ready`、`canLoad=true`、权威与预览 hash 均 `6882550b`、图片 `320×180`；`damaged` 为 `damaged`、`canLoad=true`、权威 hash 不变、图片 `0×0`；侧车存储不可用为 `unavailable`、`canLoad=true`、权威 hash 不变、图片 `0×0`。跨会话复用同一隔离 profile，且后三种会话均成功用真实 UI 读回 `["a","intro"]`。补强版输出 `profileExitConfirmation:false`，键列表包含 `env:zerocraft.gal-profile.gal-preview-idb-live-audit`、`snap:zerocraft.gal-manual.v1.gal-preview-idb-live-audit.2` 和 `gal-preview:v1:["gal-preview-idb-live-audit",2]`；这些键均来自隔离本地 IDB。
2. **带锚点撤修验红**：在 OS 临时目录创建 runner 副本、未修改共享源码。第一次唯一锚点 `await second.evaluate(() => window.__galIdbAudit.corruptImage());` 命中数 `1`，换成无操作后 `damaged` 等待产生 `page.waitForFunction: Timeout 20000ms exceeded`，子进程退出码 `1`。补强版第二次唯一锚点 `await first.locator('#gal-confirm-toggle-exitGame').click();` 命中数 `1`，换成无操作后 `exitConfirmation() === false` 等待产生 `Timeout 30000ms exceeded`，子进程退出码 `1`。两次变异均以相应未破坏版本真绿为前提，证明坏图与 Profile 写入断言分别会咬住缺失行为。
3. **实证复现**：脚本 `src/services/gal-ui/verify-gal-save-preview-idb-live.mjs:119-142` 在坏图与侧车存储不可用两种情况下分别重新打开浏览器，检查 UI 槽状态与读档成功；这些是互不替代的失败注入。无侧车注入不是全浏览器 IndexedDB 不可用测试，权威存档仍使用真实隔离 IDB。
4. **读告警和清理**：沙箱运行的 Edge 日志出现 `CoCreateInstance of Elevator failed (0x80070005)`、Crashpad/USB 与 profile 写入错误，且进程崩溃；故未采信该次。普通本机权限的原版/补强版复跑均无 stderr 告警、退出码 `0`。各次 runner 的 finally 均执行；随后枚举 OS 临时目录，没有 `gal-preview-idb-live-*` 或 `gal-06j-*-sabotage-*` 残留。短生命周期 Edge context 在成功路径显式关闭、异常路径 finally 关闭。

## 未覆盖 / 需纠正的表述

- 初版仅构造并注入 Profile 端口、没有写入实证。补强版 `src/services/gal-ui/verify-gal-save-preview-idb-live.mjs:110-125` 已用真实 Toggle 写偏好、查 `env:` 键并跨浏览器会话读回 `false`，该缺口已关闭。键列表断言只按前缀而非完整 Profile key 匹配，但实测输出给出该包完整 key，跨会话偏好读回又独立约束语义；当前不构成阻断。
- 本票未测正式 Web/桌面作品宿主、跨标签页/进程的原子定序、整个 IndexedDB 不可用、真实用户档、整屏/V2 S5/S6，也未复跑全库门禁。不得据此把 `replay-save-preview-auto` 标为 `done`。

**结论：06J 隔离本地 IndexedDB 的三端口真实 UI 纵切片局部 `PASS`；正式作品宿主与整个 `replay-save-preview-auto` 仍未完成。**
