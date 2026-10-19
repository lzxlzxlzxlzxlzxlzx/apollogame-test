# GAL-ART-01A · 画廊 V2 信息栏局部自证（2026-10-14）

结论：**施工侧局部通过，待非施工者复查**。仅对齐定稿 V2 的框外品牌位置、标题行说明与页签行解锁计数；不签画廊终图、整页 S5/S6 或 Owner 人门。

- 原型依据：`../gal-ui-complete-v2.dc.html` 的 `.system-bar` 为 left/right 31px、top 14px、height 42px；画廊标题行右侧为“场景重播 · CG 鉴赏”，页签行右侧为动态“已解锁 x / n”。
- 实现：`gal-ui-structure.ts` 仅在已加载 V2 系统框路径使用 x31/y14/1378×42 顶栏，说明留在 heading，解锁数移到 tabs；数字仍由当前 gallery collection 计算。无图/旧切片继续使用原树，原型 DOM/CSS 没有进入正式运行时。`gal-ui-art.ts` 只补说明文字的现有 FRAME_INK 闭集颜色。
- `gal-ui-art.test.ts` 定点断言新增/旧路径结构、颜色与 `validateLayoutNode` 零 issue；首次沙箱执行被 Vitest 依赖的 Windows `realpath EPERM` 挡住、0 测试，受控本地重跑 19/19 退出 0。`npx tsc --noEmit` 退出 0；GAL/Profile/Save/UI 相邻 98 文件 789/789 退出 0。
- `node tools/ui-audit.mjs` 分别审计 `gal-gallery-v2-dark.audit.ts`、`gal-gallery-v2-light.audit.ts`：两态各 27 个绝对定位元素，重叠 0、硬对比失败 0、对比警告 0、border-image 前提缺失 0；house 主题、4 处 skin 命中。该审计画布 1060×760，不替代同画布截图。
- 短时隔离静态 Edge 审计 `GAL_ART_AUDIT_PAGES=gallery-memories,gallery-memories-art,gallery-cg` 在暗亮共六态退出 0，图片均加载、浏览器与临时构建关闭。实测 topbar x31/y14/right1409，标题 x84/y109、说明同列右端 x1356，页签 x84/y182、解锁数同列右端 x1356；回想 3/6、CG 2/6 随集合变化。首次新断言误把居中文字的 y 当顶栏 y 而退出 1，改为核对 topbar 框后重跑为绿。
- 同画布截图：[回想素材亮态](../review/gal-art-01a-gallery-memories-art-light-v2-chrome-1014.png)、[回想素材暗态](../review/gal-art-01a-gallery-memories-art-dark-v2-chrome-1014.png)、[CG 亮态](../review/gal-art-01a-gallery-cg-light-v2-chrome-1014.png)、[CG 暗态](../review/gal-art-01a-gallery-cg-dark-v2-chrome-1014.png)。夹具剧情文本/素材与原型演示内容不同，不据此宣称终图 1:1。

未闭：回想 01–06、锁态剪影、CG 02–06 的逐件素材批准与来源/许可，全部关键帧/四态逐像素，非施工独立复查，以及完整 S5/S6。项目里程碑保持 active/pending。
