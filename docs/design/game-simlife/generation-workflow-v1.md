# 模拟经营游戏生成流程 v1

## 决策

接受。当前已有 `LifeGamePackage v1`、`LifeGenerationBundle v1`、`life-host.v1`、资产槽位和受限 materializer；缺口不是再造游戏运行时，而是把这些既有合同编排为每个 agent 都能遵守、每一步都可目击的创作流程。

本流程有两个入口，只有一个可信边界：

```text
Codex 对话 / 未来前端
  → Generation Brief v1
  → 按序批准的 World / Actors / Construction / Plot / Assets 切片
  → source manifest + 通用 composer
  → GenerationBundle v1 candidate
  → strict validator + compiler + deterministic probe
  → asset review queue
  → approved materialization
  → shared Life host playable preview
```

模型、前端和图片供应商都在边界左侧；运行时只消费已验证的 `LifeGamePackage`、`life-host.v1` 与已批准资产 key。

固定点建设也走同一边界：World 阶段在 `constructionProjects[]` 声明 placement/材料/access/完成皮肤，Actors 阶段只提供已登记 item，Plot 阶段用标准 `life-action(build)` 触发任务/关系，Assets 阶段必须同时审 placement 初始皮与完成皮。禁止生成施工脚本、计时器、自由摆放规则或游戏专属解释器。

所有 World/Host 候选还必须共同选择 engine-owned `life-standard-v1`：Life package 只写 `camera.profile`，Host descriptor 只写 `viewport.profile`。该 profile 固定 Little Valley 的逻辑宿主、HUD 安全区、32px 格、28×19 可视格与 dead-zone；生成器不得输出自由尺寸、相机数字或游戏私有 profile。素材的视觉比例只在 AssetSlot `render.display` / `render.anchor` 中表达。

Life 空间姿态只有一个权威脚点合同：`Transform.(x,y)` 是以格为单位的连续脚点，`LifePosition.(x,y)` 是使用共享 `cellFloor`（边界归正侧、负数向下取整）派生的离散当前格缓存。碰撞、interaction/proximity、镜头目标、当前格高亮、玩家 WorldUI 与精灵底部中心必须从这一脚点及其派生格读取；NPC/placement 的可见投影同样以 footprint 底部中心为锚。AssetSlot 的 `display/fit/anchor/offset` 只决定图片框如何贴到脚点，禁止反向改写 World、交互范围、碰撞、相机、snapshot 或 hash。生成器不得用单游戏 offset 修正坐标体系问题。

每个玩家可进入的 scene 应提供非空 `title`，每条 warp 可提供面向玩家的非空 `label`；省略时共享 Host 只作稳定 id fallback，不得由游戏私有 UI/TS 补文案。共享 renderer 对当前场景每个 warp 画统一出口标记，Host HUD 显示 scene title，玩家站在 warp 格时由既有 `LifeInteractionAffordance` 显示带目的地的 `……（E）`。传送只接受显式 `life.warp` 互动请求；目标 spawn 与反向 warp 可以同格，到达后无输入不得自动反弹，并且必须允许立即按 E 或点击菜单显式返回。

World 通过前还必须满足建设可达性 gate：每个固定 construction placement 的 scene 中，交互距离内至少有一个可行走 cell 落在允许 `build` 的 zone，且隔离真实 Engine 在满足兼容 access 与材料条件后能投影 `available:true` 的 build affordance。缺 zone、zone 不可达、条件矛盾或真实投影不可用都阻断候选；修复只能精确修改目标 zone 的动作表，不得顺手扩宽其他合法非建设动作。

## M0：Codex 创作流程（本期）

### 输入

用户用自然语言给出 Brief。Codex 将其收敛为：题材/情绪、核心循环、场景与规模、NPC 与第一季剧情、可用动作、视觉风格、tile/sprite 规格、明确不做的内容。

`Generation Brief v1` 还必须先写清背包设计：容量（slots/maxStack）、初始物品、核心循环分别产出/消耗哪些物品。所有被循环产出或消耗的 item 都必须进入 `itemCatalog`，拥有 `art:` skinKey，并在 AssetSlot 中以精确 `life.json#/itemCatalog/<index>/skinKey` consumer 闭合。Brief 若要求玩家可打开背包面板，只能建议 Host descriptor 使用已完成的 `inventoryPanel` opt-in；该 UI 选择不得写入 Life package。图标候选在人审前始终保持 placeholder。

### 五份可审内容

| 包 | 内容 | 可视化 |
| --- | --- | --- |
| World | RLE 地图、场景、区域、阻挡、warp、显式尺寸 placements、多格建筑 `interactionPlacementId` | 场景关系图与格子预览 |
| Actors | 先完成容量、初始物、循环产出/消耗设计，再生成物品、作物、资源、日历、NPC 日程；可选 profile 只能引用既有 resource/relationship，且每行明示 profile/hud surface（hud 最多四项） | `LifeInventoryReview v1` 背包表；有 profile 时追加 `LifeProfileReview v1`（含 surface placement）+ NPC/资源/交互范围图层 |
| Plot | 对话、任务、里程碑、关系、解锁条件 | 可达剧情图 |
| Assets | `AssetSlotBrief` 与候选来源（含每种运行时 ground tile） | 尺寸、锚点、用途、候选与地图落点 |
| Host | host descriptor、launcher declaration、save namespace | HUD/视口/输入与存档身份卡 |

五包由 `zerocraft.life-generation-slice-manifest.v1` 固定来源与顺序，再由共享 `life-bundle-compose` 合成为 `LifeGenerationBundle v1`。每个 patch 必须声明完整前序依赖；composer 只允许受限 `add|replace` JSON Pointer、重算全部 provenance，并默认零写返回 plan。校验失败只能按诊断中的 JSON 路径修复；不得靠人工复制、游戏私有脚本、游戏层代码、回调或自由条件表达式绕过。

## 串行双门：JSON 自检 + owner 人审

每一个阶段都不是“生成完就继续”，而是必须依序通过两道门：

```text
产出本阶段 JSON
  → 机器自检（失败：只修本阶段）
  → 可视化审阅产物
  → owner 明确批准 / 要求修改
  → 才能进入下一阶段
```

每次都要保存一份 `zerocraft.life-generation-gate.v1` 审阅记录：

```json
{
  "schemaVersion": "zerocraft.life-generation-gate.v1",
  "stage": "world",
  "inputHash": "sha256:...",
  "selfCheck": {
    "status": "pass",
    "diagnostics": []
  },
  "visualArtifacts": [
    { "kind": "collision-zone-map", "ref": "world-preview" }
  ],
  "ownerDecision": "pending"
}
```

`stage` 只能是 `brief|world|actors|plot|assets|host|bundle|playtest`；`ownerDecision` 只能是 `pending|approved|changes-requested`。`pending` 是停点，不允许 agent 自行进入下一包；owner 要求修改后，内容 hash 改变，必须重新跑该阶段自检和人审。

共享实现位于 `src/authoring/life-generation-gate.ts`。`createLifeGenerationGate()` 复用 `life-generation-bundle.ts` 的 canonical JSON SHA-256，把原始阶段输入、机器诊断与可视化引用投影为 gate，并强制 `ownerDecision:'pending'`；创建入口不接受调用方注入 approved。`validateLifeGenerationGate()`、`validateLifeGenerationGateSequence()` 对根对象及嵌套对象执行闭集校验，要求 diagnostics 与 artifacts 去重、稳定排序，并以当前阶段原始内容重算 hash。`evaluateLifeGenerationGateAdvance()` 只读判定紧邻下一关：序列必须从 Brief 起连续，所有前序 gate 已 pass+approved，当前 gate 还必须针对当前内容 exact-hash、pass+approved；内容变化返回 `stale_input_hash`，要求当前阶段重新自检与人审。

gate 只记录机器事实与 owner 决策 token，不记录 session、provenance、操作者身份，也不会进入 `LifeGamePackage`、Bundle runtime payload、World、snapshot 或 save。纯 JSON 的 `approved` 不能证明操作者是真人；owner 身份认证与授权始终属于上层控制台/会话。可视化产物仅保存受限的 `{kind,ref}` 不透明引用，不读取路径或生成图片；每阶段至少一个引用，kind 按 Brief 卡、World 图、NPC/交互覆盖、剧情图、素材槽表、Host 身份卡、Bundle 报告、试玩/首程路线的闭集清单校验。

| 阶段 | JSON 自检 | owner 必看 |
| --- | --- | --- |
| Brief | 闭集字段、规模/风格/约束完整 | 游戏方向、明确不做的内容 |
| World | RLE 面积、tile/warp/zone 引用、出生点到目标的可达性、placement 显式 width/height、多格建筑 warp 交互占地，以及每种可见地块的 `visual.skinKey` | 地图结构、区域分工、可走性与地块纹理 |
| Actors | item/crop/NPC/schedule/reference 闭合；`LifeInventoryReview v1` 重跑 Bundle gate；有 profile 时 `LifeProfileReview v1` 核对权威来源、初始/范围与精确 ui-icon 槽 | 背包与人物档案候选状态，以及 NPC 分布、日程、核心循环是否合理 |
| Plot | dialogue/quest/relationship 图、条件与效果引用 | 剧情节奏、解锁条件、玩家目标 |
| Assets | `AssetSlotBrief` schema、consumer 闭包、placeholder 限制；每种 `tileCatalog.*.visual.skinKey` 必有对应 tile slot | 尺寸、锚点、地图摆放、素材来源与地块纹理 |
| Host | `life-host.v1` / launcher 严格解析、身份一致性 | HUD、输入、视口、存档身份 |
| Bundle | 全包 validator、compile、两 tick snapshot/hash/restore、system graph | 是否批准进入物化计划 |
| Playtest | 第一条玩家路线、真实可见反馈、差异单 | 是否接受试玩体验 |

### 可见关卡

1. Brief 卡：确认做什么、不做什么。
2. World 预览：确认玩家能从出生点走到每一个必要目标和出口。
3. Inventory 表：确认容量、初始物、每件物品的 starter/crop/resource/construction/catalog-only 来源与精确图标槽；该 `inventory-review` 必须在 Actors owner approval 前出现，未批准不得进入 Plot/Assets。
4. Story 图：确认每个解锁条件有来源，主线存在可达终点。
5. Asset 工作表：确认每个可见对象都有槽位、规格和暂定来源。
6. Playable Preview：确认第一条玩家路线可完成，并保留问题/差异单。

M0 的终产物是“可审的生成候选”，不是未经同意写入正式游戏目录的成品。

### Bundle 候选编译关

所有阶段 gate 均针对当前内容 exact-hash 且 owner 已批准后，才允许维护同目录 `bundle.sources.json` 并运行 composer。默认 `--plan` 不写文件；显式 `--write-candidate` 只原子写固定 `bundle.candidate.json`。source root、manifest/source basename、symlink、依赖顺序、patch pointer、源文件竞态和已有 target 都由工具 fail-closed 检查；输出继续完整经过 Bundle validator、compile、两 tick snapshot/hash/restore 与素材闭包。

候选文件只是已审切片的可复验组合结果。它不会创建正式游戏、批准素材、修改 AssetIndex、接 launcher 或调用模型；后续 M0 materializer 仍需把该 Bundle 与独立 Host/Launcher 候选共同复验并给出 confirmation hash。

## M1：素材审核与物化

方向化生成可在 `AssetSlotManifest.artDirection` 选择 engine-owned `zerocraft.life-art-direction.v1` profile；当前闭集为 `pixel-art|illustrated-2d`。profile 集中给出基础/负向 prompt 与逐 `tile|crop|player|npc|building|resource|item` 的 outputPx、alpha、sampling、display、anchor、fit，槽位只补 `semanticPrompt`，最终 prompt/spec 由工具稳定派生。`illustrated-2d` 强制包含 `high-detail illustrated 2D, non-pixel-art, readable at gameplay scale`，负向至少包含 pixel art、sprite sheet、UI、text、border，并拒绝 nearest、低于 128×128、错误透明度或任意漂移；其 384×512 player/npc 在地图上按 `1×1.5 cell`、bottom-center、contain 显示，等价于 legacy 32×48 / 32px 格的占格比例。该 profile 只属于 authoring/asset 面，不进入 `LifeGamePackage`、World、snapshot/hash/save；`life-standard-v1` 的 32px 逻辑格不随源图分辨率改变。

`ui-icon` 是同一方向化闭集中的透明小图标槽：center anchor、contain、像素显示尺寸；它只服务 UI 图标，不得伪装为世界 item/resource，也不得绕过候选审批。

素材链固定为：

```text
AssetSlotBrief
  → candidate-plan（本地库优先，未命中才准备 AI request）
  → review-packet（zerocraft.life-asset-review-packet.v1）
  → generation-batch（local-review | ai-generate | invalid）
  → game-local pending human review
  → human decision
  → approved materialization / game-local AssetIndex registration
  → renderer continues to consume the original art: key
```

`review-packet` 是只读、可 JSON 往返的审阅投影：条目按 slotId 稳定排序，包含尺寸、alpha、sampling、style、render/consumer 和 local/AI 分支数据；所有合法条目只能是 `pending-human-review`。它会重新严格校验 brief，并对账 candidate plan 的 schema、game、slot、assetKey 与 decision payload；任一不一致整包 `valid:false`，不留下部分可审批条目。包内不含路径、license、provider、bytes、contentHash 或真实 approval，也不会调用模型、写 pending、登记索引或物化文件。

每个素材槽位先搜索本地库；未命中才准备 AI 候选请求。profiled 本地候选必须逐项精确匹配 style、usage、colorSpace、sampling、outputPx 与 alpha；任何缺失或漂移继续保持 `ai-required`，不得因“看起来接近”降级匹配。候选还必须经过锚点和地图摆放的人审。只有人明确批准后，asset-manager 才能生成或 vendor 真实候选、核验许可与 provenance、登记索引并替换 placeholder；本流程的 candidate-plan 与 review-packet 都停在人审之前。**批准具体候选批次时，owner 同时确认其来源/许可声明后，系统应自动进入物化，不再要求第二次“接入”确认：逐行规范化→重验 bytes/provenance→原 key 注册。任一行失败只保留 pending 诊断，绝不部分越权。**

建筑的 world placement 必须显式给出正整数 `width/height`。生成用 building 槽的 `render.display` 必须与它消费的 placement footprint 完全一致：`cell` 单位逐值相等，`pixel` 单位按 `life-standard-v1` 的 32px/格换算后相等；同一 key 被多个 placement 消费时每处都必须一致。多格建筑承载 warp 时，warp 必须显式写 `interactionPlacementId` 指向同场景该 placement，且 `at` 位于其 footprint 内；编译后的 `LifeWarp.x/y/width/height` 是提示与显式 E 请求共同消费的唯一交互占地。`landmarkPlacementId` 仍只负责可见地标审阅，不能取得模拟权威。

`zerocraft.life-asset-generation-batch.v1` 是 Codex/未来前端共用的执行计划边界。它重新对账 brief、candidate-plan 与 review-packet，任一被改动就让整批 `valid:false`；合法条目按 slotId 排序，只允许 `local-review` 或受限 2D `ai-generate(qwen|gpt-image)`，默认 qwen，可由调用参数整批选择或按 slotId 闭集覆盖。计划不含磁盘路径、URL、密钥、bytes、许可或批准字段。本地安全引用含闭集来源、id 与元数据 fingerprint；显式 `--generate` 才把它写成 game-local `zerocraft.life-local-asset-review.v1`，并从可信共享索引/源文件补内容 SHA-256。AI 同样只有显式生成才进入 `art/ai/pending/`；真实 provider 还必须有 `--real-provider` 与对应环境 key。provider 返回图先确定性规范化为槽位 outputPx/alpha 合同，再由既有审批门复验实际 PNG bytes。

`gpt-image` 是官方 OpenAI Image HTTP API adapter，模型固定显式为 `gpt-image-2`，key 只从 `OPENAI_API_KEY` 进入 Authorization header；Codex 内置 imagegen 不可从 Node 调用，若人工生成素材只能另走 asset-manager 手工导入候选，不能冒充自动 provider 结果。

AI pending 必须携带 slotId、原始 assetKey、briefFingerprint、尺寸、alpha、sampling 与 anchor。approve 时工具重新读取并严格核对**当前** AssetSlot manifest；game/slot/key/fingerprint/规格/PNG bytes 任一不一致都保持 pending，AssetIndex 与旧正式文件零改动。通过后只能以该槽原有 `assetKey` upsert 游戏本地索引，并在 provenance 记录 slot binding；渲染器与 Life JSON 继续消费同一个 `art:` key。reject 只删除候选，旧 placeholder 继续生效。

本地候选 approve 不信任审阅 JSON：按 current manifest + trusted `assets/index.json` 重新规划并核对 source/id/fingerprint/源文件 SHA-256、filled texture、style/license/spec 与越根路径防线；当前只批准能从字节严格核验尺寸/alpha 的 PNG。通过后以 slot slug + 原始 slotId 稳定哈希命名并 copy 到游戏 `vendor/project/`，避免有损 slug 碰撞；以原 assetKey upsert 本地索引并记录 `vendoredFrom`、slot binding、reviewer 与 content hash。非 `project` 来源目前可展示但会明确拒绝物化；FreeArtLib 若要开放，必须另补同等级可信索引与本地闭包验证。reject 只撤 local review 项。现有 `vendor-asset.mjs` 仍是无 pending 的直接命令，不得绕过此人审门。mock AI approve 只在隔离临时根证明合同，不代表 mock 可进入正式游戏，也没有验证真实供应商 API 或视觉质量。

执行物化前必须展示 dry-run 计划：目标 slug、文件清单、冲突、hash、资产批准状态和 launcher 影响。获得用户明确授权后才能创建游戏文件或注册入口。

### 正式四文件提升门

当由 composer 产生的 Bundle candidate、Host、Launcher 已完成本流程的人审且 owner 已授权具体游戏/施工单或候选方向时，仍必须先运行 M0 取得当前输入的 confirmation hash。按 `AGENTS.md §2.2`，agent 可以显式调用 `life-materialize --promote --owner-confirm <hash> --workspace-root <workspace>`，无需 owner 再手工复制同一命令。工具只把 `life.json`、`asset-slots.json`、`life-host.json`、`life-launcher.json` 四个 canonical JSON 原子发布到精确的 `games/<slug>/`，并在写前、staging 写后和 rename 发布后复跑严格校验与 launcher discovery。

该入口不承接素材、入口代码或发布副作用：不写 `public/`、AssetIndex、图片、TS 游戏入口、launcher 代码、pipeline、存档、数据库、服务、Git，也不调用模型或网络。已有目标只有逐字节完全一致才允许幂等通过；partial、extra、different、路径或 symlink 风险一律拒绝且零覆盖。提升成功只是 authoring 文件就位，不等于 Playtest、人门或发行完成。

正式目标后续修订不得手工搬目录或用 `--promote` 覆盖。先用同一新输入执行只读 `--plan-update --workspace-root <workspace>`，取得旧正式四文件 `currentFilesHash` 与新 `confirmationHash`；具体游戏/施工单或候选方向已经 owner 授权时，agent 直接执行 `--update --owner-confirm <new> --current-files-hash <old> --workspace-root <workspace>`。更新在同目录 staging、以受身份守卫的目录交换与 rollback 完成；old hash drift、新确认不匹配、发布期外部替换都 fail-closed，并保留外部文件/必要恢复组。执行后 agent 必须重读正式组、复跑 strict discovery 与对应测试；不得把 materialize 成功冒充 Playtest 或 Owner 人门通过。

## M2：未来前端/API（非本期实现）

前端只是 M0/M1 的图形界面：Brief 编辑器、生成进度、地图/剧情/资产预览、JSON 诊断、候选素材审核和试玩窗口。模型 API 只负责生成或修复 bundle；前端不得直接写游戏运行时、资产索引或存档。

## 本期验收

在 Codex 中给出一个新的 Brief 后，能得到一份通过 `LifeGenerationBundle v1` 检查的候选包、五类可视化审阅结果、待审批的素材槽位清单，以及零写入的物化计划。随后可用同一份数据进入现有共享 Life host；不复制 Little Valley 专属代码。
# World Visual Semantics v1 gate

World gate 在编译前执行路径级检查：warp 缺目的地文案/可见地标、多格建筑缺同场景 `interactionPlacementId`、`at` 不在交互 footprint、地标跨场景/无 skin/距离非法、ground surface 缺失或与 tags 不符、动态农务 surface 缺 key，以及不同行动集合共用 key，均为 error。Bundle 检查结果同时输出 warp 与 surface 审阅矩阵；矩阵包含地图落点、footprint/显示尺寸、anchor、asset slot 与候选状态。
