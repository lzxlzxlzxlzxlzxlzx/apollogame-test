# game-rhetoric-duel → 通用卡牌交锋：DokiWorlds 对齐评估

- 状态：策划评估完成；尚未进入程序施工。
- 基准日期：2026-09-29
- 目标：保留当前言弹交锋的成熟 UI、卡面和动画，将规则层扩为可承载多种 DokiWorlds 对抗语义的独立类《杀戮尖塔》小游戏。

## 1. DokiWorlds 当前如何实现“战斗交锋”

DokiWorlds 现有两套不同层级的冲突实现，不能混为一谈。

### A. 轻量 NPC 战斗

真相源：`backend/app/creator/combat.py`。

- 作者配置 `duel | lethal`、单次 check、胜负文本、失败后撤退/死亡、关系变化和是否允许处决。
- 编译器生成 `challenge/attack → combat_round → spare/execute/retreat` 行动链。
- 规则明确写着“不要生成 HP 或敌方 AI 回合”。一次 `combat_round` 检定后就进入胜负结果。
- 适合叙事世界中的轻量冲突，不是我们要扩展的类《杀戮尖塔》玩法。

### B. 声明式卡牌交锋

真相源：

- `frontend/src/free-roam/conflicts.ts`
- `backend/app/rules/conflicts.py`
- `frontend/src/free-roam/ui/CardConflictView.tsx`
- `frontend/src/free-roam/ui/useConflictPresentation.ts`
- `backend/tests/test_card_conflicts.py`

这套系统已经完整实现：

- `card_definition`：来源、费用、描述、反应、美术、资格条件、进度/压力/防御影响、条件奖励、物品消耗。
- `conflict_definition`：冲突类型、目标、进度目标、压力上限、初始防御、回合上限、部分成功阈值、专注、起手/每回合抽牌/手牌上限、卡组、对手意图与终局效果。
- 冲突类型闭集：`persuasion | theft | combat | deception | intimidation | interrogation | stealth | investigation | special`。
- 指令闭集：`start | play | end_turn | retreat | ack`。
- 服务端确定性洗牌、牌堆/弃牌堆、卡牌资格与消耗验证、专注支付、进度/压力/防御结算、循环敌方意图、成功/部分成功/失败/撤退、结果回执与幂等。
- 演出只播放已提交快照。当前相位为 `camera → reveal → draw → ready`，出牌为 `play → impact → response → ready`，回合结束为 `round-end → enemy → impact → round-start → draw → ready`。

结论：我们要做的“通用战斗交锋”并非空白立项；它应成为 DokiWorlds 这套卡牌冲突语义的独立高表现执行端。

## 2. 当前言弹游戏与 DokiWorlds 的对应关系

| 当前 `game-rhetoric-duel` | DokiWorlds 卡牌交锋 | 对齐情况 |
| --- | --- | --- |
| `progress` | `progress` | 已对齐 |
| `pressure` | `pressure` | 已对齐 |
| `focus` / `focusPerTurn` | `focus` | 已对齐 |
| `target`、`pressureLimit`、`turnLimit` | 同名规则 | 已对齐 |
| `openingHand`、`drawPerTurn`、`handLimit` | 同名规则 | 已对齐 |
| 有序 `intentions` | `opponent.intentions` | 基本对齐 |
| 内部版本化 `cardId` 目录 | 任意声明式 `card_definition` | 尚未对齐 |
| 仅 `modify-resource(progress/pressure/focus)` | `progress/pressure/defense`、条件 bonus、eligibility、consume | 当前表达面较窄 |
| 终局 `win/loss/exited` | `success/partial/failure/aborted` | 需要扩充映射 |
| 无 `conflictType` | 九类 `conflict_type` | 需要增加表现语义 |
| 无初始/动态 defense | `defense` | 需要规则裁决和能力实查 |

当前游戏的骨架与 DokiWorlds 高度一致，UI/动画也已经投入大量打磨。泛化应当保留该表现层，替换“言弹专属命名与窄合同”，而不是另建一个新游戏目录。

## 3. 推荐产品形态

暂定产品名仍可保留 `game-rhetoric-duel` 作为迁移期 ID；对外名称改为“战斗交锋”或另行裁决。第一阶段不做地图、局外成长、遗物、商店或连续爬塔，只做**一场可独立调用的卡牌遭遇**。它是“类杀戮尖塔的战斗单局”，不是完整的《杀戮尖塔》复刻。

第一阶段建议开放 `persuasion | intimidation | deception | combat | interrogation | special`。虽然 DokiWorlds 内部 schema 还列有 `theft | stealth | investigation`，但它们不等于都要由本游戏承接：实际偷窃动作继续使用正在开发的独立偷窃游戏；调查推理留在 DokiWorlds；潜行待未来单独评估。卡牌交锋只可表现这些行动前后的“对抗”，不能取代其专属操作玩法。

一局应支持：

1. 冲突类型决定标题、术语、色彩、反馈文案与默认特效，但不改变底层确定性规则。
2. 玩家使用卡牌推进目标、控制压力/防御并管理每回合专注。
3. 敌方按宿主给定的有序意图行动；第一阶段不引入游戏内 AI 选招。
4. 达到目标为成功；压力超限为失败；回合耗尽按阈值判定部分成功或失败；玩家可撤退。
5. 终局立即冻结局内输入，由宿主决定后续剧情、奖励、关系和任务变化。

## 4. 输入/输出建议

### 宿主输入（只含一局）

- 会话身份：`sessionId`、`encounterId`、contract/version。
- 冲突语义：`conflictType`、标题、目标文本。
- 确定性：固定算法标识与 seed。
- 规则：target、pressureLimit、defense、turnLimit、partialThreshold、focus、openingHand、drawPerTurn、handLimit。
- 卡组与卡牌：闭集、严格校验的声明式卡牌数据或受支持目录引用。
- 对手：展示名、立绘/背景 URL、有序 intentions。
- 仅用于本局的资格判定结果；不得把完整角色、任务、知识图谱或存档传入游戏。

### 小游戏输出

- `outcome`: `success | partial | failure | aborted`。
- 可选审计摘要：终局 progress/pressure/defense、回合数、已打出的卡牌 ID 序列、输入合同版本与 seed。
- 不返回也不执行 DokiWorlds effects；不发奖励、不改关系、不推进任务、不写宿主存档。

### 权威边界

当前 DokiWorlds 内建卡牌交锋是服务端逐步权威，而现有 App SDK 更接近“启动一次、返回一次结果”。因此外置后推荐：小游戏确定性运行并返回可复核 receipt，DokiWorlds 用相同合同校验/重放后再提交世界 effects。若未来 SDK 提供逐步 RPC，才考虑每次出牌都由宿主提交快照；第一阶段不为不存在的 RPC 过度设计。

## 5. 需要 owner 裁决的内容合同

现有能力实查结果：

- ZeroCraft 已有 `t2-identity-card-play`、`t2-identity-card-input`、资源、流程、条件、闭集效果与 committed-transition，足以承载当前言弹目录。
- DokiWorlds 的卡牌却允许每个世界声明自己的名称、描述、来源、资格条件、条件奖励和物品消耗；只传固定 `cardId + copies` 无法无损消费现有内容。
- 在游戏层为每个 DokiWorlds 卡牌写 `if/switch` 不成立，也不允许传脚本执行。

因此存在两条产品路线：

### A. 仅使用 ZeroCraft 预设卡牌目录

DokiWorlds 只传目录版本、`cardId + copies` 和遭遇规则。

- 优点：最可控、最容易保证平衡和美术一致；沿用当前合同即可。
- 代价：DokiWorlds 现有世界自定义 `card_definition` 不能直接进入游戏；必须先映射到有限预设卡，表达力和世界个性下降。
- 选错代价：后续若仍要兼容 DokiWorlds 自定义牌，会再做一次合同迁移。

### B. 接受详细但严格闭集的声明式卡牌（推荐）

输入允许传完整卡牌定义，但字段、条件和效果全部使用版本化闭集 schema；不接受脚本、HTML、任意表达式或宿主 effects。ZeroCraft 的通用身份卡能力负责解释。

- 优点：能与 DokiWorlds 当前 `card_definition` 一一映射；仍是可校验数据，不是把执行权交给宿主；同一游戏可真正服务多种世界与冲突类型。
- 代价：需实查现有 `ConditionExpr` 与效果闭集能否覆盖 eligibility、bonus、consume、defense，并为不能覆盖的部分走正式缺口裁决。
- 选错代价：schema 若照抄过宽，会让独立游戏背负不必要的世界语义；因此只应接收宿主已经求值后的局内条件或最小条件闭集。

推荐 **B**，同时把当前 10 张言弹牌保留为内置 starter catalog 和离线演示内容。该选择在进入程序施工前仍需 owner 明确裁决。

## 6. 建议施工阶段（裁决后执行）

1. **合同对齐**：冻结 `generic-conflict-input/1` 与 result/receipt；写 DokiWorlds schema 到 ZeroCraft schema 的逐字段映射与拒绝规则。
2. **能力实查与缺口裁决**：针对 defense、eligibility、bonus、consume、partial outcome 逐项查 registry/手册；能重组就重组，真缺口按 A/B 协议由 owner 决定是否下沉通用能力。
3. **规则泛化**：去除 rhetoric 专属类型名，保留现有确定性牌堆、资源、流程与 trace；不得以 `conflictType` 或 `cardId` 写专属分支。
4. **表现皮肤化**：言弹、战斗、偷窃等只通过词汇、主题、卡面、角色动作和特效皮肤区分；复用现有成熟动画控制器。
5. **兼容迁移**：把现有三场言弹 encounter 转成通用合同 fixture，确保旧玩法和视觉不退化。
6. **宿主桥接**：DokiWorlds 授权 action 后启动 App，验收 result/receipt，再由 DokiWorlds 应用 effects；小游戏保持世界无知。
7. **独立验证**：确定性、非法输入、资源不足、动画不驱动规则、终局幂等、部分成功/撤退、宿主图片 fallback、1440×900 与嵌入尺寸 UI 验收。

## 7. 明确不在第一阶段做

- 完整爬塔地图、连续多场战斗、局外牌组成长、商店、营火、遗物、永久存档。
- 小游戏读取完整 DokiWorlds 世界状态或自行执行任务/关系/奖励 effects。
- 调查推理主循环。
- 随机敌方 AI；敌方意图先使用宿主提供的确定性序列。
- 为每一种 verb 制作独立规则分支或独立游戏。
