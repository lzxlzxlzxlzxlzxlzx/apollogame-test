# @dokiworld/app-sdk 2.1.0 · 接口面实查清单

> **归档接口面。** 当前本机 `public/apps` 接入以
> [`../../sdk/dokiworlds-app-sdk-0.1.0.md`](../../sdk/dokiworlds-app-sdk-0.1.0.md)
> 为准；包名和 API 不兼容。

> 归档件（owner 2026-08-13 令「读一下列出来」）。来源=**真安装包 d.ts/js 实查**（`dokiworld/game108/node_modules/@dokiworld/app-sdk`），非文档手抄；SDK 升版后以新包实查为准。协议语义见规范快照 `app-sdk-app-development.zh-CN.md`。

## 核心（`@dokiworld/app-sdk` 主入口）

- `createAppClient({appId, extensions})` → `connect({onInit, onPrepareExit, onExitDecision})` / `complete(output)` / `send/onMessage`（生命周期·重试·resultId 去重全 SDK 管，不手写 postMessage）。
- `createAppHost`（假宿主·本地测试用，我们的 host-witness 就靠它）；`./testing` 另有测试件。
- Legacy v1 兼容层（`createLegacyAppClient/GameClient/WorldClient` 等）——旧协议时代产物，**我们不用**。

## 能力模块（App 侧可调方法 · 每个都要 manifest+createAppClient 声明才通）

| 模块 | App 能调什么 | 一句话 |
|---|---|---|
| `./dialogue` | `generateDialogue` / `regenerateDialogue` / `generateOpening` / `generateSuggestions`（回复建议）/ `generateTagline` | **宿主的 LLM 替你生成对话**——开场白、台词、重生成、给玩家的回复候选、tagline |
| `./media` | `generateImage` / `generateVideo` / `getJob` / `cancelJob`（任务式·轮询 job） | 宿主的文生图/文生视频 |
| `./speech` | `synthesize` | 角色语音合成（TTS） |
| `./character` | `getCurrent` / `getPublicProfile(characterId)` | 当前授权角色资料 / 按 id 查公开资料（**game108 在用**） |
| `./persona` | `list` / `getSelected(characterId)` / `requestSelection`（可信选择 UI） | 玩家人设：列出、查当前选中、**弹宿主的人设选择器** |
| `./storage` | `loadCheckpoint` / `saveCheckpoint` / `clearCheckpoint` | App 隔离存档位（**game108 挂起/恢复在用**·⚠ payload 三上限 64KB/2000 节点/深 12） |
| `./apps` | `list({capability?})` / `launch(request)`（默认 1h 超时） | 查询并启动**嵌套 App**（App 里开 App） |
| `./episode` | `createEpisodeClientExtension`（语义事件收发）+ `resolveEpisodeGameResult(output, routes)` | Episode World 专用：世界卡剧集事件 + 按游戏结果路由后续分支 |
| `./game-result` | `createGameResult({normalizedScore, outcome, metrics})` / `parseGameResult` | 规范结算对象的造与验（**game108 在用**） |

## 我们的消费现状与候选

- **在用（game108）**：核心生命周期 + `character` + `storage` + `game-result`。
- **约会线天然候选**（World/剧情向产物时评估）：`dialogue`（对话生成=剧情线主粮）· `media`（立绘/场景现场生成）· `speech`（伴侣语音）· `persona`（玩家人设进剧情）· `episode`（World 形态必用）。
- **红线不变**：接哪个模块=manifest/createAppClient/真创建三处一致；只声明真用到的；capability 请求带短超时兜宿主缺席。
