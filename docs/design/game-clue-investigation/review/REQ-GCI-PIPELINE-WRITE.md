# REQ-GCI-PIPELINE-WRITE · 共享流程 CLI 独立复查

判词：**PASS，仅限共享 CLI 修复**。施工者为引擎程序本聊天；复查者为非施工子 agent `/root/pipeline_write_review`。这不代表 GCI S3 真实机器门或全库门禁已通过。

- 问题证据：`gate game-clue-investigation S3` 已计算结果，但 `scripts/game-pipeline.mjs` 原先直接 `writeFileSync(pipeline.json)` 在 Windows 报 `UNKNOWN: unknown error, open`；原板非只读，普通 `r+` 可打开。原始故障尚未在真实路径再次复现。
- 修复：所有流程板写入口先在目标同目录写完整临时 JSON，再以 `renameSync` 替换；`UNKNOWN/EBUSY/EPERM/EACCES` 有界重试；异常保留旧板并清理本事务临时文件。流程板读取只对 `ENOENT` 使用空板，其他 I/O 错误和坏 JSON 均拒绝继续。
- 独立复跑：`ZEROCRAFT_DEEP=1 npx vitest run scripts/game-pipeline.test.mjs` 在获准本机环境 72/72；`node scripts/slow-lane-guard.mjs game-pipeline` PASS；ESLint、`npx tsc --noEmit`、文档引用与上下文预算守卫 PASS。默认沙箱第一次深测因 `node_modules` realpath EPERM 未进入测试，不算代码失败。
- 撤修验红：复查者先断言 `retryTransientWrite(() => renameSync(temporary, file));` 锚点唯一命中，再仅在内存变异为直写目标并注入写 5 字节后 `UNKNOWN`；工作区隔离测试中原版保持完整 JSON、无临时残留，变异版截断且断言转红；未改共享文件。
- Windows 路径对照：默认沙箱虚拟 Temp 中覆盖已有文件的 `renameSync` 稳定 EPERM；工作区 `scripts/` 下隔离目录与获准本机 Temp 均可替换，写后完整且只剩目标。前者是虚拟 Temp 限制，不可推断真实工作区也失败。
- 真实路径回归（提需方 2026-10-13 回报，本聊天只读复核）：合法 CLI `node scripts/game-pipeline.mjs gate game-clue-investigation S3` exit 0，落账 `gameHash=a96dcb6bf2a87bb7`；随后 `board --json` 显示 S3 机器门 ok，复查门仍 stale，S4 gate 未跑。没有手改 `pipeline.json`。
- 门禁余项：`node scripts/scoped-gate.mjs --run` 退出 1，停在其他项目的 33 条 depcruise 依赖违例；本票相关路径无命中。S3 仍待非施工者独立复查；本票 PASS 不代签 S3/S4。原有多 CLI 同时读改写无 CAS/锁，仍可能最后写入覆盖先前更新，不在本次修复声称范围内。
