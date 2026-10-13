# 月影魔王城：世界切片 v1

审阅对象：`world.life.json` 与 `world-map.html`。

## 已固定的空间事实

- 起点在 `moon-courtyard`（月影庭院）。这里同时拥有可耕作花园、王座厅、温室遗址、通向森林的拱门和通向地底的阶梯。
- `moonshadow-forest`（月影森林）是采集区域，和庭院形成一对一的双向传送闭环。
- `undercrypt-workshop`（地底工坊）是采矿区域，和庭院形成一对一的双向传送闭环；熔炉核心、封印库均已预留静态锚点。
- 每场景为 20×14 格，三层 RLE 解码均为 280 格；玩家出生点与每个传送点均为可行走格。
- 镜头逻辑使用 16×10 格视口、2 格安全边距与 20% dead zone，符合“玩家进入安全区外才平移；地图边缘则不再平移”的既定交互方向。

## 本关明确未做

NPC、资源节点、作物、建设项目的状态、剧情解锁、图片槽与真实图片均不在本切片。建筑的 `skinKey` 只是将来素材槽的稳定消费键；尚未注册、生成、批准或写入任何正式素材。

## 验证记录

已用现有 `validateLifeGamePackage` 和 `compileAndParseLifeGamePackage` 复验：通过，无诊断。

下一关只有在 `world.gate.json` 的 `ownerDecision` 获批后才会开始：为两名 NPC、可采资源、可种作物与玩家视觉建立 Actors 切片。
