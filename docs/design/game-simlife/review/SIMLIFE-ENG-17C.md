# SIMLIFE-ENG-17C Review 单｜通用 Life 存档策略与隔离恢复

## 1. 结论与边界

状态：**待非施工人独立复查**。

本单按 owner 裁决 A 下沉 `LifeHostSavePolicy v1`：复用既有 `SaveSystem` / `StoragePort`，不新增 gameplay component、system、codec 或持久化后端。Little Valley 只提供 `life-host.v1` descriptor 与薄 wrapper。未改 Life JSON、compiler、World protocol、launcher、materializer、AssetIndex、`src/ui/**`、数据库或服务。

本会话主 agent 已完整阅读并遵守：`AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`docs/playbooks/game-production.md`、`docs/design/data-driven-manifesto.md`、`docs/playbooks/save-platform.md`、`docs/playbooks/testing.md`、`docs/playbooks/review-gates.md`、`docs/playbooks/events-logic.md`、`docs/playbooks/movement-pathfinding.md`、`.agents/skills/module-save/SKILL.md`、`.agents/skills/module-events/SKILL.md`、`.agents/skills/module-movement/SKILL.md`。

## 2. 文件面

- 通用 policy / adapter / autosave：`src/engine/host/life-save.ts`
- 通用隔离、负例、autosave、trace 与纯 host 测试：`src/engine/host/life-save.test.ts`
- Little Valley descriptor：`games/game-simlife/host-descriptor.ts`
- 游戏薄 wrapper 与宿主迁移：`games/game-simlife/save.ts`、`game-simlife.ts`、`ui.ts`
- Little Valley 回归：`games/game-simlife/save.test.ts`
- 契约文档：`capability-plan.md`、`life-generation-sop.md`、`docs/playbooks/save-platform.md`

## 3. 语义实证

1. slot 只由已验证 descriptor namespace 派生：`life:<slug>:v1 → life:<slug>:slot-1`；adapter 不接受任意 slot。两份 descriptor 共用同一 `MemoryStoragePort` 时各有独立槽与 filtered list。
2. v1 label 固定绑定 schema、slug、descriptor fingerprint 与 fresh compiled package fingerprint；package fingerprint覆盖不可变 catalogs/config、placement/resource/schedule/inventory 静态配置及 system order。
3. 落盘是字段级权威进展投影。Inventory 只存 items，ResourceNode 只存 remaining，NpcSchedule 只存 currentSlot，Placement 只存 scene/坐标/visible/interactive；package 的容量、entries、item/action、prefab/skin 从 fresh baseline 提供。Camera、Velocity、连续输入、请求、WorldUI2D、DebugTrace、descriptor/HUD/menu/prompt/provenance/assets 不进 payload。
4. `SaveSystem.load` 前后均 fail-closed：先查 raw slot/order，再由 SaveSystem 验 hash/order，在隔离 World 验 component allowlist/player/calendar，合入 captured fresh baseline 后再次比对 persistent hash；最后只调用一次 active `World.restore()`。失败路径不触碰活动权威态。
5. 恢复后 held directions 全 false、Velocity 为零、move/warp request 移除。外部 interaction controller 不持久化；纯 host restore 后 presenter、HUD LayoutNode 与 interaction options 可立即构建。
6. autosave signature 只覆盖离散进展和 `LifePosition.sceneId`；Transform 坐标、Velocity、Camera、输入/UI/空 tick 均不触发写。连续同签名观察只提交一次。
7. DebugTrace 为 opt-in host-local sink；save/restore/reject 分别记 commit/transition/reject。启用 trace 跨 atomic restore 保留，关闭时 no-op，且 deterministic hash 与存档投影均排除它。

## 4. 负例与撤修验红

点名测试覆盖 cross-slot/cross-payload、save schema、descriptor fingerprint、package fingerprint、hash、残缺 order、缺 player、缺 calendar、活动 package 漂移；每项均断言未恢复且活动 snapshot/order hash 不变。

撤修锚点为 `LifeHostSaveAdapter.compatible()` 的 `label.descriptorHash === this.descriptorHash`。施工人临时撤掉该项后运行 `rejects cross-slot, schema/descriptor/package/hash/order and missing authority without mutating active world`，精确 **1 failed / 6 skipped**，失败值为 `restored`；恢复锚点后最终回归全绿。复查人仍须独立撤修并确认命中。

## 5. 施工验证

```text
npx vitest run src/engine/host/life-save.test.ts src/engine/host/life-host.test.ts src/authoring/life-host-descriptor.test.ts games/game-simlife
```

结果：**8 files / 94 tests passed**。本单 ESLint exit 0。全库 Vite build 成功（749 modules）。`DOCS-REF: PASS`；`SYSTEM-GRAPH: PASS`（116 systems、零重复 id、零悬空显式边；4 个全局超集 informational 环与本单无关）。

全库 `tsc --noEmit` 仍只报既有 `game-dice/dice-window.ts`、`game-theft/ui.ts`、`launcher/game-runner.tsx`；本单与 Little Valley 文件零新增类型错误。`scoped-gate.mjs` 内部调用 Git，受 owner 最高优先级禁令不得运行。

## 6. 独立复查重点

1. 证明 descriptor namespace 是 slot 唯一来源，任意 caller slot 无入口；复跑双 descriptor 单 port 隔离。
2. 直接检查存档体，确认 placement 无 skin/prefab、inventory 无容量/id，且 Camera/motion/input/request/UI/trace 不存在。
3. 分别篡改 schema/descriptor/package/hash/order 与 player/calendar，独立确认 active snapshot/order 不变；注意读取 warning/trace，而非只看退出码。
4. 恢复后不 tick，立即运行 presenter/HUD/interaction，并确认移动瞬态已清零。
5. 独立执行 descriptor fingerprint 撤修验红；恢复后复跑 94 项。

## 7. 已知非本单问题

- 全库 tsc 的三组既有类型错误未越界处理。
- 未执行任何 Git/GitHub、数据库操作或应用服务启动。

## 8. 独立复查结论（2026-10-09）

- 复查人：模拟经营游戏策划/Lead（非施工人）。
- 独立回归：`npx vitest run src/engine/host/life-save.test.ts src/engine/host/life-host.test.ts src/authoring/life-host-descriptor.test.ts games/game-simlife`，结果 **8 files / 94 tests passed**。
- 撤修验红：临时从 `LifeHostSaveAdapter.compatible()` 移除 `label.descriptorHash === this.descriptorHash`。点名运行跨槽/篡改负例，精确出现 1 failed、6 skipped：错误 descriptor 存档返回 `restored`；恢复该 guard 后 adapter 7 项测试再次全绿。
- 状态边界复核：持久投影仅 allowlist 进展组件；代码显式将 `LifeContinuousMotion`、`Velocity`、move/warp request 排除或恢复时清零，`DebugTrace` 只作为 host-local 观察器保留且不计入 authority。未发现 descriptor、HUD/menu、素材审批或生成 provenance 进入存档投影。
- 结论：**PASS**。通用 Life 存档现在以 descriptor 派生的隔离槽位和双重完整性检查恢复权威进展，拒绝跨游戏/篡改数据且不污染活跃世界。
