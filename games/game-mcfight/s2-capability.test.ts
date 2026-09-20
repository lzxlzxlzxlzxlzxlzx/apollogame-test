import { describe, it, expect } from 'vitest';
import { motionApplyCapability } from '@skills/tier1/motion-apply.js';
import { World } from '@engine/core/world.js';
import type { Component } from '@engine/core/types.js';
import { aggroCapability } from '@skills/tier3/aggro.js';
import { casterCapability } from '@skills/tier3/caster.js';
import { selfRuleCapability } from '@skills/tier2/self-rule.js';
import { timerCapability } from '@skills/atoms/timer/index.js';
import { hitboxCapability } from '@skills/tier2/hitbox.js';
import { resourceCapability } from '@skills/atoms/resource/index.js';
import { nearestByTag } from '@skills/atoms/spatial-query/index.js';
import { instantiate } from '@skills/tier3/prefab.js';

// Experimental fixture only. Not approved balance, timing, or interruption rules.
const ENEMY = 2, WINDOW = 4;
function add(w: World, id: string, ...cs: object[]) {
  w.createEntity(id);
  for (const c of cs) w.addComponent(id, c as Component);
}
const xf = (x: number) => ({ type: 'Transform', x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
const read = (w: World, id: string, type: string): any => w.getComponent(id, type);
function make(...caps: Array<{ systems: readonly any[] }>) {
  const w = new World();
  if (caps.includes(aggroCapability)) for (const system of motionApplyCapability.systems) w.addSystem(system);
  for (const c of caps) for (const s of c.systems) w.addSystem(s);
  return w;
}

describe('MC Fight S2: observed capability contracts, NOT stage acceptance', () => {
  it('V01 alternative: prefab local references namespace cast signals for identical templates', () => {
    const w = make(casterCapability);
    const template = { entities: { body: {
      Transform: xf(0),
      Caster: { onSignal: '@local:body', template: 'strike', at: 'self' },
    } } };
    instantiate(w, template, 'flyer', 0, 0, 0);
    instantiate(w, template, 'flyer', 1, 10, 0);
    const a = 'flyer#0:body', b = 'flyer#1:body';
    expect(read(w, a, 'Caster').onSignal).toBe(a);
    expect(read(w, b, 'Caster').onSignal).toBe(b);
    add(w, 'input', { type: 'Signal', name: a, source: a });
    w.tick();
    expect(read(w, a, 'SpawnRequest')).toBeDefined();
    expect(read(w, b, 'SpawnRequest')).toBeUndefined();
    expect(template.entities.body.Caster.onSignal).toBe('@local:body');
  });
  it('V01 counterexample: source A with shared signal also fires B', () => {
    const w = make(casterCapability);
    for (const id of ['a', 'b']) add(w, id, xf(0), { type: 'Caster', onSignal: 'cast', template: 'strike', at: 'self' });
    add(w, 'input', { type: 'Signal', name: 'cast', source: 'a' });
    w.tick();
    expect(read(w, 'a', 'SpawnRequest')).toBeDefined();
    expect(read(w, 'b', 'SpawnRequest')).toBeDefined();
  });

  it('V01 partial composition: identical local timer/rule, staggered trigger and separate targets', () => {
    const w = make(timerCapability, aggroCapability, selfRuleCapability);
    add(w, 'left', xf(1), { type: 'Tag', flags: ENEMY });
    add(w, 'right', xf(99), { type: 'Tag', flags: ENEMY });
    for (const [id, x, elapsed] of [['a', 0, 1], ['b', 100, 0]] as const) {
      add(w, id, xf(x), { type: 'Perception', targetTag: ENEMY, sightRadius: 20 },
        { type: 'Timer', id: 'cd', elapsed, duration: 3, loop: false },
        { type: 'State', fsmId: 'skill', current: 'waiting', previous: 'waiting' },
        { type: 'SelfRule', when: { kind: 'timer', id: 'cd', cmp: 'gte', value: 3 }, once: true,
          do: [{ kind: 'set-state', value: 'fired' }, { kind: 'spawn', template: 'strike', at: 'target' }] });
    }
    w.tick(); w.tick();
    expect(read(w, 'a', 'State').current).toBe('fired');
    expect(read(w, 'b', 'State').current).toBe('waiting');
    expect(read(w, 'self-spawn:a', 'SpawnRequest')).toMatchObject({ source: 'a', x: 1 });
    expect(read(w, 'self-spawn:b', 'SpawnRequest')).toBeUndefined();
    w.tick();
    expect(read(w, 'self-spawn:b', 'SpawnRequest')).toMatchObject({ source: 'b', x: 99 });
    // This proves a one-shot wait, not a renewable multi-skill cooldown lifecycle.
  });

  it('V03 counterexample: pursuit Relation is reselected next tick', () => {
    const w = make(aggroCapability);
    add(w, 'a', xf(0), { type: 'Perception', targetTag: ENEMY, sightRadius: 100 });
    add(w, 'first', xf(1), { type: 'Tag', flags: ENEMY });
    add(w, 'second', xf(10), { type: 'Tag', flags: ENEMY });
    w.tick(); expect(read(w, 'a', 'Relation').targetId).toBe('first');
    read(w, 'first', 'Transform').x = 20;
    w.tick(); expect(read(w, 'a', 'Relation').targetId).toBe('second');
  });

  it('V04 partial: damage checks individual current window status and enemy tag', () => {
    const w = make(hitboxCapability, resourceCapability);
    for (const id of ['a', 'b', 'friend']) add(w, id,
      { type: 'Tag', flags: id === 'friend' ? 8 : ENEMY },
      { type: 'Status', flags: id === 'b' ? 0 : WINDOW },
      { type: 'Resource', id: 'hp', current: 100, min: 0, max: 100 });
    add(w, 'strike', { type: 'Hitbox', resource: 'hp', amount: 10, targetMask: ENEMY, requireMask: WINDOW });
    // Inject contact facts only; no movement/collision claim. Real hitbox and resource settlement.
    for (const id of ['a', 'b', 'friend']) add(w, `contact-${id}`, { type: 'Trigger', zone: 'strike', other: id });
    w.tick();
    expect(['a', 'b', 'friend'].map(id => read(w, id, 'Resource').current)).toEqual([90, 100, 100]);
    read(w, 'a', 'Status').flags = 0; read(w, 'b', 'Status').flags = WINDOW;
    w.tick();
    expect(['a', 'b', 'friend'].map(id => read(w, id, 'Resource').current)).toEqual([90, 90, 100]);
    console.log('V04 injected windows: tick1 hp=[90,100,100]; tick2 hp=[90,90,100]');
  });

  it('V04 counterexample: tag change after first spatial query remains stale until tick boundary', () => {
    const w = make();
    add(w, 'flyer', xf(1), { type: 'Tag', flags: WINDOW });
    expect(nearestByTag(w, 0, 0, WINDOW)).toBe('flyer');
    read(w, 'flyer', 'Tag').flags = 0;
    expect(nearestByTag(w, 0, 0, WINDOW)).toBe('flyer');
    w.tick();
    expect(nearestByTag(w, 0, 0, WINDOW)).toBeUndefined();
  });
});
