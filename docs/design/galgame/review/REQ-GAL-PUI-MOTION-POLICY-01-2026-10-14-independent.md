# REQ-GAL-PUI-MOTION-POLICY-01 · PUI motion policy 独立复查（2026-10-14）

判词：**指定 PUI 基座局部 PASS**。复查人与施工者不同；不签 GAL Profile/设置控件消费、S5/S6、桌面壳或 Owner 人门。

## 范围核对

- `UIMotionPolicy` 是 `mountUI` 的可选第六参，且 `MountHandle.update(root, theme?, motion?)` 可在当前 mount 热更新；旧五参调用保持无属性、旧行为。
- `server.ts` 在 view boundary 只读 `matchMedia('(prefers-reduced-motion: reduce)')`，以作品 `reducedMotion` 与 OS 偏好并集只设置当前 host 的 `data-apollo-reduced-motion`；`update` 重算，teardown 移除 listener。它不触及 LayoutNode、World/hash、Profile 或叙事/sim 时钟。
- scoped 归零规则覆盖 animation/transition delay 与 duration；按钮、Slider、Modal DOM、焦点与 `ActionSink` 路由未因策略被删改。两 host 的单测证明偏好不跨 mount 泄漏。

## 四步独立实证

1. **复跑**：`npx vitest run src/ui/components/motion-policy.test.ts --maxWorkers=1 --minWorkers=1` 为 4/4 PASS；完整 `npx vitest run src/ui/components --maxWorkers=1 --minWorkers=1` 为 75 文件、569/569 PASS。`npx tsc --noEmit --pretty false` 退出 0；`docs-ref-guard`、`context-budget-guard` 与 `git diff --check` 退出 0。默认沙箱的 Vitest 首次被 Windows `realpath EPERM` 阻断；相同只读本地测试在隔离环境得到上述实证。
2. **撤修验红**：在 `%TEMP%` 的隔离副本确认唯一锚点 `host.toggleAttribute('data-apollo-reduced-motion', !!curMotion?.reducedMotion || !!motionQuery?.matches)` 命中一次，再仅替为恒 `false`。定向测试得到 **3 failed / 1 passed**（作品热切换、OS 并集、跨 mount 隔离均从预期 `true` 变 `false`）；临时目录已删除，未改共享工作树。
3. **真浏览器**：短时隔离 Edge/Chromium + `file://` 临时 bundle 覆盖 default、仅作品、仅 OS、两者同时四态；默认 cue/button 为 `1.3s/.16s`，后三态均为 `0s`，四态按钮点击均进入 `go` action。浏览器与 bundle 在 `finally` 关闭/删除；未启动整套系统。
4. **告警审查**：上述命令无产品诊断。`git diff --check` 仅打印共享树大量既有 CRLF 转换警告，退出 0；这不是本票代码告警。没有发现 World/hash、动作总线或挂载隔离的反例。

## 边界

本 PASS 只说明通用 PUI policy 已可供作品消费。GAL 的版本化 Profile 迁移、只读投影、设置控件启用及其写失败/读档/跨包产品流程仍未施工；`gal-setting-reduced-motion-control` 必须继续 disabled，直至该消费票另行自证与独立复查。
