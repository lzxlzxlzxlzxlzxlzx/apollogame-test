# SIMLIFE-VISUAL-01 Review 单｜素材槽位渲染消费验收与类型收口

## 1. 状态与边界

状态：**✅ PASS（非施工人独立复查）**。

- 施工主体：BDM程序（锁）。
- 架构结论：既有 AssetSlot/index/AssetManager/catalog/Canvas 消费链完整；本单只消除测试 double 的 TS2352 并强化端到端机器证据，不扩写生产能力。
- 永久变更面：`games/game-simlife/art-consumption.test.ts`、`games/game-simlife/asset-slots.test.ts`、本单 self-check/Review/游戏级工单。
- 禁止面：共享 renderer/assets、真实 art index/文件、Life JSON、World/snapshot/save、UI/launcher、数据库、服务、Git/GitHub。

## 2. 独立复查清单

1. 独立确认 `RecordingContext` 是显式的非 `any` 测试 double，且全量 tsc 不再出现 `art-consumption.test.ts:52 TS2352`。
2. 独立确认 visible consumer key 集与 visual catalog key 集精确相等；catalog 只含 `LifeVisualRule` 的 render-only 白名单字段，不泄漏 generation/governance/path/license/provider/model/contentHash。
3. 独立确认正例走真实 index JSON → `loadLifeDemoArtInto` → `AssetManager.resolve` → `CanvasRenderer`，不是测试直接手造 resolved asset 或 projection。
4. 独立确认草地、成熟作物、镇长、活动玩家的 source/destination/anchor 与 draw 顺序断言真实约束消费链。
5. 独立确认负例只删内存 index 副本中的 player 注册；其他图片仍绘制，player 无 `drawImage`、命中精确语义 fallback，且 snapshot/order hash 不变。
6. 独立复跑点名与相关 host/catalog/renderer 回归、ESLint、tsc 基线、audit/align-count，并逐条读取 warning。
7. 独立以唯一 player AssetManager lookup 锚点做撤修验红；预期正例精确转红，恢复后绿，最终锚点 1 / marker 0。

## 3. 施工实证（仅作导航，不构成 Review 结论）

- 点名：**2 files / 5 tests passed**；game-simlife 全集：**6 files / 54 tests passed**；扩展相关回归：**12 files / 120 tests passed**。
- 相关 ESLint exit 0、零 warning；tsc 中本单命中由 1 降为 0，仅余既有无关基线。
- `npm run build` 仅被同一批既有无关 tsc 基线阻断；DOCS-REF PASS。context-budget 只报既有 galgame/card-reveal 游戏级工单超限，共享池自身合法。
- `game-skill-audit` 未覆盖红旗 0、`RATCHET: PASS`，有既有薄宿主“零能力接入”黄项。
- S4 对齐账 **60 ✅ / 0 ⚠ / 0 ❌**，exit 0；本单无视觉变更，未启动服务或伪造截图。
- 施工方撤修：临时破坏 player 的 AssetManager lookup 后点名正例 **1 failed / 1 skipped**；恢复后 **1 passed / 1 skipped**；最终锚点 1 / marker 0。
- 自证全文：`../self-check/visual01.md`。

## 4. 独立复查结论

**PASS。Blocker 0 / Major 0 / Minor 0，建议策划收束。**

### 4.1 架构与实现核证

- 接受本单：生产链仍是唯一既有链 `little-valley.life.json skinKey → AssetSlot manifest → public art index → loadLifeDemoArtInto/loadGameArtInto → parse/registerAssetIndex → AssetManager.resolve → CanvasRenderer`。永久实现没有新增 loader、渲染分支、资产字段或 gameplay capability。
- `games/game-simlife/art-consumption.test.ts:45` 的 `RecordingContext` 显式声明 `drawImage/arc/fill/globalAlpha/imageSmoothingEnabled`，动态 Canvas 成员使用 `[key:string]:unknown`；`recordingContext()` 先构造完整显式对象，再由 Proxy 补 spy。文件无 `any`，只在 DOM 边界经 `unknown` 转为 `CanvasRenderingContext2D`。全量 tsc 已不再命中旧 `art-consumption.test.ts:52 TS2352`，也未命中任何 game-simlife 文件。
- `asset-slots.test.ts` 从 raw Life JSON 递归提取全部 `*skinKey`，去重后的 visible consumer keys 与 `LITTLE_VALLEY_VISUAL_CATALOG.keys()` 精确相等；21 个 slot / 23 个显式 consumer 仍通过 closure。每条 catalog rule 的字段集合精确限制为 `slotId/assetKey/kind/sourcePx/frameIndex?/display/anchor/fit/offset/fallbackRole/sampling`，未携带 generation、governance、prompt、negativePrompt、briefVersion、styleId、path、license、provider、model、generatedAt 或 contentHash。
- 正例不是手造 resolved asset：原始 `public/games/game-simlife/art/index.json` 经真实 fetch URL、`loadLifeDemoArtInto`、`parseAssetIndex/registerAssetIndex`、`AssetManager.loadAll/resolve` 后进入 `CanvasRenderer`。草地、成熟芜菁、镇长与活动玩家均约束 source rect、slot display/fit/anchor 派生的 destination rect；独立 planner 用例另以常量结果约束 cover/contain/anchor/offset，避免仅用同一函数自证数值。绘制顺序实证为 tile < crop < depth-sorted placement < 活动玩家。
- 负例只从内存 index 副本删除 player id，未改正式 index；其他草地图仍绘制，player 没有 `drawImage`，精确命中一次以玩家 center/radius 绘制的圆形 semantic fallback。正负两例都证明渲染前后 `hashWithOrder(snapshot,snapshotOrder)` 不变。

### 4.2 独立复跑与 warning

- `npx vitest run games/game-simlife/art-consumption.test.ts games/game-simlife/asset-slots.test.ts`：exit 0，**2 files / 5 tests passed**。
- `npx vitest run games/game-simlife`：exit 0，**6 files / 54 tests passed**。
- `npx vitest run games/game-simlife src/assets/asset-slot-brief.test.ts src/assets/asset-manager.test.ts src/assets/asset-index.test.ts src/assets/game-art-load.test.ts src/engine/host/life-game-host.test.ts src/renderer/life-scene-render.test.ts src/renderer/canvas-renderer.viewport.test.ts`：exit 0，**13 files / 139 tests passed**。
- `npx vitest run src/launcher/life-launcher-catalog.test.ts`：exit 0，**1 file / 11 tests passed**。
- `npx eslint games/game-simlife/art-consumption.test.ts games/game-simlife/asset-slots.test.ts --max-warnings 0`：exit 0，零 warning。
- `npx tsc --noEmit --pretty false`：exit 1；完整输出仅含既有 `game-card-reveal`、`game-dice`、`game-theft` 与 `src/launcher/game-runner.tsx` 类型红，**game-simlife 零命中**，旧 TS2352 已消失。
- `npm run build`：exit 1；同一批既有无关 tsc 基线阻断，Vite 未开始；game-simlife 零命中。
- `node scripts/docs-ref-guard.mjs`：exit 0，**46 Markdown / 393 paths，DOCS-REF: PASS**。
- `node scripts/context-budget-guard.mjs`：终态 exit 1；共享池 **8/10、22980/25000** 合法，仅既有 `galgame/requests.md`（终态观测 **49634/45000**）与 `game-card-reveal/requests.md` **57152/45000** 超限。
- `node scripts/game-skill-audit.mjs game-simlife`：exit 0；未覆盖红旗 0、`RATCHET: PASS`。已读取唯一黄项：薄宿主静态扫描显示“零能力接入”；本单没有新增或扩大该既有黄项。
- `node scripts/asset-reconcile.mjs game-simlife`：exit 0，**RECONCILE: PASS（三方一致）**。
- `node scripts/align-count.mjs --game game-simlife --stage S4`：exit 0，**60 ✅ / 0 ⚠ / 0 ❌**。
- Vitest 输出无测试 warning。受限沙箱会在收集前因 `vitest/dist/spy.js` realpath EPERM 失败；独立复跑使用相同短生命周期测试命令在允许的文件系统上下文执行，未启动服务，也未把环境错误计绿。

### 4.3 独立撤修验红与残留

- 撤修前精确锚点 `const resolved = this.assets?.resolve(key, rule?.frameIndex);` = **1**，独有 marker `SIMLIFE-VISUAL-01-REVIEW-SABOTAGE` = **0**。
- 用 `apply_patch` 临时只让 `art:little-valley:player:farmer` lookup 返回 `undefined` 后，正例点名精确转红：**1 failed / 1 skipped**，错误为玩家 `expectDrawPlan` 的 `expected undefined to be defined`；草地、作物与镇长路径未被破坏。
- 用 `apply_patch` 精确恢复后，同一点名 **1 passed / 1 skipped**；随后终态重新取得 **2/5、6/54、13/139** 全绿。最终锚点 **1**、marker **0**，共享 renderer 无永久复查改动。

本单没有画面、素材、布局或交互变更，不伪造新截图，也未启动服务。未执行 Git/GitHub、数据库、网络模型、素材生成/导入/移动或资产审批；未修改 roadmap。

### Lead 复查复跑（2026-10-11）

**PASS。** 复查人独立复跑 2 文件 5 测试与相关 13 文件 139 测试，全部通过；全量 TypeScript 检查中 `game-simlife` 已无错误。临时让 renderer 仅对 player key 跳过 AssetManager lookup 后，正例精确失败（`1 failed / 1 skipped`）；恢复唯一 lookup 后为 `1 passed / 1 skipped`，无临时逻辑残留。

本单证明的是既有素材槽位的消费与缺图回退，不是对素材质量、许可或人审的批准；后者仍留在 asset-manager 与 owner 流程。
