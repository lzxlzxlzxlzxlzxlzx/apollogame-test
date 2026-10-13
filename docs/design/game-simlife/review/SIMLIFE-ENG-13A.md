# Review 单 · `SIMLIFE-ENG-13A` 通用确定性 Life Quest / Story Graph

> 本单由施工方自做自验后提交。复查人必须独立复跑；本单只是导航，不是证据。

| | |
|---|---|
| 工单 | `SIMLIFE-ENG-13A`（owner 裁决 **A**） |
| 施工 | BDM程序（已在工单抢锁） |
| 复查 | ✅ 已独立验收（2026-10-09） |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 主改动面 | Life protocol/component/compiler/validator；`t2-life-quest`；dialogue choice outcome；registry/component map；Little Valley JSON/view/save；测试、创作契约与自证 |

## 一、实现摘要

1. `LifeGamePackage.quests` 新增严格 chapter→quest→node 数据图：稳定 id、initial/terminal、`locked|active|completed|failed`、整数 priority 与可选 exclusiveGroup。compiler 对 chapter/quest/node 规范排序并条件装配 `t2-life-quest`。
2. 闭集 condition 覆盖 always/and/or/not、flag、resource、calendar season/day/slot、inventory count、milestone completed、resource-node remaining；闭集 trigger 覆盖 game-start、calendar slot/day、applied life action、稳定 dialogue choice、harvest、gather。
3. 闭集 effect 覆盖 flag set/unlock、resource add、inventory add/remove、quest node state；关系值因仓内没有既有关系组件而按工单边界未伪造。完整批次先在影子背包与引用表预检，任一失败全批不写。
4. 同拍候选按 `priority DESC → questId → nodeId`；重复逻辑目标 fail-closed。相同 exclusiveGroup 只提交首名，其余候选同批置 failed 并记 one-shot receipt，后续 tick 不会补执行输家。
5. validator 关闭所有 quest 嵌套字段，校验引用、重复 id、initial/terminal、可达/死节点、循环 `loop:true + 显式出口`、非 initial 的 game-start、自锁与写冲突；dialogue option 可填稳定 id，重复 id 拒绝。
6. `LifeQuestState`、receipt 和 `LifeQuestProjection` 进入 snapshot/hash/save/autosave；DebugTrace 仅在有判断/拒收/提交时输出，单 tick 最多 decision/transition/commit 三条。
7. UI 只读 `LifeQuestProjection`，删除首次收获 flag 专属目标判断。Little Valley 数据图为：收获芜菁 → 选择镇长汇报 → 采矿；原 mine warp flag gate 继续由 quest effect 解锁。
8. `life-json-authoring.md` 已补 AI 可直接生成的词表、最小 JSON、引用/环/冲突/原子性/UI-AI 消费边界。

## 二、请独立逐条复核

| # | 核什么 | 建议复跑 | 施工方结果 |
|---:|---|---|---|
| 1 | 严格 JSON 与引用 | `life-quest-validation.test.ts`、`life-package.test.ts` | 未知字段、坏引用、重复 id、非 initial game-start 均拒绝 |
| 2 | 图审计 | `life-quest-validation.test.ts` | dead node、终点不可达、非法环、自锁、写冲突转红；全 loop 且有出口的环允许 |
| 3 | condition / trigger 词表 | `life-quest.test.ts` | 所有十类 condition 与六类 trigger 读取权威 World outcome |
| 4 | effect / 原子性 | `life-quest.test.ts` | Flag/Resource/Inventory±/NodeState；冲突、数量不足、累计容量不足均零半写 |
| 5 | 定序 / 互斥 / 幂等 | `life-quest.test.ts` | 倒序 manifest 一致；优先赢家稳定；输家 failed；重复 tick 不重复奖励 |
| 6 | snapshot / hash / restore / save | `life-quest.test.ts`、`save.test.ts` | state/projection/receipt/order/hash 往返一致；Little Valley 恢复 mine active 节点 |
| 7 | dialogue outcome | `dialogue.test.ts` | applied/rejected 结果含稳定 choiceId、index、from/to node；quest 消费一拍 outcome |
| 8 | Little Valley 完整链 | `game-simlife.test.ts`、`life-demo-package-json.test.ts` | 三节点、mine gate、背包/资源点/里程碑条件均走既有语义输入 |
| 9 | 注册 / 组件 / 定序图 | registry/component/declaration tests + system graph audit | registry 136 同步；component universe 217；manifest 199；Little Valley 27 systems 无环 |
| 10 | UI / 真渲染 | `src/ui/components`、UI audit、`self-check/shots/eng13a` | 5 段 file:// 真运行截图；3 档审计阻断项全 0；页面错误 0，浏览器与临时文件已清理 |
| 11 | 撤修验红 | 临时删除 mayor 汇报 option 的稳定 id | 锚点 `is the runtime package source...` 精确 1 红 / 2 skipped，报 `unknown dialogue choice id`；恢复后 1/1 绿 |

## 三、验证证据

- 最终 Quest/Life/Little Valley 定向集合：**11 文件 / 100 测试全绿**。
- UI components + Little Valley：**63 文件 / 511 测试全绿**；640×720、1060×760、1440×900 三档 audit 均 overlap 0、硬对比失败/警告 0、border-image 0。
- ESLint：本工单非生成 TS 文件 **PASS（0 warning）**。
- registry generator `--check`：**同步 136 条**；component universe **217 PASS**；component manifest **199/199 PASS**。
- Little Valley system graph：**27 systems / 无环 / SYSTEM-GRAPH PASS**；全库无重复 system id、无悬空边。
- `game-skill-audit game-simlife`：**AUDIT PASS / RATCHET PASS**；`docs-ref-guard` PASS。
- `align-count --game game-simlife --stage S4`：**✅52 / ⚠0 / ❌0**。
- 真浏览器访问 `file://` 临时 IIFE，完整跑过 harvest→report→mine→terminal→reload，生成 `self-check/shots/eng13a/` 5 图；页面错误 0，隔离 Edge 已关闭，`.quest-proof-tmp` / `.ui-audit-tmp` 已清理。

## 四、告警与边界

- 全库 `tsc --noEmit` 仍被既有 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts` 与 `src/launcher/game-runner.tsx` 类型错误阻断；最终输出没有本工单文件。
- `scripts/scoped-gate.mjs --run` 未执行，因为它内部调用 Git，而 owner 规则禁止 agent 执行任何 Git 命令；已手工执行不含 Git 的等价定向测试、生成物校验、系统图、lint、游戏审计、UI 审计与自证。
- 未改 `src/ui/**`、数据库、应用服务或 `pipeline.json`；未执行任何 Git / GitHub 操作。关系值 effect 未新增，因为当前仓库不存在可复用关系组件，按 owner 已裁 A 的首版边界明确留空而非用 flag 冒充。

## 五、独立复查重点

1. 请重点确认 exclusiveGroup 输家同批置 failed + receipt 是否符合“互斥分支只执行一个”的策划语义；这避免 game-start 或持续 outcome 让输家在下一 tick 补执行。
2. 请复核 Quest Commit 显式晚于 resource-apply、life-milestone、craft-recipe、weighted-spawn 的定序；Little Valley 真实子集无环，全局软环棘轮未扩大。
3. 请独立复跑累计背包容量不足用例；它是原子预检最容易漏的多 effect 接缝，施工版使用影子 Inventory 顺序模拟后再落真实世界。

## 六、独立复查结论（2026-10-09）

- 复查人：本会话策划，非施工主体 BDM程序。独立复跑任务图/严格 JSON/编译/对话/注册/组件/游戏/存档的 **11 文件 / 100 测试**，全部通过；恢复撤修后又复跑 JSON、quest、游戏和存档锚点 **4 文件 / 33 测试**，全部通过。
- 独立撤修：暂删 Little Valley 镇长汇报选项 `report-first-harvest` 的稳定 id；运行时 JSON 严格管道准确 **1 红 / 2 skipped**，以 `unknown dialogue choice id` 拒绝任务 trigger 引用。已精确恢复。
- 架构核查：条件只读权威 Life 组件，触发只消费 domain outcome，任务解释器在 Commit 统一以稳定排序处理；状态、receipt、projection 全部进入持久化组件。Little Valley view-model 只读 `LifeQuestProjection`，没有恢复 flag 专属 objective 判断。
- 结论：**PASS**。任务图能力已满足“模型生成 JSON、引擎解释剧情”的最小可用边界。另：真渲染截图暴露宽屏世界画布未填满主区域的问题，属于既有显示链体验缺陷，已另开 `SIMLIFE-DEMO-19`，不改变本 capability 的功能验收结论。
