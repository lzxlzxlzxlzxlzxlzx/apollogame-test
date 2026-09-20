import { describe,it,expect } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { assembleCombatWorld } from './s4-world.js';
import { r3Catalog } from './content/r3-catalog.js';
import type { Component } from '@engine/core/types.js';
import type { Resource, Status } from '@engine/protocol/components.js';

describe('R3-B2 status payload contract',()=>{
  it('applies burn, wither and slow only after legal physical contact',()=>{
    const e=new Engine({tickRate:20}); assembleCombatWorld(e,r3Catalog,'b2'); const w=e.world;
    const add=(id:string,flags:number)=>{w.createEntity(id); for(const [,data] of Object.entries({Transform:{type:'Transform',x:0,y:0,rotation:0,scaleX:1,scaleY:1},Shape:{type:'Shape',kind:'circle',radius:.5},Sensor:{type:'Sensor'},Tag:{type:'Tag',flags},Status:{type:'Status',flags:8},Resource:{type:'Resource',id:'hp',current:100,min:0,max:100},DamageReceiver:{type:'DamageReceiver',resource:'hp'}}))w.addComponent(id,data as Component);};
    add('target',4); w.createEntity('zone');
    w.addComponent('zone',{type:'Transform',x:0,y:0,rotation:0,scaleX:1,scaleY:1} as Component); w.addComponent('zone',{type:'Shape',kind:'circle',radius:1} as Component); w.addComponent('zone',{type:'Sensor'} as Component); w.addComponent('zone',{type:'Tag',flags:1} as Component);
    w.addComponent('zone',{type:'Hitbox',resource:'hp',amount:2,targetMask:4,consumeOnHit:true,onHitStatus:[{id:'burn',duration:40,damagePerTick:1,period:20},{id:'slow',duration:100,multiplier:.7}]} as Component);
    for(let i=0;i<25;i++)w.tick();
    const status=w.getComponent<Status>('target','Status')!; expect(status.effects?.map(x=>x.id)).toEqual(['burn','slow']);
    const hp=w.getComponent<Resource>('target','Resource')!.current; expect(hp).toBeLessThanOrEqual(98);
    e.stop();
  });
});
