# GAL-ART-01A · 存读档顶部导航局部自证（2026-10-13）

状态：局部 PASS；整页 S5/S6 仍为 CONCERNS。定稿基准为 [V2 存读档](../gal-ui-v2-save.png)，当轮 1440×900 真渲为 [读取页亮主题](../review/gal-art-01a-top-nav-slots-load-light.png)；深主题与保存页同轮图亦在 `review/gal-art-01a-top-nav-slots-*.png`。

| 承诺 | 当轮实证 | 判定 |
| --- | --- | --- |
| 顶部导航位于系统外框上方 | V2 有图路由将既有 `gal-slots-header-actions` 从外框内部移到 Screen 直系布局，x1080/y16/330×40；34 态隔离真渲中存档/读档深亮四态均断言按钮底端不低于外框顶端 y60 | ✅ 局部对齐 |
| 两按钮仍各自可点、动作不变 | 静态浏览器真点击“设置”→`gal.settings.open`、“返回剧情”→`gal.slot.back`；LayoutNode 树只含一份 `gal-slots-settings`，无重复 id | ✅ 行为保留 |
| 无图与旧切片不漂移 | 仅 `art.systemFrame.slice===115 && art.slot` 实际存在且 `slice===undefined`、Screen 内有槽页结构才移动；无图/缺槽图点名测试仍把按钮留在原 header，34 态探针覆盖缺图夹具 | ✅ 回退保留 |
| 原型完整四按钮与视觉 | 当前正式 GAL 槽页只有“设置/返回剧情”两项既有动作，未凭空加原型的“主页/剧情/回想 CG”；ghost 胶囊、悬停、底部元数据和已填预览仍见 [S5 差异单](../gal-art-01a-s5-diff.md) | ⚠ 不签整页 |

定向 `gal-ui-art.test.ts` 12/12；GAL+UI 607/607；`tsc --noEmit` 退出码 0；34 态隔离浏览器真渲退出码 0，临时浏览器及临时目录已关闭/清理。无图槽位 UI 审计零重叠/零硬对比失败，亮主题标题 3.57:1 警告未消。默认审核图覆写两次遇 Windows `UNKNOWN open`（旧图仍保留），故以唯一新文件名保存本轮四张槽页图，未将旧图冒充新图。[独立复查](../review/GAL-ART-01A-slot-top-nav-independent.md)验证框外几何、8 次点击和锚点撤修验红，局部 PASS；整页 S5 为 CONCERNS。全库 `scoped-gate --run` 在 34 项非 GAL 依赖违规处退出 1，未宣称全绿。迭代 1：将已有动作树外移、重渲和真点击；迭代 2：补缺槽图回退保护并复查，剩余差异未归零。
