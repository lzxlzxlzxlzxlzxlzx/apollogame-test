# 物理骰子 SDK 合同 v1

本文是 `game-physics-dice` 对 DokiWorld 的输入输出单一规范。公共边界使用 `dokiworlds-app-sdk@0.2.0`；`apollo:dice:roll` 与 `apollo:dice:result` 只属于卡带内部桥接，不是调用方 API。

## 1. 应用与协议标识

| 项目 | 固定值 |
|---|---|
| App ID | `game-physics-dice` |
| App 协议 | `dokiworld.app/2` |
| 输入合同 | `doki.game.dice-input/1` |
| 输出合同 | `doki.game.result/1` |

## 2. 输入

宿主通过 `createAppHost()` 的 `init.input` 传入：

```json
{
  "contract": "doki.game.dice-input",
  "version": 1,
  "data": {
    "dice": [{ "sides": 20 }],
    "title": "智力检定",
    "difficulty": 10,
    "modifier": 1,
    "modifierSource": "智力",
    "backdrop": "moonlit-ruins"
  }
}
```

等价 TypeScript 数据结构：

```ts
type DiceSides = 4 | 6 | 8 | 20;
type DiceBackdrop =
  | 'arcane-vault'
  | 'royal-velvet'
  | 'moonlit-ruins'
  | 'infernal-forge';

type DiceRollInput = Readonly<{
  dice: readonly Readonly<{ sides: DiceSides }>[]; // 1–3 颗
  title?: string;                                  // 去空白后 1–48 字符
  modifier?: number;                               // 安全整数，缺省 0
  modifierSource?: string;                         // 去空白后 1–24 字符
  backdrop?: DiceBackdrop;                         // 缺省 arcane-vault
  difficulty?: number;                             // 0–9999 安全整数
  judgement?: Readonly<{
    bands: readonly Readonly<{
      min: number;
      max: number;
      outcome: string;                             // 去空白后 1–48 字符
    }>[];
  }>;
}>;
```

### 2.1 判定模式

标准阈值模式传 `difficulty`：

```text
total      = 每颗骰子的物理朝上点数之和
finalTotal = total + modifier
passed     = finalTotal >= difficulty
outcome    = passed ? "success" : "failure"
```

自定义分区模式传 `judgement.bands`。每个 `{min,max}` 是包含两端的整数闭区间，命中对象是 `finalTotal`。所有区间必须互不重叠、无空隙，并覆盖该骰池在当前修正值下的全部可能点数；自定义分区优先于 `difficulty`。引擎不内置天然 1、天然 20、大成功或大失败规则。

```json
{
  "dice": [{ "sides": 20 }],
  "modifier": 1,
  "judgement": {
    "bands": [
      { "min": 2, "max": 5, "outcome": "critical-failure" },
      { "min": 6, "max": 10, "outcome": "failure" },
      { "min": 11, "max": 18, "outcome": "success" },
      { "min": 19, "max": 21, "outcome": "critical-success" }
    ]
  }
}
```

### 2.2 输入约束

- `dice` 必须有 1–3 项，只允许 d4、d6、d8、d20。
- `modifier`、`difficulty` 与所有区间端点必须是安全整数。
- 调用方不能传 seed、预定点数或结果；点数来自浏览器物理骰落定后的真实朝上面。
- `title`、`modifierSource` 和 `backdrop` 只影响展示，不影响随机或判定。
- 非法输入不会启动骰局；调用方不得依赖客户端物理结果处理服务器权威奖励。

## 3. 输出

正常结束调用 `app.complete()` 返回标准 `doki.game.result/1`：

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

`normalizedScore = clamp(round(finalTotal / sum(die.sides) * 100), 0, 100)`。

| 字段 | 类型 | 何时存在 | 含义 |
|---|---|---|---|
| `total` | number | 始终 | 未加修正的点数总和 |
| `diceCount` | number | 始终 | 骰子数量 |
| `roll` | string | 始终 | 按输入顺序编码，如 `d6:3,d20:17` |
| `randomSource` | `"physics"` | 始终 | 结果来自物理朝上面 |
| `physics` | `true` | 始终 | 物理骰标记 |
| `modifier` | number | 有修正或判定时 | 实际应用的修正值 |
| `finalTotal` | number | 有修正或判定时 | `total + modifier` |
| `difficulty` | number | 标准阈值模式 | 标准难度 |
| `passed` | boolean | 标准阈值模式 | 是否达到难度 |
| `diceOutcome` | string | 有判定时 | `success/failure` 或调用方区间标签 |

标准阈值模式中 `passed=true` 对应顶层 `outcome='win'`，`passed=false` 对应 `outcome='loss'`。自定义分区没有通用胜负语义，因此顶层为 `outcome='completed'`，调用方读取 `metrics.diceOutcome` 获得业务结果。

## 4. 会话语义

- 每个 SDK run 只结算一次；重复完成不会改写首个结果。
- 最终判定动画显示完成后才向宿主调用 `app.complete()`。
- App 不保存进度；当前 0.2.0 最小 SDK 没有旧版 `onPrepareExit` 生命周期，宿主关闭按 cancelled 处理。
- 浏览器物理是客户端表现与交互结果，不是服务器可验证的确定性模拟。需要权威奖励时，宿主必须自行验证或改用服务器骰源。

## 5. 内部桥接边界

卡带内部用 `apollo:dice:roll` 把已通过 SDK 校验的输入送到 Three/Cannon 覆盖层，并用 `apollo:dice:result` 收回 `{dice,total,finalTotal,...}`。这两个事件不承诺跨版本兼容，DokiWorld 调用方不得直接依赖它们。
