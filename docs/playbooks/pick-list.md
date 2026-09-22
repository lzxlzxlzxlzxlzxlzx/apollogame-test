# 按玩法选件（pick-list · 决策树一页）

> 8/4 大评审 Q1 消费路径件（2026-08-10）。开新游戏/新玩法：先在本页把玩法映射成**基座件实名**，再去对应线手册接线。
> 能力实名 = capability-registry 注册名（describe/examples = 机读真相，全量导出 `scripts/dump-capability-catalog.mjs`·须 vite-node）；标「纯函数核」= 非 capability 的确定性内核（先例 `src/skills/tier2/dice.ts`）。
> 素材源 = tier2/tier3 目录注释（`src/skills/tier2/index.ts` · `src/skills/tier3/index.ts`）——本页只做「玩法→件」的最后一公里，不手抄字段表。

## 决策树：你的玩法是——

**牌桌类** → 手册 `docs/playbooks/cards.md`
- 牌库/手牌/发补弃 → `card-pile`；出牌输入接缝（lockstep 可多人）→ `card-play`
- 判型计分（Balatro 域）→ `poker-hand` + 逐张计分/重触发 → `card-scoring`
- 出牌压制/合法应对（掼蛋/斗地主/跑得快）→ `hand-pattern`（matchPattern/beats/legalResponses）
- 老虎机/连线赔付 → `slot-payout` + 掷轮 `dice-roll`

**消除/拼板/合成类**
- 三消（交换/找连/重力/补块）→ `match3-board`；滑动交换输入 → `match3-drag-swap`
- 方块拼放（Block Blast/Woodoku）→ `block-grid` + 方格拖放 `grid-drag-square`
- N 换 1 升星/进化 → `merge-rule`；棋盘放置合成 → `merge-on-place`；配方 → `craft-recipe`；订单交付 → `order-fulfill`

**动作/生存类（波次）**
- 波次刷怪调度 → `spawn-director`（纯函数核）；真生成 → `prefab`（SpawnRequest 展开）；加权抽模板 → `weighted-spawn`
- Roguelite 三选一升级 → `draft-offer`（纯函数核）；被动加成 → `modifier-stack` 聚合 + `stat-bind` 接线到组件字段
- 索敌/追逐 → `aggro` + `steering`；弹道 → `launch`（跳弹 `bounce-relay` · 环绕 `orbit-motion` · 吸附 `pull-anchor`）
- 命中/伤害/死亡 → `hitbox` + `mortal` + `stats`；持续伤/DoT → `over-time`

**棋盘/战棋类**
- 六边格 A* + 逐格移动（自走棋/战棋/塔防）→ `grid-move`；拖拽摆子 → `drag-place` + 席位 `tray` / 排队递补 `queue-slots`
- 连续空间寻路（NavGraph 航点图）→ `pathfind`；固定巡逻/传送带轨 → `path-follow`
- **大量单位奔同一处**（RTS 行军/怪潮）→ `flow-field`（铺一次全场共享·比 A*-per-agent 每 tick 快两个数量级）；别互相叠 → `FlowAgent.separation`（软）/ `FlowAgent.orca`（强·贵 8×·二选一）——四选一分诊表见 `movement-pathfinding.md`
- 同时决策 × 收益矩阵（猜拳/博弈结算）→ `matrix-duel`

**剧情/VN 类**
- 对话图推进（台词/选项/检定/好感）→ `dialogue` + UI 三件闭集控件 dialog/choiceList/portrait（`docs/playbooks/ui.md`·禁手写 React）
- 幕/回合/阶段流程状态机 → `flow`（声明式 GameFlow 数据·与 dialogue 同构）

**通用横切件（各类都用）**
- 随机（唯一合法源）→ RandomSeed + `dice-roll` / `weighted-pick`（纯函数核）/ seededShuffle（`docs/playbooks/randomness.md`·裸 Math.random=审计红旗）
- 条件→事件→效果 → `event-when` + `effect-apply`；本实体自治域 → `self-rule`；按 Tag 集合计数（羁绊/人口）→ `group-count`
- AI：决策树 → `behavior-tree`（五节点闭集·叶走注册表）；信号→按数据放技能 → `caster`
- NPC 记忆（会淡忘 / 会被传开 / 要检索）→ `memory`（整数打分 top-K·`shareMemory` 打折转述）；**只数计数**用 `resource` 台账就够，别上 memory
- 外部 LLM / 远端服务当 NPC 决策者 → `services/npc-agent` 的 `NpcAgentPort`（`NullNpcAgentPort` = 无网 CI 与断网降级）+ **必配** `intent-barrier`（乱序回包 → 按 id 升序一次性注入·超期按整数回合数补默认动词）——只接端口不接门 = 不确定性直漏 sim，细则见 `opponent-ai.md`
- HUD：数字 → `text-binding`；血条/读条 → `gauge`；演出编排（第 N tick 发什么）→ `timeline`

## 查不到怎么办（唯一合法姿势）

1. **先实查**：本页 + 对应线手册（`docs/playbooks/index.md`）+ registry describe——重组得出来就用重组（缺口裁决协议第①步）。
2. **真缺口** → capgap 快速通道：`scripts/capgap.mjs`（`add --title "…" --need "…（附实查原文）"`·台账 `.zerocraft/cap-gaps.jsonl`·下沉仍走 Lead 裁决）；或 `docs/workflow/requests.md` 主池立单。
3. **绝不静默自造**：游戏层手写解释器/React 屏/自由 DOM/裸随机 = 审计红旗——`scripts/game-skill-audit.mjs` 已接推送门（scoped-gate 碰 games/** 即跑）。
