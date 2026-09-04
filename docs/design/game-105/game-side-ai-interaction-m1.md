# 心跳叠叠乐：游戏侧真实模型 AI 互动与惩罚卡 M2 设计

> GD-105 · 2026-09-01 · **M2 历史/未来设计，不是独立可玩版 S2--S8 的验收输入。** 前置：Storyteller/Host agent 完成启动、`dialogue` 和结果回传 witness 后施工。

## 1. 目标

让 AI 成为与玩家对等的叠叠塔参与者：AI 抽到互动卡时要看得见卡、停下来回应、再进入下一步；AI 导致倒塔时也要真正接收一张收尾惩罚卡并回应。真实模型只写角色文本，绝不参与选块、物理、分数或胜负裁决。

## 2. 当前基础与缺口

现有 `game-105` 已有可复用基础：

- `Game105MountHost.resolveAIReply()`：异步 AI 回复注入点。
- `(round, aiDraws, blockIds)` ticket：同一 AI 抽取不会重复发请求。
- 生命周期 token：重开/卸载后的晚到回复不会写回旧局。
- 无注入、异常或空文本时使用 `templateReply` 并继续本局。

本 M1 要补的不是再造一套模型接口，而是以下玩家可见闭环：

1. 当前 AI 多块抽取只合成一条通用模板，没有逐张卡的可见卡面与顺序。
2. 当前 AI 倒塔只有静态收尾文字和“继续结算”按钮，未抽取惩罚卡、未生成 AI 输入。
3. `resolveAIReply` 尚未由 DokiWorld `dialogue.generateDialogue()` 实现接线；游戏仍不能确认回复来源、超时和受控降级。

## 3. 不可变规则

- AI 与玩家共用 `TowerActionExecutor`、抽离阈值、稳定检测、倒塔判定和退役积木规则。
- 卡牌由固定种子、积木频道和物理结算顺序决定；模型不能选卡、换卡、跳卡或决定惩罚。
- 心动值、已完成互动数、连带抽取数、胜负和记忆候选均先由本地规则结算；模型输出失败不回滚它们。
- 每张需要回应的 AI 卡最多请求一次；每个惩罚卡最多请求一次。重复回调、晚到回调、重开和倒塔锁定均不得产生第二次结算。
- 不将玩家自由输入发送给 AI 作为本 M1 的游戏内提示；玩家输入继续遵循“仅本局可见”。

## 4. AI 抽卡互动

### 4.1 队列和顺序

AI 成功抽出积木后，按与玩家相同的物理脱离顺序建立 `aiInteractionQueue`：

1. 第一块为主卡；第二、三块为余波卡，逐张结算。
2. 超过三块的连带脱离保持为余波事实摘要，不生成完整问题、不给模型请求。
3. 每张主卡/余波卡含固定 `effectId`、频道、标题、问题、序号和总数；这些字段是模型请求和回归测试的唯一输入。

AI 对一张主卡或余波卡的流程：

```text
真实抽离并稳定 -> 显示 AI 卡面 -> ai-response-pending
-> 一次 resolveAIReply -> 显示 AI 回复 -> 下一张 AI 卡或 player-ready
```

卡面必须明确标记“TA 抽到的卡”，展示频道、问题、序号和回复状态。等待时显示“TA 正在回应…”，不能预先把模板当作模型回复展示。

### 4.2 文本合同

游戏侧将既有 `Game105AIReplyRequest` 扩展为以下语义，具体 SDK 类型由 Host agent 确认后适配：

```ts
{
  ticket: string,
  kind: 'draw' | 'penalty',
  sessionId: string | null,
  characterName: string,
  playerPersonaName: string,
  card: {
    effectId: string,
    channel: 'pink' | 'purple' | 'blue' | 'gold',
    title: string,
    prompt: string,
    sequence: number,
    total: number
  },
  round: number,
  heartDelta: number,
  fallbackReply: string
}
```

Host adapter 将其转换成 `dialogue.generateDialogue()` 请求，要求当前角色用中文回复 1--2 句、最多 80 个汉字。游戏只接收经清理的 `{ text, mode: 'llm' | 'template' }`，不消费模型的动作、数值或结构化指令。

失败处理：无授权、超时（20 秒）、拒绝、异常、空文本、超过长度或 ticket 不匹配时，恰好显示一次该卡的本地模板。模板按频道决定，不显示“模型失败”等技术信息。

## 5. AI 惩罚卡与输入

### 5.1 触发与结算

当 AI 是倒塔执手方：

1. 真实倒塔立即锁定胜负，物理世界继续模拟；不再允许新抽取。
2. 本地、可复现地从下列收尾卡池选一张 AI 惩罚卡；模型无权挑选。
3. 显示“TA 的收尾卡”，进入 `ai-penalty-response-pending`；调用一次同一回复接口，`kind='penalty'`。
4. 回复成功或模板降级后，卡面显示文本并标记“本局收尾完成”；玩家点“继续”只负责关闭/进入重开，不触发模型请求。

M1 收尾卡池：

| id | 标题 | 给 AI 的固定输入 |
| --- | --- | --- |
| `truthful-close` | 真心收尾 | 说一句你愿意认真记住的话。 |
| `brave-admission` | 勇气承认 | 承认一件刚才没有立刻说出口的小心事。 |
| `gentle-promise` | 温柔约定 | 给下一局留一个可以兑现的小约定。 |
| `specific-encouragement` | 反向鼓励 | 先给对方一句具体的肯定。 |

选择规则：`seed + round + aiDraws` 对卡池取模；同 seed、同物理过程必得同一张。AI 完成惩罚卡不额外增加心动值、不改变胜负；更复杂的惩罚效果留待独立策划。

### 5.2 玩家倒塔保持原边界

玩家倒塔仍显示玩家输入框、快捷回复、提交或跳过。M1 不把玩家输入传给模型，也不把它放入回传结果。AI 可保留一句本地收尾确认；若以后希望由模型回应玩家收尾，必须另行征得隐私与文案确认。

## 6. 结果投影

游戏完成时补充并回传：

- `replyMode`: `llm` / `mixed` / `template`。
- `aiPenaltyCompleted`: boolean。
- 既有 `heartDelta`、`completedInteractions`、`linkedExtractions`、`winner`、`memoryCandidate` 和 `memorySummary`。

结果指标保持最多 12 个原子字段；如果总数超限，优先保留玩法与关系指标，诊断字段 `replyMode` 可移到 Host witness 日志，不得牺牲 `heartDelta` 或 `memorySummary`。

## 7. 程序验收

1. AI 主卡、第二张余波卡各生成一次可见回复；多块抽取顺序与物理脱离顺序一致。
2. 每张 AI 卡在成功、超时、拒绝、空文本和重开晚到回调下均只结算一次。
3. AI 倒塔时显示确定性惩罚卡，调用一次 `kind='penalty'`，成功/降级后才能进入可继续状态。
4. 玩家倒塔不把玩家输入发给模型或放进 `game-result`；跳过仍可正常结束。
5. 注入回复文本不能改变物理、抽取顺序、心动值、胜负、卡牌选择或种子确定性。
6. 无 Host / 无模型时，AI 主卡与惩罚卡都使用模板，整局仍完整可玩。
7. `doki.game.result` 含白名单结果；同一 `(runId, resultId)` 的重复完成不生成重复赛后内容。

## 8. 给 game-105 程序 agent 的施工顺序

1. 等 Host agent 固化 SDK/协议和 `dialogue.generateDialogue()` 返回形状。
2. 在现有 `resolveAIReply` 接缝上扩展 `kind/card/ticket`，不要在游戏端引入模型密钥或 `apps.launch`。
3. 将 AI 抽取改为逐张互动队列和可见卡面，再接入真实 adapter；先用确定性 adapter 覆盖所有状态机测试。
4. 实现 AI 收尾惩罚卡状态、确定性抽卡、一次回复和模板降级。
5. 最后接入 `createGameResult` 投影，并与 Storyteller witness 联跑启动、完成和重复回传。
