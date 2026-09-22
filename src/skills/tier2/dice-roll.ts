import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { DicePool, RolledDice, Signal } from '@engine/protocol/components.js';
import { worldSeed, sortedIds } from '@engine/core/query.js';
import { rollDicePool, applyBanFilter } from './dice.js';

// ═══════════════════════════════════════════════════════════════
//  dice-roll —— 「掷一份声明好的骰池」确定性能力（REQ-GAMED #1，骰能力族 P0）。
//
//  真缺口：poker-hand 只消费已填好的 PlayedHand，random 原子只给 [0,1)/整数——没有「掷一个声明的骰池」的能力。
//  game-d《骰途》正卡在这（手写 sim + 裸 Math.random 绕种子随机）。本能力补上，且把 game-d 与 game-g 的
//  掷骰需求收敛为**同一个骰能力族**（防两次下沉出两套不协调的骰能力）：
//    · 掷骰池（面数任意）+ 锁定重掷（只重掷未锁骰）+ 结算前禁骰（禁最高/最低 n，foe 数据驱动，#4 并入本能力）。
//    · 对掷判定（game-g 战力对掷）作为同族**纯函数** opposedRoll 一并下沉（见 dice.ts；非 capability）。
//
//  分工（严守 manifesto，只补"掷声明骰池"真缺口）：
//    - 触发（哪拍掷）= Signal（clickable/event-when/keybind 重组，惯例同 caster.onSignal）。
//    - 结果→牌型/伤害 = poker-eval（element→suit,value→rank 映射）/ effect-apply（现成）。
//    - 骰面/骰池/禁骰规则 = 纯数据表（DicePool，最弱 LLM 可产）。
//  确定性：消费世界单例 RandomSeed 整数 PRNG（首个 RandomSeed 实体），同种子同序列 → lockstep/录放安全，绝不 Math.random。
//  相位：Update（早于 poker-eval 消费）；runsBefore card-score-pass 打破与其「同读改写 RandomSeed」的 RMW 伪环。
// ═══════════════════════════════════════════════════════════════

export const diceRollCapability = defineCapability({
  id: 't2-dice-roll',
  version: '1.0.0',

  describe: {
    name: 'dice-roll',
    summary:
      '掷一份声明好的骰池：收到 rollOnSignal 时，消费世界 RandomSeed 确定性掷 DicePool.dice（面数任意）→ 写 RolledDice{results}。支持锁定重掷（只重掷未锁骰）+ 结算前禁骰（禁最高/最低 n 颗，标 banned）。骰子 roguelike 底座。',
    semantic: ['tier2', 'mechanic', 'dice', 'random', 'determinism'],
    whenToUse:
      '任何"掷一把骰、留好骰重掷坏骰、按点数/元素结算"的玩法（骰子 roguelike/桌游）。挂 DicePool{dice,rollOnSignal,locked?,ban?} 于"骰盅"实体 + 世界 RandomSeed 单例；按键/点击→Signal 触发掷骰，结果 RolledDice 供 poker-eval（element→suit,value→rank 判"骰型/六色同花"）或 effect 消费。对掷（各掷战力比大小）用同族纯函数 opposedRoll（dice.ts）。',
    examples: [
      '五颗六面元素骰：DicePool{ dice:[{faces:[{value:1,element:0},{value:2,element:0},{value:3,element:0},{value:4,element:0},{value:5,element:0},{value:6,element:0}]}, ...×5], rollOnSignal:"roll" } + RandomSeed → 收到 "roll" 信号写 RolledDice{results:[{value,element,faceIndex},...]}',
      '保留好骰重掷坏骰：先掷得 RolledDice → 装配层按点数把好骰下标填进 DicePool.locked:[0,2] → 再发 "roll" → 仅下标 1/3/4 重掷、0/2 保留',
      '敌反制禁最高两颗：DicePool{ dice:[...], rollOnSignal:"roll", ban:{kind:"banHighest",n:2} } → 掷后最高 2 颗标 banned=true（不移出，消费方剔除）',
    ],
  },

  components: {
    provides: {
      DicePool: {
        category: 'config',
        describe: '声明一份骰池 + 触发/锁定/禁骰规则。挂"骰盅"实体，配世界 RandomSeed 单例。',
        fields: {
          dice: { type: 'string', describe: '骰池 DieSpec[]，每颗 {faces:[{value:number, element?:number},...]}；面数任意（六面骰=6 项）。element 无约束 int（六色 0..5/百搭编码），映射 Card.suit 判同花' },
          rollOnSignal: { type: 'string', describe: '触发掷骰的信号名（clickable/event-when/keybind 产出）；缺省/无此信号=本拍不掷（确定性，绝不每帧自动掷）' },
          locked: { type: 'number[]', describe: '锁定重掷掩码：这些下标的骰不重掷、保留上次 RolledDice 对应结果（首掷无前值则照常掷）。留好骰重掷坏骰' },
          ban: { type: 'string', describe: "结算前禁骰 {kind:'banHighest'|'banLowest', n}：掷后按 value 把最高/最低 n 颗标 banned=true（不移出，保下标对齐；消费方剔除）。n≥骰数=全禁、n≤0=不禁" },
        },
      },
      RolledDice: {
        category: 'event',
        describe: '骰池掷出结果（有序，下标与 DicePool.dice 一一对齐）。由 dice-roll 系统写，早于 poker-eval/对掷消费。空=本拍未掷。',
        fields: {
          results: { type: 'string', describe: 'RolledDie[]：每颗 {value:number, element?:number, faceIndex:number, banned?:boolean}。faceIndex=命中面下标（审计/重放）；banned=被禁骰标记' },
        },
      },
    },
    reads: ['DicePool', 'Signal', 'RandomSeed', 'RolledDice'],
    writes: ['RolledDice', 'RandomSeed'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      // dice-roll：收 rollOnSignal → 掷 DicePool（锁定重掷）→ applyBanFilter → 写 RolledDice。Update 相位（早于 poker-eval）。
      // runsBefore card-score-pass：两者同读改写 RandomSeed（概率门/掷骰）→ 组件图判成 RMW 伪环，显式定序打破（与 dialogue/match3 同纪律）。
      // poker-eval 不碰 RandomSeed，runsBefore 它仅表达"掷骰先于判型"（无环）。
      id: 'dice-roll',
      phase: SystemPhase.Update,
      runsBefore: ['card-score-pass', 'poker-eval'],
      reads: ['DicePool', 'Signal', 'RandomSeed', 'RolledDice'],
      writes: ['RolledDice', 'RandomSeed'],
      consumes: [],
      execute(world: IWorld) {
        // 本拍在场信号名集合。
        const signals = new Set<string>();
        for (const [sid] of world.query('Signal')) {
          const s = world.getComponent<Signal>(sid, 'Signal');
          if (s) signals.add(s.name);
        }
        if (signals.size === 0) return;
        // 世界单例 RNG（首个 RandomSeed 实体，同 effect-apply/card-scoring 惯例）。无 RNG → 无法确定性掷 → 静默不掷（fail-closed）。
        const rng = worldSeed(world); // 黑板单例（P1b）·统一取法（B-3）
        if (!rng) return;
        // 多骰盅按实体 id 升序依次掷（共用世界 RNG，序列确定）。
        const poolIds = sortedIds(world, 'DicePool');
        for (const id of poolIds) {
          const pool = world.getComponent<DicePool>(id, 'DicePool');
          if (!pool || !pool.rollOnSignal || !signals.has(pool.rollOnSignal)) continue;
          const prev = world.getComponent<RolledDice>(id, 'RolledDice');
          const locked = new Set(pool.locked ?? []);
          const results = rollDicePool(pool.dice, locked, prev?.results, rng);
          applyBanFilter(results, pool.ban);
          if (prev) prev.results = results;
          else world.addComponent(id, { type: 'RolledDice', results } as RolledDice);
        }
      },
    },
  ],
});
