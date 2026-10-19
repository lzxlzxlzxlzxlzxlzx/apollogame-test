# GCI S3 mask-only 点击探针 · 独立复查导航

2026-10-13。范围仅为共享 `click-probe` 从二值 mask 选择实心点击点、验证透明反例的返修；不代表 S3 整关、人门或全库门禁通过。独立复查人：`/root/gci_mask_click_review`，非施工者。

## 独立实证

- 定向测试 33/33、TypeScript 检查 exit 0。
- `node scripts/click-probe.mjs --game game-clue-investigation` exit 0：1280×800 与 1024×768 各 7 个候选；`object-clock/investigate.clock` 实心正点 2/2 触发 Trace commit，透明反例 2/2 均未触发；`consoleErrors=[]`。
- 撤修验红在隔离内存副本进行：`scripts/click-probe.mjs` 的 `...maskTargets.map(...)` 锚点唯一命中 1 次，改为空列表后，正式 manifest 原有 `canvasClickTargets=0`，`interpretCanvasClickProbe` 明确 exit 1；共享工作树未改。
- 临时浏览器已关闭，5700 无监听，未留下本探针进程。

## 判词与未越过的门

共享 mask 点击返修局部 **PASS**。正式 `node scripts/game-pipeline.mjs gate game-clue-investigation S3` exit 1，前置 S2 独立复查已随游戏 hash `379660cb83a5f1e0` 过期（上次 CONCERNS），未进入 click；S3 机器与复查证据亦过期。因此 S3 整关是 **BLOCKED/CONCERNS**，需阶段复查方依据新指纹独立刷新，施工者不得补签或绕门。

同时 S6 看板已识别 library 台账 8 行、写回 8、复核 0，仍有锚点未填；不能把局部探针通过当作美术审批。
