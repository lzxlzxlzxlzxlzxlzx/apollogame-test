# 引擎与新游戏创作流程 · 测试审查（2026-09-14）

> 首轮基线：`claude/mainbranch` @ `646f8b4bf`；game111 框架层复查基线：`5cc45d383`。本文件是复查导航与待补用例，不把建议中的测试写成已通过。沿用 `docs/playbooks/testing.md` 的「条款原文 → 对抗反例 → 撤修验红」纪律；不以行覆盖率或自报全绿代替行为证据。

## 0. 判词与实跑证据

- **已有基础**：creation-loop 守卫 38/38；选定的创作台、编排器、NPC 端口、记忆和 barrier 测试 149/149；`game110` 只有设计文档时看板可打开；系统图硬检查 PASS（89 个系统）。这些只能证明现有判据通过。
- **两个新增反例实际转红**（隔离快照，未写入仓库）：同一 NPC 两份不同意图交换到达顺序，`draftSettle` 产出由 `left` 变 `right`；当前门 `openedTurn=8` 时，`checkIntent` 接受 `turn=7` 的旧意图。两项都触及 `t2-intent-barrier` 自称的「到达次序无关 / 回放确定性」承诺，应在 game111 接入前修复。
- **本轮门禁**：首轮隔离快照的 `tsc/build` 曾因本机缺少已声明的 `fake-indexeddb` 无法完成，不据此判源码编译失败。本轮在隔离副本按锁文件安装依赖后，`node scripts/scoped-gate.mjs --run` 判为 `GAME:game111`，audit、eslint、depcruise、tsc、25/25 游戏测试、build、文档/预算守卫全部通过，退出码 0。audit 的「game111 无美术台账」、art-ledger 既有挂账及 Vite 大 chunk 为警告，未误记为零问题。尚未实现的红例不能被现有绿灯覆盖。

## 1. P0：意图收齐门，先补能抓住确定性错误的用例

| 用例 / 放置处 | 输入与动作 | 必须断言 | 当前状态 |
|---|---|---|---|
| `duplicate-delivery-permutation` · `src/skills/tier2/intent-barrier-core.test.ts` | 同一 `npcId` 的 `move(left)`、`move(right)` 两份合法回包，分别按 `[A,B]`、`[B,A]` 投递；再用 3 份冲突回包跑全排列 | 同一回包**集合**的 `resolved/filled/rejected` 逐字段相同；两个世界结算后的 hash 相同。须定一条与到达顺序无关的重复回包策略（例如冲突一律拒收并补默认），不能仅把输入按 `npcId` 做稳定排序 | **已复现红**。现有测试只覆盖不同 NPC 乱序；重复同 ID 测试反而把「先到者胜」写成了期望 |
| `late-response-after-reopen` · `intent-barrier.test.ts` | 第 7 回合打开门并派请求；第 8 回合以相同 barrier ID 重新开门；第 7 回合请求此时才返回并投递 | 旧请求不能占第 8 回合的名额；拒收可见；第 8 回合仅接受第 8 回合意图或确定性降级；重放两次 hash 相同 | **已复现红**：`checkIntent` 不看 `intent.turn`，`deliverIntents` 只看 `waiting` |
| `stale-authority-broadcast` · `intent-barrier.test.ts` | 非权威端第 8 回合已开新门，再收到第 7 回合 `applySettled` 包 | 不覆盖第 8 回合门；返回明确拒绝并可审计；两端仍可按同一权威结果继续 | 待补。当前 `applySettled` 未核对回合/状态 |
| `delivery-failure-race` · `intent-barrier-core.test.ts` | 同一 NPC 的成功回包与失败回执按两种顺序抵达；另给一份闭集外动词 | 先定义相同事实集合的确定性裁决，再断言顺序置换不改变产出；无效回包不能被误当作有效决策 | 待补。`allAccountedFor` 目前只看有无投递键，不看内容是否有效 |
| `barrier-contracts` · `src/skills/tier2/contracts.test.ts` | 等待中存档恢复、超期前后恢复、无外部输入持续 tick、权威/非权威双端回放 | `expectDeterministic`、`expectRestoreContinues`、`expectQuiescent` 分别命中；失败输出包含 seed、turn、tick | 待补。现有测试有 hash 例子，尚未用共用契约三件套覆盖这件有运行态的新能力 |

以上每一条须做锚点明确的撤修验红：故意允许旧 `turn`、恢复「先到者胜」、跳过广播回合检查后，相应测试必须转红。不能用「测试文件存在」代替测试有效性。

## 2. P1：创作闭环，测试失败恢复而非只测成功页面

| 用例 / 放置处 | 故障注入与动作 | 必须断言 | 当前状态 |
|---|---|---|---|
| `design-source-parity` · API + `game-pipeline.test.mjs` | DesignStudio 写 `library/<slug>/design/capability-plan.md`，随即打开 S2；再修改设计稿，刷新看板 | 生成器和 S2 读到**同一版本**的计划/缺口；不能靠手工 `cp` 同步；指纹变更使旧证据过期 | **现状不满足**。流水线只检测另一落点并提示搬运；统一事实源的存储迁移需先定方案 |
| `prototype-plan-gate` · `design_flow` API + DesignStudio 组件测试 | 依次给无计划、编造 capability ID、未裁缺口、catalog 服务不可用四种输入 | 每种都有可区分的机器判词与用户可见结果；若仍允许草稿生成，必须明确「草稿/未审」状态，不得显示可发布 | **部分覆盖**：后端做文本体检、UI 显警告，但仍只报不拦；catalog 不可用时 ID 检查回空集，需单独报「未能验证」而非默认可信 |
| `create-put-fail-retry` · `creation-wizard.test.tsx` + API 集成测试 | 中文名新建成功后，让第一次 manifest PUT 返回失败；用户点击重试；同时放一个同名、有设计稿的既有项目 | 只留下一个目标项目；重试复用正确 slug；既有设计稿/meta 不被覆盖；返回错误后 UI 能继续重试 | **仅后端局部覆盖**。目前两次请求非事务，缺少前端端到端失败重试用例；最终应改幂等 request ID/单次提交 |
| `warnings-visible-journey` · 浏览器 e2e | 让 manifest-check 返回成功但带软告警，分别走 Fast Create 和 DesignStudio | 真页面可见完整告警、刷新/保存后仍可追溯；不能只断言源码含 `savedNext.warnings` 字符串 | **部分覆盖**：静态守卫和 UI 分支在档，尚缺真实旅程目击 |
| `post-save-side-effect-failure` · `library_api` API 测试 | 让 art derive / S1 concept 初始化返回失败或抛异常 | 主 manifest 保存可成功，但响应/状态明确显示后置任务失败并可重试；不得把失败当成已完成 | **现状不满足**：`_scaffold` 和 PUT 的异常分支仍静默吞掉 |
| `library-status-truth` · API + `library-model` 测试 | JSON 合法但 capability 不存在、manifest 引擎校验失败、bench 不及格、S8 未通过 | 列表分别标出 JSON 可读、引擎有效、可玩、可发布；不能仅因 `json.loads` 成功就报 `playable` | **现状不满足**：`valid` 仅表示 JSON 可解析 |
| `catalog-payload-budget` · 生成 API 契约测试 | 录制分解、模板改写、prototype 三类请求的真实 payload | 分解只带索引；需完整字段的生成只带计划选中的 schema/示例及依赖；未知 ID 明确失败；统计字符数防回退 | **部分覆盖**：分解已用索引，prototype 仍带全量；CLI `--only` 尚未成为产品端到端检索 |

## 3. P1：S8 与打包边界（发布策略确认后固化断言）

`main_entry/packaging.py` 目前只核 slug、平台和游戏是否存在，没有读取 S8。先由 owner 确认「草稿包」与「发布包」的状态契约，再落下列三组测试；不要在测试里偷偷替 owner 决策：

1. **S8 未绿 / 证据过期 / 人门未签**：发布包不得伪装成 release；若允许草稿包，产物和 API 响应都须带可见的 draft 状态。
2. **S8 绿后游戏内容改变**：重新打包前重算指纹，旧证据不能继续放行；测试分别修改 manifest、设计输入、艺术资源。
3. **平台出口一致**：zip、web、DokiWorld 等入口共享同一发布判词；不能只有某个 CLI 拦、API 异步 job 绕过。

## 4. game111 框架层到来后，测试要从「能跑」推进到「不会卡、不会悄悄失效」

`5cc45d383` 新增的 `games/game111/game111.test.ts` 原有 24 例、引擎/端口靶向测试共 84/84、DeepSeek 代理 `--selftest` 15/15，均已独立复跑。其正常路径覆盖已不错；本轮针对弱断言做了三处**已落地**优化：

- `rest` 原只断言「精力变多」；现在用同种子、同拍数、只差一个动词的两盘世界，断言 `rest` 与 `observe` 的精力/好奇心差值分别精确等于数据表的回复量。把 Effect 的 `value: amt` 临时改成 `amt - 1` 后，差分测试实红（原来的「变多」仍可能绿），然后已恢复生产代码。
- 意图接线原只抽查 `nao × move_to × 6 区` 的 KeyBinding；现在遍历全部 NPC × 合法分区/对象 × 四个动词，逐条核对 KeyBinding **和目标/数值正确的 Effect**。同一 `amt - 1` 破坏也使其转红。
- 称号原只验娜洛的一条；现在每条都验「阈值 - 1 不解锁、恰好阈值解锁」。故意断开 `t-mor-muse` 的 Effect 后，新测试点名转红，然后已恢复生产代码。

另有两条**新复现红，未并入正式门禁**（隔离工作树用零墙钟、零外部 IO 的临时探针验证后删除）：

| 用例 / 放置处 | 输入与动作 | 必须断言 | 实际 |
|---|---|---|---|
| `never-settling-port-falls-back` · `games/game111/game111.test.ts` | 一个 NPC 的 `NpcAgentPort.decide()` 返回永不完成的 Promise；宿主把 barrier 推到期限 | `runTurn` 最终完成并对该 NPC 填默认意图；不得把异步等待放在 barrier 超期机制之前 | **红**：`turn-driver.ts` 先 `await Promise.all`，永远到不了 COMMIT。HTTP 端口的 `timeoutMs` 又是可选项，故「超期不死等」不是当前端到端保证 |
| `failure-report-permutation` · 同上 | 两个 NPC 都返回空数组，轮流让其中一个多让出几个微任务 | 相同失败事实集合的 `TurnReport.failures` 同序、同内容（按 `npcId` 全序）；不把网络到达序带进报告/回放日志 | **红**：数组按 Promise 完成顺序 `push`，两次运行的 `nao/mor` 顺序相反。世界 hash 相同不能替报告判词背书 |

还需单独设计 `move_to(不存在的分区)` / `talk_to(不存在的 NPC)`：当前 barrier 只校验动词与参数个数，预展开接线对不存在的参数无 Effect；意图可能被记录为已成功而世界不变化。此项先请玩法 owner 定义「拒收并降级」还是「有效意图但目标不存在」，再把判词写成测试，不从现有实现倒推期望。game111 尚无 S4 的三条设计剧本与真实浏览器玩家手势；框架单测绿不等于游戏已验收可玩。

## 5. 执行顺序与交付门槛

1. **先修 barrier 两条已红反例与 game111 的永不返回端口**，再跑同 ID 全排列、跨回合迟到、端到端超期、双端 replay/hash；这是 game111 使用 `NpcAgentPort → IntentInbox → IntentBarrier` 的前置复查门。
2. **再补创作流故障注入**：建库成功/PUT 失败重试、双设计存储同步、警告真实可见。只加正常路径断言不能关单。
3. **发布策略确定后补 S8 API 测试**，再补草稿/正式包的真端到端冒烟。
4. 每项在干净基线上先绿，再做带锚点的撤修验红，最后跑 scoped gate；改变 `tier2`/引擎共享面还要跑慢车道与受影响游戏的验收剧本。报告退出码与 stderr 告警，不把「没有运行」写成 PASS。

本审查文档本身不把任何 P0/P1 缺口标为 done；对应代码、测试和独立复查实际完成后再关单。
