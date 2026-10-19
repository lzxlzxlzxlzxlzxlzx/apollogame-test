# GAL-UI-04B-3 · 输入与显示设置局部施工自证（2026-10-14）

结论：GAL 域内可用的输入/显示消费者已接通，**待非施工人独立复查**；不等于 GAL-UI-04B-1、S5/S6 或全部设置完成。Owner 已选通用 A 路径，但 PUI 的逐字完成/立即显全 StoryRef 接口仍未到位。文字速度、已读快进、全屏、转场、减少动态、高对比、UI 缩放与全局恢复默认继续禁用；无新素材、无原型改写。

| 合同 | 施工侧实证 | 边界 |
| --- | --- | --- |
| 旧 Profile V1–V4 升 V5，显示/输入字段按包隔离并串行保存 | `gal-profile.test.ts` 含 V4 校验过的封套、只读迁移、并发逐项保存、坏布尔值拒绝；原有 V1–V3 及跨包测试仍绿 | 不触及手动槽世界快照；失败不伪称保存成功 |
| 滚轮上/下开关确实阻止对应方向叙事动作 | 页面 Wheel Action 改为 `gal.story.wheel-up/down`，统一进入宿主守卫；挂载 DOM WheelEvent 关闭后的双方向断言见 `gal-ui-slice-host.test.ts` | 直接剧情按钮不受滚轮偏好影响 |
| 对话框不透明度 40–100% 只作用框皮，不降低姓名/台词透明度 | `gal-story-dialogue-backdrop` 与文本为同级 LayoutNode；60% 值持久化、非法 101 拒绝、重开保持；深亮剧情 UI 审计 0 阻断 | V2 原有外框仍 1400×345；逐像素/关键帧视觉验收另在 S5/S6 |
| 选择后继续自动播放 | 只在先前 auto 到达 choice、开关开启、选择被 Director 接受且下一节点为 line 时恢复；定点时钟测试通过 | 无播放时钟时开关禁用；结局等非 line 不续播 |
| 快捷说明 | 设置页按钮投递可见反馈，文案只描述已接通的滚轮/点击/工具栏能力 | 不声称未接通的键盘快捷键或全屏功能 |

验证：`npx tsc --noEmit --pretty false` 退出 0；GAL Profile/UI + PUI 86 文件 **689/689** 通过；GAL Save + 包装配 4 文件 **44/44** 通过；`validateLayoutNode` 点名树零 issue。`tools/ui-audit.mjs` 的设置 text/display 深亮及剧情深亮 6 次均退出 0：重叠、<3:1 对比硬失败、border-image 前提均 0。亮设置标题 3.57:1、亮剧情姓名 3.17:1 为大字 ≥3:1 的非阻断告警，暗色静态夹具华丽度启发式警告仍在；未把这些当 S5 1:1。审计短生命周期浏览器/临时构建已关闭清理，未启动整套 ZeroCraft。

共享树 `node scripts/scoped-gate.mjs --run` 退出 **1**：本地缺 `origin/claude/mainbranch` 比较引用，且在 ESLint 阶段读取他域在途 `games/game-clue-investigation/s6-ui034-independent-mutation.test.ts` 得 ENOENT；本轮没有删除/重建该文件，也不声称全库绿。未写远程 Git/数据库、未代签 Owner 门。下一道门是非施工人独立复跑、锚点命中撤修验红、实证复现与告警复读；本自证不是 Review 判词。

独立复查后的补强（2026-10-14）：[首次局部独立报告](../review/GAL-UI-04B-3-input-display-2026-10-14-independent.md)指出 auto 正例已有、负例缺定点实证。现于 `gal-ui-slice-host.test.ts` 新增四种反例：开关关闭、无效选择、有效选择落结局、未曾启动 auto 而手动抵达选项，逐一断言播放模式保持 off、无活动时钟任务及剧情位置正确。指定 4 文件 **74/74**、GAL/Profile/UI 86 文件 **690/690**、`tsc --noEmit` 退出 0。该新测试增量仍须非施工人再复查；不把施工自测改写为其签名，也不改变 04B-1 或 S5/S6 的状态。
