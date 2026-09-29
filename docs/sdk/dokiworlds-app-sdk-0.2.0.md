# DokiWorlds App SDK 0.2.0 实查快照

> 实查日期：2026-09-28  
> 上游源码：`C:\Users\24652\Desktop\projects\dokiworlds\packages\dokiworlds-app-sdk`  
> 包名/版本：`dokiworlds-app-sdk@0.2.0`

## 当前 App 生命周期

1. App 调用 `createAppClient({ appId, targetOrigin })`。
2. App 调用无参数 `connect()`，SDK 发送 `dokiworld-app-ready`。
3. 宿主发送 `dokiworld-app-init`；SDK 只公开其中通过验证的版本化 `input`。
4. SDK 保存 `input` 的隔离副本，随后回复 `dokiworld-app-initialized`。
5. 游戏使用 `await client.whenReady({ timeoutMs })` 等待真实输入，或在初始化后读取 `client.input` 的副本。
6. 终局调用 `client.complete(output)`，SDK 发送 `dokiworld-app-complete` 并等待宿主 ack。
7. App 内退出按钮或 Escape 调用 `client.requestExit()`；不得自行操作父窗口。

`0.2.0` 的工作区实现发生过一次不兼容更新，包版本号没有变化。旧的 `AppInitPayload`、
`connect({ onInit })`、`client.initialized` 与 `client.getInit()` 已不存在；同步 SDK 时必须同时迁移 App 入口。

`input` 与 `output` 都是版本化 contract envelope：

```ts
type AppContract<T> = {
  contract: string;
  version: number;
  data: T;
};
```

SDK 会拒绝不满足 envelope、大小、深度或节点数限制的 payload。游戏必须继续在自己的 adapter 中校验
`contract`、`version` 与 `data` 业务字段，不能把类型声明当运行时验证。

当前已部署的 `game-physics-dice@1.0.2` 与 `game-loot-chest@1.0.3` 使用 `targetOrigin: "*"`，以兼容
不同 origin 的正式宿主。SDK 仍强制校验 `event.source === window.parent`、协议版本、`appId`、
`instanceId` 与 `runId`。若调用方能够在启动参数中提供确定的宿主 origin，应优先收窄为该 origin。

## 当前本地目录规范

入口目录为 `frontend/public/apps/<app-id>/`，包根使用最小 `manifest.json`：

```json
{
  "entry": "index.html",
  "locales": { "en": { "name": "Physics Dice" } },
  "runtime": {
    "input": { "contract": "doki.game.dice-input", "version": 1 }
  }
}
```

不得再把旧路线的 `app.manifest.json` 当作当前 loader 清单。APPS 面板直接启动时，宿主会按 manifest
构造空 `data: {}`；这只是预览启动。由另一个 App 通过 `apps.launch` 调用时，0.2.0 会把调用方提供的
真实 contract 输入交给目标 App。

## 本仓骰子游戏落点

- 输入：`doki.game.dice-input/1`
- 输出：`doki.game.result/1`
- 协议 adapter：`games/game-dice/game-dice.ts`
- 出包根：`dokiworld/game-physics-dice/dist`
- SDK：随静态 JS bundle 打入，不依赖宿主安装 npm 包。

## 本仓宝箱游戏落点

- 输入：`doki.game.chest-input/2`
- 输出：`doki.game.chest-result/2`
- 协议 adapter：`dokiworld/game-loot-chest/src/main.ts`
- 出包根：`dokiworld/game-loot-chest/dist`
- SDK：与骰子共用 `vendor/dokiworlds-app-sdk` 单一镜像。
