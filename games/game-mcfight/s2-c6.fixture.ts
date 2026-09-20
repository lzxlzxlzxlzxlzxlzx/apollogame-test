import {damageRoutingCapability} from '@skills/tier2/damage-routing.js';
import {World} from '@engine/core/world.js';
import {caps} from './s2-multiskill.fixture.js';
import {launchCapability} from '@skills/tier2/launch.js';
import {lifetimeCapability} from '@skills/tier1/lifetime.js';
import {add,xf} from './s2-round2.fixture.js';
import {ZONE_FLAG} from '@skills/tier2/trigger-zone.js';
export const c6Caps=[damageRoutingCapability,...caps,launchCapability,lifetimeCapability];
export function projectile(miss=false){
 const w=new World();for(const c of c6Caps)for(const s of c.systems)w.addSystem(s);
 add(w,'library',{PrefabLibrary:{seq:0,templates:{bolt:{entities:{projectile:{Transform:xf(0),Shape:{kind:'circle',radius:.2},Tag:{flags:ZONE_FLAG},Launch:{speed:1,toward:'dir',dirX:1,dirY:0},Timer:{id:'life',elapsed:0,duration:12,loop:false},Hitbox:{resource:'hp',amount:5,targetMask:2,consumeOnHit:true}}}}}}});
 add(w,'gun',{Transform:xf(0),State:{fsmId:'fire',current:'Fire',previous:'Ready'},Caster:{onSignal:'fire',template:'bolt',at:'self'}});
 add(w,'fire-event',{EventWhen:{signal:'fire',mode:'edge',when:{kind:'state',fsmId:'fire',equals:'Fire'}}});
 add(w,'enemy',{Transform:xf(6),Shape:{kind:'circle',radius:.5},Tag:{flags:miss?4:2},Resource:{id:'hp',current:30,min:0,max:30}});
 return w;
}
export function summon(){
 const w=projectile(true);w.getComponent<any>('gun','Caster')!.template='minion';
 w.addComponent('gun',{type:'Resource',id:'hp',current:20,min:0,max:20} as any);w.addComponent('gun',{type:'Mortal',resource:'hp',atOrBelow:0} as any);w.addComponent('gun',{type:'Shape',kind:'circle',radius:.25} as any);w.addComponent('gun',{type:'Tag',flags:8} as any);
 w.getComponent<any>('library','PrefabLibrary')!.templates.minion={entities:{body:{Transform:xf(1),Hierarchy:{parentId:'gun',localX:1,localY:0,localRotation:0,localScaleX:1,localScaleY:1},Tag:{flags:4},Resource:{id:'hp',current:10,min:0,max:10}}}};
 add(w,'incoming',{Transform:xf(-4),Velocity:{vx:1,vy:0},Shape:{kind:'circle',radius:.25},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'hp',amount:30,targetMask:8,consumeOnHit:true}});
 return w;
}
export function beam(vertical=false){
 const w=projectile();w.getComponent<any>('gun','Caster')!.template='beam';
 const length=6,width=1;
 w.getComponent<any>('library','PrefabLibrary')!.templates.beam={entities:{zone:{Transform:{...xf(vertical?0:3),y:vertical?3:0},Shape:{kind:'box',width:vertical?width:length,height:vertical?length:width},Tag:{flags:ZONE_FLAG},Timer:{id:'life',elapsed:0,duration:2,loop:false},Hitbox:{resource:'hp',amount:4,targetMask:2,consumeOnHit:true}}}};
 w.getComponent<any>('enemy','Transform')!.x=vertical?0:2;w.getComponent<any>('enemy','Transform')!.y=vertical?2:0;
 add(w,'enemy2',{Transform:{...xf(vertical?0:5),y:vertical?5:0},Shape:{kind:'circle',radius:.25},Tag:{flags:2},Resource:{id:'hp',current:30,min:0,max:30}});
 add(w,'friend',{Transform:{...xf(vertical?0:3),y:vertical?3:0},Shape:{kind:'circle',radius:.25},Tag:{flags:4},Resource:{id:'hp',current:30,min:0,max:30}});
 return w;
}

import {steeringCapability} from '@skills/tier2/steering.js';
export function bombardment(moving=true){
 const w=projectile();for(const s of steeringCapability.systems)w.addSystem(s);
 w.getComponent<any>('gun','Caster')!.template='blast';
 w.getComponent<any>('library','PrefabLibrary')!.templates.blast={entities:{zone:{Transform:xf(0),Shape:{kind:'circle',radius:.5},Tag:{flags:ZONE_FLAG},Timer:{id:'life',elapsed:0,duration:3,loop:false},Hitbox:{resource:'hp',amount:5,targetMask:2,consumeOnHit:true}}}};
 w.getComponent<any>('gun','State')!.current='Mark';w.getComponent<any>('enemy','Transform')!.x=2;
 if(moving)w.addComponent('enemy',{type:'Velocity',vx:.5,vy:0} as any);
 w.addComponent('gun',{type:'Perception',targetTag:2,sightRadius:20} as any);w.addComponent('gun',{type:'Steering',mode:'seek',speed:1,stopRange:0,haltStatusMask:64} as any);
 w.addComponent('gun',{type:'GameFlow',id:'mark',current:'Mark',entered:false,states:[{id:'Mark',transitions:[{after:1,to:'Prepare',do:[{kind:'set-status',targetEntity:'gun',targetId:'64',value:true}]}]},{id:'Prepare',transitions:[{after:1,to:'Fire',do:[{kind:'set-state',targetId:'fire',value:'Fire'}]}]},{id:'Fire'}]} as any);
 return w;
}
export function relationshipSkeleton(){
 const w=summon(),entities=w.getComponent<any>('library','PrefabLibrary')!.templates.minion.entities;
 for(const [id,parent] of [['rider','body'],['segment1','body'],['segment2','segment1']] as const)entities[id]={Transform:xf(0),Hierarchy:{parentId:'@local:'+parent,localX:.5,localY:0,localRotation:0,localScaleX:1,localScaleY:1},Tag:{flags:4}};
 return w;
}
import {closeoutPulse} from './s2-c4.fixture.js';
export function sustainedBeam(interrupt:'none'|'control'|'death'='none'){
 const w=closeoutPulse(0,interrupt),entities=w.getComponent<any>('library','PrefabLibrary')!.templates.pulse.entities;
 for(const entity of Object.values(entities) as any[])entity.Shape={kind:'box',width:6,height:1};
 w.removeComponent('enemy-b','Velocity');w.getComponent<any>('enemy-b','Transform')!.x=2;
 return w;
}
