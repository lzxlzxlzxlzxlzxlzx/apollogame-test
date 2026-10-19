# GAL-UI-03A 独立复查

复查人：非施工者 Codex 子 agent；2026-10-10。范围仅为本票的 GAL 模板结构与宿主接线。未执行 Git/GitHub、数据库修改或应用服务启动。

## 判词

**局部 PASS（仅 GAL-UI-03A 的 S4 结构纵切片）。** Owner A 路线的 `GAL-PUI-03B` 已经非施工者局部 PASS；03A 改用 `Panel.wheel` 闭集动作映射后，复查人独立跑通真实浏览器中的开始→已读→滚轮推进→稳定 ID 分支→上滚改选→2 号槽保存/读取→Profile 不回退。五态结构校验、静态审计与关键帧均复验通过。此判词**不代表完整 V2 UI、S5/S6 视觉资产/演出或全库交付**；右侧场景/立绘/框皮仍为明示占位，历史、回想、设置等后续屏仍未实现。

全库 **CONCERNS**：`npx tsc --noEmit --pretty false` 退出 1，诊断仅在 `games/game-card-reveal`、`games/game-dice`、`games/game-simlife`、`games/game-theft`、`src/launcher`，未见 GAL 诊断；不称整体门禁绿。

## 先前两轮复查（历史证据）

1. **独立复跑。** 增量重跑 `npx vitest run` 点名 `gal-ui-slice-host`、`presentation-read-gate`、`gal-ui-read-model`、`narrative-profile-bridge`、`gal-manual-save` 共 5 文件、**39/39**，退出 0（原轮 38/38）。首次沙箱运行遇 `vitest/dist/spy.js` `realpath EPERM`、0 测试收集；随后仅对短生命周期无服务单测申请非沙箱运行，退出 0。`validateLayoutNode` 在正式结构测试中对主页、剧情、槽页、确认弹窗均为零 issue。
2. **带锚点隔离撤修验红。** 第一轮将 `gal-ui-structure.ts` 精确复制为同目录临时 probe 副本，仅把 `label('gal-home-title', model.title, 70)` 恢复为旧硬编码；不同标题 package 断言先 PASS，隔离撤修后转红（期望“另一部作品”，实际“月影书简”）。增量轮复制 `gal-ui-slice-host.ts` 与测试到隔离 probe，先断言共享源码含 **2** 个 `this.completeVisibleText();` 锚点，再只在副本撤掉 mount/update 两处调用并断言 **2** 处 sabotage 命中；真实挂载已读测试由绿转红（期望 intro 在 Profile 已读，实际 `[]`）。均未改共享施工源码；临时 probe 已按解析后的精确绝对路径核验并清理。
3. **实证对抗。** 增量轮再次在 `happy-dom` 挂载后，从 choice 派发冒泡 `WheelEvent('wheel', {deltaY:-1})`；期待退回 intro，实际仍为 choice（隔离 probe 1 failed/3 skipped，失败断言行 61）。正式测试仅直接 `await host.wheel(-1)`，未覆盖真实输入接线。新增真实 mount 测试已证明：挂载首页不误标已读，转剧情后同步 `Label` 实际出现并把 intro 写入 Profile；撤修验红进一步确认回调不可缺。动态 package 标题修复后隔离探针 PASS。
4. **读告警。** 增量 39/39 测试无 stderr 告警；全库 `tsc` 再跑仍退出 1，非 GAL 诊断如上，不误报为本票全绿。没有发现新的 GAL 类型诊断。

## S4 图证与未签项目

已目击 `review/gal-ui-03a-home.png`、`gal-ui-03a-story.png`、`gal-ui-03a-slots.png` 三张 1440×900 真实结构截图，并阅读 `gal-ui-03a-structure-diff.md` 三屏同画布对照与逐项去向。左侧标题/菜单、剧情层序和 4×3 槽位结构可见，占位明确；背景、立绘、框皮、后续屏仍列为资产/后续票债。此后新增五态审计入口、原始输出和关键帧，经下述独立增量复查已填上原先的审计图证欠项。后续完整 V2 的历史、回想、设置等仍按工单留在票外，不视为已完成。

## 非滚轮证据欠项增量复查（2026-10-10）

- **入口安全与独立复跑：** 先读 `src/services/gal-ui/verify-gal-slice-audit.mjs`、五态入口及 `tools/ui-audit.mjs`；确认只构建本地静态页并启动短生命周期 headless Edge，不启动应用服务/数据库。审计器会清理仓库内精确的 `.ui-audit-tmp`，执行前核验该路径不存在，执行后再次核验已清理。沙箱首次因 Vite `realpath gal-ui-structure.ts` EPERM 退出 1、五态均未执行；非沙箱重跑 `node src/services/gal-ui/verify-gal-slice-audit.mjs` 退出 **0**，Edge 随各态关闭。逐态 home/story/slots/load-empty/confirm 的重叠 0、硬对比失败 0、对比警告 0、border-image 前提失败 0；与 `review/gal-ui-03a-ui-audit.raw.txt` 原始输出一致。
- **布局卫生：** 临时独立测试直接对同一 `auditModel` 的 home/story/slots/load-empty/confirm 五态执行 `validateLayoutNode(buildGalSliceTree(...))`，**5/5、零 issue**；临时测试文件已按解析后的精确绝对路径核验并删除。4×3 槽网格、已选第 3 空槽但读取键禁用，与 `gal-ui-03a-load-empty.png` 对上。
- **透明/层序与关键帧：** 已逐张目击 `gal-ui-03a-home-hover.png`、`gal-ui-03a-home-pressed.png`、`gal-ui-03a-load-empty.png`、`gal-ui-03a-confirm.png`：主页主键有 hover/pressed 差异，后三个入口为禁用态；空槽读取键禁用；确认框约 800px 居中、非透明内容底和深遮罩覆盖背景。图片由静态 audit fixture 捕获，证明代表态可渲染，不等同真实玩家端到端主链或完整 V2 所有交互态。
- **告警裁决：** 五态均打印“华丽件命中偏少且未见 house 主题皮”的非阻断提醒；入口实际上向 `mountUI` 传 `apolloOnyx`，审计器此项只按可见皮/华丽件启发式计数。当前各屏 1–2 件，仍应在 S5 专职资产/皮肤阶段复核视觉华丽度；不能把退出 0 解读为视觉 1:1。没有新的阻断告警。

以上是 PUI-03B 施工前的历史判词；该滚轮阻断已在下述最终复查中关闭。

## 最终非施工者独立复查（2026-10-10）

1. **独立复跑。** 点名 `gal-ui-slice-host`、`presentation-read-gate`、`gal-ui-read-model`、`narrative-profile-bridge`、`gal-manual-save` 共 5 文件 **40/40**、退出 0；含新增真实挂载 `WheelEvent` 上下滚、回滚改选和首页不响应测试。复查人自己运行 `node src/services/gal-ui/verify-gal-live-wheel.mjs`，退出 **0**：短生命周期隔离 headless Edge 只访问本地静态构建，真实 DOM 点击/滚轮完成开始、已读、分支、改选、2 号槽保存与读取、Profile 已读保留；浏览器在 `finally` 关闭，临时构建被清除。再次独立运行 `node src/services/gal-ui/verify-gal-slice-audit.mjs`，五态 1440×900 均退出 0；每态重叠 0、硬对比 0、AA 警告 0、border-image 前提失败 0。独立临时测试对当前含 wheel wrapper 的 home/story/slots/load-empty/confirm 执行 `validateLayoutNode`，**5/5 零 issue**。
2. **带锚点隔离撤修验红。** 精确复制当前 `gal-ui-structure.ts`、`gal-ui-slice-host.ts` 和正式测试到同目录临时 probe，断言共享源码中唯一锚点 `wheel: { upAction: 'narrative.back', downAction: 'narrative.advance' }` 命中一次、probe 中撤除后不再存在，且独立 sabotage 标记恰一次。只在 probe host 中改为引用 probe 结构树。执行复制测试中的“routes mounted WheelEvent”用例后，原本正式 40/40 中的滚轮用例转红：期待 `['a','choice']`，实际仍 `['a','intro']`，1 failed/3 skipped、退出 1。未改共享施工源文件；三个 probe 与另一个五态 validate 临时测试均按解析后的精确绝对路径核验后删除。
3. **实证复现与图证。** 真浏览器脚本先等到 intro 已读，再用 `page.mouse.wheel` 推进到 choice，点稳定 option `yes`，上滚回 choice 后点 `no`，保存第 2 槽、再次上滚、读取第 2 槽并断言回到 `no`，最后核对 Profile 的 intro 已读不回退；复查人独立运行结果与 `gal-ui-03a-live-wheel.raw.txt` 一致。逐张目击 `gal-ui-03a-live-intro.png`、`live-choice.png`、`live-rechoice.png`、`live-saved-slot2.png`、`live-loaded-slot2.png`，显示已读、选项、改选结果、槽 2 有档及读档恢复；此前 home/story/slots、确认、hover/pressed、空槽禁读关键帧与定稿原型的逐条差异单仍成立。画面中的背景/立绘/框皮是明示占位，不冒充 S5/S6 视觉 1:1。
4. **读告警与范围。** 40/40 测试和 live wheel 脚本无 stderr 告警；五态 UI 审计仍报告“华丽件偏少/未见 house 主题皮”非阻断提醒，入口实传 `apolloOnyx`，正式皮图仍在 S5 债内。`npx tsc --noEmit --pretty false` 独立再跑退出 **1**，诊断仅涉及 `game-card-reveal`、`game-dice`、`game-simlife`、`game-theft`、`src/launcher`，未见 GAL 错误。故整体仍为 **CONCERNS**，不能称全库门禁绿。

本次脚本没有启动应用服务、改数据库或调用 Git/GitHub；headless Edge 已关闭，审计临时目录已清理。
