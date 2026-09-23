import { describe, expect, it } from 'vitest';
import { DEFAULT_RHETORIC_CONFIG, RHETORIC_CATALOG, RHETORIC_ENCOUNTERS, RHETORIC_FIXTURES, STARTER_CALM_REASON, validateRhetoricGameConfig } from './config.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('game-rhetoric-duel · W1 internal configuration', () => {
  it('has exactly ten uniquely skinned catalog cards and a fifteen-card starter deck', () => {
    expect(RHETORIC_CATALOG).toHaveLength(10);
    expect(new Set(RHETORIC_CATALOG.map((card) => card.cardId)).size).toBe(10);
    expect(new Set(RHETORIC_CATALOG.map((card) => card.skinKey)).size).toBe(10);
    expect(STARTER_CALM_REASON.reduce((sum, entry) => sum + entry.copies, 0)).toBe(15);
  });

  it('validates all three internal encounter fixtures through the same strict boundary', () => {
    expect(RHETORIC_ENCOUNTERS).toHaveLength(3);
    expect(RHETORIC_FIXTURES.map((fixture) => validateRhetoricGameConfig(fixture).encounter.id))
      .toEqual(['gatekeeper-shi', 'merchant-luo', 'instructor-jiang']);
  });

  it('rejects unknown cards, repeated deck rows, over-limit copies, illegal effects and insufficient intentions', () => {
    const unknown = copy(DEFAULT_RHETORIC_CONFIG) as any; unknown.deck[0].cardId = 'unknown-card';
    expect(() => validateRhetoricGameConfig(unknown)).toThrow('is unknown');
    const duplicate = copy(DEFAULT_RHETORIC_CONFIG) as any; duplicate.deck.push(copy(duplicate.deck[0]));
    expect(() => validateRhetoricGameConfig(duplicate)).toThrow('must be unique');
    const copies = copy(DEFAULT_RHETORIC_CONFIG) as any; copies.deck[0].copies = 99;
    expect(() => validateRhetoricGameConfig(copies)).toThrow('integer in 1..3');
    const illegalEffect = copy(DEFAULT_RHETORIC_CONFIG) as any; illegalEffect.encounter.intentions[0].effects[0].targetId = 'free-form';
    expect(() => validateRhetoricGameConfig(illegalEffect)).toThrow('is not approved');
    const shortScript = copy(DEFAULT_RHETORIC_CONFIG) as any; shortScript.encounter.intentions.pop();
    expect(() => validateRhetoricGameConfig(shortScript)).toThrow('must cover turnLimit');
  });
});
