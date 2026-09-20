import { hierarchyResolveCapability } from '@skills/tier1/hierarchy-resolve.js';
import { hierarchyCascadeCapability } from '@skills/tier1/hierarchy-cascade.js';
// V02 experiment: numbers and melee-first tie-break are not final balance rules.
import { World } from '@engine/core/world.js';
import type { PrefabTemplate } from '@engine/protocol/components.js';
import { instantiate, prefabCapability } from '@skills/tier3/prefab.js';
import { flowCapability } from '@skills/tier3/flow.js';
import { aggroCapability } from '@skills/tier3/aggro.js';
import { casterCapability } from '@skills/tier3/caster.js';
import { timerCapability } from '@skills/atoms/timer/index.js';
import { eventWhenCapability } from '@skills/tier2/event-when.js';
import { effectApplyCapability } from '@skills/tier2/effect-apply.js';
import { motionApplyCapability } from '@skills/tier1/motion-apply.js';
import { overlapDetectCapability } from '@skills/atoms/overlap-detect/index.js';
import { triggerZoneCapability, ZONE_FLAG } from '@skills/tier2/trigger-zone.js';
import { hitboxCapability } from '@skills/tier2/hitbox.js';
import { resourceCapability } from '@skills/atoms/resource/index.js';
import { mortalCapability } from '@skills/tier2/mortal.js';
import { destroyCapability } from '@skills/atoms/destroy/index.js';
import { add, xf } from './s2-round2.fixture.js';
export const caps = [timerCapability, flowCapability, aggroCapability, casterCapability, prefabCapability, eventWhenCapability, effectApplyCapability, motionApplyCapability, overlapDetectCapability, triggerZoneCapability, hitboxCapability, resourceCapability, mortalCapability, destroyCapability, hierarchyResolveCapability, hierarchyCascadeCapability];
export const FLIGHT = 16;
export const configs = {
  melee: { cd: 8, range: 3, damage: 7, radius: 1, reject: FLIGHT },
  ranged: { cd: 19, range: 30, damage: 11, radius: .5, reject: 0 },
};
// This builder only authors data before a World is run. All choice, lock, CD,
// transition, release and damage work belongs to the installed production systems.
export function unitTemplate(ranged = true, meleeDamage = 7, meleeRange = 3): PrefabTemplate {
  const entities: PrefabTemplate['entities'] = {
    body: { Transform: xf(0), Resource:{id:'hp',current:100,min:0,max:100}, Status:{flags:0}, Mortal:{resource:'hp',atOrBelow:0}, Perception:{targetTag:2,sightRadius:30,targetCheck:{aliveResource:'hp'}}, State: { fsmId: '@local:body', current: 'Free', previous: 'Free' } },
  };
  for (const skill of ranged ? ['melee', 'ranged'] as const : ['melee'] as const) {
    const cfg = configs[skill], ref = '@local:' + skill;
    const range = skill === 'melee' ? meleeRange : cfg.range;
    const stage = (value: string) => ({ kind: 'set-state', targetId: ref, value });
    entities[skill] = {
      Transform: xf(0), Hierarchy: { parentId: '@local:body',localX:0,localY:0,localRotation:0,localScaleX:1,localScaleY:1 },
      Perception: { targetTag: 2, sightRadius: range, targetCheck: { aliveResource: 'hp', rejectStatusMask: cfg.reject } },
      Timer: { id: ref, elapsed: cfg.cd, duration: cfg.cd, loop: false },
      Resource: { id: ref, current: 0, min: 0, max: 999 },
      State: { fsmId: ref, current: 'Ready', previous: 'Ready' },
      GameFlow: { id: ref, current: 'Ready', entered: false, states: [
        { id: 'Ready', transitions: [{
          when: { kind: 'and', of: [{ kind: 'state', fsmId: '@local:body', equals: 'Free' }, { kind: 'timer', id: ref, cmp: 'gte', value: cfg.cd }] },
          whenEntities:[{entityId:'@local:body',check:{aliveResource:'hp',rejectStatusMask:32}}],
          captureTarget: { sourceEntity: '@local:body', check: { aliveResource: 'hp', rejectStatusMask: cfg.reject, range: { originEntity: '@local:body', max: range } } },
          to: 'Windup', do: [stage('Windup'), { kind: 'set-state', targetId: '@local:body', value: skill }, { kind: 'modify-resource', targetId: ref, value: 1 }],
        }] },
        { id: 'Windup', transitions: [{ whenEntities:[{entityId:'@local:body',check:{aliveResource:'hp',rejectStatusMask:32},not:true}],to:'Recovery',clearTarget:true,do:[stage('Recovery')] }, { after: 1, to: 'Active', do: [stage('Active')] }] },
        { id: 'Active', transitions: [{ after: 0, to: 'Recovery', do: [stage('Recovery')] }] },
        { id: 'Recovery', transitions: [{ after: 1, to: 'Ready', clearTarget: true, do: [stage('Ready'), { kind: 'set-state', targetId: '@local:body', value: 'Free' }] }] },
      ] },
    };
    entities[skill + '-start'] = {
      Hierarchy:{parentId:'@local:body'},
      EventWhen: { signal: ref + '-start', mode: 'edge', when: { kind: 'state', fsmId: ref, equals: 'Windup' } },
      Effect: { onSignal: ref + '-start', kind: 'reset-timer', targetEntity: ref, value: cfg.cd },
    };
    entities[skill + '-release'] = {
      Hierarchy:{parentId:'@local:body'},
      EventWhen: { signal: ref + '-release', mode: 'edge', when: { kind: 'state', fsmId: ref, equals: 'Active' } },
      Caster: { onSignal: ref + '-release', targetFlow: ref, template: 'strike', at: 'target', sourceCheck:{aliveResource:'hp',rejectStatusMask:32}, targetCheck: { aliveResource: 'hp' }, overrides: { zone: { Hitbox: { amount: skill === 'melee' ? meleeDamage : cfg.damage }, Shape: { radius: skill === 'melee' ? meleeRange / 3 : cfg.radius } } } },
    };
  }
  return { entities };
}
export function createMultiskill(distance = 2, flight = false) {
  const w = new World(); for (const cap of caps) for (const system of cap.systems) w.addSystem(system);
  add(w, 'library', { PrefabLibrary: { seq: 0, templates: { strike: { entities: { zone: { Transform: xf(0), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'hp', amount: 7, targetMask: 2, consumeOnHit: true } } } } } } });
  instantiate(w, unitTemplate(), 'unit', 0, 0, 0);
  instantiate(w, unitTemplate(false, 13, 5), 'unit', 1, 100, 0);
  for (const [id, x] of [['target-a', distance], ['target-b', 104]] as const)
    add(w, id, { Transform: xf(x), Shape: { kind: 'circle', radius: .25 }, Tag: { flags: 2 }, Status: { flags: id === 'target-a' && flight ? FLIGHT : 0 }, Resource: { id: 'hp', current: 2000, min: 0, max: 2000 } });
  return w;
}
export function observeSkills(w: World, tick: number) {
  return ['unit#0:melee', 'unit#0:ranged', 'unit#1:melee'].map(id => {
    const read = (type: string): any => w.getComponent(id, type);
    return { tick, id, phase: read('GameFlow').current, locked: read('GameFlow').targetSnapshot?.targetId ?? null,
      casts: read('Resource').current, cd: Math.max(0, read('Timer').duration - read('Timer').elapsed) };
  });
}

