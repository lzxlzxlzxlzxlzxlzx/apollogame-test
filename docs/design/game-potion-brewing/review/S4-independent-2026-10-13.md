# S4 独立复查 · 坩埚炼药（2026-10-13）

复查主体：`/root/s4_review`，与 S4 施工主体 `Codex/root`、验收剧本作者 `GD /root/potion_s4_gd` 均不同。判词：**PASS（S4 玩法与结构范围）**；本单不是 `pipeline.json` 复查落账，不代替机器门或 Owner 人门，也不把 S5/S6 正式美术与演出判为完成。

## 范围与基准

- 已按 `node scripts/game-pipeline.mjs checklist game-potion-brewing S4` 核对逐项清单；对照 `docs/design/game-potion-brewing/requests.md:19-24` 的领工声明。游戏实现集中在 `games/game-potion-brewing/`；GD 独占 `acceptance/`；浏览器探针 `scripts/potion-s4-browser-probe.mjs` 是声明过的短时测试件。G5 共享能力另有 Owner A 裁决与独立复查，不混作 S4 游戏层私写。共享工作树另有大量并行项目修改，`git diff --stat` 不得当作本游戏单独提交记录；未发现本单越界玩法修改。
- 本关只核 S1-P-06 的 1440×900 **结构 1:1**。独立目击 `ui-refs/29-transparent-fixed-recipe.png` 与临时浏览器 `S4-01-start.png`：左侧固定配方、中间锅与棒、右侧材料架、底部当前步骤，锚位与交互路径相符；无选方屏、方向按钮和底部拖料提示。运行时仍为造型/纹样占位，AI 坩埚/材料/成品图与泡效精修是 `self-check/S4-alignment.md` 第 8 条明确交 S5/S6 的 ⚠，不能从本关 PASS 推断视觉 1:1。
- `games/game-potion-brewing/screen.ts:7` 从 house `apolloBrocade` 派生主题且关掉不透明 wash/texture，`:112-113` 消费成熟 `ProgressBar.shape:'liquid'`；结算屏为匹配定稿结构的 LayoutNode 数据而非手写 DOM。`games/game-potion-brewing/game-potion-brewing.ts:26` 用 `mountUI`；`blueprint.ts:30-39` 以配方数据和 G1–G5 能力接线，没有借用其他游戏玩法机制。无敌人/对手 AI，本关 AI 设定项不适用。

## 独立复跑与实证复现

- `npx vite-node scripts/acceptance-run.mjs --game game-potion-brewing` 在 GD 补库存断言后独立重跑：**5/5 PASS**，剧本 01–05 分别 12/9/4/5/12 检查点；五本首行均为 `// author: GD /root/potion_s4_gd`。`games/game-potion-brewing/acceptance-adapter.ts:18-35` 只用真实 Engine、InputQueue、applyCommands，不另判配方。
- `npx vitest run games/game-potion-brewing/blueprint.test.ts games/game-potion-brewing/screen.test.ts`：**8/8 PASS**。`blueprint.test.ts` 点名两配方真装载、重复材料 2→1→0、耗尽实体/快捷键禁投、错料不扣库存；`screen.test.ts` 点名 LayoutNode 校验、清水/步骤色/失败紫和透明壳。`node scripts/game-skill-audit.mjs game-potion-brewing` 退出 0、红旗 0、棘轮 PASS；WARN 为尚无 S5/S6 美术台账，以及 `game-potion-brewing.ts:114` 的 `performance.now` 仅供 render-only 拖影时间，未入 sim/hash。
- 真浏览器独立复跑：把原 `scripts/potion-s4-browser-probe.mjs` **只在内存中**改为 5712 端口与系统临时截图目录，未覆盖施工者截图。隔离 Edge、临时局部 Vite，`http://localhost:5712/?game=game-potion-brewing`，**12 帧、0 page/console error**。实际鼠标拖材料锅外不提交、入椭圆锅口推进；归零卡片禁用、再拖和键盘 `1` 不推进；键盘 E/Q 成功闭环；错料失败；成功/失败都真点“重新炼制”并继续投料；Esc 弹窗“继续炼制”和“确认退出”均真点；CDP 真 touch start/move/end 完成投料与棒沿轨整圈，非仅向 World 注入信号。截图在 `C:\Users\24652\AppData\Local\Temp\potion-s4-independent-32204\`，测试后浏览器关闭，5712 无监听。常规 launcher 截图可见深色宿主壳，不据此误判游戏根的透明度。
- 另一次只在内存插入短弧断言的隔离浏览器复跑使用 `http://localhost:5713/?game=game-potion-brewing`：鼠标与 CDP 真触屏均先沿椭圆拖约 50° 后抬起，`confirmedCount` 保持 0，再做完整圆才增长；其余链仍 12 帧、0 error。截图仅在 `C:\Users\24652\AppData\Local\Temp\potion-s4-short-arc-57776\`；浏览器已关闭，5713 无监听。
- S4 合法机器门在游戏内容指纹 `2b771b62aca79e68` 退出 0。逐项读 `public/games/game-potion-brewing/probe/S4-uiwalk.json` 后确认 **12% = 25 个 GD `signal` 步骤中只有 3 个被通用 DOM `[data-action]` 走查器直接点击**，不是玩法动作成功率或完成率；22 个未驱动里，多数 `brew.add.*` 要先选料/拖 Canvas，`brew.stir.*` 是 Canvas 圆周手势/键盘 Q/E，单点 DOM 找不到。该探针不会替玩家推进仿真或核其 `expect`，其 `ok:true` 只证装载/点击时 0 console error；`scripts/game-pipeline.mjs:634-654` 也明确低可驱动率只报告、不拦。验收剧本 02/05 的 ember/repeat 由薄适配 `config.fixture` 驱动，当前正式 UI 只展示唯一 moon fixture，宿主输入选方属于后续接入，不伪称两份 fixture 都经浏览器玩通。本复查的正面可玩证据是上面**独立真实手势**跑过默认 moon 成功、错料失败、短弧、库存禁投、重开和退出；因此低可驱动率未掩盖当前 S4 必达动作，但属于 S4 机器门证据能力边界，不可把 12% 本身说成 UI 全链通过。
- 同一 `repeat` fixture、同一输入序列两次真实 Engine 运行均为 `success`，`Engine.hash()` 同为 `8d0a65e0`。种子 505 本轮无随机消费；结论是同输入确定性，而非随机分布已验。
- 抽样重走 `self-check/S4-alignment.md` 至少三条：#3 锅外无害/锅内推进、#4 鼠标与真触屏整圈、#6 成败结算重开与退出、#7 库存耗尽与禁投均由上述真浏览器与剧本证实；#8 ⚠ 的 S5/S6 去向和 Owner 素材审批边界明确。该文件的玩家视角八问及好玩三问逐条给出了状态/截图/时效归属与等待窗口证据，不以“还行”代答。`ui-inventory.mjs --game game-potion-brewing` 因缺 `theme.ts` 报“请显式传 --vocab”，它不识别本作 Canvas 手势；本复查以蓝图动作接线及真 DOM/Canvas 手势逐项核对，未把工具未覆盖算绿。

## 撤修验红（共享源码零写入）

用 Vite `enforce:'pre'` **内存插件**对 `games/game-potion-brewing/blueprint.ts` 做四类单次破坏；每类先断言锚点在源文件**恰好命中 1 次**，经同一真 Engine + GD `runScenario` 重跑，最后自动关闭 Vite，不修改共享文件：

| 故意破坏 | 捕获剧本与实际红点 |
|---|---|
| `Effect` 的 `value: -1` 改为 `0` | 05 在 step 4 期望库存 1/实际 2、step 7 期望 0/实际 2；GD 新断言有效 |
| 顺/逆 `POTION_SIGNALS[step.direction]` 对调 | 01、02 的 `confirmedCount` 红，04 的失败 `status` 红 |
| 搅拌 `requiredCount` 强制为 1 | 01、02 红；04 本来只要求 1 圈，保持绿符合该剧本范围 |
| 错料从 `acceptedActions` 去掉 | 03 的立即失败 `status` 红 |

因此所抽 S4 关键条款没有“测试全绿但实现破坏未命中”的假信心；特别是库存原先剧本只看步数的盲点已由原 GD 作者补断言后验红。CLI 输出中的 0 红旗、5/5、8/8 不替代上述真浏览器和对抗证据。

## 结论边界

S4 玩法与结构独立复查 **PASS**。尚须由施工主会话经合法 CLI 跑 S4 机器门并在门后按真实内容指纹落流程 `review`；Owner 试玩人门只能由 Owner 通过。S5/S6 的正式美术、资产审批、声音与演出 1:1 仍未完成，不计入本判词。全库 `scoped-gate` 若被并行 Life 项目依赖违规阻断，应按其真实退出码单独报告，不把本地定向绿冒充全库绿。
