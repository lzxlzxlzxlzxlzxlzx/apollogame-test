# GAP-LOCKPICK-01 · `t3-discrete-combination-session` 引擎规格

**裁决**：owner 于 2026-09-29 选择 A；这是引擎 Tier 3 确定性解释器，而不是 `game-lockpick` 的专属 system。

## 公开数据面

| 组件 | 作者填写 | 系统运行态 / 约束 |
|---|---|---|
| `DiscreteCombinationSession` | 唯一寻址 `id`、`slotCount`、`valueCount`、`initialValue`、可选 `initialStrategy:'constant'|'random'`、`setSignal`、`giveUpSignal`、`feedbackSignal`、`successSignal`、`failureSignal` | **仅** `status`、隐藏 `target[]`、`current[]`、`matchCount`；长度 1..64，值域 2..64，`initialValue` 在值域内。缺省策略为 `constant`，兼容原有全槽初值 |
| `DiscreteCombinationInput` | `sessionId`、`action:'set'|'give-up'`、可选 `slot` / `value` | `set` 必须有安全整数 slot/value 且在值域；`give-up` 不带业务参数；每条 intent 只消费一次 |
| `DiscreteCombinationReceipt` | 无 | 仅第一次终局写入 `{ sessionId, outcome:'success'|'failure' }` |

## 确定性及语义

1. 第一次 execute 初始化为 `ready`，随后立即从世界唯一 `RandomSeed` 生成运行态。缺省 `constant` 策略令 `current` 全为 `initialValue`（原有语义）；`random` 则逐槽取值生成 `current`。两种策略都继续用同一随机序列生成 `target`，若 target 与 current 向量相同则确定性重抽，故开局绝不成功；`matchCount` 在启动时即按两向量的实际 exact-position 匹配数计算。没有 `RandomSeed` 或配置非法时 fail-closed：保留 `ready`、不产生 outcome，并在 opt-in trace 记 `reject`。
2. 合法 `set(slot,value)` 立即写 `current[slot]` 并重算 exact-position `matchCount`。每次合法 set 均发整体反馈 Signal，arg 只含整体等级（`none|some|all`），绝不泄露 target、matchCount 或单槽正确性。值未变仍是合法的用户提交，重算并反馈，但不是失败资源。
3. `matchCount === slotCount` 同一提交转 `success`；只有 `give-up` 转 `failure`。不含 moves / attempts / timer / deadline / durability / penalty；关闭、dispose、失焦与无输入都不是失败输入。
4. `success|failure` 后一律拒绝新输入；`DiscreteCombinationReceipt` 只写一次，终局 Signal 只发一次。`setSignal` 的 arg 严格为 `slot:value`；`giveUpSignal` 不接收 arg；输出严格使用配置的 feedback/success/failure Signal 名。
5. 系统在 `Commit`，消费 intent，声明 `runsBefore effect-apply/craft-recipe/weighted-spawn/matrix-duel-intent/cooldown`；所有 session 及输入按稳定 id 排序。它 RMW `RandomSeed`，在既有 `progressive-risk-session`、`risk-reveal-wheel` 之后，避免 RNG 定序软环。
6. 状态是 plain components，进入 World snapshot/hash；`DebugTrace` 保持既有 non-deterministic 排除规则。trace opt-in、单 tick 最多 3 条：生成 `decision`，生命周期 `transition`，非法/终局/无 seed `reject`，合法写入/终局 `commit`。

## 注册及验收

能力 id 必须为 `t3-discrete-combination-session`，登记 Tier3 barrel、component-map、capability registry，并在 logic playbook 的会话项补一行。验收含：异 seed、同 seed、快照续跑、值域、1000 次 hard 非完成移动不失败、非法输入、终局幂等、目标不等于初始、trace 和撤修验红（移除“不等于初始”、终局闸、终局拒收三刀）。
