# REQ-GAL-PUI-ACCESSIBILITY-POLICY-01 独立复查（2026-10-15）

判词：**共享 PUI accessibility policy 局部 PASS**。复查人不是施工者，未修改 `src/ui/**`。这只证明共享合同可供后续 GAL 消费票依赖；不启用 GAL 的高对比/缩放控件，不代签 V2 原型重确认、04B、S5/S6、项目控制台或 Owner gate。

## 锁与范围事实

- 复查开始时 `docs/workflow/requests.md:15–22` 记载施工主体为 PUI `/root/pui_accessibility`，状态为 `review（等待非施工者独立复查）`；本复查不改该锁或票状态。
- 已按 `docs/design/ui-playbook.md §8` 独立核对：`UIAccessibilityPolicy` 仅作为 `mountUI` 第七参及 `MountHandle.update(..., accessibility?)` 的 render-only 投影；未进入 LayoutNode、World、hash 或 ActionSink。
- 合同是 `highContrast?: boolean` 与闭集 `scale: '90'|'100'|'110'`。高对比在主题之后覆盖语义 token 和焦点环，不滤镜化自定义色/贴图；非默认 scale 通过 host `zoom` 同步实际命中区和键盘焦点坐标，默认与 `'100'` 零漂移。范围检查未见本票修改 `src/services/gal-*`、冻结 V2 原型或 GAL 消费者。

## 独立运行与告警审阅

- 点名：`npx vitest run src/ui/components/accessibility-policy.test.ts src/ui/components/motion-policy.test.ts --maxWorkers=1 --minWorkers=1`，**2 文件 / 8 测试通过**。
- 共享 UI suite 为避免单次 shell 30 秒截断，按互斥三组完整复跑：**76 文件 / 573 测试通过**（184 + 223 + 166）；覆盖 server、update、Modal、motion、typewriter、visual/audit fixture 等相邻面，退出均为 0。
- 真浏览器审计：`node tools/ui-audit.mjs src/ui/components/accessibility-policy.audit.ts --w 1060 --h 760 --min-contrast 4.5`。第一次在受限临时 profile 因 Edge DualEngine SiteList 写入 `-5` 导致 browser closed，**未采信为结果**；按短生命周期隔离 profile 受控重跑，重叠/硬对比/border-image 三类阻断均为 **0**。输出有“零华丽件”非阻断提示；这是通用可访问性 fixture 而非游戏屏，未作为华丽起手验收或缺陷掩盖。

## 独立撤修验红

未触碰共享工作树。创建 detached 本地 worktree，仅镜像当前 `server.ts`、`types.ts` 与点名测试；确认唯一锚点 `case '110': return 1.1;` 后，仅删除该分支。运行：

`npx vitest run src/ui/components/accessibility-policy.test.ts --testNamePattern "keeps old mounts byte-compatible and makes only closed scale tokens effective"`

结果 **1/1 失败、退出 1**，精确失败于 `accessibility-policy.test.ts:29`：`scale:'110'` 的实际 `zoom` 由期望 `1.1` 变为 `''`。恢复同一分支后，同一命令 **1/1 通过**。这证明闭集缩放映射和其点名断言真实相连，不是未覆盖绿灯。

## 可用证据与未签范围

- 可供路线图/后续 GAL 04B 使用的局部证据：共享 PUI policy 的默认兼容、三档 scale、热更新、主题后高对比、焦点/Modal、双 mount 与 teardown 已有独立测试和浏览器阻断项 0；GAL 只能在 V2 重新确认后另票接 Profile/设置消费者。
- 当前共享票状态应由施工/控制面按事实从 `review` 收束；本 Review 不代为更改，也不影响 `ui-settings-confirmations` 保持 active 或其 Owner 人门。
- 未运行全库 tsc/build；不把并行 GAL/叙事诊断归因于本票，也不声明整库绿灯。
