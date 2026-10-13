# GAL-ENG-06E 施工自证与独立复查导航（2026-10-12）

**施工者：Codex/root。判词仅为施工自证，不能替代非施工者复查或 Owner 人门。**

## 边界与实现

- 工单：`docs/design/galgame/requests.md` 的 `GAL-ENG-06E`。仅改 `src/services/gal-save/gal-save-preview.ts`、`src/services/gal-save/index.ts`、`src/services/gal-ui/gal-ui-slice-host.ts`、`src/services/gal-save/gal-save-preview.test.ts`、`docs/playbooks/save-platform.md` 及本票文档。
- `GalPreviewCapturePort` 仅接收包身份、当前剧情 ref/文案和背景/立绘 key/已解析 URL 的只读帧；默认无端口。宿主在 `GalManualSaveController.save` 成功后、正常刷新与“已保存”反馈后启动采集；返回图片交 `GalSavePreviewController.write` 按权威 hash 验证并写入侧车，采集异常不会阻塞权威存读档。同一控制器内同槽写入串行化，避免旧的慢速侧车写操作在新图之后落盘。
- 本票**未实现真实画面编码**，也未注入真实 IndexedDB、运行任何真实/模拟数据库写入或启动服务。World 快照、PUI 基座、LayoutNode 树和其他游戏未改。有效侧车的 4×3 槽消费沿用 06B/03D。

## 自检证据

- `npx vitest run src/services/gal-save/gal-save-preview.test.ts`：19/19，退出 0。首次沙箱运行在 Vitest 自身 `spy.js` 的 `realpath EPERM` 处退出 1，**0 用例收集，绝不计通过**；依赖可读取环境中的复跑才是上述结果。
- `npx vitest run src/services/gal-save src/services/gal-ui`：9 文件 93/93，退出 0。新增 06E 五个用例覆盖挂起采集不阻塞保存、覆盖后旧采集迟到、宿主与控制器直接调用时的慢速旧侧车写入竞态，以及无端口/采集抛错/坏图降级且权威读档仍可用。慢写竞态先以内存端口复现，再将串行化下沉至公开控制器；释放旧写入门前预留事件循环调度并断言第二次写尚未进入端口。
- 唯一锚点隔离撤修：临时 Vitest `enforce:'pre'` 变换将 `if (frame) void this.captureSavePreview(number, meta.hash, frame);` 改为 `if (false) ...`。变换前唯一锚点断言及模块命中断言均通过；当时的 06E 2/3 用例红（首例无帧即断言失败、第二例等待侧车写入超时）。临时配置经 `apply_patch` 删除，`Test-Path` 为 False，未改共享实现；其后补强到 19/19 绿。超时是预期撤修结果，不是原实现告警。控制器写队列的独立撤修另由非施工复查人执行，不把本段旧测试计数冒称最新测试计数。
- `npx tsc --noEmit --pretty false`：退出 1；诊断均在 `games/game-card-reveal`、`games/game-dice`、`games/game-theft`、`src/launcher/game-runner.tsx`，没有 06E/GAL 文件。`node scripts/docs-ref-guard.mjs docs/design/galgame`：PASS。

## 待独立核证

复查人须独立复跑、独立带锚点撤修并确认：保存成功后才触发采集；挂起/抛错/坏图不影响权威反馈和读取；旧 hash 的迟到图片不会盖新槽；默认无采集/无侧车不调用；UI 仅经当前权威 hash 投影预览。真实截图编码、真实跨会话 IndexedDB、全库类型红项和整个 `replay-save-preview-auto` 仍在本票外。
