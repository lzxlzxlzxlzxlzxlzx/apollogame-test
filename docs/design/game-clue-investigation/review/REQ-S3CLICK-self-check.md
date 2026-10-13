# REQ-S3CLICK · 施工自检导航（非复查结论）

施工主体：Codex/root。Owner 2026-10-13 将本地施工锁转交本聊天；本单包括原有 DOM P0 返修与调查游戏 Canvas 卡带扩围。独立复查人须自行复跑，不能采信本文判词。

## 改动面

- `src/studio/cart-run-core.ts`：真实 Canvas `PointerInputSource` 经 `Engine.step` 注入；当前相机逆投影。仅 dev 且显式 `s3Probe` 暴露只读 `DebugTrace`，正常运行不挂诊断。
- `scripts/click-probe.mjs`：卡带读真实 library fixture，Playwright 真点 Canvas，以 `clickable/commit` 的实体与具名 action 匹配判绿。DOM 分支用双页同期反事实，优先可命中控件；点击失败与零变化分开，JSON 留逐点证据。对源码显式 `new Engine({ input })` 的宿主，在隔离浏览器中旁听同一 ESM Engine 的 `step/commandsForTick`，至少一个点击的 `data-action` 必须真实经该桥进入世界，不能只靠本地菜单/说明变化。
- `scripts/click-probe.test.mjs`：门读码与 Canvas 目标/断言测试。

## 已跑输出（2026-10-13）

- `node scripts/click-probe.mjs --game game-clue-investigation`：exit 0，3 候选、`object-cup → investigate.cup` 具名 signal 1 命中，console error 0。
- `node scripts/click-probe.mjs --game game211`：exit 0，12 控件、9 个可观测变化、console error 0；此旧式宿主无 `Engine({ input })`，仍按同期 DOM 变化验。
- `node scripts/click-probe.mjs --game game108`：exit 0，8 控件、6 个可观测变化、其中 2 个动作真经 `Engine.step`，console error 0。
- `npx vitest run scripts/click-probe.test.mjs scripts/render-probe.test.mjs games/game-clue-investigation/s3-skeleton.test.ts`：40/40。
- `npx eslint scripts/click-probe.mjs scripts/click-probe.test.mjs src/studio/cart-run-core.ts`：exit 0。
- `node scripts/docs-ref-guard.mjs`：PASS；`npx vite build`：PASS（已有大 chunk warning）。
- `node scripts/context-budget-guard.mjs`：FAIL，公共池本轮从 10/10 降为 9/10 且 23827/25000 字符；红项仅他人并发编辑的 `docs/design/game-simlife/requests.md` 46454/45111 字符、364/348 行棘轮，未改动该文件。
- `npx tsc --noEmit --pretty false`：exit 1，仅 `game-card-reveal`、`game-dice`、`game-theft`、`src/launcher/game-runner.tsx` 既有错误；未出现本单文件错误。不可冒称全绿。

## 撤修验红

`src/studio/cart-run-core.ts` 的 `pointer = new PointerInputSource('cart-pointer', canvas, {` 锚点唯一命中 1 次。暂时将包围它的 `if (canvas)` 改为 `if (canvas && false)` 后，真实点击门 exit 1、判词“DebugTrace 无对应 clickable/commit”；立即恢复后同命令 exit 0。需独立复查人另做自己的唯一锚点撤修和告警审阅。

非施工者第一轮进一步用 game108 的 `engine.start()` 唯一锚点撤修发现旧 DOM 判据假绿（本地说明/菜单仍变），因此第一轮判 FAIL 并合法落账 S3 FAIL；此轮施工补充了 `Engine.step` 权威输入断言，需重新独立复跑上述对抗撤修。不得以第一轮旧测试通过冒称已修。

## 已知边界

Canvas 当前只选未绑定 hitMask 的 Shape 中心。绑定真实不规则 PNG 的 mask-only 候选不拿矩形中心假验；其素材合法命中点选择应在后续素材接入时补完。S3 门只证至少一条具名输入信号入世界，不证完整搜证玩法；S4/S5 分别验规则与素材命中外观。DOM 门仍是可观测 UI 变化而非通用 World trace，不能把它当全部引擎规则证明。
