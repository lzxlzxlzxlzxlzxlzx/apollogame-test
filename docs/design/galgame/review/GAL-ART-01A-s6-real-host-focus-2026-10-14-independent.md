# GAL-ART-01A · S6 真实宿主焦点/弹窗链独立复查（2026-10-14）

## 结论

**指定增量局部 PASS；完整 S5/S6 仍 CONCERNS**。默认沙箱内 Vite 构建两次遭遇 `realpath EPERM`；同一已预检短时探针获准非沙箱重跑，退出 0，说明该 EPERM 是沙箱环境阻断。真浏览器断言覆盖指定键盘/焦点/弹窗链；唯一锚点的隔离行为级撤修使焦点还原断言转红，恢复未改源码后重新转绿。本票不能外推为完整 S6、V2 美术或 Owner 人门。

## 边界与预检

- 复查人仅审阅并运行 `src/services/gal-ui/verify-gal-s6-host-focus-live.mjs`，未修改实施、路线图、原型、素材或既有报告。
- 脚本构建 `gal-ui-live-wheel.audit.ts` 到 `os.tmpdir()` 下经路径校验的 `gal-s6-host-focus-*` 目录，以 `file://` 打开；夹具使用 `MemorySavePort` 和 `MemoryStoragePort`，没有远程数据库、5173 服务或日常浏览器 profile。`finally` 关闭 Playwright 浏览器并清理临时构建。`--transient-shots` 不向仓库写截图。
- 夹具确为真实 `GalSliceHost` + Narrative Director World，脚本包含首页/剧情/设置/画廊 Enter 链、历史/确认/CG 的焦点、Tab/Esc、取消焦点还原、合成底层保存点击阻断及 `pageerror` 断言。以上是**代码预检**，不等于本次执行证明。

## 独立复跑与告警

命令：`node src/services/gal-ui/verify-gal-s6-host-focus-live.mjs --transient-shots`。两次均退出 **1**，耗时约 1.6–1.7 秒；Vite 报 `[commonjs--resolver] EPERM: operation not permitted, realpath .../src/services/save/memory-save-port.ts`，`Build failed in 283–288ms`。随后 `Get-Item`/`Get-Content` 可读取同一文件，独立 `node -e` 调用 `fs.realpathSync` 亦成功。该差异说明当前 Vite 进程路径解析或环境问题，不能据此断言代码行为失败，也不能宣称浏览器链通过。

随后同命令以 `exec_command` 的 `require_escalated` 模式重跑，**退出 0**（约 3.0 秒），输出 `GAL S6 real host PASS: keyboard Enter across home/story/settings/gallery, history/confirm/CG modal focus trap, Escape exits, confirmation accept and return.`；无其他 stderr 告警。该通过使脚本中的页面状态、焦点驻留、Tab/Shift+Tab、Esc、焦点还原、底层 action 拦截、`errors=[]` 断言得到本次执行。短时浏览器由 `finally` 关闭，临时构建清理；未启动服务、未写截图。默认沙箱的 EPERM 是环境阻断，不是代码缺陷证据。

独立撤修验红：先对 `src/ui/components/server.ts` 的唯一锚点 `if (target?.isConnected) target.focus();` 做源码命中数断言 **1**；Vite `enforce:'pre'` 插件只在临时构建的该模块内将此语句替换为空操作，transform 命中数也为 **1**，不改共享文件。以同一真实宿主夹具打开历史弹窗并按 Escape 后，浏览器 `document.activeElement.id` 实得空串，原探针要求 `gal-story-history`，故行为断言确实转红；该变体 `pageerror=0`，构建/浏览器/临时目录均正常清理。之前尝试分别撤掉 GAL dispatch 确认守卫、PUI 合成点击捕获守卫，底层点击仍被另一层守卫拦住，未形成有效红测；没有把这两次算作验红。最后不作任何源码更改，原始完整探针复跑 **exit 0**，输出同上 PASS，闭合红→绿。

截图因 `--transient-shots` 有意不落盘；已有施工截图只用作导航，不作本次独立视觉证据。

## 复查去向

指定增量的四步复查已闭合：独立运行、唯一锚点撤修验红、真浏览器焦点复现、读取构建/运行告警。`pageerror` 断言为 0，非沙箱正常探针无额外 stderr；默认沙箱 EPERM 已单列为环境限制。结构夹具仍不证明最终 V2 素材/构图，全屏按钮四态和完整宿主链也非本票范围。项目 `media-and-final-skin` 及 S5/S6 继续保持未收束；本报告不修改控制台状态或替代 Owner 审批。
