import { expect,it } from 'vitest';
import { aabbOf,contactBetween } from './contact.js';
import { capsuleAxis } from './capsule.js';
import type { Shape,Transform } from '@engine/protocol/components.js';
import type { Component } from '@engine/core/types.js';
import { World } from '@engine/core/world.js';
import { overlapDetectCapability } from '@skills/atoms/overlap-detect/index.js';
import { triggerZoneCapability } from '@skills/tier2/trigger-zone.js';
import { hitboxCapability } from '@skills/tier2/hitbox.js';
import { resourceCapability } from '@skills/atoms/resource/index.js';
import { destroyCapability } from '@skills/atoms/destroy/index.js';
import { frameSvg } from '@renderer/frame-svg.js';
import type { Resource } from '@engine/protocol/components.js';
const at=(x=0,y=0,rotation=0):Transform=>({type:'Transform',x,y,rotation,scaleX:1,scaleY:1});
const cap=(length=10,radius=.3):Shape=>({type:'Shape',kind:'capsule',length,radius});
const circle=(radius=.5):Shape=>({type:'Shape',kind:'circle',radius});
it('REQ006 diagonal capsule reaches its centerline and tight broadphase bounds',()=>{
 const t=at(0,0,Math.PI/4),s=cap();
 expect(contactBetween(t,s,at(2,2),circle())).not.toBeNull();
 expect(contactBetween(t,s,at(2,-2),circle())).toBeNull();
 expect(aabbOf(t,s).maxX).toBeCloseTo(5/Math.sqrt(2)+.3,10);
});
it('REQ006 boundary tangency is not penetration; just inside is contact',()=>{
 expect(contactBetween(at(),cap(),at(0,.8),circle())).toBeNull();
 expect(contactBetween(at(),cap(),at(0,.799),circle())!.depth).toBeCloseTo(.001,10);
 expect(contactBetween(at(),cap(),at(5.8,0),circle())).toBeNull();
});
it('REQ006 capsule box and crossed capsules report separation depth and reverse normal',()=>{
 const box:Shape={type:'Shape',kind:'box',width:1,height:1};
 const a=contactBetween(at(),cap(),at(0,.7),box)!;
 const b=contactBetween(at(0,.7),box,at(),cap())!;
 expect(a.depth).toBeCloseTo(.1);expect(b.ny).toBe(-a.ny);
 expect(contactBetween(at(),cap(),at(0,0,Math.PI/2),cap())!.depth).toBeCloseTo(5.6);
 expect(contactBetween(at(),cap(),at(0,2),cap())).toBeNull();
});
it('REQ006 explicit direction is normalized and overrides rotation; old box remains AABB',()=>{
 const s={...cap(),axisX:3,axisY:4};
 expect(capsuleAxis(at(0,0,Math.PI),s)).toEqual({x:.6,y:.8});
 expect(contactBetween(at(0,0,Math.PI/4),{type:'Shape',kind:'box',width:10,height:.6},at(2,2),circle())).toBeNull();
});
it('REQ006 real overlap trigger hitbox damages both diagonal targets once and cleans the beam',()=>{
 const w=new World();
 for(const c of [overlapDetectCapability,triggerZoneCapability,hitboxCapability,resourceCapability,destroyCapability])for(const sys of c.systems)w.addSystem(sys);
 const add=(id:string,data:Record<string,object>)=>{w.createEntity(id);for(const [type,value]of Object.entries(data))w.addComponent(id,{type,...value}as Component);};
 add('beam',{Transform:at(3,3),Shape:{...cap(8),axisX:1,axisY:1},Tag:{flags:1},Hitbox:{resource:'hp',amount:18,targetMask:2,consumeOnHit:true}});
 for(const [id,x,y,tag]of [['a',2,2,2],['b',4,4,2],['friend',3,3,4],['outside',2,-2,2]]as const)add(id,{Transform:at(x,y),Shape:circle(),Tag:{flags:tag},Resource:{id:'hp',current:100,min:0,max:100}});
 const svg=frameSvg(w);
 expect(Number(svg.match(/stroke-width="([^"]+)"/)![1])).toBe(.6);expect(svg).toContain('stroke-linecap="round"');
 const trace=[];
 for(let tick=1;tick<=3;tick++){w.tick();trace.push({tick,hp:['a','b','friend','outside'].map(id=>w.getComponent<Resource>(id,'Resource')!.current),beam:w.hasComponent('beam','Hitbox')});}
 expect(trace).toEqual([1,2,3].map(tick=>({tick,hp:[82,82,100,100],beam:false})));
 console.log('REQ006_CONTACT_TRACE',JSON.stringify(trace));
});
