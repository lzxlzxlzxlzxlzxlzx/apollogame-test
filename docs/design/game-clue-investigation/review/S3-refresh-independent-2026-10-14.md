# S3 刷新独立复查（2026-10-14）

判词：**PASS，附非阻断告警边界**。复查人 `/root/s3click_independent_review`，非本轮共享会话桥施工者。此判词只针对当前本地 `game-clue-investigation` S3 机器行为；不代签 Owner 人门，不执行流程复查落账。复查起点的机器门 `gameHash=199096a210c5700f`。

## 独立复跑

- `node scripts/game-pipeline.mjs checklist game-clue-investigation S3`：退出 0；按清单核对本地 manifest、正式运行器、S3 渲染与点击证据。
- `Get-Content library/game-clue-investigation/manifest.json -Raw | npx vite-node scripts/manifest-check.mjs --art-index library/game-clue-investigation/art/index.json`：退出 0，`ok=true`，显式 12 项能力，`inferredCapabilities=false`，`warnings=[]`；使用真实解析、Engine 装载与两个 tick。
- `npx vitest run games/game-clue-investigation/s3-skeleton.test.ts src/studio/cart-run-core.session.test.ts src/studio/data-cartridge-runner.test.tsx`：3 文件、14/14 通过，退出 0。覆盖 S3 manifest 骨架、共享会话绑定/清理以及旧 DataCartridgeRunner 入口。
- `node scripts/render-probe.mjs --game game-clue-investigation`：退出 0；`S3-render-gate.json` 的 `gameMounted.pass=true`、像素方差 1275.11（阈值 15）、控制台 error 0、page error 0、错误浮层 false。目检 `public/games/game-clue-investigation/probe/S3-render.png` 为档案室真实画面与叠加精灵，并非空白/启动器。
- `node scripts/click-probe.mjs --game game-clue-investigation`：退出 0；`S3-click-gate.json` 记录 14 个候选，两种视口（1280×800、1024×768）均有 `object-clock / investigate.clock` 具名 Signal 命中；透明 mask 负例检查 2/2，失败 0，控制台 error 0。
- 探针结束后检查 5700、5701、5702、5173 监听端口，均无监听；局部浏览器/Vite 未留常驻服务。验收访问的是探针内部临时本地地址，不涉及整套 ZeroCraft。

## 唯一锚点撤修验红、告警

在**内存副本**中对 manifest 的精确锚点 `"hitMaskKey": "game-clue-investigation/mask/clock"` 计数，断言恰好命中 1 次；仅将该值替成未登记的 `game-clue-investigation/mask/s3-review-missing` 后喂给同一 `manifest-check`。结果退出 **1**，stderr 为 `cart-art: object-clock hit-mask game-clue-investigation/mask/s3-review-missing 未在本地索引登记`。前后原文件 SHA256 均为 `0F2AC23CB81E0D7A40FEA571C83FBB84B9D370C381834565BD01E04E7768D48A`，无需恢复共享文件。

另一次对抗检查将唯一的 `GameFlow.current = scene-idle` 临时改为不存在状态：`manifest-check` 发出 `warning: investigation-flow.GameFlow.current —— 引用了不存在的流程状态 ...`，但仍输出 `ok=true` 并退出 0。该脚本明确采用“仅告警不阻断”策略，故**不能将其退出码 0 解读为零断链**；本轮正式 manifest 的 `warnings=[]`。这是一项已读出的门禁边界，不构成当前 S3 实稿失败。

## 共享会话桥回归判断

本轮新增 `CartRunOptions.hostVisualSession`/`terminal` 为可选参数；在本地 manifest 常规调用未传会话时，绑定与释放分支不执行。静态核对 `runBlueprintInto`：probe World 绑定后装载、两个 tick、finally 解绑定；formal World 绑定后装载；结束时释放。独立 5 项会话单测含绑定、失败清理、输入 listener 清理；旧运行器 5 项与本游戏 S3 4 项同跑全绿。真实渲染及两视口点击再次证明本地 manifest 的现有 S3 行为没有被桥接修改。当前共享工作树有并行改动，本报告仅认上述实跑证据，不把其他阶段或整库判绿。
