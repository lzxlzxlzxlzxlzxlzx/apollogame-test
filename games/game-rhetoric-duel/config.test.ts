import { describe, expect, it } from 'vitest';
import { DEFAULT_RHETORIC_CONFIG, RHETORIC_CATALOG, RHETORIC_ENCOUNTERS, RHETORIC_FIXTURES, STARTER_CALM_REASON, validateRhetoricGameConfig } from './config.js';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('game-rhetoric-duel · W1 internal configuration', () => {
  it('has exactly ten uniquely skinned catalog cards and a fifteen-card starter deck', () => {
    expect(RHETORIC_CATALOG).toHaveLength(10);
    expect(new Set(RHETORIC_CATALOG.map((card) => card.cardId)).size).toBe(10);
    expect(new Set(RHETORIC_CATALOG.map((card) => card.skinKey)).size).toBe(10);
    expect(STARTER_CALM_REASON.reduce((sum, entry) => sum + entry.copies, 0)).toBe(15);
    for (const card of RHETORIC_CATALOG) {
      expect(card).toMatchObject({
        cardId: expect.any(String), displayName: expect.any(String), flavorText: expect.any(String),
        focusCost: expect.any(Number), maxCopies: expect.any(Number), skinKey: `game-rhetoric-duel/card/${card.cardId}`,
      });
      expect(card.effects.length).toBeGreaterThan(0);
      for (const effect of card.effects) {
        expect(effect.kind).toBe('modify-resource');
        expect(['progress', 'pressure', 'focus']).toContain(effect.targetId);
        expect(['add', 'set']).toContain(effect.op);
      }
    }
    for (const entry of STARTER_CALM_REASON) {
      const card = RHETORIC_CATALOG.find((candidate) => candidate.cardId === entry.cardId);
      expect(card).toBeDefined();
      expect(entry.copies).toBeLessThanOrEqual(card!.maxCopies);
    }
  });

  it('validates all three internal encounter fixtures through the same strict boundary', () => {
    expect(RHETORIC_ENCOUNTERS).toHaveLength(3);
    expect(RHETORIC_FIXTURES.map((fixture) => validateRhetoricGameConfig(fixture).encounter.encounterId))
      .toEqual(['gatekeeper-shi', 'merchant-luo', 'instructor-jiang']);
    for (const fixture of RHETORIC_FIXTURES) {
      const { encounter } = validateRhetoricGameConfig(fixture);
      expect(encounter.backgroundSkinKey).toMatch(/^game-rhetoric-duel\/background\//);
      expect(encounter.portraitSkinKey).toMatch(/^game-rhetoric-duel\/opponent\//);
      expect(fixture.renderSkin.cardSkinPrefix).toBe('game-rhetoric-duel/card/');
      expect(encounter.intentions.length).toBeGreaterThanOrEqual(encounter.turnLimit);
      expect(new Set(encounter.intentions.map((intent) => intent.id)).size).toBe(encounter.intentions.length);
      expect(JSON.stringify(fixture)).not.toMatch(/https?:\/\//);
      expect(JSON.stringify(fixture)).not.toMatch(/function|=>/);
    }
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
    const wrongVersion = copy(DEFAULT_RHETORIC_CONFIG) as any; wrongVersion.catalogVersion = 2;
    expect(() => validateRhetoricGameConfig(wrongVersion)).toThrow('config.catalogVersion');
    const duplicateIntent = copy(DEFAULT_RHETORIC_CONFIG) as any; duplicateIntent.encounter.intentions[1].id = duplicateIntent.encounter.intentions[0].id;
    expect(() => validateRhetoricGameConfig(duplicateIntent)).toThrow('must be unique');
  });

  it('host attempts to override catalog-owned name, cost, effects or art never enter normalized simulation config', () => {
    const hostile = copy(DEFAULT_RHETORIC_CONFIG) as any;
    hostile.catalog = [{ cardId: 'probe-question', displayName: '伪造', focusCost: 0, effects: [], skinKey: 'https://evil.invalid/x.png' }];
    const normalized = validateRhetoricGameConfig(hostile) as unknown as Record<string, unknown>;
    expect(normalized.catalog).toBeUndefined();
    expect(RHETORIC_CATALOG.find((card) => card.cardId === 'probe-question')).toMatchObject({ displayName: '试探提问', focusCost: 1, skinKey: 'game-rhetoric-duel/card/probe-question' });
  });
});
