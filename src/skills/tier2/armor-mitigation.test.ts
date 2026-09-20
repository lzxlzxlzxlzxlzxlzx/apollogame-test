import { expect,it } from 'vitest';
import { armorMitigation } from './armor-mitigation.js';
import { World } from '@engine/core/world.js';
import type { Component } from '@engine/core/types.js';
import type { DamageRequest, Resource } from '@engine/protocol/components.js';
import { damageRoutingCapability } from './damage-routing.js';
import { hitboxCapability } from './hitbox.js';
import { overlapDetectCapability } from '../atoms/overlap-detect/index.js';
import { triggerZoneCapability } from './trigger-zone.js';
import { destroyCapability } from '../atoms/destroy/index.js';
it.each([[10,0,0,10],[10,20,0,4],[10,20,8,3],[100,20,0,84],[1,100,0,.2]])('armor table d=%s a=%s t=%s -> %s',(d,a,t,out)=>expect(armorMitigation(d,a,t)).toBeCloseTo(out,10));
it('true damage and armor piercing do not change damage category or pre-armor factors',()=>{
 expect(armorMitigation(10,20,8,true)).toBe(10);expect(armorMitigation(-12,20,8)).toBe(-12);
 expect(()=>armorMitigation(10,-1,0)).toThrow(/Invalid/);
});
it.each([
 {amount:10,type:'normal',pierce:false,hp:100,factor:1,after:3,actual:3},
 {amount:20,type:'true',pierce:false,hp:100,factor:.5,after:10,actual:10},
 {amount:20,type:'normal',pierce:true,hp:100,factor:.5,after:10,actual:10},
 {amount:100,type:'normal',pierce:false,hp:7,factor:1,after:84,actual:7},
 {amount:-50,type:'normal',pierce:false,hp:90,factor:1,after:-50,actual:-10},
])('real collision receipt: $type amount=$amount pierce=$pierce',c=>{
 const w=new World();for(const cap of [damageRoutingCapability,hitboxCapability,overlapDetectCapability,triggerZoneCapability,destroyCapability])for(const s of cap.systems)w.addSystem(s);
 const add=(id:string,cs:Record<string,object>)=>{w.createEntity(id);for(const [type,value]of Object.entries(cs))w.addComponent(id,{type,...value} as Component);};
 const transform={x:0,y:0,rotation:0,scaleX:1,scaleY:1};
 add('target',{Transform:transform,Shape:{kind:'circle',radius:1},Tag:{flags:2},Resource:{id:'hp',current:c.hp,min:0,max:100},DamageReceiver:{resource:'hp',armor:20,toughness:8,multiplier:c.factor}});
 add('source',{Tag:{flags:4}});
 add('zone',{Transform:{...transform},Shape:{kind:'circle',radius:2},Sensor:{},Tag:{flags:1},PrefabOrigin:{source:'source',instanceId:'zone',templateId:'probe'},Hitbox:{resource:'hp',amount:c.amount,targetMask:2,damageType:c.type,armorPiercing:c.pierce,consumeOnHit:true}});
 const receipts:DamageRequest[]=[];w.setObserver({onSystemStart:s=>{if(s.id==='damage-route')receipts.push(...w.query('DamageRequest').map(([id])=>w.getComponent<DamageRequest>(id,'DamageRequest')!));}});
 w.tick();expect(receipts).toHaveLength(1);expect(receipts[0]!.amount).toBe(c.amount);expect(receipts[0]!.afterArmorAmount).toBeCloseTo(c.after,10);expect(receipts[0]!.appliedAmount).toBeCloseTo(c.actual,10);
 expect(w.getComponent<Resource>('target','Resource')!.current).toBeCloseTo(c.hp-c.actual,10);
 expect(receipts[0]!.armorUsed).toBe(c.type==='true'||c.pierce?0:20);
 expect(w.query('Hitbox')).toHaveLength(0);w.tick();expect(receipts).toHaveLength(1);
});

