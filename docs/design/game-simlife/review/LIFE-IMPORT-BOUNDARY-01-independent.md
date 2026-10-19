# LIFE-IMPORT-BOUNDARY-01 · 独立复查（2026-10-16）

复查人：独立 agent `/root/life_import_boundary_review`；施工人：`/root`。判词：**局部 PASS，整库门禁仍红**。本判词只覆盖 Little Valley 八个游戏文件的导入边界改写，不覆盖月夜城堡 Host/HUD、公开包合同、正式数据或余下围栏债。

## 范围与解析核证

- 对照 `../work-orders/LIFE-DEPENDENCY-FENCE-2026-10-16.md`、`../self-check/LIFE-IMPORT-BOUNDARY-01.md` 和 `.dependency-cruiser.cjs`，逐文件查看 `git diff --` 八文件：`world-interaction.ts`、`view-model.ts`、`ui.ts`、`save.ts`、`keyboard.ts`、`host-descriptor.ts`、`game-simlife.ts`、`art-consumption.test.ts`。diff 只有 10 处 import/export specifier 从 `../../src/…` 改为已有 `@zerocraft/engine/…`，无表达式、控制流、测试预期、数据、Host 或存档合同修改。`keyboard.ts` 的两处和 `game-simlife.ts` 的两处均单独核过。
- `package.json` 的既存 `./engine/*`、`./ui/*`、`./renderer/*` exports 未因本批修改。用 TypeScript 当前 `tsconfig.json` 解析选项分别解析九个唯一旧/新目标，再以 `fs.realpathSync` 比较，**9/9 同一物理 `.ts` 文件**：`life-interaction`、`life-presenter`、`ui/components/index`、`life-hud`、`life-save`、`life-input`、`life-viewport-profile`、`life-game-host`、`canvas-renderer`。没有新 `not-to-unresolvable`；#17 的 `src/authoring/life-host-descriptor.ts` 仍保留原 type-only 相对引用，未虚构未公开 alias。

## 独立复跑与告警

| 检查 | 独立结果 |
|---|---|
| `npx depcruise --config .dependency-cruiser.cjs src games --output-type err-long` | 退出 1；**23 errors / 0 warnings，1728 modules / 6709 dependencies**。逐条为审计表 #1–9、#17、#21–33；本批 #10–16、#18–20 均未复现。施工前 **33** 为工单记录基线；因共享在途树不可回退，未在整库独立复跑旧态，故不将 `33→23` 称作双态整库实测。当前独立实测为 23，diff 恰移除 10 条。 |
| `npx eslint` 点名上述八文件 `--max-warnings 0` | 退出 0，零输出。 |
| `npx vitest run games/game-simlife` | 退出 1；7 文件、**52/56** 通过。`game-simlife.test.ts:478`、`:493` 仍索取旧 `life-host-advance-day/time`，`:501` 点击不存在的旧控件，`:529` 读取已无的 `top.layout.height`。四条均不因 specifier 改写产生；当前 HUD 正并行施工，本复查不改其断言或合同。 |
| `npx tsc --noEmit --pretty false` | 退出 1；**10 条**诊断在 `src/authoring/gal-*`、`src/services/gal-ui/*`、`src/studio/AuthoringStudio.tsx`，八文件零命中；这不是整库类型绿灯。 |

`git diff` 给出 LF→CRLF 未来 checkout 提示，未显示语义外改动；depcruise 的 module/dependency 总数相对自检增加，符合共享树并行施工，本报告只采用本轮实际退出码和诊断。没有绕过围栏或扩大规则白名单。

## 撤修验红（隔离副本，无共享源码改写）

先在原 `games/game-simlife/world-interaction.ts:2` 与独立探针副本各确认 `export * from '@zerocraft/engine/engine/host/life-interaction.js';` 锚点**唯一命中 1 次**。在工作区之外的任务级临时探针中，复制现行 `.dependency-cruiser.cjs`、同名包 exports、最小 `src/engine/host/life-interaction.ts` 和游戏 re-export；以仓内 dependency-cruiser CLI 运行：现态 **0 errors、exit 0**（2 modules / 1 dependency），只将探针 re-export 改回原相对越界路径后出现**唯一 `games-no-relative-escape`、1 error、exit 1**，恢复包名再跑 **0 errors、exit 0**。已删除探针全部文件，检查临时目录无遗留文件；共享工作树八文件全程未破坏。该探针证明本围栏规则对本批锚点有效，但不伪称在隔离探针中复跑了整库 33→23。

未决 #17 与 #21–33 涉及 authoring 公开入口/engine host 层向及旧档、确定性和 HUD 冻结合同，明确**不归本批**；不得据本判词关闭全库围栏或推进这些共享变更。
