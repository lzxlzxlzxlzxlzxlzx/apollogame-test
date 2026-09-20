import {it,expect} from 'vitest';
import {BoundPlayback} from './s2-bound-playback.js';
import {createMultiskill} from './s2-multiskill.fixture.js';
import {world} from './s2-dive.fixture.js';
it('two shared melee instances and actual dive phases select independent missing-art clips without combat writes',()=>{
 const observer=new BoundPlayback(),w=createMultiskill();
 for(let tick=0;tick<16;tick++){const before=w.snapshot(),rows=observer.sample(w,tick);expect(w.snapshot()).toEqual(before);expect(rows.map(r=>r.unit)).toEqual(['vindicator','zombie']);expect(rows.every(r=>r.missing)).toBe(true);w.tick();}
 observer.reset();const dive=world(),phases=[];for(let tick=0;tick<6;tick++){phases.push(observer.sample(dive,tick)[0].phase);dive.tick();}
 expect(phases).toContain('Dive');expect(phases).toContain('Rise');
});
