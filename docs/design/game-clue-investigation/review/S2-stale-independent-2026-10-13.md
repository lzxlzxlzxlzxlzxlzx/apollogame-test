# S2 stale 独立复查 · 2026-10-13

复查人：`/root/s2_stale_recheck`（非 S2/S4 施工者）。判词：**CONCERNS**；S2 的纯数据/通用能力路线仍成立，但能力计划的消费清单未随 S4 实现重组更新。本判词不替代 Owner 人门，也不宣称 S4 或全库门禁通过。

## 范围与实证

- `node scripts/game-pipeline.mjs checklist game-clue-investigation S2` exit 0，逐项覆盖范围、registry 实名、解释器、例外、美术。
- `git diff --stat` exit 0：共享工作树有 82 个已跟踪文件的并行修改与若干未跟踪文件；本轮 S2 的 `capability-plan.md`、`capability-gaps.json`、合同文件均无已跟踪 diff。无法把整树改动归给 S2 施工者，故不把无关并行差异误判为 S2 越界。`games/game-clue-investigation/acceptance-adapter.ts` 是 42 行验收接线，无规则解释器。
- `src/skills/**` 与 `src/assembly/capability-registry.ts` 实查：计划列出的 14 个 capability id 均有实际定义并进入 registry 组合；`GCI-S2-01/02` 是工单标识而非伪造 registry id。当前 manifest 的 11 个声明 capability 均由真装载验证。
- `npx vitest run src/assets/host-visual-bridge.test.ts src/assets/asset-manager.test.ts src/skills/tier2/clickable.test.ts src/assets/import/hit-mask.test.ts src/assets/asset-index.test.ts src/assembly/validate-manifest.test.ts src/renderer/renderable.test.ts src/assembly/component-map.test.ts --reporter=dot`：受控本地环境 exit 0，**8 files / 120 tests PASS**。沙箱首次 exit 1 为 Windows `realpath EPERM`、0 tests，未计作业务失败或通过。
- `Get-Content library/game-clue-investigation/manifest.json -Raw | npx vite-node scripts/manifest-check.mjs`：受控本地环境 exit 0，真引擎 parse/load/2 tick，`warnings:[]`。沙箱首次同为 `realpath EPERM` exit 1，未采信。
- `node scripts/game-skill-audit.mjs game-clue-investigation` exit 0，`RATCHET: PASS`、零红旗；读到 `AUDIT: WARNINGS`：无正式美术台账，属于尚未施工的 S6，不能称全绿。
- `node scripts/docs-ref-guard.mjs` exit 0，48 文档/399 引用，`DOCS-REF: PASS`。

## 撤修验红与复现

只在内存副本中对 `capability-gaps.json` 做破坏，**未改共享磁盘文件**：先断言 `(id === 'GCI-S2-01' && state === 'delivered')` 唯一锚点命中 **1**；原 `evalCapabilityGaps` 为 `ok`。将该项改为 `open` 后，同一真实判定函数变为 `warn`，`blockingGaps(..., 'S3')` 精确返回 `GCI-S2-01` 一条。命令 exit 0（其内断言若未转色即抛错）；这证实 S2 缺口门不会对未裁缺口假绿，且无恢复共享文件的风险。

实证偏差：`capability-plan.md:21` 仍将 `j1-state` 列为消费能力，而当前 `manifest.json:157-170` 未声明它；`manifest.json:267` 与 `:300-306` 使用 `f1-resource` 的 `selected-object` 加 `Effect/GameFlow`。`requests.md:37` 记录了 `j1-state ↔ t3-flow` 软环、3/4 测试转红及重组缘由。此为能力计划与已实现数据的文档偏差，**不构成游戏层自由代码**，亦未改变完成/取消或 DokiWorld 权威合同。S4 的 `presentation.pointerFeedback`（`manifest.json:9`）是经 Owner A 裁决的通用只读投影、走声明数据；不应反向认作新的游戏专属解释器。共享 pointer 反馈独立复查尚有 CONCERNS，属 S4 自己的后续门，不在本次 S2 复查冒称通过。

## 结论边界

S2 检查表的能力实名、数据解释器、零例外和 §4.5 美术接入均有证据；因此判 **CONCERNS（非 FAIL）**，可作为 S4 机器门前置的已复查 S2，但不能据此宣称 S4 或 S6 完成。建议施工方在保持 Owner 已冻结产品合同的前提下给能力计划补一条 `j1-state → f1-resource` 的实现偏差附注；如认为这改变 Owner 所批 S2 范围，应先由 Owner 裁决，复查人不代裁。
