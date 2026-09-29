# 物理骰子（Physics Dice）接入说明

本文面向在 DokiWorlds 中调用 `game-physics-dice` 的开发者。该 App 提供可点击、会落定的 3D 骰子演出；它不保存角色状态、不发放奖励，也不提供可由服务器验证的随机数。影响存档、任务或奖励的最终结算必须由宿主完成。

## 1. 应用身份与会话流程

| 项目 | 固定值 |
| --- | --- |
| App ID | `game-physics-dice` |
| 协议 | `dokiworld.app/2` |
| 输入合同 | `doki.game.dice-input` v1 |
| 输出合同 | `doki.game.result` v1 |
| 作用域 / modules | 无 |

宿主创建该 App 后，SDK 会先收到 App 的 ready 消息，再向它发送 `init.input`。输入和输出都必须是版本化 envelope：

```ts
type AppContract<T> = { contract: string; version: number; data: T };
```

从 DokiWorlds 的其他 App 调用时，使用 `client.apps.launch()`；结果只在 `status === 'completed'` 时读取。用户关闭窗口或 App 请求退出时，按 `cancelled` 处理，不能据此改变游戏状态。

```ts
const launched = await client.apps.launch({
  appId: 'game-physics-dice',
  input: {
    contract: 'doki.game.dice-input',
    version: 1,
    data: { dice: [{ sides: 20 }], title: '敏捷检定', difficulty: 12 },
  },
});

if (launched.status === 'completed') {
  const output = launched.output; // 先校验 contract/version，再读取 data
}
```

不要使用 `apollo:dice:roll`、`apollo:dice:result` 等消息；它们只在 App 内部连接 3D 覆盖层，非公开 API。

## 2. 输入合同：`doki.game.dice-input` v1

> **在 DokiWorlds 的 APPS 调试面板中测试时**：面板已有独立的“合同”和“版本”字段，分别保持 `doki.game.dice-input` 与 `1`。下方“数据”文本框只粘贴 `data` 内部对象，**不要**再包一层 `contract/version/data`；否则骰池会变成 `data.data.dice`，App 会拒绝输入并退出。只有代码调用 `apps.launch()` 时才传完整 envelope。

调试面板“数据”应粘贴：

```json
{
  "dice": [{ "sides": 20 }, { "sides": 6 }],
  "title": "盗贼的机关检定",
  "modifier": 2,
  "modifierSource": "敏捷 + 工具熟练",
  "backdrop": "moonlit-ruins",
  "difficulty": 18
}
```

完整启动载荷如下。`data` 内只有 `dice` 必填；其余字段都可省略。

```json
{
  "contract": "doki.game.dice-input",
  "version": 1,
  "data": {
    "dice": [{ "sides": 20 }, { "sides": 6 }],
    "title": "盗贼的机关检定",
    "modifier": 2,
    "modifierSource": "敏捷 + 工具熟练",
    "backdrop": "moonlit-ruins",
    "difficulty": 18
  }
}
```

### 2.1 字段与约束

| 字段 | 类型 | 规则与默认值 |
| --- | --- | --- |
| `dice` | `{ sides }[]` | 必填，1–3 颗；每颗只能是 `d4`、`d6`、`d8` 或 `d20`，即 `sides: 4/6/8/20`。顺序会保留到 `roll` 输出。 |
| `title` | string | 可选；去除首尾空白后 1–48 个字符；只影响窗口标题。 |
| `modifier` | safe integer | 可选，默认 `0`；加到骰子总点数。 |
| `modifierSource` | string | 可选；去除首尾空白后 1–24 个字符；用于解释修正来源。即使 `modifier` 为 0，传入它也会显示修正卡。 |
| `backdrop` | enum | 可选，默认 `arcane-vault`；只改变画框皮肤。 |
| `difficulty` | safe integer | 可选，范围 `0..9999`；启用标准阈值判定。 |
| `judgement` | `{ bands }` | 可选；启用自定义分区判定，优先级高于 `difficulty`。 |

允许的背景值及视觉主题：

| `backdrop` | 主题 |
| --- | --- |
| `arcane-vault` | 奥术画框（默认） |
| `royal-velvet` | 皇家绒幕 |
| `moonlit-ruins` | 月夜遗迹 |
| `infernal-forge` | 炼狱熔炉 |

### 2.2 多骰子调用示例

骰池最多三颗，可混合面数。点数总和按所有骰子的落点相加，修正值只在合计后加一次。

```json
{
  "contract": "doki.game.dice-input",
  "version": 1,
  "data": {
    "dice": [{ "sides": 4 }, { "sides": 8 }, { "sides": 20 }],
    "title": "奥术共鸣",
    "modifier": -1,
    "modifierSource": "诅咒",
    "backdrop": "infernal-forge",
    "difficulty": 16
  }
}
```

此例的裸骰范围是 `3..32`，最终范围是 `2..31`。例如落点为 d4=3、d8=6、d20=14 时，`total=23`、`finalTotal=22`，达到难度 16。

### 2.3 标准阈值与自定义结果分区

传 `difficulty` 时，App 使用标准模式：

```text
total      = 每颗物理骰子的朝上点数之和
finalTotal = total + modifier
passed     = finalTotal >= difficulty
diceOutcome = passed ? "success" : "failure"
```

若业务需要多种结果，传 `judgement.bands`，它会覆盖 `difficulty`。每一项均为闭区间；所有区间必须互不重叠、没有空洞，并完整覆盖**当前骰池加修正后的全部可能总分**。`outcome` 是 1–48 个非空白字符的业务标签。此模式会隐藏“难度等级”及其数字；结算时直接展示命中 band 的 `outcome` 原文。

```json
{
  "contract": "doki.game.dice-input",
  "version": 1,
  "data": {
    "dice": [{ "sides": 20 }],
    "modifier": 1,
    "title": "交涉结果",
    "backdrop": "royal-velvet",
    "judgement": {
      "bands": [
        { "min": 2, "max": 5, "outcome": "critical-failure" },
        { "min": 6, "max": 10, "outcome": "failure" },
        { "min": 11, "max": 18, "outcome": "success" },
        { "min": 19, "max": 21, "outcome": "critical-success" }
      ]
    }
  }
}
```

App 不隐含“天然 1 失败”或“天然 20 成功”规则；若需要，使用上述分区明确表达。不要同时依赖 `difficulty` 与 `judgement`：两者都传时只按 `judgement` 结算。

### 2.4 输入失败与预览

不合规的骰子数量、面数、整数、文本长度或分区会使 App 拒绝该会话；宿主应把这视为调用参数错误，不应自动重试或发放奖励。APPS 面板以空的 `data: {}` 启动时仅显示本地预览，不会代表一次宿主会话，也不会产出可结算结果。

## 3. 输出合同：`doki.game.result` v1

物理骰子停止、判定动画完成后，App 恰好调用一次 `complete()`。标准阈值示例：

```json
{
  "contract": "doki.game.result",
  "version": 1,
  "data": {
    "normalizedScore": 55,
    "outcome": "win",
    "metrics": {
      "total": 10,
      "diceCount": 1,
      "roll": "d20:10",
      "randomSource": "physics",
      "physics": true,
      "modifier": 1,
      "finalTotal": 11,
      "difficulty": 10,
      "passed": true,
      "diceOutcome": "success"
    }
  }
}
```

| 字段 | 类型 | 存在条件 | 含义 |
| --- | --- | --- | --- |
| `normalizedScore` | number | 始终 | `clamp(round(finalTotal / 所有骰面数之和 * 100), 0, 100)`。仅适合展示，不是概率或奖励倍率。 |
| `outcome` | `win` / `loss` / `completed` | 始终 | 标准阈值为 `win/loss`；无判定或自定义分区为 `completed`。 |
| `metrics.total` | number | 始终 | 未加修正的骰子总点数。 |
| `metrics.diceCount` | number | 始终 | 实际骰子数量。 |
| `metrics.roll` | string | 始终 | 输入顺序的 `d面数:点数` 串，例如 `d6:3,d20:17`。 |
| `metrics.randomSource` | `physics` | 始终 | 物理落点来源标记。 |
| `metrics.physics` | `true` | 始终 | 物理骰子标记。 |
| `metrics.modifier` / `finalTotal` | number | 有修正或任一判定时 | 实际修正及修正后总分。 |
| `metrics.difficulty` / `passed` | number / boolean | 标准阈值模式 | 输入难度和是否通过。 |
| `metrics.diceOutcome` | string | 任一判定模式 | `success/failure`，或自定义分区的 `outcome`。 |

接入方必须校验输出的 `contract` 与 `version`，再读取类型正确的字段。它不应仅信任 `normalizedScore` 或顶层 `outcome`；若需要业务标签，读取 `metrics.diceOutcome`。

## 4. 权威边界与接入建议

- 物理结果发生在浏览器客户端，不能作为服务器可验证的随机源。涉及货币、物品、进度或对抗结果时，宿主/服务器应自己投掷或复核，并以权威结果写入状态。
- 不要向输入传 seed、预定点数或奖励数据；该合同不接受这些字段来控制结果。
- 每个 `apps.launch` 只应对应一笔待处理业务操作。收到 `completed` 后按宿主的 request/session ID 做幂等处理；收到 `cancelled`、超时或错误时不结算。
- App 不读取 Cookie、token、背包或宿主业务状态；它只消费本合同数据。
- 当前发布包为跨源嵌入兼容而使用宽松的 App `targetOrigin`，但 SDK 仍检查父窗口来源、协议、`appId`、`instanceId` 与 `runId`。宿主仍应只加载受信任的 App URL，并配置允许 iframe 嵌入。

## 5. 上线前核对清单

1. `appId` 为 `game-physics-dice`，输入合同/版本为 `doki.game.dice-input` / `1`。
2. `dice` 为 1–3 个 d4/d6/d8/d20，且自定义分区覆盖了完整可达分数范围。
3. 宿主区分 `completed` 与 `cancelled`，并校验输出 envelope。
4. 奖励或存档只由宿主的权威逻辑落库；物理骰子输出只作为演出/客户端结果参考。
