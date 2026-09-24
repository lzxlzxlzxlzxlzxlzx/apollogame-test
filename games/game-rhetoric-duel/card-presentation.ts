export const RHETORIC_FRAME_MS = 1000 / 60;
export const RHETORIC_DEAL_PHASE_FRAMES = 43;
export const RHETORIC_CARD_FLIGHT_FRAMES = 19;

export const RHETORIC_CARD_VISUAL_SPEC = Object.freeze({
  width: 138,
  minWidth: 124,
  height: 244,
  gap: 10,
  imageHeight: 92,
  costSize: 26,
  hotkeySize: 20,
  hand: Object.freeze({ x: 244, y: 640, width: 900, height: 248 }),
  deckAnchor: Object.freeze({ x: 1195.5, y: 693 }),
  targetAnchor: Object.freeze({ x: 547, y: 279 }),
  dealDurationMs: 450,
  preferredDealStaggerMs: 60,
  minimumDealStaggerMs: 40,
  flightDurationMs: 300,
});

export type RhetoricHandVisualStatus = 'kept' | 'drawn' | 'played';
export type RhetoricHandVisual = Readonly<{
  visualId: string;
  cardId: string;
  previousIndex?: number;
  nextIndex?: number;
  status: RhetoricHandVisualStatus;
  drawOrdinal?: number;
}>;

export type RhetoricHandLayout = Readonly<{
  cardWidth: number;
  cardHeight: number;
  gap: number;
  x: number;
  y: number;
  width: number;
  height: number;
  slots: readonly Readonly<{ index: number; x: number; y: number; width: number; height: number; cx: number; cy: number }>[];
}>;

export type RhetoricFlightGeometry = Readonly<{
  start: Readonly<{ x: number; y: number }>;
  end: Readonly<{ x: number; y: number }>;
  delta: Readonly<{ x: number; y: number }>;
  xFrom: 'left' | 'right';
  yFrom: 'top' | 'bottom';
}>;

const occurrenceVisuals = (hand: readonly string[]): Readonly<{ visualId: string; cardId: string; index: number }>[] => {
  const seen = new Map<string, number>();
  return hand.map((cardId, index) => {
    const occurrence = seen.get(cardId) ?? 0;
    seen.set(cardId, occurrence + 1);
    return { visualId: `${cardId}--${occurrence}`, cardId, index };
  });
};

/** Render-only multiset projection. Identity never enters the simulation snapshot/hash. */
export function projectHandVisuals(beforeHand: readonly string[], afterHand: readonly string[]): RhetoricHandVisual[] {
  const before = occurrenceVisuals(beforeHand);
  const available = new Map<string, typeof before>();
  for (const token of before) available.set(token.cardId, [...(available.get(token.cardId) ?? []), token]);
  const nextByVisualId = new Map<string, number>();
  const drawn: RhetoricHandVisual[] = [];
  const drawnPerCard = new Map<string, number>();
  let drawOrdinal = 0;
  afterHand.forEach((cardId, nextIndex) => {
    const queue = available.get(cardId) ?? [];
    const kept = queue.shift();
    available.set(cardId, queue);
    if (kept) {
      nextByVisualId.set(kept.visualId, nextIndex);
      return;
    }
    const ordinalForCard = drawnPerCard.get(cardId) ?? 0;
    drawnPerCard.set(cardId, ordinalForCard + 1);
    const beforeCount = before.filter((token) => token.cardId === cardId).length;
    drawn.push({
      visualId: `${cardId}--${beforeCount + ordinalForCard}`,
      cardId,
      nextIndex,
      status: 'drawn',
      drawOrdinal,
    });
    drawOrdinal += 1;
  });
  return [
    ...before.map((token): RhetoricHandVisual => {
      const nextIndex = nextByVisualId.get(token.visualId);
      return nextIndex === undefined
        ? { visualId: token.visualId, cardId: token.cardId, previousIndex: token.index, status: 'played' }
        : { visualId: token.visualId, cardId: token.cardId, previousIndex: token.index, nextIndex, status: 'kept' };
    }),
    ...drawn,
  ];
}

export function computeDealTiming(drawnCount: number, phaseMs: number): Readonly<{ durationMs: number; staggerMs: number; totalMs: number }> {
  const count = Math.max(0, Math.floor(drawnCount));
  const durationMs = RHETORIC_CARD_VISUAL_SPEC.dealDurationMs;
  if (count <= 1) return { durationMs, staggerMs: 0, totalMs: count === 0 ? 0 : durationMs };
  const safeBudget = phaseMs - RHETORIC_FRAME_MS;
  const preferred = RHETORIC_CARD_VISUAL_SPEC.preferredDealStaggerMs;
  const fitted = Math.floor((safeBudget - durationMs) / (count - 1));
  const staggerMs = Math.min(preferred, fitted);
  if (staggerMs < RHETORIC_CARD_VISUAL_SPEC.minimumDealStaggerMs) {
    throw new Error(`deal timing needs a longer phase: count=${count} phaseMs=${phaseMs}`);
  }
  return { durationMs, staggerMs, totalMs: durationMs + staggerMs * (count - 1) };
}

export function computeHandLayout(count: number): RhetoricHandLayout {
  const safeCount = Math.max(0, Math.floor(count));
  const spec = RHETORIC_CARD_VISUAL_SPEC;
  const available = safeCount > 0 ? Math.floor((spec.hand.width - spec.gap * (safeCount - 1)) / safeCount) : spec.width;
  const cardWidth = Math.max(spec.minWidth, Math.min(spec.width, available));
  const totalWidth = safeCount * cardWidth + Math.max(0, safeCount - 1) * spec.gap;
  const startX = spec.hand.x + (spec.hand.width - totalWidth) / 2;
  const y = spec.hand.y + (spec.hand.height - spec.height) / 2;
  return {
    cardWidth,
    cardHeight: spec.height,
    gap: spec.gap,
    ...spec.hand,
    slots: Array.from({ length: safeCount }, (_, index) => {
      const x = startX + index * (cardWidth + spec.gap);
      return { index, x, y, width: cardWidth, height: spec.height, cx: x + cardWidth / 2, cy: y + spec.height / 2 };
    }),
  };
}

export function computeCardFlightGeometry(
  handLayout: RhetoricHandLayout,
  playedIndex: number,
  targetAnchor: Readonly<{ x: number; y: number }> = RHETORIC_CARD_VISUAL_SPEC.targetAnchor,
): RhetoricFlightGeometry {
  const slot = handLayout.slots[playedIndex];
  if (!slot) throw new Error(`playedIndex ${playedIndex} is outside hand layout`);
  const delta = { x: slot.cx - targetAnchor.x, y: slot.cy - targetAnchor.y };
  return {
    start: { x: slot.cx, y: slot.cy },
    end: { x: targetAnchor.x, y: targetAnchor.y },
    delta,
    xFrom: delta.x < 0 ? 'left' : 'right',
    yFrom: delta.y < 0 ? 'top' : 'bottom',
  };
}

const VISUAL_ARG_PREFIX = '@visual:';
export function encodeVisualCardAction(cardId: string, index: number): string {
  return `${VISUAL_ARG_PREFIX}${Math.max(0, Math.floor(index))}:${cardId}`;
}

export function decodeVisualCardAction(arg: string): Readonly<{ cardId: string; index?: number }> {
  if (!arg.startsWith(VISUAL_ARG_PREFIX)) return { cardId: arg };
  const separator = arg.indexOf(':', VISUAL_ARG_PREFIX.length);
  if (separator < 0) return { cardId: arg };
  const index = Number(arg.slice(VISUAL_ARG_PREFIX.length, separator));
  const cardId = arg.slice(separator + 1);
  return Number.isInteger(index) && index >= 0 && cardId ? { cardId, index } : { cardId: arg };
}
