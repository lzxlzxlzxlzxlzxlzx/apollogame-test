# Review 单 · `CAPGAP-RHETORIC-001` 声明式身份卡牌效果

| | |
|---|---|
| 工单 | `CAPGAP-RHETORIC-001`（owner 已裁决路线 A） |
| 施工 | Codex（工单抢锁已登记） |
| 复查 | 独立复查人（PASS） |
| 提交 | 待用户个人远端分支可用后创建；当前不得伪称已推送 |
| 改动面 | `src/skills/tier2/identity-card-play.ts`、其测试、tier2 export、capability registry 与生成索引、`docs/workflow/requests.md` |

## 做了什么

1. 新增 `t2-identity-card-play`：它只解释版本化 `CardCatalog` 的 `cardId`、费用、副本上限和闭集资源效果，既有数值牌 capability 不改。
2. 新增身份牌 `deck / hand / discard` 的种子洗牌、抽牌、时序出牌与弃牌回收；所有非法路径 fail-closed 并按需留下 `DebugTrace.reject`。
3. 将效果结构收紧为 schema 闭集：唯一 `modify-resource`，唯一操作 `add / set`（与既有 `f1-resource` 对齐），没有 JS、表达式、回调、自由文本或视觉字段。

## 复查请逐条核

| # | 核什么 | 怎么自己验 | 施工自验 |
|---|---|---|---|
| 1 | 加法能力且不抢数值牌语义 | 对比 `identity-card-play.ts` 与 `card-pile.ts` / `card-play.ts`；确认旧文件未改 | 是 |
| 2 | 目录和效果是闭集结构 | 检查 `CardCatalog` 的 `catalogCardSchema` / `closedResourceEffectSchema`，再以未知 `kind` 运行测试 | 是 |
| 3 | 同 seed 逐拍一致、洗牌/抽牌/弃牌正常 | `npx vitest run src/skills/tier2/identity-card-play.test.ts` | 7/7 绿 |
| 4 | 未知牌、手牌外、专注不足、非法效果、副本超限均拒绝 | 同上第 2-5 项；检查资源和牌区未写入 | 7/7 绿 |
| 5 | 效果声明顺序与 trace | 同上最后一项；确认 `set 2` 再 `add 3` 得 5，未知牌有 `reject` | 绿 |
| 6 | registry、系统拓扑与类型 | `npx vitest run src/assembly/capability-registry.gen.test.ts src/assembly/registry-guard.test.ts src/assembly/system-graph.test.ts`；`npx tsc --noEmit` | 23/23 绿；tsc 绿 |
| 7 | 撤修真的会红 | 临时撤掉 effect 执行或 `handIndex` 拒绝守卫，带命中断言重跑定向测试 | 待独立复查实证 |
| 8 | 共享门禁 | 按 FULL 路径跑 eslint / depcruise / tsc / vitest / build / guards，并读 stderr | build、docs-ref、tsc 绿；见下方基线阻塞 |

## 重点看

1. `identity-card-play` 在 Intent，相位后续的 `resource-apply` 在 Update 同拍消费 `ResourceModify`；请确认这既让条件能看见结果，又不与 `flow` 组装成环。
2. 费用资源在 v1 固定为已有资源 `focus`；效果目标仍由 `allowedResources` 显式批准。请确认这是任务规定的最小闭集，而非隐含 DSL。
3. `IdentityCardCommand.consumed` 防止同一命令重复结算；第二张同 `cardId` 命令会因已不在手牌拒绝。请复验这一点。

## 已知未做 / 基线阻塞

- 本单不接游戏数据、DokiWorlds SDK、UI 或真实美术；这些都必须等待阶段 1 独立复查、门禁和远端提交完成。
- `scoped-gate --run` 因当前本地 Git 元数据没有可识别改动而误判 `NONE`；已手工执行 FULL 等价步骤。
- FULL 的 `depcruise` 命中两条既有违规：`src/engine/host/{three-dice-overlay,dice-overlay}.ts -> src/skills/atoms/random/index.ts`，不在本单改动面。
- 全量 Vitest 命中既有 `scripts/art-replace.test.mjs` 三失败；身份卡、registry、拓扑定向测试均绿。
- 台账守卫所需 Python 运行时在当前主机不可用；构建和 docs-ref guard 已通过。

## 独立复查判词

**PASS。** 复查人独立复跑身份卡 11/11；身份卡、资源链、声明审计、registry 与系统图同轮 62/62 通过。`system-graph` stderr 只有测试自身 L/P 的预期造环，身份牌没有新增 topo 告警。

复查人还在临时副本完成四项带锚点撤修验红：撤 `pileProblem` 后非法 `handLimit` 的 reject 断言转红；撤聚合 reject 落盘后未知卡和四命令 trace 断言转红；费用 `ResourceModify` 改为 0 后费用及 observer 双断言转红；撤重复 cardId 拒绝后抽牌前拒绝断言转红。临时操作未改共享工作树。

## 补充 A · 受控输入映射（2026-09-23）

owner 选择路线 A 后，`IdentityCardInput` 进入同一 capability：它只按闭集的 `InputQueue.actions` 的 `key / phase / source / arg` 匹配，把非空 `arg` 原样映射为 `IdentityCardCommand.cardId`。它不解释 cardId、不含回调或游戏规则；缺参/非法 mapping/未知卡均 fail-closed 并写 `identity-card-play` 的 reject trace。系统落在 Input 相位，早于 Intent 的 `identity-card-play`，相位棘轮显式登记 `p-20:identity-card-input`。

独立复查 PASS：身份牌、registry、declaration-audit、system-graph 合计 38/38 通过，`tsc --noEmit` 退出 0，能力子集图无环。复查人在临时副本将 `event.key !== input.action` 撤成反向匹配，合法 action 的 focus 锚点由 1 回退为 3、退出 1；证明路由测试真实覆盖输入到命令的接缝。
