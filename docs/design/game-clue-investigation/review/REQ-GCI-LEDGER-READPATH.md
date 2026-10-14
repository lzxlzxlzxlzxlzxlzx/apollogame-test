# REQ-GCI-LEDGER-READPATH · 卡带台账只读路径复查导航

2026-10-13。施工仅修改共享只读入口 `scripts/game-pipeline.mjs`、`scripts/game-skill-audit.mjs`、`scripts/ledger-audit.mjs` 及点名测试；卡带取 `artRoot` 的 `library/<slug>/art`，内置游戏仍取 `public/games/<slug>/art`。卡带 manifest 也只从 library 读，public 同名影子文件不能冒充正式来源。未复制台账、修改资产、代签复核或碰 Owner 人门。

## 先红后绿与真实输出

- 改码前：GCI `ledger-audit --json` 错报 `PASS games:[]`；`game-skill-audit` 假报“无美术台账”；S6 看板假报“无台账”。新增回归测试先红：台账/能力组 4 项、流程板组 2 项准确失败。
- 改码后：`ZEROCRAFT_DEEP=1 npx vitest run scripts/game-pipeline.test.mjs scripts/game-skill-audit.test.mjs scripts/ledger-audit.test.mjs` 3 文件 90/90 PASS；定向 ESLint exit 0。
- 真实 GCI：S6 看板为台账 8 行、锚✗、写回 8、复核 0；`game-skill-audit` PASS，无假缺账；`ledger-audit GCI --json`/`--strict` 均 exit 0，8 行有槽、0 孤儿。`--all` 发现 GCI（20 款中 1 款），内置 `game-a` 13/13 仍通过。
- 独立复查另复现显式缺账假绿：补丁前 `ledger-audit __review_missing_ledger__ --json` 为 `PASS games:[]` / exit 0。新增测试先红，修后报 `MISSING` / exit 1；`--all` 仍只扫描现存台账，存量 269 孤儿按既有顾问态 exit 0。

## 非施工者复查

`/root/ledger_independent_review` 最终 **PASS，仅限本只读口径与显式缺账**。复查人独立复跑上述 90 项与真实 CLI；隔离撤修精确命中台账路径锚点 1 次，退回 public 后真实 GCI 断言由 8/8、exit 0 转 `missing:true`、exit 1，临时副本已清理。其间发现的显式缺账假绿已先修再重验，没有把第一次局部绿当最终判词。

## 边界

本结果不代表 GCI S2–S5 过期证据已刷新、S6 素材审批已通过，亦不代表整库门禁绿。`node scripts/scoped-gate.mjs --run` 仍在其他项目的 depcruise 32 条依赖违规处 exit 1；公共池仍不关账。
