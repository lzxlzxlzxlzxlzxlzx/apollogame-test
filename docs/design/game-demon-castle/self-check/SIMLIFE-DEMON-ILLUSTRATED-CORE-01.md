# SIMLIFE-DEMON-ILLUSTRATED-CORE-01｜施工自检

日期：2026-10-13  
施工人：`/root/surface_asset_import`  
结论：独立复查指出的低分辨率 nearest MAJOR 已返修。四个有精确消费槽的新版候选已按 illustrated 合同正式接入；等待非施工人独立复查。

## 零写入预检

| 候选 | 原始 SHA-256 | 原始尺寸 / alpha | 结果 |
| --- | --- | --- | --- |
| `player-moon-demon-three-head-v3.png` | `a13734e…edbaa` | 1024×1536 / transparent | 精确 player slot，归一化为 384×512 transparent linear，display 1×1.5 cell |
| `tile-moon-courtyard-neutral-v2.png` | `203b573…319ea` | 1254×1254 / opaque | 精确 tile slot，归一化为 256×256 opaque linear，display 1×1 cell |
| `npc-gargoyle-artisan-three-head-v1.png` | `adabe1e…b7199` | 1245×1263 / transparent | 精确 NPC slot，归一化为 384×512 transparent linear，display 1×1.5 cell |
| `building-forest-arch-neutral-v1.png` | `cb9941…04fb4` | 1254×1254 / transparent | 精确 arch slot，归一化为 512×512 transparent linear，display 2×2 cell |
| `building-ruined-throne-hall-v1.png` | `91b903…0c758` | 1536×1024 / transparent | **不接入**：无同 key `ruined-throne-hall` slot/consumer；现有 `throne-hall` 未被重绑 |

许可为 Owner 明确授权的 OpenAI/Codex 内置图像生成游戏内使用；候选捕获未保留原始 prompt，故 provenance 如实记为 `unavailable`，模型标签为真实可证实的 `codex-imagegen`，未虚构具体 API 模型。

## 物化与溯源

- 使用既有 `scripts/ai-gen.mjs` 导出的 `resizePngExact`、`validateTextureCandidate`、`stagePendingAsset` 与 `reviewPending`：先写 pending，再由批准门写入本地 index；返修按 illustrated profile 的 high-resolution outputPx 和 linear sampling 执行。
- 每一项都保留 source SHA-256、normalization 后 content SHA-256、slotId、brief fingerprint、candidate path、owner approval 与 `codex-imagegen` provenance。
- 受控正式更新只改变四文件组中的 `games/game-demon-castle/asset-slots.json`；`life.json`、host、launcher 的 canonical bytes 保持不变，未改玩法、模拟、存档或 hash；旧美术文件没有删除。

## 已跑门禁

1. `npx vitest run src/authoring/demon-castle-playtest-contract.test.ts src/authoring/life-bundle-compose.test.ts scripts/asset-slot-guard.test.ts src/assets/game-art-load.test.ts --reporter=dot`  
   结果：6 files / 56 tests PASS。覆盖 formal host mount、asset slot closure、索引 parse、每个正式字节 hash、bundle compose，并以精确回归锁定四项不可退化为 nearest 或低分辨率。
2. `npx vite-node scripts/asset-slot-guard.ts game-demon-castle`  
   结果：`ASSET-SLOT: PASS game=game-demon-castle slots=29 consumers=31 approved=0 placeholders=29`。这里的 placeholder/approved 是 slot authoring governance，非正式 local index；四个运行时 index 条目均为 `filled` 且 owner-approved。
3. `life-materialize --plan-update` 写后复验：`conflicts:[]`，currentFilesHash 与更新组同为 `sha256:4d08c1336ecfd7668aab1cc35b83537d211b0d3510926eafc6d56d9c38980b04`；严格 bundle canonical hash 为 `sha256:3a32400a7648a8eff01172afe0964d508be7290ca9187b6732a6f727b1ef0e44`。
4. 本地 hash/闭包探针：四项的内容 hash 与 index provenance 一致；尺寸分别为 384×512、256×256、384×512、512×512，sampling 全为 linear；确认没有 `art:demon-castle:building:ruined-throne-hall` index 条目。

## 非本单基线判读

`node scripts/asset-reconcile.mjs game-demon-castle --json` 当前会扫描全部 shared/game scope，报告 shared `fluentui/piñata_flat`、game-c 等既有失败与其他游戏 240 个 warning；输出中没有 `game-demon-castle` finding。该全库既有基线不由本单修改。

