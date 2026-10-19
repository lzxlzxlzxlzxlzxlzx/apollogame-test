# 魔王少女的月影城堡 · Capability Plan

## 1. 游戏一句话

以现有 Life 引擎驱动的俯视模拟经营游戏：少女魔王在月影城堡周边采集、耕种、修复建筑，并以资源、关系和任务条件解锁剧情。

## 2. 消费的引擎能力

| capability / Life 包能力 | 用途 | 状态 |
|---|---|---|
| Life 连续移动、碰撞、镜头安全区与场景 warp | 玩家自由探索庭院、森林、地底工坊 | ✅ 现有 |
| Life zone / placement / affordance | 农田、资源点、建设点、NPC 的近身互动 | ✅ 现有 |
| Life crop / calendar / inventory | 月萝卜播种、生长、收获、休息推进日历 | ✅ 现有 |
| Life resource gather | 月苔藓、黑曜石采集与耗尽 | ✅ 现有 |
| `t2-life-construction` / `constructionProjects` | 固定王座厅、温室、熔炉点位的一次性材料建设与完成皮肤 | ✅ 现有 |
| Life NPC schedule / relationship / dialogue | 管家幽灵、石像鬼工匠的交流、好感与时间表 | ✅ 现有 |
| Life quest / milestone / condition-effect graph | 建设目标、区域解锁与第一章剧情 | ✅ 现有 |
| Life host presenter / interaction / input / HUD | 近身 `E` 提示、递归菜单与基础状态栏 | ✅ 现有 |
| Rich Life HUD / task, bag, profile panel projections | 已定稿的浏览器全视口 HUD、任务全表、背包格、角色档案与可替换标签素材 | 🟡 Owner 已选 A：先实施共享背包面板（`SIMLIFE-INVENTORY-PANEL-01`）；任务/档案留后续能力单 |
| AssetSlotBrief / generation bundle / local-or-AI review pipeline | 角色、建筑、地块、物品的可审素材链 | ✅ 现有 |

## 3. 数据规则面

| 数据 | 规则 | 解释器 |
|---|---|---|
| `scenes/zones/placements/warps` | 三个互通区域、可行走范围和建设点 | Life 世界编译器 |
| `cropCatalog/itemCatalog/resourceNode` | 月萝卜、月苔藓、黑曜石及其获得方式 | Life crop/resource/inventory |
| `relationships/dialogueCatalog/schedule` | NPC 好感、日程、对话选择 | Life relationship/dialogue |
| `constructionProjects` | 王座厅、温室、熔炉的固定点材料提交与完成外观 | Life construction |
| `quests/milestones/logic` | 三段建设触发、好感变化与第一章剧情推进 | Life quest/milestone |
| `AssetSlotBrief` | 32px tile/item、32×48 角色、建筑尺寸与锚点 | 素材槽/审批管线 |

## 4. 游戏层代码例外

无。建设项目、剧情条件与地图内容均须落入现有 Life 闭集数据；不写游戏私有解释器。

## 4.5 美术接入

- 所有 tile、角色、NPC、资源、作物、建筑和建设点均有 `art:` 槽位。
- 槽位只在 owner 审核后登记本地 AssetIndex；未审阶段维持明确占位。
- GPT 图像候选进入待审区；若严格匹配的本地项目素材存在，则优先给 owner 本地候选。

## 4.6 UI 呈现

- 现状实查：`life-standard-v1` 的 `buildLifeStandardHud` 只投影一条 50px 文本摘要（当前目标、日期、地点、时段、关系、背包串和两个时间按钮）。它没有任务全表、格状背包、可选角色档案页、UI 标签素材槽或可由数据声明的面板开关。
- 已定稿目标：`demon-castle-ui-demo.html` 定义浏览器全视口下的左上追踪任务、顶部世界状态、右上资源及 `J/I/C` 入口、右侧三类可收束面板、近身 `E` 提示。正式运行时仍须由共享 Life host 消费，不复制原型 DOM。
- 裁决记录（2026-10-14）：Owner 选择 A，将背包显示下沉为共享 Life Host 能力。第一单只实现严格 opt-in 的格状背包、只读物品投影与 render-local 开闭状态；不改变现有 `itemCatalog + playerInventory` 权威语义，也不先做任务全表、角色/装备属性或底栏快捷栏。
- 边界：任务状态机、背包权威状态、日期、关系、近身交互均继续消费现有 Life capability；不得以游戏层代码补 UI。共享 Host 的闭集布局/面板配置和 `art:` 标签槽由施工单约束，任何新 UI 控件仍需另走 PUI 缺口流程。

## 4.65 NPC AI

初版 NPC 不进行对手决策；使用 Life 日程、关系、对话与任务条件。无战斗 AI。

## 4.7 代码准入阶梯

| 规则 | 落级 | 说明 |
|---|---|---|
| 地图、资源、作物、建设条件 | L0 | 纯 Life JSON |
| 关系、对话、任务与解锁 | L1 | 现有 Life graph 组合 |
| 素材选择和审批 | L1 | 现有 AssetSlot / approval 管线 |

## 5. 确定性声明

- 随机源：第一版无内容随机；如后续加入，必须使用引擎种子 PRNG。
- 不需要多人同步；Life 的 tick、快照和存档保持现有确定性契约。

## 6. 评审记录

- 提交：Codex，2026-10-11。
- Lead 裁决：✅ 通过。现有能力完整表达第一版，无 capability gap。
