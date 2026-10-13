# GAL-ENG-02A 施工自验与独立复查单

日期：2026-10-09。施工人：gal程序会话。复查人：GAL 策划会话。最新判词：**PASS（02A 定向能力复查）/ CONCERNS（全库门禁）**。该判词不涵盖 02B 回滚，也不代表整套 GAL 已交付。

## 独立复查第二轮（2026-10-09）

- 独立复跑 02A、合同、系统图、注册表四组测试，加入下述新断言后 **38/38**、退出码 0。此前两条红测未被修改或弱化，均转绿。choice 的 Flag 与 Resource 条件改变会刷新可用态，静息 tick 不重复 enter/effect；源码 `refreshChoiceProjection` 仅在派生选项态变化时重建投影。
- 独立运行 `npx vite-node scripts/system-graph-audit.mjs t3-narrative-director t3-dialogue`：两系统、无环、退出码 0；源码 system 与 capability 两级 reads/writes 已诚实包含实际读写的状态、随机、投影与 DebugTrace，`runsAfter:['dialogue']` 明确共装顺序。`system-graph.test.ts` 唯一 stderr 为其自造的 phase 0 `[L,P]` SCC；真实共装审计未出现该告警。
- 独立执行组件全集 `node scripts/build-component-map.mjs --check`：224 组件一致、退出码 0；能力注册 `npx vite-node scripts/gen-capability-registry.mjs --check`：138 条同步、退出码 0。独立 `npx tsc --noEmit --pretty false` 仍退出 1，仅 game-dice/game-theft/launcher 的既有 10 条诊断，无 GAL 文件诊断；全库门禁未绿。
- **带锚点隔离撤修验红：** 先机械复制原 source/test 为仅供复查的同目录 mutant 副本，确认未变异基线 13/13 绿；每次只用精确锚点移除一项防护：① `effectError` 对 unlock 的拒绝 → 点名测试红，得到 `missing-effect-target` 而非 `unsupported-effect`；② `automaticTrail`/32 跳守卫 → 点名测试红，未得到 `jump-loop`；③ `JSON.parse(JSON.stringify(buildProjection(...)))` 纯数据转换 → 新增 `structuredClone(projection)` 点名测试红，得到 `DataCloneError`。第③项新断言已保留到正式测试，原源码通过。两份 mutant 副本均已删除，未改共享生产源码。
- 第一轮两条真实红测先失败、施工者修复后独立转绿；第二轮又以隔离撤修验证三项原有防护确有测试抓手。按 02A 写死范围，定向复查通过。**全库 tsc 红灯和 02B 必做能力仍在**，禁止把本判词表述为完整 GAL 或可推送状态。

## 施工者针对第一轮红测的复修（待复查人独立复跑）

- 保留复查人新增的两条红测，未修改或削弱。system/capability 两级 reads 现均诚实列出 InputQueue、NarrativePackage、StoryRuntime、Resource、Flag、RandomSeed、NarrativeProjection、DebugTrace；writes 同步列入实际写入的 DebugTrace。
- choice 节点停留期间，每 tick 重算 option 的 ConditionExpr，只在可用态变化时重建纯数据 NarrativeProjection；不重进节点、不重放 enter/choice effect、不改 cursor/receipt。施工者额外补资源门控选项测试，覆盖外部 Resource 改变和再次静息 tick。
- 补系统显式 runsAfter: dialogue：两解释器若同装，先由既有 dialogue 结算共享 Flag/RandomSeed，再由 Narrative Director 读取；不减少任何读写申报。真实审计单独 Director、Director + 输入/资源/旗标/随机基座、Director + dialogue + 资源/旗标/随机三组分别退出码 0、无 SCC、无悬空边；补顺序前的 dialogue 共装审计曾退出 1 并点名 phase 10 的 Flag/RandomSeed/Resource 环，修后转绿。
- 施工者定向复跑：npx vitest run src/skills/tier3/narrative-director.test.ts src/assembly/gal-package.test.ts src/assembly/system-graph.test.ts src/assembly/capability-registry.gen.test.ts → 退出码 0，37/37。另加严格模式的 dialogue + narrative-director 共装拓扑排序断言，确认顺序为 dialogue → narrative-director，软环直接抛错而非被警告吞掉。system-graph.test.ts 的唯一 stderr 告警仍是测试故意构造的 L/P 合成环，不属于真实 Director 子集。
- npx tsc --noEmit --pretty false → 退出码 1，仅既有 game-dice、game-theft、launcher 三处共 10 条诊断；本单文件无诊断。全库门禁仍未绿。
- 此段为施工者自验，不覆盖上轮 FAIL 判词。请非施工者重新复跑、检查上述顺序语义与 option 失效刷新，并按原 Review 要求锚点撤修验红后更新判词。

## 独立复查第一轮（2026-10-09）

- 独立复跑原有四组定向测试：33/33，通过、退出码 0。`system-graph.test.ts` 的 phase 0 `[L,P]` 告警来自测试内合成 SCC；另独立执行 `npx vite-node scripts/system-graph-audit.mjs t3-narrative-director`，子集 1 个系统、零环、退出码 0。但这项绿灯依赖 system 的读写声明真实，不能替代源码核对。
- 独立 `npx tsc --noEmit --pretty false`：退出码 1，诊断仅在 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`，本单 GAL 文件无诊断。全库门禁不可称绿。
- 对照 02A 工单新增两条对抗断言至 `narrative-director.test.ts` 后，定向测试 9/11 通过、2 条失败（退出码 1）；红测保留给施工者修复。失败分别是 `declares every world component it reads for deterministic scheduling` 和 `refreshes option availability when flags change while a choice remains visible`。
- **打回 1（定序契约不实）：** `narrative-director.ts` 的 system `reads` 只报 `InputQueue`、`NarrativePackage`，实际 `execute`/`enter` 还读 `StoryRuntime`、`Resource`、`Flag`、`RandomSeed`。能力级 `components.reads` 亦漏 `StoryRuntime`/`RandomSeed`。当前 system-graph 绿不能证明与真实同装系统的定序安全；补齐诚实声明后须再跑真实子集和相关系统图，必要时按语义声明显式定序，不得借少报 reads 躲环。
- **打回 2（投影失真）：** choice 仍停留可见时，外部 Flag 改变后下一拍 `NarrativeProjection.options[].available` 保持旧值。02A 要求投影当前可用选项，且 UI 将只读投影；必须在不重复 enter/effect、不过度推进节点的前提下刷新派生投影，并点名验证资源条件同理。
- 这两项是基于工单语义写出的可复现红测，非主观代码风格意见。修复后由非施工者重新复跑、读告警与撤修验红；本轮不宣称 02A 通过。

## 判断与接线

- 接受 owner 已裁决的 A 路线：扩通用能力，不写 GAL 游戏专属 runner，不碰 UI、存储或媒体播放。
- 复用 InputQueue 的 tick 边界、ConditionExpr、Resource/Flag、RandomSeed、WorldSnapshot 和 opt-in DebugTrace。现有 t3-dialogue 的单图字符串边与 Text 投影无法无损表达跨章 StoryRef、场景继承和 enter 身份，因此本能力只补 GAL 包解释边界。
- NarrativePackage 挂已通过 parseGalPackage 的静态包；StoryRuntime 只存包身份、StoryRef、继承场景、enter 身份、自动路由轨迹与闭集回执。unlock 效果在执行前拒绝。

## 产物与系统图

- src/skills/tier3/narrative-director.ts：Resolve 相位；具名输入 narrative.advance / narrative.choose（arg 为稳定 option.id）；每拍最多前进一个节点；jump 每拍最多一跳，32 跳上限并检测回环；effect 预检后提交；投影只含素材 key，不播放媒体。
- src/skills/tier3/narrative-director.test.ts：两章节、两角色、双结局、跨章、条件跳转、场景继承、拒绝路径、trace、确定性、恢复与静息测试。
- src/skills/tier3/index.ts、src/assembly/capability-registry.ts、src/assembly/capability-registry.gen.ts：能力注册与懒加载。
- src/assembly/component-map.ts、src/assembly/component-universe.gen.ts：三组件闭集登记。
- docs/playbooks/pick-list.md、docs/playbooks/events-logic.md：使用路径与 02A 边界。

系统图：InputQueue + NarrativePackage + StoryRuntime + ConditionExpr/Resource/Flag + RandomSeed → narrative-director (Resolve) → StoryRuntime + Resource/Flag + RandomSeed + NarrativeProjection。无额外系统。

## 自验记录

- 定向命令：npx vitest run src/skills/tier3/narrative-director.test.ts src/assembly/gal-package.test.ts src/assembly/system-graph.test.ts src/assembly/capability-registry.gen.test.ts。最近一次退出码 0，33/33。
- node scripts/build-component-map.mjs --check：退出码 0，224 个组件一致。
- npx vite-node scripts/gen-capability-registry.mjs --check：退出码 0，138 条能力同步。
- npx tsc --noEmit --pretty false：最终复跑退出码 1，仅报告全库既有 game-dice/dice-window.ts、game-theft/ui.ts、launcher/game-runner.tsx 类型错误；本单文件无诊断。
- system-graph.test.ts 会向 stderr 打印一条 phase 0 的合成 L/P 环告警；这是该测试故意构造的 SCC。复查人仍须核实真实能力单独装载零告警。
- 默认沙箱下 Vite/Vitest 对其自身文件 realpath 报 EPERM；定向测试及 registry 生成/校验使用沙箱外短生命周期命令，未启动应用服务。

## 非施工者独立复查要求

1. 独立复跑定向测试与 tsc，记录退出码和完整 stderr；不得采信本单自述。
2. 对照 docs/design/galgame/requests.md 的 02A、两份 GAL 设计稿及 src/engine/protocol/galgame.ts，核验一次输入/拍、enter/choice 恰一次、跨章场景继承、资源钳位、坏引用及不支持效果写入前拒绝、同种子/快照 hash。
3. 锚点撤修验红：在隔离副本里分别撤掉 effectError 对 unlock 的拒绝、MAX_AUTOMATIC_HOPS/automaticTrail 检测、投影 plain-data 转换；每次先断言锚点命中，再确认点名测试转红，最后恢复并复跑。不要直接破坏共享工作树。
4. 检查真实 narrative-director 与可能同装系统的 phase/组件边，确保无静默 SCC；核对生成注册表与组件全集。

本单不宣称 GAL Director 完整对外可用：滚轮回退、跨选择点改选及历史裁剪仍属 GAL-ENG-02B；独立复查与全库门禁尚未通过。未执行 Git/GitHub、数据库写入或启动服务。
