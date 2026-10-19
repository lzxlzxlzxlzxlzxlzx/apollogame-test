# GAL-UI-04B-3 输入/显示消费者独立复查（2026-10-14）

结论：**指定增量局部 PASS，整体 S5/S6 与 GAL-UI-04B-1 仍为 CONCERNS**。本复查人不是施工人；未改实现、原型、路线图或工单，也未批准 Owner 门。

## 独立复跑

- `npx vitest run src/services/gal-profile/gal-profile.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts src/services/gal-ui/gal-ui-story-03e.test.ts src/services/gal-ui/gal-ui-art.test.ts`：4 文件、73/73，通过，退出 0。首次沙箱运行因 `node_modules/vitest/dist/spy.js` 的 EPERM 而 **0 测试执行/退出 1**；授权本地只读依赖后重跑成功，不能将首次运行当通过。
- `npx tsc --noEmit --pretty false`：退出 0，无诊断。
- 实查 `GalSliceHost.wheel`：关闭的 `wheelAdvance`/`wheelRollback` 在派发剧情动作前返回；`gal.story.wheel-up/down` 进入同一守卫。挂载 DOM WheelEvent 的双向关闭测试在 `gal-ui-slice-host.test.ts`；`gal-ui-story-03e.test.ts` 断言 Panel 闭集动作名称。
- 实查 `gal-story-dialogue-backdrop` 与文本分层、`0.6` 只赋于背景；Profile V4 只读迁移与三项并发写入、非法布尔值拒收分别有指向性断言。选择后自动续播的正例明确要求先前 auto、有效选择、下一个节点为 line。

## 隔离撤修验红

只在 Node 进程内读取 `gal-ui-slice-host.ts`；唯一锚点 `if (deltaY > 0 && !this.profile.preferences.wheelAdvance) return;` 命中 **1** 次。提取 `wheel` 方法体，用关闭下滚的隔离假宿主执行：原实现派发数 **0**；内存副本移除该锚点后派发数 **1**，独立红检成立。没有回写源文件或用户数据。此撤修证明下滚守卫可被探针捕获，不外推为全部四项的逐项撤修。

## 告警与范围

- 首次 Vitest `EPERM` 是运行环境读依赖问题，已记录并重跑，不掩盖。
- 本轮未独立重跑完整 689/689、44/44、真浏览器深亮审计或全库 scoped-gate；施工自证所述亮色对比度 3.57:1/3.17:1、共享树其他域门禁阻断仍须在完整 S5/S6 裁决中处理。
- 自动续播反例增量已于同日补齐并复查，见下节；不能据此宣称完整自动播放验收。
- PUI 的 StoryRef 逐字完成/立即显全通知仍未提供；文字速度、已读快进、全局恢复默认等保持禁用，不能把 04B-3 的 PASS 扩成 04B-1 或设置全完成。

浏览器/服务：本复查没有启动浏览器或整套 ZeroCraft，无常驻进程；访问地址不适用。

## 同日增量复查：自动续播四反例

只核 `gal-ui-slice-host.test.ts` 新增的 `does not resume auto for...` 一例四场景；其余同期共享树改动不属于本票。逐一核实：设置关闭、无效选项、选项指向 ending（非 line）、手动抵达选项，均断言播放模式保持 off、无未取消时钟任务，且目的节点/无效选择结果正确。`npx vitest run src/services/gal-ui/gal-ui-slice-host.test.ts -t "does not resume auto"`：1/1 通过，32 跳过；全文件复跑 33/33，通过；两次退出码 0，未见测试告警。

内存撤修检查：`GalSliceHost` 的自动续播开关、选择合法性、目标 `kind==='line'`、`resumeAutoAtChoice` 四处锚点各唯一命中；从源码提取续播布尔表达式，关闭设置与手动抵达的原式均为 false，分别去掉对应锚点后变 true。无效选择守卫及非 line 守卫的唯一锚点也确认移除/恒真会反转该条件；后两项是**隔离语义探针**，未运行完整 Vitest mutant，故不将其冒充四项完整测试套件撤修验红。内存检查首次因跨行空白匹配失准退出 1，修正匹配后退出 0；未改源文件。新增测试本身的四个结果可独立复现，判词维持指定增量局部 PASS。

本轮未修改实现；当前 `git diff` 对宿主实现仍包含既有大量在途变更，不能仅凭相对 HEAD 的 diff 推断这些改动发生于本次增量。PUI 04B-1、完整 S5/S6 与全库门禁仍明确排除。
