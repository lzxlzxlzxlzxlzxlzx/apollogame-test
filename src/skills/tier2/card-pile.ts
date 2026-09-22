import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { CardPile, PlayedHand, Flag, InputQueue, Card, Resource, Signal } from '@engine/protocol/components.js';
import { decodeCard } from './card-play.js';
import { findByComponentId } from '@engine/core/query.js';
import { clamp } from '@engine/math/scalar.js';

// ═══════════════════════════════════════════════════════════════
//  card-pile —— 牌库/手牌的 sim 内确定性管理（REQ-017 真引擎缺口；卡牌品类 staple）。
//
//  让"发牌→选牌→出/弃→补牌"全进 sim（不再活在 React），是「回合流程下沉数据状态机」+ lockstep 联机的共同前置：
//  牌库是数据(预洗好的牌码数组)→两端同序、出牌经命令流(按手牌下标)→收齐再 tick→双端同 hash。
//
//  系统 card-pile（Update，runsBefore poker-eval/card-score-pass）：
//    ① 处理输入（InputQueue 的 {key:'play'|'discard', source, values:[手牌下标]}，按 owner 路由）：
//       play    → 选中手牌 → 写 owner 牌桌的 PlayedHand.cards + 从 hand 移除 + 置 scoring Flag(owner)。
//       discard → 选中手牌从 hand 移除（不计分、不出牌；弃牌额度由回合 FSM 的 effect 扣，card-pile 只管牌）。
//       reset-then-apply：本拍没 play 的 owner → 清空其 PlayedHand + 灭 scoring Flag（1 拍脉冲，同 card-play）。
//    ② 抽牌补手：每个 CardPile 从 deck front 抽到 hand 达 handSize（deck 空则止）。
//  确定性：下标升序选牌、deck 顺序抽、纯整数解码；多 owner 各填各的，无遍历序依赖。
//
//  与 card-play 的分工：card-play=直接喂牌码、无牌库（coop 直注/测试）；card-pile=带牌库的完整出牌管理（下标选牌+补牌）。
//  （二者同属卡牌包，重叠面待 rule-of-three 复核，见 tier3-skill-governance.md。）
// ═══════════════════════════════════════════════════════════════

const PLAY = 'play';
const DISCARD = 'discard';

// 取本 tick 各 source 的 play/discard 下标。
function collect(world: IWorld): { plays: Map<string, number[]>; discards: Map<string, number[]> } {
  const plays = new Map<string, number[]>();
  const discards = new Map<string, number[]>();
  for (const [qid] of world.query('InputQueue')) {
    const q = world.getComponent<InputQueue>(qid, 'InputQueue');
    if (!q) continue;
    for (const a of q.actions) {
      if (a.key === PLAY) plays.set(a.source, [...(a.values ?? [])]);
      else if (a.key === DISCARD) discards.set(a.source, [...(a.values ?? [])]);
    }
  }
  return { plays, discards };
}

// 从 hand 取出下标集（升序，确定性）→ 返回 {取出的牌码, 剩余 hand}。越界下标忽略。
function takeFromHand(hand: number[], idxRaw: readonly number[]): { taken: number[]; rest: number[] } {
  const idx = [...new Set(idxRaw)].filter((i) => i >= 0 && i < hand.length).sort((a, b) => a - b);
  const pick = new Set(idx);
  const taken = idx.map((i) => hand[i]);
  const rest = hand.filter((_, i) => !pick.has(i));
  return { taken, rest };
}

export const cardPileCapability = defineCapability({
  id: 't2-card-pile',
  version: '1.0.0',

  describe: {
    name: 'card-pile',
    summary: '牌库/手牌 sim 内确定性管理：处理 play/discard 输入（按手牌下标选牌→PlayedHand/移除）+ 抽牌补手到 handSize。让发牌→选→出/弃→补全进 sim，支撑回合流程数据状态机化 + lockstep 联机。',
    semantic: ['tier2', 'cards', 'input', 'multiplayer'],
    whenToUse:
      '卡牌游戏要把牌库/手牌放进 sim（确定性发牌、可 lockstep、回合流程数据化）时。给牌桌挂 CardPile{owner,deck(预洗牌码),hand:[],handSize} + 同实体 PlayedHand{owner} + Flag{id:owner}；输入发 {source:owner,key:"play"/"discard",values:[手牌下标]}。',
    examples: [
      '发牌：CardPile{owner:"p1",deck:[seeded 洗好的 52 张牌码],hand:[],handSize:8} → 首 tick 自动抽 8 张到 hand',
      '出牌：Command.actions=[{source:"p1",key:"play",values:[0,2,4]}] → 手牌第 0/2/4 张 → PlayedHand + 从 hand 移除 + Flag(p1)=true → 次 tick 补牌',
      '弃牌：{source:"p1",key:"discard",values:[1,3]} → 移除手牌第 1/3 张（补牌）；弃牌额度由回合 FSM 的 effect 扣',
    ],
  },

  components: {
    provides: {
      CardPile: {
        category: 'config',
        describe: '牌库+手牌（sim 内确定性管理）。deck 预洗好的牌码堆，hand 当前手牌，handSize 目标手牌数。',
        fields: {
          owner: { type: 'string', describe: '归属玩家 id（输入路由 + scoring Flag id）' },
          deck: { type: 'string', describe: '抽牌堆牌码数组 number[]（suit*100+rank，预洗好，front=下一张）' },
          hand: { type: 'string', describe: '当前手牌牌码数组 number[]（card-pile 维护）' },
          handSize: { type: 'number', describe: '目标手牌数（抽牌补到这个数）' },
        },
      },
    },
    reads: ['CardPile', 'InputQueue', 'PlayedHand', 'Flag', 'Resource', 'Signal'],
    writes: ['CardPile', 'PlayedHand', 'Flag', 'Resource'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'card-pile',
      phase: SystemPhase.Update,
      // REQ-F-040：A1/A2 让本系统 RMW Resource（扣代价/写牌码）→ 与 flow/zone-occupancy/group-count/
      // self-rule/resource-apply 的互 RMW 伪环按「输入先行」纪律一次钉死（含今天就潜伏的 flow↔card-pile
      // Flag 互锁——E-1 接入必踩，预排雷）。玩家输入应用 → 各方再据本拍事实反应（计数/相位/结算/自治）。
      // REQ-F-041：读 Signal（refreshOnSignal）→ 与 event-when（读 Flag 写 Signal）互锁，且 clickable
      // 自带 runsAfter:['event-when']（先清后标）——cp→ew→clickable→(Signal)→cp 三元环。补 'event-when'
      // 'clickable' 维持输入先行：刷新读到的是上一拍信号（prep/点击级操作，16ms 不可感知）。
      // 'keybind'（clickable 的非空间孪生，同样 写 Signal + runsAfter event-when）同理补入——任何
      // card-pile+keybind 并存的游戏都需此对称边（GameShell 按钮经 keybind 产信号时必踩，2026-06-14）。
      runsBefore: ['poker-eval', 'card-score-pass', 'flow', 'zone-occupancy', 'group-count', 'self-rule', 'resource-apply', 'event-when', 'clickable', 'keybind'],
      reads: ['CardPile', 'InputQueue', 'PlayedHand', 'Flag', 'Resource', 'Signal'],
      writes: ['CardPile', 'PlayedHand', 'Flag', 'Resource'],
      consumes: [],
      execute(world: IWorld) {
        const { plays, discards } = collect(world);
        const resBy = (id: string): Resource | undefined => {
          const e = findByComponentId(world, 'Resource', 'id', id);
          return e ? world.getComponent<Resource>(e, 'Resource') : undefined;
        };
        // 本 tick 在场信号名（REQ-F-041 refreshOnSignal 用）。
        const sigNames = new Set<string>();
        for (const [sid] of world.query('Signal')) {
          const sg = world.getComponent<Signal>(sid, 'Signal');
          if (sg) sigNames.add(sg.name);
        }
        for (const [eid] of world.query('CardPile')) {
          const pile = world.getComponent<CardPile>(eid, 'CardPile')!;
          const owner = pile.owner;
          // REQ-F-041(A)→REQ-F-054 修订：信号刷新——旧手牌**回袋底**再按 handSize 补满（卡池守恒：
          // 没被买走的牌归还公共池=TFT 语义；旧实现直接丢弃 → 有限袋只出不进，连刷数次商店即空，
          // 用户实测「人物越刷越少最后没了」）。弃/补皆既有内功，只改弃牌去向。
          // 同拍撞上 play/discard 输入 → 退化输入，本拍忽略（刷新优先，下标语义已失效；确定性明确）。
          const refreshed = !!(pile.refreshOnSignal && sigNames.has(pile.refreshOnSignal));
          if (refreshed) {
            for (const c of pile.hand) pile.deck.push(c);
            pile.hand = [];
          }
          // ① 输入：play / discard（按 owner；刷新拍忽略）。
          let playIdx = owner && !refreshed ? plays.get(owner) : undefined;
          const discardIdx = owner && !refreshed ? discards.get(owner) : undefined;
          // REQ-F-042(B)：信号出牌——第 i 个名字在场 = play(i)。每拍至多一个（最低下标优先，
          // 同拍双击=退化输入）；InputQueue 的 play 优先于信号 play（两路同拍以显式输入为准）。
          if (!refreshed && !playIdx && pile.playOnSignals?.length) {
            for (let i = 0; i < pile.playOnSignals.length; i++) {
              if (pile.playOnSignals[i] && sigNames.has(pile.playOnSignals[i])) { playIdx = [i]; break; }
            }
          }
          const ph = world.getComponent<PlayedHand>(eid, 'PlayedHand'); // 出牌区在同实体
          // REQ-F-040(A2) 可负担门：全部代价付得起才执行 play；付不起=本拍视同没出牌（牌不丢、区清空、Flag 灭）。
          let playAccepted = playIdx !== undefined;
          if (playAccepted && pile.playCosts?.length) {
            for (const c of pile.playCosts) {
              const r = resBy(c.id);
              if (!r || r.current < c.amount) { playAccepted = false; break; }
            }
          }
          if (playAccepted && playIdx) {
            // 先算实取再扣费：takeFromHand 会过滤越界下标，故 playIdx=[] 或全部越界时 taken 为空。
            // 旧实现先扣费后取牌 → **空出牌变成"无本万利的空成交"**：代价照扣、出牌区置空、
            // scoring Flag 照脉冲触发整条计分链，可一张牌都没出（engine-review-2026-08-04 §3.3 · P1）。
            // 按本文件既有「付不起=本拍视同没出牌（牌不丢·区清空·Flag 灭）」的同一口径处理。
            const { taken, rest } = takeFromHand(pile.hand, playIdx);
            if (taken.length === 0) {
              playAccepted = false; // 落到下方 Flag 不脉冲；出牌区在此清空
              if (ph) ph.cards = [];
            } else {
              if (pile.playCosts?.length) {
                for (const c of pile.playCosts) {
                  const r = resBy(c.id)!;
                  const next = r.current - c.amount;
                  r.current = next < r.min ? r.min : next; // 验过可负担，钳底仅作防御
                }
              }
              pile.hand = rest;
              if (ph) ph.cards = taken.map(decodeCard) as Card[];
              // REQ-F-040(A1)：成交拍把牌码产物化进 Resource（恰取 1 张时写；商店 handSize 语义一次一张）。
              // banded EventWhen{resource eq 码, mode:edge} 据此分发到每英雄/每卡专属信号。
              if (pile.playedCodeResource && taken.length === 1) {
                const cr = resBy(pile.playedCodeResource);
                if (cr) {
                  const v = taken[0];
                  cr.current = clamp(v, cr.min, cr.max); // 数据侧把 max 设大于最大牌码
                }
              }
            }
          } else if (ph) {
            ph.cards = []; // reset-then-apply：本拍没出牌（含付不起被拒）→ 清空出牌区
          }
          if (discardIdx) {
            const { rest } = takeFromHand(pile.hand, discardIdx);
            pile.hand = rest; // 弃牌只移除（额度由 FSM effect 扣）
          }
          // scoring Flag(owner) = 本拍是否成交出牌（1 拍脉冲，驱动计分链 score 信号；被拒不脉冲）。
          if (owner) {
            const fe = findByComponentId(world, 'Flag', 'id', owner);
            if (fe) { const f = world.getComponent<Flag>(fe, 'Flag'); if (f) f.active = playAccepted; }
          }
          // ② 抽牌补手到 handSize（deck front 抽；空则止）。
          while (pile.hand.length < pile.handSize && pile.deck.length > 0) {
            pile.hand.push(pile.deck.shift()!);
          }
          // REQ-F-048②：袋归还——returnOnSignal 在场 → 读码资源（>0）插回 deck 底部并清零（有限袋保真）。
          if (pile.returnOnSignal && pile.returnCodeResource && sigNames.has(pile.returnOnSignal)) {
            const cr = resBy(pile.returnCodeResource);
            if (cr && cr.current > 0) {
              pile.deck.push(cr.current); // 袋底（再抽轮候最末）
              cr.current = cr.min;
            }
          }
          // REQ-F-042(A)：手牌镜像——补牌后的终态逐槽写进 Resource（空槽 0），marker 链当拍见最新。
          if (pile.handCodeResources?.length) {
            for (let i = 0; i < pile.handCodeResources.length; i++) {
              const r = resBy(pile.handCodeResources[i]);
              if (r) {
                const v = i < pile.hand.length ? pile.hand[i] : 0;
                r.current = clamp(v, r.min, r.max);
              }
            }
          }
        }
      },
    },
  ],
});
