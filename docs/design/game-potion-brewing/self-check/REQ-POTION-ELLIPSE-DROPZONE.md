# REQ-POTION-ELLIPSE-DROPZONE / G3 施工自检

> 2026-10-13。此页只记录施工者证据；独立复查及全库门禁未完成前不等于交付。

- 实现：`DropZone.hitShape?:'box'|'ellipse'`；缺省复用原 AABB 算式，显式 ellipse 依 `Shape.width/height` 与 `Transform.scaleX/Y` 计算正半轴，缺失/坏轴 fail-closed；按实体 ID 升序首中。共享只读入口 `findDraggableAt/findDropZoneAt/canDropZoneEmit` 同时供权威 `drag-place`/`drop-zone` 与 G4 表现预览使用，函数不写 World/Signal。
- 投料数据接法：材料挂 `Draggable.onlyFlag` 与 `Clickable.onlyFlag` 指向同一永不激活 Flag；因此单击和锅外自由落点不提交、不移动，椭圆锅口投放仍由既有 `drop-zone` 代发材料 `Clickable.action`。无游戏层解释器。
- 自测：`npx vitest run src/skills/tier2/drop-zone-hit.test.ts --pool=forks --maxWorkers=1 --minWorkers=1`，5/5 PASS；覆盖中心、轴端点、AABB 四角、正负缩放、无效/缺失轴、重叠区、装载拒非法模式、只读预览与权威投放同判定、单击/锅外与 trace 拒收。
- 待证：非施工者独立复跑与锚点撤修验红；正式炼药 S4 真输入/同画布目击；全库 `tsc` 和 scoped gate。任何一项未过，不得释放公共池或把机读缺口改 delivered。
