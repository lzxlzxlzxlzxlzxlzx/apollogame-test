# 宝箱游戏 SDK 合同 v2

本文是 `game-loot-chest` 对 DokiWorld 的输入输出单一规范。公共边界使用 `dokiworlds-app-sdk@0.2.0`；App 只负责按宿主给定的种子和掉落树演出一次开箱，不修改宿主背包，也不自行发放奖励。

## 1. 应用与协议标识

| 项目 | 固定值 |
|---|---|
| App ID | `game-loot-chest` |
| App 协议 | `dokiworld.app/2` |
| 输入合同 | `doki.game.chest-input/2` |
| 输出合同 | `doki.game.chest-result/2` |

## 2. 输入

宿主通过 `createAppHost()` 的 `init.input` 传入：

```json
{
  "contract": "doki.game.chest-input",
  "version": 2,
  "data": {
    "sessionId": "reward-2026-09-24-001",
    "tableId": "ruins-bronze-chest",
    "tableVersion": 3,
    "tableDigest": "sha256:example",
    "chest": { "name": "遗迹青铜宝箱" },
    "rng": { "algorithm": "mulberry32-v1", "seed": 184728391 },
    "root": {
      "type": "repeat",
      "count": 3,
      "replacement": true,
      "child": {
        "type": "choose",
        "entries": [
          { "weight": 70, "child": { "type": "item", "itemId": "gold", "name": "金币", "quantity": { "min": 10, "max": 30 } } },
          { "weight": 30, "child": { "type": "item", "itemId": "potion", "name": "药水", "quantity": { "fixed": 1 } } }
        ]
      }
    }
  }
}
```

`root` 是声明式掉落树，支持以下闭集节点：

- `item`：产出一个物品；数量是 `{fixed}` 或包含两端的 `{min,max}`。
- `empty`：显式不产出物品，可作为概率落空分支。
- `all`：依次结算全部 `children`。
- `choose`：按正整数 `weight` 从 `entries` 中抽取一项。
- `repeat`：重复结算 `child`；`replacement:false` 时 child 必须为 `choose`，且同一 entry 不会重复命中。

限制：树深不超过 16、节点不超过 500、重复次数不超过 100；数量与单项权重必须是正安全整数且不超过 1,000,000。`seed` 是 `0..2^32-1` 的安全整数。同一合法输入必须得到逐项一致的结果。

`chest.name` 只控制标题。宝箱关闭/开启图固定为 App 包内审定素材，调用方不能替换；为兼容旧 v2 调用方，多传的 `chest.image` 会被忽略。物品节点的 `name` 和 `image` 只影响奖励卡展示，远端物品图片仅接受 HTTPS；加载失败时使用本地符号占位，不影响结算。

## 3. 输出

玩家点击“全部领取”后，App 只调用一次 `complete()`：

```json
{
  "contract": "doki.game.chest-result",
  "version": 2,
  "data": {
    "sessionId": "reward-2026-09-24-001",
    "tableId": "ruins-bronze-chest",
    "tableVersion": 3,
    "tableDigest": "sha256:example",
    "outcome": "opened",
    "rewards": [
      { "itemId": "gold", "quantity": 42 },
      { "itemId": "potion", "quantity": 1 }
    ]
  }
}
```

相同 `itemId` 的多次命中会按首次出现顺序聚合数量。输出不包含展示名称或图片，宿主必须按 `itemId` 发奖，并使用 `sessionId` 做幂等去重。`tableVersion/tableDigest` 若存在会原样回传，供宿主核对结算所依据的掉落表。

## 4. 安全与权威边界

- App 使用引擎统一的 `mulberry32` 与加权抽取纯函数；不使用 `Math.random` 或墙钟参与结算。
- seed 来自宿主，因此结果可回放，但客户端仍不是奖励权威方。宿主发奖前应自行重算或校验返回值。
- App 不读取 token、Cookie、背包或内部 HTTP，也不声明任何 DokiWorld scope/module。
- APPS 面板以空 `data` 直接启动时只展示本地演示宝箱，演示结果不会调用 `complete()`。
- 非法业务输入不会启动宿主开箱，也不会产生奖励结果。

## 5. 构建产物

权威源码与构建脚本位于 `dokiworld/game-loot-chest/`。执行其 `npm run build` 后，`dist/` 必须包含：

- `manifest.json`、`index.html`、`assets/`
- `ASSET-CLOSURE.json`
- `SHA256SUMS.txt`

构建包不包含源码、本机绝对路径、token 或旧 `app.manifest.json`。
