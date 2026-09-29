# 开启宝箱（Loot Chest）接入说明

本文面向在 DokiWorlds 中调用 `game-loot-chest` 的开发者。App 根据宿主提供的确定性掉落树和种子演出一次开箱，玩家完成开箱操作后回传聚合奖励。它不会访问背包、不会写入奖励，宿主必须以自己的权威掉落表和幂等事务发奖。

## 1. 应用身份与启动方式

| 项目 | 固定值 |
| --- | --- |
| App ID | `game-loot-chest` |
| 协议 | `dokiworld.app/2` |
| 输入合同 | `doki.game.chest-input` v2 |
| 输出合同 | `doki.game.chest-result` v2 |
| 作用域 / modules | 无 |

通过 DokiWorlds App SDK 的 `apps.launch` 调用。输入与输出均为 `{ contract, version, data }` envelope。只在 `status === 'completed'` 时校验并使用输出；关闭、跳过或 `requestExit()` 造成的 `cancelled` 不应发奖。

```ts
const launched = await client.apps.launch({
  appId: 'game-loot-chest',
  input: { contract: 'doki.game.chest-input', version: 2, data: chestInput },
});
if (launched.status === 'completed') {
  // 校验 launched.output.contract === 'doki.game.chest-result'
  // 以及 launched.output.version === 2 后再处理 rewards。
}
```

## 2. 输入合同：`doki.game.chest-input` v2

> **在 DokiWorlds 的 APPS 调试面板中测试时**：面板会根据独立的“合同”=`doki.game.chest-input` 和“版本”=`2` 字段自行组装 envelope。下方“数据”只粘贴 `data` 内部对象，不能包含外层 `contract/version/data`；完整 envelope 仅用于代码调用 `apps.launch()`。

调试面板“数据”示例：

```json
{
  "sessionId": "reward-2026-09-29-001",
  "tableId": "ruins-bronze-chest",
  "rng": { "algorithm": "mulberry32-v1", "seed": 184728391 },
  "root": { "type": "item", "itemId": "gold", "name": "金币", "quantity": { "fixed": 50 } }
}
```

```json
{
  "contract": "doki.game.chest-input",
  "version": 2,
  "data": {
    "sessionId": "reward-2026-09-29-001",
    "tableId": "ruins-bronze-chest",
    "tableVersion": 3,
    "tableDigest": "sha256:your-immutable-table-digest",
    "chest": { "name": "遗迹青铜宝箱" },
    "rng": { "algorithm": "mulberry32-v1", "seed": 184728391 },
    "root": {
      "type": "item",
      "itemId": "gold",
      "name": "金币",
      "quantity": { "fixed": 50 }
    }
  }
}
```

### 2.1 顶层字段

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `sessionId` | 是 | 非空字符串；一次待结算开箱的稳定唯一标识。宿主用它做幂等去重。 |
| `tableId` | 是 | 非空字符串；标识使用的掉落表。 |
| `tableVersion` | 否 | `1..1,000,000` 的安全整数；会原样回传。 |
| `tableDigest` | 否 | string；建议写入不可变掉落表版本的摘要，会原样回传。 |
| `chest.name` | 否 | string；仅控制标题。宝箱本体美术固定，旧调用方传入的 `chest.image` 会被忽略。 |
| `rng` | 是 | 固定为 `{ algorithm: "mulberry32-v1", seed }`；`seed` 是 `0..4294967295` 的安全整数。 |
| `root` | 是 | 下节定义的声明式掉落树根节点。 |

相同合法输入（包括树结构、权重、数量和 seed）会得到逐项一致的 `rewards`。不要用 `Math.random` 在宿主临时生成与同一 `sessionId` 不同的输入；应先冻结并保存本次表版本、种子和请求状态。

## 3. 掉落树：节点、数量与结算算法

`root` 是一个闭集 DSL，不接受自由脚本。节点可以任意嵌套，但整棵树的最大深度为 16、节点总数最多 500。

| 节点 | 结构 | 结算行为 |
| --- | --- | --- |
| `item` | `{ type, itemId, name?, quantity, image? }` | 产出该物品一次。`itemId` 非空；`name`、`image` 仅用于展示。 |
| `empty` | `{ type: "empty" }` | 显式空奖励，可放入概率池。 |
| `all` | `{ type: "all", children }` | 按数组顺序结算每个 child，适合“保底 + 随机池”。不能为空。 |
| `choose` | `{ type: "choose", entries }` | 按各 entry 的正整数 `weight` 加权选择一项，再结算其 child。不能为空。 |
| `repeat` | `{ type, count, replacement, child }` | 重复结算 child `count` 次。`count` 为 1–100。 |

数量 `quantity` 只能是：

```json
{ "fixed": 3 }
```

或包含两端的整数范围：

```json
{ "min": 10, "max": 30 }
```

数量、权重都是 `1..1,000,000` 的安全整数；范围必须 `min <= max`。物品图片仅接受 `image.src` 为 HTTPS URL；`image.assetId` 和 `image.alt` 可选。图片加载失败不会改变掉落结算，会回退为本地符号占位。

### 3.1 精确的迭代/抽取顺序

App 以 `mulberry32-v1(seed)` 初始化一个伪随机流，并按深度优先、从左到右的节点访问顺序消费随机数：

1. `all` 从 `children[0]` 到最后一个依次递归。
2. `choose` 在当前可选 entry 上按 `weight / 所有可选 weight 之和` 抽一项，立刻递归它的 child。
3. `item.quantity.fixed` 不消费随机数；范围数量消费一个随机数，结果是 `min + floor(random * (max - min + 1))`。
4. `repeat.replacement: true` 连续执行 `count` 次 child；每轮都保留完整候选池，因此可以重复抽到同一 entry。
5. `repeat.replacement: false` 仅允许 child 为 `choose`。每轮把刚抽中的**该 choose 直接 entries 的索引**从本 repeat 的候选池移除，再继续抽取，因此同一 entry 不能重复命中；`count` 不得超过该池 entry 数。
6. `empty` 不产出物品，也不额外消费随机数。

若相同 `itemId` 被命中多次，输出按首次命中顺序合并数量。展示名称和图片不进入输出，所以同一 `itemId` 的展示信息应保持一致。

### 3.2 常用配表示例

**保底金币 + 三次可重复随机抽取：**

```json
{
  "type": "all",
  "children": [
    { "type": "item", "itemId": "gold", "name": "金币", "quantity": { "min": 50, "max": 100 } },
    {
      "type": "repeat",
      "count": 3,
      "replacement": true,
      "child": {
        "type": "choose",
        "entries": [
          { "weight": 60, "child": { "type": "item", "itemId": "healing-potion", "name": "回春膏", "quantity": { "fixed": 1 } } },
          { "weight": 30, "child": { "type": "item", "itemId": "spirit-stone", "name": "灵石", "quantity": { "min": 3, "max": 8 } } },
          { "weight": 10, "child": { "type": "item", "itemId": "ancient-key", "name": "古钥匙", "quantity": { "fixed": 1 } } }
        ]
      }
    }
  ]
}
```

**三选二、不重复：**

```json
{
  "type": "repeat",
  "count": 2,
  "replacement": false,
  "child": {
    "type": "choose",
    "entries": [
      { "weight": 50, "child": { "type": "item", "itemId": "ruby", "quantity": { "fixed": 1 } } },
      { "weight": 30, "child": { "type": "item", "itemId": "sapphire", "quantity": { "fixed": 1 } } },
      { "weight": 20, "child": { "type": "empty" } }
    ]
  }
}
```

上例中“未中奖”也是一个明确的候选项，因此它至多被抽中一次；第二次抽取会基于第一次后剩余 entry 的权重重新归一化。若业务希望空分支可重复出现，请用 `replacement: true`。

## 4. 输出合同：`doki.game.chest-result` v2

玩家在开箱演出后点击“全部领取”时，App 只调用一次 `complete()`：

```json
{
  "contract": "doki.game.chest-result",
  "version": 2,
  "data": {
    "sessionId": "reward-2026-09-29-001",
    "tableId": "ruins-bronze-chest",
    "tableVersion": 3,
    "tableDigest": "sha256:your-immutable-table-digest",
    "outcome": "opened",
    "rewards": [
      { "itemId": "gold", "quantity": 73 },
      { "itemId": "healing-potion", "quantity": 2 }
    ]
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `sessionId` / `tableId` | 从输入原样回传，供宿主关联待结算请求。 |
| `tableVersion` / `tableDigest` | 输入存在时原样回传；用于防止在错误版本掉落表上发奖。 |
| `outcome` | 成功完成时恒为 `opened`。 |
| `rewards` | `{ itemId, quantity }[]`；相同 itemId 聚合、顺序为首次命中顺序。没有物品时可为空数组。 |

输出不包含 `name`、`image`、节点路径、概率或原始随机数。宿主必须按自己的物品目录把 `itemId` 映射为实际奖励。

## 5. 宿主权威结算范式

建议服务端/权威逻辑按以下顺序执行：

1. 创建唯一 `sessionId`，读取并冻结掉落表版本和 `tableDigest`。
2. 生成并持久化本次 `seed` 与完整输入；状态置为“等待领取”，但尚不发奖。
3. 将该输入交给 App 演出。
4. 收到 `completed` 后，校验输出 envelope、`sessionId`、`tableId`、表版本/摘要，并用同一算法与 seed 重算 `rewards`；不一致则拒绝。
5. 在同一个幂等事务中，以 `sessionId` 去重，写入奖励并将会话标为已领取。
6. 收到 `cancelled`、超时、无效输入或校验失败时，不发奖；可保留原会话供用户重试或按产品规则关闭。

App 的确定性算法便于回放和校验，但浏览器客户端不是安全边界。不要直接把客户端回传结果视为唯一发奖依据。

## 6. 限制、错误与预览

- 只接受算法名 `mulberry32-v1`；seed 超出无符号 32 位范围、未知节点、空 `all/choose`、非法数量或超过树限制都会拒绝输入。
- `replacement:false` 的 repeat 必须直接包裹 `choose`，且 `count <= entries.length`。
- 空 `{}` 仅是 APPS 面板预览输入，App 显示本地演示宝箱且不会向宿主调用 `complete()`。独立静态预览可追加 `?preview=1`。
- App 不读取 token、Cookie、背包或内部 HTTP，也不声明 DokiWorld scope/module。宿主仍应只从可信位置加载该静态包。

## 7. 上线前核对清单

1. 使用 `game-loot-chest` 与 `doki.game.chest-input` / `2`。
2. 每次开箱有唯一 `sessionId`，并冻结表版本、摘要、树和 seed。
3. 掉落树满足深度 ≤16、节点 ≤500、repeat ≤100；不重复抽取使用合法的 `repeat → choose` 结构。
4. 只在 `completed` 后处理输出，并重新计算、校验及以 `sessionId` 幂等发奖。
