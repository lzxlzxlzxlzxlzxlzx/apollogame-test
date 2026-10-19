# REQ-GAL-PUI-MOTION-POLICY-01 · PUI 施工自证（2026-10-14）

状态：PUI 通用接口已施工并自证，等待非施工者独立复查。本文件不宣称 GAL Profile/设置控件消费、S5/S6 或 Owner 人门完成。

## 合同与边界

- `mountUI` 新增可选第六参 `UIMotionPolicy { reducedMotion?: boolean }`；`MountHandle.update(root, theme?, motion?)` 可热更新。旧五参调用不产生策略属性，保持行为不变。
- 有效态为作品偏好与只读 OS `prefers-reduced-motion: reduce` 的并集；仅在本次 mount host 设置 `data-apollo-reduced-motion`，归零其闭集 CSS animation/transition（包括 flyIn、cue、按钮反馈、Modal、Slider、Transform）。OS 监听在 teardown 移除。
- 动作、DOM 结构、焦点、原生可操作控件和 ActionSink 不删改；无 World/hash/Profile/叙事或 sim 时间写入，也没有游戏私有分支、自由 CSS、GAL/资产/桌面壳改动。

## 实证

- 新增 `src/ui/components/motion-policy.test.ts`：默认、仅 OS、仅作品、组合四态；`update` 开关、OS 实时切换、两 mount 隔离、teardown 监听清理；同时验证减动下 Button action、Slider 和 Modal DOM 可达。
- `npx vitest run src/ui/components --maxWorkers=1 --minWorkers=1`：75 文件、569 测试 PASS。
- `npx tsc --noEmit --pretty false`：退出 0；`node scripts/docs-ref-guard.mjs`：PASS；`git diff --check`：退出 0。`context-budget-guard` 最终需在本报告后复跑，先前因手册超预算已压缩为上面的单行合同。
- `node src/ui/components/verify-motion-policy.mjs`：隔离 file:// Chromium 同时验证默认与作品减动的真实 computed duration（1.3s/.16s → 0s）及 Button action；临时 bundle 和浏览器均已关闭/删除。
- 未启动整套 ZeroCraft；无远程 Git/数据库写入。Vitest 首轮在默认沙箱遇 `realpath EPERM`，在受控本地测试环境复跑取得以上真实退出码。

## 撤修验红

唯一锚点 `src/ui/components/server.ts` 的 `host.toggleAttribute('data-apollo-reduced-motion', !!curMotion?.reducedMotion || !!motionQuery?.matches)` 已实查命中。仅临时替换为恒 `false` 后运行 `npx vitest run src/ui/components/motion-policy.test.ts --maxWorkers=1 --minWorkers=1`，结果 **3 failed / 1 passed**：作品偏好、OS 联集与跨 mount 隔离三个属性断言均从 `true` 变 `false`。已立即恢复原行；完整 PUI 套件随后 569/569 PASS。

## 独立复查请求

请非施工者独立复跑 PUI 套件和类型/文档守卫；在隔离副本撤掉上述唯一写入锚点并确认属性断言转红；另以真浏览器验证默认、仅 OS、仅作品和组合态的 duration/可操作性，读取任何告警。仅对本 PUI 基座给局部判词，不代签 GAL 消费或任何项目阶段门。
