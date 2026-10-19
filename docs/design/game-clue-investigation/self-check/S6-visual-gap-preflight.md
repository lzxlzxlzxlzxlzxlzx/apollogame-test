# GCI-S6-UI-02 · 原型视觉剩余缺口实查 · 2026-10-13

施工线只改本游戏纯数据。art 冻结、共享 PUI 域不动；本单是给主聊天的裁决输入，不是已获 A/B 的施工许可。

## 已能重组的部分

原型按钮的矩形形状与色彩不需新能力：既有 `Button.kind:'ghost'`、`skin:''`、`stateColors`、`layout.radius` 可消除 hero 固定切角/金色流光。三枚收录按钮使用原型纸金 `#E3B765`、深字 `#251B11`；普通继续/退出留下/重开使用原型深青 `#1A2931` 与亮字 `#FBF2DC`。不改 action、可见条件、按钮位置宽高或场景几何。hover/pressed/disabled 各有闭集状态，不写 CSS/DOM。文字精确尺寸仍受下表限制，不能称按钮整体 1:1 完成。

## 不能用当前闭集严格表达的部分

| 原型证据 | 当前能力实查 | 为什么既有重组不成立 |
|---|---|---|
| 原型按钮继承16px，收录按钮font-weight:700 | `src/ui/components/render.ts:400`普通Button固定font-size:12px；ButtonProps无字级/字重，邻近sizeMap属于Label，不适用于Button。 | 切为ghost已去除hero材质，但字变为12px。不能嵌假Panel按钮绕开原生语义；建议受限labelSize/weight闭集，缺省不变。 |
| `prototype.dc.html:33` `.evidence { width:820px;min-height:560px;padding:26px 40px;border:12px solid #5d452e;background:linear-gradient(145deg,#e7ddc2,#bba875) }` | `src/ui/components/render.ts:896` `widthMap={sm:320,md:460,lg:640,xl:800,wide:1080}`；内框固定 `border-radius:12px`，无skin时固定主题底/1px边；`layout`被拼到外scrim，而非内框。`ModalVisual`仅minHeight、padding、titleSize、titleAlign、contentAlign。 | 820不在闭集。用layout.width只改外遮罩；子Panel叠盖原生边框无法消除原生圆角/滚动/语义标题区域，且会损伤原生close/焦点。skin可换框图但不能改800→820、3px背景blur，且当前无已批准纸框资产。 |
| 同行 `.veil {background:#05090cc9;backdrop-filter:blur(3px)}` | `renderModal`固定 `background:rgba(0,0,0,0.9)`，没有scrim blur参数。 | Screen.blur会作用整屏而非模态背后且可能模糊正文，不能替代backdrop-filter；不得手改DOM样式。原型alpha约.788与UI手册建议scrim≥.85有冲突，需要明确裁决，不能偷偷降到原型值。 |
| 同行 `.evidence-art {height:274px;border:7px solid #7a6345;overflow:hidden}`；img width100%/height100%/contain | 隔离浏览器实测slot716×274，内容img702×468、objectFit=contain，图像顶部与slot内顶对齐，底部被裁切；不是居中cover。`ImageProps`只有src/alt/fit/radius/blur/tint/bind，`renderImage`没有object-position；Panel无overflow:hidden闭集，scroll=true是overflow-y:auto。 | 当前contain把完整图居中缩进274框，不同于原型。cover中心裁切仍不等价top裁切；用大Image溢出Panel会把内容压到下方，不得伪造截图当完成。最小为Image增加受限position:'top'等枚举并用cover；边框尺寸可随后由纯数据嵌套底色Panel构成，不需要游戏自由代码。 |

已查生产线：`docs/playbooks/ui.md`、`docs/design/ui-playbook.md`、`module-ui`、`check-ui`、`ask-owner`；UI机读字典为`src/ui/components/catalog.ts`而非sim capability registry。现存 Modal.skin/skinSlice/visual 全部核过。共享树多人在途，未以pull/rebase覆盖现场。

## 批量 A/B 建议（由主聊天提交 Owner）

- A：PUI补最小通用视觉字段。Modal.visual 增受限内框 width、radius、四边padding、fill（安全色/受限双端渐变）、border{width,color}；Modal.scrim增加受限颜色/opacity与blur；Image增加position闭集（至少center/top）。保持原生dialog、closeAction、焦点圈定与旧字段缺省字节不变。代价是共享schema/render/validator+深浅审计与回归测试；复用所有定稿精确模态/缩略图。选错代价为扩大UI词表，因此不加游戏专用字段、不收任意CSS。
- B：本游戏宿主专用CSS/DOM适配，需Owner明确游戏层例外和技术债。实现较少但破坏纯数据统一路径，后续换宿主/离线包和焦点回归要长期双轨维护，错误代价高。

推荐A。未获裁决前只完成既有Button数据修复，不新增资产、不修改原型、不擅自填未知字段，也不把仍未复刻的纸框/裁切标绿。

## Owner 裁决回执 · 2026-10-13

主聊天转达 Owner 明确选择 A：补通用字段（包括受限 Button 字号/字重）；遮罩保留当前 0.9，其余按原型复刻。引擎程序已接单。此为当前裁决，不反向修改定稿原型；0.9 遮罩列为明确允许差异。字段尚未落地前不预填提议接口。

当前按钮纯数据修复冻结：manifest SHA256 `8a7306cb7439875b1a79b320aa66c7303b01534075a77caa0856bb19449f1a9d`。局部独立复查不代表整关 S6 已通过；纸框、裁切、按钮字体等待通用能力落地后接线再验。
