# S5 UI 独立复查 · 坩埚炼药

复查人：`/root/s5_prior_review`，非 S5 施工主体 `Codex/root`。当前 `gameHash=35b6fc9128549795`；判词 **PASS（S5 换皮范围）**，不是 S6 正式美术/富屏 1:1 判词，也不代 Owner S5 人门。

## 范围与独立复跑

- 已逐项对照 `game-pipeline.mjs checklist game-potion-brewing S5` 及 `requests.md` 的 S5 领工声明。共享树中本游戏文件尚未被 Git 跟踪，`git diff -- screen.ts` 无法提供版本基线；因此不把“无 diff”误写为“无越界”。当前皮肤修改集中于 `screen.ts` 的 LayoutNode 主题、面板/字色，审计入口在游戏目录；通过 S4/S5 同画布截图、当前 shell 坐标及当前指纹 S4 独立复查确认左配方、中锅、右材料架、底部状态与输入/规则/终局路径未漂移。S4 旧截图仅是换皮前结构基线。
- `npx vitest run src/ui/components games/game-potion-brewing/screen.test.ts`：**70 文件、535/535 PASS**，含 `validateLayoutNode` 对两配方的 shell、卷轴、材料架、液体、状态、成功/失败和退出树零 issue。`screen.ts` 仅使用闭集 `Screen/Panel/Label/Button/ProgressBar/Modal`；运行时由 `mountUI` 消费，交互通过具名 action；未在游戏 UI 手写 `innerHTML/createElement`。标题、步骤、材料份数与按钮均在真浏览器可见。
- 独立执行 `node tools/ui-audit.mjs games/game-potion-brewing/screen.audit.ts --w 1440 --h 900`、`screen-result.audit.ts`、`screen-exit.audit.ts`：三次均 **exit 0**，重叠 **0**、对比 `<3` **0**、对比 `3–4.5` **0**、border-image 前提缺失 **0**。主屏有 15 个带 id 的绝对定位元素，华丽件 shape **5**；两弹窗各 1 个绝对定位元素、shape **1**。`POTION_THEME` 源码从 `apolloBrocade` 派生，因透明宿主只关 `wash/texture`；审计静态识别的“house 主题：否”不等于改用默认 SHELL。
- 透明度/布局卫生核证：`buildPotionShell()` 的 `Screen.bg='transparent'`、CanvasRenderer `background:'transparent'`；`renderModal` 实际遮罩 `rgba(0,0,0,0.9)`（≥0.85）、对话框 `linear-gradient(bg1,bg1),bg0` 不透明兜底。各树 id 唯一由 validator 覆盖；分组使用 `bare`，并保留显式 `allowOverlap` 的 Canvas、层宿主和按钮层。S5 真浏览器主屏/成败弹窗可读，未见非意图遮挡。
- 同指纹独立隔离浏览器实操 `http://localhost:5716/?game=game-potion-brewing`：**12 帧、0 page/console error**，临时截图 `C:\Users\24652\AppData\Local\Temp\potion-s4-stale-review-27424\`，浏览器/Vite 已关闭且 5716 无监听；实际拖料、鼠标/触屏搅拌、成功/失败两种“重新炼制”、退出继续/确认均操作到。该脚本文件名为 S4，但运行的是当前 S5 皮肤/当前指纹，不拿旧 S4 存档截图冒充当前 UI。可见操作文案含“抓取材料投进锅中”“1–5 选取”、搅拌阶段 Q/E 与拖棒提示，以及显式结果按钮；无秘密操作依赖。

## 撤修验红与警告

- 独立复查专用 `S5-contrast-sabotage.audit.ts` 对 `buildRecipeScreen` 内存树锚定唯一 `potion-recipe-name`，只把其文字色改为羊皮纸底色 `#f1d39a`，不改游戏文件；同一 UI 审计 **exit 1**、硬对比失败 **1**、该字比值 **1:1**，证明本轮对比审计会因实际不可读而转红。
- `game-skill-audit`：红旗 **0**、`RATCHET: PASS`，但 `AUDIT: WARNINGS` 是真实告警：尚无 S6 正式美术台账；`game-potion-brewing.ts:114` 的 `performance.now()` 只用于 render-only 拖影采样，不进入玩法状态/hash。S5 机器门提示**无 blessed golden 标准照，未作自动像素比对**；本轮以定稿参照与 1440×900 真截图逐项目击，不能把机器 PASS 等同自动视觉 1:1。结果/退出弹窗各仅 shape 1 且 house 静态识别否，观感仍较朴素；其具体缺口在下述 ⚠ 明记，非沉默降格。

## 定稿对齐抽样与裁决边界

- 抽样 `self-check/S5-alignment.md` #1/#2/#3/#5/#6：独立查看 `S4-01-start`、`S5-01-start`、`S5-05-success`、`S5-06-failure`，并对照定稿 `ui-refs/29-transparent-fixed-recipe.png`、`31-transparent-success.png`。三栏位置未漂、卷轴已暖纸深字、材料架已暗木亮字，清水/失败紫与终局文字仍区分；真浏览器两种终局按钮已点击且新局可操作。对齐单的“想再来、关键反馈、困惑空等”三问均给出具体状态及限制，非空泛判词。
- #7 **⚠ S6 正式美术**：现锅、草药、药剂瓶仍是占位，与定稿 3/4 坩埚、卷边、横档和瓶图相差明显。未获具体素材来源/许可与 Owner 审美审批，不在 S5 擅接候选；按 `capability-plan.md §4.5` 移至 S6 资产审批/登记/接线。
- #8 **⚠ S6 + 原型差异复核**：当前成功框 `Modal.size:'md'`、emoji 占位，明显小于定稿富屏与瓶图；若扩大属于 S4 冻结布局变更，须 Owner 重新确认原型后施工。本判词只认可 S5 对已冻结节点的皮肤改良，**不宣称结算屏视觉与演出 1:1**。

结论：S5 既定换皮任务的闭集 UI、可读性、透明层、可发现交互与 S4 回归均通过；正式素材和富屏差异已明确留给 S6/Owner 裁决，S5 独立复查 **PASS（带上述范围限定与告警）**。
