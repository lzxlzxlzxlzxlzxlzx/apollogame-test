# Little Valley 素材槽位与渲染消费独立复查

日期：2026-10-10  
复查范围：`visual-slot-consumption` 路线图里程碑  
复查人：Lead（非施工人）

## 结论

**独立复查通过，送 Owner 终审。** Little Valley 的可见游戏实体经由语义 `art:` key、AssetSlotBrief、本地 AssetIndex 和渲染消费端形成闭环；素材加载或绘制均不写入模拟世界、快照或存档。

## 独立实证

- 静态核对 `little-valley.asset-slots.json`、本地 `art/index.json` 与 `art-ledger.json`：21 个槽位、21 个本地登记项、21 条有消费槽的台账行；玩家、地形、NPC、作物、建筑、资源与物品均覆盖。
- `node scripts/asset-reconcile.mjs game-simlife`：三方一致，PASS。
- `node scripts/ledger-audit.mjs game-simlife --strict`：21 行、21 个消费槽、0 孤儿，PASS。
- 独立回归：`npx vitest run games/game-simlife/asset-slots.test.ts games/game-simlife/art-consumption.test.ts src/assets/game-art-load.test.ts src/engine/host/life-save.test.ts`：4 文件、19 测试通过。覆盖 key→本地索引→贴图绘制、未登记时语义回退、渲染不改变 snapshot/hash、存档边界与 authoring 元数据隔离。
- 撤修验红：临时把 `loadLifeDemoArtInto()` 的 `loadGameArtInto(...)` 替换为伪成功；点名用例 `loads the unchanged local index and draws grass, mature crop, mayor and player through their slot rules` 在 `fetch` 未被调用处精确失败。恢复加载器后上述 19 项回归再次通过。

## 范围边界

目前索引中的 SVG 都是已登记的本地占位/原创程序化素材，不代表 AI 候选已自动批准。后续「本地库匹配与 AI 候选素材管线」仍须坚持：未审核候选不可进入正式 AssetIndex 或替换已消费 key。
