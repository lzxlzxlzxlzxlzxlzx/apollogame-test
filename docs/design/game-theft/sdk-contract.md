# `game-theft` SDK 合同草案 v1

> 立项期草案。实现后应移入 `docs/sdk/` 成为单一规范，并由 manifest、生成器与生命周期测试点名守卫。

## 1. 标识

| 项目 | 值 |
|---|---|
| App ID | `game-theft` |
| App 协议 | `dokiworld.app/2` |
| 输入合同 | `doki.game.theft-input/1` |
| App 输出合同 | `doki.game.theft-attempt/1` |
| 宿主权威回执 | `doki.game.theft-receipt/1` |

## 2. 输入

```ts
type TheftInput = Readonly<{
  requestId: string
  target: Readonly<{
    id: string
    displayName: string
  }>
  exposureRateBpPerSecond: number
  items: readonly TheftItem[]
  presentation?: Readonly<{
    skin: 'shadow-heist' | 'moonlit-silk' | 'market-crowd'
    title?: string
    locale?: string
  }>
}>

type TheftItem = Readonly<{
  itemId: string
  instanceId?: string
  displayName: string
  image?: string
  quantity: number
  takeQuantity: number
  dc: number
}>
```

业务调用方只有两个玩法调节面：逐物品最终 `dc` 与本局 `exposureRateBpPerSecond`。DEX、装备、妙手空空、烟雾、NPC 警觉和环境均由 DokiWorlds 在启动前折算；App 不接收这些领域字段。正式调用不允许指定 seed，外部会话能力在开局时取得熵并建立 `RandomSeed`，结果回传该 seed 供审计。`items[]` 数组顺序是权威偷窃顺序，App 不排序、玩家不跳选。

### 2.1 校验

- `requestId`、目标 id、`itemId/instanceId` 去空白后必须非空；条目稳定标识不得重复，数组顺序原样进入规则 hash。
- 物品条目 1–12 个，稳定标识不得重复；数量和每次取得量是正安全整数，且 `takeQuantity <= quantity`。
- `dc` 是 1–30 的安全整数；它必须是宿主已应用全部领域修正后的最终难度。
- `exposureRateBpPerSecond` 是正安全整数；输入必须满足标准首个 QTE 出现前不会被动必曝的可达性检查。
- 展示名和远程图片不进入回执；远程图仅允许 HTTPS，失败使用包内占位。

## 3. App 输出：操作记录

```ts
type TheftAttemptOutput = Readonly<{
  contract: 'doki.game.theft-attempt'
  version: 1
  data: Readonly<{
    requestId: string
    randomSeed: number
    claimedStatus: 'withdrew' | 'exposed' | 'cleared' | 'aborted'
    elapsedTicks: number
    inputs: readonly TheftInputEvent[]
    clientSummary: Readonly<{
      acquired: readonly { itemId: string; instanceId?: string; quantity: number }[]
      exposureBp: number
      qteHits: number
      qteMisses: number
    }>
  }>
}>

type TheftInputEvent =
  | Readonly<{ seq: number; tick: number; action: 'qte' }>
  | Readonly<{ seq: number; tick: number; action: 'continue' }>
  | Readonly<{ seq: number; tick: number; action: 'withdraw' }>
```

`clientSummary` 只用于界面/诊断，不可用于发奖。操作事件必须连续编号、tick 单调不降；重复完成只接受首个输出。

## 4. 宿主权威重演与回执

宿主按开始时保存的完整输入、外部会话在开局时建立并由输出回传的 `randomSeed` 和 `inputs` 重演；不接受客户端回传的参数副本，也不允许调用方预先选择 seed。

```ts
type TheftReceipt = Readonly<{
  contract: 'doki.game.theft-receipt'
  version: 1
  data: Readonly<{
    requestId: string
    outcome: 'withdrew' | 'exposed' | 'cleared'
    elapsedTicks: number
    exposureBp: number
    acquired: readonly Readonly<{
      itemId: string
      instanceId?: string
      quantity: number
    }>[]
    qteHits: number
    qteMisses: number
    lootRolls: number
    randomSeed: number
    replayDigest: string
  }>
}>
```

权威处理顺序：

1. 以 `requestId` 做幂等去重；
2. 校验日志闭集、顺序和状态合法性；
3. 使用回传的 `randomSeed`、规范化输入和日志重演，核对 `claimedStatus/clientSummary`；
4. 再检查目标库存和实例归属；
5. 在同一事务中转移 `acquired` 并写犯罪/关系/记忆/历史效果；
6. 持久化 `replayDigest`，重复提交返回同一回执。

`replayDigest` 应覆盖合同版本、业务规则版本、规范化输入、`randomSeed` 和规范化操作日志。

## 5. DokiWorld verb 映射

```text
ActionDefinition.payload.kind = interaction
ActionDefinition.payload.verb = steal | pickpocket
ActionDefinition.minigame     = theft-session v2（待 DokiWorld 扩展）
```

回执到 Effects：

- 每个 `acquired` → `npc_inventory.transfer`（NPC 库存）或相应场景库存转移效果；
- `outcome=exposed` → `crime.record(status:'reported')`，并由宿主计算 `witness_ids/identified_by`；
- 未暴露但有取得物 → `crime.record(status:'hidden', offense:'theft')`；
- 暴露且无取得物 → `crime.record(status:'reported', offense:'attempted_theft')`；
- 暴露 → 对受害者/知情者应用 `relationship.add`、`memory.add`；
- 所有合法终局 → `world_history.record`；
- `aborted` → 不产生世界效果。

现有 `failure_effects` 要求仍应保留，但新的偷窃小游戏不能被压缩为单一 success/failure：回执必须允许“取得物品且暴露”。

## 6. 生命周期

- `createAppClient({appId:'game-theft'}) → connect() → whenReady()` 读取输入。
- 玩家安全撤退、暴露或清空后调用一次 `complete(output)`。
- 宿主主动取消或初始化失败使用 `requestExit()`，不伪造业务回执。
- App 不声明背包/角色/存储 extension，不访问 token、Cookie 或内部 HTTP。
- APPS 面板空输入只能进入本地演示模式；演示不得调用 `complete()`。

## 7. 权威声明

确定性重演解决规则一致、重试和幂等，不等于防作弊。高价值奖励若要求抵抗被篡改客户端，宿主需要实时接收输入事件并以服务器 tick/时钟签收；这不属于 v1 App 合同。
