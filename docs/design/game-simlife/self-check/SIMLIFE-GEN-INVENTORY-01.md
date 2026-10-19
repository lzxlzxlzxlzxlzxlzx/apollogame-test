# SIMLIFE-GEN-INVENTORY-01 施工自检

日期：2026-10-14  
施工主体：BDM程序  
结论：施工完成，等待非施工人独立复查。

## 架构结论

接受“新增 authoring 审阅投影”，回驳新增 runtime inventory、游戏私有解释器或 UI 字段。`LifeInventoryReview v1` 只从已通过 `checkLifeGenerationBundle()` 的 `itemCatalog`、`playerInventory`、crop/resource/construction 引用和 AssetSlot draft 单向派生；不写 World、save、hash、AssetIndex、素材或 Host。标题只使用与共享 Host 相同的稳定 id fallback，不引入内容特例。

## 实现证据

- `src/authoring/life-inventory-review.ts`：闭集 v1 schema、builder、严格 transport validator/parser。Bundle 非法时只返回路径级 diagnostics，不返回 review；合法时绑定 canonical input hash，保持 authored catalog 顺序，并输出 slots/usedSlots/maxStack、完整初始栈、同 item 全堆求和的 starterCount、starter/crop/resource/construction/catalog-only 来源与精确 item icon consumer/status。
- `scripts/life-gen-check.ts --inventory-review`：只读 CLI 审阅入口。魔王城候选实跑 `valid:true`，4 个 item 均绑定精确 `/itemCatalog/<index>/skinKey`，状态均为 placeholder。
- `src/authoring/life-generation-bundle.ts`：Packet 2 写死 inventory-design-first、容量/初始物/循环产消、catalog/skinKey/slot 闭合、placeholder 与 Host-only panel 边界。
- `src/authoring/life-generation-gate.ts`：Actors 闭集新增并强制 `inventory-review` artifact；缺失即 `inventory_review_required`，pending/changes-requested 的原有相邻 gate 规则保持不变。
- workflow、SOP 与 `simlife-generation` skill 已同步同一口径。

## 测试与门禁

- `npm.cmd exec vitest -- run src/authoring/life-inventory-review.test.ts src/authoring/life-generation-bundle.test.ts src/authoring/life-generation-gate.test.ts`：3 files / 33 tests PASS。
- `npm.cmd exec tsc -- --noEmit`：初次本单状态 PASS；返修最终复跑时被共享工作树并发出现的 `src/services/gal-ui/gal-ui-slice-host.ts:245` `GalUiPreferenceChange` 类型错误阻断，本单 authoring 文件无 TypeScript 诊断。
- `npm.cmd run lint`：PASS。
- `node scripts/docs-ref-guard.mjs`：`DOCS-REF: PASS`。
- `node scripts/context-budget-guard.mjs`：`CONTEXT-BUDGET: PASS`。
- `npm.cmd run life-gen-check -- docs/design/game-demon-castle/bundle.candidate.json --inventory-review --diagnostics json`：Bundle `ok:true`，inventory review `valid:true`，canonical input hash `sha256:269834096d48c09424bf6256661c8ae0538f098c94a4b7f21c5b848deea5ffa8`。
- `node scripts/scoped-gate.mjs --run`：分类为共享面 FULL；能力审计与 ratchet 通过，随后在仓库已有 33 条 dependency-cruiser 违规处停止。失败清单与此前共享 dirty worktree 基线一致，本单没有新增依赖违规；定向 tsc/lint/tests/docs gates 已独立通过。

覆盖的拒绝路径包括：缺/错 item visual consumer、未知 starter、slots/maxStack 越界、非法 resource source、陈旧 inputHash、伪造 item row；Little Valley 与 Demon Castle 均为正例，原 Bundle compile/two-tick snapshot/hash/restore 回归保持通过。

## 撤修验红

初审发现合法的重复 initial stacks 会被旧 `find()` 低报。返修后容量新增 `usedSlots`，`starterStacks` 保留逐堆原值，每行 `starterCount` 对同 itemId 全堆求和。撤修时临时恢复旧 `find()`，运行唯一锚点 `preserves duplicate starter stacks while reporting their exact used slots and summed item total`，断言从期望 `8` 精确转红为实际 `3`；恢复 `reduce()` 后同锚点 PASS。探针未留下源码改动。

## 待复查

复查人必须独立复跑上述测试与魔王城 CLI，并自行执行带锚点的撤修验红；不得采信本自检作为证据。重点核对 authored order、来源不猜测、精确 pointer、stale hash、Actors artifact 强制与 runtime 隔离。
