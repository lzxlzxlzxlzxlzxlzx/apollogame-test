# GAL-UI-04B-2A 通用文件音频底座独立复查

- 复查主体：非施工 agent `/root/review_gal_audio_base`；日期：2026-10-12。
- 复查范围：`src/services/audio/web-audio.ts`、`web-audio.test.ts`，以及相邻 `audio-sync.test.ts` 的兼容性；不签 GAL 媒体协调器、声音设置页、`ui-settings-confirmations` 里程碑或全库门禁。
- 判词：**局部能力 PASS；领工时序与全库门禁 CONCERNS。**

## 独立核证

1. `web-audio.ts:48-66` 将每次 one-shot 克隆登记为在播实例，`stop(clipId)`（`:69-81`）会停止该 clip 的缓存基实例及全部克隆；`stopAll()`（`:83-85`）逐 clip 执行。`web-audio.test.ts:29-45` 点名验证同一语音两实例都停、不同 SFX 不被误停、全停最终停掉 SFX。自然 `ended` 与 `error` 或异步 `play()` 拒绝会释放登记；已自然结束的实例不再被重复暂停（测试 `:68-79`）。
2. `web-audio.ts:42-46,61-63,86-94` 保留循环声与每个 one-shot 的原始音量，主音量热更新按“原始音量 × 主音量”重算；输入主音量 2 被夹到 1。`web-audio.test.ts:47-66` 验 0.4/0.25 → 0.2/0.125 → 0 → 恢复原比例。同 clip 先循环后一次性时，`:61` 显式将克隆 `loop=false`；测试 `:81-88` 覆盖继承风险。
3. `web-audio.ts:17-23` 缺 URL、无 `Audio` 或浏览器构造器同步抛错时返回空端口行为；`web-audio.test.ts:68-79,90-96` 验 headless/SSR 与构造器异常不抛。首次审阅发现 `new Audio()` 在保护外，施工人据此补保护与点名回归；复跑以修补后的文件为准。此票没有声称所有媒体属性 setter/pause 异常都已验证。
4. 独立运行 `npx vitest run src/services/audio/web-audio.test.ts src/services/audio/audio-sync.test.ts`：退出码 **0，9/9**（前者 5、后者 4），没有 Vitest 警告。首次沙箱运行在 `node_modules/vitest/dist/spy.js` 的 `realpath` 因 `EPERM` 退出，**0 条测试执行**，未算作绿灯；受控短生命周期重跑后才采信 9/9。未启动应用服务、未碰数据库。
5. 隔离副本撤修验红两次，均先验证唯一锚点、仅改副本：把 `clone.loop = false;` 改 `true`，对应测试准确 **1/4 红**（`web-audio.test.ts:85`）；把构造器 `catch { return null; }` 改为抛错，新增同步异常测试准确 **1/5 红**（`:93`）。两个副本运行退出码均 **1**、输出无额外告警；副本随后核对路径并清理，原件未被破坏。

## 范围与流程缺陷

- `docs/design/galgame/requests.md:7-12` 已据实记载：施工者先在聊天声明范围，正式工单与本地施工主体登记**晚于首次编辑**。这违反“开工第一动作登记”的时序，不能追认成事先抢锁；本次单人 GAL 特例只免 Git 推送锁，不免本地登记。故流程记 **CONCERNS**，并不以功能测试抹去。
- Owner 禁令禁止任何 Git/GitHub 命令，因此不能执行手册所述 `git diff --stat` 范围审计；仅按本票声明的两个音频文件、工单和所见副本签局部语义。未运行全库 `tsc`、vitest、build 或浏览器音频真机/试听；不能据此开放 GAL 声音页。`AudioSync` 的同 clip 属性热更新仍是其自身注释中的后续项，不在本票修复范围。
