# SIMLIFE-QUEST-PANEL-01｜施工自检

施工主体：BDM程序  
日期：2026-10-14  
结论：施工自检通过；只申请进入独立复查，不代签 review 或 Owner 人门。

## 架构与范围

- 复用 `LifeQuestCatalog + LifeQuestProjection`，presenter 只做稳定 join；没有新增任务 system、条件解释器或游戏私有 TypeScript。
- `questItems` 按 `chapterId → priority(desc) → questId` 稳定排列，状态、进度、标题与下一目标均来自权威目录/投影；空目录返回空数组。
- `trackedQuestId`、Drawer 开关只存在于 `mountLifeGame` 闭包；没有组件、World 写入、存档字段或网络动作。
- `questPanel` 是可省略的严格 descriptor 闭集；只含 `enabled/titleLabelKey/defaultTracking(first-active|none)`。
- UI 仅使用既有 LayoutNode `Drawer/Panel/Label/Badge/ProgressBar/Button`；没有修改 `src/ui/**`、自由 DOM/CSS 或新增素材。
- 魔王城只修改候选/正式 Host descriptor；`life.json` 任务图和素材状态未因本单改变。

## 功能实证

- presenter 点名覆盖 active/locked/completed 与空任务目录，首个 active 默认跟踪，显式跟踪可切换到另一条可见任务。
- Host 集成点名覆盖指针/J 打开、显式关闭/Escape 关闭、点击追踪、按住移动时 J/E 不清方向；快照、ordered hash、persistent hash 和保存 payload 前后相同。
- descriptor 点名覆盖缺省兼容、合法闭集、未知字段、非法枚举/类型与 prototype 输入的路径级拒绝。
- `validateLayoutNode()` 对任务 Drawer 返回零 issue；无活动任务和无可见任务均有显式空态。
- Demon Castle discovery/真实挂载验证首章 `quest.restore-moonshadow` 的“点亮王座厅 / 收集月木与影矿…”投影与 J 入口。

## 受控物化

- 零写入 `--plan-update`：conflicts `[]`，confirmation `sha256:521b21a9eaf7a28fe022b395ed5a5ec32533e5ae0ea2b97eda858fb6cda6175e`，旧四文件 hash `sha256:d6dd2f2d371ebb1b1725c38b9f05c97a13e1a117c023ec6d25c614327c7e11a1`。
- 严格 `--update` 成功，目标四文件 hash `sha256:e8cff6c501e2f4fded56dce5f08d904e7e34d5ab4d0b128cb243033d83e535ca`；正式 `life-host.json` 为 `sha256:f729ecf89e474a771da7e5e466d023bf53c8c60ab478739a76823f2a5080e178`。
- 写后重读、descriptor/discovery/materializer/Demon contract 均通过；`life.json`、`asset-slots.json` 的写后 hash 与 plan 前当前 bytes 相同，未夹带任务或素材改写。

## 门禁

- 定向 Vitest：5 文件 / 76 tests，全部通过（descriptor、presenter/HUD/input、mounted Host、Demon contract、launcher discovery）。
- `src/authoring/life-materializer.test.ts`：32 tests 通过。
- `tsc --noEmit`：exit 0。
- 变更 TS 定向 ESLint：exit 0。
- dark/light `ui-audit`（1060×760）：重叠 0、硬低对比 0、警告 0、border-image 错误 0；临时浏览器由 audit 关闭，未启动整套 ZeroCraft。
- `context-budget-guard`、`docs-ref-guard`：PASS。
- 定向 dependency-cruiser 仍报告 Host 目录已有的 13 条 `engine-core-is-bottom` 基线边；本单没有新增跨层 import。全库 scoped gate 继续受共享工作树既有 dependency-cruiser 债阻断，不把该红灯伪报为本单通过。
- 另见共享工作树既有 `life-bundle-compose.test.ts` stale bundle hash 断言；本单未改 Bundle 内容，定向 Host/Demon 门禁不依赖该陈旧期望。

## 撤修验红

临时把 `projectQuestItems()` 的优先级稳定序从 `priority desc` 改成 `priority asc`，只跑锚点 `joins authoritative quest catalog and projection in stable priority order without persisting tracking`：准确 1 红，差异显示 `quest.low` 被错误提前、`quest.high` 被移到末尾。恢复生产排序后同锚点 1 pass。由此确认测试真实命中“权威目录 + 优先级稳定序”，不是空跑。

## 交付文件

- descriptor/presenter/HUD/input/host：`src/authoring/life-host-descriptor-core.ts`、`src/engine/host/life-presenter.ts`、`life-hud.ts`、`life-input.ts`、`life-game-host.ts`。
- 测试：`src/authoring/life-host-descriptor.test.ts`、`src/engine/host/life-host.test.ts`、`life-game-host.test.ts`、`src/authoring/demon-castle-playtest-contract.test.ts`。
- UI audit：`tools/audits/life-quest-panel.*.ts`。
- opt-in：`docs/design/game-demon-castle/life-host.candidate.json`、`games/game-demon-castle/life-host.json`。

