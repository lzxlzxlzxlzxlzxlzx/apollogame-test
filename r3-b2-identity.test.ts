import { describe, expect, it } from 'vitest';
import { r3Catalog } from './content/r3-catalog.js';

const cases: Array<[string, string[]]> = [
  ['stray',['projectile']], ['iceandfire_if_cockatrice',['projectile']], ['cataclysm_the_watcher',['projectile']],
  ['wither_skeleton',['melee']], ['blaze',['projectile']],
  ['twilightforest_fire_beetle',['area']], ['twilightforest_winter_wolf',['area']],
  ['iceandfire_stymphalianbird',['projectile']],
];

describe('R3 B2 named identity catalog', () => {
  it.each(cases)('%s has the approved executable signature', (id, forms) => {
    const unit = r3Catalog.units.find(x => x.id === id);
    expect(unit).toBeTruthy();
    const decision = r3Catalog.decisions.find(x => x.id === unit!.decisionProfileId)!;
    const templates = decision.candidates.map(candidate => r3Catalog.templates.find(x => x.id === candidate)!);
    expect(templates.map(x => x.form)).toEqual(forms);
    expect(templates.every(Boolean)).toBe(true);
    if(id==='blaze') expect(templates[0]!.volleyCount).toBe(3);
    if(id==='iceandfire_stymphalianbird') expect(templates[0]!.volleyCount).toBe(2);
  });
});
