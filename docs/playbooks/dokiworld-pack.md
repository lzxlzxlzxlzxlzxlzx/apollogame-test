# DokiWorld 出包线手册（ZeroCraft 产物 → DokiWorld iframe App）

> **2026-09-28 当前本机接入订正：** DokiWorlds 当前本地包为
> `dokiworlds-app-sdk@0.2.0`，测试 App 放在
> `C:\Users\24652\Desktop\projects\dokiworlds\frontend\public\apps\<app-id>\`。
> 新包提供最小 v2 生命周期、`complete`、`requestExit`、`apps.launch`，并通过
> `await whenReady()` / `client.input` 公开宿主初始化输入；旧 `AppInitPayload`、
> `connect({onInit})`、`initialized`、`getInit()` 已删除；详见
> [`docs/sdk/dokiworlds-app-sdk-0.2.0.md`](../sdk/dokiworlds-app-sdk-0.2.0.md)。
> 本册下方关于 `@dokiworld/app-sdk` 2.x/3.x、完整 catalog schema、capability profile 和旧发布仓的内容是
> **历史发布路线**，不得直接用于当前 `public/apps` 本地测试。

> **owner 2026-08-12 立线：以后 ZeroCraft 做出来的东西都要能往 DokiWorld 打包**。
> 事实来源=官方规范快照 `docs/design/dokiworld/app-sdk-app-development.zh-CN.md`（对方接口一切以它为准·本册只讲我们怎么接）；
> 可跑样例 https://github.com/raptoravis/dokiworld-apps（读法：`add_repo` 匿名克隆）。**2026-08-18 那仓升到 SDK 3.0**，四个样例：
> `game-match3`=Game·零 capability；**`tower-confessions`=Game·真用 capability（我们的对照组，照它抄）**；`storyteller`/`banquet-contract`=World。

## 一句话

当前本地测试形态 = 自包含静态目录 + 最小 `manifest.json` + `dokiworlds-app-sdk` 打入 bundle；
APPS 面板直接启动仍只会提供 manifest 的 contract/version 和空 `data:{}`，嵌套调用则可通过 0.2.0 的 init API
读取真实 `input.data`。完整业务输入输出测试不能用预览默认值冒充。

资产出包统一调用 `scripts/app-asset-closure.mjs`：输入游戏本地 AssetIndex、art 根和 dist，输出 portable index、复制后的真实字节与 `ASSET-CLOSURE.json`。禁止后续 App 再手写一套资产遍历/复制；字体等非游戏 art 依赖用 `extraTrees` 显式登记，缺文件、路径逃逸、远端资产或 material 悬空 key 直接失败。

调用说明出包统一调用 `scripts/app-documentation-closure.mjs`：`manifest.documentation` 是唯一清单，构建时校验 locale、标题、安全相对 `.md` 路径和源文件，并把每种语言的说明原样复制进 dist。发布屏在 App 自身 build 后还会统一执行 `scripts/dokiworld-docs-export.mjs <app-id>`，保证新建/更新 App 不会因遗漏私有复制代码而带出旧文档。`scripts/dokiworld-docs-guard.mjs` 已进常驻门禁；新增或更新 App 若漏声明、文件缺失、路径逃逸或使用 DokiWorlds 不支持的语言键，构建/门禁必须失败，禁止每个 App 手写 `copyFile` 绕过。

以下原有一句话描述的是旧发布路线：

App = **独立构建的自包含浏览器静态包**（`dist/` 里 manifest+html+js+全部资产·相对路径），经 `@dokiworld/app-sdk` 与宿主 iframe 通信。我们的游戏 = 引擎+游戏打成一个 bundle + 一层薄 SDK 接线（生命周期与结果上报），**不改玩法代码**。

## 做 X → 用什么

| 任务 | 用什么 | 要点 |
|---|---|---|
| 建 App 目录 | 本仓 `dokiworld/<app-id>/`（package.json+scripts+tests·照 match3 结构） | `id`=目录名=`createAppClient({appId})`·只准小写/数字/连字符 |
| 装 SDK | 本仓依赖 `file:../../vendor/dokiworlds-app-sdk`；vendor 与 DokiWorlds 工作区包逐文件同步 | SDK 打进 bundle·部署端零依赖；包版本仍为 0.2.0，必须以 API/测试而非版本号判断新旧 |
| 当前本地 App manifest | App 源目录维护 `manifest.json`，build 校验后复制进 dist | `schemaVersion:3`、`id`、`version`、`entry`、context、双语 locales、runtime input/outputs/modules；包根只叫 `manifest.json` |
| 调用说明文档 | `manifest.documentation.<locale> = {title,path}` + `docs/integration.<locale>.md`；build 调 `exportAppDocumentation(...)` | 当前 locale 闭集为 `en` / `zh-cn`；至少一份。文档须写清 App/协议身份、`apps.launch()`、input/output envelope、字段约束、完成/取消语义、权威结算与可粘贴示例；玩法表现改动不擅自改调用契约 |
| World manifest | 同上·`schemaVersion:1` | **禁 `selection` 字段**·`episodeRenderer` 按需·不内嵌角色副本 |
| 当前 0.2.0 生命周期 | `createAppClient` → `connect()` → `await whenReady()` | `whenReady` 只返回版本化 input；初始化后可读 `client.input` 副本；不手写 postMessage |
| 当前 0.2.0 退出/结果 | 主动退出 `requestExit()`；完成 `complete(versionedOutput)` 并等待 accepted/rejected | 业务 output 由各游戏契约定义；不能套用不存在的 onPrepareExit/onExitDecision |
| 引擎游戏独立打包 | 借 `vite.config.cartridge.ts` 先例（`build:cartridge:single` 单文件形态）或 esbuild 自包含 | `base:'./'`·字体/图/音全进 dist·不漏动态分包 |
| 结果映射 | **从世界机读态取**（终局 Flag/StringVar/Resource——与验收剧本同一套判读·不另造口径） | 每游戏一个纯函数 `toGameResult(world)` + 点名测试 |
| cover 真图 | 假宿主装 dist 截**真对局屏** → 页内 canvas 转 WebP → 存进 app 源资产目录（先例 `dokiworld/game108/scripts/capture-cover.mjs`·产物 `dokiworld/game108/src/assets/cover.webp`） | manifest `cover` §5 点名校验（生成器查真图在包内·**禁灰块占位**）；build 显式复制进 dist（vite 不带未引用资产） |
| 挂起/恢复（§6 checkpoint） | `@dokiworld/app-sdk/storage` + 引擎 `world.snapshot()/snapshotOrder()/restore()`；游戏侧开一条 `setWorldRestore` 纯接线缝（`setWorldObserver` 孪生·先例 game108） | ⚠ capability payload 三上限 64KB/2000 节点/深 12——整快照裸传必被拒，走 deflate-raw+base64 传输编码（先例 `checkpoint-codec.mjs`·game108 快照 125KB→7KB）；`canSuspend:true` 只在**存成之后**报；正常 complete 后清档 |
| 对手=平台角色 | `@dokiworld/app-sdk/character` 读授权资料 → 引擎卡桥；降级链 授权资料→init.input 卡→内置兜底（先例 `foe-card.mjs`） | 查 `grantedScopes` 才发请求；capability 请求带短超时（宿主没实现=消息静默丢弃，只有超时兜得住）；缺哪级都不空白 |
| **一个 App 能拿到哪些 capability，取决于「被哪台 Host 拉起」** | 对 profile 表挑，别对 SDK 支持什么挑。Game 照 `tower-confessions` 起手（character/dialogue/media/persona/progress/resize/speech/storage） | ⚠ **2026-08-18 订正**（此前本行写的是「取决于 `kind`」，那是我们从"两个 World 样例用 capability、Game 样例不用"倒推的猜测，猜错了方向）。SDK 3.0 样例仓 README 给了权威表——`kind` **不决定** extension 是否合法，catalog 只拒**未知**名字；能不能拿到由**当前 Host capability profile** 定：<br>· **Chat Game Host**（Game 的主落点）= character checkpoint dialogue footprint media memory persona progress resize resume speech storage<br>· **World Page Host** = apps character chat checkpoint dialogue episode footprint media memory persona speech storage world<br>· **World Nested App Host**（World 里嵌 Game）= checkpoint progress resize<br>**`apps`/`episode`/`chat`/`world` 是 World Page Host 专属**——Game 声明了也拿不到，表症=静默超时。一个 Game 可能被 Chat Game Host 或 World Nested App Host 拉起，**两者交集只有 checkpoint/progress/resize**，故其余一切必须能降级。 |
| **假宿主必须模拟真宿主的能力边界** | `host-harness` 里有 `HOST_PROFILES` 三张表，`boot({profile:"chat-game"})` 按 profile 挂 host extension；**不许"SDK 支持什么就挂什么"** | 2026-08-17 实证：八个全挂上 ⇒ 本地 48/48 全绿，真宿主里五个红。**尺子比被测环境宽 = 尺子没用**。改用 profile 之后，把 `apps` 加回声明会当场红在 `2001ms` 超时上——production 的病现在本地能复现。 |
| `result.metrics`（Game·输出 `doki.game.result/1` 时） | manifest 里逐条声明运行时会返回的指标名 | 给 **Episode 编辑器**列 `{{app.metrics.*}}` 变量用（README §5）。**不声明 = 剧情选不到你的指标**，加再多 metrics 也白加；与 `toGameResult` 真发的字段要有守卫对齐（两处真相） |
| capability 要的 scope | 用到 persona 就声明 `player_persona`；用到角色卡就 `character.card`（照 storyteller 的 `contextScopes.optional`） | 「角色与角色卡等数据仍受 `grantedScopes` 控制」——扩展挂了但 scope 没授权，一样拿不到 |
| extension 五步一致（§7） | manifest `runtime.extensions` ⇔ `createAppClient({extensions})` ⇔ 真建的 Client extension ⇔ 宿主 host extension ⇔ 退出时 `dispose()` | 声明名=wire 前缀；**只声明真用到的**。⚠ 旧版这里写着「storage 模块→`storage`，不是示例里的 `checkpoint`；match3 多声明是反例」——**那句话把唯一的 Game 参考实现定性成反例，于是我们不照 Game 抄、自己发明了一套**，这是 2026-08-17 真宿主全红的直接源头。正解见上面「一个 App 能拿到哪些 capability，取决于**被哪台 Host 拉起**」那行（2026-08-18 又订正过一次：连"取决于 kind"也是错的）；生成器+测试双锚 |
| 三形态降级目击（§12） | SDK 真 `createAppHost` 假宿主起三形态（零授权/只 input 卡/带 character 资料）+ 挂起/恢复 + resize 实测（先例 `dokiworld/game108/scripts/host-witness.mjs`·同源静态服务直接 serve SDK 源） | 断言落 DOM 机读量（对手名/蓄力读数/血量）·不采信自陈；挂起腿断 checkpoint 真落宿主 |
| 「获取卡带」（列出/拉起别的 App） | `dokiworld/shared/src/apps-gateway.mjs`（`createAppsGateway`·SDK `./apps` 的薄适配） | **未声明就不发**（未声明的消息被拒的形态是"静默等到超时"）·`list` 恒返回数组 / `launch` 三态 `completed\|cancelled\|unavailable`·`launch` 超时是**一小时**不是 30 秒（玩家正在玩那个 App）·封装 ≠ 声明：消费方仍要自己在 manifest 写 `apps` |
| 完整性清单 | build 收尾产 `SHA256SUMS.txt` 进 dist（match3 同款：大写 SHA256 + 两空格 + 包内相对路径·覆盖除自身全部文件） | 冒烟核到哈希与实物一致（清单不是装饰） |
| 本地验证 | 静态起 dist + headless chromium 载入（无宿主时 `connect` 挂起属预期·页面不得白屏/报错） | 交付前照规范 §12 验收清单逐项 |
| 出包（不敲命令） | 工坊发布屏「DokiWorld App 包 .zip」——**发布屏唯一 DokiWorld 出口**（旧 doki 卡带/doki-dist 两行 2026-08-13 退役·服务端墓碑拒绝）（owner 2026-08-13 令·job=缺 node_modules 才 `npm ci`→`npm run build`→zip dist·`main_entry/packaging.py` dokiworld 平台） | 可用性=`dokiworld/<slug>/` 存在，未接入的格显示指引不隐藏；产物 `release/<slug>/<slug>-dokiworld.zip`（zip 根=dist 内容）；冒烟 `scripts/dokiworld-pack-smoke.py` |

## 我们的约定（规范之外的本仓口径）

- **打包住 `dokiworld/<app-id>/`**；`dist/` 是构建产物**不入本仓 git**（.gitignore 挡）——出包交付=构建后把整个 app 目录（或 dist）复制/PR 到 dokiworld-apps 仓（owner 侧动作·本仓 session 无那边推送权）。
- **薄接线零规则**：SDK 层只做「启动参数→config、终局态→GameResult」两个投影，禁在接线层写玩法逻辑（同 acceptance-adapter 纯接线铁律）。
- **双语文案**：name/description/promptHint/avoidHint/aliases 中英齐备（规范硬性）；游戏内文案沿用游戏自己的。
- **调用文档跟随 manifest 自动闭包**：新增 App 时先建 `docs/integration.zh-CN.md` 并在 `manifest.documentation` 登记；更新契约时同一次改文档，纯玩法/UI/美术更新保持原文。禁止只在 DokiWorlds 发布目录手改而不回收到本仓源码，否则下次构建会覆盖。
- **版本四维不联动**：App version（package.json）/manifest schema/runtime protocol/业务 contract 各自独立升。
- **跨 app 共享件住 `dokiworld/shared/`**（判据：「第二个 app 出包会不会把它抄一遍」）——首件=`apps-gateway`。
  单个 app 专属的接线（结果映射 / 卡片降级 / checkpoint 编解码）仍留在 `dokiworld/<app-id>/` 自己目录。
- 打包脚本/manifest 生成器带点名测试（`node --test`）。✅ **门禁已接**（2026-08-16 主程落 doki-test 面触发：
  改哪个 app 目录 `scoped-gate` 就跑哪家 `npm test`·缺依赖 runner 先 `npm ci`）；出包 job 仍只 build——
  测试由推送门管，手跑仅在离线排查时需要。

## 红线

- **dist 绝不装**：源码引用、token/.env/API key、测试凭据、绝对本机路径、私有 DokiWorld 模块（规范 §9 原文）。
- App **不碰宿主 token/Cookie/内部 HTTP**——只用 init 给的 `grantedScopes` 与 SDK capability。
- manifest 里声明的 `extensions` 与代码实际创建的**保持一致**——但要知道这条是**我们的自律，不是协议的强制**
  （2026-08-18 读 SDK 源码 + 样例实测订正，旧版这里写「多声明会被拒」是错的）：
  · `createAppClient({extensions})` 是**纯本地收信过滤器**（`isDeclaredExtensionMessage`），
    握手 `createReadyMessage` 只发 `{type, protocol, protocolVersion, appId, instanceId}`——
    **extensions 一个字节都不上线**。宿主对「这个 App 能用什么」的认知**只来自目录里的 manifest**。
  · 样例自己就不一致：`game-match3` manifest 声明 `["resize","progress","checkpoint"]`，
    代码里却是 `extensions: ["resize"]`，照样跑。
  · 所以两处不一致的**表症不是被拒，是各错各的**：manifest 多声明 → 宿主可能挂也可能不挂（挂不上就静默超时）；
    代码少声明 → 宿主发回来的消息被本地过滤掉，看起来像"宿主没回"。都比"被拒"难查，故仍按五步一致做。
- Game 的 `launchRequirements.minPlayers` = 总参与方数（人+AI 座位口径读规范 §3——拿不准写 1 并在 PR 里注明）。
- 别把 mock/占位美术打进对外 dist（M2.5 人审门口径同美术线）。

## 查不到怎么办

对方协议问题以规范快照为准、快照答不了去样例仓实查；我们侧缺件（如引擎单游戏 standalone 入口不够用）→ `docs/workflow/requests.md` 提缺口等裁决，**绝不为出包在游戏层开逃生门**。
