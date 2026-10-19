# SIMLIFE-POSE-ANCHOR-01 · 独立复查导航

复查人必须不是施工人。Review 单只导航，不是证据；请独立复跑并填写最终判词。

## 范围

- `src/engine/protocol/life-pose.ts`
- `src/renderer/life-scene-render.ts`
- `src/skills/tier2/life-continuous-motion.ts`
- `src/engine/host/life-presenter.ts`
- `src/engine/host/life-interaction.ts`
- 相关测试、生成规范、Demon Castle Playtest、路线图与施工单

## 必查问题

1. Transform 是否是唯一连续脚点，LifePosition 是否只按共享 floor 规则派生；整数/负数边界是否稳定。
2. 高亮格、player descriptor、WorldUI、interaction context 和 camera target 是否来自同一脚点；相机 dead-zone/bounds 是否只是视图约束。
3. player 与可见 NPC/placement 是否 bottom-center；AssetSlot display/fit/anchor/offset 是否只影响图片框。
4. collector/host projection 是否完全只读，snapshot/hash 是否不变。
5. Little Valley 与 Demon Castle 正式包是否都被真实编译/运行覆盖；无单游戏 offset、无正式 JSON 漂移。
6. 读取测试/系统告警；绿色退出码不能替代 warning 裁决。

## 独立命令

```powershell
npx.cmd vitest run src/renderer/life-scene-render.test.ts src/renderer/canvas-renderer.viewport.test.ts src/engine/host/life-host.test.ts src/engine/host/life-game-host.test.ts src/skills/tier2/life-continuous-motion.test.ts src/skills/tier2/life-activity.test.ts src/skills/tier2/life-navigation.test.ts src/skills/tier2/life-npc-schedule.test.ts src/authoring/demon-castle-playtest-contract.test.ts games/game-simlife/game-simlife.test.ts games/game-simlife/world-interaction.test.ts games/game-simlife/art-consumption.test.ts games/game-simlife/asset-slots.test.ts games/game-simlife/life-pose-integration.test.ts --reporter=dot

npx.cmd eslint src/engine/protocol/life-pose.ts src/renderer/life-scene-render.ts src/renderer/life-scene-render.test.ts src/renderer/canvas-renderer.ts src/renderer/canvas-renderer.viewport.test.ts src/skills/tier2/life-continuous-motion.ts src/skills/tier2/life-continuous-motion.test.ts src/engine/host/life-presenter.ts src/engine/host/life-interaction.ts src/engine/host/life-host.test.ts games/game-simlife/world-interaction.test.ts games/game-simlife/art-consumption.test.ts games/game-simlife/life-pose-integration.test.ts --max-warnings 0
```

## 撤修验红

临时把 `collectLifeSceneRender` 的 `playerHighlight` 改回 `player.position`，必须由 `SIMLIFE-POSE-ANCHOR-01-SABOTAGE` 点名用例稳定转红；确认锚点实际命中后恢复，并重新跑全量。不得留下 sabotage marker 或临时文件。

## 判词

- 复查人：Codex/review_eng11（非施工人，2026-10-12）。
- Blocker：0。
- Major：0。
- Minor：0 个未解决；发现 1 个流程性 Minor 已由本次复查闭合：路线图 `review: pass` 曾先于独立证据落盘，现以下方真实复跑与撤修证据补齐；owner gate 仍保持 `required`，里程碑仍为 `active`。
- 最终：**PASS**。该判词只覆盖机器合同与共享实现，不代签 owner 真机 Playtest。

## 独立复查证据

- `resolveLifePose` 仅以 `Transform.x/y` 作为连续脚点，以共享 `cellFloor` 生成逻辑格；无 Transform 时兼容 `LifePosition`。`0.999999 → 0`、`1 → 1`、`-0.001 → -1`、`-1 → -1` 均有点名断言。collision、position-sync、activity/interaction context 与导航使用同一 floor 语义。
- renderer 的 player center、WorldUI `poseX/poseY` 与 camera target 消费连续脚点；高亮与 `selectLifeHostView.x/y` 保持离散 `LifePosition`，避免把连续位置冒充逻辑格。player/NPC/placement descriptor 为 bottom-center；Canvas 的 AssetSlot 路径和 legacy fallback 均显式消费 bottom-center，render-only display/fit/anchor/offset 不进入 World。
- collector/host projection 前后 snapshot 与 `hashSnapshot` 不变；Little Valley 与 Demon Castle 由 `life-pose-integration.test.ts` 对正式 JSON 执行真实 compile、tick、host/WorldUI/camera/activity/hash 闭环。正式包集成测试从 `src/renderer` 移至 `games/game-simlife`，符合 dependency fence。
- 最终回归：上述命令 **14 files / 130 tests passed**；相关 ESLint `--max-warnings 0` 退出 0；`node scripts/docs-ref-guard.mjs` 为 `DOCS-REF: PASS`；`python -m unittest main_entry.test_project_roadmap` 为 **11 tests / OK**。
- `npx vite build` 在沙箱内因 Node 24 `realpath(index.html)` EPERM 未进入构建；按规则改为短生命周期沙箱外构建后 **770 modules transformed / exit 0**。唯一告警是既有 `>500 kB` chunk-size 提示，不命中本单语义。
- `npx tsc --noEmit --pretty false` 退出 1；全部诊断仅命中既有 `game-card-reveal`、`game-dice`、`game-theft` 与其 `game-runner` 接缝，本单文件零命中，故不伪报全库 tsc 绿色，也不把无关红归责本单。
- 撤修验红：先确认生产锚点 `const playerHighlight = { cellX: pose.cellX, cellY: pose.cellY` 恰 1 处、测试锚点 `SIMLIFE-POSE-ANCHOR-01-SABOTAGE` 恰 1 处、独立 marker 为 0；临时改回 `player.position` 后点名用例精确 **1 failed / 14 skipped**（实际 cellX/center `0/10`，期望 `1/30`）。随后用 `apply_patch` 原样恢复，终态生产锚点 1、独立 marker 0，并复跑 **14/130 全绿**。
- 告警裁决：Vitest 与 ESLint 无 warning；roadmap unittest 额外打印 Python 安装路径探测提示但 **11 tests / OK**，不影响 JSON/路线图合同；build chunk-size warning 属既有包体提示。未执行 Git/GitHub、数据库、服务启动或 owner Playtest。
