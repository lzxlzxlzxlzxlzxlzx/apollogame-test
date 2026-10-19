import { describe, it, expect } from 'vitest';
import type { Card } from '@engine/protocol/components.js';
import {
  matchPattern, beats, legalResponses, effRank, resolveTier, compareMatches,
  type HandPatternConfig, type HandFamily, type PatternMatch,
} from './hand-pattern.js';

// ═══════════════════════════════════════════════════════════════
//  掼蛋（淮安标准）conformance —— config 只是 fixture（能力本身游戏无关）。
//  真相基线：docs/design/game-a/brief.md §4。
//  牌速记 c(suit, rank)。花色：♠=0 ♥=1 ♦=2 ♣=3；rank 2..14(A=14)；小王=15 大王=16。
//  打级=5 → 5 是级牌（eff 15，仅次于王）；红桃5 = 逢人配（wild）。
// ═══════════════════════════════════════════════════════════════
const c = (suit: number, rank: number): Card => ({ suit, rank });
const S = 0, H = 1, D = 2, C = 3, SJ = 15, BJ = 16;
const W = (): Card => c(H, 5); // 红桃5 = 逢人配

const GUANDAN: HandPatternConfig = {
  levelRank: 5,
  jokerRanks: [15, 16],
  wild: { suit: 1, rank: 5 },
  families: [
    { name: 'single', kind: 'ntuple', composition: [1], tier: 0 },
    { name: 'pair', kind: 'ntuple', composition: [2], tier: 0 },
    { name: 'triple', kind: 'ntuple', composition: [3], tier: 0 },
    { name: 'full', kind: 'ntuple', composition: [3, 2], tier: 0 }, // 三带二
    { name: 'straight', kind: 'sequence', runLen: 5, tier: 0 },
    { name: 'tube', kind: 'tuple-sequence', groupSize: 2, runLen: 3, tier: 0 }, // 三连对/木板
    { name: 'plate', kind: 'tuple-sequence', groupSize: 3, runLen: 2, tier: 0 }, // 钢板/二连三
    { name: 'bomb', kind: 'ntuple', n: { min: 4, max: 10 }, tier: { byLength: { 4: 1, 5: 2, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8 } }, compare: 'byLenThenRank' },
    { name: 'straight-flush', kind: 'flush-sequence', runLen: 5, suited: true, tier: 3 },
    { name: 'sky', kind: 'fixed-set', cards: [{ rank: 15, count: 2 }, { rank: 16, count: 2 }], tier: 9 },
  ],
};

const mp = (cards: Card[]): PatternMatch | null => matchPattern(cards, GUANDAN);
const fam = (cards: Card[]): string | null => mp(cards)?.family ?? null;

// ── 级牌重映射 + tier 表（纯 helper 单测）──────────────────────────────────
describe('hand-pattern — effRank 级牌重映射 / resolveTier 阶表', () => {
  it('普通点数 eff=自然值', () => { expect(effRank(7, GUANDAN)).toBe(7); expect(effRank(14, GUANDAN)).toBe(14); });
  it('级牌抬到 A 之上、小王之下', () => expect(effRank(5, GUANDAN)).toBe(15));
  it('王最高：小王 < 大王', () => { expect(effRank(SJ, GUANDAN)).toBe(16); expect(effRank(BJ, GUANDAN)).toBe(17); });
  it('resolveTier：普通型 0 / 炸弹按长度 / 天王 9', () => {
    const bomb = GUANDAN.families.find((f) => f.name === 'bomb')!;
    expect(resolveTier(bomb, 4)).toBe(1);
    expect(resolveTier(bomb, 6)).toBe(4);
    expect(resolveTier(GUANDAN.families.find((f) => f.name === 'straight')!, 5)).toBe(0);
    expect(resolveTier(GUANDAN.families.find((f) => f.name === 'sky')!, 4)).toBe(9);
  });
});

// ── 逐族判型 ──────────────────────────────────────────────────────────────
describe('hand-pattern — 逐族判型 matchPattern', () => {
  it('单张（普通 / 级牌 / 王）', () => {
    expect(mp([c(S, 7)])).toMatchObject({ family: 'single', rank: 7, length: 1 });
    expect(mp([c(S, 5)])).toMatchObject({ family: 'single', rank: 15 }); // 黑桃5=级牌单
    expect(mp([c(S, BJ)])).toMatchObject({ family: 'single', rank: 17 }); // 大王最高单
  });
  it('对子 / 三同张', () => {
    expect(mp([c(S, 7), c(D, 7)])).toMatchObject({ family: 'pair', rank: 7, length: 2 });
    expect(mp([c(S, 8), c(D, 8), c(C, 8)])).toMatchObject({ family: 'triple', rank: 8, length: 3 });
  });
  it('三带二（比较键=三张 rank）', () => {
    expect(mp([c(S, 8), c(D, 8), c(C, 8), c(S, 4), c(D, 4)])).toMatchObject({ family: 'full', rank: 8, length: 5 });
    expect(mp([c(S, 4), c(D, 4), c(C, 4), c(S, 8), c(D, 8)])).toMatchObject({ family: 'full', rank: 4 });
  });
  it('顺子（中段 / A 高 / A 低轮子）', () => {
    expect(mp([c(S, 3), c(D, 4), c(C, 5), c(S, 6), c(H, 7)])).toMatchObject({ family: 'straight', rank: 7 });
    expect(mp([c(S, 10), c(D, 11), c(C, 12), c(S, 13), c(D, 14)])).toMatchObject({ family: 'straight', rank: 14 });
    expect(mp([c(S, 14), c(D, 2), c(C, 3), c(S, 4), c(D, 6)])).toBeNull(); // 2-3-4-?-6 断档非顺
    expect(mp([c(S, 14), c(D, 2), c(C, 3), c(S, 4), c(D, 5)])).toMatchObject({ family: 'straight', rank: 5 });
  });
  it('三连对（木板）/ 钢板（二连三）', () => {
    expect(mp([c(S, 7), c(D, 7), c(S, 8), c(D, 8), c(S, 9), c(D, 9)])).toMatchObject({ family: 'tube', rank: 9, length: 6 });
    expect(mp([c(S, 7), c(D, 7), c(C, 7), c(S, 8), c(D, 8), c(C, 8)])).toMatchObject({ family: 'plate', rank: 8, length: 6 });
  });
  it('炸弹族（4..10 张·阶随长度）', () => {
    expect(mp([c(S, 9), c(H, 9), c(D, 9), c(C, 9)])).toMatchObject({ family: 'bomb', rank: 9, length: 4, tier: 1 });
    expect(mp([c(S, 9), c(H, 9), c(D, 9), c(C, 9), c(S, 9)])).toMatchObject({ family: 'bomb', length: 5, tier: 2 });
    expect(mp([c(S, 9), c(H, 9), c(D, 9), c(C, 9), c(S, 9), c(H, 9)])).toMatchObject({ family: 'bomb', length: 6, tier: 4 });
  });
  it('同花顺（优先于顺子——tier 更高）', () => {
    const m = mp([c(H, 6), c(H, 7), c(H, 8), c(H, 9), c(H, 10)]);
    expect(m).toMatchObject({ family: 'straight-flush', rank: 10, tier: 3 });
  });
  it('四大天王（2 小王 + 2 大王）', () => {
    expect(mp([c(S, SJ), c(D, SJ), c(S, BJ), c(D, BJ)])).toMatchObject({ family: 'sky', tier: 9, length: 4 });
  });
  it('非法牌型 → null（散牌 / 断顺 / 混合张）', () => {
    expect(mp([c(S, 7), c(D, 8)])).toBeNull();
    expect(mp([c(S, 7), c(D, 8), c(C, 9)])).toBeNull();
  });
});

// ── 压制矩阵 beats ────────────────────────────────────────────────────────
describe('hand-pattern — 压制矩阵 beats', () => {
  const pair = (r: number): Card[] => [c(S, r), c(D, r)];
  const bomb = (r: number, len: number): Card[] => Array.from({ length: len }, (_, i) => c(i % 4, r));

  it('同族同长比大：对子 / 顺子', () => {
    expect(beats(pair(9), pair(7), GUANDAN)).toBe(true);
    expect(beats(pair(7), pair(9), GUANDAN)).toBe(false);
    expect(beats(pair(9), pair(9), GUANDAN)).toBe(false); // 相等不可压
  });
  it('普通型跨族不可压（对子压不了单张 / 三带二压不了三同张）', () => {
    expect(beats(pair(9), [c(S, 14)], GUANDAN)).toBe(false);
    expect(beats([c(S, 8), c(D, 8), c(C, 8), c(S, 4), c(D, 4)], [c(S, 9), c(D, 9), c(C, 9)], GUANDAN)).toBe(false);
  });
  it('炸弹压普通型；普通型压不了炸弹', () => {
    const straight = [c(S, 3), c(D, 4), c(C, 5), c(S, 6), c(H, 7)];
    expect(beats(bomb(6, 4), straight, GUANDAN)).toBe(true);
    expect(beats(straight, bomb(6, 4), GUANDAN)).toBe(false);
  });
  it('炸弹族阶梯：长炸压短炸；同长比 rank', () => {
    expect(beats(bomb(6, 5), bomb(13, 4), GUANDAN)).toBe(true); // 5 张炸 > 4 张炸（长度阶更高，rank 反而更小也赢）
    expect(beats(bomb(13, 4), bomb(6, 4), GUANDAN)).toBe(true); // 同长 K 炸 > 6 炸
    expect(beats(bomb(6, 4), bomb(13, 4), GUANDAN)).toBe(false);
  });
  it('同花顺夹在 5 炸与 6 炸之间', () => {
    const sf = [c(H, 6), c(H, 7), c(H, 8), c(H, 9), c(H, 10)];
    expect(beats(sf, bomb(13, 5), GUANDAN)).toBe(true); // 同花顺 > 5 张炸
    expect(beats(bomb(13, 6), sf, GUANDAN)).toBe(true); // 6 张炸 > 同花顺
    expect(beats(sf, bomb(6, 6), GUANDAN)).toBe(false);
  });
  it('四大天王压顶（压 10 张炸）', () => {
    const sky = [c(S, SJ), c(D, SJ), c(S, BJ), c(D, BJ)];
    expect(beats(sky, bomb(13, 10), GUANDAN)).toBe(true);
    expect(beats(bomb(13, 10), sky, GUANDAN)).toBe(false);
  });
  it('级牌重映射：级牌对 > A 对；大王单 > 小王单 > 级牌单 > A 单', () => {
    expect(beats(pair(5), pair(14), GUANDAN)).toBe(true); // 级牌5对 > A对
    expect(beats([c(S, BJ)], [c(S, SJ)], GUANDAN)).toBe(true);
    expect(beats([c(S, SJ)], [c(S, 5)], GUANDAN)).toBe(true);
    expect(beats([c(S, 5)], [c(S, 14)], GUANDAN)).toBe(true);
  });
});

// ── 逢人配（红桃级牌）枚举 —— 借鉴 poker-hand wild 有界枚举，并列取枚举序首解 ──
describe('hand-pattern — 逢人配百搭枚举', () => {
  it('补对子 / 三同张 / 炸弹', () => {
    expect(mp([c(S, 7), W()])).toMatchObject({ family: 'pair', rank: 7 });
    expect(mp([c(S, 7), c(D, 7), W()])).toMatchObject({ family: 'triple', rank: 7 });
    expect(mp([c(S, 9), c(D, 9), c(C, 9), W()])).toMatchObject({ family: 'bomb', length: 4, rank: 9 });
  });
  it('补顺子（填中间缺口）', () => {
    expect(mp([c(S, 3), c(D, 4), W(), c(S, 6), c(C, 7)])).toMatchObject({ family: 'straight', rank: 7 });
  });
  it('补三连对', () => {
    expect(mp([c(S, 7), c(D, 7), c(S, 8), c(D, 8), c(S, 9), W()])).toMatchObject({ family: 'tube', rank: 9 });
  });
  it('取最强解释：两级牌 + 逢人配 → 级牌三同张（rank 15）', () => {
    expect(mp([c(S, 5), c(D, 5), W()])).toMatchObject({ family: 'triple', rank: 15 });
  });
  it('逢人配不得当王：2 小王 + 1 大王 + 逢人配 ≠ 四大天王', () => {
    expect(mp([c(S, SJ), c(D, SJ), c(S, BJ), W()])).toBeNull();
    expect(mp([c(S, BJ), W()])).toBeNull(); // 逢人配也凑不出「对大王」
  });
});

// ── 合法应对枚举 legalResponses（首个=最小合法压牌·确定性）──────────────────
describe('hand-pattern — 合法应对枚举 legalResponses', () => {
  it('压对子：升序·首个=最小合法压牌（对 8）·含炸弹兜底', () => {
    const hand = [c(S, 8), c(D, 8), c(S, 9), c(H, 9), c(D, 9), c(C, 9)];
    const rs = legalResponses(hand, [c(S, 7), c(D, 7)], GUANDAN);
    expect(rs[0]).toMatchObject({ family: 'pair', rank: 8 }); // 最小合法压牌
    expect(rs.map((r) => `${r.family}:${r.rank}:${r.tier}`)).toEqual(['pair:8:0', 'pair:9:0', 'bomb:9:1']);
  });
  it('压炸弹：只出更高炸；首个=最小合法炸（同长高 rank 优先于更长）', () => {
    const hand = [c(S, 9), c(H, 9), c(D, 9), c(C, 9), c(S, 11), c(H, 11), c(D, 11), c(C, 11), c(S, 11)];
    const rs = legalResponses(hand, [c(S, 7), c(H, 7), c(D, 7), c(C, 7)], GUANDAN); // 目标=4 张 7 炸
    expect(rs[0]).toMatchObject({ family: 'bomb', rank: 9, length: 4 }); // 4 炸 9 = 最小
    expect(rs.every((r) => r.tier >= 1)).toBe(true); // 全是炸弹族
    expect(rs.some((r) => r.length === 5)).toBe(true); // 5 张 J 炸也在候选
  });
  it('压不了 → 空表（散牌应对对子）', () => {
    expect(legalResponses([c(S, 3), c(D, 4)], [c(S, 7), c(D, 7)], GUANDAN)).toEqual([]);
  });
  it('逢人配参与应对；排序偏好少用逢人配', () => {
    // 手里只有单 8 + 逢人配 → 能凑对 8 压对 7；逢人配用 1 张。
    const rs = legalResponses([c(S, 8), W(), c(S, 3)], [c(S, 7), c(D, 7)], GUANDAN);
    expect(rs[0]).toMatchObject({ family: 'pair', rank: 8, wildsUsed: 1 });
  });
  it('确定性：同输入两次结果逐字段一致', () => {
    const hand = [c(S, 8), c(D, 8), c(S, 9), c(H, 9), c(D, 9), c(C, 9)];
    const t = [c(S, 7), c(D, 7)];
    expect(legalResponses(hand, t, GUANDAN)).toEqual(legalResponses(hand, t, GUANDAN));
  });
  it('目标非法 / 空手牌 → 空表', () => {
    expect(legalResponses([c(S, 9), c(D, 9)], [c(S, 7), c(D, 8)], GUANDAN)).toEqual([]); // 目标非法
    expect(legalResponses([], [c(S, 7), c(D, 7)], GUANDAN)).toEqual([]);
  });
  it('自由领出（target=null）→ 钉全集（实跑取值）：单8·对8·单9，tier 升序', () => {
    const rs = legalResponses([c(S, 8), c(D, 8), c(S, 9)], null, GUANDAN);
    // 全集 golden：这手 3 张只凑得出这三种领出（无三同张/顺子/炸弹），序=实现的确定性排序。
    expect(rs.map((r) => `${r.family}:${r.rank}:${r.tier}:${r.wildsUsed}`)).toEqual([
      'single:8:0:0', 'pair:8:0:0', 'single:9:0:0',
    ]);
    for (let i = 1; i < rs.length; i++) expect(rs[i].tier).toBeGreaterThanOrEqual(rs[i - 1].tier);
  });
});

// ── legalResponses 自洽保证：legalResponses ⊆ 合法集（REQ-HANDPAT·A-008 根因回归）──
//   根因：legalResponses 曾按「家族口径」纳入候选；act/beats/legalCheck 却按 matchPattern 的
//   最强规范判读收牌。含逢人配的牌可多族判读，家族口径声称能压、规范口径却落到别的家族 → act 拒收。
describe('hand-pattern — legalResponses 规范判读自洽（REQ-HANDPAT）', () => {
  const sig = (cards: Card[]): string => cards.map((x) => `${x.suit}:${x.rank}`).sort().join(',');

  it('① A-008 实证：QQ+KK+两逢人配 应对钢板 JJJ-QQQ 不得进返回集（规范判读=三连对 Q-K-A≠钢板→act 拒）', () => {
    // 修前红：旧码按 plate 家族口径把 QQ+wild/KK+wild 判成钢板 K 顶(rank13)>目标钢板 Q(rank12) 纳入，
    // 但 matchPattern 这 6 张的最强判读=三连对(tube) Q-K-A(rank14)≠钢板 → beats=false → act 拒 → 空过。
    const target = [c(S, 11), c(D, 11), c(C, 11), c(S, 12), c(D, 12), c(C, 12)]; // 钢板 JJJ-QQQ
    const hand = [c(S, 12), c(D, 12), c(S, 13), c(D, 13), W(), W()]; // QQ + KK + 两逢人配
    expect(mp(target)).toMatchObject({ family: 'plate', rank: 12, length: 6 }); // 目标=钢板
    const rs = legalResponses(hand, target, GUANDAN);
    const ambiguous = sig([c(S, 12), c(D, 12), c(S, 13), c(D, 13), W(), W()]);
    expect(rs.some((r) => sig(r.cards) === ambiguous)).toBe(false); // 该 6 张任何判读都不得出现
    // 且给出的应对（QQ+ww / KK+ww 各成 4 炸）逐条通得过 beats 自洽（真能压钢板）。
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) expect(beats(r.cards, target, GUANDAN)).toBe(true);
  });

  it('② 不变量：∀ p∈legalResponses ⇒ act 接受（有 target→规范判读真能压；领出→规范判读成型）', () => {
    // 确定性枚举含逢人配的手牌 × 各类目标墩（无随机）；断言 legalResponses ⊆ 合法集。
    const combos: { hand: Card[]; target: Card[] | null }[] = [
      { hand: [c(S, 12), c(D, 12), c(S, 13), c(D, 13), W(), W()], target: [c(S, 11), c(D, 11), c(C, 11), c(S, 12), c(D, 12), c(C, 12)] }, // A-008 钢板
      { hand: [c(S, 12), c(D, 12), c(S, 13), c(D, 13), W(), W()], target: [c(S, 7), c(D, 7), c(S, 8), c(D, 8), c(S, 9), c(D, 9)] }, // 三连对
      { hand: [c(S, 9), c(D, 9), W(), c(S, 10), c(C, 10)], target: [c(S, 4), c(D, 5), c(C, 6), c(S, 7), c(D, 8)] }, // 顺子
      { hand: [c(S, 8), W(), c(D, 8), c(S, 8)], target: [c(S, 3), c(D, 3)] }, // 对子（手可成 8 炸/三/对）
      { hand: [c(S, 6), c(D, 6), c(C, 6), W(), W(), c(S, 7), c(D, 7)], target: [c(S, 5), c(D, 5), c(C, 5), c(H, 10), c(D, 10)] }, // 三带二
      { hand: [c(S, 9), c(H, 9), c(D, 9), W()], target: [c(S, 3), c(D, 3), c(C, 3), c(H, 3)] }, // 炸对炸
      { hand: [c(S, 12), c(D, 12), c(S, 13), c(D, 13), W(), W(), c(S, SJ), c(D, SJ)], target: null }, // 自由领出
    ];
    let checked = 0;
    for (const { hand, target } of combos) {
      const rs = legalResponses(hand, target, GUANDAN);
      for (const p of rs) {
        expect(matchPattern(p.cards, GUANDAN)).not.toBeNull(); // 规范判读成型
        if (target) expect(beats(p.cards, target, GUANDAN)).toBe(true); // 真能压 target
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0); // 非空覆盖（防不变量在空集上真空通过）
  });
});

// ── 空手牌 / 不可压边角 ────────────────────────────────────────────────────
describe('hand-pattern — 边角', () => {
  it('空手牌 matchPattern → null；beats 含空 → false', () => {
    expect(mp([])).toBeNull();
    expect(beats([], [c(S, 7)], GUANDAN)).toBe(false);
    expect(beats([c(S, 7)], [], GUANDAN)).toBe(false);
  });
  it('compareMatches byLenThenRank：先比长度（更长胜）再比 rank', () => {
    const a = { length: 5, rank: 3, compare: 'byLenThenRank' } as PatternMatch;
    const b = { length: 4, rank: 14, compare: 'byLenThenRank' } as PatternMatch;
    expect(compareMatches(a, b)).toBeGreaterThan(0); // 5>4 → a 胜（rank 更小也赢）
    const x = { length: 4, rank: 9, compare: 'byLenThenRank' } as PatternMatch;
    const y = { length: 4, rank: 6, compare: 'byLenThenRank' } as PatternMatch;
    expect(compareMatches(x, y)).toBeGreaterThan(0); // 同长比 rank
  });
});

// ── config 通用性：能力游戏无关（换级牌不改代码）──────────────────────────────
describe('hand-pattern — 能力游戏无关（config 换级牌）', () => {
  it('打 A（levelRank=14）：A 对 > K 对', () => {
    const cfg: HandPatternConfig = { ...GUANDAN, levelRank: 14, wild: { suit: 1, rank: 14 } };
    expect(beats([c(S, 14), c(D, 14)], [c(S, 13), c(D, 13)], cfg)).toBe(true);
    expect(effRank(14, cfg)).toBe(15); // A 被抬为级牌
    expect(effRank(13, cfg)).toBe(13);
  });
  it('单族极简 config：只有单张（其它牌型不识别）', () => {
    const onlySingle: HandPatternConfig = { families: [{ name: 'single', kind: 'ntuple', composition: [1], tier: 0 }] };
    expect(matchPattern([c(S, 7)], onlySingle)).toMatchObject({ family: 'single', rank: 7 });
    expect(matchPattern([c(S, 7), c(D, 7)], onlySingle)).toBeNull(); // 没声明 pair → 不识别
  });
});
