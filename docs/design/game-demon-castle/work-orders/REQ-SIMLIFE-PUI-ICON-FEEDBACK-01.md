# REQ-SIMLIFE-PUI-ICON-FEEDBACK-01｜通用原生图标按钮精确反馈

2026-10-16，提需BDM程序；Owner已在程序会话直接选择“A：补通用PUI反馈配置（推荐）”。施工主体：**PUI Codex/root（2026-10-16 本地领锁，未推送远端）**；status: in-progress。BDM仅提出固定视觉需求并负责后续Host闭集数据消费，不越界`src/ui/**`。

## 实查与接受判断

保持获批修订02的精确反馈属于真缺口；去圆框本身已由现有quiet/iconOnly/skin空串/borderWidth0/radius0重组完成，不因去圆框扩能力。[完整实查、原型hash、Owner A及历史B](DEMON-CASTLE-UI-RUNTIME-02-feedback-decision.md)。当前`skinFeedback`仅用于resolved skin且拒绝空skin，无hover/pressed位移或disabled灰度；tilt3d/press3d与目标不等价。

真实基线：1440×900 hover为0px/brightness1.07，pressed为+1px/.9；[主程序可复跑诊断](../../../../scripts/demon-castle-ui-runtime-02-boundary.probe.mjs)及[计算样式](../self-check/DEMON-CASTLE-UI-RUNTIME-02-boundary.measurements.json)。其中64/64名称是人工通用压力备注，不属于本PUI单，不申请Label能力或改丝带。

## 固定视觉合同

- 原型SHA256：`4c39e9f04dab441945a277bea000ab3db71fd2870996442a1177a4a7d28ee415`，不得修改批准HTML追认实现。
- 默认：透明、无框无盘、无投影；已批准PNG正常显示，缺图仍有可见文字及原生可访问名称。
- hover：仅图像表现层上移3px，brightness1.2与颜色`#d6b6ef`/半径5px轮廓光；120ms。
- pressed：仅表现层下移3px，brightness.85，不残留hover光晕，pressed优先hover；120ms。鼠标/触控/Enter/Space均只执行既有action一次，取消/失焦/卸载不残留pressed。
- disabled：LayoutNode真实disabled数据态整体opacity.48，图像grayscale.7、无位移，不能执行action。不能用运行后仅设置DOM disabled属性冒充renderer禁用视觉验证。
- 命中盒、Tooltip锚点、独立键徽、可访问名称、焦点环及焦点位置不跟随图像抖动；reduced-motion只关闭时长，不取消状态辨识。

## 允许范围与交付

只归PUI：通用Button闭集types/catalog/validate/render/server、相关测试、game-i活例、UI手册与专用审计。由PUI评判最终最小可选数据形态，提供Host可消费的实名写法；禁止游戏ID特判、自由CSS/selector/脚本或URL配置。省略新字段的旧Button字节/行为兼容，不放宽原图标URL、label、焦点、禁用和缺图合同。不改World/存档/hash、输入路由、资产登记或Owner人门。

交付必须有真实四态计算样式/关键帧、鼠标触控键盘/原生焦点/取消卸载/断图回退/reduced-motion、严格非法字段与有限数字拒收、活范例与深浅审计、唯一锚点撤修真红及恢复全绿。复查人非施工人；本票PASS不代签Host集成或整单。Host消费/395项正常旅程和相关回归由BDM接合同后复验。
