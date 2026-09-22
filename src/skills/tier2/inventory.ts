import { defineCapability } from '@engine/core/define-capability.js';
import { defineComponent } from '@engine/core/define-component.js';
import { t } from '@engine/core/schema.js';
import type { Component, IWorld } from '@engine/core/types.js';

// ═══════════════════════════════════════════════════════════════
//  T2 · inventory —— 「格位 + 堆叠数」的背包：装的是**物品种类（字符串）+ 数量**，不是实体。
//
//  与 g4-group 的分工：Group 管「哪些实体、什么顺序、最多几个」（手牌/队伍/装备实体）；
//  Inventory 管「N 个格子里各堆着哪种东西、堆了几个、一堆最多几个」（木头×64、药水×3…）。
//  game-f `equip.ts` 那种手搓 3 槽袋 = 这张卡的退化形（slots=3, maxStack=1）。
//
//  数据形：items 是**紧凑有序**的堆列表（length ≤ slots），没有稀疏 null——空格 = 列表尾部的余量。
//  一实体一张 Inventory（多个背包 = 多个实体·同 Group 口径）；id 走全局语义 id（world.byId）。
//  纯数据 + 纯函数助手：确定性、零随机、零 system；所有助手就地改 items 并保持紧凑。
//  maxStack ≤ 0 = 一堆不限量（同 Group.capacity 「0 = 无限」口径）。
// ═══════════════════════════════════════════════════════════════

/** 一堆同种物品。 */
export interface InventoryStack { kind: string; count: number }

export interface Inventory extends Component {
  readonly type: 'Inventory';
  id: string;
  slots: number;
  maxStack: number;
  items: InventoryStack[];
}

export const inventoryCapability = defineCapability({
  id: 't2-inventory',
  version: '1.0.0',

  describe: {
    name: 'inventory',
    summary: '格位背包：N 个格子、每格一堆同种物品（kind 字符串 + count）、一堆最多 maxStack 个；增删/拆分/合并/转移/排序全是纯函数。',
    semantic: ['tier2', 'inventory', 'stack', 'slots', 'items', 'container'],
    whenToUse:
      '需要「按种类计数 + 有格子上限 + 可堆叠」的物品栏时：生存/合成背包（木头×64）、商店库存、仓库箱、掉落袋。挂 Inventory{id, slots, maxStack, items:[]} 于持有者实体；加减用 invAdd/invRemove（返回实际数量·满则截断）；两包间转移 invMove（原子）；拆堆 invSplit、并堆 invMerge、整理 invSort；按 id 找用 findInventory。装的是**实体**（手牌/队伍）请用 g4-group。',
    examples: [
      'inventory(id="bag:p1", slots=20, maxStack=64, items=[{kind:"wood",count:64},{kind:"wood",count:10}])',
      'inventory(id="chest:cave", slots=9, maxStack=99, items=[])',
      'inventory(id="hotbar", slots=3, maxStack=1, items=[{kind:"sword",count:1}])  // = game-f 三槽装备袋',
    ],
  },

  components: {
    provides: {
      Inventory: defineComponent('Inventory', {
        id: t.str('背包语义 id（全局路由·如 "bag:p1" / "chest:cave"）'),
        slots: t.num('格子数（items.length ≤ slots）'),
        maxStack: t.num('一堆最多几个（≤0 = 不限量）'),
        items: t.arr(t.obj({
          kind: t.str('物品种类'),
          count: t.num('数量（≥1）'),
        }), '紧凑有序的堆列表（无空洞·空格 = 尾部余量）'),
      }, {
        category: 'config',
        describe: '格位背包：物品种类 + 堆叠数。items 紧凑有序（length ≤ slots），每堆 count ≤ maxStack。',
      }),
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    id: { type: 'string', default: '', describe: '背包 id', question: '这个背包叫什么？', ui: { control: 'input' } },
    slots: { type: 'number', default: 10, describe: '格子数', question: '几个格子？', ui: { control: 'input' } },
    maxStack: { type: 'number', default: 99, describe: '一堆最多几个（0 = 不限）', question: '一堆最多几个？', ui: { control: 'input' } },
  },

  systems: [],
});

// ── 纯函数助手（就地改 items·保持紧凑·确定性·零随机）──

const UNBOUNDED = Number.MAX_SAFE_INTEGER;

/** 一堆的上限（maxStack ≤ 0 = 不限量）。 */
export function invStackCap(inv: Inventory): number {
  return inv.maxStack > 0 ? inv.maxStack : UNBOUNDED;
}

/** 某种物品的总数。 */
export function invCount(inv: Inventory, kind: string): number {
  let n = 0;
  for (const s of inv.items) if (s.kind === kind) n += s.count;
  return n;
}

/** 空格数（slots - 已用堆数·下钳 0）。 */
export function invFreeSlots(inv: Inventory): number {
  const free = inv.slots - inv.items.length;
  return free > 0 ? free : 0;
}

/** 还能再装几个 kind：既有同种堆的余量 + 空格 × 堆上限（不限量时空格 ≥1 即视为无限）。 */
export function invCapacityFor(inv: Inventory, kind: string): number {
  const cap = invStackCap(inv);
  let room = 0;
  for (const s of inv.items) if (s.kind === kind && s.count < cap) room += cap - s.count;
  const free = invFreeSlots(inv);
  if (free > 0 && cap === UNBOUNDED) return UNBOUNDED;
  room += free * cap;
  return room > UNBOUNDED ? UNBOUNDED : room;
}

/** 是否能一次装下 n 个 kind（n ≤ 0 恒真）。 */
export function invCanAdd(inv: Inventory, kind: string, n: number): boolean {
  return n <= 0 || invCapacityFor(inv, kind) >= n;
}

/** 至少有 n 个 kind（缺省 1）。 */
export function invHas(inv: Inventory, kind: string, n = 1): boolean {
  return invCount(inv, kind) >= n;
}

/**
 * 装入 n 个 kind：先填满既有同种堆（按列表序），再在尾部开新格；装不下的截断。
 * 返回**实际装入**的数量（0 = 一个都没进去）。
 */
export function invAdd(inv: Inventory, kind: string, n: number): number {
  if (n <= 0) return 0;
  const cap = invStackCap(inv);
  let left = n;
  for (const s of inv.items) {
    if (left === 0) break;
    if (s.kind !== kind || s.count >= cap) continue;
    const take = cap - s.count < left ? cap - s.count : left;
    s.count += take;
    left -= take;
  }
  while (left > 0 && inv.items.length < inv.slots) {
    const take = cap < left ? cap : left;
    inv.items.push({ kind, count: take });
    left -= take;
  }
  return n - left;
}

/**
 * 移除 n 个 kind：从**最后的堆**往前扣，扣空的堆摘掉（保持紧凑）；不够就扣到没有。
 * 返回**实际移除**的数量。
 */
export function invRemove(inv: Inventory, kind: string, n: number): number {
  if (n <= 0) return 0;
  let left = n;
  for (let i = inv.items.length - 1; i >= 0 && left > 0; i--) {
    const s = inv.items[i];
    if (s.kind !== kind) continue;
    const take = s.count < left ? s.count : left;
    s.count -= take;
    left -= take;
    if (s.count === 0) inv.items.splice(i, 1);
  }
  return n - left;
}

/**
 * 把 index 号堆拆出 n 个成新堆（追加到尾部）。需要：index 合法、1 ≤ n < 该堆 count、还有空格。
 * 不满足 → false 且不动。
 */
export function invSplit(inv: Inventory, index: number, n: number): boolean {
  const s = inv.items[index];
  if (!s || n < 1 || n >= s.count || invFreeSlots(inv) === 0) return false;
  s.count -= n;
  inv.items.push({ kind: s.kind, count: n });
  return true;
}

/**
 * 把 from 号堆并进 to 号堆（同种、尊重堆上限·装不下的留在 from）；from 并空则摘掉（后续下标前移）。
 * 一个都没并过去（下标非法/异种/同一堆/to 已满）→ false。
 */
export function invMerge(inv: Inventory, from: number, to: number): boolean {
  const a = inv.items[from];
  const b = inv.items[to];
  if (!a || !b || from === to || a.kind !== b.kind) return false;
  const cap = invStackCap(inv);
  const room = cap - b.count;
  if (room <= 0) return false;
  const take = a.count < room ? a.count : room;
  b.count += take;
  a.count -= take;
  if (a.count === 0) inv.items.splice(from, 1);
  return true;
}

/**
 * 从 from 转 n 个 kind 到 to：实际转移量 = min(n, from 持有量, to 可装量)，先扣后装（两端一致·不多不少）。
 * 返回实际转移数量（0 = 没动）。
 */
export function invMove(from: Inventory, to: Inventory, kind: string, n: number): number {
  if (n <= 0 || from === to) return 0;
  const have = invCount(from, kind);
  const room = invCapacityFor(to, kind);
  let amount = n;
  if (have < amount) amount = have;
  if (room < amount) amount = room;
  if (amount <= 0) return 0;
  const removed = invRemove(from, kind, amount);
  const added = invAdd(to, kind, removed);
  if (added < removed) invAdd(from, kind, removed - added); // 防御：容量算错时退回（正常路径不会走到）
  return added;
}

/** 缺省序：kind 升序（码点比较·不走 locale）→ count 降序。 */
export function invDefaultOrder(a: InventoryStack, b: InventoryStack): number {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  return b.count - a.count;
}

/** 就地排序（稳定排序·同序输入必得同序输出）；order 缺省 = invDefaultOrder。 */
export function invSort(inv: Inventory, order: (a: InventoryStack, b: InventoryStack) => number = invDefaultOrder): void {
  inv.items.sort(order);
}

/** 按语义 id 找背包（World.byId 索引·创建序首个）。 */
export function findInventory(world: IWorld, id: string): Inventory | undefined {
  const e = world.byId('Inventory', 'id', id);
  return e === undefined ? undefined : world.getComponent<Inventory>(e, 'Inventory');
}
