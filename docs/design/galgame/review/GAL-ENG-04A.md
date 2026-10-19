# GAL-ENG-04A 施工自验 / 独立复查导航

> 2026-10-10，施工者 Codex/root；非施工者 Codex/review_gal_04a 已按四步独立复查，局部能力 PASS、全库类型门 CONCERNS。未执行 Git/GitHub、数据库修改或应用服务启动。

## 需求判断与实现边界

- 接受 owner 的 A 裁决：`GalPackage` 已有静态 `UnlockRule` 与显式 `StoryEffect`，但 Director 先前拒绝 unlock 且无持久事件出口。只补通用 Director 解释与有界纯数据 `NarrativeOutbox`，04B 再接独立 `GalProfile`/SavePort；不做游戏观察器或 UI 打字机推断。
- `NarrativeOutbox` 是 World 组件，含包 ID、连续序号、已确认前缀与至多 256 条 pending；`readNarrativeEvents` 返回防御性副本，宿主完成未来 Profile 持久化后投 `narrative.ack` 具名 InputQueue 动作确认连续前缀，不直接写 World。事件 ID 由 `[packageId, kind, contentId]` 构成，待确认去重；确认后回滚重走允许同 ID 新序号，供 Profile 幂等处理。
- `reach-node`、`reach-ending` 与 catalog 的 `reach-*` 解锁仅随真实 `enter` 产生；`unlockCg/unlockMemory/unlockMusic` 随 enter/choice/check 显式效果产生。`narrative.read-complete` 必须用当前 `storyRefKey` 且节点此前已经可见；空 tick、读档恢复、历史回滚/向下重放不调用产出路径。
- Director 在根 World 的隔离副本预执行整拍，然后才在活动世界执行；无效 effect/目标引用、后续 jump/enter 失败或 outbox 满载时，活动世界仅留拒绝回执与 opt-in trace，Resource/Flag/RandomSeed/StoryRef/outbox 不半提交。旧 512 步历史测试及存档测试需模拟宿主确认，否则新的 256 背压是预期行为。
- 仅修改 Director、相应测试、`component-map`/生成注册表、事件与存档手册、本工单/Review 单。没有修改 `GalProfile`、SavePort、PUI、游戏、资产、数据库或服务。

## 施工者自验实数与告警

- 最终 `npx vitest run`：Director、手动存档、Profile、GAL 包校验、系统图、registry guard、组件 map、生成 registry、组件宇宙漂移共 **9 文件 87/87，退出 0**。系统图单测故意构造推断边成环，会输出其 fixture 的 `topological-sort` 警告；Director+Dialogue 实际子集审计无环。04A 未改 Profile 实现或持久化合同。
- `node scripts/component-manifest-guard.mjs`：205/205 PASS；`node scripts/build-component-map.mjs --check`：228 PASS；`npx vite-node scripts/gen-capability-registry.mjs --check`：139 同步；`npx vite-node scripts/system-graph-audit.mjs t3-narrative-director t3-dialogue`：2 system、无环 PASS。首次误写 `t2-dialogue`，守卫正确返回未知 ID/退出 1；按真实注册 ID 纠正后退出 0，没有忽略该告警。
- `npx tsc --noEmit --pretty false`：退出 1，诊断仍仅为非 GAL 的 `games/game-dice/dice-window.test.ts`、`games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`；04A 文件零诊断。全库门禁不绿，不称已推送或完整交付。
- 原沙箱中 Vite/Vitest 对 `node_modules` 报 `realpath EPERM` 且零用例；只对短生命周期测试/审计使用批准的非沙箱执行，没有启动应用服务。

## 非施工者复查清单

1. 独立复跑上述 9 文件、组件/registry 生成守卫、真实 Director+Dialogue 共装系统图及全库类型检查。读退出码与 stderr，不把测试 fixture 的环警告误判为实际同装环，也不把既有非 GAL tsc 红灯藏掉。
2. 在**隔离副本**做带锚点撤修验红：例如先断言 `enqueueMilestones` 中 `if (box.pending.length + fresh.length > NARRATIVE_OUTBOX_LIMIT)` 锚点恰命中 1，再只在副本移除该背压分支，预告 04A 满载原子性测试转红；或移除 `activeBeforeInput` 的 read 守卫，预告首显 read 测试转红。副本恢复/清理后证明共享源码无破坏态。禁止对共享工作树直接撤修。
3. 对抗复现：满载发生在 choice/check 后续 jump/enter 时，Resource/Flag/Seed/StoryRef/outbox 全不动；坏 pending ID/序号不能被 read/具名 ack 静默接受；read-complete 迟到与同拍双动作拒绝；ack 与玩家动作同拍遵守单动作裁决、输入回放可重得相同 hash；读档、回滚、旧未来重放不重发，改选后旧待投递解锁保留。检查 256 背压与 512 历史裁剪相互独立。
4. 核对 `NarrativeOutbox` 真在 World snapshot 与注册表、trace 关时 no-op、开时每系统每 tick ≤3；验证 04A 没有直接修改 `GalProfile`/SavePort/UI。若发现新表达缺口，留下 registry/手册源码证据并按 A/B 请 owner 裁决，不自作补丁扩域。

**交接门：** 非施工者已签 04A 局部 PASS；全库类型门仍 CONCERNS，不得宣称完整门禁绿或已推送。

## 非施工者独立复查（Codex/review_gal_04a，2026-10-10）

**局部判词：PASS；全库类型门：CONCERNS。** 复查人与施工者不同。本判词仅覆盖 04A 确定性里程碑能力，不把既有非 GAL 红灯说成全库绿，也不代表 Git 推送或 04B Profile 桥已经完成。

1. **独立复跑与告警：** 修复后的共享源码跑 `npx vitest run` 点名 Director、GAL 手动槽、GAL 包两文件、system-graph、registry-guard、component-map、生成 registry、组件台账测试，共 **9 文件 90/90，退出 0**；独立 `gal-profile.test.ts` **6/6，退出 0**。`system-graph.test.ts` stderr 的 `[L,P]` 推断环来自该测试故意构造的 fixture；真实 `t3-narrative-director+t3-dialogue` 子集审计 **2 system、无环、退出 0**。组件台账 **205/205**、组件宇宙 **228**、生成 registry **139** 均同步且退出 0。`npx tsc --noEmit --pretty false` 退出 **1**；诊断仅在 `games/game-dice/dice-window.test.ts`、`dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`，无 04A/GAL 文件诊断。首次沙箱 Vitest `node_modules` realpath EPERM 且零用例；上述有效测试为短生命周期非沙箱重跑，未启动应用服务。
2. **带锚点隔离撤修验红：** 在项目内独立 `.review-04a-probe` 副本中，原版 Director 单测 **30/30**；断言 `enqueueMilestones` 的 `if (box.pending.length + fresh.length > NARRATIVE_OUTBOX_LIMIT)` 锚点恰命中 **1** 处，仅在副本删去该背压分支。预告的“rejects invalid effect batches and full outbox without partial state or seed commits”定向测试退出 **1**，期望 `outbox-full`、实得 `bad-outbox`，证明测试能咬住容量守卫。副本绝对路径核验为工作区内 `.review-04a-probe`，无 `node_modules` junction；清理后 `Test-Path` 为 **False**。共享源码未撤修。
3. **对抗复现与协议修复：** 复查先发现旧版导出 `acknowledgeNarrativeEvents(world,...)` 在 tick 输入流外直接 `world.addComponent`，异步确认时序会脱离种子/输入回放，违反事件手册“写世界经具名 Signal”。施工者据此改为具名 `NARRATIVE_ACK='narrative.ack'`，`readInput` 从 `InputQueue` 读取，Director 的 `executeCore` 单动作处理，确认函数不再导出（`src/skills/tier3/narrative-director.ts` 当时第 16、78–92、453、514–516 行）。修复后的点名测试 `narrative-director.test.ts:274-292,345-359` 对拍连续前缀、重复/越界拒绝、与选择同拍拒绝、同输入 World hash；读完当前 ref、满载、坏 pending、回滚/读档/改选及静息亦在该文件的 04A 测试内通过。`NarrativeOutbox` 出现在 `component-map.ts`、`component-universe.gen.ts`、生成 registry，且随 World 快照恢复；trace 关闭时不进 hash、开启时点名每拍不超 3。未观察到 04A 直接修改 Profile/SavePort/UI 的实现入口。
4. **限制：** 04B 的真实异步 Profile 持久化、失败重试与宿主 InputQueue 录放尚未接线，不在 04A 局部 PASS 范围。全库 `tsc` 非 GAL 红灯仍需归属方处理；在此之前不可宣称完整门禁绿或正式交付。
