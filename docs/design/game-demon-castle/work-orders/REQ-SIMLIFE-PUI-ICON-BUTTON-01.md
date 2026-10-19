# REQ-SIMLIFE-PUI-ICON-BUTTON-01｜通用原生可访问图标按钮

提出方：BDM程序；施工主体：**PUI Codex/root（2026-10-16 本地领锁）**；状态：PUI 能力独立局部 PASS，Life Host 消费与全库门禁未闭环；P1。
来源：DEMON-CASTLE-UI-RUNTIME-01；Owner 2026-10-16 选择图标按钮 A，证据见该施工单。消费方只改 Life Host；本票专属 `src/ui/**`、game-i、UI 手册/审计域，不授权 BDM程序越界。

## 缺口实查与判断

接受共享闭集扩写，不新增游戏专用组件。`types.ts` ButtonProps 当前只有必填 label 与 icon；catalog 同样无隐藏视觉 label 的原生模式。`ui.md` 明示 Button.icon 为“图文位”、Button.skin 只吃一条 label。Panel.action 没有原生按钮键盘语义；叠 Image/Label 会留下旧文字或遮挡命中，不能表达定稿的纯图标按钮。Owner 已选 A 补通用能力，B 保留文字按钮未选。

## 固定合同（字段命名由 PUI 确认后交回消费方）

1. 仍输出原生 `<button type="button">`，沿用 action/actionArg、disabled、焦点和 ActionSink，不用 Panel.action/额外自由 DOM。
2. additive、默认关闭的 icon-only 显示模式；保留非空 label 作可访问名称与缺图回退。icon 是消费端解析的图 URL，不能引入 art key 解析或游戏名特判。图标可按受限尺寸显示（入口目标 48px，窄屏 32px）；无 icon、净化拒收或加载失败时恢复可见 label，不留无名/空按钮。装饰图不重复朗读名称。
3. Tab 可聚焦且 focus-visible 清楚；Enter/Space 各只激活一次；disabled 不可聚焦/不发动作；hover/pressed/disabled 使用现有四态合同，无自由 CSS、onclick 或样式脚本。仅隐藏文字不得破坏宽高/命中。
4. J/I/C 键徽是可见文字，可由消费端既有独立 Label/Panel 组合；不要求新增键徽系统，不改变真实快捷键处理。
5. 校验拒收非法模式、空白名称、无效/越界图标尺寸；catalog/schema/类型/renderer/缺图生命周期及 game-i 活例一致。旧按钮在不填新字段时 HTML/动作合同不变。

## 必须交付的实证

点名测试含合法/非法数据、XSS 净化、缺图及 update 后回退恢复、双 mount 清理；真浏览器 Tab/Enter/Space、禁用无动作、三种鼠标状态、深浅对比/布局。未修全绿→唯一锚点撤修真红→恢复全绿。非施工者独立复查，不能自签 PASS。

## Host 接口与资产语义

消费方新增严格可选 uiSkin.slots.questIcon / inventoryIcon / profileIcon，经既有 AssetManager 已加载纹理 resolver 解析；缺图走安全文字按钮。三个 key 对应已批准 entry-quest-scroll / entry-backpack / entry-profile。右上仅现有两项真实属性，不使用 resource-gold / resource-moon-crystal / resource-moonleaf 冒充属性；这三项已登记素材保留但本轮不消费，必须在闭包测试与差异单明确列出，不能伪造 consumer。

交回内容：精确字段名与类型、缺图行为、定向命令与真实结果、锚点撤修证据、独立复查文件。不得改 Life Host、descriptor、正式游戏 JSON、AssetIndex、pipeline 或 Owner gate。
