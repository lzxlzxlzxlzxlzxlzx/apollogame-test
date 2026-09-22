import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld, EntityId } from '@engine/core/types.js';
import type { Owner } from '@engine/protocol/components.js';

export type { Owner };

// ═══════════════════════════════════════════════════════════════
//  G3 · owner —— 「这个实体属于谁？站哪边？」（engine-base-tier-review-2026-09-06 §3.1 A-1 · owner 2026-09-08 判 A）
//
//  为什么是原子：归属 = 到主人实体的引用（不是空间父子·不是索敌目标），阵营 = 一个整数；两字段一个问题。
//  为什么不能重组：Tag 位表不了「属于哪个玩家实体」（玩家是运行时实体·数量不定）；Relation 一实体一张且
//  kind:'target' 已被 aggro/steering/pathfind/caster/pull-anchor 争抢。
//  纯数据·无 system。旧编码（CardPile.owner / Controllable.playerId / Tag 位 / Relation owner / PrefabOrigin.source）
//  **不迁**（owner 令：现有游戏不重写）；新能力/新游戏读这张。主人实体销毁后 ownerId 悬空 → 读方用 ownerOf 判空。
// ═══════════════════════════════════════════════════════════════

export const ownerCapability = defineCapability({
  id: 'g3-owner',
  version: '1.0.0',

  describe: {
    name: 'owner',
    summary: '这个实体属于哪个玩家/阵营根实体？站哪一边？',
    semantic: ['identity', 'ownership', 'team', 'faction'],
    whenToUse:
      '任何「谁的 / 哪队」判断：这张牌是哪个玩家的、这颗子弹是谁发的（别打自己人）、这个兵是红方还是蓝方、这局谁赢。挂 Owner{ownerId, team}；友敌判断用 sameTeam，归属判断用 isOwnedBy。别再用 Tag 位或 Relation{kind:"owner"} 表达归属。',
    examples: ['owner(ownerId="p1", team=1)', 'owner(ownerId="", team=2)  // 无主的蓝方单位', 'owner(ownerId="p2", team=0)  // 归 p2 但中立'],
  },

  components: {
    provides: {
      Owner: {
        category: 'config',
        describe: '归属与阵营。纯数据；主人被销毁后 ownerId 悬空（读方用 ownerOf 判）。',
        fields: {
          ownerId: { type: 'EntityId', describe: '主人实体 id（玩家/阵营根）；空串 = 无主' },
          team: { type: 'number', describe: '阵营号（0 = 中立/未分队）；同号即友方' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    ownerId: { type: 'string', default: '', describe: '主人实体 id', question: '它属于谁？', ui: { control: 'input' } },
    team: { type: 'number', default: 0, describe: '阵营号', question: '它站哪边？', ui: { control: 'input' } },
  },

  systems: [],
});

// ── 纯函数助手（确定性·零副作用）──

/** 主人实体 id；无 Owner / 无主 / 主人已不存在 → undefined。 */
export function ownerOf(world: IWorld, id: EntityId): EntityId | undefined {
  const o = world.getComponent<Owner>(id, 'Owner');
  if (!o || !o.ownerId) return undefined;
  return world.hasComponent(o.ownerId, 'Owner') || world.getAllEntities().includes(o.ownerId) ? o.ownerId : undefined;
}

/** 阵营号；无 Owner → undefined。 */
export function teamOf(world: IWorld, id: EntityId): number | undefined {
  return world.getComponent<Owner>(id, 'Owner')?.team;
}

/** 两实体是否同阵营（双方都有 Owner 且 team 相等；team 0 = 中立·中立与中立也算同队）。 */
export function sameTeam(world: IWorld, a: EntityId, b: EntityId): boolean {
  const ta = teamOf(world, a);
  const tb = teamOf(world, b);
  return ta !== undefined && ta === tb;
}

/** 实体是否归 owner 所有（直接归属；不递归到主人的主人）。 */
export function isOwnedBy(world: IWorld, id: EntityId, owner: EntityId): boolean {
  const o = world.getComponent<Owner>(id, 'Owner');
  return !!o && o.ownerId !== '' && o.ownerId === owner;
}
