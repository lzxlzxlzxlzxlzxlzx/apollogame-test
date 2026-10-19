# GAL-ART-01A · V2 确认窗与按钮动效表达缺口（待 Owner A/B）

状态：**Owner 已裁三项均选 A（PUI 通用受限闭集）；施工及独立复查未完成**。本单只涉及 Owner 已定稿的 1440×900 V2 确认窗和提示/按钮动效；不改原型、不代签人门。

## ① 实查及不可重组理由

- 机读 capability catalog：`npx vite-node scripts/dump-capability-catalog.mjs` exit 0；UI 相关只有世界锚定 `l8-world-ui2d`，无 Modal 视觉合同。直接 `node` 因 TS 路径别名 `@engine/core` 不可解失败，已按手册改用 vite-node。当前共享工作树有 161 个已改跟踪文件、分支被其他工作切至 `capgap/rhetoric-identity-cards`；为保护并发改动未执行 `git pull`。
- `docs/playbooks/pick-list.md` 的 VN 决策树及 `docs/playbooks/ui.md` 模态条：现成 `Modal.size:'xl'` 是宽 800px，`skin/skinSlice/skinBorderWidth` 管框皮，`closeAction` 管关闭；未列标题字号、内框最小高度、正文整体居中或内容边距字段。
- 实码 `src/ui/components/types.ts` 的 `ModalProps` 只有 title/titleColor/size/closable/closeAction/skin/skinSlice/skinBorderWidth；`src/ui/components/render.ts` 的 `renderModal` 把 `xl` 固定宽 800、仅 `wide` 加 `min-height:610px`，内置标题固定 15px、左对齐及 padding 22px。`layout` 作用于全屏遮罩外层，不能改变内框这些参数。用子 Panel 增高仍改不了内置标题，也不能保持 `aria-labelledby` 的正式标题语义；不用内置标题自行拼子树则退化为 `aria-label="Dialog"`，丢失可访问标题。
- V2 `gal-ui-complete-v2.dc.html` 的 `.overlay-panel` 为 800×至少 310、标题 30px 居中、正文 17px 居中、36px 源皮显示边、动作行居中。真浏览器原型内框 `[320,295,800,310]`；独立 GAL 浏览器实测亮态 `[320,339,800,222]`、暗态 `[320,337.5,800,225]`，即矮 88/85px、顶部下移 44/42.5px，内建标题仅 15px。`#gal-confirm` 外层是 1440×900 遮罩，不可冒充内框。截图 `review/gal-ui-v2-confirm-exit-live.png` 与 `review/gal-art-01a-confirm-new-game-light-toggle-v2c.png` 在档；文案属不同确认类型，几何差异不受其解释。

## ② 二选一（推荐 A，未经 Owner 裁决不得实施）

| 路线 | 代价 | 影响面/通用性 | 选错代价 |
| --- | --- | --- | --- |
| **A · PUI 通用闭集 Modal 视觉字段**（推荐） | 在 `ModalProps` 增最小高/标题字号/居中/内容内距等受限数字和枚举字段，配校验、render、game-i 展示台、无字段零回归、无障碍与独立复查；GAL V2 只填声明数据。 | `src/ui/**` 共享基座，其他游戏可复用 800×310 类确认窗；不会给游戏自由 CSS。 | 字段若过宽会增加共享 API 维护债，须严格限于 V2 已证尺寸与共性参数。 |
| **B · GAL 专属 Modal 例外** | 在 GAL 宿主为确认窗另写专属视觉渲染/样式，登记偏离 LayoutNode 的例外债，仍需点击、焦点、Escape/遮罩及 a11y 回归。 | 只影响 GAL，初期代码面较窄，但与既定“换作品只换数据”及 UI 铁律冲突。 | 以后每部 GAL 与其他游戏复制一套 Modal；焦点/取消语义容易漂移，后续迁回通用 PUI 要返工。 |

同批 S6 小缺口：`src/ui/components/server.ts` 的 `apollo-pulse` 在 0%/100% 为 `opacity:.55`、50% 为 `1`，无位移；V2 恰好相反，0%/100% 为 `1`、50% 为 `.35` 且 `translateY(4px)`。仅把 1300ms 填给通用 pulse 会播出**反相**提示，不能当 1:1，已撤去此错误近似。`layout.fx` 的现有 pulse/float 组合亦为不同幅度/方向且两段 transform 不可精确合成。若 Owner 选 **A**，PUI 同票可最小扩为受限 `pulse` 参数或一枚通用 cue 预设，须测减少动态、无图回退与旧默认零变；代价是共享动画 API 多一个严格闭集。若选 **B**，GAL 单独写提示符 CSS/DOM 时序，短期面小但破数据 UI 铁律，未来每作复刻。推荐仍为 A，选错风险与上表相同：A 过宽会养成通用 API 债，B 会复制脆弱特例。

同批 S6 按钮缺口：独立真浏览器实测 GAL V2 分支钮 hover 为 `brightness(1.08)`、`transform 0.07s/filter 0.12s/box-shadow 0.12s`；原型同钮为 `brightness(1.32) drop-shadow(0 0 8px #a7b2ff99)`、filter/transform 各 0.16s。具名 `narrative.choose` 点击正确，但现有 `Button` 的 skin hover 强度/时长是共享固定 CSS；`stateColors` 是受限颜色四态，不能改滤镜、光晕或过渡时长。**A** 是 PUI 在已有 Button 皮字段旁补最小受限 hover/press 视觉标量及校验/默认零回归，GAL 只填 V2 数值；代价是共享 UI API 扩面、需跨皮肤回归，但其他游戏可复用。**B** 是 GAL 专属 hover/press 样式例外，局部工时较少、可复用性为零；选错会使每部作品复制特例且与闭集铁律冲突。仍推荐 A，需 Owner 同批裁定。

Owner 已明确三项均选 **A**。PUI 专职按闭集字段施工、独立复查后，GAL 才消费数据并做同画布关键帧验收；裁决不等于实现或人门通过。当前 GAL 保留现有闭集 Modal、静态推进提示与真实按钮动作，不伪称确认窗 S5 或提示符/按钮 S6 1:1。素材逐件审美/来源/许可批准是另一独立 Owner 决策，不由本单替代。
