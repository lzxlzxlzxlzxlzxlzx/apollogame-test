# 修订02正式Host｜按钮反馈Owner A与压力测试范围澄清

2026-10-16，提需BDM程序。状态：**Owner已直接选择按钮A：补通用PUI反馈配置；待PUI交付合同**。原型、日历A不重复确认；极长名称是人为技术压力，不再请求Owner选择改版，保持定稿布局。

## 判断与原文

接受“保持定稿原型反馈”为目标；回驳“去圆框必须新增控件”，现有组合已经完成去圆框。精确反馈是另一处能力缺口，不能把原生按钮可点击等同演出1:1。

实查当前工作树`ui-find --type Button --json`、Button的types/catalog/validate/render/server、UI两手册、pick-list及PUI域边界。共享树存在其他施工，未以pull/rebase移动他人现场；直接核对当前工作文件，不依据旧记忆。原型冻结SHA`4c39e9f04dab441945a277bea000ab3db71fd2870996442a1177a4a7d28ee415`。

- 原型`.entry:hover .button-face`：`translateY(-3px)`、`brightness(1.2) drop-shadow(0 0 5px #d6b6ef)`，120ms；pressed为`translateY(3px)`、`brightness(.85)`；disabled为整体opacity`.48`、图层`grayscale(.7)`且无平移。
- 现有`server.ts`：无皮Button hover为`brightness(1.07)`，active为`translateY(1px)`、`brightness(.9)`。禁用保留原生拒收，但不是上述精确视觉。
- `ButtonProps.skinFeedback`原文：`Opt-in visual feedback only for a resolved image skin`；`render.ts`权威判断`const feedback = sk.skin && p.skinFeedback ? p.skinFeedback : undefined;`。
- `validate.ts`明确拒绝`skin:'' + skinFeedback`：`skinFeedback 只用于贴图皮 Button，不可与空 skin 或 stateColors 共用`。当前iconOnly使用`icon`而非background skin，不能偷换为重复画图、背景cover或丢可访问label/断图回退。
- `ButtonSkinFeedback`只有brightness/glow/transition字段，没有hover/pressed二维位移及disabled灰度；`tilt3d`会透视倾斜，`press3d`是下移5px并新增底唇投影，都不等价。`fx:sheen-hover`是流光，不是本原型滤色与位移。

因此现有闭集重组不能表达本次精确状态集；`src/ui/**`归PUI，提需方不得直接修改，不注入游戏CSS/DOM，不先写再申请。

真实浏览器实证：主程序[边界探针](../../../../scripts/demon-castle-ui-runtime-02-boundary.probe.mjs)在`http://127.0.0.1:57114/`采样，hover无位移、brightness1.07，pressed实际下移1px、brightness0.9；图片层无额外transform/filter，不是父子滤镜叠加误读。该短时Edge/服务及任务临时目录已清理。[测量](../self-check/DEMON-CASTLE-UI-RUNTIME-02-boundary.measurements.json)及[hover截图](../self-check/shots/DEMON-CASTLE-UI-RUNTIME-02-boundary/hover-1440.png)保留，命中预期目标的两项实际红灯，未降低验收阈值。

## A/B（推荐A）

| 选项 | 代价 | 影响面与通用性 | 选错代价 |
|---|---|---|---|
| A 补PUI通用、opt-in图标反馈数据合同 | 由PUI设计有限数字/色令牌字段并同步types/catalog/validator/render/server、活范例和状态测试；Host随后只消费数据 | 共享原生Button/iconOnly的render-only扩展，省略完全兼容；所有带透明PNG入口的游戏可复用；不改action/焦点/可访问名/World/存档 | 若状态优先级、动画目标或断图回退错误会波及共享控件，必须逐态真浏览器、键鼠触控、reduced-motion、撤修及异人复查 |
| B 申请魔王城专有表现代码例外并记债 | 须Owner额外明确例外及边界，独立维护该游戏的状态表现适配，不自动允许自由DOM/CSS或越PUI域；当前规范下不能直接实施 | 仅本游戏，无法复用，后续其他游戏仍缺同一表达力 | 长期双解释器、可访问/禁用/卸载漂移；最终仍可能迁移A，回退时需重新核对所有状态 |

推荐A：保留已批准目标与数据驱动路径，不为单款游戏制造表现特判。Owner也可另外要求修改原型、重新定稿为现有默认反馈；这属于目标变更，不能由程序把当前差异默降为通过。

## A批准后最低验收（交PUI定最终闭集合同）

仅图像表现层运动/滤色，按钮命中盒、独立键徽、Tooltip、可访问名称与焦点位置不抖动；hover/pressed/disabled精确值及120ms有真计算样式/关键帧证明。pressed优先hover，disabled不得执行action，触控及Enter/Space反馈与一次执行不回归；缺图仍可见文字，reduced-motion无过渡，省略新字段的旧Button字节/行为不变。危险文本/非法数字/自由CSS/未知字段拒收，活范例与深浅主题审计，撤修先断言唯一锚点后实际转红，复查人非施工人。

本单不包括两属性专属图，后者仍由策划/资产线交付；不把Owner批准原型当作新素材来源/许可审批。

## 同轮压力测试：范围澄清，不作为游戏设计挡板

新映射允许64字符纯文本，当前魔王城实际名称很短且六视口395项通过；但不能把它泛化为所有合法名称都能单行。上述探针只在测试进程中以唯一锚点把既有只读status-long夹具改为64中文季节名+64中文时段名，未写World/Host JSON：375×812实际Label宽285px、高56.015625px、字号8px、行高11.2px，约5行。仍在丝带边界内，但**不符合单行且难读**。见[实际截图](../self-check/shots/DEMON-CASTLE-UI-RUNTIME-02-boundary/calendar-64-64-375.png)。此图是已标注的对抗只读夹具，白底无地图不是正式世界美术故障。

同一探针最终exit1、pageErrors0、三项真实红灯（hover/pressed/长名），不能列入“全部通过”。当前Button/Label机读目录均已实查：Label没有nowrap/ellipsis字段；不能私改PUI或按游戏内容硬截译名掩盖。

Owner对原极长名提问的真实回复为：“什么情况下会这么长，怎么可能”。当前魔王城只有`月相季`、`黎明`、`夜晚`，没有64/64字的内容，也没有已知玩法会把名称变长。64是通用输入校验的安全上限，不是策划长度要求，更不是“所有上限都必须塞进375px单行”的视觉合同。主程序已明确说明这是人工构造，并撤回让Owner为此选布局的提问；未将其疑问伪造成对某种新布局的批准。

以下1/2仅保留原询问历史，不再等待Owner回答或派工：

| 视觉选择 | 代价与影响 | 可复用性与选错成本 |
|---|---|---|
| 1（推荐）保持单行，极长时在丝带文字区横向滚动保留全文 | 可先用现有Panel.scroll与定宽Label闭集重组，不为滚动另造能力；正常短名外观不变，极长时需横滚才能读全 | 共享Host可复用；需真实wheel/触摸/键盘及边界测试，错误实现会裁字或滚动不可达 |
| 2 允许极长名换行并相应增高丝带 | 不裁名字但改变窄屏信息层级、丝带占地与后续HUD纵向位置 | 同样共享数据布局；需重验所有重叠和侧栏位置，可能遮地图/挤小屏 |

主程序范围复核结论：不为没有实际内容需求的压力极值扩大本单，不改原型/丝带，不新增滚动、截断、缩名或换行规则。保留真实测量为通用输入/展示边界技术备注，不能宣称通用极限已解决；若未来具体内容真正触发，再携真实内容按现有需求流程处理。当前本游戏未收束的视觉项仍为精确按钮反馈和两属性素材，不是该人工压力场景。
