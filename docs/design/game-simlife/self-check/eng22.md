# SIMLIFE-ENG-22 自证｜小山谷登记素材真实消费竖切

日期：2026-10-10  
施工主体：BDM程序

## 结论

- 本单没有制造新的 loader、资产协议或渲染特例。既有链路已经闭合：`little-valley.asset-slots.json` 的 `skinKey` 进入 Life 投影，`loadLifeDemoArtInto → loadGameArtInto` 从本地 `art/index.json` 注册 URL，`CanvasRenderer` 再以同一 key 经 `AssetManager.resolve()` 和视觉目录规则完成 drawImage。
- 资产槽位、真实 index 与美术台账均为 **21** 项，三方对账一致；未修改 `public/games/game-simlife/art/**`、index、ledger 或任何真实素材。
- 新增集成测试只使用不变的真实 index JSON，覆盖四种消费形状：草地 tile、成熟芜菁 crop、镇长 placement、活动玩家 player；逐项验证实际 URL、source rect、destination rect、fit/anchor 与渲染层次。
- 真实 Life action 队列把田地推进到成熟芜菁，再由 `collectLifeSceneRender` 和真实 `CanvasRenderer` 消费，不直接伪造 crop projection。placement 仍按 depth 升序，tile/crop 在 placement 前，活动玩家按脚底锚点最后绘制。
- 从内存中的 index 副本移除玩家登记后，`AssetManager.resolve(player)` 确定性返回空，玩家 SVG 不再绘制并落到语义圆形 fallback；实际 index 文件没有改动。
- 渲染前后 `hashWithOrder(snapshot, snapshotOrder)` 完全一致，证明素材加载、anchor/depth 与 fallback 都没有改变模拟、碰撞或确定性状态。

## 四个真实消费点

| 投影类别 | 资产 key | index URL | 证明 |
|---|---|---|---|
| player | `art:little-valley:player:farmer` | `/games/game-simlife/art/sprites/farmer.svg` | 最后一次同 key 绘制使用活动玩家中心与 foot anchor |
| tile | `art:little-valley:tile:meadow-grass` | `/games/game-simlife/art/tiles/meadow-grass.svg` | 地表层 drawImage，早于 crop/placement/player |
| placement | `art:little-valley:placement:mayor` | `/games/game-simlife/art/sprites/mayor.svg` | depth 排序后绘制，使用 placement 规则 |
| crop | `art:little-valley:crop:turnip-mature` | `/games/game-simlife/art/crops/turnip-mature.svg` | 真实播种、浇水、跨日成熟后的 farm overlay |

## 真浏览器目击

- 访问 owner 已启动的 `http://127.0.0.1:5173/?game=game-simlife`；未启动、重启或后台运行任何服务。
- 真实页面标题为 `ZeroCraft Preview — Game Library`，页面只含一张游戏 Canvas；bitmap 为 **1600×835**，CSS 显示为 **1280×668**。
- 截图目击草地纹理、活动玩家 farmer、镇长与另一名 NPC 均以登记 SVG 形状显示；HUD 显示“小山谷 / 收获一份成熟芜菁 / Spring 1日”。未做会写入存档的游戏操作，成熟作物改由纯内存集成测试证明。
- CDP `Page.getResourceTree` 从当前真实页面直接列出 `tiles/meadow-grass.svg`（351 bytes）、`sprites/farmer.svg`（492 bytes）、`sprites/mayor.svg`（430 bytes）与 `crops/turnip-mature.svg`（392 bytes），四者均为 `image/svg+xml` / `Image`；不是测试桩 URL。
- 浏览器 console `warn/error` 共 **0**；本次创建的临时 IAB tab 已关闭，没有留下浏览器进程或用户配置。

## 验证实证

- `asset-reconcile.mjs game-simlife`：`RECONCILE: PASS（三方一致）`。
- `ledger-audit.mjs game-simlife --strict`：21 行 / 21 有槽 / 0 孤儿，`LEDGER-AUDIT: PASS`。
- renderer / asset / Life / host / determinism 定向回归：**11 files / 103 tests passed**。
- 新增 `art-consumption.test.ts`：**2 tests passed**；ESLint exit 0、零 warning。
- `game-skill-audit.mjs game-simlife`：未覆盖红旗 0，`RATCHET: PASS`；“零能力接入”仍是薄宿主静态扫描的既有黄项，实际 package 继续经共享 Life compiler/registry 装配。
- `align-count.mjs --game game-simlife --stage S4`：**60 ✅ / 0 ⚠ / 0 ❌**，退出码 0。本单没有改 UI、布局或素材，不产生新的视觉偏差。

## 撤修验红

- 唯一活动玩家消费锚点为 `projection.player.skinKey && this.drawLifeTexture(...)`，在 `src/renderer/canvas-renderer.ts` 精确命中一处。
- 临时在该锚点加入恒假门后，`art-consumption.test.ts` 精确 **1 failed / 1 passed**：同 key 最后一次绘制退化为 authored placement 坐标，无法满足活动玩家 foot-anchor 计划。
- 用 `apply_patch` 精确恢复后同文件 **2 passed**；未遗留 sabotage marker，生产 renderer 最终无本单改动。

## 边界核对

- 永久改动只有资产消费集成测试、本自证、Review 导航与施工单状态；既有生产消费链无需修复。
- 未触碰 `src/ui/**`、`public/games/game-simlife/art/**`、index、ledger、数据库、服务或 Git/GitHub。
- 新增内容不含模拟逻辑，因此没有新增 DebugTrace 事件；既有模拟 trace/确定性边界不变。

