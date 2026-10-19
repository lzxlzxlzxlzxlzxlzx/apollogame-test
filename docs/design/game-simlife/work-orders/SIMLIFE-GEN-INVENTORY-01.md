# SIMLIFE-GEN-INVENTORY-01｜生成流程背包内容切片

施工主体：**BDM程序**  
状态：**返修完成，待独立复查（2026-10-14）**

## 目标

在现有 `LifeGenerationBundle v1` 的权威 `itemCatalog + playerInventory`、素材槽闭包与确定性校验之上，单向派生严格、只读、JSON 可往返的 `LifeInventoryReview v1`。它必须让 Actors 阶段的人审明确看到容量、初始物、稳定目录、可追溯来源与图标素材槽状态；不得新造第二份 runtime inventory 或改变存档/玩法协议。

## 写死边界

- review schema/version closed；非法 Bundle 只能返回严格 diagnostics，不得产出绿色审阅表。
- row 按 item catalog 稳定序，包含 `id/title/kind/skinKey`、starter 数量、来源摘要与精确 AssetSlot consumer/状态。
- 来源至少覆盖 starter、crop seed/product、resource drop、construction material；无来源显式 `catalog-only`，不猜测。
- item `skinKey` 必须由精确 JSON pointer 的 AssetSlot consumer 覆盖；不得出现孤儿/虚构图标行。
- starter 未知 item、容量/maxStack 越界、非法 source 引用与 input hash drift 均须路径级拒绝。
- Actors owner-review 增加 inventory-review checkpoint；owner pending 时不得进入 Plot/Assets。
- `inventoryPanel` 只属于 Host opt-in；Brief 声明使用时才建议/要求 host descriptor 接入，不写入 Life package。
- 不生成、审批或物化素材；不改 `src/ui/**`、存档协议或游戏私有逻辑。

## 验收锚点

1. Little Valley fixture 与 Demon Castle candidate 正向 review。
2. resource/crop/construction/starter/catalog-only 稳定归因。
3. 缺 item slot、starter 未知/越容量、非法来源、hash drift 路径级失败。
4. 原有 GenerationBundle 严格校验、compile、snapshot/hash/restore probe 不变。
5. Prompt Packet 2、Generation Brief、workflow/SOP/skill 文本与 review checkpoint 同步。
6. validator/builder tests、Bundle 回归、tsc/lint、docs refs/context budget；自检含唯一锚点撤修验红。

## 架构判断

接受。现有 Bundle 和视觉引用收集已提供权威输入，本单只应补“可审派生物 + 更严格的来源/槽位闭包 + 串行 checkpoint”，不得扩宽 runtime 模型或复制 inventory 数据。若现有字段无法表达来源，只能从既有 crop/resource/construction/starter 引用反向归因；任何推测性来源必须拒绝。
