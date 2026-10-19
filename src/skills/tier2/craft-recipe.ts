import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { Signal, CraftRecipe } from '@engine/protocol/components.js';
import { buildConditionLookup } from './condition.js';
import { clamp } from '@engine/math/scalar.js';

// craft-recipe —— 经济/批量改值：信号到达且所有 costs 可负担 → 原子成交（REQ-C-003 + R14 归一）。
//
// 当本 tick 存在名为 CraftRecipe.onSignal 的 Signal 时：
//   ① 可负担检查：每项 cost 扣后仍 >= 该 Resource.min（任一不可负担 → 整单不动，原子性）。
//   ② 成交：原子地扣全部 costs + 加全部 gains（各自钳进上下限）+ 置 grantsFlag + 设 grantsState。
//
// 这覆盖两条同源需求：
//   - REQ-C-003「主动合成」：点合成→Signal→若材料够则扣多料 + 解锁对应产物（grantsFlag/grantsState）。
//   - R14「选项批量改值」：costs 留空、gains=[{好感,+5},{事业,+2}]，一个 tick 原子改多项（不必一实体多组件）。
// 它是 effect-apply.modify-resource（无条件、单项）的条件化/原子化/多项化超集。
//
// 跑在 Commit 阶段（晚于产信号的 clickable/event-when=Update），写入由下一 tick 的条件读到（一拍反馈，
// 与 effect-apply 同纪律）。多配方同 tick 触发：按实体 id 升序顺序结算（确定性；资源状态顺序反映）。
// 确定性：只读 Signal + Resource，写确定数值/布尔/状态，按 id 全局定位（复用 buildConditionLookup 索引）。
export const craftRecipeCapability = defineCapability({
  id: 't2-craft-recipe',
  version: '1.0.0',

  describe: {
    name: 'craft-recipe',
    summary: '信号到达且 costs 全部可负担时，原子扣料 + 产出 gains + 置 flag/state；不可负担则整单不动。商店/合成/建造/批量改值通用。',
    semantic: ['tier2', 'logic', 'economy', 'effect'],
    whenToUse:
      '想让一个信号触发「花费换取」或「一次改多项数值」而不写游戏代码时。挂 CraftRecipe{onSignal,costs,gains?,grantsFlag?,grantsState?}。可负担才成交=商店/合成；costs 留空=纯批量改值。',
    examples: [
      '主动合成：CraftRecipe{ onSignal:"craft_sword", costs:[{id:"iron",amount:8}], grantsFlag:"sword_unlocked" }',
      '选项批量改值：CraftRecipe{ onSignal:"choose_kind", costs:[], gains:[{id:"affection_S",amount:5},{id:"career",amount:2}] }',
      '以物易物：CraftRecipe{ onSignal:"trade", costs:[{id:"wood",amount:3}], gains:[{id:"plank",amount:1}] }',
    ],
  },

  components: {
    provides: {
      CraftRecipe: {
        category: 'config',
        describe: '声明「onSignal 在场且 costs 全可负担时，原子扣料+产出+置 flag/state」。costs/gains 为 {id,amount} 数组。',
        fields: {
          onSignal: { type: 'string', describe: '触发该配方的信号名（clickable/event-when 产出的 Signal.name）' },
          costs: { type: 'string', describe: '需扣除的资源数组 [{id,amount}]（amount>0=消耗量）；空=无成本' },
          gains: { type: 'string', describe: '成交时增加的资源数组 [{id,amount}]（可选）' },
          grantsFlag: { type: 'string', describe: '成交时置 true 的 Flag id（可选）' },
          grantsState: { type: 'string', describe: '成交时设置的 State {fsmId,value}（可选）' },
        },
      },
    },
    reads: ['CraftRecipe', 'Signal', 'Resource'],
    writes: ['Resource', 'Flag', 'State'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'craft-recipe',
      phase: SystemPhase.Commit,
      reads: ['CraftRecipe', 'Signal', 'Resource'],
      writes: ['Resource', 'Flag', 'State'],
      consumes: [],
      execute(world) {
        // 收集本 tick 在场的信号名。
        const signals = new Set<string>();
        for (const [sid] of world.query('Signal')) {
          const s = world.getComponent<Signal>(sid, 'Signal');
          if (s) signals.add(s.name);
        }
        if (signals.size === 0) return;

        const lookup = buildConditionLookup(world);
        // 确定性顺序：多配方同 tick 触发时按实体 id 升序结算（lookup 返回活引用，原地改 → 顺序可见）。
        const recipeIds = sortedIds(world, 'CraftRecipe');

        for (const eid of recipeIds) {
          const rc = world.getComponent<CraftRecipe>(eid, 'CraftRecipe');
          if (!rc || !signals.has(rc.onSignal)) continue;

          // ① 可负担检查：每项 cost 扣后仍 >= min（任一不可负担即整单放弃）。
          let affordable = true;
          for (const c of rc.costs) {
            const r = lookup.resource(c.id);
            if (!r || r.current - c.amount < r.min) {
              affordable = false;
              break;
            }
          }
          if (!affordable) continue;

          // ② 原子成交：扣 costs + 加 gains（各自钳进上下限）。
          for (const c of rc.costs) {
            const r = lookup.resource(c.id);
            if (r) {
              const next = r.current - c.amount;
              r.current = clamp(next, r.min, r.max);
            }
          }
          for (const g of rc.gains ?? []) {
            const r = lookup.resource(g.id);
            if (r) {
              const next = r.current + g.amount;
              r.current = clamp(next, r.min, r.max);
            }
          }
          if (rc.grantsFlag) {
            const f = lookup.flag(rc.grantsFlag);
            if (f) f.active = true;
          }
          if (rc.grantsState) {
            const st = lookup.state(rc.grantsState.fsmId);
            if (st) st.current = rc.grantsState.value;
          }
        }
      },
    },
  ],
});
