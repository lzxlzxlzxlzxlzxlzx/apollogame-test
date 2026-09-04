# game-105 v2.1 Local AI M1 程序施工合同

> 策划交付：2026-08-27。仅在 owner 对修订 S2 签核且独立复查通过后生效。
> 允许改动范围为 `games/game-105/` 及其直接测试；不得修改引擎、渲染器、Apollo 服务端或创作台接口。

## 施工目标

实现 [GDD](gdd.md) 和 [能力计划](capability-plan.md) 的 Local AI M1：内置 AI 对手、真实可见抽塔、本地模板回应和本局心动值。运行时 LLM 和外部陪伴宿主均不施工。

## 硬约束

1. `LocalAIObservation` 只能使用布局、已结算历史、离塔集合、当前回合、公开选择状态和本游戏已消费的物理信号；不得读取 `Transform3D` 或 Cannon 私有状态。
2. 抽出唯一共享动作执行器。玩家事件和 `AITurnDirector` 必须通过它操作同一 `Camera3D`、悬停、`Joint3D`、释放和清理路径。
3. AI 动作只允许 `observe`、`hover`、`grab`、有限 `pull`、`release`、`cancel`、`restart`；禁止刚体直写、瞬移和 LLM 逐帧控制。
4. `CompanionReplyPort` 的 M1 实现必须是本地模板，不允许请求 `/api/generate`、`/api/agent/chat` 或第三方模型。
5. 倒塌锁定后物理继续运行；取消、重开、倒塌均不得留下关节、选中态或 AI 待执行动作。

## 必需测试

- 观察对象对未知块、非法阶段和非法信号拒绝动作；不含连续 transform 或风险字段。
- 玩家和 AI 对同一固定动作脚本得到同类型的关节/释放路径；AI 回合具备可观测镜头、悬停、渐进拖拽。
- AI 取消、重开、倒塌锁定后无残留关节、选中态和动作。
- `careful`、`natural`、`thrill` 只改变策略参数，均无额外物理权限。
- 模板端口在无 API Key/断网条件下完整返回；替换 fake port 不改变物理和效果结算。

## 交付边界

程序报告应包含实际文件/符号、测试命令、真实 Chrome 探针、失败情形和剩余风险。不得修改 GDD、卡池、惩罚数值、心动值公式或未来 Host LLM 契约；这些问题回交 GD。
