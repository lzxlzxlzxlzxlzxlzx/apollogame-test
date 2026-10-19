import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { conveyorQueueCapability, effectiveCapacity, type ConveyorQueue } from './conveyor-queue.js';
import { eventWhenCapability } from './event-when.js';
import { prefabCapability } from '@skills/tier3/prefab.js';
import { timerCapability } from '@atom-skills/timer/index.js';
import { lifetimeCapability } from '@skills/tier1/lifetime.js';
import { destroyCapability } from '@atom-skills/destroy/index.js';
import type { Flag, EventWhen, Signal, PrefabLibrary, Transform } from '@engine/protocol/components.js';

// t2-conveyor-queue：同拍 N 份信号 → N 个上带（REQ-G102-BURST 最小复现）；容量 5 / 突破 10；满发 fullSignal；
// 出带后前移；载体回收；确定性。

function belt(): World {
  const w = new World();
  for (const c of [eventWhenCapability, prefabCapability, timerCapability, lifetimeCapability, destroyCapability, conveyorQueueCapability]) for (const s of c.systems) w.addSystem(s);
  w.createEntity('lib');
  w.addComponent<PrefabLibrary>('lib', { type: 'PrefabLibrary', seq: 0, templates: { cannon: { entities: { c: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } } } } } } as unknown as PrefabLibrary);
  w.createEntity('belt');
  w.addComponent<ConveyorQueue>('belt', { type: 'ConveyorQueue', id: 'belt', template: 'cannon', enqueueSignal: 'tap', capacity: 5, burstCapacity: 10, burstFlag: 'burst', popSignal: 'fire', fullSignal: 'full', originX: 100, originY: 300, stepX: 40, stepY: 0, members: [], inFlight: 0, rejected: 0, seq: 0 });
  w.createEntity('burst'); w.addComponent<Flag>('burst', { type: 'Flag', id: 'burst', active: false });
  // N 个「按钮」= N 个 EventWhen 同名信号（同拍 N 份）
  for (let i = 0; i < 6; i++) {
    w.createEntity(`tap${i}`);
    w.addComponent<Flag>(`tap${i}`, { type: 'Flag', id: `press${i}`, active: false });
    w.addComponent<EventWhen>(`tap${i}`, { type: 'EventWhen', signal: 'tap', when: { kind: 'flag', id: `press${i}` }, mode: 'level' } as EventWhen);
  }
  w.createEntity('fireBtn'); w.addComponent<Flag>('fireBtn', { type: 'Flag', id: 'fire', active: false });
  w.addComponent<EventWhen>('fireBtn', { type: 'EventWhen', signal: 'fire', when: { kind: 'flag', id: 'fire' }, mode: 'level' } as EventWhen);
  return w;
}
const cq = (w: World) => w.getComponent<ConveyorQueue>('belt', 'ConveyorQueue')!;
function tapN(w: World, n: number): void {
  for (let i = 0; i < n; i++) w.getComponent<Flag>(`tap${i}`, 'Flag')!.active = true;
  w.tick();
  for (let i = 0; i < n; i++) w.getComponent<Flag>(`tap${i}`, 'Flag')!.active = false;
}

describe('t2-conveyor-queue', () => {
  it('同拍 6 份 tap → 容量 5：5 个 SpawnRequest 落地成 5 成员 + 1 被拒（fullSignal arg=1）；成员排位', () => {
    const w = belt();
    tapN(w, 6);
    expect(cq(w).inFlight).toBe(5);
    expect(cq(w).rejected).toBe(1);
    expect(w.getComponent<Signal>('belt', 'Signal')).toMatchObject({ name: 'full', arg: '1' });
    w.tick(); // prefab-spawn 展开
    w.tick(); // 对账 + 排位
    expect(cq(w).members).toHaveLength(5);
    expect(cq(w).inFlight).toBe(0);
    const xs = cq(w).members.map((m) => w.getComponent<Transform>(m, 'Transform')!.x);
    expect(xs).toEqual([100, 140, 180, 220, 260]);
  });

  it('突破态 Flag 为真 → 容量 10；再满则拒', () => {
    const w = belt();
    w.getComponent<Flag>('burst', 'Flag')!.active = true;
    tapN(w, 6); w.tick(); w.tick();
    expect(cq(w).members).toHaveLength(6);
    tapN(w, 6); w.tick(); w.tick();
    expect(cq(w).members).toHaveLength(10);
    expect(cq(w).rejected).toBe(2);
    expect(effectiveCapacity(cq(w), false)).toBe(5);
    expect(effectiveCapacity(cq(w), true)).toBe(10);
  });

  it('popSignal → 队首出带·其余前移；载体实体被 lifetime 回收', () => {
    const w = belt();
    tapN(w, 3); w.tick(); w.tick();
    const [head, second] = cq(w).members;
    w.getComponent<Flag>('fireBtn', 'Flag')!.active = true;
    w.tick(); w.getComponent<Flag>('fireBtn', 'Flag')!.active = false;
    w.tick(); w.tick();
    expect(w.getAllEntities()).not.toContain(head);
    expect(cq(w).members[0]).toBe(second);
    expect(w.getComponent<Transform>(second, 'Transform')!.x).toBe(100);
    for (let i = 0; i < 6; i++) w.tick();
    expect(w.getAllEntities().filter((e) => e.startsWith('belt:req:'))).toEqual([]);
  });

  it('确定性：同操作两次 → 同成员 id 序', () => {
    const a = belt(); const b = belt();
    for (const w of [a, b]) { tapN(w, 4); w.tick(); w.tick(); }
    expect(cq(a).members).toEqual(cq(b).members);
  });
});
