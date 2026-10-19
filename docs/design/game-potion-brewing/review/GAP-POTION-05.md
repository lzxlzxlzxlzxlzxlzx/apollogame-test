# GAP-POTION-05 / G5 独立复查

- 复查主体：Codex `/root/g5_review`（非 G5 施工者）；日期：2026-10-13。
- 判词：**PASS（G5 项目范围）**。此判词只覆盖有序步骤完成信号与炼药材料份数接线，不代替 S4 整关复查或 Owner 人门，也不宣称共享脏树的全库门禁通过。

## 范围与规格

核对 [G5 工单](../work-orders/GAP-POTION-05.md) 与本地变更：共享能力只触及 `src/engine/protocol/components/logic.ts` 的可选字段、`src/skills/tier2/ordered-action-session.ts` 与点名测试；游戏侧在 `games/game-potion-brewing/blueprint.ts` 将每个 add 步配置唯一完成信号，并由 Effect 扣 Resource、SelfRule 销毁耗尽实体、KeyBinding 门控，`screen.ts`/`game-potion-brewing.ts` 只读份数。事件手册已同步。未看到为本单新增游戏层规则 system 或触碰其它游戏。工作树另有并行项目改动，本单不评价或改写它们。

## 四步核证

1. **独立复跑。** `npx vitest run src/skills/tier2/ordered-action-session.test.ts games/game-potion-brewing/blueprint.test.ts games/game-potion-brewing/screen.test.ts src/net/host/queued-input.test.ts`：4 文件 **29/29 PASS**，退出码 0；包括同拍不同源两次正确投料分别扣一份、短弧/错误/终局不发、旧配置不多发、双跑同 hash 与快照续跑。`npx vite-node scripts/acceptance-run.mjs --game game-potion-brewing`：**5/5 PASS**，覆盖两方、错误、反向及重复材料。`npx tsc --noEmit --pretty false`：退出码 0。`npx vite-node scripts/system-graph-audit.mjs f1-resource k2-destroy t2-drag-place t2-clickable t2-keybind t2-angular-gesture t2-ordered-action-session t2-self-rule t2-effect-apply`：10 系统无 SCC、无悬空边/重复 id，退出码 0。
2. **锚点撤修验红。** 使用 Vitest/Vite `enforce:'pre'` 内存变换，先从 `ordered-action-session.ts` 读取并断言精确锚点 `if (step.completedSignal) emitOutput(world, owner, step.completedSignal,` **恰好命中 1 次**，再只把该分支改为 `if (false)`；变换命中计数 **1**。复跑能力测试得到 **1 failed / 12 passed**，失败于 `ordered-action-session.test.ts:140`：期望库存 0、实际 2。变换不写共享文件，结束后正常源码复跑为 13/13 PASS，证明点名测试能抓住缺失的完成信号。
3. **实证复现。** 独立短时 Vite `http://localhost:5701/?game=game-potion-brewing` + 隔离无头触屏浏览器，真实 CDP touchStart/move/end 拖材料到锅口；首份后 DOM 文案为“剩余 0”，选取 Button 真 `disabled`，再次触屏拖拽后仍为 0，页面错误 0。测试未写现有截图；浏览器/context 在 `finally` 关闭，5701 监听随后查无。代码侧 `ordered-action-session.ts:150` 只在正确计数达标时输出，信号 `source` 为会话实体，同拍排在 `effect-apply` 前；`blueprint.ts:94-106` 消费完成信号、扣份与耗尽门控，触屏可见结果与之吻合。
4. **逐条读告警。** UI 审计 `node tools/ui-audit.mjs games/game-potion-brewing/screen.audit.ts --w 1440 --h 900`：重叠 0、硬对比失败 0、对比警告 0、border-image 前提 0，退出码 0；报告“house 主题：否”是静态审计无法识别 `screen.ts:7` 对 `apolloBrocade` 的透明宿主派生，非自写默认 SHELL。`game-skill-audit` 退出码 0、红旗与棘轮均无；其两条非阻断提示为 S5 美术台账待接、`game-potion-brewing.ts:114` 的 `performance.now()` 仅供 render-only DragPreview 采样，不进入 sim/hash。系统图无 WARN。本仓全量 `scoped-gate` 的 depcruise 仍被 32 个并行 Life 项目违规挡住（施工方实测）；已移出的 `scripts/potion-s4-browser-probe.mjs` 不再产生本项目依赖违规，故不把该全库门描述为绿。

## 契约判断与剩余边界

`completedSignal` 在装载/运行同一 validator 下要求非空、≤128、逐步互异且不与输入/终局重名（`ordered-action-session.ts:25-31`）；旧配置无该字段时新的发射分支不进入，原终局输出 id 仍是 `ordered-action:signal:<owner>:success|failure`。同拍每步输出不同 id，下一 tick 按前缀清扫；未观察重复消费或跨 tick 泄漏。真宿主权威材料同步与最终 S5/S6 视觉、美术台账、DokiWorld 出包不属于 G5 此单，不以本 PASS 代签。
