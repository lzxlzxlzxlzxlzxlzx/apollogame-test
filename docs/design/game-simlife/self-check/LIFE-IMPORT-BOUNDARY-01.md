# LIFE-IMPORT-BOUNDARY-01 · 第一安全批自检

施工主体：引擎程序 Codex/root（非独立复查）；2026-10-16。本批只换 `games/game-simlife` 八个文件中 10 条相对越界 specifier 为仓库现有 `@zerocraft/engine/*` 包导出；没有改 API、Host、World、save、正式 JSON、资产或月夜城堡 HUD。`host-descriptor.ts` 尚余 `src/authoring` 类型引用（包无 authoring 导出），未用虚构 alias 消红。

## 实际门禁与局限

- `npx depcruise --config .dependency-cruiser.cjs src games --output-type err-long`：基线 33 errors → 本批 23 errors，恰余审计表 #1–9、#17、#21–33；零新增违规。完整逐条映射见 `../work-orders/LIFE-DEPENDENCY-FENCE-2026-10-16.md`。
- `npx eslint` 点名八文件，退出码 0。
- 六个不依赖旧 HUD 结构的 `games/game-simlife` 点名测试：6 files / 34 tests，退出码 0。
- `npx vitest run games/game-simlife`：7 文件中 6 文件通过，共 52/56 测试通过；`game-simlife.test.ts` 四条旧 HUD 断言失败，分别要求已不在现行 `life-hud.ts` 的 `life-host-advance-day`、`life-host-advance-time` 控件及 `top.layout.height`。`git diff -- src/engine/host/life-hud.ts` 明确显示正在施工的 HUD 删除了这两个旧 Panel 并替换顶部结构；该文件不属本批改动，本批绝不回退或改写合同，故不宣称游戏回归全绿。
- `npx tsc --noEmit --pretty false`：退出码 1，现有诊断来自 GAL authoring/UI/studio；本批八文件零命中。上一 PUI 单新增测试的可选值类型错误已由施工者同步修正，未计作本批成绩。

## 唯一锚点撤修验红

`games/game-simlife/world-interaction.ts` 中包名 re-export 锚点先确认只命中 1 次；临时还原为 `../../src/engine/host/life-interaction.js` 后，仅巡检此入口的 depcruise 从既有 4 条 `engine-core-is-bottom` 增至 **5** 条，并明确新增 `games-no-relative-escape` 指向该文件；立即恢复包名，重跑回 **4**，共享源码无遗留破坏态。全仓基线与终态为 33→23，不能以非零退出码冒充全绿。

独立复查应自己复跑上述差分、检查每处包名都解析到同一物理目标，读四条 HUD 失败与 GAL 类型诊断，不得签月夜城堡 Host/Owner 人门。
