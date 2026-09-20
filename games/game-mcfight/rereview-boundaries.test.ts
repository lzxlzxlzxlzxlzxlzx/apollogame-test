// Source: independent Resolve rereview snapshot, 2026-09-13. Only fixture sourceCheck updated to match repaired B configuration; assertions preserved.
import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import { flowCapability } from '@skills/tier3/flow.js';
import { aggroCapability } from '@skills/tier3/aggro.js';
import { steeringCapability } from '@skills/tier2/steering.js';
import { motionApplyCapability } from '@skills/tier1/motion-apply.js';
import { overlapDetectCapability } from '@skills/atoms/overlap-detect/index.js';
import { triggerZoneCapability, ZONE_FLAG } from '@skills/tier2/trigger-zone.js';
import { hitboxCapability } from '@skills/tier2/hitbox.js';
import { resourceCapability } from '@skills/atoms/resource/index.js';
import { destroyCapability } from '@skills/atoms/destroy/index.js';
import { mortalCapability } from '@skills/tier2/mortal.js';
import { eventWhenCapability } from '@skills/tier2/event-when.js';
import { casterCapability } from '@skills/tier3/caster.js';
import { prefabCapability } from '@skills/tier3/prefab.js';
import type { Component } from '@engine/core/types.js';

const FLYER = 2, GROUND = 4, GROUND_WINDOW = 8, FLIGHT = 16, HARD_CONTROL = 32;
const xf = (x: number) => ({ x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
function add(w: World, id: string, cs: Record<string, object>) { w.createEntity(id); for (const [type, value] of Object.entries(cs)) w.addComponent(id, { type, ...value } as Component); }
function world() {
  const w = new World();
  for (const c of [flowCapability, aggroCapability, steeringCapability, motionApplyCapability, overlapDetectCapability, triggerZoneCapability, hitboxCapability, resourceCapability, destroyCapability]) for (const s of c.systems) w.addSystem(s);
  add(w, 'flyer', { Transform: xf(0), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: FLYER }, Status: { flags: FLIGHT }, Perception: { targetTag: GROUND, sightRadius: 20 }, Steering: { mode: 'seek', speed: 2, stopRange: 0, haltStatusMask: FLIGHT }, Resource: { id: 'hp', current: 30, min: 0, max: 30 }, GameFlow: { id: 'dive', current: 'Ready', entered: false, states: [
    { id: 'Ready', transitions: [{ when: { kind: 'always' }, to: 'Dive' }] },
    { id: 'Dive', onEnter: [{ kind: 'set-status', targetId: String(FLIGHT), targetEntity: 'flyer', value: false }, { kind: 'set-status', targetId: String(GROUND_WINDOW), targetEntity: 'flyer', value: true }], transitions: [{ after: 2, to: 'Rise' }] },
    { id: 'Rise', onEnter: [{ kind: 'set-status', targetId: String(GROUND_WINDOW), targetEntity: 'flyer', value: false }, { kind: 'set-status', targetId: String(FLIGHT), targetEntity: 'flyer', value: true }] },
  ] } });
  add(w, 'ground-target', { Transform: xf(6), Tag: { flags: GROUND } });
  add(w, 'ground-zone', { Transform: xf(6), Shape: { kind: 'circle', radius: 2 }, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'hp', amount: 5, targetMask: FLYER, requireMask: GROUND_WINDOW, consumeOnHit: true } });
  return w;
}

/** A second, deliberately offset copy.  The test keeps all combat work in the
 * engine systems: it only places the initial entities and advances frames. */
function twoFlyers() {
  const w = new World();
  for (const c of [flowCapability, aggroCapability, steeringCapability, motionApplyCapability, overlapDetectCapability, triggerZoneCapability, hitboxCapability, resourceCapability, destroyCapability]) for (const s of c.systems) w.addSystem(s);
  for (const [id, start, delay, targetTag] of [['alpha', 0, 0, GROUND], ['bravo', 10, 2, 64]] as const) {
    add(w, id, { Transform: xf(start), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: FLYER }, Status: { flags: FLIGHT }, Perception: { targetTag, sightRadius: 20 }, Steering: { mode: 'seek', speed: 2, stopRange: 0, haltStatusMask: FLIGHT }, Resource: { id: 'hp', current: 30, min: 0, max: 30 }, GameFlow: { id: `${id}-dive`, current: 'Ready', entered: false, states: [
      { id: 'Ready', transitions: [{ after: delay, when: { kind: 'always' }, to: 'Dive' }] },
      { id: 'Dive', onEnter: [{ kind: 'set-status', targetId: String(FLIGHT), targetEntity: id, value: false }, { kind: 'set-status', targetId: String(GROUND_WINDOW), targetEntity: id, value: true }], transitions: [{ after: 2, to: 'Rise' }] },
      { id: 'Rise', onEnter: [{ kind: 'set-status', targetId: String(GROUND_WINDOW), targetEntity: id, value: false }, { kind: 'set-status', targetId: String(FLIGHT), targetEntity: id, value: true }] },
    ] } });
    add(w, `${id}-target`, { Transform: xf(start + 6), Tag: { flags: targetTag } });
    add(w, `${id}-zone`, { Transform: xf(start + 4), Shape: { kind: 'circle', radius: 2 }, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'hp', amount: 5, targetMask: FLYER, requireMask: GROUND_WINDOW, consumeOnHit: true } });
  }
  return w;
}

function cancellableDive() {
  const w = world();
  // Keep the contact zone alive here: this verifies the closed window itself
  // blocks later collision damage, rather than relying on consumeOnHit cleanup.
  w.getComponent<any>('ground-zone', 'Hitbox')!.consumeOnHit = false;
  const flow = w.getComponent<any>('flyer', 'GameFlow')!;
  const dive = flow.states.find((state: any) => state.id === 'Dive');
  // A control input is an external fact; Flow owns the resulting close intent.
  dive.transitions.unshift({ whenEntities: [{ entityId: 'flyer', check: { rejectStatusMask: HARD_CONTROL }, not: true }], to: 'Aborted', do: [
    // Cancellation is a transition boundary, so it queues the close now; an
    // onEnter action would leave an unintended extra damage frame.
    { kind: 'set-status', targetId: String(GROUND_WINDOW), targetEntity: 'flyer', value: false },
    { kind: 'set-status', targetId: String(FLIGHT), targetEntity: 'flyer', value: true },
  ] });
  flow.states.push({ id: 'Aborted' });
  return w;
}

/** Ground melee is deliberately data-only: aggro selects a currently-grounded
 * flyer, Flow captures that entity at Windup, then Caster spawns a real zone at
 * the captured entity.  Changing flight/position during Windup must not replace
 * that captured target. */
function committedMelee() {
  const w = new World();
  for (const c of [flowCapability, aggroCapability, motionApplyCapability, eventWhenCapability, casterCapability, prefabCapability, overlapDetectCapability, triggerZoneCapability, hitboxCapability, resourceCapability, mortalCapability, destroyCapability]) for (const s of c.systems) w.addSystem(s);
  add(w, 'library', { PrefabLibrary: { seq: 0, templates: { strike: { entities: { zone: { Transform: xf(0), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'hp', amount: 7, targetMask: FLYER, consumeOnHit: true } } } } } } });
  add(w, 'flyer', { Transform: xf(4), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: FLYER }, Status: { flags: GROUND_WINDOW }, Resource: { id: 'hp', current: 30, min: 0, max: 30 }, Mortal: { resource: 'hp', atOrBelow: 0 } });
  add(w, 'melee', { Transform: xf(0), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: GROUND }, Status: { flags: 0 }, Perception: { targetTag: FLYER, sightRadius: 20, targetCheck: { rejectStatusMask: FLIGHT } }, Resource: { id: 'cd', current: 0, min: 0, max: 9 }, State: { fsmId: 'melee', current: 'Ready', previous: 'Ready' }, GameFlow: { id: 'melee', current: 'Ready', entered: false, states: [
    { id: 'Ready', transitions: [{ when: { kind: 'always' }, captureTarget: { sourceEntity: 'melee', check: { rejectStatusMask: FLIGHT, aliveResource: 'hp' } }, to: 'Windup', do: [{ kind: 'set-state', targetId: 'melee', value: 'Windup' }, { kind: 'modify-resource', targetId: 'cd', value: 1 }] }] },
    { id: 'Windup', transitions: [{ whenEntities: [{ entityId: 'melee', check: { rejectStatusMask: HARD_CONTROL }, not: true }], clearTarget: true, to: 'Recovery', do: [{ kind: 'set-state', targetId: 'melee', value: 'Recovery' }] }, { after: 1, to: 'Active', do: [{ kind: 'set-state', targetId: 'melee', value: 'Active' }] }] },
    { id: 'Active', transitions: [{ after: 0, clearTarget: true, to: 'Recovery', do: [{ kind: 'set-state', targetId: 'melee', value: 'Recovery' }] }] },
    { id: 'Recovery' },
  ] } });
  add(w, 'melee-release', { EventWhen: { signal: 'melee-active', mode: 'edge', when: { kind: 'state', fsmId: 'melee', equals: 'Active' } }, Caster: { onSignal: 'melee-active', template: 'strike', at: 'target', targetFlow: 'melee', sourceCheck: { rejectStatusMask: HARD_CONTROL }, targetCheck: { aliveResource: 'hp' } } });
  return w;
}

const rr=(w:World,id:string,type:string):any=>w.getComponent(id,type);
const sample=(w:World,tick:number)=>({tick,phase:rr(w,'melee','GameFlow').current,targetX:rr(w,'flyer','Transform').x,hp:rr(w,'flyer','Resource').current,control:rr(w,'melee','Status').flags,cd:rr(w,'melee','Resource').current,request:rr(w,'melee-release','SpawnRequest')??null,zones:w.query('PrefabOrigin').map(([id])=>({id,x:rr(w,id,'Transform')?.x}))});
describe('independent Resolve follow-up',()=>{
 it('committed moving target receives exactly one real hit',()=>{const w=committedMelee();w.addComponent('flyer',{type:'Velocity',vx:13,vy:0} as Component);w.addComponent('flyer',{type:'GameFlow',id:'rise',current:'Dive',entered:true,elapsed:1,states:[{id:'Dive',transitions:[{after:1,to:'Rise'}]},{id:'Rise',onEnter:[{kind:'set-status',targetId:String(GROUND_WINDOW),targetEntity:'flyer',value:false},{kind:'set-status',targetId:String(FLIGHT),targetEntity:'flyer',value:true}]}]} as Component);const trace=[];for(let t=1;t<=6;t++){w.tick();trace.push(sample(w,t));}console.log('REREVIEW_MOVING',JSON.stringify(trace));expect(rr(w,'flyer','Resource').current).toBe(23);});
 it('a moving production control zone arriving on release tick prevents the pending strike',()=>{const w=committedMelee();add(w,'control-zone',{Transform:xf(-6),Velocity:{vx:2,vy:0},Shape:{kind:'circle',radius:0.25},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'cd',amount:0,targetMask:GROUND,setMask:HARD_CONTROL,consumeOnHit:true}});const trace=[];for(let t=1;t<=6;t++){w.tick();trace.push(sample(w,t));}console.log('REREVIEW_RELEASE_CONTROL',JSON.stringify(trace));expect(trace[1].control).toBe(0);expect(trace[2].control&HARD_CONTROL).toBe(HARD_CONTROL);expect(rr(w,'flyer','Resource').current).toBe(30);});
 it('nonlethal stationary control still produces a real hit',()=>{const w=committedMelee();const trace=[];for(let t=1;t<=6;t++){w.tick();trace.push(sample(w,t));}console.log('REREVIEW_NORMAL',JSON.stringify(trace));expect(rr(w,'flyer','Resource').current).toBe(23);expect(w.query('PrefabOrigin')).toHaveLength(0);});
});
