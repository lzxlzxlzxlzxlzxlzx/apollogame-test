# GAL-ENG-06A 施工自证与独立复查导航

> 2026-10-11；施工主体 Codex/root。本单仅讨论 C2b 通用宿主调度，不签完整 GAL、全库门禁或项目控制台 done。Owner 已选择 A 并豁免本项目“先推送抢锁记录”的顺序；Git/GitHub 全禁、持久化数据与服务启动禁令仍有效。独立复查人必须另签。

## 范围和实现锚点

- `src/services/gal-ui/gal-playback-scheduler.ts`：宿主注入时钟/取消函数，auto/skip/off 模式、单待触发任务、ref + epoch 双校验；choice/check/ending、未读和不可见态拒绝。异常或同步触发的时钟闭合失败。时钟不进入 World。
- `src/services/gal-ui/gal-ui-slice-host.ts`：可选宿主时钟接线；可见且读完的台词才排 auto，skip 依当前作品 Profile 的 `read-only|all` 策略；失焦、遮挡、滚轮/手动动作、读档入口、换页及卸载取消。唯一推进出口为具名 `NARRATIVE_ADVANCE` → `InputQueue`，忙时可观察反馈。
- `src/services/gal-profile/gal-profile.ts`：沿现有逐包串行 lane 写 `autoDelayMs` / `skipMode`，不覆盖并发里程碑；仅内存端口受测。
- `src/services/gal-ui/gal-ui-structure.ts`、`gal-ui-settings.ts`：LayoutNode Auto/Skip 与两项已接线设置；无时钟端口时禁用，不假装已接入。其他文字/音频/显示习惯仍禁用。未改 PUI 控件基座。
- `src/services/gal-ui/gal-ui-live-wheel.audit.ts`、`verify-gal-live-playback.mjs`：本地静态构建短生命周期隔离浏览器，真点击 Auto → choice 停止 → 上滚回滚；无应用服务，浏览器和临时文件在 finally 中关闭/清理。

## 施工者实测（非独立复查）

- `npx vitest run src/services/gal-ui src/services/gal-profile src/skills/tier3/narrative-director.test.ts --pool=forks --maxWorkers=1 --minWorkers=1`：末轮 8 文件、**97/97**，退出 0。含 fake-clock auto/skip 已读/未读、换包、异常时钟、取消迟到/ABA、真实槽读取后的旧任务拒绝、同输入 World hash、回滚改选、modal/失焦、设置持久化与 LayoutNode 校验。
- `npx vitest run src/ui/components --pool=forks --maxWorkers=1 --minWorkers=1`：65 文件、506/506，退出 0（该次在最后三个补充用例前；实现未触及 `src/ui/**`）。
- 改动 TS 文件 ESLint 退出 0；GAL 定向 depcruise：236 模块、1019 依赖、违规 0；`node scripts/docs-ref-guard.mjs` 通过（文档落盘后再复跑）。
- `node src/services/gal-ui/verify-gal-live-playback.mjs`：静态浏览器手势 PASS，退出 0；浏览器已关闭，任务临时目录已清理。`ui-audit` 故事、设置文字深/浅 1440×900 均退出 0，重叠 0、硬对比失败 0、border-image 前提 0。首次**并行**审计曾报浅主题 warning 0；发现审计工具共用临时构建目录后改为**顺序复跑**，浅主题稳定报 `gal-settings-title` 对比度 3.57、warning 1（36px 大字达到 3:1，非阻断），深主题与故事 warning 0。故事和深主题的华丽度提示偏少、house 检测为否，是既有结构切片的非阻断视觉债，不能据此宣称 S5/S6 视觉 1:1。
- `npx tsc --noEmit --pretty false`：退出 **1**，15 条诊断均在其他游戏和 launcher 既有文件，本票文件 0。全库门禁不得称绿。`scoped-gate.mjs --run` 内部执行 Git，依 Owner 禁令未运行。未执行 Git/GitHub、数据库、真实持久化写入或启动服务。

## 非施工者复查必核

1. 独立复跑定向测试、Lint/依赖与浏览器验收；逐条读告警，不把退出 0 误称视觉完成。
2. 带唯一锚点的**隔离**撤修验红：内存副本去掉回调时的 epoch 或 ref 校验，先断言恰命中一处，再证明迟到任务测试转红；不得改共享实现文件或调用 Git。
3. 实证核对：已读和未读策略、choice/check/ending、重复操作、回滚改选、遮挡/失焦/读档/换包与坏时钟；一切怀疑先复现。确认 World hash 不随排期改变，Profile 只由现有持久化服务接线更新。
4. 只签 **GAL-ENG-06A 局部 PASS/CONCERNS/FAIL**。本票没有音频/显示设置、自由 DOM、视觉 1:1、原型重定稿或全库类型门裁决权。

## 非施工者独立复查签署（2026-10-11）

**结论：GAL-ENG-06A 局部 PASS。** 仅放行本票宿主自动播放/已读跳过调度，不代表全库门禁、项目里程碑、完整设置或 S5/S6 视觉完成。复查者未改实现、工单、数据库或项目控制台状态，未执行 Git/GitHub，也未启动应用服务。

1. **独立复跑：** 定向 scheduler + host 测试 25/25，GAL 聚合 8 文件 97/97，改动相关 TS ESLint，均退出 0。聚合测试只有既有的 `[GAL-ENG-02B] 512-entry history bytes=721111` 标准输出，未见测试告警。静态文件真浏览器验收独立重跑，点击 Auto 后到可见 choice 停止，再用真实滚轮上滚回 intro，退出 0；脚本 `finally` 关闭浏览器并清理任务临时目录。受限沙箱的 Vitest/Vite `realpath EPERM` 是环境限制，获准在沙箱外重跑后上述检查通过；并非测试断言失败。
2. **唯一锚点隔离撤修验红：** 只在内存中读取并转译 `gal-playback-scheduler.ts` 副本，不写共享文件；两个 epoch 守卫锚点分别断言恰命中一次。原实现的 ABA 迟到回调探针 PASS；同时撤掉 pending-task 与当前 epoch 两层守卫后，同一断言转 RED。仅撤一层仍被另一层挡住，表明双层校验形成有效冗余，未把假绿冒充撤修成功。
3. **实证复现：** 定向用例核对 auto 等待完整呈现、Profile 延迟与单待触发任务；read-only 在未读处停止，显式 all 才跨未读；choice/check/ending 拒绝；取消后的旧任务、同 ref ABA、换包、异常/同步时钟均拒绝。宿主用例覆盖遮挡、失焦、手动滚轮优先、回滚改选、真实槽读取旧任务拒绝、设置重开持久化，以及自动/手动同输入 World hash 一致；独立浏览器链另证手势接线。
4. **读告警：** 故事 1440×900 审计退出 0，重叠/硬对比/warning 均 0，但华丽度仅 2 且 house 检测为否，属于既有结构切片提示。设置文字亮主题审计退出 0，重叠和硬对比 0，`gal-settings-title` 对比度 3.57 报 1 条非阻断 warning；标题为 36px 大字，超过 3:1 阈值，仍不得称所有 warning 归零或视觉 1:1。未独立重跑全库 `tsc`、depcruise 与 UI 全套测试；施工者已把全库 15 条非本票类型诊断单列，故不签全库绿灯。
