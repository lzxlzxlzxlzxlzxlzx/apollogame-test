# SIMLIFE-DEMON-ILLUSTRATED-CORE-01｜独立复查导航

施工人：`/root/surface_asset_import`  
复查人：模拟经营策划（非施工人）  
状态：**PASS（2026-10-13）**。初版将插画候选压缩为 nearest 像素规格，独立复查判为 MAJOR 并退回；返修后才通过。

## 独立核证实录

- 独立复跑 `demon-castle-playtest-contract`、`life-bundle-compose`、asset-slot guard、game-art load、Life art direction 与 Bundle validator：**6 files / 56 tests PASS**；游戏资产槽位守卫 PASS。
- 重算四项运行时字节哈希并与 index provenance 对齐：玩家 `384×512 transparent linear`、庭院 `256×256 opaque linear`、石像鬼 `384×512 transparent linear`、森林拱门 `512×512 transparent linear`；所有源图为 `life.illustrated-2d.v1`。
- 槽位核对：玩家/NPC `1×1.5 cell`，庭院 `1×1 cell`，拱门 `2×2 cell`；原 anchor 与 consumer 未漂移。`life.json` 中无 `ruined-throne-hall`，旧四张运行时 PNG 均仍存在。
- 撤修验红：临时将正式 index 的森林拱门 sampling 从 `linear` 改为 `nearest`，新增 illustrated-core 回归精确变为 **1 failed / 3 passed**，并指出该 key 的期望/实际 sampling；立即还原后 **4/4 PASS**。

## 必须独立核验

1. 读 `candidate-review.json`、`approval-ledger.json` 与本地 `art/index.json`；确认四个 materialized key 的 source hash、content hash、slotId、brief fingerprint、license、`model: codex-imagegen` 与 reviewer/owner decision 相互一致，且没有虚构 API 模型或 prompt。
2. 用 `decodePng` 或同等工具读取四个正式路径；确认尺寸 / alpha / sampling 为 player 384×512 transparent linear、tile 256×256 opaque linear、NPC 384×512 transparent linear、arch 512×512 transparent linear；分别复算 SHA-256 并比对 index。
3. 读 `games/game-demon-castle/asset-slots.json` 与 `life.json`；确认每项保留原有 key，slot 的 display 仍为 player/NPC 1×1.5、tile 1×1、arch 2×2 cell，锚点未漂移，且没有 gameplay/sim 数据变更。
4. 明确检查没有 `art:demon-castle:building:ruined-throne-hall` 正式 index 条目或 `public/.../art/**` 新拷贝；它无严格消费槽，不能把候选偷换进 `building:throne-hall`。
5. 确认旧 `player-moon-demon.png`、`tile-moon-courtyard.png`、`npc-gargoyle-artisan.png`、`building-forest-arch.png` 仍在磁盘，替换可回滚。

## 建议命令

```text
npx vitest run src/authoring/demon-castle-playtest-contract.test.ts src/authoring/life-bundle-compose.test.ts scripts/asset-slot-guard.test.ts src/assets/game-art-load.test.ts --reporter=dot
npx vite-node scripts/asset-slot-guard.ts game-demon-castle
node scripts/asset-reconcile.mjs game-demon-castle --json
```

阅读 reconcile 输出时仅评估 `game-demon-castle` scope；该脚本会额外暴露已知的跨项目基线项。

## 撤修验红建议

临时把本单任一 index 条目（例如 player）的 `provenance.contentHash` 改成全零，运行 `demon-castle-playtest-contract.test.ts` 的 asset closure 用例应精确失败于该路径 hash；立即恢复。再临时把已审 player `sampling` 改为 `nearest` 或 `spec.width` 改为 32，新的 illustrated-core 合同用例必须红；恢复后全绿。不得留下 marker、临时文件或任何候选/旧文件删除。

