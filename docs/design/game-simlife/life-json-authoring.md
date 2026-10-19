# Life JSON 创作约定（Little Valley 样例）

## 唯一输入

Life 游戏内容以一个符合 `LifeGamePackage` v1 的纯 JSON 对象为唯一作者输入。Little Valley 的可运行样例是 `games/game-simlife/little-valley.life.json`；运行时把该对象原样交给 `compileAndParseLifeGamePackage`，不经过地图生成器、回调或游戏层规则代码。

JSON 只能包含有限数字、字符串、布尔值、`null`、数组与普通对象。不要写注释、函数、表达式、文件路径、URL、额外字段或自创 action。提交前必须让 `validateLifeGamePackage` 返回 `{ ok: true, issues: [] }`，并让 `compileAndParseLifeGamePackage` 成功。

## 作者能填写的内容

- `meta` / `world`：schema、游戏 id、标题、tickRate 与起始场景。
- `tileCatalog`：tile id、闭集 terrain tags，以及可选 `visual.skinKey`。
- `scenes[].layers`：`ground`、`collision`、`interaction` 三层；每层是按行优先展开的 RLE `{tileId,count}`，count 总和必须等于 `width × height`。
- `scenes[].zones`：矩形区域、闭集 kind、静态 `allowedActions` 与可选 access requirement。
- `scenes[].spawnPoints`、`placements`、`warps`：位置、尺寸、目标引用、资源/NPC 数据与闭集 access requirement。
- `itemCatalog` / `playerInventory` / `cropCatalog`：物品目录、初始背包和作物目录。
- `movement` / `interaction` / `camera`：连续移动速度、近邻范围、闭集 `dialogueSessionPolicy: "persistent"|"proximity"` 与 engine-owned 视口 profile。生成包必须写 `"camera":{"profile":"life-standard-v1"}`，不得填写自由 `viewportWidthCells/viewportHeightCells/follow/cellSize`。策略省略时兼容旧包、对话离开范围后仍持续；`proximity` 会按同一 package/placement 近邻范围在确定性 tick 内结束会话。
- `profile`（可选）：只读人物档案。`titleKey` + 非空有序 `attributes[]`；每行只允许 `id/titleKey/display(value|gauge)/source/iconSkinKey/surfaces`。`surfaces` 省略即 `['profile']`，否则为不重复的非空 `profile|hud` 闭集；最多四行可选 `hud`。`source` 只能唯一引用既有 `logic.resources`（`{kind:"resource",id}`）或 `relationships`（`{kind:"relationship",npcId}`），禁止公式、函数、自由路径和任意实体查询；`gauge` 只用于有限 `min/max`。编译产物 `LifeProfileCatalog` 不复制 current，Host 始终从 `Resource` / `LifeRelationshipProjection` 读取权威值。
- `calendar` / `logic` / `milestones` / `dialogueCatalog`：日历（可含至少两个稳定 `slots` 与引用其中一项的 `initialSlot`）、初始 flag/resource、收获里程碑和既有 dialogue 数据图。供任务引用的对话选项必须填写 dialogue 内唯一的稳定 `id`。
- `quests`：严格 chapter → quest → node 图。每层 id 稳定；quest 明写 `chapterId`、整数 `priority`、可选 `exclusiveGroup`、`initialNodeId` 和非空 `terminalNodeIds`；node 明写标题/目标 key、闭集 trigger、可选闭集 condition、非空 effects，并在 effects 中把自己置为 `completed` 或 `failed`。
- `constructionProjects`：固定点、一次性建设表。每条只写全局唯一 `id`、一个 `building|interactable` 的 `placementId`、非空且 item 不重复的正整数 `materials`、可选既有 access requirement，以及不透明 `art:` `completedSkinKey`。对应 zone 必须显式允许 `build`；引擎只会在近邻且未完成的目标上导出 affordance。
- NPC `placements[].schedule`：仅在声明 `calendar.slots` 后可选；必须为每个 slot 恰好写一条 `{slot,sceneId,x,y,visible,interactive}`，目标场景/整数坐标必须存在、界内、非 blocked。`visible` 只管渲染，`interactive` 只管可交互资格，两者不可互相代替。
- `playerVisual` 与各目录/placement 的视觉槽：只填写已经登记的 `art:` consumer key。

素材槽只接受不透明 key，例如 `art:little-valley:tile:meadow-grass`。不要填写 `public/...`、磁盘路径、HTTP URL、data URL 或文件扩展名；资产系统负责把 key 解析到真实文件。

## 引擎派生、作者禁止填写的状态

下列是运行期组件或解释器结果，不属于 `LifeGamePackage` JSON：

- `Transform`、`LifePosition`、`LifeNpcSchedule.currentSlot`、`CameraTarget`、`LifeMoveRequest`；
- `LifeActivityContext` 及其 `affordances`；
- `Inventory`、`LifeFarmPlot`、`LifeCrop`、`LifeResourceNode` 的运行期余量；
- `LifeConstructionProject.completed`；作者只声明项目规格，完成位由引擎一次性写入并进入快照/存档。
- `LifeSelectedItem`、`LifeSelectedTarget` 与所有 `*ActionResult`；
- `LifeDialogueSession`、dialogue `State` / `Text`；
- `LifeQuestState`（节点的 `locked|active|completed|failed` 与一次性 receipt）和 `LifeQuestProjection`；
- UI 菜单、提示文案、LayoutNode、DOM、Canvas 指令。

`life-standard-v1` 是当前唯一合法 Life 视口：逻辑宿主 `900×620`，HUD 安全区为顶栏 `52` / 底栏 `0`，格边长 `32`，逻辑相机 `28×19` 格、zoom `1`、margin `0`、四边 dead-zone `0.3`，显示模式为响应式 `cover`。这些数字属于引擎 profile，不是游戏 authoring 字段；新例外必须先新增 engine-owned profile id，禁止游戏写自由数值或私有 profile。Host descriptor 与 Life package 必须选择同一 profile。

宿主响应式 Canvas 只在本地按 play-field CSS 尺寸与 DPR 重建 backing store，并以同一 aspect-preserving cover 投影世界和 WorldUI2D；它不会回写 JSON、Camera、相机跟随、逻辑可视格数或快照。同一浏览器尺寸下，所有选择同一 profile 的 Life 游戏具有相同单格屏幕比例、可视格数与 HUD 安全区。角色、NPC、建筑、作物和物品的实际显示大小/脚点由 AssetSlot `render.display` 与 `render.anchor` 调整，不得为某个素材或屏幕宽高复制场景、改 camera 数据或加入 resize 脚本。

作者只描述初始世界与现有 capability 可解释的数据。区域权限、邻近对象、实时可执行动作、资源耗尽、作物阶段、对话会话和 warp 是否解锁都由引擎从当前 World State 派生；不要在 JSON 里缓存或复制这些结果。

## Quest / Story Graph 的 AI 创作契约

可用 condition 只有：`always`、递归 `and/or/not`、`flag.equals`、`resource`（当前值 ≥ value）、`calendar`（season/day/slot 可选约束）、`inventory`（count ≥）、`milestone`（已完成）、`resource-node`（remaining 的 `gte|lte|eq`）与 `relationship`（按 NPC 的数值或 level）。可用 trigger 只有：`game-start`、日历 `slot/day` 边界、已应用的 `life-action`、带稳定 `choiceId` 的 `talk-choice`、`harvest`、`gather`。可用 effect 只有：`set-flag`、`unlock`、`add-resource`、背包正负整数增减、`set-node-state` 与 `relationship-delta`。关系变化必须提供稳定 `ruleId/priority/npcId/amount` 并进入统一关系批处理；不得用 flag/resource 冒充关系、不得写自由表达式或游戏层补丁。

```json
{
  "quests": [{
    "id": "chapter.first-season",
    "titleKey": "第一季",
    "quests": [{
      "id": "quest.first-season",
      "chapterId": "chapter.first-season",
      "priority": 100,
      "initialNodeId": "harvest",
      "terminalNodeIds": ["report"],
      "nodes": [{
        "id": "harvest",
        "titleKey": "第一次收获",
        "objectiveKey": "收获一份成熟作物",
        "trigger": { "kind": "harvest", "cropId": "turnip" },
        "when": { "kind": "inventory", "inventoryId": "bag:life:player", "itemId": "crop.turnip", "count": 1 },
        "effects": [
          { "kind": "set-node-state", "questId": "quest.first-season", "nodeId": "harvest", "state": "completed" },
          { "kind": "set-node-state", "questId": "quest.first-season", "nodeId": "report", "state": "active" }
        ]
      }]
    }]
  }]
}
```

创作时遵守以下硬边界：

1. 所有 flag/resource/item/crop/milestone/placement/dialogue choice/quest node 引用必须已声明；不要猜 id。
2. 每个 node 的 effects 必须结束自身，后继靠显式 `set-node-state(...,"active")` 打开；不可达节点、死终点、重复 id 会被拒绝。
3. 环默认非法。确需环时，环内每个 node 都写 `loop:true`，并至少有一条指向环外节点的显式出口。
4. 同拍同逻辑目标写入默认冲突并整批拒绝。确有互斥分支时，让相关 quest 使用同一个 `exclusiveGroup`；解释器只选稳定总序第一名，其他同拍候选原子置为 `failed` 并记 receipt。不要依赖 JSON 数组顺序。
5. 所有效果先整批预检，再一次性 Commit；任一缺引用、背包不足/装不下或写冲突都会全批不落地。node receipt 使已成功节点不会重复结算。
6. UI、AI 和游戏代码只读 `LifeQuestProjection` 的标题、目标和状态；不得重跑 condition、读 flag 拼目标或直接修改 quest state。
7. 任务数据不得包含随机、墙钟、回调、脚本、DOM/CSS 或路径。随机剧情若未来需要，必须先补受种子控制的通用 capability，经 owner 裁决后再写数据。

## 多区域与资源闭环

- 每个 scene 都独立声明自己的尺寸和三层 RLE；不要复制另一张地图后只换 scene id。地形、碰撞、zone、placement、warp 必须共同描述一条可实际行走的区域路径。
- warp 的 `at` 必须是当前场景可走且非 blocked 的格子，`toSceneId + toSpawnId` 必须引用目标场景的真实 spawn。故事门直接写在 warp 的闭集 `requires` 上，不在游戏代码里重判。
- 资源点必须是 `kind: "resource"` placement，并用 `resourceNode` 声明闭集 action、目录 item id 与正整数 quantity。矿区组合为含 `mineable` tile 的 `kind: "mining"` zone、`allowedActions: ["mine"]` 与 `resourceNode.action: "mine"`；实际背包增量和 depleted 状态由 `t2-life-resource-gather` 解释。
- 同一个世界物件只放在其所属 scene。Little Valley 的 `ore-vein` 属于 `mine-interior`，山谷入口只保留门与解锁 warp，避免场景外提前采到矿石。

## 固定点建设合同

```json
{
  "constructionProjects": [{
    "id": "bridge.repair",
    "placementId": "bridge",
    "materials": [
      { "itemId": "resource.wood", "count": 20 },
      { "itemId": "resource.stone", "count": 8 }
    ],
    "requires": { "kind": "flag", "id": "bridge.unlocked", "equals": true },
    "completedSkinKey": "art:example:bridge-complete"
  }]
}
```

初始外观仍写在 placement 的 `skinKey`；完成外观写 `completedSkinKey`，两者都进入 asset-slot closure。成功 `build` 原子扣除整份材料并置 completed，placement 的 id、位置、尺寸与 prefab 不变。失败（材料不足、锁定、非近邻、无项目、重复建设）不扣任何物品、不触发 Quest/关系。剧情只写 `{ "kind":"life-action", "action":"build", "targetId":"bridge" }`，禁止再造建设专用剧情事件。

v1 不接受施工计时、阶段进度、自由摆放、拆除/撤销、随机 id、自由 effect、脚本或回调；出现这些需求必须先走 capability 缺口裁决，不能塞进数据旁路。

## 最小校验清单

1. `meta.schema` 固定为 `1`，所有 id 与引用存在且不重复。
2. 每个场景恰有三层 RLE，且每层解码长度等于场景面积。
3. 全库只有一个 player spawn；所有 scene/warp/spawn/dialogue/item/crop/flag/resource 引用闭合。
4. 可行动 zone 不覆盖 blocked cell；farm/forage/fishing/mining 区域包含相应 terrain tag。
5. `skinKey` 只写 `art:` consumer key，不写路径。
6. 先跑 validator，再跑 compiler；任一 issue 都应修数据，不在游戏层加绕过代码。
7. 多区域逐 scene 展开三层 RLE，核对各自面积；再从每个入口 spawn 沿非 blocked 格走到资源点和出口，确认 warp 往返引用闭合。
8. 写 NPC schedule 时逐 slot 核对覆盖恰好一次、目标格可走、`visible`/`interactive` 均为布尔值；`life.advance-time` 从末 slot 回卷时推进一天并回 `initialSlot`，`life.advance-day` 也回 `initialSlot`。
9. 写 quests 时先画出节点与显式激活边，再核 initial/terminal、可达性、环出口、同拍写集；最后确认 HUD/AI 只消费 `LifeQuestProjection`。
10. 写建设项目时核对 placement kind、材料目录/去重/正整数、access 引用、zone 的 `build` 权限，以及初始/完成两个 `art:` key 都已有素材槽。
11. 每个 placement 都显式写正整数 `width/height`。多格建筑 warp 写 `interactionPlacementId` 指向同场景 placement，并令 `at` 位于该 footprint 内；runtime 编译为 `x/y/width/height`，提示与 `LifeWarpRequest` 都只认这一交互占地。字段省略时只保留 legacy `at` 的精确 `1×1`；`landmarkPlacementId` 仅负责可见地标，不参与模拟判定。

## NPC 关系契约

- `relationships[]` 只引用已声明 NPC placement；每 NPC 唯一。`min < max`、`initial` 在区间内；`levels[]` 第一条 `min` 等于关系 `min`，之后严格递增。
- `dailyCaps` 显式给出非负整数 `talk/gift/action`。规则必须有全局唯一 `id`、整数 `priority`、可选非空 `exclusiveGroup`；触发器只可为 `talk-opened/talk-choice/life-action/harvest/gather/gift/quest-effect`，效果只可为非零整数 `relationship-delta`。
- `gift` 声明已存在的 `itemId` 与正整数 `count`。引擎同时预检物品、预算、边界、冲突、receipt，再提交扣物与关系变化；应用增量为零时不扣物。
- Quest 条件使用 `{kind:"relationship",npcId,cmp?,value?,levelId?}`；Quest/Dialogue 的关系效果声明稳定 `ruleId/priority/npcId/amount` 并进入同一批次。禁止 Resource 魔法 id、Flag 镜像等级、表达式字符串、随机或墙钟。
- UI、对话可用性与 AI 只读 `LifeRelationshipProjection`，不得自行按阈值重算 level。
# 世界视觉语义

生成线的严格包必须补齐：ground tile 的 `visual.surface`、每个 warp 的 `label`/`landmarkPlacementId`，多格建筑 warp 的 `interactionPlacementId`，以及存在可耕地时的根级 `visualSemantics.farm`。`surface` 闭集为 `ground|plantable|water|forage|mineable|blocked`，应与 tile tags 推导出的行动语义一致。地标绑定只决定出口如何可见；交互 placement 才决定 E/鼠标显式交互 footprint，二者均不触发自动传送。

素材槽位必须逐指针覆盖普通地面、未耕可耕地、干燥耕地、湿润耕地及作物阶段。没有人审的新增行保持 `placeholder`，不得登记正式 AssetIndex。
