# GAL-ENG-06C 独立复查

> 2026-10-11；施工主体 Codex/root，复查主体 Codex/review_gal_06c。Owner 已选 C5b 的 A，且仅豁免本项目“先 Git 推送抢锁”的顺序；本复查未执行任何 Git/GitHub、数据库、真实业务持久化写入或应用服务启动，也未改施工实现文件或项目控制台。

## 结论

**GAL-ENG-06C 局部 PASS。** 仅放行通用隔离回想会话、GAL 宿主路由与只读 LayoutNode 入口。它不是完整 GAL、真实媒体/截图采集、真实持久化、S5/S6 视觉 1:1、全库门禁通过或路线图 `replay-save-preview-auto` done。

## 独立实证

1. `npx vitest run src/services/gal-ui src/services/gal-save src/services/gal-profile src/skills/tier3/narrative-director.test.ts --maxWorkers=1 --minWorkers=1`：10 文件 **123/123**，退出 0；最终改动后的 `gal-ui-slice-host.test.ts` 单独 **23/23**，退出 0。点名比较活动 World hash、手动槽、Profile 前/中/后不变；验证两分支、回滚、完成/主动退出、缺资源异常及焦点回原按钮、坏/锁定/跨包入口、重复开启、挂起活动 flush 的并发双开、旧活动已读 token、私有 outbox ACK。`gal-replay-session.ts:21` 只从当前包解锁入口建新 World，`gal-replay-session.ts:75` 的 ACK 只投私有 InputQueue；会话不持 SavePort、Profile 桥或活动 World 引用。`gal-ui-slice-host.ts:310` 路由选择与回滚只进私有会话，`gal-ui-slice-host.ts:351` 共用退出路径恢复画廊状态及焦点。
2. 独立实证发现初版 `gal-ui-slice-host.ts` 在等待未决 `activeFlush` 后没有重查双开；两条并发 `play-memory` 可相继覆盖 session/return。施工者在 `gal-ui-slice-host.ts:250` 等待后补 `replay` 与页面/页签再验，并增加延迟 Profile 端口并发测试；复查者重跑 **23/23** 确认。异常路径随后补真实 attach、入口焦点及返回焦点断言，复跑仍绿。
3. **带唯一锚点的隔离撤修验红：** 用一次性 Vite transform 配置，只在测试加载时修改模块，不触共享实现；两次均输出 `ANCHOR_HITS=1`。撤掉 `gal-ui-slice-host.ts` 的私有 `replay.step` 路由后，前/中/后隔离用例由绿转红（期望私有 `yes`，实际仍 `intro`）。撤掉 `gal-replay-session.ts` 的私有里程碑 ACK 后，私有 outbox 测试由绿转红，实际留下 `reach-node` 待确认事件。两次临时配置均已删除；源文件未撤改。
4. `node src/services/gal-ui/verify-gal-live-replay.mjs --transient-shots`：本地 `file:` 静态构建，**1440×900** 真浏览器手势经过画廊点入、锁态无重播键、两分支、滚轮回滚、结局及主动退出、焦点返回；活动 hash/Profile/槽/ref 前后逐项一致，退出 0。截图仅写任务临时目录；脚本 `finally` 关闭浏览器并清理临时目录，未启动应用服务。
5. 独立复跑 `tools/ui-audit.mjs`：`gal-ui-replay.audit.ts` 与 `gal-ui-memories.audit.ts` 各在 **1440×900** 退出 0；重叠、硬低对比、3–4.5 对比警告及 border-image 阻断均 0。两页各有“华丽件偏少/未识别 house 主题”的**非阻断**提示；本票不据此签正式视觉完成。既有 03A 滚轮用例一次间歇失败（首次 21/22，立即复跑 22/22，随后全域 123/123），需保留为共享测试稳定性告警，不能掩盖。
6. 独立 `npx tsc --noEmit --pretty false` 退出 **1**；诊断只在 `games/game-card-reveal`、`games/game-dice`、`games/game-theft`、`src/launcher/game-runner.tsx`，无 06C 文件诊断。`scoped-gate.mjs --run` 涉受禁 Git 步骤而未运行，故绝不宣称全库门禁绿。

## 合同边界

- 合法换包需先释放旧 `GalSliceHost`、再建新宿主；`attach` 的释放回调调用 `exitReplay`（`gal-ui-slice-host.ts:117`），直接用异包 World 开会话由 `gal-replay-session.ts:21` 拒绝。外部在旧宿主存活时强行 `World.restore` 为异包会破坏宿主构造期 readonly `pkg`/活动投影不变量，不属于本票承诺的换包路径，不能假称仍可恢复旧页面和旧剧情位置。
- 仅有真实静态浏览器手势与内存端口证据；正式资源接入、真实存储适配、长期稳定性及原型视觉 1:1 均需后续独立门，不得由本 Review 代签。
