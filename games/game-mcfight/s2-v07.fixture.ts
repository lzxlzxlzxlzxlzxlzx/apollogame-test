import { World } from '@engine/core/world.js';
import { caps } from './s2-multiskill.fixture.js';
import { add,xf } from './s2-round2.fixture.js';
import { ZONE_FLAG } from '@skills/tier2/trigger-zone.js';
export function multiPulse(friendlyFire=false){
 const w=new World();for(const c of caps)for(const s of c.systems)w.addSystem(s);
 add(w,'library',{PrefabLibrary:{seq:0,templates:{pulse:{entities:{zone:{Transform:xf(0),Shape:{kind:'circle',radius:2},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'hp',amount:3,targetMask:friendlyFire?6:2,consumeOnHit:true}}}}}}});
 const phases=['Ready','Pulse1','Rest1','Pulse2','Rest2','Pulse3','Done'];
 add(w,'source',{Transform:xf(0),State:{fsmId:'pulse',current:'Ready',previous:'Ready'},Caster:{onSignal:'pulse-release',template:'pulse',at:'self'},GameFlow:{id:'pulse',current:'Ready',entered:false,states:phases.map((id,i)=>({id,transitions:i<phases.length-1?[{after:0,to:phases[i+1],do:[{kind:'set-state',targetId:'pulse',value:phases[i+1]}]}]:[]}))}});
 add(w,'pulse-event',{EventWhen:{signal:'pulse-release',mode:'edge',when:{kind:'or',of:['Pulse1','Pulse2','Pulse3'].map(equals=>({kind:'state',fsmId:'pulse',equals}))}}});
 for(const [id,x,flag] of [['enemy-a',.5,2],['enemy-b',1,2],['friend',-.5,4]] as const)add(w,id,{Transform:xf(x),Shape:{kind:'circle',radius:.25},Tag:{flags:flag},Resource:{id:'hp',current:50,min:0,max:50}});
 return w;
}

