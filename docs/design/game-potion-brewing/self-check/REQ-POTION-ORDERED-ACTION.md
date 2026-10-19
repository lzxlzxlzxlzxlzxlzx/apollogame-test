# REQ-POTION-ORDERED-ACTION · G1 施工自检与独立复查导航

施工主体：Codex/root；Owner 本会话准许 G1–G4 以工单本地施工主体代替先推送锁。没有执行 Git/GitHub。当前结论为**G1 本体独立复查无未闭 Major；全库门禁仍红，尚未释放工单或把 G1 标为 delivered**。复查判词与撤修验红见 [`review/REQ-POTION-ORDERED-ACTION.md`](../review/REQ-POTION-ORDERED-ACTION.md)。

## 实现与边界

- 新增通用 `t2-ordered-action-session`，配置是 `acceptedActions` 精确动作全集、按书写序的 `steps[{expectedAction,requiredCount}]` 与成功/失败信号；运行态 `status/stepIndex/confirmedCount/lastAction/failureExpected` 全在组件，能快照续跑。
- 输入只消费全集内的完整具名 `Signal`；其它 UI 信号原样留给既有能力。同 tick 按 Signal 实体 ID 升序处理，同源同名只计一次，错误提交立即失败，末步只成功一次，终局后的动作拒收。没有在游戏层写规则或自由 handler。
- Commit 系统产出终局 Signal，后续 `effect-apply` 当拍可消费；终局信号下一拍回收。配置同时经递归 schema/refine 与运行期同一校验器拒收。DebugTrace 为 opt-in，四类闭集记录，每系统每 tick 最多三条，终局原因优先保留；不进 hash。
- 注册：协议组件、组件映射/全集/基线、静态与懒能力注册表及事件手册；G2/G3/G4 未入公共池也未施工。
- 独立复查发现初版所谓“两份配方”测试各只覆盖前缀。已按定稿原型补为月露 4 步/5 次提交、赤焰 5 步/6 次提交，并各核恰一次成功终局；修后 G1 专测 10/10 PASS，待复查人独立重跑。

## 请独立核的高风险点

1. 同 tick `Signal` 实体 ID 全序与 `source+name` 去重是否符合材料/搅拌双输入；尾步和额外输入并发时是否恰好一次终局。对应 `ordered-action-session.test.ts` 的“同拍”两例。
2. `acceptedActions` 同时承担“错动作范围”和“其它 UI 不误杀”的边界；外部宿主须把材料架的所有可提交材料动作都列入，而非只列正确步骤。
3. 相位定序：初版与 `discrete-combination-session`、`presentation-track` 等共装时有环；已加显式前后关系。请自行跑真实邻近能力子集审计，读所有 WARN，而不只看退出码。
4. 输出信号 ID、清理、快照恢复及非施工者独立撤修验红。施工者未在共享工作树做破坏性 sabotage；若复查也无法安全隔离，必须如实记为未完成。

## 已执行的验证

| 检查 | 结果 |
|---|---|
| G1 + 注册表/组件/manifest/系统图定向回归 | 最新复跑 6 files / 96 tests PASS（其中 G1 专测 10/10）；系统图测试的预置软环样例仍在 stderr 告警，已辨认为测试 fixture，不能忽略真实装配告警 |
| 懒注册表生成一致性 | `npx vite-node scripts/gen-capability-registry.mjs --check`：141 条同步，exit 0 |
| 组件全集和基线 | `build-component-map --check`、`component-manifest-guard` 均 PASS |
| G1 邻近 Commit 子集定序 | 初版 FAIL，补显式边后 `SYSTEM-GRAPH: PASS`；全局超集再跑亦 exit 0，五个超集组合环均不含 G1 系统；仍须按实际游戏子集审计 |
| ESLint | G1 相关 5 个 TS 文件 exit 0 |
| `docs-ref-guard` | PASS，46 个 Markdown、396 路径 |
| `npx vite build` | PASS，770 modules；仅 chunk-size warning |
| 全库 `tsc --noEmit` / `npm run build` | FAIL：仅命中其它项目的 card-reveal、dice、theft 与 launcher 类型错误；G1 文件零命中，不能宣称全量门禁绿 |
| `context-budget-guard` | 最新 FAIL：`docs/playbooks/ui.md` 109>100、`docs/design/game-simlife/requests.md` 45111>45000；G1 公共池自身仍在容量内，非本单更改 |
| `scoped-gate.mjs --run` | 未运行：脚本内执行 `git diff`/`git ls-files`，Owner 禁令禁止 agent 执行任何 Git 包装命令 |

## 未完成与释放条件

- 独立复查与带锚点的内存变异验红已闭合；当前唯一阻断是全量门禁不绿。不得改 `capability-gaps.json` 为 `delivered`，不得从公共池删 G1，也不得把 S3 解锁。
- 全量门禁真实闭环后需再核本单与并发变更，才按“入池→施工→复查→释放”处理 G2。
