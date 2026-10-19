# GAL-UI-04B-3 · 已读快进独立开关施工自证（2026-10-14）

结论：GAL 域新增 `readSkipEnabled` 真消费者，施工自证通过；本增量**待非施工人独立复查**，不能外推为完整 04B、S5/S6 或 Owner 人门。先前 04B-3 滚轮、透明度与自动续播增量的局部独立 PASS 仍有效。

需求判断：V2 “已读快进”与“跳过未读”是两个独立开关。原 `skipMode: read-only | all` 只能决定是否跨未读，不能表达“已读关闭、未读允许”。既有 GAL Profile 版本迁移和宿主定时调度可扩写一个布尔偏好，不需要新建游戏层解释器或扩 PUI 控件；沿 Owner 已选通用 A 方向施工。未开启任一适用策略时按具名 `disabled` / `unread` 原因停止，晚到回调重新读取偏好并拒绝越界推进。

实现边界：Profile V5→V6 只读迁移给旧档 `readSkipEnabled: true`，保留旧行为；两开关同包串行持久化，拒绝非布尔值。设置页只在宿主有播放时钟时投递 `gal.settings.skip-read`，不改 `src/ui/**`、剧情 World、原型或素材。用户关闭已读快进后若仍允许跳过未读，调度仅可跨未读台词；反之只可跨已读台词。恢复默认、文字速度和其他尚无消费者的设置仍禁用。

验证：定向 Profile/调度/宿主 **62/62**；GAL Profile/UI/Save + PUI 相邻回归 **98 文件 788/788**；`npx tsc --noEmit` 退出 0。点名测试包含 V5 封套只读迁移、非法布尔拒绝、两个开关相互独立、晚到任务偏好重判、宿主实际停止及重开持久化。`verify-gal-04c-live.mjs --transient-shots` 四设置页与 V2 同画布几何完全一致，退出 0；`verify-gal-art-live.mjs` 设置文本暗/亮短时真浏览器退出 0；同步挂载的 `gal-ui-settings.audit.ts` 通过 `tools/ui-audit.mjs`，绝对定位元素 13 个、重叠/硬对比/border-image 阻断均 0。华丽度提示仅启发式，不作 V2 视觉签核。两次浏览器探针及审计均未启动 5173/整套系统，临时浏览器和目录已清理。

首轮 Vitest 在默认沙箱被 `node_modules/vitest/dist/spy.js` 的 Vite `realpath EPERM` 拦在执行前；相同定向命令于受控非沙箱本地复跑后 62/62。施工侧未做锚点撤修验红，须由非施工者独立复跑、验红、实证复现并读告警。完整 S5/S6 仍受 PUI StoryRef 接口、其他未接通设置、终图审批与 Owner 门约束；全库门禁既有他域故障不因本地局部通过而改称绿色。
