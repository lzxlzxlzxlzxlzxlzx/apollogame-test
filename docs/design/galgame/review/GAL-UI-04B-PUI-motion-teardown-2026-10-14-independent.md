# GAL-UI-04B PUI reduced-motion teardown 返修独立复查（2026-10-14）

结论：**PUI teardown 返修局部 PASS**。复查人非施工人；只写本 Review，不改产品代码。本判词不覆盖 GAL 接线、S5/S6 阶段或 Owner 人门。

## 四步实证

1. **独立复跑**：`npx vitest run src/ui/components/motion-policy.test.ts src/ui/components/v2-visual.test.ts --maxWorkers=1 --minWorkers=1`，2 文件 **8/8**、退出 0；按 UI 自检规则扩跑 `npx vitest run src/ui/components --maxWorkers=1 --minWorkers=1`，75 文件 **569/569**、退出 0；`npx tsc --noEmit` 退出 0、无诊断。
2. **唯一锚点撤修验红**：读取 `src/ui/components/server.ts:1240-1244`，`host.removeAttribute('data-apollo-reduced-motion');` 唯一命中 **1** 次。在 esbuild `onLoad` 的内存源码副本中仅撤掉该行，未写共享文件；以相同的双真实 DOM host 挂载用例执行。原版“teardown 后 first/second 均无该属性”断言为 `true`；突变版为 `false`，目标断言确实转红。
3. **实证复现**：`motion-policy.test.ts:80-92` 创建两个真实 `mountUI` host：first 显式 `reducedMotion:true`，second 为默认策略；挂载后只 first 带 `data-apollo-reduced-motion`，调用 first 的 teardown 后两者均不带。源码中该标记置于 host 而非 document，全局零时长 CSS 用 `[data-apollo-reduced-motion]` 范围选择器；teardown 先解除 OS `matchMedia` 监听，再清本 host 标记（`server.ts:390-399,1240-1244`）。更新与 OS 偏好联动亦由点名测试覆盖。没有把仅检查 `innerHTML=''` 当作清理标记的替身。
4. **读告警**：两次 Vitest 与 tsc 均无 WARN/诊断，退出码均为 0；测试输出未出现跳过或失败。本票仅改运行时 teardown 和测试，不涉及新页面布局，故未以静态 UI audit 代替这个状态生命周期用例。未启动整套系统、数据库或远程写入。

范围说明：当前测试和内存对抗覆盖两个不同 host 的隔离及本 mount 卸载；未宣称同一 host 并发重复挂载可安全共存，也未借本局部 PASS 推进 GAL 视觉阶段。
