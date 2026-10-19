import { describe, expect, it } from 'vitest';
import { parseManifest } from '@zerocraft/engine/assembly/manifest.js';
import { checkPresentationTrack } from '@zerocraft/engine/skills/tier2/index.js';
import type { PresentationTrack, Visibility } from '@zerocraft/engine/engine/protocol/components.js';
import { buildCardRevealBlueprint, CardRevealSession, CARD_REVEAL_SLOTS } from './index.js';

const cards = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, faceImageUrl: `https://example.com/${i}.png` }));
describe('card reveal S3 skeleton', () => {
  for (const n of [1, 3, 5]) it(`loads the ordered ${n}-card prefix for two ticks`, () => {
    const blueprint = buildCardRevealBlueprint(cards.slice(0, n));
    expect(blueprint.capabilities.map((c) => c.id)).toContain('t2-presentation-track');
    const raw = { capabilities: blueprint.capabilities.map((c) => c.id), entities: blueprint.entities, meta: blueprint.meta };
    expect(parseManifest(raw).entities).toHaveProperty('pack-3');
    const session = new CardRevealSession(cards.slice(0, n));
    session.tick(); session.tick();
    const ids = session.engine.world.getAllEntities();
    expect(ids.filter((id) => /^card-\d+$/.test(id)).sort()).toEqual(Array.from({ length: n }, (_, i) => `card-${i}`));
    expect(session.engine.world.getComponent<Visibility>('card-0', 'Visibility')?.visible).toBe(false);
    expect(session.engine.world.getComponent<PresentationTrack>('p2-pack-3', 'PresentationTrack')?.targetEntity).toBe('pack-3');
    expect(checkPresentationTrack(session.engine.world, session.engine.world.getComponent<PresentationTrack>('p2-pack-3', 'PresentationTrack')!)).toBeUndefined();
    expect(CARD_REVEAL_SLOTS.cards[n - 1]).toBe(`host-card:${n - 1}`);
  });
  it('rejects zero and six cards', () => { expect(() => buildCardRevealBlueprint([])).toThrow(); expect(() => buildCardRevealBlueprint([...cards, cards[0]])).toThrow(); });
});
