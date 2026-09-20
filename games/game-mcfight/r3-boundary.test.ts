import { it,expect } from 'vitest';
import { createR3Boundary } from './r3-boundary.fixture.js';
it('SK10 boundary only: continuous planar travel and real endpoint contact, no claim of airborne leap',()=>{
 const s=createR3Boundary('SK10');try{
  for(let i=0;i<25;i++)s.step();
  const xs=s.log.flatMap(r=>r.positions.a?[r.positions.a[0]]:[]);
  expect(xs.length).toBeGreaterThan(10);for(let i=1;i<xs.length;i++)expect(Math.abs(xs[i]!-xs[i-1]!)).toBeLessThanOrEqual(.200001);
  expect(s.log.at(-1)!.hp['a-target']).toBe(45);expect(s.log.at(-1)!.hp['b-target']).toBe(45);
 }finally{s.dispose();}
});
it('SK22 boundary only: two physical segments each contact, exposing absent shared output cooldown',()=>{
 const s=createR3Boundary('SK22');try{
  s.step();expect(s.log.at(-1)!.hp['a-target']).toBe(40);expect(s.log.at(-1)!.hp['b-target']).toBe(40);
  s.strike('part-input',-.2,0,3,'a-one');s.step();
  expect(s.log.at(-1)!.hp['a-head']).toBe(47);expect(s.log.at(-1)!.hp['b-head']).toBe(50);
 }finally{s.dispose();}
});
it('SK24 boundary only: separate resources/attacks; mount death currently cascades rider instead of dismounting',()=>{
 const s=createR3Boundary('SK24');try{
  for(let i=0;i<8;i++)s.step();
  const sources=s.log.flatMap(r=>r.sources);expect(sources).toContain('mount#0:body');expect(sources).toContain('rider#0:body');
  expect(s.log.at(-1)!.hp['mount#0:body']).toBeGreaterThan(0);expect(s.log.at(-1)!.hp['rider#0:body']).toBeGreaterThan(0);
  s.strike('mount-lethal',0,0,1e6,'mount#0:body');s.step();
  expect(s.world.hasComponent('mount#0:body','Resource')).toBe(false);expect(s.world.hasComponent('rider#0:body','Resource')).toBe(false);
 }finally{s.dispose();}
});
