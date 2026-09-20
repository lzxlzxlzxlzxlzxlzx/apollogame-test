// Original independent reproduction: mcfight-r3-public-008009-independent-20260915/
// games/game-mcfight/review-008009-extra.test.ts. HP assertions retained exactly.
import {it,expect} from 'vitest';
import {Engine} from '@zerocraft/engine/runtime/engine.js';
import {instantiate} from '@skills/tier3/prefab.js';
import {assembleCombatWorld,buildCombatUnitTemplate} from './s4-world.js';
import {r3Catalog} from './content/r3-catalog.js';
import {transform} from './world.js';
import type {Component} from '@engine/core/types.js';
import type {Resource,State} from '@engine/protocol/components.js';
it.each([20,51])('capture-tick region: target max HP %s, swallowed source cancels and non-swallowed source hits',max=>{
 const engine=new Engine({tickRate:20});assembleCombatWorld(engine,r3Catalog,'r3');const w=engine.world;
 const add=(id:string,cs:Record<string,object>)=>{w.createEntity(id);for(const[type,data]of Object.entries(cs))w.addComponent(id,{type,...data} as Component);};
 instantiate(w,buildCombatUnitTemplate(r3Catalog,'r3','iceandfire_cyclops',1),'predator',0,0,0);
 const initial=w.getComponent<Resource>('predator#0:body','Resource')!.current;
 add('victim',{Transform:transform(.1,0),Shape:{kind:'circle',radius:.1},Tag:{flags:4},Status:{flags:8},Resource:{id:'hp',current:max,min:0,max},DamageReceiver:{resource:'hp'}});
 add('victim-pending-zone',{Transform:transform(),Shape:{kind:'circle',radius:.1},Tag:{flags:1},Hitbox:{resource:'hp',amount:7,damageType:'true',targetMask:2,onlyTarget:'predator#0:body',sourceCheck:{aliveResource:'hp'},consumeOnHit:true},PrefabOrigin:{source:'victim',templateId:'external-attack'}});
 try {
 w.getComponent<State>('session','State')!.current='battle';w.tick();
 expect(w.hasComponent('victim','Resource')).toBe(max===51);
 expect(w.getComponent<Resource>('predator#0:body','Resource')!.current).toBe(max===51?initial-7:initial);
 expect(w.hasComponent('victim-pending-zone','Hitbox')).toBe(false);
 } finally {engine.stop();for(const id of w.getAllEntities())w.destroyEntity(id);}
});
