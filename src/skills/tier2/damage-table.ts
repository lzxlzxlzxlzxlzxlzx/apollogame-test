import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld, EntityId, Component } from '@engine/core/types.js';
import { t } from '@engine/core/schema.js';

// ═══════════════════════════════════════════════════════════════
//  t2-damage-table —— 伤害类型 × 护甲类型 克制表（owner 2026-09-09 令补齐·底层评审 §7 第二档·game211 手写原型）
//
//  RTS / 塔防 / 兵种相克：「穿刺打轻甲 ×1.5、打重甲 ×0.5」这张表是纯数据。此前 game211 在 rts-combat.ts 里手写 8 兵种矩阵。
//  形态：世界单例 DamageTable{rows: {攻击类型: {护甲类型: 倍率}}}；目标挂 Armor{kind}；Hitbox 可选填 damageType——
//  hitbox 结算时若三者齐备则 dmg × 倍率（缺任一 = ×1·零回归）。倍率查不到 = 1。纯数据 + 纯函数·无 system。
// ═══════════════════════════════════════════════════════════════

export interface DamageTable extends Component {
  readonly type: 'DamageTable';
  rows: Record<string, Record<string, number>>;
}

export interface Armor extends Component {
  readonly type: 'Armor';
  kind: string;
}

/** 查倍率：表缺/行缺/列缺 → 1。 */
export function damageMultiplier(table: DamageTable | undefined, damageType: string | undefined, armorKind: string | undefined): number {
  if (!table || !damageType || !armorKind) return 1;
  const row = table.rows[damageType];
  if (!row) return 1;
  const m = row[armorKind];
  return typeof m === 'number' && Number.isFinite(m) ? m : 1;
}

/** 世界单例克制表（无 → undefined）。 */
export function findDamageTable(world: IWorld): DamageTable | undefined {
  const e = world.singleton('DamageTable');
  return e === undefined ? undefined : world.getComponent<DamageTable>(e, 'DamageTable');
}

/** 对目标实体的倍率（读世界单例表 + 目标 Armor）。 */
export function multiplierAgainst(world: IWorld, damageType: string | undefined, target: EntityId): number {
  if (!damageType) return 1;
  const armor = world.getComponent<Armor>(target, 'Armor');
  return damageMultiplier(findDamageTable(world), damageType, armor?.kind);
}

export const damageTableCapability = defineCapability({
  id: 't2-damage-table',
  version: '1.0.0',

  describe: {
    name: 'damage-table',
    summary: '伤害类型 × 护甲类型 倍率表（世界单例）+ 目标 Armor{kind}；hitbox 按 damageType 查表乘伤。',
    semantic: ['damage', 'armor', 'counter', 'rts', 'matrix'],
    whenToUse:
      '兵种相克/属性克制：世界挂 DamageTable{rows:{pierce:{light:1.5,heavy:0.5}, blunt:{light:0.8,heavy:1.5}}}，单位挂 Armor{kind:"heavy"}，Hitbox 填 damageType:"pierce"。查不到的组合 = ×1。',
    examples: [
      'DamageTable{ rows:{ pierce:{light:1.5,heavy:0.5}, blunt:{light:0.8,heavy:1.5}, magic:{light:1,heavy:1,shield:0.25} } }',
      'Armor{ kind:"heavy" } + Hitbox{ resource:"hp", amount:10, damageType:"pierce" } → 命中重甲扣 5',
    ],
  },

  components: {
    provides: {
      DamageTable: {
        category: 'config',
        describe: '克制倍率表（世界单例）：rows[攻击类型][护甲类型] = 倍率。',
        fields: {},
        schema: t.obj({ rows: t.rec(t.rec(t.num('倍率'))) }),
        singleton: true,
      },
      Armor: {
        category: 'config',
        describe: '目标护甲类型（克制表的列）。',
        fields: { kind: { type: 'string', describe: '护甲类型名（对应 DamageTable 列）' } },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    kind: { type: 'string', default: 'light', describe: '护甲类型', question: '它是什么护甲？', ui: { control: 'input' } },
  },

  systems: [],
});
