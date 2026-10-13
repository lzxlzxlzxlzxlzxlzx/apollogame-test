# Review 单 · GAP-CARD-REVEAL-01 · `t2-presentation-track`

| 项 | 内容 |
|---|---|
| 工单 | `docs/design/game-card-reveal/requests.md` 的 GAP-CARD-REVEAL-01；owner 已裁 A |
| 施工 | 卡牌动画程序（本会话） |
| 独立复查 | 游戏策划/主程侧，必须非本施工人；本单**未自评 PASS** |
| 阶段 | S2 共享能力施工完毕，待独立复查；`capability-gaps.json` 仍为 `accepted`，S3+ 仍锁定 |
| Git | 未执行任何 Git/GitHub 命令；未提交/推送 |
| 禁区 | 未创建 `games/game-card-reveal/**`，未改数据库、SDK、服务启动或打包流程 |

## 一、做了什么

1. 新增通用 `PresentationTrack` 与可快照 `PresentationPlayback`，由 `t2-presentation-track` 解释信号、整数 tick、并行字段、多段 keyframe、离散帧、暂停/恢复/重播/跳过；多个轨道拥有者可并行，`doneSignal` 可串联下一轨道。无游戏名、cardId、图像 URL、DOM/Canvas 或随机特判。
2. Commit 相位先把自然/skip 统一落到显式 `finalPose`；下一拍 Resolve 才发一次 `doneSignal`，让信号不会被 `event-when` 的下一拍全局清扫吞掉。轨道拥有者按 `sortedIds` 排序，同目标字段冲突时后者稳定拒收并记 opt-in `reject` trace。
3. 注册静态/懒加载能力，更新组件地图/全集/清单、事件与 2D 表现手册；没有把 `Transform` 排除 hash：它仍是现有 sim 使用的组件。配置、游标与目标写入都随快照参与确定性回放（与 `t1-tween` 同类）。

## 二、改动面（只核这些本单文件）

- `src/engine/protocol/components/render.ts`：组件闭集。
- `src/skills/tier2/presentation-track.ts`、`presentation-track.test.ts`、`contracts.test.ts`、`index.ts`：解释器、自验、三契约与导出。
- `src/assembly/capability-registry.ts`、`capability-registry.gen.ts`、`component-map.ts`、`component-universe.gen.ts`、`declaration-audit.test.ts`：注册/类型/定序基线。
- `scripts/component-manifest-baseline.json`：新增两组件。
- `docs/playbooks/rendering-fx.md`、`events-logic.md`：消费方法与 hash 边界。
- 本 Review 单。`src/net/determinism.ts` 未改，理由见上：把 `Transform` 排除 hash 会破坏既有玩法语义。

## 三、逐条复查导航

| # | 核什么 | 独立核法 | 施工自验实数 |
|---|---|---|---|
| 1 | keyframe 闭集与逐字段写入 | 读 `presentation-track.ts` 的 `TARGETS`、`checkPresentationTrack`、`sample`、`writePose`；跑 `npx.cmd vitest run src/skills/tier2/presentation-track.test.ts` | 16/16 通过：四种 easing、中点/终点、x+y+scale+alpha、visible/zOrder 边界、非法值/缺组件 |
| 2 | 串并行与全序冲突 | 同文件测试“composes stages in series…”、“rapid play…”、“two target entities…”；看 `sortedIds` 和 `field-conflict` trace | 串联 Signal、并行实体、冲突拒收均绿 |
| 3 | pause/resume/reset/skip/终态 | 同文件测试“pauses…”、“natural and skip…”、“skip before play…”；比较终态逐字段深相等 | 终态深相等；重复 skip 无重复 done；首次作者态可 reset/replay |
| 4 | 信号生命周期 | 同文件测试“delivers done after the real event-when…”；特别核 `event-when.ts` 清扫顺序与 Resolve→Commit 顺序 | 真清扫场景中下游 Commit 消费一次 done，不丢不重 |
| 5 | 严格申报、快照/hash | 同文件“strict SystemView”与 `contracts.test.ts` 的 `t2-presentation-track` 三件套；检查 `NON_DETERMINISTIC` 不含新件 | 严格读写通过；确定性/恢复/静止契约通过 |
| 6 | 注册和组件生成物 | `npx.cmd vite-node scripts/gen-capability-registry.mjs --check`、`node scripts/component-manifest-guard.mjs`、`node scripts/build-component-map.mjs --check` | 139 条注册同步；205 组件基线、227 组件全集 PASS |
| 7 | 定序告警 | `npx.cmd vite-node scripts/system-graph-audit.mjs`，读全输出而非只看退出码 | 119 系统、无重复/悬空；5 个超集环仍在，但都**不含** `presentation-track`/`presentation-track-done`。施工中首次曾把 Commit 环增至 10 系统，显式 `runsAfter` 后已消除本单新增环 |
| 8 | 撤修验红 | 在临时 Vitest transform 插件中先断言源码锚点 `writePose(world, track, track.finalPose);` 命中**恰 2 处**，仅把第一处（skip）内存替换为空，再跑本件测试；勿直接改共享源码 | 实测 `SABOTAGE_ANCHOR_HIT 2`、退出 1，只有“自然/skip 终态深相等”一测转红（skip x=0、自然 x=10）；临时配置已删除，原版复跑 16/16 绿 |

## 四、验证回执与非本单红项

| 命令/检查 | 结果 |
|---|---|
| `npx.cmd vitest run src/skills/tier2` | 94 文件、1031 测试全绿（最后一次全层运行时，本件尚为 14 条；随后新增串联与严格申报两测试单独复验通过） |
| `npx.cmd vitest run src/skills/tier2/presentation-track.test.ts src/skills/tier2/contracts.test.ts` | 22/22 全绿（后来又加严格测试；最后单文件 16/16、契约 6/6） |
| `npx.cmd eslint src games --max-warnings 0` | exit 0 |
| `npx.cmd vite build` | exit 0，754 模块；只有既有 chunk >500 KiB 提示 |
| `npx.cmd tsc --noEmit` / `npm.cmd run build` | exit 1；报错在 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`（随后并行现场还出现 `src/engine/host/life-game-host.test.ts`），无本单文件诊断。不修无关游戏 |
| `npx.cmd vitest run` | exit 1；当次 625 文件中 612 通过、13 失败，5861 测试中 5839 通过、22 失败。红项含既有快照漂移、`life-*` 测试/声明基线、外部文档测试等；本单测试通过。`declaration-audit` 中本单两个系统已登记相位基线，余差为 `narrative-director`/`life-relationship` 与前者相关 SCC，未替他人追认 |
| `npx.cmd depcruise --config .dependency-cruiser.cjs src games` | exit 1，25 条依赖违规均不涉及本单文件（多在 game-simlife/life-host） |
| `node scripts/art-ledger-guard.mjs` | exit 1，新增黑户指向 `game-dice`，与本单无关 |
| `node scripts/docs-ref-guard.mjs`、`context-budget-guard.mjs`、`dokiworld-docs-guard.mjs` | exit 0 |
| `node scripts/scoped-gate.mjs --run` | **未执行**：脚本 `changedFiles()` 会隐式调用四条 Git 命令，违反 owner 对 agent 的绝对禁令；已逐项手动执行其共享面步骤并原样报告非零项 |

## 五、请复查人重点判断

1. **完成通知延迟一拍**：`event-when` 在 Update 清除全场旧 `Signal`；Commit 直接发会在下拍被吞。现设计先落终态、下一拍 Resolve 发信号，Commit 下游可消费。是否接受这一明确时序？
2. **hash 边界**：`Transform` 是现有玩法和快照的共享组件，不能仅因本轨道的表现用途排除。现设计让轨道状态与目标位姿确定性入 hash，禁止 gameplay Condition 读取插值值。这与 `t1-tween` 语义一致，是否接受？
3. **Commit 末投影定序**：为消除新 RMW 环，显式 `runsAfter` 九个同相写者；全局审计已证实新系统不在剩余 SCC。请独立核对真实组合里 `done` 下游可见、最终位姿不被同相系统重写。

## 六、已知边界与交接状态

- 每个 `PresentationTrack` 对一个 `targetEntity`；多个拥有者 + Signal 组合形成多实体串并行。不支持任意曲线编辑器、自由回调、图片加载、贝塞尔或游戏专属逻辑。
- 作者态取**首次有效 play/skip 前**该目标字段的实际值；reset/replay 使用保存的该快照。游戏若想固定 manifest 初值，应在首播前完成实体初始化。
- `doneSignal` 是终态提交后的**下一拍**通知；宿主失焦时应停止调用固定 tick，或发 `pauseOnSignal`，恢复时发 `resumeOnSignal`。本能力不读取墙钟或浏览器焦点。
- 全库 gate 当前不是绿灯。本单停在**独立复查/并行基线问题处理门**，不改 GAP 为 `delivered`，不进入 S3。

## 七、独立复查结论（2026-10-10）

复查人：游戏策划/主程侧（非施工人）。判词：**PASS（能力范围）**。

独立实证：

1. `npx.cmd vitest run src/skills/tier2/presentation-track.test.ts src/skills/tier2/contracts.test.ts`：2 文件、22/22 通过。
2. `npx.cmd vitest run src/skills/tier2`：94 文件、1034/1034 通过。
3. 注册表检查同步 139 条；组件清单 205/205、组件全集 227 均 PASS。
4. `system-graph-audit t2-presentation-track`：子集 2 个 system，无环、无悬空边；完整系统图仍有 5 个既有超集环，但均不含 `presentation-track`/`presentation-track-done`。
5. 撤修验红采用临时 Vitest transform、仅在内存移除 skip 分支的 `writePose(world, track, track.finalPose);`：锚点精确命中 2 处，16 条中 2 条按预期转红；删除临时配置后 22/22 恢复。施工 Review 单中“只有一测转红”是较早测试集口径，当前新增的 `skip before play` 守卫也正确转红。
6. scoped TypeScript（实现、点名测试和契约测试及其真实依赖）exit 0；ESLint exit 0；Vite 生产构建 exit 0，仅有既有 chunk-size 警告。
7. 全库 `tsc --noEmit` 仍被 `games/game-dice/**`、`games/game-theft/ui.ts` 与 `src/launcher/game-runner.tsx` 的并行现场诊断阻断，零诊断位于本单文件。`scoped-gate.mjs --run` 因会调用 Git，按 owner 最高禁令未执行；这里不把全库状态伪报为绿。

三项设计判断均接受：完成通知延迟一拍能避开 `event-when` 清扫且真实下游只消费一次；`PresentationTrack`/`PresentationPlayback` 与目标位姿进入快照/hash 保证固定 tick 恢复，未错误排除共享 `Transform`；Commit 末投影的显式定序没有给真实子图引入新环。

结论边界：共享能力实现与复查已满足本缺口语义，`GAP-CARD-REVEAL-01` 可转 `delivered` 并解锁 S3；这不代表全库门禁已绿，也不代表 `game-card-reveal` 已实现或可交付。
