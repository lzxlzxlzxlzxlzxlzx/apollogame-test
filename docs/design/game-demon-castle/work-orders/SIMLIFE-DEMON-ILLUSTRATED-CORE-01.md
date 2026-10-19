# SIMLIFE-DEMON-ILLUSTRATED-CORE-01｜获批新版核心美术接入

- 状态：已完成（独立复查 PASS；初版低分 nearest MAJOR 已返修，2026-10-13）
- 施工主体（本地文件锁）：`/root/surface_asset_import`
- 复查主体：非施工人独立复查
- 授权：Owner 已明确批准下列五个候选方向；仅在严格槽位、许可、溯源、规格与闭包均成立时正式接入。

## 范围与边界

候选目录：`docs/design/game-demon-castle/assets-candidates/2026-10-13-illustrated-core/`。

可接入候选：玩家、月影庭院地块、石像鬼工匠、森林拱门；王座厅候选须先确认存在对应消费槽。只允许更新本地美术库、索引、批准溯源台账及其资产槽/视觉目录数据；不改玩法、模拟、存档或 hash；保留旧文件，不删除。

## 验收

1. 每个接入项的候选原始 SHA-256、许可、生成来源、输出尺寸、透明度、绑定 slot 和运行时 consumer 全部可追溯。
2. 四项正式文件分别符合 illustrated slot contract：player/NPC 384×512 transparent linear、courtyard 256×256 opaque linear、forest arch 512×512 transparent linear；逻辑 display 仍为 1×1.5、1×1、2×2 cell。
3. 本地 `art/index.json`、approval ledger、严格 slot/闭包检查以及 bundle/host 相关回归通过。
4. 若 `building-ruined-throne-hall-v1` 没有同 key 的正式槽位/consumer，不登记为孤儿；候选保持原地并明确记录原因。

## 施工结果

- 已通过既有 `stagePendingAsset → reviewPending(approve)` 审批门更新四个既有 key，再经受控 `life-materialize --plan-update/--update` 写入正式四文件；旧运行时文件仍保留。
- 正式新文件分别为 `sprites/player-moon-demon-three-head-v3-illustrated.png`、`tiles/tile-moon-courtyard-neutral-v2-illustrated.png`、`sprites/npc-gargoyle-artisan-three-head-v1-illustrated.png` 与 `buildings/building-forest-arch-neutral-v1-illustrated.png`。
- `building-ruined-throne-hall-v1.png` 未有精确 `art:demon-castle:building:ruined-throne-hall` 槽位或 consumer；未复制、未登记、未重绑现有 `throne-hall`，候选保留在原目录。
- 施工自检：`docs/design/game-demon-castle/self-check/SIMLIFE-DEMON-ILLUSTRATED-CORE-01.md`；复查导航：`docs/design/game-demon-castle/review/SIMLIFE-DEMON-ILLUSTRATED-CORE-01.md`。

