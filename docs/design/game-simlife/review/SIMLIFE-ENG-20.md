# SIMLIFE-ENG-20 Review 单｜Little Valley 移动速度与交互输入稳定性

## 1. 状态与边界

状态：**✅ 已由非施工人独立验收（2026-10-10）**。

- 施工主体：BDM程序（锁）。
- 允许：Little Valley `movement.speed` 数据与点名测试、共享 `life-input` reducer/DOM 薄适配与点名回归、本设计目录 capability plan/工单/self-check/Review。
- 禁止：相机 safety-zone/dead-zone（owner 已裁 A，另单施工）、`src/ui/**`、资产、数据库、服务、Git/GitHub及无关代码。
- 不新增 capability、system、phase；输入继续只产出 queued semantic actions。

## 2. 待复查清单

1. 固定 N tick 的新速度位移严格超过旧 `0.18/tick` 基线，墙碰撞与对角速度归一化不变。
2. 方向键 repeat/重复 keydown 不产生 `interaction.close` 或重复 `life.move.start`。
3. E/Tab/Enter/Escape/N/T 初次按下先唯一释放所有 held direction；自身 repeat 零 action/interaction/stop 副作用。
4. 方向开始→E→E repeat→方向 repeat/up→fresh direction，以及 WASD/Arrow 同向别名、blur/visibility/keyup 乱序均无幽灵移动或永久停住。
5. 真实 `LifeContinuousMotion` held flags 与 `Velocity` 在 tick 后收敛；菜单/对话输入回归不退。
6. 独立复跑、带精确锚点撤修验红、实证复现并阅读全部告警。

## 3. 施工实证

本节仅作复查导航，不构成独立复查结论。

- Authoring：Little Valley `movement.speed` 从 `0.18` 调整为 `0.3`；capability plan 明确该值是游戏数据而非 capability 默认。
- Reducer：`movementLocked` 仍优先释放旧 held state；未锁定方向分支把 `event.repeat || heldCodes.includes(code)` 统一归为 no-op。交互键首个 keydown 的 release-before-effect 与 repeat-before-release 顺序保持不变。
- 回归：新增 4 tick 位移/旧基线、对角归一化、边界碰撞；六个交互键 release/repeat 表驱动；方向 repeat、fresh restart、WASD/Arrow alias、blur/visibility/迟到 keyup；真实 `LifeContinuousMotion + Velocity` 交错。
- 施工方相关回归：**6 files / 74 tests passed**；涉及 TS 文件 ESLint exit 0；`DOCS-REF`、相关 system graph PASS；game-simlife 未覆盖红旗 0、RATCHET PASS。
- 全库 tsc 的失败仅在既有 `game-dice`、`game-theft`、`src/launcher/game-runner.tsx`，没有本单文件。
- 撤修验红一：输入 repeat guard 唯一锚点去掉 `event.repeat ||` 后，点名精确 **1 failed / 21 skipped**；恢复后 1 passed。
- 撤修验红二：唯一速度锚点退回 `0.18` 后，点名精确 **1 failed / 19 skipped**；恢复后 1 passed。
- 自证全文：`../self-check/eng20.md`。

## 4. 独立复查结论

**PASS**。复查人：Codex 独立复查（非施工主体）。分级：blocker 0 / major 0 / minor 0。

- 独立复跑 `life-continuous-motion.test.ts`、`life-host.test.ts`、`life-game-host.test.ts`、`game-simlife.test.ts`、`world-interaction.test.ts`、`life-demo-package-json.test.ts`：**6 files / 74 tests passed**。其中点名覆盖 4 tick 位移 `1.2 > 0.72`、对角模长 `0.3`、边界/阻挡、方向 repeat 不 close/restart、六个交互键 release-before-effect 与 repeat no-op、WASD/Arrow alias、keyup/blur/visibility、真实 `LifeContinuousMotion + Velocity` 交错收敛及菜单/对话延续与关闭。
- 相关 7 个 TypeScript 文件 ESLint：exit 0，零输出/零 warning。`node scripts/docs-ref-guard.mjs` 扫描 46 个 Markdown、390 路径，`DOCS-REF: PASS`。
- `npx vite-node scripts/system-graph-audit.mjs t2-life-input t2-life-continuous-motion t1-motion-apply`：全局 119 systems / 216 显式边、零重复 id、零悬空边；相关子图 5 systems 可排且无环，`SYSTEM-GRAPH: PASS`。
- `node scripts/game-skill-audit.mjs game-simlife`：未覆盖红旗 0，`RATCHET: PASS`。唯一告警仍是静态扫描的“零能力接入”；实查该目录已是经共享 `mountLifeGame` + raw package compiler 消费能力的薄宿主，未出现游戏层 system、自由积分或 World 写入，因此不构成本单缺陷。
- 撤修验红：`life-input.ts` 锚点 `if (event.repeat || state.heldCodes.includes(event.code))` 独立确认命中数 **1**；用 `apply_patch` 临时撤掉 `event.repeat ||` 后，点名用例 `ignores a stale direction repeat after interaction, then restarts only on a fresh keydown` 精确 **1 failed / 21 skipped**，失败实值为 stale repeat 重新产生 `interaction.close + life.move.start:right`。用 `apply_patch` 精确恢复后，原锚点命中数 1、撤修形态命中数 0，点名 **1 passed / 21 skipped**，最终 6 files / 74 tests 再次全绿。
- 已逐项读取测试/审计 warning；除上述已解释的 audit 黄项，以及受控环境首次运行 Vitest/vite-node 时的 Windows sandbox `realpath EPERM`（改为同命令沙箱外只读复跑后通过）外，无 capability、调度、测试或 lint 告警。未遗留 sabotage marker 或复查临时文件；永久复查改动仅为本结论与工单顶部验收摘要。
