# S2 能力计划刷新独立复查 · 2026-10-14

复查人：`/root/s2_refresh_review`（未参与 S2、S4 或本轮 S7 施工）。判词：**CONCERNS**。本单不写流程板、不代签 Owner 人门，也不代替 S7/S8 的合同实现或交付复查。

## 清单与范围

- 已先执行 `node scripts/game-pipeline.mjs checklist game-clue-investigation S2`，覆盖范围、实名 capability、解释器、游戏层例外与美术接入五项。
- 实查 `capability-plan.md:15-30,43-56,82-94`、`capability-gaps.json`、`dokiworld-contract-v1.md:13-43,184-251`、当前 `library/game-clue-investigation/manifest.json` 以及 `src/assets/host-visual-bridge.ts`。两个 P1 缺口为 delivered，且 `GCI-S2-01/02` 是工单标识；真实通用能力分别落在扩展的 `t2-clickable` 和 `HostVisualSession`，不是游戏层自由解释器。
- 当前 manifest 显式装载 12 个 capability，且严格装载时 `inferredCapabilities:false`、`warnings:[]`。所有调查、首次收录、完成与取消仍由 Flag/Resource/Effect/EventWhen/Flow 的声明数据解释；未发现游戏层 DOM、Canvas、随机或自写规则解释器。`node scripts/game-skill-audit.mjs game-clue-investigation` 为 `AUDIT: PASS / RATCHET: PASS`。
- 合同的两个 JSON fenced 示例均可 `JSON.parse`；合同仍明确 preview 不请求宿主 URL、不 complete，只有全部 required clue 首次收录才返回 completed，取消/非法输入/资源失败不结算，且宿主保持 requestId 幂等与业务权威。

## 独立复跑与告警

- `npx vitest run src/assets/host-visual-bridge.test.ts src/assets/asset-manager.test.ts src/skills/tier2/clickable.test.ts src/assets/import/hit-mask.test.ts src/assets/asset-index.test.ts src/assembly/validate-manifest.test.ts src/renderer/renderable.test.ts src/assembly/component-map.test.ts --reporter=dot`：**8 files / 125 tests PASS**。首次沙箱运行因 Windows `realpath ... vitest/dist/spy.js` 的 EPERM，零测试且未采信；受控本地复跑通过。
- `Get-Content -Raw library/game-clue-investigation/manifest.json | npx vite-node scripts/manifest-check.mjs --art-index library/game-clue-investigation/art/index.json`：exit 0，严格 parse/load/两 tick 通过，`warnings:[]`。未带 `--art-index` 的 stdin 调用会提示缺少 `games/stdin/art/index.json`；这是 CLI 缺少卡带上下文的预期告警，未将其误报为 manifest 通过。
- `node scripts/docs-ref-guard.mjs`：`DOCS-REF: PASS`（48 文档、401 路径）。

## 撤修验红（只在内存，未改生产源）

以 `capability-gaps.json` 内唯一锚点 `id === 'GCI-S2-01' && state === 'delivered'` 断言命中 **1**。用真实 `scripts/game-pipeline.mjs` 导出的 `evalCapabilityGaps` / `blockingGaps` 先确认基线为 `ok`，再仅对内存对象把该条状态改成 `open`：判定转为 `warn`，`blockingGaps(..., 'S3')` 精确只返回 `GCI-S2-01`。这证明缺口门不会因未裁决 P1 缺口假绿，也没有写入或恢复共享文件的风险。

## 关注项与结论

`capability-plan.md:21` 仍将 `j1-state` 列作消费能力；实际 manifest 的显式 capability 列表不含它，而以 `f1-resource` 的 `selected-object`（例如 `manifest.json:66-96,3324-3332`）表达该有限选择。这是计划与已实现纯数据重组的持续文档偏差，非游戏层自由代码、非合同语义破坏，也未改变 `completed/cancelled` 或动态 PNG/mask 的 fail-closed 边界。

因此维持 **CONCERNS**，不是 PASS：应在不改 Owner 已冻结合同的前提下更新能力计划，明确 `j1-state → f1-resource selected-object` 的实现偏差，或如认为该变更超出冻结范围则提请 Owner 裁决。S2 的缺口门本身已绿，但本判词不能被用作 S7/S8 已完成的证据。
