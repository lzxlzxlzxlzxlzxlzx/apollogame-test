# SIMLIFE-ENG-23 Review 单｜连续移动与非阻塞邻近对话

日期：2026-10-10  
施工人：BDM程序  
复查人：非施工人独立复查  
状态：**✅ 已独立验收（2026-10-10）**

## owner 判词与边界

owner 已选择 **A**：以 Life package 严格 JSON 的闭集策略控制开放对话离开交互范围后的生命周期。实现必须扩写既有 `t2-life-talk`，不得由 host/UI 隐藏面板而保留权威 session；E 不再停止移动，对话期间可自由移动。旧 package 兼容语义必须明确，Little Valley 不得继续旧的 persist-on-leave / movement-lock。

禁止触碰 `src/ui/**`、`src/renderer/canvas-renderer.ts`、资产、数据库、服务与 Git/GitHub。本单没有新增 system/phase/capability。

## 实现导航

1. `src/engine/protocol/life-sim.ts`：闭集 `LIFE_DIALOGUE_SESSION_POLICIES`、显式兼容默认 `persistent`、可选 package 字段。
2. `src/assembly/life-package-validate.ts` / `life-package-compile.ts`：strict unknown/enum 校验；compiler 总是向 `LifeDialogueCatalog.sessionPolicy` 落成明确策略。
3. `src/skills/tier2/life-talk.ts`：`t2-life-talk@1.4.0` 在现有 Resolve system、`dialogue` 之前对有效 cursor 应用 proximity policy；只消费同 tick `LifeActivityContext.nearbyPlacementIds`，越界销毁 session 并写 bounded trace。
4. `src/engine/host/life-input.ts`：E/Tab/Enter/Escape 保留 heldCodes，不生成 stop；T/N 与 blur/visibility 保持既有释放语义。
5. `src/engine/host/life-game-host.ts` / `life-interaction.ts`：删除对话入场 release、movement lock/reject 与 out-of-range retain 私态；对话 pointer/方向输入不释放或隐藏权威会话。
6. `games/game-simlife/little-valley.life.json`：显式 `dialogueSessionPolicy:"proximity"`。
7. capability plan、Life authoring、movement/events/save playbook 已同步；自证见 `self-check/eng23.md`。

## 必须独立核验

- [x] registry/schema/compiler：字段闭集、unknown/非法 enum 拒绝、旧包明确 `persistent`、Little Valley 明确 `proximity`。
- [x] 纯 reducer：Up+Left → E → E repeat → keyup 顺序不丢 held、不多 stop/start；Tab/Enter/Escape 同类；T/N、alias、blur、visibility 不退。
- [x] 真实 World：连续对角移动中开对话、移动继续、越界自动关闭、held/Velocity 继续、回到范围重开。
- [x] package default range 与 placement override 均通过 `LifeActivityContext`，`life-talk` 不复制距离算法。
- [x] choice/terminal/keyboard/pointer；legacy persistent；近/远 cursor restore；坏 cursor；save/snapshot/hash/determinism。
- [x] DebugTrace 打开可重建原因、每 system/tick ≤3；关闭时无调试写入。
- [x] 独立复跑 tests/lint/docs/component/system/audit；读取 stderr warning。
- [x] 带唯一锚点断言的独立撤修验红，恢复后确认 marker 0。

## 施工人自证摘要（仅导航，不作为复查证据）

- 27 files / 215 tests passed。
- ESLint 零 warning；DOCS-REF、component manifest 205/205、SYSTEM-GRAPH、audit ratchet、S4 align-count 全部 PASS。
- 施工人撤掉唯一 proximity policy 分支后点名精确 2 红，恢复后 2 绿。
- 全库 typecheck/build 只见既有无关红，未命中 ENG23 文件；详见 `self-check/eng23.md`。

## 独立复查结论

结论：**PASS，建议策划验收**。Blocker **0** / Major **0** / Minor **0**。

### 1. 独立语义核验

- 协议与装配：`LIFE_DIALOGUE_SESSION_POLICIES` 是闭集 `persistent|proximity`，兼容默认常量为 `persistent`；strict validator 拒绝非法 enum 与 interaction unknown field，compiler 无论省略与否都向 `LifeDialogueCatalog.sessionPolicy` 落成明确值。Little Valley raw JSON 明确选择 `proximity`。
- 输入与真实 World：纯 reducer 及 DOM 薄适配覆盖 Up+Left → E → E repeat → keyup，E/Tab/Enter/Escape 保留 held state 且 repeat 无副作用；T/N、WASD/Arrow alias、blur/visibility 仍按既有规则释放。Little Valley 真 World 测试中对角 Velocity 在开对话后继续，离开范围由 `life-talk` 销毁权威 session，held/Velocity 不被 host 私改，回到范围可重开并完成 terminal close。
- 范围真相：`life-talk` 只读取同 tick `LifeActivityContext.nearbyPlacementIds`，未复制 Manhattan/footprint 算法；package default 与 placement override 均由 `life-activity` 编译投影，override 点名用例证明较窄范围优先。
- 对话与恢复：choice 的 Tab/Enter 与 pointer、line/terminal close、坏 cursor 清理、legacy persistent、proximity 近处恢复和远处首 tick fail-safe 均通过。save 只保留 cursor 权威态，不复制 `DialogueScript/Text/WorldUI2D/DebugTrace`；远处恢复清 session 后无 host/UI 私态残留。
- 确定性与日志：相同 proximity run 的 snapshot hash 相同；save/order/hash 回归通过。`life-talk` trace 为 opt-in，越界记录 `decision(target-out-of-range) → transition(open→cleared)`，局部计数器硬限每 system/tick ≤3；无 `DebugTrace` 时不创建或写调试状态。

### 2. 独立命令与结果

- 27 文件定向 Vitest：`src/engine/host/{life-save,life-host,life-game-host}.test.ts`，`games/game-simlife/{life-demo-package-json,game-simlife,save,world-interaction}.test.ts`，`src/assembly/{life-package-compile,life-item-catalog,life-quest-validation,life-package}.test.ts`，`src/skills/tier3/dialogue.test.ts`，以及 `src/skills/tier2/life-{talk,resource-gather,relationship,quest,planting,npc-schedule,navigation,milestone,input,harvest,farming,continuous-motion,calendar,activity,action}.test.ts`：当前工作树 **27 files / 218 tests passed**。施工记录的 215 是较早计数；当前逐文件汇总为 218，无删测或跳测。
- 相关 ESLint：对协议、validator/compiler、`life-talk`、host input/interaction/game-host 与点名测试共 13 个 TS 文件运行 `npx eslint ... --max-warnings 0`，exit **0**、零 warning；恢复 sabotage 后再次运行仍为 0。
- `node scripts/docs-ref-guard.mjs`：扫描 **46** 个 Markdown / **391** 个路径，`DOCS-REF: PASS`。
- `node scripts/component-manifest-guard.mjs`：当前 **205** / 基线 **205**，`COMPONENT-MANIFEST: PASS`。
- `npx vite-node scripts/system-graph-audit.mjs t2-life-continuous-motion t2-life-activity t2-life-action t2-life-talk t3-dialogue`：注册总图 **119 systems / 216 显式边**，相关子图 **5 capabilities / 8 systems**，零重复 id、零悬空边、无环，`SYSTEM-GRAPH: PASS`。受限沙箱首次因脚本 `realpath EPERM` 在审计前失败，按短生命周期只读审计方式重跑后通过。
- 全局 system graph 同样 `PASS`，完整读取其 **5 个全局超集信息性环**；其中 phase 10 的 `dialogue/life-talk/narrative-director` 是互斥能力超集 RMW 提示，真实 ENG23 子集只装 `life-talk + dialogue` 并已验证无环。
- `node scripts/game-skill-audit.mjs game-simlife`：未覆盖红旗 **0**、`RATCHET: PASS`；完整读取到既有薄宿主“零能力接入”黄项，不是本单新增回归。
- `node scripts/align-count.mjs --game game-simlife --stage S4`：**60 ✅ / 0 ⚠ / 0 ❌**，exit 0。
- `npx tsc --noEmit` 与 `npm run build` 均非零；输出共命中已知 `game-dice`、`game-theft`、`src/launcher/game-runner.tsx` 和 ENG22 `art-consumption.test.ts`，**零命中 ENG23 协议/compiler/life-talk/host/Little Valley 文件**。build 停在相同 tsc 阶段，未启动服务。

### 3. 撤修验红与残留

- 撤修前对完整锚点 `if (sessionPolicy === 'proximity') {` 做精确计数，命中数 **1**。
- 临时用 `apply_patch` 把唯一分支改为恒假并加入 `ENG23 sabotage` marker；运行 `life-talk.test.ts` 的 proximity 生命周期与 placement override 两项，精确 **2 failed / 6 skipped**，两处都因 `life:dialogue-session:player` 未销毁而红。
- 同回合精确恢复；恢复后点名 **2 passed / 6 skipped**，最终 27 文件 **218 tests passed**。终态锚点计数 **1**，`ENG23 sabotage` 与 `false && sessionPolicy` marker 合计 **0**；未创建临时目录，无复查改动残留。
