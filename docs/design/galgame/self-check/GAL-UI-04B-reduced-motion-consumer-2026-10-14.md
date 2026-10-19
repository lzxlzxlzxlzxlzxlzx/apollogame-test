# GAL-UI-04B reduced-motion consumer 自证（2026-10-14）

结论：**施工自证待独立复查；不签完整设置、S5/S6 或 Owner gate。**

- Profile 升 V7：`reducedMotion` 默认 false，V6 只读迁移补 false；设置 Toggle 通过 Profile 串行事务持久化，失败保留旧值。
- `GalSliceHost` 将偏好只读投影到 PUI `mountUI`/`update` policy；不进 World/hash。恢复默认使用既有原子 Profile reset，不碰进度、已读或解锁。
- 定向：`gal-profile` 21/21、`gal-ui-slice-host` 39/39（合计 60/60）及 `tsc --noEmit` 通过。首次 V7 测试维护红、display-tab guard 红、旧 reset 断言红均已修复后重跑。
- 隔离 Edge：作品 off/on、reset，以及 Playwright `emulateMedia('reduce')` 的 OS 与 OS+作品属性断言通过；临时浏览器与目录均清理。
- 双 host/卸载：宿主测试断言当前 host policy 与第二容器不串，detach 后两容器无属性。
- 撤修边界：临时同目录副本成功命中并移除唯一 motion policy 传递、成功编译且 finally 清理；此前临时路径/相对导入及 hash-OS mock 各有真实工具红。**施工方未完成“变异副本驱动行为断言转红”，不得把编译成功称为撤修验红。**已交非施工者独立复查。
