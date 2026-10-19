# SIMLIFE-ENG-24 Review 单｜多方向键真实状态收敛

日期：2026-10-10  
施工人：BDM程序  
复查人：非施工人独立复查  
状态：**✅ 已独立验收（2026-10-10）**

## 工单边界

修复共享 `life-input → InputQueue → t2-life-continuous-motion` 的多方向状态收敛；不得新增游戏私有逻辑，不改 `src/ui/**`、renderer、资产、数据库、服务或 Git/GitHub。ENG23 的非阻塞对话语义必须保持。

## 根因与实现导航

1. 根因：一个 `KeyBinding` 实体一拍只能承载一份 `Signal`。多方向同 tick keyup 形成多条同名 `life.move.stop(arg)`，keybind 首个匹配后 `break`，其余 stop 丢失。
2. `src/engine/protocol/life-sim.ts`：闭集宿主动作常量 `LIFE_MOVE_STATE_ACTION`。
3. `src/engine/host/life-input.ts`：方向事件投影完整位掩码；repeat/duplicate 仍无副作用；E/Tab/Enter/Escape 不改 held；T/N、blur/visibility/releaseAll 发 0 快照。
4. `src/skills/tier2/life-continuous-motion.ts`：`1.1.0` 读取 `InputQueue`，按 source 取同 tick 最后快照，原子覆盖 flags 后归一化 Velocity；非法 mask fail-closed + bounded trace；legacy start/stop 兼容。
5. 点名测试覆盖纯 reducer、generic host、真实 Little Valley World、同 tick queue、后续静止、aliases/opposed/repeat/交互键、determinism/hash/trace；手册与 capability plan 已同步。

## 必须独立核验

- [x] 修复前根因是否真实：同一 KeyBinding 的同拍同名动作只能形成一份 Signal，而不是猜测浏览器问题。
- [x] 左+上→多次右（KeyD/ArrowRight/repeat）→全部 keyup 同 tick，四 flags/Velocity 归零且 5 tick Transform 不动。
- [x] 同样序列逐次 keyup+tick；相反轴抵消、same-direction alias、duplicate/stale repeat 均收敛。
- [x] E/Tab 交错、blur/visibility/releaseAll；ENG23 对话中移动与 proximity 越界关闭不退。
- [x] 同 tick 多份 `life.move.state` 确认取最后一份；多 actor/source 不串；非法 mask 不改 held。
- [x] legacy `life.move.start/stop`、碰撞、导航、存档、snapshot/hash 保持。
- [x] DebugTrace 可重建 accepted/rejected 投影，每 system/tick ≤3；关闭时无日志状态/字符串构造。
- [x] 独立复跑 tests/lint/docs/component/system/audit，完整读取 warning；带唯一锚点断言独立撤修验红并恢复 marker 0。

## 施工人自证摘要（仅导航，不作为复查证据）

- 修复前纯 reducer + 真实 World 精确双红；真实 held 残留 `left:true, up:true`。
- 终态计数以 `self-check/eng24.md` 与独立复查为准。
- ESLint、DOCS-REF、component manifest 205/205、相关子图、audit ratchet、S4 60/0/0 均 PASS。
- 全库 typecheck/build 仅见既有无关红，未命中 ENG24。
- 施工人撤掉唯一 state 消费锚点后两个关键守卫双红，恢复后双绿、marker 0。

## 独立复查结论

结论：**PASS，建议策划验收**。Blocker **0** / Major **0** / Minor **0**。

### 1. 独立语义核验

- 根因不是浏览器猜测：`t2-keybind` 对每个 `KeyBinding` 只挂一份 `Signal`，命中第一条同名 action 后立即 `break`；因此旧的同 tick 多条 `life.move.stop(arg)` 只能保留首个参数。新链路没有扩大 `Signal` 合同，而是在宿主纯 reducer 投影完整 mask，并由既有 motion system 直接读确定性 `InputQueue`，边界合理。
- 宿主状态：WASD/Arrow 以物理 code 集合计算 up=1/down=2/left=4/right=8；duplicate/repeat 不发包，逐 keyup 每次投影完整剩余集合，同方向 alias 直到最后一枚物理键释放才归零；E/Tab/Enter/Escape 保留 held，T/N、blur、visibility、`releaseAll` 发零快照。DOM installer 仅转发 reducer effect，没有 World 直写。
- 模拟状态：按确定性 queue/action 顺序覆盖 `Map<source,arg>`，所以同 actor/source 同 tick last-wins；actor id 与 action source 精确匹配，多 actor 不串。mask 只接受十进制 `0..15`，非法/缺失值记录 reject 且不覆盖 held；合法值一次性原子覆盖四 flags，再统一归一化 Velocity。
- 真 Little Valley 路径覆盖左+上、KeyD/ArrowRight alias 与 repeat、同 tick 全 keyup，最终四 flags/Velocity 为零，继续 5 tick Transform 不动；逐次 keyup、相反轴抵消、E/Tab、visibility/releaseAll、ENG23 对话中运动及 proximity 越界关闭同组回归通过。
- 兼容与确定性：legacy `life.move.start/stop` 仍由既有 Signal 路径消费；碰撞、navigation、save 恢复清运动、snapshot/order/hash 与 complete-state packet 双跑确定性均通过。没有新增 capability、system 或 phase。
- 日志：只有存在 `DebugTrace` 才取得 `debug`、构造 held label 与追加 transition/decision/reject；局部 `traceCount < 3` 把 `life-continuous-motion` 每 tick 限为最多 3 条。关闭时不创建 DebugTrace，也不构造日志 detail；非法 mask 可由 reject 还原原因。

### 2. 独立命令与结果

- 27 文件 Life 定向 Vitest：`src/engine/host/{life-save,life-host,life-game-host}.test.ts`，`games/game-simlife/{life-demo-package-json,game-simlife,save,world-interaction}.test.ts`，`src/assembly/{life-package-compile,life-item-catalog,life-quest-validation,life-package}.test.ts`，`src/skills/tier3/dialogue.test.ts`，以及 `src/skills/tier2/life-{talk,resource-gather,relationship,quest,planting,npc-schedule,navigation,milestone,input,harvest,farming,continuous-motion,calendar,activity,action}.test.ts`：恢复后最终 **27 files / 224 tests passed**。
- 扩展输入底座回归：`src/skills/tier2/keybind.test.ts` + `src/net/host/queued-input.test.ts`：**2 files / 17 tests passed**。
- 相关 ESLint：协议、host reducer/测试、continuous-motion/测试、Little Valley/host/world-interaction 测试共 8 个 TS 文件，exit **0**、零 warning。
- `node scripts/docs-ref-guard.mjs`：扫描 **46** 个 Markdown / **391** 个路径，`DOCS-REF: PASS`。
- `node scripts/component-manifest-guard.mjs`：当前 **205** / 基线 **205**，`COMPONENT-MANIFEST: PASS`。
- `npx vite-node scripts/system-graph-audit.mjs t2-keybind t2-life-input t2-life-continuous-motion t1-motion-apply t2-life-navigation`：注册总图 **119 systems / 216 显式边**，相关 **5 capabilities / 7 systems**，零重复 id、零悬空显式边、子图无环，`SYSTEM-GRAPH: PASS`。
- `node scripts/game-skill-audit.mjs game-simlife`：未覆盖红旗 **0**、`RATCHET: PASS`。完整读取唯一黄项：薄游戏目录静态扫描显示“零能力接入”；实际 descriptor 经共享 LifeHost 编译消费实名能力，且该黄项为既有口径，不是 ENG24 回归。
- `node scripts/align-count.mjs --game game-simlife --stage S4`：**60 ✅ / 0 ⚠ / 0 ❌**，exit 0。
- 受限沙箱内 Vitest/system graph 首次分别以 Vite `realpath EPERM` 在测试收集/审计前失败；改用允许的短生命周期非服务进程独立重跑后得到上述真实结果。没有把环境失败计作绿，也没有启动应用服务。

### 3. 撤修验红与残留

- 撤修前对完整锚点 `if (action.key === LIFE_MOVE_STATE_ACTION && action.phase === 'action')` 精确计数，命中 **1**；`ENG24-REVIEW-SABOTAGE` marker 为 **0**。
- 用 `apply_patch` 将唯一 state 消费条件临时改为恒假并加入 marker；运行 continuous-motion trace 快照消费与真实 Little Valley 多键 World 两项，精确 **2 failed / 27 skipped**。一项缺少 accepted transition/decision，另一项的真实 held flags 保持全 false，证明守卫确实命中生产接缝。
- 同回合精确恢复；点名回归 **2 passed / 27 skipped**，随后最终 27 文件 **224 tests passed**。终态锚点 **1**、marker **0**；未创建临时目录，无复查代码改动残留。
