import { it, expect } from 'vitest';
import { scene } from './s2-v06.fixture.js';
it.each([[false,false],[true,false],[false,true]])('V06 observed geometry stacked=%s wall=%s', (stacked,wall)=>{
 const w=scene(stacked,wall),trace=[];
 const order=w.getSortedSystems().map(s=>s.id);
 expect(order.indexOf('overlap-detect')).toBeLessThan(order.indexOf('collision-resolve'));
 console.log('V06_SYSTEM_ORDER',JSON.stringify(order));
 for(let tick=1;tick<=40;tick++){
  w.tick();const positions=Array.from({length:4},(_,i)=>{const t=w.getComponent<any>('u'+i,'Transform')!;expect(Number.isFinite(t.x)&&Number.isFinite(t.y)).toBe(true);return {x:t.x,y:t.y};});
  trace.push({tick,positions});
 }
 const final=trace[39].positions;
 if(wall)expect(final.every(p=>p.x<=4.01)).toBe(true);
 else expect(final.every(p=>Math.hypot(p.x-10,p.y)<4)).toBe(true);
 console.log('V06_GEOMETRY_TRACE',JSON.stringify({stacked,wall,trace}));
});



it.each([false,true])('V06 measures residual overlap and per-tick displacement, stacked=%s',stacked=>{
 const w=scene(stacked);let maxStep=0,minGap=Infinity;const trace=[];
 const positions=()=>Array.from({length:4},(_,i)=>{const t=w.getComponent<any>('u'+i,'Transform')!;return {x:t.x,y:t.y};});
 let previous=positions();
 for(let tick=1;tick<=100;tick++){
  w.tick();const next=positions();
  const step=Math.max(...next.map((p,i)=>Math.hypot(p.x-previous[i].x,p.y-previous[i].y)));
  // Initial overlap correction is measured separately, not labelled locomotion.
  if(tick>10)maxStep=Math.max(maxStep,step);
  minGap=Math.min(...next.flatMap((p,i)=>next.slice(i+1).map(q=>Math.hypot(p.x-q.x,p.y-q.y))));
  trace.push({tick,step,minGap});previous=next;
 }
 console.log('V06_CLEARANCE_TRACE',JSON.stringify({stacked,maxStep,minGap,trace}));
 expect(minGap).toBeGreaterThanOrEqual(.99);
 expect(maxStep).toBeLessThanOrEqual(.51);
 console.log('V06_CLEARANCE_TRACE',JSON.stringify({stacked,maxStep,minGap,trace}));
});


it.each([true,false])('navigation with actual corner collider; connected=%s',async connected=>{
 const { navigationScene }=await import('./s2-v06.fixture.js');
 const w=navigationScene(connected),trace=[];let previous={x:0,y:0};
 for(let tick=1;tick<=100;tick++){
  w.tick();const t=w.getComponent<any>('u0','Transform')!,v=w.getComponent<any>('u0','Velocity')!;
  expect(Math.hypot(t.x-previous.x,t.y-previous.y)).toBeLessThanOrEqual(.251);
  // Circle center must remain outside the wall expanded by its radius.
  expect(t.x>4.001&&t.x<5.999&&Math.abs(t.y)<2.499).toBe(false);
  trace.push({tick,x:t.x,y:t.y,vx:v.vx,vy:v.vy});previous={x:t.x,y:t.y};
 }
 if(connected)expect(Math.hypot(previous.x-10,previous.y)).toBeLessThanOrEqual(.51);
 else expect(previous.x).toBeLessThanOrEqual(4.001);
 console.log('V06_NAV_TRACE',JSON.stringify({connected,trace}));
});
