# R3-B3 程序交付证据

日期：2026-09-17。结论为 **程序自证通过，等待独立复查**。B3 八个身份已从 36/84 更新为 **44/84 `passed-program`**；此计数不等于独立签核，也不包含 S6 的正式动作、特效验收。

## 本批身份

| 矩阵 ID | 运行时 ID | 已验证的生产行为 |
|---|---|---|
| `alexsmobs_elephant` | `elephant` | 地面远距冲锋、实际首次接触伤害、取消边界。 |
| `twilightforest_minoshroom` | 同名 | 与大象共用冲锋链，仅使用自身参数。 |
| `vex` | 同名 | 俯冲窗口、实际命中、隐藏商店身份。 |
| `alexsmobs_farseer` | 同名 | 3 次最大生命比例射线后 5 次俯冲的私有循环。 |
| `alexsmobs_tarantula_hawk` | 同名 | 节肢专属非硬控禁足，攻击 Flow 不中断。 |
| `mowziesmobs_naga` | 同名 | 真实毒弹、俯冲交替、无伤害副作用的环绕。 |
| `alexsmobs_warped_mosco` | 同名 | 同一 body 的一次性变身及变身后投射物。 |
| `alexscaves_teleto` | 同名 | 标准真实投射物身份。 |

## 本轮修复

- 环绕速度按内容层的世界单位/秒转换为运动层的每 Tick 值；此前单位停留在循环的俯冲候选，无法从环绕半径启动。
- S4 组合守卫同步扩展为 34 个系统，并显式要求 B3 的 `relation-orbit`、`mcfight-mobility-lock`、`form-change` 留在实际装配中。
- 机制观察入口新增 **B3 大象冲锋、B3 恼鬼俯冲窗口、B3 诡异蚊鬼变身**。三者均从 `createR3IdentityScene` 返回的生产 World 读取数据，不含手写攻击或血量注入。

## 验证

| 门 | 命令 | 结果 |
|---|---|---|
| B3 点名身份与可视化夹具 | `node node_modules/vitest/vitest.mjs run games/game-mcfight/r3-b3-production.test.ts games/game-mcfight/s2-visual.fixture.test.ts --maxWorkers=1 --minWorkers=1` | 2 文件、15 项通过。 |
| S4 组合回归 | `node node_modules/vitest/vitest.mjs run games/game-mcfight/s4-combat.test.ts games/game-mcfight/r3-b3-production.test.ts games/game-mcfight/s2-visual.fixture.test.ts --maxWorkers=1 --minWorkers=1` | 3 文件、33 项通过。 |
| MC Fight 全量 | `node node_modules/vitest/vitest.mjs run games/game-mcfight --maxWorkers=2 --minWorkers=2 --reporter=dot` | 47 文件、325 通过、1 历史跳过。日志：`self-check/r3/r3-b3-full-regression.log`。 |
| 类型检查 | `npx tsc --noEmit` | 退出 0。 |
| 构建 | `npm run build` | 退出 0；仅保留既有 chunk-size 提示。 |
| R3 组合审计 | `node node_modules/vite-node/vite-node.mjs scripts/mcfight-r3-audit.ts` | 4 图均 `cycles=0`、`unknown=0`。 |

## 可视化操作证据

页面入口为 `http://127.0.0.1:5173/games/game-mcfight/s2-visual.html`。场景以暂停开始，使用“单步”操作推进；脚本逐项选择场景并点击单步 25 次。截图与读取结果存于 `self-check/r3/b3-visual/`：

- `01-charge.png`：大象处于实际 `Active` 冲锋，锁定 `a-target`，目标资源已实际扣除。
- `02-dive-window.png`：恼鬼的生产 Flow 与锁定目标在俯冲循环中可见。
- `03-transform.png`：诡异蚊鬼同一 `a#0:body` 的 `State` 为 `changed`，已进入变身后技能 Flow。

## 复查交接

冻结副本位于 `review/r3-b3-freeze-20260917/`。复查者必须只在其中安装依赖并复跑定向测试、类型检查与审计；再执行 B3 的冲锋、俯冲窗口、变身、环绕及取消边界撤修检查。未完成前，八行的 `r3IndependentReview` 保持 `pending`。

## r3 重冻结补正（2026-09-17）

此前 r2 复查退回要求的五类 B3 边界已收进
`games/game-mcfight/r3-b3-capability-boundaries.test.ts`：失败启动不推进循环、禁足不成为硬控、原 body 的原位变身、失去目标后环绕停止，以及毒的刷新/来源快照/周期真伤。

本次还修复了两个全量回归发现的共享问题：`OverTime` 的周期伤害载体按 effect elapsed Tick 生成唯一 ID，且来源路由测试不再重复装载生产 `over-time` 系统；身份通用回归将持续状态的周期伤害与直接技能释放分开断言。

新冻结包：[r3-b3-freeze-20260917-r3-complete](review/r3-b3-freeze-20260917-r3-complete/README.md)。在其 `frozen-source` 内实际复跑的结果为：定向 3 文件 20 项通过；MC Fight 全量 48 文件 330 项通过、1 项历史跳过；类型检查、构建和四组 R3 审计通过；六组 B3 撤修均验红且在每次后恢复。详情见 `freeze-check/results.json` 和 `freeze-check/mutations.json`。该结果仅为程序自证和复查交接，八行 `r3IndependentReview` 仍保持 `pending`。
