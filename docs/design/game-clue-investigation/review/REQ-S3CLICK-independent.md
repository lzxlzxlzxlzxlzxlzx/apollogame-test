# REQ-S3CLICK · 非施工者独立复查（2026-10-13）

**最终判词：PASS（当前 S3 骨架范围；首轮 FAIL 已由施工返修关闭）。** 复查人：`/root/s3click_independent_review`；施工者：`Codex/root`。本单仅审 S3 点击门与通用卡带指针接线，不代 Owner 人门。按 `game-pipeline.mjs checklist game-clue-investigation S3` 开单，独立读了实现、点名测试、真实浏览器产物；未采信施工自述。

## 独立复跑

| 核证 | 结果 |
|---|---|
| `npx vitest run src/net/host/queued-input.test.ts src/skills/tier2/clickable.test.ts src/launcher.liblaunch.test.tsx scripts/click-probe.test.mjs` | exit 0，4 files / 39 tests；无 Vitest 告警。首次沙箱内尝试因 `node_modules/vitest/dist/spy.js` realpath `EPERM` 未运行任何测试，随后在独立受控进程重跑成功，不能把首次当绿。 |
| `node scripts/click-probe.mjs --game game-clue-investigation` | exit 0，3 候选，真点 `object-cup`，`clickable/commit` 精确匹配 `investigate.cup`，0 console error。`S3-click-gate.json` 亦为 exit 0。 |
| `node scripts/click-probe.mjs --game game211` | exit 0，12 次点击、9 处因果 DOM 变化，0 click failure，发现 26 个控件、14 个未试。 |
| `node scripts/click-probe.mjs --game game108` | exit 0，8 次点击、6 处因果 DOM 变化，0 click failure，发现 14 个控件、6 个未试。 |
| `S3-render.json` | `gameMounted=true`、variance 127.58、console/page errors 0；该证只支持真实卡带已挂载，不替代点击证。 |

真实探针均访问隔离临时 Vite 的 `http://localhost:<临时端口>/?game=…`，由脚本开闭无头 Edge；复查后 5700–5702 无监听。沙箱内首次 Edge 因受限临时 profile / Elevation 报错退出 1，随后在受控进程独立重跑 exit 0；告警不归因于产品代码。`git diff --stat` 的 CRLF 警告不改变本次判定；共享树还有别的并行改动，不将全量 diff 归给本单。

## 唯一锚点撤修验红与恢复

1. `src/studio/cart-run-core.ts:99` 的 `pointer = new PointerInputSource('cart-pointer', canvas, {` 精确命中 1 次；临时置于 `if (false)`，GCI 真浏览器探针 exit **1**，判词为“DebugTrace 无对应 clickable/commit”。恢复后 SHA256 与原样同为 `82FAFA8B2BAC4FECA47E589A9445FD4BD704D865F2D7ACAAB1CF2B04E63C737E`，重跑 exit **0**。这证明 Canvas 断言确实咬住指针→世界信号链。
2. `games/game108/game108.ts:585` 的 `startGame` 运行环 `engine.start();`（连同后续 `redraw();` 为唯一锚点，命中 1 次）临时停掉。**预期**：旧病“UI 点击不入世界”应让 S3 点击门红；**实际**：`node scripts/click-probe.mjs --game game108` 仍 exit **0**，6 控件、2 处 DOM 变化、0 console error。立即恢复；SHA256 与原样同为 `F7808AF04534703C9FE13FD7772DA5933B7F5FB1B9DD446868E1E23F109BE0BC`，基线重跑回 exit 0、8 控件、6 变化。未遗留破坏态。

## 首轮具体问题（已返修）

- **P0 / 首轮 FAIL：DOM 门曾因本地 UI 变化误报世界输入链打通。** 旧版 `scripts/click-probe.mjs` 只要求任一控件引起 DOM 差异；双页反事实修掉时间噪声，但不区分“打开帮助/菜单”与 `Engine.step→InputQueue→Signal`。停掉 `game108` 的真实 `engine.start()` 后仍假绿，直接重现工单 `docs/workflow/requests.md:121` 的 P0。施工方随后加入只读 `Engine.step/commandsForTick` 观察口；复查人再次同锚点撤修验红见下。
- **范围风险 / 待裁决：mask-only Canvas 卡带无法被此门验证。** `scripts/click-probe.mjs:107-116` 强制 `Shape.width/height>0` 且遇 `hitMaskKey` 一律跳过；而 `src/skills/tier2/clickable.ts` 的真实命中允许 `Clickable+Transform+hitMaskKey` 无 Shape。现 GCI S3 的 AABB 骨架有 3 候选，所以此项不否定本次 GCI 的真实点击，但正式调查素材换成全 PNG 实形热点时会得到 0 候选并红。若 REQ-S3CLICK 承诺覆盖该形态，应从烘焙 mask 有效位选点且验证精确 Signal，不能用矩形中心替代。
- **覆盖边界：** 当前 GCI 仅证 1/3 候选具名 Signal；S3 最小“至少一条链打通”成立，其他物件、触控/键盘与可见调查反馈属 S4/S5 后续验收，不能从本次证据推断已完成。

告警已逐项读：测试绿无隐藏失败；沙箱 EPERM/Edge profile 是执行环境差异，重新实跑排除；全库 `tsc` 的既有红不在本次四文件定向测试内，不能声称全库绿。

流程板经合法 CLI `review game-clue-investigation S3 --verdict FAIL --by /root/s3click_independent_review` 落账，exit 0，返回 `verdict:FAIL`、`gameHash:b0f843fa52488b44`（仅代表落账成功，不是审查通过）；Owner 人门未动。

## 返修后独立复查（2026-10-13）

- 重新读最终 `scripts/click-probe.mjs`：DOM 探针在隔离页 import 同一个 Vite ESM `Engine`，只读旁听 `Engine.prototype.step` 内真实 `commandsForTick` 的 `phase:'action'`，逐次用点击控件的 `data-action` 精确比对；仅游戏源码存在 `new Engine({ input: … })` 或 `new Engine({ input })` 时要求此证。注释里的伪构造先剥除。页面本地说明/菜单变化单独不足以绿。
- 最终定向复跑：`npx vitest run scripts/click-probe.test.mjs src/net/host/queued-input.test.ts src/skills/tier2/clickable.test.ts src/launcher.liblaunch.test.tsx`，exit 0，**4 files / 41 tests**；`game-clue-investigation/s3-skeleton.test.ts` 另 **4/4**；真实 `manifest-check` exit 0，8 个实名 capability、`inferredCapabilities:false`、`warnings:[]`。
- 最新真实浏览器复跑：GCI exit 0，3 Canvas 候选 / 1 精确 `clickable/commit`；game211 exit 0，12 控件 / 9 因果 DOM 变化；game108 exit 0，8 控件 / **2 个同名动作经 `Engine.step`** / 6 因果 DOM 变化。GCI 的 `S3-render.png` 已目视，确为灰盒调查场景和“返回架上”按钮，非启动器。三探针均 0 console error。
- **再撤修验红**：同一 `games/game108/game108.ts:585` 唯一 `engine.start();\n    redraw();` 锚点（Count=1），临时停运行环后，最新探针 exit **1**，判词“6 个控件已点，但没有匹配的 data-action 经 commandsForTick 进入 Engine.step；本地说明/菜单变化不能冒充世界输入”。恢复后 SHA256 仍为 `F7808AF04534703C9FE13FD7772DA5933B7F5FB1B9DD446868E1E23F109BE0BC`，基线再跑 exit 0 / 8 控件 / 2 Engine 动作 / 6 DOM 变化。修复确实关闭首轮假绿反例。
- 流程板机器门最终由合法 CLI 复跑 exit 0，新鲜 `gameHash:56754c65a5efd2b6`；独立查看 `board`，S3 机器门显示 parse+load+2tick、真渲染与 Canvas 点击通过，S1/S2 游戏流程板人门仍待 Owner（路线图上的 Owner 已通过不等于 CLI 人门），未代签。S4 玩法/原型 1:1 及素材实形命中均未由 S3 骨架证明。

当前 S3 清单结论：manifest 为纯 JSON、无游戏层自由解释器；8 个显式能力与 plan 的 S3 骨架用量一致；实体有灰盒可见/可点用途，无“填了没人解释”的运行字段；真实装载、2 tick、定向测试、独立撤修和真浏览器输入门皆过。`requiresEngineInputEvidence` 是源码模式识别，并非对所有未来宿主构造写法的完整 AST 证明；当前 game108 显式模式已实测，未来若换封装需补对应点名用例。mask-only 的零候选为安全 fail-closed、不是假绿，但 S5 真 PNG 形态须另补有效位选点/验收，不可借本次 PASS 声称异形热点已目击。

最终按 `checklist` 后由合法 CLI `review game-clue-investigation S3 --verdict PASS --by /root/s3click_independent_review` 更新复查门，返回 exit 0、`gameHash:56754c65a5efd2b6`；重读 `board` 显示 S3 机器门 ✓、复查门 ✓ PASS、人门“待人审”。先前 FAIL 保留为历史，不被描述成从未发生。无头 Edge/Vite 已关闭，5700–5702 无监听。没有 Git 远端写入、整套 ZeroCraft 启动、远程数据库操作或人门代签。
