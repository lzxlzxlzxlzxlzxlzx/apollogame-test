# Review 单 · `SIMLIFE-ENG-11` 状态驱动交互可供性

> 本单由施工方自做自验后提交。复查人必须独立复跑；本单只是导航，不是证据。

| | |
|---|---|
| 工单 | `SIMLIFE-ENG-11`（owner 判 **A**：通用 Life 引擎状态可供性） |
| 施工 | BDM程序（已在工单抢锁） |
| 复查 | **独立复查通过**（`review_eng11`；无 blocker / major） |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 主改动面 | `src/engine/protocol/components/life-activity.ts`；`src/skills/tier2/{life-activity,life-planting,life-talk}.ts`；对应测试；`src/assembly/declaration-audit.test.ts`；Little Valley 端到端测试；`docs/playbooks/events-logic.md`；工单台账 |

## 一、做了什么

1. `LifeActivityContext` 保留原有静态 `allowedActions` / nearby 语义，新增可快照的 `affordances`：严格闭集 action、target kind、available、unavailable reason 与排序后的播种候选 item ids。
2. 新增 Commit 相位 `life-affordance`，以稳定 id/字典序投影农田、作物、资源余量、NPC/对话会话与 warp access 终态，并用 opt-in `DebugTrace` 汇总 decision/reject/commit。
3. 作用系统仍是最终合法性门：播种现在硬性要求已浇水土壤；`life-talk` 重验 nearby target 与已打开会话，对话图推进仍由原 `t3-dialogue` 负责。

## 二、复查请逐条核

| # | 核什么 | 怎么自己验 | 施工方自验 |
|---|---|---|---|
| 1 | 原 `allowedActions` 没被偷换 | 跑 `life-activity.test.ts` 的 farm-state 用例，状态多次转换后比对原列表 | 保持不变 |
| 2 | schema 严格闭集 | 跑同文件 `fails closed`；伪 action 和 unavailable 缺 reason 必须报 error | 红/绿分支均有断言 |
| 3 | 农田状态链 | 跑 farm affordance 用例及 `life-planting` / `life-harvest` | 未翻土→till；tilled→water；watered empty→plant；dry crop→water；wet crop→`already-watered`；mature→harvest |
| 4 | 播种候选真来自持有物 | 候选顺序断言为 `seed.alpha`,`seed.zeta`；清空背包后变 `missing-seed` | 已覆盖 |
| 5 | 资源/NPC/warp 真状态 | 跑 `projects resource depletion...` 与 `life-talk.test.ts` | depleted、dialogue-open/session-conflict、locked/unlocked 均覆盖 |
| 6 | 同拍看到 effect 终态 | 跑真 input→action→farming 用例；till 后当 tick affordance 已是 water | Commit 投影通过 |
| 7 | 确定性 | 倒置 placement 实体创建顺序，比对 affordances 及 `hashSnapshot` | 逐字节一致 |
| 8 | trace 密度/无事静默 | 跑 trace 用例 | 有变化最多 3 条 decision/reject/commit；次 tick 无变化 0 条 |
| 9 | 定序与注册 | 跑 Life 全能力子图、registry check、declaration audit | 112 systems，无重复/悬空/子图环；registry 134 同步；Commit 相位基线已点名 |
| 10 | 测试不是假绿 | 把 wet-growing 分支去掉 `already-watered` 再跑带名用例 | 实测 1 红，恢复后 1 绿 |

## 三、请重点看三个取舍

1. **可供性是同一 `LifeActivityContext` 的动态分区，不是第二个组件。** 理由是消费者需要同一 actor/location 的原子快照，且现有 capability id 可兼容扩写。请核：是否有必要拆成独立组件/能力。
2. **终态投影放 Commit。** 它需同 tick 读到 farming/planting/growth/harvest/resource/talk 已落地的状态；系统只回写 ActivityContext，Life 真实共装子图无环。请核：这个相位语义是否合理。
3. **不可用对象仍保留 affordance，但带闭集 reason。** 这让 UI/AI 无需重跑规则就能呈现 depleted/locked/missing-seed/already-watered；静态 permission 仍独立保留。请核：禁用项与“只输出可用项”相比是否符合下游预期。

## 四、门禁与告警实情

- 施工方相关回归全绿；独立复跑的 Life / compiler / Little Valley 集合为 **12 文件 / 72 测试全绿**，协议 / 注册 / 系统图集合为 **6 文件 / 45 测试全绿**。ESLint、component manifest `194/194`、registry `134`、game-skill-audit / RATCHET 均通过。
- 全量 Vitest 实跑：**589 文件 / 5617 测试通过**；时尚报 12 文件的存量/并行失败（如 art-ledger root、pipeline board 缺失、game-g/game211 帧快照、capability companion-test 旧缺件、dialogue cycle-warning 旧基线）。其中本单引入的 Commit 相位基线红已同提交更新，独立复跑 `declaration-audit` **4/4 绿**；余下失败不涉及本单文件。
- `tsc --noEmit` / `npm run build` 被既有的 `game-dice` Label size、`game-theft` Label font 与 launcher mount 签名错误阻断；输出没有本单文件。
- `scripts/scoped-gate.mjs --run` 未执行，因为它会调用 Git，而 owner 规则禁止 agent 执行任何 Git 命令。已手动跑不含 Git 的对应测试、守卫、注册、子图、lint 与游戏审计。

## 五、已知未做 / 边界

- 本单没有改 `games/game-simlife/world-interaction.ts` 或 `src/ui/**`；新 affordances 的实际 UI 消费属下一张 demo 单。
- 没有启动/重启服务，没有修改数据库，没有执行任何 Git / GitHub 操作。

## 六、独立复查结论

- 结论：**PASS，建议策划验收**。
- 复查人独立核对协议、派生语义、最终合法性门、静态 `allowedActions` 兼容、稳定顺序 / snapshot hash、trace 密度与静默语义；真实 Life 共装子图为 112 个注册系统、24 个子图系统，无重复、悬空或环，且无 Life 告警。
- 撤修验红：复查人精确删除 wet-growing 的 `already-watered` 分支后，锚点用例如期 1 红（实际误变为 `available: true`）；同回合恢复后该用例 1 绿，未留下复查改动。
- 非本单阻断：全量 `tsc` 仍仅报 `game-dice`、`game-theft` 与 launcher 的既有错误；无 `SIMLIFE-ENG-11` 文件报错。
