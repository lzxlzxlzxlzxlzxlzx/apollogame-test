// UI Server — mountUI()：将 LayoutNode 树挂载到 DOM，分发事件到 handlers。
//
// 事件模型：HTML 用 data-action / data-arg 标记交互点；
// server 在根节点监听冒泡，按 action key 路由到 handlers。
// 游戏层只提供 LayoutNode（数据）+ HandlerMap（回调），无需写 DOM 代码。

import { renderNode, renderVListWindow, formatNumber, particleSimSpec } from './render.js';
import { ART_FONT_CSS } from './art-fonts.js';
import { ART_FONT_CJK_CSS } from './art-fonts-cjk.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode, HandlerMap, ActionSink, UITheme, UICursor, ToastProps, VirtualListProps, WebFont } from './types.js';

// ── 主题指针（REQ-STYLESET M0.6·render-only）：把 UITheme.cursor 令牌转成 CSS 光标 + 按下态 scoped 规则 ──
/** 纯函数（可单测·无 DOM）：算 base 光标 CSS 值、按下态 CSS 值（有 press 才有）、去重键（按图内容哈希）。 */
export function cursorCss(c: UICursor): { value: string; pressValue?: string; key: string } {
  const val = (img: string, x = 0, y = 0): string => `url("${img}") ${Math.round(x)} ${Math.round(y)}, auto`;
  const value = val(c.image, c.x, c.y);
  const pressValue = c.press ? val(c.press.image, c.press.x, c.press.y) : undefined;
  // djb2 → base36（确定性·无 Math.random）：同一对图 → 同一 style id/class（多主题/多挂载去重）。
  const src = c.image + '|' + (c.press?.image ?? '');
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return { value, pressValue, key: (h >>> 0).toString(36) };
}

/** 把主题指针落到 mountUI 根：base 光标设 host.style.cursor（面板/文字继承·按钮等自带 pointer 保留）；
 *  按下态注入一条全局 scoped 规则（`.cls:active` / `.cls *:active` → press 光标·!important 压过继承）。缺省无 = 复位系统箭头。 */
function applyThemeCursor(host: HTMLElement, c?: UICursor): void {
  if (!c) { host.style.removeProperty('cursor'); return; } // 缺省/换到无指针主题 → 复位（老主题零变化）
  const { value, pressValue, key } = cursorCss(c);
  host.style.cursor = value;
  if (!pressValue) return;
  const cls = `apollo-cur-${key}`;
  const id = `apollo-cursor-${key}`;
  const d = host.ownerDocument ?? (typeof document !== 'undefined' ? document : undefined);
  if (d && !d.getElementById(id)) {
    const st = d.createElement('style');
    st.id = id;
    st.textContent = `.${cls}:active,.${cls} *:active{cursor:${pressValue}!important}`;
    (d.head ?? d.documentElement).appendChild(st);
  }
  host.classList.add(cls);
}

/** mountUI 句柄：调用即 teardown（向后兼容）；`.update(newTree, theme?)` 做局部更新（最小 diff）。 */
export type MountHandle = (() => void) & { update: (root: LayoutNode, theme?: UITheme) => void };

// 背景滚动关键帧名全局序号（多 mount 不撞名）。
let __bgScrollSeq = 0;

// 按 id 在 LayoutNode 树里找节点（VirtualList 滚动重渲要从 root 取行数据）。
function findNode(node: LayoutNode, id: string): LayoutNode | undefined {
  if (node.id === id) return node;
  for (const ch of node.children ?? []) { const f = findNode(ch, id); if (f) return f; }
  return undefined;
}

// ── 局部更新（diff/patch）核心 ───────────────────────────────────
// 标准 UI 做法：不整树重挂，按 id 最小化打补丁——只替换「自身或子集真变了」的最浅子树，
// 其余 DOM 原样保留（Tab 切页态/滚动位/焦点/native 输入态天然不丢；避免整树 innerHTML 替换
// 在合成滚动容器上的陈旧重绘故障）。每个节点都渲染成带 id 的元素，故可按 id 定位与递归。

function uiEscId(id: string): string { return id.replace(/(["\\])/g, '\\$1'); }
function uiFindById(scope: ParentNode, id: string): HTMLElement | null {
  return scope.querySelector<HTMLElement>(`[id="${uiEscId(id)}"]`);
}
/** 节点「自身」是否未变（类型 + props + layout 相等；不看 children）。 */
function uiOwnSame(a: LayoutNode, b: LayoutNode): boolean {
  return a.type === b.type
    && JSON.stringify(a.props) === JSON.stringify(b.props)
    && JSON.stringify(a.layout ?? null) === JSON.stringify(b.layout ?? null);
}
/** 子节点的「键序」（id + type）是否一致（增删/换位/换型 → 不一致）。 */
function uiChildKeysSame(a: LayoutNode, b: LayoutNode): boolean {
  const ak = a.children ?? [], bk = b.children ?? [];
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) if (ak[i]!.id !== bk[i]!.id || ak[i]!.type !== bk[i]!.type) return false;
  return true;
}
/**
 * 焦点保护：若将被销毁重建的子树里含当前焦点的输入元素（Input/Combobox 的 <input>），
 * 用「就地覆写 value/属性」替代 outerHTML 重建——保住焦点/光标/IME 组合态。返回是否已就地处理。
 */
function patchFocusedInput(el: HTMLElement, newN: LayoutNode): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  if (!active || !(el === active || el.contains(active))) return false;
  if (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA' && active.tagName !== 'SELECT') return false;
  // 仅同步可控值，不动焦点元素本身的结构。
  const p = newN.props as { value?: string | number; placeholder?: string };
  if (newN.type === 'Input' && el === active) {
    const inp = el as HTMLInputElement;
    if (p.value !== undefined && inp.value !== String(p.value)) inp.value = String(p.value);
    if (p.placeholder !== undefined) inp.placeholder = String(p.placeholder);
    return true;
  }
  // REQ-UI-BUG-Toggle视觉点击不更新：焦点落在 checkbox/radio（Toggle/Checkbox/Radio 的隐藏输入）→ 非文本控件·
  // 无光标/IME 要保 → 放行 outerHTML 重建（否则控件 styled 视觉停在旧 checked·逻辑对视觉死）。点击交互已完成、隐藏框丢焦点无害。
  if (active.tagName === 'INPUT') {
    const at = (active as HTMLInputElement).type;
    if (at === 'checkbox' || at === 'radio') return false;
  }
  // 文本类（text/search/number/Combobox 内部 input）：焦点在内部 input → 保守跳过本帧重建（保光标/IME）。
  return true;
}

/** 把 newN 最小化打补丁到 scope 内 id=newN.id 的元素上（与 oldN 比较）。 */
function reconcileNode(scope: ParentNode, oldN: LayoutNode, newN: LayoutNode, theme: UITheme): void {
  const el = uiFindById(scope, newN.id);
  if (!el) return; // 上层未变才会递进到此；找不到则跳过（安全）
  if (!uiOwnSame(oldN, newN)) {
    // 节点**自身** props/layout 变了 → 整体替换这棵最浅子树（含焦点保护）。
    if (patchFocusedInput(el, newN)) return;
    el.outerHTML = renderNode(newN, theme);
    return;
  }
  if (uiChildKeysSame(oldN, newN)) {
    const ak = oldN.children ?? [], bk = newN.children ?? [];
    for (let i = 0; i < ak.length; i++) reconcileNode(el, ak[i]!, bk[i]!, theme); // 自身同 + 子键序同 → 逐子递归
    return;
  }
  // 自身同、但子节点**增删/换位/换型** → **按 id 键控**增删/移位/递归（不整体 outerHTML 重建·保住稳定子节点的 DOM
  //   不被销毁重载——修「动态列表（手牌/牌河/副露）每次变化整块图片重载闪屏」·owner 2026-07-23 报·事件走 host 委托故插删安全）。
  if (patchFocusedInput(el, newN)) return; // 焦点在文本输入内 → 保守跳过本帧结构变更（保光标/IME）
  reconcileChildrenKeyed(el, oldN, newN, theme);
}

/** 按 id 键控增删/移位/递归子节点（父自身未变时用·免整体重建的图片重载闪屏）。 */
function reconcileChildrenKeyed(el: HTMLElement, oldN: LayoutNode, newN: LayoutNode, theme: UITheme): void {
  const oldKids = oldN.children ?? [], newKids = newN.children ?? [];
  const oldById = new Map<string, LayoutNode>();
  for (const k of oldKids) oldById.set(k.id, k);
  const newIds = new Set<string>(newKids.map((k) => k.id));
  const doc = el.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  // ① 删：旧有、新无的直接子（按 id）。
  for (const child of Array.from(el.children)) {
    const cid = (child as HTMLElement).id;
    if (cid && oldById.has(cid) && !newIds.has(cid)) child.remove();
  }
  // 语义内容锚（REQ-UICONTRACT②·修脆锚点）：Panel chrome（vignette/pattern/title）是**无 id 装饰直子**，渲在内容前；
  // 内容 LayoutNode 直子恒带 id。首个内容子的插入锚 = 第一个**带 id 的直子**（跳过前导 chrome），
  // 而非 `el.firstElementChild`（那会把内容插到 title/暗角之前 → 标题错位·结构一变就错）。
  const firstContentAnchor = (): Element | null => {
    let c = el.firstElementChild;
    while (c && !(c as HTMLElement).id) c = c.nextElementSibling; // 跳过前导无 id chrome
    return c;
  };
  // ② 按新序逐个就位：同型→递归打补丁；缺/换型→渲染新建；再 insertBefore 到 prev 之后（稳定子不重载）。
  let prev: Element | null = null;
  for (const nk of newKids) {
    const oldK = oldById.get(nk.id);
    let dom: Element | null = uiFindById(el, nk.id);
    if (dom && oldK && oldK.type === nk.type) {
      reconcileNode(el, oldK, nk, theme);
      dom = uiFindById(el, nk.id) ?? dom;
    } else {
      if (dom) dom.remove(); // 换型：旧的先删
      const tmp = doc.createElement('div');
      tmp.innerHTML = renderNode(nk, theme);
      dom = tmp.firstElementChild;
    }
    if (dom) {
      const anchor: Element | null = prev ? prev.nextElementSibling : firstContentAnchor();
      if (dom !== anchor) el.insertBefore(dom, anchor);
      prev = dom;
    }
  }
}

/**
 * 挂载静态 UI：渲染 LayoutNode 树到 host，绑定事件，返回清理函数。
 *
 * @param host     - 挂载目标容器
 * @param root     - LayoutNode 树（纯数据，弱模型填写）
 * @param handlers - action key → 回调函数（引擎或游戏层提供）
 * @returns        - teardown()：移除 DOM + 解绑事件
 */
// 动画关键帧预设（引擎内建·一次注入 document·LayoutConstraints.anim 引用）。
const APOLLO_KEYFRAMES = `
@keyframes apollo-fadeIn{from{opacity:0}to{opacity:1}}
@keyframes apollo-slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes apollo-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes apollo-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
@keyframes apollo-dealIn{from{opacity:0;transform:translateY(-20px) rotate(-8deg)}to{opacity:1;transform:translateY(0) rotate(0)}}
@keyframes apollo-flyIn{from{opacity:0;transform:translate(var(--anim-dx,-24px),var(--anim-dy,0px))}to{opacity:1;transform:translate(0,0)}}
@keyframes apollo-coin-heads{0%{transform:rotateX(60deg)}100%{transform:rotateX(1800deg)}}
@keyframes apollo-coin-tails{0%{transform:rotateX(60deg)}100%{transform:rotateX(1980deg)}}
@keyframes apollo-spark{0%{transform:scale(.4);opacity:0}40%{transform:scale(1.25);opacity:1}100%{transform:scale(1);opacity:.9}}
@keyframes apollo-clash{0%,100%{transform:translateX(0)}30%{transform:translateX(-5px)}60%{transform:translateX(5px)}}
@keyframes apollo-sheen{0%{left:-60%}60%,100%{left:140%}}
@keyframes apollo-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes apollo-glow{0%,100%{box-shadow:0 0 22px rgba(232,205,130,.5)}50%{box-shadow:0 0 50px rgba(232,205,130,.95)}}
@keyframes apollo-pulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes apollo-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes apollo-fadeOut{from{opacity:1}to{opacity:0}}
@keyframes apollo-popOut{0%{transform:scale(1);opacity:1}100%{transform:scale(.55);opacity:0}}
@keyframes apollo-floatUp{0%{opacity:0;transform:translateY(6px)}20%{opacity:1}100%{opacity:0;transform:translateY(-26px)}}
@keyframes apollo-p-fall{0%{transform:translate(0,0) rotate(0);opacity:0}8%{opacity:1}100%{transform:translate(var(--dx,0),260px) rotate(var(--rot,540deg));opacity:.15}}
@keyframes apollo-p-burst{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}20%{opacity:1}100%{transform:translate(calc(-50% + var(--dx,0)),calc(-50% + var(--dy,0))) scale(1);opacity:0}}
@keyframes apollo-p-twinkle{0%,100%{transform:scale(.3);opacity:.2}50%{transform:scale(1);opacity:1}}
@keyframes apollo-liq-wave{0%,100%{transform:translate(-3%,-50%) scaleY(1)}50%{transform:translate(3%,-50%) scaleY(.5)}}
@keyframes apollo-liq-wave2{0%,100%{transform:translate(3%,-50%) scaleY(.62)}50%{transform:translate(-3%,-50%) scaleY(1)}}
@keyframes apollo-liq-slosh{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.6deg)}}
@keyframes apollo-liq-bub{0%{transform:translateY(0);opacity:0}12%{opacity:.8}85%{opacity:.55}100%{transform:translateY(-210px);opacity:0}}
@keyframes apollo-tick{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
[data-flipcard]{perspective:1000px;transition:transform .35s ease}
[data-flipcard]:hover{transform:scale(1.06)}
[data-flipcard] [data-flip-front],[data-flipcard] [data-flip-back]{transition:transform .55s cubic-bezier(.2,.75,.25,1);backface-visibility:hidden;-webkit-backface-visibility:hidden;transform-origin:50% 50%;will-change:transform}
[data-flipcard] [data-flip-front]{transform:rotateY(0deg)}
[data-flipcard] [data-flip-back]{transform:rotateY(180deg)}
[data-flipcard]:hover [data-flip-front]{transform:rotateY(-180deg)}
[data-flipcard]:hover [data-flip-back]{transform:rotateY(0deg)}
[data-flipstate]{perspective:1000px}
[data-flipstate] [data-flip-front],[data-flipstate] [data-flip-back]{transition:transform .5s cubic-bezier(.2,.75,.25,1);backface-visibility:hidden;-webkit-backface-visibility:hidden;transform-origin:50% 50%;will-change:transform}
[data-flipstate] [data-flip-front]{transform:rotateY(0deg)}
[data-flipstate] [data-flip-back]{transform:rotateY(180deg)}
[data-flipstate][data-flipped="true"] [data-flip-front]{transform:rotateY(-180deg)}
[data-flipstate][data-flipped="true"] [data-flip-back]{transform:rotateY(0deg)}
@keyframes apollo-sheen-sweep{0%{background-position:220% 0}100%{background-position:-60% 0}}
[data-sheen]{position:relative}
[data-sheen]::after,[data-fx~="sheen"]::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.4) 50%,transparent 58%);background-size:250% 100%;animation:apollo-sheen-sweep 3.2s ease-in-out infinite}
[data-fx~="sheen-hover"]{position:relative}
[data-fx~="sheen-hover"]::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.5) 50%,transparent 58%);background-size:250% 100%;background-position:220% 0}
[data-fx~="sheen-hover"]:hover::after{animation:apollo-sheen-sweep .7s ease-out}
@keyframes apollo-holo{0%{background-position:0% 50%}100%{background-position:220% 50%}}
[data-fx~="holo"]::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(115deg,transparent 18%,rgba(255,80,180,.42),rgba(150,90,255,.42),rgba(80,200,255,.42),rgba(120,255,170,.42),transparent 82%);background-size:220% 100%;mix-blend-mode:screen;animation:apollo-holo 3s linear infinite}
@keyframes apollo-ripple{0%{width:0;height:0;opacity:.5}100%{width:230%;height:230%;opacity:0}}
[data-fx~="ripple"]{position:relative;overflow:hidden}
[data-fx~="ripple"]::after{content:'';position:absolute;left:50%;top:50%;width:0;height:0;border-radius:50%;background:rgba(255,255,255,.5);transform:translate(-50%,-50%);pointer-events:none;opacity:0}
[data-fx~="ripple"]:active::after{animation:apollo-ripple .5s ease-out}
@keyframes apollo-marquee{from{transform:translateX(100%)}to{transform:translateX(-100%)}}
@keyframes apollo-flyto{0%{transform:translate(0,0) scale(1);opacity:1}50%{transform:translate(calc(var(--fly-dx,0px) * .5),calc(var(--fly-dy,0px) * .5 - var(--fly-arc,60px))) scale(.9)}100%{transform:translate(var(--fly-dx,0px),var(--fly-dy,0px)) scale(.4);opacity:.1}}
@keyframes apollo-fx-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(calc(-1 * var(--fx-amp,4px)))}60%{transform:translateX(var(--fx-amp,4px))}}
@keyframes apollo-fx-wobble{0%,100%{transform:rotate(calc(-1 * var(--fx-wob,8deg))) scale(1)}50%{transform:rotate(var(--fx-wob,8deg)) scale(1.06)}}
@keyframes apollo-fx-flash{0%{opacity:0}25%{opacity:.7}100%{opacity:0}}
@keyframes apollo-fx-fade{from{opacity:1}to{opacity:0}}
[data-fx~="flash"]::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:var(--fx-flash,#d3897a);mix-blend-mode:screen;animation:apollo-fx-flash var(--fx-flash-ms,420ms) ease-out both}
[data-apollo-btn]{outline:none;transition:transform .07s ease,filter .12s ease,box-shadow .12s ease}
[data-apollo-btn]:not([disabled]):focus-visible{outline:3px solid var(--apollo-focus-ring);outline-offset:-3px}
[data-apollo-btn]:not([disabled]):hover{filter:brightness(1.07)}
[data-apollo-btn]:not([disabled]):active{transform:translateY(1px);filter:brightness(.9)}
[data-apollo-skin]:not([disabled]):hover{filter:brightness(1.08)}
[data-apollo-skin]:not([disabled]):active{transform:translateY(2px);filter:brightness(.85)}
[data-tilt3d]{transition:transform .18s cubic-bezier(.2,.7,.3,1);transform-style:preserve-3d}
[data-tilt3d]:hover{transform:perspective(800px) rotateX(7deg) rotateY(-9deg) translateZ(16px)}
[data-press3d]{transition:transform .09s ease,box-shadow .09s ease;box-shadow:0 6px 0 rgba(0,0,0,.32)}
[data-press3d]:active{transform:translateY(5px);box-shadow:0 1px 0 rgba(0,0,0,.32)}`;
/**
 * 幂等注入引擎 UI 关键帧 + fx 叠层 CSS（anim 预设 / sheen·flash 的 ::after·::before / flipcard）。
 * mountUI 自动调；**renderNode-only 屏（如 game-g 战斗屏走 innerHTML·非 mountUI）须自己调一次**，
 * 否则 fx/anim 的 @keyframes 与 [data-fx]::after 规则不存在 → 静默失效（REQ-UI-fx控件叠层②·不再隐式依赖 mountUI 跑过）。
 * id 守卫幂等（多次调用只注入一次）。doc 缺省全局 document（SSR/无 DOM 环境安全跳过）。
 */
export function ensureUiKeyframes(doc?: Document): void {
  const d = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!d) return;
  if (d.getElementById('apollo-ui-keyframes')) return;
  const st = d.createElement('style');
  st.id = 'apollo-ui-keyframes';
  st.textContent = APOLLO_KEYFRAMES;
  (d.head ?? d.documentElement).appendChild(st);
}

/**
 * 幂等注入主题声明的 Web 字体 @font-face（REQ-UI-web字体加载·数据化）。`mountUI` 自动调（传 `theme.webfonts`）；
 * **renderNode-only 屏（走 innerHTML·非 mountUI）须自己调一次**，否则主题字体栈里引用的 web 字体不加载、静默回退系统字体。
 * 单个全局 `<style id="apollo-webfonts">`，按 family/weight/style **去重**（多次调用 / 多主题共存只注入一次同一面）。
 * `url` 应为打包后的本地 woff2（离线可用·不依赖 Google Fonts CDN）。doc 缺省全局 document（无 DOM 环境安全跳过）。
 */
export function ensureWebfonts(fonts?: readonly WebFont[], doc?: Document): void {
  if (!fonts || fonts.length === 0) return;
  const d = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!d) return;
  let st = d.getElementById('apollo-webfonts') as HTMLStyleElement | null;
  if (!st) {
    st = d.createElement('style');
    st.id = 'apollo-webfonts';
    (d.head ?? d.documentElement).appendChild(st);
  }
  const have = new Set(st.dataset['faces'] ? st.dataset['faces']!.split('|') : []);
  let css = st.textContent ?? '';
  for (const f of fonts) {
    const weight = f.weight ?? '400';
    const style = f.style ?? 'normal';
    const key = `${f.family}/${weight}/${style}`;
    if (have.has(key)) continue; // 已注入同一面 → 跳过（去重）
    have.add(key);
    css += `@font-face{font-family:'${f.family}';font-style:${style};font-weight:${weight};font-display:swap;src:url(${f.url}) format('woff2')}`;
  }
  st.textContent = css;
  st.dataset['faces'] = [...have].join('|');
}

/** 注入内嵌艺术字体 @font-face（base64·一次）：Label.font 的艺术字槽（impact/epic/fantasy/…）与 pixel(Press Start 2P) 自此真渲染。
 *  区别于 ensureWebfonts（主题声明的 URL 字体）：本件是引擎自带的策展艺术字库（11 款·base64 内嵌·零依赖）。id 守卫幂等。 */
export function ensureArtFonts(doc?: Document): void {
  const d = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!d) return;
  if (d.getElementById('apollo-art-fonts')) return;
  const st = d.createElement('style');
  st.id = 'apollo-art-fonts';
  // 拉丁 18 款=base64 内嵌（小·常驻）+ CJK 中/日=url() 引用（大·浏览器按需惰性下载·只在真渲染该字族时拉）。
  st.textContent = ART_FONT_CSS + ART_FONT_CJK_CSS;
  (d.head ?? d.documentElement).appendChild(st);
}

export function mountUI(
  host: HTMLElement,
  root: LayoutNode,
  handlers: HandlerMap = {},
  theme: UITheme = SHELL,
  input?: ActionSink, // 传它 → 无本地 handler 的 action 走信号入队（UI 只发信号·逻辑入 sim 能力层·人/AI 共用动作总线）
): MountHandle {
  ensureUiKeyframes();
  ensureWebfonts(theme.webfonts);
  ensureArtFonts();
  host.innerHTML = renderNode(root, theme);
  applyThemeCursor(host, theme.cursor); // 主题指针（缺省无=零变化·触屏不受影响）

  // 当前已挂载的树与主题（update 做最小 diff 的基线·VirtualList 复绑取数据）。
  let curRoot = root;
  let curTheme = theme;

  // ── 数据驱动动效初始化（render-only·**可重入**·REQ-UICONTRACT③）────────────────────────────────
  // 把带 data-* 动效标记的元素初始化：typewriter 逐字 / tween 数字滚动 / flyto 弧线飞 / bgscroll 背景滚动。
  // 每元素处理后打 `data-dyn-init` 标记、选择器 `:not([data-dyn-init])` 只初始化一次（幂等）。
  // **mount 扫全 host；update 后再扫一次** → reconcile 换/插进来的**新元素**（含首屏后由数据新增/改值的动效）也被初始化
  //   → 修「扫描只在 mount 跑一次·首屏之后由数据新增的动效全是死的（写了没反应·最像引擎坏了）」。
  //   （props 变的元素 reconcile 走 outerHTML 整体替换=全新无标记 DOM → 自然重扫重播；未变元素留标记 → 不重复触发。）
  const typers: ReturnType<typeof setInterval>[] = [];
  const scrollStyles: HTMLStyleElement[] = [];
  const hasDoc = typeof document !== 'undefined';
  function initDynamics(scope: ParentNode): void {
    // 打字机（收编 VN DialogBox 逐字显）：逐字揭示；teardown 清定时器。
    scope.querySelectorAll<HTMLElement>('[data-typewriter]:not([data-dyn-init])').forEach((el) => {
      el.dataset['dynInit'] = '1';
      const speed = Number(el.dataset['typewriter']) || 30;
      const full = el.textContent ?? '';
      el.textContent = '';
      let i = 0;
      const iv = setInterval(() => { el.textContent = full.slice(0, ++i); if (i >= full.length) clearInterval(iv); }, speed);
      typers.push(iv);
    });
    // 数字滚动补间（掷骰滚到命点/计分跳动·render-only·easeOutCubic·共用 typers 数组 teardown 一并清）。
    scope.querySelectorAll<HTMLElement>('[data-tween-to]:not([data-dyn-init])').forEach((el) => {
      const to = Number(el.dataset['tweenTo']);
      if (!Number.isFinite(to)) return;
      el.dataset['dynInit'] = '1';
      const ms = Number(el.dataset['tweenMs']) || 600;
      const dec = Number(el.dataset['tweenDec']) || 0;
      const fmt = el.dataset['tweenFmt']; // 数字格式化（compact/time/percent/int·formatNumber）
      // format 在场时 textContent 已是格式化串（不可解析）→ 从 data-tween-from 取原始初值。
      const from = fmt !== undefined ? (Number(el.dataset['tweenFrom']) || 0) : (Number(el.textContent) || 0);
      // tween 期间字号缩放（REQ-UIFX ⑤·data-tween-scale=起始倍率·随进度回到 1·render 已置 inline-block+初始 scale）。
      const s0raw = el.dataset['tweenScale'] !== undefined ? Number(el.dataset['tweenScale']) : undefined;
      const s0 = s0raw !== undefined && Number.isFinite(s0raw) ? s0raw : undefined;
      const steps = Math.max(1, Math.round(ms / 16));
      let i = 0;
      const iv = setInterval(() => {
        i++;
        const k = i >= steps ? 1 : 1 - Math.pow(1 - i / steps, 3); // easeOutCubic
        const v = from + (to - from) * k;
        el.textContent = fmt !== undefined ? formatNumber(v, fmt, dec) : v.toFixed(dec);
        if (s0 !== undefined) el.style.transform = `scale(${(s0 + (1 - s0) * k).toFixed(3)})`;
        if (i >= steps) clearInterval(iv);
      }, 16);
      typers.push(iv);
    });
    // 「飞向」奖励动画（render-only·休闲招牌）：量本元素与目标 rect → 算屏幕位移 → 注入 CSS 变量 + apollo-flyto 弧线飞。
    // 目标须在同一 host 树里。teardown 无需清（animation forwards 停末态·元素随下次 update 换掉）。
    if (hasDoc) scope.querySelectorAll<HTMLElement>('[data-flyto-to]:not([data-dyn-init])').forEach((el) => {
      const targetId = el.dataset['flytoTo']; if (!targetId) return;
      const target = host.querySelector<HTMLElement>(`[id="${CSS.escape(targetId)}"]`); if (!target) return;
      el.dataset['dynInit'] = '1';
      const ms = Number(el.dataset['flytoMs']) || 700;
      const arc = Number(el.dataset['flytoArc']) || 60;
      const delay = Number(el.dataset['flytoDelay']) || 0;
      const a = el.getBoundingClientRect(), b = target.getBoundingClientRect();
      const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
      const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
      el.style.setProperty('--fly-dx', `${Math.round(dx)}px`);
      el.style.setProperty('--fly-dy', `${Math.round(dy)}px`);
      el.style.setProperty('--fly-arc', `${arc}px`);
      el.style.animation = `apollo-flyto ${ms}ms cubic-bezier(.45,0,.5,1) ${delay}ms forwards`;
    });
    // 背景 UV 滚动（render-only）：逐元素注入平移 background-position 关键帧·无限循环。配 repeating 贴图即无缝滚动底纹。
    if (hasDoc) scope.querySelectorAll<HTMLElement>('[data-bgscroll]:not([data-dyn-init])').forEach((el) => {
      el.dataset['dynInit'] = '1';
      const [x, y, ms] = (el.dataset['bgscroll'] ?? '0,0,6000').split(',').map(Number);
      const name = `apollo-bgs-${__bgScrollSeq++}`;
      const st = document.createElement('style');
      st.textContent = `@keyframes ${name}{from{background-position:0 0}to{background-position:${x || 0}px ${y || 0}px}}`;
      (document.head ?? document.documentElement).appendChild(st);
      el.style.animation = `${name} ${ms || 6000}ms linear infinite`;
      scrollStyles.push(st);
    });
  }
  initDynamics(host);

  // 锚定浮层/连线（REQ-UI-锚定层①·render-only·不进 sim/hash）：每帧读目标 live rect → 把 Float 摆到锚点、Connector 连两端。
  //   目标消失/隐藏(rect 0)→自隐（不悬空）。entity=渲染器盖 `data-entity-anchor` 的实体节点·node=同树 LayoutNode id。
  //   每帧重查（稳健于 update() 重渲）；teardown 取消 rAF。happy-dom 无布局→rect 0 全隐（测试查渲染标记即可）。
  let anchorRaf = 0;
  const ensureAnchorLoop = (): void => {
    if (anchorRaf) return; // 已在跑（幂等·可被 mount + 每次 update 调）
    if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
    if (!host.querySelector('[data-float-id],[data-conn]')) return; // 无锚定件·不起循环（省帧）
    const esc1 = (s: string) => (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&');
    const find = (kind?: string, id?: string): Element | null => !id ? null
      : kind === 'entity' ? document.querySelector(`[data-entity-anchor="${esc1(id)}"]`)
        : (host.querySelector(`#${esc1(id)}`) ?? document.getElementById(id));
    const pt = (r: DOMRect, at?: string): [number, number] => {
      if (at === 'top') return [r.left + r.width / 2, r.top];
      if (at === 'bottom') return [r.left + r.width / 2, r.bottom];
      if (at === 'left') return [r.left, r.top + r.height / 2];
      if (at === 'right') return [r.right, r.top + r.height / 2];
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    const dead = (r: DOMRect) => r.width === 0 && r.height === 0; // display:none/未布局 → 隐藏浮层
    const step = () => {
      const floats = host.querySelectorAll<HTMLElement>('[data-float-id]');
      const conns = host.querySelectorAll<SVGElement>('[data-conn]');
      if (!floats.length && !conns.length) { anchorRaf = 0; return; } // 锚定件已不在树里→停（下次 update 再启）
      floats.forEach((el) => {
        const ttlRaw = el.dataset['floatTtl'];
        if (ttlRaw !== undefined) { const life = Number(ttlRaw); if (life <= 0) { el.style.opacity = '0'; return; } el.dataset['floatTtl'] = String(life - 1); }
        const target = find(el.dataset['floatKind'], el.dataset['floatId']);
        if (!target) { el.style.opacity = '0'; return; }
        const r = target.getBoundingClientRect();
        if (dead(r)) { el.style.opacity = '0'; return; }
        const [x, y] = pt(r, el.dataset['floatAt']);
        const ox = Number(el.dataset['floatOx']) || 0, oy = Number(el.dataset['floatOy']) || 0;
        el.style.transform = `translate(${Math.round(x + ox)}px,${Math.round(y + oy)}px) translate(-50%,-50%)`;
        el.style.opacity = '1';
      });
      conns.forEach((svg) => {
        const ds = (svg as unknown as HTMLElement).dataset;
        const a = find(ds['connFromKind'], ds['connFromId']);
        const b = find(ds['connToKind'], ds['connToId']);
        const line = svg.querySelector('line');
        if (!a || !b || !line) { (svg as unknown as HTMLElement).style.opacity = '0'; return; }
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        if (dead(ra) || dead(rb)) { (svg as unknown as HTMLElement).style.opacity = '0'; return; }
        (svg as unknown as HTMLElement).style.opacity = '1';
        const [x1, y1] = pt(ra, ds['connFromAt']);
        const [x2, y2] = pt(rb, ds['connToAt']);
        line.setAttribute('x1', String(x1)); line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(x2)); line.setAttribute('y2', String(y2));
        const label = svg.querySelector('[data-conn-label]');
        if (label) { label.setAttribute('x', String((x1 + x2) / 2)); label.setAttribute('y', String((y1 + y2) / 2 - 6)); }
      });
      anchorRaf = requestAnimationFrame(step);
    };
    anchorRaf = requestAnimationFrame(step);
  };
  ensureAnchorLoop();

  // 光标微尘（Particles follow:'cursor'·render-only·下沉自 game-b「GameD 粒子追随·较弱」owner 2026-07-22）：
  //   每帧把带 data-particle-follow 的粒子簇 **JS 缓动**逼近指针（同 anchor 循环/相机 pivot 的 cur+=(t-cur)*k·
  //   非 CSS 动画）→ 平移其 transform；指针在场淡入、离场淡出。坐标按元素 offsetParent 反算（信箱缩放自适应·
  //   稳健于嵌套）。每帧重查（稳健于 update 重渲）·无跟随件不起循环（省帧）·teardown 撤监听 + 停 rAF。
  let followRaf = 0;
  let followPtr: { x: number; y: number } | null = null; // 指针 client 坐标·null=离场
  const followPos = new WeakMap<Element, { x: number; y: number }>(); // 元素 → 当前缓动位（offsetParent 局部·未缩放 px）
  const onFollowMove = (e: PointerEvent | MouseEvent): void => { followPtr = { x: e.clientX, y: e.clientY }; };
  const onFollowLeave = (): void => { followPtr = null; };
  const ensureParticleFollowLoop = (): void => {
    if (followRaf) return; // 已在跑（幂等·mount + 每次 update 可调）
    if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
    if (!host.querySelector('[data-particle-follow]')) return; // 无跟随件·不起循环
    const step = (): void => {
      const nodes = host.querySelectorAll<HTMLElement>('[data-particle-follow]');
      if (!nodes.length) { followRaf = 0; return; } // 跟随件全撤 → 停循环（再挂由 ensure 重启）
      nodes.forEach((el) => {
        const op = (el.offsetParent as HTMLElement | null) ?? host;
        const r = op.getBoundingClientRect();
        const k = op.offsetWidth ? r.width / op.offsetWidth : 1; // 信箱缩放系数（无布局→1·测试环境安全）
        const w = el.offsetWidth || 0, h = el.offsetHeight || 0;
        if (followPtr && k && Number.isFinite(k)) {
          const tx = (followPtr.x - r.left) / k, ty = (followPtr.y - r.top) / k;
          let p = followPos.get(el);
          if (!p) { p = { x: tx, y: ty }; followPos.set(el, p); } // 首现直接落位·免从 0,0 飞入
          else { p.x += (tx - p.x) * 0.18; p.y += (ty - p.y) * 0.18; } // JS 缓动（柔性跟随·非吸附）
          el.style.transform = `translate(${(p.x - w / 2).toFixed(1)}px,${(p.y - h / 2).toFixed(1)}px)`;
          el.style.opacity = '1';
        } else {
          el.style.opacity = '0'; // 指针离场 → 淡出（下次移动再现）
        }
      });
      followRaf = requestAnimationFrame(step);
    };
    followRaf = requestAnimationFrame(step);
  };
  if (typeof document !== 'undefined') {
    host.addEventListener('pointermove', onFollowMove);
    host.addEventListener('pointerleave', onFollowLeave);
  }
  ensureParticleFollowLoop();

  // ── 物理弹道粒子（REQ-UIFX·render-only·不进 sim/hash·对位 Vfx3D 的 UI 层胶水）─────────────────
  //   Particles 带 shape/gravity/drag/flyTo/trail → 渲成 data-particle-sim 容器；此处 rAF 积分
  //   「初速(锥/四散·index 确定式 particleSimSpec) + 重力 + 阻尼 + (flyTo)渐强弹簧引向目标锚」——
  //   对位 Vfx3D 的 shape/coneAngle/speed/gravity/drag/attractor 与 Trail3D 的位置历史拖尾。
  //   目标寻址复用 AnchorRef 的 node/entity 两路（同 anchor 循环）；到达即回收（loop 重生 / 一次性标 data-ps-done）。
  //   每帧重查容器（稳健于 update 重渲）·无件不起循环（省帧）·teardown 停 rAF。happy-dom 无布局也安全（原点 0,0）。
  interface PsPart { el: HTMLElement; trail: HTMLElement[]; x: number; y: number; vx: number; vy: number;
    born: number; spawned: boolean; dead: boolean; hist: number[] }
  let psRaf = 0;
  let psLast = 0;
  const psState = new WeakMap<HTMLElement, { parts: PsPart[]; t0: number }>();
  const psTick = (el: HTMLElement, now: number, dt: number): void => {
    let st = psState.get(el);
    if (!st) {
      const parts = Array.from(el.querySelectorAll<HTMLElement>('[data-pp]')).map((m): PsPart => ({
        el: m,
        trail: Array.from(el.querySelectorAll<HTMLElement>(`[data-pt="${m.dataset['pp']}"]`)),
        x: 0, y: 0, vx: 0, vy: 0, born: 0, spawned: false, dead: false, hist: [],
      }));
      st = { parts, t0: now };
      psState.set(el, st);
    }
    const ds = el.dataset;
    if (ds['psDone']) return; // 一次性播毕
    const shape = ds['psShape'] === 'cone' ? 'cone' as const : 'point' as const;
    const cone = Number(ds['psCone']) || 0.4;
    const speed = Number(ds['psSpeed']) || 320;
    const stagger = Number(ds['psStagger']) || 0;
    const grav = Number(ds['psGrav']) || 0;
    const drag = Number(ds['psDrag']) || 0;
    const life = Number(ds['psLife']) || 1.6;
    const loop = ds['psLoop'] !== '0';
    const segs = Number(ds['psTrailSeg']) || 0;
    const fade = Number(ds['psTrailFade']) || 0;
    // 发射原点=容器中心；目标锚点换算到容器局部坐标（含信箱缩放校正·同 follow 循环）。
    const r = el.getBoundingClientRect();
    const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const ox = (el.offsetWidth || 0) / 2, oy = (el.offsetHeight || 0) / 2;
    let tx: number | undefined, ty: number | undefined;
    const flyId = ds['psFlyId'];
    if (flyId) {
      const esc1 = (s: string) => (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&');
      const target = ds['psFlyKind'] === 'entity'
        ? document.querySelector(`[data-entity-anchor="${esc1(flyId)}"]`)
        : (host.querySelector(`#${esc1(flyId)}`) ?? document.getElementById(flyId));
      if (target) {
        const tr = target.getBoundingClientRect();
        if (tr.width || tr.height) {
          const at = ds['psFlyAt'];
          let cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2;
          if (at === 'top') cy = tr.top; else if (at === 'bottom') cy = tr.bottom;
          else if (at === 'left') cx = tr.left; else if (at === 'right') cx = tr.right;
          tx = (cx - r.left) / (k || 1) + (Number(ds['psFlyOx']) || 0);
          ty = (cy - r.top) / (k || 1) + (Number(ds['psFlyOy']) || 0);
        }
      }
    }
    const tsec = (now - st.t0) / 1000;
    let anyAlive = false;
    st.parts.forEach((pt, i) => {
      if (pt.dead) return;
      const spec = particleSimSpec(i, { shape, coneAngle: cone, speed, stagger });
      if (!pt.spawned) {
        if (tsec < spec.delay / 1000) { anyAlive = true; return; } // 未到错峰点
        pt.spawned = true; pt.born = tsec; pt.hist = [];
        pt.x = ox; pt.y = oy;
        pt.vx = Math.cos(spec.angle) * spec.speed; pt.vy = Math.sin(spec.angle) * spec.speed;
      }
      const age = tsec - pt.born;
      pt.vy += grav * dt;
      if (tx !== undefined && ty !== undefined) {
        const kk = 26 * Math.min(1, age / 0.3); // 弹簧渐强（先窜后引·配 drag=阻尼弹簧缓入缓出）
        pt.vx += (tx - pt.x) * kk * dt; pt.vy += (ty - pt.y) * kk * dt;
      }
      if (drag) { const f = Math.max(0, 1 - drag * dt); pt.vx *= f; pt.vy *= f; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      const spd = Math.hypot(pt.vx, pt.vy);
      const arrived = tx !== undefined && ty !== undefined && age > 0.12
        && Math.hypot(tx - pt.x, ty - pt.y) < Math.max(18, spd * dt * 1.5);
      if (arrived || age > life) {
        pt.el.style.opacity = '0';
        pt.trail.forEach((tl) => { tl.style.opacity = '0'; });
        if (loop) { pt.spawned = false; anyAlive = true; } else pt.dead = true;
        return;
      }
      anyAlive = true;
      pt.el.style.transform = `translate(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px) translate(-50%,-50%)`;
      pt.el.style.opacity = '1';
      if (segs > 0) {
        // 位置历史采样（位移 ≥3px 才落点·对位 Trail3D minDist·静止不堆点）；hist=[x,y,…] 旧→新。
        const n = pt.hist.length;
        if (!n || Math.hypot(pt.x - pt.hist[n - 2]!, pt.y - pt.hist[n - 1]!) >= 3) {
          pt.hist.push(pt.x, pt.y);
          while (pt.hist.length > (segs + 1) * 2) pt.hist.splice(0, 2);
        }
        pt.trail.forEach((tl, j) => {
          const idx = pt.hist.length - 4 - j * 2; // 头点之后·从新到旧
          if (idx < 0) { tl.style.opacity = '0'; return; }
          const q = (j + 1) / (segs + 1); // 0→头·1→尾
          tl.style.transform = `translate(${pt.hist[idx]!.toFixed(1)}px,${pt.hist[idx + 1]!.toFixed(1)}px) translate(-50%,-50%) scale(${(1 - 0.65 * q).toFixed(2)})`;
          tl.style.opacity = (0.75 * ((1 - q) + q * fade)).toFixed(2); // 头 .75 → 尾 .75*fade（对位 Trail3D fade）
        });
      }
    });
    if (!anyAlive && !loop) el.dataset['psDone'] = '1'; // 一次性播毕（此后本容器零开销）
  };
  const ensureParticleSimLoop = (): void => {
    if (psRaf) return; // 已在跑（幂等·mount + 每次 update 可调）
    if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
    if (!host.querySelector('[data-particle-sim]')) return; // 无物理粒子件·不起循环（省帧）
    psLast = 0;
    const step = (now: number): void => {
      const boxes = host.querySelectorAll<HTMLElement>('[data-particle-sim]');
      if (!boxes.length) { psRaf = 0; return; } // 件全撤 → 停（再挂由 ensure 重启）
      const dt = psLast ? Math.min((now - psLast) / 1000, 0.05) : 0.016;
      psLast = now;
      boxes.forEach((el) => psTick(el, now, dt));
      psRaf = requestAnimationFrame(step);
    };
    psRaf = requestAnimationFrame(step);
  };
  ensureParticleSimLoop();
  // 背景 UV 滚动已并入 initDynamics（上·data-bgscroll·teardown 移除注入的 scrollStyles）。

  const dispatch = (e: Event): void => {
    const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!el) return;
    const action = el.dataset['action'];
    if (!action) return;

    // 本次动作的参数：change 取控件值（select / checkbox / 文本 input），其余取 data-arg。
    let arg: string | undefined;
    if (e.type === 'change') {
      if (el.tagName === 'SELECT') arg = (el as HTMLSelectElement).value;
      else if (el.tagName === 'INPUT') {
        const inp = el as HTMLInputElement;
        arg = inp.type === 'checkbox' ? String(inp.checked) : inp.value;
      } else return; // change 只认 select/input
    } else {
      // REQ-UI-BUG-Slider回调偶发undefined（根因）：dispatch 同时绑 click + change。值控件（Slider range / Toggle /
      // Checkbox / Dropdown 的 input/select）的 action **只应在 change 取值派发**；click 也冒泡到这里会按 data-arg 派发——
      // range 无 data-arg → 透传 undefined → Number(undefined)=NaN 击穿后处理 shader（game-z AO 黑屏源）。故值控件的非 change 事件不派发。
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
      arg = el.dataset['arg'];
    }

    // 路由：本地 handler 优先（迁移期旧屏不破）；无 handler + 有 sink → 发信号入队（UI 只发信号·逻辑在 sim 能力层）。
    const fn = handlers[action];
    if (fn) { fn(arg); return; }
    input?.enqueueAction(action, { arg });
  };

  // Tabs 切页（抗闪屏·引擎内建·下沉自 game-g 大厅 setTab）：点 [data-tab] → 就地 toggle 页 display + nav 高亮，
  // **不重建页内容**（解决"切页重建大网格/跳滚动"一类 bug 一次·所有游戏受益）。嵌套 Tabs 按 closest 归属隔离。
  const switchTab = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
    if (!btn) return;
    const tabsRoot = btn.closest('[data-tabs]') as HTMLElement | null;
    if (!tabsRoot) return;
    const id = btn.dataset['tab'];
    if (!id) return;
    tabsRoot.querySelectorAll<HTMLElement>('[data-tabpage]').forEach((pg) => {
      if (pg.closest('[data-tabs]') !== tabsRoot) return; // 跳过嵌套 Tabs 的页
      pg.style.display = pg.dataset['tabpage'] === id ? 'block' : 'none';
    });
    tabsRoot.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
      if (b.closest('[data-tabs]') !== tabsRoot) return;
      const on = b.dataset['tab'] === id;
      b.style.color = on ? theme.gold : theme.sub;
      b.style.borderBottomColor = on ? theme.gold : 'transparent';
    });
  };

  // Modal 遮罩点击关闭（引擎内建）：仅当点击**落在遮罩本身**（非弹窗体内部）时触发 closeAction。
  // 弹窗体的 × 按钮走 data-action（上面 dispatch 处理）；此处只管点背景关闭。
  const modalClose = (e: Event): void => {
    const scrim = (e.target as HTMLElement).closest('[data-modal-close]') as HTMLElement | null;
    if (!scrim || e.target !== scrim) return; // 点的是弹窗体内部 → 不关
    const action = scrim.dataset['modalClose'];
    if (!action) return;
    // 路由同 dispatch（REQ-UICONTRACT①）：本地 handler 优先·无 handler + 有 sink → 发信号入队。
    // 缺这条回退时纯信号游戏（不挂 handler·只挂 ActionSink）点遮罩关不掉 Modal → 玩家卡死弹窗。
    const fn = handlers[action];
    if (fn) { fn(); return; }
    input?.enqueueAction(action);
  };

  // Tooltip 悬浮显隐（引擎内建·内联样式表达不了 :hover）：mouseover/focusin 显气泡、移出隐。
  // 用冒泡的 mouseover/mouseout（mouseenter 不冒泡）；移到同一触发元素内部(child↔气泡)不隐藏。
  const bubbleOf = (trigger: HTMLElement): HTMLElement | null =>
    trigger.querySelector<HTMLElement>(':scope > [data-tooltip-bubble]');
  // 气泡边界感知定位（owner 2026-06-28 bug：首排/最左/最右卡气泡出界被裁/盖住）：
  // 改 position:fixed（逃出 scroll 祖先裁剪）→ 按触发元素 rect + 视口尺寸选方位（首选放不下就翻面）→ 夹进视口。
  const placeBubble = (trigger: HTMLElement, b: HTMLElement): void => {
    b.style.display = 'block';
    b.style.position = 'fixed'; b.style.transform = 'none';
    b.style.right = 'auto'; b.style.bottom = 'auto'; b.style.margin = '0';
    const win = trigger.ownerDocument.defaultView; if (!win) return;
    const tr = trigger.getBoundingClientRect();
    const bw = b.offsetWidth || 240, bh = b.offsetHeight || 60;
    const vw = win.innerWidth, vh = win.innerHeight, M = 8, GAP = 6;
    const place = trigger.getAttribute('data-tip-place') || 'top';
    let top: number, left: number;
    if (place === 'left' || place === 'right') {
      top = tr.top + tr.height / 2 - bh / 2;
      const lpos = tr.left - GAP - bw, rpos = tr.right + GAP;
      left = place === 'left' ? (lpos >= M ? lpos : rpos) : (rpos + bw <= vw - M ? rpos : lpos);
    } else {
      left = tr.left + tr.width / 2 - bw / 2;
      const above = tr.top - GAP - bh, below = tr.bottom + GAP;
      top = place === 'bottom'
        ? (below + bh <= vh - M ? below : (above >= M ? above : below))
        : (above >= M ? above : (below + bh <= vh - M ? below : above));
    }
    left = Math.max(M, Math.min(left, vw - bw - M));
    top = Math.max(M, Math.min(top, vh - bh - M));
    b.style.left = `${left}px`; b.style.top = `${top}px`;
  };
  const tipShow = (e: Event): void => {
    const trigger = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement | null;
    if (!trigger) return;
    const b = bubbleOf(trigger);
    if (b) placeBubble(trigger, b);
  };
  const tipHide = (e: Event): void => {
    const trigger = (e.target as HTMLElement).closest('[data-tooltip]') as HTMLElement | null;
    if (!trigger) return;
    const to = (e as MouseEvent | FocusEvent).relatedTarget as Node | null;
    if (to && trigger.contains(to)) return; // 仍在触发元素内部 → 不隐
    const b = bubbleOf(trigger);
    if (b) b.style.display = 'none';
  };

  // Accordion 折叠切换（引擎内建）：点标题行 → 就地 toggle 折叠体 display + 箭头旋转（不重建·可选 action 信号另由 dispatch 发）。
  const accordionToggle = (e: Event): void => {
    const head = (e.target as HTMLElement).closest('[data-accordion-head]') as HTMLElement | null;
    if (!head) return;
    const root = head.closest('[data-accordion]') as HTMLElement | null;
    if (!root) return;
    const body = root.querySelector<HTMLElement>(':scope > [data-accordion-body]');
    if (!body) return;
    const willOpen = body.style.display === 'none';
    body.style.display = willOpen ? 'block' : 'none';
    const caret = head.querySelector<HTMLElement>('[data-accordion-caret]');
    if (caret) caret.style.transform = `rotate(${willOpen ? 90 : 0}deg)`;
  };

  // Combobox 搜索下拉（引擎内建）：focus 开面板、input 过滤项、点项回填+发 action(arg=value)+合、点外合。
  const comboOpen = (e: Event): void => {
    const input = (e.target as HTMLElement).closest('[data-combo-search]') as HTMLElement | null;
    if (!input) return;
    const panel = input.closest('[data-combo]')?.querySelector<HTMLElement>(':scope > [data-combo-panel]');
    if (panel) panel.style.display = 'block';
  };
  const comboFilter = (e: Event): void => {
    const input = (e.target as HTMLElement).closest('[data-combo-search]') as HTMLInputElement | null;
    if (!input) return;
    const q = input.value.toLowerCase();
    input.closest('[data-combo]')?.querySelectorAll<HTMLElement>('[data-combo-opt]').forEach((opt) => {
      opt.style.display = (opt.dataset['comboLabel'] ?? '').toLowerCase().includes(q) ? 'block' : 'none';
    });
  };
  const comboClick = (e: Event): void => {
    const target = e.target as HTMLElement;
    const opt = target.closest('[data-combo-opt]') as HTMLElement | null;
    if (opt) {
      const root = opt.closest('[data-combo]') as HTMLElement | null;
      const searchBox = root?.querySelector<HTMLInputElement>(':scope > [data-combo-search]'); // 局部搜索框（勿与 ActionSink 参数 input 撞名）
      const panel = root?.querySelector<HTMLElement>(':scope > [data-combo-panel]');
      if (searchBox) searchBox.value = opt.dataset['comboLabel'] ?? '';
      if (panel) panel.style.display = 'none';
      const action = root?.dataset['combo'], val = opt.dataset['comboOpt'];
      // 路由同 dispatch（REQ-UICONTRACT①）：本地 handler 优先·无 handler + 有 sink → 发信号入队（纯信号游戏下拉点得动）。
      if (action && val != null) { const fn = handlers[action]; if (fn) fn(val); else input?.enqueueAction(action, { arg: val }); }
      return;
    }
    host.querySelectorAll<HTMLElement>('[data-combo-panel]').forEach((panel) => { // 点外 → 合
      const root = panel.closest('[data-combo]');
      if (root && !root.contains(target)) panel.style.display = 'none';
    });
  };

  // VirtualList 虚拟滚动（引擎内建）：滚动时只把可视窗口的行渲进 spacer（不一次性渲全部·解决千行级卡顿）。
  // 行数据从 root 树取（mountUI 持 root）；每个列表一个 scroll 监听，teardown 逐个解绑。
  const vlistScrolls: Array<{ el: HTMLElement; fn: (e: Event) => void }> = [];
  const bindVlists = (): void => {
    // 幂等：局部更新后剔除已脱离 DOM 的旧监听，再给新出现的 vlist 绑定（读 curRoot/curTheme）。
    for (let i = vlistScrolls.length - 1; i >= 0; i--) {
      if (!host.contains(vlistScrolls[i]!.el)) {
        vlistScrolls[i]!.el.removeEventListener('scroll', vlistScrolls[i]!.fn);
        vlistScrolls.splice(i, 1);
      }
    }
    host.querySelectorAll<HTMLElement>('[data-vlist]').forEach((el) => {
      if (vlistScrolls.some((v) => v.el === el)) return; // 已绑过
      const node = findNode(curRoot, el.dataset['vlist'] ?? '');
      const spacer = el.querySelector<HTMLElement>(':scope > [data-vlist-spacer]');
      if (!node || !spacer) return;
      const p = node.props as VirtualListProps;
      const fn = (): void => { spacer.innerHTML = renderVListWindow(p, el.scrollTop, curTheme); };
      el.addEventListener('scroll', fn);
      vlistScrolls.push({ el, fn });
    });
  };
  bindVlists();

  // ContextMenu 右键菜单（引擎内建）：右键在光标处弹菜单；任意点击合（项的 action 由 dispatch 发）。
  const ctxOpen = (e: Event): void => {
    const trigger = (e.target as HTMLElement).closest('[data-ctxmenu]') as HTMLElement | null;
    if (!trigger) return;
    e.preventDefault();
    host.querySelectorAll<HTMLElement>('[data-ctxmenu-pop]').forEach((pp) => { pp.style.display = 'none'; });
    const pop = trigger.querySelector<HTMLElement>(':scope > [data-ctxmenu-pop]');
    if (!pop) return;
    const me = e as MouseEvent;
    pop.style.left = `${me.clientX}px`;
    pop.style.top = `${me.clientY}px`;
    pop.style.display = 'block';
  };
  const ctxClose = (): void => {
    host.querySelectorAll<HTMLElement>('[data-ctxmenu-pop]').forEach((pp) => { pp.style.display = 'none'; });
  };

  // 拖放（引擎内建·声明式 draggable/dropZone）：dragstart 记下被拖节点 id；
  // 在 [data-drop] 上 dragover 放行、drop 时调 handlers[dropZone信号](被拖节点 id)。HTML5 DnD 一次做完。
  let dragId: string | null = null;
  const onDragStart = (e: Event): void => {
    const el = (e.target as HTMLElement).closest('[data-drag]') as HTMLElement | null;
    if (!el) return;
    dragId = el.dataset['drag'] ?? null;
    const dt = (e as DragEvent).dataTransfer;
    if (dt && dragId != null) dt.setData('text/plain', dragId);
  };
  const onDragOver = (e: Event): void => {
    const zone = (e.target as HTMLElement).closest('[data-drop]') as HTMLElement | null;
    if (zone) e.preventDefault(); // 允许 drop
  };
  const onDrop = (e: Event): void => {
    const zone = (e.target as HTMLElement).closest('[data-drop]') as HTMLElement | null;
    if (!zone) return;
    e.preventDefault();
    const action = zone.dataset['drop'];
    const payload = dragId ?? (e as DragEvent).dataTransfer?.getData('text/plain') ?? '';
    dragId = null;
    if (!action) return;
    const fn = handlers[action];
    if (fn) { fn(payload); return; }                // 本地 handler 优先
    input?.enqueueAction(action, { arg: payload }); // 无 handler + 有 sink → 落点信号 + 被拖 id 作 arg（带参动作走 Signal.arg）
  };

  host.addEventListener('click',       dispatch);
  host.addEventListener('click',       switchTab);
  host.addEventListener('click',       modalClose);
  host.addEventListener('click',       accordionToggle);
  host.addEventListener('click',       comboClick);
  host.addEventListener('click',       ctxClose);
  host.addEventListener('change',      dispatch);
  host.addEventListener('input',       comboFilter);
  host.addEventListener('contextmenu', ctxOpen);
  host.addEventListener('dragstart',   onDragStart);
  host.addEventListener('dragover',    onDragOver);
  host.addEventListener('drop',        onDrop);
  host.addEventListener('mouseover',   tipShow);
  host.addEventListener('mouseout',    tipHide);
  host.addEventListener('focusin',     tipShow);
  host.addEventListener('focusin',     comboOpen);
  host.addEventListener('focusout',    tipHide);

  // 局部更新（标准 UI patch）：把新树最小化打补丁到现有 DOM，不整树重挂。
  // 换皮（theme 变）：颜色烤进渲染串、props 不变 → diff 测不出，整根子树按新主题重渲一次
  // （替换 host 的单个子元素，非 host.innerHTML 全清）；其余情况走按 id 的 reconcile。
  const update = (newRoot: LayoutNode, newTheme?: UITheme): void => {
    const themeChanged = !!(newTheme && newTheme !== curTheme);
    if (themeChanged) { curTheme = newTheme!; applyThemeCursor(host, curTheme.cursor); } // 换皮同步主题指针
    // 整根重挂条件：① 换皮（换主题令牌包·全盘换色）② **换根**（新根 id ≠ 旧根 id·如牌桌 a-play→结算 a-result）。
    // 换根为何不能交给 reconcileNode：它起手 `uiFindById(host, newRoot.id)` 找**新** id → host 里只有**旧**根元素 →
    // 找不到静默 return → 屏一动不动；且 curRoot 已推进 → 之后每次 update 都拿新 id 找不到、永久 no-op（含菜单开合）=
    // 「跨屏死机」根因（REQ-UIRECON·game-a A-012·owner 实证）。子节点换 id 由父的 uiChildKeysSame 兜住，**根无父可兜** → 必须整根替换。
    if (themeChanged || curRoot.id !== newRoot.id) {
      const rootEl = uiFindById(host, curRoot.id); // 按**旧**根 id 找现有元素，整体换成新根渲染
      if (rootEl) rootEl.outerHTML = renderNode(newRoot, curTheme);
      else host.innerHTML = renderNode(newRoot, curTheme);
    } else {
      reconcileNode(host, curRoot, newRoot, curTheme);
    }
    curRoot = newRoot;
    bindVlists(); // 子树可能被替换 → 复绑 vlist 滚动监听
    ensureAnchorLoop(); // update 引入锚定件（Float/Connector）→ 启动跟随 rAF（幂等·game-i 从 hub .update 进模块的路径）
    ensureParticleFollowLoop(); // update 引入 Particles follow:'cursor' → 启动光标微尘 rAF（幂等）
    ensureParticleSimLoop(); // update 引入物理弹道 Particles（REQ-UIFX）→ 启动积分 rAF（幂等）
    initDynamics(host); // REQ-UICONTRACT③：reconcile 换/插进来的新动效元素（typewriter/tween/flyto/bgscroll）也初始化（幂等·标记去重）
  };

  const teardown = (() => {
    host.removeEventListener('click',       dispatch);
    host.removeEventListener('click',       switchTab);
    host.removeEventListener('click',       modalClose);
    host.removeEventListener('click',       accordionToggle);
    host.removeEventListener('click',       comboClick);
    host.removeEventListener('click',       ctxClose);
    host.removeEventListener('change',      dispatch);
    host.removeEventListener('input',       comboFilter);
    host.removeEventListener('contextmenu', ctxOpen);
    host.removeEventListener('dragstart',   onDragStart);
    host.removeEventListener('dragover',    onDragOver);
    host.removeEventListener('drop',        onDrop);
    host.removeEventListener('mouseover',   tipShow);
    host.removeEventListener('mouseout',    tipHide);
    host.removeEventListener('focusin',     tipShow);
    host.removeEventListener('focusin',     comboOpen);
    host.removeEventListener('focusout',    tipHide);
    vlistScrolls.forEach(({ el, fn }) => el.removeEventListener('scroll', fn));
    typers.forEach((iv) => clearInterval(iv));
    scrollStyles.forEach((s) => s.remove()); // 移除背景滚动注入的 keyframe style
    if (anchorRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(anchorRaf); // 停锚定跟随 rAF
    host.removeEventListener('pointermove', onFollowMove); // 停光标微尘监听 + rAF
    host.removeEventListener('pointerleave', onFollowLeave);
    if (followRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(followRaf);
    if (psRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(psRaf); // 停物理弹道 rAF（REQ-UIFX）
    host.innerHTML = '';
  }) as MountHandle;
  teardown.update = update;
  return teardown;
}

/**
 * 飘字提示（非模态·定时自消）—— fire-and-forget 的挂载器 API。
 * 复用 renderNode 出 Toast 药丸标记，挂到 host 底部居中的堆叠容器；duration(ms·缺省 2600) 后移除。
 * 返回手动关闭函数（提前清掉）。游戏层只调 showToast(host, '保存成功', { tone:'ok' })，不写 DOM。
 *
 * @param host - 挂载目标（toast 浮层挂在它内部·fixed 定位）
 * @param text - 提示文本
 * @param opts - tone 着色 / duration 自消毫秒 / theme 主题
 */
export function showToast(
  host: HTMLElement,
  text: string,
  opts: { tone?: ToastProps['tone']; duration?: number; theme?: UITheme } = {},
): () => void {
  const theme = opts.theme ?? SHELL;
  let stack = host.querySelector<HTMLElement>(':scope > [data-toast-stack]');
  if (!stack) {
    stack = document.createElement('div');
    stack.setAttribute('data-toast-stack', '');
    stack.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:300;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
    host.appendChild(stack);
  }
  const holder = document.createElement('div');
  holder.innerHTML = renderNode({ type: 'Toast', id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, props: { text, tone: opts.tone } }, theme);
  const toastEl = holder.firstElementChild as HTMLElement | null;
  if (!toastEl) return () => {};
  stack.appendChild(toastEl);

  let done = false;
  const remove = (): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    toastEl.remove();
    if (stack && stack.childElementCount === 0) stack.remove();
  };
  const timer = setTimeout(remove, opts.duration ?? 2600);
  return remove;
}
