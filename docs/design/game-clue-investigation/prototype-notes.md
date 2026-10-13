# 《现场搜证》S1-P 原型说明

> 版本：S1-P-01；状态：**Owner 已真机目击并于 2026-10-12 明确判定“原型通过”**。本说明连同 `prototype.dc.html` 只定义 authoring-time 目标，禁止复制其中的自由 DOM/CSS/JS 到生产运行时。

## 画布、构图与安全区

- 逻辑画布固定 **1440×900**；浏览器缩小时等比缩放，绝不重排至另一套布局。
- 主场景、书架、挂钟、茶杯、地毯、三项线索均为原创 AI 生成图像；旧版 CSS 家具、雨、窗、书桌、灯具、证物和内嵌 SVG 已从原型渲染路径移除。无第三方游戏素材、字体、音频或联网依赖。
- 左上安全区（42,36）为标题与目标；右上安全区为必要线索进度；左下为可展开的清单；右下为记录与退出。它们不遮挡场景的核心热点。
- 下方档案条高度 178px（约 19.8%），仅在普通物件反馈时以 `transform` 从画布外覆盖进入；它永不改变 `#stage`、HUD、场景或热点的布局/坐标。证物特写主体 820×560，证物图 274px，均在画布内。

## 热点：归一化边界与命中设计

| 物件 | 类型 | 归一化区域（x,y,w,h） | 形状 | 说明 |
|---|---|---|---|---|
| 破损窗锁 | 必需线索 | .135,.411,.072,.140 | PNG alpha | 仅 Alpha ≥ 150 的实心 PNG 像素接收鼠标/触控命中；键盘保持等价可达 |
| 旧书架 | 普通 | .281,.137,.251,.540 | PNG alpha | 仅书架不透明像素命中 |
| 挂钟 | 普通 | .871,.102,.128,.204 | PNG alpha | 仅圆钟实体命中，不取外接矩形 |
| 冷掉的茶杯 | 普通 | .610,.678,.071,.100 | PNG alpha | 与脚印间留足空隙，透明边缘不命中 |
| 褪色地毯 | 普通 | .069,.761,.542,.238 | PNG alpha | 仅地毯实体命中，透明外缘不命中 |
| 桌上湿脚印 | 必需线索 | .766,.636,.174,.147 | PNG alpha | 在书桌前方，透明像素不接收命中 |
| 半烧毁信件 | 可选线索 | .865,.606,.132,.161 | PNG alpha | 纸张轮廓外扩，透明像素不接收命中 |

生产阶段仅冻结 `rect|circle` 方向；此表不是正式合同。原型用可视化虚线热点开关审阅命中区域和抢点风险。

## 九态与转换

| 状态 | 触发 | 可见语义 |
|---|---|---|
| `scene-idle` | 开局、关闭反馈 | 场景、目标、0/2 进度与入口 |
| `object-hover` | hover / Tab 焦点 | 高对比描边、标签、焦点环 |
| `object-pressed` | Pointer/Enter/Space | 145ms 压缩与亮度确认 |
| `flavor-result` | 普通物件 | 下方档案条与“继续调查” |
| `clue-reveal` | 点击线索 | 压暗、证物抬升、名称与描述 |
| `clue-collected` | 首次收录 | 盖章、清单与进度并行更新 |
| `completed` | 两条必需线索都首次收录 | 完成章与重置入口 |
| `exit-confirm` | 退出或 Escape | 取消确认；确认只演示 `cancelled` |
| `disabled` | 提交演出 120–430ms | 其余热点短暂灰化且不可操作 |

重复点击已收录线索只重开特写，绝不增加进度；普通物件从不推进完成。控制台可直接切到每一状态。

## 演出、层级与 reduced-motion

| 链段 | 时长/缓动 | 并行与层级 |
|---|---|---|
| 普通调查 | 按下 145ms；档案条 220ms ease-out | 热点压缩后，档案条（z10）由底部进入 |
| 线索开场 | 230ms 后抬升；`lift` 240ms ease-out | 热点确认与禁用同时开始；场景遮罩 z20，再显示证物 |
| 线索收录 | 盖章 380ms；禁用 430ms | 盖章、进度、清单在同一收录节点并行 |
| 完成 | 收录稳定后 690ms，再 `lift` 600ms | 不截断最后一次收录；完成卡 z20 |
| 自动回放 | 书架 → 窗锁 → 脚印 | 仅审阅用途；演示链目标在 1.2–1.8 秒收录节奏内 |

`reduced-motion` 模拟会把位移、雨线和闪烁时间压至近零，但保留相同状态顺序、文本、进度和结果；也尊重审阅者显式切换。z-order：场景 0，PNG 证物 3，热点 5，HUD 8，档案条 10，遮罩/对话 20，审阅控制 40。

## 输入与可访问性

- 热点均为真实 `button`：鼠标、触控、Tab、Enter、Space 均走同一交互。
- `Escape` 依序关闭特写、关闭档案条、关闭退出确认；无弹层时打开退出确认。
- 标签、描边、文字与“已收录”印章共同表达状态，不只依赖颜色；全部程序化证物图有中文替代文字。
- 生产实现将以 LayoutNode / render / Signal 重新表达这些目标，不复用原型代码。

## 占位素材与未来槽位

| 当前占位 | 来源 | 未来正式消费槽 |
|---|---|---|
| 书房背景 | `ui-refs/rainy-archive-background-ai-v1.png`，原创 AI 生成 | `sceneBackground` 及可替换场景皮肤槽 |
| 窗锁透明 PNG | `ui-refs/damaged-window-latch-ai-v1.png`，原创 AI 生成 | `objectImageUrl` / 已解析资产 key |
| 书架透明 PNG | `ui-refs/archive-bookcase-ai-v1.png`，原创 AI 生成 | `objectImageUrl` / 已解析资产 key |
| 挂钟透明 PNG | `ui-refs/stopped-clock-ai-v1.png`，原创 AI 生成 | `objectImageUrl` / 已解析资产 key |
| 茶杯透明 PNG | `ui-refs/cold-teacup-ai-v1.png`，原创 AI 生成 | `objectImageUrl` / 已解析资产 key |
| 地毯透明 PNG | `ui-refs/worn-rug-ai-v1.png`，原创 AI 生成 | `objectImageUrl` / 已解析资产 key |
| 鞋底纹透明 PNG | `ui-refs/wet-footprints-ai-v1.png`，原创 AI 生成 | `objectImageUrl` / 已解析资产 key |
| 信件透明 PNG | `ui-refs/burned-letter-ai-v1.png`，原创 AI 生成 | `objectImageUrl` / 已解析资产 key |
| 盖章、描边、HUD | CSS 视觉占位 | LayoutNode 主题、EffectKind、UI 皮肤槽 |
| 收录音效 | 未播放；文字标识代替 | SynthAudioPort 的 SfxSpec（若 S2 验证可表达） |

## 候选生产映射（未实查，不是 capability plan）

- 现场热点：候选 `Clickable` / 命中投影；须在 S2 查证 `rect|circle`、hover/focus/disabled 的数据化表达。原型的鼠标/触控不再由热点按钮接收：舞台统一接收指针，先按浏览器 `object-fit: contain` 的实际绘制矩形换算、再以 Alpha ≥ 150 判定命中；高亮遮罩也使用同一 `contain` 矩形。半透明阴影、羽化边缘和透明像素既不高亮、也不显示手型、也不触发。隐藏按钮只保留 Tab/Enter/Space 的等价无障碍入口。正式合同应由宿主明确对象图、锚点、缩放、旋转与可读像素来源。若现有能力只支持 `rect|circle`，这会成为 S2 的 A/B 裁决项，而非游戏层逃生代码。
- 状态与完成：候选 `t3-flow`、具名 Signal、`EventWhen`、`Effect`；须确认“首次收录集合”的通用声明式会话能否重组。
- 收录演出：候选 `t3-timeline` + `t1-tween` / `t2-presentation-track` + `VisualEffect`；须在 S2 实查。
- UI：生产时是 LayoutNode，现场物件与特效是 render components，严禁直接挪用本稿 DOM。
- DokiWorld URL、strict parser、preview/completed/cancelled、资产闭包全留待原型定稿后的 S2，当前不作推断。

## 已知偏差

1. AI 图仅为 S1-P 原创演示资产，尚未经过正式资产槽、人审或生产索引流程，不能被当作生产美术完成。
2. 原型目前以 PNG 的实心 alpha 轮廓作点击与高亮；S2 须决定正式合同是否需要像素级命中，或以 `circle`/其他声明式形状近似。
3. 原型以定时器回放视觉时序；正式实现不得让墙钟决定调查规则，而应由已提交状态与确定性演出能力驱动。
4. 本稿不播放声音；这避免将任何外部音频误作授权资产，S2 才评估合成音效表。
5. Alpha 命中需要可读取像素的对象图；远程跨域图片、解码失败或恶意超大资源不能静默退化为成功点击。S2 必须冻结安全加载、尺寸限制、CORS/Blob 策略及 `rect|circle` fallback/cancelled 语义。

## Owner 定稿记录

- 定稿版本：S1-P-01
- 真机目击：2026-10-12；通过本机 HTTP 静态页 `http://127.0.0.1:4173/prototype.dc.html` 审阅并完成交互修订确认。
- Owner 判词：**“好的，原型通过，接下来可以参考原型开始正式的游戏实现”**。
- 定稿边界：固定 1440×900 画布、七项原创 AI 演示素材、九态交互、主场景不随档案条位移，以及 PNG 实心 alpha 命中/高亮的目标体验；正式实现仍须先完成 S2 能力裁决。
