import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Card, PlayedHand, PokerHand, Resource, StringVar, Flag } from '@engine/protocol/components.js';
import { findByComponentId } from '@engine/core/query.js';
import { clearScoreTrace, appendScoreEvent } from '../score-trace.js';
import { clamp } from '@engine/math/scalar.js';

// ═══════════════════════════════════════════════════════════════
//  poker-hand —— 「一手牌 → 牌型 + 基础分」确定性评估器（REQ-011；Tier3「算法/解释器型机制」大类）。
//
//  Condition→Event→Effect 是反应式布尔逻辑，表达不了「5 张是不是同花顺」这种带计数/排序的算法——
//  扑克牌型判定正是这类缺口（与已落地的 match3-board「网格连消」、tilemap「瓦片碰撞」完全同构）。
//
//  分工（严守 manifesto：选牌/洗牌/盲注/回合/经济全用现有能力重组，本能力只补"判牌型"这一真缺口）：
//    - 选牌/弃牌/出牌触发 → clickable + effect-apply（装配层填 PlayedHand.cards）。
//    - 洗牌发牌          → random（RandomSeed 整数 PRNG）。
//    - 盲注线/回合状态机   → condition + event-when + state。
//    - 小丑 ×mult / +chips → effect-apply 的 op/order（REQ-012）。
//    - 「这手是什么牌型、基础多少分」→ ★本能力★（纯算法，LLM 产不出同一份数据 → 下沉成引擎解释器）。
//
//  poker-eval（Update 相位，早于小丑结算的 effect-apply=Commit）：读同实体 PlayedHand → evaluateHand
//  → 按 rankingTable **set** 基础 chips/mult 两个 Resource（基础值，被后续小丑乘/加修正）→ 可选写牌型名 StringVar。
//  确定性：纯整数/枚举比较与计数（花色相等、点数大小、张数），不碰浮点超越函数 → lockstep/录放安全。
// ═══════════════════════════════════════════════════════════════

// 牌型名（priority 从低到高的全集；rankingTable 的键即取自此集）。
export type HandType =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'
  | 'five-of-a-kind' // Balatro：小丑/特殊牌组可凑 5 张同点
  | 'flush-house' // 葫芦 + 同花
  | 'flush-five'; // 5 张同点同花

// 牌型评估结果：最高牌型 + 计数派生事实（供「逐张/按花色/按点数」迭代的小丑读）。
export interface HandEval {
  type: HandType;
  rankCounts: ReadonlyMap<number, number>; // 点数 → 张数（按点数计数接口）
  suitCounts: ReadonlyMap<number, number>; // 花色 → 张数（按花色计数接口）
  isFlush: boolean; // 同花（≥5 张且全同花色）
  isStraight: boolean; // 顺子（5 张相异且连续，含 A 高 / A 低轮子）
}

// 判型规则修饰（REQ-E-023⑤，被动小丑置位 → poker-eval 从 PokerHand.handMods 的 Flag 解析后传入）。
// 只读 flag 改"判定阈值/合并"，不引入新牌型。four_fingers=四张成顺/同花、shortcut=顺子可隔1、smeared=红/黑各算同花。
export interface HandMods {
  fourFlush?: boolean; // four_fingers：4 张同花即同花（阈值 5→4）
  fourStraight?: boolean; // four_fingers：4 张连即顺（阈值 5→4）
  gappedStraight?: boolean; // shortcut：顺子允许步长≤2（隔 1 点）
  suitMerge?: boolean; // smeared：♥♦ 同色 / ♠♣ 同色 合并后算同花
}

// 牌型优先级（低→高，= HandType 全集判定顺序）。wild 枚举比较用；下标越大牌型越强。
const HAND_TYPE_ORDER: readonly HandType[] = [
  'high-card', 'pair', 'two-pair', 'three-of-a-kind', 'straight', 'flush',
  'full-house', 'four-of-a-kind', 'straight-flush', 'five-of-a-kind', 'flush-house', 'flush-five',
];
const handTypeRank = (t: HandType): number => HAND_TYPE_ORDER.indexOf(t);

// ── 纯算法 helper（导出供单测；无副作用，确定性）────────────────────────────

// 按字段计数（点数/花色）。返回普通 Map（值=张数）；调用方若需遍历请自行按 key 排序保证确定性。
function countBy(cards: readonly Card[], pick: (c: Card) => number): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cards) m.set(pick(c), (m.get(pick(c)) ?? 0) + 1);
  return m;
}

// need=需要几张连成顺（缺省 5；four_fingers=4）；maxStep=相邻点数最大步长（缺省 1；shortcut=2 允许隔 1）。
// A 既高(14)又低(1)：含 14 则补 1。排序去重后找步长≤maxStep 的连续段长≥need。1 参数调用向后兼容（need5/step1，等价旧"5 张连/A 低轮子"）。
export function isStraightRanks(distinctRanks: readonly number[], need = 5, maxStep = 1): boolean {
  const set = new Set(distinctRanks);
  if (set.has(14)) set.add(1); // A 低轮子（A 当 1）
  const sorted = [...set].sort((a, b) => a - b);
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    run = d >= 1 && d <= maxStep ? run + 1 : 1;
    if (run >= need) return true;
  }
  return need <= 1;
}

// 牌型判定（纯函数：有序卡集 → 稳定结果）。priority 从高到低短路，所以"并列取高"（如葫芦不会被判成对子）。
// ── wild 分派入口（REQ-GAMED #2）── 无 wild 牌 → 直接判具体牌型（逐字节等价旧行为，不枚举）；
// 含 wild → 小规模确定性枚举每张 wild 的具体(suit,rank)取值，取**最优牌型**（并列取枚举序最先解，tie-break 固定）。
export function evaluateHand(cards: readonly Card[], mods: HandMods = {}): HandEval {
  const hasWild = cards.some((c) => c.wild);
  if (!hasWild) return evaluateHandConcrete(cards, mods);
  return evaluateHandWithWild(cards, mods);
}

// 具体牌型判定（无 wild 的原始实现；wild 枚举对每个"已代入具体值"的候选手调用它）。
function evaluateHandConcrete(cards: readonly Card[], mods: HandMods = {}): HandEval {
  const rankCounts = countBy(cards, (c) => c.rank);
  const suitCounts = countBy(cards, (c) => c.suit);

  // 张数降序（[最多, 次多, ...]），驱动 N 条/葫芦/两对判定，与具体点数无关。
  const counts = [...rankCounts.values()].sort((a, b) => b - a);
  const maxCount = counts[0] ?? 0;
  const secondCount = counts[1] ?? 0;

  // 同花：某（可合并）花色张数≥阈值。阈值缺省 5，four_fingers→4；smeared 把 ♥♦/♠♣ 合并计数。
  // 缺省（无 mods）：阈值 5、不合并 → 等价旧"≥5 张且全同花色"。
  const flushNeed = mods.fourFlush ? 4 : 5;
  const suitKey = (s: number): number => (mods.suitMerge ? (s === 1 || s === 2 ? 0 : 1) : s); // 红(♥1♦2)→0 / 黑(♠0♣3)→1
  let maxSuit = 0;
  const mergedSuit = new Map<number, number>();
  for (const c of cards) { const n = (mergedSuit.get(suitKey(c.suit)) ?? 0) + 1; mergedSuit.set(suitKey(c.suit), n); if (n > maxSuit) maxSuit = n; }
  const isFlush = cards.length >= flushNeed && maxSuit >= flushNeed;
  // 顺子：need 张连（four_fingers→4）、步长≤(shortcut?2:1)。缺省等价旧"恰 5 张相异连续 + A 低轮子"。
  const straightNeed = mods.fourStraight ? 4 : 5;
  const isStraight = cards.length >= straightNeed && isStraightRanks([...rankCounts.keys()], straightNeed, mods.gappedStraight ? 2 : 1);

  let type: HandType;
  if (maxCount === 5 && isFlush) type = 'flush-five';
  else if (maxCount === 5) type = 'five-of-a-kind';
  else if (maxCount === 3 && secondCount === 2 && isFlush) type = 'flush-house';
  else if (isStraight && isFlush) type = 'straight-flush';
  else if (maxCount === 4) type = 'four-of-a-kind';
  else if (maxCount === 3 && secondCount === 2) type = 'full-house';
  else if (isFlush) type = 'flush';
  else if (isStraight) type = 'straight';
  else if (maxCount === 3) type = 'three-of-a-kind';
  else if (maxCount === 2 && secondCount === 2) type = 'two-pair';
  else if (maxCount === 2) type = 'pair';
  else type = 'high-card';

  return { type, rankCounts, suitCounts, isFlush, isStraight };
}

// ── wild 枚举（REQ-GAMED #2）─────────────────────────────────────────────────
// wild 牌可当任意 suit+rank，求最优牌型。空间控制（wild≤5，枚举可控）：
//   ① 候选取值收敛为**紧集**——花色只取牌里已出现的（补同花只需并入现有花色；全 wild 时取 {0}）；
//      点数取「已出现点数 ∪ 每个已出现点数 need 窗口内的补顺点数」（clamp [2..14]，A=14 内部自带轮子）。
//   ② wild 之间无序 → 用「可重复组合」枚举（组合数 C(候选+wild-1, wild)，远小于 候选^wild）。
//   ③ 并列取高：按枚举序（候选 (suit,rank) 升序、组合字典序）**最先**达到最高牌型的解（tie-break 固定、可测）。
// 返回该最优代入手的具体 HandEval（rankCounts/suitCounts/isFlush/isStraight 均反映最优代入 → 语义一致）。
function evaluateHandWithWild(cards: readonly Card[], mods: HandMods): HandEval {
  const nonWild = cards.filter((c) => !c.wild);
  const wildCount = cards.length - nonWild.length;
  // 全 wild 不走「全代同值」捷径：four_fingers(4 张同花/连) 下 2-3-4-5 同花顺 > 四条，捷径会判低（Lead 验收修）。
  // 统一走枚举——wildCandidates 对空 nonWild 以 (suit 0, rank 2) 种子展开顺子窗口，候选极小（≤C(9,5) 级）。
  const cands = wildCandidates(nonWild, mods);
  let best: HandEval | undefined;
  let bestRank = -1;
  for (const combo of combosWithRep(cands.length, wildCount)) {
    const resolved = nonWild.concat(combo.map((ci) => cands[ci]));
    const evald = evaluateHandConcrete(resolved, mods);
    const r = handTypeRank(evald.type);
    if (r > bestRank) { bestRank = r; best = evald; } // 严格大于 → 保留枚举序最先的最优解（tie-break）
  }
  return best!; // wildCount≥1 且候选必非空（nonWild 空时 wildCandidates 以 (0,2) 种子）→ 必有解
}

// wild 候选具体牌（紧集，见 evaluateHandWithWild 注释）。花色升序×点数升序 → 枚举序确定。
function wildCandidates(nonWild: readonly Card[], mods: HandMods): Card[] {
  const suits = [...new Set(nonWild.map((c) => c.suit))].sort((a, b) => a - b);
  const candSuits = suits.length ? suits : [0];
  const ranks = new Set<number>(nonWild.map((c) => c.rank));
  if (ranks.size === 0) ranks.add(2); // 全 wild：种子最低点数，窗口展开后同时覆盖「n 同点」与「顺/同花顺」两族最优
  const need = mods.fourStraight ? 4 : 5;
  const step = mods.gappedStraight ? 2 : 1;
  const reach = (need - 1) * step; // 一条顺子跨度内 wild 可补的点数离某已存在点数最远这么多
  for (const e of [...ranks]) {
    for (let r = e - reach; r <= e + reach; r++) if (r >= 2 && r <= 14) ranks.add(r); // A(14) 自带 A 低轮子，不需 rank 1
  }
  const candRanks = [...ranks].sort((a, b) => a - b);
  const out: Card[] = [];
  for (const s of candSuits) for (const r of candRanks) out.push({ suit: s, rank: r });
  return out;
}

// 可重复组合（多重集组合）：从 n 个候选里取 k 个（无序、可重复），非降序下标元组、字典序。确定性枚举。
function* combosWithRep(n: number, k: number): Generator<number[]> {
  if (k <= 0 || n <= 0) { if (k <= 0) yield []; return; }
  const idx = new Array(k).fill(0);
  for (;;) {
    yield idx.slice();
    let i = k - 1;
    while (i >= 0 && idx[i] === n - 1) i--;
    if (i < 0) break;
    const v = idx[i] + 1;
    for (let j = i; j < k; j++) idx[j] = v;
  }
}

// 「计分牌」集合（Balatro：只有构成牌型的牌计分，垫牌 kicker 不计分；BUG-001 修复）。
// 全员计分的牌型（牌都属于牌型）：straight/flush/full-house/straight-flush/five-of-a-kind/flush-house/flush-five。
// 计数型（只算构成牌型的那几张）：pair/two-pair/three/four=点数计数≥2 的牌；high-card=最高单张。
// 返回原始出牌下标（有序），供 card-scoring 逐张 pass 只在计分牌上累加 baseChips / 触发逐张小丑。
const ALL_SCORE_TYPES: ReadonlySet<HandType> = new Set([
  'straight', 'flush', 'full-house', 'straight-flush', 'five-of-a-kind', 'flush-house', 'flush-five',
]);
export function scoringCardIndices(cards: readonly Card[]): number[] {
  if (cards.length === 0) return [];
  const e = evaluateHand(cards);
  if (ALL_SCORE_TYPES.has(e.type)) return cards.map((_, i) => i);
  // 计数型：计分牌 = 点数计数≥2 的牌（pair 一种点、two-pair 两种、three/four 各一种）。
  const scoringRanks = new Set<number>();
  for (const [rank, count] of e.rankCounts) if (count >= 2) scoringRanks.add(rank);
  if (scoringRanks.size > 0) {
    const idx: number[] = [];
    cards.forEach((c, i) => { if (scoringRanks.has(c.rank)) idx.push(i); });
    return idx;
  }
  // 高牌：仅最高单张（A=14 最高；无对子故最高点唯一，取首个匹配下标确定性）。
  let best = 0;
  for (let i = 1; i < cards.length; i++) if (cards[i].rank > cards[best].rank) best = i;
  return [best];
}

// ── 系统副作用 helper：按 id 全局定位并写 Resource.current（set 基础值，钳 [min,max]）/ StringVar.value。──
function setResourceBase(world: IWorld, resourceId: string, value: number): number {
  if (!resourceId) return value;
  const e = findByComponentId(world, 'Resource', 'id', resourceId);
  if (!e) return value;
  const r = world.getComponent<Resource>(e, 'Resource');
  if (!r) return value;
  r.current = clamp(value, r.min, r.max);
  return r.current; // 返回钳后真值（供 REQ-019 trace 的 after）
}
function setHandTypeVar(world: IWorld, varId: string, value: string): void {
  const e = findByComponentId(world, 'StringVar', 'id', varId);
  if (!e) return;
  const v = world.getComponent<StringVar>(e, 'StringVar');
  if (v) v.value = value;
}
function setFlag(world: IWorld, flagId: string, active: boolean): void {
  const e = findByComponentId(world, 'Flag', 'id', flagId);
  if (!e) return;
  const f = world.getComponent<Flag>(e, 'Flag');
  if (f) f.active = active;
}
// REQ-E-023⑤：读 Flag.active（判型规则修饰由被动小丑置位 → poker-eval 读它改判定）。缺/无 → false。
function getFlag(world: IWorld, flagId: string): boolean {
  const e = findByComponentId(world, 'Flag', 'id', flagId);
  return e ? (world.getComponent<Flag>(e, 'Flag')?.active ?? false) : false;
}

// 包含谓词原语（REQ-011 完善）：从 rankCounts 折算「最大同点张数」「计数≥2 的种数」。
// 含对子=rankMaxCount≥2、含三条=≥3、含四条=≥4、含五条=≥5、含两对=pairCount≥2、含葫芦=and(≥3,pairCount≥2)。
export function rankMaxCount(rankCounts: ReadonlyMap<number, number>): number {
  let m = 0;
  for (const c of rankCounts.values()) if (c > m) m = c;
  return m;
}
export function pairCount(rankCounts: ReadonlyMap<number, number>): number {
  let n = 0;
  for (const c of rankCounts.values()) if (c >= 2) n += 1;
  return n;
}

export const pokerHandCapability = defineCapability({
  id: 't3-poker-hand',
  version: '1.0.0',

  describe: {
    name: 'poker-hand',
    summary:
      '扑克牌型评估器：读同实体 PlayedHand → 确定性判定最高牌型（高牌…同花顺/五条/同花葫芦/同花五）→ 按 rankingTable set 基础 chips/mult 两 Resource，可选写牌型名 StringVar。Balatro 式卡牌玩法底座。',
    semantic: ['tier3', 'mechanic', 'cards', 'poker', 'algorithm'],
    whenToUse:
      'Balatro 式 roguelike 卡牌 / 任何"判牌型给基础分"的玩法。挂 PokerHand{rankingTable,chipsResource,multResource} + PlayedHand{cards} 于同一"牌桌"实体；选牌交互（clickable/random/effect）填 cards，本能力出基础分，小丑用 effect-apply op/order（REQ-012）做修正。',
    examples: [
      'Balatro 牌桌：PokerHand{ rankingTable:{ "pair":{chips:10,mult:2}, "flush":{chips:35,mult:4}, "straight-flush":{chips:100,mult:8} }, chipsResource:"chips", multResource:"mult" } + PlayedHand{cards:[...]}',
      '出同花顺：PlayedHand{ cards:[{suit:0,rank:10},{suit:0,rank:11},{suit:0,rank:12},{suit:0,rank:13},{suit:0,rank:14}] } → 牌型 straight-flush → set chips=100,mult=8',
      '打出同花 → 触发某小丑：PokerHand.handTypeVar:"lastHand" → poker-eval 写 StringVar(lastHand="flush") → condition{string,eq,"flush"} 读到 → 小丑 effect 生效',
      '百搭（REQ-GAMED #2）：某张 Card{wild:true} 可当任意 suit+rank 求最优牌型（小规模确定性枚举）。PlayedHand{cards:[{suit:0,rank:10},{suit:0,rank:11},{suit:0,rank:12},{suit:0,rank:13},{wild:true}]} → 补 ♠A 成 straight-flush。game-d 百搭骰 / game-e 通配小丑各把某张 wild 即用',
    ],
  },

  components: {
    provides: {
      PlayedHand: {
        category: 'event',
        describe: '本次出的牌（有序，供逐张迭代/按花色·点数计数）。由选牌交互装配填充；空=本帧不评估。',
        fields: {
          cards: { type: 'string', describe: '出的牌数组 Card[]，每张 {suit:任意int(♠♥♦♣=0..3；六色元素=0..5，无枚举约束), rank:2..14(A=14,J/Q/K=11/12/13), wild?:boolean}；有序。wild:true=百搭牌，判型时枚举成最优 suit+rank（REQ-GAMED #2）' },
        },
      },
      PokerHand: {
        category: 'config',
        describe: '牌型评估器配置（单例挂"牌桌"实体）：牌型→基础分表 + 输出 Resource/StringVar 路由。',
        fields: {
          rankingTable: { type: 'string', describe: '牌型名→{chips,mult} 的 Record（纯数据表，设计可调，键取自牌型全集）' },
          chipsResource: { type: 'string', describe: '写基础 chips 的 Resource id（按 id 全局定位）' },
          multResource: { type: 'string', describe: '写基础 mult 的 Resource id' },
          handTypeVar: { type: 'string', describe: '可选：写**最高**牌型名的 StringVar id（"恰是某型"判定，如打出同花顺）' },
          rankMaxCountResource: { type: 'string', describe: '可选：最大同点张数写入此 Resource（2=含对子,3=含三条,4=含四条,5=含五条）' },
          pairCountResource: { type: 'string', describe: '可选：点数计数≥2 的种数写入此 Resource（2=含两对）' },
          isStraightFlag: { type: 'string', describe: '可选：是否含顺子写入此 Flag.id' },
          isFlushFlag: { type: 'string', describe: '可选：是否含同花写入此 Flag.id' },
          handSizeResource: { type: 'string', describe: '可选：本次出牌张数写入此 Resource（Half Joker「出牌≤3张」等）' },
        },
      },
    },
    reads: ['PokerHand', 'PlayedHand', 'Resource', 'Flag'],
    writes: ['Resource', 'StringVar', 'Flag'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      // poker-eval：读同实体 PlayedHand → 判牌型 → set 基础 chips/mult + 牌型名。Update 相位
      // （早于小丑结算的 effect-apply=Commit）：先把"基础值"写进 Resource，再被同 tick 的 ×mult/+chips 修正。
      id: 'poker-eval',
      phase: SystemPhase.Update,
      // 定序：与 resource-apply/string-apply 同读写 Resource/StringVar 于 Update → 显式 runsBefore 打破拓扑环
      // （与 dialogue.ts 先例一致）。语义：poker-eval 先 set 基础分，resource-apply 再在其上应用 ResourceModify。
      runsBefore: ['resource-apply', 'string-apply'],
      reads: ['PokerHand', 'PlayedHand', 'Resource', 'Flag'],
      writes: ['Resource', 'StringVar', 'Flag'],
      consumes: [],
      execute(world: IWorld) {
        // REQ-019：计分链首系统 → 清空 trace（单一清空点，opt-in：无 ScoreTrace 则 no-op）。
        const trace = clearScoreTrace(world);
        for (const [eid] of world.query('PokerHand', 'PlayedHand')) {
          const cfg = world.getComponent<PokerHand>(eid, 'PokerHand')!;
          const played = world.getComponent<PlayedHand>(eid, 'PlayedHand')!;
          if (played.cards.length === 0) continue; // 无出牌 → 不评估（基础分由装配层在新回合清零）
          // REQ-E-023⑤：判型规则修饰——从 PokerHand.handMods 的 Flag 解析（被动小丑置位）→ 传入 evaluateHand。
          const hm = cfg.handMods;
          const mods: HandMods = hm ? {
            fourFlush: !!hm.fourFlushFlag && getFlag(world, hm.fourFlushFlag),
            fourStraight: !!hm.fourStraightFlag && getFlag(world, hm.fourStraightFlag),
            gappedStraight: !!hm.gappedStraightFlag && getFlag(world, hm.gappedStraightFlag),
            suitMerge: !!hm.suitMergeFlag && getFlag(world, hm.suitMergeFlag),
          } : {};
          const evald = evaluateHand(played.cards, mods);
          const base = cfg.rankingTable[evald.type] ?? { chips: 0, mult: 0 };
          const chipsAfter = setResourceBase(world, cfg.chipsResource, base.chips);
          const multAfter = setResourceBase(world, cfg.multResource, base.mult);
          appendScoreEvent(trace, 'base', cfg.chipsResource, 'set', base.chips, chipsAfter, evald.type);
          appendScoreEvent(trace, 'base', cfg.multResource, 'set', base.mult, multAfter, evald.type);
          if (cfg.handTypeVar) setHandTypeVar(world, cfg.handTypeVar, evald.type);
          // 派生事实（REQ-011 完善，全部可选）：包含谓词原语 + 出牌张数 → 供 condition 组合表达"含某牌型/出牌≤N"。
          if (cfg.rankMaxCountResource) setResourceBase(world, cfg.rankMaxCountResource, rankMaxCount(evald.rankCounts));
          if (cfg.pairCountResource) setResourceBase(world, cfg.pairCountResource, pairCount(evald.rankCounts));
          if (cfg.isStraightFlag) setFlag(world, cfg.isStraightFlag, evald.isStraight);
          if (cfg.isFlushFlag) setFlag(world, cfg.isFlushFlag, evald.isFlush);
          if (cfg.handSizeResource) setResourceBase(world, cfg.handSizeResource, played.cards.length);
        }
      },
    },
  ],
});
