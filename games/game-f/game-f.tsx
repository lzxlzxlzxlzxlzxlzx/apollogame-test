import { AURORA, ONYX, PHOENIX_URI } from '@zerocraft/engine/ui/themes/sanguo/theme.js';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { CanvasRenderer } from '@zerocraft/engine/renderer/index.js';
import { PointerInputSource, KeyboardInputSource, QueuedInputSource } from '@zerocraft/engine/net/host/index.js';
import type { InputSource } from '@zerocraft/engine/net/commands.js';
import { AssetManager, ImageAssetLoader } from '@zerocraft/engine/assets/index.js';
import { getComponentById } from '@zerocraft/engine/engine/core/query.js';
import type { World } from '@zerocraft/engine/engine/core/world.js';
import { buildGameFBlueprint, gameFEnemyPreview, GAME_F_ASSETS, codesFor } from './index.js';
import { rosterFor, type Faction } from './heroes.js';
import { itemIcon, itemTip, rollItemId, ITEM_LIB } from './items.js';
import { applyEquip, unequip, parseMarkerId, type EquipMap } from './equip.js';
import { WARRIOR, TACTICIAN, TEAM_A } from './constants.js';
import { buildLobby, type RunConfig } from './lobby.js';
import type { Deck } from './decks.js';
import { createAllyMirrors } from './ally-mirror.js';
import { computeCoopIsland, distributeBossLoot, enemyScaleForPlayers, enemyAtkBaseForPlayers } from './coop.js';
import { settleRun, getLP, rankFor, updateLpAfterRun, GACHA_POOL, grantCards } from './account.js';

// Game F 可挂载模块（launcher 卡带槽契约：export mount(container) → cleanup）。
// 壳层 UI = design_handoff_game_f 的「锦霞 Aurora」皮肤（用户钦定女性向风格）：
//   · ThemeTokens = CSS 变量（README §Design Tokens 锦霞列，逐值照抄）；换肤=换 token（玄铁备份在 ONYX）。
//   · 页标签：对局 | 商城（商城=README §4 五分页 hifi 复刻，占位数据，交互态按 §交互态规范）。
//   · 对局内 HUD/文字/提示走引擎数据实体（blueprint 已染锦霞 palette + 三字体槽），壳层只包 chrome——
//     纯表现层，不碰 world/hash（manifesto + handoff 约束）。
// 字体：Google Fonts（README §Typography）；canvas 内文字按 fontFamily 数据取已加载字体。
const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;
const CAM_ZOOM = 1.8; // 与 blueprint camera.zoom 一致（静态相机）


const SHELL_CSS = `
.gfx-root{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;overflow:auto;
  color:var(--ink);font:14px/1.6 var(--font-body);background:var(--texture),var(--app-bg);}
.gfx-top{width:${VIEWPORT_W}px;display:flex;align-items:center;gap:14px;padding:12px 4px 8px;}
.gfx-title{font:30px var(--font-display);color:var(--accent);letter-spacing:2px;text-shadow:0 1px 0 #fff8;}
.gfx-tabs{display:flex;gap:6px;margin-left:8px;}
.gfx-tab{padding:7px 22px;border-radius:999px;border:1px solid var(--btn-edge);background:var(--btn-bg);
  color:var(--btn-text);font:15px var(--font-heading);letter-spacing:3px;cursor:pointer;
  transition:.16s cubic-bezier(.2,.7,.3,1);}
.gfx-tab:hover{transform:translateY(-2px);filter:brightness(1.06);}
.gfx-tab:active{transform:translateY(1px) scale(.97);filter:brightness(.93);}
.gfx-tab.on{background:var(--accent-grad);color:var(--accent-ink);border-color:transparent;
  box-shadow:0 4px 14px var(--accent-soft);}
.gfx-cur{margin-left:auto;display:flex;gap:8px;}
.gfx-chip{display:flex;align-items:center;gap:6px;background:var(--chip-bg);border:1px solid var(--panel-border);
  border-radius:999px;padding:4px 12px;font:13px var(--font-num);color:var(--ink);}
.gfx-chip b{color:var(--gold);}
.gfx-skin{font:12px var(--font-body);color:var(--ink-dim);background:none;border:1px dashed var(--panel-border);
  border-radius:999px;padding:4px 12px;cursor:pointer;}
/* —— 分段控件（设计稿顶栏：皮肤 玄铁/锦霞）—— */
.gfx-seg{display:flex;align-items:center;gap:7px;}
.gfx-seg>.lbl{font:10px var(--font-body);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-dim);}
.gfx-segbox{display:flex;background:var(--seg-track);border:1px solid var(--seg-edge);border-radius:11px;padding:3px;}
.gfx-segbtn{padding:7px 15px;border:none;background:transparent;color:var(--ink-dim);font:13px var(--font-heading);
  font-weight:700;letter-spacing:1px;white-space:nowrap;border-radius:8px;cursor:pointer;
  transition:.15s ease;}
.gfx-segbtn:not(.on):hover{color:var(--ink);}
.gfx-segbtn.on{background:var(--accent-grad);color:var(--accent-ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.3);}
.gfx-view{width:${VIEWPORT_W}px;}
.gfx-board-panel{position:relative;border:1px solid var(--panel-border);border-radius:var(--radius-lg);
  background:var(--panel-grad);box-shadow:0 0 0 1.5px var(--hairline) inset,0 14px 34px rgba(120,70,60,.16);
  overflow:hidden;}
.gfx-board-panel canvas{display:block;}
/* —— 单人对局 DOM 设计 chrome（顶/左/右覆盖层；接真实世界数值；中间棋盘+下方备战席露出可玩）—— */
.gfx-hud{position:absolute;inset:0;pointer-events:none;z-index:6;font-family:var(--font-body);color:var(--ink);}
.gfx-hud .pe{pointer-events:auto;}
.gfx-hud .syn{display:flex;align-items:center;gap:10px;padding:8px 11px;border-radius:var(--radius);}
.gfx-hud .syn .ic{width:30px;height:30px;flex:none;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:var(--font-cjk);font-weight:900;font-size:15px;}
.gfx-hud [data-rune],.gfx-hud [data-buy]{transition:.16s cubic-bezier(.2,.7,.3,1);}
.gfx-hud [data-rune]:hover,.gfx-hud [data-buy]:hover{transform:translateY(-6px);filter:brightness(1.07);}
.gfx-hud button{transition:.15s ease;}
.gfx-hud button:hover{filter:brightness(1.08);}
.gfx-hud button:active{transform:translateY(1px) scale(.97);}
/* —— 商城 —— */
.mall{padding-bottom:30px;}
.mall-tabs{display:flex;gap:6px;margin:4px 0 14px;}
.mall-panel{position:relative;border:1px solid var(--panel-border);border-radius:var(--radius-lg);
  background:var(--panel-grad);box-shadow:0 0 0 1.5px var(--hairline) inset;padding:18px;}
.corners::before,.corners::after,.corners>i::before,.corners>i::after{content:'';position:absolute;width:46px;height:46px;
  background:${'${PHX}'} center/contain no-repeat;pointer-events:none;opacity:.9;}
.corners::before{left:6px;top:6px;}
.corners::after{right:6px;top:6px;transform:scaleX(-1);}
.corners>i::before{left:6px;bottom:6px;transform:scaleY(-1);}
.corners>i::after{right:6px;bottom:6px;transform:scale(-1);}
.mall-banner{display:flex;gap:22px;align-items:stretch;}
.mall-art{flex:1.2;min-height:218px;border-radius:var(--radius);background:
  linear-gradient(160deg,#e887a0 0%,#cf9a3f 55%,#8aa0e6 100%);opacity:.85;display:flex;align-items:flex-end;
  padding:14px;color:#fff;font:26px var(--font-display);text-shadow:0 2px 6px #0006;}
.mall-info{flex:1;display:flex;flex-direction:column;gap:10px;}
.seal{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;color:var(--accent);
  font:22px var(--font-display);background:var(--panel-grad);border:2px solid var(--seal-edge);
  box-shadow:inset 0 0 0 1.5px var(--seal-edge);clip-path:polygon(22% 0,78% 0,100% 22%,100% 78%,78% 100%,22% 100%,0 78%,0 22%);}
.pity{height:14px;border-radius:999px;background:var(--track);overflow:hidden;}
.pity>div{height:100%;width:62%;background:var(--accent-grad);border-radius:999px;}
.btnrow{display:flex;gap:10px;margin-top:auto;}
.gbtn{position:relative;padding:10px 26px;border-radius:var(--btn-radius);border:1px solid var(--btn-edge);
  background:var(--btn-bg);color:var(--btn-text);font:15px var(--font-heading);letter-spacing:2px;cursor:pointer;
  transition:.16s cubic-bezier(.2,.7,.3,1);}
.gbtn.primary{background:var(--accent-grad);color:var(--accent-ink);border-color:transparent;
  box-shadow:0 6px 16px var(--accent-soft);}
.gbtn:hover{transform:translateY(-2px);filter:brightness(1.07);}
.gbtn:active{transform:translateY(1px) scale(.96);filter:brightness(.93);}
.gbtn .tag{position:absolute;top:-9px;right:-8px;background:var(--danger);color:#fff;font:10px var(--font-body);
  border-radius:999px;padding:2px 8px;}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
.card{position:relative;border:1px solid var(--panel-border);border-radius:var(--radius);background:var(--panel-grad);
  box-shadow:0 0 0 1.5px var(--hairline) inset;padding:12px;display:flex;flex-direction:column;gap:8px;
  transition:.16s cubic-bezier(.2,.7,.3,1);}
.card:hover{transform:translateY(-3px);box-shadow:0 10px 22px rgba(120,70,60,.18),0 0 0 1.5px var(--hairline) inset;}
.card .art{height:120px;border-radius:10px;opacity:.85;}
.card .nm{font:17px var(--font-heading);color:var(--ink);}
.card .pr{font:14px var(--font-num);color:var(--gold);}
.card .tag{position:absolute;top:8px;right:8px;background:var(--accent);color:#fff;font:10px var(--font-body);
  border-radius:999px;padding:2px 8px;}
.strike{color:var(--ink-dim);text-decoration:line-through;font-size:11px;margin-right:6px;}
.pass-track{display:flex;gap:8px;margin-top:14px;}
.pass-seg{flex:1;border-radius:10px;border:1px solid var(--panel-border);background:var(--chip-bg);padding:8px 6px;
  text-align:center;font:11px var(--font-body);color:var(--ink-dim);}
.pass-seg.cur{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft);color:var(--ink);}
.pass-seg .lv{font:13px var(--font-num);color:var(--accent);}
.pass-seg .free{color:var(--success);}
.pass-seg .elite{color:var(--xp);}
.grid6{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
.mall h3{margin:18px 0 10px;font:20px var(--font-display);color:var(--accent);}
.mall .sub{color:var(--ink-dim);font-size:12px;}
@media (prefers-reduced-motion: reduce){.gfx-root *{transition:none!important;animation:none!important;}}
`.replace('${PHX}', PHOENIX_URI);

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Zhi+Mang+Xing&family=Noto+Serif+SC:wght@500;700&family=Noto+Sans+SC:wght@400;700&family=Cormorant+Garamond:wght@600&family=Rajdhani:wght@600&family=Silkscreen&display=swap';

function el(tag: string, cls: string, html?: string): HTMLElement {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html !== undefined) d.innerHTML = html;
  return d;
}

// —— 商城（README §4 五分页，占位数据 hifi 复刻；购买=敬请期待 toast）——
function buildMall(): HTMLElement {
  const root = el('div', 'mall gfx-view');
  const tabs = ['抽卡', '皮肤', '通行证', '钻石', '礼包'];
  const bar = el('div', 'mall-tabs');
  const body = el('div', '');
  const pages: Record<string, () => HTMLElement> = {
    抽卡: () => {
      const p = el('div', 'mall-panel corners');
      p.appendChild(el('i', ''));
      p.appendChild(el('div', 'mall-banner', `
        <div class="mall-art">赤壁 · 火凤临世</div>
        <div class="mall-info">
          <div style="display:flex;gap:10px;align-items:center"><span class="seal">凤</span>
            <div><div style="font:22px var(--font-display);color:var(--ink)">限定卡池 · 周瑜</div>
            <div class="sub">UP！火烧赤壁皮肤 & 三星直升符 ｜ 剩余 2 天 14 时</div></div></div>
          <div class="sub">保底进度 62 / 100</div><div class="pity"><div></div></div>
          <div class="btnrow"><button class="gbtn">单抽 ×1 <span style="color:var(--gold)">💎160</span></button>
          <button class="gbtn primary">十连 ×10 <span>💎1600</span><span class="tag">送1次</span></button></div>
        </div>`));
      const side = el('div', 'grid3', `
        <div class="card"><div class="art" style="background:linear-gradient(150deg,#d8504e,#e887a0)"></div><div class="nm">蜀魂常驻池</div><div class="pr">💎160 / 抽</div></div>
        <div class="card"><div class="art" style="background:linear-gradient(150deg,#3fae6e,#8fd0b0)"></div><div class="nm">吴风常驻池</div><div class="pr">💎160 / 抽</div></div>
        <div class="card"><div class="art" style="background:linear-gradient(150deg,#3a86d4,#9db8e8)"></div><div class="nm">魏武常驻池</div><div class="pr">💎160 / 抽</div></div>`);
      const w = el('div', '');
      w.appendChild(p);
      w.appendChild(el('h3', '', '常驻卡池'));
      w.appendChild(side);
      return w;
    },
    皮肤: () => el('div', 'grid3', `
      <div class="card"><span class="tag">限时</span><div class="art" style="background:linear-gradient(150deg,#d8504e,#f2b8a0)"></div><div class="nm">关羽 · 青龙凯</div><div class="pr">💎880</div></div>
      <div class="card"><div class="art" style="background:linear-gradient(150deg,#3fae6e,#c8e8c0)"></div><div class="nm">周瑜 · 锦帆夜宴</div><div class="pr"><span class="strike">💎1280</span>💎960</div></div>
      <div class="card"><span class="tag" style="background:var(--gold)">新品</span><div class="art" style="background:linear-gradient(150deg,#8aa0e6,#d8c4f0)"></div><div class="nm">诸葛 · 八阵星图</div><div class="pr">💎1080</div></div>`),
    通行证: () => {
      const w = el('div', 'mall-panel');
      w.appendChild(el('div', 'mall-banner', `
        <div class="mall-info" style="flex:1.4"><div style="font:24px var(--font-display);color:var(--ink)">桃园令 · 第 3 赛季</div>
          <div class="sub">等级 4 ｜ 剩余 23 天</div>
          <div class="btnrow"><button class="gbtn primary">解锁精英 💎980</button><button class="gbtn">领取全部</button></div></div>
        <div class="mall-art" style="flex:1;min-height:130px">桃园结义</div>`));
      const seg = Array.from({ length: 8 }, (_, i) =>
        `<div class="pass-seg${i === 3 ? ' cur' : ''}"><div class="lv">Lv.${i + 1}</div><div class="free">🪙${(i + 1) * 100}</div><div class="elite">💎${(i + 1) * 20}</div></div>`).join('');
      w.appendChild(el('div', 'pass-track', seg));
      return w;
    },
    钻石: () => el('div', 'grid6', [60, 300, 980, 1980, 3280, 6480].map((n, i) =>
      `<div class="card">${i === 0 ? '<span class="tag">首充2倍</span>' : i === 2 ? '<span class="tag" style="background:var(--gold)">热卖</span>' : ''}
       <div class="art" style="background:linear-gradient(150deg,#e887a0,#cf9a3f);display:flex;align-items:center;justify-content:center;font-size:34px">💎</div>
       <div class="nm">💎${n}${i > 0 ? ` <span class="sub">+送${Math.round(n * 0.1)}</span>` : ''}</div><div class="pr">¥${[6, 30, 98, 198, 328, 648][i]}</div></div>`).join('')),
    礼包: () => el('div', 'grid3', `
      <div class="card"><span class="tag">限购1次</span><div class="art" style="background:linear-gradient(150deg,#d8504e,#cf9a3f)"></div><div class="nm">开局豪礼</div><div class="sub">💎300 + 🪙2000 + 随机二星符</div><div class="pr"><span class="strike">¥30</span>¥6</div></div>
      <div class="card"><span class="tag" style="background:var(--gold)">热卖</span><div class="art" style="background:linear-gradient(150deg,#3fae6e,#cf9a3f)"></div><div class="nm">连胜战礼</div><div class="sub">💎980 + 连胜旗装饰</div><div class="pr">¥68</div></div>
      <div class="card"><div class="art" style="background:linear-gradient(150deg,#8aa0e6,#e887a0)"></div><div class="nm">谋士周卡</div><div class="sub">每日💎60 ×7 天</div><div class="pr">¥18</div></div>`),
  };
  let cur = '抽卡';
  const render = (): void => {
    bar.innerHTML = '';
    tabs.forEach((t) => {
      const b = el('button', `gfx-tab${t === cur ? ' on' : ''}`, t) as HTMLButtonElement;
      b.onclick = () => { cur = t; render(); };
      bar.appendChild(b);
    });
    body.innerHTML = '';
    body.appendChild(pages[cur]());
  };
  render();
  root.appendChild(bar);
  root.appendChild(body);
  return root;
}

// —— 单人对局 DOM 设计 chrome（README 对战.dc.html solo 布局 + ZeroCraft UI Kit 控件；接真实世界状态）——
// 顶 HUD（STAGE/相位/倒计时/主公血/连胜）+ 左羁绊栏 + 右状态·装备栏 + 武将台发光框。
// 三边覆盖盖掉 canvas 旧 HUD；中间棋盘 + 下方备战席/商店露出，仍走 canvas 数据实体交互（不破坏可玩）。
function buildSoloHud(click: (x: number, y: number) => void, play: (i: number) => void, faction: Faction = 'shu', deck?: Deck): { root: HTMLElement; update: (w: World) => void; renderAllies: (unitsList: { q: number; r: number; enemy: boolean; hpFrac: number }[][]) => void; renderCoop: (island: { progress: number; goal: number; owner: string | null; ranking?: { name: string; faction: string; contribution: number }[] }) => void; renderDeck: (w: World) => void; bag: string[]; equipped: EquipMap; renderBag: () => void; renderEquipped: () => void } {
  const FAC: Record<string, string> = { 蜀: '#d8504e', 吴: '#3fae6e', 魏: '#3a86d4', 群: '#9b6dd8' };
  // 出战牌组卡名（P0 局内可见；取自各 deck 注释名，非新设计）。
  const CARD_NAME: Record<string, string> = { hubao_edict: '虎豹骑令', blitz: '速攻令', levy: '募兵', taoyuan: '桃园誓', zhangwu: '章武', muxian: '募贤', baiyi: '白衣', jinfan: '锦帆', muci: '募刺', tuntian: '屯田', zhongnong: '重农', munong: '募农', bazhen: '八阵图', wolong: '卧龙', qimou: '奇谋', guwu: '鼓舞', huoshao: '火烧连营', dingshen: '定身', wanjian: '万箭齐发', huichun: '妙手回春', kongcheng: '空城计', yibing: '疑兵增援' };
  const deckCards = deck?.cards ?? [];
  const passiveCards = deckCards.filter((c) => c.kind !== 'jinnang');
  const jinnangCards = deckCards.filter((c): c is Extract<typeof c, { kind: 'jinnang' }> => c.kind === 'jinnang');
  // 被动卡（参与战斗计算的 buff）：名 + 当前效果值（读资源实时算），开战 flash（被动发动可见）。
  const passiveRowsHtml = passiveCards.map((c) => `<div data-ref="deckcard_${c.id}" style="display:flex;align-items:center;gap:5px;padding:4px 6px;border-radius:8px;background:var(--chip-bg);border:1px solid var(--panel-border);transition:background .15s;box-shadow:0 1px 4px rgba(0,0,0,.18)">
    <span style="font-size:12px">🃏</span><div style="flex:1;min-width:0"><div style="font-family:var(--font-heading);font-weight:700;font-size:10px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${CARD_NAME[c.id] ?? c.id}</div><div data-ref="deckval_${c.id}" style="font-size:8.5px;color:var(--ink-dim)">—</div></div></div>`).join('');
  // 主动锦囊：可点卡（点击施放，扣充能）；显充能。
  const jinnangRowsHtml = jinnangCards.map((c) => `<button data-act="cast_${c.id}" data-jid="${c.id}" data-target="${c.target ?? 'self'}" style="display:flex;align-items:center;gap:5px;padding:5px 6px;border-radius:8px;background:var(--accent-soft);border:1px solid var(--accent);cursor:pointer;transition:transform .1s;box-shadow:0 1px 4px rgba(0,0,0,.2)">
    <span style="font-size:13px">📜</span><div style="flex:1;min-width:0;text-align:left"><div style="font-family:var(--font-heading);font-weight:700;font-size:10px;color:var(--accent)">${CARD_NAME[c.id] ?? c.id}</div><div style="font-size:8.5px;color:var(--ink-dim)">${c.target === 'pointer' ? '点击→点棋盘' : '点击施放'} · 充能 <span data-ref="charge_${c.id}">${c.charges}</span>/${c.charges}</div></div></button>`).join('');
  const FAC_LABEL: Record<Faction, string> = { shu: '蜀', wei: '魏', wu: '吴' };
  const playerFacLabel = FAC_LABEL[faction];
  // 商店卡/名牌全部**从所选阵营 roster 派生**（去腐：原硬编码 HEROES/HERO_NAMES + 写死蜀；现按 faction 取名册）。
  // 「加一个英雄 = 只改 heroes.ts 一条 HeroSpec + 一行资产」即可，DOM 壳层零改动（弱 LLM 也能一次做对）。
  const PLAYER_ROSTER = rosterFor(faction);
  const assetSrcByKey = new Map<string, string>();
  for (const a of GAME_F_ASSETS) { const s = (a as { key: string; src?: unknown }).src; if (typeof s === 'string') assetSrcByKey.set(a.key, s); }
  const clsLabel = (c: number): string => (c === WARRIOR ? '武将' : c === TACTICIAN ? '谋士' : '刺客');
  const CODE = codesFor(PLAYER_ROSTER);
  // code → [名, 字, 职业, 贴图 src]（玩家阵营 = TEAM_A；codesFor 按出场序给码）。
  const HEROES: Record<number, [string, string, string, string]> = {};
  // marker id（如 a_guanyu / c_lvmeng）→ 将名：备战期在板棋子头顶名牌。
  const HERO_NAMES: Record<string, string> = {};
  for (const h of PLAYER_ROSTER.filter((x) => x.team === TEAM_A)) {
    const code = CODE[h.id];
    if (code) HEROES[code] = [h.name, h.name[0], clsLabel(h.cls), assetSrcByKey.get(h.key) ?? ''];
    HERO_NAMES[h.id] = h.name;
  }
  const SHU = '#d8504e';
  // 开局三选一 = 现成 rune_a/b/c（世界坐标 + 信号），DOM 卡接它们。
  const RUNES: [string, string, string, string, number, number][] = [
    ['a', '🌾', '屯粮 · 积谷', '即时 +5 金', -110, -100],
    ['b', '📖', '砺兵 · 练武', '+8 经验 · 助升级', 0, -100],
    ['c', '🏯', '广纳 · 扩营', '备战席容量 +2', 110, -100],
  ];
  const runeCards = RUNES.map(([k, g, n, d]) => `<div data-rune="${k}" style="position:relative;width:208px;padding:28px 20px 20px;border-radius:18px;cursor:pointer;background:var(--panel-grad);border:1px solid var(--accent);box-shadow:inset 0 0 0 1px var(--hairline),0 18px 42px rgba(0,0,0,.5)">
    <div style="width:64px;height:64px;margin:0 auto 14px;border-radius:16px;background:var(--accent-soft);border:1px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:32px">${g}</div>
    <div style="font-family:var(--font-display);font-size:22px;color:var(--ink);margin-bottom:6px">${n}</div>
    <div style="font-size:12px;color:var(--ink-dim);line-height:1.5;min-height:34px">${d}</div>
    <div style="margin-top:14px;padding:8px 0;border-radius:10px;background:var(--accent-grad);color:var(--accent-ink);font-family:var(--font-heading);font-weight:700;font-size:13px;letter-spacing:2px">选 择</div></div>`).join('');
  // 羁绊（接真实 group-count；纯蜀 vs 魏世界观）：蜀魂(count_shu) + 武将(count_warrior) + 谋士(count_tactician)。
  const synData = [
    { name: '蜀 · 桃园', fac: '蜀', tiers: [2, 4, 6], glyph: '蜀', res: 'count_shu' },
    { name: '武将 · 猛将', fac: '', tiers: [2, 4, 6], glyph: '武', res: 'count_warrior' },
    { name: '谋士 · 智囊', fac: '', tiers: [2, 4], glyph: '谋', res: 'count_tactician' },
  ];
  const synRowHtml = (s: { name: string; fac: string; tiers: number[]; glyph: string }, have: number): string => {
    const col = s.fac ? FAC[s.fac] : 'var(--accent)';
    const active = have >= s.tiers[0];
    const reached = s.tiers.filter((t) => have >= t).length;
    const ticks = s.tiers.map((_, i) => `<div style="flex:1;height:4px;border-radius:99px;background:${i < reached ? col : 'var(--track)'}"></div>`).join('');
    return `<div class="syn" style="border:1px solid ${active ? col : 'var(--panel-border)'};background:${active ? 'var(--chip-bg)' : 'transparent'};opacity:${active ? 1 : 0.5};box-shadow:${active ? 'inset 0 0 0 1px var(--hairline)' : 'none'}">
      <div class="ic" style="background:${active ? col : 'var(--track)'};color:${active ? '#fff' : 'var(--ink-dim)'}">${s.glyph}</div>
      <div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;align-items:baseline">
        <span style="font-family:var(--font-heading);font-weight:700;font-size:14px;color:var(--ink)">${s.name}</span>
        <span style="font-family:var(--font-num);font-size:11px;color:${active ? col : 'var(--ink-dim)'}">${have}/${s.tiers[s.tiers.length - 1]}</span></div>
      <div style="display:flex;gap:4px;margin-top:5px">${ticks}</div></div></div>`;
  };
  const synRows = synData.map((s) => synRowHtml(s, 0)).join('');
  // 右栏 buff（自设计：当前状态 + 增益；连胜激励接 win_streak）。
  const buffs = [
    { g: '🏵️', n: '桃园结义', d: '蜀阵容 +12% 攻击', ref: '' },
    { g: '🌾', n: '屯田积粮', d: '每回合 +3 金', ref: '' },
    { g: '🔥', n: '连胜激励', d: '连胜越高士气越旺', ref: 'buffStreak' },
  ].map((b) => `<div style="display:flex;align-items:center;gap:9px;padding:8px 9px;border-radius:9px;background:var(--chip-bg);border:1px solid var(--panel-border)">
    <span style="font-size:17px">${b.g}</span><div style="flex:1;min-width:0"><div style="font-family:var(--font-heading);font-weight:700;font-size:13px;color:var(--ink)">${b.n}</div><div ${b.ref ? `data-ref="${b.ref}"` : ''} style="font-size:10px;color:var(--ink-dim)">${b.d}</div></div></div>`).join('');
  // 盟友/对战玩家名单（复刻「Game F 对战.dc.html」三人版右栏：三人一队，另两名玩家的战况镜像）。
  // 每张卡 = 头像+势力+真人/AI+名次+血条+就绪态 + 迷你 hex 布阵预览（mkMini）。真数据来自状态同步
  // （关键帧+战斗期增量，src/net/state-sync）；联机层接入前用 AI 托管占位（结构即列表，扩 N 人只追加条目）。
  const FACNAME: Record<string, string> = { 蜀: '蜀', 吴: '吴', 魏: '魏', 群: '群雄' };
  // 迷你布阵图（4 排×7 格六角缩略，行交错偏移）：pattern[row]=占位列号。
  const HEXMINI = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)';
  const miniBoard = (fac: string, pat: number[][]): string => {
    const col = FAC[fac];
    return [0, 1, 2, 3].map((r) => {
      const cells = Array.from({ length: 7 }, (_, c) => {
        const on = (pat[r] || []).includes(c);
        return `<div style="width:13px;height:11px;clip-path:${HEXMINI};background:${on ? col : 'var(--track)'};box-shadow:${on ? `0 0 3px ${col}99` : 'none'}"></div>`;
      }).join('');
      return `<div style="display:flex;gap:2px;margin-top:${r === 0 ? '0' : '-3px'};margin-left:${r % 2 === 1 ? '7px' : '0'}">${cells}</div>`;
    }).join('');
  };
  // 同队另两名玩家（玩家=蜀·玄德；队友=吴/魏，三国合击征日）。ready/hp/place/pat 占位，待同步层填真值。
  const ALLY_ROSTER = [
    { name: '仲谋', fac: '吴', human: true, hp: 81, ready: true, place: 2, pat: [[2, 4], [3], [1, 5], []] },
    { name: '孟德', fac: '魏', human: false, hp: 64, ready: false, place: 3, pat: [[1, 3, 5], [2, 4], [3], [0]] },
  ];
  // 实时迷你布阵：把盟友镜像里的真实单位(HexPos q,r + 阵营 + 血量)桶进 4×7 hex 缩略格。
  // ally=势力色、enemy(太阁)=危险色；自适应缩放到当前单位包围盒，故坐标系差异不影响呈现。
  const liveMini = (fac: string, units: { q: number; r: number; enemy: boolean; hpFrac: number }[]): string => {
    const col = FAC[fac];
    if (!units.length) return miniBoard(fac, [[], [], [], []]);
    const qs = units.map((u) => u.q), rs = units.map((u) => u.r);
    const minQ = Math.min(...qs), maxQ = Math.max(...qs), minR = Math.min(...rs), maxR = Math.max(...rs);
    const grid: (null | 'ally' | 'enemy')[] = Array(28).fill(null);
    for (const u of units) {
      const c = maxQ > minQ ? Math.round(((u.q - minQ) / (maxQ - minQ)) * 6) : 3;
      const r = maxR > minR ? Math.round(((u.r - minR) / (maxR - minR)) * 3) : 0;
      const k = r * 7 + c;
      if (grid[k] !== 'ally') grid[k] = u.enemy ? 'enemy' : 'ally'; // 盟友优先压敌
    }
    return [0, 1, 2, 3].map((r) => {
      const cells = Array.from({ length: 7 }, (_, c) => {
        const v = grid[r * 7 + c];
        const bg = v === 'ally' ? col : v === 'enemy' ? 'var(--danger)' : 'var(--track)';
        return `<div style="width:13px;height:11px;clip-path:${HEXMINI};background:${bg};box-shadow:${v ? `0 0 3px ${v === 'ally' ? col : 'var(--danger)'}99` : 'none'}"></div>`;
      }).join('');
      return `<div style="display:flex;gap:2px;margin-top:${r === 0 ? '0' : '-3px'};margin-left:${r % 2 === 1 ? '7px' : '0'}">${cells}</div>`;
    }).join('');
  };
  const allyCard = (p: typeof ALLY_ROSTER[number], i: number): string => {
    const col = FAC[p.fac];
    const facTag = `display:inline-flex;align-items:center;font-size:9px;padding:1px 6px;border-radius:99px;background:${col}22;color:${col};border:1px solid ${col}66;font-weight:700`;
    const humanTag = `font-size:8px;padding:1px 5px;border-radius:99px;background:${p.human ? 'var(--accent-soft)' : 'var(--chip-bg)'};color:${p.human ? 'var(--accent)' : 'var(--ink-dim)'};border:1px solid ${p.human ? 'var(--accent)' : 'var(--panel-border)'};font-weight:700`;
    const readyStyle = `display:flex;align-items:center;gap:4px;font-family:var(--font-heading);font-weight:700;font-size:10px;color:${p.ready ? 'var(--hp)' : 'var(--ink-dim)'}`;
    const readyDot = `width:6px;height:6px;border-radius:50%;background:${p.ready ? 'var(--hp)' : 'var(--ink-dim)'};box-shadow:${p.ready ? '0 0 5px var(--hp)' : 'none'}`;
    return `<div style="border-radius:12px;background:var(--chip-bg);border:1px solid ${p.human ? col + 'aa' : 'var(--panel-border)'};box-shadow:inset 0 0 0 1px var(--hairline),0 3px 8px rgba(0,0,0,.12);padding:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:32px;height:32px;border-radius:9px;flex:none;background:linear-gradient(160deg,${col}ee,${col}99);border:2px solid ${col};display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--font-cjk);font-weight:900;font-size:14px">${p.fac}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:4px">
            <span style="font-family:var(--font-heading);font-weight:700;font-size:12px;color:var(--ink)">${p.name}</span>
            <span style="${facTag}">${FACNAME[p.fac]}</span>
            <span style="${humanTag}">${p.human ? '真人' : 'AI 托管'}</span>
            <span style="margin-left:auto;font-family:var(--font-num);font-size:11px;color:${p.place === 1 ? 'var(--gold)' : 'var(--ink-dim)'}">#${p.place}</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;margin-top:4px">
            <div style="flex:1;height:6px;border-radius:99px;background:var(--track);overflow:hidden"><div style="width:${p.hp}%;height:100%;background:${p.hp < 35 ? 'var(--danger)' : col};border-radius:99px"></div></div>
            <span style="font-family:var(--font-num);font-size:9px;color:var(--ink-dim)">${p.hp}</span>
            <span style="${readyStyle}"><span style="${readyDot}"></span>${p.ready ? '已就绪' : '布阵中'}</span>
          </div>
        </div>
      </div>
      <div data-ref="allyboard${i}" class="ally-board" style="margin-top:8px;border-radius:8px;background:var(--panel-grad);border:1px solid var(--panel-border);padding:7px;display:flex;flex-direction:column;align-items:center">${miniBoard(p.fac, p.pat)}</div>
    </div>`;
  };
  const allyPreview = ALLY_ROSTER.map((p, i) => allyCard(p, i)).join('');
  // 装备栏（战利品）：开局空，战中敌死掉装备 → 主公拾取 → items 累加；拾取上升沿掷一件具体道具入袋（②）。

  const root = el('div', 'gfx-hud');
  root.innerHTML = `
    <!-- 在板 marker 名牌层 + 敌人预布阵幽灵层（备战期投影；pointer-events 透传）-->
    <div data-ref="namelayer" style="position:absolute;inset:0;pointer-events:none;z-index:1"></div>
    <div data-ref="ghostlayer" style="position:absolute;inset:0;pointer-events:none;z-index:1"></div>
    <!-- TOP HUD -->
    <div class="pe" style="position:absolute;top:0;left:0;right:0;height:58px;display:flex;align-items:center;gap:14px;padding:0 18px;background:var(--hud-bg);border-bottom:1px solid var(--panel-border)">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="display:flex;flex-direction:column;line-height:1"><span style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-dim)">STAGE</span><span data-ref="stage" style="font-family:var(--font-num);font-size:20px;color:var(--ink);margin-top:3px">1-1</span></div>
        <div data-ref="pips" style="display:flex;gap:5px;align-items:center"></div>
      </div>
      <!-- 居中的相位 + 开战倒计时（用户：倒计时画在顶栏且居中）-->
      <div style="position:absolute;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px">
        <div data-ref="phase" style="padding:6px 18px;border-radius:99px;white-space:nowrap;font-family:var(--font-heading);font-weight:700;font-size:13px;letter-spacing:.06em;background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent)">⚔ 备战 · 布阵</div>
        <div style="display:flex;flex-direction:column;align-items:center;line-height:1"><span style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-dim)">开战倒计时</span><span data-ref="timer" style="font-family:var(--font-num);font-size:22px;color:var(--accent);margin-top:3px">0:30</span></div>
      </div>
      <div style="flex:1"></div>
      <!-- 操作引导（用户：最上排状态栏告诉玩家此刻该干什么）-->
      <div style="display:flex;justify-content:flex-end"><div data-ref="guide" style="display:flex;align-items:center;gap:8px;max-width:400px;padding:7px 14px;border-radius:11px;background:var(--chip-bg);border:1px solid var(--panel-border);font-size:11.5px;line-height:1.4;color:var(--ink)"><span style="font-size:14px">🎯</span><span data-ref="guidetext">招募英雄 → 拖上棋盘布阵 → 点「开战」</span></div></div>
    </div>
    <!-- 玩家信息卡（左下角，合并全部主公状态+经济；点卡片弹「当前状态」菜单）。 -->
    <div data-act="playerinfo" style="position:absolute;left:10px;bottom:118px;width:194px;padding:13px;border-radius:var(--radius);background:var(--panel-grad);border:1px solid var(--panel-border);box-shadow:inset 0 0 0 1px var(--hairline),0 6px 16px rgba(0,0,0,.2);pointer-events:auto;cursor:pointer">
      <div style="display:flex;align-items:center;gap:11px">
        <div style="position:relative;width:50px;height:50px;flex:none;border-radius:50%;background:var(--accent-grad);padding:3px;box-shadow:0 0 14px var(--accent-soft)">
          <div style="width:100%;height:100%;border-radius:50%;background:var(--protag-bg);display:flex;align-items:center;justify-content:center;font-size:24px">🐢</div></div>
        <div style="flex:1;min-width:0"><div style="font-family:var(--font-heading);font-weight:700;font-size:15px;color:var(--ink)">主公 · 玄德</div><div style="font-size:10px;color:var(--ink-dim)">蜀 · 桃园结义 <span style="opacity:.7">· 点击看状态</span></div></div>
        <div style="display:flex;align-items:center;padding:4px 9px;border-radius:9px;background:var(--accent-soft);border:1px solid var(--accent)"><span data-ref="streak" style="font-family:var(--font-heading);font-weight:700;font-size:11px;color:var(--accent)">0连胜</span></div>
      </div>
      <div style="margin-top:10px"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:9px;letter-spacing:.1em;color:var(--ink-dim)">主公生命</span><span data-ref="hp" style="font-family:var(--font-num);font-size:10px;color:var(--hp)">100</span></div>
        <div style="height:10px;border-radius:99px;background:var(--track);overflow:hidden;border:1px solid var(--panel-border)"><div data-ref="hpfill" style="width:100%;height:100%;background:var(--hp);border-radius:99px"></div></div></div>
      <div style="margin-top:7px"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:9px;letter-spacing:.1em;color:var(--ink-dim)">经验 · Lv<span data-ref="level">1</span></span><span data-ref="xp" style="font-family:var(--font-num);font-size:10px;color:var(--xp)">0/2</span></div>
        <div style="height:7px;border-radius:99px;background:var(--track);overflow:hidden;border:1px solid var(--panel-border)"><div data-ref="xpfill" style="width:0%;height:100%;background:var(--xp);border-radius:99px"></div></div></div>
      <div style="margin-top:7px"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:9px;letter-spacing:.1em;color:var(--ink-dim)">🗾 攻岛进度 · 贡献 <span data-ref="contrib" style="font-family:var(--font-num);color:var(--gold)">0</span></span><span data-ref="island" style="font-family:var(--font-num);font-size:10px;color:var(--accent)">0/100</span></div>
        <div style="height:7px;border-radius:99px;background:var(--track);overflow:hidden;border:1px solid var(--panel-border)"><div data-ref="islandfill" style="width:0%;height:100%;background:var(--accent);border-radius:99px"></div></div></div>
      <div style="display:flex;gap:8px;margin-top:9px">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:5px 9px;border-radius:9px;background:var(--gold-chip);border:1px solid var(--gold)"><span style="font-size:13px">🪙</span><span data-ref="gold" style="font-family:var(--font-num);font-size:14px;color:var(--gold)">0</span></div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:5px 9px;border-radius:9px;background:var(--chip-bg);border:1px solid var(--panel-border)"><span style="font-size:11px;color:var(--ink-dim)">空席</span><span data-ref="bench" style="font-family:var(--font-num);font-size:14px;color:var(--ink)">9</span></div>
      </div>
      <button data-act="xp" style="margin-top:9px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:8px;border-radius:10px;cursor:pointer;background:var(--btn-bg);border:1px solid var(--btn-edge);color:var(--btn-text);font-family:var(--font-cjk);font-weight:700;font-size:13px">📜 买经验 <span style="font-family:var(--font-num);font-size:11px;color:var(--gold)">4金</span></button>
    </div>
    <!-- 当前状态弹出菜单（点玩家卡切换；不再常驻右栏，腾位给盟友布阵预览）。 -->
    <div data-ref="buffpop" style="position:absolute;left:212px;bottom:118px;width:210px;display:none;flex-direction:column;gap:7px;padding:12px;border-radius:var(--radius);background:var(--panel-grad);border:1px solid var(--accent);box-shadow:inset 0 0 0 1px var(--hairline),0 12px 30px rgba(0,0,0,.4);pointer-events:auto;z-index:30">
      <div style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-dim);margin-bottom:2px">当前状态 · Status</div>
      ${buffs}
    </div>
    <!-- 武将台发光框（围住棋盘区，pointer-events 透传不挡拖拽）-->
    <div style="position:absolute;left:350px;top:60px;width:580px;height:492px;border-radius:24px;border:1px solid var(--platform-edge);box-shadow:inset 0 0 0 1px var(--hairline),0 0 38px var(--accent-soft);background:var(--platform-glow);pointer-events:none"></div>
    <!-- LEFT · 羁绊（上）；玩家卡在左下（bottom 留够，避免与玩家卡重叠）-->
    <div style="position:absolute;left:10px;top:66px;width:186px;bottom:330px;display:flex;flex-direction:column;gap:6px;overflow:hidden;pointer-events:auto">
      <div style="font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:var(--ink-dim);padding:2px 6px">羁绊 · Synergies</div>
      <div data-ref="synrows" style="display:flex;flex-direction:column;gap:6px">${synRows}</div></div>
    <!-- 出战牌组/锦囊：棋盘左侧空档（owner 反馈：勿与左栏文字重合；放棋盘与左栏之间）。被动卡显值+生效flash；主动锦囊可点。 -->
    <div style="position:absolute;left:208px;top:120px;width:138px;max-height:440px;display:flex;flex-direction:column;gap:5px;overflow:hidden;pointer-events:auto;z-index:2">
      <div style="font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-dim);padding:2px 4px;text-shadow:0 1px 3px rgba(0,0,0,.4)">出战牌组 · Build</div>
      <div data-ref="deckrows" style="display:flex;flex-direction:column;gap:4px">${passiveRowsHtml || '<div style="font-size:9px;color:var(--ink-dim);padding:2px 4px">（无被动牌）</div>'}</div>
      ${jinnangRowsHtml ? `<div style="font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);padding:6px 4px 2px;text-shadow:0 1px 3px rgba(0,0,0,.4)">锦囊 · 主动</div><div data-ref="jinnangrows" style="display:flex;flex-direction:column;gap:4px">${jinnangRowsHtml}</div>` : ''}
    </div>
    <!-- RIGHT · 对战玩家（三人版：另两名玩家/AI 的战况 + 迷你布阵镜像，复刻对战设计稿右栏）+ 装备 -->
    <div style="position:absolute;right:10px;top:66px;width:186px;bottom:118px;display:flex;flex-direction:column;gap:10px;overflow:hidden;pointer-events:auto">
      <div style="flex:1;min-height:0;background:var(--panel-grad);border:1px solid var(--panel-border);border-radius:var(--radius);box-shadow:inset 0 0 0 1px var(--hairline);padding:12px;display:flex;flex-direction:column;gap:9px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-dim)">对战玩家</span>
          <span style="font-family:var(--font-num);font-size:11px;color:var(--accent)">3 人</span>
          <span style="flex:1"></span>
          <button data-act="toggle-boards" style="padding:3px 8px;border-radius:7px;cursor:pointer;background:var(--chip-bg);border:1px solid var(--panel-border);color:var(--ink-dim);font-family:var(--font-heading);font-weight:700;font-size:10px;white-space:nowrap">收起战况 ▴</button>
        </div>
        <!-- 共享岛（多人 B·slice1）：三方贡献凿同一座岛 + 岛主 -->
        <div style="background:var(--chip-bg);border:1px solid var(--panel-border);border-radius:9px;padding:7px 9px">
          <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:9px;letter-spacing:.1em;color:var(--ink-dim)">🗾 共享岛 · 岛主 <span data-ref="islandowner" style="color:var(--gold)">—</span></span><span data-ref="coopisland" style="font-family:var(--font-num);font-size:10px;color:var(--accent)">0/300</span></div>
          <div style="height:6px;border-radius:99px;background:var(--track);overflow:hidden;margin-top:4px"><div data-ref="coopislandfill" style="width:0%;height:100%;background:var(--accent);border-radius:99px"></div></div>
          <div data-ref="cooprank" style="display:flex;flex-direction:column;gap:2px;margin-top:5px"></div>
        </div>
        <div data-ref="allies" style="display:flex;flex-direction:column;gap:9px;flex:1;min-height:0;overflow-y:auto">${allyPreview}</div></div>
      <div style="background:var(--panel-grad);border:1px solid var(--panel-border);border-radius:var(--radius);box-shadow:inset 0 0 0 1px var(--hairline);padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px"><span style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-dim)">已装备 · 点击拆解</span></div>
        <div data-ref="equippedwrap" style="display:none">
          <div data-ref="equippedpanel" style="display:flex;flex-direction:column;gap:5px"></div></div>
        <div data-ref="equippedempty" style="font-size:10px;color:var(--ink-dim)">拖右侧战利品到武将身上装备</div></div></div>
    <!-- 战利品滚动槽（owner：捡到的物件不止 8 个 → 金铲铲式可滚动；坐在棋盘与最右友方战局之间）-->
    <div style="position:absolute;right:204px;top:120px;width:56px;bottom:140px;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:auto;z-index:2;background:var(--panel-grad);border:1px solid var(--panel-border);border-radius:12px;box-shadow:inset 0 0 0 1px var(--hairline);padding:8px 4px">
      <div style="font-size:8px;letter-spacing:.1em;color:var(--ink-dim);text-align:center;line-height:1.2">战利品<br><span data-ref="equipcount" style="font-family:var(--font-num);font-size:10px;color:var(--gold)">0</span></div>
      <div data-ref="equipslots" style="flex:1;min-height:0;width:100%;display:flex;flex-direction:column;align-items:center;gap:6px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin"></div></div>
    <!-- BOTTOM BAR · 经济 + 点将台 + 开战（覆盖 canvas 旧底部；按钮注入世界坐标点击）-->
    <div style="position:absolute;left:0;right:0;bottom:0;height:104px;display:flex;align-items:stretch;gap:14px;padding:14px 18px;background:var(--dock-bg);border-top:1px solid var(--panel-border);pointer-events:auto">
      <button data-act="shop-open" style="position:relative;overflow:hidden;flex:1;display:flex;align-items:center;justify-content:center;gap:12px;border-radius:16px;border:1px solid var(--accent);background:var(--accent-soft);color:var(--ink);cursor:pointer;box-shadow:inset 0 0 0 1px var(--hairline)">
        <span style="font-size:26px">🏯</span><div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2"><span style="font-family:var(--font-heading);font-weight:700;font-size:21px;color:var(--accent);letter-spacing:.04em">点将台 · 招募</span><span style="font-size:11px;color:var(--ink-dim)">点击开启 · 招募英雄入备战席</span></div></button>
      <button data-act="ready" style="width:172px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:16px;border:none;background:var(--ready-bg);color:var(--ready-text);cursor:pointer;box-shadow:var(--ready-shadow)">
        <span style="font-family:var(--font-heading);font-weight:700;font-size:24px;letter-spacing:.12em">开 战</span><span style="font-size:10px;letter-spacing:.22em;opacity:.85;margin-top:2px">READY · SPACE</span></button>
    </div>
    <!-- 点将台招募弹窗 -->
    <div data-act="shop-backdrop" style="position:absolute;inset:0;z-index:40;display:none;align-items:flex-start;justify-content:center;padding-top:58px;background:transparent;pointer-events:auto">
      <div data-stop="1" style="position:relative;width:900px;background:var(--panel-grad);border:1px solid var(--accent);border-radius:22px;box-shadow:inset 0 0 0 1px var(--hairline),0 30px 70px rgba(0,0,0,.55);padding:30px 32px 26px">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
          <div style="font-family:var(--font-display);font-size:38px;color:var(--ink);line-height:1">点将台</div>
          <div style="font-size:12px;color:var(--ink-dim)">招募英雄 · 每名 3 金 · 可刷新</div><div style="flex:1"></div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:12px;background:var(--gold-chip);border:1px solid var(--gold)"><span style="font-size:18px">🪙</span><span data-ref="gold" style="font-family:var(--font-num);font-size:20px;color:var(--gold)">0</span></div>
          <div data-act="shop-close" style="width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-dim);border:1px solid var(--panel-border);background:var(--chip-bg);font-size:16px">✕</div>
        </div>
        <div data-ref="shopcards" style="display:flex;gap:16px;min-height:160px"></div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:22px">
          <button data-act="reroll" style="display:flex;align-items:center;gap:8px;padding:11px 22px;border-radius:14px;border:none;cursor:pointer;background:var(--accent-grad);color:var(--accent-ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.3)"><span style="font-size:18px">🔄</span><span style="font-family:var(--font-heading);font-weight:700;font-size:15px">刷新</span><span style="font-family:var(--font-num);font-size:11px;color:var(--gold)">2金</span></button>
          <button data-act="lock" style="display:flex;align-items:center;gap:7px;padding:11px 18px;border-radius:14px;cursor:pointer;background:var(--btn-bg);border:1px solid var(--btn-edge);color:var(--btn-text);font-family:var(--font-heading);font-weight:700;font-size:14px">🔒 锁定商店</button>
          <div style="flex:1"></div>
          <button data-act="shop-close" style="padding:11px 30px;border-radius:14px;cursor:pointer;background:var(--btn-bg);border:1px solid var(--btn-edge);color:var(--ink);font-family:var(--font-heading);font-weight:700;font-size:15px">完成</button>
        </div>
      </div>
    </div>
    <!-- 开局三选一弹窗（接 rune_a/b/c；rune 实体在场时自动显示）-->
    <div data-ref="runemodal" style="position:absolute;inset:0;z-index:45;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.62);backdrop-filter:blur(5px);pointer-events:auto">
      <div style="text-align:center">
        <div style="font-family:var(--font-display);font-size:40px;color:var(--accent);letter-spacing:3px;margin-bottom:4px;text-shadow:0 2px 10px rgba(0,0,0,.5)">开局强化 · 三选一</div>
        <div style="font-size:13px;color:#fff;opacity:.72;margin-bottom:26px">择一而行 · 开战后生效</div>
        <div style="display:flex;gap:22px;justify-content:center">${runeCards}</div>
      </div>
    </div>`;

  // —— 交互接线：DOM 按钮 → 注入对应世界坐标的点击（clickable 按位置命中发信号）——
  const q = (s: string): HTMLElement => root.querySelector(s) as HTMLElement;
  const shopBackdrop = q('[data-act="shop-backdrop"]');
  const runeModal = q('[data-ref="runemodal"]');
  const shopCards = q('[data-ref="shopcards"]');
  const openShop = (b: boolean): void => { shopBackdrop.style.display = b ? 'flex' : 'none'; };
  const buffPop = q('[data-ref="buffpop"]');
  q('[data-act="xp"]').addEventListener('click', (e) => { e.stopPropagation(); click(300, 64); }); // 买经验（不连带触发卡片弹窗）
  q('[data-act="playerinfo"]').addEventListener('click', () => { buffPop.style.display = buffPop.style.display === 'flex' ? 'none' : 'flex'; }); // 点玩家卡 → 切换当前状态弹窗
  let boardsOpen = true; // 对战玩家迷你布阵图展开/收起（复刻设计稿 toggleBoards）
  q('[data-act="toggle-boards"]').addEventListener('click', (e) => {
    boardsOpen = !boardsOpen;
    root.querySelectorAll('.ally-board').forEach((b) => { (b as HTMLElement).style.display = boardsOpen ? 'flex' : 'none'; });
    (e.currentTarget as HTMLElement).textContent = boardsOpen ? '收起战况 ▴' : '展开战况 ▾';
  });
  q('[data-act="ready"]').addEventListener('click', () => click(300, 180));
  q('[data-act="shop-open"]').addEventListener('click', () => openShop(true));
  root.querySelectorAll('[data-act="shop-close"]').forEach((b) => b.addEventListener('click', () => openShop(false)));
  shopBackdrop.addEventListener('click', (e) => { if (e.target === shopBackdrop) openShop(false); });
  q('[data-stop]').addEventListener('click', (e) => e.stopPropagation());
  q('[data-act="reroll"]').addEventListener('click', () => click(300, 150));
  q('[data-act="lock"]').addEventListener('click', () => click(300, 120));
  shopCards.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest('[data-buy]') as HTMLElement | null;
    if (c) play(Number(c.dataset.buy)); // 直接驱动 CardPile.play → 扣金占席、入备战台（不依赖位置点击）
  });
  RUNES.forEach(([k, , , , x, y]) => q(`[data-rune="${k}"]`).addEventListener('click', () => click(x, y)));

  const setAll = (k: string, t: string): void => root.querySelectorAll(`[data-ref="${k}"]`).forEach((e) => { (e as HTMLElement).textContent = t; });
  const setW = (k: string, pct: string): void => root.querySelectorAll(`[data-ref="${k}"]`).forEach((e) => { (e as HTMLElement).style.width = pct; });
  const elPips = q('[data-ref="pips"]'), elPhase = q('[data-ref="phase"]'), elGuide = q('[data-ref="guidetext"]'), elSyn = q('[data-ref="synrows"]'), elName = q('[data-ref="namelayer"]'), elEquip = q('[data-ref="equipslots"]'), elGhost = q('[data-ref="ghostlayer"]');
  let lastEquip = -1, lastGhost = '';
  let lastShopSig = ''; // 点将台卡面只在「在售/可负担」变化时重渲（每帧重建会杀掉 :hover 浮动效果）。
  let lastSynSig = '';

  // 战利品袋（② 具体道具 + tooltip / ③ 拖装备）：JS 侧 meta 状态（不入战斗 hash）；拾取 items 上升沿掷一件。
  const bag: string[] = [];
  let rolled = 0; // 已掷次数（=累计拾取数；单调，与袋长解耦——装备移出袋不触发重掷）
  const equipped: EquipMap = {}; // marker 实例 id → 已装道具（③ 拖装备落 marker）
  // 渲染战利品格：具体道具(品级色边 + 图标 + draggable)；空格虚线。供 update（拾取变化）与拖装备后即时调。
  const renderBag = (): void => {
    if (!elEquip) return;
    if (!bag.length) { elEquip.innerHTML = '<div style="font-size:9px;color:var(--ink-dim);opacity:.6;text-align:center;margin-top:6px">空</div>'; return; }
    // 滚动槽（金铲铲式）：拾取不止 8，纵向可滚；每件具体道具(品级色边 + 图标 + draggable + hover)。
    elEquip.innerHTML = bag.map((id, i) => {
      const col = itemTip(id)?.color ?? '#caa15a';
      return `<div data-itemid="${id}" data-slot="${i}" draggable="true" title="拖到武将身上装备" style="flex:none;width:42px;height:42px;border-radius:8px;background:var(--gold-chip);border:2px solid ${col};display:flex;align-items:center;justify-content:center;font-size:18px;cursor:grab;box-shadow:0 0 8px ${col}55">${itemIcon(id)}</div>`;
    }).join('');
  };
  // 已装备面板（④ 拆解）：列出每名带装武将 + 其装备图标（点击拆解退回袋）。marker 是 canvas 实体 → 用 DOM 面板呈现。
  const elEquipped = q('[data-ref="equippedpanel"]'), elEquippedWrap = q('[data-ref="equippedwrap"]'), elEquippedEmpty = q('[data-ref="equippedempty"]');
  const renderEquipped = (): void => {
    if (!elEquipped) return;
    const keys = Object.keys(equipped).filter((k) => (equipped[k]?.length ?? 0) > 0);
    if (!keys.length) { if (elEquippedWrap) elEquippedWrap.style.display = 'none'; if (elEquippedEmpty) elEquippedEmpty.style.display = 'block'; elEquipped.innerHTML = ''; return; }
    if (elEquippedWrap) elEquippedWrap.style.display = 'block';
    if (elEquippedEmpty) elEquippedEmpty.style.display = 'none';
    const roster = rosterFor(faction);
    elEquipped.innerHTML = keys.map((mid) => {
      const mk = parseMarkerId(mid); const h = mk ? roster.find((x) => x.id === mk.heroId) : null;
      const label = `${h?.name ?? '武将'}${'★'.repeat(mk?.star ?? 1)}`;
      const items = (equipped[mid] ?? []).map((id) => { const col = itemTip(id)?.color ?? '#caa15a'; return `<span data-mid="${mid}" data-itemid="${id}" title="点击拆解" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--gold-chip);border:1.5px solid ${col};font-size:13px;cursor:pointer">${itemIcon(id)}</span>`; }).join('');
      return `<div style="display:flex;align-items:center;gap:6px"><span style="font-size:10px;color:var(--ink-dim);min-width:50px;white-space:nowrap">${label}</span><span style="display:flex;gap:4px;flex-wrap:wrap">${items}</span></div>`;
    }).join('');
  };
  const tip = document.createElement('div');
  tip.style.cssText = 'position:fixed;z-index:90;display:none;max-width:210px;padding:9px 12px;border-radius:9px;background:#1b1e25;border:1px solid #4a4a52;box-shadow:0 10px 28px rgba(0,0,0,.6);font-family:var(--font-cjk);pointer-events:none;line-height:1.55';
  root.appendChild(tip);
  const showTip = (id: string, x: number, y: number): void => {
    const t = itemTip(id);
    if (!t) { tip.style.display = 'none'; return; }
    tip.innerHTML = `<div style="font-weight:700;font-size:13px;color:${t.color}">${t.name}<span style="font-size:10px;color:#9aa"> ·${t.rarityLabel}·${t.slotLabel}</span></div>`
      + t.stats.map((s) => `<div style="font-size:11px;color:#cfe6ff">${s}</div>`).join('')
      + (t.effect ? `<div style="font-size:11px;color:#ffd56b;margin-top:2px">【${t.effect}】</div>` : '')
      + `<div style="font-size:10px;color:#9aa;margin-top:3px;font-style:italic">${t.desc}</div>`;
    tip.style.display = 'block';
    tip.style.left = `${x + 14}px`;
    tip.style.top = `${y + 12}px`;
  };
  const hideTip = (): void => { tip.style.display = 'none'; };
  if (elEquip) {
    elEquip.addEventListener('mouseover', (e) => { const el = (e.target as HTMLElement).closest('[data-itemid]') as HTMLElement | null; if (el?.dataset.itemid) showTip(el.dataset.itemid, (e as MouseEvent).clientX, (e as MouseEvent).clientY); });
    elEquip.addEventListener('mousemove', (e) => { if (tip.style.display === 'block') { tip.style.left = `${(e as MouseEvent).clientX + 14}px`; tip.style.top = `${(e as MouseEvent).clientY + 12}px`; } });
    elEquip.addEventListener('mouseout', hideTip);
    // ③ 拖装备：从战利品格拖出，dataTransfer 带 itemid + 槽位（落 canvas 武将 marker 由 startMatch 接）。
    elEquip.addEventListener('dragstart', (e) => {
      const el = (e.target as HTMLElement).closest('[data-itemid]') as HTMLElement | null;
      if (el?.dataset.itemid && (e as DragEvent).dataTransfer) { (e as DragEvent).dataTransfer!.setData('text/plain', `${el.dataset.itemid}|${el.dataset.slot}`); hideTip(); }
    });
  }
  // 已装备面板 hover tooltip（武将身上装备的悬浮说明，= ② 缓的那半的 DOM 版）。
  if (elEquipped) {
    elEquipped.addEventListener('mouseover', (e) => { const el = (e.target as HTMLElement).closest('[data-itemid]') as HTMLElement | null; if (el?.dataset.itemid) showTip(el.dataset.itemid, (e as MouseEvent).clientX, (e as MouseEvent).clientY); });
    elEquipped.addEventListener('mousemove', (e) => { if (tip.style.display === 'block') { tip.style.left = `${(e as MouseEvent).clientX + 14}px`; tip.style.top = `${(e as MouseEvent).clientY + 12}px`; } });
    elEquipped.addEventListener('mouseout', hideTip);
  }

  const update = (w: World): void => {
    const num = (id: string): number | undefined => (getComponentById(w, 'Resource', 'id', id) as { current?: number } | undefined)?.current;
    const max = (id: string): number | undefined => (getComponentById(w, 'Resource', 'id', id) as { max?: number } | undefined)?.max;
    const flag = (id: string): boolean | undefined => (getComponentById(w, 'Flag', 'id', id) as { active?: boolean } | undefined)?.active;
    const stageI = num('stage_idx') ?? 1, roundI = num('round_idx') ?? 1;
    setAll('stage', `${stageI}-${roundI}`);
    if (elPips) elPips.innerHTML = Array.from({ length: 5 }, (_, i) => {
      const on = i + 1 === stageI;
      return `<div style="width:${on ? 10 : 7}px;height:${on ? 10 : 7}px;border-radius:50%;background:${i + 1 <= stageI ? 'var(--accent)' : 'var(--ink-dim)'};box-shadow:${on ? '0 0 8px var(--accent)' : 'none'}"></div>`;
    }).join('');
    const prep = flag('in_prep');
    if (elPhase) {
      elPhase.textContent = prep ? '⚔ 备战 · 布阵' : '⚔ 战斗阶段';
      elPhase.style.background = prep ? 'var(--accent-soft)' : 'rgba(214,86,104,.16)';
      elPhase.style.color = prep ? 'var(--accent)' : 'var(--danger)';
      elPhase.style.borderColor = prep ? 'var(--accent)' : 'var(--danger)';
    }
    const t = Math.max(0, Math.ceil(num('prep_left') ?? 0));
    setAll('timer', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    const hpV = num('player_hp'), hpM = max('player_hp') ?? 100;
    if (hpV !== undefined) { setAll('hp', String(Math.round(hpV))); setW('hpfill', `${Math.max(0, Math.min(100, (hpV / (hpM || 100)) * 100))}%`); }
    const streak = num('win_streak') ?? 0;
    setAll('streak', `${streak}连胜`);
    const gold = num('gold') ?? 0;
    setAll('gold', String(Math.round(gold)));
    const lvl = num('level'); if (lvl !== undefined) setAll('level', String(Math.round(lvl)));
    const xpV = num('xp'), xpM = max('xp') ?? 0;
    if (xpV !== undefined) { setAll('xp', `${Math.round(xpV)}/${xpM || '—'}`); if (xpM > 0) setW('xpfill', `${Math.max(0, Math.min(100, (xpV / xpM) * 100))}%`); }
    const benchSp = num('bench_space'); if (benchSp !== undefined) setAll('bench', String(Math.round(benchSp)));
    // 攻岛进度 + 贡献度（T3/T4 投影；纯表现层）。
    const contribV = num('contribution'); if (contribV !== undefined) setAll('contrib', String(Math.round(contribV)));
    const islV = num('island_progress'), islM = max('island_progress') ?? 100;
    if (islV !== undefined) { setAll('island', `${Math.round(islV)}/${islM}`); setW('islandfill', `${Math.max(0, Math.min(100, (islV / (islM || 100)) * 100))}%`); }
    // 战利品滚动槽（②/③）：拾取 items 上升沿 → 掷具体道具入袋（rolled 单调，装备移出袋不重掷）；不再卡 8，纵向可滚。
    const itemN = Math.round(num('items') ?? 0);
    while (rolled < itemN) { bag.push(rollItemId(Math.random, stageI - 1)); rolled++; } // 太阁越深掉得越好（spec §二）
    setAll('equipcount', `${bag.length}`);
    if (elEquip && rolled !== lastEquip) {
      lastEquip = rolled;
      renderBag();
    }
    setAll('buffStreak', streak > 0 ? `连胜 ${streak} · 士气高涨` : '连胜越高士气越旺');
    // 羁绊真实计数（只在变化时重渲）+ 操作引导随相位。
    const counts = synData.map((s) => num(s.res) ?? 0);
    const synSig = counts.join(',');
    if (elSyn && synSig !== lastSynSig) { lastSynSig = synSig; elSyn.innerHTML = synData.map((s, i) => synRowHtml(s, counts[i])).join(''); }
    if (elGuide) elGuide.textContent = prep
      ? '招募英雄 → 拖上棋盘布阵（≤等级）→ 点「开战」'
      : '战斗进行中 · WASD 移动主公拾金 · 静待分出胜负';
    // 在板 marker 名牌（仅备战期投影；战斗期 marker 隐藏，由战斗单位头顶名字接管）。
    if (elName) {
      if (prep) {
        let html = '';
        for (const id of w.getAllEntities()) {
          if (!id.endsWith(':seat') || !/^bench\d*_[a-z]+_/.test(id) || !w.getComponent(id, 'HexPos')) continue;
          const tr = w.getComponent(id, 'Transform') as { x: number; y: number } | undefined;
          const mm = id.match(/^bench\d*_([a-z]+_[a-z]+)#/); // 阵营无关：a_guanyu / c_lvmeng …，名由 HERO_NAMES（按 faction 派生）查
          const nm = mm ? HERO_NAMES[mm[1]] : '';
          if (!tr || !nm) continue;
          const sx = tr.x * CAM_ZOOM + VIEWPORT_W / 2, sy = tr.y * CAM_ZOOM + VIEWPORT_H / 2 + 24;
          html += `<div style="position:absolute;left:${sx}px;top:${sy}px;transform:translateX(-50%);padding:1px 6px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;font:10px var(--font-body);white-space:nowrap">${nm}</div>`;
        }
        elName.innerHTML = html;
      } else if (elName.innerHTML) elName.innerHTML = '';
    }
    // 敌人预布阵幽灵（功能 B；仅备战期，英雄关半透明画出敌阵让玩家针对性布阵）。
    if (elGhost) {
      const sKey = prep ? `${stageI}-${roundI}` : '';
      if (sKey !== lastGhost) {
        lastGhost = sKey;
        if (!prep) elGhost.innerHTML = '';
        else {
          const foes = gameFEnemyPreview(stageI, roundI);
          elGhost.innerHTML = foes.map((f) => {
            const sx = f.x * CAM_ZOOM + VIEWPORT_W / 2, sy = f.y * CAM_ZOOM + VIEWPORT_H / 2;
            return `<div style="position:absolute;left:${sx}px;top:${sy}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;opacity:.5">
              <div style="width:34px;height:34px;border-radius:9px;border:2px dashed #3a86d4;background:rgba(58,134,212,.25);display:flex;align-items:center;justify-content:center;font-family:var(--font-cjk);font-weight:900;font-size:15px;color:#cfe2f7">魏</div>
              <div style="font:9px var(--font-body);padding:0 4px;border-radius:5px;background:rgba(0,0,0,.45);color:#bcd6f0;white-space:nowrap">${f.name}</div></div>`;
          }).join('');
        }
      }
    }
    runeModal.style.display = w.hasComponent('rune_a', 'Clickable') ? 'flex' : 'none'; // 三选一在场即显
    if (shopBackdrop.style.display === 'flex') {
      const afford = gold >= 3;
      const codes = [num('shop_slot_1') ?? 0, num('shop_slot_2') ?? 0, num('shop_slot_3') ?? 0];
      const sig = `${codes.join(',')}|${afford}`;
      if (sig === lastShopSig) return; // 无变化不重渲 → 保住 hover
      lastShopSig = sig;
      shopCards.innerHTML = codes.map((code, i) => {
        const h = HEROES[code];
        if (!h) return `<div style="flex:1;min-height:160px;border-radius:14px;border:1px dashed var(--panel-border);background:var(--chip-bg);display:flex;align-items:center;justify-content:center;color:var(--ink-dim);font-size:13px">— 空 —</div>`;
        return `<div data-buy="${i}" style="position:relative;flex:1;display:flex;flex-direction:column;overflow:hidden;cursor:${afford ? 'pointer' : 'not-allowed'};border-radius:14px;border:1px solid ${SHU};background:var(--panel-grad);box-shadow:inset 0 0 0 1px var(--hairline),0 6px 16px rgba(0,0,0,.22);opacity:${afford ? 1 : 0.55};min-height:160px">
          <div style="height:28px;display:flex;align-items:center;justify-content:center;background:${SHU};color:#fff;font-weight:700;font-family:var(--font-num);font-size:13px">🪙 3</div>
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:14px">
            <div style="width:80px;height:80px;border-radius:13px;background:linear-gradient(160deg,${SHU}cc,${SHU}55);border:2px solid ${SHU};display:flex;align-items:center;justify-content:center;overflow:hidden"><img src="${h[3]}" alt="${h[0]}" style="width:62px;height:62px;image-rendering:pixelated"></div>
            <div style="font-family:var(--font-cjk);font-weight:700;font-size:18px;color:var(--ink)">${h[0]}</div>
            <div style="display:flex;gap:6px"><span style="font-family:var(--font-cjk);font-size:11px;font-weight:700;padding:2px 9px;border-radius:99px;background:var(--chip-bg);border:1px solid var(--panel-border);color:var(--ink-dim)">${playerFacLabel}</span><span style="font-family:var(--font-cjk);font-size:11px;font-weight:700;padding:2px 9px;border-radius:99px;background:var(--chip-bg);border:1px solid var(--panel-border);color:var(--ink-dim)">${h[2]}</span></div>
          </div></div>`;
      }).join('');
    }
  };
  // 盟友镜像投影：把每名盟友的真实战局单位画进对应迷你棋盘（startMatch 每帧喂 ally-mirror 单位）。
  // 颜色取该卡的势力（ALLY_ROSTER[i].fac），与引擎名册解耦——迷你图画的是位置/阵营，不是具体武将。
  const renderAllies = (unitsList: { q: number; r: number; enemy: boolean; hpFrac: number }[][]): void => {
    unitsList.forEach((units, i) => {
      const el = root.querySelector(`[data-ref="allyboard${i}"]`) as HTMLElement | null;
      if (el) el.innerHTML = liveMini(ALLY_ROSTER[i]?.fac ?? '蜀', units);
    });
  };
  // 共享岛投影（多人 B·slice1）：三方贡献和 → 进度条 + 岛主。
  const renderCoop = (island: { progress: number; goal: number; owner: string | null; ranking?: { name: string; faction: string; contribution: number }[] }): void => {
    const setT = (k: string, t: string): void => { const e = root.querySelector(`[data-ref="${k}"]`) as HTMLElement | null; if (e) e.textContent = t; };
    setT('islandowner', island.owner ?? '—');
    setT('coopisland', `${Math.round(island.progress)}/${island.goal}`);
    // 贡献榜（co-opetition 张力可视化）：按名次排，岛主戴冠。
    const lb = root.querySelector('[data-ref="cooprank"]') as HTMLElement | null;
    if (lb && island.ranking) {
      lb.innerHTML = island.ranking.map((o, i) => `<div style="display:flex;align-items:center;gap:5px;font-size:9.5px;color:${i === 0 ? 'var(--gold)' : 'var(--ink-dim)'}"><span>${i === 0 ? '👑' : `${i + 1}.`}</span><span style="flex:1">${o.name}·${o.faction}</span><span style="font-family:var(--font-num)">${Math.round(o.contribution)}</span></div>`).join('');
    }
    const f = root.querySelector('[data-ref="coopislandfill"]') as HTMLElement | null;
    if (f) f.style.width = `${Math.max(0, Math.min(100, (island.progress / (island.goal || 1)) * 100))}%`;
  };
  // 局内可见牌组（P0）：每张卡显当前效果值（读 buff/count 资源），开战边沿 flash 一下。
  let lastInCombatDeck = false;
  const renderDeck = (w: World): void => {
    const rnum = (id: string): number => (getComponentById(w, 'Resource', 'id', id) as unknown as { current?: number } | undefined)?.current ?? 0;
    const inCombat = ((getComponentById(w, 'Flag', 'id', 'in_combat') as unknown as { active?: boolean } | undefined)?.active) ?? false;
    for (const c of passiveCards) {
      const el = root.querySelector(`[data-ref="deckval_${c.id}"]`) as HTMLElement | null;
      if (!el) continue;
      let txt = '';
      if (c.kind === 'synergy-buff') { const n = rnum(`deck_count_${c.id}`); txt = `在板 ${n} → +${Math.round(n * c.perUnit * 100)}% 攻`; }
      else if (c.kind === 'threshold-buff') { const n = rnum(`deck_count_${c.id}`); const bonus = c.tiers.filter((t) => n >= t.at).reduce((s, t) => s + t.bonus, 0); txt = `${n} 个 → +${Math.round(bonus * 100)}%`; }
      else if (c.kind === 'round-buff') { const r = rnum('round_idx'); txt = r <= c.untilRound ? `前${c.untilRound}回合 +${Math.round(c.bonus * 100)}%` : '序盘加成已过'; }
      else if (c.kind === 'economy-band') { txt = '金币阶梯利息'; }
      else if (c.kind === 'shop-weight') { txt = `商店加权 ×${c.copies}`; }
      el.textContent = txt;
    }
    // 主动锦囊：刷充能 + 充能 0 灰按钮。
    for (const c of jinnangCards) {
      const ch = rnum(`charge_${c.id}`);
      const e = root.querySelector(`[data-ref="charge_${c.id}"]`) as HTMLElement | null; if (e) e.textContent = String(ch);
      const btn = root.querySelector(`[data-act="cast_${c.id}"]`) as HTMLElement | null; if (btn) { btn.style.opacity = ch > 0 ? '1' : '0.4'; btn.style.cursor = ch > 0 ? 'pointer' : 'not-allowed'; }
    }
    if (inCombat && !lastInCombatDeck) { // 开战锁存拍：被动卡闪一下（被动发动可见）
      for (const c of passiveCards) {
        const card = root.querySelector(`[data-ref="deckcard_${c.id}"]`) as HTMLElement | null;
        if (card) { card.style.background = 'var(--accent-soft)'; setTimeout(() => { card.style.background = 'var(--chip-bg)'; }, 500); }
      }
    }
    lastInCombatDeck = inCombat;
  };
  return { root, update, renderAllies, renderCoop, renderDeck, bag, equipped, renderBag, renderEquipped };
}

// 局内对局（startMatch）：从大厅收到出战配置 → 用所选牌组建世界开打。onExit=返回大厅。
function startMatch(container: HTMLElement, cfg: RunConfig, onExit: () => void): () => void {
  const style = document.createElement('style');
  style.textContent = `.gfx-root.aurora{${AURORA}} .gfx-root.onyx{${ONYX}} ${SHELL_CSS}`;
  document.head.appendChild(style);

  const root = el('div', 'gfx-root aurora');
  // 顶栏：标题 + 页标签（对局/商城）+ 货币 + 皮肤切换（壳层换肤；对局内画布为锦霞数据染色）。
  const top = el('div', 'gfx-top');
  top.appendChild(el('div', 'gfx-title', '像素三分天下'));
  const tabBar = el('div', 'gfx-tabs');
  const tabBack = el('button', 'gfx-tab', '← 大厅') as HTMLButtonElement;
  const tabGame = el('button', 'gfx-tab on', '对 局') as HTMLButtonElement;
  const tabMall = el('button', 'gfx-tab', '商 城') as HTMLButtonElement;
  tabBar.appendChild(tabBack);
  tabBar.appendChild(tabGame);
  tabBar.appendChild(tabMall);
  tabBack.onclick = onExit; // 返回大厅
  top.appendChild(tabBar);
  const cur = el('div', 'gfx-cur', `<span class="gfx-chip">💎 <b>1280</b> ＋</span><span class="gfx-chip">🪙 <b>3600</b> ＋</span>`);
  // 皮肤分段控件（玄铁/锦霞；默认锦霞=aurora）。
  const skinSeg = el('div', 'gfx-seg');
  skinSeg.appendChild(el('span', 'lbl', '皮肤'));
  const skinBox = el('div', 'gfx-segbox');
  const segOnyx = el('button', 'gfx-segbtn', '玄铁') as HTMLButtonElement;
  const segBrocade = el('button', 'gfx-segbtn on', '锦霞') as HTMLButtonElement;
  skinBox.appendChild(segOnyx);
  skinBox.appendChild(segBrocade);
  skinSeg.appendChild(skinBox);
  cur.appendChild(skinSeg);
  top.appendChild(cur);
  root.appendChild(top);

  // 对局视图：锦霞面板 chrome 包画布 + 提示组件（kit notification 形）。
  const gameView = el('div', 'gfx-view');
  const boardPanel = el('div', 'gfx-board-panel');
  const stage = el('div', '');
  stage.style.cssText = `position:relative;width:${VIEWPORT_W}px;height:${VIEWPORT_H}px;overflow:hidden;background:var(--battlefield);background-size:cover`;
  boardPanel.appendChild(stage);
  // DOM 按钮 → 命令路由：位置点击触发 canvas clickable / CardPile play 直接买入（与键盘指针同 InputSource）。
  const queued = new QueuedInputSource('p1');
  const clickW = (x: number, y: number): void => queued.enqueue({ source: 'p1', x, y, phase: 'down' });
  const playShop = (i: number): void => queued.enqueue({ source: 'shop', key: 'play', values: [i] });
  // 对局 DOM 设计 chrome 覆盖层（顶/左/右/底 + 点将台/三选一弹窗；接真实世界状态 + 命令）。
  // 大重构方向（魏蜀吴 3 人一队、太阁立志传背景）：单人/双人之分取消——多人对局缺人由 AI 补位，菜单不再分模式。
  const hud = buildSoloHud(clickW, playShop, cfg.deck?.faction ?? 'shu', cfg.deck); // 阵营感知 HUD + 局内可见牌组（P0）+ 主动锦囊（P1）
  // 主动锦囊点击（P1/P1.5）：self/buff 类即时施放；pointer 类→进点地态→下次点棋盘在落点施放。
  // enqueueAction(cast,{x,y}) 一条事件同时：keybind 产 Signal cast_<id>（craft 扣充能 + caster 触发）+ 提供光标世界坐标（caster at:'pointer' 读它）。
  let armedCast: string | null = null;
  let canvasEl: HTMLCanvasElement | null = null;
  hud.root.querySelectorAll<HTMLElement>('[data-act^="cast_"]').forEach((btn) => btn.addEventListener('click', () => {
    const act = btn.dataset.act!;
    if (btn.dataset.target === 'pointer') { armedCast = act; if (canvasEl) canvasEl.style.cursor = 'crosshair'; } // 进点地态
    else queued.enqueueAction(act); // 鼓舞等即时
  }));
  boardPanel.appendChild(hud.root);
  gameView.appendChild(boardPanel); // 操作引导已移入顶栏状态栏（data-ref guide），不再单列底注。
  // 盟友镜像（三人 Mirror）：两名 AI 盟友各跑自己的 game-f PvE，右栏迷你棋盘实时投影其战局（state-sync 还原）。
  // 太阁强度按攻岛人数缩放（designer #28）：N 人同凿一岛 → 各 owner 太阁 ×hpMul（防秒岛、拉长终盘）；单机 N=1 不变。
  const playerCount = 1 + (cfg.allies?.length ?? 0);
  const coopMul = enemyScaleForPlayers(playerCount);
  const coopAtk = enemyAtkBaseForPlayers(playerCount);
  const allies = createAllyMirrors(cfg.allies, coopMul, coopAtk); // 组队房配置的盟友阵营（slice3）+ 人数难度 hp/atk（#28）
  // 局内 HUD = 这份手写 DOM 覆盖层（顶栏/左下主公卡/右盟友预览/底点将台·开战 + 弹窗）；GameShell（GAME_F_UI）
  // 留作数据化壳层蓝本/测试，但**不在局内并存渲染**——避免在棋盘下方堆叠出第二套点将台/主公卡（owner 报重复）。

  // 商城视图（README §4）。
  const mallView = buildMall();
  mallView.style.display = 'none';

  root.appendChild(gameView);
  root.appendChild(mallView);
  container.appendChild(root);

  // 视图状态：页签（对局/商城）。
  let tab: 'game' | 'mall' = 'game';
  const applyView = (): void => {
    const showMall = tab === 'mall';
    gameView.style.display = showMall ? 'none' : '';
    mallView.style.display = showMall ? '' : 'none';
    tabGame.classList.toggle('on', tab === 'game');
    tabMall.classList.toggle('on', tab === 'mall');
  };
  tabGame.onclick = () => { tab = 'game'; applyView(); };
  tabMall.onclick = () => { tab = 'mall'; applyView(); };
  const applySkin = (onyx: boolean): void => {
    root.classList.toggle('onyx', onyx);
    root.classList.toggle('aurora', !onyx);
    segOnyx.classList.toggle('on', onyx);
    segBrocade.classList.toggle('on', !onyx);
  };
  segOnyx.onclick = () => applySkin(true);
  segBrocade.onclick = () => applySkin(false);
  applyView();

  // 美术资产（数据驱动，R9）：注册清单 → 异步加载；就绪前渲染器退化几何，就绪后自动画占位 token。
  const assets = new AssetManager(new ImageAssetLoader());
  assets.registerManifest(GAME_F_ASSETS);
  void assets.loadAll();

  // 输入源懒适配：Engine 的 input 是构造期只读，而 canvas 由 attachRenderer 挂载时才创建 → 占位转发。
  const keyboard = new KeyboardInputSource('p1', window);
  let pointer: PointerInputSource | null = null;
  const lazyInput: InputSource = { commandsForTick: (tick) => [...keyboard.commandsForTick(tick), ...(pointer ? pointer.commandsForTick(tick) : []), ...queued.commandsForTick(tick)] };
  const engine = new Engine({ tickRate: 60, input: lazyInput });
  engine.load(buildGameFBlueprint({ deck: cfg.deck, difficulty: rankFor(getLP()).difficulty * coopMul, enemyDmgBase: coopAtk })); // 出战牌组 + 段位难度阀 × 人数缩放(hp) + 太阁 atk 基线按人数
  // 透明画布：棋盘露出 stage 的设计平台背景（--platform-bg 随皮肤）。
  engine.attachRenderer(new CanvasRenderer({ width: VIEWPORT_W, height: VIEWPORT_H, background: 'transparent', assets }), stage);
  const canvas = stage.querySelector('canvas');
  if (canvas) {
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'pointer';
    canvas.style.position = 'relative'; // 抬到王冠台座之上（z1 > crown z0）
    canvas.style.zIndex = '1';
    pointer = new PointerInputSource('p1', canvas, {
      worldFromScreen: (sx, sy) => ({ x: (sx - VIEWPORT_W / 2) / CAM_ZOOM, y: (sy - VIEWPORT_H / 2) / CAM_ZOOM }),
    });
    canvasEl = canvas;
    // 点地锦囊（P1.5）：处于点地态时，捕获棋盘点击 → 在落点世界坐标施放（caster at:'pointer' 读同条事件的 x/y），消费此点击。
    canvas.addEventListener('click', (e) => {
      if (!armedCast) return;
      const me = e as MouseEvent;
      const rect = canvas.getBoundingClientRect();
      const sx = (me.clientX - rect.left) * (VIEWPORT_W / rect.width);
      const sy = (me.clientY - rect.top) * (VIEWPORT_H / rect.height);
      queued.enqueueAction(armedCast, { x: (sx - VIEWPORT_W / 2) / CAM_ZOOM, y: (sy - VIEWPORT_H / 2) / CAM_ZOOM });
      armedCast = null;
      canvas.style.cursor = 'pointer';
      e.stopPropagation();
    }, true); // capture：抢在普通点击前
    // ③ 拖装备落 marker：战利品格拖到 canvas 武将 → 命中最近 marker → applyEquip 烘 HP 进下次部署。
    const equipFaction = cfg.deck?.faction ?? 'shu';
    const equipRoster = rosterFor(equipFaction);
    const equipToast = (msg: string): void => { const t = document.createElement('div'); t.style.cssText = 'position:absolute;left:50%;top:28%;transform:translateX(-50%);z-index:70;background:#23262d;color:#f3e9d6;border:1px solid var(--gold);border-radius:10px;padding:9px 16px;font-size:13px;box-shadow:0 10px 28px rgba(0,0,0,.5)'; t.textContent = msg; hud.root.appendChild(t); setTimeout(() => t.remove(), 2200); };
    canvas.addEventListener('dragover', (e) => e.preventDefault());
    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const data = (e as DragEvent).dataTransfer?.getData('text/plain'); if (!data) return;
      const [itemId, slotStr] = data.split('|'); const slot = Number(slotStr);
      const rect = canvas.getBoundingClientRect();
      const wx = ((e as DragEvent).clientX - rect.left) * (VIEWPORT_W / rect.width) / CAM_ZOOM - VIEWPORT_W / 2 / CAM_ZOOM;
      const wy = ((e as DragEvent).clientY - rect.top) * (VIEWPORT_H / rect.height) / CAM_ZOOM - VIEWPORT_H / 2 / CAM_ZOOM;
      let best: { id: string; heroId: string; star: number } | null = null, bd = Infinity;
      for (const id of engine.world.queryEntities('Draggable')) {
        const mk = parseMarkerId(id); if (!mk) continue;
        const tr = engine.world.getComponent(id, 'Transform') as { x: number; y: number } | undefined; if (!tr) continue;
        const d = (tr.x - wx) ** 2 + (tr.y - wy) ** 2; if (d < bd) { bd = d; best = { id, heroId: mk.heroId, star: mk.star }; }
      }
      if (!best || bd > 48 * 48) { equipToast('拖到武将身上才能装备'); return; }
      const h = equipRoster.find((x) => x.id === best!.heroId); if (!h) return;
      const name = ITEM_LIB[itemId]?.name ?? itemId;
      if (applyEquip(engine.world, best.id, itemId, hud.equipped, h, best.star, coopMul)) {
        if (hud.bag[slot] === itemId) hud.bag.splice(slot, 1); else { const k = hud.bag.indexOf(itemId); if (k >= 0) hud.bag.splice(k, 1); }
        hud.renderBag(); hud.renderEquipped();
        equipToast(`${h.name} 装备「${name}」· 下次开战生效`);
      } else equipToast(`${h.name} 已满 3 件`);
    });
    // ④ 拆解：点已装备面板里的装备 → unequip 退回袋 + 重烘 HP。
    const equippedPanel = hud.root.querySelector('[data-ref="equippedpanel"]');
    equippedPanel?.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-mid]') as HTMLElement | null;
      const mid = el?.dataset.mid, itemId = el?.dataset.itemid; if (!mid || !itemId) return;
      const mk = parseMarkerId(mid); const h = mk ? equipRoster.find((x) => x.id === mk.heroId) : null; if (!mk || !h) return;
      const removed = unequip(engine.world, mid, itemId, hud.equipped, h, mk.star, coopMul);
      if (removed) { if (hud.bag.length < 8) hud.bag.push(removed); hud.renderBag(); hud.renderEquipped(); equipToast(`拆下「${ITEM_LIB[removed]?.name ?? removed}」退回战利品`); }
    });
    hud.renderEquipped(); // 初始（空→隐藏）
  }
  engine.start();

  // HUD 实时投影：每帧读世界资源刷新 DOM 数字/条（纯表现层，不进 hash）。商店脸图由 DOM 点将台弹窗
  // 自渲（update 读 shop_slot_i 码），无需 GameShell 的 shop_face StringVar 投影。
  let rafId = 0;
  const COOP_NAMES = ['玄德', '仲谋', '孟德'];
  const FAC_LABEL: Record<string, string> = { shu: '蜀', wei: '魏', wu: '吴' };
  const COOP_FACS = [FAC_LABEL[cfg.deck?.faction ?? 'shu'] ?? '蜀', ...(cfg.allies ?? ['wu', 'wei']).map((f) => FAC_LABEL[f] ?? '群')];
  let lootGiven = false; // Boss 宝箱分卡一局一次（岛陷落边沿）
  const pump = (): void => {
    hud.update(engine.world);
    hud.renderDeck(engine.world);
    hud.renderAllies(allies.map((a) => a.units()));
    // 共享岛（多人 B·slice1）：玩家 + 2 盟友贡献凿同一座岛。
    const myContrib = (getComponentById(engine.world, 'Resource', 'id', 'contribution') as unknown as { current?: number } | undefined)?.current ?? 0;
    const owners = [
      { name: COOP_NAMES[0], faction: COOP_FACS[0], human: true, contribution: myContrib },
      ...allies.map((a, i) => ({ name: COOP_NAMES[i + 1] ?? `盟友${i}`, faction: COOP_FACS[i + 1] ?? '群', human: false, contribution: a.contribution() })),
    ];
    const island = computeCoopIsland(owners);
    hud.renderCoop(island);
    // B·slice2：岛陷落（合作杀 Boss）→ 宝箱掷点分卡，按贡献轮选；人类份额入收藏。
    if (island.fallen && !lootGiven) {
      lootGiven = true;
      const shares = distributeBossLoot(owners, 3, GACHA_POOL);
      const mine = shares.find((s) => s.human);
      if (mine && mine.cards.length) grantCards(mine.cards.map((c) => c.id));
      const t = document.createElement('div');
      t.style.cssText = 'position:absolute;left:50%;top:38%;transform:translateX(-50%);z-index:60;background:#23262d;color:#f3e9d6;border:1px solid var(--gold);border-radius:12px;padding:14px 20px;font-size:14px;line-height:1.5;box-shadow:0 12px 34px rgba(0,0,0,.55);text-align:center';
      t.innerHTML = `🗾 <b>天守陷落！</b>宝箱分卡（按贡献轮选）<br>${shares.map((s) => `${s.name} +${s.cards.length}`).join(' · ')}<br><span style="font-size:11px;color:#cdbb98">你的 ${mine?.cards.length ?? 0} 张已入收藏</span>`;
      hud.root.appendChild(t);
      setTimeout(() => t.remove(), 6000);
    }
    rafId = requestAnimationFrame(pump);
  };
  rafId = requestAnimationFrame(pump);

  return () => {
    cancelAnimationFrame(rafId);
    // 经济 v1：返回大厅前结算战功（贡献+胜负+波深 → 持久软币）。纯账号层、单向消费，读完即走（不进 sim）。
    try {
      const rnum = (id: string): number => (getComponentById(engine.world, 'Resource', 'id', id) as unknown as { current?: number } | undefined)?.current ?? 0;
      const victory = rnum('island_progress') >= 100;
      settleRun({ contribution: rnum('contribution'), victory, wave: rnum('stage_idx') });
      updateLpAfterRun(victory); // 段位：胜 +LP / 负 -LP（名次→难度阀，下局更凶/更缓）
    } catch { /* 结算失败不阻塞退出 */ }
    engine.stop();
    allies.forEach((a) => a.dispose());
    keyboard.dispose();
    pointer?.dispose();
    if (style.parentNode) style.parentNode.removeChild(style);
    if (root.parentNode === container) container.removeChild(root);
  };
}

// 卡带入口：先进局外大厅（Lobby）→「开始攻岛」产出出战配置 → startMatch 接手对局；「← 大厅」返回。
export function mount(container: HTMLElement): () => void {
  // 字体（README §Typography；id 防重复注入）——大厅与对局共用。
  if (!document.getElementById('gfx-fonts')) {
    const link = document.createElement('link');
    link.id = 'gfx-fonts';
    link.rel = 'stylesheet';
    link.href = FONTS_HREF;
    document.head.appendChild(link);
  }
  let teardown: (() => void) | null = null;
  const showLobby = (): void => {
    const lobby = buildLobby((cfg) => {
      if (lobby.parentNode === container) container.removeChild(lobby);
      teardown = startMatch(container, cfg, () => { teardown?.(); showLobby(); });
    });
    container.appendChild(lobby);
    teardown = () => { if (lobby.parentNode === container) container.removeChild(lobby); };
  };
  showLobby();
  return () => { teardown?.(); };
}
