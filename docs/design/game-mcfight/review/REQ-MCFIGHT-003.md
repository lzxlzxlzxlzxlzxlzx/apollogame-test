# REQ-MCFIGHT-003 施工交接单

> 当前状态（2026-09-15）：closed，按原始合同与历史独立证据关闭。依据 [逐请求独立核对](request-contract-closeout-20260915.md)；以下旧施工/退回记录保留，不代表当前仍未施工。新批C1/C3—C6另行复查，S2未签核。
日期：2026-09-13。施工者：PE-game-mcfight。此文件供独立复查使用，不构成复查结论、S2签核或能力计划完成。

## 改动范围

- `src/engine/protocol/components/spatial.ts`、`src/skills/tier1/motion-apply.ts`：新增每拍开始位置快照。
- `src/skills/tier3/aggro.ts`、`src/skills/tier2/steering.ts`、`src/skills/tier2/entity-check.ts`：索敌、追击、群体分离及决策距离读取拍初位置；overlap继续读取移动后的真实位置。
- `src/skills/tier3/flow.ts`：窗口意图在边界提交，取消转移可在当前 Flow 转移写出关闭意图，避免多留一拍碰撞伤害。
- `games/game-mcfight/s2-dive.test.ts`：真实移动/接触/扣血、双实例错时、窗口硬控、升空前重选、前摇承诺、目标/来源死亡与范围多目标。

## 复跑命令

```powershell
npx vitest run games/game-mcfight/s2-dive.test.ts games/game-mcfight/s2-round2.test.ts src/skills/tier3/aggro.test.ts src/skills/tier3/flow.test.ts
npx tsc --noEmit
npx vite-node scripts/system-graph-audit.mjs t3-flow t3-aggro t2-steering t1-motion-apply d1-overlap-detect t2-trigger-zone t2-hitbox f1-resource t2-mortal k2-destroy
```

施工自证：回归为4文件42项通过；此前同一审计子集为 `SYSTEM-GRAPH: PASS`。复查者须在独立环境完整复跑并记录实际退出码。

## 复查重点与局限

- 检查拍初位置只供 aggro/steering/决策距离读取，overlap/hitbox仍读 motion 后位置；不可通过删减组件读写声明使审计通过。
- 检查窗口下降/回升与资格变化均在边界提交；硬控取消不得依赖 `onEnter` 造成额外伤害拍。
- 检查目标升空前替换、前摇后实体锁定、目标及来源死亡的案例均由生产系统产生效果，不由测试写阶段、接触或伤害。
- 范围测试证明同一伤害区可对两个合格目标各结算一次；不要将 `consumeOnHit` 误读成首目标后立刻停止遍历。
- `game-mcfight` 仍无可玩运行入口，故本交接没有运行画面。画面证据需等可运行入口存在后另行补充。
- 本请求仍为 `in-progress`，直到独立复查完成；B 与 S2均未签核。

## 2026-09-14：同拍致死修复交接

独立复查冻结副本发现：`targeted-caster` 原处于 phase 0，而 `resource-apply`、`mortal`、`destroy-apply` 在 Resolve；拍前或本拍 Hitbox 的致死结算会在定向释放之后发生，导致已经死亡的来源仍生成攻击区并真实额外扣 7 HP。

施工修复将 `targeted-caster` 移至 Resolve，并保持其在 `resource-apply`、`mortal`、`destroy-apply` 之后执行。新生产顺序为 `Flow → Hitbox → targeted-caster`；非定向 `caster` 保持原有行为。同步了 `motion-apply` 的能力元数据测试，使拍初位置快照作为第二个系统被明确申报。

冻结目录原始探针已带来源同步为固定回归：

```powershell
npx vitest run games/game-mcfight/review-probes.test.ts src/skills/tier3/review-death.test.ts
npx vitest run src/skills/tier3/targeted-caster.test.ts src/skills/tier1/motion-apply.test.ts
```

施工复跑结果：前一命令 2 文件 7 项通过；后一命令 2 文件 22 项通过。`review-death` 覆盖拍前致死请求及不应产生的输出碰撞伤害；真实来袭 Hitbox 致死/非致死对照位于独立复查新增的 physical-pair 探针；`review-probes` 覆盖生产 Flow 关窗拒绝启动、启动距离、生产硬控取消与实际系统顺序。

独立复查者须在新的隔离副本复跑上述命令、四文件 MC Fight 回归、类型检查和 13 能力审计；并只撤去 `targeted-caster` 的 Resolve 后置（锚点命中数必须为 1），确认严格死亡探针转红后恢复原字节。此为本次修复的针对性撤修验红，未通过前不得更新 B 或 S2 结论。


## 2026-09-14：R1/R2/R3 程序修复（待独立复核）

本轮实际修复了源码并保留原生命周期与命中断言：
- R1：新增一次性 CommittedContact，只对定向展开的 Hitbox 在第一次 overlap 前按承诺目标当前 Transform 加模板偏移定位；随后移除引用。目标缺失则销毁该区域，不回退旧坐标。不降低目标速度，不扩大范围，不永久追踪。
- R2：targeted-prefab-spawn 在 Resolve 的死亡判定、targeted-caster 之后展开定向请求，Active 当拍生成实体，恢复原三轮 marker 时点。普通 prefab 仍在 Update。两个消费者只手动移除自身已处理的 SpawnRequest，避免 consumes 的全局清理误删另一消费者请求。
- R3：B 近战 Caster 配置 sourceCheck.rejectStatusMask=HARD_CONTROL，释放拍真实 Hitbox 施加硬控后，晚释放检查拒绝本次请求。已有死亡后置保留。

固定探针 games/game-mcfight/rereview-boundaries.test.ts 来自 mcfight-rereview-20260913-resolve/snapshot；只同步近战 fixture 的 sourceCheck，原严格 HP 断言保留。新增文件是施工回归，不冒充新的独立复查记录。

实际逐拍：移动目标 x=17/30/43/56/69/82，tick3 Active 同拍生成区域 x43，tick4 overlap 前对齐 x56，真实扣血30→23并清区；tick5/6无追加伤害。释放拍硬控在tick3为32，该拍及后续无请求/区域，目标HP30且CD1。无硬控对照tick3生成、tick4扣7血。注意：Active拍实体生成已恢复，但真实伤害在下一次碰撞阶段（tick4），未把这称为tick3同拍伤害。

本轮验证实际退出码：
- 14文件136项通过，exit=0：node node_modules/vitest/vitest.mjs run games/game-mcfight src/skills/tier3/targeted-caster.test.ts src/skills/tier3/review-death.test.ts src/skills/tier3/caster.test.ts src/skills/tier3/prefab.test.ts src/skills/tier3/flow.test.ts src/skills/tier3/aggro.test.ts src/skills/tier2/steering.test.ts src/skills/tier1/motion-apply.test.ts src/skills/tier2/hitbox.test.ts --silent
- 三项独立来源轨迹另行非静默运行通过，exit=0，无调度告警。
- node node_modules/typescript/bin/tsc --noEmit：完成，exit=0。
- 13能力组合审计：18系统，PASS，exit=0（新增两个生产系统）。

扩大回归发现早期 s2-capability 夹具只装 aggro、未装拍初快照生产；现增加 motionApplyCapability 装配，原6项断言保持不变并通过。

范围限制：本次没有完成边界画面、全库回归或独立撤修验红；B/S2仍不签核。原review-death三例均以拍前资源请求致死，非致死来袭碰撞对照属于复查目录 physical-pair，不能混称为同三例覆盖。后续复查应关注首次接触对齐、晚展开和释放期sourceCheck三处撤修，及普通SpawnRequest未被误消费。
