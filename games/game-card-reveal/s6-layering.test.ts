import { describe, expect, it } from 'vitest';
import type { Color, Sprite, Visibility } from '@zerocraft/engine/engine/protocol/components.js';
import { CardRevealSession, stageTicks } from './index.js';

const cards = Array.from({ length: 5 }, (_, i) => ({ id: `card-${i}`, faceImageUrl: `https://example.com/${i}.png` }));

describe('S6 P3 cards emerge behind the remaining wrapper', () => {
  for (const mode of ['standard', 'reduced'] as const) for (const count of [1, 3, 5] as const) {
    it(`${mode} N=${count} keeps top > body > all visible cards, then preserves card order and instances`, () => {
      const session = new CardRevealSession(cards.slice(0, count), mode);
      const world = session.engine.world;
      const ids = world.getAllEntities().filter((id) => /^card-\d+$/.test(id)).sort();
      const sprite = (id: string): Sprite => world.getComponent<Sprite>(id, 'Sprite')!;
      const visible = (id: string): boolean => world.getComponent<Visibility>(id, 'Visibility')?.visible === true;
      const alpha = (id: string): number => world.getComponent<Color>(id, 'Color')?.alpha ?? 0;
      let overlapSeen = false;
      const p3Cap = stageTicks(mode, count).p2 + stageTicks(mode, count).p3;
      for (let tick = 0; tick < p3Cap; tick++) {
        session.tick();
        if (session.view().phase !== 'P3' || !visible('tear-top') || !visible('tear-body')) continue;
        if (alpha('tear-top') <= 0 || alpha('tear-body') <= 0) continue;
        if (ids.some((id) => !visible(id) || alpha(id) <= 0)) continue;
        overlapSeen = true;
        const cardZ = ids.map((id) => sprite(id).zOrder);
        expect(sprite('tear-top').zOrder).toBeGreaterThan(sprite('tear-body').zOrder);
        expect(sprite('tear-body').zOrder).toBeGreaterThan(Math.max(...cardZ));
        for (let i = 1; i < cardZ.length; i++) expect(cardZ[i - 1]).toBeGreaterThan(cardZ[i]);
        break;
      }
      expect(overlapSeen).toBe(true);
      const initialOrder = ids.map((id) => sprite(id).zOrder);
      const cap = stageTicks(mode, count).total + 20;
      let p4Seen = false;
      for (let tick = 0; tick < cap && session.view().status !== 'terminal'; tick++) {
        session.tick();
        if (session.view().phase === 'P4') {
          p4Seen = true;
          expect(ids.map((id) => sprite(id).zOrder)).toEqual(initialOrder);
        }
      }
      expect(p4Seen).toBe(true);
      expect(session.view()).toEqual({ status: 'terminal', phase: 'P5', completion: 'natural' });
      expect(world.getAllEntities().filter((id) => /^card-\d+$/.test(id)).sort()).toEqual(ids);
      expect(ids.map((id) => sprite(id).zOrder)).toEqual(initialOrder);
    });
  }
});
