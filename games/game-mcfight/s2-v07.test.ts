import { it,expect } from 'vitest';
import { multiPulse } from './s2-v07.fixture.js';
import { SystemPhase } from '@engine/core/types.js';
it.each([false,true])('three production pulses hit each enemy once per pulse, friendlyFire=%s',friendlyFire=>{
 const w=multiPulse(friendlyFire),origins=new Map<string,string>();
 const trace:Array<{tick:number;a:number;b:number;friend:number;zones:number}>=[];
 w.addSystem({id:'test-observe-origin',phase:SystemPhase.Resolve,runsBefore:['hitbox'],reads:['PrefabOrigin'],writes:[],consumes:[],execute(world){for(const [id] of world.query('Hitbox','PrefabOrigin'))origins.set(id,world.getComponent<any>(id,'PrefabOrigin')!.source);}});
 for(let tick=1;tick<=10;tick++){w.tick();trace.push({tick,a:w.getComponent<any>('enemy-a','Resource')!.current,b:w.getComponent<any>('enemy-b','Resource')!.current,friend:w.getComponent<any>('friend','Resource')!.current,zones:w.query('Hitbox').length});}
 const hits=trace.filter((r,i)=>r.a<(i?trace[i-1].a:50));
 expect(hits).toHaveLength(3);expect(hits[1].tick-hits[0].tick).toBe(2);expect(hits[2].tick-hits[1].tick).toBe(2);
 expect(trace[9]).toMatchObject({a:41,b:41,friend:friendlyFire?41:50,zones:0});
 expect(origins.size).toBe(3);expect([...origins.values()]).toEqual(['source','source','source']);
 console.log('V07_PULSE_TRACE',JSON.stringify({friendlyFire,trace,origins:[...origins]}));
});

