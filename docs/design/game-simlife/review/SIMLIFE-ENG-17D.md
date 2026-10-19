# SIMLIFE-ENG-17D Review 单｜通用 Life 宿主装配与薄入口

## 1. 结论与边界

状态：**待非施工人独立复查**。

本单接受为 17A descriptor、17B presenter/controller/input/HUD、17C save policy 的生命周期装配，不新增 gameplay capability/system。共享 `mountLifeGame` 只消费已导入的数据对象与受控 art loader；不读取 descriptor 路径，不接 launcher/materializer/AssetIndex，不改 Life JSON、`src/ui/**`、数据库或服务。

本会话主 agent 已完整阅读并遵守：`AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`docs/playbooks/game-production.md`、`docs/design/data-driven-manifesto.md`、`docs/design/ui-playbook.md`、`docs/playbooks/ui.md`、`docs/playbooks/assets.md`、`docs/playbooks/save-platform.md`、`docs/playbooks/events-logic.md`、`docs/playbooks/movement-pathfinding.md`、`docs/playbooks/testing.md`、`docs/playbooks/review-gates.md`，以及对应 `module-ui`、`module-assets`、`module-save`、`module-events`、`module-movement`、`check-ui` skills。

## 2. 文件面

- 无 Node/hash 依赖的浏览器安全 descriptor core：`src/authoring/life-host-descriptor-core.ts`
- authoring hash facade：`src/authoring/life-host-descriptor.ts`
- 通用宿主装配：`src/engine/host/life-game-host.ts`
- trust boundary、storage、lifecycle 与第二 fixture 测试：`src/engine/host/life-game-host.test.ts`
- Little Valley 薄入口：`games/game-simlife/game-simlife.ts`
- 契约文档：`capability-plan.md`、`life-generation-sop.md`、`requests.md`
- 三视口真实共享宿主截图：`self-check/eng17d/life-host-640x720.png`、`life-host-1060x760.png`、`life-host-1440x900.png`

## 3. 语义实证

1. `parseHostInput` 在 DOM 变更前依次严格解析 descriptor、compile/parse Life package、解析 AssetSlot manifest，并校验 slot game 与 descriptor slug；未知 descriptor 字段、坏 package、跨游戏 slots 均 fail-before-mount。
2. `life-host-descriptor-core.ts` 只含 POD 类型、validator/parser 与 namespace 派生；authoring facade 单独接 canonical SHA-256，浏览器宿主不再静态引入 `node:crypto`。
3. shared core 创建 `QueuedInputSource + Engine`，只加载编译后的 blueprint 并 prime 一 tick。运行装配复用 `mountHost`、`createRunLoop`、`CanvasRenderer`、shared presenter/controller/input/HUD、save/autosave 和 art loader；无 Little Valley 内容分支。
4. storage 未配置明确返回 `not-configured` 且不创建 adapter；空槽返回 `missing`；不兼容元数据返回 `incompatible`。后两者均保持 fresh persistent hash。
5. 键盘、world menu、HUD 都只向 `QueuedInputSource` 发既有 semantic action。测试以 `KeyD` 证明队列实际收到 `life.move.start:right`。
6. art loader 只接 sanitized descriptor `artSlug` 和 host-owned `AssetManager`；false/true（placeholder/approved）都不影响装配，失败 promise 仅保留 semantic preview。
7. `dispose()` 幂等：release held input、移除 window/document listeners、关闭 interaction、停止 loop、解绑 autosave observer、drain pending save、销毁 renderer/WorldUI2D、卸载 HUD、teardown shell。相同容器可重新 mount，旧 session 不再接收按键。
8. Little Valley `mount` 只传 descriptor/package/slots、owner-provided host 与既有 storage factory；headless/save compatibility exports 继续由 shared host 包装，无 game-side lifecycle 复制。

## 4. 负例与撤修验红

点名测试覆盖第二个异名 descriptor/package/slots、三类 fail-before-mount、no-storage/missing/incompatible、semantic queue、placeholder/approved loader、重复 dispose、同容器 remount 与 listener 隔离。

撤修锚点为 `mountLifeGame.dispose()` 的 `shell.teardown()`。施工人临时撤掉该调用后只运行 lifecycle 用例，精确 **1 failed / 3 skipped**，失败在 `container.childElementCount`（期望 0，实际 1）；恢复锚点后回归重新全绿。复查人仍须独立撤修并确认命中。

## 5. 施工验证

```text
npx vitest run src/authoring/life-host-descriptor.test.ts src/engine/host/life-game-host.test.ts src/engine/host/life-save.test.ts src/engine/host/life-host.test.ts games/game-simlife
```

结果：**9 files / 98 tests passed**。check-ui 的 `src/ui/components` 为 **62 files / 493 tests passed**；本单 ESLint exit 0。Vite build 成功（749 modules）。`DOCS-REF: PASS`；`SYSTEM-GRAPH: PASS`（116 systems、零重复 id、零悬空显式边）；`game-skill-audit game-simlife` 为既有“零能力接入”黄色 warning，红旗棘轮 `PASS`。

640×720、1060×760、1440×900 的真实 `mountLifeGame` file:// 无头浏览器截图均为单 canvas，CSS/backing 分别为 640×668、1060×708、1440×848；浏览器已关闭、临时构建与脚本已清理。相同三尺寸 UI audit 均为 overlap 0、硬对比 0、border-image 前提 0、低对比 warning 0、华丽件 4。

全库 `tsc --noEmit` 仍只报既有 `game-dice/dice-window.ts`、`game-theft/ui.ts` 与 `src/launcher/game-runner.tsx` 类型错误；本单文件零命中。`scoped-gate.mjs` 内部调用 Git，受 owner 最高优先级禁令不得运行。

## 6. 独立复查重点

1. 独立确认 descriptor/package/slot 三个 trust boundary 都发生在首次 DOM mutation 前，且 runtime 无 path import/fetch。
2. 用第二份异名 fixture 和 Little Valley 分别走同一 `mountLifeGame`，搜索共享 host 无内容 id/slug 分支。
3. 复跑 no-storage/missing/incompatible，确认 fresh world hash 与 slot 隔离；观察 loader false/reject 不改变权威态。
4. 重复 mount/dispose，检查 window/document/ResizeObserver/RAF/UI/renderer/shell 无残留，并独立执行 `shell.teardown()` 撤修验红。
5. 复查三张截图与三尺寸 audit；确认截图是共享宿主实际 canvas，不是旧测试 renderer。

## 7. 已知非本单问题

- 全库 tsc 的三组既有类型错误未越界处理。
- `game-skill-audit` 的 game-simlife 零能力接入为既有结构性黄色 warning，本单没有新增红旗。
- 未执行任何 Git/GitHub、数据库操作或应用服务启动；只读截图浏览器已关闭。

## 8. 独立复查结论（2026-10-09）

- 复查人：模拟经营游戏策划/Lead（非施工人）。
- 独立回归：`npx vitest run src/authoring/life-host-descriptor.test.ts src/engine/host/life-game-host.test.ts src/engine/host/life-save.test.ts src/engine/host/life-host.test.ts games/game-simlife`，结果 **9 files / 98 tests passed**。
- 可视复核：实际共享宿主 1060×760 截图为单一 Canvas 世界与清晰的 LayoutNode 顶栏；没有旧演示式整屏操作面板。截图取自本单 `mountLifeGame` 的隔离 file:// 路径。
- 撤修验红：临时移除 `dispose()` 内 `shell.teardown()`，点名生命周期用例精确得到 1 failed、3 skipped，失败为容器遗留 1 个子节点；恢复调用后 host 4 项测试再次全绿。
- 运行时边界：扫描共享宿主没有文件读取、动态 import 或 fetch；`packagePath`/`assetSlotsPath` 没有被运行时解释为路径。descriptor/package/slot 的严格校验发生在首个 `mountHost` DOM 变更之前。
- 结论：**PASS**。`mountLifeGame` 现已是可复用、可释放且不依赖 Little Valley 内容 ID 的运行宿主；小山谷已降为数据与薄入口消费者。
