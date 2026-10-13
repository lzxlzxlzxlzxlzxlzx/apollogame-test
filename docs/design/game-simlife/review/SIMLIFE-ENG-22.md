# SIMLIFE-ENG-22 Review 单｜小山谷登记素材真实消费竖切

## 1. 状态与边界

状态：**✅ 已独立验收（2026-10-10）**。

- 施工主体：BDM程序（锁）。
- 架构结论：既有 `AssetSlot/skinKey → loadLifeDemoArtInto → loadGameArtInto → AssetManager → Life renderer` 已完整消费登记素材；不为证明工单新增 loader 或生产分支。
- 永久变更面：`games/game-simlife/art-consumption.test.ts`、本设计目录自证/Review/工单状态。
- 禁止：`public/games/game-simlife/art/**`、index、ledger、`src/ui/**`、数据库、服务、Git/GitHub。

## 2. 独立复查清单

1. 独立核对 asset slots / index / ledger 均为 21 项且 key 集完全一致；确认四个点名 key 的 URL 来自真实 index。
2. 独立阅读 loader 与 renderer：测试必须走既有 `loadLifeDemoArtInto → loadGameArtInto` 和 `AssetManager.resolve`，不能以 mock 绕过消费链。
3. 独立确认真实 Life actions 产生成熟 crop；tile/player/placement/crop 均由投影 key 进入 Canvas，source/destination、anchor、depth 和图层断言不是自洽假测试。
4. 独立确认移除一个内存登记后只触发表现 fallback，snapshot/order hash、碰撞与 World 状态不变，且仓库真实 index 未被编辑。
5. 独立复跑 renderer/asset/Life 回归、ESLint、asset reconcile、ledger strict、DOCS-REF、game audit，并阅读全部 warning。
6. 以唯一且可计数的 renderer 锚点做撤修验红，确认测试确实转红、恢复后全绿且没有临时改动残留。
7. 若使用 owner 已启动的 5173，只做只读目击并关闭临时浏览器；不得启动服务或执行任何持久化游戏操作。

## 3. 施工实证（仅作导航，不构成 Review 结论）

- 真浏览器目击登记草地、farmer 与 mayor；CDP resource tree 同时列出成熟 turnip SVG。Canvas bitmap/CSS 为 1600×835 / 1280×668，console warn/error 0，临时 tab 已关闭。
- 三方对账 `RECONCILE: PASS`；ledger 21/21/0，`LEDGER-AUDIT: PASS`。
- 定向回归 **11 files / 103 tests passed**；新增消费测试 **2 passed**；单文件 ESLint 0 warning；audit 未覆盖红旗 0、`RATCHET: PASS`。
- S4 既有对齐单重新计数为 **60 ✅ / 0 ⚠ / 0 ❌**。
- 施工方撤修：活动玩家 `drawLifeTexture` 唯一锚点恒假后 **1 failed / 1 passed**，恢复后 **2 passed**。
- 自证全文：`../self-check/eng22.md`。

## 4. 独立复查结论

结论：**PASS，建议策划验收**。Blocker **0** / Major **0** / Minor **0**。

### 4.1 独立实证

- 独立解析 `little-valley.asset-slots.json`、真实 `art/index.json` 与 `art/art-ledger.json`：三者分别 **21 / 21 / 21**，各自重复 key **0**，三方差集均为空。四个点名 key 的真实 index URL 分别为：
  - player：`/games/game-simlife/art/sprites/farmer.svg`
  - tile：`/games/game-simlife/art/tiles/meadow-grass.svg`
  - placement：`/games/game-simlife/art/sprites/mayor.svg`
  - crop：`/games/game-simlife/art/crops/turnip-mature.svg`
  四个工作区文件均实际存在。
- 独立阅读消费链确认没有测试旁路或第二 loader：`loadLifeDemoArtInto` 只委托 `loadGameArtInto`；后者读取真实 index、调用 `registerAssetIndex` 并交给 `AssetManager.loadAll/resolve`；`collectLifeSceneRender` 从活动 World 只读投影 tile / crop / placement / player；`CanvasRenderer.drawLifeTexture` 是共同贴图消费点。
- `art-consumption.test.ts` 通过真实 queued Life actions 完成耕地、浇水、选种、播种、跨日和再次浇水，最终由真实 `LifeCropCatalog + LifeCrop` 投影出 mature turnip；没有手造 crop projection。断言覆盖 source/destination、slot fit/anchor、placement depth 升序与 `tile → crop → placement → active player` 图层顺序。
- 负例只删除内存克隆 index 的玩家登记：`AssetManager.resolve(player)` 为空，Canvas 转入圆形语义 fallback；真实 index 不变。渲染前后 `hashWithOrder(snapshot, snapshotOrder)` 相等，正/负两路均未写 World，snapshot/order hash 不变。

### 4.2 独立命令与结果

- `node scripts/asset-reconcile.mjs game-simlife`：`RECONCILE: PASS（三方一致）`。
- `node scripts/ledger-audit.mjs game-simlife --strict`：**21 行 / 21 有槽 / 0 孤儿**，`LEDGER-AUDIT: PASS`。
- `node scripts/docs-ref-guard.mjs`：扫描 **46** 个 Markdown、**391** 个路径，`DOCS-REF: PASS`。
- `node scripts/game-skill-audit.mjs game-simlife`：未覆盖红旗 **0**，`RATCHET: PASS`；完整读取到既有黄项“零能力接入”。该黄项来自薄宿主静态扫描，真实 Life package 继续经共享 compiler/host 装配，不是本单新增回归。
- `npx vitest run games/game-simlife/art-consumption.test.ts games/game-simlife/asset-slots.test.ts games/game-simlife/game-simlife.test.ts games/game-simlife/life-demo-package-json.test.ts src/renderer/life-scene-render.test.ts src/renderer/canvas-renderer.viewport.test.ts src/renderer/canvas-transform.test.ts src/assets/asset-manager.test.ts src/assets/asset-index.test.ts src/assets/asset-slot-brief.test.ts src/assets/game-art-load.test.ts`：当前工作树 **11 files / 110 tests passed**。施工记录的 103 是较早计数；当前逐文件计数为 `2+3+21+3+14+4+5+17+29+5+7=110`，不是失败或删测。首次受限沙箱运行在测试收集前因 `node_modules/vitest/dist/spy.js realpath EPERM` 产生 11 个基础设施错误；同一命令按允许的短生命周期测试方式重跑后完整通过。
- `npx eslint games/game-simlife/art-consumption.test.ts games/game-simlife/game-simlife.ts src/renderer/canvas-renderer.ts src/renderer/life-scene-render.ts src/assets/game-art-load.ts src/assets/asset-manager.ts src/assets/asset-slot-brief.ts src/assets/asset-index.ts --max-warnings 0`：exit **0**，零 warning。

### 4.3 撤修验红与残留

- 撤修前对完整活动玩家锚点 `if (projection.player.skinKey && this.drawLifeTexture(...)) return;` 做精确计数，命中数 **1**。
- 临时以 `apply_patch` 在该唯一锚点加入恒假门，单跑 `art-consumption.test.ts` 得 **1 failed / 1 passed**；失败值明确显示最后一次 farmer draw 仍停在 authored placement 坐标 `(705.6, 244.8)`，而活动玩家 foot-anchor 期望 `(225.6, 312)`，证明测试确实约束活动玩家消费链。
- 同回合用 `apply_patch` 精确恢复；恢复后完整锚点数 **1**、sabotage marker 数 **0**，点名测试纳入最终 **11 / 110** 全绿。未创建 review 临时目录，未使用浏览器；无临时复查改动残留。
