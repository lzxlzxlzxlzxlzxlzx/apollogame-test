
import { World } from '@engine/core/world.js';
import { aggroCapability } from '@skills/tier3/aggro.js';
import { steeringCapability } from '@skills/tier2/steering.js';
import { motionApplyCapability } from '@skills/tier1/motion-apply.js';
import { overlapDetectCapability } from '@skills/atoms/overlap-detect/index.js';
import { collisionResolveCapability } from '@skills/tier2/collision-resolve.js';
import { add, xf } from './s2-round2.fixture.js';
export function scene(stacked=false,wall=false,count=4){
 const w=new World();
 for(const cap of [aggroCapability,steeringCapability,motionApplyCapability,overlapDetectCapability,collisionResolveCapability])for(const s of cap.systems)w.addSystem(s);
 add(w,'target',{Transform:xf(10),Shape:{kind:'circle',radius:1},Tag:{flags:2}});
 for(let i=0;i<count;i++)add(w,'u'+i,{Transform:{...xf(0),y:stacked?0:(i-1.5)*2},Shape:{kind:'circle',radius:.5},Tag:{flags:1},Velocity:{vx:0,vy:0},Perception:{targetTag:2,sightRadius:30},Steering:{mode:'seek',speed:.5,stopRange:2,separation:{radius:2,weight:.5,tagMask:1}}});
 if(wall)add(w,'wall',{Transform:xf(5),Shape:{kind:'box',width:1,height:100}});
 return w;
}


import { pathfindCapability } from '@skills/tier2/pathfind.js';
export function navigationScene(connected=true){
 const w=new World();
 for(const cap of [aggroCapability,pathfindCapability,motionApplyCapability,overlapDetectCapability,collisionResolveCapability])for(const system of cap.systems)w.addSystem(system);
 add(w,'target',{Transform:xf(10),Tag:{flags:2}});
 add(w,'nav',{NavGraph:{nodes:[{x:0,y:0},{x:3,y:-4},{x:7,y:-4},{x:10,y:0}],edges:connected?[{a:0,b:1},{a:1,b:2},{a:2,b:3}]:[]}});
 add(w,'u0',{Transform:xf(0),Shape:{kind:'circle',radius:.5},Velocity:{vx:0,vy:0},Perception:{targetTag:2,sightRadius:30},NavAgent:{speed:.25,arriveRange:.5,waypointRange:.3}});
 add(w,'wall',{Transform:xf(5),Shape:{kind:'box',width:1,height:4}});
 return w;
}

