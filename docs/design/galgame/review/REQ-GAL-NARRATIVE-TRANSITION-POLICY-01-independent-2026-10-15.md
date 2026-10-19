# REQ-GAL-NARRATIVE-TRANSITION-POLICY-01 独立复查（2026-10-15）

判词：**共享叙事转场投影合同局部 PASS**。复查主体不是施工者（施工自证署名 Codex/root，本复查未采信其绿灯）。未改实现、`src/ui/**`、GAL 设置页、冻结原型、资产、`requests.md` 票状态或路线图。这只证明 `src/services/presentation/narrative-transition-policy.ts` 及其对 `committed-transition.ts` 的消费满足本条共享合同；不启用 GAL「转场演出」，不代签 `ui-settings-confirmations`、GAL 04B、S5/S6、项目控制台或 Owner 人门。

## 锁与范围

- 合同原文：`docs/workflow/requests.md` 的 REQ-GAL-NARRATIVE-TRANSITION-POLICY-01。施工主体仍是 Codex/root，状态仍是 in-progress。本复查不改锁、不把票标成 done。
- 施工自证 `docs/design/galgame/self-check/REQ-GAL-NARRATIVE-TRANSITION-POLICY-01-2026-10-15.md` 只作导航。
- 对照面：`narrative-transition-policy.ts`、`narrative-transition-policy.test.ts`、`committed-transition.ts`、`committed-transition.test.ts`。手册行 `docs/playbooks/events-logic.md` 对「先 stop、收成 cut、不持有包/Profile/计时器/DOM」的描述与实现一致；本复查未改手册。

## 独立复跑

工作目录：`C:\Users\24652\Desktop\projects\games\ApolloGame-complete\ApolloGame-claude-mainbranch`。本机无可用沙箱后端，两次完整命令都用完整权限执行。

命令：

`npx vitest run src/services/presentation/narrative-transition-policy.test.ts src/services/presentation/committed-transition.test.ts`

- 撤修前（15:15:28）：退出码 **0**。Test Files **2 passed (2)**，Tests **10 passed (10)**。`committed-transition.test.ts` 4 通过，`narrative-transition-policy.test.ts` 6 通过。
- 恢复源码后（15:17:49）：同一命令退出码 **0**，仍是 **2 文件 / 10 测试通过**。

## 撤修验红

撤修前源文件 SHA256：`3C519203988BA325FEAB8FEF11DA2A69CE52D087D016E62A82FE9E43AE45BD79`。唯一改动是把第 85 行

`if (effective !== declared) note(world, 'decision', \`effective ${effective}\`, declared);`

改成 `if (false && effective !== declared) note(...)`。其余字节未动。

命令：

`npx vitest run src/services/presentation/narrative-transition-policy.test.ts -t "collapses disabled"`

结果：退出码 **1**。文件收集成功，**1 failed | 5 skipped (6)**，不是收集失败，也不是 0 个测试。失败用例是 `collapses disabled and reduced-motion to the same cut result without replaying`。断言在 `narrative-transition-policy.test.ts:50`：期望三组 `['decision','wipe']`，实际 `[]`。前面的 `effective: 'cut'` / `phase: 'settled'` 断言没有先失败，所以红的是 decision trace 这一条锚点。

随后用撤修前副本逐字写回。恢复后 SHA256 仍是 `3C519203988BA325FEAB8FEF11DA2A69CE52D087D016E62A82FE9E43AE45BD79`。源码中已无 `false &&`，第 85 行回到原来的 `if (effective !== declared)`。上面的完整命令再次退出码 0。

## 合同对照

对照 `requests.md` 本条，实现与点名测试覆盖如下。

- 开/关与 reduced-motion：`effective` 为 `!preferences.enabled || preferences.reducedMotion ? 'cut' : declared`。关闭优先于减动，但两者都收成同一 `cut` 终态；三种组合（关、关且减动、开且减动）都断言 `declared: 'wipe'`、`effective: 'cut'`、`phase: 'settled'`，再 `advance` 仍停在 settled，不重播 wipe。开启且不减动时，fade 按 `fade-out → fade-in → settled` 推进。
- 正常推进：宿主调用 `advance` / `skip`。服务自己没有计时器。cut 序列只有 `settled`。
- 回滚、读档、回想：`project` 每次作废旧 token。隔离路径先 `stop()` 再投影：回想同一 ref 后旧 token 为 `stale-token`；`stop` 后帧为 null，再投影另一节点时 `from` 为 null，旧 token 不能 `skip`。不先 `stop` 而直接 `project` 新 ref，会把上一帧的 `to` 当作下一次的 `from`，这是正常推进；回滚/读档/回想必须先 `stop`，测试就是这样做的。
- 跨 host / 跨包：token 是对象身份。另一只 policy 在空闲时拒绝外来 token 为 `inactive`，自己投影后拒绝为 `stale-token`，原 host 的 `packageId/chapterId/nodeId` 不变。
- dispose：`stop` 后拒绝后续 `project` / `skip`，原因为 `disposed`。重挂是新实例；已 dispose 的实例不能再投影。
- 失败清掉旧投影：`project` 在校验前先把 `active` 置空。非法 source 返回 `invalid-source` 且帧为 null，旧 token 变为 `inactive`。非法偏好同样在置空之后拒绝。`setPreferences` 遇到非法偏好也会先 `stop`。
- 偏好中途变化：`setPreferences` 对当前序列 `skip` 到 settled，把 effective 收成 cut，并更换 token；旧 token 不能再推进。开启不会从头重播旧场景。
- 不写 World：唯一写入是调用方传入且已挂 `DebugTrace` 时的 `appendTrace`。`DebugTrace` 在 hash 口径里属于排除项。推进 fade 与非法偏好两例在写入 trace 后 `hashSnapshot` 不变；非法偏好一例的故事 `Flag` 仍是 `{ id: 'seen', active: true }`。服务没有 InputQueue、Signal 或剧情节点写入。
- 不持有 GalPackage、Profile、墙钟或 DOM：源码只保存包/章/节点字符串 ref、闭集 kind 和 `CommittedTransitionController`。没有 `GalPackage`、`Profile`、`Date`、`setTimeout`、`requestAnimationFrame`、`document` 或自由动画脚本。相位表是闭集 `cut|fade|wipe|dissolve`。

## 读告警

- Vitest 自身没有测试警告、未处理 rejection 或 stderr 失败提示。
- 两次完整命令和撤修命令都有一条 npm 警告：`Unknown env config "devdir"`。这是本机 npm 环境配置，不来自被测实现，不改变退出码，不影响判词。

## 非阻断观察

没有发现需要打回本共享合同的行为缺口。下面两项不升为 FAIL：

- 回滚、读档、回想、跨 host 和 dispose 用例没有各自再断言一次 `hashSnapshot`。这些路径没有传入会写故事态的 World；读码确认除 opt-in `DebugTrace` 外没有 World 写入，且已有两例实证 hash 不变。
- `note()` 的调用点在进入 trace 门之前拼了短字符串。内容只是闭集 kind 名，没有墙钟或副作用。关 trace 时 `appendTrace` 仍是 no-op。

## 明确不签

- 不签 GAL 设置页「转场演出」开关，不改也不启用任何设置控件。
- 不签 `ui-settings-confirmations` 里程碑，不把它标成 done，不代签 Owner 人门。
- 不签 GAL S5/S6、V2 原型重确认、Profile 持久化、具体包消费或 04B。
- 不把本局部 PASS 写成整库 tsc、build 或 scoped-gate 绿灯。本复查没有跑全库门禁。
