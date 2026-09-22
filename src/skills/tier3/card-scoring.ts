import { defineCapability } from '@engine/core/define-capability.js';
import { worldSeed } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Card, PlayedHand, HeldHand, PerCardScore, PerCardRule, PerCardRetrigger, PerCardWhen, Resource, RandomSeed } from '@engine/protocol/components.js';
import { scoringCardIndices } from './poker-hand.js';
import { chancePass } from '@atom-skills/index.js';
import { findScoreTrace, appendScoreEvent } from '../score-trace.js';
import { clamp } from '@engine/math/scalar.js';

// ═══════════════════════════════════════════════════════════════
//  card-scoring —— 「逐张计分 pass」（REQ-014；Tier3「算法/解释器型机制」，poker-hand 的伴生件）。
//
//  poker-hand(REQ-011) 只出**牌型 + 牌型基础分**；Balatro 的另一半计分是**逐张**的：
//    chips = 牌型基础 + Σ每张牌 baseChips；逐张小丑（Greedy 每♦+3m / Scary Face 每人头+30c / Even Steven 每偶+4m）
//    在每张计分牌上触发；retrigger（Hanging Chad 首张重触发2次）让某张牌连同其上所有逐张小丑重复结算。
//
//  为什么不能用聚合计数绕过（Lead 评审结论）：retrigger 与逐张小丑是**乘性耦合**——首张♦被 Hanging Chad 重触发，
//  Greedy 在那张牌上要触发 3 次（+9m）。`count(♦)×3` 这种聚合丢了位置身份，永远表达不了。故逐张迭代是正确抽象。
//
//  分工（严守 manifesto）：迭代有序卡集 = 引擎算法（本能力）；"哪种牌触发、加多少、谁重触发" = 纯数据
//  （PerCardRule / PerCardRetrigger，每张小丑一个实体，与 effect-apply 的 Effect 同构）。引擎不写死任何 Balatro
//  常量——人头/偶/奇都用 PerCardWhen 的 rankIn[...] 数据表达。
//
//  幂等：与 poker-eval 同 tick（Update），runsAfter:['poker-eval'] → 在 poker-eval **set** 的牌型基础分之上 **add**。
//  poker-eval 每 tick 重 set 基础分 → 本 pass 每 tick 重 add → 多 tick 持平（与现有链一致）。
//  确定性：卡序由 PlayedHand.cards 决定；规则/重触发按实体 id 排序结算（与 effect-apply 的 eid tie-break 一致）；
//  纯整数/IEEE 加乘，不碰浮点超越函数 → lockstep/录放安全。
// ═══════════════════════════════════════════════════════════════

// ── 纯逻辑：对"当前计分牌"求值谓词（导出供单测；确定性，无副作用）──────────────
export function matchPerCardWhen(when: PerCardWhen, card: Card, index: number): boolean {
  switch (when.kind) {
    case 'always':
      return true;
    case 'suit':
      return card.suit === when.suit;
    case 'rankIn':
      return when.ranks.includes(card.rank);
    case 'index':
      return index === when.eq;
    case 'and':
      return when.of.every((w) => matchPerCardWhen(w, card, index));
    case 'or':
      return when.of.some((w) => matchPerCardWhen(w, card, index));
    case 'not':
      return !matchPerCardWhen(when.of, card, index);
  }
}

// ── 副作用 helper：按 id 改 Resource.current（钳 [min,max]）。用预建 lookup 避免逐次全表扫描。返回钳后值（供 REQ-019 trace）。──
function applyToResource(lookup: (id: string) => Resource | undefined, id: string, op: 'add' | 'mul', value: number): number | undefined {
  const r = lookup(id);
  if (!r) return undefined;
  const next = op === 'mul' ? r.current * value : r.current + value;
  r.current = clamp(next, r.min, r.max);
  return r.current;
}

export const cardScoringCapability = defineCapability({
  id: 't3-card-scoring',
  version: '1.0.0',

  describe: {
    name: 'card-scoring',
    summary:
      '逐张计分 pass：按序遍历 PlayedHand.cards，对每张（含 retrigger 重复）累加 baseChips + 套用牌自带内禀修正（Card.mods 附魔/版式）+ 触发命中该牌的逐张规则（PerCardRule，改 chips/mult）。poker-hand 的伴生件，补 Balatro「逐张/retrigger/附魔」缺口。',
    semantic: ['tier3', 'mechanic', 'cards', 'poker', 'algorithm'],
    whenToUse:
      'Balatro 式逐张小丑（每♦+mult、每人头+chips、首张重触发…）与逐张 baseChips 累加。挂 PerCardScore{chipsResource,baseChipsByRank} 于牌桌实体（与 PlayedHand 同实体）；逐张小丑=PerCardRule 实体、重触发=PerCardRetrigger 实体。聚合计数表达不了 retrigger 时用它。',
    examples: [
      '逐张 baseChips：PerCardScore{ chipsResource:"chips", baseChipsByRank:{ "2":2,...,"10":10,"11":10,"12":10,"13":10,"14":11 } }',
      'Greedy Joker 每张♦+3 倍率：PerCardRule{ when:{kind:"suit",suit:2}, op:"add", targetResource:"mult", value:3 }',
      'Scary Face 每张人头+30 筹码：PerCardRule{ when:{kind:"rankIn",ranks:[11,12,13]}, op:"add", targetResource:"chips", value:30 }',
      'Hanging Chad 首张牌额外重触发2次：PerCardRetrigger{ when:{kind:"index",eq:0}, extra:2 }',
      '牌附魔(REQ-E-021)：foil 牌 Card{ suit, rank, mods:[{op:"add",target:"chips",value:50}] }；红蜡封 Card{ ..., retrigger:1 }（该牌连同其修正/小丑重复1次）',
    ],
  },

  components: {
    provides: {
      PerCardScore: {
        category: 'config',
        describe: '逐张计分配置（挂牌桌单例，与 PlayedHand 同实体）：逐张 baseChips 累加目标 + 点数→筹码表。',
        fields: {
          chipsResource: { type: 'string', describe: '逐张 baseChips 累加进此 Resource id（在牌型基础分之上 add）' },
          baseChipsByRank: { type: 'string', describe: '点数(字符串键)→该牌基础筹码 Record；缺键=0。纯数据，引擎不写死' },
        },
      },
      PerCardRule: {
        category: 'config',
        describe: '一条逐张小丑规则（每张小丑一个实体）：when 命中当前计分牌时按 op 改 targetResource。',
        fields: {
          when: { type: 'string', describe: 'PerCardWhen 谓词：always/suit/rankIn/index/and/or/not（对当前牌求值）' },
          op: { type: 'string', describe: "'add'(默认加) | 'mul'(乘)" },
          targetResource: { type: 'string', describe: '改哪个 Resource id（按 id 全局定位）' },
          value: { type: 'number', describe: 'add 的加量 / mul 的倍率' },
        },
      },
      PerCardRetrigger: {
        category: 'config',
        describe: '重触发规则（每个重触发小丑一个实体）：when 命中的牌额外计分 extra 次（连同其上所有 PerCardRule 重复）。',
        fields: {
          when: { type: 'string', describe: 'PerCardWhen 谓词：哪些牌重触发（如 {kind:"index",eq:0} 首张）' },
          extra: { type: 'number', describe: '额外重复次数（共 1+extra 次结算；Hanging Chad=2）' },
        },
      },
    },
    reads: ['PerCardScore', 'PlayedHand', 'HeldHand', 'PerCardRule', 'PerCardRetrigger', 'Resource', 'RandomSeed'],
    writes: ['Resource', 'RandomSeed'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      // card-score-pass：逐张遍历 → 累加 baseChips + 触发逐张规则（含 retrigger 重复）。
      // 定序：runsAfter poker-eval（在牌型基础分 set 之后 add，幂等）；runsBefore resource-apply/string-apply（同读写 Resource 于 Update）。
      // 早于 effect-apply(Commit)，故逐张 +mult 在 hand-level ×mult 小丑之前结算（与 Balatro：逐张计分先于独立小丑 一致）。
      id: 'card-score-pass',
      phase: SystemPhase.Update,
      runsAfter: ['poker-eval'],
      runsBefore: ['resource-apply', 'string-apply'],
      reads: ['PerCardScore', 'PlayedHand', 'HeldHand', 'PerCardRule', 'PerCardRetrigger', 'Resource', 'RandomSeed'],
      writes: ['Resource', 'RandomSeed'],
      consumes: [],
      execute(world: IWorld) {
        // Resource id → 组件：走 World.byId 索引（B-3）。注意：旧懒建 Map 是「后写者胜」，索引是「创建序首个」——
        // 与 resource-apply / buildIdLookup / 全库其它 5 处的全局路由口径对齐；同 id 多份 Resource 本就是数据错。
        const resById = (id: string): Resource | undefined => { const e = world.byId('Resource', 'id', id); return e === undefined ? undefined : world.getComponent<Resource>(e, 'Resource'); };

        // 收集逐张规则 / 重触发，按实体 id 升序（确定性结算序，与 effect-apply 的 eid tie-break 一致）。
        const rules: Array<{ eid: string; rule: PerCardRule }> = [];
        for (const [eid] of world.query('PerCardRule')) {
          const rule = world.getComponent<PerCardRule>(eid, 'PerCardRule');
          if (rule) rules.push({ eid, rule });
        }
        rules.sort((a, b) => (a.eid < b.eid ? -1 : a.eid > b.eid ? 1 : 0));

        const retriggers: PerCardRetrigger[] = [];
        for (const [eid] of world.query('PerCardRetrigger')) {
          const rt = world.getComponent<PerCardRetrigger>(eid, 'PerCardRetrigger');
          if (rt) retriggers.push(rt);
        }

        const trace = findScoreTrace(world); // REQ-019：poker-eval 已清空，这里只 append（opt-in：无则 no-op）
        const rng = worldSeed(world); // REQ-E-023②：per-card 概率门用世界 RNG（逐张独立 roll，如 Bloodstone 每张♥ 1/2）·黑板单例·统一取法（B-3）
        for (const [eid] of world.query('PerCardScore', 'PlayedHand')) {
          const cfg = world.getComponent<PerCardScore>(eid, 'PerCardScore')!;
          const played = world.getComponent<PlayedHand>(eid, 'PlayedHand')!;
          if (played.cards.length === 0) continue; // 无出牌 → 不结算（与 poker-eval 一致）

          // BUG-001 修复：只遍历**计分牌**（构成牌型的牌；垫牌 kicker 不计分），按计分序重排下标。
          // index = 计分序位置（非原始出牌位置）→ "首张计分牌"(Hanging Chad)/逐张小丑都对齐 Balatro 语义。
          const scoringIdx = scoringCardIndices(played.cards);
          for (let pos = 0; pos < scoringIdx.length; pos++) {
            const c = played.cards[scoringIdx[pos]];
            const src = `card:${scoringIdx[pos]}`; // REQ-019：UI 据此高亮该牌（原始出牌下标）
            // 本张计分次数 = 1 + Σ 命中该牌的 retrigger.extra。
            let repeats = 1 + (c.retrigger ?? 0); // REQ-E-021：牌自带重触发（红蜡封）+ 外部 retrigger 小丑
            for (const rt of retriggers) if (matchPerCardWhen(rt.when, c, pos)) repeats += rt.extra;
            const baseChips = cfg.baseChipsByRank[String(c.rank)] ?? 0;

            for (let r = 0; r < repeats; r++) {
              if (baseChips !== 0) {
                const after = applyToResource(resById, cfg.chipsResource, 'add', baseChips);
                if (after !== undefined) appendScoreEvent(trace, 'percard', cfg.chipsResource, 'add', baseChips, after, src);
              }
              // REQ-E-021：牌的内禀修正（附魔/版式/增强）按序套用——在 baseChips 之后、外部小丑(PerCardRule)之前（同 Balatro：牌自身先于小丑）。
              if (c.mods) {
                for (const m of c.mods) {
                  if (m.held) continue; // REQ-E-023③：留手 mod（Steel 等）归 held-card-score pass，出牌 pass 跳过
                  const after = applyToResource(resById, m.target, m.op, m.value);
                  if (after !== undefined) appendScoreEvent(trace, 'percard-mod', m.target, m.op, m.value, after, src);
                }
              }
              for (const { eid: ruleEid, rule } of rules) {
                // REQ-E-023②：概率小丑（Bloodstone 等）—— when 命中后再掷世界 RNG 才施用（逐张独立 roll，确定）。
                if (!rule.held && matchPerCardWhen(rule.when, c, pos) && (!rule.chance || chancePass(rng, rule.chance.num, rule.chance.den))) {
                  const after = applyToResource(resById, rule.targetResource, rule.op ?? 'add', rule.value);
                  if (after !== undefined) appendScoreEvent(trace, 'percard-rule', rule.targetResource, rule.op ?? 'add', rule.value, after, ruleEid);
                }
              }
            }
          }
        }

        // REQ-E-023③：留手牌结算（同 card-score-pass 内、紧接出牌之后；复用 lookup/rules/rng/trace，零新调度边）。
        // 出牌 pass 只遍历出的牌，留手牌（手里没出的）走 HeldHand：套 held 标记的 mods（Steel ×1.5）+ held 规则（Baron 等）。
        for (const [hid] of world.query('HeldHand')) {
          const held = world.getComponent<HeldHand>(hid, 'HeldHand');
          if (!held || held.cards.length === 0) continue;
          held.cards.forEach((c, pos) => {
            if (c.mods) for (const m of c.mods) {
              if (!m.held) continue; // 只 held mod
              const after = applyToResource(resById, m.target, m.op, m.value);
              if (after !== undefined) appendScoreEvent(trace, 'held-mod', m.target, m.op, m.value, after, `held:${pos}`);
            }
            for (const { eid: ruleEid, rule } of rules) {
              if (rule.held && matchPerCardWhen(rule.when, c, pos) && (!rule.chance || chancePass(rng, rule.chance.num, rule.chance.den))) {
                const after = applyToResource(resById, rule.targetResource, rule.op ?? 'add', rule.value);
                if (after !== undefined) appendScoreEvent(trace, 'held-rule', rule.targetResource, rule.op ?? 'add', rule.value, after, ruleEid);
              }
            }
          });
        }
      },
    },
  ],
});
