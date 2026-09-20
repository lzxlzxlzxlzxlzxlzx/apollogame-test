import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import type { EntityCheck, FrameStartTransform, GameFlow, Resource, Tag, Transform, Velocity, Relation } from '@engine/protocol/components.js';
import { motionApplyCapability } from '../tier1/motion-apply.js';
import { flowCapability } from '../tier3/flow.js';
import { checkEntity } from './entity-check.js';

function body(w: World, id: string, x: number, team = 2, hp = 10, vx = 0) {
  w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'Velocity', vx, vy: 0, angular: 0 } as Velocity);
  w.addComponent(id, { type: 'Tag', flags: team } as Tag);
  w.addComponent(id, { type: 'Resource', id: 'hp', current: hp, min: 0, max: 10 } as Resource);
}
function world() {
  const w = new World();
  for (const cap of [motionApplyCapability, flowCapability]) for (const system of cap.systems) w.addSystem(system);
  return w;
}
const safe: EntityCheck = { aliveResource: 'hp', neighborhood: { radius: 3, tagMask: 4, aliveResource: 'hp', count: { max: 0 } } };
function start(w: World, owner: string, check: EntityCheck, capture = false) {
  const id = `${owner}-flow`;
  w.createEntity(id);
  w.createEntity(`${owner}-cd`);
  w.addComponent(`${owner}-cd`, { type: 'Resource', id: `${owner}-cd`, current: 0, min: 0, max: 99 } as Resource);
  w.addComponent(id, { type: 'GameFlow', id, current: 'ready', states: [
    { id: 'ready', transitions: [{ to: 'windup', ...(capture ? { captureTarget: { sourceEntity: owner, check } } : { whenEntities: [{ entityId: owner, check }] }), do: [{ kind: 'modify-resource', targetId: `${owner}-cd`, op: 'set', value: 6 }] }] },
    { id: 'windup' },
  ] } as GameFlow);
  return () => ({ phase: w.getComponent<GameFlow>(id, 'GameFlow')!.current, cd: w.getComponent<Resource>(`${owner}-cd`, 'Resource')!.current });
}

describe('REQ-005 frame-start decision eligibility', () => {
  it.each([0, 38.5, 38.501])('local hp bound %s never reads another entity sharing hp ID', value => {
    const w = world(); body(w, 'other', 0, 2, 1); body(w, 'healer', 10, 2, value);
    const local: EntityCheck = { aliveResource: 'hp', resource: { id: 'hp', max: 38.5 } };
    expect(checkEntity(w, 'healer', local)).toBe(value > 0 && value <= 38.5);
    expect(checkEntity(w, 'other', local)).toBe(true);
    expect(checkEntity(w, 'healer', { resource: { id: 'hp', min: 0, max: 38.5 } })).toBe(value <= 38.5);
  });
  it('local resource missing ID and invalid bounds fail closed', () => {
    const w = world(); body(w, 'a', 0);
    for (const resource of [{ id: 'missing' }, { id: 'hp', min: NaN }, { id: 'hp', max: Infinity }, { id: 'hp', min: 2, max: 1 }])
      expect(checkEntity(w, 'a', { resource })).toBe(false);
    w.removeComponent('a', 'Resource'); expect(checkEntity(w, 'a', { resource: { id: 'hp' } })).toBe(false);
  });
  it.each([3.999, 4, 4.001])('inclusive range min: distance %s and atomic CD', distance => {
    const w = world(); body(w, 'source', 0); body(w, 'target', distance, 4);
    w.addComponent('source', { type: 'Relation', kind: 'target', targetId: 'target' } as Relation);
    const read = start(w, 'source', { range: { originEntity: 'source', min: 4, max: 10 } }, true);
    w.tick();
    expect(read()).toEqual(distance < 4 ? { phase: 'ready', cd: 0 } : { phase: 'windup', cd: 6 });
  });
  it('moving neighbor uses snapshot this tick, then new position next tick', () => {
    const w = world(); body(w, 'healer', 10); body(w, 'enemy', 12, 4, 10, 4);
    const read = start(w, 'healer', safe);
    w.tick(); expect(w.getComponent<Transform>('enemy', 'Transform')!.x).toBe(16);
    expect(read()).toEqual({ phase: 'ready', cd: 0 });
    w.tick(); expect(read()).toEqual({ phase: 'windup', cd: 6 });
  });
  it('targetless self action permits empty field, dead enemies and friends; instances independent', () => {
    const w = world(); body(w, 'a', 10); body(w, 'b', 30); body(w, 'friend', 10); body(w, 'dead', 11, 4, 0); body(w, 'enemy', 31, 4);
    const a = start(w, 'a', safe), b = start(w, 'b', safe);
    w.tick(); expect(a()).toEqual({ phase: 'windup', cd: 6 }); expect(b()).toEqual({ phase: 'ready', cd: 0 });
    const empty = world(); body(empty, 'alone', 0); const alone = start(empty, 'alone', safe);
    empty.tick(); expect(alone()).toEqual({ phase: 'windup', cd: 6 });
  });
  it('closed circle excludes diagonal beyond radius and includes exact border', () => {
    const w = world(); body(w, 'a', 0); body(w, 'enemy', 3, 4); w.tick();
    expect(checkEntity(w, 'a', safe)).toBe(false);
    w.getComponent<Transform>('enemy', 'Transform')!.y = 3; w.tick();
    expect(checkEntity(w, 'a', safe)).toBe(true);
  });
  it('moving source range uses frame start rather than already moved coordinates', () => {
    const w = world(); body(w, 'a', 0, 2, 10, 5); body(w, 'b', 4, 4); w.tick();
    expect(checkEntity(w, 'b', { range: { originEntity: 'a', min: 4, max: 4 } })).toBe(true);
    w.tick(); expect(checkEntity(w, 'b', { range: { originEntity: 'a', min: 4, max: 4 } })).toBe(false);
  });
  it('invalid ranges and neighborhood bounds fail closed; missing snapshot is not live fallback', () => {
    const w = world(); body(w, 'a', 0); body(w, 'b', 1, 4);
    expect(checkEntity(w, 'a', safe)).toBe(false); w.tick();
    for (const min of [-1, NaN, Infinity, 11]) expect(checkEntity(w, 'b', { range: { originEntity: 'a', min, max: 10 } })).toBe(false);
    for (const radius of [-1, NaN, Infinity]) expect(checkEntity(w, 'a', { neighborhood: { radius, count: { max: 0 } } })).toBe(false);
    for (const count of [{ min: 1, max: 0 }, { min: .5 }, { max: Infinity }]) expect(checkEntity(w, 'a', { neighborhood: { radius: 3, count } })).toBe(false);
    w.getComponent<FrameStartTransform>('a', 'FrameStartTransform')!.x = NaN;
    expect(checkEntity(w, 'a', safe)).toBe(false);
  });
  it('aim is captured from frame-start direction and remains stable after target movement', () => {
    const w = world(); body(w, 'a', 0); body(w, 'b', 3, 4, 10, 7);
    w.getComponent<Transform>('b', 'Transform')!.y = 4;
    w.addComponent('a', { type: 'Relation', kind: 'target', targetId: 'b' } as Relation);
    start(w, 'a', { aliveResource: 'hp' }, true);
    const flow = w.getComponent<GameFlow>('a-flow', 'GameFlow')!;
    flow.states[0].transitions![0].captureTarget!.captureAim = true;
    w.tick(); expect(flow.targetSnapshot!.aim).toEqual({ x: .6, y: .8 });
    w.tick(); expect(flow.targetSnapshot!.aim).toEqual({ x: .6, y: .8 });
  });
  it('aim opt-in at coincident centers uses +x', () => {
    const w = world(); body(w, 'a', 0); body(w, 'b', 0, 4);
    w.addComponent('a', { type: 'Relation', kind: 'target', targetId: 'b' } as Relation);
    start(w, 'a', { aliveResource: 'hp' }, true);
    const flow = w.getComponent<GameFlow>('a-flow', 'GameFlow')!;
    flow.states[0].transitions![0].captureTarget!.captureAim = true;
    w.tick(); expect(flow.targetSnapshot!.aim).toEqual({ x: 1, y: 0 });
  });
});
