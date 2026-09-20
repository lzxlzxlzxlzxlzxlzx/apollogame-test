import {it,expect} from 'vitest';
import {cpus,platform,release} from 'node:os';
import {scaleBattle} from './s2-c5.fixture.js';
import {createMultiskill} from './s2-multiskill.fixture.js';
import {closeoutPulse} from './s2-c4.fixture.js';
import {add,xf} from './s2-round2.fixture.js';
import {ZONE_FLAG} from '@skills/tier2/trigger-zone.js';
it('C5 three identical input runs compare authoritative worlds on every tick',()=>{
 const runs=Array.from({length:3},()=>[createMultiskill(),closeoutPulse(.5),scaleBattle(6,301)]);
 for(const worlds of runs){worlds[0].addComponent('target-a',{type:'Velocity',vx:.1,vy:0} as any);worlds[0].addComponent('unit#0:body',{type:'Shape',kind:'circle',radius:.25} as any);worlds[0].addComponent('unit#0:body',{type:'Tag',flags:4} as any);}
 for(let tick=1;tick<=100;tick++){
  for(const worlds of runs){if(tick===15)add(worlds[0],'external-lethal',{Transform:xf(0),Shape:{kind:'circle',radius:1},Tag:{flags:ZONE_FLAG},Hitbox:{resource:'hp',amount:200,targetMask:4,consumeOnHit:true}});for(const w of worlds)w.tick();}
  const snapshots=runs.map(worlds=>worlds.map(w=>w.snapshot()));expect(snapshots[1]).toEqual(snapshots[0]);expect(snapshots[2]).toEqual(snapshots[0]);
 }
 expect(runs[0][0].getAllEntities()).not.toContain('unit#0:body');expect(runs[0][1].query('Hitbox')).toHaveLength(0);
});
it.skipIf(process.env.MCFIGHT_SCALE !== '1')('C5 warmed 20/50/100 combatants, three 1000-tick measurement rounds',()=>{
 const results=[];
 for(const count of [20,50,100])for(let run=-1;run<3;run++){
  const w=scaleBattle(count),times=[];for(let tick=0;tick<1000;tick++){const t=performance.now();w.tick();times.push(performance.now()-t);}
  if(run<0)continue;const sorted=[...times].sort((a,b)=>a-b),entities=w.getAllEntities().length,activeZones=w.query('Hitbox').length;
  // Drain the finite attacks by removing target qualification via external input.
  w.getComponent<any>('target','Tag')!.flags=0;for(let i=0;i<10;i++)w.tick();
  const residual=w.query('Hitbox').length;expect(residual).toBe(0);
  results.push({count,run:run+1,ticks:1000,totalMs:times.reduce((a,b)=>a+b,0),medianMs:sorted[500],p95Ms:sorted[950],maxMs:sorted[999],entitiesAt1000:entities,activeZonesAt1000:activeZones,residualAfterDrain:residual,entitiesAfterDrain:w.getAllEntities().length});
 }
 console.log('C5_SCALE',JSON.stringify({environment:{node:process.version,platform:platform(),release:release(),cpu:cpus()[0]?.model},results}));
},120000);
