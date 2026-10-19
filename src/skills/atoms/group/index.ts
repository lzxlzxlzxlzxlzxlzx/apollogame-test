import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld, EntityId } from '@engine/core/types.js';
import type { Group } from '@engine/protocol/components.js';

export type { Group };

// ═══════════════════════════════════════════════════════════════
//  G4 · group —— 「这个实体装着哪些实体？按什么顺序？最多几个？」（engine-base-tier-review-2026-09-06 §3.1 A-2 · owner 2026-09-08 判 A）
//
//  手牌 / 牌堆 / 背包 / 装备栏 / 队伍名单 / 座位圈的共同形：一堆实体 + 顺序 + 上限。
//  为什么不能重组：反向 Relation 无逆向索引且丢插入序；Hierarchy 是空间父子（会去改物品坐标）；Tag 无序无上限。
//  一实体一张 Group（多个集合 = 多个实体·同 Timer 口径）；id 走全局语义 id（world.byId('Group','id',…)）。
//  成员被销毁 → t1-group-gc 每拍摘除。背包 = Group + capacity；格位/堆叠属 tier2，不往这张卡加。
//  纯数据 + 纯函数助手；旧的数组字段（CardPile.hand / Zone.requiredEntities …）**不迁**（owner 令）。
// ═══════════════════════════════════════════════════════════════

export const groupCapability = defineCapability({
  id: 'g4-group',
  version: '1.0.0',

  describe: {
    name: 'group',
    summary: '有序、可限容的实体集合：手牌/牌堆/背包/装备栏/队伍/座位圈。',
    semantic: ['collection', 'container', 'membership', 'inventory', 'party'],
    whenToUse:
      '任何「一堆实体 + 顺序 + 上限」：玩家手牌、背包格、队伍名单、座位圈。挂 Group{id, members, capacity?} 于容器实体（玩家/牌堆/队伍）；增删用 groupAdd/groupRemove/groupMove（满则拒）；按 id 找用 findGroup。UI 的 repeat/UIListSpec 可直接按 members 投影列表。',
    examples: ['group(id="hand:p1", members=["card-3","card-9"], capacity=8)', 'group(id="party", members=["hero","mage"])', 'group(id="bag", members=[], capacity=20)'],
  },

  components: {
    provides: {
      Group: {
        category: 'config',
        describe: '有序实体集合。插入序即语义序；capacity 缺省无限；成员销毁后由 t1-group-gc 摘除。',
        fields: {
          id: { type: 'string', describe: '集合语义 id（全局路由·如 "hand:p1" / "deck" / "party"）' },
          members: { type: 'string[]', describe: '有序成员实体 id' },
          capacity: { type: 'number', describe: '上限（可选·缺省无限）' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    id: { type: 'string', default: '', describe: '集合 id', question: '这个集合叫什么？', ui: { control: 'input' } },
    capacity: { type: 'number', default: 0, describe: '上限（0 = 无限）', question: '最多装几个？', ui: { control: 'input' } },
  },

  systems: [],
});

// ── 纯函数助手（就地改 members·确定性·零随机）──

/** 是否已满（capacity 缺省/≤0 = 无限）。 */
export function groupIsFull(g: Group): boolean {
  return g.capacity !== undefined && g.capacity > 0 && g.members.length >= g.capacity;
}

export function groupHas(g: Group, id: EntityId): boolean {
  return g.members.includes(id);
}

/** 追加到末尾；已在其中或已满 → false 且不动。 */
export function groupAdd(g: Group, id: EntityId): boolean {
  if (groupHas(g, id) || groupIsFull(g)) return false;
  g.members.push(id);
  return true;
}

/** 插到 index 位（越界钳到两端）；已在其中或已满 → false。 */
export function groupInsertAt(g: Group, index: number, id: EntityId): boolean {
  if (groupHas(g, id) || groupIsFull(g)) return false;
  const i = index < 0 ? 0 : index > g.members.length ? g.members.length : index;
  g.members.splice(i, 0, id);
  return true;
}

/** 移除；不在其中 → false。 */
export function groupRemove(g: Group, id: EntityId): boolean {
  const i = g.members.indexOf(id);
  if (i < 0) return false;
  g.members.splice(i, 1);
  return true;
}

/** 从 from 移到 to 末尾（原子：to 满或 id 不在 from → 不动·false）。 */
export function groupMove(from: Group, to: Group, id: EntityId): boolean {
  if (!groupHas(from, id) || groupHas(to, id) || groupIsFull(to)) return false;
  groupRemove(from, id);
  to.members.push(id);
  return true;
}

/** 按语义 id 找集合（World.byId 索引·创建序首个）。 */
export function findGroup(world: IWorld, id: string): Group | undefined {
  const e = world.byId('Group', 'id', id);
  return e === undefined ? undefined : world.getComponent<Group>(e, 'Group');
}
