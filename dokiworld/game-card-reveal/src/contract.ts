import type { AppContract } from 'dokiworlds-app-sdk';
import type { CardPresentation } from '../../../games/game-card-reveal/blueprint.js';

export const CARD_REVEAL_INPUT_CONTRACT = 'doki.game.card-reveal-input';
export const CARD_REVEAL_RESULT_CONTRACT = 'doki.game.card-reveal-result';
export interface CardRevealInput { readonly presentationId: string; readonly cards: readonly CardPresentation[] }
export interface CardRevealResult { readonly presentationId: string; readonly outcome: 'viewed'; readonly completion: 'natural' | 'skipped' }
const MAX_PAYLOAD_BYTES = 64 * 1024;
function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}
function boundedString(value: unknown, max: number): value is string { return typeof value === 'string' && value.length >= 1 && value.length <= max; }
export function parseCardRevealInput(value: unknown): CardRevealInput {
  if (!plain(value) || !exact(value, ['presentationId', 'cards']) || !boundedString(value.presentationId, 128)) throw new Error('Invalid presentationId or top-level fields.');
  if (!Array.isArray(value.cards) || value.cards.length < 1 || value.cards.length > 5) throw new Error('cards must contain 1–5 entries.');
  const seen = new Set<string>();
  const cards = value.cards.map((entry: unknown): CardPresentation => {
    if (!plain(entry) || !exact(entry, ['id', 'faceImageUrl'], ['alt']) || !boundedString(entry.id, 128)) throw new Error('Invalid card fields or id.');
    if (seen.has(entry.id)) throw new Error('Duplicate card id.');
    seen.add(entry.id);
    if (typeof entry.faceImageUrl !== 'string') throw new Error('faceImageUrl must be HTTPS.');
    let url: URL;
    try { url = new URL(entry.faceImageUrl); } catch { throw new Error('faceImageUrl must be HTTPS.'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('faceImageUrl must be HTTPS without credentials.');
    if (entry.alt !== undefined && (typeof entry.alt !== 'string' || entry.alt.length > 80)) throw new Error('alt must be at most 80 characters.');
    return Object.freeze({ id: entry.id, faceImageUrl: entry.faceImageUrl, ...(entry.alt === undefined ? {} : { alt: entry.alt }) });
  });
  return Object.freeze({ presentationId: value.presentationId, cards: Object.freeze(cards) });
}
export function inputFromContract(value: AppContract<unknown>): CardRevealInput {
  if (value.contract !== CARD_REVEAL_INPUT_CONTRACT || value.version !== 1) throw new Error('Unsupported card reveal input contract.');
  if (new TextEncoder().encode(JSON.stringify(value.data)).length > MAX_PAYLOAD_BYTES) throw new Error('Input payload exceeds 64 KiB.');
  return parseCardRevealInput(value.data);
}
export function isEmptyPreview(value: unknown): boolean { return plain(value) && Object.keys(value).length === 0; }
/** A locally requested preview or already-started run never upgrades on a late host init. */
export function readyLaunchDecision(data: unknown, explicitPreview: boolean, started: boolean): 'ignore' | 'preview' | 'formal' {
  if (explicitPreview || started) return 'ignore';
  return isEmptyPreview(data) ? 'preview' : 'formal';
}
export function cardRevealOutput(presentationId: string, completion: CardRevealResult['completion']): AppContract<CardRevealResult> {
  if (!boundedString(presentationId, 128)) throw new Error('Invalid presentationId.');
  return Object.freeze({ contract: CARD_REVEAL_RESULT_CONTRACT, version: 1, data: Object.freeze({ presentationId, outcome: 'viewed', completion }) });
}
/** Host-side closed-set validator; the App never treats a raw SDK acknowledgement as authority. */
export function parseCardRevealOutput(value: unknown): AppContract<CardRevealResult> {
  if (!plain(value) || !exact(value, ['contract', 'version', 'data']) || value.contract !== CARD_REVEAL_RESULT_CONTRACT || value.version !== 1) throw new Error('Unsupported card reveal output contract.');
  const data = value.data;
  if (!plain(data) || !exact(data, ['presentationId', 'outcome', 'completion']) || !boundedString(data.presentationId, 128)
    || data.outcome !== 'viewed' || (data.completion !== 'natural' && data.completion !== 'skipped')) throw new Error('Invalid card reveal output data.');
  return cardRevealOutput(data.presentationId, data.completion);
}
