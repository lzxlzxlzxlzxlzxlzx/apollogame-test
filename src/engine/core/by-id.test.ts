import { describe, it, expect } from 'vitest';
import { World } from './world.js';
import { SystemView } from './system-view.js';
import { findByComponentId, getComponentById, sortedIds, worldSeed } from './query.js';
import type { Component, SystemDeclaration } from './types.js';
import type { Resource, RandomSeed } from '../protocol/components.js';

// B-3/B-4 · World.byId 语义 id 索引 + sortedIds：① 创建序首个（与旧线性扫 / buildIdLookup 逐字同义）
// ② 索引随 add/remove/consume/destroy/本体写取/restore 失效重建；只读路径不失效也不需要 ③ 严格视图按申报把关
// ④ sortedIds 与手写 `.map(id).sort()` 同值 ⑤ worldSeed = singleton + getComponent。

const res = (id: string, current = 0): Resource => ({ type: 'Resource', id, current, min: 0, max: 100 });
const sys = (p: Partial<SystemDeclaration>): SystemDeclaration => ({ id: 's', reads: [], writes: [], consumes: [], execute() {}, ...p });

describe('World.byId', () => {
  it('创建序首个匹配；缺 → undefined；findByComponentId/getComponentById 走它且同值', () => {
    const w = new World({ strict: false });
    for (const [e, id] of [['b', 'hp'], ['a', 'hp'], ['c', 'mp']] as const) { w.createEntity(e); w.addComponent(e, res(id)); }
    expect(w.byId('Resource', 'id', 'hp')).toBe('b'); // b 先建（id 字典序 a<b 不作数）
    expect(w.byId('Resource', 'id', 'mp')).toBe('c');
    expect(w.byId('Resource', 'id', 'nope')).toBeUndefined();
    expect(w.byId('Flag', 'id', 'hp')).toBeUndefined();
    expect(findByComponentId(w, 'Resource', 'id', 'hp')).toBe('b');
    expect(getComponentById<Resource>(w, 'Resource', 'id', 'mp')?.id).toBe('mp');
  });

  it('索引失效：add / remove / destroy / 本体 getComponent 改 id / consume / restore 后结果正确', () => {
    const w = new World({ strict: false });
    w.createEntity('a'); w.addComponent('a', res('hp'));
    expect(w.byId('Resource', 'id', 'hp')).toBe('a');
    w.createEntity('z'); w.addComponent('z', res('mp'));
    expect(w.byId('Resource', 'id', 'mp')).toBe('z');
    w.removeComponent('a', 'Resource');
    expect(w.byId('Resource', 'id', 'hp')).toBeUndefined();
    w.addComponent('a', res('hp'));
    w.getComponent<Resource>('a', 'Resource')!.id = 'renamed'; // 本体取 = 可能改 → 版本推进
    expect(w.byId('Resource', 'id', 'hp')).toBeUndefined();
    expect(w.byId('Resource', 'id', 'renamed')).toBe('a');
    w.destroyEntity('a');
    expect(w.byId('Resource', 'id', 'renamed')).toBeUndefined();
    // consume：挂在 Signal 上的组件被系统 consume 后不再可查
    w.addSystem(sys({ id: 'eat', reads: ['Signal'], consumes: ['Signal'] }));
    w.addComponent('z', { type: 'Signal', name: 'go' } as Component);
    expect(w.byId('Signal', 'name', 'go')).toBe('z');
    w.tick();
    expect(w.byId('Signal', 'name', 'go')).toBeUndefined();
    // restore
    const snap = w.snapshot(); const order = w.snapshotOrder();
    w.addComponent('z', res('gold'));
    expect(w.byId('Resource', 'id', 'gold')).toBe('z');
    w.restore(snap, order);
    expect(w.byId('Resource', 'id', 'gold')).toBeUndefined();
    expect(w.byId('Resource', 'id', 'mp')).toBe('z');
  });

  it('只读路径：peek/readView 不推进版本，byId 命中缓存且不记脏', () => {
    const w = new World({ strict: false });
    w.createEntity('a'); w.addComponent('a', res('hp'));
    w.drainDirty();
    const v0 = w.writeSequence;
    expect(w.readView().byId('Resource', 'id', 'hp')).toBe('a');
    w.peek('a', 'Resource');
    expect(w.byId('Resource', 'id', 'hp')).toBe('a');
    expect(w.writeSequence).toBe(v0);
    expect(w.dirtyCount).toBe(0);
  });

  it('严格视图：未申报 reads 的类型按 id 找 → 抛；申报了 → 透传', () => {
    const w = new World({ strict: true });
    w.createEntity('a'); w.addComponent('a', res('hp'));
    const bad = new SystemView(w, sys({ id: 'bad', reads: ['Flag'] }), true);
    expect(() => bad.byId('Resource', 'id', 'hp')).toThrow(/按 id 找实体/);
    const ok = new SystemView(w, sys({ id: 'ok', reads: ['Resource'] }), true);
    expect(ok.byId('Resource', 'id', 'hp')).toBe('a');
  });
});

describe('sortedIds / worldSeed', () => {
  it('sortedIds 与手写 query().map(id).sort() 同值（含数字样 id）；多类型交集', () => {
    const w = new World({ strict: false });
    for (const e of ['b', '10', '2', 'a']) { w.createEntity(e); w.addComponent(e, res('x')); }
    w.addComponent('a', { type: 'Tag', flags: 1 } as Component);
    expect(sortedIds(w, 'Resource')).toEqual(w.query('Resource').map(([id]) => id).sort());
    expect(sortedIds(w, 'Resource')).toEqual(['10', '2', 'a', 'b']);
    expect(sortedIds(w, 'Resource', 'Tag')).toEqual(['a']);
  });

  it('worldSeed：无 → undefined；有 → 单例上的 RandomSeed', () => {
    const w = new World({ strict: false });
    expect(worldSeed(w)).toBeUndefined();
    w.createEntity('world'); w.addComponent<RandomSeed>('world', { type: 'RandomSeed', seed: 7, sequence: 0 });
    expect(worldSeed(w)?.seed).toBe(7);
  });
});
