# GAL-ENG-06G 非施工者独立复查（2026-10-12）

**复查人：Codex/review_gal_06g；施工者：Codex/root。结论：局部 PASS；整个 `replay-save-preview-auto` 仍为 active，不代签 Owner 人门。**

## 范围与判定

- 复查 `src/services/gal-save/gal-save-preview.ts` 第 205–266 行的同进程 `packageId+slot` 队列。不同控制器和端口包装对象共享同一键；`writeOnce` 入队后重检权威 hash，尾项完成才清理，拒绝/失败不会锁死后续写入。删除先移除权威档，再入同键队列；若等待时槽已被新权威档占用，则跳过旧侧车清理，防止删除新图。不同槽独立并发。
- 点名证据为 `src/services/gal-save/gal-save-preview.test.ts` 第 517–660 行：跨控制器旧/新写、不同槽、不成功后重试、延迟删除与新写、排队删除遇新权威档。这是**单 JS realm 内**的顺序保护，不是跨标签页/进程的 IndexedDB 原子事务。06H 浏览器整链、真实/跨会话数据库、正式应用宿主注入和 S5/S6 均不在本票结论内。

## 独立复跑、撤修与告警

1. `npx vitest run src/services/gal-save/gal-save-preview.test.ts`：最终代码 **24/24 PASS**；`npx vitest run src/services/gal-save src/services/gal-ui`：**10 文件 101/101 PASS**。初次默认沙箱在收集前对 `node_modules/vitest/dist/spy.js` 报 Windows `realpath EPERM`，并非产品测试失败；独立使用隔离权限重跑上述命令。
2. 在系统 temp 的任务级 Vite pre-transform 中，先断言 `return this.enqueue(number, async () => {` 与闭合段各**唯一命中 1 次**，只在内存将 `delete()` 改为不入队。定向测试 **2/24 红**：测试文件第 614 行原期望 `stale`、实得 `ready`，说明新图提前写入、可能被延迟旧删除擦除；第 649 行原期望删除调用数 0、实得 1，说明旧清理抢在新权威检查前。临时配置已删除，`Test-Path=False`；正常源码复跑 **24/24 PASS**。
3. 另在初版代码上独立撤掉 `const prior = previewWrites.get(key) ?? Promise.resolve();`（唯一锚点 1 次），定向测试 **3/22 红**：06E 两条旧竞态及 06G 双控制器测试；双控制器实际进入端口写 2 次而期望 1 次。此探针的临时配置也已删除。
4. `npx tsc --noEmit --pretty false` 退出码 **1**。逐条诊断只在 `games/game-card-reveal`、`games/game-dice`、`games/game-theft` 与 `src/launcher/game-runner.tsx`；没有 GAL/06G 类型诊断。临时 Vite 配置运行时有 CJS Node API 弃用 warning，仅属探针配置；正常 Vitest 输出无该 warning。**全库类型门仍非绿**，不可据局部 PASS 宣称总门禁或整个里程碑通过。

## 边界保留

纯内存端口验证了同进程时序和权威/侧车隔离，未触碰真实数据库或业务持久化，未启动服务，未执行 Git。未检验跨标签页/进程抢占；必须另行设计存储层协调后才能承诺这一能力。
