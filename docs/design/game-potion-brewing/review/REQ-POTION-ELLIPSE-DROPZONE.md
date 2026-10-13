# REQ-POTION-ELLIPSE-DROPZONE / G3 独立复查

> 2026-10-13 · 复查主体 `/root/g3_review`，非施工主体 `Codex/root`。判词：**CONCERNS**（G3 能力语义通过；全库门与真浏览器输入尚未具备，不等于可释放公共池或 S4 完成）。

## 范围与规格核对

- Owner A 裁决及本地领工锁见 `../work-orders/GAP-POTION-03.md`；变更限于 `DropZone.hitShape`、共享只读命中、`drag-place` 消费、点名测试/手册。未发现游戏层规则解释器或预览直接发玩法 Signal。
- `src/skills/tier2/drop-zone-hit.ts` 的缺省 box 算式与 `git diff` 中旧 `hitDropZone` 相同：`Shape.width/height ?? 16`、缩放绝对值、两个 `<=`；显式 ellipse 为归一化平方和 `<=1`，无效/缺失/非有限半轴拒收。`findDropZoneAt` 按 ID 排序，仅读 World。`findDraggableAt` 为旧抓取函数原样抽取，两个权威系统均复用。
- `src/skills/tier2/drag-place.ts` 保留 `drop-zone` 的 Update 相位、`Signal.name=Clickable.action`、`source=被拖实体` 与投放优先于 `Draggable.onlyFlag` 的旧语义。`DropZone.hitShape` schema 装载期拒未知枚举。无效椭圆在 opt-in DebugTrace 留 `reject`。后续 G4 同源收口新增 `canDropZoneEmit`：只读检查源 `Clickable` 与区载体尚无 `Signal`，权威 `drop-zone` 和预览均消费它，未更动原有代发条件。

## 独立实证

1. 初轮 `npx vitest run src/skills/tier2/drop-zone-hit.test.ts src/skills/tier2/drag-place.test.ts src/skills/tier2/clickable.test.ts --pool=forks --maxWorkers=1 --minWorkers=1`：退出 0，3 文件 26/26。新增共享代发门后，重跑 `drop-zone-hit.test.ts`、`runtime/drag-preview.test.ts`、`renderer/drag-preview.test.ts`、`drag-place.test.ts`、`clickable.test.ts`：退出 0，5 文件 **33/33**。覆盖椭圆中心/端点/角点、负缩放/坏轴、首中、权威材料原位与代点、区已持 Signal、预览的无 Clickable/区已占拒绝，以及旧拖放/点击回归。普通沙箱的 Vitest 子进程 `realpath node_modules/vitest/dist/spy.js` 报 EPERM、零测试执行；改用允许的隔离提权测试后正常，未用该 EPERM 回执冒充测试失败。
2. 锚点内存撤修：临时 Vite 配置先断言 `drop-zone-hit.ts` 中 `return nx * nx + ny * ny <= 1;` **唯一命中**，再只在 transform 内存态替换为 `return true;`。运行日志出现 `G3 SABOTAGE ANCHOR HIT`，点名测试退出 1，5 例中恰 2 例转红：第 20 行“椭圆四角拒收”、第 64 行“权威投料链锅角不提交”。配置已删除、生产源码未更动；恢复后同文件 5/5、退出 0。
   新增门另做第二轮独立撤修：断言 `canDropZoneEmit` 中 `Clickable && !Signal` 返回行唯一命中，只在 Vite transform 内存态替换 `return true;`；日志出现 `G3 EMIT SABOTAGE ANCHOR HIT`，2 文件 10 例中恰 2 例转红：`drop-zone-hit.test.ts:73` 的“已有 Signal 不可再代发”、`runtime/drag-preview.test.ts:100` 的“无 Clickable/区已占不假装成功”。临时配置删除后 33/33 恢复绿；共享生产源码未被探针修改。
3. `npx vite-node scripts/system-graph-audit.mjs t2-drag-place t2-clickable t2-event-when t2-card-pile`：退出 0，5 系统可排、无 SCC/悬空/重复告警。`npx eslint` 检查 G3 四文件：退出 0、无输出。
4. `npx tsc --noEmit --pretty false`：G4 同源补丁初次复跑时发现新增 `src/runtime/drag-preview.test.ts:95` 的 `Signal.source` 缺失，已通知施工者；施工者修复测试夹具后**再次独立复跑**，退出仍为 1，但 14 条诊断仅在 `games/game-card-reveal/*`、`games/game-dice/*`、`games/game-theft/*`、`src/launcher/game-runner.tsx`，无 G3/G4 文件诊断。**不能据此宣称全库门绿。**

## 未闭边界

- 当前测试将 `InputQueue` 直接注入 World；尚无正式炼药游戏宿主可用真鼠标/触控与画布逆投影核对材料“抓取→锅口释放→可见反馈”。这是 S4 真输入/视觉验收的待证项，不应把定向绿色替代玩家目击。
- G1–G4 的公共池释放与机读 `delivered` 取决于各自完整门禁和收口；本复查只对 G3 已施工部分给出通过语义判断。
