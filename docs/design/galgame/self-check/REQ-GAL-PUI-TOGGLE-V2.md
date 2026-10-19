# REQ-GAL-PUI-TOGGLE-V2 · PUI 施工自证（2026-10-13）

判定：**接受最小通用视觉槽，待非施工者独立复查**。Owner 在 `gal-ui-04b-settings-gap.md` 选 A 通用表现/设置能力；`docs/workflow/requests.md` 本地 PUI 领锁票明确此视觉闭集。当前 `Toggle` 原生控件只有固定 36×20 轨道、14px 圆钮及主题 jade/bg3，`layout.width/height` 不能改变其内部几何，也不能同时表达 V2 定稿 `.switch` 的暗靛/金边与开态蓝紫。复合 Panel 会丢失 checkbox/空格/禁用/ActionSink 合同，故不重组。

## 合同与边界

- `Toggle.visual` 是单个可选数据对象，11 个几何/颜色字段必须齐全且不得夹带额外键：`width/height/knobSize/knobOffLeft/knobOnLeft/knobTop` 为有限、有界 px；`offBackground/onBackground` 为面色令牌或安全 `{custom}`；`border/offKnob/onKnob` 为文字色令牌或安全 `{custom}`。滑块须在轨道内，开态横坐标须大于关态。另可选 `showLabel:boolean`；`false` 只隐藏右侧视觉文案，checkbox 以非空 `props.label` 作为 `aria-label`。
- V2 活范例填 75×31、22px、left 4→46/top 3，关轨道 `#1b2445`、开轨道 `#5b679e`、边 `#d8c389`、圆钮关 `#8b9ac3`/开 `#eff1ff`。与定稿 CSS 一致。
- 未填 `visual` 进入旧渲染分支，HTML 字节、36×20/14px、主题色、原生 checkbox、`disabled`/`aria-disabled`、`'true'/'false'` ActionSink 不变。此票不改 GAL 消费、原型或资产；不签 S5 或 04B 整体。
- 代码：`src/ui/components/{types,catalog,validate,render,index}.ts`，回归 `toggle-visual.test.ts`，隔离浏览器 `toggle-visual.audit.ts`/`verify-toggle-visual.mjs`，活范例 `games/game-i/gallery.ts` 与 `game-i.test.ts`，手册 `docs/playbooks/ui.md`。

## 自证结果

| 项 | 真实结果 |
| --- | --- |
| `npx tsc --noEmit --pretty false` | exit 0 |
| 定向 Toggle/目录/server/game-i | 初轮 89/89，exit 0；渲染数值防注入补测后的 UI＋game-i 展示台末轮见下 |
| `npx vitest run src/ui/components` | 补测前 538/538，exit 0 |
| `npx vitest run src/ui/components games/game-i/game-i.test.ts` | 最终 548/548，exit 0 |
| `npx vitest run src/ui/components games/game-i` | 补测前 657/658；唯一失败 `games/game-i/dialogue-world.test.ts:30` 既存 8≠14，好感世界测试不涉及本票 |
| `node tools/ui-audit.mjs src/ui/components/toggle-visual.audit.ts --w 900 --h 320` | 深色 0 重叠、0 对比硬失败/警告、0 border-image 前提，exit 0；「华丽度 0」是隔离三开关测量夹具的非阻断提醒，并非作品屏 |
| `node src/ui/components/verify-toggle-visual.mjs` | 暗/亮两主题，关/开/禁用/旧默认、鼠标与空格真实动作全部 PASS；仅 `file://` 临时 bundle，Edge/Chromium 使用临时 profile，关闭且临时 bundle 删除；未启动 5173 或整套系统 |
| 隔离锚点撤修验红 | `SABOTAGE_TOGGLE_VISUAL=1` 时目标 `[data-apollo-toggle-track]` 命中恰 1，将浏览器内该轨道改黑；`dark off mismatch rgb(0,0,0)`，exit 1；未改仓库源，正常版重跑 PASS |
| `node scripts/scoped-gate.mjs --run` | exit 1：默认 `origin/claude/mainbranch` ref 缺失提示后，最终停在既存 32 条 depcruise 依赖违规；输出无本票新依赖边。不可称全库绿 |

暗/亮真浏览器关/开证据：`pui-toggle-visual-dark-off.png`、`pui-toggle-visual-dark-on.png`、`pui-toggle-visual-light-off.png`、`pui-toggle-visual-light-on.png`（本目录）。目视：开关无相互遮挡，深/亮文字可读；两种主题均保留精确 custom 轨道色，旧缺省开关仍随主题变化。`git diff --check` 退出 0（仅 Windows CRLF 提示）。

剩余：需要另一名复查人自己独立复跑、锚点撤修验红并确认 GAL 消费侧接入和 V2 同画布差异；施工者不自签。

## 同票续做：左侧已有行名时隐藏重复文案（2026-10-13）

V2 原型 `.switch` 只有轨道/圆钮，设置行名已独立在左；首轮 `Toggle.visual` 仍强制渲出右侧 `label`，真图重复。现仅在 `visual.showLabel:false` 时不渲右侧文字，并给同一个原生 checkbox 加由 `props.label` 安全转义的 `aria-label`。校验拒绝空串/纯空白 `label`、非 boolean `showLabel`，且仍拒绝未知字段。未填 `visual` 的旧分支完全未变；未填 `showLabel` 或显式 `true` 的 visual HTML 一致。game-i 新添外置 `Label` 行名，活例显示一次文案，checkbox 保留屏读名称。未改 GAL 消费。

续做后的独立自证（不代签复查）：

| 项 | 真实结果 |
| --- | --- |
| `npx tsc --noEmit --pretty false` | exit 0 |
| 定向隐藏文案/禁用/game-i | 22/22，exit 0；含空名拒收、引号转义、默认 HTML 不变、ActionSink |
| `npx vitest run src/ui/components games/game-i/game-i.test.ts` | 550/550，exit 0 |
| `node tools/ui-audit.mjs src/ui/components/toggle-visual.audit.ts --w 900 --h 320` | 0 重叠、0 对比失败/警告、0 border-image 前提，exit 0；隔离夹具的「华丽度 0」非阻断 |
| 真浏览器 | 暗/亮各自关/开/禁用/旧 Toggle、鼠标/空格 ActionSink PASS；两枚无可见内部文案的 checkbox 分别由 `getByRole('checkbox',{name:'自动语音'/'禁用'})` 唯一命中；四张截图已更新，隔离 Chromium 关闭且临时 bundle 删除 |
| 同字段锚点撤修验红 | `SABOTAGE_TOGGLE_LABEL=1`：`#measured-i[aria-label="自动语音"]` 命中 1，浏览器内删除属性后报 `dark measured checkbox lacks accessible name`、exit 1；仓库源未改；正常版复跑 PASS |
| 全库 `scoped-gate --run` | exit 1：同前，缺 `origin/claude/mainbranch` 引用，最终停在既存 32 条 depcruise 违规；不宣称全库绿 |

截图可直接比对首轮与本轮：本轮 `pui-toggle-visual-*-{off,on}.png` 里外置行名只出现一次，旧缺省 Toggle 继续自带右侧文案。下一关仍是非施工者独立复查；S5 作品同画布对齐由 GAL 消费侧负责。
