import { AssetManager, loadGameArtInto } from '@zerocraft/engine/assets/index.js';
import type { CardRevealInput } from './contract.js';

export const CARD_ART_KEYS = Object.freeze({
  fallback: 'card.fallback',
  preview: ['card.preview.0', 'card.preview.1', 'card.preview.2', 'card.preview.3', 'card.preview.4'] as const,
});

export function hostCardKey(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 4) throw new RangeError('Card index must be 0–4.');
  return `host-card:${index}`;
}

export interface CardArtLoadResult {
  readonly fallbackIndices: readonly number[];
  readonly keys: readonly string[];
}

/** Register URL bytes only in AssetManager. The game world receives stable keys. */
export async function prepareCardArt(
  manager: AssetManager,
  input: CardRevealInput,
  preview: boolean,
  loadLocal: (manager: AssetManager) => Promise<boolean> = (m) => loadGameArtInto(m, 'game-card-reveal'),
  previewFailureIndex?: number,
): Promise<CardArtLoadResult> {
  if (!await loadLocal(manager)) throw new Error('Card reveal local art is unavailable.');
  const fallback = manager.get(CARD_ART_KEYS.fallback);
  if (!fallback || fallback.descriptor.kind !== 'texture') throw new Error('Card reveal fallback art is unavailable.');
  const keys = input.cards.map((_, index) => hostCardKey(index));
  const fallbackIndices: number[] = [];
  const requests = input.cards.map((card, index) => {
    const key = keys[index];
    const demo = manager.get(CARD_ART_KEYS.preview[index]);
    if (preview && (!demo || demo.descriptor.kind !== 'texture')) throw new Error(`Preview card ${index} is unavailable.`);
    const src = preview ? (demo!.descriptor as typeof fallback.descriptor).src : card.faceImageUrl;
    manager.register({ kind: 'texture', key, src });
    // Explicit local QA fixture: exercise the same per-card fallback path without a remote URL.
    if (preview && previewFailureIndex === index) return Promise.reject(new Error('Preview card failure fixture'));
    return manager.load(key);
  });
  const settled = await Promise.allSettled(requests);
  for (let index = 0; index < settled.length; index++) {
    if (settled[index].status === 'fulfilled') continue;
    fallbackIndices.push(index);
    manager.register({ kind: 'texture', key: keys[index], src: fallback.descriptor.src });
    await manager.load(keys[index]);
  }
  return { keys, fallbackIndices };
}
