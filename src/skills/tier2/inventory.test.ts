import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import {
  inventoryCapability,
  invCount, invFreeSlots, invCapacityFor, invCanAdd, invHas,
  invAdd, invRemove, invSplit, invMerge, invMove, invSort, invDefaultOrder,
  findInventory,
  type Inventory, type InventoryStack,
} from './inventory.js';

// t2-inventory：纯数据 + 纯函数；items 始终紧凑（无空洞·length ≤ slots·每堆 1 ≤ count ≤ maxStack）。

const mk = (id: string, slots: number, maxStack: number, items: InventoryStack[] = []): Inventory =>
  ({ type: 'Inventory', id, slots, maxStack, items });

/** 不变量：紧凑 + 不超格 + 每堆合法。 */
const assertWellFormed = (inv: Inventory) => {
  expect(inv.items.length).toBeLessThanOrEqual(inv.slots);
  for (const s of inv.items) {
    expect(s.count).toBeGreaterThanOrEqual(1);
    if (inv.maxStack > 0) expect(s.count).toBeLessThanOrEqual(inv.maxStack);
  }
};

describe('t2-inventory', () => {
  it('是纯数据能力：provides Inventory{id, slots, maxStack, items}·零 system·目录字段齐全', () => {
    expect(inventoryCapability.id).toBe('t2-inventory');
    expect(Object.keys(inventoryCapability.components.provides)).toEqual(['Inventory']);
    expect(inventoryCapability.systems).toEqual([]);
    const c = inventoryCapability.components.provides.Inventory;
    expect(Object.keys(c.fields)).toEqual(['id', 'slots', 'maxStack', 'items']);
    expect(c.fields.id.type).toBe('string');
    expect(c.fields.slots.type).toBe('number');
    expect(c.fields.maxStack.type).toBe('number');
    expect(c.schema?.k).toBe('obj');
    const d = inventoryCapability.describe;
    expect(d.summary.length).toBeGreaterThan(0);
    expect(d.whenToUse.length).toBeGreaterThan(0);
    expect(d.examples.length).toBeGreaterThan(0);
  });

  it('invAdd 先填既有堆再开新格；溢出截断并返回实际装入数', () => {
    const bag = mk('bag', 3, 10, [{ kind: 'wood', count: 7 }]);
    expect(invAdd(bag, 'wood', 5)).toBe(5); // 7→10，余 2 开新堆
    expect(bag.items).toEqual([{ kind: 'wood', count: 10 }, { kind: 'wood', count: 2 }]);
    expect(invAdd(bag, 'stone', 3)).toBe(3); // 第三格
    expect(invFreeSlots(bag)).toBe(0);
    expect(invCanAdd(bag, 'wood', 8)).toBe(true); // 第二堆余 8
    expect(invCanAdd(bag, 'wood', 9)).toBe(false);
    expect(invAdd(bag, 'wood', 20)).toBe(8); // 部分装入
    expect(invCount(bag, 'wood')).toBe(20);
    expect(invAdd(bag, 'iron', 1)).toBe(0); // 无格且无同种余量
    expect(invAdd(bag, 'wood', 0)).toBe(0);
    expect(invAdd(bag, 'wood', -3)).toBe(0);
    assertWellFormed(bag);
  });

  it('invCapacityFor / invCanAdd / invHas 统计正确；maxStack ≤ 0 = 不限量', () => {
    const bag = mk('bag', 2, 5, [{ kind: 'a', count: 3 }]);
    expect(invCapacityFor(bag, 'a')).toBe(2 + 5);
    expect(invCapacityFor(bag, 'b')).toBe(5);
    expect(invCanAdd(bag, 'b', 0)).toBe(true);
    expect(invHas(bag, 'a')).toBe(true);
    expect(invHas(bag, 'a', 3)).toBe(true);
    expect(invHas(bag, 'a', 4)).toBe(false);
    expect(invHas(bag, 'zz')).toBe(false);

    const pile = mk('pile', 1, 0);
    expect(invAdd(pile, 'gold', 1_000_000)).toBe(1_000_000);
    expect(pile.items).toEqual([{ kind: 'gold', count: 1_000_000 }]);
    expect(invCanAdd(pile, 'gold', 1_000_000)).toBe(true); // 同种堆不限量
    expect(invCanAdd(pile, 'silver', 1)).toBe(false); // 但没格了
    assertWellFormed(pile);
  });

  it('invRemove 从最后的堆往前扣，扣空即摘，不够则扣到没有', () => {
    const bag = mk('bag', 5, 10, [
      { kind: 'wood', count: 10 }, { kind: 'stone', count: 4 }, { kind: 'wood', count: 3 },
    ]);
    expect(invRemove(bag, 'wood', 5)).toBe(5); // 尾堆 3 摘掉，再从首堆扣 2
    expect(bag.items).toEqual([{ kind: 'wood', count: 8 }, { kind: 'stone', count: 4 }]);
    expect(invRemove(bag, 'wood', 100)).toBe(8); // 不够 → 全扣
    expect(bag.items).toEqual([{ kind: 'stone', count: 4 }]);
    expect(invRemove(bag, 'wood', 1)).toBe(0);
    expect(invRemove(bag, 'stone', 0)).toBe(0);
    expect(invFreeSlots(bag)).toBe(4);
    assertWellFormed(bag);
  });

  it('invSplit：拆 n 个成尾部新堆；越界/拆整堆/拆 0/无空格 → false 不动', () => {
    const bag = mk('bag', 2, 10, [{ kind: 'wood', count: 6 }]);
    expect(invSplit(bag, 0, 6)).toBe(false); // 不能拆整堆
    expect(invSplit(bag, 0, 0)).toBe(false);
    expect(invSplit(bag, 3, 1)).toBe(false); // 越界
    expect(invSplit(bag, 0, 2)).toBe(true);
    expect(bag.items).toEqual([{ kind: 'wood', count: 4 }, { kind: 'wood', count: 2 }]);
    expect(invSplit(bag, 0, 1)).toBe(false); // 没空格了
    expect(bag.items).toEqual([{ kind: 'wood', count: 4 }, { kind: 'wood', count: 2 }]);
    assertWellFormed(bag);
  });

  it('invMerge：同种并堆尊重 maxStack（装不下的留在 from）；并空摘堆；异种/同堆/已满 → false', () => {
    const bag = mk('bag', 4, 10, [
      { kind: 'wood', count: 8 }, { kind: 'wood', count: 5 }, { kind: 'stone', count: 1 }, { kind: 'wood', count: 10 },
    ]);
    expect(invMerge(bag, 1, 2)).toBe(false); // 异种
    expect(invMerge(bag, 1, 1)).toBe(false); // 同一堆
    expect(invMerge(bag, 1, 3)).toBe(false); // 目标已满
    expect(invMerge(bag, 9, 0)).toBe(false); // 越界
    expect(invMerge(bag, 1, 0)).toBe(true); // 8+5 → 10 + 3
    expect(bag.items).toEqual([
      { kind: 'wood', count: 10 }, { kind: 'wood', count: 3 }, { kind: 'stone', count: 1 }, { kind: 'wood', count: 10 },
    ]);
    // 反向：小堆 3 并进 8... 先造一个能全并的
    const bag2 = mk('bag2', 3, 10, [{ kind: 'x', count: 2 }, { kind: 'y', count: 1 }, { kind: 'x', count: 3 }]);
    expect(invMerge(bag2, 2, 0)).toBe(true);
    expect(bag2.items).toEqual([{ kind: 'x', count: 5 }, { kind: 'y', count: 1 }]); // from 并空摘掉
    assertWellFormed(bag);
    assertWellFormed(bag2);
  });

  it('invMove 原子转移：量 = min(n, 持有, 目标可装)，两端一致；不够格则只转能装下的', () => {
    const src = mk('src', 5, 10, [{ kind: 'wood', count: 10 }, { kind: 'wood', count: 7 }]);
    const dst = mk('dst', 2, 10, [{ kind: 'wood', count: 8 }]);
    expect(invMove(src, dst, 'wood', 30)).toBe(12); // 持有 17，目标可装 2 + 10 = 12
    expect(invCount(src, 'wood')).toBe(5);
    expect(invCount(dst, 'wood')).toBe(20);
    expect(dst.items).toEqual([{ kind: 'wood', count: 10 }, { kind: 'wood', count: 10 }]);
    expect(invMove(src, dst, 'wood', 1)).toBe(0); // 目标满
    expect(invCount(src, 'wood')).toBe(5);
    expect(invMove(src, dst, 'stone', 1)).toBe(0); // 源没有
    expect(invMove(src, src, 'wood', 1)).toBe(0); // 自转自
    const empty = mk('e', 1, 10);
    expect(invMove(src, empty, 'wood', 3)).toBe(3);
    expect(src.items).toEqual([{ kind: 'wood', count: 2 }]);
    expect(empty.items).toEqual([{ kind: 'wood', count: 3 }]);
    assertWellFormed(src); assertWellFormed(dst); assertWellFormed(empty);
  });

  it('invSort 缺省 kind 升序、count 降序；确定性（不同初始序 → 同结果·幂等）', () => {
    const a = mk('a', 9, 99, [
      { kind: 'wood', count: 3 }, { kind: 'apple', count: 1 }, { kind: 'wood', count: 9 }, { kind: 'Zinc', count: 2 }, { kind: 'apple', count: 5 },
    ]);
    const b = mk('b', 9, 99, [
      { kind: 'apple', count: 5 }, { kind: 'wood', count: 9 }, { kind: 'Zinc', count: 2 }, { kind: 'apple', count: 1 }, { kind: 'wood', count: 3 },
    ]);
    invSort(a); invSort(b);
    const expected = [
      { kind: 'Zinc', count: 2 }, { kind: 'apple', count: 5 }, { kind: 'apple', count: 1 }, { kind: 'wood', count: 9 }, { kind: 'wood', count: 3 },
    ];
    expect(a.items).toEqual(expected);
    expect(b.items).toEqual(expected);
    invSort(a);
    expect(a.items).toEqual(expected); // 幂等
    expect(invDefaultOrder({ kind: 'k', count: 1 }, { kind: 'k', count: 1 })).toBe(0);
    // 自定义序：count 升序
    invSort(a, (x, y) => x.count - y.count);
    expect(a.items.map((s) => s.count)).toEqual([1, 2, 3, 5, 9]);
  });

  it('findInventory 走 World.byId（创建序首个）', () => {
    const w = new World({ strict: false });
    w.createEntity('p1'); w.addComponent<Inventory>('p1', mk('bag:p1', 4, 10, [{ kind: 'wood', count: 2 }]));
    w.createEntity('p2'); w.addComponent<Inventory>('p2', mk('bag:p2', 4, 10, [{ kind: 'stone', count: 1 }]));
    expect(findInventory(w, 'bag:p2')?.items).toEqual([{ kind: 'stone', count: 1 }]);
    expect(findInventory(w, 'nope')).toBeUndefined();
    const bag = findInventory(w, 'bag:p1')!;
    expect(invAdd(bag, 'wood', 3)).toBe(3);
    expect(invCount(findInventory(w, 'bag:p1')!, 'wood')).toBe(5); // 就地改·同引用
  });
});
