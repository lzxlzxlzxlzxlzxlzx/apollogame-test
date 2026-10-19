# 潜取（Stealth Theft）接入说明

`game-theft` 是一个“持续暴露 + 精准 QTE + 翻开隐藏槽位”的潜取演出。DokiWorlds 负责决定**能偷什么、总体有多难、成功后如何入背包/推进剧情、暴露后如何处理**；App 只负责本局互动，并在结算动画后回传玩家实际取得的物品 `entryId` 和过程统计。

> App 不读取背包、角色属性、任务、货币、Cookie 或 token，也不自行发奖。奖励、惩罚、剧情和幂等结算永远由 DokiWorlds 权威逻辑处理。

## 1. 身份、合同与生命周期

| 项目 | 固定值 |
| --- | --- |
| App ID | `game-theft` |
| 协议 | `dokiworld.app/2` |
| 输入合同 | `doki.game.theft-input` v3 |
| 输出合同 | `doki.game.theft-receipt` v3 |
| scopes / modules | 无 |

输入和输出均采用版本化 envelope：

```ts
type AppContract<T> = { contract: string; version: number; data: T };
```

从 DokiWorlds 调用时，使用 `apps.launch()`。仅当结果为 `completed` 时读取并校验输出；用户关闭窗口、刷新、超时或 App 请求退出都应视为 `cancelled`，不得据此发奖或施加惩罚。

```ts
const launched = await client.apps.launch({
  appId: 'game-theft',
  input: {
    contract: 'doki.game.theft-input',
    version: 3,
    data: theftInput,
  },
});

if (launched.status === 'completed') {
  const output = launched.output;
  // 先校验 output.contract === 'doki.game.theft-receipt'
  // 且 output.version === 3，再读取 output.data。
}
```

App 在终局后先播放约 2.8 秒结算动画，再调用一次 `complete()`；调用方不需要也不应自行计时提前关闭它。

## 2. 玩法与调用方职责

一局固定有 16 个环形位置：内环 4 个、外环 12 个。

1. App 按本局随机种子将 `items` 放入非黑位的隐藏位置；物品位置及空位对玩家未知。
2. 指针进入金色扇区时按空格或点击中央圆盘，命中“完美 QTE”会获得一枚开门钥匙，且该次不增加暴露值；金色扇区随后换到新的方向。
3. 未命中会按偏移量瞬间增加暴露值；无论是否按键，暴露值也会按难度持续增长。暴露值达到上限立即终局。
4. 每枚钥匙可随时翻开一个非黑位。翻到物品就取得该 `entryId`；翻空位只消耗钥匙。
5. 玩家可随时点击“立即撤退”，带走已取得的物品；取得输入列表中的全部物品时自动结束。

调用方只需要提供**一个总难度**，无需、也不能传每件物品的单独难度、玩家属性、暴露公式或 QTE 位置。妙手空空、烟雾弹、角色技能、守卫状态等业务因素，应由 DokiWorlds 先折算为本合同的 `difficulty`，并在收到结果后自行解释。

物品的物理位置由 App 随机决定；`items` 数组顺序不是翻开顺序。回执中的 `acquiredEntryIds` 按实际取得顺序排列，调用方应据此回查本次输入的 `items`，取得对应的 `itemId` 和 `quantity`。

## 3. 输入合同：`doki.game.theft-input` v3

> **在 DokiWorlds 的 APPS 调试面板中测试时**：面板已有独立的“合同”=`doki.game.theft-input` 和“版本”=`3` 字段。下方“数据”文本框只能粘贴 `data` 内部对象，不能再包一层 `contract/version/data`。完整 envelope 仅用于代码调用 `apps.launch()`。

### 3.1 调试面板可直接粘贴的示例

将合同设为 `doki.game.theft-input`、版本设为 `3`，然后在“数据”中粘贴：

```json
{
  "requestId": "theft-demo-ruins-001",
  "presentation": { "title": "遗迹守卫的腰包" },
  "target": { "id": "ruins-guard-pouch", "displayName": "遗迹守卫" },
  "difficulty": 50,
  "items": [
    { "entryId": "guard-key", "itemId": "iron-key", "displayName": "守卫钥匙", "quantity": 1, "image": "https://images.example.com/items/iron-key.png" },
    { "entryId": "silver-watch", "itemId": "silver-watch", "displayName": "银质怀表", "quantity": 1 },
    { "entryId": "sealed-letter", "itemId": "sealed-letter", "displayName": "密封信件", "quantity": 1 }
  ]
}
```

代码调用时才使用完整 envelope：

```json
{
  "contract": "doki.game.theft-input",
  "version": 3,
  "data": {
    "requestId": "theft-demo-ruins-001",
    "presentation": { "title": "遗迹守卫的腰包" },
    "target": { "id": "ruins-guard-pouch", "displayName": "遗迹守卫" },
    "difficulty": 50,
    "items": [
      { "entryId": "guard-key", "itemId": "iron-key", "displayName": "守卫钥匙", "quantity": 1 },
      { "entryId": "silver-watch", "itemId": "silver-watch", "displayName": "银质怀表", "quantity": 1 }
    ]
  }
}
```

### 3.2 字段、约束与实际消费方式

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `requestId` | string | 必填，去除首尾空白后 1–128 字符。本次潜取的稳定唯一 ID；原样回传，用于宿主幂等处理。 |
| `presentation.title` | string | 可选演出元数据；当前版本接受 string，供后续标题扩展使用，不参与难度或结算。 |
| `target` | object | 必填对象。`target.displayName` 必填非空、最多 128 字符；当前仅作目标展示元数据。`target.id` 可由宿主保留，但 v3 不读取也不回传。 |
| `difficulty` | safe integer | 必填。建议 `0..100`；App 会把越界安全整数钳制到该范围后映射成难度档。 |
| `items` | array | 必填。每项是一次可取得目标；总数量受 `difficulty` 对应的非黑位数量限制。 |
| `items[].entryId` | string | 必填、非空、同一局唯一；这是唯一会出现在 `acquiredEntryIds` 中的物品标识。 |
| `items[].itemId` | string | 必填非空；由宿主用来映射真实物品定义，不直接回传。 |
| `items[].displayName` | string | 必填非空、最多 128 字符；仅用于结算层展示。 |
| `items[].quantity` | positive safe integer | 必填；App 不拆分数量，宿主收到 `entryId` 后按本次输入的 quantity 发放。 |
| `items[].image` | HTTPS URL | 可选；用于结算物品图。非 HTTPS 字符串不会用于显示，不影响结算。 |

未知字段不会改变玩法；不要通过未知字段传递预设物品位置、指定 QTE 成败、种子、奖励或惩罚，App 都不会消费它们。

### 3.3 难度映射与物品数量上限

难度同时控制公开黑位数量和每秒被动暴露值。黑位是显式封死、无需尝试翻开的空位；低难度有更多黑位，因此可供搜索的位置更少。高难度可搜索位置更多，但暴露更快，连续偷取更危险。

| `difficulty` | 档案 | 黑位数 | 可翻位置 / 最大 `items` | 被动暴露速度 |
| --- | --- | ---: | ---: | ---: |
| `0..19` | forgiving | 10 | 6 | 180 bp/s（1.8%/s） |
| `20..39` | easy | 8 | 8 | 240 bp/s（2.4%/s） |
| `40..59` | standard | 6 | 10 | 320 bp/s（3.2%/s） |
| `60..79` | hard | 4 | 12 | 400 bp/s（4.0%/s） |
| `80..100` | expert | 2 | 14 | 500 bp/s（5.0%/s） |

暴露上限固定为 `10,000 bp`（100%）。QTE 一轮约 2 秒；命中金色区不会额外增加暴露，偏移越大，单次增加越多，最大为 `1,400 bp`（14%）。每次按下后指针会停留约 0.5 秒供反馈，但被动暴露仍持续。

**调参建议：**

- 想让一次偷取更宽松：使用 `difficulty: 0..39`，并将 `items` 控制在 1–3 个。
- 想要标准风险回报：使用 `difficulty: 40..59`，并放 2–5 个物品。
- 想要求玩家连续稳定命中 QTE：使用 `difficulty: 60..100`，并放 5 个以上物品；高难度即使黑位少，暴露速度也会显著压缩可尝试次数。
- 物品价值、技能、烟雾弹或“妙手空空”不直接传给 App。请先在 DokiWorlds 决定它们对总难度的影响，再传最终 `difficulty`。

### 3.4 空输入预览

APPS 调试面板以空对象 `{}` 启动时，App 会显示固定演示局，供检查 UI 和操作；它不会调用 `complete()`，也不会产生可用于业务结算的回执。

## 4. 输出合同：`doki.game.theft-receipt` v3

App 仅在游戏自然结局、玩家撤退或暴露后调用一次 `complete()`。示例：

```json
{
  "contract": "doki.game.theft-receipt",
  "version": 3,
  "data": {
    "requestId": "theft-demo-ruins-001",
    "outcome": "withdrew",
    "elapsedTicks": 486,
    "exposureBp": 2140,
    "acquiredEntryIds": ["silver-watch", "guard-key"],
    "revealedSlots": [6, 2, 11],
    "qteAttempts": 5,
    "perfectQtes": 3,
    "randomSeed": 184728391
  }
}
```

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `requestId` | string | 输入的 `requestId` 原样回传。 |
| `outcome` | `withdrew` / `cleared` / `exposed` / `aborted` | 底层潜取会话的终局状态。 |
| `elapsedTicks` | non-negative integer | 本局经过的 60Hz 固定 tick 数；仅诊断/展示用。 |
| `exposureBp` | integer | 终局暴露值，范围 `0..10000`；`10000` 表示已暴露。 |
| `acquiredEntryIds` | string[] | 实际取得的 `items[].entryId`，按取得顺序；暴露时仍会保留已取得的条目。 |
| `revealedSlots` | integer[] | 已翻开的内部槽位索引 `0..15`，仅诊断/回放用，不能映射为业务物品 ID。 |
| `qteAttempts` | non-negative integer | 玩家实际按下并被处理的 QTE 次数。 |
| `perfectQtes` | non-negative integer | 完美命中次数；不大于 `qteAttempts`。 |
| `randomSeed` | integer | 本局由 App 生成的 32 位随机种子，供日志或客户端回放关联；不是输入字段，也不能作为宿主权威随机源。 |

| 回执状态 | 何时产生 | 宿主通常如何处理 |
| --- | --- | --- |
| `withdrew` | 玩家主动撤退，尚未暴露。 | 按 `acquiredEntryIds` 处理已拿到的物品；空数组就是安全离开但一无所获。 |
| `cleared` | 输入列表中的所有物品均已取得。 | 按输入映射处理全部取得项。 |
| `exposed` | 暴露达到 100%。 | 仍可读取已取得项，但是否没收、报警、战斗或惩罚完全由 DokiWorlds 决定。 |
| `aborted` | App 内部配置无法继续执行的兜底状态。 | 不应发奖；记录诊断并检查调用参数。 |

结算画面中的“成功／暴露／逃跑”是展示文案，不是额外合同字段：

- `exposed` 始终显示“暴露”，即使玩家已经取得物品；
- 未暴露且取得至少一件物品显示“成功”；
- 未暴露且没有取得物品显示“逃跑”。

## 5. 宿主权威结算清单

1. 创建稳定且未使用过的 `requestId`；冻结本次 `difficulty` 与完整 `items` 列表。
2. 启动 App；若为 `cancelled`、超时或输入错误，按未完成处理，不发奖、不施加潜取后果。
3. 收到 `completed` 后先校验输出合同、版本、`requestId` 和字段类型。
4. 验证每个 `acquiredEntryIds` 都存在于本次冻结的输入中，且不重复；再用 `entryId` 查回对应的 `itemId`、`quantity` 和业务归属。
5. 在同一个宿主幂等事务中，根据 `outcome` 处理物品、警觉度、剧情或战斗后果，并将 `requestId` 标记为已结算。
6. 不要把浏览器输出或 `randomSeed` 当作服务器可验证的抽取结果。涉及稀有物品、货币、进度或对抗时，服务端仍应保有自己的权威规则与审计记录。
