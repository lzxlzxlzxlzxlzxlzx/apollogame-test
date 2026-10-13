# GAL-ENG-05A 非施工者独立复查

> 2026-10-10；复查人 Codex/review_gal_04a，施工人 Codex/root。**局部判词：PASS；全库类型门：CONCERNS。** 本判词仅覆盖 Profile V2、六类确认政策及本票最小 GAL 宿主接线，不代表设置四页、桌面退出能力、S5/S6 或全库门禁完成。未执行 Git/GitHub、数据库修改或应用服务启动。

## 独立复跑与告警

- `npx vitest run src/services/gal-profile src/services/gal-ui src/services/gal-save src/skills/tier3/narrative-director.test.ts`：8 文件 **90/90**，退出 0。Profile 迁移/保存、六政策、档案桥、GAL UI 宿主、手动槽与 Director 均在场。Director 512 步历史测试输出约 72 万字节的既有快照日志，不是失败或被忽略的 stderr 告警。
- 清理隔离副本后独立跑 `npx vitest run src/ui/components`：64 文件 **502/502**，退出 0。清理前副本被 Vitest glob 一并收集而出现 1004/1004，**未**将其冒充有效 502 项基线；已重跑共享源码单份。
- 在任务级隔离副本中运行 `node src/services/gal-ui/verify-gal-live-wheel.mjs` 与 `node src/services/gal-ui/verify-gal-live-gallery.mjs`，均退出 0；静态 1440×900 真浏览器分别覆盖开始/阅读/滚轮改选/槽 2 存读/Profile 保持，以及历史滚轮隔离/锁定 CG/刷新/第 2 页放大返回/剧情续读。脚本只构建并读取静态文件，浏览器在 `finally` 关闭、临时构建清理；产出截图只写入隔离副本，不覆盖共享 Review 证据。
- Edge 短生命周期 `tools/ui-audit.mjs`：深色完整故事屏返回标题 Modal 与亮色**隔离** Modal，均 1440×900，退出 0、重叠 0、硬低对比 0、边框图片破损 0。深色报告的 house/flair 是启发式提示，GAL 宿主实际 `mount.update(..., apolloOnyx)`；亮色隔离 Modal 不等于亮色完整 home/story 背景通过。施工者此前观察两页旧背景文字各 3 处硬低对比，本复查没有把它归咎于 05A 弹窗，也不把隔离绿灯外推成全页绿灯。审计临时浏览器已关闭。
- `npx tsc --noEmit --pretty false` 退出 **1**。诊断仅在 `games/game-card-reveal/s4-flow.test.ts`、`games/game-dice/dice-window.test.ts`、`games/game-dice/dice-window.ts`、`games/game-simlife/art-consumption.test.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`；无 GAL/05A 文件诊断。相对旧 Review 的非 GAL 错误集合已有新增，不能称“全库既有基线全无变化”或整体门禁绿。

## 带唯一锚点的隔离撤修验红

- 在仓库内任务级 `.review-05a-probe` 副本中，原版 `npx vitest run src/services/gal-profile/gal-profile.test.ts` **11/11**，退出 0。`rg -n -F` 断言 `preferences: { ...normalizePreferencesV1(legacy.preferences, pkg), confirmations: defaultGalConfirmations() }` 在副本 `gal-profile.ts` **恰命中 1** 处（第 141 行）。
- 仅用 `apply_patch` 将副本 V1 迁移的 `exitGame` 默认改为 `false`；定向 `-t "migrates a real V1 envelope only in memory"` 退出 **1**，1 失败/10 跳过，断言预期 `exitGame: true`、实得 `false`（`gal-profile.test.ts:132`）。证明 V1 迁移默认测试能验出合同破坏，非未命中伪红。
- 核对 `.review-05a-probe` 解析绝对路径恰为工作区内本任务目录，`node_modules` 为普通目录而非 junction；安全递归清理后 `Test-Path` **False**。共享源码未撤修。

## 实证对抗与边界

- `gal-profile.ts:88-141,220-246` 的 V1 迁移经 SavePort 信封 checksum/gameId 后，严格验版本、package、可见已读节点、解锁引用与偏好形状；仅在内存补六个 true。测试实证合法 V1 旧字段逐项保持、读不写、显式保存才写 V2；坏 checksum、归属、引用、locale、形状拒；V2 确认缺键/多键/非布尔、V0/未来版拒。六项逐键切换互不串扰、同值幂等，两个并发偏好写入串行且不丢另一开关，SavePort 写失败向调用者抛出。
- `gal-confirmation-policy.ts:13-22` 将空槽/有槽、可读槽、有进度条件与各独立开关闭合于单处纯函数。`gal-ui-slice-host.ts:89-157` 的新游戏、返回标题、存档/读档接同一政策；测试实证关提示仍守空槽不可读取、合法槽仍执行、存储失败不假报成功。确认取消清掉 pending 且不执行；本票不提供浏览器伪退出动作，`exitGame` 暂只有政策位，桌面退出留后继宿主票。
- 本票没有实现四页设置 UI，也未同步项目控制台 `ui-settings-confirmations` planned 项；它们属于后继单/owner 决策面，不包含在局部 PASS。亮色完整 home/story 旧背景低对比与全库非 GAL 类型红项为明确 **CONCERNS**，不得据此宣称完整 UI 或全库验收通过。
