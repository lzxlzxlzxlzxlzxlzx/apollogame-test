import {it,expect} from 'vitest';
import {closeoutPulse} from './s2-c4.fixture.js';
import {SystemPhase} from '@engine/core/types.js';
it.each([0,.5] as const)('C4 per-segment live eligibility and friendly multiplier %s',multiplier=>{
 const w=closeoutPulse(multiplier),trace:Array<{tick:number;a:number;b:number;friend:number;x:number}>=[],origins=new Map();
 w.addSystem({id:'test-segments',phase:SystemPhase.Resolve,runsBefore:['hitbox'],reads:['PrefabOrigin'],writes:[],consumes:[],execute(world){for(const [id]of world.query('Hitbox','PrefabOrigin'))origins.set(id,world.getComponent<any>(id,'PrefabOrigin')!.source);}});
 for(let tick=1;tick<=10;tick++){w.tick();trace.push({tick,a:w.getComponent<any>('enemy-a','Resource')!.current,b:w.getComponent<any>('enemy-b','Resource')!.current,friend:w.getComponent<any>('friend','Resource')!.current,x:w.getComponent<any>('enemy-b','Transform')!.x});}
 expect(trace[9]).toMatchObject({a:41,b:47,friend:50-9*multiplier});
 const hits=trace.filter((r,i)=>r.a<(i?trace[i-1].a:50));expect(hits.map(r=>r.tick)).toEqual([1,3,5]);
 expect(origins.size).toBe(6);expect([...origins.values()].every(s=>s==='source')).toBe(true);
 expect(w.query('Hitbox')).toHaveLength(0);
 console.log('C4_SEGMENTS',JSON.stringify({castId:'source:1',multiplier,segments:hits.map((h,i)=>({segment:i+1,tick:h.tick})),trace,origins:[...origins]}));
});
it.each(['control','death'] as const)('C4 production %s after first pulse prevents remaining pulses',interrupt=>{
 const w=closeoutPulse(.5,interrupt);for(let i=0;i<10;i++)w.tick();
 expect(w.getComponent<any>('enemy-a','Resource')!.current).toBe(47);expect(w.getComponent<any>('enemy-b','Resource')!.current).toBe(50);expect(w.getComponent<any>('friend','Resource')!.current).toBe(48.5);expect(w.query('Hitbox')).toHaveLength(0);
});
it('C4 reopened world has no previous hit records',()=>{
 for(let run=0;run<2;run++){const w=closeoutPulse(.5);for(let tick=0;tick<10;tick++)w.tick();expect(w.getComponent<any>('enemy-a','Resource')!.current).toBe(41);expect(w.query('Hitbox')).toHaveLength(0);}
});
