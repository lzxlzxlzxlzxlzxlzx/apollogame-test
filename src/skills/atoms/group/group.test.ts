import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { groupCapability, groupAdd, groupInsertAt, groupRemove, groupMove, groupHas, groupIsFull, findGroup, type Group } from './index.js';

// G4 group：纯数据原子；助手保持插入序、尊重 capacity、拒重复；findGroup 走 byId 索引。

const mk = (id: string, members: string[] = [], capacity?: number): Group => ({ type: 'Group', id, members, ...(capacity !== undefined ? { capacity } : {}) });

describe('g4-group', () => {
  it('是纯数据原子：provides Group{id, members, capacity}·零 system', () => {
    expect(groupCapability.id).toBe('g4-group');
    expect(Object.keys(groupCapability.components.provides)).toEqual(['Group']);
    expect(groupCapability.systems).toEqual([]);
  });

  it('add/insertAt/remove 保持插入序·拒重复·容量满则拒（capacity 缺省或 0 = 无限）', () => {
    const hand = mk('hand:p1', [], 3);
    expect(groupAdd(hand, 'c1')).toBe(true);
    expect(groupAdd(hand, 'c2')).toBe(true);
    expect(groupAdd(hand, 'c1')).toBe(false); // 重复
    expect(groupInsertAt(hand, 0, 'c0')).toBe(true);
    expect(hand.members).toEqual(['c0', 'c1', 'c2']);
    expect(groupIsFull(hand)).toBe(true);
    expect(groupAdd(hand, 'c3')).toBe(false); // 满
    expect(groupRemove(hand, 'c1')).toBe(true);
    expect(groupRemove(hand, 'zz')).toBe(false);
    expect(hand.members).toEqual(['c0', 'c2']);
    expect(groupInsertAt(hand, 99, 'c9')).toBe(true); // 越界钳到末尾
    expect(hand.members).toEqual(['c0', 'c2', 'c9']);
    const bag = mk('bag');
    for (let i = 0; i < 100; i++) groupAdd(bag, `i${i}`);
    expect(bag.members).toHaveLength(100);
    expect(groupIsFull(mk('x', ['a'], 0))).toBe(false);
  });

  it('groupMove 原子：目标满或不在源里 → 不动', () => {
    const deck = mk('deck', ['a', 'b', 'c']);
    const hand = mk('hand', ['h'], 2);
    expect(groupMove(deck, hand, 'a')).toBe(true);
    expect(deck.members).toEqual(['b', 'c']);
    expect(hand.members).toEqual(['h', 'a']);
    expect(groupMove(deck, hand, 'b')).toBe(false); // hand 满
    expect(deck.members).toEqual(['b', 'c']);
    expect(groupMove(deck, hand, 'zz')).toBe(false);
    expect(groupHas(hand, 'a')).toBe(true);
  });

  it('findGroup 走 World.byId（创建序首个）', () => {
    const w = new World({ strict: false });
    w.createEntity('p1'); w.addComponent<Group>('p1', mk('hand:p1', ['c1']));
    w.createEntity('p2'); w.addComponent<Group>('p2', mk('hand:p2', ['c2']));
    expect(findGroup(w, 'hand:p2')?.members).toEqual(['c2']);
    expect(findGroup(w, 'nope')).toBeUndefined();
  });
});
