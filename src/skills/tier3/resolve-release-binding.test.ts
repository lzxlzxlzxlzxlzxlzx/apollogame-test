import { expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Component } from '@engine/core/types.js';
import type { Caster, GameFlow, Resource, Transform } from '@engine/protocol/components.js';
import { casterCapability } from './caster.js';
import { prefabCapability } from './prefab.js';
import { motionApplyCapability } from '../tier1/motion-apply.js';
import { overlapDetectCapability } from '../atoms/overlap-detect/index.js';
import { triggerZoneCapability, ZONE_FLAG } from '../tier2/trigger-zone.js';
import { hitboxCapability } from '../tier2/hitbox.js';
import { resourceCapability } from '../atoms/resource/index.js';
import { mortalCapability } from '../tier2/mortal.js';
import { destroyCapability } from '../atoms/destroy/index.js';
import { launchCapability } from '../tier2/launch.js';
import { analyzeSystemGraph } from '@assembly/system-graph.js';

const at = (x: number) => ({ x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
function add(w: World, id: string, values: Record<string, object>) {
  w.createEntity(id);
  for (const [type, data] of Object.entries(values)) w.addComponent(id, { type, ...data } as Component);
}
const caps = [casterCapability, prefabCapability, motionApplyCapability, overlapDetectCapability, triggerZoneCapability, hitboxCapability, resourceCapability, mortalCapability, destroyCapability, launchCapability];
function fixture(caster: Partial<Caster> = {}, targetX = 10) {
  const w = new World();
  for (const cap of caps) for (const s of cap.systems) w.addSystem(s);
  for (const [id, x, tag] of [['source', 0, 2], ['target', targetX, 4], ['neighbor', targetX, 4]] as const) add(w, id, {
    Transform: at(x), Shape: { kind: 'circle', radius: .3 }, Tag: { flags: tag },
    Resource: { id: 'hp', current: 100, min: 0, max: 100 }, Mortal: { resource: 'hp', atOrBelow: 0 },
  });
  add(w, 'skill', {
    GameFlow: { id: 'skill', current: 'Active', states: [{ id: 'Active' }], targetSnapshot: { sourceId: 'source', targetId: 'target' } },
    Caster: { onSignal: 'release', template: 'strike', at: 'target', targetFlow: 'skill', sourceCheck: { aliveResource: 'hp', rejectStatusMask: 16 }, targetCheck: { aliveResource: 'hp' }, ...caster },
  });
  add(w, 'library', { PrefabLibrary: { seq: 0, templates: { strike: { entities: { area: {
    Transform: at(0), Shape: { kind: 'circle', radius: .5 }, Tag: { flags: ZONE_FLAG },
    Hitbox: { resource: 'hp', amount: 7, targetMask: 4, consumeOnHit: true, sourceCheck: { aliveResource: 'hp', rejectStatusMask: 16 } },
  } } } } } });
  // Release signal is the external input. No contact or lifecycle result is injected.
  add(w, 'input', { Signal: { name: 'release', source: 'input' } });
  return w;
}
const hp = (w: World, id: string) => w.getComponent<Resource>(id, 'Resource')?.current;
function release(w: World) { w.tick(); w.destroyEntity('input'); }

it('resolve at:self stays at source despite distant target snapshot', () => {
  const w = fixture({ at: 'self' }); release(w);
  const area = w.query('Hitbox')[0]![0];
  expect(w.getComponent<Transform>(area, 'Transform')!.x).toBe(0);
  w.tick(); expect(hp(w, 'target')).toBe(100);
});
it('single-target real overlap damages locked target once and preserves neighbor', () => {
  const w = fixture({ onlyHitTarget: true }); release(w); expect(hp(w, 'target')).toBe(100);
  w.tick(); expect(hp(w, 'target')).toBe(93); expect(hp(w, 'neighbor')).toBe(100);
  expect(w.query('Hitbox')).toHaveLength(0);
});
it('committed contact follows actual moving target for first contact only', () => {
  const w = fixture({ onlyHitTarget: true });
  w.addComponent('target', { type: 'Velocity', vx: 3, vy: 0, angular: 0 });
  release(w); expect(w.getComponent<Transform>('target', 'Transform')!.x).toBe(13);
  w.tick(); expect(w.getComponent<Transform>('target', 'Transform')!.x).toBe(16);
  expect(hp(w, 'target')).toBe(93); expect(hp(w, 'neighbor')).toBe(100);
});
it('fixed area retains release location while target moves away and hits neighbor', () => {
  const w = fixture({ alignToTarget: false });
  w.addComponent('target', { type: 'Velocity', vx: 3, vy: 0, angular: 0 });
  w.getComponent<Transform>('neighbor', 'Transform')!.x = 13;
  release(w); w.tick(); expect(hp(w, 'target')).toBe(100); expect(hp(w, 'neighbor')).toBe(93);
});
it.each(['death', 'control', 'nonlethal'] as const)('production incoming contact before late release: %s', mode => {
  const w = fixture({ at: 'self', releasePhase: 'resolve', targetFlow: undefined, originEntity: 'source' }, .6);
  add(w, 'incoming', { Transform: at(-1), Velocity: { vx: 1, vy: 0, angular: 0 }, Shape: { kind: 'circle', radius: .1 }, Tag: { flags: ZONE_FLAG },
    Hitbox: { resource: 'hp', amount: mode === 'death' ? 100 : 1, targetMask: 2, ...(mode === 'control' ? { setMask: 16 } : {}), consumeOnHit: true } });
  release(w);
  expect(w.query('Hitbox')).toHaveLength(mode === 'nonlethal' ? 1 : 0);
  for (let i = 0; i < 3; i++) w.tick();
  expect(hp(w, 'target')).toBe(mode === 'nonlethal' ? 93 : 100);
});
it('source-only self identity filter does not borrow an enemy target', () => {
  const w = fixture({ at: 'self', releasePhase: 'resolve', targetFlow: undefined, originEntity: 'source', onlyHitTarget: true }, 0);
  const lib = w.getComponent<any>('library', 'PrefabLibrary'); lib.templates.strike.entities.area.Hitbox.targetMask = 2;
  release(w); w.tick(); expect(hp(w, 'source')).toBe(93); expect(hp(w, 'target')).toBe(100);
});
it('followSource moves real hit region before overlap', () => {
  const w = fixture({ at: 'self', releasePhase: 'resolve', targetFlow: undefined, originEntity: 'source', followSource: true }, 6);
  w.addComponent('source', { type: 'Velocity', vx: 3, vy: 0, angular: 0 });
  release(w); w.tick(); expect(hp(w, 'target')).toBe(93);
});
it('source status invalidation after release clears a pending region before contact', () => {
  const w = fixture({ at: 'self', releasePhase: 'resolve', targetFlow: undefined, originEntity: 'source', followSource: true }, 6);
  release(w); expect(w.query('Hitbox')).toHaveLength(1);
  // External control input between ticks; production Hitbox validates existing region.
  w.addComponent('source', { type: 'Status', flags: 16 });
  w.tick(); expect(w.query('Hitbox')).toHaveLength(0); expect(hp(w, 'target')).toBe(100);
});
it('local full release chain audit counts real systems and has no cycle', () => {
  const graph = analyzeSystemGraph(caps), w = fixture();
  expect(graph.systemCount).toBe(w.getSortedSystems().length);
  expect(graph.systemCount).toBeGreaterThan(10);
  expect(graph.sccs).toEqual([]);
  console.log('RESOLVE_BINDING_AUDIT', JSON.stringify(graph));
});
it.each(['control', 'missing'] as const)('persistent nonconsuming region cleans invalid source: %s', mode => {
  const w = fixture({ at: 'self', releasePhase: 'resolve', targetFlow: undefined, originEntity: 'source', followSource: true }, 6);
  w.getComponent<any>('library', 'PrefabLibrary').templates.strike.entities.area.Hitbox.consumeOnHit = false;
  release(w); const area = w.query('Hitbox')[0]![0];
  if (mode === 'missing') w.destroyEntity('source'); else w.addComponent('source', { type: 'Status', flags: 16 });
  w.tick(); expect(w.getAllEntities()).not.toContain(area); expect(hp(w, 'target')).toBe(100);
});
it('earlier production hard-control contact invalidates a later contact in the same Hitbox loop', () => {
  const w = fixture({ onlyHitTarget: true }, 10);
  // This incoming region exists before the generated strike and moves into source on Tick2.
  add(w, 'incoming-control', { Transform: at(-2), Velocity: { vx: 1, vy: 0, angular: 0 }, Shape: { kind: 'circle', radius: .1 }, Tag: { flags: ZONE_FLAG },
    Hitbox: { resource: 'hp', amount: 0, setMask: 16, targetMask: 2, consumeOnHit: true } });
  release(w); expect(w.query('Hitbox')).toHaveLength(2);
  w.tick();
  const contacts = w.query('Trigger').map(([id]) => w.getComponent<any>(id, 'Trigger'));
  const incoming = contacts.findIndex(t => t.zone === 'incoming-control' && t.other === 'source');
  const outgoing = contacts.findIndex(t => t.zone.startsWith('strike#') && t.other === 'target');
  console.log('SAME_LOOP_CONTACTS', JSON.stringify(contacts));
  expect(incoming).toBeGreaterThanOrEqual(0); expect(outgoing).toBeGreaterThan(incoming);
  expect(hp(w, 'target')).toBe(100); expect(w.query('Hitbox')).toHaveLength(0);
});
it('captured aim is propagated to actual Launch motion independently of later target location', () => {
  const w = fixture({ at: 'self', useCapturedAim: true });
  w.getComponent<GameFlow>('skill', 'GameFlow')!.targetSnapshot!.aim = { x: .6, y: .8 };
  w.getComponent<any>('library', 'PrefabLibrary').templates.strike.entities.area.Launch = { toward: 'target', speed: 5, targetTag: 4 };
  release(w); const area = w.query('Hitbox')[0]![0];
  w.getComponent<Transform>('target', 'Transform')!.x = -100;
  w.tick(); expect(w.getComponent<Transform>(area, 'Transform')).toMatchObject({ x: 3, y: 4 });
});
it('captured aim orients and centers a capsule from the source for real diagonal contact', () => {
  const w = fixture({ at: 'self', useCapturedAim: true });
  w.getComponent<GameFlow>('skill', 'GameFlow')!.targetSnapshot!.aim = { x: .6, y: .8 };
  const shape = w.getComponent<any>('library', 'PrefabLibrary').templates.strike.entities.area.Shape;
  // Directed capsule starts at its source-facing cap edge, total range = length + 2r.
  Object.assign(shape, { kind: 'capsule', length: 9.4, radius: .3, axisX: 1, axisY: 0 });
  w.getComponent<Transform>('target', 'Transform')!.x = 3; w.getComponent<Transform>('target', 'Transform')!.y = 4;
  release(w); const area = w.query('Hitbox')[0]![0];
  expect(w.getComponent<Transform>(area, 'Transform')).toMatchObject({ x: 3, y: 4 });
  expect(w.getComponent<any>(area, 'Shape')).toMatchObject({ axisX: .6, axisY: .8 });
  const capsule = w.getComponent<any>(area, 'Shape'), center = w.getComponent<Transform>(area, 'Transform')!;
  const extent = capsule.length / 2 + capsule.radius;
  expect({ x: center.x - .6 * extent, y: center.y - .8 * extent }).toEqual({ x: 0, y: 0 });
  expect({ x: center.x + .6 * extent, y: center.y + .8 * extent }).toEqual({ x: 6, y: 8 });
  w.tick(); expect(hp(w, 'target')).toBe(93); expect(hp(w, 'neighbor')).toBe(100);
});
