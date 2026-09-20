import { it, expect } from 'vitest';
import { factories } from './s2-visual.fixture.js';
it.each(['moving','normal','control','death','area','reselect'] as const)('visible production scenario %s', key=>{
 const w=factories[key]();for(let i=0;i<6;i++)w.tick();
 expect(w.getComponent<any>('flyer','Resource')!.current).toBe(['control','death','reselect'].includes(key)?30:23);
 if(key==='area')expect(w.getComponent<any>('second-flyer','Resource')!.current).toBe(23);
 if(key==='death')expect(w.getAllEntities()).not.toContain('melee');
 expect(w.query('PrefabOrigin')).toHaveLength(0);
});

it('B3 observation scenarios are production identity worlds',()=>{
 const charge=factories.b3Charge();
 const dive=factories.b3Dive();
 const transform=factories.b3Transform();
 try{
  for(let i=0;i<80;i++){
   charge.tick();dive.tick();transform.tick();
  }
  expect(charge.getComponent<any>('a-target','Resource')!.current).toBeLessThan(100000);
  expect(dive.query('GameFlow').length).toBeGreaterThan(0);
  expect(transform.getComponent<any>('a#0:body','FormChange')?.changed).toBe(true);
 } finally {
  for(const world of [charge,dive,transform]) for(const id of world.getAllEntities()) world.destroyEntity(id);
 }
});
