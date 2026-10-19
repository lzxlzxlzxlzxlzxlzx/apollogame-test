# REQ-GAL-PUI-TOGGLE-V2 · 非施工者独立复查（2026-10-13）

**判词：PUI 通用 `Toggle.visual` 局部 PASS；全库门禁与 GAL V2 S5 仍为 CONCERNS。** 本人不是施工者，仅编辑本 Review 文档，不改 PUI/GAL 代码、资产、原型或截图。`gal-ui-04b-settings-gap.md` 与引擎需求池载明 Owner 04B=A 通用表现/设置能力：现有 Toggle 内部固定 36×20、14px 圆钮不能重组出 V2 75×31、22px 圆钮及暗靛金边/蓝紫开态；复合 Panel 会丢原生 checkbox/空格/禁用/ActionSink。当前实现把视觉参数收于一个可选 `Toggle.visual` 数据对象，未在 GAL 侧接线。

## 独立四步实证

1. **复跑（首轮）。** `npx vitest run src/ui/components games/game-i/game-i.test.ts --maxWorkers=2 --minWorkers=1`：**71 文件 548/548，退出 0**，包括当时 `toggle-visual.test.ts` 7 项、旧 Toggle disabled/server/action、catalog/validate 与 game-i 展示台。`npx tsc --noEmit --pretty false` 退出 0、无诊断。实查 `types/catalog/index/validate/render` 与 UI 手册、game-i `tg-measured-visual`：11 个必填视觉字段，几何有限有界、圆钮在轨道内且开态右移；颜色限面令牌或安全显式实色，拒绝多余键、危险色、越界 RGB、NaN。后续同票增加可选 `showLabel`，见下文增量复查。render 仍用原生 checkbox 与原有 ActionSink；运行时数值还经 `num` 约束后才插入 CSS。缺省 `visual` 走旧 36×20 分支。
2. **唯一锚点隔离撤修验红。** 独立构建只读 `toggle-visual.audit.ts` 到任务级系统临时目录，用 `file://` 无头 Edge 打开暗主题。定位 `#measured [data-apollo-toggle-track]` **恰好 1 个**，只在该页面 DOM 把轨道背景改黑；原版关态轨道断言 `rgb(27,36,69)` 通过，突变页同一断言转红，实得 `rgb(0,0,0)`。共享实现/测试、施工截图未改；浏览器和临时构建已清理。这验证视觉断言能捉住目标失效，不冒充整套 Vitest 的源码 mutation。
3. **实证复现。** 独立深/亮 `file://` 浏览器均量到关态轨道 **75×31**、边 `rgb(216,195,137)`、圆钮 **22×22**、left **4px**/top **3px**；鼠标点原生 label 后开态底 `rgb(91,103,158)`、圆钮 `rgb(239,241,255)`、left **46px**，ActionSink 恰为 `toggle.voice:true`。聚焦 checkbox 按 Space 返回关态，第二信号恰为 `toggle.voice:false`；禁用 checkbox 为原生 disabled、`tabindex=-1`，强制点禁用 label 不产生第三次信号。旧缺省控件仍显示 36×20 且不带测量皮标记。两主题均通过；只使用隔离浏览器 profile，无主服务/远端/数据库写入。
4. **读告警。** `node tools/ui-audit.mjs src/ui/components/toggle-visual.audit.ts --w 900 --h 320` 退出 0：3 个定位元素、重叠 0、对比硬失败 0、3–4.5 警告 0、border-image 前提失败 0；另有“华丽件 0、house 否”的**非阻断**提醒，是单控件 SHELL 测量夹具，不代表成品 GAL 画面。`npx vitest run games/game-i --maxWorkers=2 --minWorkers=1` 独立复跑 **119/120、退出 1**：唯一失败 `dialogue-world.test.ts:30` 好感预期 14、实得 8；该用例只 import `createDialogueWorld`，与本票 Toggle/game-i gallery 无调用链。施工自证另报 scoped-gate 因 32 条非 PUI 依赖违规退出 1；本复查未重跑整库 scoped gate，不冒充独立核实其数量。

## 放行边界

- `Toggle.visual` 的 catalog/types/验证/渲染、深亮真浏览器鼠标/空格/禁用/ActionSink 与旧默认负控已获局部证据。新单测的“旧 HTML 字节不变”比较的是当前 `visual` 缺省与显式 `undefined` 两路，并非 pre/post 版本快照；本复查以独立浏览器旧控件负控及 render 的明确 opt-in 分支支持“旧语义不变”，不把该单测夸称跨版本字节证明。
- GAL 侧尚未消费本视觉槽；真实设置页的视觉 1:1、完整 04B 偏好生效、S5/S6 演出和 Owner 人门均不在本次 PASS 范围。game-i 全组与 scoped gate 仍红，不能宣称全库门禁通过或里程碑 done。

## 同票增量：`visual.showLabel:false` 独立复查

**增量判词：局部 PASS，先前几何/交互 PASS 保持。** V2 设置行在左侧已有行名，`showLabel:false` 只隐藏开关右侧重复视觉文案；原生 checkbox 必须继续以非空 `props.label` 获得可访问名称。实查 types/catalog/validate/render、game-i 活范例、UI 手册和施工自证：原 11 个几何/颜色字段仍必填，新增 `showLabel?: boolean` 且不接受其他额外键；`false` 时校验拒绝空串、纯空白与非 boolean，渲染安全转义 `aria-label`；未给 `visual` 的旧分支与未给/显式 `true` 的视觉标签路径保持原行为。GAL 消费仍未接线。

1. **独立复跑。** 同一 `npx vitest run src/ui/components games/game-i/game-i.test.ts --maxWorkers=2 --minWorkers=1` 在本增量为 **71 文件 550/550，退出 0**，新 `toggle-visual.test.ts` 为 9 项；`npx tsc --noEmit --pretty false` 退出 0。`node tools/ui-audit.mjs src/ui/components/toggle-visual.audit.ts --w 900 --h 320` 退出 0：3 个定位元素，重叠、对比硬失败、3–4.5 警告、border-image 前提均 0。仍报夹具“华丽件 0、house 否”非阻断提醒，不抹去告警。
2. **独立真浏览器复现。** 只读 fixture 在任务级临时目录构建，以 UTF-8 `file://` 包装页运行 headless Edge；暗/亮各自 `getByRole('checkbox',{name:'自动语音'})`、`{name:'禁用'}`、旧 `{name:'旧缺省'}` 均唯一命中。测量/禁用开关内部 `<label>` 无重复文字，外置行名仍各出现一次；鼠标点轨道后 checkbox 选中且 ActionSink 恰 `toggle.voice:true`，聚焦该具名 checkbox 按 Space 返回未选中并再发 `toggle.voice:false`。具名禁用 checkbox 仍原生 disabled、`tabindex=-1`，强制点击未发第三次动作；旧缺省 Toggle 仍 36×20。两主题均 PASS，浏览器/临时 bundle 已关闭清理，无仓库截图写入。
3. **锚点撤修验红。** 暗主题独立浏览器内 `#measured-i[aria-label="自动语音"]` **精确命中 1**；正常页具名 `getByRole` 为 1，删除该元素 `aria-label` 后相同断言转红，实得 0。撤修仅在临时页面 DOM，不改共享源码或施工截图。首次自写包装页漏 `<meta charset="utf-8">`，中文被浏览器误解码导致探针假红；加 UTF-8 后正常/撤修结果如上，这不是产品缺陷。
4. **范围与告警。** 本增量只签“隐藏重复视觉标签且保留非空可访问名称”和原有键鼠/禁用/ActionSink；不宣称 GAL 真设置页 1:1 或全库 scoped gate 通过。前述 game-i 剧情世界无关红灯、施工侧 scoped-gate 非 PUI 依赖阻断及单控件华丽度提示仍保留；不因 550/550 局部绿而消失。
