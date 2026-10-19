import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { groupGcCapability } from './group-gc.js';
import { groupCapability, type Group } from '@atom-skills/group/index.js';
import { destroyCapability } from '@atom-skills/destroy/index.js';
import type { DestroyRequest } from '@engine/protocol/components.js';
import { hashWorld } from '@net/world-hash.js';

// T1 group-gc：销毁的成员同拍从所有 Group 摘除（Cleanup 相位·在 destroy-apply 之后）；静止世界零写入（hash 稳定·不推进版本）。

function world(): World {
  const w = new World(); // 严格模式（vitest 缺省）：申报门把关
  for (const c of [groupCapability, destroyCapability, groupGcCapability]) for (const s of c.systems) w.addSystem(s);
  for (const id of ['p1', 'p2', 'c1', 'c2', 'c3']) w.createEntity(id);
  w.addComponent<Group>('p1', { type: 'Group', id: 'hand:p1', members: ['c1', 'c2'] });
  w.addComponent<Group>('p2', { type: 'Group', id: 'party', members: ['c2', 'c3', 'c1'] });
  return w;
}

describe('t1-group-gc', () => {
  it('成员经 DestroyRequest 销毁 → 同拍从所有集合摘除·其余顺序保持', () => {
    const w = world();
    w.addComponent<DestroyRequest>('c2', { type: 'DestroyRequest', entityId: 'c2' });
    w.tick();
    expect(w.getComponent<Group>('p1', 'Group')!.members).toEqual(['c1']);
    expect(w.getComponent<Group>('p2', 'Group')!.members).toEqual(['c3', 'c1']);
  });

  it('静止世界：连续 tick 不写 Group（hash 与写序号稳定）', () => {
    const w = world();
    w.tick();
    const h = hashWorld(w);
    const seq = w.writeSequence;
    w.tick(); w.tick();
    expect(hashWorld(w)).toBe(h);
    expect(w.writeSequence).toBe(seq);
  });

  it('无 Group 的世界零成本', () => {
    const w = new World();
    for (const s of groupGcCapability.systems) w.addSystem(s);
    w.createEntity('x');
    expect(() => w.tick()).not.toThrow();
  });
});
