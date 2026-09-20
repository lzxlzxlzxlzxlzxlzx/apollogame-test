import { describe, expect, it } from 'vitest';
import { r3Catalog } from './content/r3-catalog.js';

const batch = ['stray','iceandfire_if_cockatrice','cataclysm_the_watcher','wither_skeleton','blaze','twilightforest_fire_beetle','twilightforest_winter_wolf','iceandfire_stymphalianbird','elephant','twilightforest_minoshroom','vex','alexsmobs_farseer','alexsmobs_tarantula_hawk','mowziesmobs_naga','alexsmobs_warped_mosco','alexscaves_teleto'];

describe('R3 B2+B3 catalog completeness', () => {
  it('compiles every batch unit with executable signature templates', () => {
    for (const id of batch) {
      const unit = r3Catalog.units.find(x => x.id === id);
      expect(unit, id).toBeTruthy();
      const decision = r3Catalog.decisions.find(x => x.id === unit!.decisionProfileId);
      expect(decision?.candidates.length, id).toBeGreaterThan(0);
      for (const candidate of decision!.candidates) {
        expect(r3Catalog.templates.find(x => x.id === candidate), `${id}/${candidate}`).toBeTruthy();
      }
    }
  });
});
