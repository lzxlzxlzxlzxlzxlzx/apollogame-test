import { describe, expect, it, vi } from 'vitest';
import { CARD_REVEAL_INPUT_CONTRACT, cardRevealOutput, inputFromContract, isEmptyPreview, parseCardRevealInput, parseCardRevealOutput, parseSettlementRevealInput, readyLaunchDecision } from '../src/contract.js';
import { CompletionGate } from '../src/completion.js';
const data = { presentationId: 'pack-01', cards: [{ id: 'c1', faceImageUrl: 'https://example.com/c1.webp', alt: '卡牌一' }] };
const envelope = (value: unknown) => ({ contract: CARD_REVEAL_INPUT_CONTRACT, version: 1, data: value });
const settlement = { presentationId: 'preview-clear', locale: 'zh-CN', pack: {
  packId: 'preview', title: '哈利·波特', coverImageUrl: 'https://static.example/covers/neon-harbor-preview.webp', titleLogoUrl: null,
}, cards: [{ id: 'preview-clear', kind: 'event', name: '哈利·波特 · 通关纪念', description: '完成全部主线',
  rarity: 'epic', imageUrl: 'https://static.example/covers/neon-harbor-preview.webp', worldTitle: '哈利·波特' }] };
describe('strict card reveal input', () => {
  for (const n of [1, 3, 5]) it(`accepts ${n} ordered cards`, () => {
    const cards = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, faceImageUrl: `https://example.com/${i}.png` }));
    expect(inputFromContract(envelope({ presentationId: 'ordered', cards })).cards.map((card) => card.id)).toEqual(cards.map((card) => card.id));
  });
  it.each([
    { ...data, cards: [] }, { ...data, cards: Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, faceImageUrl: 'https://example.com/a' })) },
    { ...data, cards: 1.5 }, { ...data, cards: [data.cards[0], data.cards[0]] },
    { ...data, extra: true }, { ...data, cards: [{ ...data.cards[0], extra: true }] },
    { ...data, cards: [{ id: 'c', faceImageUrl: 'http://example.com/a' }] },
    { ...data, cards: [{ id: '', faceImageUrl: 'https://example.com/a' }] },
    { ...data, cards: [{ id: 'c', faceImageUrl: 'https://example.com/a', alt: 'x'.repeat(81) }] },
    { ...data, presentationId: 'x'.repeat(129) },
  ])('rejects invalid input %#', (value) => expect(() => parseCardRevealInput(value)).toThrow());
  it('rejects wrong version and >64 KiB payload', () => {
    expect(() => inputFromContract({ ...envelope(data), version: 2 })).toThrow();
    expect(() => inputFromContract(envelope({ ...data, noise: 'x'.repeat(65_536) }))).toThrow();
  });
  it('only treats a plain empty object as preview', () => { expect(isEmptyPreview({})).toBe(true); expect(isEmptyPreview([])).toBe(false); expect(isEmptyPreview(data)).toBe(false); });
  it('never upgrades explicit or already-started preview when host ready arrives late', () => {
    expect(readyLaunchDecision(data, true, true)).toBe('ignore');
    expect(readyLaunchDecision(data, true, false)).toBe('ignore');
    expect(readyLaunchDecision(data, false, true)).toBe('ignore');
    expect(readyLaunchDecision({}, false, false)).toBe('preview');
    expect(readyLaunchDecision(data, false, false)).toBe('formal');
  });
});
describe('settlement-only v2 input', () => {
  it('accepts source-backed settlement fields and normalizes display-only image URL', () => {
    const parsed = inputFromContract({ contract: CARD_REVEAL_INPUT_CONTRACT, version: 2, data: settlement });
    expect(parsed.pack).toEqual(settlement.pack);
    expect(parsed.cards[0]).toMatchObject({ id: 'preview-clear', kind: 'event', name: '哈利·波特 · 通关纪念',
      faceImageUrl: settlement.cards[0].imageUrl, rarity: 'epic' });
  });
  it('allows 1–5 cards, missing illustration and optional language without changing order', () => {
    const cards = Array.from({ length: 5 }, (_, index) => ({ ...settlement.cards[0], id: `cc_${index}`, imageUrl: null,
      kind: (index % 2 ? 'skill' : 'item') as 'skill' | 'item' }));
    const parsed = parseSettlementRevealInput({ presentationId: 'batch', pack: settlement.pack, cards });
    expect(parsed.cards.map((card) => card.id)).toEqual(cards.map((card) => card.id));
    expect(parsed.cards.map((card) => card.faceImageUrl)).toEqual(Array(5).fill(''));
    expect(parsed.locale).toBe('zh-CN');
  });
  it.each([
    { ...settlement, pack: { ...settlement.pack, coverImageUrl: 'http://unsafe.example/a' } },
    { ...settlement, pack: { ...settlement.pack, extra: true } },
    { ...settlement, cards: [{ ...settlement.cards[0], kind: 'character' }] },
    { ...settlement, cards: [{ ...settlement.cards[0], imageUrl: 'https://user:pass@static.example/a' }] },
    { ...settlement, cards: [settlement.cards[0], settlement.cards[0]] },
    { ...settlement, cards: [] },
    { ...settlement, locale: 'fr' },
  ])('rejects invalid settlement fact or URL %#', (value) => expect(() => parseSettlementRevealInput(value)).toThrow());
  it('keeps the output contract at v1', () => {
    expect(cardRevealOutput('preview-clear', 'natural')).toEqual({ contract: 'doki.game.card-reveal-result', version: 1,
      data: { presentationId: 'preview-clear', outcome: 'viewed', completion: 'natural' } });
  });
});
describe('completion shell', () => {
  it('host-side output parser accepts only the closed viewed contract', () => {
    const valid = cardRevealOutput('pack-01', 'natural');
    expect(parseCardRevealOutput(valid)).toEqual(valid);
    for (const bad of [null, {}, { ...valid, version: 2 }, { ...valid, extra: true },
      { ...valid, data: { ...valid.data, outcome: 'won' } }, { ...valid, data: { ...valid.data, completion: 'cancelled' } },
      { ...valid, data: { ...valid.data, extra: true } }]) expect(() => parseCardRevealOutput(bad)).toThrow();
  });
  it('never completes preview or pre-terminal formal input', async () => {
    const send = vi.fn(async () => 'accepted' as const);
    const input = parseCardRevealInput(data);
    const preview = new CompletionGate(input, true);
    preview.markP5Terminal('natural'); expect(await preview.complete(send)).toBe(false);
    const formal = new CompletionGate(input, false);
    expect(await formal.complete(send)).toBe(false); expect(send).not.toHaveBeenCalled();
  });
  it('sends exactly one viewed result after actual terminal hook', async () => {
    const send = vi.fn(async () => 'accepted' as const);
    const gate = new CompletionGate(parseCardRevealInput(data), false);
    gate.markP5Terminal('skipped'); gate.markP5Terminal('natural');
    expect(await gate.complete(send)).toBe(true); expect(await gate.complete(send)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ contract: 'doki.game.card-reveal-result', version: 1, data: { presentationId: 'pack-01', outcome: 'viewed', completion: 'skipped' } });
  });
  it('retries the same frozen output after rejected, then locks after accepted', async () => {
    const send = vi.fn().mockResolvedValueOnce('rejected').mockResolvedValueOnce('accepted');
    const gate = new CompletionGate(parseCardRevealInput(data), false);
    gate.markP5Terminal('skipped');
    expect(await gate.complete(send)).toBe(false);
    gate.markP5Terminal('natural');
    expect(await gate.complete(send)).toBe(true);
    expect(await gate.complete(send)).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
    expect(send.mock.calls[1][0].data.completion).toBe('skipped');
  });
  it('retries the same terminal output after throw/timeout', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce('accepted');
    const gate = new CompletionGate(parseCardRevealInput(data), false);
    gate.markP5Terminal('natural');
    expect(await gate.complete(send)).toBe(false);
    expect(await gate.complete(send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
  });
  it('allows only one request while pending, then permits retry if rejected', async () => {
    let settle!: (ack: 'accepted' | 'rejected') => void;
    const pending = new Promise<'accepted' | 'rejected'>((resolve) => { settle = resolve; });
    const send = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce('accepted');
    const gate = new CompletionGate(parseCardRevealInput(data), false);
    gate.markP5Terminal('natural');
    const first = gate.complete(send);
    expect(await gate.complete(send)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    settle('rejected');
    expect(await first).toBe(false);
    expect(await gate.complete(send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
