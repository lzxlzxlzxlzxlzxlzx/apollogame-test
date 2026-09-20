import { it,expect } from 'vitest';
import { createR3Session } from './r3-session.js';
import { S4_ACTIONS as A } from './content/s4-balance.js';
import type { Resource,Transform,GameFlow,Timer } from '@engine/protocol/components.js';
it('three runs with the same seed and external commands reproduce formation, positions, phases, cooldowns and actual damage',()=>{
 const run=()=>{
  const s=createR3Session(739),trace:object[]=[];
  try{
   s.command(A.buy,{unitId:'vindicator'});s.command(A.buy,{unitId:'iceandfire_cyclops'});s.command(A.deploy);
   for(const [i,r]of s.roster.entries())s.command(A.place,{instanceId:r.instanceId,x:-8,y:i*3-1.5});
   expect(s.canStartBattle).toBe(true);s.command(A.start);
   for(let tick=0;tick<260;tick++){
    s.tick();const w=s.world;
    trace.push(structuredClone({tick:s.battleTicks,phase:s.phase,damage:[s.playerDamage,s.enemyDamage,s.playerHealing,s.enemyHealing],
     bodies:w.query('Resource').map(([id])=>({id,hp:w.getComponent<Resource>(id,'Resource')!.current,position:w.getComponent<Transform>(id,'Transform')})),
     flows:w.query('GameFlow').map(([id])=>({id,phase:w.getComponent<GameFlow>(id,'GameFlow')!.current,target:w.getComponent<GameFlow>(id,'GameFlow')!.targetSnapshot,cd:w.getComponent<Timer>(id,'Timer')?.elapsed}))}));
   }
   expect(s.playerDamage+s.enemyDamage).toBeGreaterThan(0);
   return {formation:s.enemyUnits,trace};
  }finally{s.dispose();}
 };
 const first=run();expect(run()).toEqual(first);expect(run()).toEqual(first);
});
