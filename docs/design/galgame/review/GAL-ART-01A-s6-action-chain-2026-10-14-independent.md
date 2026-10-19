# GAL-ART-01A · S6 真实宿主操作链独立复查（2026-10-14）

## 判词

**指定动作链局部 PASS；完整 S5/S6 仍 CONCERNS。** 复查人独立跑真实 `GalSliceHost` 静态浏览器链，唯一锚点隔离撤修后使回想态出现禁用的保存入口、原断言转红，再恢复原构建转绿。本结论不证明 V2 有图终态、所有按钮四态/逐帧时序、正式素材或 Owner 人门。

## 开工预检与独立复跑

- 完整阅读本会话的 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`game-production.md`、`game-requests.md`、UI/测试/自证/复查手册与 UI 技能；本票追加 `docs/playbooks/save-platform.md`、`module-save`。判断：接受范围限定的功能复查，不代签阶段。
- 审阅 `src/services/gal-ui/verify-gal-s6-action-chain-live.mjs`：Vite 只构建现有 `gal-ui-live-wheel.audit.ts` 到 `os.tmpdir()` 经校验的任务目录；`file://` + 短时 Edge；夹具用 `MemorySavePort`、`MemoryStoragePort`，无 Owner 浏览器 profile、远程数据库或 5173 主服务；`finally` 关闭浏览器并删除临时目录。`--transient-shots` 不覆盖施工截图。
- 命令 `node src/services/gal-ui/verify-gal-s6-action-chain-live.mjs --transient-shots`：默认沙箱 Vite `commonjs--resolver` 对 `memory-save-port.ts` 的 `realpath` 报 **EPERM**、exit 1，未进入浏览器。这与同一会话上一条 S6 探针的沙箱环境限制一致，不当成实现失败。
- 对同一预检命令作受控非沙箱复跑：**exit 0**（约 3.28 秒），输出 `GAL S6 real action chain PASS: start, choice, empty-load rejection, save, rollback/rechoice, load, isolated replay/exit, restart and advance.`。没有额外 stderr；脚本末尾的 `errors=[]` 断言覆盖浏览器 `pageerror=0`。撤修试验后又按原命令复跑一次，**exit 0**（约 3.31 秒），输出一致。两次均由 `finally` 关闭浏览器、清理临时构建。

## 行为核证与八帧边界

真浏览器脚本依次断言：首页开局到两选项；空 2 号读取槽提交键禁用且槽未填；选 yes 后保存 2 号槽；滚轮回退并选 no，再读取回 yes 的 StoryRef；画廊回想中无 `gal-story-save`，退出后活动 World hash 与 Profile 已读集合保持；重新开局回 intro，2 号槽仍在且可继续到选项。该链使用真实挂载宿主和内存端口，而非只测纯函数。

施工留下的八张 `docs/design/galgame/self-check/shots/GAL-ART-01A-s6-01-start.png` 至 `08-restarted.png` 均可读，文件长度分别为 **58196、68901、104617、106854、59343、59187、58509、58196** 字节。本次 `--transient-shots` 不再写图；这些结构夹具帧仅说明施工曾留八帧，不是本次独立 V2 视觉比对或素材审批。

## 唯一锚点撤修验红与告警

选择 `src/services/gal-ui/gal-ui-structure.ts` 的 `...(state.replayMemoryId ? [button('gal-replay-exit'` 作为唯一锚点。源码中该片段恰好 **1** 处，Vite `enforce:'pre'` 仅对该模块作临时内存 transform，将回想工具栏条件变为 `false`；transform 命中 **1**，共享源码未改。真实浏览器解锁 `memory-1` 后进入回想，`replayMemoryId='memory-1'` 且 `#gal-story-save` 实测 **1** 个，而原探针断言要求 **0** 个，故该行为断言确定转红；变体 `pageerror=0`。回到原始探针后如上重新转绿。临时浏览器/构建已清理。

读取告警：正常非沙箱两轮无额外 stderr、`pageerror` 断言为空；沙箱构建 EPERM 单列为环境限制。没有对全量按钮状态、真正桌面退出、最终 CG/立绘、正式存储后端或完整 S5/S6 作推断；项目路线图与 Owner 门未由复查人改动。
