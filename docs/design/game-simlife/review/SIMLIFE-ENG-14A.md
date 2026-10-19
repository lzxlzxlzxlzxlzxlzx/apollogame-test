# SIMLIFE-ENG-14A Review 单

## 复查结论待填

- 施工人：BDM程序
- 复查人：本会话策划（非施工主体）
- 状态：✅ 已独立验收（2026-10-09）
- owner 裁决：A——补通用 authoring-only `AssetSlotBrief`、Life render-only visual contract 与唯一 pending→人审→approved 接缝。

## 施工范围

- `src/assets/asset-slot-brief.ts`、`src/assets/index.ts`：严格 v1 brief、稳定 fingerprint、三文件闭包、pending/approval 旁路守卫、runtime 安全投影。
- `src/renderer/canvas-renderer.ts`：Life 的 tile/crop/player/NPC/building/resource 六类统一消费 anchor/size/fit/offset/sampling；未配置时保留旧路径。
- `games/game-simlife/little-valley.asset-slots.json`、`game-simlife.ts`：21 个现有 placeholder key、23 个消费指针；不创建或登记资产。
- `scripts/asset-slot-guard.ts`、`scripts/ai-gen.mjs`、`scripts/art-replace.mjs`：只读闭包门、approval-time PNG 元数据实检、真实生成仅进 pending、批准后才接 active index/ledger。
- 文档与点名测试：`docs/design/asset-slot-brief.md`、assets/art playbook、四处测试文件。

## 独立复跑

工作目录：`C:\Users\24652\Desktop\projects\games\ApolloGame-complete\ApolloGame-claude-mainbranch`

```powershell
npx vitest run src/assets/asset-slot-brief.test.ts games/game-simlife/asset-slots.test.ts src/renderer/canvas-renderer.viewport.test.ts scripts/ai-gen.test.mjs scripts/art-replace.test.mjs
npx vite-node scripts/asset-slot-guard.ts game-simlife
npx vite-node scripts/asset-slot-guard.ts game-simlife --probe
```

施工人实跑结果：5 files / 105 tests passed；守卫 PASS（21 slots、23 consumers、0 approved、21 placeholders）；probe 按预期红并精确观察到 `approval_bypass,consumer_mismatch,missing_slot`。

## 必查断言

1. 任意 unknown field、`stretch`、named atlas frame、伪造 fingerprint、approved 无 sha256 必须拒绝。
2. Life visual key、slot assetKey、consumer JSON pointer、local AssetIndex 必须闭包；尺寸/usage/colorSpace/alpha/license 不匹配必须拒绝。
3. `compileLifeVisualCatalog()` 产物不得含 prompt/provider/path/license/bytes，Life package / World / snapshot 不得新增这些 authoring 字段。
4. 非 mock 的 art-replace 只能写 `ai/pending`，不得提前写 final 文件、active index 或 skinKey；approve 必须补 `approvedAt/reviewedBy/contentHash` 并实检 PNG 尺寸与 alpha。
5. `assets/index.json`、`public/games/game-simlife/art/index.json` 与真实资产目录不得因本单发生内容变更；后续真实资产严格交 `asset-manager`。
6. 撤修验红不得只看退出码：必须确认 probe 输出包含三种预期错误码。

## 已知全库基线阻断（非本单修改）

- `npx tsc --noEmit --pretty false` 与 `npm run build` 被 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx` 的既有类型错误阻断；本单文件无新增类型错误。
- 全量 vitest 施工时为 599 test files passed / 12 failed、5689 tests passed / 22 failed、6 snapshots failed；失败集中在既有 art-ledger/pipeline/Python 缺失/snapshot/cycle/capability/skill-shape 等范围外基线。
- 不得用本单顺手修复上述他人范围；复查时需核对点名测试与 guard 的独立退出码。

## 独立复查结论（2026-10-09）

- 独立复跑 schema、Little Valley slots、renderer visual plan、ai-gen 与 art-replace：**5 文件 / 105 测试**全部通过。测试生成的 mock 仅位于系统临时目录，已自清理；未产生仓内真实资产。
- 独立运行闭包守卫：`21 slots / 23 consumers / 0 approved / 21 placeholders`；探针精确观察到 `approval_bypass`、`consumer_mismatch`、`missing_slot`。
- 独立撤修：把草地 slot 的 asset key 临时改为未匹配 key；工具派生 fingerprint 立即不匹配并 fail-closed。精确恢复后 guard 再次通过，说明槽声明不能被模型/人工静默篡改。
- 审核：Little Valley `public/games/game-simlife/art` 下未出现 `ai/pending` 或 `gen` 资产；本单只声明现有 placeholder slots，未新增、导入或登记图像。
- 结论：**PASS**。运行时仅消费闭集 visual rule；生成 prompt、许可、路径和字节仍隔离在 authoring/审核侧，不进入 Life World、snapshot、hash 或 save。
