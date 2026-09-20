import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type { Component } from '@engine/core/types.js';
import type { Resource, State, Transform, DamageRequest } from '@engine/protocol/components.js';
import { instantiate } from '@skills/tier3/prefab.js';
import { pathFollowAt,pathFollowCapability } from '@skills/tier2/path-follow.js';
import { assembleCombatWorld,buildCombatUnitTemplate } from './s4-world.js';
import { r3Catalog } from './content/r3-catalog.js';
import { transform } from './world.js';
function base(){const engine=new Engine({tickRate:20});assembleCombatWorld(engine,r3Catalog,'r3');engine.world.getComponent<State>('session','State')!.current='battle';return engine;}
function add(engine:Engine,id:string,data:Record<string,object>){const w=engine.world;w.createEntity(id);for(const[type,v]of Object.entries(data))w.addComponent(id,{type,...v} as Component);}
const pool=(hp:number)=>({Resource:{id:'hp',current:hp,min:0,max:hp},DamageReceiver:{resource:'hp'},Mortal:{resource:'hp',atOrBelow:0}});
export function createR3Boundary(kind:'SK10'|'SK22'|'SK24'){
 const engine=base(),w=engine.world;
 const log:{tick:number;positions:Record<string,[number,number]>;hp:Record<string,number>;sources:string[]}[]=[];
 let tick=0,pending:DamageRequest[]=[],sources:string[]=[];
 w.setObserver({onSystemStart:s=>{if(s.id==='damage-route')pending=w.query('DamageRequest').map(([id])=>w.getComponent<DamageRequest>(id,'DamageRequest')!);},onSystemEnd:s=>{if(s.id==='damage-route')sources.push(...pending.filter(p=>(p.appliedAmount??0)>0).map(p=>p.source));}});
 if(kind==='SK10'){
  for(const s of pathFollowCapability.systems)w.addSystem(s);
  for(const [id,y]of [['a',0],['b',10]] as const){
   add(engine,id,{Transform:transform(0,y),Shape:{kind:'circle',radius:.3},Tag:{flags:2},...pool(50),PathFollow:pathFollowAt([{x:4,y}],.2,{arriveRadius:.001,onEnd:{dropTemplate:'landing',destroy:true}})});
  }
  const lib=w.getComponent<any>('library','PrefabLibrary')!;
  lib.templates.landing={entities:{zone:{Transform:transform(),Shape:{kind:'circle',radius:.5},Tag:{flags:1},Hitbox:{resource:'hp',amount:5,targetMask:4,consumeOnHit:true},Timer:{id:'life',elapsed:0,duration:2,loop:false}}}};
  for(const[id,y]of [['a-target',0],['b-target',10]] as const)add(engine,id,{Transform:transform(4,y),Shape:{kind:'circle',radius:.3},Tag:{flags:4},...pool(50)});
 }else if(kind==='SK22'){
  for(const[id,x]of [['a',0],['b',20]] as const){
   add(engine,`${id}-head`,{Transform:transform(x,0),Shape:{kind:'circle',radius:.3},Tag:{flags:2},...pool(50)});
   for(const [part,dx]of [['one',-.2],['two',.2]] as const)add(engine,`${id}-${part}`,{Transform:transform(x+dx,0),Shape:{kind:'circle',radius:.3},Tag:{flags:2},DamageReceiver:{resource:'hp',targetEntity:`${id}-head`}});
   add(engine,`${id}-target`,{Transform:transform(x,0),Shape:{kind:'circle',radius:.3},Tag:{flags:4},...pool(50)});
   for(const [part,dx]of [['one',-.2],['two',.2]] as const)add(engine,`${id}-${part}-contact`,{Transform:transform(x+dx,0),Shape:{kind:'circle',radius:.3},Tag:{flags:1},Hitbox:{resource:'hp',amount:5,targetMask:4,consumeOnHit:true},PrefabOrigin:{templateId:'segment-contact',source:`${id}-head`}});
  }
 }else{
  const tpl=buildCombatUnitTemplate(r3Catalog,'r3','vindicator',1);
  instantiate(w,tpl,'mount',0,0,0);instantiate(w,tpl,'rider',0,0,0);
  w.addComponent('rider#0:body',{type:'Hierarchy',parentId:'mount#0:body',localX:0,localY:0,localRotation:0,localScaleX:1,localScaleY:1} as Component);
  add(engine,'target',{Transform:transform(.1,0),Shape:{kind:'circle',radius:.3},Tag:{flags:4},Status:{flags:8},...pool(1000)});
 }
 return {kind,engine,world:w,log,step(){tick++;sources=[];w.tick();log.push({tick,positions:Object.fromEntries(w.query('Transform').map(([id])=>{const p=w.getComponent<Transform>(id,'Transform')!;return[id,[p.x,p.y]];})),hp:Object.fromEntries(w.query('Resource').map(([id])=>[id,w.getComponent<Resource>(id,'Resource')!.current])),sources:[...sources]});},
  strike(id:string,x:number,y:number,amount:number,onlyTarget?:string){add(engine,id,{Transform:transform(x,y),Shape:{kind:'circle',radius:.1},Tag:{flags:1},Hitbox:{resource:'hp',amount,damageType:'true',targetMask:2,onlyTarget,consumeOnHit:true}});},
  dispose(){w.setObserver(undefined);engine.stop();for(const id of w.getAllEntities())w.destroyEntity(id);}};
}
