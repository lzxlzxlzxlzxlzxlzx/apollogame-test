import { describe,it,expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { hitboxCapability } from '@skills/tier2/hitbox.js';
import { damageRoutingCapability } from '@skills/tier2/damage-routing.js';
import type { Hitbox,Trigger,Resource,DamageReceiver,Status } from '@engine/protocol/components.js';
function w(){const x=new World();for(const c of [hitboxCapability,damageRoutingCapability])for(const s of c.systems)x.addSystem(s);return x;}
function add(x:World,id:string,c:any){x.createEntity(id);for(const [type,data] of Object.entries(c))x.addComponent(id,{type,...data} as any);}
function strike(x:World,h:Partial<Hitbox>){add(x,'zone',{Hitbox:{resource:'hp',amount:10,targetMask:2,...h}});add(x,'target',{Tag:{flags:2},Resource:{id:'hp',current:100,min:0,max:100},DamageReceiver:{resource:'hp'}});add(x,'tr',{Trigger:{zone:'zone',other:'target'}});}
describe('B4 public category defence and hard-control payload',()=>{
 it('rejects ranged before HP or status writes',()=>{const x=w();strike(x,{damageCategory:'ranged',onHitStatus:[{id:'freeze',duration:2,statusMask:32}]});x.getComponent<DamageReceiver>('target','DamageReceiver')!.rejectDamageCategories=['ranged'];x.tick();expect(x.getComponent<Resource>('target','Resource')!.current).toBe(100);expect(x.getComponent<Status>('target','Status')).toBeUndefined();});
 it('applies category mitigation before armour',()=>{const x=w();strike(x,{damageCategory:'melee'});x.getComponent<DamageReceiver>('target','DamageReceiver')!.damageCategoryMultipliers={melee:.1};x.tick();expect(x.getComponent<Resource>('target','Resource')!.current).toBe(99);});
 it('writes and expires a freeze payload by its supplied control mask',()=>{const x=w();strike(x,{amount:0,onHitStatus:[{id:'freeze',duration:2,statusMask:32}]});x.tick();expect(x.getComponent<Status>('target','Status')!.flags&32).toBe(32);});
});
