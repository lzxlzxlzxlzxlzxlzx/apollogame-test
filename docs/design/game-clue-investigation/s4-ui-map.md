# S4 结构接线图 · 《现场搜证》

本文件只记录定稿 `prototype.dc.html` → 正式 `LayoutNode`/Canvas 的结构映射；视觉贴图、字距、演出细节在 S5/S6 对齐。逻辑画布固定 1440×900，缩屏只等比缩放，不让档案条推移场景或热点。不得复制原型 DOM/CSS/JS 到运行时。

## 场景与热点

| 对象 | 原型实际矩形 `(left,top,w,h)` | 运行时实体 | 语义动作 |
|---|---|---|---|
| 窗锁 | `(194,370,104,126)` | `object-lock` | `investigate.lock` |
| 书架 | `(404,123,362,486)` | `object-shelf` | `investigate.shelf` |
| 挂钟 | `(1112,92,185,184)` | `object-clock` | `investigate.clock` |
| 茶杯 | `(882,512,102,90)` | `object-cup` | `investigate.cup` |
| 地毯 | `(99,667,780,214)` | `object-rug` | `investigate.rug` |
| 湿脚印 | `(853,572,250,132)` | `object-prints` | `investigate.prints` |
| 信件 | `(1072,480,190,145)` | `object-letter` | `investigate.letter` |

坐标直接由定稿原型 `.prop-*`/`.h-*` 声明换算，S3 manifest 中心/尺寸已与这些矩形相同；`prototype-notes.md` 的旧归一化表有几处与实际 CSS 不一致，结构验收以可运行定稿原型的实际矩形为准。S4 世界层暂为 Shape 灰盒；正式 PNG 像素命中和资产槽在后续素材关接入，未接前不得冒称 1:1 热点轮廓。

## 可见层与世界投影

| 原型态 | 可见 LayoutNode 结构 | 世界只读条件 | UI 动作 |
|---|---|---|---|
| `scene-idle` | 左上标题/目标 `(42,36)`，右上 `required-collected / required-total`，左下线索清单，右下记录/退出 | `GameFlow.current=scene-idle`，Resource 与 `collected.*` Flag | `investigation.exit` |
| `object-hover` / `object-pressed` | 场景物件描边、名称/焦点反馈，按下确认 | 指针/焦点表现态；不改业务 GameFlow | 对应 `investigate.*` |
| `flavor-result` | 底部 178px 覆盖档案条，不改变画布/场景位置 | `GameFlow.current=flavor-result`；`selected-object=2..5` | `investigation.close` |
| `clue-reveal` | z20 遮罩及居中 820×560 证物特写，名称、描述、回看印章 | `GameFlow.current=clue-reveal`；`selected-object=1/6/7` 与 `collected.*` | 首次 `clue.collect`；已收录仅 `investigation.close` |
| `clue-collected` | 特写仍在，盖章、进度和清单并行显示；主场景热点禁用 | `GameFlow.current=clue-collected`；收录 Flag 与 Resource 已提交 | 无重复收录按钮；42 tick 后自动流转 |
| `completed` | 完成卡覆盖，保留 2/2 与已收录清单 | `GameFlow.current=completed` | `investigation.restart` 发入世界，由 GameFlow 数据重置 |
| `exit-confirm` | 520px 确认 Modal，场景可见但热点禁用 | `GameFlow.current=exit-confirm` | `investigation.stay` / `investigation.cancel` |
| `disabled` | 演出期间控件灰化、不可激活；保留文字/进度 | `interaction-enabled=false`；特写或收录过渡态 | 无 |

`cancelled` 也提供 `investigation.restart`。重开只清理本局世界状态，不反向改变 DokiWorld 已返回给宿主的结果；若宿主合同已提交结果，宿主有权重新发起新实例。

选中物编码仅是世界内有限枚举：`0=无, 1=窗锁, 2=书架, 3=挂钟, 4=茶杯, 5=地毯, 6=湿脚印, 7=信件`。UI 桥只能投影为闭集只读值，所有按钮通过 ActionSink 入 `InputQueue` 的 `phase=action`；不得在按钮 handler 内执行游戏规则。

## S4 验收边界

- 鼠标/触控点击场景物件与键盘 Tab/Enter/Space 可达同一具名调查动作；Escape 按定稿语义关闭特写/档案条/退出框，空闲时打开退出确认。
- HUD、Modal、档案条与场景同一 1440×900 缩放框；弹层进退时主场景中心与所有热点的屏幕位置不变。
- S4 先验信息层级、状态可见性和动作路径；字体/纹样/AI 正式资产、alpha 实形热点和细致时序在 S5/S6 验证，任何降格须在对齐单里逐条裁决。
