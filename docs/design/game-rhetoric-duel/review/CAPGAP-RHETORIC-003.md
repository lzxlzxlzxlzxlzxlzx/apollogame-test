# Review 单 · `CAPGAP-RHETORIC-003` 玩法输入声明式条件门

| 项 | 证据 |
|---|---|
| 初审提交 | `3fc05a5954f0a55633d1299b94fbe8b12ae75eb9`（FAIL） |
| 返修提交 | `4938f11df0b0b97b6d3877091721b4479bc6914a` |
| 施工 | Codex |
| 复查 | 独立复查 agent（与施工人分离） |
| 最终结论 | **PASS** |
| 改动面 | `KeyBinding.when`、`IdentityCardPile.playWhen`、协议类型、递归 schema 与目标测试 |

## 最终判词

返修已经闭合初审阻断点。`KeyBinding` provider 现由 `defineComponent` 定义，`when` 使用 `t.opt(ConditionExprSchema)`；它与 `IdentityCardPile.playWhen` 共用同一递归条件语法和 `evaluateCondition` 求值器。独立验证确认：合法嵌套条件通过，未知 kind、缺字段、非法比较符均在 manifest 落盘门拒绝。

运行期两道门也成立：门关时 KeyBinding 不产 Signal，身份牌命令不移动牌、不扣费、不施效，且均写聚合 `reject` trace；门开时原命令形状正常结算；字段缺省保持旧行为。引擎代码没有言弹游戏 id、专属 action 或按 `cardId` 解释规则的分支。

## ① 独立复跑

| 命令 | 结果 |
|---|---|
| `node node_modules/vitest/vitest.mjs run src/skills/tier2/keybind.test.ts src/skills/tier2/identity-card-play.test.ts src/assembly/validate-manifest.test.ts src/assembly/declaration-audit.test.ts src/assembly/system-graph.test.ts` | 退出码 **0**；5 files、57 tests 全绿 |
| `node node_modules/typescript/bin/tsc --noEmit` | 退出码 **0** |
| `node node_modules/vite/bin/vite.js build` | 退出码 **0**；677 modules transformed |
| `node node_modules/vite-node/vite-node.mjs scripts/system-graph-audit.mjs t2-keybind t2-identity-card-play` | 退出码 **0**；3 systems，可排、无环，`SYSTEM-GRAPH: PASS` |
| `git diff 4938f11d^ 4938f11d --check` | 退出码 **0** |

落盘门独立核对结果：

- `{kind:'and', of:[{kind:'flag', ...}, {kind:'resource', cmp:'gte', ...}]}`：零 error；
- `{kind:'not-a-condition'}`：拒绝；
- `{kind:'flag', equals:true}`（缺 `id`）：拒绝；
- `{kind:'resource', id:'focus', cmp:'approximately', value:1}`：拒绝。

## ② 撤修验红（返修提交临时副本，未改共享工作树）

临时副本固定到 `4938f11d`，使用三个精确锚点同时撤掉本件承重修复：

1. `when: t.opt(ConditionExprSchema, ...)` → `when: t.opt(t.str('sabotage...'))`；
2. `if (kb.when && !evaluateCondition(...))` → `if (false && kb.when && !evaluateCondition(...))`；
3. `if (!playGateOpen)` → `if (false && !playGateOpen)`。

`rg` 分别精确命中 `keybind.ts:51`、`keybind.ts:99`、`identity-card-play.ts:164`，各一处。随后运行两个目标测试文件，退出码 **1**，得到 **3 failed / 27 passed**：

- 合法嵌套 ConditionExpr 被错误 string schema 拒绝；
- KeyBinding 门关后错误地产生 Signal；
- 身份牌门关后错误地把牌移出手牌。

三组新增断言均真实承重，不是假绿。

## ③ 实证复现与返修闭环

初审曾在临时用例中把 `KeyBinding.when` 与 `IdentityCardPile.playWhen` 同时设为 `{kind:'not-a-condition'}`。初审提交的实际结果是：

- `KeyBinding.when` 得到 `errors=[] / warnings=[]`，非法结构静默穿过；
- `IdentityCardPile.playWhen` 正确产生 schema error。

根因是 KeyBinding 仍使用旧式手写 provider，并把 `when` 声明成占位 `string`。返修提交已经将其迁为 `defineComponent`，且正式测试覆盖合法嵌套条件、未知 kind、缺字段和非法比较符。复跑全部通过，初审复现不再成立。

## ④ 告警判读

- 目标测试 stderr 的 `[topological-sort] ... [L, P]` 来自 `system-graph.test.ts` 明确构造的 fidelity 环用例，不是本提交的真实系统。
- 真能力子集审计为无环、无重复 system id、无悬空显式边；本提交没有新增定序告警。
- 生产构建仅有既有的大 chunk 提示，不影响本能力语义。
- `DebugTrace` 的实际追加未列入 writes，符合 declaration-audit 对 DebugTrace 观测面的统一豁免。

## 边界与声明核查

- `KeyBinding.when` 只在 key/phase 已命中后求值；门关不产 Signal，并将同拍拒绝聚合为最多一条 trace。
- `IdentityCardPile.playWhen` 在 cardId 存在性检查后、时序/手牌/费用检查前拒绝；命令当拍标记 consumed，不会在门开后延迟偷跑。
- 条件读取面如实声明 `Resource/Flag/State/Cooldowns/Timer/StringVar`；KeyBinding 只写 Signal，身份牌仍只写 `ResourceModify`，没有直接写 Resource。
- KeyBinding 保持原 Update 相位与 `runsAfter: ['event-when']`；身份牌输入/结算仍在 Input/Intent，相位图未被返修改变。
- 可选字段缺省的既有测试全绿；无游戏专属 id、URL、视觉数据或自由回调进入模拟。

**结论：返修通过独立复跑、三锚点撤修验红、实证复现闭环与告警判读，`CAPGAP-RHETORIC-003` 可关闭并进入 W2 消费。**
