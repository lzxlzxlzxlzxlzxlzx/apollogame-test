# REQ-GCI-CART-ART-BRIDGE · 共享卡带本地资产桥复查导航

2026-10-13。施工主体：引擎程序；独立复查：非施工者 agent。结论：**共享桥与离线包行为局部 PASS；整单 CONCERNS**。本单不代表 GCI S6、Owner 人门或全库推送门禁通过。

## 范围与实现

- 卡带从 `/games/<slug>/art/index.json` 读取本地索引；`Sprite.textureKey`、`Clickable.hitMaskKey` 和 LayoutNode 的 `asset:<key>` 皮肤均按索引验证。缺 mask、错源 mask、缺贴图或 PNG 尺寸不符均拒绝启动，不退回矩形热点或空图。旧卡带没有本地资产引用时仍可无索引运行。
- 在线卡带与预览在装载世界前预载 Sprite/UI 贴图，卸载时清理 AssetManager；离线包内联同一索引及所引用图片。`packageWeb` 的普通、`--no-build`、`--full-shell`、注入外壳入口均先跑严格 manifest 检查；Windows 子进程通过 Node 绝对入口启动。
- 共享改动位于 `src/assets/cart-art.ts`、`src/studio/DataCartridgeRunner.tsx`、`src/studio/cart-run-core.ts`、`src/cartridge-inline-run.ts`、`scripts/{manifest-check,bench-manifest,game-pipeline,package-web}.mjs` 等；没有替游戏施工者改正式 manifest 或素材文件。

## 实证

- 施工复跑：`src/ui/components` 连同资产桥/内联包定向 Vitest 72 files、563 tests PASS（后续新增两条出包回归另复跑）；`npx tsc --noEmit`、`npm run build`、目标 ESLint 均 exit 0。主构建仅有既有大 chunk 提示。
- 独立复跑：资产桥/内联包 Vitest 3 files、33 tests PASS；`scripts/game-pipeline.test.mjs` 深车道 72/72 PASS；tsc exit 0。候选 manifest 带 `--art-index` 严格检查 warnings=[]，bench 95/pass；不带索引对 mask 候选明确拒收。
- 在线短时浏览器：`http://localhost:5700/?game=lib:game-clue-investigation` 的候选路由 8 张 PNG 均 HTTP 200，Canvas 与旧占位画面不同，真实点击 lock 打开 modal；截图见 [浏览器目击](REQ-GCI-CART-ART-BRIDGE-browser.png)。浏览器及 5700 临时服务均已关闭。
- 离线隔离复查：故意把 lock mask key 改为不存在，注入外壳、no-build、full-shell 三路径都在写盘前拒绝，坏 HTML 0 个；恢复合法候选后注入包 12,375,097 bytes、真实 Vite subset 包 13,803,085 bytes，均内联 8 PNG、外链扫描空。`file://` Chromium 6.5 秒后 Canvas 挂载，页面错误为空，真实鼠标点击 lock 后 modal 可见，HTTP 请求为空；浏览器已关闭。
- 撤修验红：复查人在隔离副本对 `src/assets/cart-art.ts` 的 `sourceTextureKey` 比对作唯一锚点命中的内存破坏，同一错源夹具由原实现拒绝变为 mutant 接受，点名断言转红；共享工作树未遭破坏。

## 未收束边界

- `node scripts/scoped-gate.mjs --run` 的全库 depcruise 仍 exit 1：37 errors、0 warnings，0 条命中本桥文件；其中 5 条命中并行施工的 `games/game-clue-investigation/s6-alpha.test.ts`，其余为 Life 等在途改动。故本单不得宣称全库全绿或可推送。
- 正式 `library/game-clue-investigation/manifest.json` 尚未接资产：`readCartArtBundle` 正式=0、S6 候选=8。上述真图/离线可玩证据只属于候选；正式替换、游戏 S6 对齐、音频及 Owner 审批由游戏施工线另行验收。
