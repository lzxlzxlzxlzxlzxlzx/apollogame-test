# REQ-GAL-PUI-GHOST-STATE · 非施工者独立复查（2026-10-13）

**判词：PUI 通用能力局部 PASS；整库/游戏集成 CONCERNS。** Owner 已选 A：只扩通用原生 Button 的状态化配色闭集，GAL 以后填数据，不走 Panel 伪按钮。本轮实现为 `Button.stateColors` 四态，每态必有面/边、可选字色；未改 GAL 消费、原型、资产索引或 Owner 人门。复查人未编辑生产文件，只写本单；共享工作树有其他施工者并行改动。

## 四步独立证据

1. **复跑。** `npx vitest run src/ui/components --maxWorkers=2 --minWorkers=1`：69 文件 **532/532**、退出 0，含新闭集/安全/旧按钮、ActionSink、形状/皮肤/焦点等既有测试。`npx tsc --noEmit --pretty false` 退出 0。`node tools/ui-audit.mjs src/ui/components/button-state-colors.audit.ts --w 760 --h 360` 退出 0：重叠 0、对比硬失败 0、3–4.5 警告 0、border-image 前提失败 0。审计另报 **华丽件 0、house 否** 的非阻断启发式警告；这是单控件 SHELL fixture，不能当成 GAL 成品审美通过。审计临时浏览器/构建已清理。
2. **唯一锚点隔离撤修验红。** 自行构建同一只读 PUI fixture 至任务级系统临时目录；在独立 `file://` 浏览器页面的 `apollo-ui-keyframes` 中，断言完整 hover 选择器锚点**恰好 1 次**，只在该页面 DOM 中删除。正常页面 hover 断言读到 `rgb(83, 92, 145)`；突变页同一断言转红，实得默认底 `rgb(16, 26, 54)`。共享源码、施工截图和测试文件均未修改；浏览器与临时 bundle 已关闭/删除。
3. **实证复现。** 独立 Playwright/Edge 临时 `file://` 探针在暗、亮主题各测默认底/边、hover 底/边、鼠标按下底/边、原生 disabled 不透明且不可点、键盘 `:focus-visible` 只进入可用按钮、点击只入 ActionSink 1 次；两主题均通过。真实 CDP touchStart 按住进入 pressed 色、touchEnd 移除临时 marker 并只入队 1 次，也通过。夹具四态字色/底色按 WCAG sRGB 计算约为 **15.14 / 6.35 / 12.27 / 8.68:1**（默认/hover/pressed/disabled），均高于 4.5；这是不透明样例色，不外推到 GAL 将使用的半透明底和复杂背景。
4. **读告警与旁路回归。** `npx vitest run games/game-i --maxWorkers=2 --minWorkers=1` 独立复跑为 **119/120、退出 1**；唯一失败是 `games/game-i/dialogue-world.test.ts:30` 好感期望 14、实得 8。该测试只 import `createDialogueWorld`，不经过本票 Button/`gallery.ts`；与施工自检所报相同，不能将 game-i 全绿或 scoped gate 全绿记为事实。施工自证还记载 scoped gate 因 32 条非 PUI 依赖违规退出 1；本复查未重跑该全库门，不把其数量冒充独立核实。审计没有硬性布局/对比警告，只有前述华丽度启发式提示。

## 合同判断与剩余边界

- Owner A 指定的 catalog/types/validate/render/主题四态、原生 Button/disabled/focus/ActionSink、game-i 活范例与 UI 手册均可定位；校验器要求恰好四态、每态仅 `background/border/text?`，拒绝注入、渐变、越界 RGBA、裸色、非空 skin 混用。状态样式只对显式 `stateColors` 生效；未配置该字段时旧 kind/主题皮路径保留，旧 UI 回归 532/532。现有“旧按钮字节不变”新用例只比较同一版本两次 render，**不是**真正 pre/post 字节快照；本次通过 diff 分支核对与旧回归支持语义无回归，不把该用例单独宣称为跨版本字节证明。
- UI audit 只看静态默认态，动态四态/焦点/触屏由上述独立浏览器探针补足。尚未验 GAL 真背景上的半透明 ghost 对比与 V2 1:1；GAL 消费、真实页面禁用态和 S5/S6 仍须另验。
- game-i 无关剧情世界红灯和全库 scoped gate 红灯未在本票修复。故本判词只放行 **PUI 闭集局部合同**，不签“全门禁绿”、GAL 成品视觉通过或项目里程碑 done。
