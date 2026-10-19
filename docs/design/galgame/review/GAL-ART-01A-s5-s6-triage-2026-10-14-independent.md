# GAL-ART-01A · S5/S6 未决项与状态/时序独立复查（2026-10-14）

结论：**CONCERNS**。40 个静态页面实例的按钮状态清点、剧情局部关键帧、2200/2700ms 定点合同均经独立复跑成立；相同反馈第二次不重显的缺陷已在本报告后续复查中获**局部修复 PASS**。静态夹具仍不证明真实宿主跨页完整动作链、键盘焦点与每个模态出口，更不构成 V2 全屏 1:1 或终图审批。S5/S6、Owner 门和路线图 `media-and-final-skin` 仍保持待验/active。

## 独立实证

- 只读范围核查：共享树的 GAL UI、审计脚本、review 截图均已有他人在途修改；本复查不撤销、不覆盖施工文件、原型或路线图。报告是本人的唯一仓库写入。
- `npx vitest run src/services/gal-ui/gal-ui-slice-host.test.ts src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-read-model.test.ts`：3 文件 **60/60**，退出 0；`npx tsc --noEmit --pretty false` 退出 0。两次撤修后再跑宿主测试 **30/30**，退出 0。
- `GAL_ART_AUDIT_STATES=1 GAL_ART_AUDIT_FRAMES=1 node src/services/gal-ui/verify-gal-art-live.mjs`：在临时目录输出、20 屏×暗亮 **40 JSON**，退出 0；浏览器由脚本 `finally` 关闭，构建临时目录清理，未启动整套系统、未访问远程状态。独立汇总 **374** 个 button 实例：**270** 可见且可点、**44** 禁用、**60** 被模态层遮挡；270 个均有 computed hover 与 pressed 变化，0 个不变。另有剧情 **18** 张关键帧图。仓库此前 `*-states-states-all-1014.json` 的独立重算也得同一组数字。
- 关键帧复跑：台词 0ms `opacity=0/y+7`，120ms `opacity≈.685/y+2.21`，240ms `1/y0`；提示符 650ms `.35/y+4`、1300ms `1/y0`。选项 120ms 第一项 `.663`、第二项 `.191`，250ms 第一项完成、340ms 第二项完成；深亮均观测。`gal-ui-v2-choices.png` 与 `review/gal-art-01a-story-choice-light-frame-0120-frames-1014.png` 人眼对拍仅能确认分层与入场方向，不能凭计算样式宣布逐像素 1:1。
- `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-settings-text-light.audit.ts` 退出 0：重叠 0、硬对比失败 0、边框图前提失败 0、华丽件 12；唯一 WARN 为 `gal-settings-title` 比 3.57:1。该标题 36px 大字按手册 ≥3:1 合格，审计通用 AA 4.5 阈值警告应保留并说明，不算阻断，也不得假装无告警。

### 隔离撤修验红

使用 Vitest `startVitest` 的内存 `transform`，只对目标源码模块变换，不改共享文件；每项均先断言精确锚点在源文件恰好命中 1 次，再要求点名测试失败。

1. `gal-ui-slice-host.ts` 的 `duration: 2200` → `duration: 2600`：2200ms Toast 测试在原测试第 370 行转红（到时仍有 `[data-toast-stack]`）；变换命中 1，基线随后 30/30 绿。
2. `autoDelayMs: this.profile.preferences.autoDelayMs` → `... + 100`：2700ms 测试在原测试第 386 行转红（仍停 `intro` 而非 `choice`）；变换命中 1，基线随后 30/30 绿。
3. 对 `gal-art-01a-home-light-states-states-all-1014.json` 在内存中把唯一 `starter-act-0.hoverChanged` 置 `false`，与浏览器脚本同形的 `unchanged` 门抓到恰好 1 项。这只证明状态 JSON 汇总门会红，不等于真实 UI 源码撤修或视觉全验。

## 发现与范围边界

1. **[P2 · 已修复，局部 PASS] 重复相同反馈第二次不可见。** 原 `gal-ui-slice-host.ts:452-457` 用 `state.feedback === displayedFeedback` 去重；`showToast` 定时删 DOM 后 `displayedFeedback` 没归零。首次复查以内存注入测试真实复现：开始剧情→跳过未读显示提示→推进假时钟 2200ms 消失→再次跳过未读，第二次 `[data-toast-stack]` 为 `null`，1 failed。施工方随后在 `gal-ui-slice-host.ts:84-86,443-462,679-685` 以反馈事件 revision 区分同文案重触发，并把第二次显示及再过 2200ms 自消的断言落入 `gal-ui-slice-host.test.ts:356-375`。独立复跑该文件 **30/30** 退出 0；再通过 Vitest 内存 transform 把唯一锚点 `if (feedback) this.feedbackRevision++;` 改为不递增（命中断言=1），该点名测试在第 372 行**转红**（第二次 Toast 不存在）；复原后 **30/30** 再绿。共享生产代码和测试未由复查人编辑。此判词仅关本 P2，不补齐真实宿主动作链或 S6 全部反馈验收。
2. **“全按钮四态”应改称“静态夹具的可见按钮 hover/pressed 清点”。** `verify-gal-art-live.mjs:36-68,313-323` 的按钮集合是每页静态 `button[id]`，对可见 enabled 测默认/hover/pressed 的 computed 样式是否*不同*；44 个 disabled 只记录原生 `disabled` 和基态，未逐个试禁用 hover/pressed 是否保持不变、焦点可达性及与 V2 目标色/位移逐键对拍；60 个 occluded 以中心 `elementFromPoint` 分类，未测试背景点击/键盘是否被模态阻断。六类 hover/pressed 全屏截图是代表样例，不是 270 个按钮逐件全屏截图。数字可信，外推到全部四态 1:1 不成立。
3. **“关键帧时序”仅为局部 PASS。** `verify-gal-art-live.mjs:81-101` 暂停特定元素首个 Web Animation、设置 `currentTime` 截全屏；这可量台词、选择项、cue 的局部 `opacity/transform`，但不是原型与正式画面逐帧自动差分，也不覆盖点击后连续状态链、并行动画与 reduced-motion。18 图及计算值能支持 `S6-alignment` 的 1/2/3/5 局部事实，不能签整个 S6。
4. **2200/2700 属现有能力自答，不需新增 capability A/B。** `showToast(... duration:2200)` 与 Profile `autoDelayMs`→既有调度器有点名绿测和上述动态撤修验红；2700 是选中该偏好后的演示参数，不得覆盖作品包合法偏好。重复反馈是现有宿主接线缺陷，优先局部修，非 Owner 产品裁决。
5. **恢复默认与宿主退出仍不可标成功。** `gal-ui-settings.ts:172` 的恢复默认是原生禁用键；Profile reset 函数存在，但部分设置消费者尚未接通。按已定“完整设置接入后才开放”合同，补消费者是施工问题；只有若要改变定稿原型的可用状态/缩减范围才请 Owner 重确认，不能把工作量本身当 Owner A/B。`gal-ui-structure.ts:77` 的首页退出同样禁用且 action 为 `gal.unavailable`；定稿明确浏览器原型只反馈、桌面宿主真退出，当前模板/宿主没有可执行出口，因此桌面宿主退出语义与阶段范围可向 Owner 合批确认，不能把禁用键叫“退出已完成”。
6. **S5 四条 ⚠ 分类大体正确，但去向应更精确。** S5-1 终图审美、来源、许可、发行范围是 Owner 独占且未获批准；S5-3 存读档/画廊几何、卡片、可读性是施工可继续收敛，终图另待 Owner；S5-4 设置视觉/真实消费者先施工，只有降格原型才需 Owner；S5-7 首页其余键状态/位置先施工，文案或退出语义改变定稿才找 Owner。S6-4 静态审计之后仍缺真宿主完整链，属于可自行继续验证；S6 2200/2700 与已修复的重复提示均无需新增能力 A/B。`align-count` 为 0 只证明 ⚠ 有去向，绝不表示 1:1 已通过。

复查人仅签本轮证据和缺陷判断，不签 S5/S6、素材复核、Owner 人门或全库门禁。先前全库 `scoped-gate` 的 32 条非 GAL depcruise 与缺本地 `origin/claude/mainbranch` 参照按域隔离保留，本轮未改他域。
