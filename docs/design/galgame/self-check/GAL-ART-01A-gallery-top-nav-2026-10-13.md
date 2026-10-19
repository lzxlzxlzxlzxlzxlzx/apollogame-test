# GAL-ART-01A · V2 画廊顶栏局部自证

范围：冻结的 1440×900 V2 原型 `../gal-ui-complete-v2.dc.html` 的“✧ MEMORIES”与“主页／剧情／存档／设置”四入口。只改 GAL LayoutNode 与宿主具名动作，不改 PUI/素材索引/原型。

| 对齐项 | 结果 |
| --- | --- |
| 顶栏位置与四入口 | ✅ 顶栏在画廊外框上方；[回想亮主题](../review/gal-art-01a-gallery-top-nav-memories-light.png)、[CG 亮主题](../review/gal-art-01a-gallery-top-nav-cg-light.png)，深主题同名图在 `review/`。V2 底栏不再重复“设置”；无图/旧切片保留旧入口。 |
| 页面动作 | ✅ `gal.gallery.nav` 闭集接受 `home/story/slots/settings`，非画廊页拒收；不可续剧情禁用。 |
| 返标题政策 | ✅ 从剧情来的画廊返回主页需按 Profile 确认；取消留在画廊，关闭策略后直返主页。 |
| 素材回退 | ✅ 仅 V2 已加载系统框有顶栏，无图/旧切片不加该顶栏；未改变原有卡片与底栏动作。 |
| 真实渲染与交互 | ✅ 隔离 `file://` 真浏览器 34 态脚本退出 0；画廊四入口 host 点名测试覆盖，浏览器已关闭。 |
| UI 卫生 | ✅ `validateLayoutNode` 零 issue；深/亮图库审计各零重叠、零硬低对比、零警告，四处皮肤命中。 |

验证：去重后 GAL/UI 611/611，点名 41/41，`tsc --noEmit` 退出 0。全库 `scoped-gate --run` 在 33 条非 GAL depcruise 违规处退出 1。[独立复查](../review/GAL-ART-01A-gallery-top-nav-independent.md)在去重后复跑 41/41、34 态真浏览、深亮审计和锚点撤修验红，判局部 PASS；完整 S5/S6 仍有素材、ghost 胶囊及演出差异，不申请 Owner 人门。
