# REQ-S3CART-RENDER 独立复查（2026-10-13）

判词：**PASS（仅卡带渲染探针修复）**。复查人 `/root/s3cart_render_review`，非施工者。本结论不等于 S3 机器门、Canvas 点击门、S4 玩法或 Owner 人门通过。

## 范围与实查

- 读码：`scripts/render-probe.mjs`、`scripts/lib/render-harness.mjs`、`scripts/render-probe.test.mjs`；复查前检查了这些文件与探针产物的工作树状态，均为共享工作树已有改动/未跟踪物，未执行 Git 变更。
- `cartProbeFixture()` 从本仓 `library/<slug>/meta.json` 与 `manifest.json` 生成只读 `/api/library` 和 `/api/library/<slug>/manifest` 响应；非法 slug 被拒。`deepLinkQuery('cart', slug)` 仍走玩家深链 `?game=lib:<slug>`。
- `hasCartRunnerCanvas()` 要求“返回架上”所在运行器容器内 Canvas；卡带额外 `gameMounted` 断言不再允许启动器的高方差截图假绿。非卡带沿用原三断言。

## 独立复跑

1. 普通沙箱 `npx vitest run scripts/render-probe.test.mjs`：exit 1，`node_modules/vitest/dist/spy.js` 的 `realpath EPERM`，0 tests；这是沙箱环境阻断，不计实现失败。隔离权限重跑：exit 0，**1 file / 18 tests PASS**；无测试告警。
2. `node scripts/render-probe.mjs --game game-clue-investigation`：exit 0；`gameMounted=true`，`nonBlank variance=127.58 > 15`，`consoleErrors=0`，`pageErrors=0`，`vite-error-overlay=false`。证据 JSON 的 `form=cart`、`gameHash=56754c65a5efd2b6`；截图 1280×800，目击“返回架上”与深色 Canvas 内矩形骨架，不是启动器。S3 骨架的占位观感不属于本单判定。
3. 最终恢复后再跑真探针：exit 0，产物时间 `2026-10-12T18:06:39.989Z`、以上断言值一致。`Get-NetTCPConnection -LocalPort 5700,5701,5702 -State Listen` 无输出；临时 Vite 无残留监听，Playwright 浏览器在 `finally` 关闭。

## 带唯一锚点的撤修验红

- 锚点 `scripts/render-probe.mjs:95` 原文 `return !!back?.parentElement?.querySelector('canvas');`，`rg -n -F` 命中唯一行。临时改成恒 `false` 后复核锚点确已替换；同一 Vitest 命令 **exit 1，17 pass / 1 fail**，失败测试为“启动器自己的 Canvas 不算卡带挂载；运行器内 Canvas 才算”，`expected false to be true`（测试行 132）。恢复原文后 `rg` 再命中，复跑 **18/18 PASS**。
- 锚点 `scripts/lib/render-harness.mjs:123` 原文为单个真实 cart entry，`rg -n -F` 唯一命中。临时置 `entries: []` 后跑**真实**渲染探针：**exit 1**，虽然启动器截图仍 `variance=457.25` 且控制台零错，但 `gameMounted=false`、`ok=false`。恢复原文后真探针 **exit 0** 并重写最终绿色产物。

## 告警与边界

- 复跑 stdout/stderr 没有 Vite、浏览器或测试告警；探针记录的浏览器控制台和未捕获异常均为 0。
- 当前断言证“正确卡带运行器的 Canvas 已挂载且画面非空白”，不证热点可点击、游戏结果反馈或与定稿原型 1:1。后两项必须由独立的点击门及 S4/S5 自证验收。
- 本复查不调用 `game-pipeline review/signoff`，不代 Owner 人门；项目路线图与流程板由主会话按完整 S3 证据同步。
