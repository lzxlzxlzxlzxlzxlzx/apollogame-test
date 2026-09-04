# game-105 S4 程序证据：独立发行版本地玩法

日期：2026-09-02

## 本版范围

- 按当前 S4 本地工单执行：玩家与本地模板 AI 轮流使用同一真物理塔。
- 不调用 Host、真实模型、Storyteller 或网络服务；未来接缝保留但默认关闭。
- 交互卡、回应、换卡、跳过、余波、退役积木、AI 收尾、倒塌、重开均仅服务本局。

## 已运行验证

```powershell
npx tsc --noEmit
npx vitest run games/game-105 --silent
npx vite-node --script scripts/acceptance-run.mjs --game game-105
node scripts/game-105-spec-recursion.mjs
node scripts/ui-walkthrough-probe.mjs --game game-105
node scripts/game-pipeline.mjs gate game-105 S4
```

- 类型检查通过。
- 游戏定向 Vitest `42/42` 通过，包含确定性会话、物理退役、连带抽取、AI 单次收尾和独立版 Host 默认禁用测试。
- 8 份固定 GD 验收剧本 `8/8` 通过，覆盖稳定开局、成功互动、半抽不换手、真实倒塔与重开、玩家回应/换卡、退役积木、余波顺序与上限、AI 收尾一次性。
- 递归故障注入基线通过，`S4-recursion.json` 为 `ok: true`，16 条规则均在隔离临时工作树中被故意破坏后转红并恢复。
- 浏览器 UI 走查为 `18/24` 真驱动、零 console error。`tower.response.draft` 使用真实输入框填写；卡牌/收尾信号在 `GAME105_UI_BINDINGS` 中明确映射到真 DOM action。重复换卡、重复 AI 收尾和依赖后续真实物理状态的步骤如实记为不可驱动，未用隐藏控件伪造通过。探针和截图位于 `public/games/game-105/probe/`。

## 递归覆盖

- 覆盖抽离阈值、倒塌聚合去重、回拉重新计入、30 帧稳定窗口、900 帧兜底、AI 模板只显示一次、AI 收尾只生成一次。
- 同时覆盖新增 S4 规则：玩家输入/换卡、非直接跌落退役、余波顺序、余波上限和溢出、结算与重开清理。

## 门禁状态

本次已执行 S4 门禁。范围比较不复用 S3 暂存集：`node scripts/game-105-s4-scope-manifest.mjs --check` 对本关固定 28 个输入、实现、验收与探针文件逐一复算 SHA-256，供独立复查比较。

## 移交

- 下一位应为测试/独立复查 agent：按当前范围基线复算并抽样重走对齐单，再执行 S4 review。
- 独立复查 PASS 后，才由 owner 签核。

## 2026-09-03 Current-Hash Rerun

- 当前内容指纹：`38db589c1137893a`。
- 当前 GD 验收：`npx vite-node scripts/acceptance-run.mjs --game game-105` 通过 `8/8` 剧本、`45` 个检查点。
- 当前递归：[S4-recursion.json](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S4-recursion.json) 的 `gameHash=38db589c1137893a`、`baseline=true`、`ok=true`；`16/16` 条隔离故障注入均转红，覆盖抽离、倒塌聚合、去重、回拉、稳定/超时、战利品、回应/换卡、余波和 AI 收尾。
- 当前定向回归：`npx tsc --noEmit` 与 `npx vitest run games/game-105 --silent` 通过，游戏测试 `42/42`。
- `gate game-105 S4` 已尝试，但在真正执行 S4 验收前被 S3 独立复查过期硬闸拒绝。这不是 S4 失败或假绿：需非施工者先复查当前 S3，再重跑 S4 gate 生成同指纹 UI 走查和门证。
