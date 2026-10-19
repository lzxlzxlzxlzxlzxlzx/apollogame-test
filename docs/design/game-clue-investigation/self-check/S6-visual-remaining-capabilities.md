# S6 剩余细节闭集查证 · 2026-10-13

## Owner 裁决更新 · 2026-10-14

Owner明确回复「A：统一补通用字段（推荐）」：批准下列已确认Label行高/字重、Panel边框、热点标签位置字号及每对象tone，已交引擎程序实现并独立复查。字距、旋转、按下缩放继续复用，不重复开发。外金环及精确字体仍为待实证差异，不据此扩大许可。

另明确回复「改深青色，优先可读（推荐）」：浅纸底小标题同步原型改深青，验收对比度≥4.5。此判词不代替更新后截图和审计，也不代签S6人门。

本单只读，不改共享源码或正式manifest。源文件可能由引擎施工中更新，以下按本次实际内容核对，不以“接口已出现在工作树”当作已独立复查可消费。

## 已覆盖：不上报新能力

1. **字距**：`LabelProps.tracking?:number`（types.ts），`renderLabel`输出`letter-spacing:${num(p.tracking)}px`。原型eyebrow2.08、标题2.4、记录标题2.16、清单标题1.28均可纯数据。Button如以原型正文默认字距无需扩展。
2. **旋转/缩放/透明度**：`layout.rotate/scale/opacity`和`transformFrom/transformMotionMs`已有。印章末态12deg/.86，起态scale1.8、同12deg、380ms可表达；外bare Panel opacity.86，内bare Panel anim:'fadeIn'、animMs380，再内层transformFrom，可复用两层实现0→.86与缩放并行，不要往transformFrom偷加opacity。server.ts已有`@keyframes apollo-fadeIn{from{opacity:0}to{opacity:1}}`。
3. **按下轮廓缩放**：`src/renderer/pointer-feedback2d.ts`真实`const squeeze=pressed?0.95:1`，用于maskArt的entityMatrix，不改World/Sprite或命中尺寸。原型缩放的也是hotspot反馈层，不是PNG图片本体。因此不需要新增pressedScale来表达.95。之前只看DOM代理transform=none不能推断Canvas没缩放。
4. **Panel渐变**：`Panel.bg:{custom:...}`经resolveFill/safeFill支持合法linear/radial-gradient。可以使用已批准原型颜色，不需要给Panel另造渐变字段；仍不能利用custom串注入`;border:`等CSS。

## 真缺口与最小建议

| 项 | 原文/实际行为 | 为什么重组不成 | 最小可复用补项 |
|---|---|---|---|
| 文本行高 | LabelProps无lineHeight；renderLabel字号、bold、font、tracking可设，但无line-height | evidence描述要求19×1.6=30.4px，清单14×1.7=23.8；给Label固定height只控制盒，不控制多行基线；拆每行会冻结断行且破响应式 | Label受限数字lineHeight（建议明确px单位） |
| 印章字重900 | Label.bold仅输出700；font是具名槽，换heavy改变字体不是指定同字体字重 | 额外叠重影/描边改变轮廓，不等价原型font-weight900 | Label受限weight枚举，缺省保留bold兼容；至少900 |
| 印章5px红边 / 精确Panel边 | renderPanel固定`border:1px ... ${border}`；edge只语义枚举；bare=true同时不画bg/edge | 5层Panel会画五条主题边且挤内内容；四条装饰Panel仍各带固定主题边/纹理，不能声称是精确红框；Divider也是主题线。不能嵌套Modal充当印章 | Panel可选受限border{width,color}；缺省保持旧1px及edge。印章用透明bg、radius0、border5+bare子布局 |
| 完成外金环 | 原型`box-shadow:0 0 0 12px #d2a54c22,0 24px70px #000`；Modal当前固定阴影；Dialog overflow-y:auto | 负坐标外装饰会被dialog滚动裁掉。Panel.shadow只有y/color硬偏移，accent是固定1px jade+固定blur34，不能精确12px/指定色 | 优先复用在途Modal视觉字段：外层714宽、透明填充/12px金色alpha边、内层690宽1px金边+渐变，有望等价环的几何；须实渲染确认背景合成和不挤原690内容。若在途Modal border/fill无法该组合，再增受限外ring{width,color}，不先认定必须加自由shadow |
| hover标签位置和样式 | `cart-run-core.ts` focus anchor固定translate(-50%,-100%)；投影的是Transform.x/y；Button固定quiet。`focusTargets`严格keys仅entity/label/action/when | 原型标签在物件顶上8px、14px、cyan边，不是物件中心附近12px主题标签。改实体Transform会破scene与mask；游戏UI没有render-local hover flag，不能复制静态Label伪造跟随 | focusTargets可选labelPlacement:'center'/'above'、labelGap（above读取现有Shape/Sprite框顶）、受限labelSize与语义chrome样式；缺省保持旧输出 |
| 每物件反馈色及精确光晕 | CartPresentation.pointerFeedback仅全局tone+pressedMs；PointerFeedback2DLayer PALETTE固定cyan[96,226,241]/gold[245,207,117]；shadowBlur10/15，边alpha255、内70/150 | 原型flavor cyan#7ee9ec、clue gold#f3bf67；hover内24%且非独立强描边、blur9，press还brightness1.45。一个全局tone无法同时区分线索/普通，给Sprite染色会改背景观感且不再render-local | 首要最小项为focusTargets可选tone覆盖全局；若Owner要求色值/alpha/blur逐像素复刻，可新增共享受限反馈visual参数（颜色/alpha/glow/pressBrightness），不得游戏重画mask |

## 字体与几何验收注意

原型Microsoft YaHei，house.ui为Noto Sans SC等；`Label.font:'ui'`不会自动变成原型字体。当前CartPresentation.theme只三house枚举，不能在JSON塞自写UITheme；如果严格字形一致也是目标，需通用受限字体槽/主题排版覆写，不能仅凭相同字号叫逐像素一致。先由主聊天结合Owner“其余复刻”确认该最小范围，不擅改主题或下载字体。

## 提交主聊天的结论

字距、静态印章旋转/缩放/透明度、轮廓按下.95已覆盖；先用基座。可确定缺项为Label行高/900字重、Panel可控边、focusTargets标签定位/样式和每对象tone。外金环优先待在途Modal字段验证透明外边+内框的重组路径，未证伪前不强要新增shadow接口。以上均不动世界规则时序，不扩展本游戏自由runtime。

## GCI-S6-UI-03 · 追加批量裁决

- A：补最小通用排版与指针表现字段；影响共享 UI 校验/渲染及卡带只读反馈投影，需要向后兼容、透明反例、焦点与真实几何回归。可供其它卡带复用；选错成本是扩大词表，所以先限上述确定缺项，不加任意CSS或世界状态。
- B：本游戏专用宿主适配，需明确自由代码例外；初期实现较少，在线/预览/离线双轨和焦点/命中回归长期由游戏维护，选错成本较高。
- 推荐A；本项另候Owner判词，不把前一张UI-02对纸框/裁切的许可扩大为所有反馈改动。严格字体字形和外金环仍先实测重组，不预先申请自由主题。

### 父背景 + padding5 + 内实底 Panel 的追加排除

该重组能近似实底相框，但印章原型中心透明，应该露出下方145deg纸渐变。内Panel实底会画出多余矩形贴片；父/子非bare还各强制1px主题边，bare则不画bg。故不能用该写法把“5px指定红边、透明中心”的精确对齐标绿。四条背景条也各有主题边，Screen则忽略布局并强制页面高，不是可用画条器。若Owner允许近似实底印章可降低要求，但当前“其余复刻”没有此豁免。

### 范围分组（主聊天裁定，不预施工）

- **本次纸框必需排版**：Label.lineHeight影响19px多行描述的30.4px行高、按钮下方位置及清单23.8px行距；与裁切像素计算独立但关系到全框几何。
- **本次纸框装饰精度**：Label.weight900、印章Panel受控border；不改变图框和命中映射，不应混称“PNG裁切必需”。
- **旧POINTER投影差异**：标签above/gap/字号和每对象tone；不依赖纸框/图像字段，可单独裁定范围。原型press.95已覆盖。
- **优先等待在途字段验证重组**：完成外金环；不预先申请新shadow。skin需要新的已批准框图，当前art冻结；fx glow语义色/模糊不是12px硬环。

主聊天已接受按原型重排HUD/Modal/按钮、删除额外可见progress/header/X/返回按钮但保留Escape/焦点/原信号；cancelled视觉可改档案条并保持cancelled状态和restart action。世界时序不在本轮改动范围。

### 在途 UI-02 实际字段复核

当前 Modal.visual.fill/border.color 都经 `opaqueHex`，fill不能transparent，border不能半透明；`renderModal`最终仍固定box-shadow且overflow-y:auto。因此前述“714宽透明框+12px半透明边”的优先重组路径在当前真实UI-02闭集不成立。此结论是对提议的实际证伪，不是请求游戏侧注入CSS；完成金环仍留差异，由主聊天决定范围/裁决。UI-02纸框候选本身仅使用不透明原型纸框，不因此放宽字段。
