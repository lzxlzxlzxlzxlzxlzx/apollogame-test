# MC Fight S2 程序证据：首批能力探针

> 当前收尾（2026-09-15）：[程序收尾结论](s2-program-closeout-20260915.md)。225项回归、类型/构建全绿；C1/C3—C6及播放器接口独立复查通过，六组撤修验红；REQ-001～003已按原合同closed。真实14段动作素材仍未验收，S2人审不代签。以下旧待办/失败状态保留为历史。
> 2026-09-15 收尾更新：原mortal死亡当拍掉落合同已恢复，225项相关回归通过、类型/构建通过；REQ-001～003按独立历史合同核对已closed。旧195通过/1失败记录为修复前历史。详见 [死亡掉落合同](s2-mortal-closeout.md)、[可选排序核对](s2-optional-order-audit.md)、[性能风险](s2-performance-risk.md)。本批独立复查结论另行落账；真实14段动作素材未验收。
日期：2026-09-10。施工角色：PE-game-mcfight。性质：程序自证，非独立复查、非 S2 验收通过。

## 结论

接受先验证再实现的任务范围。现有组合可以完成局部独立触发和窗口伤害过滤；尚未证明完整技能生命周期。没有改引擎、正式规则、生产看板或注册代码。

测试文件：`games/game-mcfight/s2-capability.test.ts`。所有参数和组件初值均在该临时测试 fixture 内，不进入正式内容。World.tick 执行真实系统；没有自写战斗 system。

## 可复跑结果

在 ApolloGame 根目录执行：

```powershell
npx vitest run games/game-mcfight/s2-capability.test.ts src/skills/tier3/aggro.test.ts src/skills/atoms/state/state.test.ts src/skills/tier2/self-rule.test.ts src/skills/tier2/behavior-tree.test.ts src/skills/tier3/flow.test.ts src/skills/tier3/caster.test.ts
npx tsc --noEmit
```

Vitest：退出码 0，7 文件、74 测试通过，其中本次新增 6 项；该次测试总时长 3.55 秒。类型检查：最终测试增补后复跑，退出码 0。没有运行 build、全库测试或阶段 gate。测试全绿包含“确认存在不满足需求的行为”的反例，不等于玩法全绿。

| 场景 | 实际调用链及观测 | 判定与局限 |
|---|---|---|
| V01 同名信号 | Signal(source=a) → caster → a、b 都产生 SpawnRequest | 反例成立：source 不是 Caster 路由条件 |
| V01 同模板局部名字 | instantiate → @local:body 改写为实例名 → Signal → caster | 可重组：只触发指定实例，另一实例不生成；模板数据未被污染。输入仍为测试注入，未证明 AI 自动触发 |
| V01 错时触发 | timer-advance → aggro → self-rule → SpawnRequest | 同名 Timer/State/SelfRule 下，第2拍 A fired、B waiting；第3拍 B fired；请求来源 a/b，目标坐标分别1/99。只证明单次等待，不证明重复冷却、完整阶段与普攻竞争 |
| V03 重选目标 | aggro → Relation | 第一拍 first，移远后下一拍 second；追击 Relation 不能直接充当施法锁定记录 |
| V04 伤害过滤 | 注入 Trigger → hitbox(targetMask+requireMask) → resource-apply | 第1拍 HP=[90,100,100]；交换两只飞行单位的 Status 后第2拍=[90,90,100]；友方不受伤。窗口状态和接触事实由测试注入，未模拟俯冲/碰撞/中断 |
| V04 缓存反例 | nearestByTag → 改 Tag → 再次 nearestByTag → tick边界 → 查询 | 同一版本仍命中已去标签目标，跨 tick 后消失。需要区分窗口更新与查询顺序，不能仅靠索敌时合法性保证命中合法性 |

V04 日志由测试实际输出。没有运行中的游戏画面，因而没有截图或录像；这些探针不能替代任务要求的动态证据。

## 注册名和字段对照

已实查 `src/assembly/capability-registry.ts`、atoms/tier2/tier3 导出与对应源码，以及 combat、opponent-ai、events-logic、movement-pathfinding 手册。

| 注册能力 | 本轮字段/接口 | 边界 |
|---|---|---|
| e1-timer | Timer.id/elapsed/duration/loop | 每实体一个计时器；本轮是非循环等待 |
| j1-state | State.fsmId/current/previous | 储存状态；本轮切换由 self-rule 执行，不代表状态机生命周期 |
| t2-self-rule | when(timer)、once、do(set-state/spawn)、at:target | 自身读写隔离；同拍多个 spawn 覆盖；未证明多技能竞争 |
| t3-aggro | Perception.targetTag/sightRadius → Relation.targetId | 每拍最近目标；标签多位 OR |
| t3-caster | onSignal/template/at、Signal.name | 信号名匹配，不检查 source；可用实例化名字隔离 |
| t3-prefab | instantiate、@local:localId | 递归重映射可用来生成实例唯一信号名；不能因此推断锁定目标复制已经实现 |
| t2-hitbox | resource/amount/targetMask/requireMask | 阵营 Tag 与 Status 双重检查；本轮不是实际碰撞链 |
| f1-resource | Resource.id/current/min/max、resource-apply | 真实扣血结算 |
| t3-flow | states/onEnter/transitions/after | 全局 lookup 寻址；新的 onEnter 下一拍生效；尚未组装多阶段技能实验 |

## 需要继续验证的边界与候选路线

查阅原文：`self-rule.ts`：“一实体一 type，天然单份”；`caster.ts`：“本 tick 在场的信号名”；`spatial-query/index.ts`：“一 tick 内恒定”；`prefab.ts`：“深 walk 组件数据（含数组/嵌套）”。这些证据不支持直接宣称现有能力完全无法组合。

优先继续用 prefab 局部引用连接 Flow/Effect(reset-timer)/技能子实体，验证重复施法、锁定目标传递与死亡清理。不能因 Caster 广播反例就立即新增能力：实例名字隔离已有正证据。

如果后续证明无法重组，候选方案如下，均未获裁决、未施工：

| 路线 | 范围、代价与风险 |
|---|---|
| A 公共能力扩展（推荐候选） | 引擎提供按单位/技能的阶段、锁定记录、重复冷却、打断清理与合法性复核。由主程评估定序和快照影响；接口和回归成本较高，但可复用。选错会造成不必要的引擎扩张 |
| B 受控例外 | 仅在明确授权的窄接口内实现确定性技能执行，继续复用命中/资源/运动。初期范围可能较小，但增加专属代码、回放审计和日后迁移负担；不得扩大为每怪物状态机或另一套战斗引擎 |

尚无充分证据把候选路线登记为“已确认缺口”，没有擅自更新 capability-gaps.json。

## 覆盖与交接

- V01/V04 仅部分证明；仍缺自动阶段、重复冷却、真实俯冲接触、窗口开闭及清理。
- V02/V05/V06/V07/V08 尚未完成；V04 的友方过滤不等于 V07 多段技能验收；本轮测试时长不等于性能基准。
- D04/D06 未定，后续可继续使用明确标注的实验契约；不把实验值变成产品决定。
- 策划可据此整理能力计划，但不得把本报告当作完整 S2 证据或独立复查记录。
- 看板 S1 人门待落账、S2 无能力计划，均未更改。项目根 `git rev-parse --show-toplevel` 提示非 Git 仓库，所在命令批次退出码1；没有 checkout/reset/stash/commit/push。

本轮产物是首批可复跑技术探针。项目仍处于 S2 验证中，未实现正式战斗代码。

---

## 第二批：三轮时序成立，目标绑定与死亡取消失败

实验执行日期：2026-09-10；整理交付：2026-09-11。以下更新保留上文首批历史口径，以本节为当前状态。实验契约来源 `s2-round2-task.md`，不改正式规则。

### 工件与执行方式

- `games/game-mcfight/s2-round2.fixture.ts`：同一 UNIT 数据模板展开两实例；没有新增 system。
- `games/game-mcfight/s2-round2.test.ts`：初始布置、外部伤害输入、推进、逐拍观测和断言。
- `s2-round2-tests.log`：实际运行输出，含正常48条观测和两个反例轨迹。
- `s2-round2-strict.log`：按任务死亡取消契约运行的真实红灯证据。
- `requests.md`：REQ-MCFIGHT-001 原文依据与 A/B 扩展方案；`capability-gaps.json` 已记 open，未裁决、未施工。

正常组合调用链：e1-timer → t3-flow（转移动作写镜像 State、施放序号 Resource）→ t2-event-when → t3-caster → t3-prefab；t2-effect-apply 在 Commit 重置各自 Timer。aggro 产生追击目标。观察效果是由 prefab 真实生成的 marker，仅证明生成次数/位置/来源，不是伤害或碰撞完成证据。

### 逐拍契约与实际对账

观测统一在 World.tick 返回后。tick0 初始 A 冷却0、B冷却3；timer 在第一拍先推进，因此 A在tick1启动、B在tick3启动。这个初始调度约定不同于“从A开始后再等3拍才启动B”，没有把两者混为一谈。

Flow 新状态 onEnter 下一拍执行：Windup/Recovery 的 `after:1` 各产生两个可观察拍，Active 的 `after:0` 产生一个拍；用转移的 do 同拍更新镜像阶段，不用迟一拍的 onEnter 发效果。镜像 State 是生产 Flow 写入，不是测试修改。Cooldown独立于阶段：Ready可以仍在冷却；仅从Ready且计时到期才能再次开始。本轮只有一技能，因此尚未证明多技能共享动作锁。

| 相对启动拍 | 阶段预期 | 剩余冷却预期 | 本周期新增marker预期 | 实际 |
|---|---|---:|---:|---|
| s | Windup | 8 | 0 | 一致 |
| s+1 | Windup | 7 | 0 | 一致 |
| s+2 | Active | 6 | 1 | 一致 |
| s+3 | Recovery | 5 | 0 | 一致 |
| s+4 | Recovery | 4 | 0 | 一致 |
| s+5 | Ready | 3 | 0 | 一致 |
| s+6 | Ready | 2 | 0 | 一致 |
| s+7 | Ready | 1 | 0 | 一致 |
| s+8 | 下一轮Windup | 重置8 | 0 | 一致 |

| 实例 | 三次启动 | 三次Active | 三次返回Ready | marker总数 |
|---|---|---|---|---:|
| A | 1、9、17 | 3、11、19 | 6、14、22 | 3 |
| B | 3、11、19 | 5、13、21 | 8、16、24 | 3 |

每一拍分别断言阶段、冷却、施放序号、效果累计次数，不仅检查终值。共享模板序列化结果保持不变。日志含tick、unit、skill、castOrdinal、phase、cooldown、pursuit、lockedTarget、effects、effectX。lockedTarget读取技能实体上的Relation，当前为null，绝不把追击目标冒称锁定记录。

### 两个最小反例

1. **前摇期间目标移动**：原目标初始x=1，另一目标x=5；motion-apply每拍驱动原目标移动10。tick1 Windup追击a-original；tick2仍Windup但追击变为a-alternative；tick3 Active在x=5生成marker。测试没有手动改Relation或技能阶段。证明当前组合缺本次施法目标锁定。
2. **前摇目标死亡**：tick1 Windup确定a-original；拍间只注入它的ResourceModify(-100, local)。tick2 resource-apply/mortal/destroy真实移除目标；tick3技能没有取消，反而在替代目标x=5生成marker，冷却仍为6。严格验收要求0次，实际1次。

这两项是同一个目标接缝问题的不同证据。单纯增加独立技能实体或@local名字，只解决储存位置/静态引用，未提供从施法者动态目标到该储存位置的写入。不能用预填敌人ID、冻结追击、坐标快照或测试每拍复制目标来冒充解决。

### 命令与结果

在项目根执行：

```powershell
npx vitest run games/game-mcfight/s2-capability.test.ts games/game-mcfight/s2-round2.test.ts
npx tsc --noEmit
```

最终源码：2文件、9项观测/反例测试通过，退出码0；类型检查退出码0。9绿包含2项第二批反例成立，**不是第二批A通过**。没有引擎改动，未跑build、全库门禁或S2 gate。

严格验收复现（预期退出码1；不是基础设施故障）：

```powershell
$env:MCFIGHT_STRICT='1'
npx vitest run games/game-mcfight/s2-round2.test.ts -t 'Windup target dies'
$taskExit = $LASTEXITCODE
Remove-Item Env:MCFIGHT_STRICT
Write-Output "strict exit code: $taskExit"
```

实际：1项失败、2项未选中；`Target death must cancel without replacement: expected 1 to be +0`。日志保留原始断言与行号，没有把它包装成完成。

### 覆盖判定与下一责任人

| 要求 | 判定 |
|---|---|
| 独立阶段、冷却、三轮时序、不重复重启前摇 | 已证明（单技能时序范围） |
| 每次Active只生成一次效果 | 部分证明：一次marker；未验证真实伤害、取消后临时实体回收 |
| 启动锁定目标，追击重选不覆盖 | 反例，当前组合失败 |
| 前摇目标死亡取消且不换目标补打 | 反例，严格断言红 |
| 显式打断、自身死亡清理、重开隔离、多技能动作锁 | 未证明；未据此制造额外缺口 |
| B真实位移→接触→窗口→伤害及动态画面 | 未开始：按任务A先通过再做B。目标移动反例不是俯冲证明 |

当前停点是任务允许的缺口裁决点，非完整技能完成。推荐最小公共“目标捕获与失效取消”扩展，循环计时继续复用已有组合；不推荐直接新建完整技能引擎。owner选择A/B后，主程细化公共接口/定序/施工归属；PE继续原第二批A，待A成立再做B。完整方案在 `requests.md`，不在此重复。

已运行board（退出码0）：S1人门待签，S2无能力计划，REQ-MCFIGHT-001以open显示于S2/S3/S4缺口锁。没有人门或独立复查落账，没有改GDD/decisions或正式游戏内容。

## 2026-09-12：路线 A 施工自证（未独立复查）

路线 A 已按用户裁定施工。新增的最小公共接口为：

- `GameFlow.targetSnapshot` 和转移字段 `captureTarget` / `whenEntities` / `clearTarget`：在启动转移原子捕获 `Relation.target`，并在失败或取消时清除；不会回写追击 Relation。
- `EntityCheck`：可检查实体存在、生命资源、标签、状态位和启动时距离。
- `Caster.targetFlow`：仅消费已捕获目标；目标、施法者死亡/待销毁或不符合执行期检查时拒绝生成，绝不回退最近目标。

施工自证：`games/game-mcfight/s2-round2.test.ts` 现有 5 个场景，覆盖双单位错时三轮、前摇期追击改选但施法锁定不变、目标死亡取消、硬控取消、自身死亡级联清理。与 `src/skills/tier3/targeted-caster.test.ts`、`flow.test.ts`、`caster.test.ts` 同跑为 39 项通过；`npx tsc --noEmit` 通过；`npm run build` 通过；能力子集调度审计为 `SYSTEM-GRAPH: PASS`。

这只证明 A 的目标锁定与当前单技能生命周期样例。多技能动作占用、重复取消与世界重开隔离尚未成为本轮 MC Fight 场景证据；未独立复跑，不代替 S2 复查或阶段签核。B（真实俯冲）也尚未开始：现有能力可由 Hitbox 读取窗口 Status，但没有由技能阶段以数据方式写入并清除施法者窗口 Status 的接口，不能用测试逐拍改状态伪造该链路。该新增缺口须单列裁决后才能继续 B。

## 2026-09-12：REQ-MCFIGHT-002 施工自证与生命周期补测

已实现 Flow 的 `set-status` 动作：配置 `targetEntity`、位掩码 `targetId` 与布尔 `value`，在 onEnter 或 transition 边沿对该实体的 `Status.flags` 置位/清位；不覆盖其他位，缺容器时创建零值容器。静态引用校验已覆盖目标实体。

本次实际命令：`npx vitest run games/game-mcfight/s2-round2.test.ts src/skills/tier3/flow.test.ts`，退出码 0，2 文件、21 项通过；`npx tsc --noEmit` 退出码 0。

新增已证明：两个 Flow 共享同一个 State 动作锁时，同拍只能一个技能进入 Windup；重复硬控取消后没有延迟 marker 或残留 targetSnapshot，已启动冷却不退款；新 World 不保留旧世界的目标、计时、状态或施法效果。原双单位错时三轮、目标锁定、死亡和硬控取消回归仍通过。

B 未进入“真实俯冲通过”状态。检查发现 `t3-aggro` 不按 Status/EntityCheck 筛选候选：目标关闭地面窗口后，启动检查可以拒绝且不扣 CD，但无法改选合法目标。此为 REQ-MCFIGHT-003，已按 A/B 协议登记为 open，未施工；禁止以测试逐拍修改 Tag、Relation、窗口或阶段绕过。尚无实际运行画面、真实碰撞扣血轨迹、动作素材适配或独立复查。

## 2026-09-12：REQ-MCFIGHT-003 A路线施工与组合调度失败

用户已选择 A，REQ-MCFIGHT-003 状态改为 `in-progress`。初版 `Perception.targetCheck` 独立测试通过，但与 Flow 直接写 Status 的窗口能力共装时，系统图报告 `SYSTEM-GRAPH: FAIL`：`aggro → flow → motion-apply → resource-apply` 围绕 Resource、Status、Transform 成环。尝试令 Flow 先于 aggro 会推迟既有首拍捕获，导致生命周期7项中5项失败，已撤回。

最新逐拍提交方案见 `s2-window-commit-timing.md`：Flow 在 Update 只记窗口意图，Commit 提交 Status；窗口从下一拍对索敌和范围伤害生效，已进入单体前摇的目标快照保持其承诺例外。该方案尚未实现或复跑；21项历史通过与REQ-003独立通过都不构成当前共装版本通过证据。

## 2026-09-12：时序方案修正

策划核对指出原方案把“下一拍生效”写成了下降与受击资格可能错开，且 Flow/aggro 顺序自相矛盾。现已修正：窗口意图在 N-1 末提交，到 N 的 tick 开始边界原子成为 Status；下降/回升动作和地面资格在同一可观察边界生效。单拍顺序固定为边界提交 → aggro → Flow 启动检查 → 移动 → 接触/伤害 → Commit。尚未实现或复跑。

## 2026-09-12：REQ-MCFIGHT-003 调度环修复自证

环的逐边结论：`resource-apply → aggro`（Resource：动态资格检查可读生命）、`aggro → flow`（Relation：本拍索敌供启动捕获）、`flow → resource-apply`（Resource：Flow 写冷却/施放序号）。`motion-apply → aggro/flow`（Transform）是前向位置依赖，非闭环的必要回边。修复为 aggro 显式 `runsBefore: ['motion-apply','resource-apply']`：本拍索敌只读 tick 开始时的生命/资格，伤害在后段结算并从下一拍影响索敌。没有删除真实读写声明。

实际命令：`npx vite-node scripts/system-graph-audit.mjs t3-flow t3-aggro t1-motion-apply f1-resource`，退出码0，`SYSTEM-GRAPH: PASS`；`npx vitest run src/skills/tier3/aggro.test.ts src/skills/tier3/flow.test.ts games/game-mcfight/s2-round2.test.ts`，退出码0，3文件34项通过；`npx tsc --noEmit`退出码0。该回归保留首拍启动和双单位三轮轨迹。尚未安装 overlap/trigger/hitbox 的真实俯冲组合，未完成B或独立复查。

## 2026-09-12：真实接触探针与完整碰撞环

`s2-dive.test.ts` 安装 Flow窗口提交、aggro、steering、motion、overlap、trigger、hitbox、resource、destroy。真实轨迹：tick1-2飞行停滞HP30；tick3开地面窗口并移动至x2；tick4与区域真实重叠，经 Trigger/Hitbox扣至HP25；tick5仍在窗口但区域已按 `consumeOnHit` 销毁，HP保持25；tick6回升、窗口关闭、HP保持25。连续扣血的初版参数是持续接触语义，不是普通近战；现已改为单次接触探针，且安装 destroy 消费者。

完整碰撞环的回边：motion-apply写Transform→aggro读Transform；aggro写Relation→steering读Relation；steering写Velocity→motion-apply读Velocity；motion-apply写Transform→overlap-detect读Transform；overlap-detect写Overlap→trigger-zone读Overlap；trigger-zone写Trigger→hitbox读Trigger；hitbox写Status→aggro的targetCheck/steering的haltStatusMask读Status。这是实时伤害状态影响同拍决策造成的回边，并非测试注入。正确统一时序应让 hitbox 的状态/伤害只在后段提交并从下一拍影响 aggro/steering，同时保留本拍位置→接触→伤害；尚未实施该全链修复，故探针不是B通过。

## 2026-09-12：战斗链合同修正

策划核对指出 `motion Transform → aggro` 同样是回边。已修正：aggro/steering只读拍初位置，motion产移动后位置，overlap/trigger/hitbox读移动后位置。该分离尚未实现；完整组合审计仍未通过。`consumeOnHit`仅是单区域首命中探针，不能代替一次攻击多目标、每目标一次的范围伤害验收。

## 2026-09-13：B 场景续测（程序自证，未独立复查）

拍初位置快照已接入 aggro、steering（含群体分离）和 `EntityCheck` 的距离判断；碰撞继续读取 motion 后的 `Transform`。完整共装子集（Flow、aggro、steering、motion、overlap、trigger、hitbox、resource、mortal、destroy）调度审计为 `SYSTEM-GRAPH: PASS`，没有通过删除读写声明或忽略告警破环。

`games/game-mcfight/s2-dive.test.ts` 新增并通过三项真实系统链路场景：

- 单飞行单位从窗口边界进入地面资格、实际移动到区域，经 overlap → trigger → hitbox 将 HP 从30扣到25；回升边界关闭窗口后 HP 保持25。该区使用 `consumeOnHit`，仅证明单区域单目标一次结算。
- 两只同模板飞行单位错时进入窗口，alpha 在 tick3 结算、bravo 在 tick5 结算，各自 HP 30→25；alpha 回升时 bravo 仍处于窗口，证明状态窗口与接触结算未串用。
- 已开窗口后注入硬控外部事实。取消转移在同拍写关闭意图，下一拍边界提交先于 overlap/hitbox；持续存在的区域不能再扣血，窗口和意图都被清理。此前把关闭放在 `Aborted.onEnter` 会多留一拍伤害机会，已改为转移动作，保留该失败作为实现定位而非验收证据。

本次实际命令及结果：

```powershell
npx vitest run games/game-mcfight/s2-dive.test.ts games/game-mcfight/s2-round2.test.ts src/skills/tier3/aggro.test.ts
npx tsc --noEmit
npx vite-node scripts/system-graph-audit.mjs t3-flow t3-aggro t2-steering t1-motion-apply d1-overlap-detect t2-trigger-zone t2-hitbox f1-resource t2-mortal k2-destroy
```

测试为3文件23项通过，类型检查退出码0；审计为PASS。生命周期回归仍为历史有效证据，但不能代替下列未完成的 B 边界。

仍未证明：目标在尚未开始地面近战前摇时升空后重新索敌且不扣 CD；已经开始单体近战前摇后目标升空或退远仍对该目标完成一次真实伤害；飞行目标/攻击者死亡的真实俯冲清理；一次范围攻击对多个目标各一次的结算；运行画面与独立复查。因此 REQ-MCFIGHT-003 仍为 `in-progress`，B 和 S2 均未通过。

### 续测：前摇承诺与目标死亡

同一 `s2-dive.test.ts` 现加入地面近战的最小数据组合：`aggro(targetCheck: !FLIGHT)` → Flow 在 Ready→Windup 原子捕获目标并计一次 CD → EventWhen → `targeted-caster` → Prefab 伤害区 → overlap/trigger/hitbox。测试只注入拍间的升空/位移或死亡世界事实，不改 Relation、Flow、窗口、Trigger 或伤害结果。

- 目标在前摇尚未开始前升空：上一拍 Relation 仍指向旧目标，但本拍 aggro 先过滤其 `FLIGHT` 状态、改选合法替代目标，Flow 只捕获替代目标且 CD 从0变1。旧目标没有启动或消耗一次 CD。
- 前摇已启动后，目标升空并从 x=4 退至 x=30，捕获实体不变；Caster 仍在该实体的实际位置生成区域，经真实接触将 HP 30→23。这证明当前实验参数下的单体前摇距离和资格承诺，不把它外推为范围攻击规则。
- 目标在前摇期间生命归零时，resource→mortal→destroy 真实移除该实体；`targeted-caster` 拒绝过期快照，未生成后置伤害区。

这些项使“升空前重选”“已前摇后升空/退远仍命中”和“前摇目标死亡不残留攻击”从生命周期 marker 证据扩展为真实碰撞扣血链证据。尚未覆盖攻击者死亡、范围多目标、运行画面及独立复查；B 与 S2 仍未通过。

### 续测：来源死亡与范围逐目标结算

- 地面近战来源在 Windup 中收到真实 `DestroyRequest`，后续 `targeted-caster` 检查到来源已待销毁并拒绝 SpawnRequest；来源被 destroy-apply 移除，飞行目标 HP 仍为30，未留 PrefabOrigin 伤害区。
- 一次已锁定的范围区域在 x=30 同时重叠两名 `FLYER`。同一个区域经两条 Trigger 记录对每名目标各结算一次，两个 HP 都从30降至23，随后区域按 `consumeOnHit` 销毁。该结果没有把“区域首命中即销毁”错误地当成只允许一个目标命中。

本次组合回归命令为 `npx vitest run games/game-mcfight/s2-dive.test.ts games/game-mcfight/s2-round2.test.ts src/skills/tier3/aggro.test.ts src/skills/tier3/flow.test.ts`，4文件42项通过。攻击者死亡和范围多目标已有程序自证；仍欠实际运行画面及独立复查，故 B/S2 不标通过。


## 2026-09-14：R1/R2/R3 程序修复（待独立复核）

本轮实际修复了源码并保留原生命周期与命中断言：
- R1：新增一次性 CommittedContact，只对定向展开的 Hitbox 在第一次 overlap 前按承诺目标当前 Transform 加模板偏移定位；随后移除引用。目标缺失则销毁该区域，不回退旧坐标。不降低目标速度，不扩大范围，不永久追踪。
- R2：targeted-prefab-spawn 在 Resolve 的死亡判定、targeted-caster 之后展开定向请求，Active 当拍生成实体，恢复原三轮 marker 时点。普通 prefab 仍在 Update。两个消费者只手动移除自身已处理的 SpawnRequest，避免 consumes 的全局清理误删另一消费者请求。
- R3：B 近战 Caster 配置 sourceCheck.rejectStatusMask=HARD_CONTROL，释放拍真实 Hitbox 施加硬控后，晚释放检查拒绝本次请求。已有死亡后置保留。

固定探针 games/game-mcfight/rereview-boundaries.test.ts 来自 mcfight-rereview-20260913-resolve/snapshot；只同步近战 fixture 的 sourceCheck，原严格 HP 断言保留。新增文件是施工回归，不冒充新的独立复查记录。

实际逐拍：移动目标 x=17/30/43/56/69/82，tick3 Active 同拍生成区域 x43，tick4 overlap 前对齐 x56，真实扣血30→23并清区；tick5/6无追加伤害。释放拍硬控在tick3为32，该拍及后续无请求/区域，目标HP30且CD1。无硬控对照tick3生成、tick4扣7血。注意：Active拍实体生成已恢复，但真实伤害在下一次碰撞阶段（tick4），未把这称为tick3同拍伤害。

本轮验证实际退出码：
- 14文件137项通过，exit=0：node node_modules/vitest/vitest.mjs run games/game-mcfight src/skills/tier3/targeted-caster.test.ts src/skills/tier3/review-death.test.ts src/skills/tier3/caster.test.ts src/skills/tier3/prefab.test.ts src/skills/tier3/flow.test.ts src/skills/tier3/aggro.test.ts src/skills/tier2/steering.test.ts src/skills/tier1/motion-apply.test.ts src/skills/tier2/hitbox.test.ts --silent
- 三项独立来源轨迹另行非静默运行通过，exit=0，无调度告警。
- node node_modules/typescript/bin/tsc --noEmit：完成，exit=0。
- 13能力组合审计：18系统，PASS，exit=0（新增两个生产系统）。

扩大回归发现早期 s2-capability 夹具只装 aggro、未装拍初快照生产；现增加 motionApplyCapability 装配，原7项断言保持不变并通过。

范围限制：本次没有完成边界画面、全库回归或独立撤修验红；B/S2仍不签核。原review-death三例均以拍前资源请求致死，非致死来袭碰撞对照属于复查目录 physical-pair，不能混称为同三例覆盖。后续复查应关注首次接触对齐、晚展开和释放期sourceCheck三处撤修，及普通SpawnRequest未被误消费。


## 2026-09-14 独立复核状态与当前时序
R1/R2/R3已修复并由原复查者隔离复核通过，依据 `mcfight-review-20260914-contact/independent-contact-review.md`。Tick3生成攻击区域，Tick4接触扣血并清理；历史失败不删除。B/S2不自动通过。新边界入口与具体证据缺项见 `s2-b-acceptance-evidence.md`。

## 2026-09-14 V02 双技能选择交付

新增 s2-multiskill.fixture.ts 与 s2-multiskill.test.ts，数据模板装配近战与较长 CD 远程，第二单位复用近战改变伤害、距离和攻击圆半径。可视化使用同一个工厂，新增 V02 选项。未新增公共系统或单位专属执行代码。

- 新增 7 项通过，逐拍记录：evidence/v02-multiskill-20260914.log；80 拍中每个技能至少启动三轮，逐拍检验动作互斥、CD 递减及前摇不重启；HP 按实际 Active 次数与下一拍接触核对。
- 当前相关回归：11 文件 96 项通过，退出码 0。包含新增 7 项；不是全仓测试数量。
- 类型检查最终退出码 0；14 能力、19 系统组合审计通过，退出码 0。命令与能力列表见 capability-plan.md。
- 生命周期时序仍为 Tick1 启动、Tick3 生成攻击区域、Tick4 接触扣血并清理。没有更改既有时序断言。
- 近战优先、CD 8/19、伤害 7/11/13 等是实验配置。远程为定点区域，未验证弹丸飞行；攻击者静止，移动宿主挂点跟随未验证。
- 已证明逻辑选择与模板参数复用；素材绑定部分未验证，几何画面不能代替真实挥砍。新 UI 场景尚无保存的运行截图。本批新用例尚待独立复跑。

V01—V08 映射、明确剩余项及素材验收条件见 capability-plan.md。未扩大 V06/V07/V08 或特殊技能实现范围，未签 B/S2。

## 2026-09-14 验收口径更正

B 对照表范围的战斗机制已经独立验收通过，依据 s2-b-acceptance-evidence.md 及其引用的独立画面验收报告。前一条更新的“未签 B/S2”应解读并更正为：B 保留已通过结论，V02 扩展样例待独立复查，S2 整体仍未完成。本批没有修改 B 公共战斗链，只新增数据样例与入口选项；不将其进展归零。新增样例不代表弹丸能力通过。

## 2026-09-14 V02 复查交接补充

已交独立复查者，范围为新增 7 项、相关 96 项回归、类型检查、完整能力审计及 V02 实际画面。独立报告目标目录为项目同级 mcfight-v02-review-20260914；未出结果前不记录通过。

观察修正仅涉及 s2-visual.ts：读数增加真实 Timer 剩余 CD 和 State 动作占用，包含共享 body；未改变选择、Flow 或伤害执行。此前页面资源字段为施法计数，不能误读成 CD。真实素材具体缺口见 s2-action-binding-gaps.md，已交策划确认。
观察字段补充后的类型检查已最终退出 0。验证服务器已恢复，可打开 http://127.0.0.1:5173/games/game-mcfight/s2-visual.html 。独立最终结果已完成，见下面交付结论。


## 2026-09-14 V02 独立复查最终交付

报告：[V02 独立复查](../../../../mcfight-v02-review-20260914/independent-v02-review.md)。独立复跑新增 7/7、相关 96/96、类型检查及 14 能力/19 系统审计，退出码全部 0。7 项包含于 96 项，不重复相加。复查使用共享版本，未冻结全工程或撤修验红；不能描述为隔离撤修完成。

默认近距 UI 实操 80 拍，施放次数 9/4/10、HP 1893/1870、区域 0；继续至92拍后暂停稳定，重开回 Tick0。7 张实际截图在同一独立目录，tick6-readout.png 显示 CD3/19 与共享动作占用，tick80-readout.png 显示三轮以上结果。结论：V02 扩展逻辑与默认可视化通过。远距与飞行选择仅自动测试覆盖。

B 原独立通过结论保留。V02 仍不覆盖弹丸飞行、新双技能模板取消流程、移动宿主挂点或真实动作素材；后者需按 s2-action-binding-gaps.md 确认素材并验证。S2 未完成。

## 2026-09-14 动作绑定准备

按策划明确的卫道士/僵尸/恼鬼要求新增 s2-action-bindings.ts 及缺失提示，未改战斗系统或现有fixture。2项绑定坐标/缺失状态测试+7项V02+7项页面夹具共15项通过，exit0。动作文件、画布及挂点数值尚未交付，不能认作动作绑定验收完成。详见 s2-action-binding-gaps.md 最新段落。此前 B 与 V02 已通过范围保持。
类型检查最终 exit0。独立复查本批仅核对绑定准备与缺失提示，不将动画播放或素材质量计为通过。
主程已实际打开页面并展开提示：卫道士、僵尸、恼鬼分别列出缺失画布、挂点和14个动作片段；读数保持Tick0/HP2000。此项是主程页面观察，不代称独立画面复核。独立复查已复跑15项exit0并核对无战斗写入。

## 2026-09-15 临时斧劈接口/V06

新增动作接口与V06探针，详情 s2-axe-v06-20260915.md。生产AnimState帧推进已接通，未完成合格动画、同拍打断表现和左右镜像端到端；V06审计发现检测/解算依赖环。独立复查与程序结果一致。B原通过结论不变，不将含反例的测试通过数计为能力通过。

## 2026-09-15 A 修复交付

用户选择A后补齐公共AnimState同拍Status中断选片段，并明确承诺区域定位→overlap检测→实心解算的顺序。真实组件读写均保留。实现与两次环定位详见 s2-axe-v06-20260915.md。

相关18文件124项回归exit0；17能力22系统审计exit0；最终类型检查exit0。硬控例从旧Active反例改为同拍Recovery/Frame6，后续至Tick6无补发，5项最终轨迹见 evidence/axe-v06-a-fixed-20260915.log。B历史通过保持，V06整体和动作素材不据此签通过。
独立复核及两组隔离撤修验红已完成，见同级 mcfight-v02-review-20260914/axe-v06-a-review.md。两个阻塞修复获认可，后续继续卫道士端到端表现与V06剩余场景，不重做已通过B。

## 2026-09-15 最终动作观察/V06—V08交付

详情 s2-action-v06-v08-delivery.md。22文件152项相关回归通过exit0，最终类型检查exit0，18能力23系统完整审计exit0。与上次不同：新增7项只读动作观察、V06扩展7项、V07三段/友伤2项、V08确定性/测量2项。总数包含已有回归与历史探针，不等于152项验收。

最终仅保留steering精确重合的稳定侧向分离修复；位置候选刷新/32迭代实验未保留。V06原严格失败已转绿，日志不删。新增页面语法错误已修且类型检查通过。

独立复查完成了此前150项复跑及steering撤修归因，最终2项V07及新增画面未独立验收，因复查额度/浏览器不可用未完成。不签S2，不撤销此前B。真实素材和代表复杂技能仍为具体待交付项。

## 2026-09-15 按收尾清单推进C1

详见 s2-c1-closeout-evidence.md：5项新场景通过，相关169项与类型检查exit0。宿主统一生命/控制/捕获来源，Hierarchy跟随与同拍死亡级联；原V02七项继续通过。C1程序自证完成，独立复查待办。C4/C5旧证据不满足新参数，明确差额已列，未擅自缩减素材要求或签S2。

## 2026-09-15 连续批次及C6新A路线

[总交接](s2-batch-delivery-20260915.md)列出C1—C6、V01—V08及具体缺项。195通过/1失败/1跳过的当前相关回归退出1，不能写全绿；死亡掉落旧契约失败保留。类型检查/构建退出0，23能力29系统无环（16条已注册未安装的可选排序引用保留），声明检查2项通过。规模独立命令2项通过exit0：20/50/100单位各预热1轮、测3轮1000Tick，100单位明显非线性、区域残留0。

用户选A后新增DamageReceiver/DamageRequest/LastDamage/DeathConversion链，7项生产碰撞验证通过；直接伤害共享池、0.5部位倍率、最大HP/Tag分型、最后有效来源、一次性转换。没有批准DoT/执行类全部伤害路径或最终尸巫玩法。C6原反例保留作历史，不计能力通过。

实际截图/读数位于evidence/batch-visual-20260915，已交原复查者总交接；该agent额度未恢复，独立结论待办。14真实动作片段仍缺，不缩减素材要求。B/V02已通过范围保持，不代签S1/S2，不关闭请求。
