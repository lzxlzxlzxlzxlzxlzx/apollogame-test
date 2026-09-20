import { it, expect } from 'vitest';
import { factories } from './s2-visual.fixture.js';
import { ActionObservation } from './s2-action-observation.js';
it.each(['axe','axeLeft','axeMoving'] as const)('read-only presentation follows actual release and damage: %s',key=>{
 const w=factories[key](),o=new ActionObservation();o.sample(w);const trace=[];
 for(let tick=1;tick<=6;tick++){w.tick();trace.push({tick,...o.sample(w)});}
 expect(trace[0].clip).toBe('Windup');expect(trace[2].clip).toBe('Active');expect(trace[2].hits).toEqual([]);
 expect(trace[3].hits).toHaveLength(1);expect(trace[3].hits[0].amount).toBe(7);
 expect(trace[4].hits).toEqual([]);expect(trace[0].facing).toBe(key==='axeLeft'?-1:1);
 expect(trace[3].facing).toBe(trace[0].facing);
 console.log('AXE_RENDER_TRACE',JSON.stringify({key,trace}));
});
it.each(['axeControl','axeDeath'] as const)('same-tick cancellation removes pending attack presentation: %s',key=>{
 const w=factories[key](),o=new ActionObservation();o.sample(w);
 for(let tick=1;tick<=6;tick++){w.tick();const p=o.sample(w);if(tick>=3){expect(p.hits).toEqual([]);if(key==='axeControl')expect(p.clip).toBe('Recovery');else expect(p.visible).toBe(false);}}
});
it('reset clears damage history and captured facing',()=>{
 const o=new ActionObservation(),w=factories.axeLeft();o.sample(w);w.tick();expect(o.sample(w).facing).toBe(-1);
 o.reset();expect(o.sample(factories.axe())).toMatchObject({facing:1,hits:[]});
});
it('facing uses the capture decision position, not post-motion crossing',()=>{
 const w=factories.axe(),o=new ActionObservation();
 w.addComponent('flyer',{type:'Velocity',vx:-10,vy:0} as any);o.sample(w);
 w.tick();expect(w.getComponent<any>('flyer','Transform')!.x).toBeLessThan(0);
 expect(o.sample(w).facing).toBe(1);
 w.tick();expect(o.sample(w).facing).toBe(1);
});
