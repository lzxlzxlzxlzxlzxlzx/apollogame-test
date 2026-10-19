# 独立复查 · GAP-LOCKPICK-01 `t3-discrete-combination-session`

| 项目 | 证据 |
|---|---|
| 施工单 | `GAP-LOCKPICK-01`，owner 裁决 A（通用 Tier 3 能力） |
| 复查人 | Codex/root/lockpick_independent_review（非施工人） |
| 范围 | `src/skills/tier3/discrete-combination-session.ts`、协议/注册/手册接线，以及定向测试 |
| 结论 | **PASS（仅引擎关）**；允许进入 `game-lockpick` 构建。S4–S8 尚未在本单宣称完成。 |

## 独立复跑

在项目根目录执行：

```powershell
npx vitest run src/skills/tier3/discrete-combination-session.test.ts
```

最终结果：**11/11 passed**（2026-09-29）。测试覆盖 Commit 定序、同种子、初始目标非全初值、即时 exact-match、1000 次非完成输入、严格具名 Signal、无 seed/非法配置 fail-closed、trace 上限、终局幂等及拒收 trace、Signal 一次消费、快照续跑和 DebugTrace hash 排除。

静态接线复核：能力登记于 Tier3 barrel、`component-map` 和 capability registry；协议运行态只含 `status/target/current/matchCount`；事件逻辑手册列出五个具名 Signal。实现没有 moves、attempts、timer、deadline、durability 或 penalty 状态。

## 撤修验红（每次均带唯一锚点，完成后原样恢复）

| 破坏目标 | 临时锚点改动 | 预期与实测红灯 | 恢复后 |
|---|---|---|---|
| 目标不得等于初始向量 | `targetFor` 的 `while (target.every(...))` 临时改为 `while (false && ...)` | `生成目标不等于全初始值，并且同 seed 完全一致` 失败：seed 11 得到全 `1` 向量（1 failed / 10 passed） | 原 `while (target.every(...))` 已恢复；11/11 green |
| 终局只能写一次 | 同时绕过 `finalize` 的 success/failure 早退和输入的 `status !== 'playing'` 门 | 终局后 give-up 把 receipt 从 `success` 覆写成 `failure`；终局幂等与 reject 断言失败（4 failed / 7 passed） | 两个门均已恢复；11/11 green |
| 终局输入必须拒收并留 trace | 仅把输入的 `if (session.status !== 'playing')` 临时改为 `false && ...` | success 与 failure 两条终局后输入用例均因没有 `reject` trace 失败（2 failed / 9 passed） | 拒收门已恢复；11/11 green |

恢复后的锚点只读核对：`targetFor` 保留初始向量重抽条件；输入循环保留 `status !== 'playing'` 拒收门；不存在 `false &&` 残留。

## 判词边界

本次通过只证明引擎能力符合 GAP-LOCKPICK-01 的确定性、唯一终局和拒收约束。游戏层不得复制目标生成、向量比较或终局逻辑；后续仍须单独复查 LayoutNode UI、SDK 严格 I/O、资产闭包、真渲染与 S8 全门禁。
