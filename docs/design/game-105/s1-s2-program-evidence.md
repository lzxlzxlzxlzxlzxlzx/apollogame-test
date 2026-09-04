# game-105 S1/S2 程序验证记录

日期：2026-08-25

## 已完成的程序产物

- `games/game-105/tower-blueprint.ts` 声明 18 层 x 3 块的 54 个独立积木、静态桌面、`PhysicsWorld3D`、逐块 `Pickable3D` 和刚体落定/倾倒信号。
- 使用的堆叠物理参数：`gravity=-9.82`、`restitution=0`、`friction=0.58`、`solverIterations=40`。
- `games/game-105/game-105.ts` 提供拾取、只沿积木长轴移动世界锚点、释放/取消时删除 `Joint3D`，并只消费 `g105-settled` / `g105-toppled` 物理信号的竖切交互。倒塔终态保持 `toppled`；按 `R` 重开会销毁并重载整座塔，清除选中、关节和旧物理实体。
- `PhysicsWorld3D` 已登记进共享 `ComponentDataMap`，Game 105 不再使用局部类型强转。
- 回归验证：`tower-blueprint.test.ts` 与 `tower-lifecycle.test.ts` 共 7 条断言通过，覆盖 54 个独立刚体、逐层轴向、全塔 54 个落定信号、空世界帧后的物理重建，以及倒塔终态不被晚到释放覆盖。
- 工程验证：`npx tsc --noEmit`、`npm run build` 通过；`node scripts/game-skill-audit.mjs game-105` 无红旗。

## 物理方向适配

`PhysicsSystem` 目前从 `Mesh3D.width/depth` 生成 box 碰撞体，不读取 `Transform3D` 初始旋转。矩形积木不需要新增引擎能力：偶数层填 `width=长边, depth=短边`，奇数层交换两项，视觉网格与 Cannon 碰撞盒便会同时形成交叉塔。

完整 54 块交叉塔已由 `tower-blueprint.test.ts` 连续步进约 5 秒验证静置，塔顶下沉低于 1.1 个积木高度。该纯数据适配仅适用于本作的矩形积木；任意形状的初始刚体旋转仍应由 P3D 在未来提供通用桥接。

## Bugbot P1/P2 回归修复（2026-08-25）

- P1：松手时按积木实际世界位置沿长轴相对起点的位移判定是否完整抽离（至少 `1.6`），并同步 `extractedBlocks`。跨阈值后再拉回塔内的积木会重新纳入倒塔与稳定检测；留在桌面的抽离块翻倒不会误判。
- P2：每次释放都将输入切回 `settling` 并清零稳定帧计数。`PhysicsSystem.areBodiesSleeping(ids)` 读取 Cannon 的实际睡眠态，游戏仅在剩余塔体连续 `30` 帧全部入睡后才恢复 `ready`，不再复用开局的 54 块落定信号。
- 回归命令：`npx vitest run games/game-105/tower-blueprint.test.ts games/game-105/tower-lifecycle.test.ts src/renderer/three/physics.test.ts src/ui/components/button-shape.test.ts`，结果 `4 files / 52 tests` 通过；`npx tsc --noEmit` 通过。
- 真实运行证据：`RENDER_PROBE_CHROMIUM="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" node scripts/render-probe.mjs --game game-105` 通过（非空白、零 console error、零未捕获异常）；同环境 `node scripts/click-probe.mjs --game game-105` 通过（`1/1` 控件可观测变化）。

## v2 E4--E6 S2 能力核查（2026-08-27）

本节为只读核查；未修改 `games/game-105/`。

### E4：AI 公平观察 - 缺口，需提单

- 已核实符号：`src/renderer/three-renderer.ts` 的 `ThreeRenderer.drainPhysicsSignals()` 与 `ThreeRenderer.arePhysicsBodiesSleeping()`；其下游 `src/renderer/three/physics.ts` 的 `PhysicsSystem.drainSignals()` / `areBodiesSleeping()`。
- 结论：这些接口分别是消费式物理信号队列和给定 ID 集合的布尔睡眠查询，不提供候选块布局、选择状态、版本号或测试注入点。`PhysicsSystem.sync()` 每帧将 Cannon 私有刚体状态写回 `Transform3D`，因此用世界查询自行拼快照会触犯 GDD 的公平边界。
- 最小现有验证：`npx vitest run src/renderer/three/physics.test.ts`，结果 `1 file / 22 tests` 通过；覆盖公开 settle/topple 信号的去重与睡眠行为，但不能证明 E4 合同。
- 所需最小接口：只读 `AIObservation3D.snapshot()`，返回 `version`、批准候选的 `id/axis/layer`、公开选择状态和公开物理信号；测试须能注入同形快照。任何未批准字段读取、未知版本或无效候选 ID 必须失败为拒绝动作，不得回退读取 `Transform3D` 或 Cannon。

### E5：AI 同路径动作 - 缺口，需提单

- 已核实符号：`src/net/queued-input.ts` 的 `QueuedInputSource.enqueueAction()` 与 `src/ui/components/types.ts` 的 `ActionSink.enqueueAction()`；二者经 `InputQueue` 传递具名语义动作。`src/ui/components/action-sink.test.ts` 明确将它称为人/AI 共用的动作总线。
- 结论：队列只传递 `key/arg` 等输入，不认识 `Camera3D`、`Pickable3D`、`Joint3D` 或三维锚点。现有 `games/game-105/game-105.ts` 由 `onDown/onMove/onUp` 的浏览器 `PointerEvent` 闭包直接更新相机、悬停世界 UI、关节锚点和释放，尚无可由队列调用并与玩家复用的官方控制器。
- 最小现有验证：`npx vitest run src/net/queued-input.test.ts src/ui/components/action-sink.test.ts`，结果 `2 files / 8 tests` 通过；证明语义动作可排队/入队，但不能驱动 3D 抽拉合同。
- 所需最小接口：`AIPullController3D.enqueue({type, targetId?, delta?})`，有限动作仅含观察镜头、悬停、开始抽拉、渐进位移、释放、取消和重开；执行必须复用玩家的拾取/关节/释放路径。非法目标、非有限位移、终局后动作、取消/重开/倒塌时的未清队列必须返回可测试的拒绝/取消结果，并保证无残留 `Joint3D` 或选择态。

### E6：宿主会话与结果回传 - 缺口，需提单

- 已核实符号：`src/services/profile/profile-port.ts` 的 `getPlayerProfile()` 与 `src/services/character-card` 的归一化只读模型，可提供本地姓名/头像和角色卡字段；无运行时宿主会话或回传能力。`docs/design/dokiworld/sdk-surface-2.1.0.md` 与 `tools/export-targets/dokiworld.mjs:createDokiWorldBridge()` 仅描述/生成 DokiWorld 出包目标，不构成当前工作区可链接的宿主 SDK；`package.json` 也未声明 `@dokiworld/app-sdk`。
- 最小现有验证：`npx vitest run src/services/profile/profile.test.ts src/services/character-card/character-card.test.ts`，结果 `2 files / 30 tests` 通过；覆盖本地只读档案和角色卡归一化。仓库中没有可运行的 fake-host、LLM 超时降级或结果幂等测试，故不能作为 E6 验收。
- 所需最小接口：宿主 `GameSessionAdapter` 注入角色身份/头像/人格/风格及可选 LLM；`generateDialogue` 必须在未配置、超时、拒绝时恰好一次回退本地模板；`reportResult({sessionId,effectId|resultId,...})` 必须保证同键重复回传不重复结算。无会话、能力未授权、超时/拒绝和重复回传都应返回结构化结果，绝不让游戏写长期记忆或关系。

### S2 停线结论（历史记录：平台能力核查时点）

E4、E5、E6 均已由 `docs/design/game-105/capability-gaps.json` 记为 P1 `open`，阻塞 v2 S3/S4。下一步仅能由引擎/3D/宿主平台按台账提供并测试上述合同，或由 owner 将某项裁决为 `wontfix` 并给出符合 GDD 的替代路径；本程序核查不实现任何游戏层绕过。

S2 门证：`node scripts/game-pipeline.mjs gate game-105 S2` 于 2026-08-27 运行，输出 `⚠ 缺口 3/3 未裁决`（E4/E5/E6）并以流程性 `exit=0` 返回；该结果表示台账合法且 S2 停在缺口裁决，不表示 S2 已获独立复查或 owner 签核。

### Local AI M1 范围裁决后的策划注记（2026-08-27）

本节以上的 E4--E6 `open` 结论是对“平台正式合同是否存在”的历史核查，事实未被推翻；它**不再是当前 Local AI M1 的阻塞结论**。策划已在 `capability-plan.md` 的 L1--L3 将三项分别裁决为 M1 限定的游戏内替代，`capability-gaps.json` 当前状态为 `wontfix`，并保留未来平台化条件。

本次范围裁决后的机器门证：`node scripts/game-pipeline.mjs gate game-105 S2` 于 2026-08-27 输出 `✓ 缺口 3 条全已裁决`，`exit=0`。该门证只证明台账与策划裁决合法；不替代 Local AI M1 的程序施工证据、独立复查或 owner 对修订 S2 的签核。

## Storyteller Host Integration M2 S2 重核（2026-09-01）

本节仅核查 DokiWorld App 宿主协议，未修改 `games/game-105/`。SDK 包版本和 App 线协议版本已分开核验：安装包为 `@dokiworld/app-sdk@3.0.0`，其导出的 `APP_PROTOCOL_VERSION` 是 `2`；`dokiworld/game108/manifest.json` 及 `generate-manifest.mjs` 都以 `runtime.protocolVersion: 2` 为真机读契约。

### 已由受控 Host witness 验证的接口

- 启动输入：`dokiworld/game108/src/main.ts` 的 `app.connect({ onInit })` 接收 `input.data`、`locale` 和 `grantedScopes`。`ExternalAppInitPayload` 的声明位于 `dokiworld/game108/node_modules/@dokiworld/app-sdk/src/index.d.ts`。
- 对话：`createDialogueClientExtension(...).generateDialogue()` 的类型和失败类型位于 `.../src/dialogue.d.ts`；`dokiworld/shared/src/sdk-gateways.mjs:createDialogueGateway()` 将未授权、拒绝和超时降级为 `null`，调用端须恰好一次显示本地模板。
- 结果和回执：`createGameResult()` 产生固定的 `doki.game.result/1`，其 metrics 只接收字符串、数字、布尔值；`app.complete(result, { resultId })` 返回 `accepted` 或 `rejected` 回执。对应声明位于 `.../src/game-result.d.ts` 和 `.../src/index.d.ts`。
- 边界：`apps.launch()` 属于 World Page Host 的 gateway，不能放进 Game 的 extensions 或游戏代码。`game108` 的 Chat Game Host witness 也明确验证该 profile 不提供 `apps`/`episode`。

### 可重复验证与结论

在 Windows Chrome 下执行 `npm run build`、`RENDER_PROBE_CHROMIUM="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" npm run witness`（工作目录 `dokiworld/game108`），结果 `PASS=61 FAIL=0`。witness 从宿主侧状态确认初始化、角色/Persona 输入、`generateDialogue` 请求、结果输出和 `app.complete` 回执；不是只读取游戏页面自陈。

这证明 SDK `3.0.0` + 协议 `2` 的 App 接线组合可用，也证明 `game-105` 不应依赖 `apps`。但仓内没有实现 Storyteller Host 的源码或可执行端到端环境，故仍无法验证 Storyteller 以 `doki.game.heart-tower-input/1` 拉起 `game-105`、消费白名单结果并对重复回传去重。该差距已登记为 `G105-E6-STORYTELLER-HOST-WITNESS`，状态 `open`，锁定 Host Integration M2 的 S3/S4；在真实 Host witness 前不得开始相关游戏源码施工。

### Storyteller witness 复测（2026-09-01）

外部 Storyteller harness 已完成 `Host -> Storyteller -> apps.launch -> game-105 -> result -> episode.gameCompleted -> episode.gameResolved -> 续聊`。此前失败并非 SDK Episode 事件桥缺失：初始 witness 将静态 action 走成 `localActionBeat` 本地路径，按设计不发送 `episode.gameCompleted`。现改为 Host 收到 `episode.action` 后以 SDK `episode.game` 回发启动配置，使游戏结果进入受控 Host 续聊路径。

`npm run witness`（工作目录 `_inspect_dokiworld-apps/storyteller`）通过并记录：`rawCompleteCount=2`、`acceptedCount=1`、`gameCompletedCount=2`、`gameResolvedCount=1`。前两项证明同一 `resultId` 的两次 `app.complete` 只被 Host 接受一次；后两项证明 Host 对同一 `(runId,resultId)` 重放仅生成一次 `episode.gameResolved` 和一次赛后续写。Storyteller 已渲染白名单结算卡，并输出插值后的 `heartDelta` 与 `memorySummary` 赛后对白。

本地 witness 仍使用确定性 dialogue Host，不持有模型密钥。真实模型验证仍需由受控 Host 服务端在 `createDialogueHostExtension` 内提供凭据、授权和超时/未授权模板降级；密钥不得进入 Storyteller 或 game-105。
