# GCI-S6-UI-04 · 最后一批共享外观字段施工导航

2026-10-14。Owner 在来源聊天选择 A；公共池 `REQ-GCI-CART-UI-BRIDGE` 已登记本地施工锁。本单只改通用 PUI/卡带只读表现，未改 GCI 正式 manifest、原型、素材、World/hash、点击几何、忙期或人门。

## 闭集合同

- `presentation.font?:'system-yahei'` 使用本机 Microsoft YaHei 字体栈，不接受自由 font-family/URL；缺省 house 主题原样。
- `Modal.visual.outerRing?:{width:1..24,color:#RGBA|#RRGGBBAA}` 仅允许半透明实色；`enter?:'lift-240'|'lift-600'` 固定从 y44、scale .94、opacity 0 到终态，只作用 dialog，scrim 保持静止且 reduced-motion 时长归零。
- 无皮 `Button.borderWidth?:0..8`；`focusRingVisual?:{color:LabelColor,width:1..8,offset:-8..8}` 保留真实键盘焦点环。缺省旧 CSS 原文；不接受关闭焦点再伪装新环。
- `pointerFeedback.visual` 只收三语义色的可选 #RRGGBB、hover/pressed alpha 0..1、blur 0..32、pressedBrightness 1..2。复用既有二值 mask/Shape 绘制与逐物件 tone，不进入 World 或动作路径。已有 pressed .95、字距、旋转和内内容动效未重复新增。

## 施工自证

- UI04 点名与既有组件、presentation、game-i 定向范围共 78 文件/602 测试 exit 0；TypeScript、定向 ESLint、生产构建均 exit 0。构建仅有 >500kB chunk 告警。
- `check-ui`：深/亮 `tools/audits/gci-s6-ui04{,-light}.audit.ts` 各 exit 0；重叠 0、硬/软低对比 0、border-image 前提 0。字段夹具使用 SHELL，因此 `[华丽度]0/house:false` 是非阻断提醒，不代表正式 GCI 视觉品质。临时审计浏览器随命令退出。
- `context-budget-guard`、`docs-ref-guard` 均 exit 0。Windows 普通沙箱 Vitest 先因本地 `spy.js realpath EPERM` 而 0 测试；真实回归使用获准的本机短时命令，未连远端或启动整套系统。
- 扩大 `games/game-i` 为 120/121，唯一 `dialogue-world.test.ts:30` 好感 8≠14；该用例不在本单改动中，不能冒称全绿。`scoped-gate --run` 停在其它项目 32 条 depcruise 跨层违规，未关总门。异人四步复查发现并促成修复 `skin:""` 误拒边宽，修后共享字段**局部 PASS**，见 `GCI-S6-UI-04-independent.md`；不等于正式游戏接线或 S6 整关通过。
