# game-105 Host Integration M2：S3 历史设计

> GD-105 · 2026-09-02 · **非当前 S3 验收输入**。独立可玩版以 `s3-standalone-release.md` 为唯一 S3 施工单；本文件仅保留给未来 M2 恢复 Host Integration 时使用。

## 完成定义

游戏以 `@dokiworld/app-sdk@^3.0.0` 作为 DokiWorld App 初始化，线协议保持经 witness 确认的 `protocolVersion: 2`。Host 可注入可选会话、角色、Persona 和 `dialogue` 能力；缺失时游戏使用本地默认角色和模板端口，不阻止运行。

S3 只交付接缝与安全边界：初始化、上下文归一化、受限 `resolveAIReply`、结果白名单投影、卸载/重开 token 与完成 idempotency。它不在本阶段证明真实模型质量，也不改变 AI 物理策略。

## 验收

1. 真 SDK witness 能启动、挂载、完成并返回 `doki.game.result/1`。
2. `apps.launch` 仅存在于 Storyteller/Host，游戏侧无此调用和模型密钥。
3. Host 输入缺失、dialogue 未授权或 adapter 异常均进入模板降级。
4. 结果不含玩家自由输入、聊天历史、原始物理数据或非白名单指标。
5. 重开/卸载后晚到回复被忽略；同一完成结果不会被游戏侧重复发出。
6. S3 专项、类型检查、浏览器探针和机器门对当前指纹完整通过后，才可独立复查。
