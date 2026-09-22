// UI 自描述目录（owner 2026-06-26：给 LayoutNode 也建「约束式数据合成」那台机器）。
//
// 一份数据三用：① 喂 LLM（whenToUse + 字段 schema + sample → 弱模型被告知闭 schema、照样例填空，
// 不再靠记忆瞎猜）；② 驱动校验器 `validate.ts`（未知 type / 错枚举 / 缺必填 → 报错）；③ 当 per-控件 sample 集
// （展示台/文档逐条渲染）。这正是 capability-catalog 那套自描述，复制到 UI 域——弱模型 hold 得住靠这台机器，不靠压小词表。
//
// 红线：本目录只描述**闭词表**（枚举值/类型/默认/必填），不含任何自由代码；sample 全是合法 LayoutNode 数据。

import type { ComponentType, LayoutNode } from './types.js';

/** 字段 schema：名 + 类型 + （枚举值/默认/必填）。type 是「数据形状」不是 TS 类型——弱模型按它填。 */
export interface UiPropSpec {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'enum-or-number' | 'node' | 'nodes' | 'list' | 'object';
  values?: readonly string[]; // type:'enum'/'enum-or-number'：具名档合法闭集（'enum-or-number' 另允许任意数字）
  default?: string | number | boolean;
  required?: boolean;
  describe: string;
}

/** 一个活范例指针：game-i 展台里演这件的段（哪个 tab 的哪一段·演的是什么）。
 *  `section === tab` = 该 tab **整页**演这件（如 tab-shop/tab-pick 组合演示页·无独立段 id）。 */
export interface UiDemoRef {
  tab: string;      // 展台 tab/模块 id（如 'tab-display' / 'mod-mmo'）
  section: string;  // 段 id（gallery.ts 里 sectionTitle 的第一参·如 't-progress'）
  note?: string;    // 这段对本控件演了什么（一句话）
}

/** 控件自描述：是什么 + 何时用 + 字段 schema + 是否收 children + canonical sample + **去哪看活的**。 */
export interface UiComponentSpec {
  type: ComponentType;
  summary: string;
  whenToUse: string;
  children: 'none' | 'optional' | 'required'; // 是否/必须收 children
  props: readonly UiPropSpec[];
  sample: LayoutNode;
  /** 活范例段（REQ-UIINDEX·owner 2026-09「agent 找不到他想要的东西」）：本控件在 game-i 展台的演示段。
   *  **索引单一真相**——`scripts/ui-find.mjs` 读它做检索、`ui-find.test.mjs` 校验段 id 真存在（防漂移）。
   *  一件常散在多个 tab（Label 基础在 tab-display、艺术字/大字在 tab-new）——正是它要治的病。 */
  demo?: readonly UiDemoRef[];
  /** 检索关键词（**中文俗名/场景词**·非控件名）：让 agent 按「血条」「货币」「伤害数」找得到件，
   *  而不必先知道它叫 ProgressBar/Label。`ui-find.mjs` 的主要命中面。 */
  tags?: readonly string[];
}

// Label 颜色令牌闭集（与 LabelProps.color 类型对齐·单一真相）：基础语义 + 阵营 mine/foe + 深墨 ink。
const COLOR = ['text', 'sub', 'dim', 'jade', 'gold', 'ok', 'warn', 'danger', 'mine', 'foe', 'ink'] as const;
const SIZE = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl'] as const;

export const UI_CATALOG: readonly UiComponentSpec[] = [
  // ── 容器 / 布局 ──────────────────────────────────────────────
  {
    type: 'Screen', summary: '全屏根容器·页面背景层', whenToUse: '每个页面的最外层根节点；铺底色/贴图、可居中内容。', children: 'optional',
    props: [
      { name: 'bg', type: 'string', describe: '面填充三态·色库优先：语义令牌 panel/raised/sunken/jade/gold/ok/warn/danger/ink/transparent(换皮自适应·transparent=透明底 see-through 带透明贴图) | 预设配色 jade-sheen/gold-sheen/ink-deep/steel/blood/frost/ember/void(固定观感) | {custom:"#hex"}(创作者特别指定才用)。缺省=主题 pageBg。裸 hex 串仍收但 audit 会标' },
      { name: 'image', type: 'string', describe: 'cover 整图背景 URL' },
      { name: 'bgTexture', type: 'string', describe: '平铺贴图 URL（repeat·可被 bgScroll 滚）' },
      { name: 'blur', type: 'number', describe: 'backdrop-filter 模糊 px' },
      { name: 'center', type: 'boolean', describe: '垂直水平居中子项' },
      { name: 'bgScroll', type: 'object', describe: 'UV 背景滚动 {x,y,ms}' },
    ],
    sample: { type: 'Screen', id: 's-screen', props: { center: true }, children: [{ type: 'Label', id: 's-screen-t', props: { text: 'Hello ZeroCraft', size: 'xl', color: 'gold', bold: true } }] },
    tags: ['全屏', '背景', '底图', '页面', '根节点', '开场屏', '大厅', '铺底'],
  },
  {
    type: 'Panel', summary: '容器（边框/底/圆角）或无框布局组（bare）', whenToUse: '分组/卡片/侧栏/牌桌；row/column/grid 布局都靠它。只做布局分组用 bare 避免层层框。', children: 'optional',
    props: [
      { name: 'title', type: 'string', describe: '阔字距小标题' },
      { name: 'titleIcon', type: 'string', describe: '标题前内联图标 URL（1.05em 随字号·配台账套装图标·缺省纯文字）' },
      { name: 'scroll', type: 'boolean', describe: 'overflow-y:auto 可滚' },
      { name: 'bare', type: 'boolean', describe: '无框纯布局容器（不画边/底/圆角）' },
      { name: 'bg', type: 'string', describe: '面填充三态·色库优先：语义令牌 panel/raised/sunken/jade/gold/ok/warn/danger/ink/transparent(换皮自适应·transparent=透明底 see-through 带透明贴图) | 预设配色 jade-sheen/gold-sheen/ink-deep/steel/blood/frost/ember/void(固定观感) | {custom:"#hex"}(特别指定才用)。缺省=主题 bg1。裸串仍收但 audit 会标' },
      { name: 'vignette', type: 'boolean', describe: '四周渐暗暗角' },
      { name: 'accent', type: 'boolean', describe: 'jade 高亮框 + 柔光' },
      { name: 'glass', type: 'boolean', describe: '磨砂玻璃（backdrop-blur + 半透底·HUD 浮 3D/大图上）' },
      { name: 'skin', type: 'string', describe: '面覆盖皮 URL（复合按钮框皮·整面 cover/9-slice·art 即框·children 叠其上·配 action=贴图按钮·动态文字不烤进图）' },
      { name: 'skinSlice', type: 'number', describe: 'skin 9-slice 源边距 px（画框式·不填=cover）' },
      { name: 'bgTexture', type: 'string', describe: '平铺贴图 URL' },
      { name: 'pattern', type: 'enum', values: ['stripe', 'checker'], describe: '程序化纹理叠层（斜条纹/棋盘格）' },
      { name: 'action', type: 'string', describe: '容器可点→点击信号名（整个容器作点击目标·同 Button）' },
      { name: 'actionArg', type: 'string', describe: '点击信号参数' },
      { name: 'edge', type: 'enum', values: ['jade', 'gold', 'ok', 'warn', 'danger', 'mine', 'foe'], describe: '描边语义/阵营色（覆盖默认线·mine/foe=我/敌阵营框·配 layout.radius 异形/虚线 dashed）' },
      { name: 'dashed', type: 'boolean', describe: '虚线描边（落点/占位圈）' },
      { name: 'shape', type: 'enum', values: ['pill', 'hexagon', 'diamond', 'shield', 'ribbon', 'chevron', 'tag', 'cut'], describe: '异形容器轮廓（闭集·复用 Button 同套 clip-path·缺省=矩形）。非矩形容器（异形菜单卡/盾形板/蜂窝格）用它·不必贴图硬凑；命中区=包围盒·异形须给足宽高避免裁掉内容' },
      { name: 'shadow', type: 'object', describe: '硬边平移投影 {y:number, color?:SurfaceToken|色串}——卡通"浮空感"基件（渲 box-shadow:0 <y>px 0 <color>·硬边非模糊）。color 缺省=深墨·优先填 SurfaceToken 换皮自适应。区别 accent 柔光/press3d 交互态：这是常态投影。与 accent/skin/edge/shape 可叠' },
    ],
    sample: { type: 'Panel', id: 's-panel', props: { title: 'SECTION' }, layout: { direction: 'column', gap: 8, padding: 16 }, children: [{ type: 'Label', id: 's-panel-l', props: { text: '面板内容' } }] },
    tags: ['面板', '框', '容器', '背景板', '分组', '卡片底', '侧栏', '牌桌'],
    demo: [
      { tab: 'tab-layout', section: 't-row', note: '横向 row 弹性分栏' },
      { tab: 'tab-layout', section: 't-col', note: '带标题的纵向容器' },
      { tab: 'tab-layout', section: 't-grid', note: '自适应网格货架' },
      { tab: 'tab-new', section: 't-panelprops', note: '无框/暗角/封顶居中' },
      { tab: 'tab-new', section: 't-fill-preset', note: '八组预设配色底' },
      { tab: 'tab-new', section: 't-panelshadow', note: '硬边投影浮空感' },
    ],
  },
  // ── 文本 / 媒体 ──────────────────────────────────────────────
  {
    type: 'Label', summary: '文本（颜色/字号/字体/绑定/打字机/数字滚动/富文本）', whenToUse: '一切静态/绑定文字。多段着色用 spans；数字滚动用 tween；绑世界值用 bind。', children: 'none',
    props: [
      { name: 'text', type: 'string', describe: '文本（spans/tween/bind 提供内容时可省）' },
      { name: 'size', type: 'enum-or-number', values: SIZE, default: 'md', describe: '字号档（具名令牌 xs10..xxxl34·保和谐默认）或裸 px 数字（复刻像素稿精确字号·8→任意大）' },
      { name: 'color', type: 'enum', values: COLOR, default: 'text', describe: '颜色令牌（11 闭集令牌·换皮自适应）。特别指定色用 {custom:"#hex"} 逃生（同 Panel.bg 三态·audit 标记建议迁令牌·绝不收裸串）' },
      { name: 'bold', type: 'boolean', describe: '加粗' },
      { name: 'font', type: 'enum', values: ['ui', 'mono', 'pixel', 'display', 'serif', 'impact', 'heavy', 'epic', 'fantasy', 'elegant', 'script', 'hand', 'scifi', 'terminal', 'comic', 'stencil', 'western', 'retro', 'marker', 'bubbly', 'gothic', 'fashion', 'shadow', 'round', 'cnbrush', 'cnwen', 'cnround', 'jpbrush', 'jppen'], describe: '字体槽：基础 ui/mono/pixel/display/serif + 18 款拉丁艺术字（OFL·base64）+ round(Fredoka 圆润数字/大标题·可变字重 300–700·bold→700·url 惰性载) + 5 款 CJK 艺术字（cnbrush 中文毛笔/cnwen 中文细宋/cnround 中文卡通粗圆黑站酷快乐体·标题大字/jpbrush 日文毛筆/jppen 日文楷書·能渲汉字假名·url 惰性载）' },
      { name: 'glow', type: 'boolean', describe: '磷光发光（按 color 描柔光）' },
      { name: 'stroke', type: 'boolean', describe: '描边字（comic 深色粗轮廓·卡通标题·可与 glow 叠）' },
      { name: 'bind', type: 'string', describe: '绑 Resource id（resolveBindings 接 current）' },
      { name: 'typewriter', type: 'number', describe: '打字机每字 ms' },
      { name: 'tween', type: 'object', describe: '数字滚动 {from,to,ms,decimals,scale?}·scale=tween 期间字号缩放起始倍率(伤害跳数 .82→1·REQ-UIFX ⑤)' },
      { name: 'format', type: 'enum', values: ['compact', 'time', 'percent', 'int'], describe: '数字格式化(作用于 tween/数字 text)：compact 1.2K/3.4M/1.5B·time mm:ss/h:mm:ss·percent 75%·int' },
      { name: 'spans', type: 'list', describe: '富文本多段 [{text,color,bold,img}]·img=段首内联图标 URL(1em 随字号)' },
      { name: 'raw', type: 'boolean', describe: 'emoji 图渲逃生：保留文本里的 emoji 字形不转美术图（代码块/刻意展字形·仅当主题开了 emoji 图渲时有意义）' },
    ],
    sample: { type: 'Label', id: 's-label', props: { text: '战功 ', spans: [{ text: '天罡 ', color: 'gold', bold: true }, { text: '破·可克', color: 'jade' }] } },
    tags: ['文字', '文本', '数字', '标题', '伤害数', '计分', '金币数', '说明'],
    demo: [
      { tab: 'tab-display', section: 't-lbl-size', note: '字号全档对照' },
      { tab: 'tab-display', section: 't-lbl-color', note: '语义色与自由色' },
      { tab: 'tab-new', section: 't-lblnew', note: '数字滚动与富文本' },
      { tab: 'tab-new', section: 't-bigtext', note: '超大标题字号档' },
      { tab: 'tab-3dui', section: 't-3dui-format', note: '大数缩写与计时' },
      { tab: 'tab-3dui', section: 't-3dui-stroke', note: '卡通描边爆字' },
    ],
  },
  {
    type: 'Image', summary: '图片/图标', whenToUse: '展示图片；动态图用 bind（StringVar id → src）。', children: 'none',
    props: [
      { name: 'src', type: 'string', required: true, describe: '图片 URL' },
      { name: 'alt', type: 'string', describe: '替代文本' },
      { name: 'fit', type: 'enum', values: ['cover', 'contain', 'fill'], describe: 'object-fit' },
      { name: 'radius', type: 'number', describe: '圆角 px' },
      { name: 'bind', type: 'string', describe: '绑 StringVar id 取动态 src' },
    ],
    sample: { type: 'Image', id: 's-image', props: { src: '/logo.png', fit: 'contain', radius: 8 } },
    tags: ['图片', '图标', '插画', '贴图', '物品图', '头图', '美术图'],
    demo: [
      { tab: 'tab-display', section: 't-image', note: '三种缩放与圆角' },
      { tab: 'tab-new', section: 't-cartoon', note: '卡通插画画廊' },
      { tab: 'tab-display', section: 't-uifill', note: '道具槽内图标' },
      { tab: 'mod-mmo', section: 'mod-mmo', note: '圆形小地图图' },
    ],
  },
  {
    type: 'Divider', summary: '分隔线', whenToUse: '分隔区块。', children: 'none', props: [],
    sample: { type: 'Divider', id: 's-divider', props: {} },
    tags: ['分隔线', '分割', '横线', '分区', '隔断', '分割线'],
    demo: [
      { tab: 'tab-shop', section: 'tab-shop', note: '商品详情区分隔' },
      { tab: 'mod-mmo', section: 'mod-mmo', note: '任务条之间分隔' },
      { tab: 'mod-input', section: 'mod-input', note: '日志区上方分隔' },
    ],
  },
  {
    type: 'Avatar', summary: '头像位（图/首字）', whenToUse: '玩家/角色头像；无图取 name 首字。', children: 'none',
    props: [
      { name: 'src', type: 'string', describe: '头像 URL（无则取首字）' },
      { name: 'name', type: 'string', describe: '名（取首字作占位）' },
      { name: 'size', type: 'number', describe: '尺寸 px' },
      { name: 'shape', type: 'enum', values: ['circle', 'rounded', 'square'], describe: '形状' },
      { name: 'ring', type: 'object', describe: '环形进度描边 {value,max?,tone?}——conic 弧环绕头像到 value/max 比例（回合计时/蓄力/进度环）。tone=accent/gold/ok/warn/danger·缺省 accent。缺省无环' },
    ],
    sample: { type: 'Avatar', id: 's-avatar', props: { name: '关羽', size: 44, shape: 'circle' } },
    tags: ['头像', '玩家像', '角色像', '队友', '首字占位', '头像框', '小图'],
    demo: [
      { tab: 'tab-display', section: 't-avatar', note: '图片/首字/进度环' },
      { tab: 'mod-mmo', section: 'mod-mmo', note: '队友头像位' },
      { tab: 'tab-shop', section: 'tab-shop', note: '商品图标头像位' },
    ],
  },
  {
    type: 'Video', summary: '视频嵌入', whenToUse: '开场/转场短视频。autoplay 自动补 muted。', children: 'none',
    props: [
      { name: 'src', type: 'string', describe: '视频 URL' },
      { name: 'poster', type: 'string', describe: '海报 URL' },
      { name: 'controls', type: 'boolean', default: true, describe: '显示控件' },
      { name: 'loop', type: 'boolean', describe: '循环' },
      { name: 'autoplay', type: 'boolean', describe: '自动播（补 muted）' },
    ],
    sample: { type: 'Video', id: 's-video', props: { src: '/intro.mp4', controls: true } },
    tags: ['视频', '短片', '开场动画', '过场', '播放', '影片', '预览'],
    demo: [
      { tab: 'mod-video', section: 'mod-video', note: '生成短片预览播放' },
    ],
  },
  {
    type: 'Particles', summary: 'UI 庆祝粒子叠层 + 物理弹道发射器（对位 Vfx3D）', whenToUse: '通关撒纸屑/领奖金币雨/星光爆/环境微光。铺满父容器(给父 width/height + position)。follow:"cursor"=收成小簇跟随光标(桌面微尘·render-only)。**物理弹道**(REQ-UIFX·shape/gravity/drag/flyTo/trail 任一在场)：初速+重力+阻尼(+飞向 LayoutNode 锚)·拖尾——金币飞进钱包/伤害粒子射向敌牌·轴名对位 Vfx3D/Trail3D。render-only·不进 sim。', children: 'none',
    props: [
      { name: 'kind', type: 'enum', values: ['confetti', 'coins', 'stars', 'sparkle'], required: true, describe: '纸屑雨/金币雨/星光爆(径向)/环境微光；物理模式下=粒子体形(彩片/金圆/★/光点)' },
      { name: 'count', type: 'number', describe: '粒子数(缺省 confetti 26·余 16·上限 60)' },
      { name: 'loop', type: 'boolean', default: true, describe: 'true=持续循环(展示/环境)·false=播一次(庆祝一次性·物理模式播毕标 data-ps-done)' },
      { name: 'follow', type: 'enum', values: ['cursor'], describe: '跟随光标态：粒子收小簇·软遮罩+screen混色·JS缓动逼近指针·离场淡出(render-only胶水在渲染器侧)' },
      { name: 'color', type: 'string', describe: '粒子单色(CSS 色·净化后插样式·如 "#ff5d7d")。替代预设色板·四预设 kind 也吃' },
      { name: 'colorGradient', type: 'list', describe: '粒子体径向渐变 [{t:0..1,color,alpha?}](芯→缘·对位 Vfx3D stop 形状·定稿「芯白→牌色→牌色75%」·alpha 仅 #rrggbb 生效·在场覆盖 color)' },
      { name: 'size', type: 'object', describe: '粒径 px：单数=统一；数组=尺寸分档(index 确定式取档·定稿「六档 12–30」=[12,16,20,22,26,30])。缺省=原 index 派生小片' },
      { name: 'shape', type: 'enum', values: ['point', 'cone'], describe: '发射形状(对位 Vfx3D·填了即入物理弹道模式)：point=四散(黄金角)·cone=向上锥(配 gravity=先窜后落)' },
      { name: 'coneAngle', type: 'number', default: 0.4, describe: 'cone 半角(弧度·对位 Vfx3D)' },
      { name: 'speed', type: 'number', default: 320, describe: '初速 px/s(对位 Vfx3D·index 确定式 ±15% 抖动)' },
      { name: 'lifetime', type: 'number', default: 1.6, describe: '粒子寿命秒(对位 Vfx3D·flyTo 到达即回收)' },
      { name: 'gravity', type: 'number', describe: '下坠加速度 px/s²(正=向下·「先窜再俯冲」=cone 初速+gravity·非手写关键帧)' },
      { name: 'drag', type: 'number', describe: '阻尼(每秒衰减比例·对位 Vfx3D·配 flyTo=阻尼弹簧缓入缓出·flyTo 缺省 1.2)' },
      { name: 'stagger', type: 'number', default: 36, describe: '逐颗错峰 ms(定稿「每颗错开 36ms」·物理模式用)' },
      { name: 'flyTo', type: 'object', describe: '飞向 LayoutNode：AnchorRef {kind:"node",id,at?,offset?}(复用 Float/Connector 同套寻址·弹簧引向目标锚=Vfx3D attractor 的 UI 形态·到达即回收)' },
      { name: 'trail', type: 'object', describe: '拖尾 {segments?,width?,fade?,blend?}(对位 Trail3D 轴：节点数缺省 6 上限 16·头宽 px 缺省粒径 60%·尾端不透明度缺省 0·add 发光/alpha 实体)' },
    ],
    sample: { type: 'Particles', id: 's-particles', props: { kind: 'confetti' }, layout: { width: 200, height: 120 } },
    tags: ['粒子', '纸屑', '金币雨', '星光', '撒花', '庆祝', '特效', '飘落'],
    demo: [
      { tab: 'tab-3dui', section: 't-3dui-particles', note: '纸屑金币星光微光' },
      { tab: 'tab-3dui', section: 't-3dui-pfly', note: '弹道金币飞进钱包' },
      { tab: 'mod-casual', section: 'mod-casual', note: '棋盘星爆与环境微光' },
      { tab: 'mod-dialogue', section: 'mod-dialogue', note: '立绘台环境微光' },
    ],
  },
  {
    type: 'LevelPath', summary: '关卡地图（蛇形蜿蜒路径 + 状态节点）', whenToUse: '休闲选关屏（Candy Crush 式）。给节点列表 + 状态，引擎排蛇形路径/画连线/渲节点。点节点发 action 选关。', children: 'none',
    props: [
      { name: 'nodes', type: 'list', required: true, describe: '[{label?,state?:done/current/locked,stars?:0-3,action?,actionArg?}]·节点列表(蛇形自动排)' },
      { name: 'cols', type: 'number', default: 3, describe: '每行几个(蛇形宽度)' },
      { name: 'tone', type: 'enum', values: ['jade', 'gold', 'accent'], default: 'gold', describe: '已通关路径/节点主色' },
    ],
    sample: { type: 'LevelPath', id: 's-levelpath', props: { cols: 3, tone: 'gold', nodes: [
      { label: '1', state: 'done', stars: 3, action: 'pickLevel', actionArg: '1' },
      { label: '2', state: 'done', stars: 2, action: 'pickLevel', actionArg: '2' },
      { label: '3', state: 'current', action: 'pickLevel', actionArg: '3' },
      { label: '4', state: 'locked' }, { label: '5', state: 'locked' },
    ] } },
    tags: ['关卡', '选关', '地图', '闯关', '章节', '星级', '解锁', '路线'],
    demo: [
      { tab: 'tab-3dui', section: 't-3dui-levelmap', note: '蛇形关卡与星锁状态' },
    ],
  },
  {
    type: 'Float', summary: '锚定浮层（钉在活动目标上）', whenToUse: '头顶名牌/血条/伤害数/选中光标/战场徽标——把 children 每帧定位到目标 rect。取代手写 getElementById+getBoundingClientRect。目标消失自隐。', children: 'optional',
    props: [
      { name: 'anchorTo', type: 'object', required: true, describe: '{kind:node(同树 LayoutNode id·现一律用这路)/entity(预留·生产端未接·别用), id, at?:center/top/bottom/left/right, offset?:{x,y}}' },
      { name: 'ttlTicks', type: 'number', describe: '存活帧数（缺省常驻·给了 N 帧后自隐·伤害数飘完即消）' },
    ],
    sample: { type: 'Float', id: 's-float', props: { anchorTo: { kind: 'node', id: 'some-target', at: 'top', offset: { y: -8 } } },
      children: [{ type: 'Badge', id: 's-float-b', props: { text: '★ BOSS', tone: 'warn' } }] },
    tags: ['名牌', '头顶血条', '浮层', '锚定', '跟随', '选中标记', '飘字层'],
    demo: [
      { tab: 'tab-new', section: 't-anchor', note: '头顶名牌与脚下血条' },
    ],
  },
  {
    type: 'Connector', summary: '锚定连线（谁打谁）', whenToUse: '两目标间连线（VS 连线/攻击指向/关系线）·每帧跟随两端。', children: 'none',
    props: [
      { name: 'from', type: 'object', required: true, describe: '起点锚 {kind,id,at?}' },
      { name: 'to', type: 'object', required: true, describe: '终点锚 {kind,id,at?}' },
      { name: 'style', type: 'enum', values: ['solid', 'dashed', 'arrow'], describe: '线型（缺省 solid）' },
      { name: 'tone', type: 'enum', values: ['jade', 'gold', 'ok', 'warn', 'danger'], describe: '线色令牌（非裸 hex）' },
      { name: 'label', type: 'string', describe: '线中点标（伤害/关系）' },
    ],
    sample: { type: 'Connector', id: 's-conn', props: { from: { kind: 'node', id: 'a' }, to: { kind: 'node', id: 'b' }, style: 'arrow', tone: 'danger', label: '−120' } },
    tags: ['连线', '箭头', '指向', '对战线', '关系线', '攻击线', '牵线'],
    demo: [
      { tab: 'tab-new', section: 't-anchor', note: '攻击箭头与关系虚线' },
    ],
  },
  // ── 按钮 / 输入 ──────────────────────────────────────────────
  {
    type: 'Button', summary: '按钮（四种风格·点击发信号）', whenToUse: '一切点击动作。主 CTA 用 hero（金色倒角 sheen）。action=信号名，由 sim 能力消费。', children: 'none',
    props: [
      { name: 'label', type: 'string', required: true, describe: '按钮文字' },
      { name: 'kind', type: 'enum', values: ['primary', 'ghost', 'quiet', 'hero'], default: 'ghost', describe: '风格' },
      { name: 'action', type: 'string', describe: '点击发的信号名' },
      { name: 'actionArg', type: 'string', describe: '信号参数（买哪件等）' },
      { name: 'disabled', type: 'boolean', describe: '禁用' },
      { name: 'sub', type: 'string', describe: 'hero 键副标' },
      { name: 'shape', type: 'enum', values: ['pill', 'hexagon', 'diamond', 'shield', 'ribbon', 'chevron', 'tag', 'cut'], describe: '异形轮廓（闭集·引擎预置 clip-path·缺省=矩形）。异形需给足宽高避免裁掉文字' },
      { name: 'skin', type: 'string', describe: '贴图皮=已解析图 URL（同 Image.src·sim 持 key·游戏经 resolveAsset 解析后填）。设了则按钮底=该图 cover+白字投影；配 shape 可做透明 PNG 异形贴图键。命中区=包围盒' },
      { name: 'skinSlice', type: 'number', describe: '9-slice 无损缩放（源边距 px）。设了则 skin 走 border-image 九宫格：四角固定·边中拉伸·任意尺寸不变形（治 cover 拉伸）。缺省=cover' },
      { name: 'icon', type: 'string', describe: '键首内联图标 URL（1em 随字号·居 label 前）' },
    ],
    sample: { type: 'Button', id: 's-button', props: { label: '⚔ 出征 · 第 3 关', kind: 'hero', sub: '挑战 曹操 · 难度 ★★', action: 'play' } },
    tags: ['按钮', '开始', '确定', '技能键', '点击', '出战', '领取', '操作', '主菜单', '按钮布局', '排布', '技能扇'],
    demo: [
      { tab: 'tab-input', section: 't-btn', note: '三种风格加禁用态' },
      { tab: 'tab-3dbtn', section: 't-3dbtn-depth', note: '景深主菜单（布局六法）' },
      { tab: 'tab-3dbtn', section: 't-3dbtn-arc', note: '弧形技能扇排布' },
      { tab: 'tab-3dbtn', section: 't-3dbtn-candy', note: '糖果厚钮网格·触屏' },
      { tab: 'tab-new', section: 't-hero', note: '金色倒角大主按钮' },
      { tab: 'tab-new', section: 't-shape', note: '八种异形轮廓钮' },
      { tab: 'tab-new', section: 't-skin', note: '贴图皮与九宫格拉伸' },
      { tab: 'tab-3dui', section: 't-3dui-press', note: '按下沉底糖果厚钮' },
      { tab: 'tab-new', section: 't-sheen', note: '流光扫过的按钮' },
    ],
  },
  {
    type: 'Input', summary: '文本输入框', whenToUse: '搜索/表单输入。change 发 action(arg=值)。', children: 'none',
    props: [
      { name: 'placeholder', type: 'string', describe: '占位提示' },
      { name: 'value', type: 'string', describe: '当前值' },
      { name: 'type', type: 'enum', values: ['text', 'number'], describe: '输入类型' },
      { name: 'action', type: 'string', describe: 'change 信号名' },
    ],
    sample: { type: 'Input', id: 's-input', props: { placeholder: '搜索英雄…', action: 'search' } },
    tags: ['输入框', '取名', '搜索', '聊天框', '改名', '填写', '文本框'],
    demo: [
      { tab: 'tab-input', section: 't-input', note: '文本与数字输入' },
      { tab: 'tab-shop', section: 'tab-shop', note: '商品名搜索框' },
      { tab: 'mod-mmo', section: 'mod-mmo', note: '聊天发送输入条' },
    ],
  },
  {
    type: 'Dropdown', summary: '原生下拉选择', whenToUse: '少量固定选项选一。change 发 action(arg=value)。', children: 'none',
    props: [
      { name: 'options', type: 'list', required: true, describe: '[{value,label}]' },
      { name: 'value', type: 'string', describe: '选中 value' },
      { name: 'placeholder', type: 'string', describe: '占位项' },
      { name: 'action', type: 'string', describe: '选择信号名' },
    ],
    sample: { type: 'Dropdown', id: 's-dropdown', props: { options: [{ value: 'gx', label: '关羽' }, { value: 'zf', label: '张飞' }], value: 'gx', action: 'pickHero' } },
    tags: ['下拉', '选择', '难度', '选单', '菜单选项', '切换', '选服'],
    demo: [
      { tab: 'tab-input', section: 't-dropdown', note: '难度三选一下拉' },
    ],
  },
  {
    type: 'Combobox', summary: '带搜索的下拉', whenToUse: '选项多、需搜索过滤时（比 Dropdown 强）。', children: 'none',
    props: [
      { name: 'options', type: 'list', required: true, describe: '[{value,label}]' },
      { name: 'value', type: 'string', describe: '选中 value' },
      { name: 'placeholder', type: 'string', describe: '占位' },
      { name: 'action', type: 'string', describe: '选择信号名' },
    ],
    sample: { type: 'Combobox', id: 's-combobox', props: { options: [{ value: 'gx', label: '关羽' }, { value: 'zf', label: '张飞' }], placeholder: '搜名将…', action: 'pickHero' } },
    tags: ['搜索下拉', '过滤', '自动补全', '长列表选择', '查找', '选项多'],
    demo: [
      { tab: 'tab-input', section: 't-combobox', note: '输入过滤选城市' },
    ],
  },
  {
    type: 'Checkbox', summary: '勾选框', whenToUse: '单个开关项。handler 收 "true"/"false"。', children: 'none',
    props: [{ name: 'label', type: 'string', required: true, describe: '标签' }, { name: 'checked', type: 'boolean', describe: '勾选' }, { name: 'action', type: 'string', describe: '信号名' }],
    sample: { type: 'Checkbox', id: 's-checkbox', props: { label: '音效', checked: true, action: 'toggleSfx' } },
    tags: ['勾选', '打勾', '多选', '同意', '设置项', '选项框', '开关项'],
    demo: [
      { tab: 'tab-input', section: 't-check', note: '新手引导勾选项' },
    ],
  },
  {
    type: 'Toggle', summary: '药丸开关', whenToUse: '设置项开/关（比 Checkbox 更醒目）。', children: 'none',
    props: [{ name: 'label', type: 'string', required: true, describe: '标签' }, { name: 'checked', type: 'boolean', describe: '开' }, { name: 'action', type: 'string', describe: '信号名' }],
    sample: { type: 'Toggle', id: 's-toggle', props: { label: '背景音乐', checked: true, action: 'toggleBgm' } },
    tags: ['开关', '音效开关', '静音', '设置', '启用', '切换', '震动'],
    demo: [
      { tab: 'tab-input', section: 't-check', note: '音效药丸开关' },
      { tab: 'tab-input', section: 'snd-t-ctl', note: '混响与静音开关' },
      { tab: 'tab-new', section: 't-vw', note: '开关控条件显隐' },
      { tab: 'tab-3dui', section: 't-3dui-tapflip', note: '开关驱动卡牌翻面' },
    ],
  },
  {
    type: 'RadioGroup', summary: '互斥单选组', whenToUse: '一组选一（难度/阵营）。handler 收所选 value。', children: 'none',
    props: [
      { name: 'name', type: 'string', required: true, describe: '分组名' },
      { name: 'options', type: 'list', required: true, describe: '[{value,label}]' },
      { name: 'value', type: 'string', describe: '选中' }, { name: 'action', type: 'string', describe: '信号名' },
    ],
    sample: { type: 'RadioGroup', id: 's-radio', props: { name: 'diff', options: [{ value: 'easy', label: '简单' }, { value: 'hard', label: '困难' }], value: 'easy', action: 'setDiff' } },
    tags: ['单选', '选一个', '难度', '阵营', '模式选择', '互斥', '选边'],
    demo: [
      { tab: 'tab-input', section: 't-radio', note: '倍速互斥单选' },
    ],
  },
  {
    type: 'Segmented', summary: '紧凑分段选择', whenToUse: '少量选项横排选一（比 RadioGroup 省地方）。', children: 'none',
    props: [{ name: 'options', type: 'list', required: true, describe: '[{value,label}]' }, { name: 'value', type: 'string', describe: '选中' }, { name: 'action', type: 'string', describe: '信号名' }],
    sample: { type: 'Segmented', id: 's-segmented', props: { options: [{ value: 'all', label: '全部' }, { value: 'own', label: '已有' }], value: 'all', action: 'filter' } },
    tags: ['分段', '分类', '视图切换', '筛选条', '紧凑选择', '切页', '开关组'],
    demo: [
      { tab: 'tab-input', section: 't-segmented', note: '网格列表卡片切换' },
      { tab: 'tab-shop', section: 'tab-shop', note: '商品分类切换条' },
    ],
  },
  {
    type: 'Slider', summary: '数值滑块', whenToUse: '连续数值（音量/缩放）。handler 收数值串。', children: 'none',
    props: [{ name: 'min', type: 'number', describe: '最小' }, { name: 'max', type: 'number', describe: '最大' }, { name: 'step', type: 'number', describe: '步进' }, { name: 'value', type: 'number', describe: '当前值' }, { name: 'label', type: 'string', describe: '标签' }, { name: 'action', type: 'string', describe: '信号名' }],
    sample: { type: 'Slider', id: 's-slider', props: { min: 0, max: 100, value: 70, label: '音量', action: 'setVol' } },
    tags: ['滑块', '音量', '亮度', '拖动调节', '灵敏度', '缩放', '调档'],
    demo: [
      { tab: 'tab-input', section: 't-slider', note: '音量数值滑块' },
      { tab: 'tab-input', section: 'snd-t-pan', note: '左右声像滑块' },
      { tab: 'tab-input', section: 'snd-t-ctl', note: '主音量调节条' },
    ],
  },
  {
    type: 'Stepper', summary: '数量 ± 加减', whenToUse: '小整数增减（购买数量）。到界禁用。', children: 'none',
    props: [{ name: 'value', type: 'number', required: true, describe: '当前值' }, { name: 'min', type: 'number', describe: '下界' }, { name: 'max', type: 'number', describe: '上界' }, { name: 'step', type: 'number', describe: '步进' }, { name: 'action', type: 'string', describe: '信号名' }],
    sample: { type: 'Stepper', id: 's-stepper', props: { value: 3, min: 0, max: 9, action: 'qty' } },
    tags: ['加减', '数量', '买几个', '计数', '增减', '份数', '叠数'],
    demo: [
      { tab: 'tab-input', section: 't-stepper', note: '加减数值到界禁用' },
      { tab: 'tab-shop', section: 'tab-shop', note: '购买数量加减' },
    ],
  },
  {
    type: 'Rating', summary: '星级评分', whenToUse: '难度/星级展示或打分。有 action 可点设值。', children: 'none',
    props: [{ name: 'value', type: 'number', required: true, describe: '已亮颗数' }, { name: 'max', type: 'number', default: 5, describe: '总颗' }, { name: 'action', type: 'string', describe: '可点设值信号' }],
    sample: { type: 'Rating', id: 's-rating', props: { value: 3, max: 5 } },
    tags: ['星级', '评分', '几颗星', '难度星', '通关星', '打分', '五星'],
    demo: [
      { tab: 'tab-input', section: 't-rating', note: '点星打分五星' },
      { tab: 'mod-casual', section: 'mod-casual', note: '关卡三星评级' },
    ],
  },
  // ── 数据展示 ────────────────────────────────────────────────
  {
    type: 'Badge', summary: '小徽章', whenToUse: '状态标记（OK/警告/淡/翠/金/危）。', children: 'none',
    props: [{ name: 'text', type: 'string', required: true, describe: '文字' }, { name: 'tone', type: 'enum', values: ['ok', 'warn', 'dim', 'accent', 'gold', 'danger'], describe: '着色（accent/gold/danger=REQ-UIFX 复查补齐·镜像 Toast 家族）' }, { name: 'icon', type: 'string', describe: '首部内联图标 URL（已解析·随字号·居 text 前·同 Tag/Button.icon）。缺省无=纯文字零变' }],
    sample: { type: 'Badge', id: 's-badge', props: { text: '稀有', tone: 'ok' } },
    tags: ['徽章', '角标', '状态', '标记', '等级牌', '在线', '红点', '数量角标'],
    demo: [
      { tab: 'tab-display', section: 't-badge', note: '状态三态与图标槽' },
      { tab: 'tab-new', section: 't-anchor', note: '头顶等级名牌' },
      { tab: 'tab-3dui', section: 't-3dui-fly', note: '金币飞进钱包' },
      { tab: 'tab-new', section: 't-anim', note: '浮动发光脉冲载体' },
      { tab: 'tab-new', section: 't-fx', note: '七种特效挂载体' },
      { tab: 'mod-casual', section: 'mod-casual', note: '道具剩余数量角标' },
    ],
  },
  {
    type: 'Tag', summary: '可点过滤标签/词条', whenToUse: '筛选条/词条；可点(active 高亮)、可删。', children: 'none',
    props: [
      { name: 'label', type: 'string', required: true, describe: '文字' },
      { name: 'active', type: 'boolean', describe: '高亮' },
      { name: 'tone', type: 'enum', values: ['normal', 'accent', 'dim'], describe: '着色' },
      { name: 'action', type: 'string', describe: '点击信号' }, { name: 'actionArg', type: 'string', describe: '参数' },
      { name: 'removable', type: 'boolean', describe: '显 × 可删' },
      { name: 'icon', type: 'string', describe: '首部内联图标 URL（1em 随字号·货币/生肖 pill 换套装图标）' },
      { name: 'size', type: 'enum', values: ['sm', 'md', 'lg'], default: 'md', describe: '尺寸档（lg=货币计数等大气药丸·≈2x）' },
    ],
    sample: { type: 'Tag', id: 's-tag', props: { label: '黑桃 ♠', active: true, action: 'filterSuit', actionArg: 'spade' } },
    tags: ['标签', '词条', '稀有度', '筛选', '货币药丸', '属性', '分类', 'chip'],
    demo: [
      { tab: 'tab-display', section: 't-tag', note: '可点筛选与可删' },
      { tab: 'tab-display', section: 't-tagsize', note: '大药丸货币计数' },
      { tab: 'tab-shop', section: 'tab-shop', note: '商品稀有度词条' },
      { tab: 'tab-emoji', section: 't-emoji', note: '带表情的药丸标' },
      { tab: 'mod-input', section: 'mod-input', note: '按住中的信号标' },
    ],
  },
  {
    type: 'ProgressBar', summary: '比例条 / 环形进度 / 液面杯（血/蓝/经验/体力环/注水杯）', whenToUse: '展示比例。value/max；线性条缺省，环形/径向用 shape:ring(体力/每日目标/冷却环)；**液面杯用 shape:liquid**(REQ-UIFX·注水/蓄力·游戏只给标量 value·会晃的水面+气泡引擎承担·禁每帧烤水面贴图)；绑世界用 bind。', children: 'none',
    props: [
      { name: 'value', type: 'number', required: true, describe: '当前值' },
      { name: 'max', type: 'number', default: 1, describe: '满值' },
      { name: 'tone', type: 'enum', values: ['accent', 'gold', 'ok', 'warn', 'danger'], describe: '着色' },
      { name: 'label', type: 'string', describe: '标签' }, { name: 'showValue', type: 'boolean', describe: '显数值' },
      { name: 'shape', type: 'enum', values: ['bar', 'ring', 'liquid'], default: 'bar', describe: 'bar=线性条 / ring=环形径向(conic·中心显值) / liquid=液面杯(水位=value·双错频波脊+整杯 slosh+气泡·杯体=本节点盒 layout.width/height 缺省 90×120)' },
      { name: 'size', type: 'number', default: 64, describe: '环直径 px(shape:ring 用)' },
      { name: 'radius', type: 'number', default: 14, describe: '液面杯体圆角 px(shape:liquid·按盒圆角裁水体)' },
      { name: 'fillColor', type: 'string', describe: '液体色(shape:liquid·CSS 色·净化·如 "#31b7f2"·缺省按 tone)' },
      { name: 'wave', type: 'boolean', default: true, describe: '液面波动(shape:liquid·主脊900ms+副脊1250ms 错频+整杯±1.6° slosh·false=静水)' },
      { name: 'bubbles', type: 'number', describe: '气泡数(shape:liquid·缺省 0·上限 8·尺寸/周期/横位 index 确定式分档)' },
      { name: 'bind', type: 'string', describe: '绑 Resource id' },
    ],
    sample: { type: 'ProgressBar', id: 's-progress', props: { value: 30, max: 120, tone: 'danger', label: '生命', showValue: true } },
    tags: ['血条', '蓝条', '经验条', '体力', '冷却', '进度', '读条', '蓄力'],
    demo: [
      { tab: 'tab-display', section: 't-progress', note: '血量体力五色条' },
      { tab: 'tab-display', section: 't-bind', note: '绑世界血量活条' },
      { tab: 'tab-3dui', section: 't-3dui-ring', note: '体力日目标冷却环' },
      { tab: 'tab-3dui', section: 't-3dui-liquid', note: '注水蓄力液面杯' },
      { tab: 'mod-mmo', section: 'mod-mmo', note: '血蓝施法与经验条' },
      { tab: 'tab-new', section: 't-anchor', note: '锚在脚下的血条' },
    ],
  },
  {
    type: 'Table', summary: '数据表/榜单', whenToUse: '行列数据（排行榜/数值表）。', children: 'none',
    props: [
      { name: 'columns', type: 'list', required: true, describe: '[{key,label,align,width}]' },
      { name: 'rows', type: 'list', required: true, describe: '[{id,cells,action,tone}]' },
      { name: 'title', type: 'string', describe: '标题' }, { name: 'empty', type: 'string', describe: '空占位文案' },
    ],
    sample: { type: 'Table', id: 's-table', props: { title: '天梯榜', columns: [{ key: 'rank', label: '名次', width: 50 }, { key: 'name', label: '玩家' }, { key: 'score', label: '积分', align: 'right' }], rows: [{ id: 'r1', cells: { rank: '1', name: '不翻就赢', score: '2380' }, tone: 'accent' }, { id: 'r2', cells: { rank: '2', name: '常胜将军', score: '2210' } }] } },
    tags: ['表格', '榜单', '排行榜', '战绩', '数值表', '成绩', '记录'],
    demo: [
      { tab: 'tab-display', section: 't-table', note: '排行榜行可点' },
      { tab: 'mod-input', section: 'mod-input', note: '输入事件日志表' },
    ],
  },
  {
    type: 'VirtualList', summary: '长列表虚拟滚动', whenToUse: '千行级列表（只渲可视窗口）。', children: 'none',
    props: [
      { name: 'rows', type: 'list', required: true, describe: '[{id,cells}]' },
      { name: 'rowHeight', type: 'number', required: true, describe: '固定行高 px' },
      { name: 'columns', type: 'list', describe: '列定义（同 Table）' },
      { name: 'height', type: 'number', default: 320, describe: '视口高 px' }, { name: 'action', type: 'string', describe: '行点击信号' },
    ],
    sample: { type: 'VirtualList', id: 's-vlist', props: { rowHeight: 28, height: 140, columns: [{ key: 'name', label: '名' }], rows: [{ id: 'a', cells: { name: '第 1 行' } }, { id: 'b', cells: { name: '第 2 行' } }], action: 'pickRow' } },
    tags: ['长列表', '背包列表', '滚动', '千行', '邮件列表', '不卡', '榜单'],
    demo: [
      { tab: 'tab-display', section: 't-vlist', note: '五百行只渲可视窗' },
    ],
  },
  {
    type: 'Card', summary: '网格卡单元', whenToUse: '配 Panel grid 做卡牌格/货架。媒体+标题+副标+角标。', children: 'optional',
    props: [
      { name: 'title', type: 'string', describe: '标题' }, { name: 'sub', type: 'string', describe: '副标' },
      { name: 'media', type: 'string', describe: '媒体字形/emoji；或图片 URL（/·http·data: 开头自动按图渲）' }, { name: 'corner', type: 'string', describe: '角标' },
      { name: 'tone', type: 'enum', values: ['normal', 'accent', 'dim', 'locked'], describe: '着色/锁态' },
      { name: 'action', type: 'string', describe: '点击信号' }, { name: 'actionArg', type: 'string', describe: '参数' },
    ],
    sample: { type: 'Card', id: 's-card', props: { media: '🃏', title: '同袍', sub: '🪙 16', corner: '稀有', tone: 'accent', action: 'buy', actionArg: 'comrade' } },
    tags: ['卡片', '道具卡', '货架', '格子', '物品', '商品', '抽卡', '图鉴'],
    demo: [
      { tab: 'tab-display', section: 't-card', note: '道具卡四态角标' },
      { tab: 'tab-shop', section: 'tab-shop', note: '商品货架网格' },
      { tab: 'tab-pick', section: 'tab-pick', note: '扇形手牌多选' },
    ],
  },
  {
    type: 'PlayingCard', summary: '扑克牌原语', whenToUse: '一切扑克/卡牌牌面。流式卡墙用 fluid+Panel grid cols；桌面悬停翻面 flipOnHover+backFace，手机/state 驱动翻面用 flipped+backFace（触屏可用）。', children: 'none',
    props: [
      { name: 'rank', type: 'string', required: true, describe: "点数 'A'/'K'/'10'…" },
      { name: 'suit', type: 'string', required: true, describe: "花色 '♠'|'♥'|'♦'|'♣'" },
      { name: 'faceUp', type: 'boolean', default: true, describe: 'false=牌背' },
      { name: 'size', type: 'enum', values: ['sm', 'md', 'lg'], default: 'md', describe: '尺寸档' },
      { name: 'face', type: 'enum', values: ['dark', 'light'], describe: '暗卡/经典白牌' },
      { name: 'selected', type: 'boolean', describe: '选中金边' }, { name: 'dimmed', type: 'boolean', describe: '暗化' },
      { name: 'fluid', type: 'boolean', describe: '充满父格(5:7)·配 grid cols' },
      { name: 'flipOnHover', type: 'boolean', describe: '悬停翻面（桌面·:hover）' },
      { name: 'flipped', type: 'boolean', describe: '状态驱动翻面（true=背面·点按/state 翻·触屏可用·与 flipOnHover 互斥）' },
      { name: 'backFace', type: 'node', describe: '背面信息子树（flipOnHover/flipped 时渲）' },
      { name: 'backPattern', type: 'enum', values: ['checker', 'stripe'], describe: '牌背纹理（faceUp:false 时）' },
      { name: 'backArt', type: 'string', describe: '牌背贴图 URL（faceUp:false 时整面 cover·替代纹样字符/backPattern）' },
      { name: 'art', type: 'string', describe: '立绘 URL（中央剪影·角标花色仍在）' },
      { name: 'faceArt', type: 'string', describe: '整牌面贴图 URL（faceUp 时整面 cover·角标/花色全隐·牌面即一张插画·backArt 的正面版）' },
      { name: 'faceArtSlice', type: 'number', describe: 'faceArt 9-slice 源边距 px（画框式牌面·不填=cover）' },
      { name: 'label', type: 'string', describe: '牌下标签' },
      { name: 'action', type: 'string', describe: '点击信号' },
    ],
    sample: { type: 'PlayingCard', id: 's-pcard', props: { rank: 'A', suit: '♠', face: 'light', label: '关羽', selected: true } },
    tags: ['扑克', '卡牌', '手牌', '牌面', '翻牌', '牌背', '发牌', '卡组'],
    demo: [
      { tab: 'tab-new', section: 't-pc', note: '牌面正反选中暗态' },
      { tab: 'tab-new', section: 't-flip', note: '悬停翻面看背面' },
      { tab: 'tab-new', section: 't-backpat', note: '棋盘斜纹牌背' },
      { tab: 'tab-3dui', section: 't-3dui-tapflip', note: '点按状态翻牌' },
      { tab: 'tab-3dui', section: 't-3dui-carousel', note: '扇形旋转木马牌组' },
      { tab: 'tab-new', section: 't-grid', note: '填满格零空隙牌墙' },
    ],
  },
  // ── 浮层 / 反馈 ──────────────────────────────────────────────
  {
    type: 'Modal', summary: '居中模态浮层 + 遮罩', whenToUse: '居中弹窗（确认框/详情/商城）。点遮罩本身关。children=弹窗体。', children: 'optional',
    props: [
      { name: 'title', type: 'string', describe: '标题' },
      { name: 'size', type: 'enum', values: ['sm', 'md', 'lg'], describe: '宽度档' },
      { name: 'closable', type: 'boolean', default: true, describe: '显 ×' },
      { name: 'closeAction', type: 'string', describe: '关闭信号（点×/点遮罩）' },
    ],
    sample: { type: 'Modal', id: 's-modal', props: { title: '返回大厅？', size: 'sm', closeAction: 'close' }, children: [{ type: 'Label', id: 's-modal-b', props: { text: '进度将丢失。' } }] },
    tags: ['弹窗', '对话框', '确认框', '详情框', '遮罩', '结算弹窗', '提示窗'],
    demo: [
      { tab: 'tab-input', section: 't-modal', note: '开弹窗点遮罩关' },
    ],
  },
  {
    type: 'Drawer', summary: '侧滑/底部抽屉', whenToUse: '贴边抽屉（设置/背包）。机制同 Modal。', children: 'optional',
    props: [
      { name: 'side', type: 'enum', values: ['left', 'right', 'bottom'], describe: '贴边方位' },
      { name: 'title', type: 'string', describe: '标题' }, { name: 'closeAction', type: 'string', describe: '关闭信号' },
    ],
    sample: { type: 'Drawer', id: 's-drawer', props: { side: 'right', title: '设置', closeAction: 'closeDrawer' }, children: [{ type: 'Label', id: 's-drawer-b', props: { text: '抽屉内容' } }] },
    tags: ['抽屉', '侧栏', '背包面板', '设置面板', '滑出', '侧滑', '边栏'],
    demo: [
      { tab: 'tab-input', section: 't-drawer', note: '右侧滑入抽屉' },
    ],
  },
  {
    type: 'Tooltip', summary: '悬浮提示/词条浮窗', whenToUse: '包裹触发元素(children)，hover 显气泡。富内容用 bubble(LayoutNode)。', children: 'required',
    props: [
      { name: 'content', type: 'string', describe: '简单文本气泡' },
      { name: 'placement', type: 'enum', values: ['top', 'bottom', 'left', 'right'], default: 'top', describe: '气泡方位' },
      { name: 'bubble', type: 'node', describe: '富气泡根（Panel+Label·替代 content）' },
      { name: 'block', type: 'boolean', describe: '块级触发(display:block+充满)·能作 grid/flex item 拉伸不塌陷' },
    ],
    sample: { type: 'Tooltip', id: 's-tooltip', props: { content: '该牌掷命翻正概率', placement: 'top' }, children: [{ type: 'Badge', id: 's-tooltip-t', props: { text: '?' } }] },
    tags: ['提示', '悬浮说明', '词条浮窗', '技能说明', '气泡', '鼠标提示', '解释'],
    demo: [
      { tab: 'tab-display', section: 't-tooltip', note: '悬停弹四方位气泡' },
    ],
  },
  {
    type: 'ContextMenu', summary: '右键/长按菜单', whenToUse: '包裹触发元素(children)，右键弹菜单。', children: 'required',
    props: [{ name: 'items', type: 'list', required: true, describe: '[{id,label,action}]' }],
    sample: { type: 'ContextMenu', id: 's-ctx', props: { items: [{ id: 'del', label: '删除', action: 'doDelete' }] }, children: [{ type: 'Label', id: 's-ctx-t', props: { text: '右键我' } }] },
    tags: ['右键菜单', '长按菜单', '快捷菜单', '操作菜单', '弹出菜单', '更多'],
    demo: [
      { tab: 'tab-input', section: 't-ctxmenu', note: '右键光标处弹菜单' },
    ],
  },
  {
    type: 'Toast', summary: '飘字提示（非模态）', whenToUse: '操作反馈药丸（保存成功）。也可由 showToast() API 定时自消。', children: 'none',
    props: [{ name: 'text', type: 'string', required: true, describe: '文字' }, { name: 'tone', type: 'enum', values: ['ok', 'warn', 'danger', 'accent', 'dim'], describe: '着色' }, { name: 'duration', type: 'number', default: 2600, describe: '自消 ms' }],
    sample: { type: 'Toast', id: 's-toast', props: { text: '保存成功', tone: 'ok' } },
    tags: ['飘字', '提示条', '冒泡提示', '保存成功', '操作反馈', '消息', '横幅'],
    demo: [
      { tab: 'tab-input', section: 't-toast-live', note: '点击实时弹自动消' },
      { tab: 'tab-display', section: 't-toast', note: '五语义色静态样式' },
    ],
  },
  {
    type: 'Accordion', summary: '折叠面板', whenToUse: '可折叠区块（高级设置）。点标题切开合。', children: 'optional',
    props: [{ name: 'title', type: 'string', required: true, describe: '标题行' }, { name: 'open', type: 'boolean', describe: '初始展开' }, { name: 'action', type: 'string', describe: '可选切换信号' }],
    sample: { type: 'Accordion', id: 's-accordion', props: { title: '高级设置' }, children: [{ type: 'Label', id: 's-accordion-b', props: { text: '折叠体内容' } }] },
    tags: ['折叠', '展开', '收起', '高级设置', '收纳', '手风琴', '折叠块'],
    demo: [
      { tab: 'tab-layout', section: 't-accordion', note: '点标题展开收起' },
    ],
  },
  {
    type: 'Tabs', summary: '多页签（引擎管切换·不重建页）', whenToUse: '多页内容切换。children 顺序对齐 tabs（tabs[i]↔children[i]）。', children: 'required',
    props: [
      { name: 'tabs', type: 'list', required: true, describe: '[{id,label,anchor?,icon?}]（anchor=新手引导锚点·icon=页签文字前内联图标 URL·缺省纯文字）' },
      { name: 'active', type: 'string', describe: '当前页 id' }, { name: 'action', type: 'string', describe: '切页信号' },
    ],
    sample: { type: 'Tabs', id: 's-tabs', props: { tabs: [{ id: 'a', label: '牌谱' }, { id: 'b', label: '榜单' }], active: 'a' }, children: [{ type: 'Label', id: 's-tabs-a', props: { text: '牌谱页' } }, { type: 'Label', id: 's-tabs-b', props: { text: '榜单页' } }] },
    tags: ['页签', '标签页', '分页', '切页', '导航栏', '栏目', '分栏'],
    demo: [
      { tab: 'mod-mmo', section: 'mod-mmo', note: '聊天综合战斗分页' },
    ],
  },
  // ── 游戏原语（卡牌演出）──────────────────────────────────────
  {
    type: 'CoinFlip', summary: '掷币（确定性·3D 翻转）', whenToUse: '掷命/二选一演出。outcome 由游戏算好；spinning 播翻转。', children: 'none',
    props: [
      { name: 'outcome', type: 'enum', values: ['heads', 'tails'], required: true, describe: '结果' },
      { name: 'spinning', type: 'boolean', describe: '播翻转动画' }, { name: 'size', type: 'number', default: 92, describe: '直径 px' },
      { name: 'headsLabel', type: 'string', describe: '正面字' }, { name: 'tailsLabel', type: 'string', describe: '反面字' },
      { name: 'headsArt', type: 'string', describe: '正面贴图 URL（面底=图 cover·字白字投影叠显）' },
      { name: 'tailsArt', type: 'string', describe: '反面贴图 URL（同 headsArt）' },
    ],
    sample: { type: 'CoinFlip', id: 's-coin', props: { outcome: 'heads', spinning: true, headsLabel: '正·活', tailsLabel: '反·亡' } },
    tags: ['抛硬币', '掷币', '正反面', '运气', '二选一', '开局判定', '赌运'],
    demo: [
      { tab: 'tab-new', section: 't-coin', note: '翻转与静态结果' },
    ],
  },
  {
    type: 'Versus', summary: '对决特写（两牌 + 胜率 + 火花）', whenToUse: '卡牌对战结算特写。left/right 两张牌 + 胜方高亮。', children: 'none',
    props: [
      { name: 'left', type: 'object', required: true, describe: '左牌 PlayingCard props' },
      { name: 'right', type: 'object', required: true, describe: '右牌 PlayingCard props' },
      { name: 'label', type: 'string', describe: '中央文字（胜率 76:24）' },
      { name: 'winner', type: 'enum', values: ['left', 'right', 'none'], describe: '胜方高亮' },
      { name: 'spark', type: 'boolean', default: true, describe: '中央火花' },
    ],
    sample: { type: 'Versus', id: 's-versus', props: { left: { rank: 'A', suit: '♠' }, right: { rank: 'K', suit: '♥' }, label: '76 : 24', winner: 'left' } },
    tags: ['对决', '对战', '比拼', '结算特写', '胜负', '单挑', '胜率'],
    demo: [
      { tab: 'tab-new', section: 't-versus', note: '左右牌胜方高亮' },
    ],
  },
  // ── 剧情 / VN 三件（REQ-DIALOGUE M1·消费 t3-dialogue·投影读世界走 resolveDialogue(bind=对话实体 id)）──
  {
    type: 'dialog', summary: '台词框（说话人 + 台词 + 推进）', whenToUse: 'VN/剧情对话当前行。literal 填 speaker/text，或 bind=对话实体 id 由 resolveDialogue 投影。line/check 节点整框可点发 dialogue.advance；choice 节点配 choiceList 用。华丽货架：skin 画框皮 / shape 异形 / edge 金框（非新写美术）。', children: 'none',
    props: [
      { name: 'speaker', type: 'string', describe: '说话人名（或 bind 投影填）' },
      { name: 'text', type: 'string', describe: '台词正文（复用 Label 打字机/emoji/字体）' },
      { name: 'emotion', type: 'string', describe: '情绪键（透出 data-emotion·M2 驱动立绘变体）' },
      { name: 'kind', type: 'enum', values: ['line', 'choice', 'check'], describe: '当前节点种类（投影填·choice 时隐推进提示）' },
      { name: 'advanceAction', type: 'string', default: 'dialogue.advance', describe: '推进信号名（缺省 dialogue.advance）' },
      { name: 'typewriter', type: 'number', describe: '打字机每字 ms（render-only 不进 sim）' },
      { name: 'skin', type: 'string', describe: '画框皮 URL（同 Panel.skin·art 即框·+skinSlice 9-slice）' },
      { name: 'skinSlice', type: 'number', describe: 'skin 9-slice 源边距 px（画框式无损缩放·不填=cover）' },
      { name: 'shape', type: 'enum', values: ['pill', 'hexagon', 'diamond', 'shield', 'ribbon', 'chevron', 'tag', 'cut'], describe: '异形轮廓（闭集·复用同套 clip-path·缺省矩形）' },
      { name: 'edge', type: 'enum', values: ['jade', 'gold', 'ok', 'warn', 'danger', 'mine', 'foe'], describe: '描边语义/阵营色（金框/阵营框·覆盖默认线）' },
      { name: 'bind', type: 'string', describe: '对话实体 id（resolveDialogue 投影 speaker/text/emotion/kind）' },
    ],
    sample: { type: 'dialog', id: 's-dialog', props: { speaker: '林清越', text: '你终于来了……我等这一刻很久了。', emotion: 'warm', kind: 'line', edge: 'gold' } },
    tags: ['对话框', '台词', '剧情', '旁白', '说话', 'NPC对话', '剧本', '文字框'],
    demo: [
      { tab: 'mod-dialogue', section: 'mod-dialogue', note: '台词框打字机推进' },
      { tab: 'mod-presence', section: 'mod-presence', note: '伴侣被动反应台词' },
    ],
  },
  {
    type: 'choiceList', summary: '选项列表（选项=真按钮·可选性门控）', whenToUse: 'choice 节点的选项。literal 填 options，或 bind=对话实体 id 由 resolveDialogue 投影当前选项 + optionAvailable。选项渲成真 Button→吃 house 糖果皮/kind/shape/sheen-hover。选中发 dialogue.choose + arg=下标（t3-dialogue 认 arg 串·无需游戏 handler）。available:false→灰显不可点。', children: 'none',
    props: [
      { name: 'options', type: 'list', describe: '选项 [{label,available?,actionArg?,icon?}]·available:false 灰显不可点（或 bind 投影填）' },
      { name: 'chooseAction', type: 'string', default: 'dialogue.choose', describe: '选择信号名（缺省 dialogue.choose·arg=下标）' },
      { name: 'optionKind', type: 'enum', values: ['primary', 'ghost', 'quiet', 'hero'], default: 'primary', describe: '选项按钮体量（缺省 primary→吃 house 糖果皮·hero=金 CTA 大键）' },
      { name: 'optionShape', type: 'enum', values: ['pill', 'hexagon', 'diamond', 'shield', 'ribbon', 'chevron', 'tag', 'cut'], describe: '选项异形轮廓（闭集·如 ribbon/chevron/pill）' },
      { name: 'hoverSheen', type: 'boolean', describe: '每项悬停流光（fx:sheen-hover·premium 手感）' },
      { name: 'bind', type: 'string', describe: '对话实体 id（resolveDialogue 投影 options + 逐项可选性）' },
    ],
    sample: { type: 'choiceList', id: 's-choices', props: { optionKind: 'primary', hoverSheen: true, options: [{ label: '坦白心意' }, { label: '岔开话题' }, { label: '沉默不语（需好感 ≥ 10）', available: false }] } },
    tags: ['选项', '分支', '选择', '对话选项', '剧情分支', '答话', '抉择'],
    demo: [
      { tab: 'mod-dialogue', section: 'mod-dialogue', note: '三选项含好感门控' },
    ],
  },
  {
    type: 'portrait', summary: '立绘槽（art + emotion + 名·可异形/描边/高亮）', whenToUse: '角色立绘。art=已解析图 URL（sim 持 key）；缺图→名首字/剧场面具占位（绝不空白）。bind=对话实体 id 由 resolveDialogue 投影 name=speaker/emotion。华丽货架：shape 异形框 / edge 金描边 / glow 说话人高亮。纯展示无信号。', children: 'none',
    props: [
      { name: 'art', type: 'string', describe: '立绘图 URL（sim 持资产 key·resolveAsset 后填·同 Image.src）' },
      { name: 'emotion', type: 'string', describe: '情绪变体键（透出 data-emotion·M2 emotion→assetKey 表选图）' },
      { name: 'name', type: 'string', describe: '角色名（底部小标）' },
      { name: 'side', type: 'enum', values: ['left', 'right'], describe: '站位（缺省 left·名对齐）' },
      { name: 'shape', type: 'enum', values: ['pill', 'hexagon', 'diamond', 'shield', 'ribbon', 'chevron', 'tag', 'cut'], describe: '异形立绘框（闭集·如 hexagon/shield/diamond）' },
      { name: 'edge', type: 'enum', values: ['jade', 'gold', 'ok', 'warn', 'danger', 'mine', 'foe'], describe: '立绘框描边语义/阵营色（金框/阵营框）' },
      { name: 'glow', type: 'boolean', describe: '当前说话人高亮（外发光·矩形框生效·异形改用 edge 高亮）' },
      { name: 'bind', type: 'string', describe: '对话实体 id（resolveDialogue 投影 name=speaker·emotion）' },
    ],
    sample: { type: 'portrait', id: 's-portrait', props: { name: '林清越', emotion: 'warm', side: 'left', edge: 'gold', glow: true }, layout: { width: 120, height: 168 } },
    tags: ['立绘', '角色像', '人物图', '半身像', '表情', '说话人', 'CG', '头像大图'],
    demo: [
      { tab: 'mod-dialogue', section: 'mod-dialogue', note: '立绘加金描边高亮' },
      { tab: 'mod-presence', section: 'mod-presence', note: '按情绪换立绘图' },
    ],
  },
];

/** 按 type 取 spec（校验器/查询用）。 */
const BY_TYPE = new Map<string, UiComponentSpec>(UI_CATALOG.map((s) => [s.type, s]));
export function catalogSpec(type: string): UiComponentSpec | undefined { return BY_TYPE.get(type); }
