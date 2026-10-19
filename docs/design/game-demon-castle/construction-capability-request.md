# REQ-SIMLIFE-CONSTRUCTION-01：Life 建设项目能力施工单

## 决策与目标

Owner 于 2026-10-12 选择 A：建设必须成为通用、确定性、数据驱动的 Life capability。首个消费者是“月影魔王城”，但实现不得包含任何该游戏的 id、文案、材料名、素材 key 或专属分支。

## 作者数据合同

在 `LifeGamePackage` 增加可选 `constructionProjects[]`。每条只允许：

- `id`：全局稳定且唯一；
- `placementId`：目标 `building|interactable` placement；
- `materials`：非空 `{itemId,count}` 数组，item 已在 itemCatalog、count 为正安全整数、同 item 不重复；
- `requires?`：复用已有 `LifeAccessRequirement`，不增加表达式；
- `completedSkinKey`：不透明 `art:` key，和既有 placement 初始 `skinKey` 一样进入 asset-slot closure。

新增 `build` 到 `LifeAction` 闭集；`LifeZone.allowedActions` 仅在有建设项目的近邻 placement 上才由 activity 导出可用 build，不能把 build 变为任意空地行为。项目不带自由 effect、脚本、时钟、随机数、铺放格、撤销、进度条或任意资源字段。

## 运行语义

1. Activity 只从已授权、当前场景、当前近邻、未完成的 project 产生 build affordance；材料不足与 access 未满足必须提供稳定拒绝原因。
2. `life.action(build)` 只能命中一个当前 affordance；Commit 再次预检 project/placement/requirement/inventory，成功时原子扣除全部材料、标记 project completed、产出标准 `LifeActionResult`。
3. 对应 placement 的权威 static identity 不变；只读 projection 给 renderer `initial skin` 或 `completedSkinKey`。重复 build、无项目、非近邻、锁定、材料不足一律不写 World。
4. 既有 Quest / relationship 只消费 `life-action { action:'build', targetId:<placementId> }`。不为项目另造剧情解释器。
5. completed state 进入 snapshot、snapshot hash 与 Life save 投影；loaded state 重建时动态 skin 立即一致。相关 system 接 opt-in DebugTrace：decision、transition、reject、commit；关闭时真 no-op。

## 接线范围

- 协议 / `LifeGamePackage` validator / compiler / `LifePlacement` 或等价 read-only projection；
- 新 capability（建议 `t2-life-construction`）及 registry、component map、strict system graph；
- activity/action、inventory、renderer、presenter/interaction 的通用消费；
- Life save projection、asset slot visual-reference 收集与 closure；
- 点名单测、SOP/JSON authoring docs、review 单。

不改任何 `game-demon-castle` 游戏运行时文件，不接真实图片/网络/API，不写游戏特例。

## 验收与复查

- validator 拒绝重复 id/material、未知 item/placement、非 building/interactable target、无 `art:` completed skin、无效 access；
- build 成功前后资源、project 状态、placement projection 精确；失败路径状态/背包均不变；
- 同 seed/输入、snapshot restore、save/load 的 hash 和完成皮肤相同；
- asset closure 同时要求初始与 completed key 均有 placeholder slot；
- system graph 无 warning；撤去“完成写入”或“材料扣除”必须让唯一锚点测试转红；
- 非施工人独立重跑以上证据。其他项目既有红不得顺手修。
