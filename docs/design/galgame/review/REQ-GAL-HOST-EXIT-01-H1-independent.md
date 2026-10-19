# REQ-GAL-HOST-EXIT-01 H1 独立复查（2026-10-14）

结论：**PASS（仅 H1 共享端口局部）**。复查人与 H1 施工者不同；本单不审 H2 Electron/PS 适配、H3 GAL 消费、真实桌面退出、完整 GAL S5/S6 或 Owner 人门。

## 范围与合同

- 工单锁在 `docs/workflow/requests.md:11-13`：H1 施工主体为 `Codex/root`，H2/H3 待各自领工。复查仅核对 `src/services/platform/host-exit.ts`、`host-exit.test.ts`、`index.ts` 与 `docs/design/galgame/gal-eng-host-exit-01.md` 的 H1 条款；未改生产文件、需求池、手册或游戏消费端。
- `src/services/platform/host-exit.ts:6-25` 给出可选、显式注入的单一 `requestExit()` 和 `accepted | unavailable | rejected` 闭集；`index.ts:4` 从平台公共入口导出。`host-exit.ts:34-51` 不探测全局对象、不调用 `window.close`/`process.exit`，不触及 World、快照、hash、存档或 GalPackage。接受只表示宿主接收意图，非窗口已经关闭。
- `host-exit.ts:36-50` 先建立 pending，再通知 `request` 审计；待决重复请求共用同一 Promise，接受后锁存；缺端口返回 `unavailable`，拒绝、同步抛错、Promise 拒绝及畸形结果闭合为 `rejected`，失败后可重试。审计回调抛错不改变结果。`host-exit.test.ts:5-64` 有点名覆盖，包括同步重入审计。

## 四步实证

1. **独立复跑**：`npx vitest run src/services/platform` → exit 0，5 文件、24/24 测试；`npx tsc --noEmit` → exit 0；`npm run build` → exit 0，791 modules transformed。第一次普通沙箱 Vitest 在 `node_modules/vitest/dist/spy.js` 的 `realpath` 遇 EPERM、0 tests，故改用允许的短时权限运行，不把首次失败当代码结论。
2. **唯一锚点撤修验红**：只在内存中读取并转译 `host-exit.ts`，断言锚点 `if (accepted) return Promise.resolve('accepted');` 命中恰好 1 次。原版 probe：首次 `accepted`、再次 `accepted`、端口调用 1 次；内存副本把锁存结果改成 `rejected` 后，首次仍 `accepted`、再次 `rejected`，目标断言转红。命令 exit 0 表示探针自身通过，未写共享文件。
3. **独立实证复现**：另一份内存隔离 probe 核得缺端口 `unavailable`、拒绝后再次请求成功且端口调用 2 次、抛错 `rejected`、待决请求同一 Promise 且端口调用 1 次、接受后重请仍只调用 1 次；probe exit 0。同步审计重入由平台定点测试再次覆盖（`host-exit.test.ts:32-43`）。
4. **读告警**：平台 Vitest 无测试告警；build 仅报现存 `>500 kB` chunk 建议，未涉及 H1 语义。共享工作树存在大量其他任务并发修改，本复查不据此声称全量 scoped gate 或整个产品通过。

## 边界与交接

H1 合同可供 H2/H3 消费：宿主可选注入 `HostExitPort.requestExit(): HostExitResult | Promise<HostExitResult>`；通用控制器 `createHostExitController(port?, audit?)` 返回 `available` 与异步 `requestExit()`。只有实际桌面适配确认接收才返回 `accepted`；H1 自己不能关闭任何窗口。H2 仍须独立证明来源/窗口归属校验与真实退出；H3 仍须证明 GAL 确认、预览反馈和失败路径。未启动浏览器、测试服务或整套 ZeroCraft；无远程写入。
