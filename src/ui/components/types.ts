// UI Component System — 引擎静态 UI 层
//
// 弱模型的工作：写 LayoutNode 树（纯数据）。
// 引擎的工作：renderNode() + mountUI() 解释这棵树。
// 红线：游戏层不得在此之外手写 HTML 模板或 DOM 操作。

import type { EmojiConfig } from './emoji.js';

export type ComponentType =
  | 'Panel' | 'Button' | 'Label' | 'Dropdown' | 'Badge' | 'Input' | 'Divider'
  | 'Checkbox' | 'Toggle' | 'RadioGroup' | 'Image' | 'Screen' | 'Slider'
  | 'Table' | 'Tabs' | 'ProgressBar' | 'Tag' | 'Modal' | 'Toast' | 'Tooltip'
  | 'Card' | 'PlayingCard' | 'Stepper' | 'Segmented' | 'Avatar' | 'Accordion'
  | 'Rating' | 'Combobox' | 'Drawer' | 'VirtualList' | 'ContextMenu'
  | 'CoinFlip' | 'Versus' | 'Video' | 'Particles' | 'LevelPath'
  | 'Float' | 'Connector'
  | 'dialog' | 'choiceList' | 'portrait';

/** 布局约束：坐标/尺寸/弹性。x/y 触发绝对定位；flex 在父 Panel/Screen 内生效。 */
export interface LayoutConstraints {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** 最大宽度上限 px（响应式·区别于固定 width）+ 自动外边距块居中。整页 chrome「居中圆角框」用：
   *  填一个 maxWidth 数字即得「窄屏铺满、宽屏封顶居中」（无显式 width 时填满到上限再居中）。复用面：所有页面级 UI。 */
  maxWidth?: number;
  flex?: number;
  gap?: number;
  direction?: 'row' | 'column' | 'grid';
  /** 仅 direction:'grid' 生效：单元格最小列宽 px（auto-fill 自适应列数·缺省 96）。卡牌格/货架填这一个数即得自适应网格。 */
  minCol?: number;
  /** 仅 direction:'grid' 生效：**固定列数**（覆盖 auto-fill → repeat(N,1fr)）。要「严格 N 列·格子等分父宽」时用（配 PlayingCard.fluid 让卡填满格、消卡间空隙）。 */
  cols?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** 主轴分布（justify-content·与 align 交叉轴对偶）：内容沿主轴(row=横/column=竖)的排布。
   *  between=两端对齐均分间隔·around/evenly=环绕均分·center/start/end=居中/首/尾。
   *  用于「内容竖向铺满/居中、消除顶部堆叠 + 底部留白」（owner 2026-06-25）。grid 模式忽略。 */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  padding?: number;
  margin?: number;
  /** 旋转角度（度·CSS transform rotate=绕 Z 轴/平面内旋）。扇形手牌/卡牌斜摆填这一个数即得；配 `anim:'spin'` 循环 → 幸运转盘/spinner 加载环/旋转勋章（Z 轴自旋既有轴·非新增）。 */
  rotate?: number;
  /** 缩放倍率（CSS transform scale）。选中态放大、强调用。 */
  scale?: number;
  /** 3D 绕 X 轴倾角（度·前后翻·CSS rotateX）。透视 UI/卡牌前倾/翻面。填了 3D 值自动补 perspective。owner 2026-07-07 3D UI 表达。 */
  rotateX?: number;
  /** 3D 绕 Y 轴倾角（度·左右翻·CSS rotateY）。真 3D 翻面（比 flipcard 假 scaleX 真）·菜单侧旋入场。 */
  rotateY?: number;
  /** 透视深度（px·CSS perspective·越小越夸张·缺省 800）。有 rotateX/Y/z 时自动加；单独填只设景深基准。 */
  perspective?: number;
  /** Z 轴位移（px·CSS translateZ·景深叠层：正=朝屏幕外凸、负=退后）。叠牌/悬浮层的立体分层。需父级 preserve-3d（本件带 3D 变换即自动开）。 */
  z?: number;
  /** 交互 3D 倾斜（悬停时朝内立体抬起·render-only·同 data-tilt3d CSS）。给卡/面板/按钮加"活的立体感"。**只 :hover→触屏无效**·要点按反馈用 press3d。 */
  tilt3d?: boolean;
  /** 按压 3D 反馈（按下沉入 Z + 底唇收缩·糖果厚按钮·render-only·同 data-press3d CSS）。走 :active → **触屏点按也触发**（tilt3d 的移动端补位）。给 Button/Panel/卡牌加"按得下去"的实体感。 */
  press3d?: boolean;
  /** 「飞向」奖励动画（休闲招牌·render-only）：挂载时本元素沿**弧线**从当前位飞到 `to`(目标元素 id)的屏幕中心、缩小淡出——
   *  金币/宝石飞进钱包、卡飞进牌库、加分飞向计分板。`to`=目标节点 id（须在同一 mountUI 树里·mountUI 量两者 rect 算位移）；
   *  ms 时长(缺省 700)·arc 弧顶抬高 px(缺省 60·0=直线)·delay 起步延迟 ms。多个飞行物挂不同 delay=拖尾成串。 */
  flyTo?: { to: string; ms?: number; arc?: number; delay?: number };
  /** 入场/强调动画预设名（引擎内建关键帧·mountUI 注入）：一次性 fadeIn/slideUp/pop/shake/dealIn/flyIn/fadeOut/popOut；
   *  循环 float/glow/pulse/spin/floatUp/marquee/tick（spin=绕 Z 自旋·linear·转盘；marquee=横向滚动·公告跑马灯；
   *  tick=**steps 节拍**·steps(1,end) 硬跳无缓动·「−1」印章每秒跳一下(REQ-UIFX ⑤·周期=animMs 缺省 1000)）。 */
  anim?: string;
  /** 动画时长 ms（缺省 360）。 */
  animMs?: number;
  /** 动画延迟 ms（错峰发牌/逐元素入场用·缺省 0）。 */
  animDelay?: number;
  /** 入场方向（REQ-UI-入场方向·收编 game-a A-017「flyIn 只能从左·缺可配方向」+ game108「大幅度侧向伸入」）：
   *  配 `anim:'flyIn'` 用——从 left/right/top/bottom 滑入。缺省 left（既有行为·零回归）。 */
  animFrom?: 'left' | 'right' | 'top' | 'bottom';
  /** 入场位移幅度 px（配 anim:'flyIn'·缺省 24）。走道/大幅伸入填大值（如 120）——治「写死 24px 只够轻微入场」。 */
  animDist?: number;
  /** 可拖拽：渲染加 draggable + data-drag(=节点 id 作载荷)；mountUI 收 dragstart。 */
  draggable?: boolean;
  /** 放置区：信号名·渲染加 data-drop；mountUI 在此 drop 时调 handlers[信号](被拖节点 id)。 */
  dropZone?: string;
  /** 新手引导锚点键：渲染加 data-anchor → OnboardingOverlay 按它 querySelector 定位 spotlight 高亮（配世界 Coachmark{anchor}）。数据 UI 也能被引导。 */
  anchor?: string;
  /** 意图叠层（render-only·纸牌类基座刚需·REQ game-a A-007）：true=渲染加 `data-allow-overlap` → ui-audit 重叠检查豁免此绝对定位件。
   *  用于**扇形手牌 / 牌堆 / 绝对定位叠放**（叠是设计意图，非 bug）。只标真该叠的件；别拿它掩盖误叠。 */
  allowOverlap?: boolean;
  /** 倒角切角 px（CSS clip-path 八边形·art-deco/扑克牌桌美学）：如 13 = 左上/右下各切 13px。给面板/卡/CTA 切角。 */
  chamfer?: number;
  /** 圆角半径 px（覆盖控件默认圆角·如 Panel 恒 10）。小件异形（城垛/盾/格位·radius 小）或大圆（落点圈=大 radius）用。
   *  通用 LayoutConstraints 字段·任意组件生效（ls 末置 → 覆盖控件自带 border-radius）。REQ-UI-容器描边形。 */
  radius?: number;
  /** 不透明度 0..1（render-only·装饰淡入/水印/剪影/暗态叠加）。通用 LayoutConstraints·任意节点生效。
   *  ⚠️ 别用在正文文字上（半透文字破对比·见 ui-playbook）——给 Image/装饰用。REQ-UI-骰途逐像素③。 */
  opacity?: number;
  /** 流光 sheen（render-only·质感）。**已并入 `fx`**（= `fx:[{kind:'sheen'}]`）；保留作向后兼容别名，新代码用 fx。 */
  sheen?: boolean;
  /** 视觉特效合集（UI 特效库·render-only·闭集·可叠加）——见下 `VisualEffect`。
   *  一个字段表达一串特效（放缩/重点/受击/暴击…），而非每效一个布尔开关（防恶性膨胀·owner 2026-06-27）。 */
  fx?: VisualEffect[];
}

// ── 视觉特效（UI 特效库·render-only·闭集·可叠加）─────────────────────────────────────────────
// owner 2026-06-27：把 UI 层通用特效抽象成「**一个可叠加的闭集合集**」，而非每效一个布尔旗标（防恶性膨胀）。
// 与「战场/实体特效库」**正交**：本件 = UI 元素的**自我动画**（CSS·LayoutNode 层·通用）；战场爆炸/粒子/闪光 =
// **世界实体**（PrefabTemplate + caster + tween + lifetime·render 组件层·游戏特效库）。二者可**叠加**：一张牌做
// UI 的 shake/flash 的同时，战场在牌位生成一个 prefab 爆炸——两层各管各、叠出来。详见 docs/design/effects-architecture.md。
// 闭集 kind = 受控合成（弱模型从枚举里选·绝不塞自由 CSS）；可叠加（buff 同时受击 = glow + shake）；可参数化。
// **新特效 = 加一个 kind（评审过的确定性 CSS），绝不再加布尔旗标。** 这就是替代 sheen?/glow?/… 开关爆炸的抽象。
export type EffectKind =
  | 'pulse'   // 呼吸（缩放/透明·低血量警示/选中强调/待办催促）
  | 'float'   // 上下浮动（漂浮/待命）
  | 'shake'   // 抖动（受击/错误/拒绝·intensity=抖幅·once=单次）
  | 'pop'     // 弹一下（出现/数值跳/强调·一次性）
  | 'glow'    // 外发光（buff/可交互/选中·color=光色）
  | 'sheen'   // 流光斜扫（常驻循环·高级感/稀有/新到）
  | 'sheen-hover' // 流光斜扫·**悬停触发**（鼠标移上去扫一道·非常驻·移开→再移入才重扫=天然冷却·可交互键 premium 手感·REQ-FX-SHEEN-HOVER）
  | 'flash'   // 整体闪色（受击冒红/暴击闪白/警告·color=闪色·常配 once）
  | 'fade'    // 半透明淡出消失（消耗/消退/移除·opacity→0·一次性·REQ-UI-fx源泉消退）
  | 'holo'    // 全息箔（彩虹光随角度流动·收集/gacha 稀有卡·比 sheen 白斜扫更炫·render-only 叠层）
  | 'ripple'  // 点按涟漪（material 触感·:active 时从中心扩散一圈波·休闲触屏反馈·render-only ::after）
  | 'wobble'; // 摇摆（循环 rotate+scale 晃动·蓄势/紧张/摇拳/待机催促·intensity=摆幅·收编 game108 REQ-108-UI-02「摇拳」+ game-f 待机微动·区别 pulse 只缩放/shake 只平移）
export type EffectColor = 'danger' | 'gold' | 'jade' | 'warn' | 'ok' | 'white'; // 语义色 → 主题令牌（闭集·防注入）
// 容器描边语义色（闭集·主题令牌解析·REQ-UI-容器描边形）。Panel.edge 用：语义/阵营框色·绝不收自由 hex。
// mine/foe = 通用「我方/敌方」阵营色（主题 mine/foe 令牌·缺省回退暖/冷）；其余复用既有语义令牌（jade/gold/ok/warn/danger）。
export type EdgeColor = 'jade' | 'gold' | 'ok' | 'warn' | 'danger' | 'mine' | 'foe';
export interface VisualEffect {
  kind: EffectKind;
  color?: EffectColor; // 染色类(glow/flash)取色·缺省按 kind（glow=gold·flash=danger）
  ms?: number;         // 单次时长 / 循环周期
  intensity?: number;  // 强度（shake 抖幅倍率·glow 扩散倍率）·缺省 1
  once?: boolean;      // true=播一次（受击/暴击）·缺省=循环（状态态·如低血量呼吸）
}

/** 异形按钮/面板轮廓（闭集·引擎预置 clip-path·弱 LLM 只能选枚举·绝不收自由 clip-path 坐标）。
 *  缺省不填=矩形（既有 border-radius 行为不变）。pill=全圆胶囊；其余为 clip-path 多边形轮廓。
 *  owner 2026-07-04「异形 UI」需求下沉——见 docs/playbooks/ui.md「异形」行。 */
export type ShapeToken = 'pill' | 'hexagon' | 'diamond' | 'shield' | 'ribbon' | 'chevron' | 'tag' | 'cut';

/** 面色语义令牌（闭集·映射 UITheme·**随主题换皮自适应**·弱 LLM 选名不填 hex）。owner 2026-07-04 色库化需求下沉。
 *  `transparent`=**透明底/无填充**（see-through·带透明色贴图 UI 用：`bg:'transparent'` + `bgTexture` 透明 PNG → 贴图透明处
 *  透见身后·仍保边框/圆角/描边；区别 `bare`=连框都不画）。owner 2026-07-15 透明贴图 UI 需求下沉。 */
export type SurfaceToken = 'panel' | 'raised' | 'sunken' | 'jade' | 'gold' | 'ok' | 'warn' | 'danger' | 'ink' | 'transparent';
/** 预设配色（闭集·引擎内建渐变·8 组主动配色·owner 2026-07-04 拍板·**固定观感·不随主题变**）。 */
export type FillPreset = 'jade-sheen' | 'gold-sheen' | 'ink-deep' | 'steel' | 'blood' | 'frost' | 'ember' | 'void';
/** 面填充（三态·色库优先·custom 显式逃生）：
 *  ① 语义令牌 `SurfaceToken`（'raised' 等·映射主题·**换皮自适应**）
 *  ② 预设配色 `FillPreset`（'jade-sheen' 等·固定观感）
 *  ③ `{ custom }`（**显式标记**才允许自由 hex/gradient·owner「创作者特别指定才自定义」）。
 *  `(string & {})` = 遗留裸串 back-compat（不破坏存量·裸串由 game-skill-audit 标记建议迁 token/preset/custom·**phase-1 非硬拦**）。 */
export type PanelFill = SurfaceToken | FillPreset | { custom: string } | (string & {});

export interface ButtonProps {
  label: string;
  kind?: 'primary' | 'ghost' | 'quiet' | 'hero'; // hero=金色倒角 sheen 大 CTA（下沉自 game-g 出征键·owner 2026-06-25）
  disabled?: boolean;
  action?: string;
  actionArg?: string;
  sub?: string; // hero 键副标（小字第二行·如「挑战 曹操 · 难度 ★★」）
  icon?: string; // 键首内联图标（已解析 URL·1em 随字号·居 label 前）。批32「图标统一升级」：'⚔ 出征' 的 emoji 记号可换成套装美术图标。缺省无=纯文字零变。
  /** 异形轮廓（闭集 ShapeToken·如 hexagon/diamond/shield）。缺省=矩形。命中区：clip-path 多边形**按形裁**（透明角点击穿透·不误触）；
   *  pill 走 border-radius=矩形包围盒。（P3D 复核更正原「命中区=包围盒」旧注·2026-07-15。） */
  shape?: ShapeToken;
  /** 自定义贴图皮（**已解析图 URL**·同 Image.src 约定：sim 持资产 key·游戏经 resolveAsset 解析后填·key 不进画面）。
   *  设了则按钮底=该图 cover·文字叠白字投影保可读；配 shape 可做透明 PNG 异形贴图键。命中区=包围盒。owner 2026-07-04 异形/贴图按钮需求。 */
  skin?: string;
  /** 9-slice 无损缩放（源图四边保留边距·px）。设了则 skin 走 border-image 九宫格：四角固定·边中拉伸——
   *  按钮任意尺寸皮都不变形（治好 cover 的拉伸/裁切）。商业 UI 皮标配。缺省=cover。owner 2026-07-07。 */
  skinSlice?: number;
}

/** 文字色令牌（闭集·主题解析·换皮自适应）。`{custom:'#hex'}` 逃生仅"创作者特别指定"用——
 *  与 `Panel.bg` 三态同口径（令牌优先·custom 显式逃生·audit 标记建议迁令牌）。REQ-UI-Label色三态：
 *  收编 game-g 花色/蓝数字令牌挤（×4）+ game108 D6「11 令牌装不下稿子 14 用色」。红线不破：仍是**闭集令牌 + 显式 custom**，
 *  绝不收裸串（弱 LLM 只选名·特别指定才 {custom}）。 */
export type ColorToken = 'text' | 'sub' | 'dim' | 'jade' | 'gold' | 'ok' | 'warn' | 'danger' | 'mine' | 'foe' | 'ink';
export type LabelColor = ColorToken | { custom: string };

export interface LabelProps {
  text?: string; // 可选：spans / tween / bind 提供内容时可省（缺省空串）
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl' | number; // 具名档(xs10..xxxl34) 或裸 px 数字(复刻精确档·8→任意大·REQ-UI-Label字阶裸数字)
  color?: LabelColor;
  bold?: boolean;
  mono?: boolean;
  /** 具名字体槽（闭集·换艺术字体）。基础槽：ui=主字体 / mono=等宽 / pixel=像素点阵 / display=数码管展示字 /
   *  serif=衬线槽(UITheme.fontSerif·标题/logo 衬线、正文仍 sans)。
   *  艺术字槽（内嵌 Google Fonts·OFL/Apache·拉丁字形·中文仍走主字体）：
   *    impact(Bebas Neue 冲击) / heavy(Anton 厚重) / epic(Cinzel 史诗衬线) / fantasy(MedievalSharp 奇幻) /
   *    elegant(Playfair Display 优雅) / script(Pacifico 花体) / hand(Caveat 手写) / scifi(Orbitron 科幻) /
   *    terminal(VT323 终端) / comic(Bangers 漫画) / stencil(Black Ops One 军械镂空) / western(Rye 西部) /
   *    retro(Monoton 复古霓虹) / marker(Permanent Marker 记号笔) / bubbly(Baloo 2 圆润) / gothic(Pirata One 哥特) /
   *    fashion(Abril Fatface 时尚粗衬) / shadow(Bungee Shade 立体投影)。
   *  惰性拉丁艺术字（url 惰性载·非 base64 常驻·体量大/多字重的）：round(Fredoka 圆润数字/大标题·可变字重 300–700·`bold`→700·配 cnround 成卡通底色)。
   *  CJK 艺术字槽（内嵌 SIL OFL 中/日字·**能渲汉字/假名**·url 惰性载·owner 2026-07-23）：
   *    cnbrush(马善政 中文毛笔行楷) / cnwen(站酷小薇 中文文艺细宋) / cnround(站酷快乐体 中文卡通粗圆黑·标题/大字) / jpbrush(筑紫 日文毛筆明朝) / jppen(Klee One 日文楷書ペン)。
   *  缺省按 mono 布尔回退。红线同 color：只收**枚举槽名**(最弱 LLM 能填)，绝不收自由 font-family 串。 */
  font?: 'ui' | 'mono' | 'pixel' | 'display' | 'serif'
    | 'impact' | 'heavy' | 'epic' | 'fantasy' | 'elegant' | 'script' | 'hand' | 'scifi' | 'terminal' | 'comic'
    | 'stencil' | 'western' | 'retro' | 'marker' | 'bubbly' | 'gothic' | 'fashion' | 'shadow' | 'round'
    | 'cnbrush' | 'cnwen' | 'cnround' | 'jpbrush' | 'jppen';
  /** 磷光发光(text-shadow·琥珀时钟/霓虹标题)：true 时按当前 color 描一圈柔光。纯表现。 */
  glow?: boolean;
  /** 描边字(comic outline·卡通/休闲粗描边标题)：true 时字外描一圈深色轮廓(text-stroke·paint-order:stroke fill 保填色可读)。纯表现·与 glow 可叠。 */
  stroke?: boolean;
  /** 数字格式化(idle/休闲大数与计时)：compact=缩写(1234→1.2K·3.4M·1.5B·1.2T) / time=时:分:秒(秒数→mm:ss 或 h:mm:ss) /
   *  percent=百分比(0.75→75%) / int=整数。作用于 tween 每帧值 + 纯数字 text。缺省=按 decimals 定点。弱模型只选枚举名。 */
  format?: 'compact' | 'time' | 'percent' | 'int';
  /** 字距 px(letter-spacing·Silkscreen 全大写微标常用)。纯表现·只收数字(最弱 LLM 能填)。 */
  tracking?: number;
  /** 世界绑定(收编 GameShell stat)：resourceId·resolveBindings 时把 Resource.current 接到 text 后（text 作前缀/标签）。 */
  bind?: string;
  /** 打字机(收编 VN DialogBox 逐字显)：每字毫秒(>0 开)。mountUI 挂载时逐字揭示·teardown 清定时器。 */
  typewriter?: number;
  /** 数字滚动补间(render-only·掷骰滚到命点/筹码倍率分数跳动)：from→to 在 ms(缺省 600) 内由 mountUI 定时器动画到位；
   *  decimals=小数位(倍率用·缺省 0)。纯表现·不进 sim hash(同 typewriter)。弱模型只填 {from,to,ms} 数字。
   *  scale=**tween 期间字号同步缩放**(REQ-UIFX ⑤·定稿「伤害跳数字号 .82→1」)：起始缩放倍率·随补间进度回到 1。 */
  tween?: { from: number; to: number; ms?: number; decimals?: number; scale?: number };
  /** 富文本多段着色(render-only·词条高亮/分色说明)：替代单色 text，逐段自带 color(同 Label 令牌)/bold。
   *  纯数据(段数组)·最弱 LLM 能填；有 spans 时忽略 text。 */
  /** 富文本分段（render-only）。img=段首内联图标（已解析 URL·1em 随字号·批32「图标统一升级」：emoji 记号可换成成套美术图标）。 */
  spans?: Array<{ text: string; color?: LabelColor; bold?: boolean; img?: string }>;
  /** emoji 图渲逃生（REQ-UI-emoji图渲）：true=保留文本里的 emoji **字形**、不转美术图（代码块/刻意展示字形的场景）。
   *  缺省 false=随主题 `UITheme.emoji` 配置自动图渲（未配则本就零变化）。纯表现。 */
  raw?: boolean;
}

export interface DropdownProps {
  options: Array<{ value: string; label: string }>;
  value?: string;
  placeholder?: string;
  action?: string;
}

// tone 闭集补全（REQ-UIFX 复查带出）：gallery 早已在用 accent/gold/danger 三档，但 renderBadge 只映射 ok/warn/dim →
// 未映射档渲出字面 "undefined;" 样式（静默坏样式·校验器 bad-enum 抓到的真病）。补齐同族语义档（镜像 Toast tone 家族）。
export interface BadgeProps {
  text: string;
  tone?: 'ok' | 'warn' | 'dim' | 'accent' | 'gold' | 'danger';
  /** 首部内联图标（已解析 URL·随字号·居 text 前·同 Tag/Button.icon 约定）。缺省无=纯文字零变。
   *  收编 game-a A-024②「🏆 被硬塞进 text 串」——徽章也该有图标槽（Tag/Button 都有·补齐一致性）。 */
  icon?: string;
}

export interface InputProps {
  placeholder?: string;
  value?: string;
  type?: 'text' | 'number';
  action?: string;
}

export interface PanelProps {
  title?: string;
  titleIcon?: string; // 标题前内联图标（已解析 URL·1.05em 随字号·REQ-UI-标题图标槽）。缺省无=纯文字标题零变。
  scroll?: boolean;
  /** 面填充（三态·色库优先）：`SurfaceToken` 语义令牌(换皮自适应·如 'raised') / `FillPreset` 预设配色(如 'jade-sheen') /
   *  `{custom}` 显式自定义色(创作者特别指定才用)。缺省=主题 bg1。裸 hex 串仍收(back-compat)但 audit 会标建议迁令牌。 */
  bg?: PanelFill;
  /** 暗角叠加（felt 牌桌四周渐暗 vignette）：true 时叠一层径向暗角·纯表现。 */
  vignette?: boolean;
  /** 高亮框（强调态/活动视口）：true 时用 jade 描边 + 柔光投影，替代默认细线边·纯表现。 */
  accent?: boolean;
  /** 磨砂玻璃（REQ-UI-骰途逐像素①·HUD/面板浮在 3D 或大图之上）：true → `backdrop-filter:blur` + 半透底 + 细边。
   *  与整屏 `Screen.blur` 不同（这是 per-Panel）。半透底默认深玻璃；要别的色调用 `bg` 传半透 rgba 覆盖。 */
  glass?: boolean;
  /** 无框纯布局容器（owner 2026-06-25「别千层框」）：true=不画边框/底/圆角、padding 缺省 0——只做 row/column/grid 分组。
   *  边框只留给「真该成一个框的东西」（外框/牌桌/侧栏/卡片）；行列分组一律 bare，避免嵌套出层层框。 */
  bare?: boolean;
  /** 面覆盖皮（复合按钮/框皮·已解析图 URL·REQ-PANELSKIN·同 Button.skin 约定）：整面 art **cover** 覆盖（或配 `skinSlice` 走 9-slice）·
   *  art 即框（压过 bg/边框·**bare 面板不吃皮**·同 panelTexture guard）；**children 照常叠在皮上**——动态文字（如「Call 50」的实时数额）走 LayoutNode 渲在皮之上、不必烤进图。
   *  区别 `bgTexture`（平铺）：这是 cover/9-slice 单图整面。区别 `Button.skin`：不强制白字（children 各自定色）。配 `action` = 复合贴图按钮。 */
  skin?: string;
  /** skin 的 9-slice 源边距 px（画框式框皮·四角固定/边中拉伸·任意尺寸不糊·同 Button.skinSlice）。不填=整图 cover。 */
  skinSlice?: number;
  /** 图片贴图层（平铺·同 Screen.bgTexture）：贴图 URL → repeat 平铺叠在面板底上、可被 bgScroll 滚动。 */
  bgTexture?: string;
  /** 贴图平铺单元尺寸 px（配 bgTexture·缺省=图原始尺寸）。 */
  bgTextureSize?: number;
  /** UV 背景滚动（同 Screen.bgScroll·面板底纹滚动特效·render-only）。 */
  bgScroll?: { x?: number; y?: number; ms?: number };
  /** 程序化纹理叠层（render-only·质感）：stripe=45°斜条纹 / checker=棋盘格。叠在面板内容下（如原版 felt 牌桌斜纹·REQ-UI-G流光底纹③）。 */
  pattern?: 'stripe' | 'checker';
  /** 容器可点（REQ-UI-容器可点·棋枰格/门/卡片区）：有它 → 整个容器渲 `data-action`[+`data-arg`] + cursor:pointer，
   *  点击发信号（同 Button·经 mountUI 委托路由）。让「带 children 的组合容器」也能作点击目标，不必塞个叶子按钮。
   *  红线同既有：只发信号名·handler 不塞自由逻辑。复用面：任何可点的卡片区/格子/列表行容器。 */
  action?: string;
  actionArg?: string;
  /** 描边语义色（REQ-UI-容器描边形·闭集枚举·主题解析·非自由 hex）：阵营框(mine/foe)/金边界格(gold)/
   *  告警框(danger/warn/ok)/翠框(jade)。覆盖默认细线边·复用面：棋盘格/战棋位/卡牌位/堡垒框。 */
  edge?: EdgeColor;
  /** 虚线描边（空格落点圈/占位/拖放目标框）：true → border-style:dashed。配 edge 取色 + radius 取圆。 */
  dashed?: boolean;
  /** 异形容器轮廓（闭集 ShapeToken·复用 Button 同一套 render.ts SHAPE_CSS·**非自由 clip-path 坐标**·REQ-UI-异型容器①·
   *  owner 2026-07-24「异型 UI 是底层需求」）。缺省=矩形（既有行为不变）。非矩形容器（异形限时菜单卡/盾形信息板/
   *  六边蜂窝格）不必再靠透明贴图皮硬凑。命中区=包围盒（同 Button）；clip 会裁掉溢出多边形的子内容→**异形须给足
   *  width/height**。与 skin/bgTexture/edge 可叠（clip 在最外层裁形）。 */
  shape?: ShapeToken;
  /** 硬边平移投影（REQ-108-UI-03·卡通"浮空感"基件）：渲成 `box-shadow:0 <y>px 0 <color>`——**硬边偏移**(不糊),
   *  卡通 UI 的立体浮空全靠它（身份牌 y=4 / 相位牌 y=5 / 招式卡 y=7 / 主 CTA y=8）。区别 `accent` 的柔光、
   *  区别 `press3d/tilt3d` 的交互态：这是**常态**投影。`y`=下沉像素；`color` 缺省=深墨(`ink`/`bg0`)，
   *  优先填闭集 `SurfaceToken`(换皮自适应·如 'jade'/'gold') · 特别指定才用裸色串（稿子精确墨色）。
   *  与 skin/edge/shape 可叠（投影在盒外·shape 异形同样跟形）。纯表现·不进 sim hash。 */
  shadow?: { y: number; color?: SurfaceToken | (string & {}) };
}

/** 单个开/关复选框。handler 收到 'true' | 'false'。 */
export interface CheckboxProps {
  label: string;
  checked?: boolean;
  action?: string;
}

/** 药丸形开关（Toggle Switch）。handler 收到 'true' | 'false'。 */
export interface ToggleProps {
  label: string;
  checked?: boolean;
  action?: string;
}

/** 互斥单选组。name 用于分组；handler 收到所选 value。 */
export interface RadioGroupProps {
  name: string;
  options: Array<{ value: string; label: string }>;
  value?: string;
  action?: string;
}

/** 图片/图标。fit 控制 object-fit；radius 为圆角 px。 */
export interface ImageProps {
  src: string;
  alt?: string;
  fit?: 'cover' | 'contain' | 'fill';
  radius?: number;
  /** 世界绑定(收编 GameShell image bind)：StringVar id·resolveBindings 时 src 取自其 value。 */
  bind?: string;
}

/**
 * 全屏根容器——页面背景层。
 * bg：CSS 颜色或渐变；image：背景图 URL；center：垂直水平居中子项。
 */
export interface ScreenProps {
  /** 页面背景填充（三态·同 Panel.bg）：`SurfaceToken` / `FillPreset` / `{custom}`。缺省=主题 pageBg。裸串仍收(back-compat)。 */
  bg?: PanelFill;
  image?: string;
  /** 图片贴图层（平铺·区别于 image 的 cover 整图 & 主题 texture 的程序化纹理）：贴图 URL → 渲成 repeat 平铺、叠在底色上、可被 bgScroll 滚动。游戏填**已解析 URL**（资产 key 自行经 resolveAsset 解析·sim 持 key 保纯）。三路并存：程序化(主题 texture) / cover 整图(image) / 平铺图片(bgTexture)。 */
  bgTexture?: string;
  /** 贴图平铺单元尺寸 px（配 bgTexture·缺省=图原始尺寸）。 */
  bgTextureSize?: number;
  blur?: number;
  center?: boolean;
  /** 填满宿主定尺盒（REQ-SCREENFILL·去竖屏底部信箱空白）：缺省 Screen 高=`min-height:100vh`（吃真实浏览器视口·
   *  直挂页面时对）；但 `mountHost` 建的是**固定 fieldW×fieldH scene 盒再整体 transform:scale 信箱化**，此时 `100vh`
   *  ≠ 盒高（1920）→ 内容只长到自然高、盒底空出信箱条。设 `fill:true` → 改 `min-height:100%`（吃父定尺盒的显式高·
   *  如 mountHost overlayHost `inset:0` 于 1920px scene）→ Screen 撑满盒、内部 `flex:1` 区块吃满剩余空间。
   *  **只在父有确定高度时用**（mountHost 场景盒 / 显式 height 容器）；直挂无定高页面的 Screen **别设**（`100%`→0 塌陷）。缺省 false=零回归。 */
  fill?: boolean;
  /** UV 背景滚动（render-only·滚动 UI 特效）：背景每 ms(缺省 6000) 平移 (x,y) px 循环。配 texture/平铺底纹·mountUI 注入滚动动画。纯数字（弱模型能填）。 */
  bgScroll?: { x?: number; y?: number; ms?: number };
}

/** 数值滑块。handler 收到数值字符串（Number(arg) 转回）。 */
export interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  label?: string;
  action?: string;
}

// ── Table（数据表 / 榜单 / 数值表）：列定义 + 行数据。游戏只填 columns + rows（最弱 LLM 能填）。 ──
// 列：key 取行 cells[key]；align 对齐；width 固定列宽 px（缺省弹性均分）。
export interface TableColumn { key: string; label: string; align?: 'left' | 'center' | 'right'; width?: number }
// 行：id 唯一；cells = 列 key → 文本；action 可选（整行可点·arg=行 id）；tone 着色（普通/强调/淡）。
export interface TableRow { id: string; cells: Record<string, string>; action?: string; tone?: 'normal' | 'accent' | 'dim' }
export interface TableProps { columns: TableColumn[]; rows: TableRow[]; title?: string; empty?: string }

// ── Tabs（= Table Pages）：带标签的多页。引擎管切换——点 label 切页、**不重建页内容**
//    （抗闪屏内建·下沉自 game-g 大厅 setTab 定点刷新；解决"切页重建 52 网格/跳滚动"一类 bug 一次）。 ──
// LayoutNode.children = 各页内容（顺序对齐 tabs：tabs[i] ↔ children[i]）。
// active = 当前页 id（缺省第一页）；action = 切页额外回调（可选·core 切换由引擎做、无需游戏处理）。
export interface TabsProps { tabs: { id: string; label: string; anchor?: string; icon?: string }[]; active?: string; action?: string } // tab.anchor=引导锚点(REQ-UI-Tabs每页签锚点)；tab.icon=页签文字前内联图标 URL(1.05em·REQ-UI-标题图标槽·缺省纯文字零变)

// ── ProgressBar（纯展示比例条·血/蓝/经验/进度）：区别于可拖的 Slider。value/max → 填充宽度；tone 取主题令牌。──
// max 缺省 1（value 当 0..1 比例）；showValue=true 右上显示 百分比(max=1) 或 value/max。纯展示·无事件。
// REQ-UIFX liquid 档（同族扩写·非新控件）：shape:'liquid' = 液面杯（Pixel Pour 注水一类）。**游戏只给标量 value**（水位）——
//   波动/气泡/晃动全由渲染器承担（双错频椭圆脊 + 整杯 slosh + 上窜气泡·CSS keyframes·server.ts 注入），
//   不许游戏层每帧烤水面进贴图（owner 判词·见 Particles 头注同案）。render-only·不进 sim/hash。
export interface ProgressBarProps {
  value: number; max?: number;
  tone?: 'accent' | 'gold' | 'ok' | 'warn' | 'danger';
  label?: string; showValue?: boolean;
  /** 形态(缺省 bar=线性条·向后兼容)：ring=环形/径向进度(conic 弧·体力/耐力/每日目标/冷却环)；
   *  liquid=**液面杯**(REQ-UIFX·value=水位·会晃的水面+气泡·杯体=本节点盒 layout.width/height)。中心显 value/label。 */
  shape?: 'bar' | 'ring' | 'liquid';
  /** 环直径 px(shape:'ring' 用·缺省 64)。 */
  size?: number;
  /** 液面杯体圆角 px（shape:'liquid'·按盒圆角裁水体·缺省 14）。杯底圆角靠它，异形杯配 layout.radius 同轴覆盖。 */
  radius?: number;
  /** 液体色（shape:'liquid'·CSS 色·净化后插样式·如 '#31b7f2'）。缺省按 tone 令牌取色。 */
  fillColor?: string;
  /** 液面波动（shape:'liquid'·缺省 true）：主脊 900ms scaleY 1↔.5 荡 ±3% + 副脊 1250ms 反向（两条错频才有晃动感）
   *  + 整杯以杯底为轴 ±1.6° slosh(1300ms)。false=静水（只留静态水面脊）。 */
  wave?: boolean;
  /** 气泡数（shape:'liquid'·缺省 0=无·上限 8）：从杯底往上窜·尺寸/周期/横位 index 确定式分档（定稿 16/11/20px·1.5/1.8/2.1s 错开发）。 */
  bubbles?: number;
  /** 世界绑定(收编 GameShell bar)：resourceId·resolveBindings 时 value/max 取自 Resource.current/max。 */
  bind?: string;
}

// ── Particles（UI 层庆祝粒子叠层·render-only·下沉自「休闲 juice 缺口」owner 2026-07-15）───────────
// 通关撒纸屑 / 领奖金币雨 / 星光爆 / 环境微光——fx 是 per-node 无法喷「一把 N 个粒子」，这是 UI 层发射器（世界层对等件=Vfx3D）。
// render-only 表现层：不进 sim/hash，粒子位置/延迟由 index 确定式派生（无裸 Math.random·可回归测）。铺满父容器·pointer-events:none。
// REQ-UIFX（owner 2026-08-08·game108 v3 定稿带出）：扩写到与 Vfx3D **对位**（轴名照 Vfx3D 既有一套·不另起）：
//   color/colorGradient/size(分档)/shape:'cone'+coneAngle/speed/lifetime/gravity/drag/飞向 LayoutNode(flyTo=AnchorRef)/
//   拖尾 trail(对位 Trail3D segments/width/fade/blend)。填了 shape/gravity/drag/flyTo/trail 任一 → **物理弹道模式**：
//   渲染器胶水（server.ts rAF 积分·render-only）驱动「初速+重力+阻尼(+弹簧引向目标)」，**不许游戏层每帧生成新贴图绕过去**
//   （owner 判词·每帧换 data-URI ⇒ mountUI 整屏重建 ⇒ networkidle 永不闲·2026-08-07 实测）。缺省全不填=四预设 CSS 行为零变化。
export interface ParticlesProps {
  kind: 'confetti' | 'coins' | 'stars' | 'sparkle'; // 纸屑雨 / 金币雨 / 星光爆(径向) / 环境微光(原地闪)——物理模式下=粒子体形（彩片/金圆/★/光点）
  count?: number;   // 粒子数(缺省 confetti 26·其余 16·上限 60 防过载)
  loop?: boolean;   // true=持续循环(缺省·环境/展示)；false=播一次即停(庆祝一次性·配退场)
  // 跟随光标态（render-only·下沉自 game-b「GameD 粒子追随」owner 2026-07-22）：设 'cursor' → 粒子簇
  // 收成小簇（软径向遮罩 + screen 混色·不挡字）·每帧 JS 缓动逼近指针（同 anchor/相机 pivot·非 CSS 动画）·
  // 指针离场淡出。渲染器侧胶水（server.ts 跟随循环）读 data-particle-follow 驱动；游戏侧纯数据消费。
  follow?: 'cursor';
  // ── REQ-UIFX 对位 Vfx3D 轴（全部可选·render-only）─────────────────────────────────────
  /** 粒子单色（CSS 色·净化后插样式·如 '#ff5d7d'）。替代预设色板；四预设 kind 也吃（confetti 换牌色等）。 */
  color?: string;
  /** 粒子体径向渐变（芯→缘·对位 Vfx3D colorGradient 的 Gradient stop 形状·color 为 CSS 色串）：
   *  定稿「芯白 → 牌色 → 牌色 75%」= [{t:0,color:'#fff'},{t:.45,color:'#e94f5a'},{t:1,color:'#e94f5a',alpha:.75}]。
   *  UI 层为静态径向渐变（非 over-life·CSS 限制·轴名对位语义按 UI 层落地）。alpha 仅对 #rrggbb 形色生效。在场覆盖 color。 */
  colorGradient?: Array<{ t: number; color: string; alpha?: number }>;
  /** 粒子直径 px：单数=统一；数组=**尺寸分档**（index 确定式取档·定稿「六档 12–30」= [12,16,20,22,26,30]）。缺省=原 index 派生小片。 */
  size?: number | number[];
  /** 发射形状（对位 Vfx3D·填了即入物理弹道模式）：point=四散（黄金角摊开）·cone=绕「上」方向锥（先窜后落配 gravity）。 */
  shape?: 'point' | 'cone';
  /** cone 半角（弧度·对位 Vfx3D·缺省 0.4）。 */
  coneAngle?: number;
  /** 初速 px/s（对位 Vfx3D speed·缺省 320·index 确定式 ±15% 抖动）。 */
  speed?: number;
  /** 粒子寿命（秒·对位 Vfx3D·缺省 1.6）。flyTo 在场时到达目标即回收（先到先收）。 */
  lifetime?: number;
  /** 下坠加速度 px/s²（正=向下·对位 Vfx3D gravity）。「先向上窜再俯冲」= cone 初速向上 + gravity，非手写关键帧。 */
  gravity?: number;
  /** 阻尼（每秒衰减比例 0..n·对位 Vfx3D drag）。配 flyTo = 阻尼弹簧 = 缓入缓出。 */
  drag?: number;
  /** 逐颗错峰 ms（定稿「每颗错开 36ms」·Vfx3D rate 的一次性形态·缺省 36·物理模式用）。 */
  stagger?: number;
  /** 飞向 LayoutNode（**复用 AnchorRef{kind:'node',id} 寻址**·同 Float/Connector/layout.flyTo 一套·不另造第三套）：
   *  对每颗粒子施弹簧力逼近目标元素锚点（= Vfx3D attractor 的 UI 形态·缺省带轻阻尼），到达即回收。
   *  金币飞进钱包/伤害粒子射向敌牌。目标须在同一 mountUI 树（或同 document 按 id 兜底）。 */
  flyTo?: AnchorRef;
  /** 拖尾（对位 Trail3D 轴名）：segments=节点数(缺省 6·上限 16·DOM 预算故缺省小于 Trail3D 的 20)·
   *  width=头端宽 px(缺省=粒径 60%)·fade=尾端不透明度 0..1(缺省 0=尾端全透明)·blend=add 发光/alpha 实体(缺省 alpha)。 */
  trail?: { segments?: number; width?: number; fade?: number; blend?: 'add' | 'alpha' };
}

// ── LevelPath（关卡地图·休闲选关屏经典·render-only·下沉自「关卡地图缺口」owner 2026-07-15）─────────────
// 一串关卡节点自动摆成**蛇形蜿蜒路径**（Candy Crush 式）+ SVG 连接线；游戏只给节点列表 + 状态，引擎排路径 + 画连线 + 渲节点。
// 节点状态：done=通关(实心 + ★数) / current=当前(高亮脉冲) / locked=未解锁(灰 + 🔒)。点节点发 action 信号(arg=actionArg·选关)。
export interface LevelPathProps {
  nodes: Array<{
    label?: string;                            // 节点标（关号·缺省用序号）
    state?: 'done' | 'current' | 'locked';     // 缺省 locked
    stars?: number;                            // 0..3 星（done 时节点上方显）
    action?: string; actionArg?: string;       // 点击信号（选关·同 Button 只发信号名）
  }>;
  cols?: number;   // 每行几个（蛇形宽度·缺省 3）
  tone?: 'jade' | 'gold' | 'accent'; // 已通关路径/节点主色（缺省 gold）
}

// ── 锚定层（REQ-UI-锚定与绑定层①·owner 亲派·render-only）──────────────────────────────────────────
// 消灭「手写 getElementById('u-'+id)+getBoundingClientRect+createElement」病（game-g 战场徽标/VS 连线全这么写）。
// 引擎给「把浮层/连线钉在活动目标上」的**数据说法**：mountUI 每帧读目标 live rect 定位（不进 sim/hash·目标消失自隐）。
/** 锚引用：kind=node（同 mountUI 树里的 LayoutNode id·**现一律用这路**）/ entity（读 `data-entity-anchor="<id>"`·**预留契约·生产端未接**·
 *  2D canvas / 3D WebGL 无逐实体 DOM·全库零生产者→别用·用了浮层永远自隐；真消费者出现时再开引擎单·Lead 域）。 */
export interface AnchorRef {
  kind: 'entity' | 'node';
  id: string;
  at?: 'center' | 'top' | 'bottom' | 'left' | 'right'; // 锚在目标包围盒哪个点（缺省 center）
  offset?: { x?: number; y?: number };                 // 锚点再偏移 px
}
// Float（浮层·钉活动目标）：children 每帧定位到 anchorTo 目标——头顶名牌/血条/伤害数/选中光标/徽标。目标消失→自隐（不悬空）。
export interface FloatProps {
  anchorTo: AnchorRef;
  ttlTicks?: number; // 存活帧数（缺省常驻·给了则 N 帧后自隐·如伤害数飘完即消）
}
// Connector（连线·「谁打谁」的数据说法）：两锚点间画线（实线/虚线/箭头），每帧跟随两端。
export interface ConnectorProps {
  from: AnchorRef;
  to: AnchorRef;
  style?: 'solid' | 'dashed' | 'arrow';               // 线型闭集
  tone?: 'jade' | 'gold' | 'ok' | 'warn' | 'danger';  // 线色令牌（非裸 hex）
  label?: string;                                      // 线中点标（伤害/关系）
}

// ── Tag（可点过滤标签/词条·筛选条大量用）：active 高亮；可点(action·arg=actionArg)；可删(removable 显 ×)。──
export interface TagProps {
  label: string; active?: boolean; tone?: 'normal' | 'accent' | 'dim';
  action?: string; actionArg?: string; removable?: boolean;
  icon?: string; // 首部内联图标（已解析 URL·1em 随字号）。批32：货币/生肖 pill 的 emoji 可换成套装美术图标。缺省无=纯文字零变。
  /** 尺寸档（缺省 md=原默认·向后兼容）：sm 紧凑筛选条 / md 默认 / lg「大气药丸」(货币计数 💎/💰、稀有度等需醒目的 pill·≈2x)。
   *  Tag 无 children 逃生、Label 无药丸 chrome——pill 缩放只能靠这一档（同 Modal/PlayingCard.size 体系）。 */
  size?: 'sm' | 'md' | 'lg';
}

// ── Modal（居中模态浮层 + 遮罩 + 关闭语义）：children = 弹窗体。──
// closable 显示右上 ×（缺省 true）；closeAction = 点 × / 点遮罩本身 时触发的信号（遮罩关闭由 mountUI 内建）。
export interface ModalProps {
  title?: string; size?: 'sm' | 'md' | 'lg'; closable?: boolean; closeAction?: string;
}

// ── Toast（飘字提示·非模态）：tone 着色的小药丸。──
// 既可作静态节点(渲染提示药丸)，也由挂载器 API showToast() 触发「定时自消」的浮层（duration ms·缺省 2600）。
export interface ToastProps {
  text: string; tone?: 'ok' | 'warn' | 'danger' | 'accent' | 'dim'; duration?: number;
}

// ── Tooltip（悬浮提示/词条浮窗）：包裹 children 作触发元素；hover/focus 显示 content 气泡。──
// 内联样式表达不了 :hover → 显隐由 mountUI 内建（mouseover/focusin 显、移出隐）。placement 定气泡方位。
export interface TooltipProps {
  content?: string; placement?: 'top' | 'bottom' | 'left' | 'right';
  /** 富气泡根（通常一个 Panel(column)·内含 标题/效果/数值行 Label+spans）：有它则气泡渲这棵 LayoutNode、忽略 content，气泡变宽可换行。地煞/天罡/装备等词条详情用。 */
  bubble?: LayoutNode;
  /** 块级触发元素（缺省 inline-flex）：true→触发元素 display:block + width:100%，能作 grid/flex item 随轨道(1fr)拉伸、
   *  不塌陷。用于「给 grid 卡墙里的整张牌/格子包 hover 浮窗」——内联 span 作 grid item 不拉伸会撑塌（PG 回执 2026-06-27）。 */
  block?: boolean;
}

// ── Card（网格卡单元·配 Panel grid 用）：媒体字形 + 标题 + 副标 + 角标 + tone/锁态 + 可点。──
// children 可放自定义体（覆盖默认 title/sub 排版）。Card + Panel(grid) = 卡牌格/货架标准组合。
export interface CardProps {
  title?: string; sub?: string; media?: string; corner?: string;
  tone?: 'normal' | 'accent' | 'dim' | 'locked'; action?: string; actionArg?: string;
}

// ── PlayingCard（扑克牌原语·下沉自各卡牌游戏的 bespoke 牌面 · owner 2026-06-25）─────────────
// 一张真正的扑克牌：花色角标(双角镜像) + 中央大花色 + 正/背面 + 选中/暗态 + 可点 + 牌下标签。
// 旋转/缩放/发牌动画走 layout(rotate/scale/anim:dealIn|flyIn|pop)——不在本控件内重造。
// 数据接口（最弱 LLM 也能填）：{ rank:'A', suit:'♠', faceUp:true }。花色色自动判红/黑（♥♦红·♠♣黑）。
// 复用面：扑克/接龙/TCG/Balatro 类一大片；game-g 主页对决卡、牌库 52 牌、收藏牌谱共用。
export interface PlayingCardProps {
  rank: string;                          // 'A' 'K' 'Q' 'J' '10'..'2'（或自定义点数文本）
  suit: string;                          // '♠'|'♥'|'♦'|'♣'（红黑自动判；其它符号按黑处理）
  faceUp?: boolean;                      // 缺省 true；false=展示牌背
  label?: string;                        // 牌下小标签（如名将名）
  value?: string;                        // 牌右下小数值（如 favor）
  selected?: boolean;                    // 选中高亮（入选出战组 → 金边发光）
  dimmed?: boolean;                      // 弱牌/未拥有 → 半透明
  size?: 'sm' | 'md' | 'lg';             // 牌面尺寸（缺省 md）
  face?: 'dark' | 'light';               // 牌面底：dark=暗主题卡(缺省) / light=经典白扑克牌（红黑对比·对决卡用）
  back?: string;                         // 牌背中央纹样字符（缺省 ♠ 暗纹）
  art?: string;                          // 立绘槽（已解析 URL/SVG）：正面时居中显名将立绘剪影、替代中央大花色（角标点数花色仍在）。游戏经 resolveAsset 把资产 key 解析后填（sim 持 key 保纯）。复用面：所有卡牌游戏。
  faceArt?: string;                      // 整牌面贴图（已解析 URL·faceUp 时整面 cover·替代程序化牌面=角标/中央花色全隐·art/back 一脉的正面版）。牌面即一张插画（掼蛋 54 张牌面皮/TCG 卡面）——是「牌面能换图」的槽。label/value 覆盖层仍在（可不填）。不填=原程序化牌面零变化。REQ game-a A-024①。
  faceArtSlice?: number;                 // faceArt 9-slice 源边距 px（可选·画框式牌面按边距无损缩放·同 Button.skinSlice；不填=整图 cover）。
  fluid?: boolean;                       // 流式卡：width:100% 充满父格 + 维持 5:7 aspect-ratio（替代固定 sm/md/lg 档）。配 Panel grid cols:N → 严格 N 列、卡填满、零卡间空隙（REQ-UI-G收藏卡②）。
  flipOnHover?: boolean;                 // 悬停翻面：配 backFace·鼠标悬停时 front→back 绕 Y 轴真 3D 翻转（rotateY 180°+backface-hidden），露出背面信息子树（CSS 注入·REQ-UI-G收藏卡①）。**只 :hover→触屏无效**·手机翻牌用 flipped。
  flipped?: boolean;                     // 状态驱动翻面（配 backFace）：由数据/游戏 state 决定翻到哪面（true=背面），点按/state 变即翻——**非 hover·触屏可用**（记忆翻牌/卡牌对战/刮刮乐）。同一套真 3D rotateY 翻转，由 data-flipped 属性驱动。与 flipOnHover 互斥（flipped 在场优先）。
  backFace?: LayoutNode;                 // 背面内容子树（通常 Panel(column) 装 名/朝代/简介，同 Tooltip.bubble 思路）。仅 flipOnHover / flipped 时渲。
  backPattern?: 'checker' | 'stripe';    // 牌背程序化纹理（faceUp:false 时叠·原版红牌背棋盘格条纹·REQ-UI-G流光底纹②）。
  backArt?: string;                      // 牌背贴图（已解析 URL·faceUp:false 时整面 cover·替代纹样字符/程序化纹理）。REQ-UI-PlayingCard-back（07-14 缺口单·07-15 批29 落地）。
  action?: string; actionArg?: string;   // 可点 → handlers[action](actionArg)
}

// ── Stepper（数量 ± 加减）：value 当前值；±按钮 data-arg=钳位后的新值；到界禁用。handler 收到新值字符串。 ──
export interface StepperProps {
  value: number; min?: number; max?: number; step?: number; action?: string;
}

// ── Segmented（紧凑分段选择·比 RadioGroup 省地方）：options + value(选中)；handler 收到所选 value。 ──
export interface SegmentedProps {
  options: { value: string; label: string }[]; value?: string; action?: string;
}

// ── Avatar（头像/立绘位）：src 有则图、无则取 name 首字；size 尺寸 px；shape 圆/圆角/方。 ──
export interface AvatarProps {
  src?: string; name?: string; size?: number; shape?: 'circle' | 'rounded' | 'square';
  /** 环形进度描边（REQ-UI-Avatar环·回合计时/蓄力/进度环绕头像）：conic 弧沿头像外圈画到 value/max 比例。
   *  收编 game-c hud「读秒条闭集近似」+ game-b「头像回合计时描边」两处近似——ProgressBar.ring 有但不裹头像。
   *  tone=闭集语义色（同 ProgressBar）·缺省 accent。纯表现·不填=无环零变。 */
  ring?: { value: number; max?: number; tone?: 'accent' | 'gold' | 'ok' | 'warn' | 'danger' };
}

// ── Accordion（折叠面板）：title 行点击切开合（mountUI 内建）；open 初始展开；children = 折叠体。action 可选通知信号。 ──
export interface AccordionProps {
  title: string; open?: boolean; action?: string;
}

// ── Rating（星级评分）：value 已亮颗数；max 总颗（缺省 5）；有 action 则可点设值(arg=点中颗数)，无则只读展示。 ──
export interface RatingProps {
  value: number; max?: number; action?: string;
}

// ── Combobox（带搜索的下拉）：输入框过滤选项、点选回填。──
// 过滤/开合/点选由 mountUI 内建（focus 开、input 过滤、点项选+合、点外合）；选中 → action(arg=value)。
export interface ComboboxProps {
  options: { value: string; label: string }[]; value?: string; placeholder?: string; action?: string;
}

// ── Drawer（侧滑/底部抽屉）：children = 抽屉体。──
// 机制同 Modal（遮罩 + 关闭复用 mountUI 遮罩关闭）；side 定贴边方位。closeAction = 点 × / 点遮罩信号。
export interface DrawerProps {
  side?: 'left' | 'right' | 'bottom'; title?: string; closeAction?: string;
}

// ── VirtualList（长列表虚拟滚动）：只渲可视窗口的行（不一次性渲全部·解决千行级卡顿）。──
// 列定义同 Table；rowHeight 固定行高；height 视口高(缺省 320)；action 行可点(arg=row.id)。
// 滚动重渲窗口由 mountUI 内建（持 root 数据·按 scrollTop 算窗口）。
export interface VirtualListProps {
  rows: { id: string; cells: Record<string, string> }[];
  columns?: TableColumn[]; rowHeight: number; height?: number; action?: string;
}

// ── ContextMenu（右键/长按菜单）：包裹 children 作触发元素；右键(contextmenu)在光标处弹菜单。──
// 弹出/定位/点项/点外合由 mountUI 内建；点项 → 该项 action(arg=item.id)。
export interface ContextMenuProps {
  items: { id: string; label: string; action: string }[];
}

// ── CoinFlip（掷币·下沉自 game-g 掷命对决 3D 硬币 · owner 2026-06-25）─────────────────
// 确定性掷币：结果由游戏算好(outcome)传入·控件只演出。spinning=true 播 3D 翻转落定到 outcome；false=静态显示。
// 数据接口：{ outcome:'heads' }。复用面：掷命/猜硬币/随机二选一演出（多游戏通用）。
export interface CoinFlipProps {
  outcome: 'heads' | 'tails';            // 结果（确定性·游戏侧算好）
  headsLabel?: string; tailsLabel?: string; // 两面文字（缺省 正/反）
  headsArt?: string; tailsArt?: string;  // 两面贴图（已解析 URL·面底=图 cover·文字白字投影叠显·批29b「硬币也可换」）。缺省=原金/暖底零变。
  spinning?: boolean;                    // true=播翻转动画落定；false=静态显示结果
  size?: number;                         // 直径 px（缺省 92）
  durationMs?: number;                   // 翻转时长（缺省 1100）
  action?: string;                       // 可选点击信号
}

// ── Versus（对决特写·下沉自 game-g 对决火花 · owner 2026-06-25）─────────────────────
// 两张牌正面对决 + 中央胜率/火花 + 胜方高亮。复用面：卡牌对战/PVP 结算特写。
// 数据接口：{ left:{rank,suit}, right:{rank,suit}, label:'76 : 24', winner:'left' }。
export interface VersusProps {
  left: PlayingCardProps; right: PlayingCardProps; // 左右两张牌
  label?: string;                        // 中央文字（如胜率 '76 : 24'）
  winner?: 'left' | 'right' | 'none';    // 胜方高亮（败方暗）
  spark?: boolean;                       // 中央火花闪（缺省 true）
}

// ── Video（视频嵌入·爱诗 AIGP 生成的开场/转场短视频等）：原生 <video>·数据驱动播放。
// src/poster 为 URL（爱诗句柄 url / 海报）；controls 缺省开；autoplay 自动补 muted（浏览器策略）。纯表现。
export interface VideoProps {
  src?: string; poster?: string;
  controls?: boolean; loop?: boolean; autoplay?: boolean; muted?: boolean;
}

// ── 剧情 / VN 三件（REQ-DIALOGUE M1·闭集 VN 控件·消费 t3-dialogue 投影·退役 ui/vn React 版）────────────
// 数据契约继承自 ui/vn `VNBinding` 的**形状**（dialogueEntityId/portrait），但**代码不继承**（纯 LayoutNode·非 React）。
//   · 投影（读世界）：给 `bind`=对话实体 id → `resolveDialogue(tree, DialogueSource)` 从世界当前节点填 speaker/text/options
//     （标量 UIDataSource 表达不了「变长选项 + 逐项可选性」这类结构投影·故为独立投影器·镜像 resolveBindings）。
//   · 信号（写世界）：dialog 点击→`dialogue.advance`；choiceList 选中→`dialogue.choose` + arg=下标
//     （t3-dialogue 已认 arg 字符串→无需游戏 handler·见 src/skills/tier3/dialogue.ts）。
// 红线：控件=闭集纯数据·禁手写 React/DOM；typewriter 等观感=控件渲染参数（render-only·不进 sim）。

/** 台词框：说话人 + 台词 + 推进。投影当前对话节点 speaker/text/emotion/kind；可推进节点点击发 `advanceAction`（缺省 dialogue.advance）。
 *  美术货架（闭集令牌透传·华丽起手）：skin=画框皮（9-slice）· shape=异形轮廓 · edge=阵营/金描边——用足既有面板货架，非新写美术。 */
export interface DialogProps {
  speaker?: string;          // 说话人名（literal·或经 bind 投影填）
  text?: string;             // 台词正文（同上·复用 Label 打字机/emoji/字体）
  emotion?: string;          // 情绪键（M1 透出 data-emotion·M2 驱动立绘变体）
  kind?: 'line' | 'choice' | 'check'; // 当前节点种类（投影填）：choice 节点隐推进提示（推进交给 choiceList）
  advanceAction?: string;    // 推进信号名（缺省 dialogue.advance）
  typewriter?: number;       // 打字机每字 ms（复用 Label 逐字揭示·render-only 不进 sim）
  skin?: string;             // 台词框画框皮（已解析图 URL·同 Panel.skin·art 即框·压过底/边框）
  skinSlice?: number;        // skin 9-slice 源边距 px（画框式无损缩放·不填=cover）
  shape?: ShapeToken;        // 异形轮廓（闭集·复用 Panel/Button 同套 clip-path·缺省=矩形）
  edge?: EdgeColor;          // 描边语义/阵营色（覆盖默认线·金框/阵营框）
  bind?: string;             // 对话实体 id（resolveDialogue 投影 speaker/text/emotion/kind）
}
/** 选项列表：choice 节点选项 + 可选性（`available:false`→灰显不可点）。选中发 `chooseAction` + arg=下标（或 actionArg）。
 *  美术货架：选项渲成真 `Button` → 白拿 house `buttonSkins` 糖果厚唇皮 + `optionKind`（hero 金 CTA 等）+ `optionShape` 异形 + `hoverSheen` 悬停流光 + 逐项 `icon`。让数据作者从按钮货架挑对话按钮体量。 */
export interface ChoiceListProps {
  options?: Array<{ label: string; available?: boolean; actionArg?: string; icon?: string }>;
  chooseAction?: string;     // 选择信号名（缺省 dialogue.choose）
  optionKind?: 'primary' | 'ghost' | 'quiet' | 'hero'; // 选项按钮体量（缺省 primary→吃 house 糖果皮·hero=金 CTA 大键）
  optionShape?: ShapeToken;  // 选项异形轮廓（闭集·如 ribbon 绶带/chevron 箭头/pill 胶囊）
  hoverSheen?: boolean;      // 每项悬停流光（fx:sheen-hover·premium 手感）
  bind?: string;             // 对话实体 id（resolveDialogue 投影 options + 逐项 optionAvailable）
}
/** 立绘槽：art 图（经资产索引·已解析 URL）+ emotion 变体键 + 角色名。纯展示（无信号·表现层旁路）。缺图→名首字/剪影占位（绝不空白/报错）。
 *  美术货架：shape=异形立绘框（六边/盾形）· edge=金/阵营描边 · glow=当前说话人高亮外发光。 */
export interface PortraitProps {
  art?: string;              // 立绘图 URL（sim 持资产 key·游戏经 resolveAsset 解析后填·同 Image.src）
  emotion?: string;          // 情绪变体键（M1 透出 data-emotion·M2 emotion→assetKey 表选图）
  name?: string;             // 角色名（底部小标·缺省无）
  side?: 'left' | 'right';   // 站位（缺省 left·双人对话名对齐用）
  shape?: ShapeToken;        // 异形立绘框（闭集·复用同套 clip-path·如 hexagon/shield/diamond）
  edge?: EdgeColor;          // 立绘框描边语义/阵营色（金框/阵营框·覆盖默认线）
  glow?: boolean;            // 当前说话人高亮（外发光 fx:glow·突出正在说话的一方）
  bind?: string;             // 对话实体 id（resolveDialogue 投影 name=speaker·emotion=当前节点情绪）
}

export type ComponentProps =
  | ButtonProps | LabelProps | DropdownProps | BadgeProps | InputProps | PanelProps
  | CheckboxProps | ToggleProps | RadioGroupProps | ImageProps | ScreenProps | SliderProps
  | TableProps | TabsProps | ProgressBarProps | TagProps | ModalProps | ToastProps | TooltipProps
  | CardProps | PlayingCardProps | StepperProps | SegmentedProps | AvatarProps | AccordionProps
  | RatingProps | ComboboxProps | DrawerProps | VirtualListProps | ContextMenuProps
  | CoinFlipProps | VersusProps | VideoProps | ParticlesProps | LevelPathProps
  | FloatProps | ConnectorProps
  | DialogProps | ChoiceListProps | PortraitProps
  | Record<string, never>;

/** LayoutNode = 弱模型填写的 UI 数据单元。type + id + props 必填；layout/children 按需。 */
export interface LayoutNode {
  type: ComponentType;
  id: string;
  props: ComponentProps;
  layout?: LayoutConstraints;
  children?: LayoutNode[];
  /**
   * 条件显隐（数据·替代"游戏用代码重建 UI 树"这种代码回潮）：一个 **flag id**，可选 `!` 前缀取反。
   * 在 resolveBindings 求值（经 UIDataSource.flag 读布尔）：为真 → 该节点连同子树留在树里；
   * 为假 → 从父节点 children 里移除（不进渲染·不留 DOM，区别于 display:none）。
   * 锁牌 / 选中态 / 买不起（先由 sim 算成 Flag）/ 阶段限定按钮等，靠它声明，不必让游戏 if/else 重建树。
   * 红线同 bind：只收 **flag id 字符串**（最弱 LLM 能填），绝不收自由布尔表达式。
   * 注：**树根**的 visibleWhen 不被求值（根恒渲染）——把条件内容放进某个子节点；若确需按根判可见用 isVisible()。
   */
  visibleWhen?: string;
  /**
   * 集合迭代（P2b · engine-architecture-review-2026-09-02 D8）：数据替代「TS builder 每帧整树重建」。
   * 本节点成为容器：children = 静态 children ++ 按 UIDataSource.list(source) 的每一项克隆一份 template。
   * 模板里任何字符串属性可写 `{{item.字段}}` / `{{index}}` / `{{count}}`（整串恰为一个占位符 → 按原类型代入，
   * 数值/布尔不变成字符串；含在文本里 → 拼接）；id 自动带 `#key` 后缀保唯一（key 缺省 index）。
   * `visibleWhen` / `bind` / `action` / `actionArg` 里也可用占位符 → 逐项条件显隐与逐项动作参数纯数据可表达。
   * 红线同 bind：source 只是一个 **列表 id 字符串**，列表内容由引擎/游戏注入（世界侧 createWorldDataSource 按纯数据
   * UIListSpec 从 ECS 投影），UI 不碰 ECS；占位符只做标量代入，不收表达式。
   */
  repeat?: RepeatSpec;
}

export interface RepeatSpec {
  /** 列表 id（UIDataSource.list 的键）。 */
  source: string;
  /** 每一项克隆的节点模板（其 id 会带 `#<key>` 后缀）。 */
  template: LayoutNode;
  /** 用哪个 item 字段做唯一键后缀（缺省下标）。 */
  key?: string;
  /** 列表为空时放一个占位节点（可选）。 */
  empty?: LayoutNode;
  /** 最多展开多少项（可选·防超长列表）。 */
  limit?: number;
}

export type Handler = (arg?: string) => void;
export type HandlerMap = Record<string, Handler>;

/**
 * UI 写世界接缝（铁律：写路径收紧成信号）——把 action 信号名 + 可选 arg **enqueue 进 sim 输入队列**，
 * 而不是在 UI 回调里写自由逻辑。传给 mountUI 后，**无本地 handler** 的 data-action 即走：
 *   enqueueAction(action,{arg}) → InputQueue{key:action,phase:'action',arg} → keybind 产 Signal{name,arg} → sim 能力按名消费。
 * 这条就是「UI 只发信号、具体逻辑在 sim 能力层处理」的**人/AI 共用动作总线**：AI 玩家=另一个推同样具名动作的 InputSource。
 * 形状与 net 的 QueuedInputSource.enqueueAction 同构，但此处不 import net（保 ui/components 解耦）。
 */
export interface ActionSink {
  enqueueAction(name: string, value?: { arg?: string }): void;
}

/**
 * UI 主题令牌（renderNode/mountUI 取色取字的唯一来源）。
 * 游戏可传自己的一份 → 同一份 LayoutNode 数据换皮（数据驱动·零改解释器）。缺省 = 引擎 SHELL 脸。
 * 红线不变：游戏只填**令牌值**（颜色/字体字符串，最弱 LLM 能填），不写 CSS/DOM。
 */
/** Web 字体面（数据化·render-only·REQ-UI-web字体加载）：声明「要哪款字体 + 字重 + woff2 URL」，引擎据此
 *  生成并注入 @font-face（`mountUI`/`ensureWebfonts` 去重·全局一次）。**弱 LLM 只填这几个字段（数据），绝不手写
 *  @font-face/`<link>`**（尺子过关）。`url` 应为**打包进产物的本地 woff2**（Vite `import x from './x.woff2'` 的结果）——
 *  离线可用、不依赖 Google Fonts CDN（Steam/卡带/Electron 都能跑）；`family` 须与字体栈里引用的名字一致才命中。 */
export interface WebFont {
  family: string;
  url: string;
  /** '400' | '700' | 可变字重 '400 900'；缺省 '400'。 */
  weight?: string;
  /** 'normal' | 'italic'；缺省 'normal'。 */
  style?: string;
}

/** 主题指针令牌（REQ-STYLESET M0.6·render-only·闭集数据）：自定义 CSS 光标 = 图 + 热点 + 按下态。
 *  `image`=**已编码 data-URI 图**（SVG/PNG·主题作者填·同 texture/panelTexture 约定·非游戏 LayoutNode 数据）；
 *  `x`/`y`=热点像素（光标"作用点"在图内的坐标·缺省 0,0=图左上角）；`press`=按下(:active)态图 + 热点（缺省无=按下不变）。
 *  弱模型/游戏层不填此令牌（属主题作者层·同 texture）；缺省整份 cursor 不设 = 系统默认箭头（老主题零变化）。 */
export interface UICursor {
  image: string;
  x?: number;
  y?: number;
  press?: { image: string; x?: number; y?: number };
}

export interface UITheme {
  bg0: string; bg1: string; bg2: string; bg3: string; pageBg: string;
  line: string;
  text: string; sub: string; dim: string;
  jade: string; jadeWash: string; jadeLine: string;
  gold: string;
  ok: string; okWash: string; warn: string; warnWash: string; danger: string;
  /** 阵营描边色（可选·Panel.edge='mine'/'foe' 解析·战棋/卡牌/对战类主题填）：我方暖框 / 敌方冷框。
   *  缺省回退既有暖(warn)/冷(jadeLine)令牌·非对战主题可不填。 */
  mine?: string; foe?: string;
  /** 深墨字色（可选·Label color:'ink'·金按钮/浅底上的深色文字·如 #3a2406 on gold）。缺省回退 bg0。REQ-UI-Label ink 令牌。 */
  ink?: string;
  fontUi: string; fontMono: string;
  /** 像素点阵字体槽（Label font:'pixel'·如 Silkscreen/DotGothic16）。缺省回退 fontUi。 */
  fontPixel?: string;
  /** 数码管展示字体槽（Label font:'display'·如 VT323 七段琥珀时钟）。缺省回退 fontMono。 */
  fontDisplay?: string;
  /** 衬线字体槽（Label font:'serif'·如 Noto Serif SC·标题/logo 衬线、正文仍 sans）。缺省回退 fontUi。 */
  fontSerif?: string;
  /** 要加载的 Web 字体（数据化·REQ-UI-web字体加载）：`mountUI`/`ensureWebfonts` 首挂时注入一次 @font-face（去重·全局）。
   *  没有它 → 上面 fontUi/fontSerif/… 字体栈里写的 'Noto Sans SC'/'Cinzel' 等 web 字体不会被加载、浏览器静默回退系统字体。 */
  webfonts?: WebFont[];
  /** 输入框底色（缺省深色半透 rgba(0,0,0,0.35)·适配暗皮）。亮皮须填浅色，否则深底深字看不清。 */
  inputBg?: string;
  /** 背景贴图层（procedural CSS 图案 / 贴图 url·叠在 pageBg 上·renderScreen 合成）。主题作者填（可含 CSS），区别于游戏 LayoutNode 数据。缺省无 = 纯 pageBg（老主题零变化）。 */
  texture?: string;
  /** 背景晕染叠层（vignette/wash·盖在 texture 之上的柔光/暗角）。同 texture：主题作者填。 */
  wash?: string;
  /** 面板级底纹（procedural CSS 图案 / 平铺贴图 url·叠在面板填色之上、节点 bgTexture 之下·renderPanel 合成）。
   *  house-style 纸纹/底纹主题填（同 texture 约定：主题作者写完整 background 层·可含 CSS），区别于游戏 LayoutNode 数据。
   *  缺省无 = 面板零变化（老主题字节不变）。REQ-STYLESET apollo-toon 纸纹面。 */
  panelTexture?: string;
  /** 主题指针（可选·render-only·REQ-STYLESET M0.6·沿 panelTexture 先例：主题作者填·缺省无=系统箭头零变化）。
   *  自定义 CSS 光标：base 光标落 mountUI 根（面板/文字继承之）；按钮等自带 cursor:pointer 的可交互件仍保留其指针。
   *  按下态（`press`·:active）由 mountUI 注入一条 scoped 规则实现。触屏无指针·不受影响。 */
  cursor?: UICursor;
  /** 主题级按钮皮槽（owner 07-15 批29「按键/背景/牌面都可换」）：kind → 贴图皮（skin=已解析图 URL·
   *  skinSlice=源边 px 走 9-slice 无损缩放，缺省整图 cover）。一个 kind 一张皮、全游戏按钮一体换——
   *  node 级 ButtonProps.skin 优先（含 skin:'' 显式关皮逃生）；缺省无 = 原 kind 底（老主题零变化）。 */
  buttonSkins?: Partial<Record<'hero' | 'primary' | 'ghost' | 'quiet', { skin: string; skinSlice?: number }>>;
  /** emoji 自动图渲配置（REQ-UI-emoji图渲·render-only）：设了则 Label/Button.label/spans/Tag/Badge 等显示文本里的
   *  emoji 字形自动内联成 `<img src=`${base}/<cp>.png``>`（1em 随字号）。不设=文本 emoji 保字形（零回归）。
   *  资产可达：base 指向 served 目录（vendor 进本地 `/games/<g>/art/emoji` 或共享 `/assets/emoji`）。逐 Label 可 `raw:true` 逃生。 */
  emoji?: EmojiConfig;
}
