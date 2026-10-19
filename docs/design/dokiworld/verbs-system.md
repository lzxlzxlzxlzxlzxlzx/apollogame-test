# DokiWorlds 动词体系与小游戏路线基线

- 记录日期：2026-09-29
- 用途：作为 ZeroCraft 后续小游戏选题、DokiWorlds 接入契约与宿主/小游戏职责划分的长期基线。
- DokiWorlds 真相源：
  - `frontend/src/free-roam/interactions.ts`
  - `frontend/src/free-roam/types.ts`
  - `frontend/src/free-roam/conflicts.ts`
  - `backend/app/content_schemas/v1/entity.schema.yaml`
  - `backend/skills/builtin/dokiworlds-action-design/SKILL.md`

## 1. 核心认识

`InteractionVerb` 是行动的**语义身份**，不是玩法实现。真正的机械结果来自 `ActionDefinition` 的条件、检定、小游戏/卡牌 resolution 与 effects。小游戏不能直接等同于某个 verb，也不能自行修改 DokiWorlds 世界状态。

正确边界是：

1. DokiWorlds 判断某项行动是否出现、目标是谁、玩家是否有资格执行。
2. 需要独立操作体验时，DokiWorlds 用一份有界、可验证的局内输入启动小游戏。
3. 小游戏只运行一局并返回结果或可复核的战报，不直接发奖励、改关系、推进任务或写存档。
4. DokiWorlds 校验结果并应用自身 effects，始终是世界状态的唯一权威。

## 2. v1 闭集动词（33 个）

| 分组 | 动词 |
| --- | --- |
| 交易 | `buy` 购买、`sell` 出售、`barter` 交换 |
| 礼物 | `give` 赠礼、`receive` 受赠 |
| 交际 | `persuade` 说服、`intimidate` 威吓、`deceive` 欺瞒、`bribe` 贿赂、`befriend` 结交、`apologize` 赔礼 |
| 隐秘 | `steal` 偷窃、`pickpocket` 扒窃 |
| 冲突 | `challenge` 挑衅、`attack` 攻击、`combat_round` 战斗、`spare` 放过、`execute` 处决 |
| 探索 | `investigate` 调查、`gather` 采集、`unlock` 开锁 |
| 服务 | `craft` 制作、`train` 训练、`rest` 休整 |
| 同行 | `recruit` 邀请同行、`dismiss` 结束同行 |
| 任务 | `escort` 护送、`rescue` 救援、`quest_accept` 接受任务、`quest_progress` 推进任务、`quest_turn_in` 交付任务、`quest_decline` 谢绝任务、`quest_abandon` 放弃任务 |

## 3. 哪些动词适合做成独立小游戏

独立小游戏应满足：输入能收敛为一局内的小型合同；玩法有明确开始和终局；结果可压缩为少量枚举/数值；不需要小游戏持有整个世界、任务图、人物记忆或知识图谱。

### 当前重点

| 路线 | 对应动词 | 裁决 |
| --- | --- | --- |
| 偷窃小游戏 | `steal`、`pickpocket` | 适合。独立局面、少量输入、清晰成功/失败；正在由另一 agent 制作。 |
| 通用卡牌交锋 | `persuade`、`intimidate`、`deceive`、`challenge`、`attack`、`combat_round`，以后可覆盖 `interrogation` 等冲突类型 | 适合。共用一套“目标进度—压力—专注—敌方意图”骨架，通过冲突类型、卡组与皮肤形成不同玩法语义，不为每个 verb 重做游戏。现有 `game-rhetoric-duel` 是起点。 |
| 掷骰判定 | 多种行动的 check，不直接绑定单一 verb | 适合作为通用判定小游戏/表现层；现有 `game-physics-dice` 可承担。 |
| 宝箱/QTE | 奖励揭示、开启动作，不直接绑定单一 verb | 适合作为独立展示/QTE；现有宝箱游戏可承担，但奖励仍由宿主决定。 |

### 可作为后续候选

| 候选 | 判断 |
| --- | --- |
| `unlock` | 很适合短局 QTE/机关游戏；输入只需锁具皮肤、规则档案或固定预设 ID，输出成功/失败。 |
| `barter` | 可做独立谈判/配价游戏，但若复用通用卡牌交锋即可表达，就不再立独立游戏。 |
| `craft` | 只有在形成真正独立的配方/操作玩法时才值得做；单纯选配方仍应留在 DokiWorlds。 |
| `gather` | 只有在采集动作本身有独立技术玩法时才值得做；普通资源领取不做小游戏。 |

### 明确不做成独立小游戏

- `investigate` 的调查推理主循环：线索、人物知识、世界状态、任务图和叙事上下文都由 DokiWorlds 掌握。若搬入独立游戏，输入面会膨胀成近似复制整个世界模型，因此调查推理由 DokiWorlds 自身负责。
- `quest_*`、`escort`、`rescue`：本质是世界任务状态迁移，不是孤立的一局玩法。
- `recruit`、`dismiss`、`give`、`receive`、`rest`：通常是短决策或状态操作；除非未来出现独立且可复用的玩法，不为动作动画制造小游戏。
- `spare`、`execute`：它们是冲突后的世界选择，应由 DokiWorlds 处理，不属于卡牌战斗内部终局动画的替代品。

## 4. 动词到小游戏的绑定原则

- 不建立“一动词一游戏”的硬编码表；ActionDefinition 应显式声明采用何种 resolution。
- 多个动词可以进入同一个通用游戏，例如说服、威吓、欺骗与战斗都可进入“通用卡牌交锋”，但使用不同 `conflictType`、牌组、敌方意图和美术皮肤。
- 同一动词也可按内容选择即时 effects、单次 check、DokiWorlds 内建卡牌交锋或外部独立小游戏。
- 小游戏只消费已经授权的一局输入，不自行查询 NPC、任务或玩家完整存档。
- 宿主图片是 render-only；规则不得依赖图片加载结果。
- 随机必须由固定 seed 驱动；终局回传必须幂等、可审计。

## 5. 当前产品决策

1. 将动词体系作为后续 ZeroCraft 小游戏选题的主索引。
2. 不立项“调查推理小游戏”；调查推理保留在 DokiWorlds。
3. 以 `game-rhetoric-duel` 为基础，设计一个可覆盖多种对抗语义的通用卡牌交锋游戏。
4. 通用交锋首先对齐 DokiWorlds 已存在的 `card_definition` / `conflict_definition`，避免宿主与小游戏维护两套近似但不兼容的数据语言。
5. DokiWorlds 与 App SDK 尚需一层“授权行动 → 局内输入 → 终局结果 → 宿主 effects”的桥；在该桥正式确认前，不把动词直接写进小游戏规则层。

## 6. 维护规则

- DokiWorlds 修改 `INTERACTION_VERBS`、Action resolution 或 conflict schema 时，必须同步更新本文。
- 新小游戏立项时先在本文说明它服务哪些 verb、为何不能由现有小游戏重组表达，以及最小输入/输出边界。
- 任何需要传入完整世界、任意脚本或任意 effects 执行权的设计，默认驳回并留在 DokiWorlds 内部实现。
