# Review 单 · `SIMLIFE-DEMO-13` 状态驱动世界交互消费

> 本单由施工方自做自验后提交。复查人必须独立复跑；本单只是导航，不是证据。

| | |
|---|---|
| 工单 | `SIMLIFE-DEMO-13` |
| 施工 | BDM程序（已在工单抢锁） |
| 复查 | **独立复查通过**（`review_eng11`；无 blocker / major / minor） |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 主改动面 | `games/game-simlife/{world-interaction,view-model,game-simlife,ui}.ts`、对应测试、`tools/audits/game-simlife.audit.ts`、工单台账 |

## 一、做了什么

1. 世界交互选项只消费 actor 的 `LifeActivityContext.affordances`。旧的 `allowedActions` 农务判断、package placement/warp 扫描、inventory `seed.*` 筛选均已从 `world-interaction.ts` 移除；游戏层只保留闭集标签、表现壳与语义输入映射。
2. available tile / placement / warp 分别映射为 `life.action`、`life.select-target → life.action`、`life.warp`；plant 子菜单只消费 `candidateItemIds`，映射为 `life.select-item → life.action:plant`。
3. unavailable affordance 只显示闭集 reason 的本地化状态，不参与 Tab 选择、Enter 确认或 E 直达。单一 available 叶子 E 直达；多项或 plant 递归项打开玩家锚定的小面板。
4. 控制器用 affordance id / availability / candidates 生成 source key；菜单打开期间目标消失、可用性变化或候选变化会自动关闭，防止确认陈旧动作。
5. 进行中的 dialogue 仍消费既有 dialogue 投影；新增 `dialogueTarget` 取自 `LifeDialogueSession.npcPlacementId`，避免切换到资源目标后把旧对话误当作该资源的交互菜单。
6. UI 仍为 LayoutNode + WorldUi2D 只读 presentation；无 Modal、无自由 DOM、无游戏 system、无 World 直写。顺带把审计发现的背包与菜单帮助文字硬性低对比修至非阻断。

## 二、复查请逐条核

| # | 核什么 | 独立验证建议 | 施工方自验 |
|---|---|---|---|
| 1 | 唯一动态数据源 | 构造 `allowedActions=['till','talk']`，但 affordance 仅 water available、talk `dialogue-open` | UI 只产 water；无 till；talk 不可确认 |
| 2 | 语义队列映射 | 跑 sole talk、plant、warp 用例 | placement 先 select-target；plant 先 select-item；warp 直发 |
| 3 | unavailable 不可执行 | 跑 depleted / locked 用例并检查节点 | 无 E、无 actions、Enter 返回空，仅显示 reason 文案 |
| 4 | 动态刷新关闭 | 打开两项菜单后把 till 换成 water、talk 变 unavailable | reconcile 自动关闭 |
| 5 | 真实农田链 | 跑 `drives the full farm E flow...` | till→water→plant 子菜单→成长 water→harvest，全程重读 affordances |
| 6 | NPC / 资源 / warp | 跑 game acceptance | talk 打开后不再发 talk；berry 耗尽显示 depleted；mine locked/unlocked 正确 |
| 7 | LayoutNode / 世界只读 | 跑 world-interaction 与 UI components；比较 snapshot | validate 零 issue，无 Modal / DOM，snapshot 不变 |
| 8 | UI 实测审计 | 使用系统 Edge 运行 `tools/ui-audit.mjs tools/audits/game-simlife.audit.ts` | 0 overlap、0 hard contrast、0 border-image blocker；退出 0 |
| 9 | 反向证明 | 临时把 affordance 投影改为空数组，跑矛盾数据源锚点测试 | 准确 1 红；恢复后 1 绿 |

## 三、门禁与证据

- Little Valley + ENG-11 连带回归：**12 文件 / 79 测试全绿**。
- UI components：**62 文件 / 493 测试全绿**；本单节点自身 `validateLayoutNode` 零 issue。
- UI audit：使用 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` 作为短生命周期隔离 Chromium；**0 重叠、0 硬性低对比、0 条 3–4.5 警告、0 border-image 缺前提，退出 0**。审计浏览器已关闭，`.ui-audit-tmp` 已清理。
- ESLint（全部改动 TS / audit 文件）PASS；component manifest `194/194` PASS；game-skill-audit / RATCHET PASS；docs-ref guard PASS。
- 真实 Little Valley 能力子图：112 个注册系统、23 个共装系统，无重复、悬空或环，PASS。
- 全量 `tsc --noEmit` / `npm run build` 仍仅被既有 `game-dice` Label size、`game-theft` Label font 与 launcher mount 签名错误阻断；输出没有本单文件。

## 四、撤修验红

- 锚点：`world-interaction.test.ts` 的 `uses affordance availability instead of contradictory authored allowedActions`。
- 撤修：临时将 `buildLifeInteractionOptions` 的 affordance 投影改为返回空数组。
- 结果：该点名用例准确 **1 红**，期望 water available + talk unavailable，实际为空；同回合恢复 `view.affordances.map(optionFromAffordance)` 后该用例 **1 绿**，最终回归为 12 文件 / 79 测试全绿。

## 五、边界与已知项

- 没有修改 `src/ui/**`、美术、数据库，也没有启动/重启服务或执行任何 Git / GitHub 操作。
- `ui-audit` 的华丽度探针报告 1 处 shape、未识别 house theme；实际运行与 audit fixture 均显式传 `STARTER_THEME`，该项为非阻断探针结果，本单未新建主屏或主题。
- 世界 E 菜单不再夹带 `life.advance-day`：该动作没有 ENG-11 affordance，继续放入会重新形成第二套“能够交互”判定；日历推进不属于本单的世界对象 affordance 映射。

## 六、独立复查结论

- 结论：**PASS，建议策划验收**；blocker / major / minor 均无。
- 独立复跑 Review 点名集合 **12 文件 / 79 测试**、UI components **62 文件 / 493 测试**、UI delta **2 文件 / 26 测试**，全部通过；点名 ESLint、component manifest、game-skill-audit / RATCHET、docs-ref 均 PASS。
- 独立 UI audit 为 0 overlap、0 hard contrast、0 warning、0 border-image blocker；真实 compile capability 子图为 112 个注册系统、23 个共装系统，无 duplicate / dangling / cycle。
- 独立撤修将 `world-interaction.ts` 的 affordance 投影临时置空，矛盾数据源锚点准确 1 红；同回合精确恢复后 1 绿并全文件 14/14，未留下复查改动。
- 复查确认动态路径只有 `view.affordances.map(optionFromAffordance)`；不存在 `allowedActions`、package、inventory、crop/resource/warp 的 UI 重判，unavailable、语义队列顺序、dialogue target 与 refresh auto-close 均符合工单。
