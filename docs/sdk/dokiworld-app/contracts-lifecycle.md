# DokiWorld App 合同与生命周期规范

## 1. 统一 Envelope

```ts
type AppContract<T> = Readonly<{ contract: string; version: number; data: T }>
```

`contract` 必须稳定、非空且带命名空间；`version` 为正整数；`data` 必须有界且可 JSON 序列化。单条 SDK payload 不超过 64 KiB。禁止函数、DOM、类实例、Map、Set、循环引用和 `undefined`。推荐命名：`doki.game.<slug>-input` 与 `doki.game.<slug>-result`。

## 2. 输入设计

- 只传启动这一局必需的事实，优先枚举、范围整数、版本化 ID 和闭集 DSL。
- 不把完整角色、世界、背包或数据库对象整包传入。
- 不传 App 本应保密的谜底；展示 URL 和文案必须标为 render-only。
- 每字段必须规定类型、必填性、值域、长度、默认值、规则影响和非法行为。
- 默认拒绝未知额外键，避免调用方误以为字段生效。
- TypeScript 类型不构成运行时防线；必须由严格 parser 校验原型、键集合和值域。

## 3. 输出设计

- 只返回宿主后续处理必需且可从最终状态确定派生的事实。
- 不返回动画阶段、内部谜底、调试数据或无用 UI 状态。
- App 不直接写奖励、存档或剧情；宿主根据输出做幂等权威处理。
- 每个会话最多一次成功 `complete()`；返回合同必须在 manifest 的 outputs 内。

## 4. 宿主调用

```ts
const launched = await client.apps.launch({
  appId: 'game-example',
  input: {
    contract: 'doki.game.example-input',
    version: 1,
    data: { difficulty: 'normal' },
  },
})

if (launched.status === 'completed') {
  const output = parseOutputContract(launched.output)
  await settleOnce(requestId, output)
} else {
  // cancelled：关闭、返回或取消；不是游戏失败。
}
```

调用方须在自身 ready 后 launch，校验输出 contract/version/data，区分 completed 与 cancelled，捕获 SDK 错误，并用 request/session ID 去重。错误与 cancelled 均不得伪装成业务失败。

## 5. 被调用 App

```ts
const app = createAppClient({ appId: 'game-example', targetOrigin: '*' })
const disconnect = app.connect()
let completed = false

void app.whenReady({ timeoutMs: 10_000 }).then((input) => {
  startGame(parseInputContract(input))
}).catch((error) => {
  showConfigurationError(error)
  app.requestExit()
})

async function finish(output: AppContract<unknown>) {
  if (completed) return
  completed = true
  const ack = await app.complete(output)
  if (ack !== 'accepted') completed = false
}

window.addEventListener('pagehide', () => {
  disconnect()
  app.dispose()
  unmountGame()
}, { once: true })
```

固定顺序为 `createAppClient → connect → whenReady → start`。禁止手写 postMessage。页面离开时必须清理 SDK、渲染器、监听器、计时器和音频。

## 6. Preview 与终局语义

APPS 面板直接启动通常提供正确 contract/version 和空 `data:{}`；这是目录预览，不是正式业务调用。可以进入明确标识的 preview 或展示配置错误，但不得 `complete()`、不得生成可结算结果。面板数据框通常只粘贴 `data` 内部对象；代码 `apps.launch()` 才传完整 envelope。

| 情况 | 行为 |
|---|---|
| 达成玩法终局 | `complete(versionedOutput)` |
| 玩家作出合同定义的失败选择 | complete 失败结果 |
| 关闭、返回、取消 | `requestExit()` / cancelled |
| 输入非法 | 展示配置错误并 requestExit |
| complete rejected/timeout | 保留终局，提示重试；不换结果重复提交 |

## 7. 随机与权威

规则禁止 `Math.random`。宿主要重演时，输入传稳定 seed、表版本与 requestId，输出给可核验回执；仅需会话确定时，可由 SDK 的 instanceId/runId 经引擎稳定 hash 派生 seed；纯演出时宿主直接传已决定结果。调用说明必须说明谁有最终裁决权以及结果能否重算。

