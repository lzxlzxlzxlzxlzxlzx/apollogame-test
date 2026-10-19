# OPT-CARD-REVEAL-LOAD-01 · 施工回执（送独立复查）

状态：**施工自验 PASS，待非施工人独立复查；不是 owner 或复查人签核。** 施工主体：卡牌动画程序，本聊天 `01a11f55-7618-7e22-926a-2e03e194369b`。记录日期：2026-10-13。owner 已于 2026-10-13 明确裁决 W3.8 的 A 路线。

## 已落盘范围

- W1：`loadGameArtInto` 新增可选 `onlyKeys`，仍先走原有 Index 解析/登记；省略时继续 `loadAll()`，指定时按传入顺序去重装载。通用测试覆盖旧行为、定向装载、重复、未知及单项失败。
- W2：唯一 `AssetManager` 在页面模块执行时开始四张关键本地图的预取，与 SDK `whenReady` 并行；正式局不加载 `pack.back`/preview，预览仅追加实际 N 张。
- W3：共享 `AssetManager.adoptLoaded(sourceKey,targetKey)` 同步转移已加载句柄所有权；非法状态 fail-closed，旧 target 在新 target 已可解析后单次关闭，source 不再可解析，旧 inflight 晚到不能覆盖且关闭句柄。卡牌 adapter 的 `CardArtCoordinator` 只做 `start/freeze/dispose`：稳定 key 的本地 fallback 可画后即启动 P2，远程 1–5 张并行作为候选；P3 首帧渲染前或 skip 同一调用栈先冻结，未完成的逐张保留 fallback，晚图不热替换；pagehide 后不复活。
- W4：Performance Timeline 增加 `boot`、`sdk-ready`、`local-critical-ready`、`card-art-frozen`、`engine-start` mark 与相应 boot-to-* measure；未记 URL/卡牌身份。调用说明已据实更新。manifest/package 同升 `0.1.1`；本仓 dist 已重建及校验，未外部复制/发布。

## W3.8 裁决与通用能力

原实查：`AssetManager.register()` 会清除同 key 旧 handle，`load()` 后续异步填充，因此直接换稳定 key 存在 undefined 窗；旧点名测试仍复现该事实。owner 选择 A 后新增通用 `adoptLoaded`，不让 source/target 同时持有同一句柄；target 旧 handle 的 `close()` 回调内即可重新 `resolve(target)`，证明同步调用全过程无空窗。对未加载、同 key、kind 不兼容、已清空、同一 handle 等输入返回 false 且不破坏 target。测试还覆盖同一句柄拒收、目标/来源旧 inflight 晚到和 clear 后不复活。

该 API 只在 render-only AssetManager 中工作，不接 World/snapshot/hash，不为本游戏硬编码；游戏蓝图仍只有稳定 `textureKey`，HTTPS URL 仍仅在资产描述符中。

冻结在 renderer `sync` 前的 adapter 守卫完成，因为 Engine 的普通订阅回调在渲染**后**才调用；仅依赖订阅回调会错过 P3 第一帧。skip 路径先同步冻结再入队原有 `reveal.skip`，不等待网络，也不修改轨迹/时序。

## 自验记录

| 命令/探针 | 真实结果 |
|---|---|
| `node node_modules/vitest/vitest.mjs run src/assets/asset-manager.test.ts src/assets/game-art-load.test.ts games/game-card-reveal` | PASS，62/62，6 文件；含共享采用、定向装载及游戏回归 |
| App `npm test` | PASS，68/68，7 文件；探针修正后复跑；含 N=1/3/5 乱序、局部失败/永久 pending、立即冻结、重复冻结、late success、dispose/pagehide |
| App `npm run typecheck` | PASS |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | PASS，本仓共享 API 全量类型检查 |
| App `npm run build` | PASS，本仓 dist 16 个签名文件、10 件美术；撤修恢复后再重建，确保新鲜 |
| App `npm run verify:dist` | PASS，17 个包文件、10 件美术、16 个 SHA；源码/manifest/文档/资产新鲜 |
| `node scripts/dokiworld-docs-guard.mjs game-card-reveal` | PASS |
| `node scripts/game-skill-audit.mjs game-card-reveal` | PASS，0 红/黄，RATCHET PASS |
| `node scripts/context-budget-guard.mjs` | PASS（施工回执与 requests 更新后复跑，预算内） |
| `node scripts/align-count.mjs --game game-card-reveal --stage S8` | PASS：既有 S8 对齐单 9✅、3⚠（均有裁决去向）、0❌；不冒称这是本优化的独立复查 |
| `node scripts/scoped-gate.mjs`（只读 plan） | 共享工作树现有约 371 处跨项目改动，`origin/claude/mainbranch` 本地基线缺失，计划误扩为全库；未在他人现场运行全量 `--run`，不宣称 full gate PASS |

浏览器只读探针：`node scripts/prepare-witness.mjs` PASS；`node tests/opt-load-preview-browser.mjs` 在最终 dist、隔离 Edge + 临时 `127.0.0.1:56585` 静态服务上 PASS。访问 `/apps/game-card-reveal/index.html?preview=1&cards=1`，截取 1440×900 的 [P2](OPT-CARD-REVEAL-LOAD-01-P2.png)、[P3](OPT-CARD-REVEAL-LOAD-01-P3.png)、[P5](OPT-CARD-REVEAL-LOAD-01-P5.png)；三帧肉眼未见空白卡或可见 chrome。实际图片请求为 Index、`pack.front`、`pack.tearTop`、`pack.tearBody`、`card.fallback`、`card.preview.0`，未请求 `pack.back` 或多余 preview。控制台 error / unhandled rejection 均为 0；浏览器与临时服务已关闭。首次 sandbox Edge 启动权限错误，获准后复跑通过。

正式宿主只读探针 `node tests/opt-load-formal-browser.mjs` PASS：使用已验证的当前 dist、vendored SDK 假宿主、受控 HTTPS 图片路由和临时 `127.0.0.1:53465` 静态服务。N3 两张远程图在 `engine-start` 时仍 pending，P2 照常启动；P3 首帧前 `card-art-frozen`，N3 natural 只提交一次；两张图在 P5 后才放行，前后 canvas 截图字节相等。N3 P2 内按 Space/Enter 得到唯一 `viewed/skipped`，未见空白卡；N5 `pagehide` 后两张未完成图放行，无 complete。正式模式请求清单只含 Index 与四张本地关键图，未含 `pack.back`/preview。控制台 error / pageerror 为 0，浏览器与服务已关闭。关键帧：[P2](OPT-CARD-REVEAL-LOAD-01-formal-P2.png)、[P3 首卡](OPT-CARD-REVEAL-LOAD-01-formal-P3.png)、[P5](OPT-CARD-REVEAL-LOAD-01-formal-P5.png)、[skip P5](OPT-CARD-REVEAL-LOAD-01-formal-skip-P5.png)。

正式假宿主最近一次 Performance Timeline（相对页面）：`boot=46ms`、`sdk-ready=60ms`、`local-critical-ready=84ms`、`engine-start=88ms`、`card-art-frozen=2104ms`。在两张远程图未返回的条件下，boot-to-engine-start 为 42ms，engine-start-to-freeze 为 2016ms；这是本地隔离探针实数，不是 DokiWorld 线上冷启动分布。最终 dist 的 preview 探针 boot-to-engine-start 为 29ms，也不是线上结论。

视觉自证：与既有 `self-check/shots/S6-P3-mid-overlap.jpg`、`S8-dist-fake-host-N3.jpg` 对照，P3 卡包/卡堆锚点与 P5 N3 排布未见结构或时序漂移；本探针的第一张青色纯色卡是受控 HTTPS fixture，另外两张为设计内 fallback，不代表正式卡面美术。背景颜色来自假宿主页面，App 舞台保持透明。preview 与正式截图均无可见游戏 chrome。

| # | 工单中玩家可见的承诺 | 结论 | 证据 / 说明 |
|---|---|---|---|
| 1 | P2 不等待最慢宿主图，卡包按原轨迹出现 | ✅ | 正式 P2 截图；两图 pending 时已有 `engine-start` |
| 2 | P3 第一张卡出现前逐槽锁定真图或 fallback | ✅ | 正式 P3 截图；`card-art-frozen` 早于截图，青色受控图与 fallback 同屏 |
| 3 | P5 排布、透明舞台与无 chrome 保持 | ✅ | 正式 P5 截图，对照既有 S8 N3 基线 |
| 4 | P2 跳过直达同一 P5 且无空卡/重复完成 | ✅ | `skip-P5` 截图；假宿主 `complete=1`、`viewed/skipped` |
| 5 | 冻结后晚图不热替换 | ✅ | P5 前后 canvas 截图字节相等；受控晚图放行后仍相同 |

本轮自证：第 1 轮完成慢图/跳过/pagehide 真浏览器走查，0 条未解释的可见偏差；这不是非施工人复查或重新签 S8 owner 人门。

撤修验红（有锚点命中）：`card-assets.ts:130` 的候选 `unregister` 暂时撤除后，`immediate freeze preserves drawable fallback` 确认转红（晚图在候选 key 复活）；恢复后 App 68/68 绿。`game-art-load.ts:64` 的 `onlyKeys` 分支暂换全量 `loadAll` 后，`onlyKeys 只加载指定 key` 确认转红（多载 `vendored-bg` 等）；恢复后共享/游戏点名测试 62/62 绿。最终源码下再次 build 与 verify:dist PASS；没有保留 sabotage 注释。

回执落盘后复跑 `dokiworld-docs-guard`、`game-skill-audit`、`context-budget-guard` 与 `verify:dist`，退出码均为 0。

## 独立复查退回项：正式浏览器探针新鲜度（2026-10-13）

复查人独立 build 后直接运行旧版 `opt-load-formal-browser.mjs`，遇到 canvas 30 秒超时；根因是探针默认读取可能过期的 `witness-static`，没有自行准备它。复查人手动运行 `prepare-witness.mjs` 后同一探针 PASS。这是**测试夹具缺陷**，不能把旧施工自验 PASS 当作可重复证据。

现已只修探针：启动前同步运行 `verify-dist.mjs`，失败即停止；HTTP 映射直接从当前 `dist/` 提供 `/apps/game-card-reveal/*`，固定的宿主 HTML 与 vendored SDK 从源路径提供，不再读取/重写 `witness-static`。探针从当前 `dist/index.html` 解析唯一 JS bundle，计算其 SHA-256，并对浏览器实际收到的 bundle URL、HTTP 200 与响应字节 SHA-256 作硬断言；不一致必失败。`node --check tests/opt-load-formal-browser.mjs`、`npm run verify:dist`、不预先运行 `prepare-witness` 的 `node tests/opt-load-formal-browser.mjs` 均退出 0；App `npm test` 68/68。实收 bundle 为 `assets/index-CrZ1PFOe.js`，浏览器响应、磁盘 `dist` 与 `SHA256SUMS.txt` 的 SHA-256 均为 `EE0974E7162CA64B62FD2F08C74FDAE3BE1FE0C315D7091866EC5D360C0C1FB5`。隔离浏览器/临时服务已关闭。游戏行为、合同与打包流程未改；状态仍是 review，等待复查人重跑。

## 已知警告与待复查

- 构建保留 Vite `>500 kB` chunk 警告；本单没有以重编码包装图来伪装首帧优化。
- 本机假宿主/受控慢图证明行为，不是 DokiWorld 真实网络的性能统计；真实宿主加载分布仍需 owner 侧观察。未压缩 PNG，不宣称总体包大小下降。
- 共享工作树有其他人的大量在途改动；未 stash、重置、推送、修改远程仓库或启动整套系统。独立复查必须由非施工人执行；本记录只有施工者自验，不可代签复查。
- 早期施工探针曾准备 `witness-static`，后来已还原自身差异；本次正式探针修复不读写该目录。复查人已在共享工作树里另行准备见证镜像，其当前在途变更归复查任务所有，本次未撤销或覆盖。
