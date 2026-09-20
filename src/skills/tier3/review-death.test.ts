import { describe, it, expect, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Caster, DebugTrace, GameFlow, Resource, SpawnRequest, Transform } from '@engine/protocol/components.js';
import { casterCapability } from './caster.js';
import { resourceCapability } from '@atom-skills/index.js';
import { mortalCapability } from '@skills/tier2/mortal.js';
import { destroyCapability } from '@skills/atoms/destroy/index.js';
import { hashSnapshot } from '@net/determinism.js';

// Capability contract tests: a captured identity is input, not a simulated lifecycle.
// Signals/death are external inputs; the public caster/resource/mortal systems execute effects.
function fixture(): World {
  const w = new World();
  for (const s of casterCapability.systems) w.addSystem(s);
  for (const [id, x] of [['source', 0], ['locked', 10], ['replacement', 1]] as const) {
    w.createEntity(id);
    w.addComponent(id, { type: 'Transform', x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent(id, { type: 'Resource', id: 'hp', current: 10, min: 0, max: 10 } as Resource);
    w.addComponent(id, { type: 'Tag', flags: 3 });
  }
  w.addComponent('source', { type: 'Relation', kind: 'target', targetId: 'replacement' });
  w.createEntity('skill');
  w.addComponent('skill', {
    type: 'GameFlow', id: 'skill', current: 'active', entered: true, states: [{ id: 'active' }],
    targetSnapshot: { sourceId: 'source', targetId: 'locked' },
  } as GameFlow);
  w.addComponent('skill', {
    type: 'Caster', onSignal: 'fire', template: 'marker', at: 'target', targetFlow: 'skill',
    targetCheck: { aliveResource: 'hp' }, sourceCheck: { aliveResource: 'hp' },
  } as Caster);
  w.createEntity('input');
  w.addComponent('input', { type: 'Signal', name: 'fire', source: 'input' });
  return w;
}
const request = (w: World) => w.getComponent<SpawnRequest>('skill', 'SpawnRequest');


describe('independent same tick death reproduction',()=>{it.each(['source','locked'])('pending lethal damage to %s rejects release',(id)=>{const w=fixture();for(const cap of [resourceCapability,mortalCapability,destroyCapability])for(const system of cap.systems)w.addSystem(system);w.addComponent(id,{type:'Mortal',resource:'hp',atOrBelow:0});w.addComponent(id,{type:'ResourceModify',resourceId:'hp',amount:-10,scope:'local'});w.tick();console.log('REVIEW_DEATH',JSON.stringify({id,order:w.getSortedSystems().map(s=>({id:s.id,phase:s.phase??0})),alive:w.getAllEntities().includes(id),request:request(w)}));expect(request(w)).toBeUndefined();});});

import { prefabCapability } from '@skills/tier3/prefab.js';
import { overlapDetectCapability } from '@skills/atoms/overlap-detect/index.js';
import { triggerZoneCapability,ZONE_FLAG } from '@skills/tier2/trigger-zone.js';
import { hitboxCapability } from '@skills/tier2/hitbox.js';
it('pending source lethal damage must not produce a real late strike',()=>{
 const w=fixture();for(const cap of [prefabCapability,overlapDetectCapability,triggerZoneCapability,hitboxCapability,resourceCapability,mortalCapability,destroyCapability])for(const system of cap.systems)w.addSystem(system);
 w.createEntity('library');w.addComponent('library',{type:'PrefabLibrary',seq:0,templates:{marker:{entities:{zone:{Transform:{x:0,y:0,rotation:0,scaleX:1,scaleY:1},Shape:{kind:'circle',radius:1},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'hp',amount:7,targetMask:3,consumeOnHit:true}}}}}});
 w.addComponent('locked',{type:'Tag',flags:2});w.addComponent('locked',{type:'Shape',kind:'circle',radius:1});w.addComponent('source',{type:'Mortal',resource:'hp',atOrBelow:0});w.addComponent('source',{type:'ResourceModify',resourceId:'hp',amount:-10,scope:'local'});w.tick();console.log('REVIEW_DEATH_REAL_HIT',JSON.stringify({sourceExists:w.getAllEntities().includes('source'),targetHP:w.getComponent<Resource>('locked','Resource')!.current,remainingZones:w.query('PrefabOrigin').length}));expect(w.getComponent<Resource>('locked','Resource')!.current).toBe(10);
});
