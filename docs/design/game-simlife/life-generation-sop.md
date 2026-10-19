# LifeGenerationBundle v1 收件与诊断 SOP

## 定位与边界

`LifeGenerationBundle v1` 是 authoring control plane 的不可信生成收件格式，不是新的游戏格式，也不是运行时组件。唯一运行时内容仍是其中的 `game.lifePackage`，并且必须继续通过现有 `LifeGamePackage` validator/compiler。收件器不访问模型、不联网、不启动服务、不创建游戏、不写 `games/`、`public/` 或资产索引，也不把 session/provenance/prompt/供应商信息编译进 World。

本单接受为现有能力编排：Life 严格 validator/compiler、Quest/Relationship 图审计、AssetSlotBrief、能力 registry、system graph、Engine snapshot/hash/restore 都已存在；新增的只是可信边界、稳定诊断、prompt packet、repair 约束和 dry-run 计划。它不新增 sim capability/system。

## 严格 envelope

根对象只允许：

```json
{
  "schemaVersion": "zerocraft.life-generation-bundle.v1",
  "session": {
    "id": "safe-stable-id",
    "round": 0,
    "createdBy": "human|model|mixed",
    "promptContractVersion": "life-generation.prompt.v1"
  },
  "game": { "slug": "game-lowercase-kebab", "lifePackage": {} },
  "assetSlots": { "draft": {} },
  "provenance": {
    "baseHash": "sha256:...",
    "sourceHashes": { "lifePackage": "sha256:...", "assetSlotsDraft": "sha256:..." }
  }
}
```

对象全部闭集；round 为 `0..8`。id、slug、字段数、数组数、深度和字符串长度均有上限。任何 secret/password/authorization/API key/provider key/credential、bytes/base64/binary、绝对路径、URL/data URI、`..` 穿越路径都会在 envelope 阶段拒绝。AssetSlot draft 只能声明 `placeholder`，禁止 `approved` 与文件 `contentHash` 声称。

`baseHash` 是 `{game,assetSlots}` 的排序键 canonical JSON SHA-256；两个 source hash 分别覆盖原始 Life 文档与 AssetSlot draft。对象 key 排序，数组保留作者顺序。任何内容变化必须重算，不能让陈旧 hash 静默通过。

## 五段 prompt packets

`buildLifePromptPackets(bundle)` 固定产生 Packet 0–4：

1. Packet 0：envelope 合同、session/game 稳定 id、版本与轮数上限；
2. Packet 1：world（meta/world/tile/scenes/camera/movement/interaction）；
3. Packet 2：actors（item/inventory/crop/calendar/player/relationships/profile）。必须先设计容量、初始物、循环产出/消耗，再生成字段；循环涉及的每个 item 都要进入 catalog，以 `art:` skinKey 和精确 AssetSlot consumer 闭合，候选图标保持 placeholder。可选 profile 只投影既有 resource/relationship，每行 `iconSkinKey` 必须由精确 `ui-icon` consumer 闭合；
4. Packet 3：plot（logic/milestone/dialogue/quests）；
5. Packet 4：AssetSlot draft。

每包包含机器 schema、可写路径 allowlist、从当前 bundle 派生的引用表、共同 forbidden 列表与闭集输出合同。模型输出只能是：

```json
{"artifactKind":"life-generation-bundle","baseHash":"sha256:...","document":{}}
```

或只含 `add/remove/replace` 的受限 JSON patch。禁止 JSON 外 prose。Packet 引用表只供约束候选 id，不能替代最终 validator。

Actors 自检成功后必须调用 `buildLifeInventoryReview()` 生成只读 `zerocraft.life-inventory-review.v1`。该表绑定当前 Bundle canonical input hash，按 authored itemCatalog 顺序列出容量、初始栈、稳定标题、starter/crop seed/crop product/resource drop/construction material 来源、无来源时的 `catalog-only`，以及精确 icon slot consumer 与 placeholder/approved 状态。任何 Bundle 错误、未知 starter、容量/maxStack 越界、非法来源引用、缺/错 icon consumer、伪造行或 hash drift 都让整表 invalid；不得留下部分绿色表。Actors gate 的可视化产物必须含 `inventory-review`，且 owner pending/changes-requested 时不得进入 Plot 或 Assets。

Bundle 声明 `profile` 时还必须调用 `buildLifeProfileReview()` 生成只读 `zerocraft.life-profile-review.v1`：绑定同一 canonical hash，逐行列出权威 source、初始值/范围、关系初始等级、精确 `ui-icon` slot/pointer、placeholder 状态与 `profile|hud` placement。`hud` 最多四行，省略 surfaces 固定为 profile-only。此时 Actors gate 必须额外包含 `profile-review`；无 profile 的游戏不得被强制要求该产物。

若 Brief 要求背包面板，只在独立 `life-host.v1` 中选择可选 `inventoryPanel`；不得把 Host/UI 字段塞入 Life package，也不得把 review 投影反写为第二份 runtime inventory。

## 只读诊断顺序

命令：

```text
npm run life-gen-check -- <bundle.json> --diagnostics json
```

可加 `--packets` 输出五包、`--inventory-review` 输出 Actors 背包审阅表、`--profile-review` 输出人物档案审阅表，或 `--plan` 明示 dry-run 计划。诊断固定为 `{path,code,message,severity,source,round}`，按 path/code/source/message 排序，不输出随机 stack。退出码：通过 `0`，内容诊断失败 `1`，文件或 JSON 无法读取 `2`。

阶段固定为：

1. envelope/size/path/secret/hash；
2. Life v1 严格闭集、引用、RLE、空间、Quest、Relationship；
3. compile + registry/provider warning；
4. 当前能力子集 system graph（重复 system id 为 error；子集缺少可选 peer 导致的悬空边与 SCC 留 warning 证据，真实严格 tick 仍可转 error）；
5. 隔离 Engine 运行 2 tick，snapshot + `snapshotOrder` hash 后 restore 再核 hash；
6. AssetSlot schema、派生 fingerprint、Life visual reference ↔ slot consumer 无索引闭包；每个在 ground RLE 中实际使用且可见的 `tileCatalog.*.visual.skinKey` 必须对应一个 `kind:"tile"` slot。draft 不读、不写 AssetIndex/pending/art-ledger。

任何 error 都不返回可执行物化动作。warning 保留在稳定诊断里。

## 阶段切片合成与候选落盘

已按阶段批准的 World、Actors、Construction、Plot 与 AssetSlot 不再靠人工复制拼成 Bundle。authoring source root 必须是绝对、真实、非 symlink 的普通目录，并包含一个闭集 `zerocraft.life-generation-slice-manifest.v1`：

```json
{
  "schemaVersion": "zerocraft.life-generation-slice-manifest.v1",
  "session": {
    "id": "safe-stable-id",
    "round": 0,
    "createdBy": "human|model|mixed",
    "promptContractVersion": "life-generation.prompt.v1"
  },
  "slug": "game-example-town",
  "world": "world.life.json",
  "slices": ["actors.patch.json", "construction.patch.json", "plot.patch.json"],
  "assetSlots": "asset-slots.json"
}
```

所有文件引用都只能是同目录安全 `.json` basename，禁止 URL、绝对路径、`..`、重复文件名、symlink 与额外字段。slice 必须是闭集 `zerocraft.life-generation-patch.v1`，声明相同 `baseWorld`、与 manifest 前序 slice **逐项完全相等**的 `requiresSlices`，以及 1–64 个 `add|replace` operation。JSON Pointer 只能落在已批准的 Life 内容根；根替换、缺 parent、数组越界、重复非 append 路径、空/prototype-polluting segment 与非普通有限 JSON 值均拒绝。

默认命令是零写 plan：

```text
npm run life-bundle-compose -- bundle.sources.json --source-root <绝对设计目录> --plan
```

CLI 的 manifest 参数可写 basename，也可写从当前工作目录出发、解析后父目录**恰好等于** `source-root` 的相对路径，便于直接复制设计目录中的试点命令。相对路径不得包含 `..`；URL、绝对路径与解析到其他目录的路径一律以 usage error 拒绝。核心 composer 仍只接收经此归一化的安全 basename。

输出包含 input hash、由最终 Life package 与 AssetSlot draft **重新计算**的 provenance/base hash、固定目标 `bundle.candidate.json` 的 canonical 字节/hash，以及完整 Bundle/compile/two-tick snapshot-restore/slot-closure diagnostics。编译器不信任 patch 或调用者提供的任何 hash。

只有明确需要保存当前已批准候选时才使用：

```text
npm run life-bundle-compose -- bundle.sources.json --source-root <绝对设计目录> --write-candidate
```

候选先在 source root 同目录 staging 中完整写入并严格复验，再以不覆盖的原子 hard-link 发布固定文件名；目标不存在才能首次写入，逐字节相同且严格复验通过时返回幂等零写。partial/different/extra、文件或目录 symlink、源文件陈旧、目标竞态及写后复验失败全部 fail-closed；回滚只删除仍绑定本事务 `dev+ino` 的条目，不触碰外部替换者。该动作只写 authoring 候选，不写 `games/`、`public/`、AssetIndex、图片、Host/Launcher 或正式项目。

生成的 `bundle.candidate.json` 可直接作为下一节 `life-materialize` 的 Bundle 输入；Host 与 Launcher 仍使用独立、已审候选文件。候选落盘不等于 owner 批准正式提升，也不代签 Playtest、S1-P、capability plan 或素材审批。

## ENG-16 legacy dry-run 物化计划

成功时只返回描述，不写文件：

- `games/<slug>/life.json` 与 `asset-slots.json`：authoring create；
- `games/<slug>/game.ts`：`life-host.v1` 宿主模板交接；
- `src/launcher/game-runner.tsx`：人工复核的 launcher 交接；
- `public/games/<slug>/art/index.json`：asset-manager 交接。

每项都含相对路径、动作、owner 和对内容/描述符的 SHA-256。`writesPerformed` 永远是 `false`。这是 ENG-16 收件器保留的历史交接视图；它不等同于下节 ENG-17F 的严格四文件 materializer plan，也不会执行写入。

## ENG-17F 受限 authoring materializer M0/M1

Node-only `life-materializer` 同时接收三份彼此独立的输入：`LifeGenerationBundle v1`、`life-host.v1` 与 `life-launcher.v1`。它先重跑 bundle 全链检查（含 canonical/source hash、两 tick、恢复 hash 与 placeholder slot 闭包），再严格解析 host/launcher，并要求下列 identity 完全相等：bundle slug、host slug/artSlug/save namespace、launcher id、package `meta.id`、slot manifest game。最后使用 ENG-17E 的纯 catalog discovery 以同目录固定 module key 复验；任一阶段失败都没有可写计划。

固定点建设另有 authoring 可达性合同：每个 `constructionProjects[]` 引用必须是无 schedule 的固定 placement；其 scene 内至少一个 `build` zone 必须覆盖 placement 交互距离内的可行走 cell。校验器会在隔离 Engine 中满足可兼容的 zone/placement/project access 条件并补足材料，运行真实 `LifeActivityContext.affordances` 投影；只有目标 `build` affordance 能达到 `available:true` 才通过。缺 build zone、zone 过远/地形不可走、access 条件互相矛盾或真实投影仍不可用分别给出稳定诊断并阻断 Bundle、M0、正式提升/更新。该 gate 只验证声明，不替作者向其他 zone 添加动作。

M0 是默认模式，也可显式传 `--plan`：

```text
npm run life-materialize -- <bundle.json> --host <life-host.json> --entry <life-launcher.json> --plan
```

输出只列稳定 plan 元数据、输入 hash、四道 gate、冲突、确认 hash，以及恰好四个 canonical JSON 文件的相对路径/字节数/内容 hash：

- `games/<slug>/life.json`
- `games/<slug>/asset-slots.json`
- `games/<slug>/life-host.json`
- `games/<slug>/life-launcher.json`

M0 的 `writesPerformed` 恒为 `false`，不会创建目录、AssetIndex、图片、TS 入口或 launcher 注册，也不访问模型、网络、Git、数据库或服务。

M1 只用于明确选择的隔离 authoring scratch root：

```text
npm run life-materialize -- <bundle.json> --host <life-host.json> --entry <life-launcher.json> --apply-authoring --owner-confirm <M0-confirmationHash> --target-root <绝对scratch目录>
```

`--owner-confirm` 必须逐字等于同一组输入派生的 confirmation hash；`--target-root` 必须已存在、为绝对真实目录，并且不是文件系统根、workspace、workspace 祖先/后代或符号链接。物化器只计算 `target-root/games/<slug>`，逐段做 realpath containment。目标必须不存在，或已经含有逐字节相同的四个文件；partial、extra、different、文件/目录 symlink 一律 fail-closed，永不覆盖。

首次落盘会在同一 `games` 目录建立 staging，写完四个 canonical bytes 后先校验，再以一次目录 rename 原子发布。rename 后重新读取真实文件，重跑 JSON parse、hash、bundle/host/entry 与 ENG-17E discovery；写、rename 或复验失败会删除本事务创建的 staging/target。相同内容再次 apply 返回 `writtenFiles: 0`。它仍不创建真实美术或批准声明：slot 必须保持 placeholder，无 `contentHash`；后续真实素材继续只归 asset-manager。

M1 仍只用于 workspace 外的 scratch，不得把 `--apply-authoring` 指向本仓 `games/`、`public/` 或正式项目根。正式仓库必须使用下述 `--promote/--update`，不得借 M1 绕过其 confirmation、current hash、原子发布和回滚 gate。按 `AGENTS.md §2.2` 获得具体游戏/施工单授权后，agent 可以执行正式物化；materializer 的成功仍不代签 S1-P、capability plan、资产审批、Playtest 或任何 Owner 人门。

## 正式四文件提升（受控 `--promote`）

`--promote` 是与 M0 `--plan`、scratch M1 `--apply-authoring` 互斥的正式提升入口。它不是生成、上架或远程发布命令。owner 已授权具体游戏/施工单或候选方向，且 M0 严格 plan 无冲突、confirmation 与目标均已核对时，agent 应直接执行并完成写后复验；没有上述授权时停在 M0：

```text
npm run life-materialize -- <bundle.json> --host <life-host.json> --entry <life-launcher.json> --promote --owner-confirm <M0-confirmationHash> --workspace-root <绝对workspace目录>
```

该模式先完整重跑同一组 M0 gate，要求 confirmation hash 逐字一致，并只允许目标为 `<workspace-root>/games/<slug>`。workspace 必须是已存在的绝对真实非 symlink 目录；其 `games/` 必须是同一真实树内的普通目录。目标不存在时只在同一 `games/` 下 staging，写入四个 canonical JSON 后重读 JSON/hash、Bundle/Host/Launcher 和 catalog discovery，再以一次目录 rename 发布；发布后再次执行同一复验。目标已存在时，仅当恰好四个普通文件且字节完全一致才以 `writtenFiles:0` 幂等成功。partial、extra、different、路径逃逸、目录或文件 symlink、陈旧确认以及写/rename/复验失败全部 fail-closed，且不覆盖已有目标。

结果以 `mode:"promote"` 明示正式提升，并返回 slug、confirmation hash、目标目录、写入事实、写入文件数和 M0 四文件计划。该模式不会创建或修改 `public/`、AssetIndex、图片、TS 游戏入口、launcher 代码、pipeline、存档、数据库、服务、Git 或网络资源。成功仍不代签 Playtest、S1-P、capability plan、素材审批或独立复查。原有 scratch M1 的 workspace/祖先/后代拒绝语义保持不变。

## 正式四文件安全更新（受控 `--plan-update` / `--update`）

已存在的正式目标不得用 `--promote` 覆盖。候选 Bundle、Host、Launcher 重新通过 M0 后，先做只读更新预检：

```text
npm run life-materialize -- <bundle.json> --host <life-host.json> --entry <life-launcher.json> --plan-update --workspace-root <绝对workspace目录>
```

`mode:"plan-update"`、`writesPerformed:false` 会同时返回新输入的 `confirmationHash/filesHash`、正式目标的 `currentFilesHash` 与精确目标目录。当前正式目录必须恰含四个普通 canonical JSON 文件，identity 与 launcher discovery 闭合；预检不写 staging、backup 或任何正式文件。

owner 已授权具体游戏/施工单或候选方向时，agent 可以把只读预检得到的两个独立确认值交给更新入口；确认值必须来自本回合真实 plan，不得手填、猜测或复用陈旧输出：

```text
npm run life-materialize -- <bundle.json> --host <life-host.json> --entry <life-launcher.json> --update --owner-confirm <新M0-confirmationHash> --current-files-hash <旧正式四文件组hash> --workspace-root <绝对workspace目录>
```

更新先校验新 Bundle/Host/Launcher 与新 confirmation，再逐字复验当前正式组及旧 group hash；任一 drift/conflict 均在换目录前失败。新四文件在同一 `games/` 下 staging 并完整复验；随后把旧目录原子 rename 到唯一 rollback 路径、把 staging 原子 rename 到 canonical target，复验新目标后才删除仍保持原身份与旧 hash 的 rollback。普通故障会恢复旧目录；若交换期间有外部目录替换 canonical target 或 rollback，事务 fail-closed 且不删除该外部目录，并保留旧组作恢复证据。同一更新命令在目标已等于新 canonical bytes 时以 `writtenFiles:0` 幂等成功。该能力不放宽 `--promote`，也没有四文件之外的副作用；执行者仍必须按 `AGENTS.md §2.2` 完成写后复验，且不得代签 Owner 人门。

## life-host.v1 独立运行描述符

`LifeGenerationBundle v1` 的 envelope、canonical hash 与 CLI 保持不变；host 描述符不暗中加入 v1 bundle。通过生成收件后，后续 authoring 阶段可独立构造并调用 `validateLifeHostDescriptor()` 校验 `zerocraft.life-host.v1`：

```json
{
  "schema": "zerocraft.life-host.v1",
  "slug": "game-example-town",
  "packagePath": "life.json",
  "assetSlotsPath": "asset-slots.json",
  "artSlug": "game-example-town",
  "viewport": {
    "profile": "life-standard-v1"
  },
  "theme": "starter",
  "hud": {
    "preset": "life-standard-v1",
    "title": "示例小镇",
    "labels": { "date": "日期", "inventory": "背包", "objective": "目标", "advance-day": "休息至明日" }
  },
  "input": { "preset": "life-keyboard-v1" },
  "questPanel": { "enabled": true, "titleLabelKey": "quests", "defaultTracking": "first-active" },
  "save": {
    "namespace": "life:game-example-town:v1",
    "schemaVersion": 1,
    "autosave": "life-commit-v1"
  }
}
```

所有层级闭字段；package/slot 路径只能是固定同目录文件名，`artSlug` 必须等于 `slug`，save namespace 必须由 slug 派生。HUD 只接受通用语义标签闭集，不接受 zone/NPC id、LayoutNode、CSS、action 或函数；theme/input/autosave 均为一期单值闭集。可选 `questPanel` 只允许 `enabled/titleLabelKey/defaultTracking(first-active|none)`：它把现有 `LifeQuestCatalog + LifeQuestProjection` 投影为左上追踪目标与右侧 LayoutNode Drawer，`J`/点击切换、`Esc` 关闭；玩家选择追踪哪条任务只留在 Host 渲染本地态，不进入 Life package、World、snapshot/hash 或存档。可选 `profilePanel` 只允许 `enabled/titleLabelKey`，以 `C`/点击打开右侧只读 Drawer，`Esc` 关闭；它与 I/J 面板互斥，不阻塞持续移动、E 交互或对话，也不进入 World/snapshot/hash/save。`viewport` 只能选择 engine-owned profile id，当前唯一合法值为 `life-standard-v1`；`fieldW/fieldH/topBarH/bottomBarH/cellSize/mode/cameraFit` 等自由数值一律按 unknown field 拒收。`hashLifeHostDescriptor()` 复用本文件前述 ENG-16 canonical JSON/SHA-256 规则。

`life-standard-v1` 固定 Little Valley 已验证比例：逻辑宿主 `900×620`、顶栏 `52`、底栏 `0`、格边长 `32`、响应式 `cover`；Life package 同时必须声明 `"camera":{"profile":"life-standard-v1"}`，由引擎解析为 `28×19` 可视格、zoom `1`、margin `0`、四边 dead-zone `0.3`。Host 与 package profile 必须完全一致。响应式只改变本地显示比例与 DPR，不改变逻辑格、可视格数、世界 Camera、snapshot 或存档。角色/建筑/作物的视觉尺寸与脚点仍通过 AssetSlot `render.display` / `render.anchor` 独立表达，不得靠改格子或镜头 profile 修图。

该描述符是 sim 外 authoring/host 参数：不进入 Life package、World、snapshot、runtime hash 或 AssetSlot approval；validator 不读写文件，不接 launcher，也不执行 materialize。未来 bundle schema 若要内嵌 descriptor，必须另升 schema 并迁移，不能改变 v1 的既有 hash。

### 通用 Life 存档策略

通过描述符后，宿主用 `LifeHostSaveAdapter` 将 `save.namespace = life:<slug>:v1` 唯一派生为 `life:<slug>:slot-1`；调用方不能注入任意槽位。adapter 复用 `SaveSystem` / `StoragePort` 的 snapshot、创建序与 hash 校验，v1 标签另绑定 slug、描述符指纹和 fresh compiled package 指纹，不另造 codec 或存储后端。

落盘只含权威进展投影。Inventory 只存 items，LifeNpcSchedule 只存 currentSlot，LifeResourceNode 只存 remaining，LifePlacement 只存 scene/坐标/可见与可交互状态；它们的容量、authoring entries、item/action 定义、prefab/skin 等静态字段从 fresh baseline 恢复。Camera、Velocity、连续输入、移动/warp request、HUD/menu/DOM/Canvas、prompt、provenance、asset metadata、descriptor 与 catalogs 均不落盘。读档先在隔离 World 校验 slot/schema/descriptor/package/hash/order/player/calendar，再把进展合入 fresh baseline、复验投影 hash、清零移动瞬态，最后一次性替换活动 World；任一步失败都不得半写活动权威态。

`LifeHostAutosave` 只观察离散进展与 scene identity 的签名；坐标移动、Camera、UI、输入和空 tick 不触发写，连续 commit 按固定最新世界引用合并。可选 `DebugTrace` 只记录 host 的 commit/transition/reject，关闭时不格式化，且始终排除在确定性 hash 与存档 payload 外。

## life-standard-v1 通用宿主消费面

通过 `life-host.v1` 后，浏览器宿主只消费四个共享纯模块：`life-presenter` 从公开 Life components 生成只读 view model；`life-interaction` 把引擎派生的 `LifeActivityContext.affordances` 投影为递归菜单与既有语义 action；`life-input` 先以纯 reducer 解释 WASD/方向键/E/Tab/Enter/Escape/T/N，再由薄 DOM adapter 派发；`life-hud` 使用 descriptor 的 `hud.title` 与闭集 `hud.labels` 构造 LayoutNode。

共享 presenter/controller 不接受 package、zone、NPC、resource 或 warp 的内容特例表。显示名缺失时只对 authored id 做稳定分词；交互可执行性、不可用原因与 item candidates 全部以 World 中的权威 affordance 为准，不在宿主重算玩法规则。菜单 source fingerprint 递归覆盖 action/children，并绑定 scene/x/y；位置、场景、可供性或递归内容变化都会关闭旧菜单。鼠标 activation 只接受当前可见层的 enabled option，输出与 Tab+Enter 完全相同的语义 action 序列。

输入 reducer 不持有 DOM 或 World 引用；同方向的 WASD/方向键别名只发一次 start，最后一个别名 keyup 才发 stop。任何互动边沿键先释放全部 held directions；blur/visibility/dispose 也强制释放，方向键与 Tab 等已处理键必须 preventDefault，避免页面滚动与移动残留。

宿主交互 trace 是可选 adapter：只有 World 已挂 `DebugTrace` 时才创建 sink，记录 `decision/transition/reject/commit`，不使用墙钟；关闭时 controller 不格式化 trace。DebugTrace 仍按既有契约排除在 deterministic hash 外。HUD、menu、controller 与输入 state 均为 World 外表现状态，不进入 Life snapshot/save。

Little Valley 已改为直接消费上述共享 presenter/controller/input，并只以自身 descriptor HUD slice 提供标题和通用词条；原 `view-model.ts`、`world-interaction.ts`、`keyboard.ts` 保留为无逻辑兼容导出，避免旧调用点断裂。新增 Life 游戏不得复制这些 game-side 文件来写内容分支，应直接组合共享模块。

### mountLifeGame 统一装配

浏览器入口必须直接调用 `mountLifeGame`，只传已经落盘并由调用模块 import 的 descriptor、Life package 与 AssetSlot 数据对象。共享装配先完成三道严格解析及 `assetSlots.game === descriptor.slug` 一致性检查；任何失败发生在 `mountHost` 之前，容器保持未修改。描述符中的 `packagePath` / `assetSlotsPath` 只用于 authoring 审计，运行时不得把它们当动态 import、fetch 或文件路径。

装配固定复用 `mountHost → createRunLoop → CanvasRenderer → life presenter/interaction/input/HUD → optional LifeHostSaveAdapter/Autosave → art loader`。`storage` 缺省表示明确无存档，返回 `not-configured`；调用方选择持久化时才传 `StoragePort`。素材加载是 render-only 且 fail-soft：approved 资源可覆盖 semantic preview，缺失/placeholder/加载失败继续显示确定性预览，不改变 World 或玩法可用性。所有键盘、鼠标和 HUD 写入只能进入 `QueuedInputSource`。

入口必须保存返回 handle 并在卸载时调用幂等 `dispose()`；它负责 release-all、移除键盘与 document 监听、停止 run loop、解绑 autosave observer、销毁 renderer/WorldUI2D、卸载 LayoutNode 与清空 host shell。禁止在游戏入口复制这段生命周期或另接专属 DOM/Canvas handler。Little Valley 的 `game-simlife.ts` 是兼容薄层；新增 Life 游戏直接复用共享函数，不复制其宿主实现。

## repair 安全

repair 的 `baseHash` 必须与被检查 bundle 完全一致；round 达到 8 后拒绝。patch 最多 64 项，只允许 `add/remove/replace`，路径必须为绝对 JSON Pointer，且只能等于本轮 diagnostics path、位于其下或修复其子路径。整文档 repair 会对原 bundle 做结构差异，只要任一变化超出诊断路径即整份拒绝。新一轮必须重跑完整诊断，不能把旧轮通过结果沿用到新 hash。

## Asset-manager 交接

bundle 只交 placeholder briefs：key、consumer pointer、尺寸、alpha/sampling、锚点/fit、prompt 与派生 fingerprint。它不包含图片 bytes、供应商密钥、生成时间、许可确认或 approved 声明。asset-manager 在 bundle 通过且游戏项目另行获准创建后，才负责真实素材生成/导入、人审、许可证据、文件 hash 与 local AssetIndex 登记；收件器绝不能代替该批准边。

### Codex 素材候选批次

通过 brief 后可运行：

```text
npm run life-asset-generate -- <asset-slots.json> [--json]
npm run life-asset-generate -- <asset-slots.json> --provider <qwen|gpt-image> --generate [--real-provider] [--json]
npm run life-asset-generate -- <asset-slots.json> --list-local [--json]
npm run life-asset-generate -- <asset-slots.json> --approve-local <slotId> --reviewed-by <human> [--json]
npm run life-asset-generate -- <asset-slots.json> --reject-local <slotId> [--json]
```

默认动作就是零写入 plan，provider 默认 qwen 以保持旧调用兼容；调用方可在闭集 `qwen|gpt-image` 中做整批选择，纯批次 API 还可按 slotId 覆盖。命令重建 candidate-plan 与 review-packet，再生成 `zerocraft.life-asset-generation-batch.v1`。只有显式 `--generate` 才写待审：local 进入 `art/local/pending.json` 的路径无关安全引用，AI 进入 `art/ai/pending/`；两者都不碰 AssetIndex/正式文件/runtime。AI 默认 mock，真实 provider 还必须显式 `--real-provider` 且只从 `DASHSCOPE_API_KEY` 或 `OPENAI_API_KEY` 读取 key；缺 key 直接失败。GPT adapter 使用官方 Image HTTP API、显式 `gpt-image-2` 与 base64 PNG 响应，先确定性规范化到槽位 outputPx 再进 pending；请求、批次、review 与日志不得携 key。

Codex 内置 imagegen 与 Node provider 是两条不同边界：前者不能被脚本直接调用。若人工使用 Codex imagegen 产出文件，必须作为独立的 asset-manager 手工导入候选，重新核 provenance/license/spec/像素并进入同一 pending 人审门，不能声称为本适配器自动调用结果。

Life pending 的批准命令必须同时提供当前槽位清单：

```text
node scripts/ai-gen.mjs review <assetKey> approve --game <slug> --asset-slots <asset-slots.json> --json
```

批准门先严格复验 manifest 闭集、game/scope、slotId、原 assetKey、派生 fingerprint、usage/colorSpace、outputPx、alpha、sampling、anchor 与实际 PNG bytes，然后才复制正式文件并以**同一 assetKey** upsert 游戏本地 AssetIndex。任一失败都不写索引、不覆盖旧正式文件；reject 只清 pending。批准条目的 provenance 记录 `zerocraft.life-asset-slot-binding.v1` 和内容 SHA-256。**当 owner 对具体候选批次明确批准并同时给出来源/许可声明时，批准事件就是物化授权：asset-manager 应自动执行规范化、复验和原 key 登记，不得额外索取“接入”确认。**来源、许可、provider/model（未知则明确写 unknown，不得伪造）、生成日期与 owner 审批者必须在 pending/provenance 中先存在；缺任一字段仍停在 pending 并准确诊断。测试中的 mock approve 仅可在 OS 临时根使用；本 SOP 没有宣称真实 API、许可证或视觉品质已经验证。

本地库 approve 只支持受信任共享 `assets/index.json` 的 `project` PNG 来源；审阅项里的 id/fingerprint/hash 不是事实源。批准门重读索引与源文件，重跑当前 manifest 计划，校验来源、filled texture、style、license、usage/colorSpace、outputPx、alpha、sampling、slot/key/fingerprint 与源文件 SHA-256，并拒绝非 PNG、绝对/URL/越根/符号链接逃逸、缺文件、跨游戏和非 project 来源。通过后以 slot slug + 原始 slotId 稳定哈希命名并 copy 到游戏 `art/vendor/project/`，避免有损 slug 碰撞；以原 assetKey upsert 本地索引并记录 `vendoredFrom`、slot binding、reviewer 与 content hash。reject 只清 local pending。FreeArtLib 尚未开放批准物化，不能以转 AI 绕过，也不能直接调用无 pending 绑定的 `vendor-asset.mjs`。

## Fixture 与破坏探针

`src/authoring/life-generation-bundle.fixture.ts` 从 Little Valley 的唯一 JSON package 与 AssetSlot JSON 现场转换 fixture：consumer 文档归一为 `life.json`，fingerprint/hash 重新派生，不维护第二份 70KB 内容副本。测试分别破坏 world RLE、actor relationship 引用、plot quest 引用、asset consumer，并要求分阶段稳定转红；另改已覆盖 visual key，必须同时出现 `missing_slot/orphan_slot/consumer_mismatch`，防止守卫未命中却假绿。
# World Visual Semantics v1（World/Assets 硬门）

- 每个 `scenes[*].warps[*]` 必须同时声明玩家可读 `label` 与 `landmarkPlacementId`。地标必须是同 scene、静态可见、带 `art:` skin 的 building/interactable/decoration，warp 格必须落在地标 footprint 内或与其曼哈顿相邻。青色通用 warp 标记只用于 legacy/error fallback。
- 每个实际出现在 ground layer 的 tile 必须声明 `visual.skinKey` 与 `visual.surface`；`surface` 只能描述表现，不授予行动。行动合法性仍唯一来自 `LifeActivityContext`。
- 有 plantable ground 时必须声明 `visualSemantics.schema=1` 及 `farm.tilledDrySkinKey`、`farm.wateredSkinKey`；作物 seeded/growing/mature 继续来自 crop visual。
- 不同行动集合的状态禁止静默共用 visual key。World 审阅必须附 `warp → landmark → destination` 与 `surface → actions → asset slot` 两张矩阵。
- 上述字段只在 authoring/renderer 消费，不得进入 snapshot/hash/save。
