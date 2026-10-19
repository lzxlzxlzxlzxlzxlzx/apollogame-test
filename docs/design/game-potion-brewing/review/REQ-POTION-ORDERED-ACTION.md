# REQ-POTION-ORDERED-ACTION · G1 独立复查

复查主体：Codex `g1_review`（非施工者）；日期：2026-10-12。**判词：CONCERNS**。G1 语义未发现 Critical/Major 缺陷；全库门禁仍红，故此单不是公共池释放或机读缺口 `delivered` 的凭据。未执行 Git/GitHub、未启动服务、未改生产代码。

## 核证范围与结论

| 项 | 独立证据 | 结论 |
|---|---|---|
| 工单与冻结规格 | `docs/workflow/requests.md:11-17`、`docs/design/game-potion-brewing/requests.md:54-60`；原型完整步骤见 `brief.md:99-112` 与 `prototype-notes.md:16-17` | G1 是 Owner 已选 A 的通用能力；本复查不代替 S3/Owner 人门 |
| 两份原型配方 | `ordered-action-session.test.ts:18-32,58-69` 已逐项覆盖月露 4 步/5 次动作、赤焰 5 步/6 次动作；首版测试误用 3/2 步，经指出后由施工者修正，复查者重跑 | 修正后 PASS；材料与方向圈数同定稿基准 |
| 输入全序、去重、失败与终局 | `ordered-action-session.ts:102-141` 用 `sortedIds(world,'Signal')` 按实体 ID 码点序、同拍 `source+name` 去重；仅 `acceptedActions` 路由入会话，错动作立即 `failure`，末步只发一次 `success`；测试 `:72-109` 覆盖错料、反向圈、同拍乱序与尾步输入 | PASS；其它 UI Signal 留存，终局后拒收 |
| 配置拒收与快照/hash/trace | `ordered-action-session.ts:16-43` 共用装载/运行校验；测试 `:122-151` 验坏表、双跑、恢复、终局静止与 trace hash 排除；`src/net/determinism.ts:38` 将 `DebugTrace` 排出 hash | PASS；局外合同 parser/G2–G4 不属 G1 |
| 同拍消费与系统图 | 测试 `:111-120` 验 `Effect` 当拍读取终局；独立执行系统图审计：G1+离散猜解+effect/craft/weighted-spawn/cooldown/presentation-track，8 个系统，无悬空边、重复 ID 或 SCC，退出 0 | PASS；真实游戏 S3 子集尚未形成，不能以此冒充未来整局审计 |

## 复查四步实证

1. **独立复跑**：`npx vitest run src/skills/tier2/ordered-action-session.test.ts src/assembly/registry-guard.test.ts src/assembly/system-graph.test.ts`，3 文件 **26/26 PASS**。最初沙箱内 Vitest 因 `realpath EPERM` 未收集任何用例，不采作证据；沙箱外短生命周期复跑退出 0。
2. **锚点撤修验红**：只创建临时 `vite.g1-review.temp.config.ts`，Vite `enforce:'pre'` transform 仅对 `ordered-action-session.ts` 在内存中把锚点 `if (signal.name !== step.expectedAction)` 改为 `if (false)`；插件断言锚点恰命中一次，运行输出 `G1_MUTATION_ANCHOR_HIT=1`。同一专测 **2 红/8 绿、退出 1**：错误材料断言 `:75`、同拍首错断言 `:103` 按预告变红。随后用 `apply_patch` 删除临时配置，`Test-Path` 为 `False`；正常专测 **10/10 PASS**。共享生产源码未变异。
3. **实证复现**：初版所谓“两份原型配方”实际上只有 3/2 步，与 `prototype-notes.md:16-17` 的 4/5 步不符；向施工者报告后，复读 `ordered-action-session.test.ts:18-32,58-69` 确认修成 4/5 步，并独立复跑 26/26。该 Major 验收缺口已关闭，不再作为现存缺陷。
4. **读告警**：邻近真实共装子集 `SYSTEM-GRAPH: PASS` 无环；全局审计退出 0，但打印 5 个“全局超集环”（phase 0/10/20），均不含 `ordered-action-session`，属于非真实共装信息。`system-graph.test.ts` 的 stderr `[L,P]` 环来自该测试刻意构造的 fidelity 用例，非 G1 新环。不能把“exit 0”说成“全局无环”。

## 未闭项与分级

- **Critical 0、G1 Major 0、G1 Minor 0**。G1 的当前冻结语义、点名测试与邻近子集定序可通过独立复查。
- **门禁 CONCERNS（阻断释放）**：独立执行 `npx tsc --noEmit` 退出 1；错误仅在 `games/game-card-reveal/s4-flow.test.ts`、`games/game-dice/dice-window{.ts,.test.ts}`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`，G1 文件零命中。这些是共享树其它项目的现存/并行类型问题，不在本复查文件所有权内，不能由“G1 测试绿”推断全量门禁绿。Owner 的全绿推送/释放门仍须真实闭合。
- 未执行 Git 范围核查（Owner 禁令）；本单依据已声明文件与只读源码/测试检查，不宣称 Git 差异或提交状态。`scoped-gate.mjs --run` 内含 Git 操作，本复查不运行。
- 本单仅为引擎 G1 复查；未审 S3 真实游戏装配、玩家手势、DokiWorld 接入，也未进行任何 Owner 审批。
