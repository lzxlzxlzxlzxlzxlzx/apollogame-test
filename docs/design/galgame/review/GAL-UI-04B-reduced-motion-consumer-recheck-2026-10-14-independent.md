# GAL-UI-04B reduced-motion consumer 返修后独立复验（2026-10-14）

结论：**本票局部 PASS，原双真实 GAL host 卸载 CONCERNS 可关闭。** 前次反例与背景见 `GAL-UI-04B-reduced-motion-consumer-2026-10-14-independent.md`；PUI teardown 单独由非施工者判局部 PASS，见 `GAL-UI-04B-PUI-motion-teardown-2026-10-14-independent.md`。本复验不签完整设置页、S5/S6、Owner 人门或全库 gate。

## 独立实证

1. **复跑**：`npx vitest run src/services/gal-profile/gal-profile.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts --maxWorkers=1 --minWorkers=1`，2 文件 **60/60**、退出 0；`npx tsc --noEmit` 退出 0、无诊断。Profile 测试证实 V6→V7 只读迁移，旧 envelope 未被悄悄改写，`reducedMotion` 默认 false（`gal-profile.test.ts:219-227`）；恢复默认原子保存并保留已读/解锁事实，失败写不谎称成功（`321-355`）。宿主测试覆盖作品偏好持久化、设置动作、单 host detach（`gal-ui-slice-host.test.ts:74-89`）。
2. **锚点撤修验红**：我先审读再独立执行既有 `verify-gal-motion-consumer-mutation.mjs`。它在 `src/services/gal-ui` 创建唯一 UUID 的临时宿主/测试副本，锚点 `{ reducedMotion: this.profile.preferences.reducedMotion }` 恰好 **2** 次、测试 import 锚点 **1** 次；基线目标用例 **1 PASS**。只在临时副本把两处作品 policy 撤成 `{}` 后，目标用例 **1 assertion FAIL**（`expected false to be true`），不是编译或找不到模块的假红。脚本 `finally` 清理，随后独立 `rg --files` 核查无 `gal-ui-slice-host.review-*` 残留；未修改正式源文件。
3. **前次反例实证复现**：同一脚本追加的独立对抗用例让两个 `GalSliceHost` 都真实 `attach` 到不同 DOM host。左开启时仅左有 `data-apollo-reduced-motion`；右开启、左关闭后仅右有；依次 `detach` 后左右均无属性。本次用例 **1 PASS**，而前次在未修 PUI teardown 上曾于右卸载后 `expected true to be false`。`gal-ui-slice-host.ts:157-175,518` 把 Profile policy 传入 mount/update 并在 detach 调用 PUI mount 句柄；`server.ts:1240-1244` 现在清理本 host 标记，故可关掉那一具体阻断。
4. **Edge 专项与告警**：审读 `verify-gal-reduced-motion-live.mjs` 确认为临时 file bundle、独立 Edge、`finally` 关闭浏览器并删除临时目录后，自行执行退出 0，输出 `GAL reduced-motion browser work-policy/reset: PASS`。脚本实走默认未启用、作品开启、恢复默认清除、OS reduce、OS+作品并集。显示设置页亮/暗静态 audit 均退出 0，重叠/硬对比/border-image 缺项为 0；亮态仍有 `gal-settings-title` 对比 **3.57:1**（低于 AA 4.5）的非阻断 WARN，暗态仍有华丽件仅 1、未识别 house 主题的非阻断提示。不能以本票通过吞掉这些 S5 视觉告警。

技能影响：按 `module-ui`/`check-ui` 的 LayoutNode 与自检边界，本次只核共享 PUI policy 经 GAL 消费的生命周期与显示页审计，不用直接 DOM 写操作给 GAL 加私有补丁。Edge 已关闭，临时副本与临时 bundle 已清理。局部 PASS 仅意味着原 reduced-motion consumer 的特定 PUI teardown 阻断关闭；其他设置消费者或整页设计差异仍须各自证据。
