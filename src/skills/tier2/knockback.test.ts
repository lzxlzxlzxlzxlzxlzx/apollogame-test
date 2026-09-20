import { describe,it,expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { hitboxCapability } from '@skills/tier2/hitbox.js';
import { damageRoutingCapability } from '@skills/tier2/damage-routing.js';
import { knockbackCapability } from './knockback.js';
function world(){const w=new World();for(const c of [hitboxCapability,damageRoutingCapability,knockbackCapability])for(const s of c.systems)w.addSystem(s);return w;}
function add(w:any,id:string,x:number,immune=false){w.createEntity(id);for(const [type,v]of Object.entries({Transform:{x,y:0,rotation:0,scaleX:1,scaleY:1},Resource:{id:'hp',current:20,min:0,max:20},DamageReceiver:{resource:'hp',knockbackImmune:immune}}))w.addComponent(id,{type,...v} as any);}
describe('knockback',()=>{it('moves only after actual damage and honors immunity',()=>{const w=world();add(w,'src',0);add(w,'a',2);add(w,'b',3,true);w.createEntity('z');w.addComponent('z',{type:'Transform',x:0,y:0,rotation:0,scaleX:1,scaleY:1}as any);w.addComponent('z',{type:'Hitbox',resource:'hp',amount:5,knockback:4}as any);for(const target of ['a','b']){const id='t'+target;w.createEntity(id);w.addComponent(id,{type:'Trigger',zone:'z',other:target}as any);}w.tick();expect(w.getComponent<any>('a','Transform').x).toBe(6);expect(w.getComponent<any>('b','Transform').x).toBe(3);});});

