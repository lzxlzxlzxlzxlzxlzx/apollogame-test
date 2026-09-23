# game-rhetoric-duel｜能力计划

- 状态：**CAPGAP-RHETORIC-001、002 均已完成并独立复查；内部游戏迁移按 W0–W8 施工单推进。**
- 结论：身份牌目录、输入映射和已提交转场均已有通用能力；游戏层只提供配置与消费接线。

## 1. 规则数据与解释责任

| 规则数据 | 解释责任 | 现有能力/状态 |
| --- | --- | --- |
| `progress`、`pressure`、`focus` 等命名资源 | 通用资源读写 | `f1-resource` 可消费 |
| 回合相位、终局转换、条件触发 | 通用流与事件条件 | `t3-flow`、`t2-event-when` 可消费 |
| 资源变化的闭集写入 | 通用效果应用 | `t2-effect-apply` 可消费，需按其现有目标/相位契约配置 |
| 洗牌、抽牌及任何随机选择 | 种子随机服务 | `w1-random` 可消费；禁止 `Math.random()` |
| 牌堆/手牌移动 | 通用牌区能力 | `t2-card-pile`、`t2-card-play` **仅部分相关，不能直接采用为言弹效果解释器** |
| UI action 到身份牌命令 | 通用输入映射 | `t2-identity-card-input`；闭集 `InputQueue` 路由，不含游戏专属解释器 |
| 已提交状态到 render-only 转场 | 通用演出投影 | `committed-transition`；不写世界、不参与 hash |
| 宿主 input / SDK 结果 | 未来 DokiWorlds 薄适配层 | 内部游戏不依赖 SDK；适配层只做验证、映射与结果返回 |

## 2. 实查记录

### 已查能力

- `src/skills/tier2/card-pile.ts` 的 `t2-card-pile` 使用传统牌码（`suit * 100 + rank`）及手牌索引，职责是牌堆、手牌与已出牌的移动/补手。
- `src/skills/tier2/card-play.ts` 的 `t2-card-play` 同样将数值牌码放入 `PlayedHand`；它没有“任意 `cardId` 查表后执行不同闭集效果”的契约。
- `src/skills/atoms/resource/index.ts`、`src/skills/tier2/event-when.ts`、`src/skills/tier3/flow.ts`、`src/skills/tier2/effect-apply.ts` 分别提供资源、条件、流程与闭集效果的通用基础。

### 为什么不能只重组现有牌区能力

本游戏的基本单位是版本化 `cardId`，每张言弹需由数据声明其不同的资源效果与条件。把所有卡牌在游戏层逐张 `if/switch` 后再调用资源能力，会重新制造原型 demo 那种游戏专属解释器，违反数据驱动边界；把名字硬编码为数值牌码也无法给出效果映射来源。因此现有能力不能完整表达这个规则。

## 3. 已完成的通用能力

### CAPGAP-RHETORIC-001：声明式身份卡牌效果与输入映射（**已完成**）

新增一个可跨卡组游戏复用的引擎 capability：它消费“牌定义目录 + 卡牌实例/牌区 + 闭集效果表 + 明确时序”，在打出 `cardId` 时以确定性方式验证、扣除成本、应用闭集效果并产生可审计事件。游戏只提供目录和遭遇数据。

- 代价：需要引擎施工、能力注册、确定性/快照/trace 测试与跨游戏审查；范围比本游戏大。
- 收益：适用于未来任意非扑克、带卡牌身份与效果的卡组玩法；规则真正留在数据中。
- 选错代价：若抽象过宽会形成难维护的万能效果语言，必须以严格闭集词表和最小契约约束。

### 路径 B：允许游戏专属逻辑例外（不推荐，须 owner 批准）

以 TS 卡带或游戏层逻辑写一个 `cardId → effect` 解释器，并登记例外债务。

- 代价：同类游戏会复制解释器；新卡需改代码，策划数据不能独立表达规则，且更难审计与复用。
- 收益：可较快验证这一款游戏的卡感，短期改动面较小。
- 选错代价：若后续确认此类卡牌模式通用，再下沉能力会经历重复重构及内容迁移。

owner 已选择 **A**。`t2-identity-card-play` 现消费版本化目录、身份牌区和闭集资源效果；`t2-identity-card-input` 将闭集 UI Signal 映射为 `IdentityCardCommand`。两者均 fail-closed、带 debug trace，且无 `cardId` 专属分支。施工与独立撤修复查见 [CAPGAP-RHETORIC-001 review](review/CAPGAP-RHETORIC-001.md)。

### CAPGAP-RHETORIC-002：已提交转场投影（**已完成**）

`committed-transition` 将已提交的 `{ before, after, kind, delta }` 映射为 render-only 闭集阶段；跳过和 reduced-motion 直接对齐已提交后的状态，既不重算规则也不写入模拟。施工与独立撤修复查见 [CAPGAP-RHETORIC-002 review](review/CAPGAP-RHETORIC-002.md)。

## 4. 非缺口设计约束

- 对手意图 v1 是宿主提供的有序脚本，`intentions.length >= turnLimit`，不构成 AI；若改为按状态/权重选择，先补 AI 设定并使用行为树/状态机等现有能力。
- UI 必须使用 LayoutNode 数据与现有主题/成熟件；不手写 React/DOM。背景、对手立绘及局内特效分别通过资产消费槽和渲染组件接线。
- 游戏逻辑开启 debug trace 时，应能从 `decision`、`transition`、`reject`、`commit` 重建一局的出牌与终局原因；关闭时必须 no-op。
- DokiWorlds 适配器只验证/映射/返回结果，不得吸收局内规则。

## 5. 实现前检查清单

- [x] owner 已选择 `CAPGAP-RHETORIC-001` 的 A（2026-09-22）。
- [x] 身份牌目录、闭集效果、闭集输入映射及独立复查已闭合。
- [x] 已提交转场投影及独立复查已闭合。
- [ ] 言弹目录、闭集效果词表、三份遭遇数据表已按 W1 严格验证。
- [ ] DokiWorlds input/output 契约获宿主确认。
- [ ] 程序 agent 开工前按相应生产线阅读 UI、卡牌、随机、事件、资源、资产手册，并建立测试与对齐验收。
