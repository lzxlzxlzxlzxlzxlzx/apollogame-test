# S6 最后一批外观表达实查与裁决入口

## Owner裁决 · 2026-10-14

Owner明确回答「A：补最小通用字段（推荐）」。已交引擎程序按共享域领锁实现与异人复查；此许可不扩大为自由CSS、世界时序、素材或人门变更。下方为裁决前实查与代价原文。

2026-10-14。基线正式 SHA256 `1585fc239e45e1c4e703a501f0c074932e38f70862d800aeaf156a30c3b84eea`。UI02已接线并送异人复查，UI03已裁A、共享异人复查中；本单不重新申请这些授权，不修改世界规则或素材。

## 实查原文与不能重组的原因

完整实跑导航 `S6-ui02-formal-freeze.md`、九态源码查证 `S6-visual-remaining-capabilities.md`；对应生产线为UI闭集与只读指针反馈。

| 差异 | 实查证据 | 重组边界 |
|---|---|---|
| 实际字体 | CDP标题4glyph：原型MicrosoftYaHei-Bold，正式Noto-Sans-SC-Bold；不是仅CSS声明差异 | 现有Label.font为house具名槽，卡带theme仅house枚举；不能写任意font-family或复制原型DOM |
| 完成外环 | 原型`0 0 0 12px #d2a54c22`；Modal固定shadow且overflow-y:auto；UI02 fill/border只opaqueHex | 透明外框+内框组合被校验拒绝，负坐标外装饰被裁，不用新框图伪装已批准资产 |
| 按钮边与焦点 | 实测border为#51371E但1px；server.ts焦点outline3px/offset-3，render.ts主题text；原型边2px、焦点青色offset+3 | stateColors已接正确，不能改边宽和focus-ring；禁止关闭focusRing来抹无障碍 |
| 精确光晕 | pointer-feedback2d固定palette/alpha70、150/边255/blur10、15；原型24%内色/blur9/press brightness1.45 | UI03每对象tone只能选择既有palette，Sprite染色会改场景，不是只读反馈；按下.95已支持无需扩 |
| 弹窗整体入场 | 内内容已有240/600ms、y44/scale.94且reduce=0；Modal外框仍静态 | 外层Modal是fixed全屏scrim，现有布局变换不能等价只移动dialog并维持静止遮罩/焦点；不改世界忙期 |

## 两条路（尚未施工）

- **A：补最小通用外观字段（推荐）**。由引擎/PUI确认限域字体选择、受限外环与焦点/边宽、指针视觉参数、仅dialog的入场投影。成本为共享合同/安全校验/向后兼容/键盘与reduced-motion/真浏览器回归及异人复查；可供其它卡带复用。风险是词表扩大，故不接受任意CSS、任意字体URL、自由动画或世界时序改动，具体可重组部分仍必须回驳新增字段。
- **B：本游戏专用宿主适配**。需Owner明确纯数据例外；局部实现可能较小，但新增游戏自由表现代码，在线/离线两套接缝与后续回归成本更高。选错后要拆除专用适配重新迁回共享字段。

不把缺项改成已完成；本次申请不包含新素材生成、远端写、整套系统启动或任何Owner人门。
