# GAL-ART-01A · 存读档 V2 系统框细节局部自证（2026-10-14）

结论：定稿 V2 存读档页原型的框外左上品牌、标题行右侧容量说明和底栏双操作已由现有 LayoutNode 闭集补齐，**本增量仅施工自证，待非施工者复查**；不签完整 S5/S6。

- 品牌以当前作品 `model.title` 作为内容投影，保持原型的左上锚点与标题层级；不把 demo 英文名硬编码进通用 GAL 模板。容量说明为 V2 固定的 4×3/12 槽结构，存/读模式共享。
- 仅 115 源裁边系统框 + V2 非切片槽皮同时存在时加三处节点；无图与旧切片路径保持旧树。底栏 `读取此存档/保存至此槽`、`返回` 各用 124×44 贴图 Button，返回仍发已有 `gal.slot.back`，没有新 DOM 或游戏层自由逻辑。
- [定稿存读档图](../gal-ui-v2-save.png) 对 [实际读取亮态](../review/gal-art-01a-slots-load-light-v2-chrome-1014.png) / [实际读取暗态](../review/gal-art-01a-slots-load-dark-v2-chrome-1014.png)。三处目标可见；实际品牌为作品中文标题，已填槽内容及存档预览为夹具数据，不冒充原型样例内容相同。底部卡片元数据、终图质感和完整逐像素对齐仍在 S5 差异单。

点名结构测试 20/20（含 V2/无图/旧切片三路径），GAL Profile/UI/Save 与 PUI 相邻 98 文件 **789/789**，`npx tsc --noEmit` 退出 0。`verify-gal-art-live.mjs` 对存档/读档暗亮 4 态真浏览器退出 0：框与卡片几何、左上标题 y14、容量说明标题行、底栏返回 ActionSink 和图像加载均通过；浏览器由脚本 `finally` 关闭，临时构建清理。同步 V2 树的 `gal-ui-slots.audit.ts` 经 `tools/ui-audit.mjs`：40 个绝对定位元素，非意图重叠、<3:1 硬对比和 border-image 前提均为 0，house 主题与 5 处 skin 命中；不以启发式华丽度代签视觉 1:1。

仍须非施工者独立复跑、锚点命中撤修验红、实证复现及读告警；局部自证不改变 `media-and-final-skin` 的 active/pending 或 Owner 人门。
