export const CARD_REVEAL_SIZE = Object.freeze({ width: 1440, height: 900 });
export const CARD_REVEAL_SLOTS = Object.freeze({
  packFront: 'pack.front', packBack: 'pack.back', tearTop: 'pack.tearTop',
  tearBody: 'pack.tearBody', fallback: 'card.fallback',
  cards: ['host-card:0', 'host-card:1', 'host-card:2', 'host-card:3', 'host-card:4'] as const,
});
