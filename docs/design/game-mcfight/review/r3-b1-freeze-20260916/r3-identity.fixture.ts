import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { instantiate } from '@skills/tier3/prefab.js';
import type { DamageRequest, GameFlow, Resource, State, Timer, ProjectileFlight, Transform, Trigger } from '@engine/protocol/components.js';
import type { Component } from '@engine/core/types.js';
import { assembleCombatWorld, buildCombatUnitTemplate } from './s4-world.js';
import { r3Catalog } from './content/r3-catalog.js';
import { transform } from './world.js';
/** Production composition used by identity tests and the observation entry. */
export function createR3IdentityScene(unitId:string,targetOffsets:readonly [number,number]=[.01,.01]){
 const engine=new Engine({tickRate:20});assembleCombatWorld(engine,r3Catalog,'r3');
 const w=engine.world,unit=r3Catalog.units.find(u=>u.id===unitId);
 if(!unit)throw Error(`No verified adapter: ${unitId}`);
 const template=buildCombatUnitTemplate(r3Catalog,'r3',unitId,1);
 for(const [instance,x]of [['a',0],['b',100]] as const){
  instantiate(w,template,instance,0,x,0);
  w.createEntity(`${instance}-target`);
  for(const [type,data]of Object.entries({Transform:transform(x+targetOffsets[instance==='a'?0:1],0),Shape:{kind:'circle',radius:unit.radius},Tag:{flags:4},Status:{flags:8},Resource:{id:'hp',current:100000,min:0,max:100000},DamageReceiver:{resource:'hp',armor:8,toughness:2},Mortal:{resource:'hp',atOrBelow:0}}))w.addComponent(`${instance}-target`,{type,...data} as Component);
 }
 w.getComponent<State>('session','State')!.current='battle';
 const receipts:{tick:number;source:string;target:string;raw:number;afterArmor:number;actual:number}[]=[];
 const flightTrace:{tick:number;id:string;x:number;y:number;source:string|null;exhausted:boolean}[]=[];
 const projectileHits:{tick:number;projectile:string;target:string}[]=[];
 const trace:{tick:number;instance:string;phase:string;target:string|null;cd:number;hp:number;zones:number}[]=[];
 let tick=0,pending:DamageRequest[]=[];
 w.setObserver({onSystemStart:s=>{if(s.id==='damage-route')pending=w.query('DamageRequest').map(([id])=>w.getComponent<DamageRequest>(id,'DamageRequest')!); if(s.id==='hitbox') for(const [tid] of w.query('Trigger')) { const tr=w.getComponent<Trigger>(tid,'Trigger')!, f=w.getComponent<ProjectileFlight>(tr.zone,'ProjectileFlight'); if(f) projectileHits.push({tick,projectile:tr.zone,target:tr.other}); }},onSystemEnd:s=>{
  if(s.id==='damage-route')for(const hit of pending)receipts.push({tick,source:hit.source,target:hit.target,raw:hit.amount,afterArmor:hit.afterArmorAmount??hit.amount,actual:hit.appliedAmount??0});
 }});
 return {engine,world:w,unitId,receipts,trace,flightTrace,projectileHits,step(){
  tick++;w.tick(); for(const [id] of w.query('ProjectileFlight','Transform')) { const f=w.getComponent<ProjectileFlight>(id,'ProjectileFlight')!, t=w.getComponent<Transform>(id,'Transform')!; flightTrace.push({tick,id,x:t.x,y:t.y,source:f.shot?.source??null,exhausted:!!f.exhausted}); }
  for(const instance of ['a','b']){
   const id=`${instance}#0:${r3Catalog.decisions.find(d=>d.id===unit.decisionProfileId)!.candidates[0]}`;
   const flow=w.getComponent<GameFlow>(id,'GameFlow');
   trace.push({tick,instance,phase:flow?.current??'destroyed',target:flow?.targetSnapshot?.targetId??null,cd:w.getComponent<Timer>(id,'Timer')?.elapsed??-1,hp:w.getComponent<Resource>(`${instance}-target`,'Resource')?.current??0,zones:w.query('Hitbox').length});
  }
 },dispose(){w.setObserver(undefined);engine.stop();for(const id of w.getAllEntities())w.destroyEntity(id);}};
}
