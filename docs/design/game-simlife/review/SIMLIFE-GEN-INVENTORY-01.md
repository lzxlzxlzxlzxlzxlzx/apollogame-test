# SIMLIFE-GEN-INVENTORY-01 独立复查导航

状态：**独立复查 PASS（2026-10-14）**  
施工主体：BDM程序  
复查人：待策划指定

## 复查范围

- `src/authoring/life-inventory-review.ts`
- `src/authoring/life-inventory-review.test.ts`
- `src/authoring/life-generation-bundle.ts` / `.test.ts` 的 Packet 2 增量
- `src/authoring/life-generation-gate.ts` / `.test.ts` 的 Actors inventory-review gate 增量
- `scripts/life-gen-check.ts`
- `docs/design/game-simlife/generation-workflow-v1.md`
- `docs/design/game-simlife/life-generation-sop.md`
- `.agents/skills/simlife-generation/SKILL.md`

## 必须独立验证

1. Little Valley 与 Demon Castle 正向 review，catalog authored order、slots/usedSlots/maxStack、starter count、crop/resource/construction 来源和 slot pointer/status 均来自当前 Bundle；重复 starter stacks 必须逐堆保留，row `starterCount` 必须为同 item 全堆总和。
2. 无来源只能是 `catalog-only`；不能由 kind/id 猜来源，也不能伪造 icon row。
3. Bundle gate 必须先行：未知 starter、slots/maxStack 越界、非法 crop/resource/construction 引用、缺精确 item slot consumer 都不得留下绿色 review。
4. review round-trip 闭集；input hash 或任一 row 漂移必须拒绝。
5. Actors gate 缺 `inventory-review` artifact 必须转红，owner pending 不得前进 Plot/Assets。
6. Packet 2 与三份规范均要求 inventory design first；`inventoryPanel` 只能在 Host opt-in，不得进入 Life package。
7. 原 Bundle compile、两 tick snapshot/hash/restore、determinism 与素材闭包保持不变。

## 建议命令

```text
npm.cmd exec vitest -- run src/authoring/life-inventory-review.test.ts src/authoring/life-generation-bundle.test.ts src/authoring/life-generation-gate.test.ts
npm.cmd exec tsc -- --noEmit
npm.cmd run lint
npm.cmd run life-gen-check -- docs/design/game-demon-castle/bundle.candidate.json --inventory-review --diagnostics json
node scripts/docs-ref-guard.mjs
node scripts/context-budget-guard.mjs
```

Review 四步仍须逐项完成：独立复跑、带锚点撤修验红、实证复现、阅读 warning。通过后填写真实判词并把路线图 review gate 更新为 pass；不得由施工人代签。

## 独立复查判词

复查者：模拟经营策划（非施工者）  
结论：**PASS**。

- 独立复跑：`life-inventory-review`、`life-generation-bundle`、`life-generation-gate` 共 3 files / 33 tests PASS；TypeScript、lint、文档引用与 context-budget 守卫均通过。
- 魔王城候选 Bundle 的只读 `--inventory-review` 输出 `valid:true`：每一行均按 catalog 顺序，拥有当前 input hash、精确 item `skinKey` consumer、placeholder 状态和可追溯的 starter/crop/resource/construction 来源；既有 compile warnings 为候选本身历史诊断，并未被本单吞掉或误报为通过。
- 初审发现的“重复初始堆叠低报”已实证修复：review 保留逐堆 `starterStacks`，`capacity.usedSlots` 反映占格，item `starterCount` 聚合全部同 ID 堆叠。
- 复查人亲自撤修：把 `reduce()` 临时改回只取首堆的 `find()`，唯一锚点 `preserves duplicate starter stacks while reporting their exact used slots and summed item total` 精确失败（期望 8、实际 3）；恢复后 7/7 PASS。
- Review 构造仅从 Bundle 单向派生；没有新 runtime inventory、Host/UI 字段、素材生成/审批/物化、AssetIndex、World/save/hash 写入。
