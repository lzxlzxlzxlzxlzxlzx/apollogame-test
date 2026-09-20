import {sharedPoolSample,conversionSample} from './s2-c6-routing.fixture.js';
import { surround } from './s2-c3.fixture.js';
import { closeoutPulse } from './s2-c4.fixture.js';
import { projectile, beam, bombardment, summon, relationshipSkeleton, sustainedBeam } from './s2-c6.fixture.js';
import { scene, navigationScene } from './s2-v06.fixture.js';
import { axePlayback } from './s2-axe.fixture.js';
import { createMultiskill } from './s2-multiskill.fixture.js';
import { createR3IdentityScene } from './r3-identity.fixture.js';
import { world, twoFlyers, committedMelee, add, xf, FLYER, GROUND, GROUND_WINDOW, FLIGHT, HARD_CONTROL } from './s2-dive.fixture.js';
import type { Component } from '@engine/core/types.js';
import { ZONE_FLAG } from '@skills/tier2/trigger-zone.js';
const baseFactories = {
  multiskill: createMultiskill, axe: () => axePlayback(),
  dive: world, dual: twoFlyers, normal: committedMelee,
  moving: () => {
    const w = committedMelee();
    add(w, 'rise-controller', { GameFlow: { id: 'rise', current: 'Dive', entered: true, elapsed: 1, states: [
      { id: 'Dive', transitions: [{ after: 1, to: 'Rise' }] },
      { id: 'Rise', onEnter: [{ kind: 'set-status', targetId: String(GROUND_WINDOW), targetEntity: 'flyer', value: false }, { kind: 'set-status', targetId: String(FLIGHT), targetEntity: 'flyer', value: true }] },
    ] } });
    w.addComponent('flyer', { type: 'Velocity', vx: 13, vy: 0 } as Component); return w;
  },
  control: () => {
    const w = committedMelee();
    add(w, 'control-zone', { Transform: xf(-6), Velocity: { vx: 2, vy: 0 }, Shape: { kind: 'circle', radius: .25 }, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'cd', amount: 0, targetMask: GROUND, setMask: HARD_CONTROL, consumeOnHit: true } }); return w;
  },
  death: () => {
    const w = committedMelee();
    w.addComponent('melee', { type: 'Mortal', resource: 'cd', atOrBelow: 0 } as Component);
    add(w, 'lethal-zone', { Transform: xf(-6), Velocity: { vx: 2, vy: 0 }, Shape: { kind: 'circle', radius: .25 }, Tag: { flags: ZONE_FLAG }, Hitbox: { resource: 'cd', amount: 1, targetMask: GROUND, consumeOnHit: true } }); return w;
  },
  area: () => {
    const w = committedMelee();
    add(w, 'second-flyer', { Transform: xf(4), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: FLYER }, Status: { flags: GROUND_WINDOW }, Resource: { id: 'hp', current: 30, min: 0, max: 30 } }); return w;
  },
  reselect: () => {
    const w = committedMelee();
    w.getComponent<any>('melee','GameFlow')!.states[0].transitions[0].after = 1;
    add(w, 'alternate-flyer', { Transform: xf(6), Shape: { kind: 'circle', radius: 1 }, Tag: { flags: FLYER }, Status: { flags: GROUND_WINDOW }, Resource: { id: 'hp', current: 30, min: 0, max: 30 } });
    add(w, 'rise-controller', { GameFlow: { id: 'rise', current: 'Rise', entered: false, states: [{ id: 'Rise', onEnter: [{ kind: 'set-status', targetId: String(GROUND_WINDOW), targetEntity: 'flyer', value: false }, { kind: 'set-status', targetId: String(FLIGHT), targetEntity: 'flyer', value: true }] }] } }); return w;
  },
};

/**
 * Observation-only B3 factories.  These deliberately return the exact World
 * assembled by the production R3 identity fixture; the visual page must not
 * use a hand-authored substitute for charge, dive, or transformation.
 */
const b3IdentityWorld = (unitId:string, offsets:readonly [number,number]) =>
  createR3IdentityScene(unitId, offsets, 100000).world;


export const factories = {
 ...baseFactories,
 v06Approach:()=>scene(),v06Stacked:()=>scene(true),v06Wall:()=>scene(false,true),v06Corner:()=>navigationScene(),v06Disconnected:()=>navigationScene(false),
 axeLeft: () => axePlayback(() => {const w=committedMelee();w.getComponent<any>('flyer','Transform')!.x=-4;return w;}),
 axeControl: () => axePlayback(baseFactories.control),
 axeDeath: () => axePlayback(baseFactories.death),
 axeMoving: () => axePlayback(baseFactories.moving),
 closeoutSurround:()=>surround(6), closeoutPulse:()=>closeoutPulse(.5),
 closeoutControl:()=>closeoutPulse(.5,"control"), closeoutDeath:()=>closeoutPulse(.5,"death"),
 projectile:()=>projectile(), projectileMiss:()=>projectile(true), beam:()=>beam(),
 sustainedBeam:()=>sustainedBeam(), beamControl:()=>sustainedBeam("control"),
 bombardment:()=>bombardment(), bombardmentHit:()=>bombardment(false), summon, relationshipSkeleton, sharedPoolSample, conversionSample,
 b3Charge:()=>b3IdentityWorld('elephant',[5,5]),
 b3Dive:()=>b3IdentityWorld('vex',[2,2]),
 b3Transform:()=>{
   const w=b3IdentityWorld('alexsmobs_warped_mosco',[3,3]);
   const body=w.getComponent<any>('a#0:body','Resource');
   body.current=body.max*.25;
   return w;
 },
};

