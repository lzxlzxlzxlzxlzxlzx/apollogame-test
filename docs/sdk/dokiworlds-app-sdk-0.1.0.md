# DokiWorlds App SDK 0.1.0 实查快照

> **历史快照。** 当前接入版本已升级到 0.2.0，初始化输入缺口已经修复；新实现与评审应读取
> [`dokiworlds-app-sdk-0.2.0.md`](dokiworlds-app-sdk-0.2.0.md)。本文只保留用于解释 0.1.0 曾经发生过的回退。

> 实查日期：2026-09-24  
> 上游源码：`C:\Users\24652\Desktop\projects\dokiworlds\packages\dokiworlds-app-sdk`  
> 包名：`dokiworlds-app-sdk`；版本：`0.1.0`  
> 本文覆盖当前本机 DokiWorlds 的本地 App 测试接入。旧 `@dokiworld/app-sdk` 2.x/3.1.1 文档仅作历史资料，不得拿来推断当前 API。

## 1. 当前公开能力

浏览器 ESM 根入口导出：

- `createAppClient({ appId, targetOrigin, ... })`
- `client.connect()`
- `client.complete({ contract, version, data })`
- `client.apps.launch({ appId, input })`
- `client.dispose()`
- 宿主侧 `createAppHost(...)`、`createAppsHostExtension(...)`

协议仍为 `dokiworld.app/2`。输入和输出统一使用：

```ts
type AppContract<T> = {
  contract: string;
  version: number;
  data: T;
};
```

边界：单 payload 64 KiB、最大深度 12、最多 2000 节点、ID/键最长 200 字符。`apps.launch` 默认超时一小时；`complete` 等待宿主确认约三秒，返回 `'accepted' | 'rejected'`。

## 2. 与旧 SDK 的不兼容差异

| 旧代码/文档 | 当前 0.1.0 |
|---|---|
| 包名 `@dokiworld/app-sdk` | 包名 `dokiworlds-app-sdk` |
| `connect({ onInit, onPrepareExit, onExitDecision, onError })` | `connect()` 无参数 |
| `onInit(payload)` 读取 `locale/context/input` | **当前不公开 init payload，只设置 `client.runId`** |
| `@dokiworld/app-sdk/game-result` | 无该子路径；直接构造版本化输出 envelope |
| character/dialogue/media/storage 等扩展 | 0.1.0 未公开；当前重点是 `apps.launch` 与最小生命周期 |
| 完整 catalog manifest schema | 当前本地目录加载器只读取极小 `manifest.json` 子集 |

不得通过 App 自己监听原始 `postMessage` 来补 `onInit`：这会复制协议校验、origin、runId、去重和生命周期逻辑，形成不安全的平行 SDK。

## 3. 当前本地 App 放置规范

目标目录：

`C:\Users\24652\Desktop\projects\dokiworlds\frontend\public\apps\<app-id>\`

要求：

- `<app-id>` 只能由小写字母、数字、`.`、`-` 组成，且首尾为字母或数字；
- 默认入口为 `index.html`，入口与全部静态资源必须在该目录内；
- SDK 要由构建工具打进浏览器 bundle，静态 HTML 不能直接解析 npm 裸包名；
- 当前 loader 最多枚举 100 个合法子目录；
- 该入口属于可信本地调试面；生产环境只有 `NEXT_PUBLIC_GAME_DEBUG_CONSOLE=1` 时开放。

可选 `manifest.json`：

```json
{
  "entry": "index.html",
  "locales": { "en": { "name": "Game name" } },
  "runtime": {
    "input": { "contract": "doki.example.input", "version": 1 }
  }
}
```

当前 loader 只读取 `entry`、`locales.en.name`、`runtime.input.contract/version`。从 APPS 面板直接启动时，宿主始终补 `data: {}`；manifest 当前不能定义默认 data。缺 manifest 时使用 `doki.dev.launch/1` 与空数据。

## 4. 当前已知限制

宿主会发送 `{ locale, grantedScopes, context, input }`，但 0.1.0 客户端收到 `dokiworld-app-init` 后只保存 `runId` 并回复 initialized，未把 payload 暴露给调用方。因此：

- 不消费启动输入的展示型 App，可以测试握手和 `complete`；
- 父 App 可以通过 `apps.launch` 发送输入，但子 App 仍无法用公开 API 读取；
- 所有依赖 `input.data` 的真实游戏，目前无法完成端到端输入测试；
- APPS 直接启动又只给 `{}`，不能替代真实业务输入。

推荐的上游补口是为 `connect` 增加受控 `onInit(payload)`，或提供一次性 `client.initialized`/`client.getInit()` Promise，公开经 SDK 校验后的 `locale`、`grantedScopes`、`context`、`input`，并定义重复 init 和 dispose 行为。游戏侧不得自行实现协议旁路。

### 4.1 旧版 3.1.1 对照结论

本仓实际安装的 `@dokiworld/app-sdk@3.1.1` 已具备完整宿主输入：

- `ExternalAppInitPayload<Input>` 明确定义 `locale`、`grantedScopes`、`context` 和 `input.data`；
- `connect({ onInit })` 把经过协议、身份、contract 和有界 JSON 校验的 payload 交给 App；
- `onInit` 成功后才发送 `dokiworld-app-initialized`；重复 init messageId 会幂等重发 initialized，不会重复开局；
- `game-dice` 当前正是通过该接口读取骰池。

所以 0.1.0 的问题不是宿主没在 wire 上发送输入，而是新客户端实现收到后丢弃了 init payload。这是相对旧版的明确能力回退。

## 5. 本仓迁移纪律

1. 游戏规则与 DokiWorld 接线分离；SDK adapter 只做输入契约校验、config 投影和终局输出投影。
2. 任何迁移必须先点名输入和输出 contract/version，再编译 adapter；不得用预览默认值冒充宿主输入测试。
3. 先验证静态包相对路径、自包含资产与 catalog 可发现性，再验证握手，再验证输入，最后验证输出确认。
4. 当前 `dokiworld/<app-id>/dist` 不能直接视为新目录格式合格：必须检查新包名/API、`manifest.json` 文件名和 loader 实际读取字段。
