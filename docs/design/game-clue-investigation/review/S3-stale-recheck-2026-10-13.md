# S3 stale 独立复查 · 2026-10-13

复查人：`/root/s2_stale_recheck`（非 S3 施工者）。结论：**PASS（仅 S3 骨架与输入打穿）**；不代表 S4 完整玩法、alpha PNG 实形或 S5/S6 视觉完成，也不代 Owner 人门。

已独立做的非破坏性核证：

- `node scripts/game-pipeline.mjs checklist game-clue-investigation S3` exit 0，清单含范围/纯 JSON/参考样例/plan 一致性/真门/死数据。
- `npx vitest run games/game-clue-investigation/s3-skeleton.test.ts --reporter=verbose` 在受控本地执行环境 exit 0，**1 file / 4 tests PASS**；覆盖 parse 警告零、真实 load+2 tick、七对象/1440×900 与双实例确定性。
- 当前 `manifest.json` 的独立 `manifest-check` exit 0，`warnings:[]`、11 个显式 capability（S4 已追加 UI/玩法）且未推断。
- 唯一锚点撤修：只在 stdin 内存副本里精确断言 `"current": "scene-idle"` 命中 **1**。改成数值 `7` 后 `manifest-check` exit **1**，报 `GameFlow.current 应为 string，实为 number`；共享磁盘文件从未修改。另试改成不存在的字符串时，工具退出 **0** 但 stderr 与输出均有“引用了不存在的流程状态” warning；这是 `scripts/manifest-check.mjs` 明定的“告警不阻断”语义，故不能只凭退出码声称引用零告警，必须检查 `warnings:[]`（当前基线满足）。
- 初轮 `node scripts/game-pipeline.mjs gate game-clue-investigation S3` 独立重试 exit **1**，调用栈为 `scripts/game-pipeline.mjs:938` 的 `writeFileSync(public/games/game-clue-investigation/pipeline.json)` 报 `UNKNOWN: unknown error, open`；未手改 pipeline。之后根会话经共享 CLI 修复用合法 gate 重跑 exit **0**，板上新鲜 `gameHash=a96dcb6bf2a87bb7`，摘要为 load+2tick、真渲染与 Canvas 7 候选/1 Signal。

## 机器门刷新后的独立复跑

- `node scripts/render-probe.mjs --game game-clue-investigation`：exit **0**、`gameMounted=true`、variance **174.72**、console/page error **0**，输出 gameHash `a96dcb6bf2a87bb7`。目视 `public/games/game-clue-investigation/probe/S3-render.png` 确为灰盒调查现场、7 个世界占位物和 HUD，不是启动器假绿。
- `node scripts/click-probe.mjs --game game-clue-investigation` 连续两次在真浏览器执行后写 `S3-click-gate.json` 报 Windows `UNKNOWN(open)`，均 exit **1**，故没有冒称此命令独立通过。为避开该共享结果文件，复查目录内建立只读证据脚本 `s3-click-readonly-probe.mjs`：复用同一 `cartProbeFixture/canvasClickTargets/interpretCanvasClickProbe`，隔离无头 Edge 真点 Canvas 并只打印结果。补全 Windows PID 与 pipe 清理后复跑 exit **0**：7 个候选，点击 `object-clock`，trace 精确命中 `investigate.clock`，console/page error **0**。访问 `http://localhost:5733/?game=lib:game-clue-investigation&s3Probe=1`，关闭浏览器后 5733 无监听。第一次只读探针已打印相同 PASS 但子进程未退出，已结束；不计其退出码。
- `git diff --stat` 显示共享树多个并行游戏和引擎施工面，不把全树差异归因于 S3。当前 manifest 是纯 JSON，11 个声明能力随 S4 扩展；组件统计 `Transform/Shape/Color` 各 8、`Clickable` 7、`Resource` 3、`Flag` 19、`Effect` 30、`KeyBinding` 17、`GameFlow/EventWhen` 各 1。S3 灰盒热点和 UI 投影均有消费，不见游戏层自由 system。`rg` 搜 `investigate.lock|required-collected|broken-latch` 未在其它游戏样例发现同名玩法表；原型与本游戏验收文件是这些词的来源。`S3` 自检只点名 manifest/meta/test，未记读取哪些最小样例；这是施工记录不足，但没有实证显示复制其它玩法。

## 判词边界

清单所需纯数据、plan 的声明式能力边界、真装载、真渲染和至少一条真实 Canvas→InputQueue→具名 Signal 链均独立核证。未发现会使当前 S3 骨架失效的偏差，故 PASS；`manifest-check` 对断链只警告不阻断的已知语义必须继续逐次读取 `warnings`，本轮原始 manifest 为 `[]`。后续素材 mask-only 热点、全 7 对象可操作、触控/键盘及完整完成/重开属于 S4/S5/S6 各自门，不能从本判词外推。
