import { expect, it } from 'vitest';
import { createMultiskill, observeSkills } from './s2-multiskill.fixture.js';
it.each([[2,false,'melee'],[10,false,'ranged'],[2,true,'ranged']] as const)('distance %s flight %s chooses %s', (distance,flight,selected)=>{
 const w=createMultiskill(distance,flight);w.tick();const rows=observeSkills(w,1);
 expect(rows.find(r=>r.id==='unit#0:'+selected)).toMatchObject({phase:'Windup',casts:1});
 expect(rows.find(r=>r.id==='unit#0:'+(selected==='melee'?'ranged':'melee'))).toMatchObject({phase:'Ready',casts:0,cd:0});
});
it('two skills repeat with independent cooldown and a shared action owner; second unit reuses melee with different parameters',()=>{
 const w=createMultiskill();const trace:ReturnType<typeof observeSkills>[]=[];
 for(let tick=1;tick<=80;tick++){
  w.tick();const rows=observeSkills(w,tick);trace.push(rows);
  expect(rows.slice(0,2).filter(r=>r.phase!=='Ready').length).toBeLessThanOrEqual(1);
  if(tick>1)for(let i=0;i<3;i++){
   const previous=trace[tick-2][i],now=rows[i];
   if(now.casts>previous.casts){expect(previous.phase).toBe('Ready');expect(now.phase).toBe('Windup');}
   if(previous.phase==='Windup')expect(now.casts).toBe(previous.casts);
   if(now.casts===previous.casts)expect(now.cd).toBe(Math.max(0,previous.cd-1));
  }
 }
 for(let i=0;i<3;i++){
  const starts=trace.filter((rows,t)=>rows[i].casts>(t?trace[t-1][i].casts:0)).map(rows=>rows[i].tick);
  expect(starts.length).toBeGreaterThanOrEqual(3);
  for(const start of starts)if(start+2<=80)expect(trace[start+1][i].phase).toBe('Active');
  for(let t=1;t<starts.length;t++)expect(starts[t]-starts[t-1]).toBeGreaterThanOrEqual(i===1?19:8);
 }
 const active=trace.flat().filter(r=>r.phase==='Active'&&r.tick<80);
 const aDamage=active.filter(r=>r.id==='unit#0:melee').length*7+active.filter(r=>r.id==='unit#0:ranged').length*11;
 const bDamage=active.filter(r=>r.id==='unit#1:melee').length*13;
 // Record the entire trace rather than reconstructing state from intended timers.
 console.log('V02_MULTI_SKILL_TRACE',JSON.stringify(trace));
 expect(w.getComponent<any>('target-a','Resource')!.current).toBe(2000-aDamage);
 expect(w.getComponent<any>('target-b','Resource')!.current).toBe(2000-bDamage);
});
it('no eligible target leaves both skills ready without charging cooldown',()=>{
 const w=createMultiskill(40);for(let i=0;i<25;i++)w.tick();
 for(const row of observeSkills(w,25).slice(0,2))expect(row).toMatchObject({phase:'Ready',casts:0,cd:0,locked:null});
});

it('a ready ranged skill uses the free action slot while melee cooldown continues',()=>{
 const w=createMultiskill();for(let t=1;t<=6;t++)w.tick();
 const rows=observeSkills(w,6);
 expect(rows[0]).toMatchObject({phase:'Ready',casts:1,cd:3});
 expect(rows[1]).toMatchObject({phase:'Windup',casts:1,cd:19});
});
it('production target movement changes next skill choice without restarting a committed Windup',()=>{
 const w=createMultiskill();w.addComponent('target-a',{type:'Velocity',vx:1,vy:0});
 w.tick();expect(observeSkills(w,1)[0]).toMatchObject({phase:'Windup',casts:1});
 w.tick();w.tick();expect(observeSkills(w,3)[0]).toMatchObject({phase:'Active',casts:1,locked:'target-a'});
 for(let t=4;t<=6;t++)w.tick();expect(observeSkills(w,6)[1]).toMatchObject({phase:'Windup',casts:1,locked:'target-a'});
});
