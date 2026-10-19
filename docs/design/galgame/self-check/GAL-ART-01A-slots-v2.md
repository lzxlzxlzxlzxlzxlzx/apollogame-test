# GAL-ART-01A · 存读档 V2 局部自证（2026-10-13）

范围仅是本轮 GAL 有图消费数据：保存/读取页签、顶部与翻页按钮皮、底栏锚点。不是整个 S5/S6 对齐单，也不代替独立复查或 Owner 人门。

## 真渲与对照

- 定稿基准：[V2 存读档](../gal-ui-v2-save.png)，1440×900。
- 当轮隔离 `file://` 真渲：[读取·亮主题](../review/gal-art-01a-slots-load-light.png)、[读取·暗主题](../review/gal-art-01a-slots-load-dark.png)。`verify-gal-art-live.mjs` 输出 34 态、退出 0，浏览器已关闭；未使用 Owner 日常浏览器。
- ✅ 4×3 槽卡保持每行四栏、三行；当前素材和动态槽内容与原型的演示内容不同，不拿像素差冒充皮肤缺陷。
- ✅ 页签由小钮变为 124×46 的现有 V2 按钮皮；顶部/翻页操作不再继承糖果皮；底部提示从框下回到框内，测试钉住仅 V2 有图路径偏移 57px。
- ⚠ 顶部导航仍在框内，原型在框外；编号胶囊、ghost 金线与悬停态、存档预览内容尚未 1:1。去向：[S5 差异单](../gal-art-01a-s5-diff.md)继续施工；未经 Owner 裁决不降格。

## 机械自检

- GAL 服务测试 79/79；`gal-ui-art.test.ts` 点名断言 V2/无图/旧切片分路及 `validateLayoutNode` 零 issue。
- UI 组件 528/528；深亮槽位 `ui-audit` 均零重叠、零硬对比失败、零 border-image 前提错误。亮主题无图审计有标题 3.57:1 警告、暗主题无图审计有华丽度警告；这些夹具不是有图页的对比度证明。
- 全库 `tsc --noEmit` 退出 1，报错在 card-reveal、dice、theft/launcher 等其他范围；未据此宣称全库绿。

结论：本轮局部改善可送独立复查；整个 `media-and-final-skin` 仍 active，S5/S6 未完成。
