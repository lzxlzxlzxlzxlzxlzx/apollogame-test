import { it,expect } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { instantiate } from '@skills/tier3/prefab.js';
import { checkEntity } from '@skills/tier2/entity-check.js';
import type { Component } from '@engine/core/types.js';
import type { GameFlow,Resource,Timer,State,DamageRequest,Status } from '@engine/protocol/components.js';
import { assembleCombatWorld,buildCombatUnitTemplate } from './s4-world.js';
import { r3Catalog } from './content/r3-catalog.js';
import { transform } from './world.js';

const unitId='iceandfire_cyclops';
function scene(options:{max?:number;current?:number;air?:boolean;competing?:boolean;doomed?:boolean}={}){
 const engine=new Engine({tickRate:20});assembleCombatWorld(engine,r3Catalog,'r3');const w=engine.world;
 const unit=r3Catalog.units.find(u=>u.id===unitId)!;
 const ids=r3Catalog.decisions.find(d=>d.id===unit.decisionProfileId)!.candidates;
 const add=(id:string,data:Record<string,object>)=>{w.createEntity(id);for(const [type,value]of Object.entries(data))w.addComponent(id,{type,...value} as Component);};
 for(const [instance,x]of [['a',0],['b',options.competing?.2:100]] as const){
  instantiate(w,buildCombatUnitTemplate(r3Catalog,'r3',unitId,1),instance,0,x,0);
  // Initial wounded source proves capture does not heal; no per-tick state injection.
  w.getComponent<Resource>(`${instance}#0:body`,'Resource')!.current=80;
  if(instance==='b'&&options.competing)continue;
  add(`${instance}-target`,{Transform:transform(x+.1,0),Shape:{kind:'circle',radius:.1},Tag:{flags:4},Status:{flags:options.air?4:8},Resource:{id:'hp',current:options.current??options.max??50,min:0,max:options.max??50},DamageReceiver:{resource:'hp'},Mortal:{resource:'hp',atOrBelow:0}});
 }
 if(options.doomed)w.addComponent('a#0:body',{type:'DestroyRequest',entityId:'a#0:body'} as Component);
 w.getComponent<State>('session','State')!.current='battle';
 const trace:object[]=[],receipts:DamageRequest[]=[];let pending:DamageRequest[]=[];
 w.setObserver({onSystemStart:s=>{if(s.id==='damage-route')pending=w.query('DamageRequest').map(([id])=>w.getComponent<DamageRequest>(id,'DamageRequest')!);},onSystemEnd:s=>{if(s.id==='damage-route')receipts.push(...pending.map(r=>({...r})));}});
 const flow=(instance:string,index=0)=>w.getComponent<GameFlow>(`${instance}#0:${ids[index]}`,'GameFlow');
 const cd=(instance:string,index=0)=>w.getComponent<Timer>(`${instance}#0:${ids[index]}`,'Timer')?.elapsed;
 return {w,flow,cd,receipts,step(){w.tick();trace.push({tick:w.getVersion(),a:flow('a')?.current,b:flow('b')?.current,cd:cd('a'),targetAlive:w.hasComponent('a-target','Resource'),zones:w.query('Hitbox').length});},trace,
 dispose(){w.setObserver(undefined);engine.stop();for(const id of w.getAllEntities())w.destroyEntity(id);}};
}
it.each([false,true])('cyclops captures ground/air=%s by maximum HP, deletes at successful start, keeps CD 5 seconds and never heals',air=>{
 const s=scene({air});try{
  s.step();for(const instance of ['a','b']){
   expect(s.w.hasComponent(`${instance}-target`,'Resource')).toBe(false);
   expect(s.flow(instance)!.current).toBe('Recovery');expect(s.cd(instance)).toBe(0);
   expect(s.w.getComponent<Resource>(`${instance}#0:body`,'Resource')!.current).toBe(80);
  }
  expect(s.w.query('Hitbox')).toEqual([]);expect(s.receipts).toEqual([]);
  for(let i=0;i<60;i++)s.step();expect(s.flow('a')!.current).toBe('Ready');expect(s.cd('a')).toBe(60);
  expect(s.flow('a')!.targetSnapshot).toBeUndefined();
  // Recovery -> Ready queues unlock; it is committed at the next frame boundary.
  expect(s.w.getComponent<Status>('a#0:body','Status')!.flags&64).toBe(64);
  s.step();expect(s.w.query('FlowWindowIntent')).toEqual([]);expect(s.w.getComponent<Status>('a#0:body','Status')!.flags&64).toBe(0);
 }finally{s.dispose();expect(s.w.getAllEntities()).toEqual([]);}
});
it('current HP 1 with maximum 51 rejects devour without spending its CD and uses real ground smash',()=>{
 const s=scene({max:51,current:1});try{
  s.step();expect(s.flow('a')!.current).toBe('Ready');expect(s.cd('a')).toBeGreaterThanOrEqual(100);expect(s.flow('a',1)!.current).toBe('Windup');
  for(let i=0;i<5;i++)s.step();expect(s.receipts.some(r=>r.source==='a#0:body'&&r.amount===17&&r.appliedAmount===1)).toBe(true);
 }finally{s.dispose();}
});
it('two instances cannot consume the same target: only the first capture spends CD',()=>{
 const s=scene({competing:true,air:true});try{
  s.step();expect(s.flow('a')!.current).toBe('Recovery');expect(s.cd('a')).toBe(0);
  expect(s.flow('b')!.current).toBe('Ready');expect(s.cd('b')).toBeGreaterThanOrEqual(100);expect(s.flow('b')!.targetSnapshot).toBeUndefined();
  expect(s.w.hasComponent('a-target','Resource')).toBe(false);
 }finally{s.dispose();}
});
it('two cyclops instances complete three captures with independent five-second cooldowns and recovery',()=>{
 const s=scene({air:true});try{
  for(const[instance,x]of [['a',0],['b',100]] as const)for(let wave=2;wave<=3;wave++){
   const id=`${instance}-target-${wave}`;s.w.createEntity(id);
   for(const[type,data]of Object.entries({Transform:transform(x+wave*.1,0),Shape:{kind:'circle',radius:.1},Tag:{flags:4},Status:{flags:4},Resource:{id:'hp',current:50,min:0,max:50},DamageReceiver:{resource:'hp'}}))s.w.addComponent(id,{type,...data} as Component);
  }
  for(let tick=1;tick<=202;tick++){
   s.step();if([1,101,201].includes(tick))for(const instance of ['a','b']){
    expect(s.flow(instance)!.current).toBe('Recovery');expect(s.cd(instance)).toBe(0);
    expect(s.w.getComponent<Resource>(`${instance}#0:body`,'Resource')!.current).toBe(80);
   }
  }
  expect(s.w.getAllEntities().filter(id=>id.includes('-target'))).toEqual([]);
  expect(s.receipts).toEqual([]);expect(s.w.query('Hitbox')).toEqual([]);
 }finally{s.dispose();}
});
it('a source already marked for deletion cannot consume another entity',()=>{
 const s=scene({doomed:true});try{s.step();expect(s.w.hasComponent('a-target','Resource')).toBe(true);expect(s.w.hasComponent('a#0:body','Resource')).toBe(false);}finally{s.dispose();}
});
it('a victim reaching Active on the capture tick cannot release its pending attack',()=>{
 const s=scene();try{
  s.w.destroyEntity('a-target');
  const prefab=buildCombatUnitTemplate(r3Catalog,'r3','vindicator',2);
  const body=prefab.entities.body!;body.Resource={id:'hp',current:50,min:0,max:50};
  const skill=r3Catalog.decisions.find(d=>d.id===r3Catalog.units.find(u=>u.id==='vindicator')!.decisionProfileId)!.candidates[0]!;
  prefab.entities[skill]!.GameFlow!.current='Windup';
  prefab.entities[skill]!.GameFlow!.targetSnapshot={sourceId:'@local:body',targetId:'a#0:body'};
  instantiate(s.w,prefab,'victim',0,.1,0);s.step();
  expect(s.w.getAllEntities().some(id=>id.startsWith('victim#0:'))).toBe(false);
  for(let i=0;i<6;i++)s.step();
  expect(s.receipts.some(r=>r.source==='victim#0:body')).toBe(false);
  expect(s.w.getComponent<Resource>('a#0:body','Resource')!.current).toBe(80);
  expect(s.w.query('Hitbox')).toEqual([]);
 }finally{s.dispose();}
});
it('maximum resource checks remain opt-in, reject missing/nonfinite fields and retain current-HP checks',()=>{
 const s=scene({max:51,current:1});try{
  expect(checkEntity(s.w,'a-target',{resource:{id:'hp',max:50}})).toBe(true);
  expect(checkEntity(s.w,'a-target',{resource:{id:'hp',field:'max',max:50}})).toBe(false);
  expect(checkEntity(s.w,'missing',{resource:{id:'hp',field:'max',max:50}})).toBe(false);
  expect(checkEntity(s.w,'a-target',{resource:{id:'hp',field:'max',max:NaN}})).toBe(false);
 }finally{s.dispose();}
});
