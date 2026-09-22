import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import type { IWorld } from '@engine/core/types.js';
import type { KeyBinding, InputQueue, Signal } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  keybind —— 具名输入动作 → Signal（clickable 的"非空间孪生"）。
//
//  缺口：clickable 把「指针**命中实体**」变 Signal；但「按某个键」是非空间的——没有任何能力把
//  InputQueue 里的具名动作（key='1' / 'q' / 'cast_nova'）变成 Signal。action-map(I2) 只定义 Action 契约、
//  systems:[]。input.md 明确「键位映射放 Config 组件或蓝图」。本能力正是那个数据驱动的映射解释器。
//
//  每挂 KeyBinding{key,signal,phase?} 的实体：扫单例 InputQueue 的动作事件，若某事件 key===binding.key
//  （且相位匹配）→ 在该实体上产出 Signal{name:signal}。下游 caster/craft-recipe/effect-apply 等照常按名消费。
//  键位映射 = 纯数据（蓝图填 KeyBinding，可重绑、最弱 LLM 可填），不在系统里硬编码键位（input.md 纪律）。
//
//  信号生命周期：本系统每 tick 先清挂在 KeyBinding 实体上的旧 Signal，再按本帧输入重标（自包含、幂等）。
//  runsAfter event-when（与 clickable 同纪律）：避免本帧新发的 Signal 被 event-when 的全局清扫误删。
//  确定性：只读 InputQueue（按 tick 确定性注入）+ 字符串比较；多绑定按实体 id 升序处理。
// ═══════════════════════════════════════════════════════════════

export const keybindCapability = defineCapability({
  id: 't2-keybind',
  version: '1.0.0',

  describe: {
    name: 'keybind',
    summary: '具名输入动作→Signal：InputQueue 里 key 命中 KeyBinding.key（相位匹配）→ 在该实体产出 Signal{name:signal}。键位映射=数据。',
    semantic: ['tier2', 'input', 'event'],
    whenToUse:
      '想让"按某个键/触发某个具名动作"产生一个信号而不写输入代码时。挂 KeyBinding{key,signal,phase?}；下游 query Signal 按名消费（接 caster 放技能 / craft-recipe / effect-apply / 对话推进）。',
    examples: [
      '按 1 放冰环：KeyBinding{ key:"1", signal:"cast_nova" } → caster 释放',
      '按 q 冲刺：KeyBinding{ key:"q", signal:"dash", phase:"down" }',
      'UI 语义动作：KeyBinding{ key:"confirm", signal:"advance" } → 对话推进',
      '代发给行为主体：KeyBinding{ key:"throw.rock", signal:"throw.rock", source:"p1" } → Signal.source="p1"（按 source 认人的消费方才认得出是谁出的手）',
    ],
  },

  components: {
    provides: {
      KeyBinding: {
        category: 'config',
        describe: '声明「InputQueue 动作事件 key 命中此 key（相位匹配）时产出 Signal{name:signal}」。键位映射=数据。',
        fields: {
          key: { type: 'string', describe: '匹配 InputQueue 事件的 key（物理键 "1"/"q" 或语义动作名）' },
          signal: { type: 'string', describe: '命中时产出的 Signal.name' },
          phase: { type: 'string', describe: "仅匹配此相位（如 'down'|'action'）；缺省=任意" },
          source: {
            type: 'EntityId',
            describe:
              '代发：产出的 Signal.source 填这个实体而非本实体。给**按 source 认人**的消费方用（如 matrix-duel 出招接缝按侧认人）——'
              + '房屋范式「一动作一个 kb-* 实体」会让 source 永远是 kb 实体，而一实体一组件又不许把多份绑定挤到主体上。缺省=本实体（零回归）；空串硬抛。',
          },
        },
      },
    },
    reads: ['KeyBinding', 'InputQueue'],
    writes: ['Signal'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'keybind',
      runsAfter: ['event-when'],
      reads: ['KeyBinding', 'InputQueue'],
      writes: ['Signal'],
      consumes: [],
      execute(world: IWorld) {
        // ① 清掉上一帧挂在 KeyBinding 实体上的 Signal（自包含；event-when 在场时幂等）。
        for (const [eid] of world.query('KeyBinding', 'Signal')) world.removeComponent(eid, 'Signal');

        // ② 取单例 InputQueue。
        let queue: InputQueue | undefined;
        for (const [e] of world.query('InputQueue')) {
          queue = world.getComponent<InputQueue>(e, 'InputQueue');
          break;
        }
        if (!queue || queue.actions.length === 0) return;

        // ③ 逐绑定（按 id 升序，确定性）匹配本帧输入事件。
        const ids = sortedIds(world, 'KeyBinding');
        for (const id of ids) {
          const kb = world.getComponent<KeyBinding>(id, 'KeyBinding')!;
          // 代发落盘门：`source` 填了空串 = 永不自愈的数据错（发出去的信号没有主体，下游按 source
          // 认人的消费方只会静默认不到）——点名硬抛，不静默退回 id（同本库「坏数据不许静默」教条）。
          if (kb.source !== undefined && kb.source === '') {
            throw new Error(`keybind: 实体 "${id}" 的 KeyBinding.source 是空串（代发要填真实体 id；不代发就别填这个字段）`);
          }
          for (const ev of queue.actions) {
            if (ev.key === kb.key && (kb.phase === undefined || ev.phase === kb.phase)) {
              // arg 透传（带参 UI 动作·如买哪件 card_42）：仅在事件带 arg 时挂，无参动作不挂 arg:undefined（旧内容形状/hash 不变）。
              // source：缺省=本实体（零回归）；填了 = 代发给该实体（REQ-108-ENG-04·见 KeyBinding.source 注释）。
              // 信号组件本身仍挂在本实体上（清扫逻辑①按 KeyBinding 实体清·代发不改生命周期）。
              world.addComponent(id, { type: 'Signal', name: kb.signal, source: kb.source ?? id, ...(ev.arg !== undefined ? { arg: ev.arg } : {}) } as Signal);
              break;
            }
          }
        }
      },
    },
  ],
});
