// Game I · 控件画廊（纯 LayoutNode 数据，零渲染逻辑）。
//
// 这就是「玩 UI」的测试场：把引擎现有 15 个控件全部铺开、可交互、可换皮。
// 红线：本文件只产出数据。渲染/事件/换皮由引擎 renderNode + mountUI 解释（见 game-i.ts）。
// 母法：apollo-ui-contract.md（控件契约总表·归档层已删·查 git 历史）。

import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { uiTextureUrl, SKIN_METAL, SKIN_WOOD, SKIN_STONE, SKIN_SCROLL, BTN_BLUE, BTN_GREEN, BTN_RED, BTN_YELLOW, BTN_GREY, BTN_ROUND, BTN_GLOSSY, BTN_GHOST, CARD_JOKER, CARD_FLOWER } from './ui-assets.js';
import { THEME_OPTIONS } from './themes.js';
import { buildShop, INITIAL_SHOP, type ShopState } from './shop.js';
import { buildPickHand, INITIAL_PICK, type PickState } from './pickcards.js';
import { buildInputLab, INITIAL_INPUT, type InputLabState } from './input-lab.js';
import { buildVideoLab, INITIAL_AISHE, type AisheState } from './video-lab.js';
import { buildMmoHud } from './mmo-hud.js';
import { buildCasualHud } from './casual-hud.js';
import { buildDialogueScene } from './dialogue-demo.js';
import { buildItemSlot, buildStatTile } from '@zerocraft/engine/ui/starters/index.js';
import { buildPresenceDemo } from './presence-demo.js';
import { SOUNDS, BGM } from './sounds.js';

// 自定义画选中态的交互控件值（必须进 state·点击改值 + 局部更新才会动）。
export interface ControlsState {
  flag: boolean; sound: boolean; speed: string; view: string; qty: number; rating: number; city: string;
  muted: boolean; reverb: boolean; vol: number; pan: number;
  /** 现场调参台（REQ-DEMO-调参台）：sim 模块的离散可调档（key→选中档·如 'l.sun'→'high'）。空=各参走蓝图缺省档。 */
  tune: Record<string, string>;
}
export const INITIAL_CONTROLS: ControlsState = { flag: true, sound: true, speed: '1', view: 'grid', qty: 3, rating: 3, city: '', muted: false, reverb: false, vol: 70, pan: 0, tune: {} };

/** 一个可现场调节的离散参数（闭集档·Segmented 呈现·选中档编码进 value=`key:档`）。 */
export interface TuneSpec { key: string; label: string; def: string; opts: Array<{ v: string; label: string }>; }
/** 「现场调参台」面板：一排 Segmented，客户点档即改蓝图数据→渲染器实时换画（数据即渲染的活证）。 */
function tuneDeck(id: string, specs: TuneSpec[], c: ControlsState): LayoutNode {
  return {
    type: 'Panel', id: `${id}-tune`, props: { bg: 'jade', title: '🎛 现场调参台 · 改数据即改渲染（无一行代码）' },
    layout: { direction: 'column', gap: 8, padding: 12 },
    children: specs.map((s): LayoutNode => ({
      type: 'Panel', id: `${id}-tr-${s.key}`, props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 10 },
      children: [
        { type: 'Label', id: `${id}-tl-${s.key}`, props: { text: s.label, size: 'sm', color: 'sub' }, layout: { width: 96 } },
        { type: 'Segmented', id: `${id}-ts-${s.key}`, props: {
          value: `${s.key}:${c.tune[s.key] ?? s.def}`,
          options: s.opts.map((o) => ({ value: `${s.key}:${o.v}`, label: o.label })),
          action: 'tune3d',
        } },
      ],
    })),
  };
}

// 自包含演示图：内联 data-URI SVG（纯数据·不依赖外部资源文件），用于 Image 控件展示。
const DEMO_IMG =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22160%22%20height%3D%22100%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%2322d3ee%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%237c3aed%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22160%22%20height%3D%22100%22%20fill%3D%22url(%23g)%22%2F%3E%3Ctext%20x%3D%2280%22%20y%3D%2258%22%20font-size%3D%2222%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-weight%3D%22bold%22%3EZEROCRAFT%3C%2Ftext%3E%3C%2Fsvg%3E';

// ── 段落标题小工具（统一风格：阔字距小标签）──────────────────
// 子效果编号（owner：进模块后每个子效果/控件都要能按号找到，好跟美术说「换哪个」）：
// 每个 sectionTitle 前缀 `#<主编号>-<子序>`（主编号=MODULE_NO·子序=该模块内递增）。稳定顺序 = 显示顺序。
let _secPrefix = '0';
let _secNo = 0;
function beginSections(moduleId: string | null): void { _secPrefix = String((moduleId && MODULE_NO.get(moduleId)) || 0); _secNo = 0; }
/** 当前模块内下一个子编号（`<主>-<子>`）。给非 sectionTitle 的可编号子项（如字体墙每款字）也可取。 */
function nextSubNo(): string { _secNo += 1; return `${_secPrefix}-${_secNo}`; }

function sectionTitle(id: string, text: string): LayoutNode {
  // 编号做成独立高亮前缀 span（金色·好扫），后接原标题。
  // color 用 sub 不用 dim：daylight 亮皮下 dim 段题 ratio 2.89 < 3.0 硬地板（REQ-UIFX 修好空审计后首次实测·全 tab 系统性）。
  const no = nextSubNo();
  return { type: 'Label', id, props: { size: 'xs', color: 'sub', bold: true, spans: [{ text: `#${no}  `, color: 'gold', bold: true }, { text, color: 'sub' }] } };
}
function divider(id: string): LayoutNode {
  return { type: 'Divider', id, props: {} };
}

// 平铺点阵贴图（自包含 SVG data-URI）：用 fill-opacity 而非 rgba()，避开 texLayer 的 ()'" 净化；
// encodeURIComponent 把空格/引号/尖括号全转 %XX → 过得了净化。配 bgTexture/bgScroll 即得「贴图底 + 滚动」。
const DOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="1.6" fill="#9cd2c5" fill-opacity="0.30"/></svg>';
export const TEXTURE_URI = `data:image/svg+xml,${encodeURIComponent(DOT_SVG)}`;
// 带透明色的贴图（不透明金片 + 大片透明间隙）：铺在 bg:'transparent' 面上 → 间隙透见身后（see-through 演示）。
const ALPHA_TILE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"><rect x="5" y="5" width="24" height="24" rx="7" fill="#ffd86b"/></svg>';
const ALPHA_TILE_URI = `data:image/svg+xml,${encodeURIComponent(ALPHA_TILE_SVG)}`;

// 贴图按钮皮 = **登记进本地资产索引的正规资产**（资产手册 §6·owner 2026-07-07「入库」）：按 key 引用 → uiTextureUrl 解析成
// 站点绝对 URL 喂 Button.skin（已解析 URL·同 Image.src 约定）。真相在 public/games/game-i/art/index.json；不再内联 data-URI 硬编码。
const SKIN_METAL_URL = uiTextureUrl(SKIN_METAL);
const SKIN_WOOD_URL = uiTextureUrl(SKIN_WOOD);
const SKIN_STONE_URL = uiTextureUrl(SKIN_STONE);
const SKIN_SCROLL_URL = uiTextureUrl(SKIN_SCROLL);
// vendored 真美术素材（Kenney UI Pack·CC0）
const BTN_BLUE_URL = uiTextureUrl(BTN_BLUE);
const BTN_GREEN_URL = uiTextureUrl(BTN_GREEN);
const BTN_RED_URL = uiTextureUrl(BTN_RED);
const BTN_YELLOW_URL = uiTextureUrl(BTN_YELLOW);
const BTN_GREY_URL = uiTextureUrl(BTN_GREY);
const BTN_ROUND_URL = uiTextureUrl(BTN_ROUND);
const BTN_GLOSSY_URL = uiTextureUrl(BTN_GLOSSY);
const BTN_GHOST_URL = uiTextureUrl(BTN_GHOST);
// 贴图=一张卡的按钮（fluentui 卡牌·MIT）
const CARD_JOKER_URL = uiTextureUrl(CARD_JOKER);
const CARD_FLOWER_URL = uiTextureUrl(CARD_FLOWER);
// vendored 卡通插画（undraw·MIT·内容丰富的彩色卡通场景）
const CARTOON_ASTRO = uiTextureUrl('tex/cartoon-astronaut');
const CARTOON_CAT = uiTextureUrl('tex/cartoon-cat');
const CARTOON_DOG = uiTextureUrl('tex/cartoon-dog');
const CARTOON_CAMP = uiTextureUrl('tex/cartoon-camping');
const CARTOON_GAME = uiTextureUrl('tex/cartoon-gaming');
const CARTOON_MUSIC = uiTextureUrl('tex/cartoon-music');
const CARTOON_BDAY = uiTextureUrl('tex/cartoon-birthday');
const CARTOON_ROBOT = uiTextureUrl('tex/cartoon-robot');
const CARTOON_TRAVEL = uiTextureUrl('tex/cartoon-travel');

// ── 页 1 · 容器与布局 ────────────────────────────────────────
// 函数（非 const）：每次渲染重建，让内部 sectionTitle 参与当次「子编号」计数（与其它 tab 页一致递增）。
function pageLayout(): LayoutNode { return {
  type: 'Panel',
  id: 'page-layout',
  props: { scroll: true },
  layout: { direction: 'column', gap: 18, padding: 20 },
  children: [
    sectionTitle('t-row', 'PANEL · 横向 row'),
    {
      type: 'Panel',
      id: 'demo-row',
      props: {},
      layout: { direction: 'row', gap: 10, padding: 12 },
      children: [
        { type: 'Badge', id: 'r1', props: { text: '弹性 1', tone: 'ok' }, layout: { flex: 1 } },
        { type: 'Badge', id: 'r2', props: { text: '弹性 2', tone: 'warn' }, layout: { flex: 2 } },
        { type: 'Badge', id: 'r3', props: { text: '弹性 1', tone: 'dim' }, layout: { flex: 1 } },
      ],
    },
    divider('d-l1'),
    sectionTitle('t-col', 'PANEL · 纵向 column（带标题容器）'),
    {
      type: 'Panel',
      id: 'demo-col',
      props: { title: '一个有标题的面板' },
      layout: { direction: 'column', gap: 8, padding: 12 },
      children: [
        { type: 'Label', id: 'c1', props: { text: '第一行', color: 'sub' } },
        { type: 'Label', id: 'c2', props: { text: '第二行', color: 'sub' } },
        { type: 'Label', id: 'c3', props: { text: '第三行', color: 'sub' } },
      ],
    },
    divider('d-l2'),
    sectionTitle('t-grid', 'PANEL · 自适应网格 grid（minCol 控列宽·卡牌格/货架）'),
    {
      type: 'Panel',
      id: 'demo-grid',
      props: {},
      layout: { direction: 'grid', minCol: 120, gap: 10, padding: 12 },
      children: Array.from({ length: 8 }, (_, i): LayoutNode => ({
        type: 'Panel',
        id: `cell-${i}`,
        props: { title: `格 ${i + 1}` },
        layout: { direction: 'column', gap: 4, padding: 10, align: 'center' },
        children: [
          { type: 'Badge', id: `cell-b-${i}`, props: { text: `#${i + 1}`, tone: 'dim' } },
        ],
      })),
    },
    divider('d-l3'),
    sectionTitle('t-accordion', 'ACCORDION · 折叠面板（点标题展开/收起·引擎内建 → 信号 toggleAcc）'),
    {
      type: 'Accordion',
      id: 'demo-accordion',
      props: { title: '点我展开这段说明', open: false, action: 'toggleAcc' },
      children: [
        { type: 'Label', id: 'acc-l1', props: { text: '折叠面板用于收纳次要内容，点标题即可展开/收起。', color: 'sub' } },
        { type: 'Label', id: 'acc-l2', props: { text: '开合由引擎 mountUI 内建处理，数据只填 title / open / action。', color: 'dim', size: 'sm' } },
      ],
    },
    divider('d-l-tex'),
    sectionTitle('t-tex', 'PANEL · 贴图底 + UV 滚动（bgTexture / bgScroll）'),
    {
      type: 'Panel',
      id: 'demo-tex',
      props: { title: '平铺点阵贴图底·无缝向上滚动', bgTexture: TEXTURE_URI, bgTextureSize: 26, bgScroll: { y: 26, ms: 2600 } },
      layout: { direction: 'column', gap: 8, padding: 18, height: 150 },
      children: [
        { type: 'Label', id: 'tex-l1', props: { text: '这块面板的底是平铺的点阵贴图，并在 UV 上无缝滚动（看背景的点在动）。', color: 'sub', size: 'sm' } },
        { type: 'Label', id: 'tex-l2', props: { text: '纯数据：props.bgTexture(贴图URL) + bgTextureSize(平铺单元) + bgScroll{y,ms}（滚动周期）。最弱 LLM 能填。', color: 'dim', size: 'xs' } },
      ],
    },
  ],
}; }

// ── 页 2 · 数据展示 ──────────────────────────────────────────
// 11 语义色令牌全档（与 LabelProps.color 闭集对齐·mine/foe=阵营·ink=深墨压金底）。
const labelColors: Array<'text' | 'sub' | 'dim' | 'jade' | 'gold' | 'ok' | 'warn' | 'danger' | 'mine' | 'foe' | 'ink'> =
  ['text', 'sub', 'dim', 'jade', 'gold', 'ok', 'warn', 'danger', 'mine', 'foe', 'ink'];
// 7 具名字号档全档（xs10…xxxl34）；另可填裸 px 任意字号（复刻像素稿用）。
const labelSizes: Array<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl'> = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'xxxl'];

function pageDisplay(): LayoutNode { return {
  type: 'Panel',
  id: 'page-display',
  props: { scroll: true },
  layout: { direction: 'column', gap: 18, padding: 20 },
  children: [
    sectionTitle('t-lbl-size', 'LABEL · 字号（7 具名档 xs10…xxxl34 + 裸 px 任意档）'),
    {
      type: 'Panel',
      id: 'demo-lbl-size',
      props: {},
      layout: { direction: 'row', gap: 14, align: 'end', padding: 10 },
      children: labelSizes.map((s): LayoutNode => ({
        type: 'Label', id: `lbl-size-${s}`, props: { text: s.toUpperCase(), size: s, bold: true },
      })),
    },
    // 裸 px：复刻像素稿/设计稿精确字号时用（具名档保和谐、裸 px 保精确）。
    {
      type: 'Panel', id: 'demo-lbl-px', props: { bare: true },
      layout: { direction: 'row', gap: 16, align: 'end', padding: 10 },
      children: [
        ...[9, 15, 26, 44].map((n): LayoutNode => ({
          type: 'Label', id: `lbl-px-${n}`, props: { text: `${n}px`, size: n, bold: true, color: 'jade' },
        })),
        { type: 'Label', id: 'lbl-px-hint', props: { text: '← size 填数字=裸 px（复刻稿子精确字号）；填令牌=7 具名档（保排版和谐）', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
      ],
    },
    // 用法模式：同一件 Label 在真实屏上的四种典型角色（层级靠字号+色+粗细拉开·别全用一档）。
    { type: 'Label', id: 'lbl-usage-note', props: { text: '典型用法：标题 / 正文 / 副文 / 爆数字——层级靠「字号 + 色 + bold」三者一起拉开', color: 'sub', size: 'sm' } },
    {
      type: 'Panel', id: 'demo-lbl-usage', props: { bg: 'sunken' },
      layout: { direction: 'column', gap: 4, padding: 14, radius: 10 },
      children: [
        { type: 'Label', id: 'lu-title', props: { text: '第 12 关 · 雨夜书斋', size: 'xl', bold: true, color: 'gold' } },
        { type: 'Label', id: 'lu-body', props: { text: '收集三枚印章即可通关。', size: 'md', color: 'text' } },
        { type: 'Label', id: 'lu-sub', props: { text: '提示：印章藏在书架后', size: 'sm', color: 'sub' } },
        { type: 'Label', id: 'lu-dmg', props: { text: '-240', size: 'xxl', bold: true, color: 'danger', stroke: true } },
      ],
    },
    sectionTitle('t-lbl-color', 'LABEL · 11 语义色令牌（换皮自适应）+ {custom} 自由色逃生'),
    {
      type: 'Panel',
      id: 'demo-lbl-color',
      props: {},
      layout: { direction: 'row', gap: 14, padding: 10 },
      children: [
        // ink 不进这一排：它是**深墨**令牌，专给金/浅底上的深色字（压在暗底上必然读不清）——单独演在金底上。
        ...labelColors.filter((c) => c !== 'ink').map((c): LayoutNode => ({
          type: 'Label', id: `lbl-color-${c}`, props: { text: c, color: c, bold: true },
        })),
        { type: 'Label', id: 'lbl-mono', props: { text: 'mono 0123', mono: true, color: 'sub' } },
      ],
    },
    // ink 令牌的正确用法：坐在金/浅底上当深色字（放暗底=自造低对比·ui-audit 会当场抓）。
    {
      type: 'Panel', id: 'demo-lbl-ink', props: { bare: true },
      layout: { direction: 'row', gap: 12, align: 'center', padding: 10 },
      children: [
        {
          type: 'Panel', id: 'lbl-ink-chip', props: { bg: 'gold' },
          layout: { padding: 8, radius: 8, align: 'center' },
          children: [{ type: 'Label', id: 'lbl-color-ink', props: { text: 'ink 深墨字', color: 'ink', bold: true } }],
        },
        { type: 'Label', id: 'lbl-ink-hint', props: { text: '← ink = 金底/浅底上的深色字（如金 CTA 的键面字）。压暗底会读不清——色要配底选，不是随便挑。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
      ],
    },
    // 语义色 = 换皮自适应（换主题自动跟着变）；{custom} = 特别指定才用（花色/稿子精确墨色·仍非裸串）。
    {
      type: 'Panel', id: 'demo-lbl-custom', props: { bare: true },
      layout: { direction: 'row', gap: 18, align: 'center', padding: 10 },
      children: [
        { type: 'Label', id: 'lc-suit', props: { spans: [{ text: '♠13 ', color: { custom: '#8a94a6' } }, { text: '♥13 ', color: { custom: '#d8483f' } }, { text: '♦13 ', color: { custom: '#d3a03a' } }, { text: '♣13', color: { custom: '#3f9a5a' } }], size: 'xl', bold: true } },
        { type: 'Label', id: 'lc-hint', props: { text: '← 四花色=令牌装不下的用色，走 {custom} 逃生（audit 会提示优先迁令牌）', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
      ],
    },
    // 常见语义配对：别自己发明配色，按「状态→令牌」照抄。
    {
      type: 'Panel', id: 'demo-lbl-semantic', props: { bg: 'sunken' },
      layout: { direction: 'row', gap: 18, padding: 14, radius: 10 },
      children: [
        { type: 'Label', id: 'ls-buff', props: { text: '+12 攻击', color: 'ok', bold: true } },
        { type: 'Label', id: 'ls-debuff', props: { text: '-8 防御', color: 'danger', bold: true } },
        { type: 'Label', id: 'ls-coin', props: { text: '1280 金币', color: 'gold', bold: true } },
        { type: 'Label', id: 'ls-lock', props: { text: '未解锁', color: 'dim' } },
        { type: 'Label', id: 'ls-mine', props: { text: '我方', color: 'mine', bold: true } },
        { type: 'Label', id: 'ls-foe', props: { text: '敌方', color: 'foe', bold: true } },
      ],
    },
    divider('d-d1'),
    sectionTitle('t-badge', 'BADGE · 6 语义色 + icon 图标槽（角标/状态/红点/数量）'),
    {
      type: 'Panel',
      id: 'demo-badge',
      props: {},
      layout: { direction: 'row', gap: 10, padding: 10, align: 'center' },
      children: [
        { type: 'Badge', id: 'bdg-ok', props: { text: '在线', tone: 'ok' } },
        { type: 'Badge', id: 'bdg-warn', props: { text: '警示', tone: 'warn' } },
        { type: 'Badge', id: 'bdg-dim', props: { text: '离线', tone: 'dim' } },
        { type: 'Badge', id: 'bdg-accent', props: { text: '新', tone: 'accent' } },
        { type: 'Badge', id: 'bdg-gold', props: { text: '限定', tone: 'gold' } },
        { type: 'Badge', id: 'bdg-danger', props: { text: '危', tone: 'danger' } },
        { type: 'Badge', id: 'bdg-icon', props: { text: '冠军', tone: 'ok', icon: DEMO_IMG } }, // icon 槽（补齐 Tag/Button 一致性·2026-08 查缺补漏）
      ],
    },
    divider('d-d2'),
    sectionTitle('t-image', 'IMAGE · 图片（内联 data-URI · fit 三态 + 圆角 radius）'),
    {
      type: 'Panel',
      id: 'demo-image',
      props: {},
      layout: { direction: 'row', gap: 12, padding: 10 },
      children: [
        { type: 'Image', id: 'img-cover', props: { src: DEMO_IMG, alt: 'cover', fit: 'cover' }, layout: { width: 110, height: 70 } },
        { type: 'Image', id: 'img-contain', props: { src: DEMO_IMG, alt: 'contain', fit: 'contain' }, layout: { width: 110, height: 70 } },
        { type: 'Image', id: 'img-fill', props: { src: DEMO_IMG, alt: 'fill', fit: 'fill' }, layout: { width: 110, height: 70 } },
        { type: 'Image', id: 'img-radius', props: { src: DEMO_IMG, alt: 'radius 12', fit: 'cover', radius: 12 }, layout: { width: 110, height: 70 } },
      ],
    },
    divider('d-d3'),
    sectionTitle('t-progress', 'PROGRESSBAR · 线性条 5 语义色（环形 ring / 液面 liquid 见 🧊 3D UI 页）'),
    {
      type: 'Panel',
      id: 'demo-progress',
      props: {},
      layout: { direction: 'column', gap: 10, padding: 10 },
      children: [
        // ⚠ max 必填对：不给 max 时缺省 max=1，value:72 会被夹成满格（这段旧版就踩过）。
        { type: 'ProgressBar', id: 'pb-accent', props: { value: 72, max: 100, label: '加载进度', showValue: true, tone: 'accent' } },
        { type: 'ProgressBar', id: 'pb-ok', props: { value: 100, max: 100, label: '已完成', showValue: true, tone: 'ok' } },
        { type: 'ProgressBar', id: 'pb-warn', props: { value: 45, max: 100, label: '体力', tone: 'warn' } },
        { type: 'ProgressBar', id: 'pb-danger', props: { value: 12, max: 100, label: '血量', showValue: true, tone: 'danger' } },
      ],
    },
    // 典型 HUD 四条：同一件换 tone/max 即成血/蓝/经验/护盾——别为每种条各搓一个件。
    { type: 'Label', id: 'pb-usage-note', props: { text: '典型用法：血/蓝/经验/护盾 = 同一件换 tone + max（换皮自适应）。绑世界资源见下方 t-bind 段。', color: 'sub', size: 'sm' } },
    {
      type: 'Panel', id: 'demo-progress-hud', props: { bg: 'sunken' },
      layout: { direction: 'column', gap: 8, padding: 14, radius: 10 },
      children: [
        { type: 'ProgressBar', id: 'pbh-hp', props: { value: 340, max: 520, label: '生命', showValue: true, tone: 'danger' } },
        { type: 'ProgressBar', id: 'pbh-mp', props: { value: 88, max: 120, label: '法力', showValue: true, tone: 'accent' } },
        { type: 'ProgressBar', id: 'pbh-xp', props: { value: 7300, max: 10000, label: '经验', showValue: true, tone: 'gold' } },
        { type: 'ProgressBar', id: 'pbh-sh', props: { value: 60, max: 100, label: '护盾', showValue: true, tone: 'ok' } },
      ],
    },
    divider('d-d4'),
    sectionTitle('t-tag', 'TAG · 标签 / 筛选 chip（可点 → 信号 pickTag·active/removable）'),
    {
      type: 'Panel',
      id: 'demo-tag',
      props: {},
      layout: { direction: 'row', gap: 8, align: 'center', padding: 10 },
      children: [
        { type: 'Tag', id: 'tag-all', props: { label: '全部', active: true, tone: 'accent', action: 'pickTag', actionArg: 'all' } },
        { type: 'Tag', id: 'tag-new', props: { label: '最新', action: 'pickTag', actionArg: 'new' } },
        { type: 'Tag', id: 'tag-hot', props: { label: '热门', action: 'pickTag', actionArg: 'hot' } },
        { type: 'Tag', id: 'tag-dim', props: { label: '已归档', tone: 'dim' } },
        { type: 'Tag', id: 'tag-rm', props: { label: '可移除', removable: true, action: 'pickTag', actionArg: 'remove' } },
      ],
    },
    sectionTitle('t-tagsize', 'TAG · size 缩放档（sm 紧凑筛选 / md 默认 / lg「大气药丸」货币计数·≈2x）'),
    {
      type: 'Panel', id: 'demo-tagsize', props: {},
      layout: { direction: 'row', gap: 12, align: 'center', padding: 10 },
      children: [
        { type: 'Tag', id: 'tg-sm', props: { label: '筛选·sm', size: 'sm', tone: 'dim' } },
        { type: 'Tag', id: 'tg-md', props: { label: '默认·md', size: 'md' } },
        { type: 'Tag', id: 'tg-lg1', props: { label: '💎 1280', size: 'lg', tone: 'accent' } },
        { type: 'Tag', id: 'tg-lg2', props: { label: '💰 99999', size: 'lg', tone: 'accent' } },
        { type: 'Label', id: 'tg-hint', props: { text: '← 同 Modal/PlayingCard.size 体系：闭集尺寸档，货币/稀有度药丸放大用 lg。', color: 'dim', size: 'sm' }, layout: { flex: 1 } },
      ],
    },
    divider('d-d5'),
    sectionTitle('t-avatar', 'AVATAR · 头像（图片/首字母占位·circle/rounded/square·多尺寸）'),
    {
      type: 'Panel',
      id: 'demo-avatar',
      props: {},
      layout: { direction: 'row', gap: 14, align: 'center', padding: 10 },
      children: [
        { type: 'Avatar', id: 'av-img', props: { src: DEMO_IMG, name: '图片头像', size: 48, shape: 'circle' } },
        { type: 'Avatar', id: 'av-circle', props: { name: '赵', size: 48, shape: 'circle' } },
        { type: 'Avatar', id: 'av-rounded', props: { name: '关', size: 48, shape: 'rounded' } },
        { type: 'Avatar', id: 'av-square', props: { name: '张', size: 48, shape: 'square' } },
        { type: 'Avatar', id: 'av-sm', props: { name: '马', size: 32, shape: 'circle' } },
        { type: 'Avatar', id: 'av-lg', props: { name: '黄', size: 64, shape: 'circle' } },
        // ring 环形进度描边（回合计时/蓄力·2026-08 查缺补漏）：conic 弧环绕头像到 value/max 比例。
        { type: 'Avatar', id: 'av-ring1', props: { name: '甲', size: 48, ring: { value: 0.72, tone: 'accent' } } },
        { type: 'Avatar', id: 'av-ring2', props: { src: DEMO_IMG, name: '计时', size: 48, ring: { value: 0.4, tone: 'warn' } } },
        { type: 'Avatar', id: 'av-ring3', props: { name: '满', size: 48, ring: { value: 1, tone: 'ok' } } },
      ],
    },
    divider('d-uifill'),
    sectionTitle('t-uifill', '★ 2D 查缺补漏（owner 2026-08）· Label 色 {custom} · fx:wobble · flyIn 方向 · ItemSlot / StatTile 组合助手'),
    { type: 'Label', id: 'uifill-note', props: {
      text: 'Label.color 三态（令牌 + {custom} 逃生·同 Panel.bg）：花色/精确墨色靠 {custom}·仍是闭集令牌优先。fx:wobble=循环 rotate+scale 摇摆（蓄势/摇拳）。flyIn 加 animFrom/animDist=可配方向大幅伸入。ItemSlot/StatTile=跨游戏反复手搓的簇→@ui/starters builder 去重（不加新控件）。', color: 'sub', size: 'sm' } },
    { type: 'Panel', id: 'uifill-color', props: { bare: true }, layout: { direction: 'row', gap: 16, align: 'center', padding: 8 },
      children: [
        { type: 'Label', id: 'uf-c1', props: { spans: [{ text: '♠13 ', color: { custom: '#8a94a6' } }, { text: '♥13 ', color: { custom: '#d8483f' } }, { text: '♦13 ', color: { custom: '#d3a03a' } }, { text: '♣13', color: { custom: '#3f9a5a' } }], size: 'xl', bold: true } },
        { type: 'Label', id: 'uf-c2', props: { text: 'Label.color {custom} 花色 4 色（令牌装不下→逃生·仍非裸串）', color: 'sub', size: 'sm' } },
      ] },
    { type: 'Panel', id: 'uifill-anim', props: { bare: true }, layout: { direction: 'row', gap: 26, align: 'center', padding: 12 },
      children: [
        { type: 'Label', id: 'uf-wob', props: { text: '✊ 摇拳', size: 'xl', bold: true, color: 'gold' }, layout: { fx: [{ kind: 'wobble', intensity: 1.2 }] } },
        { type: 'Label', id: 'uf-wob2', props: { text: '⚡ 蓄势', size: 'xl', bold: true, color: 'warn' }, layout: { fx: [{ kind: 'wobble' }] } },
        { type: 'Label', id: 'uf-fly', props: { text: '大幅右伸入 →', size: 'lg', bold: true, color: 'jade' }, layout: { anim: 'flyIn', animFrom: 'right', animDist: 120, animMs: 700 } },
        { type: 'Label', id: 'uf-flyhint', props: { text: 'fx:wobble（循环摇摆）· flyIn animFrom:right animDist:120（大幅伸入）', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
      ] },
    { type: 'Panel', id: 'uifill-slots', props: { bare: true }, layout: { direction: 'row', gap: 14, align: 'end', padding: 8 },
      children: [
        buildItemSlot({ id: 'uf-slot1', icon: DEMO_IMG, edge: 'gold', count: 3, label: '长剑' }),
        buildItemSlot({ id: 'uf-slot2', icon: DEMO_IMG, edge: 'jade', selected: true, label: '选中' }),
        buildItemSlot({ id: 'uf-slot3', icon: DEMO_IMG, cooldown: '3', label: '冷却' }),
        buildItemSlot({ id: 'uf-slot4', empty: true, label: '空槽' }),
        buildStatTile({ id: 'uf-stat1', value: '140', label: '伤害', tone: 'gold', shadow: 4 }),
        buildStatTile({ id: 'uf-stat2', value: '×9', label: '连击', tone: 'danger' }),
      ] },
    divider('d-d6a'),
    sectionTitle('t-card', 'CARD · 内容卡（media/title/sub/角标·可点 → 信号 pickCard·四态）'),
    {
      type: 'Panel',
      id: 'demo-card',
      props: {},
      layout: { direction: 'grid', minCol: 130, gap: 10, padding: 10 },
      children: [
        { type: 'Card', id: 'card-1', props: { media: '⚔️', title: '青釭剑', sub: '攻击 +12', corner: 'SSR', tone: 'accent', action: 'pickCard', actionArg: 'sword' } },
        { type: 'Card', id: 'card-2', props: { media: '🛡️', title: '玄铁盾', sub: '防御 +8', corner: 'SR', tone: 'normal', action: 'pickCard', actionArg: 'shield' } },
        { type: 'Card', id: 'card-3', props: { media: '🏹', title: '连弩', sub: '暴击 +5%', tone: 'normal', action: 'pickCard', actionArg: 'bow' } },
        { type: 'Card', id: 'card-4', props: { media: '🔒', title: '未解锁', sub: '通关第三章', tone: 'locked' } },
      ],
    },
    divider('d-d6b'),
    sectionTitle('t-bind', 'BINDINGS · 世界数据绑定（bind=resourceId·resolveBindings 读世界填值·活 HUD）'),
    {
      type: 'Panel',
      id: 'demo-bind',
      props: { title: '活 HUD（绑定数据·非手搭文字）' },
      layout: { direction: 'column', gap: 10, padding: 12 },
      children: [
        { type: 'Label', id: 'bind-hp-lbl', props: { text: '生命值 ', bind: 'hp', size: 'md', bold: true, color: 'danger' } },
        { type: 'ProgressBar', id: 'bind-hp-bar', props: { value: 0, bind: 'hp', tone: 'danger', showValue: true } },
        { type: 'Label', id: 'bind-gold-lbl', props: { text: '金币 ', bind: 'gold', color: 'gold', bold: true } },
        {
          type: 'Panel',
          id: 'bind-btns',
          props: {},
          layout: { direction: 'row', gap: 10, padding: 0 },
          children: [
            { type: 'Button', id: 'bind-hurt', props: { label: '受伤 −10', kind: 'ghost', action: 'hurt', actionArg: '10' } },
            { type: 'Button', id: 'bind-heal', props: { label: '治疗 +10', kind: 'primary', action: 'heal', actionArg: '10' } },
          ],
        },
      ],
    },
    divider('d-d6c'),
    sectionTitle('t-vlist', 'VIRTUALLIST · 虚拟滚动列表（500 行只渲可视窗口·千行不卡·行可点 → pickVRow）'),
    {
      type: 'VirtualList',
      id: 'demo-vlist',
      props: {
        rows: Array.from({ length: 500 }, (_, i) => ({
          id: `v${i}`,
          cells: { idx: String(i + 1).padStart(3, '0'), name: `单位 #${i + 1}`, hp: String(((i * 37) % 100) + 1) },
        })),
        columns: [
          { key: 'idx', label: '#', align: 'center', width: 56 },
          { key: 'name', label: '名称', align: 'left' },
          { key: 'hp', label: '生命', align: 'right' },
        ],
        rowHeight: 34,
        height: 240,
        action: 'pickVRow',
      },
    },
    divider('d-d6d'),
    sectionTitle('t-toast', 'TOAST · 飘字提示（静态样式预览·五语义色；实时弹出见「输入与交互」页）'),
    {
      type: 'Panel',
      id: 'demo-toast',
      props: {},
      layout: { direction: 'row', gap: 10, align: 'center', padding: 10 },
      children: [
        { type: 'Toast', id: 'toast-ok', props: { text: '保存成功', tone: 'ok' } },
        { type: 'Toast', id: 'toast-warn', props: { text: '网络不稳', tone: 'warn' } },
        { type: 'Toast', id: 'toast-danger', props: { text: '操作失败', tone: 'danger' } },
        { type: 'Toast', id: 'toast-accent', props: { text: '有新消息', tone: 'accent' } },
      ],
    },
    divider('d-d6'),
    sectionTitle('t-tooltip', 'TOOLTIP · 悬浮提示（hover 触发元素 → 气泡·四方位·引擎内建 hover）'),
    {
      type: 'Panel',
      id: 'demo-tooltip',
      props: {},
      layout: { direction: 'row', gap: 18, align: 'center', padding: 14 },
      children: [
        {
          type: 'Tooltip', id: 'tip-top', props: { content: '上方提示气泡', placement: 'top' },
          children: [{ type: 'Badge', id: 'tip-top-t', props: { text: '悬停我 · top', tone: 'ok' } }],
        },
        {
          type: 'Tooltip', id: 'tip-bottom', props: { content: '下方提示气泡', placement: 'bottom' },
          children: [{ type: 'Badge', id: 'tip-bottom-t', props: { text: '悬停我 · bottom', tone: 'warn' } }],
        },
        {
          type: 'Tooltip', id: 'tip-right', props: { content: '右侧说明文本', placement: 'right' },
          children: [{ type: 'Button', id: 'tip-right-t', props: { label: '按钮 + 提示', kind: 'ghost', action: 'click', actionArg: 'tooltip-btn' } }],
        },
      ],
    },
    divider('d-d7'),
    sectionTitle('t-table', 'TABLE · 数据表 / 榜单（行可点 → 信号 pickRow）'),
    {
      type: 'Table',
      id: 'demo-table',
      props: {
        title: '排行榜',
        columns: [
          { key: 'rank', label: '#', align: 'center', width: 48 },
          { key: 'name', label: '玩家', align: 'left' },
          { key: 'score', label: '分数', align: 'right' },
        ],
        rows: [
          { id: 'p1', cells: { rank: '1', name: '赵子龙', score: '9,820' }, tone: 'accent', action: 'pickRow' },
          { id: 'p2', cells: { rank: '2', name: '关云长', score: '9,410' }, action: 'pickRow' },
          { id: 'p3', cells: { rank: '3', name: '张翼德', score: '8,930' }, action: 'pickRow' },
          { id: 'p4', cells: { rank: '4', name: '马孟起', score: '8,610' }, tone: 'dim', action: 'pickRow' },
        ],
        empty: '暂无数据',
      },
    },
  ],
}; }

// ── 页 3 · 输入与交互 ────────────────────────────────────────
function buildPageInput(c: ControlsState): LayoutNode {
  return {
  type: 'Panel',
  id: 'page-input',
  props: { scroll: true },
  layout: { direction: 'column', gap: 18, padding: 20 },
  children: [
    sectionTitle('t-btn', 'BUTTON · 三态 + 禁用（→ 信号 click）'),
    {
      type: 'Panel',
      id: 'demo-btn',
      props: {},
      layout: { direction: 'row', gap: 10, padding: 10 },
      children: [
        { type: 'Button', id: 'btn-p', props: { label: '主操作', kind: 'primary', action: 'click', actionArg: 'primary' } },
        { type: 'Button', id: 'btn-g', props: { label: '次操作', kind: 'ghost', action: 'click', actionArg: 'ghost' } },
        { type: 'Button', id: 'btn-q', props: { label: '安静', kind: 'quiet', action: 'click', actionArg: 'quiet' } },
        { type: 'Button', id: 'btn-d', props: { label: '禁用', kind: 'primary', disabled: true, action: 'click', actionArg: 'disabled' } },
      ],
    },
    divider('d-i1'),
    sectionTitle('t-input', 'INPUT · 文本 / 数字（→ 信号 setText / setNum）'),
    {
      type: 'Panel',
      id: 'demo-input',
      props: {},
      layout: { direction: 'row', gap: 10, padding: 10 },
      children: [
        { type: 'Input', id: 'in-text', props: { placeholder: '玩家名称…', type: 'text', action: 'setText' }, layout: { flex: 2 } },
        { type: 'Input', id: 'in-num', props: { placeholder: '数量', type: 'number', value: '1', action: 'setNum' }, layout: { flex: 1 } },
      ],
    },
    sectionTitle('t-dropdown', 'DROPDOWN · 下拉选择（→ 信号 setDifficulty）'),
    {
      type: 'Dropdown',
      id: 'dd-diff',
      props: {
        options: [
          { value: 'easy', label: '简单' },
          { value: 'normal', label: '普通' },
          { value: 'hard', label: '困难' },
        ],
        value: 'normal',
        action: 'setDifficulty',
      },
    },
    divider('d-i2'),
    sectionTitle('t-check', 'CHECKBOX / TOGGLE · 开关（→ 信号 setFlag / setSound）'),
    {
      type: 'Panel',
      id: 'demo-check',
      props: {},
      layout: { direction: 'row', gap: 24, align: 'center', padding: 10 },
      children: [
        { type: 'Checkbox', id: 'cb-tutorial', props: { label: '开启新手引导', checked: c.flag, action: 'setFlag' } },
        { type: 'Toggle', id: 'tg-sound', props: { label: '音效', checked: c.sound, action: 'setSound' } },
      ],
    },
    sectionTitle('t-radio', 'RADIOGROUP · 互斥单选（→ 信号 setSpeed）'),
    {
      type: 'RadioGroup',
      id: 'rg-speed',
      props: {
        name: 'speed',
        options: [
          { value: '1', label: '1×' },
          { value: '2', label: '2×' },
          { value: '4', label: '4×' },
        ],
        value: c.speed,
        action: 'setSpeed',
      },
    },
    divider('d-i3'),
    sectionTitle('t-slider', 'SLIDER · 数值滑块（→ 信号 setVolume）'),
    {
      type: 'Slider',
      id: 'sl-volume',
      props: { min: 0, max: 100, step: 5, value: 60, label: '音量', action: 'setVolume' },
    },
    divider('d-i3b'),
    sectionTitle('t-segmented', 'SEGMENTED · 分段选择器（互斥·紧凑·→ 信号 setView）'),
    {
      type: 'Segmented',
      id: 'seg-view',
      props: {
        options: [
          { value: 'grid', label: '网格' },
          { value: 'list', label: '列表' },
          { value: 'card', label: '卡片' },
        ],
        value: c.view,
        action: 'setView',
      },
    },
    sectionTitle('t-stepper', 'STEPPER · 步进器（±按钮调数值·边界禁用·→ 信号 setQty）'),
    {
      type: 'Stepper',
      id: 'stp-qty',
      props: { value: c.qty, min: 0, max: 10, step: 1, action: 'setQty' },
    },
    sectionTitle('t-combobox', 'COMBOBOX · 可搜索下拉（输入过滤·点项回填·引擎内建 → 信号 setCity）'),
    {
      type: 'Combobox',
      id: 'cb-city',
      props: {
        options: [
          { value: 'cd', label: '成都' },
          { value: 'luoyang', label: '洛阳' },
          { value: 'xuchang', label: '许昌' },
          { value: 'jianye', label: '建业' },
          { value: 'changan', label: '长安' },
        ],
        placeholder: '搜索城市…',
        value: c.city,
        action: 'setCity',
      },
    },
    sectionTitle('t-rating', 'RATING · 星级评分（点星 → 信号 setRating）'),
    {
      type: 'Rating',
      id: 'rt-stars',
      props: { value: c.rating, max: 5, action: 'setRating' },
    },
    divider('d-i4'),
    sectionTitle('t-modal', 'MODAL · 模态浮层（按钮开 → 点遮罩/× 关·引擎内建 closeAction）'),
    {
      type: 'Panel',
      id: 'demo-modal',
      props: {},
      layout: { direction: 'row', gap: 10, align: 'center', padding: 10 },
      children: [
        { type: 'Button', id: 'btn-open-modal', props: { label: '打开模态框', kind: 'primary', action: 'openModal' } },
        { type: 'Label', id: 'modal-hint', props: { text: '点遮罩本身或右上角 × 即关闭', size: 'sm', color: 'dim' } },
      ],
    },
    divider('d-i4b'),
    sectionTitle('t-drawer', 'DRAWER · 抽屉浮层（按钮开 → 右侧滑入·点遮罩/× 关·引擎内建）'),
    {
      type: 'Panel',
      id: 'demo-drawer',
      props: {},
      layout: { direction: 'row', gap: 10, align: 'center', padding: 10 },
      children: [
        { type: 'Button', id: 'btn-open-drawer', props: { label: '打开抽屉', kind: 'primary', action: 'openDrawer' } },
        { type: 'Label', id: 'drawer-hint', props: { text: '从右侧滑入·遮罩/× 关闭', size: 'sm', color: 'dim' } },
      ],
    },
    divider('d-i4c'),
    sectionTitle('t-ctxmenu', 'CONTEXTMENU · 右键菜单（在下方区域点右键 → 光标处弹菜单·引擎内建 → ctxAction）'),
    {
      type: 'ContextMenu',
      id: 'demo-ctxmenu',
      props: {
        items: [
          { id: 'open', label: '打开', action: 'ctxAction' },
          { id: 'rename', label: '重命名', action: 'ctxAction' },
          { id: 'dup', label: '复制', action: 'ctxAction' },
          { id: 'delete', label: '删除', action: 'ctxAction' },
        ],
      },
      children: [
        {
          type: 'Panel',
          id: 'ctx-target',
          props: { title: '右键点我' },
          layout: { direction: 'column', gap: 4, padding: 18, align: 'center' },
          children: [
            { type: 'Label', id: 'ctx-hint', props: { text: '在此区域点鼠标右键，菜单会在光标处弹出', color: 'sub', size: 'sm' } },
          ],
        },
      ],
    },
    divider('d-i5'),
    sectionTitle('t-toast-live', 'TOAST · 实时飘字（点击 → showToast·底部居中堆叠·到时自动消失）'),
    {
      type: 'Panel',
      id: 'demo-toast-live',
      props: {},
      layout: { direction: 'row', gap: 10, align: 'center', padding: 10 },
      children: [
        { type: 'Button', id: 'btn-toast-ok', props: { label: '成功提示', kind: 'primary', action: 'showToast', actionArg: 'ok' } },
        { type: 'Button', id: 'btn-toast-warn', props: { label: '警告提示', kind: 'ghost', action: 'showToast', actionArg: 'warn' } },
        { type: 'Button', id: 'btn-toast-danger', props: { label: '错误提示', kind: 'ghost', action: 'showToast', actionArg: 'danger' } },
      ],
    },
  ],
  };
}

// ── 模态浮层（按需叠加于 Screen 之上）─────────────────────────
// Modal 是满屏遮罩浮层：开 = 宿主把它挂进树重渲染；关 = 引擎内建（点遮罩/× → closeModal）。
// 模态/抽屉浮层节点（导出供宿主作「独立浮层」挂载·不进画廊树 → 开关不触发画廊重渲）。
export const modalOverlay: LayoutNode = {
  type: 'Modal',
  id: 'demo-modal-overlay',
  props: { title: '示例模态框', size: 'md', closable: true, closeAction: 'closeModal' },
  layout: {},
  children: [
    { type: 'Label', id: 'mo-body', props: { text: '这是一个数据驱动的模态浮层——标题/尺寸/可关均由数据配置。', color: 'sub' } },
    { type: 'Divider', id: 'mo-div', props: {} },
    {
      type: 'Panel',
      id: 'mo-actions',
      props: {},
      layout: { direction: 'row', gap: 10, align: 'center', padding: 0 },
      children: [
        { type: 'Tag', id: 'mo-tag', props: { label: '弹窗内也能放控件', tone: 'accent' } },
        { type: 'Button', id: 'mo-ok', props: { label: '知道了', kind: 'primary', action: 'closeModal' } },
      ],
    },
  ],
};

// ── 抽屉浮层（按需叠加·右侧滑入·开靠宿主、关靠引擎内建 closeAction）─────
export const drawerOverlay: LayoutNode = {
  type: 'Drawer',
  id: 'demo-drawer-overlay',
  props: { side: 'right', title: '示例抽屉', closeAction: 'closeDrawer' },
  layout: {},
  children: [
    { type: 'Label', id: 'dw-body', props: { text: '抽屉常用于侧边设置 / 详情面板，从屏幕一侧滑入。', color: 'sub' } },
    { type: 'Divider', id: 'dw-div', props: {} },
    { type: 'Toggle', id: 'dw-tg', props: { label: '抽屉里的开关', checked: true, action: 'setFlag' } },
    { type: 'Button', id: 'dw-ok', props: { label: '收起抽屉', kind: 'primary', action: 'closeDrawer' } },
  ],
};

// ── 页 6 · 声音测试（Web Audio 合成·无需音频文件）────────────────
function buildSoundPage(c: ControlsState): LayoutNode {
  return {
    type: 'Panel',
    id: 'page-sound',
    props: { scroll: true },
    layout: { direction: 'column', gap: 16, padding: 20 },
    children: [
      {
        type: 'Panel', id: 'snd-hud', props: {},
        layout: { direction: 'row', gap: 12, align: 'center', padding: 12 },
        children: [
          { type: 'Label', id: 'snd-title', props: { text: '🔊 声音测试', size: 'lg', bold: true }, layout: { flex: 1 } },
          { type: 'Badge', id: 'snd-engine', props: { text: 'Web Audio 合成 · 无需音频文件', tone: 'dim' } },
        ],
      },
      { type: 'Label', id: 'snd-hint', props: { text: '点按钮播放合成音（纯频率/波形数据驱动）。下方可调音量、静音。', color: 'dim', size: 'sm' } },
      sectionTitle('snd-t-play', '单音 · 点击播放（→ 信号 playSound·应用当前声像/混响）'),
      {
        type: 'Panel', id: 'demo-sounds', props: {},
        layout: { direction: 'grid', minCol: 120, gap: 10, padding: 8 },
        children: SOUNDS.map((s): LayoutNode => ({
          type: 'Button', id: `snd-${s.id}`,
          props: { label: s.label, kind: 'ghost', action: 'playSound', actionArg: s.id },
        })),
      },
      divider('snd-d1'),
      sectionTitle('snd-t-mix', '混音 · 多音同时发声（Web Audio 天然混合·多声道）'),
      {
        type: 'Panel', id: 'snd-mix', props: {},
        layout: { direction: 'row', gap: 10, align: 'center', padding: 8 },
        children: [
          { type: 'Button', id: 'snd-chord', props: { label: '🎶 和弦（3 音齐发）', kind: 'primary', action: 'playChord', actionArg: 'major' } },
          { type: 'Button', id: 'snd-all', props: { label: '💥 8 音齐发', kind: 'ghost', action: 'playChord', actionArg: 'all' } },
        ],
      },
      divider('snd-d2'),
      sectionTitle('snd-t-pan', '立体声 · 左右声像（StereoPanner·-100 左 ~ +100 右）'),
      {
        type: 'Panel', id: 'snd-pan', props: {},
        layout: { direction: 'column', gap: 10, padding: 8 },
        children: [
          { type: 'Slider', id: 'snd-pan-sl', props: { min: -100, max: 100, step: 10, value: c.pan, label: `声像 ${c.pan < 0 ? '偏左' : c.pan > 0 ? '偏右' : '居中'}`, action: 'setPan' } },
          {
            type: 'Panel', id: 'snd-pan-btn', props: {},
            layout: { direction: 'row', gap: 10, align: 'center', padding: 0 },
            children: [
              { type: 'Button', id: 'snd-pan-l', props: { label: '◀ 左', kind: 'ghost', action: 'playPan', actionArg: 'left' } },
              { type: 'Button', id: 'snd-pan-c', props: { label: '● 中', kind: 'ghost', action: 'playPan', actionArg: 'center' } },
              { type: 'Button', id: 'snd-pan-r', props: { label: '右 ▶', kind: 'ghost', action: 'playPan', actionArg: 'right' } },
              { type: 'Label', id: 'snd-pan-hint', props: { text: '戴耳机更明显', size: 'sm', color: 'dim' } },
            ],
          },
        ],
      },
      divider('snd-d3'),
      sectionTitle('snd-t-bgm', '背景音乐 · 循环播放（音序数据驱动）'),
      {
        type: 'Panel', id: 'snd-bgm', props: {},
        layout: { direction: 'row', gap: 10, align: 'center', padding: 8 },
        children: [
          ...BGM.map((b): LayoutNode => ({
            type: 'Button', id: `snd-bgm-${b.id}`,
            props: { label: `▶ ${b.label}`, kind: 'ghost', action: 'startBgm', actionArg: b.id },
          })),
          { type: 'Button', id: 'snd-bgm-stop', props: { label: '⏹ 停止', kind: 'quiet', action: 'stopBgm' } },
        ],
      },
      divider('snd-d4'),
      sectionTitle('snd-t-ctl', '混响 / 音量 / 静音'),
      {
        type: 'Panel', id: 'snd-ctl', props: {},
        layout: { direction: 'column', gap: 12, padding: 8 },
        children: [
          { type: 'Toggle', id: 'snd-reverb', props: { label: '混响（Convolver 卷积）', checked: c.reverb, action: 'toggleReverb' } },
          { type: 'Slider', id: 'snd-vol', props: { min: 0, max: 100, step: 5, value: c.vol, label: '音量', action: 'setSndVol' } },
          { type: 'Toggle', id: 'snd-mute', props: { label: c.muted ? '静音（已静音·点此恢复）' : '静音', checked: c.muted, action: 'toggleMute' } },
        ],
      },
    ],
  };
}

/**
 * 展示台模块清单——每块「积木」是一类底座能力的活样例。点一块进它自己的子菜单。
 * soon=规划中（占位·灰块不可点）。后续精灵动画/3D/视频逐块点亮。
 */
export const MODULES: ReadonlyArray<{ id: string; glyph: string; label: string; desc: string; tone: 'accent' | 'normal' | 'dim'; dim: '2d' | '3d'; soon?: boolean }> = [
  // ── 2D 区 ──
  { id: 'mod-ui', glyph: '🎛', label: 'UI 控件', desc: '30+ 数据驱动控件 · 换皮', tone: 'accent' as const, dim: '2d' },
  { id: 'mod-mmo', glyph: '🗡', label: '组合 · MMO HUD', desc: '纯数据复现 WoW 风最复杂 HUD', tone: 'accent' as const, dim: '2d' },
  { id: 'mod-casual', glyph: '🍬', label: '组合 · 超休闲对局', desc: '精致消除对局屏 · 糖果棋盘 + 道具 + juice', tone: 'accent' as const, dim: '2d' },
  { id: 'mod-dialogue', glyph: '💬', label: '剧情 · VN 对话三件', desc: '台词框 + 选项 + 立绘 · 闭集纯数据 · 消费 t3-dialogue 投影', tone: 'accent' as const, dim: '2d' },
  { id: 'mod-presence', glyph: '🫂', label: '剧情 · 伴侣在场件', desc: '非剧情对局叠伴侣反应 · 反应表选句 + M1 三件拼装', tone: 'accent' as const, dim: '2d' },
  { id: 'mod-sound', glyph: '🔊', label: '声音', desc: '合成 / 混音 / 立体声 / 混响', tone: 'normal' as const, dim: '2d' },
  { id: 'mod-input', glyph: '🎮', label: '输入底座', desc: 'RawInput → KeyBinding → 信号', tone: 'normal' as const, dim: '2d' },
  { id: 'mod-anim', glyph: '✨', label: '精灵动画', desc: 'tween 驱动 · Canvas 实时绘制', tone: 'normal' as const, dim: '2d' },
  { id: 'mod-ai', glyph: '🧠', label: '游戏 AI', desc: '索敌 aggro / 寻路 grid-move', tone: 'normal' as const, dim: '2d' },
  { id: 'mod-physics', glyph: '🟢', label: '运动与碰撞', desc: 'motion + overlap + 碰撞响应', tone: 'normal' as const, dim: '2d' },
  { id: 'mod-combat', glyph: '⚔️', label: '战斗结算', desc: '命中 → 伤害 → DoT → 死亡', tone: 'normal' as const, dim: '2d' },
  { id: 'mod-spawn', glyph: '🎆', label: '生成与寿命', desc: 'spawn → 飞 → 寿命自毁', tone: 'normal' as const, dim: '2d' },
  { id: 'mod-fx', glyph: '💥', label: '战场特效（库B）', desc: '爆炸环 prefab · 火花叠在画面上', tone: 'normal' as const, dim: '2d' },
  { id: 'mod-fsm', glyph: '🔀', label: '状态机', desc: 'condition → signal → set-state', tone: 'normal' as const, dim: '2d' },
  { id: 'mod-video', glyph: '🎬', label: '爱诗工作室', desc: 'AIGP 端口 · 8 输出模式 · 竖/横屏短视频', tone: 'normal' as const, dim: '2d' },
  // ── 3D 区（消费 P3D 3D 渲染线·ThreeRenderer）──
  { id: 'mod-3d', glyph: '🧊', label: '3D 渲染', desc: 'Mesh3D · 翻面/翻滚 基础旋转', tone: 'accent' as const, dim: '3d' },
  { id: 'mod-3d-light', glyph: '💡', label: '数据化光照', desc: 'Light3D 定向+环境 · 投影', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-post', glyph: '🔭', label: '景深 · 泛光', desc: 'Post3D 移轴景深 + bloom', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-primitives', glyph: '🔷', label: '圆润图元', desc: 'Mesh3D 球/柱/锥/胶囊/环 7 原语', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-nav', glyph: '🧭', label: '3D 寻路', desc: 'navmesh 自动烘焙 + 绕障追逐', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-collide', glyph: '🎯', label: '3D 碰撞', desc: 'Collider3D / Overlap3D · 触发区', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-particle', glyph: '🎇', label: '3D 粒子（prefab）', desc: 'prefab → Mesh3D 火花 · 泛光', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-vfx', glyph: '🌟', label: '3D 粒子（Vfx3D）', desc: '数据驱动发射器 · 锥喷+重力+渐变', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-text', glyph: '🔤', label: '头顶 3D 文字', desc: 'WorldUI3D · 世界空间飘字', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-worldui', glyph: '🪧', label: '世界空间面板', desc: 'WorldUI3D.node · 富 LayoutNode 名牌+血条', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-ao', glyph: '🌑', label: '环境光遮蔽 AO', desc: 'Post3D.ao · 接触/缝隙压暗', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-material', glyph: '🧱', label: 'PBR 材质', desc: 'Material3D 金/钢/玻璃 + 调色', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-fog', glyph: '🌫', label: '距离雾', desc: 'Fog3D · 远处渐隐纵深', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-pointlight', glyph: '🔦', label: '点光源 / 聚光灯', desc: 'Light3D point·spot · 动态局部光', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-surface', glyph: '🪨', label: '程序化表面细节', desc: 'Material3D.surface · 凹凸/划痕贴图', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-toon', glyph: '🖍', label: '卡通描边 toon', desc: 'Material3D.shading:toon + outline', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-billboard', glyph: '🪙', label: '广告牌 + 贴花', desc: 'Billboard3D 朝相机 + Decal3D 地阴影', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-path', glyph: '🛤', label: '路径跟随', desc: 'Path3D · 巡逻/轨道/移动平台', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-spring', glyph: '🟢', label: '弹簧动画', desc: 'Anim3D spring · 弹入/落定过冲', tone: 'normal' as const, dim: '3d' },
  { id: 'mod-3d-model', glyph: '🦆', label: 'glTF 模型导入', desc: 'Model3D · 真模型 + 自带材质/软影', tone: 'normal' as const, dim: '3d' },
];

/**
 * 渲染舞台样例（canvas/three 宿主挂载点）：标题条（图标 + LIVE）+ 说明 + 高亮框住的 #sim-stage 视口
 * + 「组合能力」标签条。chrome 全是 LayoutNode 数据（accent Panel / Badge / Tag），不手写 CSS。
 */
function buildSimStage(id: string, glyph: string, title: string, desc: string, caps: string[], tune?: LayoutNode): LayoutNode {
  return {
    type: 'Panel', id: `${id}-mod`, props: {},
    layout: { direction: 'column', gap: 12, padding: 18 },
    children: [
      // 标题条：图标 + 标题 + LIVE 徽标
      { type: 'Panel', id: `${id}-hd`, props: {}, layout: { direction: 'row', align: 'center', gap: 10, padding: 12 },
        children: [
          { type: 'Label', id: `${id}-ttl`, props: { text: `${glyph}  ${title}`, size: 'lg', bold: true }, layout: { flex: 1 } },
          { type: 'Badge', id: `${id}-live`, props: { text: '● LIVE', tone: 'ok' } },
        ] },
      { type: 'Label', id: `${id}-desc`, props: { text: desc, color: 'sub', size: 'sm' } },
      // 现场调参台（可选·REQ-DEMO-调参台）：客户点档即改蓝图数据 → 渲染舞台实时换画。
      ...(tune ? [tune] : []),
      // #sim-stage：高亮框住的活动视口（宿主在此 init 引擎渲染器·canvas 实时绘制·非 DOM）。
      { type: 'Panel', id: 'sim-stage', props: { accent: true, bg: { custom: '#0a0f1e' } }, layout: { width: 656, height: 416, padding: 8, align: 'center' } },
      // 「组合能力」标签条：本样例由哪些现成 capability 拼出来（信息 + 装饰·强化数据驱动叙事）。
      { type: 'Panel', id: `${id}-caps`, props: {}, layout: { direction: 'row', align: 'center', gap: 6, padding: 10 },
        children: [
          { type: 'Label', id: `${id}-capl`, props: { text: '组合能力', color: 'dim', size: 'xs', bold: true } },
          ...caps.map((c, i): LayoutNode => ({ type: 'Tag', id: `${id}-cap-${i}`, props: { label: c, tone: 'accent' } })),
        ] },
    ],
  };
}

/** 一块模块积木卡。 */
/** 每个效果的稳定索引编号（=在 MODULES 里的全局位次·1 起）：卡片角标显示 + 编号快速跳转都取它。
 *  追加新效果不改旧号（位次不变）；用它「指定编号→点击直达」。 */
export const MODULE_NO: ReadonlyMap<string, number> = new Map(MODULES.map((m, i) => [m.id, i + 1]));

function moduleCard(m: typeof MODULES[number]): LayoutNode {
  const no = MODULE_NO.get(m.id) ?? 0;
  return {
    type: 'Card', id: `hub-${m.id}`,
    props: {
      media: m.glyph, title: `#${no} ${m.label}`, sub: m.desc, // 编号直接进标题（一眼可见）
      corner: m.soon ? `#${no}·规划中` : `#${no}`,             // 角标也标编号
      tone: m.soon ? 'locked' : m.tone,
      ...(m.soon ? {} : { action: 'enterModule', actionArg: m.id }),
    },
  };
}

/** 编号快速跳转条：一排可点的效果编号（点编号=直达该效果）。demo 时「我要看 12 号」点 12 即跳。 */
function buildJumpBar(): LayoutNode {
  return {
    type: 'Panel', id: 'hub-jump', props: { bg: 'jade', title: '🔢 效果编号快速跳转 · 点编号直达（demo 指哪看哪）' },
    layout: { direction: 'grid', minCol: 44, gap: 6, padding: 12 }, // grid=自动换行（无 wrap 字段）
    children: MODULES.map((m): LayoutNode => {
      const no = MODULE_NO.get(m.id) ?? 0;
      return {
        type: 'Button', id: `jump-${m.id}`,
        props: {
          label: String(no), kind: m.dim === '3d' ? 'primary' : 'ghost', disabled: m.soon,
          ...(m.soon ? {} : { action: 'enterModule', actionArg: m.id }),
        },
        layout: { width: 40 },
      };
    }),
  };
}

/** 一个维度分区：分区标题 + 该维度模块的自适应网格。 */
function hubSection(id: string, title: string, sub: string, dim: '2d' | '3d'): LayoutNode {
  return {
    type: 'Panel', id: `hub-sec-${id}`, props: { bare: true },
    layout: { direction: 'column', gap: 10, padding: 0 },
    children: [
      { type: 'Panel', id: `hub-sechd-${id}`, props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 10 },
        children: [
          { type: 'Label', id: `hub-sect-${id}`, props: { text: title, size: 'lg', bold: true, color: 'gold' } },
          { type: 'Label', id: `hub-secs-${id}`, props: { text: sub, size: 'xs', color: 'sub' }, layout: { flex: 1 } },
        ] },
      { type: 'Panel', id: `hub-grid-${id}`, props: {}, layout: { direction: 'grid', minCol: 200, gap: 14, padding: 0 },
        children: MODULES.filter((m) => m.dim === dim).map(moduleCard) },
    ],
  };
}

/** 落地页：拆 2D / 3D 两区，每区一墙模块积木（点 Card 进各自子菜单）。 */
function buildHub(): LayoutNode {
  return {
    // 落地积木墙底：平铺点阵贴图 + 缓慢 UV 滚动（owner 早前想要的「积木墙点阵底纹」·现用 bgTexture/bgScroll 数据实现）。
    type: 'Panel', id: 'hub', props: { title: '🧩 ZeroCraft 引擎 · 底座能力展示台', scroll: true, bgTexture: TEXTURE_URI, bgTextureSize: 26, bgScroll: { y: 26, ms: 7000 } },
    layout: { direction: 'column', gap: 18, padding: 20 },
    children: [
      { type: 'Label', id: 'hub-sub', props: {
        text: '每块积木是一类底座能力的活样例——点一块进去，看它怎么用纯数据驱动。分 2D 与 3D 两区。每个效果带编号（卡片标题/角标 #N），也可用下面的编号条直达。', color: 'sub', size: 'sm' } },
      buildJumpBar(),
      hubSection('2d', '🟦 2D 能力', 'UI / 声音 / 输入 / 动画 / AI / 物理 / 战斗 / 特效 / 状态机 / 视频', '2d'),
      { type: 'Divider', id: 'hub-div', props: {} },
      hubSection('3d', '🧊 3D 能力', '消费 ZeroCraft 3D 渲染线（ThreeRenderer）——光照 / 景深 / 寻路 / 碰撞 / 粒子', '3d'),
    ],
  };
}

/** 规划中模块的占位页。 */
function comingSoon(id: string, label: string): LayoutNode {
  return {
    type: 'Panel', id: `soon-${id}`, props: { title: label },
    layout: { direction: 'column', gap: 8, padding: 24, align: 'center' },
    children: [
      { type: 'Label', id: `soon-${id}-t`, props: { text: '🚧 规划中', size: 'lg', bold: true } },
      { type: 'Label', id: `soon-${id}-d`, props: { text: '该底座能力的活样例即将点亮。', color: 'dim', size: 'sm' } },
    ],
  };
}

// ── 页 6 · 主程新增控件 / 新特性（把库里新加的能力全摆出来）─────────────────────
/** 🎨 emoji 美术 tab（REQ-UI-emoji图渲 活范例·独立顶层 tab·文本 emoji 自动成库里 Twemoji 美术图）。 */
function buildPageEmoji(): LayoutNode {
  return {
    type: 'Panel', id: 'page-emoji', props: { scroll: true },
    layout: { direction: 'column', gap: 16, padding: 20 },
    children: [
      sectionTitle('t-emoji', '🎮 文本 EMOJI 自动图渲（写 emoji 字形 → 渲染成库里 Twemoji 美术图·render-only·REQ-UI-emoji图渲）'),
      { type: 'Label', id: 't-emoji-sub', props: { text: '整个展示台开了 theme.emoji（base=/games/game-i/art/emoji）——所有 Label/Button/Tag/Badge/Tabs/Card 文本里的 emoji 字形都自动换成美术图（1em·随字号·baseline）。不必逐个手转 Image 槽；一处配置覆盖全线（连这个 tab 名的 🎨、上面各 tab 的 🧊🆕🎴 也都是自动成图）。', color: 'sub', size: 'sm' } },
      { type: 'Panel', id: 'emoji-demo', props: { title: '同一份文本数据·emoji 自动成图' }, layout: { direction: 'column', gap: 12, padding: 16 },
        children: [
          { type: 'Label', id: 'emoji-l1', props: { text: '大厅：🎮 开始 · 🏆 排行榜 · 💎 商店 · ⚔️ 竞技场 · 🎁 每日奖励', size: 'lg' } },
          { type: 'Label', id: 'emoji-l2', props: { spans: [{ text: '💰 金币 12,340', color: 'gold', bold: true }, { text: '　🔥 连胜 7', color: 'danger' }, { text: '　★ 段位 白金', color: 'jade' }] } },
          { type: 'Panel', id: 'emoji-btns', props: { bare: true }, layout: { direction: 'row', gap: 10, align: 'center' },
            children: [
              { type: 'Button', id: 'emoji-b1', props: { label: '⚔️ 出战', kind: 'hero' } },
              { type: 'Button', id: 'emoji-b2', props: { label: '🛡️ 防守', kind: 'primary' } },
              { type: 'Button', id: 'emoji-b3', props: { label: '🎒 背包', kind: 'ghost' } },
              { type: 'Tag', id: 'emoji-t1', props: { label: '🀄 麻将', tone: 'accent', size: 'lg' } },
              { type: 'Badge', id: 'emoji-g1', props: { text: '🔥 HOT', tone: 'warn' } },
            ] },
          { type: 'Panel', id: 'emoji-cmp', props: {}, layout: { direction: 'row', gap: 24, padding: 12, align: 'center' },
            children: [
              { type: 'Label', id: 'emoji-cmp-a', props: { spans: [{ text: '自动图渲：', color: 'dim' }, { text: '🎲🎴🎯🏅' }] } },
              { type: 'Label', id: 'emoji-cmp-b', props: { text: 'raw 逃生保字形：🎲🎴🎯🏅', color: 'sub', raw: true } },
            ] },
          { type: 'Label', id: 't-emoji-note', props: { text: 'theme.emoji={base}（游戏级开关·美术图 vendor 进本地 served 目录=hermetic）；码点解析与 PA emoji-resolve 一致（★→⭐ 等符号走 alias）；逐 Label raw:true 保字形（代码块/刻意）。缺省不配=文本 emoji 零变化。', color: 'dim', size: 'xs' } },
        ] },
    ],
  };
}

function buildPageNew(controls: ControlsState): LayoutNode {
  const pcard = (id: string, p: Record<string, unknown>): LayoutNode => ({ type: 'PlayingCard', id, props: p });
  return {
    type: 'Panel', id: 'page-new', props: { scroll: true },
    layout: { direction: 'column', gap: 18, padding: 20 },
    children: [
      sectionTitle('t-anchor', '★ 锚定层 FLOAT / CONNECTOR（把浮层/连线钉在活动目标上·取代手写 getElementById·REQ-UI-锚定①）'),
      { type: 'Label', id: 't-anchor-sub', props: { text: '下方三个单位是普通 LayoutNode（各有 id）。名牌 Float 锚在单位头顶(at:top)、每帧跟随；VS 连线 Connector 从赵→关(arrow·danger)。滚动/换 tab 时浮层自动跟随或隐藏（目标消失不悬空）。', color: 'sub', size: 'sm' } },
      { type: 'Panel', id: 'anchor-field', props: { bg: { custom: 'linear-gradient(160deg,#16402c,#0e2a1c)' }, vignette: true }, layout: { direction: 'row', gap: 40, padding: 30, justify: 'center', align: 'center', height: 160 },
        children: [
          { type: 'PlayingCard', id: 'anchor-u1', props: { rank: 'A', suit: '♠', label: '赵子龙', size: 'lg' } },
          { type: 'PlayingCard', id: 'anchor-u2', props: { rank: 'K', suit: '♥', label: '关云长', size: 'lg', face: 'light' } },
          { type: 'PlayingCard', id: 'anchor-u3', props: { rank: 'Q', suit: '♣', label: '小兵', size: 'md', dimmed: true } },
        ] },
      // 浮层：名牌钉在单位头顶（at:top·offset 上抬）·血条钉在脚下。目标 id = 上面卡的 id。
      { type: 'Float', id: 'anchor-plate1', props: { anchorTo: { kind: 'node', id: 'anchor-u1', at: 'top', offset: { y: -6 } } },
        children: [{ type: 'Badge', id: 'anchor-p1b', props: { text: '★ 赵子龙 Lv.9', tone: 'warn' } }] },
      { type: 'Float', id: 'anchor-hp1', props: { anchorTo: { kind: 'node', id: 'anchor-u1', at: 'bottom', offset: { y: 12 } } },
        children: [{ type: 'ProgressBar', id: 'anchor-hp1b', props: { value: 0.72, tone: 'ok', label: 'HP', showValue: true }, layout: { width: 96 } }] },
      { type: 'Float', id: 'anchor-plate2', props: { anchorTo: { kind: 'node', id: 'anchor-u2', at: 'top', offset: { y: -6 } } },
        children: [{ type: 'Badge', id: 'anchor-p2b', props: { text: '关云长 Lv.8', tone: 'ok' } }] },
      // 连线：赵→关 攻击指向（arrow·danger·带伤害标）+ 关→小兵 关系线（dashed·jade）。
      { type: 'Connector', id: 'anchor-atk', props: { from: { kind: 'node', id: 'anchor-u1', at: 'right' }, to: { kind: 'node', id: 'anchor-u2', at: 'left' }, style: 'arrow', tone: 'danger', label: '−120' } },
      { type: 'Connector', id: 'anchor-rel', props: { from: { kind: 'node', id: 'anchor-u2' }, to: { kind: 'node', id: 'anchor-u3' }, style: 'dashed', tone: 'jade' } },
      { type: 'Label', id: 't-anchor-note', props: { text: 'anchorTo:{kind:node/entity, id, at, offset} —— node=同树 LayoutNode id（现一律用这路·game-g 战场单位本身就是 LayoutNode）；entity=预留契约·生产端未接（2D canvas/3D WebGL 无逐实体 DOM）·别用。render-only·不进 sim/hash。', color: 'dim', size: 'xs' } },
      divider('d-anchor'),

      sectionTitle('t-pc', 'PLAYINGCARD · 扑克牌原语（rank/suit · 正反 · selected/dimmed · 暗卡/白扑克）'),
      { type: 'Panel', id: 'pc-row', props: {}, layout: { direction: 'row', gap: 12, padding: 14, align: 'center' },
        children: [
          pcard('pc-1', { rank: 'A', suit: '♠', label: '赵子龙', value: '9' }),
          pcard('pc-2', { rank: 'K', suit: '♥', label: '关云长', value: '8', selected: true }),
          pcard('pc-3', { rank: 'Q', suit: '♦', label: '未拥有', dimmed: true }),
          pcard('pc-4', { rank: 'J', suit: '♣', faceUp: false }),
          pcard('pc-5', { rank: '10', suit: '♥', face: 'light', label: '白扑克' }),
        ] },

      divider('d-n1'),
      sectionTitle('t-versus', 'VERSUS · 对决卡（左右牌 + 胜方高亮 + 中央火花）'),
      { type: 'Panel', id: 'vs-wrap', props: {}, layout: { direction: 'row', padding: 14, align: 'center' },
        children: [
          { type: 'Versus', id: 'vs-1', props: {
            left: { rank: 'A', suit: '♠', label: '赵子龙' }, right: { rank: 'K', suit: '♥', label: '关云长' },
            label: '76 : 24', winner: 'left' } },
        ] },

      divider('d-n2'),
      sectionTitle('t-coin', 'COINFLIP · 抛硬币（spinning 翻转落定 / 静态结果）'),
      { type: 'Panel', id: 'coin-row', props: {}, layout: { direction: 'row', gap: 28, padding: 14, align: 'center' },
        children: [
          { type: 'CoinFlip', id: 'coin-1', props: { outcome: 'heads', spinning: true, headsLabel: '胜', tailsLabel: '负' } },
          { type: 'CoinFlip', id: 'coin-2', props: { outcome: 'tails', spinning: false, headsLabel: '胜', tailsLabel: '负' } },
        ] },

      divider('d-n3'),
      sectionTitle('t-hero', 'BUTTON · hero 金色倒角 sheen 大 CTA（含副标）'),
      { type: 'Panel', id: 'hero-wrap', props: {}, layout: { direction: 'row', padding: 14, align: 'center' },
        children: [
          { type: 'Button', id: 'btn-hero', props: { label: '出 征', kind: 'hero', sub: '挑战 曹操 · 难度 ★★★', action: 'click', actionArg: 'hero' } },
        ] },

      divider('d-n4'),
      sectionTitle('t-lblnew', 'LABEL · 数字滚动补间 tween + 富文本多段着色 spans'),
      { type: 'Panel', id: 'lbl-new', props: {}, layout: { direction: 'column', gap: 12, padding: 14 },
        children: [
          { type: 'Label', id: 'lbl-tween', props: { text: '', size: 'xl', bold: true, color: 'gold', tween: { from: 0, to: 9820, ms: 1300 } } },
          { type: 'Label', id: 'lbl-spans', props: { text: '', spans: [
            { text: '词条：', color: 'dim' }, { text: '青钢剑', color: 'jade', bold: true },
            { text: ' 攻击 ', color: 'sub' }, { text: '+12', color: 'ok', bold: true },
            { text: ' 暴击 ', color: 'sub' }, { text: '-5', color: 'danger' },
          ] } },
        ] },

      divider('d-n5'),
      sectionTitle('t-panelprops', 'PANEL · bare 无框 / bg 自定义底 + vignette 暗角 / maxWidth 封顶居中'),
      { type: 'Panel', id: 'pp-bare', props: { bare: true }, layout: { direction: 'row', gap: 10 },
        children: [
          { type: 'Badge', id: 'pp-b1', props: { text: 'bare', tone: 'ok' } },
          { type: 'Label', id: 'pp-bl', props: { text: 'bare 容器：无边框/底，只做 row/column 分组（不堆千层框）。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },
      { type: 'Panel', id: 'pp-felt', props: { title: 'bg 自定义底（felt）+ vignette 暗角', bg: { custom: 'linear-gradient(180deg,#16402c,#0e2a1c)' }, vignette: true },
        layout: { direction: 'column', padding: 18, height: 84 },
        children: [{ type: 'Label', id: 'pp-fl', props: { text: '绿呢牌桌底 + 四周渐暗暗角（纯表现）。', color: 'sub', size: 'sm' } }] },
      { type: 'Panel', id: 'pp-maxw', props: { title: 'maxWidth 封顶居中' }, layout: { maxWidth: 360, padding: 14 },
        children: [{ type: 'Label', id: 'pp-ml', props: { text: '窄屏铺满、宽屏封顶 360px 居中（整页 chrome 用）。', color: 'sub', size: 'sm' } }] },

      divider('d-n6'),
      sectionTitle('t-vw', 'VISIBLEWHEN · 条件显隐（数据替代 if/else 重建树）'),
      { type: 'Panel', id: 'vw-wrap', props: {}, layout: { direction: 'column', gap: 10, padding: 14 },
        children: [
          { type: 'Toggle', id: 'vw-tg', props: { label: '显示下方内容（绑 demoFlag）', checked: controls.flag, action: 'setFlag' } },
          { type: 'Label', id: 'vw-target', props: { text: '👋 我由 visibleWhen:"demoFlag" 控制——关掉开关，我就被 resolveBindings 从树里整体剔除（不靠游戏写 if/else 重建）。', color: 'jade', size: 'sm' }, visibleWhen: 'demoFlag' },
        ] },

      divider('d-n7'),
      sectionTitle('t-anim', 'ANIM · 循环环境动效（float 浮动 / glow 发光 / pulse 脉冲·infinite）'),
      { type: 'Panel', id: 'anim-row', props: {}, layout: { direction: 'row', gap: 22, padding: 22, align: 'center' },
        children: [
          { type: 'Badge', id: 'anim-float', props: { text: 'float 浮动', tone: 'ok' }, layout: { anim: 'float' } },
          { type: 'Badge', id: 'anim-glow', props: { text: 'glow 发光', tone: 'warn' }, layout: { anim: 'glow' } },
          { type: 'Badge', id: 'anim-pulse', props: { text: 'pulse 脉冲', tone: 'dim' }, layout: { anim: 'pulse' } },
        ] },

      divider('d-n8'),
      sectionTitle('t-font', 'LABEL · 字体槽 font / 磷光 glow / 字距 tracking'),
      { type: 'Panel', id: 'font-col', props: {}, layout: { direction: 'column', gap: 10, padding: 14 },
        children: [
          { type: 'Label', id: 'font-disp', props: { text: '展示字体 font:display（衬线）· 千军万马避白袍', size: 'lg', bold: true, font: 'display' } },
          { type: 'Label', id: 'font-glow', props: { text: 'GLOW 磷光发光标题', size: 'lg', bold: true, color: 'gold', glow: true } },
          { type: 'Label', id: 'font-track', props: { text: 'T R A C K I N G · 宽字距微标', size: 'sm', color: 'jade', tracking: 3 } },
        ] },

      divider('d-n9'),
      sectionTitle('t-chamfer', 'CHAMFER · 倒角切角（clip-path 八边形·art-deco/扑克美学）'),
      { type: 'Panel', id: 'cham-row', props: {}, layout: { direction: 'row', gap: 16, padding: 18, align: 'center' },
        children: [
          { type: 'Panel', id: 'cham-1', props: { bg: { custom: 'linear-gradient(180deg,#1c2a44,#101826)' } }, layout: { chamfer: 14, padding: 16 },
            children: [{ type: 'Label', id: 'cham-l', props: { text: 'chamfer:14 切角面板', color: 'sub', size: 'sm' } }] },
          { type: 'Button', id: 'cham-btn', props: { label: '切角 CTA', kind: 'primary', action: 'click', actionArg: 'chamfer' }, layout: { chamfer: 10 } },
        ] },

      divider('d-shape'),
      sectionTitle('t-shape', 'BUTTON.shape · 异形按钮（闭集 ShapeToken·引擎预置 clip-path·弱 LLM 只选名·非自由坐标）'),
      { type: 'Panel', id: 'shape-row', props: {}, layout: { direction: 'grid', cols: 4, gap: 14, padding: 18 },
        children: ([
          ['pill', '胶囊', 'primary'], ['hexagon', '六边', 'hero'], ['diamond', '菱形', 'primary'],
          ['shield', '盾徽', 'hero'], ['ribbon', '绶带', 'primary'], ['chevron', '前进 ▶', 'ghost'],
          ['tag', '标签', 'ghost'], ['cut', '切角', 'primary'],
        ] as const).map(([shape, label, kind]): LayoutNode => ({
          type: 'Button', id: `shape-${shape}`,
          props: { label, kind, shape, action: 'click', actionArg: shape },
          // 异形须给足宽高避免裁掉文字（六边/菱形尤其）——见 catalog shape describe。
          layout: { width: 108, height: 54 },
        })) },

      divider('d-panelshadow'),
      sectionTitle('t-panelshadow', 'PANEL.shadow · 硬边平移投影（REQ-108-UI-03·卡通"浮空感"基件·闭集 {y,color}·非模糊阴影·非贴图）'),
      { type: 'Label', id: 'panelshadow-note', props: {
        text: '卡通 UI 的立体浮空全靠一条硬边偏移投影（box-shadow:0 <y>px 0 <color>）。以前要么手搓 CSS、要么每块面生成一张带投影的 SVG 贴皮。现在是 Panel 的闭集数据字段：y=下沉像素、color 优先填 SurfaceToken（换皮自适应）。稿子体系：身份牌 y=4 / 相位牌 y=5 / 招式卡 y=7 / 主 CTA y=8。', color: 'sub', size: 'sm' } },
      { type: 'Panel', id: 'panelshadow-row', props: {}, layout: { direction: 'grid', cols: 4, gap: 20, padding: 22 },
        children: ([
          { label: '你', y: 4, color: 'jade', edge: 'jade' },
          { label: '蓄力', y: 5, color: 'gold', edge: 'gold' },
          { label: '复读机', y: 7, color: 'danger', edge: 'danger' },
          { label: '开 始', y: 8, edge: 'gold' },
        ] as Array<{ label: string; y: number; color?: 'jade' | 'gold' | 'danger'; edge: 'jade' | 'gold' | 'danger' }>)
          .map(({ label, y, color, edge }): LayoutNode => ({
            type: 'Panel', id: `pshadow-${label}`,
            props: { edge, shadow: { y, ...(color ? { color } : {}) } },
            layout: { direction: 'column', align: 'center', justify: 'center', width: 132, height: 76, radius: 12 },
            children: [
              { type: 'Label', id: `pshadow-l-${label}`, props: { text: label, size: 'lg', bold: true, font: 'cnround', color: 'text' } },
              { type: 'Label', id: `pshadow-y-${label}`, props: { text: `shadow.y=${y}`, size: 'sm', color: 'sub' } },
            ],
          })) },
      { type: 'Label', id: 'panelshadow-cmp', props: { text: '对照：无 shadow 的面板贴在底面上、没有浮空感（下面这块）。同一块面加 shadow:{y:6} 就"抬"起来了。', size: 'sm', color: 'sub' } },
      { type: 'Panel', id: 'panelshadow-flat', props: { edge: 'jade' }, layout: { direction: 'row', gap: 16, padding: 14, align: 'center' },
        children: [
          { type: 'Panel', id: 'pshadow-flat-a', props: { bg: 'raised' }, layout: { width: 120, height: 56, align: 'center', justify: 'center', radius: 10 },
            children: [{ type: 'Label', id: 'pshadow-flat-al', props: { text: '无投影', color: 'sub', size: 'sm' } }] },
          { type: 'Panel', id: 'pshadow-flat-b', props: { bg: 'raised', shadow: { y: 6, color: '#14776a' } }, layout: { width: 120, height: 56, align: 'center', justify: 'center', radius: 10 },
            children: [{ type: 'Label', id: 'pshadow-flat-bl', props: { text: 'shadow y=6', color: 'text', size: 'sm', bold: true } }] },
        ] },

      divider('d-skin'),
      sectionTitle('t-skin', 'BUTTON.skin · 贴图按钮（资产 key→uiTextureUrl 解析→已解析 URL·入库自 public/games/game-i/art·配 shape=异形贴图键）'),
      { type: 'Panel', id: 'skin-row', props: {}, layout: { direction: 'grid', cols: 4, gap: 14, padding: 18 },
        children: ([
          ['sk-metal', '金属板', SKIN_METAL_URL, undefined], ['sk-wood-rib', '木纹绶带', SKIN_WOOD_URL, 'ribbon'],
          ['sk-stone-hex', '石纹六边', SKIN_STONE_URL, 'hexagon'], ['sk-scroll-tag', '卷轴标签', SKIN_SCROLL_URL, 'tag'],
          ['sk-metal-sh', '金属盾', SKIN_METAL_URL, 'shield'], ['sk-wood-cut', '木纹切角', SKIN_WOOD_URL, 'cut'],
          ['sk-stone-dia', '石纹菱形', SKIN_STONE_URL, 'diamond'], ['sk-scroll-pill', '卷轴胶囊', SKIN_SCROLL_URL, 'pill'],
        ] as const).map(([id, label, skin, shape]): LayoutNode => ({
          type: 'Button', id,
          props: { label, skin, ...(shape ? { shape } : {}), action: 'click', actionArg: id },
          layout: { width: 150, height: 60 },
        })) },
      { type: 'Label', id: 't-skin-vendored', props: { text: '↓ 卡通风格按钮 · vendored 自 Kenney UI Pack（CC0）· scripts/vendor-asset.mjs 从共享货架搬进本地库 · 带 vendoredFrom 溯源', size: 'sm', color: 'sub' } },
      { type: 'Panel', id: 'skin-kenney-row', props: {}, layout: { direction: 'grid', cols: 5, gap: 14, padding: 18 },
        children: ([
          ['sk-k-blue', '蓝', BTN_BLUE_URL], ['sk-k-green', '绿', BTN_GREEN_URL], ['sk-k-red', '红', BTN_RED_URL],
          ['sk-k-yellow', '黄', BTN_YELLOW_URL], ['sk-k-grey', '灰', BTN_GREY_URL],
        ] as const).map(([id, label, skin]): LayoutNode => ({
          type: 'Button', id, props: { label, skin, action: 'click', actionArg: id },
          layout: { width: 140, height: 44 }, // 贴合 Kenney 190×48 原始比例
        })) },
      { type: 'Label', id: 't-skin-styles', props: { text: '同包不同款式（弱 LLM 换 skin key 即换风格·数据不改结构）：圆润 / 高光 / 描边幽灵', size: 'xs', color: 'dim' } },
      { type: 'Panel', id: 'skin-style-row', props: {}, layout: { direction: 'grid', cols: 3, gap: 14, padding: 18 },
        children: ([
          ['sk-s-round', '圆润 round', BTN_ROUND_URL], ['sk-s-glossy', '高光 glossy', BTN_GLOSSY_URL], ['sk-s-ghost', '描边 ghost', BTN_GHOST_URL],
        ] as const).map(([id, label, skin]): LayoutNode => ({
          type: 'Button', id, props: { label, skin, action: 'click', actionArg: id },
          layout: { width: 150, height: 46 },
        })) },
      { type: 'Label', id: 't-skin-card', props: { text: '贴图=一张卡的按钮（skin 直接贴一张卡牌图·牌面即按钮·卡牌比例·fluentui 卡牌·MIT）', size: 'xs', color: 'dim' } },
      { type: 'Panel', id: 'skin-card-row', props: { bare: true }, layout: { direction: 'row', gap: 16, padding: 18, align: 'center' },
        children: [
          { type: 'Button', id: 'sk-card-joker', props: { label: '', skin: CARD_JOKER_URL, action: 'click', actionArg: 'card-joker' }, layout: { width: 120, height: 168 } },
          { type: 'Button', id: 'sk-card-flower', props: { label: '', skin: CARD_FLOWER_URL, action: 'click', actionArg: 'card-flower' }, layout: { width: 120, height: 168 } },
          { type: 'Button', id: 'sk-card-play', props: { label: '出 王牌', skin: CARD_JOKER_URL, action: 'click', actionArg: 'card-play' }, layout: { width: 120, height: 168 } },
        ] },
      { type: 'Label', id: 't-skin-9slice', props: { text: '9-slice 无损缩放（skinSlice=源边距 px）：cover 拉大糊角（左）vs 九宫格四角始终清晰（右）——商业 UI 皮标配', size: 'xs', color: 'dim' } },
      { type: 'Panel', id: 'skin-9slice-row', props: { bare: true }, layout: { direction: 'row', gap: 24, padding: 18, align: 'center' },
        children: [
          { type: 'Button', id: 'sk-9-cover', props: { label: 'cover 糊角', skin: BTN_BLUE_URL, action: 'click', actionArg: '9-cover' }, layout: { width: 180, height: 110 } },
          { type: 'Button', id: 'sk-9-slice', props: { label: '9-slice 清晰', skin: BTN_GREEN_URL, skinSlice: 9, action: 'click', actionArg: '9-slice' }, layout: { width: 180, height: 110 } },
          { type: 'Button', id: 'sk-9-big', props: { label: '任意尺寸不变形', skin: BTN_GREEN_URL, skinSlice: 9, action: 'click', actionArg: '9-big' }, layout: { width: 240, height: 72 } },
        ] },

      { type: 'Label', id: 't-skin-alpha', props: { text: '带透明色的贴图（透明处 see-through）：默认框面=不透明底吃掉透明（左·间隙显面色）vs bg:"transparent" 令牌=透明底保边框透见身后（右·间隙透见彩底）。贴图按钮/Image 本就透明·框面加此令牌即可。', size: 'xs', color: 'dim' } },
      // 彩色底衬（custom 渐变）→ 上面两块框面各铺同一张「金片+透明间隙」贴图：左默认底吃掉透明、右 transparent 令牌透见彩底。
      { type: 'Panel', id: 'skin-alpha-wrap', props: { bg: { custom: 'linear-gradient(120deg,#22d3ee,#7c3aed 55%,#ec4899)' } }, layout: { direction: 'row', gap: 22, padding: 20, align: 'center' },
        children: [
          { type: 'Panel', id: 'alpha-opaque', props: { title: '默认底(吃透明)', bgTexture: ALPHA_TILE_URI, bgTextureSize: 34 }, layout: { width: 190, height: 120, padding: 10 }, children: [] },
          { type: 'Panel', id: 'alpha-see', props: { title: 'bg:transparent(透见)', bg: 'transparent', bgTexture: ALPHA_TILE_URI, bgTextureSize: 34 }, layout: { width: 190, height: 120, padding: 10 }, children: [] },
          { type: 'Button', id: 'alpha-skinbtn', props: { label: '皮·透明角', skin: BTN_ROUND_URL, action: 'click', actionArg: 'alpha-skin' }, layout: { width: 120, height: 120 } },
        ] },

      divider('d-3d'),
      sectionTitle('t-3d-ptr', 'LAYOUT · 3D UI 表达 → 已独立成「🧊 3D UI」子 tab（透视倾斜 / 景深叠层 / 3D 旋转木马 / 真 3D 翻面卡 / tilt3d 悬停抬起）'),
      { type: 'Panel', id: '3d-ptr', props: { bg: 'sunken' }, layout: { direction: 'row', gap: 10, padding: 14, align: 'center' },
        children: [
          { type: 'Badge', id: '3d-ptr-b', props: { text: '🧊 3D UI', tone: 'accent' } },
          { type: 'Label', id: '3d-ptr-l', props: { text: 'CSS-3D 通用化的 3D UI 控件已聚到上方「🧊 3D UI」标签页——点过去看完整一组。', color: 'sub', size: 'sm' } },
        ] },

      divider('d-cartoon'),
      sectionTitle('t-cartoon', 'IMAGE · 卡通美术画廊（vendored 自 undraw·MIT·内容丰富的彩色卡通场景插画·按资产 key 解析喂 Image）'),
      { type: 'Panel', id: 'cartoon-row', props: {}, layout: { direction: 'grid', cols: 3, gap: 12, padding: 16 },
        children: ([
          [CARTOON_ASTRO, '宇航员'], [CARTOON_CAT, '顽皮猫'], [CARTOON_DOG, '遛狗'],
          [CARTOON_CAMP, '露营'], [CARTOON_GAME, '游戏手柄'], [CARTOON_MUSIC, '听歌起舞'],
          [CARTOON_BDAY, '生日气球'], [CARTOON_ROBOT, '机器人'], [CARTOON_TRAVEL, '邮轮旅行'],
        ] as const).map(([url, label]): LayoutNode => ({
          type: 'Panel', id: `ct-${label}`, props: { bg: 'sunken' }, layout: { direction: 'column', gap: 4, padding: 8, align: 'center' },
          children: [
            { type: 'Image', id: `ct-img-${label}`, props: { src: url, alt: label, fit: 'contain', radius: 8 }, layout: { width: 200, height: 128 } },
            { type: 'Label', id: `ct-lbl-${label}`, props: { text: label, size: 'xs', color: 'sub' } },
          ],
        })) },

      divider('d-fill'),
      sectionTitle('t-fill-preset', 'PANEL.bg · 预设配色（FillPreset·8 组主动配色·引擎内建·固定观感·owner 2026-07-04 拍板）'),
      { type: 'Panel', id: 'fill-preset-row', props: {}, layout: { direction: 'grid', cols: 4, gap: 12, padding: 16 },
        children: ([
          ['jade-sheen', '青玉'], ['gold-sheen', '金铜'], ['ink-deep', '深墨'], ['steel', '冷钢'],
          ['blood', '暗红'], ['frost', '冰蓝'], ['ember', '橙炭'], ['void', '幽紫'],
        ] as const).map(([preset, label]): LayoutNode => ({
          type: 'Panel', id: `fp-${preset}`, props: { bg: preset }, layout: { height: 56, padding: 12, align: 'center', justify: 'center' },
          children: [{ type: 'Label', id: `fp-${preset}-l`, props: { text: `${label} · ${preset}`, size: 'sm', bold: true, color: 'text' } }],
        })) },
      sectionTitle('t-fill-token', 'PANEL.bg · 语义令牌（SurfaceToken·映射主题·换皮自适应）＋ {custom} 显式逃生'),
      { type: 'Panel', id: 'fill-token-row', props: {}, layout: { direction: 'grid', cols: 5, gap: 12, padding: 16 },
        children: ([
          ['panel', '面'], ['raised', '凸起'], ['sunken', '凹陷'], ['jade', '青玉washed'], ['gold', '金'],
        ] as const).map(([tok, label]): LayoutNode => ({
          type: 'Panel', id: `ft-${tok}`, props: { bg: tok }, layout: { height: 48, padding: 10, align: 'center', justify: 'center' },
          children: [{ type: 'Label', id: `ft-${tok}-l`, props: { text: `${label}·${tok}`, size: 'xs', color: 'sub' } }],
        })).concat([{
          type: 'Panel', id: 'ft-custom', props: { bg: { custom: 'repeating-linear-gradient(45deg,#3a2a5a 0 8px,#2a1a4a 8px 16px)' } },
          layout: { height: 48, padding: 10, align: 'center', justify: 'center' },
          children: [{ type: 'Label', id: 'ft-custom-l', props: { text: '{custom}·特别指定', size: 'xs', color: 'text' } }],
        }]) },

      divider('d-n10'),
      sectionTitle('t-grid', 'PANEL · cols 固定列数 grid + justify 主轴分布'),
      { type: 'Panel', id: 'grid-cols', props: { title: 'grid · cols:4（严格 4 列等分·消空隙）' }, layout: { direction: 'grid', cols: 4, gap: 8, padding: 14 },
        children: [1, 2, 3, 4, 5, 6, 7, 8].map((n): LayoutNode => ({ type: 'Badge', id: `gc-${n}`, props: { text: `格 ${n}`, tone: 'dim' } })) },
      { type: 'Panel', id: 'just-row', props: { title: 'flex row · justify:between（两端对齐均分）' }, layout: { direction: 'row', justify: 'between', padding: 14 },
        children: [
          { type: 'Badge', id: 'jr-1', props: { text: '左', tone: 'ok' } },
          { type: 'Badge', id: 'jr-2', props: { text: '中', tone: 'warn' } },
          { type: 'Badge', id: 'jr-3', props: { text: '右', tone: 'dim' } },
        ] },
      { type: 'Panel', id: 'fluid-grid', props: { title: 'cols:5 + PlayingCard.fluid（卡填满格·5:7 比例·零卡间空隙）' }, layout: { direction: 'grid', cols: 5, gap: 6, padding: 14 },
        children: ([['A', '♠'], ['K', '♥'], ['Q', '♦'], ['J', '♣'], ['10', '♠']] as const).map(([r, s], i): LayoutNode =>
          ({ type: 'PlayingCard', id: `fl-${i}`, props: { rank: r, suit: s, fluid: true } })) },

      divider('d-n11'),
      sectionTitle('t-flip', 'PLAYINGCARD · flipOnHover 悬停翻面（鼠标悬停露背面信息子树）'),
      { type: 'Panel', id: 'flip-row', props: {}, layout: { direction: 'row', padding: 14, align: 'center' },
        children: [
          { type: 'PlayingCard', id: 'flip-1', props: {
            rank: 'A', suit: '♠', label: '赵子龙', size: 'lg', flipOnHover: true,
            backFace: { type: 'Panel', id: 'flip-back', props: { bare: true }, layout: { direction: 'column', gap: 4 },
              children: [
                { type: 'Label', id: 'fb-1', props: { text: '赵子龙', color: 'jade', bold: true, size: 'sm' } },
                { type: 'Label', id: 'fb-2', props: { text: '蜀 · 五虎上将', color: 'sub', size: 'xs' } },
                { type: 'Label', id: 'fb-3', props: { text: '长坂坡七进七出。', color: 'dim', size: 'xs' } },
              ] },
          } },
          { type: 'Label', id: 'flip-hint', props: { text: '← 鼠标悬停这张牌看它翻面（front→back scaleX 翻转·CSS 内建）。', color: 'dim', size: 'sm' }, layout: { flex: 1 } },
        ] },

      divider('d-n12'),
      sectionTitle('t-bigtext', 'LABEL · 大标题档 size:xxl(28) / xxxl(34)（原版 felt 标题 34px）'),
      { type: 'Panel', id: 'big-col', props: {}, layout: { direction: 'column', gap: 8, padding: 14 },
        children: [
          { type: 'Label', id: 'big-xxl', props: { text: '群英荟萃 · xxl 28px', size: 'xxl', bold: true, color: 'gold' } },
          { type: 'Label', id: 'big-xxxl', props: { text: '三 国 杀 · xxxl 34px', size: 'xxxl', bold: true, color: 'jade', font: 'display' } },
          { type: 'Label', id: 'big-cmp', props: { text: '对比：xl 22px 副标题（旧上限）', size: 'xl', color: 'sub' } },
        ] },

      sectionTitle('t-multiline', 'LABEL · 多行文本（text 含 \\n → white-space:pre-line 真换行·手册/多段说明用）'),
      { type: 'Panel', id: 'ml-col', props: {}, layout: { direction: 'column', gap: 8, padding: 14 },
        children: [
          { type: 'Label', id: 'ml-1', props: {
            text: '第一行：一份 Label 用 \\n 直接排多行。\n第二行：不再被迫拆成 N 个 Label 堆容器。\n第三行：帮助手册/物品说明/对话段落，一个字段搞定。',
            color: 'sub', size: 'sm' } },
        ] },

      divider('d-n13'),
      sectionTitle('t-pattern', 'PANEL · pattern 程序化纹理叠层（stripe 斜纹 / checker 棋盘·felt 牌桌质感）'),
      { type: 'Panel', id: 'pat-row', props: {}, layout: { direction: 'row', gap: 14, padding: 14 },
        children: [
          { type: 'Panel', id: 'pat-stripe', props: { title: 'stripe 45°斜纹', bg: { custom: 'linear-gradient(180deg,#16402c,#0e2a1c)' }, pattern: 'stripe' },
            layout: { direction: 'column', padding: 16, height: 76, flex: 1 },
            children: [{ type: 'Label', id: 'pat-sl', props: { text: '绿呢底叠斜条纹（纯 CSS·零贴图）。', color: 'sub', size: 'sm' } }] },
          { type: 'Panel', id: 'pat-checker', props: { title: 'checker 棋盘格', bg: { custom: 'linear-gradient(180deg,#2a1c40,#16102a)' }, pattern: 'checker' },
            layout: { direction: 'column', padding: 16, height: 76, flex: 1 },
            children: [{ type: 'Label', id: 'pat-cl', props: { text: '紫底叠棋盘格纹理。', color: 'sub', size: 'sm' } }] },
        ] },

      divider('d-n14'),
      sectionTitle('t-backpat', 'PLAYINGCARD · backPattern 牌背纹理（原版红牌背棋盘格/斜纹）'),
      { type: 'Panel', id: 'backpat-row', props: {}, layout: { direction: 'row', gap: 12, padding: 14, align: 'center' },
        children: [
          pcard('bp-1', { rank: 'A', suit: '♠', faceUp: false, backPattern: 'checker', size: 'md' }),
          pcard('bp-2', { rank: 'K', suit: '♥', faceUp: false, backPattern: 'stripe', size: 'md' }),
          pcard('bp-3', { rank: 'Q', suit: '♦', faceUp: false, size: 'md' }),
          { type: 'Label', id: 'bp-hint', props: { text: '← checker / stripe / 无纹理 三张牌背对比（faceUp:false 时叠）。', color: 'dim', size: 'sm' }, layout: { flex: 1 } },
        ] },

      divider('d-n15'),
      sectionTitle('t-sheen', 'SHEEN · 流光扫过（layout.sheen·斜向湿润反光循环·原 hero 内建通用化）'),
      { type: 'Panel', id: 'sheen-row', props: {}, layout: { direction: 'row', gap: 16, padding: 18, align: 'center' },
        children: [
          { type: 'Button', id: 'sheen-btn', props: { label: '流光按钮', kind: 'primary', action: 'click', actionArg: 'sheen' }, layout: { sheen: true } },
          { type: 'Panel', id: 'sheen-card', props: { bg: { custom: 'linear-gradient(180deg,#1c2a44,#101826)' } }, layout: { sheen: true, chamfer: 12, padding: 16 },
            children: [{ type: 'Label', id: 'sheen-cl', props: { text: 'sheen 切角卡：一道流光斜扫而过。', color: 'sub', size: 'sm' } }] },
        ] },

      divider('d-n16'),
      sectionTitle('t-pixel', 'LABEL · font:pixel 像素字体（REQ-UI-fontPixel令牌·已落地·不再静默回退）'),
      { type: 'Panel', id: 'pixel-col', props: {}, layout: { direction: 'column', gap: 8, padding: 14 },
        children: [
          { type: 'Label', id: 'pixel-l', props: { text: 'PIXEL 8-BIT 像素标题 1942', size: 'lg', bold: true, color: 'jade', font: 'pixel' } },
          { type: 'Label', id: 'pixel-l2', props: { text: 'font:pixel · 复古街机/像素风（SHELL fontPixel 令牌已补默认值）', size: 'sm', color: 'sub', font: 'pixel' } },
        ] },

      divider('d-fontwall'),
      sectionTitle('t-artfont', 'LABEL · 艺术字体墙（内嵌 Google Fonts·OFL 开源·18 款闭集艺术字·真渲染不回退）'),
      { type: 'Label', id: 'artfont-note', props: {
        text: '之前 font 槽只是字体名栈、靠系统装字（多数机器回退成单调系统字）。现在 18 款艺术字 woff2 已 base64 内嵌 @font-face——真渲染、离线自带。中文/缺字自动回退主字体。', color: 'sub', size: 'sm' } },
      { type: 'Panel', id: 'artfont-wall', props: {}, layout: { direction: 'column', gap: 6, padding: 16 },
        children: ([
          ['impact', 'IMPACT · Bebas Neue 冲击标题', 'gold'],
          ['heavy', 'HEAVY · Anton 厚重海报字', 'text'],
          ['epic', 'EPIC · Cinzel 史诗罗马衬线', 'gold'],
          ['fantasy', 'FANTASY · MedievalSharp 奇幻 RPG', 'jade'],
          ['elegant', 'Elegant · Playfair Display 优雅高衬线', 'text'],
          ['script', 'Script · Pacifico 花体手写', 'jade'],
          ['hand', 'Hand · Caveat 随性手写便签', 'sub'],
          ['scifi', 'SCIFI · Orbitron 科幻界面 2026', 'ok'],
          ['terminal', 'TERMINAL · VT323 复古终端 > run', 'ok'],
          ['comic', 'COMIC · Bangers 漫画拟声 BOOM!', 'warn'],
          ['stencil', 'STENCIL · Black Ops One 军械镂空', 'text'],
          ['western', 'WESTERN · Rye 西部通缉令', 'gold'],
          ['retro', 'RETRO · Monoton 复古霓虹', 'jade'],
          ['marker', 'Marker · Permanent Marker 记号笔涂鸦', 'danger'],
          ['bubbly', 'BUBBLY · Baloo 2 圆润可爱', 'ok'],
          ['gothic', 'Gothic · Pirata One 哥特海盗', 'text'],
          ['fashion', 'Fashion · Abril Fatface 时尚粗衬', 'gold'],
          ['shadow', 'SHADOW · Bungee Shade 立体投影', 'jade'],
        ] as const).map(([f, txt, color]): LayoutNode => ({
          // 每款字一行：左=子编号（普通字·好读）+ 右=艺术字样张。owner 可按号跟美术点名换某款字。
          type: 'Panel', id: `afr-${f}`, props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 12 },
          children: [
            { type: 'Label', id: `afn-${f}`, props: { text: `#${nextSubNo()}`, size: 'sm', color: 'gold', bold: true }, layout: { width: 52 } },
            { type: 'Label', id: `af-${f}`, props: { text: txt, size: 'xl', font: f, color } },
          ],
        })) },

      divider('d-cjkfont'),
      sectionTitle('t-cjkfont', 'LABEL · CJK 艺术字（内嵌 SIL OFL 中/日字·**能渲汉字/假名**·url 惰性载·owner 2026-07-23）'),
      { type: 'Label', id: 'cjkfont-note', props: {
        text: '前 18 款艺术字皆拉丁字形（贴 CJK 自动回退主字体）。这 5 款是真 CJK 字体，能把「雀宴」这类汉字/假名渲成毛笔/文艺/楷体/卡通粗圆黑。woff2 子集化（只留 src 用到的字 + 全假名）·浏览器按需惰性下载（只在真用时拉那一个）。', color: 'sub', size: 'sm' } },
      { type: 'Panel', id: 'cjkfont-wall', props: {}, layout: { direction: 'column', gap: 8, padding: 16 },
        children: ([
          ['cnbrush', '雀宴 · 中文毛笔行楷 · 東南西北發財', 'gold'],
          ['cnwen', '雀宴 · 中文文艺细宋 · 立直門前清', 'text'],
          ['cnround', '雀宴 · 中文卡通粗圆黑 · 欢迎来到雨夜书斋', 'danger'],
          ['jpbrush', '雀宴 · 日文毛筆明朝 · リーチ一発ツモ', 'jade'],
          ['jppen', '雀宴 · 日文楷書ペン · 麻雀あがり', 'ok'],
        ] as const).map(([f, txt, color]): LayoutNode => ({
          type: 'Panel', id: `cjkr-${f}`, props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 12 },
          children: [
            { type: 'Label', id: `cjkn-${f}`, props: { text: `#${nextSubNo()}`, size: 'sm', color: 'gold', bold: true }, layout: { width: 52 } },
            { type: 'Label', id: `cjk-${f}`, props: { text: txt, size: 'xl', font: f, color } },
          ],
        })) },

      divider('d-roundfont'),
      sectionTitle('t-roundfont', 'LABEL · font:round · 圆润数字艺术字 Fredoka（REQ-108-UI-06·可变字重 300–700·url 惰性载·配 cnround 成卡通底色）'),
      { type: 'Label', id: 'roundfont-note', props: {
        text: '拉丁圆润里 bubbly(Baloo 2) 之外补 round(Fredoka)：数字骨架不同（4/7 尤其），大字号（伤害大数）下更贴卡通稿。可变字体一颗 woff2 覆 300–700 全字重·bold→700·url 惰性载（主 bundle 零增·非 base64 常驻）。', color: 'sub', size: 'sm' } },
      { type: 'Panel', id: 'roundfont-wall', props: {}, layout: { direction: 'column', gap: 10, padding: 16 },
        children: [
          { type: 'Panel', id: 'rf-big', props: { bare: true }, layout: { direction: 'row', align: 'end', gap: 20 },
            children: [
              { type: 'Label', id: 'rf-dmg', props: { text: '140', size: 'xxxl', bold: true, font: 'round', color: 'gold' } },
              { type: 'Label', id: 'rf-hp', props: { text: '血量 100 · 3/3 · ⏱ 09', size: 'xl', bold: true, font: 'round', color: 'text' } },
            ] },
          { type: 'Panel', id: 'rf-cmp', props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 24 },
            children: [
              { type: 'Label', id: 'rf-a', props: { text: 'round(Fredoka) 0123456789', size: 'lg', bold: true, font: 'round', color: 'jade' } },
              { type: 'Label', id: 'rf-b', props: { text: 'bubbly(Baloo 2) 0123456789', size: 'lg', bold: true, font: 'bubbly', color: 'sub' } },
            ] },
        ] },

      divider('d-n17'),
      sectionTitle('t-fx', 'FX · UI 特效库（库 A·layout.fx 闭集合集·可叠加·render-only CSS·一个字段一串特效）'),
      { type: 'Label', id: 'fx-note', props: {
        text: '特效架构「库 A」：UI 元素的自我动画。layout.fx:[{kind,color,ms,intensity,once}] —— 闭集 7 个 kind，绝不每效一个布尔开关。与「库 B·战场粒子特效」正交（见展台 💥 战场特效模块）。', color: 'sub', size: 'sm' } },
      { type: 'Panel', id: 'fx-kinds', props: { title: '7 个 kind 各来一发（循环态·状态特效）' }, layout: { direction: 'row', gap: 14, align: 'center', padding: 18 },
        children: [
          { type: 'Badge', id: 'fx-pulse', props: { text: 'pulse 呼吸', tone: 'ok' }, layout: { fx: [{ kind: 'pulse' }] } },
          { type: 'Badge', id: 'fx-float', props: { text: 'float 浮动', tone: 'ok' }, layout: { fx: [{ kind: 'float' }] } },
          { type: 'Badge', id: 'fx-shake', props: { text: 'shake 抖动', tone: 'warn' }, layout: { fx: [{ kind: 'shake', intensity: 1.4 }] } },
          { type: 'Badge', id: 'fx-pop', props: { text: 'pop 弹', tone: 'accent' }, layout: { fx: [{ kind: 'pop' }] } },
          { type: 'Badge', id: 'fx-glow', props: { text: 'glow 发光', tone: 'warn' }, layout: { fx: [{ kind: 'glow', color: 'gold' }] } },
          { type: 'Badge', id: 'fx-sheen', props: { text: 'sheen 流光', tone: 'dim' }, layout: { fx: [{ kind: 'sheen' }] } },
          { type: 'Badge', id: 'fx-flash', props: { text: 'flash 闪色', tone: 'danger' }, layout: { fx: [{ kind: 'flash', color: 'danger' }] } },
        ] },
      { type: 'Panel', id: 'fx-stack', props: { title: '叠加（一个字段挂多效·战斗反馈）' }, layout: { direction: 'row', gap: 20, align: 'center', padding: 18 },
        children: [
          { type: 'PlayingCard', id: 'fx-hit', props: { rank: 'K', suit: '♥', label: '受击', size: 'md' },
            layout: { fx: [{ kind: 'shake', intensity: 1.6 }, { kind: 'flash', color: 'danger' }] } },
          { type: 'Label', id: 'fx-hit-l', props: { text: 'fx:[shake + flash danger] —— 受击：抖 + 冒红，同字段两效叠加。', color: 'sub', size: 'sm' } },
          { type: 'PlayingCard', id: 'fx-buff', props: { rank: 'A', suit: '♠', label: 'BUFF', size: 'md' },
            layout: { fx: [{ kind: 'glow', color: 'gold' }, { kind: 'pulse' }] } },
          { type: 'Label', id: 'fx-buff-l', props: { text: 'fx:[glow gold + pulse] —— 增益：金光 + 呼吸，transform 与 filter 正交叠。', color: 'sub', size: 'sm' } },
        ] },
    ],
  };
}

// ── 页 · 3D UI 表达（CSS-3D 通用化·把 rotateX/Y/z/perspective/翻面 组合成一组 3D 数据控件）─────────
// 全是既有 LayoutConstraints（rotateX/rotateY/z/perspective/tilt3d）+ PlayingCard.flipOnHover 的**重组**，
// 无新引擎能力（showcase 职责=把底座能力排成活样例）。控件仍是纯数据·经真 UI 库渲染·UI 铁律。
// ── 页 9 · 3D 按钮布局（owner 2026-09 点名）───────────────────────────────────
// 定位：既有「🧊 3D UI」页是**逐字段隔离演示**（一段演一个 rotateY/z/press3d）；本页是**布局样板**——
//   「一组按钮到底怎么摆成菜单」。六种排布，全是现成闭集字段的组合（零新控件·零自由 CSS）：
//   layout.rotate/rotateX/rotateY/z/scale/tilt3d/press3d + Button.kind/shape/sub/icon + Panel.shadow/edge/bg。
// 照抄法：复制那一段的 children 数组，只改 label/action 与那两三个数字。
function buildPage3dButtons(): LayoutNode {
  // 一颗菜单钮的统一底座：kind 定皮、宽度统一（竖排菜单不随字长变宽·手册「统一等宽」律）。
  const btn = (id: string, label: string, kind: 'hero' | 'primary' | 'ghost' | 'quiet', extra: Record<string, unknown> = {}, lay: Record<string, unknown> = {}): LayoutNode =>
    ({ type: 'Button', id, props: { label, kind, action: 'click', actionArg: id, ...extra }, layout: { width: 150, height: 48, ...lay } });
  const note = (id: string, text: string): LayoutNode =>
    ({ type: 'Label', id, props: { text, color: 'sub', size: 'sm' }, layout: { flex: 1 } });

  return {
    type: 'Panel', id: 'page-3dbtn', props: { scroll: true },
    layout: { direction: 'column', gap: 18, padding: 20 },
    children: [
      { type: 'Label', id: '3dbtn-intro', props: {
        text: '3D 按钮「布局」样板——不是再演一遍 rotateY 是什么，而是「一组按钮怎么摆」。六种排布各配适用场景；全部只用现成字段组合（rotate/rotateX/rotateY/z/scale/press3d + Button.kind/shape/sub + Panel.shadow），零新控件、零自由 CSS。照抄=复制 children 数组、改 label/action 与那两三个数字。',
        color: 'text', size: 'sm' } },

      // ① 弧形扇出 —— 绕屏幕 Z 轴转（rotate），不是 3D，但最像「手柄/技能扇」。
      divider('d-3b1'),
      sectionTitle('t-3dbtn-arc', '① 弧形扇出菜单（LAYOUT.rotate + y 偏移 → 拇指弧·技能扇）'),
      // ⚠ 弧必须走**绝对定位**：x/y 同时给。只给 y 不给 x → 元素仍是 absolute 但 left 未定，
      //   五颗会叠在同一处（ui-audit 当场报 10 处重叠——本段初版真踩过）。这条是本页最值钱的一课。
      { type: 'Panel', id: '3db-arc', props: { bare: true }, layout: { width: 664, height: 148, padding: 4 },
        children: ([['攻击', -14, 12, 62], ['技能', -7, 144, 26], ['必杀', 0, 276, 8], ['道具', 7, 408, 26], ['撤退', 14, 540, 62]] as const)
          .map(([label, rot, x, y], i): LayoutNode =>
            btn(`ab-${i}`, label, i === 2 ? 'hero' : 'primary', { shape: 'pill' }, { width: 104, height: 44, rotate: rot, x, y })),
      },
      { type: 'Panel', id: '3db-arc-n', props: { bare: true }, layout: { direction: 'row', padding: 4 },
        children: [note('3db-arc-l', '拇指可达的弧：中间 rotate:0 最高，两翼逐级 ±7/±14° 并沿 y 下沉。⚠ 关键：弧要 x/y **成对**给（只给 y 会让五颗叠成一摞——layout.y 是绝对定位不是相对偏移）。旋转会撑大包围盒，x 间距留足（这里 132 > 旋转后的 111）。移动端「技能扇/表情轮」标配。')] },

      // ② 景深主菜单 —— z 让主 CTA 真的「凸出来」。
      divider('d-3b2'),
      sectionTitle('t-3dbtn-depth', '② 景深主菜单（LAYOUT.z + scale → 主 CTA 凸出·次级后退）'),
      { type: 'Panel', id: '3db-depth', props: { bare: true }, layout: { direction: 'column', gap: 12, padding: 26, align: 'center', perspective: 900 },
        children: [
          btn('db-start', '开始游戏', 'hero', { sub: '继续第 12 关' }, { width: 190, height: 58, z: 60, scale: 1.06 }),
          btn('db-shop', '商店', 'primary', {}, { width: 165, z: 10 }),
          btn('db-set', '设置', 'ghost', {}, { width: 150, z: -30, scale: 0.96 }),
          btn('db-quit', '退出', 'quiet', {}, { width: 140, z: -60, scale: 0.92 }),
        ] },
      { type: 'Panel', id: '3db-depth-n', props: { bare: true }, layout: { direction: 'row', padding: 4 },
        children: [note('3db-depth-l', '层级=z（+60 凸出 → −60 后退）配 scale 微调。主 CTA 用 kind:"hero" + sub 把关键信息写进键面（别塞到键外当说明）。这是主菜单的默认摆法。')] },

      // ③ 透视斜置控制台 —— 父面板 rotateX，按钮作为子层随面倾斜（sci-fi HUD）。
      divider('d-3b3'),
      sectionTitle('t-3dbtn-console', '③ 透视斜置控制台（父 PANEL.rotateX → 整面倾斜·按钮随面躺下）'),
      { type: 'Panel', id: '3db-con-wrap', props: { bare: true }, layout: { direction: 'row', gap: 20, padding: 30, align: 'center', justify: 'center' },
        children: [
          {
            type: 'Panel', id: '3db-console', props: { bg: 'ink-deep', edge: 'jade' },
            layout: { direction: 'grid', cols: 3, gap: 10, padding: 16, width: 330, radius: 12, rotateX: 34, z: -20 },
            children: (['雷达', '护盾', '引擎', '武器', '通讯', '自毁'] as const).map((l, i): LayoutNode =>
              btn(`cn-${i}`, l, i === 5 ? 'quiet' : 'ghost', { shape: 'cut' }, { width: 92, height: 40 })),
          },
          note('3db-con-l', '按钮不各自转——转的是**承载它们的面板**（rotateX:34），子层随面躺下、自动共面。sci-fi 控制台/驾驶舱面板就是这一招；改一个数就改倾角。'),
        ] },

      // ④ 旋转木马选择器 —— rotateY + z 摆成一圈，中间那颗是当前选中。
      divider('d-3b4'),
      sectionTitle('t-3dbtn-carousel', '④ 旋转木马选择器（LAYOUT.rotateY + z → 角色/模式左右翻选）'),
      { type: 'Panel', id: '3db-caro', props: { bare: true }, layout: { direction: 'row', gap: 6, padding: 30, align: 'center', justify: 'center', perspective: 760 },
        children: ([['难度·易', 50, -80], ['难度·中', 28, -34], ['难度·难', 0, 50], ['噩梦', -28, -34], ['地狱', -50, -80]] as const)
          .map(([label, ry, z], i): LayoutNode =>
            btn(`cr-${i}`, label, i === 2 ? 'hero' : 'ghost', { shape: 'pill' }, { width: 120, height: 50, rotateY: ry, z })),
      },
      { type: 'Panel', id: '3db-caro-n', props: { bare: true }, layout: { direction: 'row', padding: 4 },
        children: [note('3db-caro-l', '同 cover-flow 的排法搬到按钮上：只有 rotateY 与 z 两个数不同（中间 0/+50 朝前、两翼 ±28/±50 后旋退后）。换选中项=换这组数，结构一字不改。')] },

      // ⑤ 糖果厚钮网格 —— press3d + Panel.shadow，手机上最实用的一档。
      divider('d-3b5'),
      sectionTitle('t-3dbtn-candy', '⑤ 糖果厚钮网格（LAYOUT.press3d + PANEL.shadow → 按得下去的实体感·触屏首选）'),
      { type: 'Panel', id: '3db-candy-wrap', props: { bare: true }, layout: { direction: 'row', gap: 20, padding: 26, align: 'center' },
        children: [
          {
            type: 'Panel', id: '3db-candy', props: { bg: 'raised', shadow: { y: 6 } },
            layout: { direction: 'grid', cols: 3, gap: 12, padding: 16, width: 384, radius: 14 },
            // ⚠ hero 皮自带 30px 横向内边距——宽度给不够会**折行**（初版 92px 把「抽卡」折成两行）。
            //   网格里混 hero 时按最宽的那颗定列宽，别让 kind 决定的内边距把字挤掉。
            children: (['金币', '钻石', '体力', '抽卡', '邮件', '好友'] as const).map((l, i): LayoutNode =>
              btn(`cd-${i}`, l, i === 3 ? 'hero' : 'primary', { shape: 'pill' }, { width: 108, height: 46, press3d: true })),
          },
          note('3db-candy-l', 'press3d 走 :active——**触屏也触发**（tilt3d 只吃 :hover，手机上等于没有）。承载面加 Panel.shadow 硬边投影＝整块浮起来。休闲/手游主界面按钮墙用这一档。'),
        ] },

      // ⑥ 悬停抬起侧栏 —— tilt3d（桌面），配 rotateY 侧翼。
      divider('d-3b6'),
      sectionTitle('t-3dbtn-side', '⑥ 侧翼立体栏（LAYOUT.rotateY 侧转 + tilt3d 悬停抬起·桌面端）'),
      { type: 'Panel', id: '3db-side-wrap', props: { bare: true }, layout: { direction: 'row', gap: 24, padding: 26, align: 'center', perspective: 1000 },
        children: [
          {
            type: 'Panel', id: '3db-side', props: { bare: true },
            layout: { direction: 'column', gap: 10, rotateY: 22 },
            children: (['角色', '背包', '任务', '公会'] as const).map((l, i): LayoutNode =>
              btn(`sd-${i}`, l, 'ghost', { shape: 'tag' }, { width: 132, height: 42, tilt3d: true })),
          },
          note('3db-side-l', '整栏 rotateY:22 侧转成「翻开的书页」，每颗钮 tilt3d 悬停抬起。**仅桌面**——tilt3d 走 :hover，触屏无效，移动端改用 ⑤ 的 press3d。'),
        ] },

      divider('d-3b7'),
      { type: 'Label', id: '3dbtn-foot', props: {
        text: '选型速查：主菜单→② 景深 ｜ 技能/表情轮→① 弧形 ｜ 模式/角色选择→④ 木马 ｜ 手游按钮墙→⑤ 糖果厚钮（触屏）｜ 驾驶舱/仪表→③ 斜置面板 ｜ 桌面侧栏→⑥ 侧翼。移动端一律避开 tilt3d（只吃 hover），用 press3d。',
        color: 'gold', size: 'sm', bold: true } },
    ],
  };
}

function buildPage3dUi(controls: ControlsState): LayoutNode {
  // 旋转木马一张卡：绕 Y 轴按位次倾 + 朝外/朝内推（z），共享父 perspective → 卡组呈 3D 扇形。
  const coverCard = (id: string, rank: string, suit: string, name: string, rotY: number, z: number, sel = false): LayoutNode =>
    ({ type: 'PlayingCard', id, props: { rank, suit, label: name, size: 'md', selected: sel }, layout: { rotateY: rotY, z } });
  // 名将背面信息子树（翻面卡共用）。
  const heroBack = (bid: string, name: string, era: string, tag: string): LayoutNode =>
    ({ type: 'Panel', id: bid, props: { bare: true }, layout: { direction: 'column', gap: 6, padding: 10, align: 'center', justify: 'center' },
      children: [
        { type: 'Label', id: `${bid}-n`, props: { text: name, size: 'md', bold: true, color: 'gold' } },
        { type: 'Label', id: `${bid}-e`, props: { text: era, size: 'xs', color: 'jade' } },
        { type: 'Label', id: `${bid}-t`, props: { text: tag, size: 'xs', color: 'sub' } },
      ] });
  return {
    type: 'Panel', id: 'page-3dui', props: { scroll: true },
    layout: { direction: 'column', gap: 18, padding: 20 },
    children: [
      { type: 'Label', id: '3dui-intro', props: {
        text: '3D UI = 2D LayoutNode 挂 CSS-3D 变换（透视/景深/翻面/自旋/按压）+ 休闲 juice（庆祝粒子/退场/环形进度/全息箔/描边字）——全是数据字段，弱 LLM 只填数不写 CSS。真 3D 合成（preserve-3d）·非贴图假 3D。往下滚看 🎉 Juice 段。',
        color: 'sub', size: 'sm' } },

      divider('d-3du1'),
      sectionTitle('t-3dui-carousel', '★ 3D 卡牌旋转木马 / cover-flow（LAYOUT.rotateY + z·共享父 perspective → 卡组扇形铺开·中间凸出·两翼后旋）'),
      { type: 'Panel', id: '3dui-carousel', props: { bare: true }, layout: { direction: 'row', gap: 0, padding: 48, align: 'center', justify: 'center', perspective: 720 },
        children: [
          coverCard('cf-1', 'J', '♣', '张辽', 55, -90),
          coverCard('cf-2', 'Q', '♦', '马超', 32, -40),
          coverCard('cf-3', 'A', '♠', '赵子龙', 0, 60, true),
          coverCard('cf-4', 'K', '♥', '关云长', -32, -40),
          coverCard('cf-5', '10', '♣', '黄忠', -55, -90),
        ] },
      { type: 'Label', id: '3dui-carousel-l', props: { text: '五张同结构卡·只有 rotateY/z 两个数不同 → 摆成 cover-flow。换牌组=换数据，结构一字不改。', color: 'dim', size: 'xs' } },

      divider('d-3du2'),
      sectionTitle('t-3dui-flip', '★ 真 3D 翻面卡（PLAYINGCARD.flipOnHover + backFace·rotateY 180°+backface-hidden·悬停翻到背面信息）'),
      { type: 'Panel', id: '3dui-flip-row', props: { bare: true }, layout: { direction: 'row', gap: 28, padding: 24, align: 'center' },
        children: [
          { type: 'PlayingCard', id: 'flip-1', props: {
            rank: 'A', suit: '♠', label: '赵子龙', size: 'lg', flipOnHover: true,
            backFace: { type: 'Panel', id: 'flip-1-back', props: { bare: true }, layout: { direction: 'column', gap: 6, padding: 10, align: 'center', justify: 'center' },
              children: [
                { type: 'Label', id: 'flip-1-b-n', props: { text: '常山赵子龙', size: 'md', bold: true, color: 'gold' } },
                { type: 'Label', id: 'flip-1-b-d', props: { text: '蜀 · 五虎上将', size: 'xs', color: 'jade' } },
                { type: 'Label', id: 'flip-1-b-t', props: { text: '一身是胆·长坂坡七进七出', size: 'xs', color: 'sub' } },
              ] } } },
          { type: 'PlayingCard', id: 'flip-2', props: {
            rank: 'K', suit: '♥', label: '关云长', size: 'lg', flipOnHover: true,
            backFace: { type: 'Panel', id: 'flip-2-back', props: { bare: true }, layout: { direction: 'column', gap: 6, padding: 10, align: 'center', justify: 'center' },
              children: [
                { type: 'Label', id: 'flip-2-b-n', props: { text: '美髯公 关羽', size: 'md', bold: true, color: 'gold' } },
                { type: 'Label', id: 'flip-2-b-d', props: { text: '蜀 · 五虎之首', size: 'xs', color: 'jade' } },
                { type: 'Label', id: 'flip-2-b-t', props: { text: '过五关斩六将·水淹七军', size: 'xs', color: 'sub' } },
              ] } } },
          { type: 'Label', id: '3dui-flip-l', props: { text: '← 悬停卡牌：前后两面绕 Y 轴真翻转（backface-hidden 藏反面）。背面挂任意 LayoutNode 信息子树。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      divider('d-3du3'),
      sectionTitle('t-3dui-tilt', 'LAYOUT.rotateX/Y · 透视倾斜面板（静态摆进 3D 空间·像 sci-fi 斜置 HUD）'),
      { type: 'Panel', id: '3dui-tilt-row', props: { bare: true }, layout: { direction: 'row', gap: 48, padding: 24, align: 'center', perspective: 1000 },
        children: [
          { type: 'Panel', id: '3dui-tilt-a', props: { bg: 'jade-sheen', title: '左倾 HUD' }, layout: { width: 170, height: 116, padding: 14, rotateX: 12, rotateY: 26 },
            children: [{ type: 'Label', id: '3dui-tilt-a-l', props: { text: 'rotateX:12\nrotateY:26', size: 'sm', color: 'text' } }] },
          { type: 'Panel', id: '3dui-tilt-b', props: { bg: 'gold-sheen', title: '右倾 HUD' }, layout: { width: 170, height: 116, padding: 14, rotateX: 12, rotateY: -26 },
            children: [{ type: 'Label', id: '3dui-tilt-b-l', props: { text: 'rotateX:12\nrotateY:-26', size: 'sm', color: 'ink' } }] },
        ] },

      divider('d-3du4'),
      sectionTitle('t-3dui-depth', 'LAYOUT.z · 景深叠层（子面板各挂不同 z·真 translateZ 分层·朝屏幕凸出）'),
      { type: 'Panel', id: '3dui-depth', props: { bare: true }, layout: { width: 220, height: 180, padding: 20, rotateY: 20, perspective: 900 },
        children: [
          // 景深叠层=设计意图叠放 → allowOverlap 标意图（REQ-UIFX 修好空审计后 overlap 检查首次真跑到本 tab·A-007 语义）。
          { type: 'Panel', id: '3dui-d1', props: { bg: 'steel' }, layout: { x: 0, y: 0, width: 104, height: 144, radius: 10, z: 0, allowOverlap: true }, children: [] },
          { type: 'Panel', id: '3dui-d2', props: { bg: 'ink-deep' }, layout: { x: 18, y: 12, width: 104, height: 144, radius: 10, z: 34, allowOverlap: true }, children: [] },
          { type: 'Panel', id: '3dui-d3', props: { bg: 'gold-sheen' }, layout: { x: 36, y: 24, width: 104, height: 144, radius: 10, z: 68, align: 'center', justify: 'center', padding: 0, allowOverlap: true },
            children: [{ type: 'Label', id: '3dui-d3-l', props: { text: 'z:68\n最前', size: 'sm', bold: true, color: 'ink' } }] },
        ] },

      divider('d-3du5'),
      sectionTitle('t-3dui-hover', 'LAYOUT.tilt3d · 悬停立体抬起（交互 3D·鼠标悬停时面板/卡牌抬离屏幕·CSS 注入 :hover 变换）'),
      { type: 'Panel', id: '3dui-hover-row', props: { bare: true }, layout: { direction: 'row', gap: 40, padding: 24, align: 'center' },
        children: [
          { type: 'Button', id: '3dui-tilt-card', props: { label: '', skin: CARD_JOKER_URL, action: 'click', actionArg: 'tilt-card' }, layout: { width: 120, height: 168, tilt3d: true } },
          { type: 'Panel', id: '3dui-tilt-panel', props: { bg: 'void', title: 'tilt3d' }, layout: { width: 150, height: 116, padding: 14, tilt3d: true, align: 'center', justify: 'center' },
            children: [{ type: 'Label', id: '3dui-tilt-panel-l', props: { text: '悬停我\n→ 立体抬起', size: 'sm', color: 'text' } }] },
          { type: 'Label', id: '3dui-hover-l', props: { text: '一个 tilt3d:true 字段 = 悬停时透视抬起 + 柔影（仅桌面 hover）。触屏点按反馈见下方 press3d。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      divider('d-3du6'),
      sectionTitle('t-3dui-wheel', '★ 幸运转盘 / spinner 加载 / 旋转勋章（LAYOUT.rotate 既有 Z 轴 + anim:"spin" 新循环预设·休闲刚需·非新增轴）'),
      { type: 'Panel', id: '3dui-wheel-row', props: { bare: true }, layout: { direction: 'row', gap: 56, padding: 24, align: 'center' },
        children: [
          // 幸运转盘：conic-gradient 分段圆盘 + 连续自旋 + 顶部指针。
          { type: 'Panel', id: 'wheel-col', props: { bare: true }, layout: { direction: 'column', gap: 2, align: 'center' },
            children: [
              { type: 'Label', id: 'wheel-ptr', props: { text: '▼', size: 'lg', color: 'gold' } },
              { type: 'Panel', id: 'wheel-disc', props: { bg: { custom: 'conic-gradient(#e94f5a 0deg 45deg,#f5a623 45deg 90deg,#7ed957 90deg 135deg,#4a90d9 135deg 180deg,#9b59b6 180deg 225deg,#f5a623 225deg 270deg,#7ed957 270deg 315deg,#4a90d9 315deg 360deg)' } },
                layout: { width: 168, height: 168, radius: 84, anim: 'spin', animMs: 6000, align: 'center', justify: 'center', padding: 0 },
                children: [{ type: 'Panel', id: 'wheel-hub', props: { bg: 'raised' }, layout: { width: 40, height: 40, radius: 20 }, children: [] }] },
              { type: 'Label', id: 'wheel-lbl', props: { text: '每日转盘（rotate + spin）', size: 'xs', color: 'dim' } },
            ] },
          // spinner 加载环：conic 弧 + 快速自旋。
          { type: 'Panel', id: 'spin-col', props: { bare: true }, layout: { direction: 'column', gap: 8, align: 'center' },
            children: [
              { type: 'Panel', id: 'spin-ring', props: { bg: { custom: 'conic-gradient(#6cc6a0 0deg,rgba(108,198,160,0) 300deg 360deg)' } },
                layout: { width: 60, height: 60, radius: 30, anim: 'spin', animMs: 900, align: 'center', justify: 'center', padding: 0 },
                children: [{ type: 'Panel', id: 'spin-hole', props: { bg: 'sunken' }, layout: { width: 38, height: 38, radius: 19 }, children: [] }] },
              { type: 'Label', id: 'spin-lbl', props: { text: '加载中…', size: 'xs', color: 'dim' } },
            ] },
          // 旋转勋章：金圆 + ★（自旋让对称件也读得出转动）。
          { type: 'Panel', id: 'medal-col', props: { bare: true }, layout: { direction: 'column', gap: 8, align: 'center' },
            children: [
              { type: 'Panel', id: 'medal', props: { bg: 'gold-sheen' }, layout: { width: 74, height: 74, radius: 37, anim: 'spin', animMs: 3200, align: 'center', justify: 'center', padding: 0 },
                children: [{ type: 'Label', id: 'medal-star', props: { text: '★', size: 'xl', bold: true, color: 'ink' } }] },
              { type: 'Label', id: 'medal-lbl', props: { text: '旋转勋章', size: 'xs', color: 'dim' } },
            ] },
          { type: 'Label', id: '3dui-wheel-l', props: { text: 'Z 轴自旋既有（LAYOUT.rotate）；缺的是连续循环预设——补 anim:"spin"（linear·匀速）即解锁转盘/加载环/自旋徽章一大类休闲件。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      divider('d-3du7'),
      sectionTitle('t-3dui-tapflip', '★ 状态驱动翻面 PLAYINGCARD.flipped（点按/state 翻·非 hover·触屏可用——记忆翻牌/卡牌对战/刮刮乐）'),
      { type: 'Panel', id: '3dui-tapflip-row', props: { bare: true }, layout: { direction: 'row', gap: 30, padding: 24, align: 'center' },
        children: [
          // 交互：flipped 绑 controls.flag，点下方 Toggle 实时翻（state 驱动·非 hover）。
          { type: 'Panel', id: 'tapflip-live', props: { bare: true }, layout: { direction: 'column', gap: 10, align: 'center' },
            children: [
              { type: 'PlayingCard', id: 'tapflip-card', props: {
                rank: 'A', suit: '♠', label: '赵子龙', size: 'lg', flipped: controls.flag,
                backFace: heroBack('tapflip-back', '常山赵子龙', '蜀 · 五虎上将', '一身是胆 · 长坂坡') } },
              { type: 'Toggle', id: 'tapflip-tg', props: { label: '点我翻牌（flipped=state）', checked: controls.flag, action: 'setFlag' } },
            ] },
          // 静态两态对照（同字段不同值）。
          { type: 'PlayingCard', id: 'tapflip-a', props: {
            rank: 'K', suit: '♥', label: '关云长', size: 'lg', flipped: false,
            backFace: heroBack('tapflip-a-back', '美髯公 关羽', '蜀', '过五关斩六将') } },
          { type: 'PlayingCard', id: 'tapflip-b', props: {
            rank: 'K', suit: '♥', label: '关云长', size: 'lg', flipped: true,
            backFace: heroBack('tapflip-b-back', '美髯公 关羽', '蜀', '过五关斩六将') } },
          { type: 'Label', id: '3dui-tapflip-l', props: { text: 'flipped:false=正面 / true=背面 → 由数据决定翻到哪面（左侧绑 state·点 Toggle 实时翻）。对比 flipOnHover：这个触屏点按就能翻。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      divider('d-3du8'),
      sectionTitle('t-3dui-press', '★ 按压 3D 反馈 LAYOUT.press3d（按下沉 Z + 底唇收缩·:active 触屏可用·糖果厚按钮——tilt3d 的移动端补位）'),
      { type: 'Panel', id: '3dui-press-row', props: { bare: true }, layout: { direction: 'row', gap: 28, padding: 24, align: 'center' },
        children: [
          { type: 'Button', id: 'press-a', props: { label: '开始游戏', kind: 'primary', action: 'click', actionArg: 'press-a' }, layout: { press3d: true } },
          { type: 'Button', id: 'press-b', props: { label: '领取奖励', kind: 'hero', action: 'click', actionArg: 'press-b' }, layout: { press3d: true } },
          { type: 'Panel', id: 'press-tile', props: { bg: 'jade-sheen', action: 'click', actionArg: 'press-tile' }, layout: { width: 120, height: 72, padding: 12, press3d: true, align: 'center', justify: 'center' },
            children: [{ type: 'Label', id: 'press-tile-l', props: { text: '可按面板', size: 'sm', color: 'text' } }] },
          { type: 'Label', id: '3dui-press-l', props: { text: '一个 press3d:true 字段 = 常驻底唇（厚度）+ 按下沉 Z、底唇收缩。走 :active → 触屏点按也触发（对照 tilt3d 只 hover）。按钮/面板/卡牌通用。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      // ══════ 🎉 Juice / 反馈五补（休闲刚需·render-only·纯数据）══════
      divider('d-3du9'),
      { type: 'Label', id: 'juice-hdr', props: { text: '🎉 Juice / 反馈（庆祝粒子 · 退场动画 · 环形进度 · 全息箔 · 描边字——休闲游戏的"爽感"层）', size: 'md', bold: true, color: 'gold' } },

      sectionTitle('t-3dui-particles', '★ UI 庆祝粒子 PARTICLES（通关撒纸屑 / 领奖金币雨 / 星光爆 / 环境微光·fx 无法喷 N 粒子·UI 层发射器）'),
      { type: 'Panel', id: '3dui-particles-row', props: { bare: true }, layout: { direction: 'row', gap: 18, padding: 20, align: 'center' },
        children: ([
          ['confetti', '纸屑雨 confetti', 'sunken'], ['coins', '金币雨 coins', 'ink'],
          ['stars', '星光爆 stars', 'sunken'], ['sparkle', '环境微光 sparkle', 'ink'],
        ] as const).map(([kind, cap, bg]): LayoutNode => ({
          type: 'Panel', id: `pt-col-${kind}`, props: { bare: true }, layout: { direction: 'column', gap: 6, align: 'center' },
          children: [
            { type: 'Panel', id: `pt-stage-${kind}`, props: { bg }, layout: { width: 150, height: 116, padding: 0, align: 'center', justify: 'center' },
              children: [{ type: 'Particles', id: `pt-${kind}`, props: { kind }, layout: { width: 150, height: 116 } }] },
            { type: 'Label', id: `pt-cap-${kind}`, props: { text: cap, size: 'xs', color: 'dim' } },
          ],
        })).concat([
          { type: 'Label', id: '3dui-particles-l', props: { text: '一个 Particles{kind} = 一台 UI 层发射器（世界层对等件=Vfx3D）。粒子位置确定式派生·无裸 Math.random·可回归。loop:false=庆祝播一次。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ]) },

      // follow:'cursor'——收成小簇跟随光标（桌面微尘·下沉自 game-b「GameD 粒子追随」owner 2026-07-22）。
      { type: 'Panel', id: '3dui-particles-follow-row', props: { bare: true }, layout: { direction: 'row', gap: 18, padding: 20, align: 'center' },
        children: [
          { type: 'Panel', id: 'pt-follow-stage', props: { bg: 'sunken' }, layout: { width: 320, height: 120, padding: 0, align: 'center', justify: 'center' },
            children: [
              { type: 'Label', id: 'pt-follow-hint', props: { text: '↖ 在此框内移动鼠标 · 微尘跟随光标', size: 'sm', color: 'dim' } },
              { type: 'Particles', id: 'pt-follow', props: { kind: 'sparkle', count: 9, follow: 'cursor' } },
            ] },
          { type: 'Label', id: '3dui-particles-follow-l', props: { text: 'Particles{follow:"cursor"} = 粒子收成小簇跟随光标（软遮罩 + screen 混色不挡字·JS 缓动逼近·离场淡出）。渲染器侧跟随循环(server rAF)驱动·游戏侧纯数据一行；render-only 不进 sim。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      // 物理弹道粒子（REQ-UIFX·对位 Vfx3D：cone 初速+重力+阻尼+弹簧引向目标锚·拖尾对位 Trail3D·server rAF 胶水）。
      sectionTitle('t-3dui-pfly', '★ 物理弹道粒子 PARTICLES 对位 Vfx3D（shape:cone+gravity 先窜后落 · flyTo=AnchorRef 飞向节点 · trail 拖尾 · 色/径分档）'),
      { type: 'Panel', id: '3dui-pfly-row', props: { bare: true }, layout: { direction: 'row', gap: 28, padding: 22, align: 'center', justify: 'between' },
        children: [
          { type: 'Panel', id: 'pfly-stage', props: { bg: 'sunken' }, layout: { width: 210, height: 140, padding: 0, align: 'center', justify: 'center' },
            children: [
              { type: 'Label', id: 'pfly-hint', props: { text: '发射台', size: 'xs', color: 'text' } }, // dim 在 daylight sunken 上 2.42 硬失败（审计实测）→ text
              { type: 'Particles', id: 'pfly-burst', props: {
                kind: 'coins', count: 14, shape: 'cone', coneAngle: 0.5, speed: 560, gravity: 1050, drag: 0.6,
                lifetime: 2.2, stagger: 36, size: [12, 16, 20, 22, 26, 30],
                colorGradient: [{ t: 0, color: '#ffffff' }, { t: 0.45, color: '#ff5d7d' }, { t: 1, color: '#ff5d7d', alpha: 0.75 }],
                flyTo: { kind: 'node', id: 'pfly-wallet' },
                trail: { segments: 6, fade: 0, blend: 'add' },
              }, layout: { width: 210, height: 140 } },
            ] },
          { type: 'Label', id: '3dui-pfly-l', props: { text: '定稿写法照搬：14 颗 · 六档 12–30 · 芯白→牌色→牌色75% 径向渐变 · 每颗错开 36ms · cone 初速向上窜再被 gravity 俯冲、弹簧引向右侧钱包（flyTo=AnchorRef{kind:node,id}·同 Float/flyTo 一套寻址）· 拖尾对位 Trail3D(segments/width/fade/blend)。全静态数据·动画归渲染器 rAF——禁「每帧换新贴图」那条路。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
          { type: 'Badge', id: 'pfly-wallet', props: { text: '👛 钱包', tone: 'gold' } },
        ] },

      divider('d-3du10'),
      sectionTitle('t-3dui-exit', '★ 退场 / 飘字动画 anim（fadeOut·popOut 一次性退场 + floatUp 循环升冒·+N 收益飘字）'),
      { type: 'Panel', id: '3dui-exit-row', props: { bare: true }, layout: { direction: 'row', gap: 40, padding: 24, align: 'center' },
        children: [
          // floatUp 循环（可见）：一叠 +N 收益数字持续升起淡出。
          { type: 'Panel', id: 'floatup-stage', props: { bg: 'sunken' }, layout: { width: 160, height: 120, padding: 0, align: 'center', justify: 'center' },
            children: [
              { type: 'Label', id: 'fu-1', props: { text: '+50', size: 'lg', bold: true, color: 'gold', glow: true }, layout: { anim: 'floatUp', animMs: 1800 } },
              { type: 'Label', id: 'fu-2', props: { text: '+120', size: 'md', bold: true, color: 'ok' }, layout: { x: 90, y: 40, anim: 'floatUp', animMs: 2100, animDelay: 600 } },
              { type: 'Label', id: 'fu-3', props: { text: '+8', size: 'md', bold: true, color: 'jade' }, layout: { x: 30, y: 60, anim: 'floatUp', animMs: 1600, animDelay: 300 } },
            ] },
          { type: 'Label', id: 'exit-fu-l', props: { text: 'floatUp（循环）= +N 收益飘字升起淡出（挂 animDelay 错峰成一串·idle/消除游戏刚需）。', color: 'sub', size: 'sm' }, layout: { width: 200 } },
          // 一次性退场（进本页播一次·both 停末态）。
          { type: 'Panel', id: 'exit-once', props: { bare: true }, layout: { direction: 'column', gap: 10, align: 'center' },
            children: [
              { type: 'Badge', id: 'exit-fade', props: { text: 'fadeOut', tone: 'warn' }, layout: { anim: 'fadeOut', animMs: 1400 } },
              { type: 'Badge', id: 'exit-pop', props: { text: 'popOut', tone: 'danger' }, layout: { anim: 'popOut', animMs: 1400 } },
            ] },
          { type: 'Label', id: 'exit-once-l', props: { text: '← fadeOut / popOut（一次性退场·both 停末态）：toast 消失、弹窗关闭、三消物消除。补齐入场(fadeIn/pop)的退场对称位。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      divider('d-3du11'),
      sectionTitle('t-3dui-ring', '★ 环形 / 径向进度 PROGRESSBAR.shape:"ring"（体力环 / 每日目标 / 冷却环·休闲常见·补线性条之外）'),
      { type: 'Panel', id: '3dui-ring-row', props: { bare: true }, layout: { direction: 'row', gap: 32, padding: 24, align: 'center' },
        children: [
          { type: 'ProgressBar', id: 'ring-sta', props: { value: 0.72, shape: 'ring', size: 88, tone: 'ok', showValue: true, label: '体力' } },
          { type: 'ProgressBar', id: 'ring-goal', props: { value: 0.45, shape: 'ring', size: 88, tone: 'gold', showValue: true, label: '日目标' } },
          { type: 'ProgressBar', id: 'ring-cd', props: { value: 0.9, shape: 'ring', size: 88, tone: 'accent', showValue: true, label: '冷却' } },
          { type: 'ProgressBar', id: 'ring-hp', props: { value: 0.3, shape: 'ring', size: 72, tone: 'danger', showValue: true } },
          { type: 'Label', id: '3dui-ring-l', props: { text: 'shape:"ring" = conic 弧 + 中心镂空显值。同 value/max/tone 语义，换个 shape 就从线性条变径向环。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      // 液面杯（REQ-UIFX·ProgressBar 同族第三档）：游戏只给标量 value·晃动/气泡全由渲染器 CSS 承担。
      sectionTitle('t-3dui-liquid', '★ 液面杯 PROGRESSBAR.shape:"liquid"（注水/蓄力·双错频波脊 + 整杯 slosh + 气泡·游戏只给标量 value）'),
      { type: 'Panel', id: '3dui-liquid-row', props: { bare: true }, layout: { direction: 'row', gap: 30, padding: 24, align: 'center' },
        children: [
          { type: 'ProgressBar', id: 'liq-cup', props: { value: 0.68, shape: 'liquid', radius: 18, fillColor: '#31b7f2', bubbles: 3, showValue: true }, layout: { width: 92, height: 140 } },
          { type: 'ProgressBar', id: 'liq-gold', props: { value: 0.45, shape: 'liquid', tone: 'gold', radius: 26, bubbles: 2, label: '蓄力' }, layout: { width: 78, height: 118 } },
          { type: 'ProgressBar', id: 'liq-still', props: { value: 0.55, shape: 'liquid', fillColor: '#7ed957', wave: false, radius: 12, label: '静水' }, layout: { width: 70, height: 104 } },
          { type: 'Label', id: '3dui-liquid-l', props: { text: 'shape:"liquid" = 液面杯：水面是两条错频椭圆脊（主脊 900ms scaleY1↔.5 荡±3% + 副脊白55% 1250ms 反向——两条不同步才有晃动感）+ 整杯以杯底为轴 ±1.6° slosh + 气泡按档上窜（16/11/20px·1.5/1.8/2.1s 错开发）。radius 按盒圆角裁 · fillColor 液色 · wave:false=静水。游戏只给 value（注水曲线在游戏侧算好逐帧喂）——禁每帧烤水面进贴图。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      divider('d-3du12'),
      sectionTitle('t-3dui-holo', '★ 全息箔 fx:"holo"（彩虹光随角度流动·收集 / gacha 稀有卡演出·比 sheen 白斜扫更炫）'),
      { type: 'Panel', id: '3dui-holo-row', props: { bare: true }, layout: { direction: 'row', gap: 24, padding: 24, align: 'center' },
        children: [
          { type: 'PlayingCard', id: 'holo-card', props: { rank: 'A', suit: '♠', label: '★ 传说 赵子龙', size: 'lg' }, layout: { fx: [{ kind: 'holo' }] } },
          { type: 'Panel', id: 'holo-panel', props: { bg: 'gold-sheen', title: 'SSR' }, layout: { width: 150, height: 120, padding: 14, fx: [{ kind: 'holo' }], align: 'center', justify: 'center' },
            children: [{ type: 'Label', id: 'holo-p-l', props: { text: '稀有度箔光', size: 'sm', color: 'ink', bold: true } }] },
          { type: 'Label', id: '3dui-holo-l', props: { text: '新增 fx kind（闭集扩展=替代"开关爆炸"的正道）。holo 与 sheen/glow 可叠加。挂任意卡/面板/按钮。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      divider('d-3du13'),
      sectionTitle('t-3dui-stroke', '★ 描边字 LABEL.stroke（comic 深色粗轮廓·卡通 / 休闲标题·paint-order 保填色可读）'),
      { type: 'Panel', id: '3dui-stroke-row', props: { bare: true }, layout: { direction: 'row', gap: 26, padding: 24, align: 'center' },
        children: [
          { type: 'Label', id: 'stroke-1', props: { text: 'LEVEL UP!', size: 'xxl', bold: true, color: 'gold', stroke: true, font: 'comic' } },
          { type: 'Label', id: 'stroke-2', props: { text: '大 吉', size: 'xxl', bold: true, color: 'danger', stroke: true, font: 'bubbly' } },
          { type: 'Label', id: 'stroke-3', props: { text: 'COMBO ×8', size: 'xl', bold: true, color: 'ok', stroke: true, glow: true } },
          { type: 'Label', id: '3dui-stroke-l', props: { text: 'stroke:true = 深色粗描边（paint-order:stroke fill 保填色不被盖）。可与 glow / 艺术字 font 叠——卡通爆字标配。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      // ══════ 🎁 休闲缺口补全批（数字格式化 / 飞向奖励 / 关卡地图 / 跑马灯 / 涟漪）══════
      divider('d-3du14'),
      { type: 'Label', id: 'gap-hdr', props: { text: '🎁 休闲缺口补全（数字格式化 · 飞向奖励 · 关卡地图 · 跑马灯 · 点按涟漪）', size: 'md', bold: true, color: 'gold' } },

      sectionTitle('t-3dui-format', '★ 数字格式化 LABEL.format（idle 大数 compact / 计时 time / 百分比 percent·配 tween 滚动同格式化）'),
      { type: 'Panel', id: '3dui-format-row', props: { bare: true }, layout: { direction: 'row', gap: 30, padding: 22, align: 'center' },
        children: [
          { type: 'Label', id: 'fmt-1', props: { text: '1500000', format: 'compact', size: 'xxl', bold: true, color: 'gold' } },
          { type: 'Label', id: 'fmt-2', props: { text: '3661', format: 'time', size: 'xxl', bold: true, color: 'jade', mono: true } },
          { type: 'Label', id: 'fmt-3', props: { text: '0.75', format: 'percent', size: 'xxl', bold: true, color: 'ok' } },
          { type: 'Label', id: 'fmt-tw', props: { format: 'compact', tween: { from: 0, to: 9820000, ms: 1600 }, size: 'xxl', bold: true, color: 'warn' } },
          { type: 'Label', id: '3dui-format-l', props: { text: '1500000→1.5M · 3661秒→1:01:01 · 0.75→75% · tween 滚动到 9.8M（滚的过程也走缩写）。idle/休闲大数与计时刚需。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      divider('d-3du15'),
      sectionTitle('t-3dui-fly', '★ 飞向奖励 layout.flyTo（元素沿弧线飞到目标锚·金币飞进钱包·进本页触发一次）'),
      { type: 'Panel', id: '3dui-fly-row', props: { bare: true }, layout: { direction: 'row', gap: 40, padding: 22, align: 'center', justify: 'between' },
        children: [
          { type: 'Panel', id: 'fly-src', props: { bare: true }, layout: { direction: 'row', gap: 10 },
            children: [
              { type: 'Badge', id: 'fly-c1', props: { text: '💰+50', tone: 'gold' }, layout: { flyTo: { to: 'fly-wallet', ms: 900, arc: 80, delay: 0 } } },
              { type: 'Badge', id: 'fly-c2', props: { text: '💰+50', tone: 'gold' }, layout: { flyTo: { to: 'fly-wallet', ms: 900, arc: 80, delay: 180 } } },
              { type: 'Badge', id: 'fly-c3', props: { text: '💎+5', tone: 'accent' }, layout: { flyTo: { to: 'fly-wallet', ms: 900, arc: 110, delay: 360 } } },
            ] },
          { type: 'Label', id: '3dui-fly-l', props: { text: '三枚金币/宝石从左侧沿弧线飞进右侧钱包（不同 delay=拖尾成串）。mountUI 量两者屏幕 rect 算位移·CSS 弧线飞。刷新本页重播。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
          { type: 'Badge', id: 'fly-wallet', props: { text: '👛 钱包', tone: 'ok' } },
        ] },

      divider('d-3du16'),
      sectionTitle('t-3dui-tick', 'anim:"marquee" 跑马灯（滚动公告）+ fx:"ripple" 点按涟漪（material 触感）'),
      { type: 'Panel', id: '3dui-tick-row', props: { bare: true }, layout: { direction: 'row', gap: 24, padding: 20, align: 'center' },
        children: [
          { type: 'Panel', id: 'marquee-box', props: { bg: 'sunken' }, layout: { width: 300, height: 40, padding: 0, align: 'center' },
            children: [{ type: 'Label', id: 'marquee-txt', props: { text: '📢 限时活动：登录送 888 钻 · 新赛季开启 · 通关冲榜赢皮肤 · ', size: 'sm', color: 'gold' }, layout: { anim: 'marquee' } }] },
          { type: 'Button', id: 'ripple-btn', props: { label: '点我涟漪', kind: 'primary', action: 'click', actionArg: 'ripple' }, layout: { fx: [{ kind: 'ripple' }] } },
          { type: 'Label', id: '3dui-tick-l', props: { text: 'marquee=横向匀速滚动公告条；ripple=:active 从中心扩散一圈波（触屏点按反馈）。', color: 'sub', size: 'sm' }, layout: { flex: 1 } },
        ] },

      divider('d-3du17'),
      sectionTitle('t-3dui-levelmap', '★ 关卡地图 LEVELPATH（蛇形蜿蜒路径 + 连接线 + 星 + done/current/locked 状态·选关屏）'),
      { type: 'Panel', id: '3dui-levelmap-row', props: { bare: true }, layout: { direction: 'row', gap: 24, padding: 20, align: 'center' },
        children: [
          { type: 'LevelPath', id: 'demo-levelmap', props: { cols: 4, tone: 'gold', nodes: [
            { label: '1', state: 'done', stars: 3, action: 'pickLevel', actionArg: '1' },
            { label: '2', state: 'done', stars: 2, action: 'pickLevel', actionArg: '2' },
            { label: '3', state: 'done', stars: 3, action: 'pickLevel', actionArg: '3' },
            { label: '4', state: 'done', stars: 1, action: 'pickLevel', actionArg: '4' },
            { label: '5', state: 'current', action: 'pickLevel', actionArg: '5' },
            { label: '6', state: 'locked' }, { label: '7', state: 'locked' }, { label: '8', state: 'locked' },
          ] } },
          { type: 'Label', id: '3dui-levelmap-l', props: { text: '只给节点列表 + 状态，引擎自动排蛇形、画连线（通关段亮/未解锁段暗虚线）、渲节点（done 实心+星 / current 脉冲高亮 / locked 灰锁）。点节点发 pickLevel 信号选关。', color: 'sub', size: 'sm' }, layout: { flex: 1, maxWidth: 320 } },
        ] },
    ],
  };
}

/** UI 控件模块（7 个 UI 子 tab：容器/展示/输入/3D UI/新特性/商店/选牌）。 */
function buildUIModule(shop: ShopState, pick: PickState, activeTab: string, controls: ControlsState): LayoutNode {
  return {
    type: 'Tabs', id: 'gallery-tabs',
    props: {
      tabs: [
        { id: 'tab-layout', label: '容器与布局' },
        { id: 'tab-display', label: '数据展示' },
        { id: 'tab-input', label: '输入与交互' },
        { id: 'tab-3dui', label: '🧊 3D UI' },
        { id: 'tab-emoji', label: '🎨 emoji 美术' },
        { id: 'tab-new', label: '🆕 新控件/特性' },
        { id: 'tab-shop', label: '🧩 组合演示·商店' },
        { id: 'tab-pick', label: '🎴 组合演示·选牌' },
        { id: 'tab-3dbtn', label: '🕹 3D 按钮布局' },
      ],
      active: activeTab,
      action: 'switchTab',
    },
    layout: { flex: 1 },
    children: [pageLayout(), pageDisplay(), buildPageInput(controls), buildPage3dUi(controls), buildPageEmoji(), buildPageNew(controls), buildShop(shop), buildPickHand(pick), buildPage3dButtons()],
  };
}

/** 模块体：按当前模块出对应样例。 */
function moduleBody(
  currentModule: string, shop: ShopState, pick: PickState, activeTab: string,
  controls: ControlsState, input: InputLabState, aishe: AisheState,
): LayoutNode {
  beginSections(currentModule); // 进模块即重置子编号计数（前缀=该模块主编号·顺序=显示顺序·稳定可复述）
  switch (currentModule) {
    case 'mod-ui': return buildUIModule(shop, pick, activeTab, controls);
    case 'mod-mmo': return buildMmoHud();
    case 'mod-casual': return buildCasualHud();
    case 'mod-dialogue': return buildDialogueScene();
    case 'mod-presence': return buildPresenceDemo();
    case 'mod-sound': return buildSoundPage(controls);
    case 'mod-input': return buildInputLab(input);
    case 'mod-video': return buildVideoLab(aishe);
    case 'mod-anim': return buildSimStage('anim', '✨', '精灵动画 · tween 驱动',
      '引擎 Canvas 渲染器实时绘制：4 个形状由 tween 能力（平移巡逻 / 呼吸缩放 / 匀速自转 / 淡入淡出）驱动，纯蓝图数据、无专属代码。',
      ['tween', 'transform', 'shape', 'color', 'CanvasRenderer']);
    case 'mod-ai': return buildSimStage('ai', '🧠', '游戏 AI · 索敌 + 寻路',
      '玩家居中（金圆），五个敌人挂 Perception（索敌 aggro：锁定最近玩家）+ GridMover（寻路 grid-move：hex A* 逐格逼近、到相邻停）。纯蓝图组合现成能力，无专属代码。',
      ['aggro', 'grid-move', 'hex A*', 'Perception']);
    case 'mod-3d': return buildSimStage('3d', '🧊', '3D 渲染 · Mesh3D',
      '引擎 ThreeRenderer 实时渲染：翻面卡 / 翻滚立方 / 倾转薄面，由 tween 转 Transform.rotation 当翻面角驱动。同一份 collectRenderables 换 three 后端即换维度。',
      ['Mesh3D', 'tween', 'ThreeRenderer']);
    case 'mod-3d-light': return buildSimStage('3dlight', '💡', '数据化光照 · Light3D',
      '光照是数据：一盏 Light3D 定向主光（castShadow 投影）+ 一盏环境补光，照亮盒阵 + 一只缓转金盒（转动时各面随光明暗）。配 Sky3D 程序天空 + Camera3D 轨道相机。全部纯组件数据，渲染器自动读。点下方调参台改档，实时看画面随数据变。',
      ['Light3D', 'Sky3D', 'Camera3D', 'Mesh3D'],
      tuneDeck('3dlight', [
        { key: 'l.sun', label: '主光强度', def: 'mid', opts: [{ v: 'low', label: '弱' }, { v: 'mid', label: '中' }, { v: 'high', label: '强' }] },
        { key: 'l.amb', label: '环境补光', def: 'mid', opts: [{ v: 'low', label: '暗' }, { v: 'mid', label: '中' }, { v: 'high', label: '亮' }] },
        { key: 'l.cam', label: '相机距离', def: 'mid', opts: [{ v: 'near', label: '近' }, { v: 'mid', label: '中' }, { v: 'far', label: '远' }] },
      ], controls));
    case 'mod-3d-post': return buildSimStage('3dpost', '🔭', '景深 · 泛光 · Post3D',
      '后处理是数据：一个 Post3D 启 EffectComposer——移轴景深（中段清晰、上下虚化=微缩盒庭感）+ bloom 泛光（亮处发光）。同场景换不换 Post3D = 换不换后处理，蓝图一字不改。',
      ['Post3D', 'tiltShift', 'bloom', 'Light3D'],
      tuneDeck('3dpost', [
        { key: 'ps.tilt', label: '虚化量', def: 'mid', opts: [{ v: 'soft', label: '弱' }, { v: 'mid', label: '中' }, { v: 'strong', label: '强' }] },
        { key: 'ps.bloom', label: '泛光强', def: 'mid', opts: [{ v: 'low', label: '弱' }, { v: 'mid', label: '中' }, { v: 'high', label: '强' }] },
        { key: 'ps.focus', label: '焦平面', def: 'mid', opts: [{ v: 'low', label: '下' }, { v: 'mid', label: '中' }, { v: 'high', label: '上' }] },
      ], controls));
    case 'mod-3d-nav': return buildSimStage('3dnav', '🧭', '3D 寻路 · navmesh 自动烘焙',
      '摆一张 NavMesh 罩草地，navmesh-bake 每帧把 Collider3D 障碍栅格化、可走处自动织成 NavGraph（零手摆航点）。两个 NavAgent 追兵沿图绕障逼近左右巡逻的目标盒；相机 follow 目标（Camera3D follow 模式）。青点/线=自动导航图、黄线=当前规划路径。',
      ['NavMesh', 'navmesh-bake', 'NavAgent', 'pathfind', 'Camera3D·follow'],
      tuneDeck('3dnav', [
        { key: 'nav.spd', label: '追速', def: 'mid', opts: [{ v: 'slow', label: '慢' }, { v: 'mid', label: '中' }, { v: 'fast', label: '快' }] },
        { key: 'nav.cell', label: '网格精度', def: 'mid', opts: [{ v: 'coarse', label: '粗' }, { v: 'mid', label: '中' }, { v: 'fine', label: '细' }] },
      ], controls));
    case 'mod-3d-collide': return buildSimStage('3dcollide', '🎯', '3D 碰撞 · Collider3D / Overlap3D',
      '两个盒（球碰撞体 / 盒碰撞体）来回穿过中央触发区，overlap-detect-3d 每帧解析判交、产 Overlap3D 事件（触发区只报不推）。线框=碰撞体（实心黄 / 触发绿），位置每帧跟随。',
      ['Collider3D', 'overlap-detect-3d', 'Overlap3D', 'trigger']);
    case 'mod-3d-particle': return buildSimStage('3dpart', '🎇', '3D 粒子（prefab）· prefab → Mesh3D',
      '2D 库B 套路搬到 3D：发射器 Timer→event-when→caster 周期引爆「爆炸环」prefab，一圈小盒火花放射（motion-apply）+ Timer 到期 lifetime 自毁，叠 Post3D bloom 发光。新特效=加一份 prefab 数据，ThreeRenderer 照渲。',
      ['caster', 'prefab', 'Mesh3D', 'lifetime', 'Post3D·bloom'],
      tuneDeck('3dpart', [
        { key: 'pa.speed', label: '喷速', def: 'mid', opts: [{ v: 'slow', label: '慢' }, { v: 'mid', label: '中' }, { v: 'fast', label: '快' }] },
        { key: 'pa.count', label: '火花数', def: 'mid', opts: [{ v: 'few', label: '少' }, { v: 'mid', label: '中' }, { v: 'many', label: '多' }] },
        { key: 'pa.bloom', label: '泛光', def: 'mid', opts: [{ v: 'low', label: '弱' }, { v: 'mid', label: '中' }, { v: 'high', label: '强' }] },
      ], controls));
    case 'mod-3d-vfx': return buildSimStage('3dvfx', '🌟', '3D 粒子（Vfx3D）· 数据驱动发射器',
      'TA「Niagara-lite」专门的粒子机：一个 Vfx3D 组件 = 一台发射器——锥形喷射 + 重力回落 + size/color over life 曲线/渐变 + 加色发光。三股金/玉/玫喷泉，render-only 不进 hash。比 prefab 那套更专业、参数即数据。',
      ['Vfx3D', 'cone', 'gravity', 'colorGradient', 'Post3D·bloom'],
      tuneDeck('3dvfx', [
        { key: 'vfx.rate', label: '喷量', def: 'mid', opts: [{ v: 'low', label: '疏' }, { v: 'mid', label: '中' }, { v: 'high', label: '密' }] },
        { key: 'vfx.grav', label: '重力', def: 'mid', opts: [{ v: 'low', label: '飘' }, { v: 'mid', label: '中' }, { v: 'high', label: '坠' }] },
        { key: 'vfx.spd', label: '初速', def: 'mid', opts: [{ v: 'low', label: '低' }, { v: 'mid', label: '中' }, { v: 'high', label: '高' }] },
      ], controls));
    case 'mod-3d-primitives': return buildSimStage('3dprim', '🔷', '圆润图元 · Mesh3D.shape',
      'box 之外的 6 种图元：plane 双面薄片 + sphere 正球 + cylinder 柱 + cone 锥 + capsule 胶囊 + torus 环（three 内建几何·单材质单色）。一排七件各自缓转、头顶名牌标形。参数口径：圆润件 width=直径、height=柱/锥高（球忽略）、torus tube=管半径比。',
      ['Mesh3D.shape', 'sphere/cylinder', 'cone/capsule/torus', 'tube'],
      tuneDeck('3dprim', [
        { key: 'prm.spin', label: '转速', def: 'mid', opts: [{ v: 'slow', label: '慢' }, { v: 'mid', label: '中' }, { v: 'fast', label: '快' }] },
        { key: 'prm.cam', label: '机位', def: 'mid', opts: [{ v: 'near', label: '近' }, { v: 'mid', label: '中' }, { v: 'far', label: '远' }] },
      ], controls));
    case 'mod-3d-text': return buildSimStage('3dtext', '🔤', '头顶 3D 文字 · WorldUI3D',
      '世界空间 UI（简写飘字）：每个盒挂一个 WorldUI3D.text（头顶名字/血量/状态），渲染器把实体锚点投影到屏幕、在该处用引擎 UI 库 mountUI 挂一棵 LayoutNode Label（UI 铁律·非手写 DOM）。相机转/物体动时标签跟着头顶飘。',
      ['WorldUI3D.text', 'mountUI', 'LayoutNode', '世界锚+投影']);
    case 'mod-3d-worldui': return buildSimStage('3dwui', '🪧', '世界空间面板 · WorldUI3D.node',
      '飘字进阶：WorldUI3D.node 挂**整棵 LayoutNode**——Boss/治疗/精英怪头顶各一块富名牌（Panel = Label 名字 + ProgressBar 血条/护盾/法力·raised 令牌面板·非手写 DOM），走引擎 UI 库 mountUI 渲染。治疗单位横向移动，名牌随单位每帧投影跟随（背相机/出屏自动隐）。',
      ['WorldUI3D.node', 'Panel+ProgressBar', 'mountUI', '锚世界物+跟随'],
      tuneDeck('3dwui', [
        { key: 'wui.cam', label: '机位', def: 'mid', opts: [{ v: 'near', label: '近' }, { v: 'mid', label: '中' }, { v: 'far', label: '远' }] },
      ], controls));
    case 'mod-3d-ao': return buildSimStage('3dao', '🌑', '环境光遮蔽 · Post3D.ao（GTAO）',
      '一个 Post3D.ao 启 GTAO 地面真值环境光遮蔽：紧挨的盒堆在接触缝隙/墙根处被压暗 → 厚重「接地」的盒庭玩具感（关泛光以凸显 AO）。intensity/radius/scale 全是数据。',
      ['Post3D.ao', 'GTAO', '接触压暗', '盒庭质感'],
      tuneDeck('3dao', [
        { key: 'ao.str', label: '遮蔽强', def: 'mid', opts: [{ v: 'low', label: '弱' }, { v: 'mid', label: '中' }, { v: 'high', label: '强' }] },
        { key: 'ao.rad', label: '遮蔽半径', def: 'mid', opts: [{ v: 'tight', label: '窄' }, { v: 'mid', label: '中' }, { v: 'wide', label: '宽' }] },
      ], controls));
    case 'mod-3d-material': return buildSimStage('3dmat', '🧱', 'PBR 材质预设 · Material3D + IBL',
      '材质是数据：一排盒各挂一个 Material3D 预设——金/钢/铜（IBL 环境反射出真金属光泽）、玻璃（透射折射）、木/岩（哑光）、自发光。Sky3D.env 开 IBL（中性影室环境贴图）金属才有反射可照。叠 Post3D 调色 + 抗锯齿。',
      ['Material3D', 'PBR', 'IBL·Sky3D.env', 'grade', 'aa'],
      tuneDeck('3dmat', [
        { key: 'mat.emit', label: '自发光', def: 'mid', opts: [{ v: 'low', label: '弱' }, { v: 'mid', label: '中' }, { v: 'high', label: '强' }] },
        { key: 'mat.expo', label: '曝光', def: 'mid', opts: [{ v: 'dim', label: '暗' }, { v: 'mid', label: '中' }, { v: 'bright', label: '亮' }] },
        { key: 'mat.sat', label: '饱和度', def: 'mid', opts: [{ v: 'low', label: '淡' }, { v: 'mid', label: '中' }, { v: 'high', label: '浓' }] },
      ], controls));
    case 'mod-3d-toon': return buildSimStage('3dtoon', '🖍', '卡通描边 · Material3D.shading:toon + outline',
      '超休闲平涂招牌观感：一排图元走分段卡通着色（MeshToonMaterial 阶梯明暗·toonSteps 控阶数）+ inverted-hull 描边（沿法线外扩的背面壳=一圈实色轮廓）。大亮色 + 黑描边 = 卡通感。零美术文件·纯数据选着色模型。',
      ['Material3D.shading:toon', 'outline', 'toonSteps', 'inverted-hull'],
      tuneDeck('3dtoon', [
        { key: 'tn.steps', label: '色阶数', def: 'mix', opts: [{ v: 'mix', label: '混' }, { v: '2', label: '2阶' }, { v: '3', label: '3阶' }, { v: '4', label: '4阶' }] },
        { key: 'tn.outline', label: '描边粗', def: 'mid', opts: [{ v: 'thin', label: '细' }, { v: 'mid', label: '中' }, { v: 'bold', label: '粗' }] },
      ], controls));
    case 'mod-3d-billboard': return buildSimStage('3dbb', '🪙', '世界广告牌 + 地面贴花 · Billboard3D / Decal3D',
      '休闲拾取物经典组合：一圈始终朝相机的发光金币（Billboard3D·add 混合·参与深度排序会被遮挡·区别于 WorldUI3D 永在最上）+ Anim3D bob 上下浮 + 脚下 Decal3D blob 软阴影（便宜接触阴影·零美术文件）。另有 ring/disc 贴花做目标标记环/落点 splat。',
      ['Billboard3D', 'Decal3D·blob/ring/disc', 'Anim3D·bob', '朝相机+深度排序'],
      tuneDeck('3dbb', [
        { key: 'bb.bob', label: '浮动幅', def: 'mid', opts: [{ v: 'low', label: '弱' }, { v: 'mid', label: '中' }, { v: 'high', label: '强' }] },
        { key: 'bb.shadow', label: '阴影浓', def: 'mid', opts: [{ v: 'faint', label: '淡' }, { v: 'mid', label: '中' }, { v: 'dark', label: '浓' }] },
        { key: 'bb.size', label: '币大小', def: 'mid', opts: [{ v: 'small', label: '小' }, { v: 'mid', label: '中' }, { v: 'large', label: '大' }] },
      ], controls));
    case 'mod-3d-path': return buildSimStage('3dpath', '🛤', '路径跟随 · Path3D',
      '沿一串控制点按壁钟匀速走（帧率无关无漂移·render-only 只写 Transform3D）：巡逻平台走矩形折线（linear·移动平台/传送带）、巡逻兵朝运动方向平滑绕行（smooth + faceDir）、金币沿高空平滑闭环绕飞。loop=loop/pingpong/none。与 Anim3D 正交（一个沿路径行进·一个绕初值振荡）。',
      ['Path3D', 'linear/smooth', 'faceDir', 'loop/pingpong'],
      tuneDeck('3dpath', [
        { key: 'pt.speed', label: '巡速', def: 'mid', opts: [{ v: 'slow', label: '慢' }, { v: 'mid', label: '中' }, { v: 'fast', label: '快' }] },
      ], controls));
    case 'mod-3d-spring': return buildSimStage('3dspring', '🟢', '弹簧动画 · Anim3D spring',
      '解析阻尼弹簧（欠阻尼带过冲回弹·spawn 弹入/吸附 juice）：进本页时一排盒子 scale 0→1 弹入 + 从高处 y 落定，各带不同 damping（0.12 弹久 → 0.55 硬）看回弹次数差。零缓动代码·只填 damping/freq/from/to。',
      ['Anim3D·spring', 'damping', '过冲回弹', 'spawn juice'],
      tuneDeck('3dspring', [
        { key: 'sp.freq', label: '弹频', def: 'mid', opts: [{ v: 'slow', label: '慢' }, { v: 'mid', label: '中' }, { v: 'fast', label: '快' }] },
      ], controls));
    case 'mod-3d-surface': return buildSimStage('3dsurf', '🪨', '程序化表面细节 · Material3D.surface',
      '零美术文件的表面质感：渲染器按数据生成 normal/roughness 贴图——凸点 bumps / 噪声 noise / 划痕 scratches 三种程序化图案 + 平铺/法线强度/粗糙起伏。最左是光面对照，右三块依次凹凸/磨砂/拉丝。同天空盒程序化纹理先例。',
      ['Material3D.surface', '程序化 normal/rough', 'bumps/noise/scratches'],
      tuneDeck('3dsurf', [
        { key: 'sf.normal', label: '凹凸强', def: 'mid', opts: [{ v: 'flat', label: '弱' }, { v: 'mid', label: '中' }, { v: 'deep', label: '强' }] },
        { key: 'sf.tiles', label: '密度', def: 'mid', opts: [{ v: 'coarse', label: '粗' }, { v: 'mid', label: '中' }, { v: 'fine', label: '细' }] },
      ], controls));
    case 'mod-3d-model': return buildSimStage('3dmodel', '🦆', 'glTF 模型导入 · Model3D',
      'box/plane 原语表达不了圆润模型 → 导入真 glTF：居中主鸭缓转 + 左右两只染色鸭（同模板多实例·共享几何各自染色）+ 一个盒模型。模型自带材质 + 受软影。蓝图只持 modelKey（保纯·可哈希），ModelAssetLoader 取字节、ThreeRenderer 解析、未就绪本帧不画。',
      ['Model3D', 'glTF 导入', 'AssetManager', '多实例 clone'],
      tuneDeck('3dmodel', [
        { key: 'mdl.spin', label: '转速', def: 'mid', opts: [{ v: 'slow', label: '慢' }, { v: 'mid', label: '中' }, { v: 'fast', label: '快' }] },
        { key: 'mdl.cam', label: '机位', def: 'mid', opts: [{ v: 'near', label: '近' }, { v: 'mid', label: '中' }, { v: 'far', label: '远' }] },
      ], controls));
    case 'mod-3d-fog': return buildSimStage('3dfog', '🌫', '距离雾 · Fog3D',
      '一个 Fog3D（雾色取天际·near 清晰 far 全雾）：两列尖塔夹道向远处退去、渐隐入雾——盒庭「装在玻璃盒里」的纵深感。天空盒不受雾影响。color/near/far 三个数。点调参台改雾浓度看纵深随数据变。',
      ['Fog3D', '距离雾', '纵深', 'scene.fog'],
      tuneDeck('3dfog', [
        { key: 'f.den', label: '雾浓度', def: 'mid', opts: [{ v: 'thin', label: '薄' }, { v: 'mid', label: '中' }, { v: 'thick', label: '浓' }] },
        { key: 'f.near', label: '雾起点', def: 'mid', opts: [{ v: 'far', label: '远' }, { v: 'mid', label: '中' }, { v: 'near', label: '近' }] },
      ], controls));
    case 'mod-3d-pointlight': return buildSimStage('3dpl', '🔦', '点光源 / 聚光灯 · Light3D point·spot',
      'TA Phase 2 动态局部光：暗场里一盏移动暖点光（挂 Transform3D·tween 横扫白盒阵）+ 一盏冷聚光锥（从高处朝下·有锥角/半影）。点光随实体走、按 range/decay 衰减；叠 bloom 让光源发光。',
      ['Light3D·point', 'Light3D·spot', 'range/decay', '可移动'],
      tuneDeck('3dpl', [
        { key: 'pl.warm', label: '点光强', def: 'mid', opts: [{ v: 'dim', label: '弱' }, { v: 'mid', label: '中' }, { v: 'bright', label: '强' }] },
        { key: 'pl.spot', label: '聚光强', def: 'mid', opts: [{ v: 'dim', label: '弱' }, { v: 'mid', label: '中' }, { v: 'bright', label: '强' }] },
        { key: 'pl.angle', label: '锥角', def: 'mid', opts: [{ v: 'tight', label: '窄' }, { v: 'mid', label: '中' }, { v: 'wide', label: '宽' }] },
      ], controls));
    case 'mod-physics': return buildSimStage('phys', '🟢', '运动与碰撞',
      'motion-apply（Velocity→Transform 运动学）+ overlap-detect（碰撞检测）+ collision-resolve（按质量推开=碰撞响应）。四物体相向运动、于中心相撞被推开。纯蓝图，无专属代码。',
      ['motion-apply', 'overlap-detect', 'collision-resolve']);
    case 'mod-combat': return buildSimStage('combat', '⚔️', '战斗结算',
      '弹道（Sensor+Hitbox）飞行命中敌人 → trigger-zone → hitbox 扣血 / 挂灼烧 DoT → mortal 判死 → destroy 移除。整条战斗链全是现成能力组合，零游戏代码。',
      ['hitbox', 'trigger-zone', 'over-time', 'mortal']);
    case 'mod-spawn': return buildSimStage('spawn', '🎆', '生成与寿命',
      '发射器 Timer→event-when→caster 周期性从 PrefabLibrary 模板生成粒子，粒子带 Velocity 飞 + Tween 淡出 + Timer 到期 → lifetime 自毁。生成与销毁全数据驱动。',
      ['caster', 'prefab', 'event-when', 'lifetime']);
    case 'mod-fx': return buildSimStage('fx', '💥', '战场特效（库B·挂在画面上）',
      '特效架构「库 B」：世界里生成的特效实体。定时引爆「爆炸环」prefab——caster 一次展开整圈放射火花 + 冲击核（飞 + 淡出 + Timer 到期 lifetime 自毁）。与「库 A·UI 特效（layout.fx）」正交、可叠加。新特效 = 加一份 prefab 数据，零新 system。',
      ['caster', 'prefab', 'tween', 'lifetime']);
    case 'mod-fsm': return buildSimStage('fsm', '🔀', '状态机 / 行为',
      '自由计时器驱动 condition→signal→effect：idle→alert→flee→循环。状态转移（set-state）+ 指示块切换（set-visible）三段全是数据，非代码。',
      ['state', 'event-when', 'effect-apply']);
    default: return buildHub();
  }
}

/**
 * 整棵展示台 = 顶栏 + （落地积木墙 Hub｜某模块子菜单）。currentModule=null → Hub；否则进该模块。
 * modalOpen / drawerOpen = UI 模块里叠加演示用模态/抽屉（宿主状态驱动·开关都是数据/信号）。
 * 整棵树是纯数据：换主题只是换令牌包重挂，这份数据一字不改。
 */
export function buildGallery(
  activeTheme: string, currentModule: string | null = null, modalOpen = false, drawerOpen = false,
  shop: ShopState = INITIAL_SHOP, pick: PickState = INITIAL_PICK, activeTab = 'tab-layout',
  controls: ControlsState = INITIAL_CONTROLS, input: InputLabState = INITIAL_INPUT,
  aishe: AisheState = INITIAL_AISHE,
): LayoutNode {
  const mod = currentModule ? MODULES.find((m) => m.id === currentModule) : undefined;
  const title = mod ? `${mod.glyph} ${mod.label}` : 'Game I · 底座能力展示台';
  return {
    type: 'Screen',
    id: 'gameui-root',
    props: { center: false },
    layout: { direction: 'column', padding: 0 },
    children: [
      // 顶栏：（返回展台·进模块时）+ 标题 + 换皮下拉
      {
        type: 'Panel',
        id: 'topbar',
        props: {},
        layout: { direction: 'row', gap: 12, align: 'center', padding: 16 },
        children: [
          ...(currentModule ? [{ type: 'Button', id: 'hub-back', props: { label: '← 展台', kind: 'ghost', action: 'exitModule' } } as LayoutNode] : []),
          { type: 'Label', id: 'app-title', props: { text: title, size: 'lg', bold: true }, layout: { flex: 1 } },
          { type: 'Badge', id: 'app-engine', props: { text: 'ZeroCraft Preview · 数据驱动 UI', tone: 'dim' } },
          { type: 'Label', id: 'theme-lbl', props: { text: '换皮', size: 'sm', color: 'sub' } },
          {
            type: 'Dropdown',
            id: 'theme-pick',
            props: { options: THEME_OPTIONS, value: activeTheme, action: 'setTheme' },
          },
        ],
      },
      { type: 'Divider', id: 'top-div', props: {} },
      // 落地积木墙 或 某模块子菜单
      currentModule ? moduleBody(currentModule, shop, pick, activeTab, controls, input, aishe) : buildHub(),
      // 模态浮层 / 抽屉按需叠加（满屏遮罩·盖在主界面之上）
      ...(modalOpen ? [modalOverlay] : []),
      ...(drawerOpen ? [drawerOverlay] : []),
    ],
  };
}
