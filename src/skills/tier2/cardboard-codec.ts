// ═══════════════════════════════════════════════════════════════
//  cardboard-codec —— 牌码编解码 + 建牌堆（纯函数·非 capability·engine-base-tier-review-2026-09-06 §3.2 B-6）
//
//  契约（card-pile / protocol Card 约定）：code = suit*100 + rank；suit ♠0 ♥1 ♦2 ♣3；rank 2..14（J11 Q12 K13 A14），
//  小王 15、大王 16（suit 0）。此前 game-a `rules.ts:17` 与 game-c `holdem-eval.ts:90` **独立写出逐字相同**的
//  `suit * 100 + rank`，game-b/e/g 各一套变体，而 t2-card-pile 只定契约不给 encode/decode/建堆 → 收敛于此单一真相。
//  零随机（洗牌走 atoms/random 的 seededShuffle）·零 IO·确定性。
// ═══════════════════════════════════════════════════════════════

export const SUIT_SPADE = 0;
export const SUIT_HEART = 1;
export const SUIT_DIAMOND = 2;
export const SUIT_CLUB = 3;
export const RANK_JACK = 11;
export const RANK_QUEEN = 12;
export const RANK_KING = 13;
export const RANK_ACE = 14;
export const RANK_SMALL_JOKER = 15;
export const RANK_BIG_JOKER = 16;

/** (suit, rank) → 牌码。 */
export const cardCode = (suit: number, rank: number): number => suit * 100 + rank;
/** 牌码 → suit。 */
export const codeSuit = (code: number): number => Math.floor(code / 100);
/** 牌码 → rank。 */
export const codeRank = (code: number): number => code % 100;
/** 是否王牌（rank ≥ 小王）。 */
export const isJoker = (code: number): boolean => codeRank(code) >= RANK_SMALL_JOKER;

export interface DeckSpec {
  /** 几副（缺省 1）。 */
  decks?: number;
  /** 每副带几张王（0 / 1 = 只小王 / 2 = 小王 + 大王·缺省 0）。 */
  jokers?: 0 | 1 | 2;
  /** 最低 rank（缺省 2；短牌德州 6+ 填 6）。 */
  minRank?: number;
}

/**
 * 建标准牌堆（未洗·确定顺序：按副 → suit ♠♥♦♣ → rank 升序，王排在每副末尾）。
 * 52 张 = buildDeck()；掼蛋 108 张 = buildDeck({ decks: 2, jokers: 2 })。
 */
export function buildDeck(spec: DeckSpec = {}): number[] {
  const decks = spec.decks ?? 1;
  const jokers = spec.jokers ?? 0;
  const minRank = spec.minRank ?? 2;
  const out: number[] = [];
  for (let d = 0; d < decks; d++) {
    for (let suit = SUIT_SPADE; suit <= SUIT_CLUB; suit++) {
      for (let rank = minRank; rank <= RANK_ACE; rank++) out.push(cardCode(suit, rank));
    }
    if (jokers >= 1) out.push(cardCode(0, RANK_SMALL_JOKER));
    if (jokers >= 2) out.push(cardCode(0, RANK_BIG_JOKER));
  }
  return out;
}
