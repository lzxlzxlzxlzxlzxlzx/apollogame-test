# R3-B3 独立复查报告

日期：2026-09-17。复查对象仅为 `review/r3-b3-freeze-20260917/frozen-source-v2`。未修改共享施工源、冻结副本或矩阵。

## 结论：退回，B3 不签核

B3 的定向行为、类型检查与 R3 调度审计可以在冻结副本独立复现，但该副本不是可完成项目门验证的完整工程快照：构建失败，MC Fight 全量回归也失败。因而 44/84 的 `passed-program` 不能提升为独立复查通过；矩阵的 `r3IndependentReview` 应保持 `pending`。

## 独立复跑

| 检查 | 在冻结副本执行的命令 | 退出码 | 结果 |
|---|---|---:|---|
| B3 定向身份与可视化夹具 | `node node_modules/vitest/vitest.mjs run games/game-mcfight/r3-b3-production.test.ts games/game-mcfight/s2-visual.fixture.test.ts --maxWorkers=1 --minWorkers=1` | 0 | 2 文件、15 项通过。覆盖八单位点名身份，以及冲锋、俯冲、变身观察夹具。 |
| 类型检查 | `npx tsc --noEmit` | 0 | 通过。 |
| R3 审计 | `node node_modules/vite-node/vite-node.mjs scripts/mcfight-r3-audit.ts` | 0 | 4 图均为 `cycles=0`、`unknown=0`。 |
| 构建 | `npm run build` | 1 | 失败：入口 `index.html` 未包含在冻结快照，Vite 无法解析入口模块。 |
| MC Fight 全量回归 | `node node_modules/vitest/vitest.mjs run games/game-mcfight --maxWorkers=2 --minWorkers=2 --reporter=dot` | 1 | 47 文件中 46 通过、1 失败、1 跳过；不是程序证据声称的 47 文件、325 通过、1 历史跳过。 |

全量失败的可复现原因是 `games/game-mcfight/r2-content.test.ts` 读取 `docs/design/game-mcfight/self-check/r2/s4-before.json`，该文件未被收入冻结副本，报 `ENOENT`。这与构建入口缺失共同证明 freeze manifest 的 `excluded`/收集范围不足。

## 身份与公共能力复核

定向场景实际运行，以下生产行为可以观察到：

- 大象、米诺菇在远距离产生冲锋伤害；
- 恼鬼的俯冲场景产生伤害且 Flow 进入 `Active`；
- 瞻远者产生三次 10% 最大生命值射线和至少五次 6 伤害；
- 沙漠蛛蜂仅对节肢目标写入 `MobilityLock`，且不写硬控位；
- 飞行娜迦产生 4 伤害毒弹、8 伤害俯冲，并使目标带 poison；
- 诡异蚊鬼在同一 body 上变身并能发射变身后投射物；
- Teleto 走真实投射物与命中回执链。

但当前冻结内的 8 项点名测试不能替代所有合同边界：例如 SkillCycle 的失败不推进、米诺菇双实例 CD 隔离、MobilityLock 不取消已开始 Flow、RelationOrbit 在目标失效时停止，以及 poison 的刷新/来源/持续伤害，都没有单独可识别的 B3 生产断言。复查规则禁止改动冻结副本，因此未在该快照内执行撤修；现有测试也不足以用替代断言证明这些撤修均会验红。

## 可视化证据

冻结副本含 B3 三个场景的测试夹具，但不含程序证据所列 `self-check/r3/b3-visual/01-charge.png`、`02-dive-window.png`、`03-transform.png`。由于入口文件亦缺失，无法在该副本内启动网页并独立复现操作截图。现有夹具测试只能作为逻辑观察证据，不能替代所声明的浏览器画面证据。

## 退回修复要求

1. 重新制作**完整且自包含**的 B3 冻结副本：至少纳入 `index.html`、所有被测试读取的 `docs/design/game-mcfight/self-check/r2/s4-before.json`，以及声明为验收证据的 B3 可视化截图或可在副本中复现截图的入口与步骤。
2. 在新冻结副本根目录实际复跑：B3 定向、类型检查、审计、`npm run build`、MC Fight 全量回归；记录每条命令、退出码与最终摘要。
3. 增加或纳入独立的 B3 边界测试，使下列撤修可识别失败：取消 `SkillCycle` 成功启动限制；让 MobilityLock 取消 Flow；让 FormChange 创建替代 body；让 RelationOrbit 在 Relation 无效时继续写速度；移除 poison 的刷新/来源或周期结算。
4. 不得以共享工作区的成功日志替代冻结副本的复跑结果。完成以上后重新冻结、提交独立复查。
