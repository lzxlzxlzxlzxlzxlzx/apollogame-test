import {it,expect} from 'vitest';
import {surround} from './s2-c3.fixture.js';
import {navigationScene} from './s2-v06.fixture.js';
it.each([3,6])('C3 %s units surround for 100 ticks with independent casts and bounded motion',count=>{
 const w=surround(count),trace=[];let previous=Array.from({length:count},(_,i)=>({...w.getComponent<any>(`scale#${i}:body`,'Transform')}));
 const casts=new Map<string,{count:number;phase:string}>();
 for(let tick=1;tick<=100;tick++){
  w.tick();const positions=Array.from({length:count},(_,i)=>({...w.getComponent<any>(`scale#${i}:body`,'Transform')}));
  const maxStep=Math.max(...positions.map((p,i)=>Math.hypot(p.x-previous[i].x,p.y-previous[i].y)));expect(maxStep).toBeLessThanOrEqual(.251);
  for(let i=0;i<count;i++)for(const skill of ['melee','ranged']){const id=`scale#${i}:${skill}`,phase=w.getComponent<any>(id,'GameFlow')!.current,n=w.getComponent<any>(id,'Resource')!.current,old=casts.get(id);if(old&&old.phase==='Windup')expect(n).toBe(old.count);casts.set(id,{phase,count:n});}
  const minGap=Math.min(...positions.flatMap((p,i)=>positions.slice(i+1).map(q=>Math.hypot(p.x-q.x,p.y-q.y))));
  trace.push({tick,maxStep,minGap,distances:positions.map(p=>Math.hypot(p.x,p.y))});previous=positions;
 }
 expect(trace[99].minGap).toBeGreaterThan(.799);expect(Math.max(...trace[99].distances)).toBeLessThan(3.1);
 console.log('C3_SURROUND',JSON.stringify({count,trace}));
});
it('C3 opposite corner approach uses the mirrored authored graph and actual wall',()=>{
 const w=navigationScene();const nav=w.getComponent<any>('nav','NavGraph')!;for(const n of nav.nodes)n.y=-n.y;
 for(let tick=0;tick<100;tick++)w.tick();const t=w.getComponent<any>('u0','Transform')!;expect(Math.hypot(t.x-10,t.y)).toBeLessThan(.51);
});
