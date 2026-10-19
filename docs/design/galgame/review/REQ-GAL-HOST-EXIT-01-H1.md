# REQ-GAL-HOST-EXIT-01 / H1 · 共享宿主退出端口施工自证

状态：H1 局部自证 PASS；独立复查另见同目录 `REQ-GAL-HOST-EXIT-01-H1-independent.md`。不代表 H2 桌面适配、H3 GAL 消费或发行/S5/S6 通过。

## 范围与合同

- `src/services/platform/host-exit.ts`：显式可选 `HostExitPort.requestExit()`，结果闭集 `accepted | unavailable | rejected`。`accepted` 只指适配器接收意图，不宣称进程已经退出；没有任何全局探测、`window.close` 或 `process.exit`。
- `createHostExitController(port?, audit?)`：缺端口返回 unavailable；异常/无效结果返回 rejected；同一待决请求合并为同一 Promise；首次 accepted 后不再调用端口；unavailable/rejected 允许后续重试。宿主级审计只发 `request` 与闭集结果，无墙钟、存档或剧情载荷；审计回调抛错不改变业务结果。
- 只扩 `src/services/platform/index.ts` 导出，并在 `docs/playbooks/save-platform.md` 增一行接线图。未碰 Electron、GAL UI、World、快照/hash、Profile/手动槽、其他游戏或全局平台工厂默认行为。H2 的窗口归属与受限 IPC 校验仍须 PS 落地。

## 定点证据（2026-10-14）

- `npx vitest run src/services/platform`：5 文件、24 测试，退出 0；其中 H1 6 测试点名覆盖缺端口、拒绝、异步抛错、畸形结果、待决连点、接受后锁存、审计回调重入。
- `npx tsc --noEmit`：最终退出 0。首次运行曾撞并发中的 `life-game-host.test.ts` 两条类型错误；再次运行及构建均转绿，非本单改动。
- `npm run build`：退出 0；仅 Vite 既有大 chunk 提示。
- 定向 ESLint、`docs-ref-guard`：退出 0。公共池为 10/10、24982/25000 字；当前 `context-budget-guard` 因并发 UI 手册 107 行/22244 字而退出 1，H1 未触碰 `docs/playbooks/ui.md`。
- `node scripts/scoped-gate.mjs --run`：退出 1，卡在其他项目既有 33 条 depcruise 依赖违规；本单没有新增违规。输出另有缺少 `origin/claude/mainbranch` 引用及 CRLF 提示，均不作为绿灯。

## 复查导航

非施工者须独立复跑、做带唯一锚点的隔离撤修验红、复现拒绝/错/重复请求并读告警。全量门禁未绿，工单仍在公共池 in-progress，不释放 H2/H3 或 Owner 人门。
