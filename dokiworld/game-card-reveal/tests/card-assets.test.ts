import { describe, expect, it } from 'vitest';
import { AssetManager, type AssetDescriptor } from '@zerocraft/engine/assets/index.js';
import type { Sprite } from '@zerocraft/engine/engine/protocol/components.js';
import { planSpriteDraw } from '@zerocraft/engine/renderer/renderable.js';
import { buildCardRevealBlueprint } from '../../../games/game-card-reveal/blueprint.js';
import { CardRevealSession } from '../../../games/game-card-reveal/session.js';
import { CARD_ART_KEYS, hostCardKey, prepareCardArt } from '../src/card-assets.js';
import { cardRevealOutput } from '../src/contract.js';
import type { CardRevealInput } from '../src/contract.js';

function input(count: number): CardRevealInput {
  return { presentationId: 'art-test', cards: Array.from({ length: count }, (_, i) => ({
    id: `card-${i}`, faceImageUrl: i === 1 ? 'https://cards.example/duplicate.png' : `https://cards.example/${i}.png`,
  })) };
}

function fixture(fail: readonly string[] = []): { manager: AssetManager; seen: string[]; loadLocal: (m: AssetManager) => Promise<boolean> } {
  const seen: string[] = [];
  const manager = new AssetManager({ async load(descriptor: AssetDescriptor) {
    seen.push(`${descriptor.key}=${descriptor.src}`);
    if (fail.includes(descriptor.src)) throw new Error('image unavailable');
    return { handle: { stub: true }, width: 260, height: 390 };
  } });
  const loadLocal = async (target: AssetManager): Promise<boolean> => {
    target.register({ kind: 'texture', key: CARD_ART_KEYS.fallback, src: '/games/game-card-reveal/art/card-fallback.png' });
    for (let i = 0; i < 5; i++) target.register({ kind: 'texture', key: CARD_ART_KEYS.preview[i], src: `/games/game-card-reveal/art/demo-${i}.png` });
    await target.load(CARD_ART_KEYS.fallback);
    for (const key of CARD_ART_KEYS.preview) await target.load(key);
    return true;
  };
  return { manager, seen, loadLocal };
}

describe('S5 stable card art bridge', () => {
  it.each([1, 3, 5])('registers %i HTTPS cards in input order without URL in ECS', async (count) => {
    const { manager, seen, loadLocal } = fixture();
    const cards = input(count);
    const result = await prepareCardArt(manager, cards, false, loadLocal);
    expect(result.keys).toEqual(Array.from({ length: count }, (_, i) => hostCardKey(i)));
    expect(result.fallbackIndices).toEqual([]);
    for (let i = 0; i < count; i++) {
      expect(manager.get(hostCardKey(i))?.descriptor.src).toBe(cards.cards[i].faceImageUrl);
      expect(seen).toContain(`${hostCardKey(i)}=${cards.cards[i].faceImageUrl}`);
    }
    const blueprint = buildCardRevealBlueprint(cards.cards);
    expect(JSON.stringify(blueprint)).not.toContain('https://');
    expect(JSON.stringify(blueprint.entities['card-0'])).toContain(hostCardKey(0));
    expect(JSON.stringify(new CardRevealSession(cards.cards).engine.world.snapshot())).not.toContain('https://');
    expect(JSON.stringify(cardRevealOutput(cards.presentationId, 'natural'))).not.toContain('https://');
    manager.clear();
    expect(manager.has(hostCardKey(0))).toBe(false);
  });

  it('falls back independently for failed cards', async () => {
    const cards = input(5);
    const { manager, loadLocal } = fixture([cards.cards[1].faceImageUrl, cards.cards[3].faceImageUrl]);
    const result = await prepareCardArt(manager, cards, false, loadLocal);
    expect(result.keys).toEqual(['host-card:0', 'host-card:1', 'host-card:2', 'host-card:3', 'host-card:4']);
    expect(result.fallbackIndices).toEqual([1, 3]);
    expect(manager.get('host-card:0')?.descriptor.src).toBe(cards.cards[0].faceImageUrl);
    expect(manager.get('host-card:1')?.descriptor.src).toBe('/games/game-card-reveal/art/card-fallback.png');
    expect(manager.get('host-card:3')?.descriptor.src).toBe('/games/game-card-reveal/art/card-fallback.png');
  });

  it('exposes a local-only preview failure fixture through the same fallback path', async () => {
    const { manager, loadLocal } = fixture();
    const result = await prepareCardArt(manager, input(3), true, loadLocal, 1);
    expect(result.fallbackIndices).toEqual([1]);
    expect(manager.get('host-card:0')?.descriptor.src).toBe('/games/game-card-reveal/art/demo-0.png');
    expect(manager.get('host-card:1')?.descriptor.src).toBe('/games/game-card-reveal/art/card-fallback.png');
    expect(manager.get('host-card:2')?.descriptor.src).toBe('/games/game-card-reveal/art/demo-2.png');
  });

  it('keeps input order when remote loads resolve in reverse order', async () => {
    const cards = input(3);
    const pending = new Map<string, () => void>();
    let remoteStarted!: () => void;
    const allRemoteStarted = new Promise<void>((resolve) => { remoteStarted = resolve; });
    const manager = new AssetManager({ load(descriptor: AssetDescriptor) {
      if (!descriptor.key.startsWith('host-card:')) return Promise.resolve({ handle: {}, width: 260, height: 390 });
      return new Promise((resolve) => {
        pending.set(descriptor.key, () => resolve({ handle: {}, width: 260, height: 390 }));
        if (pending.size === 3) remoteStarted();
      });
    } });
    const loadLocal = async (target: AssetManager): Promise<boolean> => {
      target.register({ kind: 'texture', key: CARD_ART_KEYS.fallback, src: '/games/game-card-reveal/art/card-fallback.png' });
      await target.load(CARD_ART_KEYS.fallback);
      return true;
    };
    const loading = prepareCardArt(manager, cards, false, loadLocal);
    await allRemoteStarted;
    expect([...pending.keys()]).toEqual(['host-card:0', 'host-card:1', 'host-card:2']);
    pending.get('host-card:2')?.();
    pending.get('host-card:1')?.();
    pending.get('host-card:0')?.();
    expect((await loading).keys).toEqual(['host-card:0', 'host-card:1', 'host-card:2']);
    expect(manager.get('host-card:0')?.descriptor.src).toBe(cards.cards[0].faceImageUrl);
    expect(manager.get('host-card:2')?.descriptor.src).toBe(cards.cards[2].faceImageUrl);
  });

  it('keeps duplicate URLs as distinct stable IDs and preview strictly local', async () => {
    const cards = input(3);
    const duplicate: CardRevealInput = { ...cards, cards: [cards.cards[0], { ...cards.cards[1], faceImageUrl: cards.cards[0].faceImageUrl }, cards.cards[2]] };
    const formal = fixture();
    await prepareCardArt(formal.manager, duplicate, false, formal.loadLocal);
    expect(formal.manager.get('host-card:0')?.descriptor.src).toBe(formal.manager.get('host-card:1')?.descriptor.src);
    const preview = fixture();
    await prepareCardArt(preview.manager, duplicate, true, preview.loadLocal);
    expect(preview.seen.filter((item) => item.startsWith('host-card:'))).toEqual([
      'host-card:0=/games/game-card-reveal/art/demo-0.png',
      'host-card:1=/games/game-card-reveal/art/demo-1.png',
      'host-card:2=/games/game-card-reveal/art/demo-2.png',
    ]);
  });

  it.each([1, 3, 5])('uses 260×390 cover for all %i stable host-card sprites', (count) => {
    const blueprint = buildCardRevealBlueprint(input(count).cards);
    for (let i = 0; i < count; i++) {
      expect(blueprint.entities[`card-${i}`].Sprite).toMatchObject({
        textureKey: hostCardKey(i), width: 260, height: 390, fit: 'cover', anchorX: 0.5, anchorY: 0.5,
      });
    }
  });

  it('covers wide, narrow and 2:3 remote image dimensions without stretching', () => {
    const sprite = buildCardRevealBlueprint(input(1).cards).entities['card-0'].Sprite as unknown as Sprite;
    const wide = planSpriteDraw(sprite, { sx: 0, sy: 0, sw: 900, sh: 300 });
    expect(wide.source).toEqual({ x: 350, y: 0, width: 200, height: 300 });
    const narrow = planSpriteDraw(sprite, { sx: 0, sy: 0, sw: 120, sh: 600 });
    expect(narrow.source).toEqual({ x: 0, y: 210, width: 120, height: 180 });
    const native = planSpriteDraw(sprite, { sx: 0, sy: 0, sw: 260, sh: 390 });
    expect(native.source).toEqual({ x: 0, y: 0, width: 260, height: 390 });
    for (const plan of [wide, narrow, native]) {
      expect(plan.destination).toEqual({ x: -130, y: -195, width: 260, height: 390 });
      expect(plan.source.width / plan.source.height).toBeCloseTo(2 / 3, 8);
    }
  });
});
