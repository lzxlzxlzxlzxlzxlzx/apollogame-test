import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { ownerCapability, ownerOf, teamOf, sameTeam, isOwnedBy, type Owner } from './index.js';

// G3 owner：纯数据原子（零 system）；助手：主人/阵营/友敌/归属；主人销毁后 ownerOf 判空。

function world(): World {
  const w = new World({ strict: false });
  for (const id of ['p1', 'p2', 'card-a', 'card-b', 'unit-n', 'rock']) w.createEntity(id);
  w.addComponent<Owner>('card-a', { type: 'Owner', ownerId: 'p1', team: 1 });
  w.addComponent<Owner>('card-b', { type: 'Owner', ownerId: 'p2', team: 2 });
  w.addComponent<Owner>('unit-n', { type: 'Owner', ownerId: '', team: 1 }); // 无主·红方
  return w;
}

describe('g3-owner', () => {
  it('是纯数据原子：provides Owner{ownerId, team}·零 system', () => {
    expect(ownerCapability.id).toBe('g3-owner');
    expect(Object.keys(ownerCapability.components.provides)).toEqual(['Owner']);
    expect(ownerCapability.systems).toEqual([]);
  });

  it('ownerOf / teamOf / isOwnedBy', () => {
    const w = world();
    expect(ownerOf(w, 'card-a')).toBe('p1');
    expect(ownerOf(w, 'unit-n')).toBeUndefined(); // 无主
    expect(ownerOf(w, 'rock')).toBeUndefined(); // 无 Owner
    expect(teamOf(w, 'card-b')).toBe(2);
    expect(teamOf(w, 'rock')).toBeUndefined();
    expect(isOwnedBy(w, 'card-a', 'p1')).toBe(true);
    expect(isOwnedBy(w, 'card-a', 'p2')).toBe(false);
    expect(isOwnedBy(w, 'unit-n', '')).toBe(false); // 空串不算归属
  });

  it('sameTeam：同号即友方（无主单位也按 team 判）；缺 Owner 一侧 → false', () => {
    const w = world();
    expect(sameTeam(w, 'card-a', 'unit-n')).toBe(true);
    expect(sameTeam(w, 'card-a', 'card-b')).toBe(false);
    expect(sameTeam(w, 'card-a', 'rock')).toBe(false);
  });

  it('主人实体销毁后 ownerOf → undefined（悬空判空·不炸）', () => {
    const w = world();
    w.destroyEntity('p1');
    expect(ownerOf(w, 'card-a')).toBeUndefined();
    expect(isOwnedBy(w, 'card-a', 'p1')).toBe(true); // 原始字段仍在（数据不自改·由读方判空）
  });
});
