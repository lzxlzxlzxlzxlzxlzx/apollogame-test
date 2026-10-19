# REQ-GAL-PUI-V2-VISUAL · PUI 施工自证（待独立复查）

2026-10-13 · 施工主体 PUI。Owner 对 [差异单](../gal-art-01a-modal-gap-2026-10-13.md) 的三处均选择 A。仅改通用闭集；GAL 消费由另一施工者负责。本单不是独立复查签字。

## 合同与默认边界

- `Modal.visual?: {minHeight?,padding?,titleSize?,titleAlign?,contentAlign?}`，几何和标题只走受限数值/对齐枚举。`size:'xl'` 为 800px，`minHeight:310` 在 1440×900 真浏览器实测 800×310。内建 `aria-labelledby`、初始焦点、Escape、遮罩、关闭 ActionSink 保持。
- `layout.fx:[{kind:'cue',ms:1300}]` 与旧 `pulse` 不同：0/100% opacity 1、translateY(0)；50% opacity .35、translateY(4px)。reduced-motion 时动画时长归零。
- 贴图 `Button.skinFeedback` 精确五字段，V2 数据为亮度 1.32、按压 .85、蓝光半径 8px、160ms；只在实际有贴图皮时输出。非法/非有限数、额外字段、危险自定义色、与 `stateColors` 同用拒收。原生 disabled、键鼠点击、ActionSink 仍沿用 Button。
- 三者不填时旧 HTML 字节不变；现有 Toggle.visual、Button.stateColors 未回退。game-i 活示例：`demo-modal-overlay`、`anim-cue`、`sk-feedback`。

## 验证

- `npx tsc --noEmit --pretty false`：退出 0。
- `npx vitest run src/ui/components games/game-i/game-i.test.ts`：72 文件 / 554 测试全绿。初跑有两条旧 CSS 精确字符串断言失败；将新的 reduced-motion 规则拆成追加媒体块后复跑全绿，未改旧规则字节。
- `node src/ui/components/verify-v2-visual.mjs`：暗色、亮色、reduced-motion 全绿。1440×900 下弹窗实测 800×310、标题 30px 居中；Esc/遮罩关闭、焦点/aria、cue 650ms 中点、Button hover/press 计算样式、disabled、ActionSink、旧按钮未 opt-in 均通过。浏览器和临时 bundle 在 `finally` 中关闭/移除，访问地址为临时 `file://`，未启动整套系统。暗亮截图：`pui-v2-visual-{dark,light}-{modal,controls}.png`（同目录）。
- `node tools/ui-audit.mjs src/ui/components/v2-visual.audit.ts --w 1440 --h 900`：阻断 0，重叠 0，硬对比失败 0，边框皮前提失败 0。
- 撤修验红：隔离浏览器设置 `SABOTAGE_V2_VISUAL=modal|cue|button` 各跑一次，分别锚点命中 1；弹窗改 200px → 几何红、cue 移除动画 → 身份红、Button hover 变量改 1 → 亮度红，三次均非零退出且 `finally` 关闭浏览器。
- `node scripts/scoped-gate.mjs --run`：全库门禁退出 1，停于 depcruise（32 个跨层依赖错误，Life 等其他在途面）；同时脚本报告缺 `origin/claude/mainbranch` 比较 ref。未改这些域，不能宣称全库绿。`node scripts/context-budget-guard.mjs` 当前因并发需求池 11/10 槽失败；本票之外的 10 条均为其他施工者在途或 open，独立复查完成后应按规则删除本票；UI 手册现为 100 行内。

## 复查导航

请非施工者独立复跑上述定向测试、真浏览器审计与三项带锚点撤修验红；核对默认字节和语义，勿将本单自评当作复查通过。生产代码：`src/ui/components/{types,render,validate,catalog,server,index}.ts`；测试/探针：`v2-visual.test.ts`、`v2-visual.audit.ts`、`verify-v2-visual.mjs`；示例：`games/game-i/gallery.ts`；手册：`docs/playbooks/ui.md`。
