import { describe, expect, it } from 'vitest';
import { r3Catalog } from './content/r3-catalog.js';
const template=(id:string)=>{const u=r3Catalog.units.find(x=>x.id===id)!;const d=r3Catalog.decisions.find(x=>x.id===u.decisionProfileId)!;return r3Catalog.templates.find(x=>x.id===d.candidates[0]) as any;};
describe('R3-B2 compiled runtime wiring',()=>{
 it('compiles volley and cone fields without silent renaming',()=>{
  const blaze=template('blaze'); expect(blaze.volleyCount).toBe(3); expect(blaze.volleyIntervalTicks).toBe(2);
  const bird=template('iceandfire_stymphalianbird'); expect(bird.volleyCount).toBe(2); expect(bird.volleyIntervalTicks).toBe(0); expect(bird.armorPiercing).toBe(true);
  for(const id of ['twilightforest_fire_beetle','twilightforest_winter_wolf']){const t=template(id); expect(t.shape).toBe('cone'); expect(t.coneRadius).toBeCloseTo(64/24); expect(t.coneAngleRadians).toBeCloseTo(Math.PI/3); expect(t.pulseCount).toBe(4); expect(t.pulseIntervalTicks).toBe(10); expect(t.lockAimOnStart).toBe(true);}
 });
});
