# DEMON-CASTLE-UI-ASSET-IMPORT-01 · 复查导航

复查人须与施工人不同，并独立执行：

1. 复算候选 source hash、7 个运行时 PNG hash 与 `approval-ledger.json` / `art/index.json` 一致性。
2. 核对追踪框裁切严格为 `(27,209,562,197)`；六个图标严格为 2×3 的 512px 固定网格，且没有文字或不明来源。
3. `parseAssetIndex` 与 `registerAssetIndex` 必须能注册全部七个 key；核对 `hudChrome` 没有被误登记。
4. 复跑 `src/assets/asset-index.test.ts`，并复现/核验 `demon-castle-playtest-contract.test.ts` 的当前 index-count 漂移由后续 Host 接线工单处理。
5. 在 `DEMON-CASTLE-UI-RUNTIME-01` 消费六图标前，不得把本单的“资产物化 PASS”表述为“HUD 已完成”。

施工自检：[DEMON-CASTLE-UI-ASSET-IMPORT-01](../self-check/DEMON-CASTLE-UI-ASSET-IMPORT-01.md)。
