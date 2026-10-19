# SIMLIFE-ENG-17B Review 单｜通用 Life 视图、交互、输入与 HUD

## 1. 结论与边界

状态：**待非施工人独立复查**。

本单接受为既有宿主能力通用化，不新增 Life component/system/capability，不改变 package/compiler/World/snapshot/save。Little Valley 原 presenter、递归交互 controller、键盘 adapter 与 HUD 中的内容 ID 分支已消解为 `src/engine/host` 四个共享模块；游戏侧只保留 descriptor HUD 数据和薄兼容导出。未改 `src/ui/**`、launcher、materializer、资产、数据库或服务。

本会话主 agent 已完整阅读并遵守：`AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`docs/playbooks/game-production.md`、`docs/design/data-driven-manifesto.md`、`docs/design/capability-plan-template.md`、`docs/design/ui-playbook.md`、`docs/playbooks/ui.md`、`docs/playbooks/events-logic.md`、`docs/playbooks/movement-pathfinding.md`、`docs/playbooks/rendering-fx.md`、`docs/playbooks/assets.md`、`docs/playbooks/testing.md`、`docs/playbooks/review-gates.md`、`docs/design/game-simlife/life-generation-sop.md`、`docs/design/game-simlife/capability-plan.md`、`docs/design/game-simlife/requests.md`；使用 `module-ui`、`module-events`、`module-movement`、`check-ui`。

## 2. 文件面

- 共享只读投影：`src/engine/host/life-presenter.ts`
- 共享递归交互/controller/LayoutNode：`src/engine/host/life-interaction.ts`
- 纯 input reducer + DOM adapter：`src/engine/host/life-input.ts`
- descriptor-driven HUD：`src/engine/host/life-hud.ts`
- 任意 ID 第二 package、controller/input/HUD/trace/hash 测试：`src/engine/host/life-host.test.ts`
- Little Valley 直接接线：`games/game-simlife/game-simlife.ts`、`games/game-simlife/ui.ts`
- 无逻辑兼容导出：`games/game-simlife/view-model.ts`、`world-interaction.ts`、`keyboard.ts`
- 迁移回归与审计：`games/game-simlife/game-simlife.test.ts`、`world-interaction.test.ts`、`tools/audits/game-simlife.audit.ts`
- SOP、工单与本 Review。

## 3. 语义实证

1. presenter 只读公开 Life components 与固定 host singleton ids；地点、NPC、资源、warp、item 均无 Little Valley 内容 ID 分支，缺显示名时统一稳定 humanize。
2. 第二 package 将 scene/zone/NPC/resource 全换为 `orbital-hub/glasshouse/tidal-canal/archivist/moonfruit`，真实 compile + Engine tick 后得到通用投影，调用前后 snapshot 逐值相同。
3. controller 的递归 fingerprint 覆盖每层 id/label/enabled/actions/children 并绑定 scene/x/y；走离、换场景、available 或任意深层内容变化都会关闭旧菜单。
4. gift/plant item 叶只输出既有闭集语义 action；placement item 先 select-target，tile item 不伪造 placement selection。鼠标父/叶 activation 与键盘 confirm 的序列逐值相同。
5. input reducer 无 DOM/World 引用；WASD/方向键别名、repeat、keyup、blur、visibility、dispose、E/Tab/Shift+Tab/Enter/Escape/T/N 均覆盖。互动边沿键先 release held movement；handled page keys preventDefault。
6. HUD 读取 17A descriptor 的 title/labels；第二 fixture `game-seaside-market` 显示“海风集市/营业日/货箱”，所有关系条目通用投影，不再只认 Mayor。
7. LayoutNode prompt/menu/HUD 均 `validateLayoutNode()` 零 issue，无 Modal/自由 DOM/CSS；写世界只经既有 action 信号。
8. 可选 trace 仅在 `findDebugTrace()` 命中时创建 sink；点名测试得到 tick=9 的 reject 事件，关闭时无 trace。事件写入 DebugTrace 后 deterministic snapshot hash 不变。

## 4. 施工验证

```text
npx vitest run src/engine/host/life-host.test.ts src/authoring/life-host-descriptor.test.ts games/game-simlife
```

结果：**7 files / 87 tests passed**（host 11、descriptor 28、Little Valley package/assets/interaction/save/game 48）。本单所有 TS/审计入口 ESLint exit 0。全库 `npx vite build` 成功，747 modules transformed，产出 `game-simlife` chunk。`DOCS-REF: PASS`；`SYSTEM-GRAPH: PASS`（116 systems、零重复 id、零悬空显式边；4 个全局超集 informational 环与本单无关）。

全库 `npx tsc --noEmit --pretty false` 仍只报既有 `game-dice/dice-window.ts`、`game-theft/ui.ts`、`launcher/game-runner.tsx`；筛选输出无本单或 Little Valley 文件。

## 5. check-ui 与无头浏览器

`validateLayoutNode` 已在 host 与 Little Valley 测试中逐树断言。使用本机 Edge 的任务级短生命周期 headless Chromium，分别以 640×720、1060×760、1440×900 运行 `node tools/ui-audit.mjs tools/audits/game-simlife.audit.ts`。三档均 exit 0：重叠 0、对比硬失败 0、对比警告 0、border-image 前提错误 0、华丽件命中 4。浏览器由 audit `finally` 关闭，临时 `.ui-audit-tmp` 清理，仅访问 file://，未启动应用服务。

审计工具不持久化截图；owner 禁止 agent 启动应用服务，本单未伪造正式运行截图。既有 Little Valley 视觉截图仍在 `self-check/shots/demo18` 与 `demo19a`。

## 6. 撤修验红

锚点为 `life-interaction.ts` 的 `contextKey(view) => scene:x:y` 和测试 `closes an open menu when position or recursive content changes`。施工人临时把 `contextKey` 改为空串后点名运行，精确 **1 failed / 10 skipped**，失败在 position 变化后 menu 仍 open；恢复原实现后同一测试 **1 passed / 10 skipped**。复查人仍须独立执行并确认锚点命中。

## 7. 独立复查重点

1. 搜索共享四模块，确认没有 `farm-field/mayor/merchant/berry/ore/mine-gate/little-valley` 内容分支。
2. 独立改第二 package 的所有内容 id，确认 compile/projection/HUD/interaction 无特殊映射需求。
3. 复跑 context/deep-child refresh、disabled forged click、recursive pointer/keyboard parity。
4. 复跑 input alias/repeat/release/blur/visibility/preventDefault，确认 adapter 不写 World。
5. 确认 descriptor runtime import 为 type-only，浏览器 bundle 不携带 authoring `node:crypto`。
6. 独立执行三尺寸 UI audit与撤修验红；读取 warnings，而非只看退出码。

## 8. 已知非本单问题

- 全库 tsc 的三处既有错误未越界处理。
- `scoped-gate.mjs` 内部调用 Git；受 owner 最高优先级禁令，本会话不得运行。测试/lint/build/docs/system/UI audit 已分别直接执行。
- 本单未执行任何 Git/GitHub、数据库或服务启动操作。

## 9. 独立复查结论（2026-10-09）

- 复查人：模拟经营游戏策划/Lead（非施工人）。
- 独立回归：`npx vitest run src/engine/host/life-host.test.ts src/authoring/life-host-descriptor.test.ts games/game-simlife`，结果 **7 files / 87 tests passed**，覆盖共享 host、descriptor、Little Valley package/assets/interaction/save/game。
- 内容耦合复核：扫描 `life-presenter`、`life-interaction`、`life-input`、`life-hud` 的 Little Valley zone/NPC/resource/game 名称，零命中；共享层没有按内容 ID 的分支。
- 撤修验红：临时将 `contextKey(view)` 从 `scene:x:y` 退化为仅 `scene`，点名运行 `closes an open menu when position or recursive content changes`，精确得到 1 failed、10 skipped，失败为位置改变后菜单仍打开；恢复完整 context key 后 host 11 项测试再次全绿。
- UI 复核：短生命周期隔离 Edge 仅访问静态审计产物，在 1060×760 得到重叠 0、硬对比失败 0、警告 0、border-image 问题 0；浏览器随审计退出，未启动服务。
- 结论：**PASS**。通用展示/交互层维持 World 写入只经 action 队列，菜单状态随位置与内容失效而关闭，且无快照/内容 ID/自由 DOM 旁路。
