# S4 刷新独立复查（2026-10-14）

判词：**PASS，限定当前本地游戏 hash `199096a210c5700f` 的玩法与结构门**。复查人 `/root/s3click_independent_review`，非游戏 S4/共享会话桥施工者。本报告不代签 Owner 人门、不执行 `game-pipeline review` 落账，不将 S5/S6 视觉/素材差异冒充 S4 已完。

## 清单、范围与独立复跑

- `node scripts/game-pipeline.mjs checklist game-clue-investigation S4` 退出 0。现有流程板机器门 S4 exit 0，摘要 bench95、GD5、UI walk100%，hash 为上述值；复查证据以下列独立命令为准。
- `npx vite-node scripts/acceptance-run.mjs --game game-clue-investigation` 退出 0：GD 编写的 5/5 剧本、合计 67 检查点全绿。每份剧本首行为 `// author: GD`。逐本覆盖普通物件不推进、必需线索首次收录与复访幂等、可选线索不计数/2 条必需完成、退出只取消、完成及取消后的重开清态。
- 将当前 manifest 通过 `npx vite-node scripts/bench-manifest.mjs --art-index library/game-clue-investigation/art/index.json`：退出 0，95/100（阈值 70）；Structure 15/20 的唯一 note 是“缺：相机”，固定单场景不使用相机；Load 15、Determinism 20、Numeric 20、Visual 25 均满分。无 stderr 告警。
- `npx vitest run games/game-clue-investigation/s4-interaction.test.ts src/studio/cart-run-core.session.test.ts src/studio/data-cartridge-runner.test.tsx`：3 文件 15/15、退出 0。S4 的 5 项断言包含世界坐标 pointer→调查链、弹层期间热点不生效、重复收录不重计、同输入世界 hash 一致、LayoutNode schema 零 issue；共享会话桥 5 项和旧运行器 5 项同跑无回归。无 stderr 告警。
- `node scripts/ui-walkthrough-probe.mjs --game game-clue-investigation`：真 Edge/隔离临时服务退出 0；`public/games/game-clue-investigation/probe/S4-uiwalk.json` 当前 hash 匹配，5 剧本 42/42 个 signal 手势可驱动（Canvas/DOM），49 次 waitUntil 与 18 次 expect 不被假算成玩家动作；console/page error 均 0。**此探针只查动作可达，不替代世界断言**，后者由上述 GD runner 独立通过。
- `node scripts/align-count.mjs docs/design/game-clue-investigation/self-check/S4-alignment.md` 退出 0：8✅、3⚠（均有 S5/S6/PNG 裁决去向）、0❌。抽核结构行：普通调查档案条与场景不漂移（GD 01 + UI walk）、首次收录/复访（GD 02）、完成/取消及重开（GD 03–05 + UI walk）。`S4-alignment.md` 自述的灰盒截图属于历史阶段，不能代表当前 PNG 画面；另目检现有 `self-check/shots/S6-05-completed.png` 为当前完成态，但不拿该单张图替代本轮真手势测试。
- 探针后检查 5700–5702、5720–5721、5173 无监听；无局部浏览器/Vite 常驻。未自行启动整套 ZeroCraft。

## 唯一锚点撤修验红

只在临时审查测试/内存对象中操作，不改正式 manifest。对 `entities.effect-lock-count.Effect` 断言 `onSignal=clue.collect.lock`、`kind=modify-resource`、`targetId=required-collected`、`value=1`，并对原文本 `"effect-lock-count"` 断言**恰好 1 处**。同一 GD 第 02 剧本原数据 PASS；只把内存蓝图该 Effect 的 `value:1→0`，使用真实 parse/Engine/acceptance `runScenario`，结果 FAIL：step 5、9、12 的 `required-collected` 均为期望 1、实际 0。再使用未改原文件运行同剧本 PASS。临时 Vitest 1/1、退出 0，测试文件已通过补丁删除；共享生产文件无改动。这证明剧本断言的是玩法行为，不是固定常量或单纯 UI 变化。

## 会话桥与证据边界

共享 `CartRunOptions.hostVisualSession`/`terminal` 均为可选；原本地 manifest 运行路径未传宿主会话。桥接新分支在 probe/formal World 绑定与清理，未往 `acceptance-adapter.ts` 加游戏规则。上述旧运行器、S4 定向测试、GD 真世界剧本、真实浏览器动作共同构成未退化证据。工作树有其他并行改动：`src/studio/cart-run-core.ts` 在途，游戏测试/adapter 有未跟踪文件；本次复查未擅自归因这些文件的施工归属，也未回滚任何人的文件。S4 截图全链由既有 `S4-alignment.md` 导航；若需当前视觉 1:1，仍归 S5/S6 独立复查与 Owner 审美/素材门。
