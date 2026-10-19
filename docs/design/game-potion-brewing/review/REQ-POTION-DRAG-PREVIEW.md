# REQ-POTION-DRAG-PREVIEW / G4 独立复查

> 2026-10-13。复查主体：Codex `/root/g4_review`，与施工者 `/root` 不同。判词：**CONCERNS**。G4 通用接缝的定向语义已通过；全树门禁和正式游戏的真浏览器可见手势尚未通过，不能释放公共池或将 G4 标为 `delivered`。

## 范围与规格

- 对照 `work-orders/GAP-POTION-04.md`、公共池 `REQ-POTION-DRAG-PREVIEW`、定稿 S1-P-06 原型；窄范围 `git status --short --` 确认 G4 涉及 `src/runtime/drag-preview*`、`src/renderer/{canvas-renderer,drag-preview.test}.ts`、`src/net/host/queued-input*`，并复用 G3 `src/skills/tier2/{drop-zone-hit,drag-place}.ts`。共享工作树还有其他项目并发变更，本次未碰它们。
- G4 是默认关闭的宿主/render-only 表现层，材料 `Transform`、World 快照/hash 和权威 `drop-zone` Signal 均不得由预览改写；资产按 `Sprite.textureKey` 经现有 AssetManager 解析，缺图只走占位。`src/runtime/drag-preview.ts:60`、`src/renderer/canvas-renderer.ts:230` 与 `src/net/host/queued-input.ts:68` 符合这一分层。

## 四步复查实证

1. **独立复跑**：`npx vitest run src/runtime/drag-preview.test.ts src/renderer/drag-preview.test.ts src/net/host/queued-input.test.ts src/skills/tier2/drag-place.test.ts src/skills/tier2/drop-zone-hit.test.ts --pool=forks --maxWorkers=1 --minWorkers=1` → **5 files / 27 tests PASS，exit 0**。覆盖 140ms 抬起、280ms 回弹、120ms 消隐、短距 up、第二指针、cancel/blur、源组件移除、dispose、reduced-motion、缺图占位、Sprite 真图、同一量化采样/DPR=2/CSS 缩放、默认关闭和快照/hash 不变。另独立 `npx eslint` G4 七个相关文件 → exit 0。
2. **带锚点撤修验红**：临时 Vite `transform` 仅在内存把 `src/runtime/drag-preview.ts` 的唯一字串 `const RETURN_MS = 280;` 换成 `const RETURN_MS = 1;`，先断言锚点计数严格为 1；stderr 实测 `G4_MUTATION_ANCHOR_HIT=1`，`drag-preview.test.ts` **2 failed / 3 passed，exit 1**（锅外中途回弹与拒收后仍须回弹均转红）。删除临时 probe 配置，未改生产源码，再跑原测试 **5/5 PASS，exit 0**；`git status` 确认临时配置无残留。
3. **实证复现并返修**：首查发现 `DragPreviewLayer.sample` 只凭椭圆锅口命中便 fade，而权威 `drop-zone` 还要求材料 `Clickable` 且 zone 无待处理 `Signal`；旧 G4 测试材料无 `Clickable` 仍断言消隐，属假阳性。施工者在 G3/G4 共用纯 helper `canDropZoneEmit` 中统一条件（`src/skills/tier2/drop-zone-hit.ts:62`；权威消费 `drag-place.ts:232`、预览消费 `drag-preview.ts:110`），补无 `Clickable`/zone 已有 Signal 回弹测试（`drag-preview.test.ts:92`）。复跑上述 27 项全绿。初轮新测试夹具缺 `Signal.source` 导致 TS2345，已通知施工者补齐并二次验证本单零 TS 错误。
4. **告警与定序**：`npx vite-node scripts/system-graph-audit.mjs t2-drag-place t2-angular-gesture t2-ordered-action-session` → **4 systems、无重复 id/悬空边/环，`SYSTEM-GRAPH: PASS`、exit 0**；未见新告警。`npx tsc --noEmit --pretty false` → **exit 1**，二次输出仅 card-reveal、dice、theft、launcher 的共享树既存错误，没有 G4/G3 文件命中；不能将此误写成全库绿。

## 未闭合的验收边界

- 目前没有正式 `game-potion-brewing` 可玩宿主和真浏览器截图；鼠标/真实触控、不同 DPR、可见预览与投放结果的端到端玩家手势尚未目击。Vitest 假 canvas/World 与旧原型 HTML 均不能替代 `docs/playbooks/testing.md` 的可玩性目击。
- 全树 TypeScript 门禁仍为 exit 1；G1–G3 也尚未释放。故本单只能判通用接缝局部语义通过、整体 **CONCERNS**，保留 `in-progress` / `accepted`，不得代签 S4/S5 或 Owner 人门。
- 初次沙箱内 Vitest 遇 `node_modules/vitest/dist/spy.js` 的 `realpath EPERM`（0 tests），已使用获准的只读隔离外复跑，以上测试数字均来自真实执行；没有启动整套 ZeroCraft 或浏览器进程，无遗留服务。
