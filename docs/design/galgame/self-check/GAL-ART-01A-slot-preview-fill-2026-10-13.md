# GAL-ART-01A · 槽位预览底色局部自证（2026-10-13）

结论：局部 PASS，完整 S5/S6 仍为 CONCERNS。基准为定稿 1440×900 [V2 存读档](../gal-ui-v2-save.png)，当轮截图为 [读取页亮主题](../review/gal-art-01a-slots-load-light.png)。

| 承诺 | 实证 | 判定 |
| --- | --- | --- |
| 空槽预览底与 V2 深蓝一致 | 原型 `(850,310)` RGB `(23,33,64)`；改前真渲约 `(13,19,32)`；改后真渲 `(24,34,64)`。对应 Panel 使用受限 `{custom:'#172140'}`；静态浏览器额外断言 computed `rgb(23, 33, 64)` | ✅局部对齐 |
| 只在 V2 槽皮加载成功时换色 | `applyGalUiArt` 以 `art.slot && slice===undefined` 与槽预览 ID 双重门控；无图与旧显式切片测试保持原 `sunken` | ✅回退保留 |
| 存读档行为不受背景色影响 | `npx vitest run src/services/gal-ui` 79/79，`validateLayoutNode` 零 issue；34 态静态真渲通过、图片完整、浏览器已关闭 | ✅局部合同 |
| 整页视觉/交互/演出 1:1 | 元数据、框外导航、ghost 状态、已填预览同内容、S6 关键帧仍见 [差异单](../gal-art-01a-s5-diff.md) | ⚠ 尚未收束 |

`npx vitest run src/ui/components` 528/528，`npx tsc --noEmit` 退出码 0。本轮仅改 GAL 消费层、点名测试和 GAL 静态探针，不改 PUI、素材索引或原型。

迭代 1：按原型像素值修正过黑预览底；重跑深亮 34 态并对照同点像素。
