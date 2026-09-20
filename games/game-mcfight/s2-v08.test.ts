import { it, expect } from 'vitest';
import { scene } from './s2-v06.fixture.js';
import { mulberry32 } from '@skills/atoms/random/index.js';
function seeded(seed:number,count:number){
 const w=scene(false,false,count),rng=mulberry32(seed);
 for(let i=0;i<count;i++){const t=w.getComponent<any>('u'+i,'Transform')!;t.x=-10*rng();t.y=(rng()-.5)*20;}
 return w;
}
it('V08 same seed and external inputs reproduce every world snapshot',()=>{
 const a=seeded(301,24),b=seeded(301,24);
 for(let tick=1;tick<=60;tick++){
  if(tick===12||tick===30)for(const w of [a,b])w.getComponent<any>('target','Transform')!.y=tick===12?4:0;
  a.tick();b.tick();expect(a.snapshot()).toEqual(b.snapshot());
 }
 expect(seeded(302,24).snapshot()).not.toEqual(seeded(301,24).snapshot());
});
it('V08 records geometry-combination cost without inventing a performance gate',()=>{
 const results=[];
 for(const count of [16,64,128]){
  const w=seeded(301,count),times=[];
  for(let tick=0;tick<60;tick++){const start=performance.now();w.tick();times.push(performance.now()-start);}
  const sorted=[...times].sort((a,b)=>a-b);
  results.push({count,ticks:60,totalMs:times.reduce((a,b)=>a+b,0),medianMs:sorted[30],p95Ms:sorted[57],maxMs:sorted[59]});
  expect(times.every(Number.isFinite)).toBe(true);
 }
 console.log('V08_GEOMETRY_MEASUREMENT',JSON.stringify(results));
});
