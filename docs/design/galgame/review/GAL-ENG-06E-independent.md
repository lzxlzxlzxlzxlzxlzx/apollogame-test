# GAL-ENG-06E 独立复查（2026-10-12）

**复查人：Codex/review_gal_06e（非施工者）。本票判词：局部 PASS；不代表 `replay-save-preview-auto` 里程碑、Owner 人门或全库门禁通过。**

## 范围与独立证据

- 核对 `docs/design/galgame/requests.md` 的 06E、`docs/projects/galgame-generation-engine/project-roadmap.json` 与施工自证。施工范围为 `src/services/gal-ui/gal-ui-slice-host.ts`、`src/services/gal-save/gal-save-preview.ts`、本票测试及存档手册；复查未改共享实现、测试、工单或控制台。
- `src/services/gal-ui/gal-ui-slice-host.ts` 第 405–409 行：先取只读剧情帧，等待权威 `saves.save` 成功及刷新、反馈，再以 `void` 启动采集；第 425–435 行采集与侧车异常降级，不能阻塞权威反馈。无端口时不构造真实 IndexedDB。`src/services/gal-save/gal-save-preview.ts` 第 207–244 行按权威存档先验、侧车校验、尾部复验，预览不决定槽可读性。
- 原有竞争缺口确实存在：我用独立临时 Vitest 内存延迟端口，令旧 `port.write` 挂起，新权威档和新图先完成，再放行旧写。修复前测试退出 1：新图原先 `ready`，旧写晚到后 `resolve` 为 `stale`（期望 `ready`）；旧图不误展示，但会盖掉新侧车。已向施工者报告并推动保护下沉到公开控制器。
- 当前 `GalSavePreviewController.write` 在 `src/services/gal-save/gal-save-preview.ts` 第 203、226–244 行按槽串行；第二次在旧写完成后重新核权威 hash，因此旧写不能晚于新写覆盖。独立临时探针在修复后 1/1 PASS；主测试 `src/services/gal-save/gal-save-preview.test.ts` 第 418、458 行分别覆盖宿主、直接控制器调用。临时探针与变换配置均已删除，两个路径 `Test-Path=False`。
- 对抗撤修：临时 Vitest `enforce:'pre'` transform 对唯一锚点 `const prior = this.writes.get(number) ?? Promise.resolve();` 断言命中 1 次，替换为 `Promise.resolve()`，不写共享源码。初版施工测试在撤修后仍 1/1 假绿：新写异步链尚未到 `port.write` 就释放旧门；已报施工者。补强后，点名测试撤修为 1/1 FAIL（`gal-save-preview.test.ts:482`，`ready` ≠ 预期 `missing`）；我的独立探针撤修也 FAIL（第二写次数 2 ≠ 1）。这证明当前测试真正守住串行语义。
- 独立原代码复跑：`npx vitest run src/services/gal-save/gal-save-preview.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts`，2 文件 **44/44 PASS**，退出 0。补强并清理临时探针后再跑 `npx vitest run src/services/gal-save src/services/gal-ui`，9 文件 **93/93 PASS**，退出 0。无 GAL 定向告警。初次沙箱 Vitest 在 `spy.js` realpath EPERM 处 0 用例收集、退出 1，不计通过；随后仅对内存替身用例在依赖可读环境中复跑。
- `npx tsc --noEmit --pretty false` 退出 1：诊断在 `games/game-card-reveal`、`games/game-dice`、`games/game-theft` 与 `src/launcher/game-runner.tsx`；未见 06E/GAL 诊断。故全库门禁仍红，不能宣称可推送或里程碑完成。

## 边界

本票只证明同一 `GalSavePreviewController`/宿主实例的按槽序列。真实图像编码、真实及跨会话 IndexedDB、跨控制器实例并发与 S5/S6 原型视觉/演出均未验；预览缺失时权威槽仍可存读。未执行 Git/GitHub、真实数据库/业务持久化写入测试或服务启动，未代签 Owner 人门。
