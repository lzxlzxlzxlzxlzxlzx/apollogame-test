# 开启宝箱（Loot Chest）接入说明

`game-loot-chest` 根据宿主提供的确定性掉落树与 seed 演出一次开箱；玩家点击“全部领取”后回传聚合奖励。App 不读背包、不写奖励，宿主必须用权威掉落表、重算校验和幂等事务发奖。

## 身份与调用

| 项目 | 固定值 |
| --- | --- |
| App ID | `game-loot-chest` |
| 协议 | `dokiworld.app/2` |
| 输入 | `doki.game.chest-input` v2 |
| 输出 | `doki.game.chest-result` v2 |
| scopes / modules | 无 |

输入、输出均为 `{contract,version,data}`。通过 `apps.launch()` 调用，仅在 `status === 'completed'` 时校验和处理输出；关闭、跳过或 `requestExit()` 的 `cancelled` 不发奖。

```ts
const launched = await client.apps.launch({
  appId: 'game-loot-chest',
  input: { contract: 'doki.game.chest-input', version: 2, data: chestInput },
});
if (launched.status === 'completed') {
  // 校验 output.contract === 'doki.game.chest-result' && output.version === 2。
}
```

## 输入：`doki.game.chest-input` v2

> **在 DokiWorlds 的 APPS 调试面板中测试时**：面板会根据独立的“合同”=`doki.game.chest-input` 和“版本”=`2` 字段自行组装 envelope。下方“数据”只应粘贴 `data` 内部对象，不能包含外层 `contract/version/data`。完整 envelope 仅用于代码调用 `apps.launch()`。

调试面板“数据”示例：

```json
{
  "sessionId": "reward-2026-09-29-001", "tableId": "ruins-bronze-chest",
  "rng": { "algorithm": "mulberry32-v1", "seed": 184728391 },
  "root": { "type": "item", "itemId": "gold", "name": "金币", "quantity": { "fixed": 50 } }
}
```

代码调用的完整 envelope 才是：

```json
{
  "contract": "doki.game.chest-input", "version": 2,
  "data": {
    "sessionId": "reward-2026-09-29-001", "tableId": "ruins-bronze-chest",
    "tableVersion": 3, "tableDigest": "sha256:your-immutable-table-digest",
    "chest": { "name": "遗迹青铜宝箱" },
    "rng": { "algorithm": "mulberry32-v1", "seed": 184728391 },
    "root": { "type": "item", "itemId": "gold", "name": "金币", "quantity": { "fixed": 50 } }
  }
}
```

| 字段 | 规则 |
| --- | --- |
| `sessionId` | 必填非空字符串；一次待结算开箱的稳定唯一 ID，用于幂等去重。 |
| `tableId` | 必填非空字符串；掉落表 ID。 |
| `tableVersion` | 可选安全整数 `1..1,000,000`，原样回传。 |
| `tableDigest` | 可选 string；建议是不可变表版本摘要，原样回传。 |
| `chest.name` | 可选 string，仅标题展示；宝箱美术固定，`chest.image` 会被忽略。 |
| `rng` | 必填 `{algorithm:"mulberry32-v1",seed}`；seed 是 `0..4294967295` 的安全整数。 |
| `root` | 必填声明式掉落树。 |

相同合法输入必得逐项一致的奖励。创建调用时要冻结并保存掉落表版本、树和 seed，不能对同一 `sessionId` 临时生成不同输入。

## 掉落树与迭代算法

`root` 是闭集 DSL，树深最多 16、节点最多 500。

| 节点 | 结构 | 行为 |
| --- | --- | --- |
| `item` | `{type,itemId,name?,quantity,image?}` | 产出一次物品；`itemId` 必填，名称/图片只展示。 |
| `empty` | `{type:"empty"}` | 显式空奖励。 |
| `all` | `{type:"all",children}` | 按数组顺序结算每个 child；不得为空。 |
| `choose` | `{type:"choose",entries}` | 按 entry 的正整数 `weight` 加权抽一个 child；不得为空。 |
| `repeat` | `{type,count,replacement,child}` | 重复 child，`count` 为 1–100。 |

数量仅可为 `{fixed:n}` 或含两端的 `{min,max}`；数量和权重均为 `1..1,000,000` 的安全整数，且 `min <= max`。`image.src` 仅接受 HTTPS，图片失败只影响展示。

App 用 `mulberry32-v1(seed)` 建立随机流，并按深度优先、从左到右的顺序消费：

1. `all` 从第一个 child 到最后一个递归。
2. `choose` 在当前可选项上按权重比例抽取，立即递归该 child。
3. `item.quantity.fixed` 不消费随机数；范围数量为 `min + floor(random() * (max - min + 1))`，消费一个随机数。
4. `repeat.replacement:true` 连续执行 child；每轮候选池完整，允许重复命中。
5. `repeat.replacement:false` 仅允许 child 直接是 `choose`；每轮剔除刚命中的直接 entry 索引，并按剩余权重重新抽取。`count` 不得超过 entries 数。
6. `empty` 不产物，也不额外消费随机数。

同一 `itemId` 的多次命中按首次命中顺序合并数量；名称/图片不在输出中，同 ID 的展示资料应一致。

### 配表示例

保底金币 + 三次可重复随机抽取：

```json
{
  "type": "all", "children": [
    { "type": "item", "itemId": "gold", "name": "金币", "quantity": { "min": 50, "max": 100 } },
    { "type": "repeat", "count": 3, "replacement": true, "child": {
      "type": "choose", "entries": [
        { "weight": 60, "child": { "type": "item", "itemId": "healing-potion", "quantity": { "fixed": 1 } } },
        { "weight": 30, "child": { "type": "item", "itemId": "spirit-stone", "quantity": { "min": 3, "max": 8 } } },
        { "weight": 10, "child": { "type": "item", "itemId": "ancient-key", "quantity": { "fixed": 1 } } }
      ]
    }}
  ]
}
```

三选二且不重复：

```json
{
  "type": "repeat", "count": 2, "replacement": false,
  "child": { "type": "choose", "entries": [
    { "weight": 50, "child": { "type": "item", "itemId": "ruby", "quantity": { "fixed": 1 } } },
    { "weight": 30, "child": { "type": "item", "itemId": "sapphire", "quantity": { "fixed": 1 } } },
    { "weight": 20, "child": { "type": "empty" } }
  ]}
}
```

空分支也至多命中一次；第二次抽取在余下 entry 的权重上重新归一化。若空分支可重复，使用 `replacement:true`。

## 输出：`doki.game.chest-result` v2

玩家领取后仅调用一次 `complete()`：

```json
{
  "contract": "doki.game.chest-result", "version": 2,
  "data": {
    "sessionId": "reward-2026-09-29-001", "tableId": "ruins-bronze-chest",
    "tableVersion": 3, "tableDigest": "sha256:your-immutable-table-digest",
    "outcome": "opened",
    "rewards": [{ "itemId": "gold", "quantity": 73 }, { "itemId": "healing-potion", "quantity": 2 }]
  }
}
```

`sessionId`、`tableId` 和输入存在时的表版本/摘要均原样回传；`outcome` 恒为 `opened`。`rewards` 仅含聚合 `{itemId,quantity}`，可为空，顺序按首次命中；不返回名称、图片、概率、节点路径或随机数。

## 权威结算清单

1. 创建唯一 `sessionId`，冻结并保存表版本、摘要、完整树和 seed，尚不发奖。
2. 收到完成输出后校验 envelope、session/table ID、版本/摘要，并用同一算法/seed 重算 `rewards`。
3. 在同一个幂等事务中按 `sessionId` 去重、发奖并标记已领取；取消、超时、无效输入或校验不一致均不发奖。
4. 空 `{}` 是 APPS 预览，展示演示宝箱但不会 `complete()`；静态预览可用 `?preview=1`。
5. App 不读取 token、Cookie、背包或内部 HTTP；仅从可信静态包加载。
