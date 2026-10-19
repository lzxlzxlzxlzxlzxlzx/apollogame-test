# G1–G4 隔离浏览器引擎接缝自检（2026-10-13）

## 范围与判定

- 施工者：Codex/root；浏览器夹具为 `scripts/fixtures/potion-engine-browser.{html,ts}`，驱动为 `scripts/potion-engine-browser-e2e.mjs`。它把真实浏览器 PointerEvent 经 `PointerInputSource → Command → InputQueue → World.tick → CanvasRenderer` 接到四项已施工能力；不复制 S1-P 原型的玩法 DOM，也不代表正式游戏。
- 需求评判：接受用现有测试线的 Playwright 真浏览器旅程补“能力接缝”证据；不增加引擎 capability，不触碰正式游戏或远端。锅的测试几何仅为夹具占位，视觉 1:1 仍归 S4–S6。
- 自检结果：**局部 PASS、整体未交付**。本地浏览器引擎链无缺口；全库 `tsc`/depcruise 仍红，正式游戏尚未建立，不能释放 G1–G4 或签 S3/S4。

## 真浏览器实证

命令 `node scripts/potion-engine-browser-e2e.mjs` → exit 0，打印 `POTION-ENGINE-BROWSER: PASS`。临时 Vite 测试页为 `http://127.0.0.1:59431/scripts/fixtures/potion-engine-browser.html`，明确 `configFile:false`、`publicDir:false`，脚本 `finally` 关闭无头 Edge 与 Vite；不是 Owner 日常浏览器，也未启动 5173 上的整套系统。Playwright context 使用 DPR=2、CSS 半尺寸画布：

1. Playwright 鼠标沿锅口走顺时针一圈：权威 `AngularGesture` 产 `brew.stir.clockwise`，G1 会话推进第 1 步，棒的 `Transform` 和 Canvas 可见位置回到轨道起点。
2. Chromium CDP `Input.dispatchTouchEvent` 走浏览器触控事件路径、逆时针一圈：产 `brew.stir.counterclockwise`，G1 推进第 2 步；并非直接注入 RawInput。
3. 鼠标按住材料拖至锅外：`DragPreviewLayer` 跟手，Canvas 影像中心像素 alpha>0，权威材料坐标仍在原位；放手后回弹清除，不产生投放，G1 保持 active。持有帧见 [g2-g4-browser-held.png](g2-g4-browser-held.png)。
4. 材料拖至矩形四角但椭圆之外：权威拒收，G1 保持 active；再拖至椭圆中心：`DropZone` 代发 `brew.add.silver`，G1 唯一终局为 success，预览在消隐期结束。结算帧见 [g2-g4-browser-drop.png](g2-g4-browser-drop.png)。
5. 页内 `pageerror` 为空。首轮探针误在棒实体读取 Signal、第二轮误把抬起影像当作鼠标原始 y 位置采样像素，均为测试观测错误；已按 Signal 实体列表和实际预览帧坐标修正，最终真浏览器 PASS，未据失败探针修改生产语义。

## 门禁与边界

- `npx eslint scripts/fixtures/potion-engine-browser.ts scripts/potion-engine-browser-e2e.mjs` → exit 0。
- `npx vitest run` 点名 G1–G4 七个相关测试文件 → **7 files / 47 tests PASS，exit 0**。
- `npx tsc --noEmit --pretty false` → exit 1；诊断仍只在 game-card-reveal、game-dice、game-theft、launcher，夹具和 G1–G4 本体零命中。
- `npm run depcruise` → exit 1，32 条在其他 Life/游戏文件，G1–G4 与本夹具零命中。
- `node scripts/context-budget-guard.mjs` 本轮转为 exit 1：`game-simlife/requests.md` 因并发修改超出旧文件字符/行数棘轮；本炼药当前需求单和公共池均未触顶。未跨项目改该文件凑绿。
- 点名 Vitest、锚点撤修证据仍分别见四项既有 Review 单；本单不把隔离夹具截图当作正式 `games/game-potion-brewing` 的真机 1:1、DokiWorld 或 Owner 验收。
