import { cardRevealOutput, type CardRevealInput, type CardRevealResult } from './contract.js';
import type { AppContract } from 'dokiworlds-app-sdk';

/** Only S4's real P5 terminal can call markP5Terminal. S3 never calls it automatically. */
export class CompletionGate {
  private terminal: CardRevealResult['completion'] | undefined;
  private delivery: 'idle' | 'pending' | 'accepted' = 'idle';
  constructor(private readonly input: CardRevealInput, private readonly preview: boolean) {}
  markP5Terminal(completion: CardRevealResult['completion']): void { if (!this.preview && !this.terminal) this.terminal = completion; }
  async complete(send: (output: AppContract<CardRevealResult>) => Promise<'accepted' | 'rejected'>): Promise<boolean> {
    if (this.preview || !this.terminal || this.delivery !== 'idle') return false;
    this.delivery = 'pending';
    try {
      const ack = await send(cardRevealOutput(this.input.presentationId, this.terminal));
      if (ack === 'accepted') { this.delivery = 'accepted'; return true; }
      return false;
    } catch { return false; }
    finally { if (this.delivery === 'pending') this.delivery = 'idle'; }
  }
}
