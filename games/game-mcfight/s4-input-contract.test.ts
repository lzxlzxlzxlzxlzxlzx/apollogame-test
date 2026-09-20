import { it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { S4_BALANCE_V1 as balance, S4_UNIT_IDS, S4_ACTIONS, S4_PROJECTIONS, S4_ENEMY_PRESETS, secondsToTicks, speedPerTick } from './content/s4-balance.js';
import { parseAndValidate } from '../../scripts/acceptance-schema.mjs';

it('six authoring loadouts reference nine skills; priority stays in catalog order', () => {
  expect(S4_UNIT_IDS).toHaveLength(6);
  for (const unit of Object.values(balance.units)) {
    expect(unit.armor).toBe(0);
    for (const skill of unit.skills) expect(balance.skills).toHaveProperty(skill);
  }
  expect(balance.units.elephant.skills).toEqual(['charge', 'strike']);
  expect(balance.units.earthshaker.skills).toEqual(['beam', 'quake']);
  expect(balance.units.witch.skills).toEqual(['heal', 'potion']);
  expect(Object.isFrozen(balance.skills.arrow)).toBe(true);
});
it('seconds convert once to the shared 20Hz clock, projectile travel gives one second', () => {
  expect(secondsToTicks(balance.skills.slash.windup)).toBe(7);
  expect(secondsToTicks(balance.skills.dive.descend)).toBe(9);
  expect(secondsToTicks(balance.skills.arrow.travel / balance.skills.arrow.speed)).toBe(20);
  expect(speedPerTick(balance.skills.arrow.speed) * 20).toBe(10);
  expect(() => secondsToTicks(NaN)).toThrow();
});
it('designer scenario signals/config and readable names have one production vocabulary', () => {
  const directory = resolve('docs/design/game-mcfight/acceptance');
  const files = readdirSync(directory).filter(file => file.endsWith('.scenario.jsonc'));
  expect(files.length).toBeGreaterThanOrEqual(4);
  for (const file of files) {
    const parsed = parseAndValidate(readFileSync(resolve(directory, file), 'utf8'));
    expect(parsed.errors, file).toEqual([]);
    const scenario = parsed.value!;
    if (scenario.config?.enemyPreset) expect(S4_ENEMY_PRESETS).toHaveProperty(scenario.config.enemyPreset as string);
    for (const step of scenario.steps) {
      if ('signal' in step) expect(Object.values(S4_ACTIONS)).toContain(step.signal);
      const assertions = 'expect' in step ? step.expect : 'waitUntil' in step ? step.waitUntil : [];
      for (const assertion of assertions) {
        if ('sv' in assertion) expect(S4_PROJECTIONS.strings).toContain(assertion.sv);
        if ('res' in assertion) expect(S4_PROJECTIONS.resources).toContain(assertion.res);
        if ('flag' in assertion) expect(S4_PROJECTIONS.flags).toContain(assertion.flag);
      }
    }
  }
});
