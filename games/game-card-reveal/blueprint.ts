import type { WorldBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import { transformCapability, visibilityCapability, spriteCapability, colorCapability, shapeCapability } from '@zerocraft/engine/atom-skills/index.js';
import { keybindCapability, presentationTrackCapability } from '@zerocraft/engine/skills/tier2/index.js';
import { CARD_REVEAL_SLOTS } from './config.js';
import { ACTION, RING_PACK_POSITIONS, SIGNAL, buildCardRevealTracks } from './tracks.js';
import type { MotionMode } from './timing.js';

export interface CardPresentation {
  readonly id: string;
  readonly faceImageUrl: string;
  readonly alt?: string;
  /** Render-only settlement metadata; the animation still consumes stable texture keys. */
  readonly kind?: 'event' | 'skill' | 'item';
  readonly name?: string;
  readonly description?: string;
  readonly rarity?: string;
  readonly worldTitle?: string;
}
export function cardFaceSize(card: CardPresentation): Readonly<{ width: number; height: number }> {
  return card.kind === 'skill' || card.kind === 'item' ? { width: 390, height: 260 } : { width: 260, height: 390 };
}

// Pure data assembly; every runtime interpolation and signal transition is engine-owned.
export function buildCardRevealBlueprint(cards: readonly CardPresentation[], mode: MotionMode = 'standard'): WorldBlueprint {
  if (!Number.isInteger(cards.length) || cards.length < 1 || cards.length > 5) throw new RangeError('Expected 1–5 cards.');
  const entities: WorldBlueprint['entities'] = {};
  const settlementLook = cards.some((card) => card.kind !== undefined);
  const visual = (id: string, textureKey: string, x: number, y: number, width: number, height: number, zOrder: number, visible: boolean, scale = 1, tint = 0xffffff, anchorY = 0.5, fit?: 'cover'): void => {
    entities[id] = {
      Transform: { x, y, rotation: 0, scaleX: scale, scaleY: scale },
      Visibility: { visible, active: true },
      Shape: { kind: 'box', width, height },
      Sprite: { textureKey, anchorX: 0.5, anchorY, zOrder, ...(fit ? { width, height, fit } : {}) },
      Color: { tint, alpha: 1 },
    };
  };
  const packPlaceholderTints = [0x666b91, 0x7774a2, 0x667797, 0xa58bdd, 0x79719f, 0x67719b, 0x7d77a8, 0x69638e] as const;
  for (let i = 0; i < 8; i++) {
    const point = RING_PACK_POSITIONS[i];
    visual(`pack-${i}`, CARD_REVEAL_SLOTS.packFront, point.x, point.y, 400, 600, 10 + i, true, point.scale,
      settlementLook ? 0xffffff : packPlaceholderTints[i]);
  }
  visual('tear-top', CARD_REVEAL_SLOTS.tearTop, 720, 160, 400, 100, 30, false, 1, settlementLook ? 0xffffff : 0xa891dd, 50 / 600);
  visual('tear-body', CARD_REVEAL_SLOTS.tearBody, 720, 460, 400, 500, 29, false, 1, settlementLook ? 0xffffff : 0x8063bd, 350 / 600);
  visual('fallback', CARD_REVEAL_SLOTS.fallback, 720, 360, 260, 390, 26, false, 1, 0x6d5a91);
  for (let i = 0; i < cards.length; i++) {
    const size = cardFaceSize(cards[i]);
    visual(`card-${i}`, CARD_REVEAL_SLOTS.cards[i], 720 + i * 5, 410 - i * 6, size.width, size.height,
      20 + cards.length - i, false, 220 / size.width, cards[i].kind ? 0xffffff : 0xd8c8f4, 0.5, 'cover');
  }
  entities.clock = { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } };
  for (const { owner, track } of buildCardRevealTracks(cards.length, mode, cards.map(cardFaceSize))) entities[owner] = { PresentationTrack: track };
  for (const [action, signal] of [
    [ACTION.start, SIGNAL.start], [ACTION.pause, SIGNAL.pause], [ACTION.resume, SIGNAL.resume], [ACTION.skip, SIGNAL.skip],
  ]) entities[`kb-${action}`] = { KeyBinding: { key: action, signal, phase: 'action' } };
  return { capabilities: [transformCapability, visibilityCapability, shapeCapability, spriteCapability, colorCapability, keybindCapability, presentationTrackCapability], entities, meta: { tickRate: 60 } };
}
