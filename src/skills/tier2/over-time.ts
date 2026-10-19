import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { OverTime, TimedEffect, Status } from '@engine/protocol/components.js';
import { queueResourceMod } from '@skills/atoms/resource/index.js';

// ═══════════════════════════════════════════════════════════════
//  over-time —— 限时/持续效果容器（D-003 + R14 真修 B）。把"瞬时位掩码 Status / 一次性 ResourceModify"
//  延展成"随时间结算"的逐实体效果：DoT(中毒/燃烧)、regen(回血/蓝)、定时状态(冻结/眩晕到期自动解除)。
//  **一实体的 OverTime 持一个 TimedEffect 列表 → 燃烧+冰冻+毒可同时存在**，各自计时/到期（修掉一实体一 OverTime 缺口）。
//
//  每 tick（每个挂 OverTime 的实体，按 id 升序）：
//    ① 逐效果 elapsed+1；resource 且 amountPerTick 且到 period 整数倍 → queueResourceMod 到自身
//       （**多个效果的改值累加**，R14 真修 A，不再后写覆盖）→ resource-apply 结算。
//    ② 到期(duration>0 且 elapsed>=duration)：清该效果 clearStatusOnEnd 位，从列表移除（仅有过期时才重建数组，省 GC）。
//    ③ 列表空 → removeComponent('OverTime')（不毁实体——怪还活着，只是身上 buff/debuff 都结束了）。
//
//  定序：runsBefore resource-apply（本帧产的 ResourceModify 当帧结算）；hitbox runsBefore over-time（先施加再 tick）。
//  确定性：纯整数 tick 计数 + 加性累加（序无关）；effects 是 POD 数组 → 进 snapshot 可重放。
// ═══════════════════════════════════════════════════════════════

// 给实体追加一个限时效果：无 OverTime 则新建；effect.id 命中既有则**刷新**（替换，防无限叠层），否则追加。
export function addTimedEffect(world: IWorld, entityId: string, effect: TimedEffect): void {
  const ot = world.getComponent<OverTime>(entityId, 'OverTime');
  if (!ot) {
    world.addComponent(entityId, { type: 'OverTime', effects: [effect] } as OverTime);
    return;
  }
  if (effect.id !== undefined) {
    const i = ot.effects.findIndex((e) => e.id === effect.id);
    if (i >= 0) {
      ot.effects[i] = effect; // 同 id 刷新
      return;
    }
  }
  ot.effects.push(effect);
}

export const overTimeCapability = defineCapability({
  id: 't2-over-time',
  version: '1.1.0',

  describe: {
    name: 'over-time',
    summary: '限时/持续效果容器：OverTime 持 TimedEffect 列表，逐效果每 period 改自身 resource(DoT/regen) + 到 duration 清 Status 位并移除。多效果并存(燃烧+冰冻+毒)。',
    semantic: ['tier2', 'combat', 'status', 'over-time'],
    whenToUse:
      'DoT(中毒/燃烧)、regen(回血)、定时状态(冻结/眩晕到期自动解除)，且可同时多个。挂 OverTime{effects:[{resource?,amountPerTick?,period,duration,elapsed:0,clearStatusOnEnd?,id?}]}；常由 hitbox 命中时 addTimedEffect 追加。',
    examples: [
      '燃烧 DoT：{ id:"burn", resource:"hp", amountPerTick:-5, period:30, duration:180 } → 每 0.5s 掉 5 血，持续 3s',
      '定时冻结：{ id:"frozen", period:1, duration:120, clearStatusOnEnd:FROZEN } → 2s 后自动解冻',
      '同时燃烧+冰冻：effects 列表里两条并存，各自计时（R14 真修 B）',
    ],
  },

  components: {
    provides: {
      OverTime: {
        category: 'effect',
        describe: '限时/持续效果容器：effects 列表，逐效果每 period 改自身 resource、到 duration 清 Status 位并移除；列表空则自销毁。',
        fields: {
          effects: { type: 'string', describe: 'TimedEffect[]（复杂对象数组：{id?,resource?,amountPerTick?,period,duration,elapsed,clearStatusOnEnd?}）' },
        },
      },
    },
    reads: ['OverTime', 'Status'],
    writes: ['ResourceModify', 'Status', 'OverTime'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'over-time',
      // Update 阶段产 ResourceModify；显式排在 resource-apply 之前（与 hitbox 同纪律），本帧产当帧结算。
      runsBefore: ['resource-apply'],
      reads: ['OverTime', 'Status'],
      writes: ['ResourceModify', 'Status', 'OverTime'],
      consumes: [],
      execute(world: IWorld) {
        const ids = sortedIds(world, 'OverTime');
        for (const id of ids) {
          const ot = world.getComponent<OverTime>(id, 'OverTime');
          if (!ot) continue;

          // ① 逐效果推进 + 周期结算（累加到自身）。
          let anyExpired = false;
          for (const ef of ot.effects) {
            ef.elapsed += 1;
            if (ef.resource && ef.amountPerTick && ef.period >= 1 && ef.elapsed % ef.period === 0) {
              queueResourceMod(world, id, ef.resource, ef.amountPerTick, 'local');
            }
            if (ef.duration > 0 && ef.elapsed >= ef.duration) anyExpired = true;
          }

          // ② 仅有过期时才重建列表（省 GC）：清过期效果的 Status 位，留存活的。
          if (anyExpired) {
            const survivors: TimedEffect[] = [];
            for (const ef of ot.effects) {
              if (ef.duration > 0 && ef.elapsed >= ef.duration) {
                if (ef.clearStatusOnEnd) {
                  const st = world.getComponent<Status>(id, 'Status');
                  if (st) st.flags &= ~ef.clearStatusOnEnd;
                }
              } else {
                survivors.push(ef);
              }
            }
            if (survivors.length === 0) world.removeComponent(id, 'OverTime');
            else ot.effects = survivors;
          }
        }
      },
    },
  ],
});
