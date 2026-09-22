# 测试体系评审 · 更好的 case 与提速（2026-09-10 · owner「从测试角度再设计一下」）

> 证据来源：全量门禁日志（540 文件 / 5103 用例 / 132s 墙钟 · tests 165s CPU）· vite.config 双车道 · 全库 grep 的同形计数。
> 判词只说「值不值」，每项给落点；本轮已落地的标 ✅，其余按序留给下一位。

## 0. 结论

测试**数量**够（每能力有同伴测试·棘轮兜底），**质量**的短板是三件：
① **只有「例子」没有「性质」**——全库 0 处性质/不变量测试（无 fast-check·无种子序列）；例子测试能被「照实现写」骗过（game108 复盘）。
② **运行态契约没人统一钉**——「确定性 / 存档续跑 / 静止零写入」三条底线散在 7 处手写双跑里，多数 capability 一条都没有（group-gc 每拍记脏就是这么漏的）。
③ **快车道背着压测跑**——两份 bench + 一份整局通关 40s CPU，每次推都空转。

## 1. 本轮落地 ✅

| 项 | 落点 | 说明 |
|---|---|---|
| 共用夹具 | `src/test-fixtures/test-kit.ts`（+ 自检 `test-kit.test.ts`） | `worldWith / button / press / tickN / resourceOf` 收掉 6 处装系统循环、4 份 tickN、3 份「Flag+EventWhen 当按钮」；**契约三件套** `expectDeterministic / expectRestoreContinues / expectQuiescent` |
| 契约三件套自证 | `test-kit.test.ts`「撤修验红」 | 用一个把状态藏闭包里的 system 证明存档契约能红、每拍自激证明静止契约能红——夹具自己先过「能红」关 |
| 契约测试 | `src/skills/tier2/contracts.test.ts` | turn-order / cooldown / conveyor-queue 各过三契约；存档点故意落在「载体已发、prefab 未展开」「一槽冷却中一槽刚阻塞」这种最脆弱拍 |
| 不变量测试 | `src/skills/tier2/invariants.test.ts` | 种子随机序列（5 seed × 200 步·失败报 seed+步号）：inventory 总量守恒/堆上限/格数；dice 分布和=1、实掷落支撑集、均值逼近期望；rate-limit 并发/每拍/错峰/资源零冲突 |
| 慢车道 | `vite.config.ts` DEEP_GLOBS += game211 的 `pathfind-scale.bench`（25s）/ `slg-scale.bench`（4.6s）/ `flow-walk`（10s） | 快车道少 ~40s CPU；`npm run test:deep` 仍全跑 |

**慢车道抓到一条真回归（本轮修）**：P1a 把严格视图设成缺省后，`flow` / `timeline` 两个条件树消费者漏报 `Timer`/`StringVar` reads（event-when / self-rule 当时补了、这两个没补），game-f 133 例里 30 例红了三周没人看见——因为 game-f 只在慢车道。修法一行：两系统 reads += Timer/StringVar。教训进 §2 第 0 条。

写不变量测试时夹具自己先抓到两处**测试侧**错（重复 key 取错候选、expectedValue 传参错）——性质测试对「测试写错」同样敏感，这正是它比例子测试强的地方。

## 2. 建议继续做的（按性价比）

| # | 做什么 | 怎么做 | 值 |
|---|---|---|---|
| 0 | **慢车道不能只靠「改到它才跑」** | 两条都做：① `scoped-gate` 改动面含 `src/engine/**` 或 `src/skills/tier2|tier3/**` 时把 slow-lane 一起排进计划（现在只有改 vite.config/守卫脚本才跑）；② 主程每日巡检 Routine 加 `node scripts/slow-lane-guard.mjs`（`CLAUDE.md` 已有「每日定时巡检」条·把慢车道纳进去） | ★★★ 本轮实证：引擎面一改、冻结游戏红三周无人知 |
| 1 | **所有带运行态的 capability 过契约三件套** | 往 `contracts.test.ts` 加段：gauge / over-time / tween / craft-recipe / spawn-director / flow / timeline / match3-board / matrix-duel…（凡组件里有 remaining/elapsed/seq/members 的）。每段 6 行 | ★★★ 抓「状态藏在闭包/Map」「每拍自激」两类最难查的 bug；派 low 子代理 |
| 2 | **纯函数库全上不变量** | `engine/math`（clamp 幂等·lerp 端点·grid index/colOf/rowOf 互逆·floodFill 连通性·pointInPolygon 与 raycast 互证）· `cardboard-codec`（code↔suit/rank 双射）· `modifier-stack`（结合律）· `weighted-pick`（频率逼近权重） | ★★★ 每个 30 行；同上派工 |
| 3 | **递归复核脚本化到引擎层** | `scripts/game108-spec-recursion.mjs` 样板只服务 game108；做通用 `scripts/mutation-probe.mjs`：给 (文件, 锚点, 替换) 列表 → 逐条破坏 → 跑点名测试 → 必须转红 → 复原。引擎能力的「撤修验红」从 Review 单里的手工步骤变成可重复脚本 | ★★☆ 复查铁律第②步的机器化 |
| 4 | **game-103.test 27s 拆快慢** | 42 例每例 `fresh()` 全蓝图 + 900 拍走查；把 ≥300 拍的长走查（`tickN(e, 900)` 等）拆到 `game-103.long.test.ts` 进慢车道；短例保留 | ★★☆ 快车道再省 ~20s |
| 5 | **脚本测试少起进程** | `scripts/*.test.mjs` 44 份，起子进程的（lint-fence 16s·depcruise-fence 7s·pipeline-orchestrator 5s）改成进程内 import 主函数（engine-random-guard / hygiene 已是纯函数式脚本）| ★★☆ 每份 −5～10s |
| 6 | **黄金 hash 加「变了要说为什么」** | 39 处 golden 断言散在各测试；集中到 `src/assembly/golden.test.ts` 一张表 {蓝图, 拍数, hash, 上次变更原因}，变 hash 必须同提交改表 + 写理由（现在是各处改数字无人看） | ★★☆ |
| 7 | **渲染层冒烟从「人审截图」补一档机判** | `render-probe.mjs` 已有非空白像素判；给 `CanvasRenderer.sync` 加 mock-ctx 调用计数测试（同 `renderer/vfx2d.test.ts` 的 Proxy ctx 做法），钉「N 个可见实体 → N 次绘制」「隐藏实体零绘制」 | ★☆☆ |
| 8 | **验收剧本 waitUntil 化** | game108 十二本剧本 103 处魔法拍数（手册已点名）：改 `{waitUntil, cap}`；节奏参数一调就要人肉重算 | ★☆☆ GD 域 |

## 3. 写 capability 测试的固定结构（建议写进 wiki/skills/testing.md）

```
describe('<cap id>', () => {
  it('语义：条款原文 → 断言（不照实现写）')       // 例子测试·每条 spec 条款一条
  it('拒收路径：什么都没发生也要可见')             // reject 分支：blockedSignal / rejected 计数 / trace
  it('契约三件套')                                 // expectDeterministic / expectRestoreContinues / expectQuiescent
  it('不变量：种子序列 200 步')                    // 纯函数部分
});
```

**审 case 的四个问题**：这条断言能被两种实现同时满足吗（=没测）· 撤掉修复它红吗 · 存档点落在最脆弱的拍吗 · 无输入它静止吗。

## 4. 有意不做

- 不引 fast-check：种子 mulberry32 序列 + 报 seed/步号已够，少一个依赖、失败必复现。
- 不追覆盖率百分比：棘轮（测试在位 / 红旗 / SCC / 组件清单）比行覆盖更贴这套引擎的失败形状。
- 不动 P3D / PUI 域的测试（专职域）。
