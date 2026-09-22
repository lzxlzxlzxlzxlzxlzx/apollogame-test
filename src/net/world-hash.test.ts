import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemView } from '@engine/core/system-view.js';
import type { Component, SystemDeclaration } from '@engine/core/types.js';
import { hashSnapshot } from './determinism.js';
import { hashWorld, hasherOf, WorldHasher } from './world-hash.js';

// P2c · 增量 hash：① 随机操作序列逐步对拍 hashWorld ≡ hashSnapshot(snapshot)（唯一真相=旧全量算法）
// ② 只重算脏实体（静止世界 recomputed=0；本体 getComponent 保守记脏；readView/peek 不记脏）
// ③ NON_DETERMINISTIC 组件不进 hash（与旧算法同）④ delta 快照往返 ⑤ 类型版本号。

interface P extends Component { readonly type: 'P'; x: number; tags: number[] }
interface Q extends Component { readonly type: 'Q'; s: string; nested: { a: number } }
const sys = (partial: Partial<SystemDeclaration> & { execute: SystemDeclaration['execute'] }): SystemDeclaration => ({ id: 'probe', reads: [], writes: [], consumes: [], ...partial });

// 确定性 PRNG（mulberry32）——测试自身不得裸随机
function rng(seed: number): () => number {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe('hashWorld ≡ hashSnapshot(snapshot)（对拍）', () => {
  it('随机 600 步操作（建/挂/改/摘/毁/consume/restore/数字样 id）每步同值', () => {
    const r = rng(20260906);
    const w = new World({ strict: false });
    const writer = new SystemView(w, sys({ id: 'w', reads: [], writes: ['P', 'Q'], execute() {} }), false);
    const ids = ['a', 'b', '10', '2', 'hero', 'z#1', 'x|y'];
    const pick = () => ids[Math.floor(r() * ids.length)];
    w.addSystem(sys({ id: 'eat', reads: ['Q'], writes: [], consumes: ['Q'], execute() {} }));
    for (let step = 0; step < 600; step++) {
      const op = r();
      const id = pick();
      if (op < 0.2) { if (!w.getAllEntities().includes(id)) w.createEntity(id); }
      else if (op < 0.4) { if (w.getAllEntities().includes(id)) w.addComponent<P>(id, { type: 'P', x: Math.floor(r() * 100), tags: [1, 2] }); }
      else if (op < 0.55) { if (w.getAllEntities().includes(id)) w.addComponent<Q>(id, { type: 'Q', s: `s${Math.floor(r() * 9)}`, nested: { a: r() } }); }
      else if (op < 0.7) { const p = writer.getComponent<P>(id, 'P'); if (p) { p.x += 1; p.tags.push(step); } } // 经视图改（写申报）
      else if (op < 0.78) { const p = w.getComponent<P>(id, 'P'); if (p) p.x = -p.x; } // 经本体改（保守记脏）
      else if (op < 0.85) { w.removeComponent(id, 'P'); }
      else if (op < 0.9) { if (w.getAllEntities().includes(id)) w.destroyEntity(id); }
      else if (op < 0.95) { w.tick(); } // consume Q
      else { const snap = w.snapshot(); const order = w.snapshotOrder(); w.restore(snap, order); }
      expect(hashWorld(w), `step ${step}`).toBe(hashSnapshot(w.snapshot()));
    }
  });

  it('NON_DETERMINISTIC 组件（Camera）不进 hash·改它不变 hash（与旧算法同）', () => {
    const w = new World({ strict: false });
    w.createEntity('e');
    w.addComponent<P>('e', { type: 'P', x: 1, tags: [] });
    w.addComponent('e', { type: 'Camera', zoom: 1 } as Component);
    const h1 = hashWorld(w);
    (w.getComponent('e', 'Camera') as unknown as { zoom: number }).zoom = 2;
    expect(hashWorld(w)).toBe(h1);
    expect(h1).toBe(hashSnapshot(w.snapshot()));
  });
});

describe('增量：只重算脏实体', () => {
  it('静止世界连续 hash：recomputed=0；只改 1 个实体：recomputed=1；readView/peek 读不记脏', () => {
    const w = new World({ strict: false });
    for (let i = 0; i < 50; i++) { w.createEntity(`e${i}`); w.addComponent<P>(`e${i}`, { type: 'P', x: i, tags: [] }); }
    const h = new WorldHasher(w);
    h.hash();
    expect(h.stats.recomputed).toBe(50);
    h.hash();
    expect(h.stats.recomputed).toBe(0);
    // 只读方：readView.getComponent / peek 不推进版本
    const rv = w.readView();
    for (const [id] of rv.query('P')) rv.getComponent<P>(id, 'P');
    w.peek<P>('e3', 'P');
    h.hash();
    expect(h.stats.recomputed).toBe(0);
    // 本体 getComponent = 可能改 → 只这一个实体重算
    w.getComponent<P>('e7', 'P')!.x = 99;
    h.hash();
    expect(h.stats.recomputed).toBe(1);
    expect(h.hash()).toBe(hashSnapshot(w.snapshot()));
    // 视图写申报读 → 记脏；视图只读申报读 → 不记脏
    new SystemView(w, sys({ id: 'r', reads: ['P'], writes: [], execute() {} }), false).getComponent('e1', 'P');
    h.hash(); expect(h.stats.recomputed).toBe(0);
    new SystemView(w, sys({ id: 'wr', reads: [], writes: ['P'], execute() {} }), false).getComponent('e1', 'P');
    h.hash(); expect(h.stats.recomputed).toBe(1);
  });

  it('hashWorld 按世界缓存一份 hasher；销毁的实体掉出缓存', () => {
    const w = new World({ strict: false });
    w.createEntity('a'); w.addComponent<P>('a', { type: 'P', x: 1, tags: [] });
    w.createEntity('b'); w.addComponent<P>('b', { type: 'P', x: 2, tags: [] });
    hashWorld(w);
    expect(hasherOf(w).stats.entities).toBe(2);
    w.destroyEntity('a');
    expect(hashWorld(w)).toBe(hashSnapshot(w.snapshot()));
    expect(hasherOf(w).stats.entities).toBe(1);
  });
});

describe('World · 版本号与 delta 快照', () => {
  it('typeVersion 随 add/remove/consume/写取推进；entityVersion 随触碰推进', () => {
    const w = new World({ strict: false });
    expect(w.typeVersion('P')).toBe(0);
    w.createEntity('a');
    const v0 = w.entityVersion('a');
    w.addComponent<P>('a', { type: 'P', x: 0, tags: [] });
    expect(w.typeVersion('P')).toBeGreaterThan(0);
    expect(w.entityVersion('a')).toBeGreaterThan(v0);
    const tp = w.typeVersion('P');
    w.peek('a', 'P');
    expect(w.typeVersion('P')).toBe(tp); // peek 不推进
    w.getComponent('a', 'P');
    expect(w.typeVersion('P')).toBeGreaterThan(tp); // 本体取 = 可能改
  });

  it('snapshotDelta(base) 只含 base 之后变过的实体 + removed；applyDelta 往返同 hash', () => {
    const w = new World({ strict: false });
    for (const id of ['a', 'b', 'c']) { w.createEntity(id); w.addComponent<P>(id, { type: 'P', x: 1, tags: [] }); }
    const base = w.writeSequence;
    const mirror = new World({ strict: false });
    mirror.restore(w.snapshot(), w.snapshotOrder());
    // 改 b、毁 c、建 d
    w.getComponent<P>('b', 'P')!.x = 5;
    w.destroyEntity('c');
    w.createEntity('d'); w.addComponent<Q>('d', { type: 'Q', s: 'q', nested: { a: 1 } });
    const d = w.snapshotDelta(base);
    expect(Object.keys(d.changed).sort()).toEqual(['b', 'd']);
    expect(d.removed).toEqual(['c']);
    expect(d.base).toBe(base);
    mirror.applyDelta(d);
    expect(hashWorld(mirror)).toBe(hashWorld(w));
    expect(hashSnapshot(mirror.snapshot())).toBe(hashSnapshot(w.snapshot()));
    // 再来一轮：空 delta
    const d2 = w.snapshotDelta(d.seq);
    expect(Object.keys(d2.changed)).toEqual([]);
    expect(d2.removed).toEqual([]);
  });
});
