# GAL-ENG-04B 施工自验 / 独立复查导航

> 2026-10-10，施工者 Codex/root。此处是施工自证，不代替非施工者签判；未执行 Git/GitHub、数据库修改或应用服务启动。

## 需求判断与实现边界

- 接受：04A 已有有界 `NarrativeOutbox` 和具名 `narrative.ack`；03A 已有独立于 World/手动槽的 `GalProfile`、`SavePort`、`markRead` 与 `unlock`。04B 只组合这两端，不扩 Director、另建后端或在游戏层观察剧情。
- `GalNarrativeProfileBridge.drain` 校验活动剧情实体、包、时间和整段连续待确认事件；同 package 的进程内调用串行地加载最新 Profile、幂等折叠并落盘。`reach-node` 仅审计，不标已读；其余种类逐项映射到 03A API。坏事件、坏档或端口失败均不 ack。
- 写档成功后重查同一 World/实体组件身份与 pending 前缀；只有唯一 `InputQueue` 且当前无玩家动作时才排入单个 `narrative.ack`。桥不 tick、不直接改剧情组件；忙队列或异步期间读档/恢复时返回 `saved-pending-ack`，供宿主重试。保证是进程内同包串行、至少一次投递和档案集合幂等，并非跨进程 exactly-once。
- 改动边界：`src/services/gal-profile/narrative-profile-bridge.ts`、同伴测试及导出，`docs/playbooks/save-platform.md` 路标、本工单和本 Review 单。未修改 UI、游戏、资产、真实数据库或新持久化后端。

## 施工者自验与告警

- 桥单测 **12/12，退出 0**：已读/三类解锁/结局、失败重试、坏 checksum/错包/读写失败、ack 丢失/拒绝、玩家输入忙、并发不同前缀、异步恢复、双包同 ID、手动 12/13 槽、回滚改选、256 背压及同输入 World hash。独立复查先复现了同 ID 异内容包被误收的缺口；现以确定性静态内容对拍 fail-closed，并加入正式回归用例。
- 相关 GAL、Director、注册表与系统图合跑 **9 文件，84/85，退出 1**。失败的是非 GAL `capability-test-presence.test.ts`：`tier2/life-access.ts`、`tier3/life-world.ts`、`atoms/world-ui2d/` 缺同伴测试；其余 **8 文件 84/84**。`system-graph.test.ts` 自带测试 fixture 的 `[L,P]` 定序环警告，不能仅凭退出 0 忽略 stderr。
- 单独重跑上述相关 **8 文件 84/84，退出 0**；真实 `t3-narrative-director+t3-dialogue` 子集运行 `npx vite-node scripts/system-graph-audit.mjs t3-narrative-director t3-dialogue`：2 system、无环、**退出 0**。测试 fixture 的警告不是该真实子集的环。
- 同 ID 异内容修复后，相关 **8 文件 85/85，退出 0**。独立复查最终判词见文末。
- `npx tsc --noEmit --pretty false` **退出 1**，诊断只在 `games/game-dice/dice-window.test.ts`、`games/game-dice/dice-window.ts`、`games/game-simlife/art-consumption.test.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`，无 04B/GAL 新诊断。`node scripts/docs-ref-guard.mjs` **退出 0，DOCS-REF PASS**。
- 首次沙箱 Vitest 因 `node_modules/vitest/dist/spy.js` 的 `realpath EPERM` 而零用例；上述有效 Vitest 是短生命周期非沙箱重跑，未拉起应用服务。

## 非施工者复查清单

1. 独立复跑桥、Profile、手动槽、Director、注册表/系统图相关测试及全库类型检查，核对退出码与 stderr；对非 GAL 红灯明确 CONCERNS，不能写全库绿。
2. 在隔离副本做**先断言锚点命中 1，再撤修验红**：例如只在副本移除桥的 `await saveGalProfile` 前后顺序约束，预告“never acknowledges failed saves”测试转红；或移除 `prefixStillCurrent` 判断，预告异步恢复测试转红。不得在共享源码直接 sabotage；清理副本并核对路径。
3. 实证复现：坏事件不越过确认、保存失败不确认、玩家输入不覆盖、不同前缀并发不丢已读、恢复后旧 seq 不投新状态、ack 丢失/被拒后可重试、256 背压仅在写档后具名确认才解除。注意 `saved-pending-ack` 与 `ack-queued` 只是宿主侧状态，后者仍须下一 tick 由 Director 实际处理。
4. 核对桥的 World 写入仅限 `InputQueue`，Profile 不进入 WorldSnapshot/手动槽；检查双包隔离与进程内串行范围。若发现与写死合同不符，报可复现证据给施工者修复，勿越域改共享实现。

**交接门：** 非施工者已签 04B 局部 PASS；现有非 GAL 测试/类型红灯仍标 CONCERNS，不宣称整体门禁绿或已推送。

## 非施工者独立复查（Codex/review_gal_04b · 2026-10-10）

**局部判词：PASS；全库判词：CONCERNS。** 本复查未执行 Git/GitHub、数据库写入或应用服务启动；仅修改本独立复查段落。临时隔离探针已按解析后的精确绝对路径删除。

1. **独立复跑。** 修复后的 `npx vitest run` 点名 9 文件（桥、Profile、手动槽、Director、GAL 包及 review、SavePort、registry、system graph）为 **108/108，退出 0**；其中桥为 **12/12**。`npx vite-node scripts/system-graph-audit.mjs t3-narrative-director t3-dialogue` 为 2 system、无环、退出 0。`npx tsc --noEmit --pretty false` 退出 1，诊断限于 `games/game-dice/dice-window{,.test}.ts`、`games/game-simlife/art-consumption.test.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`，未指向 04B/GAL。沙箱首轮 Vitest 因 `node_modules/vitest/dist/spy.js` 的 `realpath EPERM` 零用例；上述有效复跑是短生命周期非沙箱单测。
2. **隔离撤修验红。** 仅复制桥与同伴测试为精确命名的临时 probe 文件，先断言共享源码和 probe 的目标锚点各命中 1。第一轮在 probe 将 `await saveGalProfile(...)` 改为不等待：预告“never acknowledges failed saves”应红，实测 1 failed/10 skipped、退出 1，错误为预期 `failed/save` 却收到 `ack-queued`，另有未处理 `offline` rejection。修复后第二轮在 probe 移除 `if (identity(source.package) !== identity(pkg)) return undefined`：预告“rejects a different publication with the same package ID”应红，实测 1 failed/11 skipped、退出 1，预期 `failed/validate` 却收到 `ack-queued`。两轮均未碰共享实现，探针已清理。
3. **实证对抗复现。** 初审构造同 ID、同目录但不同静态规则的两份包：活动 World 使用带 `start.enter: unlockCg` 的发布包，桥持有删去该 enter 的旧包；旧实现的 `sourceAt` 仅比 package ID，实测错误返回 `ack-queued`（对抗探针 1 failed/11 skipped、退出 1），会把旧包规则下不应存在的 CG 解锁写入 Profile。施工者随后在 `narrative-profile-bridge.ts` 的 `sourceAt` 增加 canonical 内容对拍及正式回归。复查新版正式回归 12/12 通过，并经上述隔离撤修证明该断言非摆设。其他故障路径由真实 Director/InputQueue + MemorySavePort 的点名测试覆盖：写失败不 ack、丢失/拒绝 ack 重试、忙输入不覆盖、异步恢复后旧前缀不 ack、并发前缀保留已读、256 背压待持久化及具名确认后解除。
4. **stderr 告警。** `system-graph.test.ts` 中 `[topological-sort] phase 0 [L,P]` 是测试 fixture 故意构造的组件推断环，不能把绿退出码当无告警；真实 `t3-narrative-director+t3-dialogue` 子集独立审计无环。Director 的 512 历史 stdout 为测试观测值，不是报错。全库类型红灯与 04B 局部 PASS 分开记录，**不声称全库门禁绿或已推送**。
