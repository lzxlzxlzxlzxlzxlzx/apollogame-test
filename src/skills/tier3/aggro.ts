import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import type { IWorld } from '@engine/core/types.js';
import type { Perception, Transform, Relation } from '@engine/protocol/components.js';
import { nearestByTag } from '@skills/atoms/spatial-query/index.js';

// ═══════════════════════════════════════════════════════════════
//  aggro —— 数据驱动 AI 的「索敌」段（D-001）。对应周期表 auto-target / range-detect：
//  spatial-query(nearest) + tag 过滤 → **relation(target)**。把"看见谁"产物化成通用 Relation(target)，
//  供 steering(朝它移动) / 朝向 / caster(at:'target' 复用) 等多消费者复用——不再各自重写一遍索敌扫描。
//
//  逐实体（挂 Perception+Transform 的实体）：找 sightRadius 内最近的 targetTag 阵营（复用 spatial-query 的
//  nearestByTag）→ 写/更新自身 Relation{kind:'target', targetId}；视野内无目标 → 清掉 target 关系（steering 据此 idle）。
//
//  这是把单体 AI 拆开后的"感知"原子：模式/转移(巡逻↔追击↔逃跑)交给 state+condition 当数据，行为=数据组合而非代码。
//  确定性：nearestByTag 按 id 升序 tie-break；runsBefore motion-apply（据本帧位置感知，再移动）。
//
//  lureTag（薄加性·REQ-SURVIVOR武器缺口 W8·零回归）：声明后，感知阶段先在 sightRadius 内找带
//  Tag.flags & lureTag 位的实体（诱饵/嘲讽物）——找到则直接选它为目标，**盖过**默认 targetTag 选择
//  （多个候选时 nearestByTag 自带 id tie-break）；范围内没有 lure 才回落原有的 targetTag 最近目标逻辑。
//  缺省 undefined = 现行为完全不变（不查 lure，直接走 targetTag）。诱饵/嘲讽机制通用，非本游戏专属。
// ═══════════════════════════════════════════════════════════════

export const aggroCapability = defineCapability({
  id: 't3-aggro',
  version: '1.0.0',

  describe: {
    name: 'aggro',
    summary: '索敌：感知 sightRadius 内最近的 targetTag 阵营 → 写 Relation{kind:"target",targetId}（无则清）。auto-target 的产物化，供 steering/caster/朝向复用。',
    semantic: ['tier3', 'ai', 'perception', 'auto-target'],
    whenToUse:
      '让实体自动锁定一个阵营的最近目标而不写索敌代码。挂 Perception{targetTag,sightRadius}+Transform；下游读 Relation(target)（steering 追/逃、caster at:target、朝向）。',
    examples: [
      '怪锁玩家：Perception{ targetTag:PLAYER, sightRadius:300 } → Relation{kind:"target", targetId:"hero"}',
      '炮塔锁敌：Perception{ targetTag:ENEMY, sightRadius:400 } → 供 caster at:"target" 自动开火',
      '视野丢失：目标离开 sightRadius → 清 Relation(target) → steering 回 idle',
      '诱饵盖过默认目标：Perception{ targetTag:PLAYER, sightRadius:300, lureTag:LURE } → 视野内有带 LURE 位的诱饵实体时优先锁它，无诱饵才回落锁 PLAYER',
    ],
  },

  components: {
    provides: {
      Perception: {
        category: 'config',
        describe: '声明「感知 sightRadius 内最近的 targetTag 阵营 → 写 Relation(target)；若声明 lureTag 且范围内有匹配实体则优先选它」。索敌=数据。',
        fields: {
          targetTag: { type: 'number', describe: '感知的阵营位（Tag.flags & targetTag）' },
          sightRadius: { type: 'number', describe: '感知半径（<=0=无限视野）' },
          lureTag: { type: 'number', describe: 'sightRadius 内若有 Tag.flags 含此位的实体，优先选它为目标（盖过 targetTag 默认选择）；无则回落 targetTag。缺省=不查 lure（零回归）' },
        },
      },
    },
    reads: ['Perception', 'Transform', 'Tag', 'Relation'],
    writes: ['Relation'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'aggro',
      runsBefore: ['motion-apply'],
      reads: ['Perception', 'Transform', 'Tag', 'Relation'],
      writes: ['Relation'],
      consumes: [],
      execute(world: IWorld) {
        const ids = sortedIds(world, 'Perception', 'Transform');
        for (const id of ids) {
          const p = world.getComponent<Perception>(id, 'Perception')!;
          const t = world.getComponent<Transform>(id, 'Transform')!;
          // lureTag 优先：范围内有诱饵 → 盖过默认 targetTag 选择；否则回落默认索敌（零回归口径）。
          const targetId = (p.lureTag ? nearestByTag(world, t.x, t.y, p.lureTag, { excludeId: id, maxRadius: p.sightRadius }) : undefined)
            ?? nearestByTag(world, t.x, t.y, p.targetTag, { excludeId: id, maxRadius: p.sightRadius });
          const rel = world.getComponent<Relation>(id, 'Relation');
          if (targetId) {
            if (!rel) world.addComponent(id, { type: 'Relation', kind: 'target', targetId } as Relation);
            else if (rel.kind === 'target') rel.targetId = targetId;
            // rel 存在且 kind!='target'：该实体的 Relation 另作他用，aggro 让位（一实体一 Relation 限制）。
          } else if (rel && rel.kind === 'target') {
            world.removeComponent(id, 'Relation');
          }
        }
      },
    },
  ],
});
