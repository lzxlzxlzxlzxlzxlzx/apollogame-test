# SIMLIFE-ENG-18 Review 单｜LifeHost 会话锁、世界坐标与响应式相机一致性返修

## 1. 结论与 owner 裁决

状态：**✅ 已由非施工人独立验收（2026-10-09）**。

施工中确认了一个原工单未覆盖的权威缺口：`t3-dialogue` 可推进图，但 terminal line 没有确定性关闭动作。只在 host 隐藏面板会留下 open `LifeDialogueSession`，输入锁和存档权威都会分叉。已按缺口协议实查并摆出 A/B，owner 选择 **A**：扩写既有 `t2-life-talk`，新增 queued `life.dialogue.close`，仅在当前节点为 terminal `line + next:null` 时销毁专用会话。没有新增 system、相位边或游戏私有解释器。

本会话主 agent 已完整阅读并遵守：`AGENTS.md`、`docs/llm-onboarding.md`、`docs/design/data-driven-manifesto.md`、`docs/playbooks/index.md`、`docs/playbooks/game-production.md`、`docs/playbooks/ui.md`、`docs/design/ui-playbook.md`、`docs/playbooks/movement.md`、`docs/playbooks/events.md`、`docs/playbooks/rendering.md`、`docs/playbooks/testing.md`、`docs/playbooks/self-check.md`、`docs/playbooks/review-gates.md`，以及 `module-ui`、`module-movement`、`module-events`、`module-fx`、`check-ui` skills。

## 2. 文件面

- 权威对话关闭：`src/skills/tier2/life-talk.ts` 及测试。
- host 投影/菜单/输入：`src/engine/host/life-presenter.ts`、`life-interaction.ts`、`life-input.ts`、`life-game-host.ts` 及测试。
- renderer：`src/renderer/life-scene-render.ts`、`canvas-renderer.ts`、`world-ui2d.test.ts` 及点名测试。
- 真包回归：`games/game-simlife/game-simlife.test.ts`。
- 设计与自证：capability plan、本工单、`self-check/eng18/`。

没有改 `src/ui/**`、游戏规则 JSON、真实素材、AssetIndex/public、存档协议或系统定序。

## 3. 语义实证

1. presenter 从真实 `LifeDialogueSession + DialogueScript + State` 投影 `dialogueActive/dialogueTerminal`；controller 在下一次 reconcile 自动打开/刷新活动会话面板，并以目标 id 而非玩家位置维持 context。离开 NPC 只记录 retained decision，不再关闭面板。
2. active dialogue 是最高输入所有者：进入会话释放所有 held direction；后续方向 keydown 只排 `life.move.stop` 并记 reject，不排 move.start；terminal queued close commit 后立即恢复移动。
3. Tab/Shift+Tab、Enter 与 LayoutNode pointer leaf 走同一控制器/queued action。terminal `继续` 发送 `life.dialogue.close`，非 terminal 仍发送既有 `dialogue.advance`。
4. continuous player center 只做一次 `lifeCellToWorld(transform.x, transform.y)`；旧的额外半格 Y 偏移被移除。当前格高亮独立读取权威 `LifePosition`，位于 ground 之上、farm/placement/player 之下，仅影响 renderer。
5. responsive cover 后以真实 `canvas / (cellSize × effectiveZoom)` 推导可见格数并生成 renderer-private clamp；同一 effective camera 同时进入 Canvas base 与 `WorldUi2DLayer`。Camera、World、snapshot/hash 均不写。

## 4. trace

- `life-talk`：open decision/commit、terminal close commit、无 session/非 terminal close reject；单 tick 最多 3 条，未挂 `DebugTrace` 时 no-op。
- `life-host-interaction`：session retained、panel-open transition、movement start rejected 与 close transition；sink 每次记录时重新查 `DebugTrace`，关闭时零状态/零写。
- 点名测试只读 trace 即可还原“为什么对话仍保留 / 为什么方向没有开始 / 为什么会话被关闭”。

## 5. 撤修验红

锚点为 `collectLifeSceneRender` 的连续玩家中心公式。施工人临时恢复旧式额外半格 Y 偏移，点名 `uses continuous Transform for the player foot` 精确得到 **1 failed / 13 skipped**：received `{x:35,y:30}`、expected `{x:35,y:20}`。恢复修复后该点名用例通过。复查人仍须自行执行带锚点命中断言的撤修验红。

## 6. 施工验证

```text
npx vitest run src/skills/tier2/life-talk.test.ts src/engine/host/life-host.test.ts src/engine/host/life-game-host.test.ts src/engine/host/life-save.test.ts src/renderer/life-scene-render.test.ts src/renderer/world-ui2d.test.ts src/renderer/canvas-renderer.viewport.test.ts games/game-simlife
```

结果：**12 files / 109 tests passed**。`src/ui/components`：**62 files / 493 tests passed**。本单修改文件 ESLint exit 0。施工期 Vite build 成功（752 modules）。`DOCS-REF: PASS`；`SYSTEM-GRAPH: PASS`（最终共享工作树 117 systems，零重复 id、零悬空显式边；全局 supergraph 的既有 informational cycles 未改变）。`game-skill-audit game-simlife` 无红旗、RATCHET PASS；其“零能力接入” warning 来自薄游戏目录的静态 import 口径，正式 descriptor 由共享 LifeHost 编译并消费 capability plan 中的实名能力。

全库 `tsc --noEmit` 仍只报既有 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx` 三组类型错误；ENG-18 文件零命中。`scoped-gate.mjs` 会调用 Git，受 owner 最高优先级禁令未执行。

## 7. UI 与真渲染

`dialogue-panel.audit.ts` 分别以 640×668、1060×708、1440×848 审计：overlap 0、硬对比失败 0、3–4.5 warning 0、border-image 0，全部 exit 0。fixture 只隔离审计世界对话面板，因此华丽度只命中 2 个 flair、未识别 house theme；正式 host 继续使用 `STARTER_THEME`，该项非阻断。

隔离无头 Edge 对成功构建的 `dist` 执行真实 Little Valley 键盘路径，形成 `self-check/eng18/alignment.md` 与 640/1060/1440、上下左右、对话/高亮帧。浏览器已关闭，临时 capture 脚本已删除。owner 的既有 Vite 服务随后被无关 `narrative-director.ts` 语法错误阻断，施工人没有修该文件或重启服务；静态构建验收不依赖该服务。

## 8. 独立复查重点

1. 用真实 Little Valley 包开 Mayor 会话，确认下一 paint 自动出现；用语义移动离开 range 后 Tab/Enter/pointer 仍推进，不允许直接写 World 摆位置。
2. 按住方向进入对话且不发 keyup，确认 stop 先排入；会话中新的方向不产生 start；terminal close 后同键可重新移动。
3. 独立验证 terminal-only：非 terminal `life.dialogue.close` 必须 reject 且会话保留，terminal 才销毁，并可再次开启。
4. 在非 20px cellSize 下核对 Transform 脚点、LifePosition 高亮与 WorldUI anchor；撤回单次投影公式确认点名测试转红。
5. 复跑 640/1060/1440 × 四边 camera matrix，核对 Canvas/WorldUI effective camera 完全一致、玩家/高亮/锚点在界内、snapshot/hash 不变。
6. 复跑 LayoutNode validation、UI audit、LifeHost/save/game-simlife 回归并阅读 trace/WARN，不采信施工自陈。

## 9. 已知非本单问题

- 全库 tsc 的三组既有类型错误未越界处理。
- 当前 owner 预览服务会被无关 `src/skills/tier3/narrative-director.ts` 语法错误返回 500；该文件不是本单文件，且本单成功 build 在该外部改动出现前已经完成。
- 未执行任何 Git/GitHub、数据库操作或应用服务启动/重启；没有无头浏览器或临时 capture 脚本残留。

## 10. 独立复查实证（非施工人，2026-10-09）

- 已核验 owner 的 **A** 裁决来自其在施工线程的直接回复；实现确为既有 `t2-life-talk` 的 terminal-only queued close，而非 host 私有强关或新增 system。
- 独立复跑 Life/host/save/renderer/Little Valley 定向集：**12 files / 109 tests passed**；复跑 UI 组件：**62 files / 493 tests passed**。
- 以临时隔离 Edge（命令结束后关闭）独立审计 640×668、1060×708、1440×848：三个尺寸的 overlap、硬对比失败、3–4.5 对比警告、border-image 前提均为 **0**。fixture 的 house-theme/flair 提示仅是隔离审计入口未挂正式宿主主题的非阻断提示。
- 独立撤修验红：临时把 `collectLifeSceneRender` 的连续 Transform 脚点恢复为旧式额外半格 Y 偏移，点名用例精确得到 **1 failed / 13 skipped**（received `{x:35,y:30}`，expected `{x:35,y:20}`）；使用 `apply_patch` 恢复单次投影后同用例与 LifeHost 对话/输入回归均通过。
- 独立复读确认：活动 session 直接驱动面板且脱离 NPC proximity 不会关闭；`LifePosition` 格高亮只读且在玩家下层；Canvas 和 WorldUi2D 使用同一 renderer-private effective camera，均不写 World/Camera/snapshot/hash。`DOCS-REF`、`SYSTEM-GRAPH` 通过；技能审计无红旗（既有薄入口“零能力接入”仅 warning，RATCHET PASS）。
