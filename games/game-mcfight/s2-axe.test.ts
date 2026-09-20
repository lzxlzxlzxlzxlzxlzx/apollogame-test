import { it, expect } from 'vitest';
import { axePlayback } from './s2-axe.fixture.js';
it('production State selects animation frames while real contact remains one tick after release',()=>{
 const w=axePlayback(), rows=[];
 for(let tick=1;tick<=6;tick++){
  w.tick(); rows.push({tick,clip:w.getComponent<any>('melee','AnimState')!.current,frame:w.getComponent<any>('melee','Frame')!.index,hp:w.getComponent<any>('flyer','Resource')!.current,zones:w.query('Hitbox').length});
 }
 expect(rows[0]).toMatchObject({clip:'Windup',frame:2,hp:30});
 expect(rows[1]).toMatchObject({clip:'Windup',frame:3,hp:30});
 expect(rows[2]).toMatchObject({clip:'Active',frame:4,hp:30,zones:1});
 expect(rows[3]).toMatchObject({clip:'Recovery',frame:6,hp:23,zones:0});
 console.log('AXE_PLAYBACK_TRACE',JSON.stringify(rows));
});

it('records release-tick control presentation separately from damage safety',async()=>{
 const { factories }=await import('./s2-visual.fixture.js');
 const w=axePlayback(factories.control);
 for(let tick=1;tick<=3;tick++)w.tick();
 expect(w.getComponent<any>('flyer','Resource')!.current).toBe(30);
 expect(w.query('Hitbox').length).toBe(0);
 // Former failure: Active survived this boundary. Presentation now cancels in Commit.
 expect(w.getComponent<any>('melee','AnimState')!.current).toBe('Recovery');
 expect(w.getComponent<any>('melee','Frame')!.index).toBe(6);
 for(let tick=4;tick<=6;tick++){w.tick();expect(w.getComponent<any>('melee','AnimState')!.current).toBe('Recovery');expect(w.getComponent<any>('flyer','Resource')!.current).toBe(30);expect(w.query('Hitbox').length).toBe(0);}
 console.log('AXE_CONTROL_PRESENTATION_FIXED',JSON.stringify({tick:6,status:w.getComponent<any>('melee','Status')!.flags,clip:w.getComponent<any>('melee','AnimState')!.current,hp:30}));
});



