import { it,expect } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type { Component } from '@engine/core/types.js';
import type { DamageRequest,QualifiedDamage,LastDamage,Resource,Hitbox } from '@engine/protocol/components.js';
import { s4Capabilities } from './s4-world.js';
import { transform } from './world.js';
function setup(){
 // over-time is already part of the assembled production capability set.
 // Loading it twice ran each periodic effect twice per tick and fabricated a
 // duplicate scheduling cycle in this routing probe.
 const engine=new Engine({tickRate:20});engine.load({capabilities:s4Capabilities,entities:{}});const w=engine.world;
 const add=(id:string,data:Record<string,object>)=>{w.createEntity(id);for(const[type,v]of Object.entries(data))w.addComponent(id,{type,...v} as Component);};
 for(const[id,x,flags]of [['lich-a',-4,18],['lich-b',4,20],['ordinary',10,4]] as const)add(id,{Transform:transform(x,0),Shape:{kind:'circle',radius:.2},Tag:{flags},Resource:{id:'hp',current:10,min:0,max:10},DamageReceiver:{resource:'hp'},Mortal:{resource:'hp',atOrBelow:0}});
 add('target',{Transform:transform(),Shape:{kind:'circle',radius:.3},Tag:{flags:8},Resource:{id:'hp',current:50,min:0,max:50},DamageReceiver:{resource:'hp',armor:20,toughness:8},Mortal:{resource:'hp',atOrBelow:0},DeathConversion:{resource:'hp',remaining:1,sourceMask:16,retainQualifiedSource:true,rules:[{template:'team-a',requireSourceTag:2},{template:'team-b',requireSourceTag:4}]}});
 add('library',{PrefabLibrary:{seq:0,templates:Object.fromEntries([['team-a',2],['team-b',4]].map(([name,flags])=>[name,{entities:{body:{Transform:transform(),Tag:{flags},Resource:{id:'hp',current:10,min:0,max:10}}}}]))}});
 const receipts:DamageRequest[]=[];let pending:DamageRequest[]=[];
 w.setObserver({onSystemStart:s=>{if(s.id==='damage-route')pending=w.query('DamageRequest').map(([id])=>w.getComponent<DamageRequest>(id,'DamageRequest')!);},onSystemEnd:s=>{if(s.id==='damage-route')receipts.push(...pending.map(p=>({...p})));}});
 let serial=0;
 return{w,receipts,fire(source:string,amount:number,extra:Partial<Hitbox>={},x=0){add(`input-${serial++}`,{Transform:transform(x,0),Shape:{kind:'circle',radius:.1},Tag:{flags:1},Hitbox:{resource:'hp',amount,damageType:'true',targetMask:8,consumeOnHit:true,...extra},PrefabOrigin:{source,templateId:'external-attack'}});},dispose(){w.setObserver(undefined);engine.stop();for(const id of w.getAllEntities())w.destroyEntity(id);}};
}
it('M06 qualified direct mark survives ordinary/indirect hits and source death; last qualifying source selects team once',()=>{
 const s=setup();try{
  s.fire('lich-a',5);s.w.tick();expect(s.w.getComponent<QualifiedDamage>('target','QualifiedDamage')!.source).toBe('lich-a');
  s.fire('ordinary',2);s.w.tick();expect(s.w.getComponent<LastDamage>('target','LastDamage')!.source).toBe('ordinary');expect(s.w.getComponent<QualifiedDamage>('target','QualifiedDamage')!.source).toBe('lich-a');
  s.fire('lich-b',3);s.w.tick();s.fire('lich-a',1,{damageOrigin:'indirect'});s.w.tick();
  expect(s.w.getComponent<QualifiedDamage>('target','QualifiedDamage')!.source).toBe('lich-b');
  s.fire('ordinary',100,{targetMask:4,onlyTarget:'lich-b'},4);s.w.tick();expect(s.w.hasComponent('lich-b','Resource')).toBe(false);
  expect(s.w.getComponent<QualifiedDamage>('target','QualifiedDamage')!.sourceTags).toBe(20);
  s.fire('ordinary',100);s.w.tick();
  // Existing death-conversion queues a normal prefab request in Resolve;
  // prefab-spawn consumes it on the next tick. Keep and explicitly test that contract.
  expect(s.w.hasComponent('target','Resource')).toBe(false);expect(s.w.hasComponent('convert:target','SpawnRequest')).toBe(true);
  s.w.tick();
  expect(s.w.getAllEntities().filter(id=>id.startsWith('team-b#'))).toHaveLength(1);expect(s.w.getAllEntities().some(id=>id.startsWith('team-a#'))).toBe(false);
  for(let i=0;i<4;i++)s.w.tick();expect(s.w.getAllEntities().filter(id=>id.startsWith('team-b#'))).toHaveLength(1);
 }finally{s.dispose();}
});
it('periodic real-hit effects report actual HP loss as true damage but never create a direct conversion mark',()=>{
 const s=setup();try{
  s.fire('lich-a',0,{dotPerTick:30,dotPeriod:1,dotDuration:3,routePeriodicDamage:true,dotEffectId:'poison'});
  s.w.tick();expect(s.w.getComponent<Resource>('target','Resource')!.current).toBe(20);expect(s.w.hasComponent('target','QualifiedDamage')).toBe(false);
  s.w.tick();const hits=s.receipts.filter(p=>p.origin==='periodic');expect(hits.map(p=>p.appliedAmount)).toEqual([30,20]);expect(hits.every(p=>p.source==='lich-a'&&p.armorUsed===0)).toBe(true);
  expect(s.w.getAllEntities().some(id=>id.startsWith('team-'))).toBe(false);
  s.w.tick();expect(s.receipts.filter(p=>p.origin==='periodic')).toHaveLength(2);
 }finally{s.dispose();}
});
it('routed periodic healing has a separate negative actual receipt and clamps overheal',()=>{
 const s=setup();try{
  s.fire('ordinary',7);s.w.tick();
  s.w.addComponent('target',{type:'OverTime',effects:[{id:'regen',resource:'hp',amountPerTick:20,period:1,duration:2,elapsed:0,damageRoute:{source:'ordinary',sourceTags:4}}]} as Component);
  s.w.tick();s.w.tick();expect(s.receipts.filter(p=>p.origin==='periodic').map(p=>p.appliedAmount)).toEqual([-7,0]);expect(s.w.hasComponent('target','QualifiedDamage')).toBe(false);
 }finally{s.dispose();}
});
