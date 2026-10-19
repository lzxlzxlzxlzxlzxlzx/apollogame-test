# GAP-POTION-03 / G3 · DropZone 可选椭圆命中

> 历史施工规格，**G3 已于 2026-10-13 按炼药项目范围交付并从公共池释放**；权威当前判词见 [G1–G4 独立复查](../review/G1-G4-scoped-release-2026-10-13.md)。以下保留原验收规格，正式游戏投放另归 S4。

- 施工主体：Codex/root（Owner 特许本地领工锁）；现有 `t2-drag-place` 能力的可选字段扩写，由主程施工并另请非施工者独立 review。
- 几何：DropZone 增显式椭圆模式；缺省保持 AABB 逐字节行为。以区实体 Transform 中心与 Shape.width/height 经缩放得到半轴，归一化平方和 ≤1；半轴无效 fail-closed，不退化 box。候选依既有实体 ID 全序，不改 `drop-zone` Signal 来源、阶段或材料权威位置。锅口基线中心 `(760,423)`、半轴 `(123,53)`。
- 共享判定：把 `drag-place.ts` 私有 `hitDropZone` 抽为共享、只读、可测函数/投影。权威投放和 G4 render-only 预览消费同一判定；预览不得据命中自行发玩法 Signal。
- 消费接线：材料实体 `Draggable` 和 `Clickable{action:'brew.add.<ingredientId>'}` 的 `onlyFlag` 指向同一个永不激活 Flag。锅外自由落点被挡住，材料权威 Transform 原位；`drop-zone` 先于拖拽移动门，椭圆命中后可代点发 Signal。材料单击只可选中，不提交 add；键盘确认须选材后由坩埚动作显式提交同一具名动作。S4 真输入链若发现门语义不成立，重开缺口，不写游戏级拦截器。
- 验收：中心/两轴端点命中、AABB 四角拒收、锅身/锅外不提交且权威位置不变、单击不提交、键盘不受影响、旧矩形零回归、逆投影缩放/负 scale/重叠区稳定；锚点撤修验红与独立复查。

