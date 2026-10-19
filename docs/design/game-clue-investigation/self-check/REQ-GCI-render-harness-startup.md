# REQ-GCI-CART-ART-BRIDGE · 浏览器探针启动器自检补记

日期：2026-10-16。范围仅为共享 `startDevServer` / `stopDevServer` 测试工具，不代表资产桥整单、S3/S6 门或 Owner 人门通过。

## 实施

- Vite 就绪 URL 解析同时消费 stdout/stderr，先剥 ANSI 控制码，并要求明确端口；可正确处理分块输出及 Vite 自动选出的实际端口。
- 就绪超时会调用服务清理并拒绝；spawn error 在 child 仍活动时触发清理。Windows 停止路径使用隐藏的 `taskkill.exe /T /F` 清理进程树，失败时回退 child handle；POSIX 保留进程组 TERM/KILL。
- 提前 `exit` 会及时拒绝等待，但不会再按已退出 parent 的 PID 做强杀（避免误杀复用 PID 的无关进程）。Vite/esbuild 依赖可能派生子进程；当前未验证 parent 提前退出时后代清理，不能声称无泄漏。若该路径成为验收要求，须采用可追踪的进程树/Job Object 生命周期并增加真实清理测试。
- 变更：`scripts/lib/render-harness.mjs`；点名测试：`scripts/lib/render-harness.test.mjs`。

## 本地证据

- `npx vitest run scripts/lib/render-harness.test.mjs scripts/render-probe.test.mjs scripts/click-probe.test.mjs`：3 files / 48 tests PASS。
- `npx eslint scripts/lib/render-harness.mjs scripts/lib/render-harness.test.mjs`：exit 0。
- `git diff --check`：exit 0；Git 仅提示工作树既有文件的 LF→CRLF 转换提示，无 whitespace error。
- 短时真实 Vite 启停探针：检测到实际端口 `58597`，调用 `stopDevServer` 后收到 `SIGTERM` exit，未启动整套 ZeroCraft；该探针只验证 Vite 生命周期，不代替浏览器点击旅程。
- 单测覆盖 ANSI、stdout/stderr、分块 URL、自动选择的端口、超时触发清理、spawn error 有/无 PID 分支、Windows taskkill 树清理与 fallback、未就绪前提前退出。

## 尚待真实宿主复核

- Owner 已证明普通 PowerShell 的 Playwright Edge launch 成功（`155.0.4283.45`），但修复后的完整 `click-probe` 尚未在该环境复跑；Codex 沙箱无法启动此 Edge，也无法可靠观测 Owner shell 的本地端口。必须从 Owner 普通 PowerShell 跑 `node scripts/click-probe.mjs --game game-clue-investigation`，确认探针实际点击断言完成，并确认临时 Vite 已停止后，才可记浏览器验收通过。
- 上一次超时启动可能遗留 Vite。复跑前应检查 5700 端口占用并确认进程命令行为该次探针启动；不要误停 Owner 的其他服务。
