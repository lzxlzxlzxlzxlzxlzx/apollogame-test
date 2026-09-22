import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type { Resource, PlayedHand, Flag, StringVar, ScoreTrace, ScoreEvent } from '@zerocraft/engine/engine/protocol/components.js';
import {
  buildGameEBlueprint, buildJokerEntities, jokerToEntities, toEngineCard, BASE_CHIPS_BY_RANK, HAND_TYPE_TO_ENGINE, HANDMOD_FLAGS, F_DID_DISCARD, F_DID_ROUND,
  R_CHIPS, R_MULT, R_MONEY, R_HAND_SCORE, R_ROUND_SCORE, R_HANDS_LEFT, R_DISCARDS_LEFT, R_BLIND, V_HAND_TYPE,
} from './blueprint.js';
import {
  HAND_RANKINGS, HAND_ORDER, handScoreAtLevel, RANK_ORDER, RANKS, SUITS, shuffledDeck, rollJokerOffer, blindRequirement, BLIND_ORDER,
  COMMON_PLANETS, planetForHand, bossForAnte, TAROTS, ENCHANTS, roundEndPayout, discardPayout, passiveTotals,
  type PlanetCard, type BossBlind, type TarotCard, type EnchantId,
  type Card, type Suit, type Rank, type HandType, type JokerCard, type BlindKind,
} from './index.js';

// 消耗位道具 = 星球牌（升级牌型）或 塔罗牌（盖附魔）。
type Consumable = PlanetCard | TarotCard;
import { cardCell, CELL_W, CELL_H, SHEET_W, SHEET_H } from './cards-atlas.js';
import { inlineUrl } from '@zerocraft/engine/assets/inline-url.js';
import { evaluateHand } from '@zerocraft/engine/skills/tier3/index.js';

// 引擎牌型名(连字符) → 游戏牌型表键(下划线)，供选牌时的牌型预览取基础 chips/mult。
const ENGINE_TO_HR: Record<string, HandType> = {
  'high-card': 'high_card', pair: 'pair', 'two-pair': 'two_pair', 'three-of-a-kind': 'three_kind',
  straight: 'straight', flush: 'flush', 'full-house': 'full_house', 'four-of-a-kind': 'four_kind',
  'straight-flush': 'straight_flush', 'five-of-a-kind': 'five_kind', 'flush-house': 'flush_house', 'flush-five': 'flush_five',
};

// ════════════════════════════════════════════════════════════════════════
//  Game E · 小丑牌 单人 MVP（按设计稿 §五 回合流程：Ante→三盲注→冲线→商店）。
//
//  顺序：每个 Ante = Small(×1)→Big(×1.5)→Boss(×2) 三道盲注。每道：发 8 张 + hands(4)/discards(3)
//    → 选≤5 出牌(累加 round_score) 或弃牌(补牌不计分) → round_score≥盲注线 即过关
//    → 结算 $（基础+剩余手数+利息）→ 商店买小丑 → 下一道盲注；hands 耗尽未过线 = 失败。
//  ★ 开局 0 小丑（buildJokerEntities([])）；小丑只能在商店买（jokerToEntities 加进运行中的引擎）。
//  逻辑全在引擎（poker-hand/card-scoring/effect-apply）；本文件是回合流程 + 表现的薄层（读/写世界资源）。
// ════════════════════════════════════════════════════════════════════════

// 资源前缀：dev/web 为 '/'，烧录(electron file://, base './') 为 './' —— 用 BASE_URL 让 /assets 路径在两边都解析。
const ASSET_BASE: string = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
// inlineUrl：单文件构建命中内联表给 data: URI；否则走 ASSET_BASE+路径（多文件不变）。
// 写成函数=懒求值：在渲染时才算，确保内联表（classic 脚本）已就绪（避免模块顶层早求值拿到坏路径）。
const CARDS_URL = () => inlineUrl('assets/FreeArtLib/cardgame/cards.png', ASSET_BASE);
const COIN_URL = () => inlineUrl('assets/FreeArtLib/item/gold/gold_pile.png', ASSET_BASE); // 过关金币迸射（真素材，缺图回退 🪙）
const JOKER_URL = (name: string) => inlineUrl(`assets/FreeArtLib/cardgame/card/${name.replace(/ /g, '_')}.webp`, ASSET_BASE);
const SCALE = 0.82; // 手牌显示缩放（8 张一行排得下）
const CW = Math.round(CELL_W * SCALE);
const CH = Math.round(CELL_H * SCALE);
const HAND_SIZE = 8;
const HANDS_PER_BLIND = 4;
const DISCARDS_PER_BLIND = 3;
const JOKER_SLOTS = 5;
const REROLL_COST = 5;

const RARITY_COLOR: Record<string, string> = { common: '#9ca3af', uncommon: '#34d399', rare: '#60a5fa', legendary: '#f59e0b' };
const SUIT_SYM: Record<Suit, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };

// 逐张/逐小丑计分演出的一帧（纯表现：显示用 chips/mult + 高亮哪张牌 + 抖哪个小丑）。
interface SeqFrame { chips: number; mult: number; score: number | null; hi: number | null; wiggle: string | null; dur: number; }

// 素材库 GUI 图标（DCSS）：仅用语义贴切的两张——tavern≈商店、scroll≈日志卷轴；加载失败回退 emoji。
const GUI_TAVERN = `${ASSET_BASE}assets/FreeArtLib/gui/tavern.png`;
const GUI_SCROLL = `${ASSET_BASE}assets/FreeArtLib/gui/spells/components/scroll.png`;
function GuiIcon({ src, emoji, size = 22 }: { src: string; emoji: string; size?: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, verticalAlign: 'middle' }}>
      <span style={{ position: 'absolute', inset: 0, fontSize: size - 5, lineHeight: `${size}px`, textAlign: 'center' }}>{emoji}</span>
      <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
    </span>
  );
}

const BLIND_META: Record<BlindKind, { label: string; icon: string; reward: number }> = {
  small: { label: '小盲注', icon: '🔸', reward: 3 },
  big: { label: '大盲注', icon: '🔶', reward: 4 },
  boss: { label: 'Boss 盲注', icon: '👹', reward: 5 },
};

function cardBg(suit: Suit, rank: Rank): React.CSSProperties {
  const { col, row } = cardCell(suit, rank);
  return {
    width: CW, height: CH,
    backgroundImage: `url(${CARDS_URL()})`,
    backgroundSize: `${SHEET_W * SCALE}px ${SHEET_H * SCALE}px`,
    backgroundPosition: `-${col * CELL_W * SCALE}px -${row * CELL_H * SCALE}px`,
    borderRadius: 6,
  };
}

type Phase = 'playing' | 'shop' | 'lost';

function GameE() {
  const engineRef = useRef<Engine | null>(null);
  const seedRef = useRef(20260608);
  const deckRef = useRef<Card[]>([]);
  const deckPtrRef = useRef(0);

  const [ante, setAnte] = useState(1);
  const [blindIdx, setBlindIdx] = useState(0); // 0 small, 1 big, 2 boss
  const [owned, setOwned] = useState<JokerCard[]>([]);
  const [hand, setHand] = useState<Card[]>(() => shuffledDeck(20260608).slice(0, HAND_SIZE));
  const [sel, setSel] = useState<boolean[]>(() => new Array(HAND_SIZE).fill(false));
  const [phase, setPhase] = useState<Phase>('playing');
  const [result, setResult] = useState<{ type: HandType; chips: number; mult: number; score: number } | null>(null);
  const [shopOffer, setShopOffer] = useState<JokerCard[]>([]);
  const [anim, setAnim] = useState<{ idx: number[]; mode: 'play' | 'discard' } | null>(null); // 正在飞出的手牌下标
  const [newKeys, setNewKeys] = useState<Set<string>>(() => new Set()); // 刚抽到的牌（飞入动画）
  const [scoring, setScoring] = useState<{ cards: Card[]; scoringIdx: number[]; frame: SeqFrame } | null>(null); // 出牌计分演出
  const seqRef = useRef<{ frames: SeqFrame[]; i: number; after: () => void; cards: Card[]; scoringIdx: number[] } | null>(null);
  // 星球牌（牌型升级）/ Boss 诅咒 / 牌组预览 状态。
  const [handLevels, setHandLevels] = useState<Record<HandType, number>>(() => Object.fromEntries(HAND_ORDER.map((h) => [h, 1])) as Record<HandType, number>);
  const handLevelsRef = useRef(handLevels); // 同步给 startBlind 重建 rankingTable（燧石减半）用
  const [consumables, setConsumables] = useState<Consumable[]>([]); // 持有道具（星球/塔罗），待使用
  const [shopConsumables, setShopConsumables] = useState<Consumable[]>([]); // 商店道具货架（星球+塔罗）
  const [enchanted, setEnchanted] = useState<Record<string, EnchantId[]>>({}); // 牌身份→附魔列表（可叠加，持久）
  const enchantedRef = useRef<Record<string, EnchantId[]>>({}); // 同步给回调里读（出牌时映射 mods）
  const [playedTypes, setPlayedTypes] = useState<HandType[]>([]); // 本道已打出的牌型（巨眼诅咒用）
  const [deckOpen, setDeckOpen] = useState(false); // 牌组/牌型面板开关
  const [mascot, setMascot] = useState(false); // 过关时蹦出的萌宠（爱萌 出品位）
  const [slam, setSlam] = useState(false); // 出牌结算落定时的砸屏震动
  const [bossIntro, setBossIntro] = useState<BossBlind | null>(null); // Boss 入场横幅
  const [moneyFx, setMoneyFx] = useState<{ d: number; k: number } | null>(null); // 钱变动飘字
  const prevMoneyRef = useRef(0);
  const [helpOpen, setHelpOpen] = useState(false); // 帮助页
  const [tour, setTour] = useState(-1); // 新手引导步骤（-1=未激活）
  const [tourRect, setTourRect] = useState<DOMRect | null>(null);
  // 引导高亮目标的 ref（侧栏得分/计分框/牌组按钮 + 手牌/出牌/弃牌按钮）。
  const rScore = useRef<HTMLDivElement | null>(null);
  const rBoxes = useRef<HTMLDivElement | null>(null);
  const rDeckBtn = useRef<HTMLButtonElement | null>(null);
  const rHand = useRef<HTMLDivElement | null>(null);
  const rPlay = useRef<HTMLButtonElement | null>(null);
  const rDiscard = useRef<HTMLButtonElement | null>(null);
  const TOUR: { ref: React.RefObject<HTMLElement | null> | null; title: string; text: string }[] = [
    { ref: rScore, title: '🎯 目标', text: '每道盲注要把「本回合得分」冲到「目标」线。达成即过关，进商店买道具变强。' },
    { ref: rBoxes, title: '🧮 怎么算分', text: '每手牌的分 = 蓝色筹码 × 红色倍率。选牌时这里实时预览本手牌型的基础值。' },
    { ref: rHand, title: '🃏 选牌', text: '点手牌选最多 5 张，组成扑克牌型（对子 / 同花 / 顺子 / 葫芦…牌型越大分越高）。' },
    { ref: rPlay, title: '▶ 出牌', text: '点「出牌」结算这手分数并累加。出牌次数有限——用完还没过线就失败。' },
    { ref: rDiscard, title: '♻ 弃牌', text: '不想要的牌可以弃掉换新的：不计分、不消耗出牌次数（弃牌次数另算）。' },
    { ref: rDeckBtn, title: '🂠 牌组 / 牌型', text: '随时打开查看：牌型分值表、抽牌堆剩余、哪些牌被附魔了。' },
    { ref: null, title: '🛒 越打越强', text: '过关进商店：买小丑（永久加成）、星球牌（升级牌型）、塔罗牌（给牌附魔）。Boss 盲注有诅咒，注意侧栏提示。祝好运！' },
  ];
  const endTour = useCallback(() => { setTour(-1); try { localStorage.setItem('ge_onboarded', '1'); } catch { /* ignore */ } }, []);
  // 首次运行自动启动引导。
  useEffect(() => {
    try { if (!localStorage.getItem('ge_onboarded')) setTour(0); } catch { /* ignore */ }
  }, []);
  // 量出当前引导步骤目标元素的位置（步骤变化 / 窗口缩放时重测）。
  useLayoutEffect(() => {
    if (tour < 0 || tour >= TOUR.length) { setTourRect(null); return; }
    const measure = () => { const el = TOUR[tour].ref?.current; setTourRect(el ? el.getBoundingClientRect() : null); };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [tour]);
  const handSizeRef = useRef(HAND_SIZE); // 本道手牌张数（镣铐诅咒减 1）
  const bossesBeatenRef = useRef(0); // 已击败 Boss 数（Rocket 等经济小丑读）
  const [hoverJoker, setHoverJoker] = useState<string | null>(null); // 悬浮中的小丑（详情框延迟关闭，便于移到框上点卖出）
  const hoverTimer = useRef<number | null>(null);
  const openJokerTip = useCallback((id: string) => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); setHoverJoker(id); }, []);
  const closeJokerTip = useCallback(() => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setHoverJoker(null), 260); }, []);
  const CONSUMABLE_SLOTS = 2;
  const enchantOf = (c: Card): EnchantId[] => enchanted[`${c.suit}${c.rank}`] ?? [];
  useEffect(() => { handLevelsRef.current = handLevels; }, [handLevels]);
  const ownedRef = useRef(owned); // startBlind 读 owned 算被动手数/弃牌（避免闭包陈旧）
  useEffect(() => { ownedRef.current = owned; }, [owned]);
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const keyOf = (c: Card) => `${c.suit}${c.rank}`;
  const busy = anim !== null || scoring !== null;

  // 逐帧推进计分演出（recursive setTimeout，从 ref 读避免闭包陈旧）。
  const advanceSeq = useCallback(() => {
    const s = seqRef.current;
    if (!s) return;
    if (s.i >= s.frames.length) { const after = s.after; seqRef.current = null; setScoring(null); after(); return; }
    const f = s.frames[s.i++];
    setScoring({ cards: s.cards, scoringIdx: s.scoringIdx, frame: f });
    window.setTimeout(advanceSeq, f.dur);
  }, []);

  const [log, setLog] = useState<string[]>([]); // 算分回馈 log（游戏性流水）
  const pushLog = (s: string) => setLog((l) => [s, ...l].slice(0, 14));

  // 飞入动画播完即清（避免后续重渲染重复触发）。
  useEffect(() => {
    if (newKeys.size === 0) return;
    const t = window.setTimeout(() => setNewKeys(new Set()), 450);
    return () => window.clearTimeout(t);
  }, [newKeys]);

  // 手牌排序（表现层）：按花色或点数；sel 跟着牌一起重排（不错位）。
  const SUIT_ORD: Record<Suit, number> = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 };
  const sortHand = useCallback((mode: 'suit' | 'rank') => {
    setHand((h) => {
      const paired = h.map((c, i) => ({ c, s: sel[i] ?? false }));
      paired.sort((a, b) => mode === 'suit'
        ? (SUIT_ORD[a.c.suit] - SUIT_ORD[b.c.suit]) || (RANK_ORDER[b.c.rank] - RANK_ORDER[a.c.rank])
        : (RANK_ORDER[b.c.rank] - RANK_ORDER[a.c.rank]) || (SUIT_ORD[a.c.suit] - SUIT_ORD[b.c.suit]));
      setSel(paired.map((p) => p.s));
      return paired.map((p) => p.c);
    });
  }, [sel]);

  // ── 引擎资源读写（输入/投影层）──
  const resOf = useCallback((id: string): Resource | undefined => {
    const e = engineRef.current!;
    for (const [eid] of e.world.query('Resource')) {
      const r = e.world.getComponent<Resource>(eid, 'Resource');
      if (r && r.id === id) return r;
    }
    return undefined;
  }, []);
  const get = useCallback((id: string) => resOf(id)?.current ?? 0, [resOf]);
  const set = useCallback((id: string, v: number) => {
    const r = resOf(id);
    if (r) r.current = Math.max(r.min, Math.min(r.max, v));
  }, [resOf]);
  // 按 id 置 Flag（REQ-E-023⑤ 判型修饰小丑买/卖时点灭）。
  const setFlagById = useCallback((id: string, active: boolean) => {
    const e = engineRef.current!;
    for (const [eid] of e.world.query('Flag')) { const f = e.world.getComponent<Flag>(eid, 'Flag'); if (f && f.id === id) { f.active = active; return; } }
  }, []);
  // 脉冲边沿 Flag（升→tick→降→tick）：让监听它的自增长累加 Effect 各跑一次（弃牌/过关）。
  const pulse = useCallback((flagId: string) => {
    const e = engineRef.current!;
    setFlagById(flagId, true); e.world.tick(); setFlagById(flagId, false); e.world.tick();
  }, [setFlagById]);

  // 一道盲注开局：重置回合资源 + 设盲注线 + 洗牌发 8 张。
  const startBlind = useCallback((a: number, bi: number) => {
    const e = engineRef.current!;
    const kind = BLIND_ORDER[bi];
    const bz = kind === 'boss' ? bossForAnte(a) : null;
    const pt = passiveTotals(ownedRef.current); // 被动小丑改本道资源（Juggler/Drunkard/Stuntman…）
    const hs = Math.max(1, (bz?.effect === 'small_hand' ? HAND_SIZE - 1 : HAND_SIZE) + pt.handSize);
    handSizeRef.current = hs;
    // 由 handLevels 重建 rankingTable（燧石 halve_base=0.5 减半，否则按等级还原）。
    const rtMult = bz?.effect === 'halve_base' ? 0.5 : 1;
    const pk = e.world.getComponent<{ type: string; rankingTable: Record<string, { chips: number; mult: number }> }>('table', 'PokerHand');
    if (pk) for (const h of HAND_ORDER) { const sc = handScoreAtLevel(h, handLevelsRef.current[h] ?? 1); pk.rankingTable[HAND_TYPE_TO_ENGINE[h]] = rtMult === 1 ? sc : { chips: Math.floor(sc.chips * rtMult), mult: Math.max(1, Math.floor(sc.mult * rtMult)) }; }
    const tgt = blindRequirement(a, kind) * (bz?.effect === 'target_x2' ? 2 : 1);
    setLog([`— Ante ${a} · ${BLIND_META[kind].label} 目标 ${tgt.toLocaleString()} —`, ...(bz ? [`${bz.icon} ${bz.name}：${bz.desc}`] : [])]);
    set(R_ROUND_SCORE, 0);
    set(R_HANDS_LEFT, Math.max(1, (bz?.effect === 'fewer_hands' ? 1 : HANDS_PER_BLIND) + pt.hands));
    set(R_DISCARDS_LEFT, Math.max(0, (bz?.effect === 'no_discards' ? 0 : DISCARDS_PER_BLIND) + pt.discards));
    set(R_CHIPS, 0); set(R_MULT, 0); set(R_HAND_SCORE, 0);
    set(R_BLIND, tgt);
    e.world.getComponent<PlayedHand>('table', 'PlayedHand')!.cards = [];
    seedRef.current += 1;
    deckRef.current = shuffledDeck(seedRef.current);
    deckPtrRef.current = hs;
    setHand(deckRef.current.slice(0, hs));
    setSel(new Array(hs).fill(false));
    setPlayedTypes([]);
    setResult(null);
    setPhase('playing');
    if (bz) { setBossIntro(bz); window.setTimeout(() => setBossIntro(null), 2200); } else setBossIntro(null); // Boss 入场横幅
    bump();
  }, [set]);

  // 首次构建引擎（开局 0 小丑）。
  if (engineRef.current === null) {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameEBlueprint(buildJokerEntities([])));
    e.world.addComponent('table', { type: 'ScoreTrace', events: [] } as ScoreTrace); // REQ-019：开启逐步 trace（opt-in）
    engineRef.current = e;
    deckRef.current = shuffledDeck(seedRef.current);
    deckPtrRef.current = HAND_SIZE;
    // 初始第一道盲注线（resource 默认 300=ante1 small，对齐）。
  }
  const engine = engineRef.current;

  const drawTo = useCallback((kept: Card[]): Card[] => {
    const deck = deckRef.current;
    const need = handSizeRef.current - kept.length;
    const drawn = deck.slice(deckPtrRef.current, deckPtrRef.current + need);
    deckPtrRef.current += drawn.length;
    return [...kept, ...drawn];
  }, []);

  const blindKind = BLIND_ORDER[blindIdx];
  const boss: BossBlind | null = blindKind === 'boss' ? bossForAnte(ante) : null;
  const target = get(R_BLIND);
  const roundScore = get(R_ROUND_SCORE);
  const handsLeft = get(R_HANDS_LEFT);
  const discardsLeft = get(R_DISCARDS_LEFT);
  const money = get(R_MONEY);
  useEffect(() => {
    const d = money - prevMoneyRef.current; prevMoneyRef.current = money;
    if (d !== 0) { setMoneyFx({ d, k: Date.now() }); const t = window.setTimeout(() => setMoneyFx(null), 1100); return () => window.clearTimeout(t); }
  }, [money]);
  const selCount = sel.filter(Boolean).length;

  // 用道具：星球牌→牌型 +1 级（写回引擎 rankingTable）；塔罗牌→给「选中的 1 张手牌」盖附魔。
  const useConsumable = useCallback((idx: number) => {
    const item = consumables[idx];
    if (!item) return;
    if (item.kind === 'planet') {
      const lvl = (handLevels[item.hand] ?? 1) + 1;
      const pk = engineRef.current!.world.getComponent<{ type: string; rankingTable: Record<string, { chips: number; mult: number }> }>('table', 'PokerHand');
      if (pk) pk.rankingTable[HAND_TYPE_TO_ENGINE[item.hand]] = handScoreAtLevel(item.hand, lvl);
      setHandLevels((prev) => ({ ...prev, [item.hand]: lvl }));
      setConsumables((c) => c.filter((_, i) => i !== idx));
      pushLog(`${item.icon} ${item.name}：${HAND_RANKINGS[item.hand].name} 升至 Lv${lvl}`);
      bump();
      return;
    }
    // 塔罗：需恰好选中 1 张手牌。
    const selIdx = sel.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    if (selIdx.length !== 1) { pushLog(`${item.icon} ${item.name}：请先选中 1 张手牌再使用`); bump(); return; }
    const card = hand[selIdx[0]];
    const k = `${card.suit}${card.rank}`;
    const next = { ...enchantedRef.current, [k]: [...(enchantedRef.current[k] ?? []), item.enchant] };
    enchantedRef.current = next;
    setEnchanted(next);
    setConsumables((c) => c.filter((_, i) => i !== idx));
    setSel(new Array(hand.length).fill(false));
    pushLog(`${item.icon} ${item.name}：${card.rank}${SUIT_SYM[card.suit]} 附「${ENCHANTS[item.enchant].name}」(${ENCHANTS[item.enchant].desc})`);
    bump();
  }, [consumables, handLevels, sel, hand]);

  // 买道具：扣 $、入消耗位（满则不可买）。
  const buyConsumable = useCallback((item: Consumable) => {
    if (consumables.length >= CONSUMABLE_SLOTS || money < item.cost) return;
    set(R_MONEY, money - item.cost);
    setConsumables((c) => [...c, item]);
    setShopConsumables((s) => s.filter((x) => x.id !== item.id));
    bump();
  }, [consumables, money, set]);

  const toggle = useCallback((i: number) => {
    setSel((prev) => {
      const cnt = prev.filter(Boolean).length;
      if (!prev[i] && cnt >= 5) return prev;
      return prev.map((s, j) => (j === i ? !s : s));
    });
  }, []);

  // 出牌：引擎算真值 → 建「逐张报分 + 小丑抖动」演出帧 → 播完收尾（抽牌/商店/失败）。
  const startScoring = useCallback(() => {
    if (phase !== 'playing' || busy || handsLeft <= 0) return;
    const chosen = hand.filter((_, i) => sel[i]);
    if (chosen.length === 0) return;
    // Boss 出牌约束（与下方 UI 的 playBlock 同源）：灵媒须满 5 张；巨眼禁重复牌型；大嘴只允一种牌型。
    if (boss?.effect === 'must_five' && chosen.length !== 5) return;
    if (boss?.effect === 'no_repeat' || boss?.effect === 'one_hand_type') {
      const t = ENGINE_TO_HR[evaluateHand(chosen.map(toEngineCard)).type];
      if (boss.effect === 'no_repeat' && t && playedTypes.includes(t)) return;
      if (boss.effect === 'one_hand_type' && t && playedTypes.length > 0 && t !== playedTypes[0]) return;
    }

    // 引擎一拍算出本手真值（chips/mult/score + 牌型 + 累加 round_score/hands-1）。附魔按牌身份映射成 Card.mods。
    engine.world.getComponent<PlayedHand>('table', 'PlayedHand')!.cards = chosen.map((c) => toEngineCard({ ...c, enchants: enchantedRef.current[`${c.suit}${c.rank}`] }));
    const heldComp = engine.world.getComponent<{ type: string; cards: ReturnType<typeof toEngineCard>[] }>('table', 'HeldHand');
    if (heldComp) heldComp.cards = hand.filter((_, i) => !sel[i]).map((c) => toEngineCard({ ...c, enchants: enchantedRef.current[`${c.suit}${c.rank}`] })); // 留手牌（Baron/Shoot the Moon）
    engine.world.getComponent<Flag>('scoring', 'Flag')!.active = true;
    engine.world.tick();
    const finalChips = get(R_CHIPS), finalMult = get(R_MULT), finalScore = get(R_HAND_SCORE);
    let type: HandType = 'high_card';
    for (const [eid] of engine.world.query('StringVar')) {
      const v = engine.world.getComponent<StringVar>(eid, 'StringVar');
      if (v && v.id === V_HAND_TYPE) type = v.value.replace(/-/g, '_') as HandType;
    }
    // REQ-019：读引擎逐步 trace（必须在第二拍 poker-eval 清空它之前捕获）。UI 只回放、不重算。
    const traceComp = engine.world.getComponent<ScoreTrace>('table', 'ScoreTrace');
    const events: ScoreEvent[] = traceComp ? traceComp.events.map((e) => ({ ...e })) : [];

    engine.world.getComponent<PlayedHand>('table', 'PlayedHand')!.cards = [];
    if (heldComp) heldComp.cards = [];
    engine.world.getComponent<Flag>('scoring', 'Flag')!.active = false;
    engine.world.tick();

    // 由 trace 事件建演出帧（去代码化 #10：顺序/增量全来自引擎，UI 不手算）：
    //   target=chips/mult → 计数器跳到 after；source='card:i' → 高亮该牌；source='j_<id>' → 抖该小丑。
    const frames: SeqFrame[] = [];
    let chips = events.find((e) => e.phase === 'base' && e.target === R_CHIPS)?.after ?? 0;
    let mult = events.find((e) => e.phase === 'base' && e.target === R_MULT)?.after ?? 0;
    for (const e of events) {
      if (e.phase === 'base' && e.target === R_MULT) { mult = e.after; continue; } // 与 base chips 合一帧
      if (e.target !== R_CHIPS && e.target !== R_MULT && e.target !== R_HAND_SCORE) continue; // 跳过回合记账(round_score/hands_left)
      if (e.target === R_CHIPS) chips = e.after;
      else if (e.target === R_MULT) mult = e.after;
      const isScore = e.target === R_HAND_SCORE;
      const hi = e.source && e.source.startsWith('card:') ? Number(e.source.slice(5)) : null;
      const wiggle = e.source && e.source.startsWith('j_') ? e.source.slice(2) : null;
      frames.push({ chips, mult, score: isScore ? e.after : null, hi, wiggle, dur: hi != null ? 200 : 240 });
    }
    frames.push({ chips: finalChips, mult: finalMult, score: finalScore, hi: null, wiggle: null, dur: 650 });

    // 收尾闭包（捕获本手 kept/next；演出结束执行）。
    const kept = hand.filter((_, i) => !sel[i]);
    const next = drawTo(kept);
    const after = () => {
      setResult({ type, chips: finalChips, mult: finalMult, score: finalScore });
      setSlam(true); window.setTimeout(() => setSlam(false), 440); // 结算砸屏
      setPlayedTypes((p) => (p.includes(type) ? p : [...p, type]));
      if (boss?.effect === 'pay_per_play') { set(R_MONEY, get(R_MONEY) - chosen.length); pushLog(`🦷 尖牙：出 ${chosen.length} 张 -💰$${chosen.length}`); } // 尖牙：按张数扣 $
      // 自增长「出牌事件」：已由 SIG_COMMIT/条件门的累加 Effect 在上方计分 tick 内自动执行（引擎做）。
      pushLog(`▶ ${HAND_RANKINGS[type]?.name ?? type}　${finalChips.toLocaleString()} × ${finalMult} = ${finalScore.toLocaleString()}`);
      const rs = get(R_ROUND_SCORE);
      pushLog(`　累计 ${rs.toLocaleString()} / ${get(R_BLIND).toLocaleString()}${rs >= get(R_BLIND) ? '　✅ 过关！' : ''}`);
      if (rs >= get(R_BLIND)) {
        const reward = BLIND_META[blindKind].reward + get(R_HANDS_LEFT) + Math.min(5, Math.floor(get(R_MONEY) / 5));
        set(R_MONEY, get(R_MONEY) + reward);
        if (blindKind === 'boss') bossesBeatenRef.current += 1;
        const unusedDiscards = get(R_DISCARDS_LEFT) === DISCARDS_PER_BLIND ? get(R_DISCARDS_LEFT) : 0;
        const econ = roundEndPayout(owned, { money: get(R_MONEY), bossesBeaten: bossesBeatenRef.current, unusedDiscards });
        if (econ > 0) { set(R_MONEY, get(R_MONEY) + econ); pushLog(`💰 小丑结算 +$${econ}`); }
        pulse(F_DID_ROUND); // 过关事件（Popcorn 等自增长）→ 引擎累加 Effect
        setShopOffer(rollJokerOffer(new Set(owned.map((o) => o.id)), 3, Math.random));
        setShopConsumables(rollConsumables());
        setMascot(true); window.setTimeout(() => setMascot(false), 3800); // 过关庆祝：萌宠举牌
        setPhase('shop'); bump(); return;
      }
      if (get(R_HANDS_LEFT) <= 0) { setPhase('lost'); bump(); return; }
      // 铁钩诅咒：出牌后随机弃 2 张再补。
      let finalNext = next;
      if (boss?.effect === 'hook_discard' && finalNext.length > 0) {
        const drop = new Set<number>();
        while (drop.size < Math.min(2, finalNext.length)) drop.add(Math.floor(Math.random() * finalNext.length));
        finalNext = drawTo(finalNext.filter((_, i) => !drop.has(i)));
        pushLog(`🪝 铁钩：随机弃 ${drop.size} 张`);
      }
      setHand(finalNext); setSel(new Array(finalNext.length).fill(false));
      setNewKeys(new Set(finalNext.slice(kept.length).map(keyOf)));
      bump();
    };
    // 计分牌下标由 trace 派生（percard 事件的 'card:i'）——仍数据驱动，UI 不重算。
    const scoringIdx = [...new Set(events.filter((e) => e.source?.startsWith('card:')).map((e) => Number(e.source!.slice(5))))];
    seqRef.current = { frames, i: 0, after, cards: chosen, scoringIdx };
    advanceSeq();
  }, [phase, busy, handsLeft, hand, sel, engine, get, set, drawTo, owned, blindKind, advanceSeq, boss, playedTypes, pulse]);

  const commitDiscard = useCallback(() => {
    set(R_DISCARDS_LEFT, get(R_DISCARDS_LEFT) - 1);
    const kept = hand.filter((_, i) => !sel[i]);
    const discarded = hand.filter((_, i) => sel[i]);
    pushLog(`♻ 弃 ${hand.length - kept.length} 张，补牌`);
    // 自增长（弃牌事件，Green -1）+ Faceless（弃 ≥3 人头 +$5）。
    pulse(F_DID_DISCARD); // 弃牌事件（Green -1 等自增长）→ 引擎累加 Effect
    const faces = discarded.filter((c) => c.rank === 'J' || c.rank === 'Q' || c.rank === 'K').length;
    const dpay = discardPayout(owned, faces);
    if (dpay > 0) { set(R_MONEY, get(R_MONEY) + dpay); pushLog(`💰 弃牌小丑 +$${dpay}`); }
    const next = drawTo(kept);
    setHand(next);
    setSel(new Array(next.length).fill(false));
    setNewKeys(new Set(next.slice(kept.length).map(keyOf)));
    setAnim(null);
    bump();
  }, [hand, sel, get, set, drawTo, owned, pulse]);

  // 弃牌：先播「飞向垃圾桶」动画（380ms）→ 再提交（扣额度+补牌飞入）。
  const beginDiscard = useCallback(() => {
    if (phase !== 'playing' || busy || discardsLeft <= 0) return;
    const idx = sel.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) return;
    setAnim({ idx, mode: 'discard' });
    window.setTimeout(() => commitDiscard(), 380);
  }, [phase, busy, discardsLeft, sel, commitDiscard]);

  // 买小丑：扣 $、加入 owned、把它的实体注入运行中的引擎。
  const buyJoker = useCallback((j: JokerCard) => {
    if (owned.length >= JOKER_SLOTS || money < j.cost) return;
    set(R_MONEY, money - j.cost);
    const ents = jokerToEntities(j, owned.length);
    for (const [eid, comps] of Object.entries(ents)) {
      engine.world.createEntity(eid);
      for (const [type, data] of Object.entries(comps as Record<string, object>)) {
        engine.world.addComponent(eid, { type, ...(data as object) } as never);
      }
    }
    if (j.handMod) for (const fid of HANDMOD_FLAGS[j.handMod]) setFlagById(fid, true); // REQ-E-023⑤：点亮判型修饰
    setOwned((o) => [...o, j]);
    setShopOffer((s) => s.filter((x) => x.id !== j.id));
    bump();
  }, [owned, money, engine, set, setFlagById]);

  // 卖出小丑：销毁它的引擎实体（停止计分）+ 返还 ⌊cost/2⌋（最低 $1）。
  const sellValue = (j: JokerCard) => Math.max(1, Math.floor(j.cost / 2));
  const sellJoker = useCallback((j: JokerCard) => {
    if (busy) return;
    engine.world.destroyEntity(`j_${j.id}`);
    engine.world.destroyEntity(`gate_${j.id}`); // 条件类小丑的信号门（无则 no-op）
    if (j.handMod) for (const fid of HANDMOD_FLAGS[j.handMod]) setFlagById(fid, false); // REQ-E-023⑤：熄灭判型修饰
    const val = sellValue(j);
    set(R_MONEY, get(R_MONEY) + val);
    setOwned((o) => o.filter((x) => x.id !== j.id));
    pushLog(`🗑️ 卖出 ${j.name} +💰$${val}`);
    bump();
  }, [busy, engine, set, get, setFlagById]);

  const rollShop = useCallback((): JokerCard[] => rollJokerOffer(new Set(owned.map((o) => o.id)), 3, Math.random), [owned]);
  // 道具货架：1 星球牌（升级牌型）+ 1 塔罗牌（盖附魔）。
  const rollConsumables = useCallback((): Consumable[] => {
    const planet = COMMON_PLANETS[Math.floor(Math.random() * COMMON_PLANETS.length)];
    const tarot = TAROTS[Math.floor(Math.random() * TAROTS.length)];
    return [planet, tarot];
  }, []);
  const reroll = useCallback(() => {
    if (money < REROLL_COST) return;
    set(R_MONEY, money - REROLL_COST);
    setShopOffer(rollShop());
    setShopConsumables(rollConsumables());
    bump();
  }, [money, set, rollShop, rollConsumables]);

  const nextBlind = useCallback(() => {
    let a = ante, bi = blindIdx + 1;
    if (bi > 2) { bi = 0; a += 1; setAnte(a); }
    setBlindIdx(bi);
    startBlind(a, bi);
  }, [ante, blindIdx, startBlind]);

  const restart = useCallback(() => {
    const e = new Engine({ tickRate: 60 });
    e.load(buildGameEBlueprint(buildJokerEntities([])));
    e.world.addComponent('table', { type: 'ScoreTrace', events: [] } as ScoreTrace); // REQ-019：开启逐步 trace（opt-in）
    engineRef.current = e;
    setOwned([]); setAnte(1); setBlindIdx(0);
    setConsumables([]); setShopConsumables([]);
    setEnchanted({}); enchantedRef.current = {}; bossesBeatenRef.current = 0;
    setHandLevels(Object.fromEntries(HAND_ORDER.map((h) => [h, 1])) as Record<HandType, number>);
    startBlind(1, 0);
  }, [startBlind]);

  const lost = phase === 'lost';
  const inShop = phase === 'shop';
  const progress = target > 0 ? Math.min(100, (roundScore / target) * 100) : 0;

  // 选牌时的牌型预览（基础 chips/mult，含星球牌升级，未含小丑）；结算时显示实时跳动值。
  const selCards = hand.filter((_, i) => sel[i]);
  // 判型修饰（REQ-E-023⑤）：拥有对应被动小丑时，预览也按同规则判型（与引擎一致）。
  const handMods = {
    fourFlush: owned.some((j) => j.handMod === 'four_fingers'), fourStraight: owned.some((j) => j.handMod === 'four_fingers'),
    gappedStraight: owned.some((j) => j.handMod === 'shortcut'), suitMerge: owned.some((j) => j.handMod === 'smeared'),
  };
  const previewType: HandType | null = (!inShop && !lost && !scoring && selCards.length > 0)
    ? (ENGINE_TO_HR[evaluateHand(selCards.map(toEngineCard), handMods).type] ?? null) : null;
  const preview = previewType
    ? (() => { const hr = HAND_RANKINGS[previewType]; const lv = handScoreAtLevel(previewType, handLevels[previewType] ?? 1); return { name: hr.name, chips: lv.chips, mult: lv.mult }; })()
    : null;
  const boxChips = scoring ? scoring.frame.chips : preview ? preview.chips : 0;
  const boxMult = scoring ? scoring.frame.mult : preview ? preview.mult : 0;
  const boxLabel = scoring ? '结算中…' : preview ? preview.name : '选牌预览';

  // Boss 出牌约束（仅 boss 道）：灵媒须出满 5 张；巨眼禁重复牌型。返回禁手原因（null=可出）。
  const playBlock: string | null = !boss ? null
    : boss.effect === 'must_five' && selCount > 0 && selCount !== 5 ? '灵媒：必须出满 5 张'
    : boss.effect === 'no_repeat' && previewType && playedTypes.includes(previewType) ? `巨眼：${HAND_RANKINGS[previewType].name} 已打过`
    : boss.effect === 'one_hand_type' && previewType && playedTypes.length > 0 && previewType !== playedTypes[0] ? `大嘴：本回合只能打${HAND_RANKINGS[playedTypes[0]].name}`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 22, color: '#e2e8f0', font: '13px system-ui', width: '100%', maxWidth: 1120 }}>
      {/* 常驻动效关键帧（小丑抖动等，跨阶段可用）*/}
      <style>{`
        @keyframes ge-wiggle { 0% { transform: rotate(0) } 25% { transform: rotate(-10deg) scale(1.15) } 75% { transform: rotate(10deg) scale(1.15) } 100% { transform: rotate(0) } }
        .ge-btn { transition: filter .15s, transform .1s; }
        .ge-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .ge-btn:active:not(:disabled) { transform: translateY(1px); }
        .ge-joker { transition: transform .15s; }
        .ge-joker:hover { transform: translateY(-6px); z-index: 30; }
        .ge-joker .ge-joker-tip { opacity: 0; pointer-events: none; transition: opacity .15s; }
        .ge-joker:hover .ge-joker-tip { opacity: 1; pointer-events: auto; }
        .ge-card { position: relative; }
        .ge-card .ge-ench-tip { opacity: 0; pointer-events: none; transition: opacity .15s; }
        .ge-card:hover .ge-ench-tip { opacity: 1; }
        @keyframes ge-mascotIn { 0% { transform: translateY(150px); opacity: 0 } 55% { transform: translateY(-22px); opacity: 1 } 75% { transform: translateY(6px) } 100% { transform: translateY(0); opacity: 1 } }
        @keyframes ge-mascotOut { from { opacity: 1 } to { transform: translateY(150px); opacity: 0 } }
        @keyframes ge-bob { 0%,100% { transform: translateY(0) rotate(-3deg) } 50% { transform: translateY(-7px) rotate(3deg) } }
        @keyframes ge-signWave { 0%,100% { transform: rotate(-7deg) } 50% { transform: rotate(7deg) } }
        @keyframes ge-jfloat { 0% { transform: translate(-50%,4px) scale(.7); opacity: 0 } 25% { transform: translate(-50%,-10px) scale(1.1); opacity: 1 } 100% { transform: translate(-50%,-34px) scale(1); opacity: 0 } }
        @keyframes ge-amb1 { 0%,100% { transform: translate(0,0) scale(1); opacity:.5 } 50% { transform: translate(40px,-30px) scale(1.25); opacity:.85 } }
        @keyframes ge-amb2 { 0%,100% { transform: translate(0,0) scale(1.1); opacity:.4 } 50% { transform: translate(-50px,28px) scale(.85); opacity:.7 } }
        @keyframes ge-spark { 0% { transform: translateY(0); opacity:0 } 20% { opacity:.7 } 100% { transform: translateY(-120px); opacity:0 } }
        @keyframes ge-shake { 0%,100% { transform: translate(0,0) } 20% { transform: translate(-5px,3px) } 40% { transform: translate(5px,-3px) } 60% { transform: translate(-4px,-2px) } 80% { transform: translate(4px,2px) } }
        @keyframes ge-slam { 0% { transform: scale(2.2); opacity:0 } 55% { transform: scale(.86) } 75% { transform: scale(1.08) } 100% { transform: scale(1); opacity:1 } }
        @keyframes ge-coinfly { 0% { transform: translateY(0) scale(.6); opacity:0 } 25% { opacity:1 } 100% { transform: translateY(-42px) scale(1.1); opacity:0 } }
        @keyframes ge-selpulse { 0%,100% { box-shadow: 0 6px 16px #ffd16640 } 50% { box-shadow: 0 8px 26px #ffd166cc } }
        @keyframes ge-moneyfly { 0% { transform: translate(-50%,0); opacity:0 } 20% { opacity:1 } 100% { transform: translate(-50%,-30px); opacity:0 } }
        @keyframes ge-bannerSweep { 0% { transform: translateX(-130%) skewX(-12deg); opacity:0 } 18% { transform: translateX(0) skewX(-12deg); opacity:1 } 78% { transform: translateX(0) skewX(-12deg); opacity:1 } 100% { transform: translateX(130%) skewX(-12deg); opacity:0 } }
        @keyframes ge-redflash { 0% { opacity:0 } 30% { opacity:.45 } 100% { opacity:0 } }
        @keyframes ge-handname { 0% { transform: translateY(8px) scale(.85); opacity:0 } 45% { transform: translateY(0) scale(1.06); opacity:1 } 100% { transform: translateY(0) scale(1); opacity:1 } }
      `}</style>

      {/* 动态背景氛围（垫底，纯表现）：两团缓慢漂移柔光 + 上浮微粒 */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '12%', left: '14%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,#1f6f7a55,transparent 70%)', filter: 'blur(8px)', animation: 'ge-amb1 13s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '8%', right: '12%', width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle,#7a2f5a44,transparent 70%)', filter: 'blur(8px)', animation: 'ge-amb2 17s ease-in-out infinite' }} />
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} style={{ position: 'absolute', bottom: -10, left: `${8 + i * 10.5}%`, width: 3, height: 3, borderRadius: '50%', background: i % 2 ? '#ffd16688' : '#7fd1de88', animation: `ge-spark ${7 + (i % 4) * 2}s linear ${i * 1.3}s infinite` }} />
        ))}
      </div>

      {/* 算分回馈 log（右侧固定窗，游戏性流水）*/}
      <div style={{ position: 'fixed', right: 12, top: 70, width: 210, maxHeight: '70vh', overflowY: 'auto', background: 'rgba(11,28,34,0.92)', border: '1px solid #2b5562', borderRadius: 10, padding: '10px 12px', fontSize: 11, lineHeight: 1.7, zIndex: 20 }}>
        <div style={{ fontWeight: 700, color: '#ffd166', marginBottom: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><GuiIcon src={GUI_SCROLL} emoji="📜" size={18} /> 结算日志</div>
        {log.length === 0 && <div style={{ color: '#475569' }}>（出牌后这里显示算分流水）</div>}
        {log.map((line, i) => (
          <div key={i} style={{ color: i === 0 ? '#e2e8f0' : '#7d93a8', borderBottom: line.startsWith('—') ? '1px dashed #2b5562' : 'none', paddingBottom: line.startsWith('—') ? 4 : 0, marginBottom: line.startsWith('—') ? 4 : 0 }}>{line}</div>
        ))}
      </div>

      {/* ── 过关庆祝：萌宠举牌（爱萌 出品位）—— 左下角弹出 ── */}
      {mascot && (
        <div style={{ position: 'fixed', left: 18, bottom: 14, zIndex: 60, pointerEvents: 'none', animation: 'ge-mascotIn .6s cubic-bezier(.2,1.4,.5,1) both', filter: 'drop-shadow(0 10px 22px #000a)' }}>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* 金币迸射（真素材 gold_pile，缺图回退 🪙）*/}
            {Array.from({ length: 6 }).map((_, i) => (
              <img key={i} src={COIN_URL()} alt="" style={{ position: 'absolute', bottom: 18, left: `${6 + i * 16}px`, width: 26, height: 26, imageRendering: 'pixelated', animation: `ge-coinfly ${0.9 + (i % 3) * 0.25}s ease-out ${0.15 + i * 0.12}s infinite`, zIndex: 2 }} onError={(e) => { const s = e.currentTarget; s.outerHTML = '<span style="position:absolute;bottom:18px;left:' + (6 + i * 16) + 'px;font-size:22px;animation:ge-coinfly ' + (0.9 + (i % 3) * 0.25) + 's ease-out ' + (0.15 + i * 0.12) + 's infinite">🪙</span>'; }} />
            ))}
            {/* 牌子 */}
            <div style={{ transformOrigin: 'bottom center', animation: 'ge-signWave 1.1s ease-in-out infinite', marginBottom: -6, zIndex: 3 }}>
              <div style={{ background: 'linear-gradient(160deg,#fff7e6,#ffe0a3)', border: '3px solid #b9772e', borderRadius: 10, padding: '6px 18px', boxShadow: '0 4px 10px #0006', fontWeight: 900, fontSize: 24, color: '#e23b4e', letterSpacing: 3, fontFamily: '"PingFang SC","Microsoft YaHei",system-ui' }}>爱萌</div>
              <div style={{ width: 4, height: 15, background: '#8a5a22', margin: '0 auto' }} />
            </div>
            {/* 萌宠 */}
            <div style={{ fontSize: 70, animation: 'ge-bob .8s ease-in-out infinite', zIndex: 3 }}>🐱</div>
            <div style={{ fontSize: 12, color: '#ffd166', fontWeight: 800, marginTop: 2, textShadow: '0 1px 4px #000', letterSpacing: 1, zIndex: 3 }}>✨ 过关！✨</div>
          </div>
        </div>
      )}

      {/* ── Boss 盲注入场：红光闪 + 诅咒横幅扫入 ── */}
      {bossIntro && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 65, pointerEvents: 'none', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle,#b2334533,#7a112255)', animation: 'ge-redflash 2.2s ease-out forwards' }} />
          <div style={{ animation: 'ge-bannerSweep 2.2s ease-in-out forwards', background: 'linear-gradient(160deg,#3a1118,#1a0a0e)', border: '2px solid #e0455a', borderRadius: 12, padding: '14px 40px', boxShadow: '0 0 40px #e0455a88', textAlign: 'center' }}>
            <div style={{ fontSize: 30 }}>{bossIntro.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#ff6b81', letterSpacing: 2 }}>{bossIntro.name}</div>
            <div style={{ fontSize: 13, color: '#fca5a5', marginTop: 2 }}>诅咒：{bossIntro.desc}</div>
          </div>
        </div>
      )}

      {/* ── 帮助 / 玩法说明（模态）── */}
      {helpOpen && (
        <div onClick={() => setHelpOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,8,12,0.8)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'linear-gradient(160deg,#102a33,#0a1622)', border: '1px solid #2b5562', borderRadius: 16, padding: 22, maxWidth: 640, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 16px 48px #000a', lineHeight: 1.7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#ffd166' }}>❔ 玩法说明 · 帮助</span>
              <button onClick={() => setHelpOpen(false)} style={{ background: 'none', border: '1px solid #2b5562', color: '#9fb3bd', borderRadius: 8, padding: '4px 12px', cursor: 'pointer' }}>关闭 ✕</button>
            </div>
            <div style={{ fontSize: 13, color: '#cfe8ee' }}>
              <p style={{ margin: '0 0 10px' }}><b style={{ color: '#7fd1de' }}>这是什么</b><br />一款 Balatro 式扑克 roguelike：用一副扑克打出牌型得分，靠小丑/星球/附魔不断变强，闯过一关比一关高的盲注分数线。</p>
              <p style={{ margin: '0 0 6px' }}><b style={{ color: '#7fd1de' }}>核心流程</b></p>
              <ol style={{ margin: '0 0 10px', paddingLeft: 20 }}>
                <li>每个 Ante 有 3 道盲注：小盲注 → 大盲注 → Boss 盲注（分数线递增，Boss 还带诅咒）。</li>
                <li>每道盲注发 8 张手牌，给你 <b>4 次出牌、3 次弃牌</b>。</li>
                <li>选 ≤5 张「出牌」→ 得分 = <span style={{ color: '#4cc9f0' }}>筹码</span> × <span style={{ color: '#f72585' }}>倍率</span>，累加到本回合得分。</li>
                <li>不想要的牌「弃牌」换新（不计分、不耗出牌次数）。</li>
                <li>本回合得分 ≥ 目标线 → 过关，结算 💰 进商店；出牌次数用完还没过线 → 失败。</li>
              </ol>
              <p style={{ margin: '0 0 6px' }}><b style={{ color: '#7fd1de' }}>牌型分值（基础 筹码 × 倍率，可被星球牌升级）</b></p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 16px', fontSize: 12, marginBottom: 10 }}>
                {HAND_ORDER.filter((h) => !HAND_RANKINGS[h].secret).map((h) => (
                  <div key={h} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #16323a', padding: '1px 0' }}>
                    <span>{HAND_RANKINGS[h].name}</span><span><span style={{ color: '#4cc9f0' }}>{HAND_RANKINGS[h].baseChips}</span> × <span style={{ color: '#f72585' }}>{HAND_RANKINGS[h].baseMult}</span></span>
                  </div>
                ))}
              </div>
              <p style={{ margin: '0 0 6px' }}><b style={{ color: '#7fd1de' }}>变强的东西（商店购买）</b></p>
              <ul style={{ margin: '0 0 10px', paddingLeft: 20 }}>
                <li><b>🃏 小丑</b>：永久加成（每张♦+倍率、含对子+倍率、×倍率…）。最多 5 个，可在悬浮卡里<b>卖出</b>换 💰。</li>
                <li><b>🪐 星球牌</b>：升级某个牌型的基础筹码/倍率（永久）。</li>
                <li><b>🔮 塔罗牌</b>：选中 1 张手牌给它<b>附魔</b>（闪箔+筹码、全息/多彩+倍率、红蜡封重触发…可叠加）。</li>
                <li><b>👹 Boss 诅咒</b>：Boss 盲注会限制你（线翻倍 / 只能 1 次出牌 / 必出 5 张 / 牌型基础分减半…），侧栏会写明。</li>
              </ul>
              <button onClick={() => { setHelpOpen(false); setTour(0); }} style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#ffd166,#f59e0b)', color: '#1a1020', fontWeight: 800, fontSize: 14 }}>▶ 重新开始新手引导</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 新手引导：高亮目标 + 说明卡（首次运行自动；可在帮助里重启）── */}
      {tour >= 0 && tour < TOUR.length && (() => {
        const step = TOUR[tour];
        const last = tour === TOUR.length - 1;
        const card = (
          <div style={{ width: 270, background: 'linear-gradient(160deg,#16323a,#0a1622)', border: '1px solid #ffd166', borderRadius: 12, padding: '14px 16px', boxShadow: '0 12px 32px #000c', pointerEvents: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#ffd166', marginBottom: 6 }}>{step.title}</div>
            <div style={{ fontSize: 12.5, color: '#cfe8ee', lineHeight: 1.65 }}>{step.text}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>{tour + 1} / {TOUR.length}</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button onClick={endTour} style={{ background: 'none', border: '1px solid #2b5562', color: '#9fb3bd', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>跳过</button>
                <button onClick={() => (last ? endTour() : setTour(tour + 1))} style={{ border: 'none', borderRadius: 7, padding: '4px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 800, background: 'linear-gradient(135deg,#ffd166,#f59e0b)', color: '#1a1020' }}>{last ? '开始游戏 ✓' : '下一步 ▶'}</button>
              </span>
            </div>
          </div>
        );
        if (!tourRect) {
          // 无目标（如最后一步/元素未就绪）：居中暗幕 + 卡片。
          return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(4,8,12,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{card}</div>
          );
        }
        const below = tourRect.bottom + 200 < window.innerHeight;
        const cardTop = below ? tourRect.bottom + 14 : Math.max(12, tourRect.top - 190);
        const cardLeft = Math.min(Math.max(12, tourRect.left + tourRect.width / 2 - 135), window.innerWidth - 282);
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 80, pointerEvents: 'none' }}>
            {/* 高亮框（box-shadow 把四周压暗，目标透出）*/}
            <div style={{ position: 'fixed', left: tourRect.left - 6, top: tourRect.top - 6, width: tourRect.width + 12, height: tourRect.height + 12, borderRadius: 12, boxShadow: '0 0 0 9999px rgba(4,8,12,0.76)', border: '2px solid #ffd166', transition: 'all .25s ease' }} />
            <div style={{ position: 'fixed', left: cardLeft, top: cardTop }}>{card}</div>
          </div>
        );
      })()}

      {/* ── 牌组 / 牌型 面板（模态）── */}
      {deckOpen && (() => {
        const remaining = new Set(deckRef.current.slice(deckPtrRef.current).map(keyOf));
        const SUIT_SYM: Record<Suit, { s: string; c: string }> = { spades: { s: '♠', c: '#e2e8f0' }, hearts: { s: '♥', c: '#f87171' }, diamonds: { s: '♦', c: '#fb923c' }, clubs: { s: '♣', c: '#94d3ff' } };
        return (
          <div onClick={() => setDeckOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,8,12,0.78)', zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: 'linear-gradient(160deg,#102a33,#0a1622)', border: '1px solid #2b5562', borderRadius: 16, padding: 22, maxWidth: 760, width: '100%', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 16px 48px #000a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: '#ffd166' }}>🂠 牌组 / 牌型</span>
                <button onClick={() => setDeckOpen(false)} style={{ background: 'none', border: '1px solid #2b5562', color: '#9fb3bd', borderRadius: 8, padding: '4px 12px', cursor: 'pointer' }}>关闭 ✕</button>
              </div>

              {/* 牌型等级表（含星球牌升级后的实时基础分）*/}
              <div style={{ fontSize: 12, color: '#7fd1de', fontWeight: 700, marginBottom: 6 }}>牌型等级 · 对应星球牌（蓝筹码 × 红倍率）</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px', marginBottom: 18 }}>
                {HAND_ORDER.map((h) => {
                  const lv = handLevels[h] ?? 1; const sc = handScoreAtLevel(h, lv); const pl = planetForHand(h);
                  const secret = HAND_RANKINGS[h].secret;
                  return (
                    <div key={h} title={secret ? '隐藏牌型（需特殊牌型才能打出）' : `${pl.name}：升级${HAND_RANKINGS[h].name}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0', borderBottom: '1px solid #16323a', opacity: secret && lv === 1 ? 0.5 : 1 }}>
                      <span style={{ color: '#cfe8ee' }}><span title={pl.name}>{pl.icon}</span> {HAND_RANKINGS[h].name} <span style={{ color: lv > 1 ? '#ffd166' : '#475569' }}>Lv{lv}</span></span>
                      <span><span style={{ color: '#4cc9f0' }}>{sc.chips}</span> <span style={{ color: '#64748b' }}>×</span> <span style={{ color: '#f72585' }}>{sc.mult}</span></span>
                    </div>
                  );
                })}
              </div>

              {/* 牌组构成（本道抽牌堆：亮=仍在牌堆，暗=已抽出）*/}
              <div style={{ fontSize: 12, color: '#7fd1de', fontWeight: 700, marginBottom: 6 }}>牌组构成 · 剩余 {remaining.size}/52（亮=仍在牌堆）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {SUITS.map((su) => (
                  <div key={su} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 18, color: SUIT_SYM[su].c, fontSize: 15 }}>{SUIT_SYM[su].s}</span>
                    {RANKS.map((rk) => {
                      const here = remaining.has(`${su}${rk}`);
                      const ecs = enchanted[`${su}${rk}`] ?? [];
                      const first = ecs.length ? ENCHANTS[ecs[0]] : null;
                      return (
                        <span key={rk} title={ecs.map((id) => `${ENCHANTS[id].name}：${ENCHANTS[id].desc}`).join(' · ') || undefined} style={{ position: 'relative', width: 24, height: 26, lineHeight: '26px', textAlign: 'center', fontSize: 11, borderRadius: 4, background: first ? `${first.color}33` : here ? '#16323a' : 'transparent', border: `1px solid ${first ? first.color : here ? SUIT_SYM[su].c : '#1a2730'}`, color: here ? '#fff' : '#33424d', opacity: here || first ? 1 : 0.5 }}>
                          {rk}{first && <span style={{ position: 'absolute', top: -5, right: -3, fontSize: 9, color: first.color }}>{ecs.length > 1 ? ecs.length : first.badge}</span>}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* 已附魔的牌（牌组里直接列出每张被附魔的牌 + 附魔明细）*/}
              {(() => {
                const ench = SUITS.flatMap((su) => RANKS.map((rk) => ({ su, rk, ids: enchanted[`${su}${rk}`] ?? [] }))).filter((x) => x.ids.length > 0);
                return ench.length > 0 ? (
                  <>
                    <div style={{ fontSize: 12, color: '#7fd1de', fontWeight: 700, margin: '16px 0 6px' }}>已附魔的牌（{ench.length}）</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {ench.map(({ su, rk, ids }) => (
                        <div key={`${su}${rk}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: '#0b1c22', border: '1px solid #16323a', borderRadius: 8, padding: '5px 9px' }}>
                          <span style={{ color: SUIT_SYM[su].c, fontWeight: 800, width: 36, fontSize: 14 }}>{rk}{SUIT_SYM[su].s}</span>
                          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                            {ids.map((id, i) => { const e = ENCHANTS[id]; return (
                              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 14, height: 14, borderRadius: '50%', background: e.color, color: '#0a0a0a', fontSize: 9, fontWeight: 800, lineHeight: '14px', textAlign: 'center' }}>{e.badge}</span>
                                <span style={{ color: e.color, fontWeight: 700 }}>{e.name}</span><span style={{ color: '#64748b' }}>{e.desc}</span>
                              </span>
                            ); })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div style={{ fontSize: 11, color: '#475569', marginTop: 12 }}>（还没有附魔的牌——商店买塔罗牌，选 1 张手牌使用即可附魔）</div>;
              })()}
            </div>
          </div>
        );
      })()}

      {/* ══ 双栏：左信息栏 + 右牌桌 ══ */}
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', width: '100%', maxWidth: 1080, justifyContent: 'center' }}>

      {/* ── 左信息栏 ── */}
      <aside style={{ width: 244, flexShrink: 0, background: '#0c1f26', border: '1px solid #234', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 盲注 token + Boss 预告 */}
        <div style={{ borderRadius: 10, padding: '10px 12px', background: blindKind === 'boss' ? '#3a1118' : '#0b1c22', border: `1px solid ${blindKind === 'boss' ? '#b23' : '#2b5562'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>{BLIND_META[blindKind].icon}</span>
            <div>
              <div style={{ fontWeight: 700, color: blindKind === 'boss' ? '#ff6b81' : '#cfe8ee', fontSize: 14 }}>{BLIND_META[blindKind].label}</div>
              <div style={{ fontSize: 11, color: '#ffd166' }}>奖励 💰${BLIND_META[blindKind].reward}</div>
            </div>
          </div>
          {boss && <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 6 }}>{boss.icon} {boss.name}：{boss.desc}</div>}
        </div>
        {/* 本回合得分 + 目标 + 进度 */}
        <div ref={rScore}>
          <div style={{ fontSize: 11, color: '#9fb3bd', textAlign: 'center', letterSpacing: 2 }}>本回合得分</div>
          <div style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', color: '#fff', lineHeight: 1.2 }}>{roundScore.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#fca5a5', textAlign: 'center' }}>目标 {target.toLocaleString()}</div>
          <div style={{ height: 10, background: '#1e293b', borderRadius: 5, overflow: 'hidden', marginTop: 4, boxShadow: progress >= 100 ? '0 0 12px #22c55e' : 'none', transition: 'box-shadow .3s' }}><div style={{ width: `${progress}%`, height: '100%', background: progress >= 100 ? 'linear-gradient(90deg,#ffd166,#86efac)' : 'linear-gradient(90deg,#22c55e,#86efac)', transition: 'width .3s, background .3s' }} /></div>
        </div>
        {/* 蓝筹码 × 红倍率 框 */}
        <div ref={rBoxes}>
          <div style={{ fontSize: 10, color: '#64748b', textAlign: 'center', marginBottom: 4 }}>{boxLabel}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, background: '#10405f', border: '2px solid #4cc9f0', borderRadius: 9, padding: '6px 0', textAlign: 'center', boxShadow: scoring ? '0 0 14px #4cc9f0aa' : 'none', transition: 'box-shadow .2s' }}>
              <div style={{ fontSize: 9, color: '#8fd9f5' }}>筹码</div>
              <div key={`c${boxChips}`} style={{ fontSize: 22, fontWeight: 800, color: '#fff', animation: scoring ? 'ge-pop .25s ease' : undefined }}>{boxChips.toLocaleString()}</div>
            </div>
            <span style={{ fontSize: 18, color: '#94a3b8' }}>×</span>
            <div style={{ flex: 1, background: '#5e1322', border: '2px solid #f72585', borderRadius: 9, padding: '6px 0', textAlign: 'center', boxShadow: scoring ? `0 0 ${Math.min(30, 10 + boxMult)}px #f72585` : 'none', transition: 'box-shadow .2s' }}>
              <div style={{ fontSize: 9, color: '#ff9ec4' }}>倍率</div>
              <div key={`m${boxMult}`} style={{ fontSize: 22, fontWeight: 800, color: '#fff', animation: scoring ? 'ge-pop .25s ease' : undefined }}>{boxMult}</div>
            </div>
          </div>
        </div>
        {/* 选中牌的附魔属性（点中带附魔的牌即显示）*/}
        {!inShop && !lost && selCards.some((c) => enchantOf(c).length > 0) && (
          <div style={{ background: '#06121a', border: '1px solid #2b4651', borderRadius: 9, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: '#7fd1de', fontWeight: 700, marginBottom: 4 }}>选中牌 · 附魔</div>
            {selCards.filter((c) => enchantOf(c).length > 0).map((c) => (
              <div key={keyOf(c)} style={{ fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: '#fff', fontWeight: 700 }}>{c.rank}{SUIT_SYM[c.suit]}</span>{' '}
                {enchantOf(c).map((id, bi) => { const e = ENCHANTS[id]; return (
                  <span key={bi} style={{ color: e.color }}>{e.badge} {e.name}<span style={{ color: '#64748b' }}>({e.desc})</span>{bi < enchantOf(c).length - 1 ? '，' : ''}</span>
                ); })}
              </div>
            ))}
          </div>
        )}
        {/* 出牌 / 弃牌 / 钱 */}
        <div style={{ display: 'flex', gap: 8 }}>
          {([['出牌', handsLeft, '#4cc9f0'], ['弃牌', discardsLeft, '#f87171'], ['💰', money, '#ffd166']] as const).map(([lab, val, col]) => (
            <div key={lab} style={{ flex: 1, background: '#06121a', border: `1.5px solid ${col}`, borderRadius: 9, padding: '6px 0', textAlign: 'center', position: 'relative' }}>
              <div style={{ fontSize: 10, color: col }}>{lab}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{lab === '💰' ? `$${val}` : val}</div>
              {lab === '💰' && moneyFx && (
                <div key={moneyFx.k} style={{ position: 'absolute', top: -6, left: '50%', fontSize: 14, fontWeight: 900, color: moneyFx.d > 0 ? '#86efac' : '#fca5a5', textShadow: '0 1px 4px #000', animation: 'ge-moneyfly 1.05s ease-out forwards', pointerEvents: 'none', whiteSpace: 'nowrap' }}>{moneyFx.d > 0 ? `+$${moneyFx.d}` : `-$${-moneyFx.d}`}</div>
              )}
            </div>
          ))}
        </div>
        {/* 道具消耗位：星球牌(升级牌型) / 塔罗牌(选 1 张手牌盖附魔)。点击使用 */}
        <div>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>道具 {consumables.length}/{CONSUMABLE_SLOTS}（点击使用）</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: CONSUMABLE_SLOTS }).map((_, i) => {
              const it = consumables[i];
              if (!it) return <div key={i} style={{ flex: 1, padding: '6px 4px', borderRadius: 8, border: '1px dashed #2b4651', color: '#2b4651', textAlign: 'center', fontSize: 16 }}>+</div>;
              const isP = it.kind === 'planet';
              const tip = isP ? `${it.name}：${HAND_RANKINGS[it.hand].name} 升级（当前 Lv${handLevels[it.hand] ?? 1}）` : `${it.name}：选 1 张手牌盖「${ENCHANTS[it.enchant].name}」(${ENCHANTS[it.enchant].desc})`;
              const col = isP ? '#5b6cff' : ENCHANTS[it.enchant].color;
              return (
                <button key={i} onClick={() => useConsumable(i)} title={tip}
                  style={{ flex: 1, padding: '6px 4px', borderRadius: 8, border: `1px solid ${col}`, background: isP ? 'linear-gradient(160deg,#1a2a5e,#0d1430)' : 'linear-gradient(160deg,#2a1a40,#140d24)', color: '#e6e0ff', cursor: 'pointer', fontSize: 11 }}>
                  <div style={{ fontSize: 16 }}>{it.icon}</div>{it.name}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button ref={rDeckBtn} onClick={() => setDeckOpen(true)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #2b5562', background: '#0b1c22', color: '#7fd1de', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>🂠 牌组 / 牌型</button>
          <button onClick={() => setHelpOpen(true)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #2b5562', background: '#0b1c22', color: '#ffd166', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>❔ 帮助</button>
        </div>
        <div style={{ fontSize: 12, color: '#9fb3bd', textAlign: 'center' }}>Ante {ante} · 第 {blindIdx + 1}/3 道</div>
      </aside>

      {/* ── 右牌桌 ── */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, animation: slam ? 'ge-shake .4s ease' : undefined }}>

      {/* 小丑排（owned；开局空）*/}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 74, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, color: '#64748b', letterSpacing: 1 }}>小丑 {owned.length}/{JOKER_SLOTS}</span>
        {owned.length === 0 && <span style={{ fontSize: 11, color: '#475569' }}>（开局无小丑，过盲注进商店购买）</span>}
        {owned.map((j) => {
          const wig = scoring?.frame.wiggle === j.id;
          const rc = RARITY_COLOR[j.rarity];
          const jcol = j.op === 'mul' ? '#ffd166' : j.target === 'chips' ? '#4cc9f0' : j.target === 'money' ? '#ffd166' : '#f72585';
          const jlabel = j.op === 'mul' ? `×${j.value}` : j.target === 'money' ? `+$${j.value}` : `+${j.value}`;
          return (
            <div key={j.id} className="ge-joker" onMouseEnter={() => openJokerTip(j.id)} onMouseLeave={closeJokerTip} style={{ width: 50, height: 70, borderRadius: 6, border: `2px solid ${wig ? '#ffd166' : rc}`, background: '#160f22', position: 'relative', boxShadow: wig ? '0 0 16px #ffd166' : `0 0 8px ${rc}55`, animation: wig ? 'ge-wiggle .26s ease' : undefined, zIndex: hoverJoker === j.id ? 30 : wig ? 5 : 1 }}>
              {wig && <div style={{ position: 'absolute', top: -20, left: '50%', fontSize: 15, fontWeight: 900, color: jcol, textShadow: '0 1px 4px #000, 0 0 8px ' + jcol, animation: 'ge-jfloat .55s ease-out forwards', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10 }}>{jlabel}</div>}
              <div style={{ position: 'absolute', inset: 0, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🃏</div>
                <img src={JOKER_URL(j.name)} alt={j.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              </div>
              <div style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: rc, boxShadow: `0 0 5px ${rc}` }} />
              {/* 悬浮详情：state 驱动 + 延迟关闭；top:70 紧贴卡 + paddingTop 桥接缝隙，鼠标能移到框上点卖出 */}
              {hoverJoker === j.id && (
                <div onMouseEnter={() => openJokerTip(j.id)} onMouseLeave={closeJokerTip} style={{ position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)', width: 150, paddingTop: 8, zIndex: 40 }}>
                  <div style={{ background: 'rgba(10,16,24,0.97)', border: `1px solid ${rc}`, borderRadius: 8, padding: '7px 9px', boxShadow: '0 6px 18px #000a' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{j.name}</div>
                    <div style={{ fontSize: 9, color: rc, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{j.rarity} · {j.jokerType}</div>
                    <div style={{ fontSize: 10.5, color: '#a78bfa', lineHeight: 1.4, marginBottom: 6 }}>{j.text}</div>
                    <button onClick={(ev) => { ev.stopPropagation(); sellJoker(j); setHoverJoker(null); }} disabled={busy} style={{ width: '100%', padding: '4px', borderRadius: 6, border: '1px solid #ef4444', background: busy ? '#1e293b' : 'rgba(239,68,68,0.18)', color: busy ? '#475569' : '#fca5a5', cursor: busy ? 'default' : 'pointer', fontSize: 11, fontWeight: 700 }}>🗑️ 卖出 +💰${sellValue(j)}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 结算读出（最终分砸下）*/}
      {result && !inShop && (
        <div style={{ background: '#0b1c22', border: '1px solid #2b5562', borderRadius: 10, padding: '6px 20px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#ffd166', fontWeight: 700 }}>{HAND_RANKINGS[result.type]?.name ?? result.type}</span>{'  '}
          <span style={{ color: '#4cc9f0', fontWeight: 700 }}>{result.chips}</span> ×{' '}
          <span style={{ color: '#f72585', fontWeight: 700 }}>{result.mult}</span> ={' '}
          <span key={result.score} style={{ color: '#90be6d', fontWeight: 800, fontSize: 22, display: 'inline-block', animation: 'ge-slam .5s cubic-bezier(.2,1.5,.4,1) both', textShadow: '0 0 10px #90be6d88' }}>{result.score.toLocaleString()}</span>
        </div>
      )}

      {/* ── 商店（美化：稀有度光晕 + 进场交错 + 悬浮抬升 + 重摇）── */}
      {inShop && (
        <div style={{ width: '100%', maxWidth: 660, background: 'linear-gradient(160deg,#132a33,#0a1622)', border: '1px solid #2b5562', borderRadius: 16, padding: 20, boxShadow: '0 12px 40px #0008', position: 'relative', overflow: 'hidden' }}>
          <style>{`
            @keyframes ge-shopIn { from { transform: translateY(24px) scale(.9); opacity: 0 } to { transform: none; opacity: 1 } }
            @keyframes ge-coin { 0%{transform:translateY(0)} 50%{transform:translateY(-3px)} 100%{transform:translateY(0)} }
            @keyframes ge-sheen { from { background-position: -200% 0 } to { background-position: 200% 0 } }
            .ge-shop-card { transition: transform .18s ease, box-shadow .18s ease; }
            .ge-shop-card:hover { transform: translateY(-8px) scale(1.03); }
            .ge-buy:hover:not(:disabled) { filter: brightness(1.12); }
          `}</style>

          {/* 顶部光带 */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,transparent,#ffd166,#f59e0b,transparent)', backgroundSize: '200% 100%', animation: 'ge-sheen 3s linear infinite' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#ffd166', letterSpacing: 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}><GuiIcon src={GUI_TAVERN} emoji="🛒" size={26} /> 商店</span>
            <span style={{ fontSize: 15, color: '#ffd166', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', animation: 'ge-coin 1.6s ease-in-out infinite' }}>💰</span> ${money}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', minHeight: 200 }}>
            {shopOffer.length === 0 && <span style={{ color: '#64748b', fontSize: 12, alignSelf: 'center' }}>（已售空 —— 重摇或进入下一道）</span>}
            {shopOffer.map((j, i) => {
              const rc = RARITY_COLOR[j.rarity];
              const can = money >= j.cost && owned.length < JOKER_SLOTS;
              return (
                <div key={j.id} className="ge-shop-card" style={{
                  width: 150, borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
                  background: 'linear-gradient(165deg,#1a1226,#0d0818)', border: `1.5px solid ${rc}`,
                  boxShadow: `0 0 14px ${rc}44, inset 0 0 20px ${rc}11`,
                  animation: `ge-shopIn .35s ease ${i * 0.08}s both`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: rc, textTransform: 'uppercase', letterSpacing: 1 }}>{j.rarity}</span>
                    <span style={{ fontSize: 9, color: '#64748b' }}>{j.jokerType}</span>
                  </div>
                  <div style={{ width: '100%', height: 120, borderRadius: 8, overflow: 'hidden', position: 'relative', background: '#0d0818', boxShadow: `inset 0 0 16px ${rc}22` }}>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>🃏</div>
                    <img src={JOKER_URL(j.name)} alt={j.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', color: '#f1f5f9' }}>{j.name}</div>
                  <div style={{ fontSize: 9.5, color: '#a78bfa', textAlign: 'center', minHeight: 26, lineHeight: 1.35 }}>{j.text}</div>
                  <button className="ge-buy" onClick={() => buyJoker(j)} disabled={!can} style={{ padding: '7px', borderRadius: 8, fontSize: 13, fontWeight: 800, border: 'none', cursor: can ? 'pointer' : 'default', background: can ? `linear-gradient(135deg,${rc},#f59e0b)` : '#1e293b', color: can ? '#1a1020' : '#475569', transition: 'filter .15s' }}>
                    {owned.length >= JOKER_SLOTS ? '槽位已满' : money < j.cost ? `💰$${j.cost}（钱不够）` : `购买 💰$${j.cost}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* 道具货架：星球牌（升级牌型）/ 塔罗牌（盖附魔）*/}
          {shopConsumables.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #2b5562' }}>
              <div style={{ fontSize: 11, color: '#7fa8ff', fontWeight: 700, marginBottom: 8 }}>🪐 星球牌（升级牌型） · 🔮 塔罗牌（盖附魔）</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                {shopConsumables.map((it, i) => {
                  const can = money >= it.cost && consumables.length < CONSUMABLE_SLOTS;
                  const isP = it.kind === 'planet';
                  const col = isP ? '#5b6cff' : ENCHANTS[it.enchant].color;
                  const blurb = isP ? `升级「${HAND_RANKINGS[it.hand].name}」` : `附「${ENCHANTS[it.enchant].name}」${ENCHANTS[it.enchant].desc}`;
                  return (
                    <div key={it.id} className="ge-shop-card" style={{ width: 132, borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, background: isP ? 'linear-gradient(165deg,#16234e,#0a1024)' : 'linear-gradient(165deg,#2a1640,#140a24)', border: `1.5px solid ${col}`, boxShadow: `0 0 14px ${col}44`, animation: `ge-shopIn .35s ease ${i * 0.08}s both` }}>
                      <div style={{ fontSize: 34, textAlign: 'center' }}>{it.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, textAlign: 'center', color: '#e6e0ff' }}>{it.name}{!isP && ' 🔮'}</div>
                      <div style={{ fontSize: 9.5, color: '#b9a8ff', textAlign: 'center', minHeight: 24, lineHeight: 1.35 }}>{blurb}</div>
                      <button className="ge-buy" onClick={() => buyConsumable(it)} disabled={!can} style={{ padding: '7px', borderRadius: 8, fontSize: 13, fontWeight: 800, border: 'none', cursor: can ? 'pointer' : 'default', background: can ? `linear-gradient(135deg,${col},#3b82f6)` : '#1e293b', color: can ? '#0a1020' : '#475569' }}>
                        {consumables.length >= CONSUMABLE_SLOTS ? '消耗位满' : money < it.cost ? `💰$${it.cost}（钱不够）` : `购买 💰$${it.cost}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
            <button onClick={reroll} disabled={money < REROLL_COST} style={{ padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: '1px solid #475569', cursor: money >= REROLL_COST ? 'pointer' : 'default', background: money >= REROLL_COST ? 'rgba(96,165,250,0.12)' : '#1e293b', color: money >= REROLL_COST ? '#93c5fd' : '#475569' }}>
              🎲 重摇 💰${REROLL_COST}
            </button>
            <span style={{ fontSize: 11, color: '#64748b' }}>小丑槽 {owned.length}/{JOKER_SLOTS}</span>
            <button onClick={nextBlind} style={{ padding: '10px 24px', borderRadius: 9, fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#06210f', boxShadow: '0 4px 16px #22c55e44' }}>
              下一道盲注 ▶
            </button>
          </div>
        </div>
      )}

      {/* ── 手牌 + 操作（playing）── */}
      {phase === 'playing' && (
        <>
          {/* 动效关键帧（表现层）：飞入(从牌堆吸入)/飞向垃圾桶/计数器跳动/计分牌弹起/小丑抖动 */}
          <style>{`
            @keyframes ge-drawIn { from { transform: translate(-300px,-130px) scale(.2) rotate(-30deg); opacity: 0 } to { transform: none; opacity: 1 } }
            @keyframes ge-flyTrash { from { transform: none; opacity: 1 } to { transform: translate(300px,90px) scale(.4) rotate(45deg); opacity: 0 } }
            @keyframes ge-pop { 0% { transform: scale(1) } 35% { transform: scale(1.55) } 100% { transform: scale(1) } }
            @keyframes ge-scorehi { 0% { transform: translateY(0) } 40% { transform: translateY(-20px) scale(1.14) } 100% { transform: translateY(0) } }
            @keyframes ge-float { 0% { transform: translateY(-6px); opacity: 0 } 30% { opacity: 1 } 100% { transform: translateY(-46px); opacity: 0 } }
            .ge-cardsel:hover { transform: translateY(-8px) !important; }
          `}</style>

          {scoring ? (
            /* ── 出牌计分演出 box：牌飞到中央，逐张报基础分，小丑抖动，计数器跳动 ── */
            <div style={{ width: '100%', maxWidth: 640, minHeight: CH + 120, background: 'radial-gradient(circle at 50% 30%,#15323d,#0a1622)', border: '1px solid #2b5562', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, boxShadow: 'inset 0 0 40px #0006' }}>
              {/* 大计数器：chips × mult (= score) */}
              <div style={{ fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span key={`c${scoring.frame.chips}`} style={{ display: 'inline-block', color: '#4cc9f0', animation: 'ge-pop .26s ease' }}>{scoring.frame.chips.toLocaleString()}</span>
                <span style={{ color: '#64748b', fontSize: 20 }}>筹码 ×</span>
                <span key={`m${scoring.frame.mult}`} style={{ display: 'inline-block', color: '#f72585', animation: 'ge-pop .26s ease' }}>{scoring.frame.mult}</span>
                {scoring.frame.score != null && (
                  <>
                    <span style={{ color: '#64748b', fontSize: 20 }}>=</span>
                    <span key={`s${scoring.frame.score}`} style={{ display: 'inline-block', color: '#90be6d', fontSize: 36, animation: 'ge-pop .4s ease' }}>{scoring.frame.score.toLocaleString()}</span>
                  </>
                )}
              </div>
              {/* 出的牌：当前计分牌弹起高亮 + 飘 "+chips" */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', minHeight: CH + 30 }}>
                {scoring.cards.map((c, i) => {
                  const isHi = scoring.frame.hi === i;
                  const isScoring = scoring.scoringIdx.includes(i);
                  const ecs = enchantOf(c);
                  const first = ecs.length ? ENCHANTS[ecs[0]] : null;
                  return (
                    <div key={keyOf(c)} style={{ position: 'relative', ...cardBg(c.suit, c.rank), opacity: isScoring ? 1 : 0.4, outline: isHi ? '3px solid #4cc9f0' : first ? `2px solid ${first.color}` : '1px solid #0008', boxShadow: isHi ? '0 0 22px #4cc9f0' : first ? `0 0 10px ${first.color}aa` : 'none', animation: isHi ? 'ge-scorehi .22s ease' : undefined, transition: 'opacity .2s' }}>
                      {isHi && <div style={{ position: 'absolute', top: -22, left: 0, right: 0, textAlign: 'center', color: '#4cc9f0', fontWeight: 800, fontSize: 14, animation: 'ge-float .55s ease forwards' }}>+{BASE_CHIPS_BY_RANK[String(RANK_ORDER[c.rank])] ?? 0}</div>}
                      {ecs.length > 0 && <span style={{ position: 'absolute', top: -7, right: -6, display: 'flex', gap: 1 }}>
                        {ecs.map((id, bi) => { const e = ENCHANTS[id]; return <span key={bi} style={{ width: 15, height: 15, borderRadius: '50%', background: e.color, color: '#0a0a0a', fontSize: 9, fontWeight: 800, lineHeight: '15px', textAlign: 'center', boxShadow: `0 0 5px ${e.color}` }}>{e.badge}</span>; })}
                      </span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>结算中…</div>
            </div>
          ) : (
            <>
              {/* 牌型名横幅（选牌时大字预览）*/}
              <div style={{ minHeight: 34, display: 'flex', alignItems: 'center' }}>
                {preview && (
                  <div key={preview.name} style={{ animation: 'ge-handname .35s ease-out both', fontSize: 22, fontWeight: 900, letterSpacing: 2, color: '#ffd166', textShadow: '0 2px 8px #000, 0 0 14px #ffd16655' }}>
                    {preview.name} <span style={{ fontSize: 14, color: '#4cc9f0' }}>{preview.chips}</span><span style={{ fontSize: 12, color: '#64748b' }}> × </span><span style={{ fontSize: 14, color: '#f72585' }}>{preview.mult}</span>
                  </div>
                )}
              </div>
              {/* 排序按钮 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: '#64748b' }}>
                <span>排序</span>
                <button onClick={() => sortHand('suit')} disabled={busy} style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, border: '1px solid #334155', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: busy ? 'default' : 'pointer' }}>🎨 花色</button>
                <button onClick={() => sortHand('rank')} disabled={busy} style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, border: '1px solid #334155', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: busy ? 'default' : 'pointer' }}>🔢 点数</button>
              </div>

              {/* 牌堆(左) · 手牌一行(中) · 垃圾桶(右) */}
              <div style={{ position: 'relative', width: '100%', maxWidth: 760, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', minHeight: CH + 30 }}>
                <div style={{ position: 'absolute', left: 8, bottom: 6, textAlign: 'center', color: '#64748b', fontSize: 10 }}>
                  <div style={{ width: 38, height: 52, borderRadius: 6, background: 'linear-gradient(135deg,#1e3a5f,#0b1c33)', border: '1px solid #2b5562', boxShadow: '2px 2px 0 #0b1c33, 4px 4px 0 #0b1c33' }} />
                  <div style={{ marginTop: 4 }}>牌堆</div>
                </div>

                <div ref={rHand} style={{ display: 'flex', gap: 5, alignItems: 'flex-end', justifyContent: 'center' }}>
                  {hand.map((c, i) => {
                    const leaving = anim?.idx.includes(i);
                    const isNew = newKeys.has(keyOf(c));
                    const ecs = enchantOf(c);
                    const first = ecs.length ? ENCHANTS[ecs[0]] : null;
                    return (
                      <div key={keyOf(c)} className={`ge-card${busy ? '' : ' ge-cardsel'}`} onClick={() => !busy && toggle(i)} style={{
                        ...cardBg(c.suit, c.rank), cursor: busy ? 'default' : 'pointer', position: 'relative',
                        transform: sel[i] && !leaving ? 'translateY(-12px)' : 'none', transition: 'transform 0.15s',
                        outline: sel[i] ? '3px solid #ffd166' : first ? `2px solid ${first.color}` : '1px solid #0008',
                        boxShadow: sel[i] ? '0 8px 20px #ffd16655' : first ? `0 0 10px ${first.color}aa` : 'none',
                        animation: leaving ? 'ge-flyTrash 0.38s ease forwards' : isNew ? `ge-drawIn 0.4s ease ${i * 0.05}s both` : sel[i] ? 'ge-selpulse 1.2s ease-in-out infinite' : undefined,
                      }}>
                        {ecs.length > 0 && <span style={{ position: 'absolute', top: -7, right: -6, display: 'flex', gap: 1 }}>
                          {ecs.map((id, bi) => { const e = ENCHANTS[id]; return <span key={bi} style={{ width: 15, height: 15, borderRadius: '50%', background: e.color, color: '#0a0a0a', fontSize: 9, fontWeight: 800, lineHeight: '15px', textAlign: 'center', boxShadow: `0 0 5px ${e.color}` }}>{e.badge}</span>; })}
                        </span>}
                        {ecs.length > 0 && first && (
                          <div className="ge-ench-tip" style={{ position: 'absolute', bottom: CH + 10, left: '50%', transform: 'translateX(-50%)', width: 168, background: 'rgba(8,14,22,0.9)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', border: `1px solid ${first.color}`, borderRadius: 9, padding: '8px 10px', zIndex: 45, boxShadow: '0 8px 22px #000b' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 5 }}>{c.rank}{SUIT_SYM[c.suit]} · 附魔</div>
                            {ecs.map((id, bi) => { const e = ENCHANTS[id]; return (
                              <div key={bi} style={{ fontSize: 10.5, lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 14, height: 14, borderRadius: '50%', background: e.color, color: '#0a0a0a', fontSize: 9, fontWeight: 800, lineHeight: '14px', textAlign: 'center' }}>{e.badge}</span>
                                <span style={{ color: e.color, fontWeight: 700 }}>{e.name}</span><span style={{ color: '#9fb3bd' }}>{e.desc}</span>
                              </div>
                            ); })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div title="弃牌桶" style={{ position: 'absolute', right: 8, bottom: 6, textAlign: 'center', color: '#64748b', fontSize: 10 }}>
                  <div style={{ fontSize: 38, lineHeight: 1, filter: anim?.mode === 'discard' ? 'drop-shadow(0 0 10px #60a5fa)' : 'none', transform: anim?.mode === 'discard' ? 'scale(1.15)' : 'none', transition: 'all 0.2s' }}>🗑️</div>
                  <div style={{ marginTop: 2 }}>弃牌</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                <button ref={rPlay} onClick={startScoring} disabled={selCount === 0 || handsLeft <= 0 || busy || !!playBlock} title={playBlock ?? ''} style={{ padding: '8px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, border: 'none', cursor: selCount && handsLeft > 0 && !busy && !playBlock ? 'pointer' : 'default', background: selCount && handsLeft > 0 && !busy && !playBlock ? 'linear-gradient(135deg,#ffd166,#f59e0b)' : '#1e293b', color: selCount && handsLeft > 0 && !busy && !playBlock ? '#1a1020' : '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3 }}>
                  <span>▶ 出牌</span><span style={{ fontSize: 10, opacity: 0.85 }}>剩 {handsLeft} 次</span>
                </button>
                <button ref={rDiscard} onClick={beginDiscard} disabled={selCount === 0 || discardsLeft <= 0 || busy} style={{ padding: '8px 22px', borderRadius: 8, fontSize: 14, fontWeight: 700, border: 'none', cursor: selCount && discardsLeft > 0 && !busy ? 'pointer' : 'default', background: selCount && discardsLeft > 0 && !busy ? 'linear-gradient(135deg,#60a5fa,#3b82f6)' : '#1e293b', color: selCount && discardsLeft > 0 && !busy ? '#0a1020' : '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3 }}>
                  <span>♻ 弃牌</span><span style={{ fontSize: 10, opacity: 0.85 }}>剩 {discardsLeft} 次</span>
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#9fb3bd' }}>已选 <span style={{ color: '#ffd166', fontWeight: 700 }}>{selCount}</span>/5 张{selCount === 0 ? '（点手牌选择）' : ''}</div>
              {playBlock && <div style={{ fontSize: 12, color: '#fca5a5' }}>🚫 {playBlock}</div>}
            </>
          )}
        </>
      )}

      {/* ── 失败 ── */}
      {lost && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
          <div style={{ fontSize: 18, color: '#ef4444', fontWeight: 700 }}>💀 出牌耗尽，未达盲注线（{roundScore.toLocaleString()} / {target.toLocaleString()}）</div>
          <button onClick={restart} style={{ padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#ffd166,#f59e0b)', color: '#1a1020', alignSelf: 'center' }}>重新开始</button>
        </div>
      )}
      </main>
      </div>{/* ══ 双栏行结束 ══ */}

      <div style={{ fontSize: 10, color: '#3d4a5c', textAlign: 'center', maxWidth: 560, lineHeight: 1.6 }}>
        Ante 三盲注(Small×1/Big×1.5/Boss×2) → 选≤5 出牌冲线 / 弃牌换牌 → 过线结算$进商店买小丑 → 下一道。
        逻辑全在引擎（牌型/计分/小丑），本界面只读写世界资源。开局 0 小丑（Balatro 设定）。
      </div>
    </div>
  );
}

export function mount(container: HTMLElement): () => void {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;inset:0;background:radial-gradient(circle at 50% 25%,#16323a,#0a0714);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px 0';
  container.appendChild(wrapper);
  const root = createRoot(wrapper);
  root.render(<GameE />);
  return () => { root.unmount(); wrapper.remove(); };
}
