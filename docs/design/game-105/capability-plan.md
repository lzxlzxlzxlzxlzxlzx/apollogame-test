# game-105 S2 能力计划：Host Integration M1

> GD-105 · 2026-09-02 · 独立可玩版以 `standalone-release-freeze.md` 为最高优先级；Host Integration 文档保留为 M2 设计，不是当前 S2--S8 的交付输入。

## 1. 本次裁决

目标是完成无需 Storyteller、网络或模型凭据的独立可玩版。AI 的抽塔始终由游戏本地确定性策略和共享 3D 执行器完成，AI 卡牌文字使用本地模板。已有 Host 接缝保留但默认不启用；结算不要求外部回传。

`@dokiworld/app-sdk` 的包版本为 `3.0.0`，当前游戏参考使用的线协议为 `protocolVersion: 2`。两者不是同一版本号；S3 必须以真实 SDK witness 锁定这一组合，游戏不得自行升级线协议。

## 2. 能力清单与边界

| 能力 | 责任方 | M1 结论 | 验证方式 |
| --- | --- | --- | --- |
| 54 块真物理、实时倒塌、退役积木 | game-105 | 已有，继续沿用 | 游戏专项与 S4 剧本 |
| 玩家/AI 共享相机、悬停、`Joint3D`、释放 | game-105 | 已有，继续沿用 | 共享执行器回归 |
| 公平 AI 观察与选块 | game-105 | 采用受限本地快照 | 不含 Transform/Cannon/风险值的测试 |
| Storyteller 启动与上下文注入 | M2 | 本版不启用 | M2 真 SDK witness |
| AI 卡牌文字 | game-105 本地模板 | 本版交付 | 无 Host 完整游玩 |
| 结果完成与去重 | M2 | 本版不要求 | M2 同一 `(runId,resultId)` 重放 witness |
| 长期记忆、关系档案写入 | 外部陪伴服务 | 不在 M1 | 不得由游戏调用 |

## 3. 替代裁决与开放缺口

### L1：游戏内公平观察替代 E4

游戏构造可注入的 `LocalAIObservation(layout, history, extracted, retired, turn, selection, consumedSignals)`。它不包含连续坐标、速度、Cannon 私有状态、接触面或“安全概率”。这是 game-105 专用替代，不宣称平台已经提供通用 AI 观察能力。

### L2：游戏内共享动作执行器替代 E5

玩家和 AI 只能经同一个动作执行器控制 `Camera3D`、悬停、`Joint3D` 和释放。AI 不得直写刚体、瞬移、预设成功或冻结物理。这是 game-105 专用替代，不宣称平台已有通用 AI 抽拉控制器。

### E6-A：协议与结果 witness（已交付）

确定性本地 Host 已使用真实 SDK 验证：`Host -> Storyteller -> apps.launch -> game-105 -> doki.game.result -> Storyteller 续聊`，并验证重复完成消息只被接受一次。它证明协议、启动和结果去重，不证明真实模型质量或可用性。

### E6-B：真实模型 Host witness（M2 延后）

拥有 Host 模型凭据的负责人必须提供受控环境，独立留下以下证据：

1. 真实模型成功回复 AI 主卡和 AI 惩罚卡。
2. 超时、拒绝/未授权、空文本分别降级为一次模板回复。
3. 重开或卸载后的晚到模型回调不会写入新局或旧局。
4. Storyteller 收到的结果不含玩家自由输入，重复结果只续聊一次。

此缺口不属于独立可玩版的 S2--S8；它转入 Host Integration M2。当前版本必须证明无 Host 条件下的模板 AI 可完整游玩，而不是伪造真实模型成功。

## 4. 纯程序化美术例外

M1 继续使用已签核的程序化塔体、暖色背景、AI 悬停描边、可替换默认头像和任务卡皮肤槽。正式贴图/立绘不在本次 Host Integration 改动范围；不得为接入模型而改变 S5 已冻结的结构布局。真实模型等待、模板降级、AI 卡牌和 AI 惩罚卡只能复用既有互动卡区域与状态层。

## 5. S2 通过条件

1. 能力台账准确区分“确定性 SDK witness 已交付”与“真实模型 Host witness 延后至 M2”。
2. 游戏在无 Host、无网络、无模型凭据下仍能以模板 AI 完整游玩。
3. Host adapter 不得改变物理、卡牌、心动值或本地运行路径。
4. owner 在独立复查后重新签核 S2。此前旧 S2 review 视为过期。
