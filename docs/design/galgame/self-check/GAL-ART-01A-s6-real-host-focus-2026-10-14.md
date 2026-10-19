# GAL-ART-01A · S6 真实宿主键盘/焦点/弹窗链局部自证（2026-10-14）

结论：新增的**真实 GalSliceHost** 隔离浏览器探针 `src/services/gal-ui/verify-gal-s6-host-focus-live.mjs` 局部通过；待非施工人独立复查。它不替代 S6 全按钮四态、逐帧视觉、正式素材与 Owner 人门，S5/S6 整体仍为 **CONCERNS**。

探针只构建 `gal-ui-live-wheel.audit.ts` 到任务级临时目录，通过 `file://` 挂真实 Narrative Director World、`GalSliceHost`、内存 Profile/手动槽；不启动整套 ZeroCraft，不连远程数据库或日常浏览器资料。`finally` 关闭无头 Edge 并删经路径校验的临时构建。本轮 `--transient-shots` 与留证模式各退出 0，浏览器均关闭；浏览器 pageerror 为 0。

| 玩家可见路径 | 浏览器断言 | 截图 |
| --- | --- | --- |
| 首页 → 剧情 → 设置页签 → 返回剧情 | 各按钮获焦后按 Enter，真实宿主 page/settingsTab 如期变更 | 操作链在探针中 |
| 剧情历史弹窗 | 打开时焦点在 dialog 内；Tab 不越界；Esc 关闭后焦点回 `gal-story-history` | [历史弹窗](../review/gal-s6-host-focus-history.png) |
| 返回标题确认 | 焦点被 Modal 捕获；Shift+Tab 不越界；遮罩下的 `gal-story-save` 合成点击不触发；Esc 取消后焦点回 `gal-story-home`；再次确认后真正回首页 | [确认弹窗](../review/gal-s6-host-focus-confirm.png) |
| 首页 → 画廊 → 解锁 CG → 大图 → 返回 | 解锁只写隔离内存 Profile；CG Modal 获焦；Esc 关闭后仍在画廊，返回回首页 | [CG 大图占位](../review/gal-s6-host-focus-cg.png) |

留证截图使用无正式图的结构夹具，不能替代定稿 V2 的材质/构图验收；确认窗亦非 V2 有图美术路线。此前 `verify-gal-live-wheel.mjs` 已覆盖真实前进、回滚、重选、槽 2 保存/读取；`verify-gal-live-gallery.mjs` 已覆盖历史滚轮隔离与 CG 分页。此票新增的是同一真实宿主的键盘焦点、模态底层拦截与三个出口，不把多个局部探针相加伪称完整 S6。

待非施工人依四步复查（独立复跑、锚点命中撤修验红、实证复现、读告警）。当前 04B-3 正由另一位复查人审阅，本票不修改其受审实现。无远程 Git/数据库写入，未代签 Owner 人门。
