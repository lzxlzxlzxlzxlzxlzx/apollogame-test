# DokiWorlds 嵌入契约 v1（提案）

本契约建立在 DokiWorlds App SDK 3.1.1 的 `createAppClient`、input 验证与 `doki.game.result/1` 标准结果之上。它规定数据方向，不授权小游戏访问宿主存档、奖励或网络。

## 调用方 → `game-rhetoric-duel`

输入契约暂定为 `doki.game.rhetoric-duel-input/1`。App 必须在创建局面前校验 `contract`、`version` 与 `data`；不合法输入应向 SDK 报错，不得用猜测值开局。

```ts
type HostImageRef = {
  assetId?: string;              // 宿主资产标识，仅作追踪
  src: `https://${string}`;      // 已授权、可公开读取的图像 URL
  alt?: string;
};

type RhetoricDuelInputV1 = {
  sessionId: string;             // 不透明、非空；幂等/追踪键
  encounterId: string;           // 不透明、非空
  catalogVersion: 1;             // 必须匹配游戏内言弹目录版本
  rng: { algorithm: 'mulberry32-v1'; seed: number }; // uint32
  deck: Array<{ cardId: string; copies: number }>;
  encounter: {
    title: string;
    goal: string;
    victory: { kind: 'progress'; target: number };
    rules: {
      pressureLimit: number;
      turnLimit: number;
      openingHand: number;
      drawPerTurn: number;
      handLimit: number;
      focusPerTurn: number;
    };
    opponent: {
      id: string;
      name: string;
      subtitle?: string;
      portrait?: HostImageRef;
      intentions: Array<{
        id: string;
        label: string;
        effects: ClosedEffect[];
      }>;
    };
    background?: HostImageRef;
  };
};
```

`ClosedEffect` 是由游戏/引擎批准的闭集效果格式，尚待 `CAPGAP-RHETORIC-001` 的路径裁决；它绝不是宿主可执行脚本或任意表达式。其最终 schema 必须和游戏内部卡表共用同一个解释器与验证器。

### 输入边界

- 宿主**必须**传：玩家牌组引用、胜利条件、对手意图顺序、对手立绘与背景（需要展示时）、规则数值以及固定种子。
- 宿主**不得**传：卡牌名称、功能、费用、卡图、任意 JS/HTML/表达式、奖励结算或进度写入指令。
- `deck[].cardId` 必须存在于游戏内 `catalogVersion` 指定的目录；`copies` 必须是正整数且不超过该卡目录定义的上限。
- `intentions.length >= turnLimit`，从而 v1 不需要循环、随机或 AI 选招。
- 图片仅允许授权的 `https` URL；不得请求 cookie、鉴权头或私有路径。图片加载失败时使用游戏后备视觉，规则继续可玩。
- 所有数值需是有限整数并通过游戏定义的安全范围校验；零/负目标、非正回合上限、空牌组或未知效果均拒绝开局。

## `game-rhetoric-duel` → 调用方

游戏唯一的业务输出是 SDK 标准契约 `doki.game.result/1`：

```ts
client.createGameResult({
  normalizedScore: outcome === 'win' ? 100 : 0,
  outcome, // 'win' | 'loss'；用户在完成前主动退出时为 'exited'
  metrics: {},
});
```

v1 不回传奖励、掉落、牌组变更、敌人状态、回合日志或宿主存档补丁。宿主以其自身 `runId/sessionId` 确保只采纳一次终局结果；游戏不得自行调用外部奖励、成就或存档服务。

## 适配器职责

未来实现的 DokiWorlds 适配层只做四件事：读取并验证 input、把它映射为游戏配置、启动/终止游戏、将终局映射为标准 `GameResult`。它不包含抽牌、言弹结算、敌人意图或奖励逻辑。
