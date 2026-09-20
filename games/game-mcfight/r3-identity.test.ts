import { it,expect } from 'vitest';
import type { Component } from '@engine/core/types.js';
import type { GameFlow, Resource,Transform,Tag } from '@engine/protocol/components.js';
import { r3Catalog } from './content/r3-catalog.js';
import { createR3IdentityScene } from './r3-identity.fixture.js';
import { transform } from './world.js';
it('melee family uses normalized real speed and independent staggered starts/CD at the distance boundary',()=>{
 const scene=createR3IdentityScene('vindicator',[.01,5]),unit=r3Catalog.units.find(u=>u.id==='vindicator')!;
 try{
  scene.step();expect(scene.world.getComponent<Transform>('b#0:body','Transform')!.x-100).toBeCloseTo(unit.speed/20,10);
  for(let t=0;t<220;t++)scene.step();
  const first=(instance:string)=>scene.trace.find(r=>r.instance===instance&&r.phase==='Windup')!;
  expect(first('a').tick).toBe(1);expect(first('b').tick).toBeGreaterThan(first('a').tick);
  expect(scene.trace.filter(r=>r.instance==='b'&&r.tick<first('b').tick).every(r=>r.phase==='Ready')).toBe(true);
  expect(first('a').target).toBe('a-target');expect(first('b').target).toBe('b-target');
  expect(scene.receipts.filter(r=>r.source==='b#0:body'&&r.actual>0).length).toBeGreaterThanOrEqual(3);
 }finally{scene.dispose();}
 const arthropod=createR3IdentityScene('dread_spider');try{expect(arthropod.world.getComponent<Tag>('a#0:body','Tag')!.flags&16).toBe(16);}finally{arthropod.dispose();}
});
it('circle area family hits two enemies once each, checks current air eligibility and leaves no region',()=>{
 const s=createR3IdentityScene('alexscaves_atlatitan');try{
  for(const[id,x,tag,status]of [['extra-enemy',1,4,8],['air-enemy',1.2,4,4],['friend',1.4,2,8]] as const){
   s.world.createEntity(id);for(const[type,v]of Object.entries({Transform:transform(x,0),Shape:{kind:'circle',radius:.2},Tag:{flags:tag},Status:{flags:status},Resource:{id:'hp',current:100,min:0,max:100},DamageReceiver:{resource:'hp'}}))s.world.addComponent(id,{type,...v} as Component);
  }
  for(let i=0;i<15;i++)s.step();
  const hits=s.receipts.filter(h=>h.source==='a#0:body');
  expect(hits.filter(h=>h.target==='a-target')).toHaveLength(1);expect(hits.filter(h=>h.target==='extra-enemy')).toHaveLength(1);
  expect(s.world.getComponent<Resource>('air-enemy','Resource')!.current).toBe(100);expect(s.world.getComponent<Resource>('friend','Resource')!.current).toBe(100);
  expect(s.world.query('Hitbox')).toEqual([]);
 }finally{s.dispose();}
});
it.each(r3Catalog.units.filter(u=>r3Catalog.decisions.find(d=>d.id===u.decisionProfileId)!.candidates.length===1).map(u=>u.id))('R3 identity %s: real primary attack, independent instances and source-death cleanup',id=>{
 const scene=createR3IdentityScene(id),w=scene.world;
 try{
  const skill=r3Catalog.templates.find(t=>t.id===r3Catalog.decisions.find(d=>d.id===r3Catalog.units.find(u=>u.id===id)!.decisionProfileId)!.candidates[0])!;
  for(let t=0;t<skill.cd*3+20;t++)scene.step();
  for(const instance of ['a','b']){
   // Periodic statuses retain their source snapshot after the caster dies.
   // This generic primary-attack test is only about direct releases; status
   // lifecycle is covered by the dedicated B2/B3 status suites.
   const hits=scene.receipts.filter(h=>h.source===`${instance}#0:body`&&h.actual>0&&h.origin!=='periodic');
   expect(hits.length).toBeGreaterThanOrEqual(3);
   expect(hits.every(h=>h.target===`${instance}-target`)).toBe(true);
   for(const hit of hits){expect(hit.raw).toBe(skill.damage);expect(hit.actual).toBeCloseTo(hit.afterArmor,8);}
   // Multi-shot and channeled B2 skills intentionally have intra-cast hits;
   // their cadence is asserted by r3-b2-production instead of this one-hit family check.
   if(!['blaze','iceandfire_stymphalianbird','twilightforest_fire_beetle','twilightforest_winter_wolf'].includes(id))
    for(let i=1;i<hits.length;i++)expect(hits[i]!.tick-hits[i-1]!.tick).toBeGreaterThanOrEqual(skill.cd);
  }
  const flows=w.query('GameFlow').map(([e])=>w.getComponent<GameFlow>(e,'GameFlow')!);
  expect(flows).toHaveLength(2);expect(flows[0]).not.toBe(flows[1]);
  // External attack input creates a real region; collision and production damage
  // route must perform the kill. No health assignment or injected Trigger.
  w.createEntity('hostile');w.addComponent('hostile',{type:'Resource',id:'hp',current:1,min:0,max:1} as Resource);
  w.createEntity('fatal-zone');
  for(const [type,data]of Object.entries({Transform:transform(),Shape:{kind:'circle',radius:.01},Tag:{flags:1},Sensor:{},PrefabOrigin:{source:'hostile',instanceId:'fatal',templateId:'external-input'},Hitbox:{resource:'hp',amount:1e6,damageType:'true',targetMask:2,onlyTarget:'a#0:body',consumeOnHit:true}}))w.addComponent('fatal-zone',{type,...data} as Component);
  scene.step();expect(w.hasComponent('a#0:body','Resource')).toBe(false);
  const direct=(instance:string)=>scene.receipts.filter(h=>h.source===`${instance}#0:body`&&h.origin!=='periodic');
  const count=direct('a').length,other=direct('b').length;
  for(let t=0;t<skill.cd+20;t++)scene.step();
  expect(direct('a')).toHaveLength(count);
  expect(direct('b').length).toBeGreaterThan(other);
  expect(w.getAllEntities().filter(e=>e.startsWith('a#0:'))).toEqual([]);
 }finally{scene.dispose();expect(w.getAllEntities()).toEqual([]);}
});
