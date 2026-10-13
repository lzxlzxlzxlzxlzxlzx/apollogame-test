# SIMLIFE-ENG-16A Review 单

## 结论请求

请由非施工人独立复查 `LifeGenerationBundle v1` authoring-only 收件/诊断实现。施工人：BDM程序。当前结论：定向验收绿，等待独立复查；不得仅采信本单自陈。

## 范围与边界

- 核心：`src/authoring/life-generation-bundle.ts`
- Little Valley 转换 fixture：`src/authoring/life-generation-bundle.fixture.ts`
- 核心测试：`src/authoring/life-generation-bundle.test.ts`
- CLI：`scripts/life-gen-check.ts`、`scripts/life-gen-check.test.ts`、`package.json`
- 文档：`life-generation-sop.md`、`life-json-authoring.md`、`capability-plan.md`、`requests.md`
- 未改 runtime protocol/capability/registry/system；未写 `games/` / `public/`、AssetIndex/pending/art-ledger；未接模型/网络/服务；无 `--materialize`。

## 应逐条独立复跑的语义

1. Envelope 全闭集；id/slug/round/depth/text/array/map 有界；secret/provider key/bytes/base64/绝对/URL/穿越路径拒绝。
2. `baseHash` 覆盖 `{game,assetSlots}` canonical payload，source hash 分别覆盖 Life 与 draft；stale hash fail-closed。
3. 诊断顺序覆盖 Life strict/ref/RLE/spatial/quest/relationship → compile/registry/system graph → 隔离 Engine 2 tick → snapshot/order/hash/restore → AssetSlot schema/fingerprint/consumer closure；格式稳定且无 stack。
4. draft 只准 placeholder；无 approved/contentHash；不读写 AssetIndex。每个 Life visual pointer 必须被相同 key 的 slot consumer 精确覆盖。
5. Prompt Packet 0–4 各含机器 schema、allowlist、live ref table、forbidden、仅 JSON document/受限 patch output。
6. Repair 必须命中当前 diagnostic path、baseHash 相等、round < 8、patch 仅 add/remove/replace 且 ≤64。
7. dry-run plan 只列相对路径/hash/host template/launcher/asset-manager handoff，`writesPerformed:false`，无正式物化实现。
8. fixture 从 Little Valley 唯一 JSON 导入现场转换，未维护第二份内容副本；runtime snapshot 不含 session/provenance。

## 施工人实证（仅作导航）

- 最终定向回归：8 files / **55 tests passed**。
- CLI 集成：真实子进程读取临时 bundle，exit 0，JSON plan 为 `mode:dry-run` / `writesPerformed:false`，临时目录清理。
- 定向 ESLint：新增 5 个 TS 文件，0 warning / 0 error。
- `node scripts/docs-ref-guard.mjs`：`DOCS-REF: PASS`。
- `vite-node scripts/system-graph-audit.mjs`：116 systems；无重复 id、无悬空显式边；`SYSTEM-GRAPH: PASS`。
- registry/docs/CLI/core 组合：除既有 pipeline board 红外，其余 36 tests passed；既有红为 `game-lockpick` / `game-theft` / `game-simlife` 缺 `pipeline.json`，本单明确不改 pipeline。
- 全库 tsc 仍被既有 `game-dice`、`game-theft`、`launcher/game-runner` 类型错阻断；输出没有 `src/authoring` 或 `scripts/life-gen-check`。

## 撤修验红（必须由复查人重做）

- 锚点：`life-generation-bundle.ts` 的 `approved_forbidden` 分支；施工前 `rg` 精确命中实现 1 处、测试 1 处。
- 临时撤掉该分支，点名运行 `rejects unknown fields, secrets, unsafe paths, bounds, approved claims, and stale hashes`。
- 结果：1 failed / 7 skipped，精确失败为期望 `approved_forbidden` 未出现。
- 已用 `apply_patch` 恢复同一锚点；恢复后最终 55 tests 全绿。
- 数据破坏探针另将已覆盖 visual key 改为新 key，稳定出现 `missing_slot + consumer_mismatch`。

## 独立复查建议命令

```text
.\node_modules\.bin\vitest.cmd run src/authoring/life-generation-bundle.test.ts scripts/life-gen-check.test.ts src/assembly/life-package.test.ts src/assembly/life-package-compile.test.ts src/assembly/life-quest-validation.test.ts src/assets/asset-slot-brief.test.ts src/assembly/system-graph.test.ts games/game-simlife/life-demo-package-json.test.ts
.\node_modules\.bin\eslint.cmd src/authoring/life-generation-bundle.ts src/authoring/life-generation-bundle.fixture.ts src/authoring/life-generation-bundle.test.ts scripts/life-gen-check.ts scripts/life-gen-check.test.ts --max-warnings 0
node scripts/docs-ref-guard.mjs
.\node_modules\.bin\vite-node.cmd scripts/system-graph-audit.mjs
```

复查人还应自行做一次撤修验红，并读 stderr 中 system graph/topological warning，不能只看退出码。

## 独立复查结论（2026-10-09）

- 复查人：模拟经营游戏策划/Lead（非施工人）。
- 独立复跑：`npx vitest run src/authoring/life-generation-bundle.test.ts scripts/life-gen-check.test.ts src/assembly/life-package.test.ts src/assembly/life-package-compile.test.ts src/assembly/life-quest-validation.test.ts src/assets/asset-slot-brief.test.ts src/assembly/system-graph.test.ts games/game-simlife/life-demo-package-json.test.ts`，8 个测试文件、55 个断言通过。`system-graph` 的 stderr 为既有合成循环夹具预期告警，未影响退出码或本单链路。
- 撤修验红：临时移除 `life-generation-bundle.ts` 对资产槽 `approval !== 'placeholder'` 的拒收分支，再运行 `npx vitest run src/authoring/life-generation-bundle.test.ts -t "rejects unknown fields"`，得到精确的 `approved_forbidden` 断言失败（1 failed、7 skipped）；随后已逐字恢复该分支。
- 只读边界：对 bundle 核心与 CLI 以 `rg` 检查 `--materialize|writeFile|mkdir|copyFile|rename`，无命中；另独立复跑 bundle/CLI 测试，2 个文件、9 个断言通过，包含真实 CLI dry-run 输出的 `writesPerformed: false` 断言。
- 结论：PASS。该能力可安全接收、验证、审计和预演模型产出的 Life 包；它没有越权写入游戏、素材库或运行时。
