import { it,expect } from 'vitest';
import { createMultiskill,observeSkills } from './s2-multiskill.fixture.js';
import { add,xf } from './s2-round2.fixture.js';
import { ZONE_FLAG } from '@skills/tier2/trigger-zone.js';
function controlled(distance:number,death=false){
 const w=createMultiskill(distance);
 w.addComponent('unit#0:body',{type:'Shape',kind:'circle',radius:.25} as any);
 w.addComponent('unit#0:body',{type:'Tag',flags:4} as any);
 add(w,'incoming',{Transform:xf(-2),Velocity:{vx:1,vy:0},Shape:{kind:'circle',radius:.25},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'hp',amount:death?200:0,targetMask:4,setMask:death?0:32,consumeOnHit:true}});
 return w;
}
it.each([2,10])('C1 production control cancels the active skill, preserves CD and releases shared action: range %s',distance=>{
 const w=controlled(distance),skill=distance===2?0:1;
 w.tick();expect(observeSkills(w,1)[skill].casts).toBe(1);
 w.tick();expect(w.getComponent<any>('unit#0:body','Status')!.flags).toBe(32);
 w.tick();expect(observeSkills(w,3)[skill]).toMatchObject({phase:'Recovery',casts:1,locked:null,cd:distance===2?6:17});
 for(let tick=4;tick<=12;tick++)w.tick();
 expect(w.getComponent<any>('unit#0:body','State')!.current).toBe('Free');
 expect(w.getComponent<any>('target-a','Resource')!.current).toBe(2000);
 expect(observeSkills(w,12).slice(0,2).reduce((n,s)=>n+s.casts,0)).toBe(1);
});
it.each([2,10])('C1 production death removes the host and all attached skills without late damage: %s',distance=>{
 const w=controlled(distance,true);w.tick();expect(observeSkills(w,1)[distance===2?0:1].cd).toBe(distance===2?8:19);
 for(let tick=2;tick<=12;tick++)w.tick();
 expect(w.getAllEntities().filter(id=>id.startsWith('unit#0:'))).toEqual([]);
 expect(w.getComponent<any>('target-a','Resource')!.current).toBe(2000);
});
it('C1 production host motion updates both skill attachment positions and preserves host provenance',()=>{
 const w=createMultiskill();w.addComponent('unit#0:body',{type:'Velocity',vx:.5,vy:0} as any);
 const trace=[];
 for(let tick=1;tick<=4;tick++){
  w.tick();const x=w.getComponent<any>('unit#0:body','Transform')!.x;
  for(const id of ['unit#0:melee','unit#0:ranged'])expect(w.getComponent<any>(id,'Transform')!.x).toBe(x);
  if(tick===3){const zones=w.query('Hitbox').map(([id])=>w.getComponent<any>(id,'PrefabOrigin')?.source);expect(zones).toContain('unit#0:body');}
  trace.push({tick,x,hp:w.getComponent<any>('target-a','Resource')!.current});
 }
 expect(w.getComponent<any>('target-a','Resource')!.current).toBe(1993);
 console.log('C1_HOST_MOTION',JSON.stringify(trace));
});
