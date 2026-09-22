// renderNode — LayoutNode 树 → HTML 字符串。纯函数，无副作用，可单测。
// 样式来自传入的 UITheme（缺省 = 引擎 SHELL 脸）。游戏传自己那份主题即「换皮」，不接受内联色值。

import { SHELL } from '../shell-theme.js';
import { ART_FONT_FAMILY } from './art-fonts.js';
import { emojifyHtml } from './emoji.js';
import type {
  LayoutNode, LayoutConstraints, UITheme, VisualEffect, EffectColor, EdgeColor,
  ButtonProps, LabelProps, DropdownProps, BadgeProps, InputProps, PanelProps,
  CheckboxProps, ToggleProps, RadioGroupProps, ImageProps, ScreenProps, SliderProps,
  TableProps, TableColumn, TabsProps, ProgressBarProps, TagProps, ModalProps, ToastProps, TooltipProps,
  CardProps, PlayingCardProps, StepperProps, SegmentedProps, AvatarProps, AccordionProps,
  RatingProps, ComboboxProps, DrawerProps, VirtualListProps, ContextMenuProps,
  CoinFlipProps, VersusProps, VideoProps, ParticlesProps, LevelPathProps, FloatProps, ConnectorProps, AnchorRef,
  DialogProps, ChoiceListProps, PortraitProps,
} from './types.js';

const esc = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 显示文本转义 + emoji 图渲（REQ-UI-emoji图渲）：先 esc（安全），再按主题 `emoji` 配置把 emoji 字形内联成 <img>。
// **只用于可见内容文本**（Button.label/Label.text/spans/Tag/Badge…）——绝不用于 HTML 属性（title/value/option）。
// 未配 t.emoji=退化成纯 esc（零回归）。emoji 字符不含 &<>"，故 esc→emojify 顺序安全。
const escT = (s: string, t: UITheme): string => emojifyHtml(esc(s), t.emoji);

// 数值强制：layout 数值字段虽类型标 number，但弱模型/外部数据运行时可能是字符串
// （如 "0;background:url(x)"）→ 直接插进 style 串即 CSS 注入。统一过 num() 只取有限数字。
const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };
// anim 预设白名单（mountUI 注入的关键帧名）：拒绝任意字符串插入 animation。
const ANIM_PRESETS = new Set(['fadeIn', 'slideUp', 'pop', 'shake', 'dealIn', 'flyIn', 'fadeOut', 'popOut']); // 一次性入场/退场
const LOOP_PRESETS = new Set(['float', 'glow', 'pulse', 'spin', 'floatUp', 'marquee', 'tick']);   // 持续循环（浮动/发光/脉冲/自旋/升冒/跑马灯/steps 节拍·环境动效·infinite）
// CSS 色净化（REQ-UIFX·Particles.color / ProgressBar.fillColor 等自由色串）：只留 hex/函数色/具名色合法字符，
// 剥掉能逃出 style 声明或属性的 ; : " ' < > 等（同 safeUrl 思路·净化后再插样式）。空/全非法 → ''。
const safeColor = (c: unknown): string => String(c ?? '').replace(/[^#a-zA-Z0-9(),.%\s-]/g, '');

// 数字格式化（idle/休闲大数与计时·纯函数·render + mountUI tween 共用·单一真相）。
export function formatNumber(n: number, format?: string, dec = 0): string {
  if (!Number.isFinite(n)) return '0';
  if (format === 'compact') {
    const abs = Math.abs(n);
    const units: Array<[number, string]> = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const [v, u] of units) {
      if (abs >= v) return `${(n / v).toFixed(dec > 0 ? dec : 1).replace(/\.0$/, '')}${u}`;
    }
    return n.toFixed(dec);
  }
  if (format === 'time') {
    const total = Math.max(0, Math.floor(n));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const p2 = (x: number) => String(x).padStart(2, '0');
    return h > 0 ? `${h}:${p2(m)}:${p2(s)}` : `${m}:${p2(s)}`;
  }
  if (format === 'percent') return `${(n * 100).toFixed(dec)}%`;
  if (format === 'int') return String(Math.round(n));
  return n.toFixed(dec);
}
// justify 主轴分布枚举 → CSS justify-content（闭集映射·拒绝任意串注入）。
const JUSTIFY_MAP: Record<string, string> = {
  start: 'flex-start', center: 'center', end: 'flex-end',
  between: 'space-between', around: 'space-around', evenly: 'space-evenly',
};

// 视觉特效语义色 → 主题令牌（闭集映射·防注入：绝不把 color 串直接插进 CSS）。
function fxColor(t: UITheme, c?: EffectColor): string {
  const m: Record<string, string> = { danger: t.danger, gold: t.gold, jade: t.jade, warn: t.warn, ok: t.ok, white: '#ffffff' };
  return (c && m[c]) || t.gold;
}

// 容器描边语义色 → 主题令牌（闭集·REQ-UI-容器描边形）。mine/foe 取主题阵营令牌·缺省回退暖(warn)/冷(jadeLine)。
function edgeColor(t: UITheme, e: EdgeColor): string {
  switch (e) {
    case 'jade':   return t.jadeLine;
    case 'gold':   return t.gold;
    case 'ok':     return t.ok;
    case 'warn':   return t.warn;
    case 'danger': return t.danger;
    case 'mine':   return t.mine ?? t.warn;
    case 'foe':    return t.foe ?? t.jadeLine;
  }
}
// motion/opacity 类特效 → 复用已注入的关键帧 [keyframe, 缺省 ms]。
const FX_MOTION: Record<string, [string, number]> = {
  pulse: ['apollo-pulse', 1600], float: ['apollo-float', 2600], pop: ['apollo-pop', 360],
};
// VisualEffect[] → CSS（可叠加·分组合成）：motion/opacity 走 animation 列表；glow 走 filter；
// sheen/flash 走 data-fx 叠层（::after/::before）。同组多个 transform 动画同时只末个生效（文档说明·取一个动作即可）。
// 返回 { css: 内联样式增量, dataFx: 叠层 token 串 }。纯函数（受控合成·闭集 kind 由调用前校验器把关）。
function fxToCss(fx: readonly VisualEffect[], t: UITheme): { css: string; dataFx: string } {
  const anim: string[] = [], filter: string[] = [], vars: string[] = [], dataFx: string[] = [];
  for (const e of fx) {
    const ms = num(e.ms, 0);
    if (e.kind === 'pulse' || e.kind === 'float' || e.kind === 'pop') {
      const [kf, dms] = FX_MOTION[e.kind]!;
      const iter = e.kind === 'pop' || e.once ? 'both' : 'infinite';
      anim.push(`${kf} ${ms || dms}ms ease-in-out ${iter}`);
    } else if (e.kind === 'shake') {
      vars.push(`--fx-amp:${num(e.intensity, 1) * 4}px`);
      anim.push(`apollo-fx-shake ${ms || 520}ms ease-in-out ${e.once ? 'both' : 'infinite'}`);
    } else if (e.kind === 'wobble') {
      // 摇摆：循环 rotate+scale 晃动（蓄势/摇拳/待机·REQ-108-UI-02）。intensity=摆幅倍率（度）。
      vars.push(`--fx-wob:${num(e.intensity, 1) * 8}deg`);
      anim.push(`apollo-fx-wobble ${ms || 1400}ms ease-in-out ${e.once ? 'both' : 'infinite'}`);
    } else if (e.kind === 'glow') {
      const col = fxColor(t, e.color); const r = num(e.intensity, 1);
      filter.push(`drop-shadow(0 0 ${4 * r}px ${col}) drop-shadow(0 0 ${10 * r}px ${col})`);
    } else if (e.kind === 'sheen') {
      dataFx.push('sheen');
    } else if (e.kind === 'sheen-hover') {
      dataFx.push('sheen-hover'); // 悬停触发流光（CSS 注入 ::after·:hover 扫一道·非常驻）
    } else if (e.kind === 'holo') {
      dataFx.push('holo'); // 全息箔·彩虹叠层（CSS 注入 ::after·apollo-holo）
    } else if (e.kind === 'ripple') {
      dataFx.push('ripple'); // 点按涟漪（CSS 注入 ::after·:active 从中心扩散）
    } else if (e.kind === 'flash') {
      vars.push(`--fx-flash:${fxColor(t, e.color ?? 'danger')}`);
      if (ms) vars.push(`--fx-flash-ms:${ms}ms`);
      dataFx.push('flash');
    } else if (e.kind === 'fade') {
      // 半透明淡出消失（消耗/消退）：opacity→0，一次性停在末态（forwards）。
      anim.push(`apollo-fx-fade ${ms || 600}ms ease-out forwards`);
    }
  }
  const css = [
    ...vars,
    anim.length ? `animation:${anim.join(',')}` : '',
    filter.length ? `filter:${filter.join(' ')}` : '',
    dataFx.length ? 'position:relative' : '',
  ].filter(Boolean).join(';');
  return { css, dataFx: dataFx.join(' ') };
}

function layoutStyle(c?: LayoutConstraints, t?: UITheme): string {
  if (!c) return '';
  const p: string[] = [];
  if (c.x !== undefined) { p.push(`left:${num(c.x)}px`); p.push(`top:${num(c.y)}px`); p.push('position:absolute'); }
  else if (c.y !== undefined) { p.push(`top:${num(c.y)}px`); p.push('position:absolute'); }
  if (c.width   !== undefined) p.push(`width:${num(c.width)}px`);
  if (c.height  !== undefined) p.push(`height:${num(c.height)}px`);
  if (c.flex    !== undefined) p.push(`flex:${num(c.flex)}`);
  if (c.padding !== undefined) p.push(`padding:${num(c.padding)}px`);
  if (c.margin  !== undefined) p.push(`margin:${num(c.margin)}px`);
  // maxWidth（响应式封顶 + 块居中·整页居中 chrome）：max-width 上限 + 自动外边距居中（flex item 亦生效）；
  // 无显式 width 时补 width:100% → 窄屏铺满、宽屏封顶居中。放 margin 之后，让 auto 边距覆盖 margin 简写的左右值。
  if (c.maxWidth !== undefined) {
    p.push(`max-width:${num(c.maxWidth)}px`, 'margin-left:auto', 'margin-right:auto');
    if (c.width === undefined) p.push('width:100%');
  }
  // Transform（2D 旋转/缩放 + 3D 倾斜/景深）：声明式数据 → CSS transform。扇形手牌/选中放大/透视 UI/真 3D 翻面/景深叠层。
  // 3D：perspective() 必须最前；有 rotateX/rotateY/z 任一 → 自动补 perspective（缺省 800px）+ preserve-3d（让子层景深合成）。
  const has3d = c.rotateX !== undefined || c.rotateY !== undefined || c.z !== undefined || c.perspective !== undefined;
  const tf: string[] = [];
  if (has3d) tf.push(`perspective(${num(c.perspective, 800)}px)`);
  if (c.rotateX !== undefined) tf.push(`rotateX(${num(c.rotateX)}deg)`);
  if (c.rotateY !== undefined) tf.push(`rotateY(${num(c.rotateY)}deg)`);
  if (c.rotate  !== undefined) tf.push(`rotate(${num(c.rotate)}deg)`);
  if (c.scale   !== undefined) tf.push(`scale(${num(c.scale)})`);
  if (c.z       !== undefined) tf.push(`translateZ(${num(c.z)}px)`);
  if (tf.length) p.push(`transform:${tf.join(' ')}`);
  if (has3d) p.push('transform-style:preserve-3d');
  // 倒角切角（clip-path 八边形·扑克/art-deco 美学）。切角 px 过 num 防注入。
  if (c.chamfer !== undefined) {
    const k = num(c.chamfer);
    p.push(`clip-path:polygon(${k}px 0,100% 0,100% calc(100% - ${k}px),calc(100% - ${k}px) 100%,0 100%,0 ${k}px)`);
  }
  // 圆角半径（覆盖控件默认圆角·末置生效）。REQ-UI-容器描边形·小件异形/大圆落点圈用。
  if (c.radius !== undefined) p.push(`border-radius:${num(c.radius)}px`);
  // 不透明度（0..1·装饰淡入/水印/剪影）。非数字回退 1（不透明·安全）。REQ-UI-骰途逐像素③。
  if (c.opacity !== undefined) p.push(`opacity:${num(c.opacity, 1)}`);
  // 入场方向/幅度（REQ-UI-入场方向·配 anim:'flyIn'）：animFrom+animDist → CSS 变量喂进 apollo-flyIn 关键帧。
  // 只在设了任一时才推变量 → 既有 flyIn（无这俩）落关键帧默认 -24px（字节不变·零回归）。
  if (c.anim === 'flyIn' && (c.animFrom !== undefined || c.animDist !== undefined)) {
    const dist = num(c.animDist, 24);
    const dx = c.animFrom === 'right' ? dist : c.animFrom === 'top' || c.animFrom === 'bottom' ? 0 : -dist;
    const dy = c.animFrom === 'bottom' ? dist : c.animFrom === 'top' ? -dist : 0;
    p.push(`--anim-dx:${dx}px`, `--anim-dy:${dy}px`);
  }
  // 动画：一次性入场（both ease-out）或持续循环（infinite·环境动效）。仅白名单预设；时长/延迟强制数字。
  if (c.anim && ANIM_PRESETS.has(c.anim)) {
    p.push(`animation:apollo-${c.anim} ${num(c.animMs, 360)}ms ${c.animDelay ? `${num(c.animDelay)}ms ` : ''}both ease-out`);
  } else if (c.anim && LOOP_PRESETS.has(c.anim)) {
    // spin/marquee=匀速 linear（自旋/滚动不该忽快忽慢）；tick=steps(1,end) 硬跳节拍（印章每秒跳一下·REQ-UIFX ⑤）；
    // 其余环境动效 ease-in-out 呼吸。
    const timing = (c.anim === 'spin' || c.anim === 'marquee') ? 'linear' : c.anim === 'tick' ? 'steps(1,end)' : 'ease-in-out';
    const dur = c.anim === 'spin' ? 3600 : c.anim === 'marquee' ? 9000 : c.anim === 'tick' ? 1000 : 2400;
    p.push(`animation:apollo-${c.anim} ${num(c.animMs, dur)}ms ${c.animDelay ? `${num(c.animDelay)}ms ` : ''}${timing} infinite`);
  }
  if (c.draggable) p.push('cursor:grab');
  // 视觉特效合集（UI 特效库）：闭集 fx → 动画/滤镜/叠层 CSS。需主题取色 → 仅 t 在场时应用。
  if (c.fx && c.fx.length && t) {
    const f = fxToCss(c.fx, t);
    if (f.css) {
      // REQ-UI-BUG-fx与绝对定位不兼容：x/y 已给 position:absolute（本身即定位祖先·fx 的 ::after 照样定位）→
      // 别让 fx 的 position:relative 覆盖它（否则绝对定位失效、元素跑位）。仅无 x/y 时才需 fx 补 relative。
      const hasAbs = c.x !== undefined || c.y !== undefined;
      const css = hasAbs ? f.css.split(';').filter((s) => s !== 'position:relative').join(';') : f.css;
      if (css) p.push(css);
    }
  }
  return p.join(';');
}

// 背景 UV 滚动声明 → data-bgscroll（mountUI 接逐元素滚动关键帧）。x,y=平移 px，ms=周期。纯数字（防注入过 num）。
function bgScrollAttr(s?: { x?: number; y?: number; ms?: number }): string {
  return s ? ` data-bgscroll="${num(s.x)},${num(s.y)},${num(s.ms, 6000)}"` : '';
}

// 图片贴图 → 一个 background 平铺层。url 先剥离能逃出 url('...') 的字符（引号/括号/空白/反斜杠）防 CSS 注入，
// 再 esc（防属性逃逸）；size 过 num。空 url → ''。配进 background 多层合成。
function texLayer(url?: string, size?: number): string {
  if (!url) return '';
  const safe = esc(String(url).replace(/['"()\\\s]/g, ''));
  return `url('${safe}') 0 0${size !== undefined ? ` / ${num(size)}px` : ''} repeat`;
}

// 异形轮廓（闭集 ShapeToken → 引擎预置 clip-path/border-radius·弱 LLM 只选名·不收自由坐标）。
// pill=全圆胶囊（border-radius·命中区仍是矩形包围盒）；其余=固定多边形 clip-path——现代浏览器 clip-path **会裁命中测试**：
// 透明角点击穿透到背后、不误触（P3D 复核 Gemini review 更正·2026-07-15）。附加在 base 之后→后写覆盖既有圆角/切角。
const SHAPE_CSS: Record<string, string> = {
  pill:     'border-radius:999px',
  hexagon:  'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)',
  diamond:  'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)',
  shield:   'clip-path:polygon(0 0,100% 0,100% 62%,50% 100%,0 62%)',
  ribbon:   'clip-path:polygon(0 0,100% 0,92% 50%,100% 100%,0 100%,8% 50%)',
  chevron:  'clip-path:polygon(0 0,88% 0,100% 50%,88% 100%,0 100%)',
  tag:      'clip-path:polygon(12% 0,100% 0,100% 100%,12% 100%,0 50%)',
  cut:      'clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)',
};
const shapeCss = (shape?: string): string => (shape && SHAPE_CSS[shape]) ? `;${SHAPE_CSS[shape]}` : '';

const safeUrl = (url: string): string => esc(String(url).replace(/['"()\\\s]/g, ''));
// 注：自由色净化 `safeColor` 定义在文件上部（REQ-UIFX·Particles/ProgressBar 自由色共用）——Label.color {custom}
// 逃生（REQ-UI-Label色三态）复用它（其正则已剥 ;:"'<> 等能逃出 style 值的字符·防注入）。
// 贴图皮：已解析图 URL → 覆盖按钮底 + 白字投影保可读（同 texLayer 剥离 url() 逃逸字符防注入）。空 → ''。
// slice 未给=cover（整图缩放·可能拉伸/裁切）；slice 给了（源边 px）=**9-slice 无损缩放**（border-image：四角固定·
// 四边 1D 拉伸·中心 2D 拉伸——商业 UI 皮标配，治好非原生尺寸下贴图变形·owner 2026-07-07）。放样式末尾覆盖 kind 底。
const skinCss = (url?: string, slice?: number): string => {
  if (!url) return '';
  const u = safeUrl(url);
  const legible = 'color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.85)';
  if (slice !== undefined) {
    const s = num(slice);
    return `;background:none;border-style:solid;border-width:${s}px;border-image:url('${u}') ${s} fill / ${s}px / 0 stretch;${legible}`;
  }
  return `;background:url('${u}') center/cover no-repeat;border:0;${legible}`;
};

// Panel cover-skin（复合按钮/框皮·REQ-PANELSKIN·game-c 主行动键）：整面 art 覆盖（cover 或 9-slice），
// **children 照常叠在皮上**（动态文字如「Call 50」= 实时 LayoutNode 渲在皮之上·数额不必烤进图）。
// 区别 Button.skin：**不强制白字**（Panel children 各自定色）；art 即框（省默认边框/底）。区别 bgTexture：cover/9-slice 非平铺。
const panelSkinCss = (url: string, slice?: number): string => {
  const u = safeUrl(url);
  if (slice !== undefined) {
    const s = num(slice);
    return `background:none;border-style:solid;border-width:${s}px;border-image:url('${u}') ${s} fill / ${s}px / 0 stretch;`;
  }
  return `background:url('${u}') center/cover no-repeat;border:0;`;
};

// 面填充三态解析（owner 2026-07-04 色库化）：语义令牌(换皮自适应) / 预设配色(固定观感) / {custom}(显式逃生) / 遗留裸串。
// 令牌→UITheme（随主题变）；preset→引擎内建渐变（色库·固定）；对象→custom 自由串；其余字符串→原样透传(back-compat)。
const SURFACE_TOKEN: Record<string, (t: UITheme) => string> = {
  panel: (t) => t.bg1, raised: (t) => t.bg2, sunken: (t) => t.bg0,
  jade: (t) => t.jadeWash, gold: (t) => t.gold, ok: (t) => t.okWash,
  warn: (t) => t.warnWash, danger: (t) => t.danger, ink: (t) => t.ink ?? t.bg0,
  transparent: () => 'transparent', // 透明底/无填充（带透明色贴图 UI·see-through·仍保边框）
};
const PRESET_FILL: Record<string, string> = {
  'jade-sheen': 'linear-gradient(180deg,#1f4a3a,#123528)',
  'gold-sheen': 'linear-gradient(180deg,#caa53f,#8a6a20)',
  'ink-deep':   'linear-gradient(160deg,#0f1626,#0a0f1a)',
  'steel':      'linear-gradient(180deg,#2a3340,#1a2029)',
  'blood':      'linear-gradient(180deg,#4a1414,#2a0c0c)',
  'frost':      'linear-gradient(180deg,#1f3a4a,#122a35)',
  'ember':      'linear-gradient(180deg,#4a2c14,#2a180c)',
  'void':       'linear-gradient(160deg,#2a1a3a,#170f28)',
};
// 填充串净化（P2b · 评审 D8：`{custom}` 与遗留裸串此前原样拼进 style="…"，`x"onmouseover=…` 可越出属性）。
// 允许的语法：CSS 色 / 渐变函数 / `url('…')`（url 内容按 safeUrl 剥引号括号空白反斜杠·再统一加单引号）/ 位置尺寸关键字与 `/`。
// url 之外剥掉一切能逃出声明或属性的字符（; " ' < > \\ 及冒号）。合法的 game-g/game211 `url('…') center/cover no-repeat`
// 与各家 linear-gradient(…rgba()) 逐字保留；只有注入尝试被削。
function safeFill(raw: string): string {
  return raw
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (_m, _q, u: string) => `\u0000${u.replace(/['"()\\\s]/g, '')}\u0000`)
    .split('\u0000')
    .map((seg, i) => (i % 2 === 1 ? `url('${seg}')` : seg.replace(/[^#a-zA-Z0-9(),.%\s\-/]/g, '')))
    .join('');
}
function resolveFill(bg: unknown, t: UITheme): string | undefined {
  if (bg === undefined || bg === null) return undefined;
  if (typeof bg === 'object') { const c = (bg as { custom?: unknown }).custom; return typeof c === 'string' ? safeFill(c) : undefined; } // 显式逃生（创作者特别指定色·净化后用）
  const s = String(bg);
  const tok = SURFACE_TOKEN[s]; if (tok) return tok(t); // 语义令牌·换皮自适应
  if (PRESET_FILL[s]) return PRESET_FILL[s];            // 预设配色·固定观感
  return safeFill(s); // 遗留裸串（back-compat·audit 标记建议迁令牌/preset/custom·净化后用）
}
// 平移投影的"3D 侧"实色（REQ-108-UI-03·Panel.shadow.color）：闭集 SurfaceToken → 主题色（换皮自适应），
// 否则裸串原样（稿子精确墨色）。**只取实色**·不走 PRESET_FILL（那是渐变·硬边投影要单色）。缺省=深墨。
function shadowColor(c: string | undefined, t: UITheme): string {
  if (!c) return t.ink ?? t.bg0;              // 缺省 3D 侧 = 最深墨（自然投影侧）
  const tok = SURFACE_TOKEN[c]; return tok ? tok(t) : safeColor(c); // 裸串净化（P2b）
}

// ── 原有 7 个控件 ───────────────────────────────────────────────

function renderButton(id: string, p: ButtonProps, ls: string, t: UITheme): string {
  const kindStyle: Record<string, string> = {
    primary: `background:${t.jadeWash};color:${t.jade};border:1px solid ${t.jadeLine};font-weight:600`,
    ghost:   `background:rgba(255,255,255,0.03);color:${t.sub};border:1px solid ${t.line}`,
    // quiet=克制态，但它仍是**可点的按钮文字**：用 t.dim 实测 2.93 < 硬地板 3.0（暗主题下键面读不清·
    // 波及 25 处含 @ui/starters 起手包的「重来/设置」）。降权用 t.sub（比 text 弱、仍过地板）——
    // dim 留给真正的三级非必读文字。同 ProgressBar.showValue 的同类修（2026-09）。
    quiet:   `background:transparent;color:${t.sub};border:1px solid transparent`,
  };
  const kind = p.kind ?? 'ghost';
  // 皮解析（批29 owner 07-15「按键也可换」）：node 级 skin 优先（含 skin:'' 显式关皮逃生）；未给则落主题级
  // buttonSkins[kind]——一个 kind 一张皮、全游戏按钮一体换，游戏零逐点改。两边都无 = 原 kind 底（字节不变）。
  const sk = p.skin !== undefined ? { skin: p.skin, skinSlice: p.skinSlice } : t.buttonSkins?.[kind] ?? { skin: undefined, skinSlice: undefined };
  // 贴图皮按钮=**art 定色语义原语**（skinCss 强制白字 + 投影·可读性由皮 art 保证）→ 免 ui-audit 祖先链对比检查
  // （border-image 非可读 backgroundColor·祖先走到亮父面误判低对比=REQ-STYLESET 记录的盲区·同 PlayingCard 本色 A-007b）。
  const skinSkip = sk.skin ? ' data-audit-skip-contrast' : '';
  // 键首内联图标（批32 图标统一升级）：1em 随字号·居 label 前。无 icon=纯文字零变。
  const iconImg = p.icon ? `<img src="${esc(p.icon)}" alt="" style="height:1.05em;width:1.05em;object-fit:contain;vertical-align:-0.18em;margin-right:6px">` : '';
  const action = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}"${p.actionArg ? ` data-arg="${esc(p.actionArg)}"` : ''}` : '';
  // hero：金色倒角 sheen 大 CTA（下沉自 game-g 出征键）。倒角 clip-path + 流光 span(apollo-sheen 关键帧) + 可选副标。
  if (kind === 'hero') {
    const hbase = `position:relative;overflow:hidden;padding:14px 30px;border:0;border-radius:4px;cursor:${p.disabled ? 'not-allowed' : 'pointer'};font-family:${t.fontUi};outline:none;background:linear-gradient(180deg,${t.gold},${t.warn});color:${t.bg0};font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.45);clip-path:polygon(13px 0,100% 0,100% calc(100% - 13px),calc(100% - 13px) 100%,0 100%,0 13px);opacity:${p.disabled ? 0.4 : 1}`;
    const sheen = `<span style="position:absolute;top:0;bottom:0;left:-60%;width:45%;background:linear-gradient(105deg,transparent,rgba(255,255,255,.55),transparent);transform:skewX(-18deg);animation:apollo-sheen 2.6s ease-in-out infinite;pointer-events:none"></span>`;
    const big = `<span style="display:block;font-size:17px;line-height:1.15">${iconImg}${escT(p.label, t)}</span>`;
    const sub = p.sub ? `<span style="display:block;font-size:11px;font-weight:600;opacity:.8;margin-top:2px">${escT(p.sub, t)}</span>` : '';
    return `<button id="${esc(id)}" data-apollo-btn${sk.skin ? ' data-apollo-skin' : ''}${skinSkip}${action}${p.disabled ? ' disabled' : ''} style="${hbase};${ls}${shapeCss(p.shape)}${skinCss(sk.skin, sk.skinSlice)}">${sheen}${big}${sub}</button>`;
  }
  const base = `padding:6px 14px;border-radius:7px;font-size:12px;cursor:${p.disabled ? 'not-allowed' : 'pointer'};font-family:${t.fontUi};outline:none;transition:all .15s;opacity:${p.disabled ? 0.4 : 1}`;
  return `<button id="${esc(id)}" data-apollo-btn${sk.skin ? ' data-apollo-skin' : ''}${skinSkip}${action}${p.disabled ? ' disabled' : ''} style="${base};${kindStyle[kind]};${ls}${shapeCss(p.shape)}${skinCss(sk.skin, sk.skinSlice)}">${iconImg}${escT(p.label, t)}</button>`;
}

function renderLabel(id: string, p: LabelProps, ls: string, t: UITheme): string {
  const sizeMap: Record<string, number> = { xs: 10, sm: 11, md: 13, lg: 16, xl: 22, xxl: 28, xxxl: 34 };
  const colorMap: Record<string, string> = {
    text: t.text, sub: t.sub, dim: t.dim,
    jade: t.jade, gold: t.gold,
    ok: t.ok, warn: t.warn, danger: t.danger,
    mine: t.mine ?? t.warn, foe: t.foe ?? t.jade, // 阵营字色（我方暖/敌方冷·同 edge 令牌·缺省回退）
    ink: t.ink ?? t.bg0, // 深墨字（金按钮/浅底上的深色文字·REQ-UI-Label ink 令牌·缺省回退最深底 bg0）
  };
  // size 接受具名档 或 裸 px 数字（复刻像素稿精确字号·owner 2026-06-28「字阶该全档」）：数字直用、令牌查表。
  const sz = typeof p.size === 'number' ? p.size : (sizeMap[p.size ?? 'md'] ?? 13);
  // 色三态（REQ-UI-Label色三态）：令牌查表·{custom} 显式逃生（净化防注入）。同 Panel.bg 口径。
  const resolveColor = (c: LabelProps['color'], fb: string): string =>
    (c && typeof c === 'object') ? safeColor(c.custom) : (colorMap[c ?? 'text'] ?? fb);
  const cl = resolveColor(p.color, t.text);
  // 具名字体槽（缺省按 mono 布尔回退·保旧调用方不变）：pixel/display 槽缺省回退 fontUi/fontMono。
  const fontSlot: Record<string, string> = {
    ui: t.fontUi, mono: t.fontMono,
    pixel: t.fontPixel ?? t.fontUi, display: t.fontDisplay ?? t.fontMono, serif: t.fontSerif ?? t.fontUi,
  };
  // 艺术字槽（内嵌 @font-face·slug→family）：CJK 兜底用**单引号**族名——不用 t.fontUi（含双引号会撞 style 属性引号截断 bug·
  // 已报 REQ-UI-BUG-style属性引号截断）。单引号在双引号 style 里安全，art 字体覆拉丁、中文回退 CJK。
  const artFam = p.font ? ART_FONT_FAMILY[p.font] : undefined;
  const fam = artFam ? `${artFam}, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`
    : (p.font ? fontSlot[p.font] : (p.mono ? t.fontMono : t.fontUi));
  const style = [
    `font-size:${sz}px`, `color:${cl}`,
    p.bold ? 'font-weight:700' : '',
    `font-family:${fam}`,
    // 仅当文本含换行符时保留换行（\n→实换行·多段说明/手册用）；无换行的单行 label 不加·HTML 字节不变（不动既有 golden）。
    (typeof p.text === 'string' && p.text.includes('\n')) ? 'white-space:pre-line' : '',
    p.glow ? `text-shadow:0 0 8px ${cl},0 0 2px ${cl}` : '',
    // 描边字（comic outline·卡通粗轮廓）：深色描边在填色之下（paint-order:stroke fill 保填色/可读）。可与 glow 叠。
    p.stroke ? `-webkit-text-stroke:2px ${t.bg0};paint-order:stroke fill` : '',
    p.tracking !== undefined ? `letter-spacing:${num(p.tracking)}px` : '',
    ls,
  ].filter(Boolean).join(';');
  // 富文本多段着色(render-only·有 spans 忽略 text)：逐段自带 color(令牌)/bold，外层保字号/字体。
  if (p.spans) {
    // 段首内联图标（批32 图标统一升级）：img=已解析 URL·1em 随字号。无 img 段=原输出字节不变。
    const inner = p.spans.map((s) =>
      `<span style="color:${resolveColor(s.color, cl)}${s.bold ? ';font-weight:700' : ''}">${s.img ? `<img src="${esc(s.img)}" alt="" style="height:1em;width:1em;object-fit:contain;vertical-align:-0.15em${s.text ? ';margin-right:4px' : ''}">` : ''}${p.raw ? esc(s.text) : escT(s.text, t)}</span>`,
    ).join('');
    return `<span id="${esc(id)}" style="${style}">${inner}</span>`;
  }
  // 数字滚动补间(render-only)：初值=from(按 format/decimals 格式化)，mountUI 读 data-tween-* 用定时器动画到 to。
  // tween.scale（REQ-UIFX ⑤·伤害跳数字号 .82→1）：起始缩放随补间回到 1——需 inline-block 才吃 transform，初态即摆到起始档。
  if (p.tween) {
    const dec = num(p.tween.decimals, 0);
    const fmtAttr = p.format ? ` data-tween-fmt="${esc(p.format)}" data-tween-from="${num(p.tween.from)}"` : '';
    const s0 = p.tween.scale !== undefined ? num(p.tween.scale, 1) : undefined;
    const scaleAttr = s0 !== undefined ? ` data-tween-scale="${s0}"` : '';
    const scaleCss = s0 !== undefined ? `;display:inline-block;transform:scale(${s0});transform-origin:50% 60%` : '';
    const tweenAttr = ` data-tween-to="${num(p.tween.to)}" data-tween-ms="${num(p.tween.ms, 600)}" data-tween-dec="${dec}"${fmtAttr}${scaleAttr}`;
    return `<span id="${esc(id)}"${tweenAttr} style="${style}${scaleCss}">${esc(formatNumber(num(p.tween.from), p.format, dec))}</span>`;
  }
  const tw = p.typewriter ? ` data-typewriter="${esc(String(p.typewriter))}"` : ''; // 转义防属性逃逸（威胁模型：弱模型可能给字符串）
  // 纯数字 text + format → 渲染时格式化（idle 大数/计时/百分比·静态显示）。
  const body = (p.format && p.text !== undefined && p.text !== '' && Number.isFinite(Number(p.text)))
    ? formatNumber(Number(p.text), p.format) : (p.text ?? '');
  // 纯数字 format 值不含 emoji → esc 即可；普通文本走 escT（除非 raw 逃生）。
  return `<span id="${esc(id)}"${tw} style="${style}">${p.raw || p.format ? esc(body) : escT(body, t)}</span>`;
}

function renderDropdown(id: string, p: DropdownProps, ls: string, t: UITheme): string {
  const base = `background:${t.bg2};color:${t.sub};border:1px solid ${t.line};border-radius:6px;font-size:12px;padding:6px 10px;outline:none;font-family:${t.fontUi};cursor:pointer`;
  const action = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}"` : '';
  const ph = p.placeholder
    ? `<option value="" disabled${!p.value ? ' selected' : ''}>${esc(p.placeholder)}</option>`
    : '';
  const opts = p.options
    .map(o => `<option value="${esc(o.value)}"${p.value === o.value ? ' selected' : ''}>${esc(o.label)}</option>`)
    .join('');
  return `<select id="${esc(id)}"${action} style="${base};${ls}">${ph}${opts}</select>`;
}

function renderBadge(id: string, p: BadgeProps, ls: string, t: UITheme): string {
  // accent/gold/danger 三档为 REQ-UIFX 复查补齐（此前未映射档渲出字面 "undefined;"·gallery 早已在用）。wash 口径同 Toast。
  const toneStyle: Record<string, string> = {
    ok:     `background:${t.okWash};color:${t.ok}`,
    warn:   `background:${t.warnWash};color:${t.warn}`,
    dim:    `background:rgba(154,170,196,0.10);color:${t.dim}`,
    accent: `background:${t.jadeWash};color:${t.jade}`,
    gold:   `background:rgba(212,160,60,0.16);color:${t.gold}`,
    danger: `background:rgba(211,137,122,0.16);color:${t.danger}`,
  };
  // icon 槽（REQ-UI-Badge图标·同 Tag/Button.icon）：已解析 URL·随字号·居 text 前。缺省无=纯文字零变。
  const icon = p.icon ? `<img src="${esc(p.icon)}" alt="" style="height:1em;width:1em;object-fit:contain;vertical-align:-0.12em;margin-right:3px">` : '';
  const style = `${toneStyle[p.tone ?? 'dim'] ?? toneStyle['dim']};font-size:9px;padding:1px 7px;border-radius:8px;white-space:nowrap;font-family:${t.fontUi};${ls}`;
  return `<span id="${esc(id)}" style="${style}">${icon}${escT(p.text, t)}</span>`;
}

function renderInput(id: string, p: InputProps, ls: string, t: UITheme): string {
  const base = `background:${t.inputBg ?? 'rgba(0,0,0,0.35)'};color:${t.text};border:1px solid ${t.line};border-radius:6px;font-size:12px;padding:6px 10px;outline:none;font-family:${t.fontUi}`;
  const action = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}"` : '';
  return `<input id="${esc(id)}" type="${p.type ?? 'text'}" value="${esc(p.value ?? '')}" placeholder="${esc(p.placeholder ?? '')}"${action} style="${base};${ls}">`;
}

function renderDivider(id: string, ls: string, t: UITheme): string {
  return `<hr id="${esc(id)}" style="border:none;border-top:1px solid ${t.line};margin:8px 0;${ls}">`;
}

function renderPanel(id: string, p: PanelProps, c: LayoutConstraints | undefined, children: LayoutNode[], t: UITheme): string {
  const dir = c?.direction ?? 'column';
  const gap = c?.gap ?? 8;
  const align = c?.align ?? 'stretch';
  const justify = JUSTIFY_MAP[c?.justify ?? ''] ?? '';   // 主轴分布（flex 才有意义·grid 忽略）。
  const bare = p.bare === true;          // 无框纯布局容器：不画框/底/圆角、padding 缺省 0（别千层框）。
  const pad = c?.padding ?? (bare ? 0 : 16);
  const ls = layoutStyle(c, t);          // 传 t：让 layout.fx（视觉特效·需主题取色）在 Panel 上也生效。
  const overflow = p.scroll ? 'overflow-y:auto;' : '';
  // grid 排布模式（卡牌格/货架）：cols=N 固定列数（严格等分·消空隙）；否则 auto-fill 自适应（minCol 定最小列宽）。非 grid 走 flex 行/列（支持 justify）。
  const gridCols = c?.cols !== undefined ? `repeat(${num(c.cols)},1fr)` : `repeat(auto-fill,minmax(${c?.minCol ?? 96}px,1fr))`;
  const box = dir === 'grid'
    ? `display:grid;grid-template-columns:${gridCols};gap:${gap}px;align-items:${align}`
    : `display:flex;flex-direction:${dir};gap:${gap}px;align-items:${align}${justify ? `;justify-content:${justify}` : ''}`;
  // chrome：非 bare 才画底/边框/圆角（bg 缺省主题 bg1·与 Screen.bg 同口径·令牌如 'var(--felt)'）；bare=透明无框只做分组。
  // accent：高亮框（jade 描边 + 柔光投影）用于活动视口/强调面板；缺省细线边。bare 时不画框故忽略 accent。
  // edge（REQ-UI-容器描边形）：语义/阵营描边色（闭集令牌·覆盖默认线/accent 取色）；dashed：虚线边；radius：覆盖恒 10 圆角（叠层同步）。
  const border = p.edge ? edgeColor(t, p.edge) : (p.accent ? t.jadeLine : t.line);
  const bStyle = p.dashed ? 'dashed' : 'solid';
  const rad = num(c?.radius ?? 10);
  // box-shadow 叠层（accent 柔光 + REQ-108-UI-03 硬边平移投影可共存·逗号合成）：bare 无 chrome 故都忽略。
  const shadowLayers: string[] = [];
  if (!bare && p.accent) shadowLayers.push(`0 0 0 1px ${t.jadeWash}`, `0 10px 34px rgba(0,0,0,.4)`);
  if (!bare && p.shadow) shadowLayers.push(`0 ${num(p.shadow.y)}px 0 ${shadowColor(p.shadow.color, t)}`); // 硬边偏移（卡通浮空）
  const glow = shadowLayers.length ? `box-shadow:${shadowLayers.join(',')};` : '';
  // 图片贴图层（平铺·叠在面板底上）。bare 但有贴图 → 只铺贴图、仍无框。
  const tex = texLayer(p.bgTexture, p.bgTextureSize);
  // 主题级面板底纹（纸纹/底纹·house-style 主题填·叠在填色之上、节点 bgTexture 之下）。缺省无 = 老主题字节不变。
  const panelTex = (!bare && t.panelTexture) ? t.panelTexture : '';
  // cover-skin（复合按钮框皮·REQ-PANELSKIN）：非 bare 面板给了 skin → art 即整面框（cover/9-slice），压过 fill/边框；
  // children 叠其上（动态数额活文字）。**bare 面板不吃皮**（bare=纯布局无 chrome·同 panelTexture guard·Lead 裁）。
  const chrome = (!bare && p.skin)
    ? `${panelSkinCss(p.skin, p.skinSlice)}border-radius:${rad}px;${glow}`
    : bare
      ? (tex ? `background:${tex}, transparent;` : '')
      : `background:${tex ? `${tex}, ` : ''}${panelTex ? `${panelTex}, ` : ''}${resolveFill(p.bg, t) ?? (p.glass ? 'rgba(20,24,32,0.5)' : t.bg1)};border:1px ${bStyle} ${border};border-radius:${rad}px;${glow}${p.glass ? 'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' : ''}`;
  // 异形容器轮廓（REQ-UI-异型容器①·复用 Button 同一套 SHAPE_CSS 闭集·命中区=包围盒·裁在最外层·须给足宽高）。
  const shape = p.shape && SHAPE_CSS[p.shape] ? `${SHAPE_CSS[p.shape]};` : '';
  const style = `${box};padding:${pad}px;${chrome}${shape}position:relative;${overflow}${ls}`;
  // 标题图标（REQ-UI-标题图标槽）：titleIcon 在场 → 标题前 1.05em 内联图；无=纯文字标题字节不变。
  const titleIcon = p.titleIcon ? `<img src="${esc(p.titleIcon)}" alt="" style="height:1.05em;width:1.05em;object-fit:contain;vertical-align:-0.18em;margin-right:5px">` : '';
  const title = p.title
    ? `<div style="font-size:10px;letter-spacing:2.4px;text-transform:uppercase;color:${t.dim};font-family:${t.fontUi};margin-bottom:4px${dir === 'grid' ? ';grid-column:1/-1' : ''}">${titleIcon}${esc(p.title)}</div>`
    : '';
  const vignette = (p.vignette && !bare)
    ? `<div style="position:absolute;inset:0;border-radius:${rad}px;pointer-events:none;background:radial-gradient(120% 100% at 50% 30%,transparent 55%,rgba(0,0,0,.45) 100%)"></div>`
    : '';
  // 程序化纹理叠层（REQ-UI-G流光底纹③）：stripe 45°斜条纹 / checker 棋盘格，叠在内容下（felt 牌桌质感）。
  const pattern = p.pattern
    ? `<div style="position:absolute;inset:0;border-radius:${bare ? '0' : `${rad}px`};pointer-events:none;background:${p.pattern === 'checker' ? 'repeating-conic-gradient(rgba(255,255,255,.04) 0% 25%,transparent 0% 50%) 0 0 / 16px 16px' : 'repeating-linear-gradient(45deg,rgba(255,255,255,.045) 0 2px,transparent 2px 12px)'}"></div>`
    : '';
  const inner = children.map((ch) => renderNode(ch, t)).join('');
  // 容器可点（REQ-UI-容器可点）：整个容器发信号（同 Button·只信号名）+ 手型。
  const action = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}"${p.actionArg ? ` data-arg="${esc(p.actionArg)}"` : ''}` : '';
  const cursor = p.action ? 'cursor:pointer;' : '';
  return `<div id="${esc(id)}"${action}${bgScrollAttr(p.bgScroll)} style="${style}${cursor}">${vignette}${pattern}${title}${inner}</div>`;
}

// ── 新增 6 个控件 ───────────────────────────────────────────────

// hidden input 辅助：opacity:0 + 零尺寸，<label for> 触发它；change 事件冒泡给 dispatch。
const hiddenInput = (id: string, type: string, action: string, extra = '', uiId?: string): string =>
  `<input type="${type}" id="${esc(id)}"${action ? ` data-ui-id="${esc(uiId ?? id)}" data-action="${esc(action)}"` : ''} ${extra} style="opacity:0;width:0;height:0;position:absolute">`;

function renderCheckbox(id: string, p: CheckboxProps, ls: string, t: UITheme): string {
  const checked = p.checked ?? false;
  const boxBg     = checked ? t.jadeWash : 'rgba(0,0,0,0.25)';
  const boxBorder = checked ? t.jadeLine  : t.line;
  const mark      = checked ? `<span style="color:${t.jade};font-size:10px;line-height:1;font-weight:700">✓</span>` : '';
  return `<span id="${esc(id)}" style="display:inline-flex;align-items:center;${ls}">
  ${hiddenInput(`${id}-i`, 'checkbox', p.action ?? '', checked ? 'checked' : '', id)}
  <label for="${esc(id)}-i" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
    <span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:1px solid ${boxBorder};border-radius:3px;background:${boxBg};flex-shrink:0">${mark}</span>
    <span style="font-size:12px;color:${t.sub};font-family:${t.fontUi}">${esc(p.label)}</span>
  </label>
</span>`;
}

function renderToggle(id: string, p: ToggleProps, ls: string, t: UITheme): string {
  const on = p.checked ?? false;
  const trackBg = on ? t.jade        : t.bg3;
  const border   = on ? t.jadeLine   : t.line;
  const knob     = on ? t.bg0        : t.dim;
  const knobLeft = on ? '18px'           : '2px';
  return `<span id="${esc(id)}" style="display:inline-flex;align-items:center;${ls}">
  ${hiddenInput(`${id}-i`, 'checkbox', p.action ?? '', on ? 'checked' : '', id)}
  <label for="${esc(id)}-i" style="display:inline-flex;align-items:center;gap:10px;cursor:pointer">
    <span style="display:inline-block;width:36px;height:20px;border-radius:10px;background:${trackBg};border:1px solid ${border};position:relative;flex-shrink:0">
      <span style="width:14px;height:14px;border-radius:50%;background:${knob};position:absolute;top:2px;left:${knobLeft}"></span>
    </span>
    <span style="font-size:12px;color:${t.sub};font-family:${t.fontUi}">${esc(p.label)}</span>
  </label>
</span>`;
}

function renderRadioGroup(id: string, p: RadioGroupProps, ls: string, t: UITheme): string {
  const items = p.options.map((opt, i) => {
    const rid = `${id}-r${i}`;
    const sel = p.value === opt.value;
    const dot    = sel ? `<span style="width:7px;height:7px;border-radius:50%;background:${t.jade}"></span>` : '';
    const border = sel ? t.jade : t.line;
    return `<span style="display:inline-flex;align-items:center">
    ${hiddenInput(rid, 'radio', p.action ?? '', `name="${esc(p.name)}" value="${esc(opt.value)}"${sel ? ' checked' : ''}`, id)}
    <label for="${esc(rid)}" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
      <span style="width:14px;height:14px;border-radius:50%;border:1.5px solid ${border};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${dot}</span>
      <span style="font-size:12px;color:${t.sub};font-family:${t.fontUi}">${esc(opt.label)}</span>
    </label>
  </span>`;
  }).join('');
  return `<div id="${esc(id)}" style="display:flex;flex-direction:column;gap:8px;${ls}">${items}</div>`;
}

function renderImage(id: string, p: ImageProps, ls: string): string {
  const fit    = p.fit ?? 'contain';
  const radius = p.radius ?? 0;
  return `<img id="${esc(id)}" src="${esc(p.src)}" alt="${esc(p.alt ?? '')}" style="object-fit:${fit};border-radius:${radius}px;display:block;max-width:100%;${ls}">`;
}

function renderScreen(id: string, p: ScreenProps, children: LayoutNode[], t: UITheme): string {
  const baseBg = resolveFill(p.bg, t) ?? t.pageBg;
  // 分层底（上→下）：wash(晕染) , 图片贴图(bgTexture·平铺) , 程序化纹理(theme.texture) , 底色。任意层缺省即跳过。
  // 三路贴图并存：程序化(theme.texture) / cover 整图(下方 bgImg) / 平铺图片(bgTexture)。
  const bg     = [t.wash, texLayer(p.bgTexture, p.bgTextureSize), t.texture, baseBg].filter(Boolean).join(', ');
  const center = p.center ? 'align-items:center;justify-content:center;' : 'align-items:stretch;';
  const bgImg  = p.image ? `background-image:url('${safeUrl(p.image)}');background-size:cover;background-position:center;` : ''; // safeUrl：esc 不转单引号·`')` 可越出 url()（P2b）
  const blur   = p.blur ? `backdrop-filter:blur(${num(p.blur)}px);` : '';
  // 高度语义（REQ-SCREENFILL）：缺省 100vh（吃视口·直挂页面对）；fill=100%（吃父定尺盒·mountHost 信箱盒填满去底部空白）。
  const minH   = p.fill ? '100%' : '100vh';
  const style  = `width:100%;min-height:${minH};display:flex;flex-direction:column;${center}background:${bg};${bgImg}${blur}font-family:${t.fontUi};position:relative;`;
  return `<div id="${esc(id)}"${bgScrollAttr(p.bgScroll)} style="${style}">${children.map((ch) => renderNode(ch, t)).join('')}</div>`;
}

function renderSlider(id: string, p: SliderProps, ls: string, t: UITheme): string {
  const min   = num(p.min, 0); // num() 而非 ??：?? 只挡 null/undefined，字符串 props 会内插进属性造成注入
  const max   = num(p.max, 100);
  const step  = num(p.step, 1);
  const value = num(p.value, Math.round((min + max) / 2));
  const action = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}"` : '';
  const header = p.label
    ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:11px;color:${t.sub};font-family:${t.fontUi}">${esc(p.label)}</span>
        <span style="font-size:11px;color:${t.dim};font-family:${t.fontMono}">${value}</span>
      </div>`
    : '';
  return `<div id="${esc(id)}" style="display:flex;flex-direction:column;${ls}">
  ${header}<input type="range" min="${min}" max="${max}" step="${step}" value="${value}"${action} style="width:100%;accent-color:${t.jade};cursor:pointer">
</div>`;
}

// ── Table / Tabs（以 game-g 大厅榜单/数值表 + 抗闪屏切页为出发点·下沉成引擎组件）────────

const colFlex = (c: TableColumn): string => (c.width !== undefined ? `flex:0 0 ${c.width}px` : 'flex:1');

// 数据表：列定义 + 行数据 → 表头(淡色阔字距) + 行(发丝线分隔·可点·tone 着色)。游戏只填 columns/rows。
function renderTable(id: string, p: TableProps, ls: string, t: UITheme): string {
  const title = p.title
    ? `<div style="font-size:10px;letter-spacing:2.4px;text-transform:uppercase;color:${t.dim};font-family:${t.fontUi};margin-bottom:8px">${esc(p.title)}</div>`
    : '';
  const head = `<div style="display:flex;gap:10px;padding:0 4px 6px;border-bottom:1px solid ${t.line}">${p.columns.map((c) => `<span style="${colFlex(c)};text-align:${c.align ?? 'left'};font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:${t.dim};font-family:${t.fontUi}">${esc(c.label)}</span>`).join('')}</div>`;
  const toneColor: Record<string, string> = { normal: t.text, accent: t.gold, dim: t.dim };
  const body = p.rows.length
    ? p.rows.map((r) => {
        const act = r.action ? ` data-ui-id="${esc(r.id)}" data-action="${esc(r.action)}" data-arg="${esc(r.id)}"` : '';
        const cur = r.action ? 'cursor:pointer;' : '';
        const cells = p.columns.map((c) => `<span style="${colFlex(c)};text-align:${c.align ?? 'left'};font-size:12px;color:${toneColor[r.tone ?? 'normal'] ?? t.text};font-family:${t.fontUi};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.cells[c.key] ?? '')}</span>`).join('');
        return `<div${act} style="display:flex;gap:10px;align-items:center;padding:8px 4px;border-bottom:1px solid ${t.line};${cur}">${cells}</div>`;
      }).join('')
    : `<div style="padding:18px 4px;text-align:center;font-size:12px;color:${t.dim};font-family:${t.fontUi}">${esc(p.empty ?? '—')}</div>`;
  return `<div id="${esc(id)}" style="display:flex;flex-direction:column;background:${t.bg1};border:1px solid ${t.line};border-radius:10px;padding:12px 14px;${ls}">${title}${head}${body}</div>`;
}

// 多页(Table Pages)：nav 标签栏 + 各页全渲染(仅 active 显示)。切页由 mountUI 就地 toggle display(不重建·抗闪屏)。
// children 顺序对齐 tabs；data-tab/data-tabpage/data-tabs 是 mountUI 切页的锚点。
function renderTabs(id: string, p: TabsProps, children: LayoutNode[], ls: string, t: UITheme): string {
  const active = p.active ?? p.tabs[0]?.id ?? '';
  const navBtn = (tb: { id: string; label: string; anchor?: string; icon?: string }): string => {
    const on = tb.id === active;
    const act = p.action ? ` data-ui-id="${esc(tb.id)}" data-action="${esc(p.action)}" data-arg="${esc(tb.id)}"` : '';
    const anchor = tb.anchor ? ` data-anchor="${esc(tb.anchor)}"` : ''; // 新手引导锚点：spotlight 到具体页签按钮（REQ-UI-Tabs每页签锚点）
    // 页签图标（REQ-UI-标题图标槽）：icon 在场 → 文字前 1.05em 内联图；无=纯文字页签字节不变。
    const icon = tb.icon ? `<img src="${esc(tb.icon)}" alt="" style="height:1.05em;width:1.05em;object-fit:contain;vertical-align:-0.18em;margin-right:5px">` : '';
    const style = `padding:7px 14px;font-size:12px;cursor:pointer;background:none;outline:none;font-family:${t.fontUi};border:none;border-bottom:2px solid ${on ? t.gold : 'transparent'};color:${on ? t.gold : t.sub};transition:all .15s`;
    return `<button data-tab="${esc(tb.id)}"${act}${anchor} style="${style}">${icon}${escT(tb.label, t)}</button>`;
  };
  const nav = `<div style="display:flex;gap:4px;border-bottom:1px solid ${t.line};flex-wrap:wrap">${p.tabs.map(navBtn).join('')}</div>`;
  const pages = p.tabs.map((tb, i) => {
    const content = children[i] ? renderNode(children[i], t) : '';
    return `<div data-tabpage="${esc(tb.id)}" style="display:${tb.id === active ? 'block' : 'none'}">${content}</div>`;
  }).join('');
  return `<div id="${esc(id)}" data-tabs="${esc(id)}" style="display:flex;flex-direction:column;gap:12px;${ls}">${nav}${pages}</div>`;
}

// ── ProgressBar / Tag（纯展示比例条 + 可点标签·下沉自游戏 HUD/筛选条）──────────

// 比例条：value/max → 填充宽度%（钳 0..100）；tone 映射主题令牌；可选标签 + 右上数值。纯展示·无事件。
function renderProgressBar(id: string, p: ProgressBarProps, ls: string, t: UITheme): string {
  const max = p.max ?? 1;
  const pct = Math.max(0, Math.min(100, max > 0 ? (p.value / max) * 100 : 0));
  const fillColor: Record<string, string> = { accent: t.jade, gold: t.gold, ok: t.ok, warn: t.warn, danger: t.danger };
  const fill = fillColor[p.tone ?? 'accent'] ?? t.jade;
  const valTxt = max === 1 ? `${Math.round(pct)}%` : `${p.value}/${max}`;
  // 环形/径向进度（shape:'ring'·体力/耐力/每日目标/冷却环）：conic 弧 + 中心镂空显 value/label。
  if (p.shape === 'ring') {
    const d = num(p.size, 64);
    const deg = Math.round(pct / 100 * 360);
    const inner = Math.round(d * 0.66);
    const center = p.showValue ? valTxt : (p.label ?? '');
    return `<div id="${esc(id)}" style="width:${d}px;height:${d}px;border-radius:50%;background:conic-gradient(${fill} ${deg}deg,${t.bg3} ${deg}deg 360deg);display:inline-flex;align-items:center;justify-content:center;flex:none;${ls}">` +
      `<div style="width:${inner}px;height:${inner}px;border-radius:50%;background:${t.bg1};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px">` +
      `${center ? `<span style="font-size:${Math.round(d / 5.5)}px;font-weight:700;color:${t.text};font-family:${t.fontMono}">${esc(center)}</span>` : ''}` +
      `${p.label && p.showValue ? `<span style="font-size:9px;color:${t.dim};font-family:${t.fontUi}">${esc(p.label)}</span>` : ''}</div></div>`;
  }
  // 液面杯（REQ-UIFX·shape:'liquid'·同族扩写非新控件）：**游戏只给标量 value（水位）**——会晃的水面+气泡由引擎承担：
  // 双错频椭圆脊（主脊 900ms scaleY1↔.5 荡±3% + 副脊白55% 1250ms 反向·两条不同步才有晃动感）+ 整杯以杯底为轴 ±1.6°
  // slosh(1300ms) + 上窜气泡（尺寸/周期/横位 index 确定式分档）。keyframes 在 server.ts APOLLO_KEYFRAMES。
  // 禁「每帧烤水面进贴图」那条路（owner 判词·工单 ③ networkidle 实测教训）。render-only 不进 sim/hash。
  if (p.shape === 'liquid') {
    const rad = num(p.radius, 14);
    const liquid = p.fillColor ? safeColor(p.fillColor) : fill;
    const wave = p.wave !== false;
    const nBub = Math.max(0, Math.min(8, num(p.bubbles, 0)));
    const BUB_SZ = [16, 11, 20, 13, 18, 10, 15, 12]; // 定稿：16/11/20px 起的分档
    let bubs = '';
    for (let b = 0; b < nBub; b++) {
      const bs = BUB_SZ[b % 8]!;
      const per = 1500 + (b % 3) * 300;               // 1.5/1.8/2.1s 错频
      const delay = b * 350;                          // 错开发
      const bx = 12 + ((b * 37) % 70);                // 横位 %（确定式）
      const alpha = (60 + ((b * 13) % 16)) / 100;     // 白 60–75%
      bubs += `<span data-liq-bub style="position:absolute;left:${bx}%;bottom:-${bs}px;width:${bs}px;height:${bs}px;border-radius:50%;background:rgba(255,255,255,${alpha.toFixed(2)});animation:apollo-liq-bub ${per}ms linear ${delay}ms infinite"></span>`;
    }
    const ridge1 = `<span data-liq-ridge style="position:absolute;left:-12%;right:-12%;top:0;height:20px;transform:translateY(-50%);border-radius:50%;background:${liquid};filter:brightness(1.28)${wave ? ';animation:apollo-liq-wave 900ms ease-in-out infinite' : ''}"></span>`;
    const ridge2 = wave ? `<span data-liq-ridge style="position:absolute;left:-12%;right:-12%;top:0;height:16px;transform:translateY(-50%);border-radius:50%;background:rgba(255,255,255,.55);animation:apollo-liq-wave2 1250ms ease-in-out infinite"></span>` : '';
    const center = (p.showValue || p.label)
      ? `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;pointer-events:none">${p.showValue ? `<span style="font-size:15px;font-weight:700;color:${t.text};font-family:${t.fontMono};text-shadow:0 1px 3px rgba(0,0,0,.6)">${esc(valTxt)}</span>` : ''}${p.label ? `<span style="font-size:10px;color:${t.text};opacity:.85;font-family:${t.fontUi};text-shadow:0 1px 2px rgba(0,0,0,.6)">${esc(p.label)}</span>` : ''}</div>`
      : '';
    // 结构：杯体(radius 裁·overflow:hidden) > slosh 壳(以杯底为轴) > 水体(溢出侧沿±10% 防倾斜露缝·height=水位%) >
    //   [双脊(骑水线) + 气泡裁剪层(不越水面)]。缺省盒 90×120（layout.width/height 在 ls 末置可覆盖）。
    return `<div id="${esc(id)}" data-liquid style="position:relative;overflow:hidden;width:90px;height:120px;border-radius:${rad}px;background:${t.bg3};flex:none;${ls}">` +
      `<div style="position:absolute;inset:0;transform-origin:50% 100%${wave ? ';animation:apollo-liq-slosh 1300ms ease-in-out infinite' : ''}">` +
      `<div data-liq-water style="position:absolute;left:-10%;right:-10%;bottom:0;height:${pct}%;background:${liquid};transition:height .3s ease">` +
      ridge1 + ridge2 +
      `<div style="position:absolute;inset:0;overflow:hidden">${bubs}</div>` +
      `</div></div>${center}</div>`;
  }
  const header = (p.label || p.showValue)
    ? `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">${p.label ? `<span style="font-size:11px;color:${t.sub};font-family:${t.fontUi}">${esc(p.label)}</span>` : '<span></span>'}${p.showValue ? `<span style="font-size:11px;color:${t.sub};font-family:${t.fontMono}">${esc(valTxt)}</span>` : ''}</div>`
    : '';
  return `<div id="${esc(id)}" style="display:flex;flex-direction:column;${ls}">${header}<div style="height:8px;border-radius:5px;background:${t.bg3};overflow:hidden"><div style="width:${pct}%;height:100%;background:${fill};border-radius:5px;transition:width .2s"></div></div></div>`;
}

// 可点标签：active 或 tone 决定底/字/线色；有 action 则整体可点(arg=actionArg)；removable 加 ×。
function renderTag(id: string, p: TagProps, ls: string, t: UITheme): string {
  const on = p.active ?? false;
  const toneBg: Record<string, string> = { normal: 'rgba(255,255,255,0.04)', accent: t.jadeWash, dim: 'transparent' };
  const toneFg: Record<string, string> = { normal: t.sub, accent: t.jade, dim: t.dim };
  const bg = on ? t.jadeWash : (toneBg[p.tone ?? 'normal'] ?? 'rgba(255,255,255,0.04)');
  const fg = on ? t.jade : (toneFg[p.tone ?? 'normal'] ?? t.sub);
  const border = on ? t.jadeLine : t.line;
  const action = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}"${p.actionArg ? ` data-arg="${esc(p.actionArg)}"` : ''}` : '';
  const cursor = p.action ? 'cursor:pointer;' : '';
  const x = p.removable ? '<span style="margin-left:6px;opacity:.7">×</span>' : '';
  // 首部内联图标（批32 图标统一升级）：1em 随字号。无 icon=原输出字节不变。
  const tagIcon = p.icon ? `<img src="${esc(p.icon)}" alt="" style="height:1.1em;width:1.1em;object-fit:contain;margin-right:5px">` : '';
  // 尺寸档：md=原默认(向后兼容)；lg=大气药丸(货币计数等·≈2x 体量)；sm=紧凑。[padding, font-size, radius]。
  const TAG_DIMS: Record<string, [string, number, number]> = { sm: ['2px 8px', 10, 10], md: ['3px 10px', 11, 12], lg: ['7px 15px', 16, 16] };
  const [pad, fs, rad] = TAG_DIMS[p.size ?? 'md'] ?? TAG_DIMS['md']!;
  return `<span id="${esc(id)}"${action} style="display:inline-flex;align-items:center;padding:${pad};font-size:${fs}px;border-radius:${rad}px;background:${bg};color:${fg};border:1px solid ${border};font-family:${t.fontUi};white-space:nowrap;${cursor}${ls}">${tagIcon}${escT(p.label, t)}${x}</span>`;
}

// 飘字提示药丸：tone 着色（语义令牌）。挂载器 showToast() 复用它做定时自消浮层。
function renderToast(id: string, p: ToastProps, ls: string, t: UITheme): string {
  const toneMap: Record<string, [string, string, string]> = {
    ok:     [t.okWash, t.ok, t.ok],
    warn:   [t.warnWash, t.warn, t.warn],
    danger: ['rgba(211,137,122,0.16)', t.danger, t.danger],
    accent: [t.jadeWash, t.jade, t.jadeLine],
    dim:    ['rgba(255,255,255,0.06)', t.sub, t.line],
  };
  const [bg, fg, bd] = toneMap[p.tone ?? 'dim'] ?? toneMap['dim'] as [string, string, string];
  return `<div id="${esc(id)}" style="display:inline-flex;align-items:center;gap:8px;padding:9px 15px;border-radius:9px;background:${bg};color:${fg};border:1px solid ${bd};font-size:12px;font-family:${t.fontUi};box-shadow:0 6px 20px rgba(0,0,0,0.3);${ls}">${esc(p.text)}</div>`;
}

// 悬浮提示：包裹 children 作触发元素 + 一颗隐藏气泡(按 placement 定位)。显隐由 mountUI hover 内建。
function renderTooltip(id: string, p: TooltipProps, children: LayoutNode[], ls: string, t: UITheme): string {
  const inner = children.map((ch) => renderNode(ch, t)).join('');
  const posMap: Record<string, string> = {
    top:    'bottom:calc(100% + 6px);left:50%;transform:translateX(-50%)',
    bottom: 'top:calc(100% + 6px);left:50%;transform:translateX(-50%)',
    left:   'right:calc(100% + 6px);top:50%;transform:translateY(-50%)',
    right:  'left:calc(100% + 6px);top:50%;transform:translateY(-50%)',
  };
  const pos = posMap[p.placement ?? 'top'] ?? posMap['top'];
  // 富气泡（bubble=LayoutNode 子树·标题/效果/数值行）：宽气泡、可换行、塞 UI 数据；否则简单单行文本气泡（向后兼容）。
  const rich = !!p.bubble;
  const bubbleInner = rich ? renderNode(p.bubble!, t) : esc(p.content ?? '');
  // 气泡底叠不透明 bg0 兜底（owner 2026-06-28「弹出气泡太透·下面的卡都透出来重叠」）→ 永远实底·不透出后面的牌。
  const bubbleBg = `linear-gradient(${t.bg3},${t.bg3}),${t.bg0}`;
  const bubbleStyle = rich
    ? `display:none;position:absolute;${pos};z-index:250;width:240px;max-width:86vw;padding:10px 13px;border-radius:10px;background:${bubbleBg};color:${t.text};border:1px solid ${t.line};font-family:${t.fontUi};box-shadow:0 10px 30px rgba(0,0,0,0.7);pointer-events:none`
    : `display:none;position:absolute;${pos};z-index:250;padding:5px 9px;border-radius:6px;background:${bubbleBg};color:${t.text};border:1px solid ${t.line};font-size:11px;font-family:${t.fontUi};white-space:nowrap;box-shadow:0 8px 22px rgba(0,0,0,0.6);pointer-events:none`;
  const tag = rich ? 'div' : 'span';
  const bubble = `<${tag} data-tooltip-bubble style="${bubbleStyle}">${bubbleInner}</${tag}>`;
  // block 档：触发元素 display:block + 充满 → 能作 grid/flex item 随 1fr 拉伸（包 grid 卡墙里整张牌不塌陷）。缺省 inline-flex。
  const disp = p.block ? 'display:block;width:100%' : 'display:inline-flex';
  // data-tip-place：把首选方位带给 mountUI·hover 时按视口边界翻转/夹取定位（防首排/最左/最右卡气泡出界被裁）。
  return `<span id="${esc(id)}" data-tooltip data-tip-place="${esc(p.placement ?? 'top')}" tabindex="0" style="position:relative;${disp};${ls}">${inner}${bubble}</span>`;
}

// ── Modal（居中模态浮层 + 遮罩·下沉自各游戏手搭确认框/详情弹窗）─────────────────

// 遮罩满屏居中弹窗体；点 ×(data-action) 或点遮罩本身(data-modal-close·mountUI 内建) → closeAction。
function renderModal(id: string, p: ModalProps, children: LayoutNode[], ls: string, t: UITheme): string {
  const widthMap: Record<string, number> = { sm: 320, md: 460, lg: 640 };
  const w = widthMap[p.size ?? 'md'] ?? 460;
  const closable = p.closable ?? true;
  const scrimClose = p.closeAction ? ` data-modal-close="${esc(p.closeAction)}"` : '';
  const xBtn = (closable && p.closeAction)
    ? `<button data-ui-id="${esc(id)}" data-action="${esc(p.closeAction)}" aria-label="close" style="position:absolute;top:10px;right:13px;width:26px;height:26px;background:none;border:none;color:${t.dim};font-size:19px;line-height:1;cursor:pointer;font-family:${t.fontUi}">×</button>`
    : '';
  const title = p.title
    ? `<div style="font-size:15px;font-weight:700;color:${t.text};font-family:${t.fontUi};margin-bottom:12px;padding-right:26px">${esc(p.title)}</div>`
    : '';
  const body = children.map((ch) => renderNode(ch, t)).join('');
  // 遮罩加深 0.62→0.9（owner 2026-06-28 两度反馈「弹层太透·看穿到本体」）：弹层须与背后大厅强分离·操作看得清。
  // 面板底叠一层不透明 bg0 兜底（防 t.bg1 在半透明主题下透出背景·如战斗皮肤 var(--panel)）→ 内容永远实底可读。
  return `<div id="${esc(id)}"${scrimClose} style="position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,0.9);${ls}"><div style="position:relative;width:${w}px;max-width:100%;max-height:88vh;overflow-y:auto;background:linear-gradient(${t.bg1},${t.bg1}),${t.bg0};border:1px solid ${t.line};border-radius:12px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,0.7)">${xBtn}${title}${body}</div></div>`;
}

// ── Card / Stepper / Segmented / Avatar / Accordion（P1·网格卡/数量/分段/头像/折叠）──────

// 网格卡单元：媒体字形 + 标题 + 副标 + 角标 + tone 边框/暗化 + 可点。children 非空则替默认排版。
function renderCard(id: string, p: CardProps, children: LayoutNode[], ls: string, t: UITheme): string {
  const border = p.tone === 'accent' ? t.jadeLine : t.line;
  const dimmed = (p.tone === 'locked' || p.tone === 'dim') ? 'opacity:.55;' : '';
  const action = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}"${p.actionArg ? ` data-arg="${esc(p.actionArg)}"` : ''}` : '';
  const cursor = p.action ? 'cursor:pointer;' : '';
  const corner = p.corner ? `<span style="position:absolute;top:7px;right:8px;font-size:9px;padding:1px 6px;border-radius:7px;background:${t.jadeWash};color:${t.jade};font-family:${t.fontUi}">${esc(p.corner)}</span>` : '';
  // media URL 检测（批32 图标统一升级·additive）：'/x.png'|'http…'|'data:…' → 图片媒体；其余照旧当字形字符（零回归）。
  const mediaHtml = p.media
    ? (/^(\/|https?:|data:)/.test(p.media)
      ? `<div style="text-align:center;margin-bottom:6px"><img src="${esc(p.media)}" alt="" style="height:34px;width:34px;object-fit:contain"></div>`
      : `<div style="font-size:26px;text-align:center;margin-bottom:6px">${escT(p.media, t)}</div>`)
    : '';
  const body = children.length
    ? children.map((ch) => renderNode(ch, t)).join('')
    : `${mediaHtml}${p.title ? `<div style="font-size:12px;font-weight:700;color:${t.text};font-family:${t.fontUi};text-align:center;line-height:1.3">${escT(p.title, t)}</div>` : ''}${p.sub ? `<div style="font-size:10px;color:${t.dim};font-family:${t.fontUi};text-align:center;margin-top:3px">${escT(p.sub, t)}</div>` : ''}`;
  return `<div id="${esc(id)}"${action} style="position:relative;display:flex;flex-direction:column;justify-content:center;padding:12px 10px;border-radius:10px;background:${t.bg2};border:1px solid ${border};font-family:${t.fontUi};${dimmed}${cursor}${ls}">${corner}${body}</div>`;
}

// ── PlayingCard（扑克牌原语）：双角镜像 + 中央大花色 + 正/背面 + 选中/暗态 + 可点。──
// 红黑自动判（♥♦红·其余黑·借主题 danger/text 令牌·随皮走）；尺寸 sm/md/lg；旋转缩放交给 layout。
const PCARD_DIMS: Record<string, [number, number, number, number]> = { sm: [52, 72, 13, 26], md: [64, 90, 15, 34], lg: [82, 116, 18, 46] };
function renderPlayingCard(id: string, p: PlayingCardProps, ls: string, t: UITheme): string {
  const [w, h, corner, big] = PCARD_DIMS[p.size ?? 'md'] ?? PCARD_DIMS['md']!;
  const dim = p.fluid ? 'width:100%;aspect-ratio:5/7' : `width:${w}px;height:${h}px`; // fluid=充满父格(5:7)·替代固定档
  const isRed = p.suit === '♥' || p.suit === '♦';
  const light = p.face === 'light';
  // light=经典白扑克牌（红黑对比·对决卡用）；dark=暗主题卡（牌库格/收藏用·缺省）。
  const sc = light ? (isRed ? '#c0392b' : '#1a1a1a') : (isRed ? t.danger : t.text);
  const faceUp = p.faceUp !== false;
  const action = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}"${p.actionArg ? ` data-arg="${esc(p.actionArg)}"` : ''}` : '';
  const cursor = p.action ? 'cursor:pointer;' : '';
  const dimmed = p.dimmed ? 'opacity:.5;' : '';
  const selBorder = p.selected ? t.gold : sc;
  const glow = p.selected ? `box-shadow:0 0 0 1px ${t.gold},0 0 12px ${t.jadeLine};` : '';
  const pip = (pos: string): string => `<span style="position:absolute;${pos};font-size:${corner}px;line-height:1;color:${sc};font-family:${t.fontUi};text-align:center">${esc(p.rank)}<br>${esc(p.suit)}</span>`;
  // 中央：有立绘 art（REQ-UI-G·G5）→ 居中显立绘剪影、替代中央大花色（角标点数花色仍在）；否则原大花色。
  const center = (faceUp && p.art)
    ? `<img src="${esc(p.art)}" alt="" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:78%;height:78%;object-fit:contain;pointer-events:none">`
    : `<span style="font-size:${big}px;color:${sc};opacity:.9">${esc(p.suit)}</span>`;
  // 牌背程序化纹理（REQ-UI-G流光底纹②）：faceUp:false 时叠 checker 棋盘格 / stripe 斜条纹（原版红牌背质感）。
  const backPat = (!faceUp && p.backPattern)
    ? `<div style="position:absolute;inset:0;border-radius:8px;pointer-events:none;background:${p.backPattern === 'checker' ? 'repeating-conic-gradient(rgba(255,255,255,.06) 0% 25%,transparent 0% 50%) 0 0 / 12px 12px' : 'repeating-linear-gradient(45deg,rgba(255,255,255,.06) 0 2px,transparent 2px 9px)'}"></div>`
    : '';
  // 牌背贴图（REQ-UI-PlayingCard-back·批29）：backArt=已解析 URL → 背面整面 cover（替代纹样字符+程序化纹理）；
  // 无 backArt=原样（观感零变）。圆角 6px 贴容器 8px 圆角内缘（2px 边框内）；边框/选中金边仍在外层。
  // 整牌面贴图（A-024①·backArt 的正面版）：faceUp 且给了 faceArt → 整面 cover（或 faceArtSlice 走 9-slice 画框）·
  // 替代程序化牌面（角标/中央花色全隐）；label/value 覆盖层仍在。牌面即一张插画（掼蛋 54 牌面皮/TCG）。
  const faceArtHtml = p.faceArt
    ? (p.faceArtSlice !== undefined
        ? `<div style="position:absolute;inset:0;border-radius:6px;border-style:solid;border-width:${num(p.faceArtSlice)}px;border-image:url(${safeUrl(p.faceArt)}) ${num(p.faceArtSlice)} fill / ${num(p.faceArtSlice)}px / 0 stretch;pointer-events:none"></div>`
        : `<img src="${esc(p.faceArt)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:6px;pointer-events:none">`)
    : '';
  const inner = faceUp
    ? (faceArtHtml || `${pip('top:5px;left:6px')}${center}${pip('bottom:5px;right:6px;transform:rotate(180deg)')}`)
    : p.backArt
      ? `<img src="${esc(p.backArt)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:6px;pointer-events:none">`
      : `${backPat}<span style="font-size:${big}px;color:${t.jade};opacity:.5">${esc(p.back ?? '♠')}</span>`;
  const faceBg = faceUp ? (light ? 'linear-gradient(160deg,#fefdfb,#eceae3)' : t.bg2) : (light ? 'linear-gradient(160deg,#b34a4a,#8c3535)' : t.bg3);
  const lblColor = light ? '#5a5048' : t.sub;
  const label = p.label ? `<div style="position:absolute;bottom:3px;left:0;right:0;font-size:9px;color:${lblColor};font-family:${t.fontUi};text-align:center;${light ? '' : 'text-shadow:0 1px 2px rgba(0,0,0,.6)'}">${esc(p.label)}</div>` : '';
  const value = p.value ? `<span style="position:absolute;bottom:4px;right:6px;font-size:10px;font-weight:700;color:${t.gold};font-family:${t.fontUi}">${esc(p.value)}</span>` : '';
  // 翻面（REQ-UI-G收藏卡① + REQ-UI-tap翻面）：front=牌面 / back=信息子树，绕 Y 轴真 3D 翻（CSS 注入·见 server.ts data-flipcard/data-flipstate 规则）。
  //   flipped(状态驱动·触屏可用·优先) → data-flipstate + data-flipped；flipOnHover(悬停·桌面) → data-flipcard。二选一。
  if ((p.flipped !== undefined || p.flipOnHover) && p.backFace) {
    const face = `position:absolute;inset:0;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:2px solid ${selBorder};font-family:${t.fontUi};${glow}${dimmed}`;
    const front = `<div data-flip-front style="${face};background:${faceBg}">${inner}${label}${value}</div>`;
    const back = `<div data-flip-back style="${face};background:${t.bg2};padding:7px;overflow:hidden">${renderNode(p.backFace, t)}</div>`;
    const marker = p.flipped !== undefined ? `data-flipstate data-flipped="${p.flipped ? 'true' : 'false'}"` : 'data-flipcard';
    return `<div id="${esc(id)}"${action} ${marker} data-audit-skip-contrast style="position:relative;${dim};${cursor}${ls}">${front}${back}</div>`;
  }
  // data-audit-skip-contrast：扑克牌是定色语义原语（红♥♦/黑♠♣ 在牌面·花色本色不吃 WCAG），ui-audit 对其内文字免对比检查（A-007b·防红角标/叠放采样假阳）。
  return `<div id="${esc(id)}"${action} data-audit-skip-contrast style="position:relative;display:inline-flex;align-items:center;justify-content:center;${dim};border-radius:8px;background:${faceBg};border:2px solid ${selBorder};font-family:${t.fontUi};${glow}${dimmed}${cursor}${ls}">${inner}${label}${value}</div>`;
}

// ── CoinFlip（掷币）：3D 双面硬币·spinning 播翻转落定到 outcome·静态则直接显示结果面。──
function renderCoinFlip(id: string, p: CoinFlipProps, ls: string, t: UITheme): string {
  const d = num(p.size, 92);
  const ms = num(p.durationMs, 1100);
  const tails = p.outcome === 'tails';
  const action = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}"` : '';
  const cursor = p.action ? 'cursor:pointer;' : '';
  // spinning：用白名单关键帧（apollo-coin-heads/tails·server.ts 注入）落定；静态：直接定到结果面。
  const spin = p.spinning
    ? `animation:apollo-coin-${tails ? 'tails' : 'heads'} ${ms}ms ease-out both;`
    : `transform:rotateX(${tails ? 180 : 0}deg);`;
  // 面贴图（批29b）：art 有 → 面底=图 cover（叠在原底色上）+ 白字投影保可读；无 → 原金/暖底逐字节不变。
  const face = (label: string, bg: string, rot: number, art?: string): string => {
    const fill = art ? `${bg} url('${esc(String(art).replace(/['"()\\\s]/g, ''))}') center/cover no-repeat` : bg;
    const ink = art ? 'color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.85)' : `color:${t.bg0}`;
    return `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:50%;backface-visibility:hidden;-webkit-backface-visibility:hidden;transform:rotateX(${rot}deg);background:${fill};border:3px solid ${t.gold};${ink};font-family:${t.fontUi};font-weight:700;font-size:${Math.round(d / 5)}px">${esc(label)}</div>`;
  };
  return `<div id="${esc(id)}"${action} style="width:${d}px;height:${d}px;perspective:600px;${cursor}${ls}">` +
    `<div style="position:relative;width:100%;height:100%;transform-style:preserve-3d;${spin}">` +
    face(p.headsLabel ?? '正', t.gold, 0, p.headsArt) + face(p.tailsLabel ?? '反', t.warn, 180, p.tailsArt) +
    `</div></div>`;
}

// ── Versus（对决特写）：左右两张 PlayingCard 对决 + 中央胜率/火花 + 胜方高亮。──
function renderVersus(id: string, p: VersusProps, ls: string, t: UITheme): string {
  const spark = p.spark !== false;
  const card = (cp: PlayingCardProps, side: 'left' | 'right'): string => {
    const lose = p.winner && p.winner !== 'none' && p.winner !== side;
    const win = p.winner === side;
    return renderPlayingCard(`${id}-${side}`, { ...cp, size: cp.size ?? 'lg', selected: win, dimmed: lose }, '', t);
  };
  const center = `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:0 14px">` +
    (spark ? `<span style="font-size:26px;color:${t.gold};animation:apollo-spark 700ms ease-out both">✦</span>` : '') +
    `<span style="font-size:18px;color:${t.danger};font-family:${t.fontUi};font-weight:700">⚔</span>` +
    (p.label ? `<span style="font-size:13px;color:${t.gold};font-family:${t.fontUi};font-weight:700;white-space:nowrap">${esc(p.label)}</span>` : '') +
    `</div>`;
  return `<div id="${esc(id)}" style="display:inline-flex;align-items:center;justify-content:center;animation:apollo-clash 500ms ease-out both;${ls}">${card(p.left, 'left')}${center}${card(p.right, 'right')}</div>`;
}

// 数量 ±：到界或无 action 则禁用按钮（不发信号）；按钮 data-arg=钳位后新值。
function renderStepper(id: string, p: StepperProps, ls: string, t: UITheme): string {
  const min = num(p.min, 0), max = num(p.max, 99), step = num(p.step, 1), v = num(p.value, 0); // num()：v 直插 span，字符串会造成裸 HTML 注入
  const btn = (lbl: string, target: number, disabled: boolean): string =>
    `<button${disabled ? ' disabled' : ` data-ui-id="${esc(id)}" data-action="${esc(p.action ?? '')}" data-arg="${target}"`} style="width:26px;height:26px;border-radius:6px;background:${t.bg2};border:1px solid ${t.line};color:${t.sub};font-size:15px;line-height:1;cursor:${disabled ? 'not-allowed' : 'pointer'};font-family:${t.fontUi};opacity:${disabled ? 0.4 : 1}">${lbl}</button>`;
  return `<div id="${esc(id)}" style="display:inline-flex;align-items:center;gap:8px;${ls}">${btn('−', Math.max(min, v - step), !p.action || v <= min)}<span style="min-width:28px;text-align:center;font-size:13px;color:${t.text};font-family:${t.fontMono}">${v}</span>${btn('+', Math.min(max, v + step), !p.action || v >= max)}</div>`;
}

// 紧凑分段选择：选中段洗色高亮；点段 → action(arg=value)。
function renderSegmented(id: string, p: SegmentedProps, ls: string, t: UITheme): string {
  const segs = p.options.map((o) => {
    const on = p.value === o.value;
    const action = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}" data-arg="${esc(o.value)}"` : '';
    return `<button${action} style="padding:5px 12px;border:none;border-radius:6px;background:${on ? t.jadeWash : 'transparent'};color:${on ? t.jade : t.sub};font-size:12px;cursor:pointer;font-family:${t.fontUi}">${esc(o.label)}</button>`;
  }).join('');
  return `<div id="${esc(id)}" style="display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:${t.bg2};border:1px solid ${t.line};${ls}">${segs}</div>`;
}

// 头像/立绘位：src 有则图、无则 name 首字；shape 决定圆角。
function renderAvatar(id: string, p: AvatarProps, ls: string, t: UITheme): string {
  const size = num(p.size, 40); // num()：size 直插 width/height 样式，字符串会造成注入
  const radius = p.shape === 'square' ? 0 : p.shape === 'rounded' ? Math.round(size * 0.22) : size;
  const inner = p.src
    ? `<img src="${esc(p.src)}" alt="${esc(p.name ?? '')}" style="width:100%;height:100%;object-fit:cover">`
    : `<span style="font-size:${Math.round(size * 0.42)}px;color:${t.sub};font-family:${t.fontUi}">${esc((p.name ?? '?').slice(0, 1))}</span>`;
  // 环形进度描边（REQ-UI-Avatar环·回合计时/进度环绕头像）：有 ring → 外层 conic 环 + 内层头像盖住中心（只露环带）。
  // 无 ring = 原样字节不变（不动既有 golden）。
  if (p.ring) {
    const ringCol: Record<string, string> = { accent: t.jade, gold: t.gold, ok: t.ok, warn: t.warn, danger: t.danger };
    const rc = ringCol[p.ring.tone ?? 'accent'] ?? t.jade;
    const pct = Math.max(0, Math.min(1, num(p.ring.value) / num(p.ring.max, 1))) * 100;
    const thick = Math.max(3, Math.round(size * 0.09));
    const rad = radius === 0 ? 0 : Math.round((size + thick * 2) / 2);   // 方形环仍方·圆/圆角环走圆
    const avatar = `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden;background:${t.bg3};border:1px solid ${t.line}">${inner}</span>`;
    return `<span id="${esc(id)}" title="${esc(p.name ?? '')}" style="display:inline-flex;padding:${thick}px;border-radius:${rad}px;background:conic-gradient(${rc} 0 ${pct}%,${t.line} ${pct}% 100%);${ls}">${avatar}</span>`;
  }
  return `<span id="${esc(id)}" title="${esc(p.name ?? '')}" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden;background:${t.bg3};border:1px solid ${t.line};${ls}">${inner}</span>`;
}

// 折叠面板：title 行点击切开合（mountUI 内建·锚 data-accordion*）；open 初始展开。
function renderAccordion(id: string, p: AccordionProps, children: LayoutNode[], ls: string, t: UITheme): string {
  const open = p.open ?? false;
  const action = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}"` : '';
  const head = `<button data-accordion-head${action} style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 12px;background:${t.bg2};border:1px solid ${t.line};border-radius:8px;color:${t.text};font-size:13px;font-weight:600;cursor:pointer;font-family:${t.fontUi}"><span>${esc(p.title)}</span><span data-accordion-caret style="color:${t.dim};transition:transform .15s;transform:rotate(${open ? 90 : 0}deg)">▸</span></button>`;
  const body = `<div data-accordion-body style="display:${open ? 'block' : 'none'};padding:10px 12px">${children.map((ch) => renderNode(ch, t)).join('')}</div>`;
  return `<div id="${esc(id)}" data-accordion style="display:flex;flex-direction:column;gap:4px;${ls}">${head}${body}</div>`;
}

// ── Rating / Combobox / Drawer（P2·星级 / 搜索下拉 / 抽屉）──────────────────────

// 星级：1..max 颗，≤value 点亮(金)；有 action 则每颗可点(arg=颗数)设值，无则只读。
function renderRating(id: string, p: RatingProps, ls: string, t: UITheme): string {
  const max = p.max ?? 5;
  const stars = Array.from({ length: max }, (_, i) => {
    const n = i + 1, on = n <= p.value;
    const act = p.action ? ` data-ui-id="${esc(id)}" data-action="${esc(p.action)}" data-arg="${n}"` : '';
    return `<span${act} style="font-size:16px;line-height:1;color:${on ? t.gold : t.dim};${p.action ? 'cursor:pointer;' : ''}">${on ? '★' : '☆'}</span>`;
  }).join('');
  return `<span id="${esc(id)}" style="display:inline-flex;gap:2px;${ls}">${stars}</span>`;
}

// 搜索下拉：输入框 + 选项面板（缺省隐）。开合/过滤/点选/点外合由 mountUI 内建（data-combo* 锚点）。
function renderCombobox(id: string, p: ComboboxProps, ls: string, t: UITheme): string {
  const selected = p.options.find((o) => o.value === p.value);
  const opts = p.options
    .map((o) => `<div data-combo-opt="${esc(o.value)}" data-combo-label="${esc(o.label)}" style="padding:7px 10px;font-size:12px;color:${t.text};cursor:pointer;font-family:${t.fontUi}">${esc(o.label)}</div>`)
    .join('');
  const inp = `background:${t.bg2};color:${t.text};border:1px solid ${t.line};border-radius:6px;font-size:12px;padding:6px 10px;outline:none;font-family:${t.fontUi};width:100%`;
  return `<div id="${esc(id)}" data-combo="${esc(p.action ?? '')}" style="position:relative;${ls}"><input data-combo-search type="text" autocomplete="off" placeholder="${esc(p.placeholder ?? '搜索…')}" value="${esc(selected?.label ?? '')}" style="${inp}"><div data-combo-panel style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:250;max-height:220px;overflow:auto;background:${t.bg2};border:1px solid ${t.line};border-radius:8px;box-shadow:0 12px 30px rgba(0,0,0,0.4)">${opts}</div></div>`;
}

// 抽屉：贴边面板 + 遮罩。遮罩关闭复用 mountUI 的 data-modal-close（与 Modal 同套路·零新增运行时）。
function renderDrawer(id: string, p: DrawerProps, children: LayoutNode[], ls: string, t: UITheme): string {
  const side = p.side ?? 'right';
  const panelPos: Record<string, string> = {
    left:   `top:0;left:0;bottom:0;width:340px;max-width:86%;border-right:1px solid ${t.line}`,
    right:  `top:0;right:0;bottom:0;width:340px;max-width:86%;border-left:1px solid ${t.line}`,
    bottom: `left:0;right:0;bottom:0;max-height:82%;border-top:1px solid ${t.line};border-radius:14px 14px 0 0`,
  };
  const scrimClose = p.closeAction ? ` data-modal-close="${esc(p.closeAction)}"` : '';
  const xBtn = p.closeAction
    ? `<button data-ui-id="${esc(id)}" data-action="${esc(p.closeAction)}" aria-label="close" style="position:absolute;top:10px;right:13px;width:26px;height:26px;background:none;border:none;color:${t.dim};font-size:19px;line-height:1;cursor:pointer;font-family:${t.fontUi}">×</button>`
    : '';
  const title = p.title ? `<div style="font-size:15px;font-weight:700;color:${t.text};font-family:${t.fontUi};margin-bottom:12px;padding-right:26px">${esc(p.title)}</div>` : '';
  const body = children.map((ch) => renderNode(ch, t)).join('');
  return `<div id="${esc(id)}"${scrimClose} style="position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.62);${ls}"><div style="position:absolute;${panelPos[side]};background:${t.bg1};padding:20px;overflow:auto;box-shadow:0 0 50px rgba(0,0,0,0.5)">${xBtn}${title}${body}</div></div>`;
}

// ── VirtualList / ContextMenu（P2 收尾·长列表虚拟滚动 / 右键菜单）──────────────────

// 单行（绝对定位在 index*rowHeight）：列定义同 Table；可点(arg=row.id)。
function vlistRowHtml(p: VirtualListProps, row: { id: string; cells: Record<string, string> }, index: number, t: UITheme): string {
  const cols = p.columns ?? [{ key: Object.keys(row.cells)[0] ?? '', label: '' }];
  const act = p.action ? ` data-ui-id="${esc(row.id)}" data-action="${esc(p.action)}" data-arg="${esc(row.id)}"` : '';
  const cells = cols.map((c) => `<span style="${c.width !== undefined ? `flex:0 0 ${c.width}px` : 'flex:1'};text-align:${c.align ?? 'left'};font-size:12px;color:${t.text};font-family:${t.fontUi};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(row.cells[c.key] ?? '')}</span>`).join('');
  return `<div data-vlist-row="${esc(row.id)}"${act} style="position:absolute;top:${index * p.rowHeight}px;left:0;right:0;height:${p.rowHeight}px;display:flex;align-items:center;gap:10px;padding:0 12px;${p.action ? 'cursor:pointer;' : ''}border-bottom:1px solid ${t.line}">${cells}</div>`;
}

// 可视窗口（按 scrollTop 算 [start,end)·带缓冲）。renderNode 初次用 scrollTop=0；mountUI 滚动时复用本函数。
export function renderVListWindow(p: VirtualListProps, scrollTop: number, t: UITheme): string {
  const viewport = p.height ?? 320;
  const count = Math.ceil(viewport / p.rowHeight) + 4; // 窗口 + 缓冲
  const start = Math.max(0, Math.floor(scrollTop / p.rowHeight) - 2);
  const end = Math.min(p.rows.length, start + count);
  let html = '';
  for (let i = start; i < end; i++) html += vlistRowHtml(p, p.rows[i]!, i, t);
  return html;
}

function renderVirtualList(id: string, p: VirtualListProps, ls: string, t: UITheme): string {
  const h = p.height ?? 320;
  const total = p.rows.length * p.rowHeight;
  return `<div id="${esc(id)}" data-vlist="${esc(id)}" style="height:${h}px;overflow-y:auto;background:${t.bg1};border:1px solid ${t.line};border-radius:10px;${ls}"><div data-vlist-spacer style="position:relative;height:${total}px">${renderVListWindow(p, 0, t)}</div></div>`;
}

// 右键菜单：包裹 children 作触发元素 + 一个隐藏菜单(右键在光标处弹·mountUI 内建)。项带 data-action(arg=item.id)。
function renderContextMenu(id: string, p: ContextMenuProps, children: LayoutNode[], ls: string, t: UITheme): string {
  const items = p.items.map((it) => `<button data-ui-id="${esc(it.id)}" data-action="${esc(it.action)}" data-arg="${esc(it.id)}" data-ctxmenu-item style="display:block;width:100%;text-align:left;padding:7px 14px;background:none;border:none;color:${t.text};font-size:12px;cursor:pointer;font-family:${t.fontUi};white-space:nowrap;border-radius:5px">${esc(it.label)}</button>`).join('');
  const pop = `<div data-ctxmenu-pop style="display:none;position:fixed;z-index:260;min-width:140px;background:${t.bg2};border:1px solid ${t.line};border-radius:8px;padding:4px;box-shadow:0 12px 30px rgba(0,0,0,0.4)">${items}</div>`;
  const inner = children.map((ch) => renderNode(ch, t)).join('');
  return `<span id="${esc(id)}" data-ctxmenu style="position:relative;display:inline-flex;${ls}">${inner}${pop}</span>`;
}

// ── 统一入口 ────────────────────────────────────────────────────

/** 将 LayoutNode 树渲染为 HTML 字符串。弱模型提供数据 + 可选主题；此函数是解释器。缺省主题 = 引擎 SHELL 脸。 */
/**
 * 渲染 LayoutNode → HTML 串。出口处理拖拽声明（draggable/dropZone）：
 * 把 draggable/data-drag/data-drop 注入到元素的开标签（不加包裹层·不破布局），mountUI 收手势。
 */
// Video：原生 <video> 数据驱动播放（爱诗 AIGP 开场/转场短视频等）。src/poster esc 防属性注入；
// autoplay 自动补 muted（浏览器自动播放策略）；controls 缺省开。纯表现·无 sim 介入。
function renderVideo(id: string, p: VideoProps, ls: string, t: UITheme): string {
  const auto = p.autoplay ? ' autoplay muted' : (p.muted ? ' muted' : '');
  const flags = `${p.controls === false ? '' : ' controls'}${p.loop ? ' loop' : ''}${auto} playsinline`;
  const src = p.src ? ` src="${esc(p.src)}"` : '';
  const poster = p.poster ? ` poster="${esc(p.poster)}"` : '';
  const style = `display:block;max-width:100%;background:#000;border:1px solid ${t.line};border-radius:10px;${ls}`;
  return `<video id="${esc(id)}"${src}${poster}${flags} style="${style}"></video>`;
}

// ── Particles（UI 层庆祝粒子叠层·render-only）：喷一把 N 个小片，位置/延迟由 index 确定式派生（无 Math.random·可回归）。
// 铺满父容器·pointer-events:none。confetti/coins=下落雨；stars=径向爆；sparkle=原地微光闪。CSS keyframes 见 server.ts。
// REQ-UIFX 物理弹道模式（shape/gravity/drag/flyTo/trail 任一在场）：渲成 data-particle-sim 容器 + data-pp 粒子体
// （初始隐），server.ts 胶水 rAF 积分「初速+重力+阻尼(+弹簧引向目标锚)」——**动画归渲染器**，游戏只给静态数据
// （owner 判词：禁游戏层每帧生成新贴图那条路·2026-08-07 networkidle 永不闲实测）。缺省不填=四预设 CSS 行为零变化。
const PARTICLE_COLORS = ['#e94f5a', '#f5a623', '#7ed957', '#4a90d9', '#9b59b6', '#ff7ab0'];

/** 确定式弹道参数（REQ-UIFX·物理模式·index 派生纯函数·server 胶水与测试共用单一真相·无裸 Math.random）。 */
export interface ParticleSimSpec { angle: number; speed: number; delay: number; size: number }
export function particleSimSpec(
  i: number,
  p: { shape?: 'point' | 'cone'; coneAngle?: number; speed?: number; stagger?: number; size?: number | number[] },
): ParticleSimSpec {
  const jitter = ((i * 37) % 97) / 96; // 0..1 确定式（互质取模）
  const angle = p.shape === 'cone'
    ? -Math.PI / 2 + (jitter * 2 - 1) * num(p.coneAngle, 0.4) // 绕「上」锥（屏幕系 -Y=上·半角=弧度·对位 Vfx3D）
    : i * 2.399963;                                            // point=黄金角摊满全周（四散）
  const speed = num(p.speed, 320) * (0.85 + 0.3 * (((i * 29) % 89) / 88)); // ±15% 确定式抖动
  return { angle, speed, delay: i * num(p.stagger, 36), size: particleSize(i, p.size) };
}
/** 粒径分档（REQ-UIFX）：数组=按 index 取档（定稿「六档 12–30」）；单数=统一；缺省=原 index 派生小片。 */
export function particleSize(i: number, size?: number | number[]): number {
  if (Array.isArray(size) && size.length) return num(size[i % size.length], 8);
  if (typeof size === 'number') return num(size, 8);
  return 6 + (i % 4) * 2;
}
/** colorGradient stops → CSS 径向渐变（芯→缘）。alpha 仅对 #rrggbb 生效（追加 hex alpha 字节）。 */
function particleGradient(stops: NonNullable<ParticlesProps['colorGradient']>): string {
  const parts = stops.map((s) => {
    let col = safeColor(s.color);
    if (s.alpha !== undefined && /^#[0-9a-fA-F]{6}$/.test(col)) {
      col += Math.round(Math.max(0, Math.min(1, num(s.alpha, 1))) * 255).toString(16).padStart(2, '0');
    }
    return `${col} ${Math.round(Math.max(0, Math.min(1, num(s.t, 0))) * 100)}%`;
  });
  return `radial-gradient(circle at 32% 30%,${parts.join(',')})`;
}

function renderParticles(id: string, p: ParticlesProps, ls: string, t: UITheme): string {
  const kind = p.kind;
  const count = Math.max(1, Math.min(60, num(p.count, kind === 'confetti' ? 26 : 16)));
  const loop = p.loop !== false; // 缺省循环（展示/环境）
  // 自定义色轴（REQ-UIFX·四预设与物理模式通用）：grad=粒子体径向渐变；solid=单色/渐变主色（glyph/拖尾/光晕用）。
  const grad = (p.colorGradient && p.colorGradient.length) ? particleGradient(p.colorGradient) : undefined;
  const solid = p.color ? safeColor(p.color)
    : (p.colorGradient && p.colorGradient.length ? safeColor(p.colorGradient[Math.min(1, p.colorGradient.length - 1)]!.color) : undefined);

  // ── 物理弹道模式（shape/gravity/drag/flyTo/trail 任一在场·follow:'cursor' 优先走既有小簇路）──
  const sim = p.follow !== 'cursor'
    && (p.shape !== undefined || p.gravity !== undefined || p.drag !== undefined || p.flyTo !== undefined || p.trail !== undefined);
  if (sim) {
    const seg = p.trail ? Math.max(1, Math.min(16, num(p.trail.segments, 6))) : 0;
    const trailBlend = p.trail?.blend === 'add' ? 'mix-blend-mode:screen;' : '';
    const pieces: string[] = [];
    for (let i = 0; i < count; i++) {
      const spec = particleSimSpec(i, p);
      const sz = spec.size;
      const col = solid ?? (kind === 'confetti' ? PARTICLE_COLORS[i % PARTICLE_COLORS.length]! : t.gold);
      // 拖尾点（渲在主体之前=垫底·server 按位置历史摆·对位 Trail3D：头宽 width·尾端 fade·blend）。
      if (seg > 0) {
        const tw = num(p.trail!.width, Math.max(3, Math.round(sz * 0.6)));
        for (let s = 0; s < seg; s++) {
          pieces.push(`<span data-pt="${i}" style="position:absolute;left:0;top:0;width:${tw}px;height:${tw}px;border-radius:50%;background:${col};opacity:0;${trailBlend}will-change:transform"></span>`);
        }
      }
      // 粒子体（按 kind 定形·初始隐·server 以 transform 摆位故 left/top 恒 0）。
      let body: string;
      if (kind === 'stars') {
        body = `font-size:${sz}px;line-height:1;color:${col}`;
      } else if (kind === 'confetti') {
        body = `width:${sz}px;height:${Math.round(sz * 1.35)}px;border-radius:2px;background:${grad ?? col}`;
      } else { // coins / sparkle：圆体（自定义色带白描边+同色光晕·定稿「芯白→牌色渐变+同色光晕+白描边」）
        const bg = grad ?? (solid ? `radial-gradient(circle at 35% 30%,#fff,${solid})` : `radial-gradient(circle at 35% 30%,#ffe9a8,${t.gold})`);
        const halo = (solid ?? grad) ? `;box-shadow:0 0 ${Math.max(6, Math.round(sz * 0.9))}px ${col}` : (kind === 'sparkle' ? `;box-shadow:0 0 6px ${t.gold}` : '');
        const rim = grad ? ';border:2px solid rgba(255,255,255,.85)' : '';
        body = `width:${sz}px;height:${sz}px;border-radius:50%;background:${bg}${halo}${rim}`;
      }
      pieces.push(`<span data-pp="${i}" style="position:absolute;left:0;top:0;${body};opacity:0;will-change:transform">${kind === 'stars' ? '★' : ''}</span>`);
    }
    const fly = p.flyTo;
    const flyAttr = fly
      ? ` data-ps-fly-kind="${fly.kind === 'entity' ? 'entity' : 'node'}" data-ps-fly-id="${esc(fly.id)}" data-ps-fly-at="${esc(fly.at ?? 'center')}" data-ps-fly-ox="${num(fly.offset?.x, 0)}" data-ps-fly-oy="${num(fly.offset?.y, 0)}"`
      : '';
    const drag = p.drag !== undefined ? num(p.drag) : (fly ? 1.2 : 0); // flyTo 缺省带轻阻尼（阻尼弹簧=缓入缓出·对位 Vfx3D attractor+drag）
    const attrs = ` data-particle-sim="${esc(kind)}" data-ps-shape="${p.shape === 'cone' ? 'cone' : 'point'}"` +
      ` data-ps-cone="${num(p.coneAngle, 0.4)}" data-ps-speed="${num(p.speed, 320)}" data-ps-stagger="${num(p.stagger, 36)}"` +
      ` data-ps-life="${num(p.lifetime, 1.6)}" data-ps-grav="${num(p.gravity, 0)}" data-ps-drag="${drag}"` +
      ` data-ps-loop="${loop ? '1' : '0'}" data-ps-trail-seg="${seg}" data-ps-trail-fade="${p.trail ? num(p.trail.fade, 0) : 0}"${flyAttr}`;
    // overflow:visible——飞向目标的粒子须能飞出本容器盒（区别缺省雨/爆的 hidden）。
    return `<div id="${esc(id)}"${attrs} style="position:relative;overflow:visible;pointer-events:none;${ls}">${pieces.join('')}</div>`;
  }

  const iter = loop ? 'infinite' : '1';
  const fill = loop ? 'both' : 'forwards';
  const pieces: string[] = [];
  for (let i = 0; i < count; i++) {
    // 确定式伪随机（index 派生·同输入同输出·可测·非裸 Math.random）：几个互质数取模摊开。
    const px = (i * 61) % 100;             // 起始横位 %
    const drift = ((i * 37) % 60) - 30;    // 横漂 px
    const delay = (i * 53) % 1400;         // 延迟 ms
    const dur = 1600 + ((i * 29) % 1400);  // 时长 ms
    const rot = 360 + ((i * 47) % 540);    // 自转
    const sz = p.size !== undefined ? particleSize(i, p.size) : 6 + (i % 4) * 2; // 片大小（REQ-UIFX：size 分档·缺省原派生）
    const col = solid ?? PARTICLE_COLORS[i % PARTICLE_COLORS.length]!;
    if (kind === 'sparkle') {
      const py = (i * 43) % 100;
      const c = solid ?? t.gold;
      pieces.push(`<span style="position:absolute;left:${px}%;top:${py}%;width:${sz}px;height:${sz}px;border-radius:50%;background:${grad ?? c};box-shadow:0 0 6px ${c};animation:apollo-p-twinkle ${dur}ms ease-in-out ${delay}ms ${iter} ${fill}"></span>`);
    } else if (kind === 'stars') {
      const ang = (i / count) * 6.283;
      const dist = 40 + ((i * 31) % 60);
      const dx = Math.round(Math.cos(ang) * dist), dy = Math.round(Math.sin(ang) * dist);
      pieces.push(`<span style="position:absolute;left:50%;top:50%;font-size:${p.size !== undefined ? sz : sz + 8}px;line-height:1;color:${solid ?? t.gold};--dx:${dx}px;--dy:${dy}px;animation:apollo-p-burst ${dur}ms cubic-bezier(.2,.7,.3,1) ${delay}ms ${iter} ${fill}">★</span>`);
    } else {
      // confetti(彩片) / coins(金圆)
      const isCoin = kind === 'coins';
      const coinSz = p.size !== undefined ? sz : sz + 2;
      const coinBg = grad ?? (solid ? `radial-gradient(circle at 35% 30%,#fff,${solid})` : `radial-gradient(circle at 35% 30%,#ffe9a8,${t.gold})`);
      const shape = isCoin
        ? `width:${coinSz}px;height:${coinSz}px;border-radius:50%;background:${coinBg}`
        : `width:${sz}px;height:${p.size !== undefined ? Math.round(sz * 1.35) : sz + 3}px;border-radius:1px;background:${grad ?? col}`;
      pieces.push(`<span style="position:absolute;left:${px}%;top:-8%;${shape};--dx:${drift}px;--rot:${rot}deg;animation:apollo-p-fall ${dur}ms linear ${delay}ms ${iter} ${fill}"></span>`);
    }
  }
  if (p.follow === 'cursor') {
    // 跟随光标态：粒子收成小簇·绝对定位·软径向遮罩(边缘化开·不见方框)·screen 混色(只提亮·不挡字)·
    // 初始隐(opacity:0)——由 server.ts 跟随循环每帧平移 + 显隐(指针在场淡入·离场淡出)。box 固定=不铺满父。
    const box = 132;
    return `<div id="${esc(id)}" data-particle-follow="cursor" style="${ls};position:absolute;left:0;top:0;width:${box}px;height:${box}px;overflow:visible;pointer-events:none;opacity:0;transition:opacity .35s ease;mix-blend-mode:screen;-webkit-mask-image:radial-gradient(circle,#000 26%,transparent 68%);mask-image:radial-gradient(circle,#000 26%,transparent 68%)">${pieces.join('')}</div>`;
  }
  return `<div id="${esc(id)}" style="position:relative;overflow:hidden;pointer-events:none;${ls}">${pieces.join('')}</div>`;
}

// ── LevelPath（关卡地图·蛇形蜿蜒路径 + SVG 连线 + 状态节点）：游戏给节点列表，引擎排蛇形、画连线、渲节点。──
function renderLevelPath(id: string, p: LevelPathProps, ls: string, t: UITheme): string {
  const nodes = p.nodes ?? [];
  const cols = Math.max(1, Math.min(6, num(p.cols, 3)));
  const cellW = 100, cellH = 88, R = 26;
  const rows = Math.max(1, Math.ceil(Math.max(1, nodes.length) / cols));
  const W = cols * cellW, H = rows * cellH;
  const toneColor: Record<string, string> = { jade: t.jade, gold: t.gold, accent: t.jade };
  const lit = toneColor[p.tone ?? 'gold'] ?? t.gold;
  // 蛇形坐标（偶数行 L→R·奇数行 R→L）。
  const pts = nodes.map((_, i) => {
    const row = Math.floor(i / cols), inRow = i % cols;
    const col = row % 2 === 0 ? inRow : cols - 1 - inRow;
    return { x: col * cellW + cellW / 2, y: row * cellH + cellH / 2 };
  });
  const litUpto = (() => { const c = nodes.findIndex((n) => n.state === 'current'); return c >= 0 ? c : nodes.filter((n) => n.state === 'done').length; })();
  const lines = pts.slice(0, -1).map((a, i) => {
    const b = pts[i + 1]!; const on = i < litUpto;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${on ? lit : t.line}" stroke-width="${on ? 6 : 4}" stroke-linecap="round"${on ? '' : ' stroke-dasharray="2 9"'}/>`;
  }).join('');
  const svg = `<svg width="${W}" height="${H}" style="position:absolute;inset:0;pointer-events:none">${lines}</svg>`;
  const marks = nodes.map((n, i) => {
    const pt = pts[i]!; const state = n.state ?? 'locked';
    const label = n.label ?? String(i + 1);
    const act = n.action ? ` data-ui-id="${esc(id)}" data-action="${esc(n.action)}"${n.actionArg ? ` data-arg="${esc(n.actionArg)}"` : ''}` : '';
    const cursor = n.action ? 'cursor:pointer;' : '';
    let bg = t.bg1, fg = t.dim, bd = t.line, inner = '🔒', extra = '';
    if (state === 'done') { bg = lit; fg = t.bg0; bd = lit; inner = esc(label); }
    else if (state === 'current') { bg = t.bg2; fg = lit; bd = lit; inner = esc(label); extra = `box-shadow:0 0 0 4px ${t.jadeWash};animation:apollo-pulse 1.6s ease-in-out infinite`; }
    const stars = (state === 'done' && n.stars) ? `<div style="position:absolute;top:-15px;left:0;right:0;text-align:center;font-size:11px;color:${t.gold};white-space:nowrap;pointer-events:none">${'★'.repeat(Math.min(3, n.stars))}${'☆'.repeat(3 - Math.min(3, n.stars))}</div>` : '';
    return `<div${act} style="position:absolute;left:${pt.x - R}px;top:${pt.y - R}px;width:${R * 2}px;height:${R * 2}px;border-radius:50%;background:${bg};color:${fg};border:3px solid ${bd};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;font-family:${t.fontUi};${extra};${cursor}">${stars}${inner}</div>`;
  }).join('');
  return `<div id="${esc(id)}" style="position:relative;width:${W}px;height:${H}px;${ls}">${svg}${marks}</div>`;
}

// ── Float / Connector（锚定层·REQ-UI-锚定①·render-only）：渲染出带锚数据的容器/SVG，mountUI 每帧读目标 rect 定位。──
function renderFloat(id: string, p: FloatProps, children: LayoutNode[], ls: string, t: UITheme): string {
  const a = p.anchorTo ?? { kind: 'node', id: '' };
  const data = `data-float-kind="${a.kind === 'entity' ? 'entity' : 'node'}" data-float-id="${esc(a.id)}" data-float-at="${esc(a.at ?? 'center')}" data-float-ox="${num(a.offset?.x, 0)}" data-float-oy="${num(a.offset?.y, 0)}"${p.ttlTicks !== undefined ? ` data-float-ttl="${num(p.ttlTicks)}"` : ''}`;
  const inner = children.map((c) => renderNode(c, t)).join('');
  // 初始移出屏 + 隐藏（定位前不闪）；mountUI 每帧摆到锚点、目标消失自隐。fixed=按视口 rect 定位（跟随滚动）。
  return `<div id="${esc(id)}" ${data} style="position:fixed;left:0;top:0;z-index:60;opacity:0;transform:translate(-9999px,-9999px);${ls}">${inner}</div>`;
}
// ── 剧情 / VN 三件（REQ-DIALOGUE M1·闭集纯数据·house 主题取色·消费 t3-dialogue 投影 + 华丽货架）──────
// 台词框：说话人色标 + 台词（复用 Label 打字机/emoji/字体）+ 推进态。可推进节点=整框可点发 advanceAction。
// 华丽货架（华丽起手）：skin=画框皮 9-slice · shape=异形轮廓 · edge=阵营/金描边——全是既有闭集令牌，非新写美术。
function renderDialog(id: string, p: DialogProps, ls: string, t: UITheme): string {
  const speaker = p.speaker
    ? `<div style="font-size:13px;font-weight:700;letter-spacing:.4px;color:${t.gold};font-family:${t.fontSerif ?? t.fontUi};margin-bottom:6px">${escT(p.speaker, t)}</div>`
    : '';
  // 台词正文借 Label 渲（打字机/emoji/字体一体·DRY）——构 inner Label 节点交 renderNode（同 Versus 借 PlayingCard）。
  const body = renderNode(
    { type: 'Label', id: `${id}-tx`, props: { text: p.text ?? '', size: 'md', color: 'text', ...(p.typewriter ? { typewriter: p.typewriter } : {}) } },
    t,
  );
  // 推进提示：line/check 可推进 → 整框可点 + ▶；choice 节点推进交给 choiceList → 不显、不发信号。
  const canAdvance = p.kind !== 'choice';
  const advAction = p.advanceAction ?? 'dialogue.advance';
  const hint = canAdvance ? `<div style="position:absolute;right:13px;bottom:9px;color:${t.dim};font-size:13px;line-height:1">▶</div>` : '';
  const action = canAdvance ? ` data-ui-id="${esc(id)}" data-action="${esc(advAction)}"` : '';
  const cursor = canAdvance ? 'cursor:pointer;' : '';
  const emo = p.emotion ? ` data-emotion="${esc(p.emotion)}"` : '';
  // 货架框：skin=画框皮（cover/9-slice·art 即框·压过底/边框）；否则实底 + edge 描边（金框/阵营框·缺省细线）。
  const border = p.edge ? edgeColor(t, p.edge) : t.line;
  const frame = p.skin ? panelSkinCss(p.skin, p.skinSlice) : `background:${t.bg1};border:1px solid ${border};`;
  return `<div id="${esc(id)}"${action}${emo} style="position:relative;${frame}border-radius:12px;padding:14px 16px;font-family:${t.fontUi};${cursor}${ls}${shapeCss(p.shape)}">${speaker}${body}${hint}</div>`;
}

// 选项列表：选项行渲成**真 Button 节点**（复用 renderButton）→ 白拿 house buttonSkins 糖果厚唇皮 + kind（hero 金 CTA）
// + shape 异形 + fx:sheen-hover 悬停流光 + icon 槽。可选性门控=Button.disabled（灰显不可点·不发信号）。让数据作者从按钮货架挑体量。
function renderChoiceList(id: string, p: ChoiceListProps, ls: string, t: UITheme): string {
  const chooseAction = p.chooseAction ?? 'dialogue.choose';
  const kind = p.optionKind ?? 'primary'; // 缺省 primary→吃 house 糖果皮（非朴素默认·华丽起手铁律）
  const rows = (p.options ?? []).map((o, i) => {
    const available = o.available !== false;
    const btn: LayoutNode = {
      type: 'Button', id: `${id}-o${i}`,
      props: {
        label: o.label, kind,
        ...(available ? { action: chooseAction, actionArg: o.actionArg ?? String(i) } : { disabled: true }),
        ...(o.icon ? { icon: o.icon } : {}),
        ...(p.optionShape ? { shape: p.optionShape } : {}),
      },
      ...(p.hoverSheen && available ? { layout: { fx: [{ kind: 'sheen-hover' as const }] } } : {}),
    };
    return renderNode(btn, t); // renderNode 套 fx/shape/press3d 等 layout 装饰
  }).join('');
  // align-items:stretch → flex 项撑满列宽（选项按钮一列铺满·糖果厚唇钮堆叠）。
  return `<div id="${esc(id)}" style="display:flex;flex-direction:column;gap:9px;align-items:stretch;${ls}">${rows}</div>`;
}

// 立绘槽：art 图（cover·顶部对齐存脸）或名首字/剧场面具占位（绝不空白）。emotion 透出 data-emotion（M2 表选变体）。
// 华丽货架：shape=异形立绘框 · edge=金/阵营描边 · glow=当前说话人高亮外发光（突出正在说话一方）。
function renderPortrait(id: string, p: PortraitProps, ls: string, t: UITheme): string {
  const emo = p.emotion ? ` data-emotion="${esc(p.emotion)}"` : '';
  const inner = p.art
    ? `<img src="${esc(p.art)}" alt="${esc(p.name ?? '')}" style="width:100%;height:100%;object-fit:cover;object-position:top center">`
    : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:linear-gradient(160deg,${t.bg2},${t.bg0});color:${t.dim};font-size:46px;font-family:${t.fontSerif ?? t.fontUi}">${p.name ? escT(p.name.slice(0, 1), t) : '🎭'}</div>`;
  const align = p.side === 'right' ? 'right' : 'left';
  // 名条=**全不透明**深底名牌（白字压深底·两皮皆可读；不透明底 ui-audit 才量得对比·半透/渐变会被跳过误判）。
  const nameTag = p.name
    ? `<div style="position:absolute;left:0;right:0;bottom:0;padding:6px 11px;background:#1c150d;color:#fff;font-size:13px;font-weight:700;font-family:${t.fontUi};text-align:${align}">${escT(p.name, t)}</div>`
    : '';
  const border = p.edge ? edgeColor(t, p.edge) : t.line;
  // 说话人高亮外发光（金圈 + 柔光·突出正在说话一方）。⚠ clip-path 会裁掉 box-shadow → 异形框不叠 glow（改用 edge 高亮）。
  const glow = (p.glow && !p.shape) ? `box-shadow:0 0 0 2px ${t.gold},0 0 20px rgba(212,160,60,.5);` : '';
  return `<div id="${esc(id)}"${emo} style="position:relative;overflow:hidden;min-width:72px;min-height:96px;border:2px solid ${border};border-radius:14px;background:${t.bg1};${glow}${ls}${shapeCss(p.shape)}">${inner}${nameTag}</div>`;
}

function renderConnector(id: string, p: ConnectorProps, t: UITheme): string {
  const toneColor: Record<string, string> = { jade: t.jade, gold: t.gold, ok: t.ok, warn: t.warn, danger: t.danger };
  const col = toneColor[p.tone ?? 'jade'] ?? t.jade;
  const arrow = p.style === 'arrow';
  const dash = p.style === 'dashed' ? ' stroke-dasharray="7 7"' : '';
  const anc = (r: AnchorRef | undefined, pfx: string) => {
    const rr = r ?? { kind: 'node' as const, id: '' };
    return `data-conn-${pfx}-kind="${rr.kind === 'entity' ? 'entity' : 'node'}" data-conn-${pfx}-id="${esc(rr.id)}" data-conn-${pfx}-at="${esc(rr.at ?? 'center')}"`;
  };
  const mk = arrow ? `<defs><marker id="${esc(id)}-ah" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="${col}"/></marker></defs>` : '';
  const lbl = p.label ? `<text data-conn-label fill="${col}" font-size="12" font-weight="700" font-family="${t.fontUi}" text-anchor="middle" style="paint-order:stroke;stroke:${t.bg0};stroke-width:3px">${esc(p.label)}</text>` : '';
  return `<svg id="${esc(id)}" data-conn ${anc(p.from, 'from')} ${anc(p.to, 'to')} style="position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:59;opacity:0;overflow:visible">${mk}<line stroke="${col}" stroke-width="3" stroke-linecap="round"${dash}${arrow ? ` marker-end="url(#${esc(id)}-ah)"` : ''}/>${lbl}</svg>`;
}

export function renderNode(node: LayoutNode, theme: UITheme = SHELL): string {
  const html = renderDispatch(node, theme);
  const c = node.layout;
  const fxData = c?.fx?.length ? fxToCss(c.fx, theme).dataFx : ''; // sheen/flash 等叠层 token
  if (c && (c.draggable || c.dropZone || c.anchor || c.allowOverlap || c.sheen || c.tilt3d || c.press3d || c.flyTo || fxData)) {
    const a: string[] = [];
    if (c.draggable) a.push(`draggable="true" data-drag="${esc(node.id)}"`);
    if (c.dropZone)  a.push(`data-drop="${esc(c.dropZone)}"`);
    if (c.anchor)    a.push(`data-anchor="${esc(c.anchor)}"`); // 新手引导 spotlight 锚点（OnboardingOverlay 定位）
    if (c.allowOverlap) a.push('data-allow-overlap'); // 意图叠层（扇形手牌/牌堆）→ ui-audit 重叠豁免（A-007）
    if (c.sheen)     a.push('data-sheen'); // 流光层（CSS 注入 ::after·apollo-sheen-sweep）
    if (c.tilt3d)    a.push('data-tilt3d'); // 交互 3D 倾斜（悬停立体抬起·CSS 注入 :hover 变换）
    if (c.press3d)   a.push('data-press3d'); // 按压 3D 反馈（按下沉 Z + 底唇·CSS 注入 :active·触屏可用）
    if (c.flyTo)     a.push(`data-flyto-to="${esc(c.flyTo.to)}" data-flyto-ms="${num(c.flyTo.ms, 700)}" data-flyto-arc="${num(c.flyTo.arc, 60)}" data-flyto-delay="${num(c.flyTo.delay, 0)}"`); // 飞向目标（mountUI 量 rect 算位移·弧线飞）
    if (fxData)      a.push(`data-fx="${esc(fxData)}"`); // 特效叠层（sheen/flash → ::after/::before）
    return html.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1 ${a.join(' ')}`);
  }
  return html;
}

function renderDispatch(node: LayoutNode, theme: UITheme = SHELL): string {
  const t = theme;
  const ls = layoutStyle(node.layout, t);
  switch (node.type) {
    case 'Button':     return renderButton(node.id, node.props as ButtonProps, ls, t);
    case 'Label':      return renderLabel(node.id, node.props as LabelProps, ls, t);
    case 'Dropdown':   return renderDropdown(node.id, node.props as DropdownProps, ls, t);
    case 'Badge':      return renderBadge(node.id, node.props as BadgeProps, ls, t);
    case 'Input':      return renderInput(node.id, node.props as InputProps, ls, t);
    case 'Divider':    return renderDivider(node.id, ls, t);
    case 'Panel':      return renderPanel(node.id, node.props as PanelProps, node.layout, node.children ?? [], t);
    case 'Checkbox':   return renderCheckbox(node.id, node.props as CheckboxProps, ls, t);
    case 'Toggle':     return renderToggle(node.id, node.props as ToggleProps, ls, t);
    case 'RadioGroup': return renderRadioGroup(node.id, node.props as RadioGroupProps, ls, t);
    case 'Image':      return renderImage(node.id, node.props as ImageProps, ls);
    case 'Screen':     return renderScreen(node.id, node.props as ScreenProps, node.children ?? [], t);
    case 'Slider':     return renderSlider(node.id, node.props as SliderProps, ls, t);
    case 'Table':      return renderTable(node.id, node.props as TableProps, ls, t);
    case 'Tabs':       return renderTabs(node.id, node.props as TabsProps, node.children ?? [], ls, t);
    case 'ProgressBar':return renderProgressBar(node.id, node.props as ProgressBarProps, ls, t);
    case 'Tag':        return renderTag(node.id, node.props as TagProps, ls, t);
    case 'Modal':      return renderModal(node.id, node.props as ModalProps, node.children ?? [], ls, t);
    case 'Toast':      return renderToast(node.id, node.props as ToastProps, ls, t);
    case 'Tooltip':    return renderTooltip(node.id, node.props as TooltipProps, node.children ?? [], ls, t);
    case 'Card':       return renderCard(node.id, node.props as CardProps, node.children ?? [], ls, t);
    case 'PlayingCard':return renderPlayingCard(node.id, node.props as PlayingCardProps, ls, t);
    case 'CoinFlip':   return renderCoinFlip(node.id, node.props as CoinFlipProps, ls, t);
    case 'Versus':     return renderVersus(node.id, node.props as VersusProps, ls, t);
    case 'Stepper':    return renderStepper(node.id, node.props as StepperProps, ls, t);
    case 'Segmented':  return renderSegmented(node.id, node.props as SegmentedProps, ls, t);
    case 'Avatar':     return renderAvatar(node.id, node.props as AvatarProps, ls, t);
    case 'Accordion':  return renderAccordion(node.id, node.props as AccordionProps, node.children ?? [], ls, t);
    case 'Rating':     return renderRating(node.id, node.props as RatingProps, ls, t);
    case 'Combobox':   return renderCombobox(node.id, node.props as ComboboxProps, ls, t);
    case 'Drawer':     return renderDrawer(node.id, node.props as DrawerProps, node.children ?? [], ls, t);
    case 'VirtualList':return renderVirtualList(node.id, node.props as VirtualListProps, ls, t);
    case 'ContextMenu':return renderContextMenu(node.id, node.props as ContextMenuProps, node.children ?? [], ls, t);
    case 'Video':      return renderVideo(node.id, node.props as VideoProps, ls, t);
    case 'Particles':  return renderParticles(node.id, node.props as ParticlesProps, ls, t);
    case 'LevelPath':  return renderLevelPath(node.id, node.props as LevelPathProps, ls, t);
    case 'Float':      return renderFloat(node.id, node.props as FloatProps, node.children ?? [], ls, t);
    case 'Connector':  return renderConnector(node.id, node.props as ConnectorProps, t);
    case 'dialog':     return renderDialog(node.id, node.props as DialogProps, ls, t);
    case 'choiceList': return renderChoiceList(node.id, node.props as ChoiceListProps, ls, t);
    case 'portrait':   return renderPortrait(node.id, node.props as PortraitProps, ls, t);
    default:           return `<!-- unknown: ${String((node as LayoutNode).type)} -->`;
  }
}
