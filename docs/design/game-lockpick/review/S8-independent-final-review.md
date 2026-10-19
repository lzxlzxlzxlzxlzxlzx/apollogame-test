# 独立终检单 · `game-lockpick`《机关锁》S8

| 项目 | 证据 |
| --- | --- |
| 工单 | `GAP-LOCKPICK-01`；owner 于 2026-09-29 裁决 **A**，新增 `t3-discrete-combination-session` |
| 施工 | `Codex/root/lockpick_delivery`（引擎）；`Codex/root/lockpick_finish_s4_s8`（游戏 / App）；`Codex/root/lockpick_assets`（S5 资产） |
| 复查 | `Codex/root/lockpick_final_review`（与施工人不同） |
| 提交 | 依根 `AGENTS.md` 本复查人未执行 Git 命令；待 owner 自行处理 |
| 改动面 | 引擎 capability / 协议 / registry / playbook；`games/game-lockpick/**`；`dokiworld/game-lockpick/**`；`public/games/game-lockpick/art/**`；本 review 单 |

## 一、做了什么

1. 独立复跑引擎、会话、SDK、manifest、LayoutNode、资产台账与闭包检查；不采信施工自陈。
2. 对 SDK 业务输入和终局输出执行带锚点的变异副本撤修验红；副本只位于 review 临时目录，测试后已删除，未修改实现或资产。
3. 静态检查唯一 failure 路径、禁止资源 / 额外业务输入、规则逻辑重复、目标泄露、自由 DOM / 裸随机，以及 S5 消费槽闭合。

## 二、逐条核对

| # | 核什么 | 怎么自己验 | 独立结果 |
| --- | --- | --- | --- |
| 1 | 通用能力与游戏层无重复组合判定 | `npx vitest run src/skills/tier3/discrete-combination-session.test.ts games/game-lockpick/session.test.ts games/game-lockpick/sfx.test.ts`；检查 `games/game-lockpick` 只装配 capability | ✅ 19/19；游戏层只构造 `DiscreteCombinationInput`，无目标生成 / 向量比较 / 终局状态机 |
| 2 | 无限尝试与唯一 failure | 同上；搜索 `moves|attempts|timer|deadline|durability|penalty` 与 failure 路径 | ✅ 1000 次 hard 非完成提交仍 playing；failure 只由确认 `give-up` 进入；`dispose` / `requestExit` 不映射 failure |
| 3 | 严格 SDK I/O | `npm --prefix dokiworld/game-lockpick test`、`node dokiworld/game-lockpick/tests/manifest.test.mjs` | ✅ 12/12；业务输入唯一 `difficulty`，输出 `data` 仅 `outcome`，manifest 合同一致 |
| 4 | **撤修验红：额外输入** | review 副本仅删除 `keys.length !== 1` 锚点；断言 `{difficulty:'easy',seed:1}` 被拒绝 | ✅ 如预期红：输入被错误接受；副本已删除，真实测试恢复全绿 |
| 5 | **撤修验红：终局输出** | review 副本仅给 `lockpickOutput()` 增加 `attempts:0`；断言 `Object.keys(data) === ['outcome']` | ✅ 如预期红：收到 `['outcome','attempts']`；副本已删除，真实测试恢复全绿 |
| 6 | plain object 合同 | 对真实 parser 输入带 `difficulty` 的 class instance；必须拒绝 | ✅ 初查发现其会被接受；随后修为 `Object.getPrototypeOf(value) === Object.prototype` 并纳入包测试，最终 `npm --prefix dokiworld/game-lockpick test` 12/12 通过 |
| 7 | LayoutNode / 无 target 与精确数量泄露 | `npm --prefix dokiworld/game-lockpick test`；检查投影和树 | ✅ `validateLayoutNode` 覆盖 3/4/5 槽位；树无 `matchCount`；无 React / `innerHTML` / `createElement` / `Math.random` |
| 8 | S5 索引、台账、消费槽、包内闭包 | `node scripts/ledger-audit.mjs game-lockpick --strict`；`node scripts/asset-reconcile.mjs game-lockpick`；读 `dist/ASSET-CLOSURE.json` | ✅ ledger 6 行 / 6 消费槽 / 0 孤儿；三方对账 PASS；closure 为 6 entries / 6 files，产物无 `/games/game-lockpick/art/` 绝对部署前缀 |
| 9 | UI 机械审计与真渲染 | `node tools/ui-audit.mjs tools/audits/game-lockpick.audit.ts --w 1440 --h 900` 和 `--w 810 --h 506`；owner 已启动静态包后无头截图 / 自玩 | ⏳ 本复查环境缺 Chromium（`/opt/pw-browsers/chromium`），无法运行审计；未启动服务，未宣称真渲染 / 截图验收 |
| 10 | S5 音频接线 | 搜索 `LOCKPICK_SFX`、`SynthAudioPort`、`AudioSync` / playback；执行一条合法 set、成功、放弃与确认 / 取消路径 | ✅ `playLockpickSfx()` 用 `SynthAudioPort` 消费封闭 `SfxSpec` 表；App 已路由调节、四档反馈、解锁、放弃、确认与取消；无 AudioContext 安全 no-op，新增测试在 #1 的 19/19 中通过 |

## 三、重点看（阻断判断）

1. **音频已复核接线而非仅有表。** 当前 `playLockpickSfx()` 通过 `SynthAudioPort` 消费封闭 SfxSpec；有效 set、成功、确认放弃、取消均接到相应音效，headless 保持 no-op。
2. **严格合同缺口已关闭。** 初版 parser 接受 class instance，与 `sdk-contract.md` 的“普通对象”不符；当前已采用原型闸、加回归，并经 12/12 App 包测试复跑。
3. **视觉门不能用静态审计记录代替。** 当前环境没有可用的隔离 Chromium，且本复查人不会启动服务。必须由 owner 启动既有静态产物后完成 1440×900 / 810×506 截图、自玩和对齐单；不应将这项标绿。

## 四、已知未做 / 边界

- 未执行 Git / GitHub、数据库操作或前后端启动。
- 未改游戏实现或资产；review-only 变异副本在验证后已删除。
- 未主张真实渲染、触控、键盘、reduced-motion 或真音频目击通过；它们需要可用的 owner 提供静态地址与隔离无头浏览器。

## 五、判词

**❌ NEEDS WORK（当前不准宣称 S8 完成）。**

代码、SDK、引擎能力、S5 资产与音频均已复查通过；唯一未闭合的是 #9 的 owner 静态包真渲染、自玩与两种视口截图对齐。完成该证据后，本复查单的代码与资产部分无需返工。
