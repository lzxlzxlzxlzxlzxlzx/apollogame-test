// S2 experiment only: no production rules, custom systems or per-tick state writes.
import { World } from '@engine/core/world.js';
import type { Component } from '@engine/core/types.js';
import type { PrefabTemplate } from '@engine/protocol/components.js';
import { instantiate, prefabCapability } from '@skills/tier3/prefab.js';
import { flowCapability } from '@skills/tier3/flow.js';
import { timerCapability } from '@skills/atoms/timer/index.js';
import { eventWhenCapability } from '@skills/tier2/event-when.js';
import { effectApplyCapability } from '@skills/tier2/effect-apply.js';
import { casterCapability } from '@skills/tier3/caster.js';
import { aggroCapability } from '@skills/tier3/aggro.js';
import { motionApplyCapability } from '@skills/tier1/motion-apply.js';
import { resourceCapability } from '@skills/atoms/resource/index.js';
import { mortalCapability } from '@skills/tier2/mortal.js';
import { destroyCapability } from '@skills/atoms/destroy/index.js';
import { hierarchyCascadeCapability } from '@skills/tier1/hierarchy-cascade.js';

export const HARD_CONTROL = 4;

export const xf = (x: number) => ({ x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
const phase = (value: string) => [{ kind: 'set-state', targetId: '@local:body', value }];
export const UNIT: PrefabTemplate = { entities: {
  body: {
    Transform: xf(0), Perception: { targetTag: 2, sightRadius: 30 },
    State: { fsmId: '@local:body', current: 'Ready', previous: 'Ready' },
    Timer: { id: '@local:body', elapsed: 8, duration: 8, loop: false },
    Resource: { id: '@local:body', current: 0, min: 0, max: 999 },
    Status: { flags: 0 },
    GameFlow: { id: '@local:body', current: 'Ready', entered: false, states: [
      { id: 'Ready', transitions: [{ when: { kind: 'timer', id: '@local:body', cmp: 'gte', value: 8 }, whenEntities: [{ entityId: '@local:body', check: { rejectStatusMask: HARD_CONTROL } }], captureTarget: { sourceEntity: '@local:body', check: { aliveResource: 'hp' } }, to: 'Windup', do: [...phase('Windup'), { kind: 'modify-resource', targetId: '@local:body', value: 1 }] }] },
      // Flow defers onEnter: after:1 gives TWO post-tick Windup observations.
      { id: 'Windup', transitions: [
        { whenEntities: [{ entityId: '@local:body', check: { rejectStatusMask: HARD_CONTROL }, not: true }], clearTarget: true, to: 'Recovery', do: phase('Recovery') },
        { whenEntities: [{ targetFlow: '@local:body', check: { aliveResource: 'hp' }, not: true }], clearTarget: true, to: 'Recovery', do: phase('Recovery') },
        { after: 1, to: 'Active', do: phase('Active') },
      ] },
      { id: 'Active', transitions: [{ after: 0, to: 'Recovery', do: phase('Recovery') }] },
      { id: 'Recovery', transitions: [{ after: 1, clearTarget: true, to: 'Ready', do: phase('Ready') }] },
    ] },
  },
  start: { Hierarchy: { parentId: '@local:body' }, EventWhen: { signal: '@local:start', mode: 'edge', when: { kind: 'state', fsmId: '@local:body', equals: 'Windup' } },
    Effect: { onSignal: '@local:start', kind: 'reset-timer', targetEntity: '@local:body', value: 8 } },
  active: { Hierarchy: { parentId: '@local:body' }, EventWhen: { signal: '@local:active', mode: 'edge', when: { kind: 'state', fsmId: '@local:body', equals: 'Active' } },
    Caster: { onSignal: '@local:active', targetFlow: '@local:body', template: 'effect', at: 'target', sourceCheck: { rejectStatusMask: HARD_CONTROL }, targetCheck: { aliveResource: 'hp' } } },
} };

export function add(w: World, id: string, data: Record<string, object>) {
  w.createEntity(id);
  for (const [type, value] of Object.entries(data)) w.addComponent(id, { type, ...value } as Component);
}
export function createFixture(moving = false) {
  const w = new World();
  for (const cap of [timerCapability, flowCapability, eventWhenCapability, effectApplyCapability, aggroCapability, casterCapability, prefabCapability, motionApplyCapability, resourceCapability, mortalCapability, hierarchyCascadeCapability, destroyCapability]) {
    for (const system of cap.systems) w.addSystem(system);
  }
  add(w, 'library', { PrefabLibrary: { seq: 0, templates: { effect: { entities: { marker: { Transform: xf(0) } } } } } });
  instantiate(w, UNIT, 'unit', 0, 0, 0);
  instantiate(w, UNIT, 'unit', 1, 100, 0, { body: { Timer: { elapsed: 5 } } });
  add(w, 'a-original', { Transform: xf(1), Tag: { flags: 2 }, Resource: { id: 'hp', current: 100, min: 0, max: 100 }, Mortal: { resource: 'hp', atOrBelow: 0 }, ...(moving ? { Velocity: { vx: 10, vy: 0 } } : {}) });
  add(w, 'a-alternative', { Transform: xf(5), Tag: { flags: 2 }, Resource: { id: 'hp', current: 100, min: 0, max: 100 } });
  add(w, 'b-original', { Transform: xf(101), Tag: { flags: 2 }, Resource: { id: 'hp', current: 100, min: 0, max: 100 } });
  return w;
}

export function read(w: World, id: string, type: string): any { return w.getComponent(id, type); }
export function observe(w: World, tick: number) {
  return [0, 1].map(i => {
    const id = `unit#${i}:body`;
    const effects = w.query('PrefabOrigin').filter(([e]) => read(w, e, 'PrefabOrigin').source === id);
    return { tick, unit: id, skill: 'experiment', castOrdinal: read(w, id, 'Resource').current, phase: read(w, id, 'State').current,
      cooldown: 8 - read(w, id, 'Timer').elapsed, pursuit: read(w, id, 'Relation')?.targetId ?? null,
      lockedTarget: read(w, id, 'GameFlow')?.targetSnapshot?.targetId ?? null,
      effects: effects.length, effectX: effects.map(([e]) => read(w, e, 'Transform').x) };
  });
}
