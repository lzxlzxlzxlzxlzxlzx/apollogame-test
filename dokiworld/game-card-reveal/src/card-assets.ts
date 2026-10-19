import { AssetManager, loadGameArtInto } from '@zerocraft/engine/assets/index.js';
import type { CardRevealInput } from './contract.js';

export const CARD_ART_KEYS = Object.freeze({
  fallback: 'card.fallback',
  preview: ['card.preview.0', 'card.preview.1', 'card.preview.2', 'card.preview.3', 'card.preview.4'] as const,
});

export const CRITICAL_CARD_ART_KEYS = Object.freeze([
  'pack.front', 'pack.tearTop', 'pack.tearBody', CARD_ART_KEYS.fallback,
] as const);

/** Start the existing index loader immediately; the host handshake can run beside it. */
export function prefetchCriticalCardArt(
  manager: AssetManager,
  loadLocal: (manager: AssetManager, keys: readonly string[]) => Promise<boolean> =
    (m, keys) => loadGameArtInto(m, 'game-card-reveal', { onlyKeys: keys }),
): Promise<boolean> {
  return loadLocal(manager, CRITICAL_CARD_ART_KEYS);
}

/** Preview images are loaded only after the preview card count is known. */
export async function loadPreviewCardArt(manager: AssetManager, count: number): Promise<void> {
  if (!Number.isInteger(count) || count < 1 || count > CARD_ART_KEYS.preview.length) throw new RangeError('Expected 1–5 preview cards.');
  await Promise.all(CARD_ART_KEYS.preview.slice(0, count).map((key) => manager.load(key)));
}

export async function finishLocalCardArtForLaunch(
  manager: AssetManager,
  criticalReady: Promise<boolean>,
  preview: boolean,
  count: number,
): Promise<boolean> {
  if (!await criticalReady) return false;
  if (preview) await loadPreviewCardArt(manager, count);
  return true;
}

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

export interface FrozenCardArt {
  readonly adoptedIndices: readonly number[];
  readonly fallbackIndices: readonly number[];
}

/** Render-only host image coordinator. Never waits for remote URLs to start playback. */
export class CardArtCoordinator {
  private state: 'new' | 'started' | 'frozen' | 'disposed' = 'new';
  private frozen?: FrozenCardArt;
  private readonly stableKeys: readonly string[];
  private readonly candidateKeys: readonly string[];

  constructor(private readonly manager: AssetManager, private readonly input: CardRevealInput) {
    this.stableKeys = input.cards.map((_, index) => hostCardKey(index));
    this.candidateKeys = input.cards.map((_, index) => `host-card-candidate:${index}`);
  }

  async start(): Promise<void> {
    if (this.state !== 'new') throw new Error('Card art coordinator already started or disposed.');
    const fallback = this.manager.get(CARD_ART_KEYS.fallback);
    if (!fallback || fallback.descriptor.kind !== 'texture') throw new Error('Card reveal fallback art is unavailable.');
    this.state = 'started';
    for (let index = 0; index < this.input.cards.length; index++) {
      this.manager.register({ kind: 'texture', key: this.stableKeys[index], src: fallback.descriptor.src });
      this.manager.register({ kind: 'texture', key: this.candidateKeys[index], src: this.input.cards[index].faceImageUrl });
    }
    // Launch remote image requests beside local fallback decoding; only fallback gates P2.
    for (const key of this.candidateKeys) void this.manager.load(key).catch(() => {});
    try {
      await Promise.all(this.stableKeys.map((key) => this.manager.load(key)));
    } catch (error) {
      this.dispose();
      throw error;
    }
    if (this.state !== 'started') throw new Error('Card art coordinator was disposed before launch.');
  }

  /** Synchronous and idempotent: select only already-loaded candidates before a card is drawn. */
  freeze(): FrozenCardArt {
    if (this.frozen) return this.frozen;
    if (this.state !== 'started') throw new Error('Card art coordinator is not active.');
    const adoptedIndices: number[] = [];
    const fallbackIndices: number[] = [];
    for (let index = 0; index < this.stableKeys.length; index++) {
      if (this.manager.isLoaded(this.candidateKeys[index]) &&
          this.manager.adoptLoaded(this.candidateKeys[index], this.stableKeys[index])) adoptedIndices.push(index);
      else fallbackIndices.push(index);
      // Invalidates pending loads. Their late handles are closed by AssetManager.load().
      this.manager.unregister(this.candidateKeys[index]);
    }
    this.frozen = Object.freeze({ adoptedIndices: Object.freeze(adoptedIndices), fallbackIndices: Object.freeze(fallbackIndices) });
    this.state = 'frozen';
    return this.frozen;
  }

  dispose(): void {
    if (this.state === 'disposed') return;
    this.state = 'disposed';
    for (const key of this.candidateKeys) this.manager.unregister(key);
  }
}
