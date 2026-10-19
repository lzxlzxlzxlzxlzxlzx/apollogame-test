import { AssetManager } from '@zerocraft/engine/assets/index.js';
import type { CardRevealInput } from './contract.js';
import { CARD_ART_KEYS, hostCardKey, type FrozenCardArt } from './card-assets.js';
import { composeSettlementCard, composeSettlementPack, loadSettlementImage, SettlementVisualLoader, splitSettlementPack } from './settlement-visuals.js';

const PACK_TARGETS = ['pack.front', 'pack.tearTop', 'pack.tearBody'] as const;

/** Session-scoped B exception. The ECS sees only existing texture keys, never URLs. */
export class SettlementArtCoordinator {
  private state: 'new' | 'started' | 'frozen' | 'disposed' = 'new';
  private frozen?: FrozenCardArt;
  private readonly candidates: string[];
  private readonly sources: string[] = [];

  constructor(
    private readonly manager: AssetManager,
    private readonly loader: SettlementVisualLoader,
    private readonly input: CardRevealInput,
  ) {
    if (!input.pack) throw new Error('Settlement pack is required.');
    this.candidates = input.cards.map((_, index) => `settlement-card-candidate:${index}`);
  }

  private async surface(key: string, src: string, value: HTMLCanvasElement): Promise<void> {
    this.loader.registerSurface(src, value);
    this.sources.push(src);
    this.manager.register({ kind: 'texture', key, src });
    await this.manager.load(key);
  }

  async start(): Promise<void> {
    if (this.state !== 'new') throw new Error('Settlement art coordinator already started.');
    const pack = this.input.pack!;
    if (!this.manager.get(CARD_ART_KEYS.fallback) || PACK_TARGETS.some((key) => !this.manager.get(key)))
      throw new Error('Card reveal local art is unavailable.');
    this.state = 'started';
    const locale = this.input.locale ?? 'zh-CN';

    // Load card illustrations in parallel with the pack cover. Stable fallback faces
    // already include Doki settlement text and frame before playback starts.
    for (let index = 0; index < this.input.cards.length; index++) {
      const card = this.input.cards[index];
      await this.surface(hostCardKey(index), `settlement:card:fallback:${index}`,
        composeSettlementCard(card, undefined, locale));
      if (card.faceImageUrl) {
        void loadSettlementImage(card.faceImageUrl).then(async (image) => {
          if (this.state !== 'started') return;
          await this.surface(this.candidates[index], `settlement:card:candidate:${index}`,
            composeSettlementCard(card, image, locale));
        }).catch(() => { /* The composed fallback is already drawable. */ });
      }
    }

    const [cover, logo] = await Promise.all([
      pack.coverImageUrl ? loadSettlementImage(pack.coverImageUrl).catch(() => undefined) : Promise.resolve(undefined),
      pack.titleLogoUrl ? loadSettlementImage(pack.titleLogoUrl).catch(() => undefined) : Promise.resolve(undefined),
    ]);
    if (this.state !== 'started') throw new Error('Settlement art coordinator was disposed before launch.');
    const front = composeSettlementPack(pack, this.input.cards.length, cover, logo);
    const pieces = splitSettlementPack(front);
    const surfaces = [front, pieces.top, pieces.body];
    for (let index = 0; index < PACK_TARGETS.length; index++) {
      const candidate = `settlement-pack-candidate:${index}`;
      await this.surface(candidate, `settlement:pack:${index}`, surfaces[index]);
      if (!this.manager.adoptLoaded(candidate, PACK_TARGETS[index])) throw new Error('Failed to bind settlement pack surface.');
    }
  }

  freeze(): FrozenCardArt {
    if (this.frozen) return this.frozen;
    if (this.state !== 'started') throw new Error('Settlement art coordinator is not active.');
    const adoptedIndices: number[] = [], fallbackIndices: number[] = [];
    for (let index = 0; index < this.candidates.length; index++) {
      if (this.manager.isLoaded(this.candidates[index]) && this.manager.adoptLoaded(this.candidates[index], hostCardKey(index)))
        adoptedIndices.push(index);
      else fallbackIndices.push(index);
      this.manager.unregister(this.candidates[index]);
    }
    this.state = 'frozen';
    this.frozen = Object.freeze({ adoptedIndices: Object.freeze(adoptedIndices), fallbackIndices: Object.freeze(fallbackIndices) });
    return this.frozen;
  }

  dispose(): void {
    if (this.state === 'disposed') return;
    this.state = 'disposed';
    for (const key of this.candidates) this.manager.unregister(key);
    for (const src of this.sources) this.loader.forgetSurface(src);
  }
}
