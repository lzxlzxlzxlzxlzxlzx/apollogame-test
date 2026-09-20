import { committedMelee } from './s2-dive.fixture.js';
import { animStateCapability } from '@skills/tier2/anim-state.js';
import type { Component } from '@engine/core/types.js';
// Temporary interface probe: frame numbers identify phases, not approved artwork.
export function axePlayback(makeWorld = committedMelee) {
  const w = makeWorld();
  for (const s of animStateCapability.systems) w.addSystem(s);
  const clips = Object.fromEntries(['Ready', 'Windup', 'Active', 'Recovery'].map((name,i) =>
    [name, { from:i*2, count:2, fps:1, loop:name==='Ready' }]));
  w.addComponent('melee', { type:'Frame', index:0, total:8 } as Component);
  w.addComponent('melee', { type:'AnimState', fsmId:'melee', interruptStatusMask:32, interruptClip:'Recovery', clips, idleClip:'Ready', moveClip:'Ready', current:'Ready', elapsed:0 } as Component);
  return w;
}


