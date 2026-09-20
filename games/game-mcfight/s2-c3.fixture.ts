import {scaleBattle} from './s2-c5.fixture.js';
import {steeringCapability} from '@skills/tier2/steering.js';
import {collisionResolveCapability} from '@skills/tier2/collision-resolve.js';
export function surround(count=6){
 const w=scaleBattle(count+1);for(const c of [steeringCapability,collisionResolveCapability])for(const s of c.systems)w.addSystem(s);
 for(let i=0;i<count;i++){
  const id=`scale#${i}:body`,t=w.getComponent<any>(id,'Transform')!;t.x=8*Math.cos(i*2*Math.PI/count);t.y=8*Math.sin(i*2*Math.PI/count);
  w.addComponent(id,{type:'Shape',kind:'circle',radius:.4} as any);w.addComponent(id,{type:'Tag',flags:4} as any);w.addComponent(id,{type:'Steering',mode:'seek',speed:.25,stopRange:2.5,separation:{radius:1.2,weight:.5,tagMask:4}} as any);
 }
 return w;
}
