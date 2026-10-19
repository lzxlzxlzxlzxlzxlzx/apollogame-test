# SIMLIFE-VISUAL-01 自证｜素材槽位渲染消费验收与类型收口

日期：2026-10-11  
施工主体：BDM程序

## 结论

- 接受本单且无需扩写引擎。既有生产链保持为 `AssetSlot/skinKey → public game art index → loadGameArtInto → AssetManager → LifeVisualCatalog → CanvasRenderer`；永久改动只补测试类型和机器证据。
- `RecordingContext` 现在显式提供 `drawImage`、`arc`、`fill`、`globalAlpha` 与 `imageSmoothingEnabled`，再由 Proxy 为其余 Canvas 方法生成 spy；已移除第 52 行从不完整对象直接断言为 `RecordingContext` 的 TS2352，未使用 `any` 或修改生产 renderer。
- visible consumer key 集与 `LITTLE_VALLEY_VISUAL_CATALOG.keys()` 精确相等；每条 rule 的字段集合被锁定为 render-only 白名单，明确拒绝 `generation/governance/prompt/negativePrompt/briefVersion/styleId/path/license/provider/model/generatedAt/contentHash` 泄漏。
- 真实 index 路径经 `loadLifeDemoArtInto` 注册到 `AssetManager`，草地、成熟作物、镇长与活动玩家分别验证 source rect、destination rect、slot display/fit/anchor 与 `tile → crop → placement → player` 深度顺序。
- 从内存 index 副本移除玩家登记后，其他草地贴图仍绘制、玩家不再 `drawImage`，Canvas 以玩家中心和半径调用一次语义圆形 fallback；渲染前后 `hashWithOrder(snapshot, snapshotOrder)` 不变。

## 验证实证

- `npx vitest run games/game-simlife/art-consumption.test.ts games/game-simlife/asset-slots.test.ts`：**2 files / 5 tests passed**。
- `npx vitest run games/game-simlife`：**6 files / 54 tests passed**。
- 相关消费回归（game-simlife、AssetSlotBrief/AssetManager/index/load、Life host/scene 与 Canvas）：**12 files / 120 tests passed**。
- `npx eslint games/game-simlife/art-consumption.test.ts games/game-simlife/asset-slots.test.ts`：exit **0**，零 warning。
- `npx tsc --noEmit --pretty false`：不再输出 `games/game-simlife/art-consumption.test.ts`；exit 1 仅剩既有无关 `game-card-reveal`、`game-dice`、`game-theft` 与 `src/launcher/game-runner.tsx` 类型错误。
- `npm run build`：同一批既有无关 tsc 基线令命令 exit 1，Vite 未执行；本单与全部 game-simlife 文件零命中。
- `node scripts/docs-ref-guard.mjs`：**DOCS-REF: PASS**（46 Markdown / 393 paths）。
- `node scripts/context-budget-guard.mjs`：共享池 **8/10、22980/25000** 合法；exit 1 只因既有 `docs/design/galgame/requests.md` 与 `game-card-reveal/requests.md` 超游戏级封顶。
- `node scripts/game-skill-audit.mjs game-simlife`：未覆盖红旗 **0**，`RATCHET: PASS`；完整读取到薄宿主静态扫描的既有“零能力接入”黄项。
- `node scripts/align-count.mjs --game game-simlife --stage S4`：**60 ✅ / 0 ⚠ / 0 ❌**，exit **0**。本单未改画面、素材、布局或交互，因此沿用且复核既有真渲染对齐证据，没有伪造新截图。
- 受限沙箱第一次 Vitest 在收集前因 `node_modules/vitest/dist/spy.js realpath EPERM` 失败；相同短生命周期命令在允许环境复跑后完整通过，无测试 warning。

## 撤修验红

- 精确锚点 `const resolved = this.assets?.resolve(key, rule?.frameIndex);` 在 `src/renderer/canvas-renderer.ts` 命中 **1** 处；撤修前 sabotage marker 为 **0**。
- 临时让 player key 的 AssetManager lookup 返回 `undefined` 后，点名正例精确 **1 failed / 1 skipped**，失败位于活动玩家 `expectDrawPlan`：`expected undefined to be defined`。
- 用 `apply_patch` 精确恢复后同一点名测试 **1 passed / 1 skipped**；最终锚点 **1**、marker **0**，共享 renderer 无永久变更。

## 边界核对

- 未修改 `src/renderer/**`、`src/assets/**`、`public/games/game-simlife/art/**`、Life JSON、World/snapshot/save、UI/launcher 或资产审批数据。
- 未启动服务、浏览器或 watcher；未操作数据库、Git/GitHub、网络模型、素材导入/生成/移动。
- 本单仅测试与文档，无 sim 判定逻辑，因此不新增 DebugTrace。
