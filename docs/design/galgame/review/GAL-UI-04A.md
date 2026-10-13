# GAL-UI-04A 非施工者独立复查

> 2026-10-10；复查人 Codex/review_gal_04a，施工人 Codex/root。**本票局部 PASS；完整 S4/V2 与全库类型门 CONCERNS。** 仅签四页设置的部分 S4 信息结构、六确认 Profile V2 消费和五类已有宿主操作的政策接线；不签文字/声音/画面真实消费者、全局恢复默认、桌面退出、完整 V2 结构 1:1 或 S5/S6 视觉演出。未执行 Git/GitHub、数据库写入或应用服务启动。

## 独立复跑、真浏览器与告警

- 最新共享源码 `npx vitest run src/services/gal-profile src/services/gal-ui src/services/gal-save src/skills/tier3/narrative-director.test.ts`：**8 文件 94/94、退出 0**（设置宿主 12/12）；`npx vitest run src/ui/components`：**65 文件 506/506、退出 0**。`validateLayoutNode` 四页在 `gal-ui-slice-host.test.ts:290-292` 点名零 issue。Director 512 步测试的 721111 字节历史日志为预期输出，不当作隐藏告警。
- `tools/ui-audit.mjs` 八次按文本/声音/画面/确认 × 深/亮**逐个串行**复跑（导航修复后最新树，1440×900），全数退出 0；各页重叠、<3 硬对比、border-image 破损均 0。四个亮色页各有标题 `系统设置` 3.57:1 非阻断警告；该标题是 36px 大字，超过大文本 3:1 门槛，审计器按普通文字 4.5:1 提示。四个深色页各报 glass:1、house=no 启发式华丽度警告；宿主 `gal-ui-slice-host.ts:226` 实际以 `apolloOnyx` 更新，不能把启发式当“未传主题”，但与原型的正式纹样/皮差距仍是 S5/S6 债。亮色完整主页/剧情旧背景低对比不在八次隔离设置页审计范围内。
- 静态真浏览器脚本 `verify-gal-04a-live.mjs` 在任务级 `.review-ui-04a-probe` 副本运行，**退出 0**，访问 `file:` 临时构建与本地定稿 V2 `.dc.html`，无服务。四页切换、六独立 Toggle、失败时 native checked 回旧值、故事滚轮隔离、空位保存/覆盖/读取/新游戏/回标题接线，以及修复后的设置顶栏“主页”确认均实跑。03A 滚轮/槽 2 主链、03B 历史/画廊主链在同副本各退出 0。脚本截图只写副本，没有覆盖共享 Review 图；脚本 `finally` 关闭 Edge、清静态临时构建。
- `npx tsc --noEmit --pretty false` 最终直接执行**退出 1**；诊断仅在 `games/game-card-reveal/s4-flow.test.ts`、`games/game-dice/dice-window.test.ts`、`dice-window.ts`、`games/game-simlife/art-consumption.test.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`，无 04A/GAL 文件诊断。不能将局部回归绿灯称为全库门禁绿。

## 唯一锚点隔离撤修验红

- 隔离副本的 `gal-ui-slice-host.test.ts` 保存失败/无效时间定向基线 **1/1 通过**。`rg -n -F` 对 `confirmationKey, arg === 'true', this.ports.savedAt());` 在副本宿主源码仅命中**一次**（第 115 行）。
- 只在副本用 `apply_patch` 把宿主注入时间替换成常量 `0`，重跑同一定向测试**退出 1**（1 fail/11 skipped）：`gal-ui-slice-host.test.ts:380` 预期无效时间保持 `load=true`，实得 `false`。这精确证明 04A 的宿主时间有效性/失败不伪成功断言敏感，非未命中伪红。共享源码从未撤修。
- 删除前核验 `.review-ui-04a-probe` 解析绝对路径恰位于工作区本任务目录，marker 源文件存在，`node_modules` 非 reparse/junction；仅递归清理此探针，`Test-Path=False`。清理后才在主树复跑 94/94，避免 Vitest glob 把副本用例重复收集。

## 对抗语义、原型对拍及局部边界

- 最初实查发现设置顶栏“主页”从故事来源可绕过 `returnTitle` 确认；施工人修复后，`gal-ui-slice-host.ts:135-148` 从设置来源/槽与画廊来源推回 home/story，故事来源走 `requiresGalConfirmation('returnTitle', ...)`。最新主树单测 `gal-ui-slice-host.test.ts:342-360` 实证：提示出现、取消仍在设置、单独关闭该开关才直达主页；04A 真浏览器脚本亦点顶栏重新验证，未保留该阻断。复查人未修改共享实现。
- `gal-ui-settings.ts:34-42` 六 Toggle 各有稳定具名 action，不从本地化 label 猜键；`gal-ui-slice-host.ts:26-33,107-120` 仅在确认页接受 `'true'/'false'`，调用同包串行 `persistGalConfirmation`，写成后更新 Profile/UI，失败反馈并强制重渲染旧值。文本/声音/画面无消费者的控件均为 disabled/待接入；`gal-ui-settings.ts:123-130` 的全局恢复默认可见但 disabled。`exitGame` 只持久化开关/验纯政策，不假装浏览器可退出。
- 独立浏览器包围盒：共用系统框原型与正式皆 x18/y61/1404×824；四页设置网格 x84/y244/1272×320（画面/确认卡高 256），两列卡 x84/x729、宽各 627，均对齐。标题原型 61 vs 正式 52（差 9px）、页签 44 vs 31（差 13px）、底栏 51 vs 31（差 20px）；原型框外导航而正式框内。对照 `gal-ui-04a-structure-diff.md` 与原型/正式确认页截图可见饰纹、按钮皮、材质亦未复刻。因此仅给**部分 S4 信息结构 PASS**，不宣称完整 S4 结构 1:1；未裁偏差和视觉债仍在档。
- 项目控制台 `ui-settings-confirmations` 当前仍 planned/owner required；本票 Review 不替 owner 更新持久化状态，不宣称项目级完成。
