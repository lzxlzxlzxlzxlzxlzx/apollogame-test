# 心跳叠叠乐：Storyteller 接入与结果回传 M2 设计

> GD-105 · 2026-09-01 · **M2 历史/未来设计，不是独立可玩版 S2--S8 的验收输入。**
>
> 本文定义 `game-105` 作为 DokiWorld App 被 Storyteller 拉起、在游戏内请求宿主真实对话模型、并把本局结果回传 Storyteller 的最小闭环。它不授权游戏写入长期记忆、关系档案或任何外部数据库。
>
> **版本术语**：仓内安装包为 `@dokiworld/app-sdk@^3.0.0`；现有 `dokiworld/game108` 参考的线协议字段为 `protocolVersion: 2`。SDK 包版本与线协议版本不是同一个版本号；S2 必须以实际 Host/SDK 联调结果锁定兼容组合，不能凭本文单独升降协议号。

## 1. 目标与边界

目标体验：玩家正在 Storyteller 与当前角色聊天；角色提议玩叠叠塔，Storyteller 拉起 `game-105`；玩家与该角色完成一局；游戏回到 Storyteller，显示结算并让角色基于本局结果自然回应。

M1 必须具备：

1. Storyteller 能以显式配置拉起 `game-105`，并把会话、角色、玩家 Persona、种子和本局关系快照交给游戏。
2. 游戏内 AI 每次合法抽出并结算卡片后，都要有一条角色回复；回复优先由宿主真实模型生成。
3. 游戏结束只回传结构化、最小必要的本局结果；Storyteller 可把结果插入后续台词和选项。
4. 模型不可用、超时、拒绝或角色上下文缺失时，游戏仍可完成，并且每次事件只显示一次本地模板回复。

M1 不做：

- 游戏直接写长期记忆、关系值、角色档案或聊天历史。
- 游戏持有 API Key、模型名、供应商地址或自行选择模型。
- 向宿主回传玩家逐字输入、完整互动记录或原始物理轨迹。
- 让模型决定积木、物理、判定、心动值或胜负。

## 2. 责任划分

| 责任 | Storyteller / DokiWorld Host | game-105 |
| --- | --- | --- |
| 模型配置、密钥、角色身份、Persona、聊天会话 | 唯一责任方 | 不读取密钥、不选模型 |
| 发起与等待小游戏 | `apps.launch()`，等待完成 | 响应 App 初始化并完成/退出；不调用 `apps.launch()` |
| 游戏规则、物理、AI 抽块动作 | 不参与裁决 | 唯一裁决方；AI 和玩家共用真实动作执行器 |
| AI 文本 | 提供 `dialogue.generateDialogue()` 能力 | 在允许的时机请求，并渲染其结果 |
| 本局结果 | 接收并作为 `episode.gameCompleted` 上下文继续聊天 | 生成标准 `doki.game.result/1` |
| 长期记忆 | 后续陪伴服务另行决定是否写入 | 仅返回 `memoryCandidate` 与摘要 |

## 3. 启动契约

`game-105` 采用仓内 `@dokiworld/app-sdk@^3.0.0` 打包，并按 S2 锁定的 App 线协议注册。当前 `game108` 参考使用 `protocolVersion: 2`，故下列 JSON 是**待联调确认的候选形状**，不是绕过 S2 的版本裁决：

```json
{
  "id": "game-105-heart-tower",
  "runtime": {
    "protocol": "dokiworld.app",
    "protocolVersion": 2,
    "input": { "contract": "doki.game.heart-tower-input", "version": 1 },
    "outputs": [{ "contract": "doki.game.result", "version": 1 }],
    "modules": ["character", "persona", "dialogue", "progress", "resize", "resume"]
  }
}
```

`apps.launch()` 只由 Storyteller / World Host 调用；`game-105` 不声明、不导入也不调用该能力。Host 传入以下快照；字段缺失时使用游戏的本地默认值，绝不阻止开局：

```json
{
  "sessionId": "host-session-id",
  "seed": 105031,
  "character": { "id": "current-character", "name": "绮光" },
  "playerPersona": { "name": "玩家展示名" },
  "relationship": { "heartBaseline": 0 },
  "returnPolicy": "candidate-only"
}
```

`sessionId` 只用于同一次宿主对话关联和幂等追踪，不显示给玩家，也不作为长期存档键。角色完整人设以 DokiWorld 的 `character` / `persona` context 为准；启动数据中不复制敏感角色档案。

## 4. AI 抽卡后的真实回复

### 4.1 固定流程

1. AI 用现有共享动作执行器完成环视、悬停、抓取、拖动与释放；物理判定和抽取结果不由模型参与。
2. 积木真实脱离、稳定检测完成后，若该块产生互动卡，游戏进入 `ai-response-pending`，锁定下一回合但物理世界继续运行。
3. 游戏展示“TA 正在回应这张卡…”，向宿主的 `dialogue.generateDialogue()` 发起一次请求。
4. 成功时显示一条角色回复，回复确认后转入下一合法阶段；AI 不跳过自身互动。
5. 失败、超时或能力未授权时，显示同一张卡对应的本地模板回复，并继续流程。

### 4.2 模型请求合同

请求必须使用当前角色身份和同一 `sessionId`。传给模型的内容仅包括：互动频道、卡牌文本、AI 已抽取这一事实、当前局的简短心动变化和语气目标。

约束：

- `inputMode: "behavior"`；输出为角色的 1--2 句中文回复，最多 80 个汉字。
- 不得替玩家回答，不得捏造玩家输入，不得改变卡牌、心动值、胜负或物理结论。
- 不得再拉起游戏、要求敏感信息或声称已写入长期记忆。
- 单次卡片结算最多请求一次；超时上限 20 秒；不自动重试。
- UI 只消费已校验的纯文本回复；空回复、超长回复或非法状态一律视为失败并走模板。

示例提示语义：`你刚在与玩家的心跳叠叠乐中抽到「{channel}」互动卡：{cardText}。以当前角色身份，用温暖或俏皮的中文回应 1--2 句。不要描述未发生的事，不要改写游戏结果，不要要求玩家回答。`

### 4.3 降级模板

模板按频道和卡片类型决定，例如：

- 轻语：`“我会把这句话好好听完。轮到你时，不用急着逞强。”`
- 心动：`“原来你会选这一块。那我也认真一点回应你。”`
- 默契：`“这次算我们配合得不错，塔还在等下一次冒险。”`
- 勇气：`“这张卡有点难，但我愿意先说真话。”`

模板须明确标记为 `template` 但不向玩家展示技术状态。模板和真实模型回复都只影响表现，绝不改变 `heartDelta`、卡牌队列或回合。

## 5. 回传契约

游戏以 `createGameResult()` 输出 `doki.game.result/1`。结果 `metrics` 只能是扁平的字符串、数字或布尔值；不传玩家原话。建议的 12 个指标：

| metric | 类型 | 含义 |
| --- | --- | --- |
| `winner` | string | `player` / `ai` / `none` |
| `rounds` | number | 完成回合数 |
| `playerDraws` | number | 玩家成功抽取数 |
| `aiDraws` | number | AI 成功抽取数 |
| `completedInteractions` | number | 已完成互动数 |
| `linkedExtractions` | number | 本局连带抽取数 |
| `heartDelta` | number | 本局新增心动值，不是长期总值 |
| `relationshipSignal` | string | `playful` / `trust` / `brave` / `memory-unlocked` |
| `memoryCandidate` | boolean | 是否产生可供宿主评估的记忆候选 |
| `memorySummary` | string | 脱敏、最多 160 字的本局摘要 |
| `replyMode` | string | `llm` / `mixed` / `template`，仅用于宿主诊断 |
| `aiPenaltyCompleted` | boolean | AI 倒塔收尾惩罚卡及其回复是否已完成，仅用于宿主诊断 |

`normalizedScore` 为 `0--100` 的本局亲密互动完成度，仅供 Storyteller 的通用结算卡展示，不替代心动值。`outcome` 固定为 `completed`；胜负以 `winner` 为准。

Storyteller 后续对白可使用：

```text
刚才这一局，你们完成了 {{app.metrics.completedInteractions}} 次互动，
心动值增加 {{app.metrics.heartDelta}}。{{app.metrics.memorySummary}}
```

当前 Storyteller 的结果卡默认只展示 `points/moves/cleared/bestCascade`。程序需扩展为展示本游戏白名单指标：回合、互动、心动值、关系信号、记忆候选；不得把所有技术指标直接暴露给玩家。

## 6. 记忆候选的产品表现

游戏结束后：

1. `memoryCandidate=false`：Storyteller 只给出自然赛后回复，不展示“记忆已保存”。
2. `memoryCandidate=true`：Storyteller 展示“本次记忆候选”卡，内容来自 `memorySummary`，明确文案为“可供本次对话继续引用”，不得声称永久保存。
3. 后续真正接入陪伴记忆服务时，由宿主将该候选交给独立审核/写入流程；游戏结果契约保持不变。

## 7. 验收剧本

程序和测试须至少覆盖：

1. Storyteller 以指定 `gameId` 和输入契约拉起 `game-105`；种子、角色名和 Persona 在游戏内可用。
2. AI 抽到主卡和余波卡时均进入 `ai-response-pending`，真实模型成功回复后才继续，不会直接跳过。
3. 模型超时、拒绝、空文本、未授权时，恰好出现一次模板回复且本局可正常结束。
4. 模型回复不能改变抽取、倒塌、心动值、卡牌顺序或胜负；同 seed、同输入的物理结果仍确定。
5. 结算输出符合 `doki.game.result/1`，指标只含白名单原子值，且不含玩家原话。
6. Storyteller 收到结果后显示白名单结算卡，使用 `{{app.metrics.heartDelta}}` 和 `{{app.metrics.memorySummary}}` 继续一段角色对白。
7. `memoryCandidate=true/false` 两条路径均正确；前者是候选卡，不产生持久化写入。
8. 双重完成消息或相同 `sessionId` 的重复回传不重复生成结算卡或重复触发赛后对白。

## 8. 施工顺序与流程影响

这不是 S7 的 UI 修复，也不能直接并入当前 S8 终检。它改变了 S2 已裁决的宿主/LLM 边界以及 S4 的 AI 互动闭环。

在当前 S7 P2 修复并重新评分后，owner 应以本文为依据重开 S2：先以 `game108` 为参照，核查 `@dokiworld/app-sdk@^3.0.0` 与实际 Host 所接受的 `protocolVersion` 组合，并确认游戏侧 `dialogue`、`game-result`、初始化输入和完成回执；`apps.launch` 仅在 Storyteller / Host 侧核查。能力确认后重做 S3（宿主骨架）与 S4（真实 AI 回复及回传闭环）。S5--S7 随后按变更后的 UI/美术/质量重新验证，最终再进 S8。

## 9. Storyteller 联调策略

当前工作区有 Storyteller App 源码，但没有可直接启动的生产 World Host。因此联调分两层完成，二者都必须保留 witness 证据。

### 9.1 层 A：本地真协议 witness（先做）

Host/Storyteller 程序负责人以 `dokiworld/game108/scripts/lib/host-harness.mjs` 为基础，创建只用于测试的本地 Host 页面。该 harness 必须使用 SDK 真 `createAppHost`、真 iframe、构建后的 Storyteller 和构建后的 `game-105`；不得用手写 `postMessage` 假造协议。

Harness 提供：

1. App catalog：登记 `storyteller` 和 `game-105-heart-tower`。
2. Apps extension：Storyteller 请求 `apps.launch(game-105-heart-tower)` 时挂载游戏 iframe，等待其标准完成结果，再原样返回给 Storyteller。
3. Character / Persona extension：提供固定、脱敏的测试角色与玩家 Persona。
4. Dialogue extension：先返回确定性 witness 文本，覆盖成功、超时、拒绝三种模式；不需要真实模型密钥。
5. Episode extension：记录 `episode.gameCompleted`，以结果生成一条 `episode.gameResolved` 续写，覆盖 `heartDelta`、`memorySummary` 插值。
6. Result ledger：按 `(runId, resultId)` 去重；重复完成消息只能产生一次游戏结算卡和一次赛后续写。

层 A 的通过条件是“真实 SDK 链路已走通”，不是“模型内容已评审通过”：

```text
Host -> Storyteller -> apps.launch -> game-105 -> createGameResult
-> Storyteller episode.gameCompleted -> Host episode.gameResolved -> Storyteller 续聊
```

### 9.2 层 B：真实模型 Host witness（后做）

层 A 通过后，由拥有 DokiWorld Host 与模型凭据的负责人部署或提供受控测试环境。Host 的 `createDialogueHostExtension` 在服务端调用批准的模型适配器；密钥只存在于 Host 服务端或安全代理中。

层 B 只新增验证：角色身份连续、同一 `sessionId` 连续、AI 抽卡回复可用、模型失败降级和赛后自然续聊。它不改变层 A 已冻结的输入、结果或物理规则。

### 9.3 给 Host/Storyteller 程序负责人的交付请求

1. 提供可启动的 Host 命令、URL、测试角色和不含密钥的联调说明。
2. 明确 `apps.launch` 的 App 注册格式、嵌入策略和完成结果回执语义。
3. 提供一次成功和一次重复回传的日志/截图/JSON witness。
4. 标明真实模型环境的授权方式、超时上限与无模型时的返回错误码；不得让游戏端配置模型或读取密钥。
