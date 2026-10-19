# `game-theft` SDK 合同 v3

## 1. 输入

```ts
type TheftInput = Readonly<{
  requestId: string
  target: Readonly<{ id: string; displayName: string }>
  /** 0..100 的总难度；见 balance-model.md，越大越难。 */
  difficulty: number
  items: readonly TheftItem[]
  presentation?: Readonly<{
    skin: 'shadow-heist' | 'moonlit-silk' | 'market-crowd'
    title?: string
    locale?: string
  }>
}>

type TheftItem = Readonly<{
  entryId: string
  itemId: string
  instanceId?: string
  displayName: string
  image?: string
  quantity: number
}>
```

业务调用方只有一个玩法难度参数 `difficulty`：安全整数 `0..100`，边界外由接入层钳制到该范围。DokiWorld 把属性、技能、NPC 感知、环境、妙手空空与烟雾弹等因素先折算成它；App 再按 [`balance-model.md`](./balance-model.md) 的版本化数据表映射为黑位数和被动暴露速度。每个物品不再带 DC，`items[]` 顺序也不表示偷取顺序，只是稳定目录顺序。

## 2. 操作日志

```ts
type TheftInputEvent =
  | Readonly<{ seq: number; tick: number; action: 'qte-press' }>
  | Readonly<{ seq: number; tick: number; action: 'reveal'; slot: number }>
  | Readonly<{ seq: number; tick: number; action: 'withdraw' }>
```

- `seq` 连续递增，`tick` 单调不降。
- `slot` 是 0–15：0–3 为内环，4–15 为外环。
- 客户端不上传 hit/miss/perfect；引擎从权威 tick 计算偏移和惩罚。
- 正式调用方不指定 seed；外部会话开局取得一次熵，写入 `RandomSeed`，输出回传该 seed 供重演。

## 3. 输出

```ts
type TheftAttemptOutput = Readonly<{
  contract: 'doki.game.theft-attempt'
  version: 3
  data: Readonly<{
    requestId: string
    randomSeed: number
    claimedStatus: 'withdrew' | 'exposed' | 'cleared' | 'aborted'
    elapsedTicks: number
    inputs: readonly TheftInputEvent[]
    clientSummary: Readonly<{
      acquiredEntryIds: readonly string[]
      revealedSlots: readonly number[]
      exposureBp: number
      qteAttempts: number
      perfectQtes: number
    }>
  }>
}>
```

`clientSummary` 只用于展示与诊断，不用于发奖。宿主使用开始时保存的规范化输入、seed 和操作日志重演并生成权威回执。

```ts
type TheftReceipt = Readonly<{
  contract: 'doki.game.theft-receipt'
  version: 3
  data: Readonly<{
    requestId: string
    outcome: 'withdrew' | 'exposed' | 'cleared'
    elapsedTicks: number
    exposureBp: number
    acquired: readonly Readonly<{
      entryId: string
      itemId: string
      instanceId?: string
      quantity: number
    }>[]
    revealedSlots: readonly number[]
    qteAttempts: number
    perfectQtes: number
    randomSeed: number
    replayDigest: string
  }>
}>
```

## 4. 边界

- 小游戏只负责偷窃过程，不生成建议、惩罚、犯罪、关系、记忆或文案。
- `exposed` 仍保留 `acquired`；是否转移物品及其后果由 DokiWorld 权威处理。
- `aborted` 不产生世界效果。
- 图片只影响展示，必须是 HTTPS 或包内资源，永不进入回执和规则 hash。
- 重复完成只接受首个结果；`requestId` 负责幂等。
