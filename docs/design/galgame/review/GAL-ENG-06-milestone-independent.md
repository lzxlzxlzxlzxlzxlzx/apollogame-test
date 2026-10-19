# `replay-save-preview-auto` 里程碑独立汇总复查（2026-10-12）

复查主体：非施工者 `/root/review_gal_06l`。整体判词：**功能范围 PASS，可提交项目控制台 `review` 等 Owner 人门；不等于 `done`、全库门禁通过或桌面发行完成。** 本单独立核查施工汇总 `GAL-ENG-06-milestone-self.md`，不能把施工者自评当证据；下列局部单由不同复查主体各自签署，且本次额外复跑跨项关键链。

## 六条控制台验收逐项核对

| # | 验收 | 独立判定与边界 |
|---|---|---|
| 1 | 回想结束后活动剧情与存档不变 | **PASS。** `GAL-ENG-06C.md` 已独立比对活动 World hash、Profile、槽与剧情 ref 的前/中/后值，覆盖完成/主动退出、回滚改选及焦点归还。本次再跑静态 Edge 回想真实手势，两分支、上滚、结局/主动退出后逐项相等，输出 PASS，退出码 0。 |
| 2 | 损坏/缺失缩略图不阻塞权威读档 | **PASS。** 06B 证明预览侧车非权威且读后复核权威 hash；06J/06L 在真实隔离 IndexedDB 中分别注入坏图片与不可用侧车，槽卡显示 `damaged`/`unavailable`、`canLoad=true`、权威 hash 不变，并点击真实读档成功。06L 本次独立 Edge 输出权威 hash `eaacc4d6`。 |
| 3 | auto/skip 与上滚、choice、已读政策冲突确定性裁决 | **PASS。** `GAL-ENG-06A.md` 的非施工者局部签署覆盖 fake-clock 单待任务、read-only 未读停下、all 跨未读、choice/check/ending 拒绝、失焦/遮挡/读档/回滚取消及同输入 World hash。06C 签私有回想路由。本次 89/89 定向测试包含 scheduler 7/7、host 25/25、Director 30/30；静态 Edge 真实点击 Auto 到可见 choice 停止，再真滚轮上滚回 intro，退出码 0；06L 真实 IDB 宿主点击 Auto 从 intro 到 ending。没有把宿主墙钟写进 World。 |
| 4 | 正式 Web/桌面作品宿主显式注入预览采集/侧车并完成真图槽存读 | **引擎宿主层 PASS。** `src/services/gal-ui/gal-browser-game-host.ts` 是通用 Web/Electron **renderer** 装配入口：从包+初始数据建 World，显式注入 IndexedDB 权威槽/Profile/侧车、真图采集、时间/播放时钟，幂等卸载并释放自有连接；fixture 改为消费该正式入口，不再私搭宿主。06L 本次独立跨会话 Edge 真实 LayoutNode 槽 2 保存/读回 320×180 图、权威与预览 hash 同为 `eaacc4d6`，侧车撤修唯一锚点命中 1 后预览 `ready→no-preview` 且权威 hash 仍在。**Electron 安装包、离线闭包、桌面路径与真机退出不在本引擎宿主验收，归 `web-desktop-release`；本单不声称它们完成。** 新作品仍须经 S1/S1-P/S2，不能将测试 demo 内容视为首作。 |
| 5 | 隔离本地真实/跨会话 IDB、坏图与无存储降级及独立复查 | **PASS，按已裁定的“无存储”=非权威预览侧车不可用。** 06I 独立证真实侧车 IDB 跨会话/坏 JSON/删除；06J 与本次 06L 独立证三端口隔离本地 IDB、跨浏览器会话 Profile/权威/真图、坏图、侧车不可用仍权威读档。测试 origin 的请求只本地 fulfill 或 abort，浏览器和临时 profile/构建清理。**整个 IndexedDB 完全不可用时权威存档/Profile 的产品策略未测也未承诺；不能把非权威侧车降级泛化成全部存储失效仍可存档。** |
| 6 | 单窗口与非权威预览弱保证 Owner 裁决 | **PASS。** `docs/design/galgame/requests.md` 的 06K 记载 Owner 2026-10-12 选 B：单活动写入者；意外多窗口不保证权威冲突解决、跨进程原子定序或实时缩略图刷新。预览只对当前可见权威 hash 验证，不匹配则降级；06G 的同 JS 进程序列不能被冒称跨进程保证。 |

## 本次独立执行及对抗性证明

- `npx vitest run src/services/gal-ui/gal-ui-slice-host.test.ts src/services/gal-ui/gal-playback-scheduler.test.ts src/services/gal-save/gal-save-preview.test.ts src/services/gal-save/gal-browser-preview-capture.test.ts src/skills/tier3/narrative-director.test.ts`：**5 文件、89/89 PASS，退出码 0**。标准输出有 `[GAL-ENG-02B] 512-entry history bytes=721111`，为测试度量，不是警告或错误；无 unhandled error。06L 另独立跑 `gal-world.test.ts` 等 4 文件 **60/60 PASS**。
- `node src/services/gal-ui/verify-gal-live-playback.mjs`：静态 `file:`、隔离短命 Edge，真实点击 Auto→choice 停止→滚轮回滚，**PASS/退出 0**。`node src/services/gal-ui/verify-gal-live-replay.mjs --transient-shots`：静态 `file:`、临时截图，画廊/锁态/两分支/滚轮/完成与主动退出、活动态与存档不变，**PASS/退出 0**。两者都不启动服务，`finally` 关闭 Edge 并移除临时构建/截图。
- 06L 的正式宿主静态 HTTPS 本地 route 审计重新打开隔离 Edge 会话，Profile `exitGame=false` 持久化、槽 2 的权威/侧车 `eaacc4d6`、320×180 图跨会话读回，坏图与侧车不可用均可权威读档，Auto 到 ending，**PASS/退出 0**。唯一锚点的临时 esbuild 变异撤去 `previewCapture`，真浏览器产生 `no-preview` 而权威 hash 不变，证明断言非空转。此前 06A/06B/06C/06D/06E/06F/06G/06H/06I/06J 的各自独立复查文档均按自己的范围记录了撤修验红与告警；不能以本次汇总取代它们。
- 本次所有浏览器访问均为本地静态文件或 `.audit.invalid` 假源的本地 fulfill；无应用服务、远程数据库、Owner 日常 profile 或真实业务存档。隔离 profile、浏览器和临时构建已关闭并清理。普通沙箱的 Vitest `realpath EPERM` 与 Edge `3221225477` 启动失败不算产品测试结果；相同源码在允许本地隔离运行的环境重跑后才计 PASS。

## 告警、非验收范围与控制台建议

本次独立 `npx tsc --noEmit --pretty false` **退出码 1，14 条诊断**：`games/game-card-reveal/s4-flow.test.ts` 2、`games/game-dice/dice-window.test.ts` 2、`games/game-dice/dice-window.ts` 3、`games/game-theft/ui.ts` 6、`src/launcher/game-runner.tsx` 1；没有 GAL 文件诊断。故**全库三绿/可推送不能宣称**，受 Owner Git 禁令也未运行含 Git 步骤的 `scoped-gate --run`。这是一项真实的仓库级门禁 CONCERNS，不应藏进功能 PASS。V2 S5/S6 视觉演出、设置页剩项、首作 S1–S8 和 Electron 桌面发行分别由其他里程碑管理；若把它们重新解释为本引擎项验收，当前结论必须改为 CONCERNS，不得跨项假绿。

据现有控制台六条**按上述明确范围**，独立复查支持把本里程碑从 `active` 提交到 `review`，`selfCheck/review` 可据实标 pass；`owner` 必须保持 required，由 Owner 本人在控制台批准或退回。不得由 agent 提交 `done` 或代行 Owner 决定。
