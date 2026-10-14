# GAP-POTION-01 / G1 · 通用有序动作会话

> 历史施工规格，**G1 已于 2026-10-13 按炼药项目范围交付并从公共池释放**；权威当前判词见 [G1–G4 独立复查](../review/G1-G4-scoped-release-2026-10-13.md)。下列规格/旧复查边界用于追溯，不再作为当前阻塞。Owner A 裁决原文见 `../archive/requests-through-s2-2026-10-12.md`。

- 施工主体：Codex/root（Owner 特许 G1–G4 本地施工主体为领工锁，无须先推送）；涉及定序、快照与新 system，只归主程。能力名 `t2-ordered-action-session`。
- 输入：严格闭集 `steps`，每步完整具名 `expectedAction` 与有界 `requiredCount`；投料 `brew.add.<ingredientId>`，搅拌 `brew.stir.clockwise|counterclockwise`。配方全量材料 ID 经启动适配器校验后映射为动作名；Signal 无 `arg`，按动作全名匹配，不从 UI 文案、图片 URL 或显示色推断规则。
- 行为：仅消费本会话声明的 add/stir 玩法动作；其它 UI 信号不等于错误。单 tick 有序处理；短弧与锅外释放未形成动作，不进入会话。匹配则增步或圈数，尾步立即锁定并唯一 success；已提交但不匹配则立即 failure；终局后输入 reject。重复材料、同拍多动作须有明确全序与去重。
- 可观测：仅步骤 index、已确认圈数、终局及必要有限状态入权威 World；DebugTrace 仅 decision/transition/reject/commit，每 system 每 tick ≤3 条，关闭时真正 no-op。UI 只读投影，handler 不写世界。
- 验收：两份原型配方、重复材料、反向有效圈、非当前类动作、其它 UI 信号、同拍尾步多输入、终局幂等、快照恢复同轨同 hash、输入顺序扰动有确定裁决；锚点撤修验红、独立复查、系统图新增环告警为零。不得在游戏层自写解释器。
- 旧审查：`../review/REQ-POTION-ORDERED-ACTION.md` 在原全库门口径下为 CONCERNS；后续 Owner 明确裁决并行项目红项不阻炼药，经新的项目范围独立复查 PASS 后已改 `delivered`。全库门仍不宣称通过。

