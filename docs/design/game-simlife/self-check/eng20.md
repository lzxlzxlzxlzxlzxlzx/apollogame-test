# SIMLIFE-ENG-20 自证｜移动速度与输入稳定性

日期：2026-10-10  
施工主体：BDM程序

## 结论

- Little Valley 的 authoring 值已由 `movement.speed: 0.18` 调为 `0.3` 格/模拟 tick；固定 4 tick 的连续 `Transform` 位移为 `1.2` 格，严格大于旧基线 `0.72` 格。
- 共享输入 reducer 将方向键 browser repeat 与重复 held-code keydown 收敛为纯 no-op：不关闭菜单/对话、不重复 start，也不重新占有已经被交互键清空的 held state。
- E/Tab/Enter/Escape/N/T 首次 keydown 仍先按方向唯一释放 `life.move.stop`，随后发出各自语义；这些键的 repeat 在释放判断前即归零副作用。
- 真实 Little Valley world 的交错回归证明 `LifeContinuousMotion.right` 与 `Velocity` 按 `start → Tab → direction repeat/up → fresh direction → up` 收敛为 `true/0.3 → false/0 → false/0 → true/0.3 → false/0`。
- WASD/Arrow 同向别名只在最后一个实际 held code 释放时 stop；blur/visibility 清空后，迟到 keyup 不会停止新的合法别名。
- 未新增 capability/system/phase 或游戏层积分；DOM adapter 仍只投递 reducer 产出的 queued semantic action / render-local interaction operation。纯 reducer 的 browser repeat no-op 不属于 sim 决策，未新增高噪声 DebugTrace；既有 dialogue movement-lock reject trace 保持不变。
- 相机 safety-zone/dead-zone 未施工、未绕过。

## 验证实证

- 相关回归：`life-continuous-motion + life-host + life-game-host + Little Valley raw JSON/game/world-interaction`，**6 files / 74 tests passed**。
- 本单涉及 TS 文件 ESLint：exit 0，零 warning。
- `node scripts/docs-ref-guard.mjs`：`DOCS-REF: PASS`。
- `npx vite-node scripts/system-graph-audit.mjs t2-life-input t2-life-continuous-motion t1-motion-apply`：相关子集 5 systems，无环；全局 119 systems、零重复 id、零悬空显式边；`SYSTEM-GRAPH: PASS`。
- `node scripts/game-skill-audit.mjs game-simlife`：未覆盖红旗 0，`RATCHET: PASS`；薄游戏目录的“零能力接入”仍为既有静态扫描 warning。
- 全库 `npx tsc --noEmit --pretty false` 仍被既有 `game-dice`、`game-theft` 与 `src/launcher/game-runner.tsx` 类型错误阻断；输出未命中本单文件。

## 撤修验红

1. 输入锚点 `if (event.repeat || state.heldCodes.includes(event.code))` 在 `life-input.ts` 精确命中 1 处。临时撤掉 `event.repeat ||` 后，点名用例 `ignores a stale direction repeat after interaction, then restarts only on a fresh keydown` 精确 **1 failed / 21 skipped**，实际重新产生 `interaction.close + life.move.start:right`；恢复后锚点仍唯一且 **1 passed / 21 skipped**。
2. 速度锚点 `"speed": 0.3` 在 Little Valley JSON 精确命中 1 处。临时退回 `0.18` 后，点名速度用例精确 **1 failed / 19 skipped**；恢复 `0.3` 后锚点仍唯一且 **1 passed / 19 skipped**。

撤修内容均已精确恢复；未遗留 sabotage marker 或临时文件。
