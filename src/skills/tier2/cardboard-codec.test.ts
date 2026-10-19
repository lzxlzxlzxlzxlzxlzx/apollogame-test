import { describe, it, expect } from 'vitest';
import { cardCode, codeSuit, codeRank, isJoker, buildDeck, RANK_ACE, RANK_SMALL_JOKER, RANK_BIG_JOKER } from './cardboard-codec.js';

// B-6 · 牌码单一真相：与 game-a/game-c 各自手写的 suit*100+rank 逐字同值；建堆确定顺序、张数正确。

describe('cardboard-codec', () => {
  it('编解码互逆·与手写式同值·王牌判定', () => {
    for (let suit = 0; suit <= 3; suit++) for (let rank = 2; rank <= 16; rank++) {
      const c = cardCode(suit, rank);
      expect(c).toBe(suit * 100 + rank);
      expect(codeSuit(c)).toBe(suit);
      expect(codeRank(c)).toBe(rank);
      expect(isJoker(c)).toBe(rank >= RANK_SMALL_JOKER);
    }
  });

  it('buildDeck：52 / 54 / 掼蛋 108 / 短牌 36；顺序确定；王在每副末尾', () => {
    expect(buildDeck()).toHaveLength(52);
    expect(buildDeck({ jokers: 2 })).toHaveLength(54);
    const gd = buildDeck({ decks: 2, jokers: 2 });
    expect(gd).toHaveLength(108);
    expect(gd[53]).toBe(cardCode(0, RANK_BIG_JOKER));
    expect(gd[52]).toBe(cardCode(0, RANK_SMALL_JOKER));
    expect(gd[0]).toBe(cardCode(0, 2));
    expect(gd[12]).toBe(cardCode(0, RANK_ACE));
    expect(buildDeck({ minRank: 6 })).toHaveLength(36);
    expect(buildDeck()).toEqual(buildDeck()); // 确定性
  });
});
