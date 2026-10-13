# GAL-ENG-06G 施工自证与复查导航（2026-10-12）

**施工者：Codex/root。此文不是独立复查或 Owner 人门判词。**

## 边界与结果

- 原有 `GalSavePreviewController.writes` 是每实例队列。现提升为模块级 `previewWrites`，用 JSON 编码的 `[packageId, slot]` 键串行同一 JS 进程内的写入和删除；不同控制器及不同适配器包装对象共用次序，队列完成即删除。每次真正写入前仍由原 `writeOnce` 重新检查权威 hash，之后仍二次核对；等待中的删除若发现新权威档就跳过侧车清理，已开始但延迟的删除则排在新写入前。预览故障只降级，不改变权威存读档。
- 不同槽可并发，故障后的同键写入可继续。此修复**不是**跨标签页/进程事务，也没有启动真实 IndexedDB、服务或改动权威存档结构。

## 自检与隔离撤修

- 双控制器修复初版：`npx vitest run src/services/gal-save/gal-save-preview.test.ts` 22/22 PASS，GAL save+UI 10 文件 99/99 PASS。独立复查指出删除未入队后补两条延迟删除竞态测试；最终定向 24/24、GAL save+UI 10 文件 101/101 PASS。首次未升级的 sandbox 点名运行因 `node_modules/vitest/dist/spy.js` 的 Windows `realpath EPERM` 在收集前退出；随后获隔离权限的同命令通过，不计首次为产品失败。
- 临时 Vite pre-transform 配置先断言 `const prior = previewWrites.get(key) ?? Promise.resolve();` 唯一命中 1 次，再仅在内存中替换为无队列的 Promise。点名测试由 22/22 绿转为 3/22 红：06E 两条原竞态测试与 06G 双控制器测试均失败；新测试直证第二个控制器提前进入侧车（期望写次数 1，实际 2）。临时配置已用 `apply_patch` 删除、`Test-Path=False`，正常源码复跑 22/22 PASS。首次临时配置缺根 Vite alias 导致 0 用例收集，改为合并根配置后才进入上述有效验红。
- `npx tsc --noEmit --pretty false` 退出 1：诊断仅在 `game-card-reveal`、`game-dice`、`game-theft` 和 `src/launcher/game-runner.tsx`，没有 GAL/06G 诊断；全库门禁不能称绿。

## 请独立复查

独立核对模块级队列的 package+slot 粒度、尾项清理、权威 hash 重检和延迟删除两种时序；对最终代码复跑定向/相关回归、唯一锚点隔离撤修验红并读告警。真实/跨会话 IndexedDB、跨标签页事务、正式应用宿主注入与 S5/S6 仍不在本票局部结论内；`replay-save-preview-auto` 保持 active。
