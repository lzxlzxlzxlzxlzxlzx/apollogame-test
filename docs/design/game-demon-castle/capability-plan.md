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
| Life host presenter / interaction / input / HUD | 原型中的近身 `E` 提示、递归菜单与状态栏 | ✅ 现有 |
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

- 宿主：`life-standard-v1` HUD 与交互菜单；正式 UI 由共享 Life host 消费，不复制原型 DOM。
- 目标层级：顶部状态栏、近身 `E` 提示、角色旁递归小菜单、左侧目标摘要。

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
