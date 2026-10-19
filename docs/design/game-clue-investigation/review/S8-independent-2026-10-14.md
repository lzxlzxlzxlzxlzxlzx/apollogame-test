# S8 终检独立复查（2026-10-14）

复查人 `/root/s3click_independent_review`，非 S8 施工者 `/root`。**判词：FAIL（终检复查门，不否认卡带轻量机器门 PASS）**。当前游戏指纹 `7683030b1df8ad2c`；未代签 Owner 人门、未推远端、未启整套 ZeroCraft。`checklist S8` 独立执行 exit 0。

## 已独立证实的绿项

- 合法 `node scripts/game-pipeline.mjs gate game-clue-investigation S8` 再跑 exit 0，记录于 `2026-10-14T09:23:53.092Z`，摘要 `MOCK 0 · manifest-check=0 · bench score=95 · ⚠ 无标准照基准·未比对`，hash 匹配。`scripts/game-pipeline.mjs:784–799` 的卡带路径实际只执行 mockDebt、真实 `manifest-check` 与 `bench-manifest`，无三绿全仓门。台账 `library/game-clue-investigation/art/art-ledger.json` 8 行，live `gen.mock` 0。**无 blessed golden 是实警告，不是比对 PASS**。
- 与 S8 gate 并发独立运行本游戏 GD `acceptance-run`：5/5 剧本、67 个机读检查点、exit 0；本游戏 S3/S4/S6 定向 Vitest 3 文件 22/22、exit 0。`S4-alignment.md` 8✅/3⚠去向齐/0❌，`S5-alignment.md` 8✅/2⚠去向齐/0❌，`align-count` 均 exit 0；已有开局、完成、重开、取消及取消后可玩截图，不能用 CLI 代替视觉目击。
- 撤修验红：manifest 精确 `"hitMaskKey": "game-clue-investigation/mask/clock"` 锚点计数 1；内存副本改为未登记 `.../s8-review-missing`，真实 `manifest-check` exit 1、stderr `cart-art: object-clock hit-mask ... 未在本地索引登记`。源文件 SHA256 前后均 `EE3BB6E8A919642BE018600410819F856603D438F165A2FB4077177DE57F17DF`，未破坏共享数据。该对抗验证只证明 S8 所调用的 manifest 子门能识别缺 mask，不替代其余终检项。
- 局部探针后检查 5700–5702、5720–5721、5173 无监听。

## 阻断终检 PASS 的实证

1. `git rev-parse HEAD` 为 `d994de3c5a5997a089b89597d62895dfab3e725c`，`git status --porcelain=v1` 有 **846 条在途改动**（含本游戏、`scripts/`、`src/`、其他项目）。工作树非净树，无法把当前测试结论绑定一个可复现的净 HEAD，也无法仅从当前混合 diff 证实 S8 施工改动全在领工边界。没有 stash、回滚或触碰他人改动。
2. 独立全仓 `npx vitest run --silent --reporter=dot` **exit 1**：703 文件中 20 败、6659 测试中 33 败、6 snapshot 败。输出可见 `games/game-simlife/game-simlife.test.ts` 4 败、`src/services/gal-ui/gal-audio-host.test.ts` 1 败、`scripts/depcruise-fence.test.mjs` 绿腿红；不能宣称全量并发绿或三绿。未证明这些红由本游戏引起，也不能把“其他项目”推断成无风险。
3. `docs/playbooks/game-production.md:52` 明确卡带 S8 为轻量门并绑 gameHash，而 `docs/playbooks/review-gates.md:37` 与 `scripts/game-pipeline.mjs:384` 的 S8 **复查清单仍无形态分支**，要求 HEAD 净树和并发全绿；`game-production.md:71,90` 还有“ S8 带 HEAD/净树位”的统称，与同页卡带例外互相冲突。当前 S8 evidence 对 cart 仅有 `gameHash`，无 `head`/`dirty`，代码见 `scripts/game-pipeline.mjs:962–968`。未发现该复查口径差异已在手册回填或当前工单提单，清单“手册缺口回填”未满足。
4. `docs/design/game-clue-investigation/requests.md` 的 `GCI-S7-HOST-SESSION-01` 仍标 `in-progress`，DokiWorld adapter、调用说明与发布物等待收束；本次本地卡带 S8 PASS 不能被表述为 DokiWorld 可上传/正式合同已完成。

据此本轮按复查手册的 **FAIL=打回** 登记：机器轻量门可保持 exit0，但不能把 S8 人门开放成“全绿终检”。所需后续是隔离/归属 846 条在途改动，获得可复现的净树/当前 HEAD 或为 cart 复查项完成明确裁决与手册回填；处理并独立复跑全量红项或明确合法豁免；待 DokiWorld 交付工单按其合同另验。以上不授权本复查人代替施工者修改共享手册或 Owner 人门。
