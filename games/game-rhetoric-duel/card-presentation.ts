export const RHETORIC_FRAME_MS = 1000 / 60;
export const RHETORIC_VIEWPORT_SPEC = Object.freeze({
  width: 1440,
  height: 900,
  acceptanceWidth: 1440,
  acceptanceHeight: 900,
});
export type RhetoricViewportSpec = typeof RHETORIC_VIEWPORT_SPEC;

export const RHETORIC_CARD_LIFT_FRAMES = 9;
export const RHETORIC_DEAL_PHASE_FRAMES = 108;
export const RHETORIC_CARD_FLIGHT_FRAMES = 22;

export const RHETORIC_CARD_VISUAL_SPEC = Object.freeze({
  // Demo desktop clamp at 1440×900: 9.75vw × 22.5vh.
  width: 140,
  minWidth: 140,
  height: 203,
  gap: 10,
  imageHeight: 61,
  costSize: 23,
  hotkeySize: 9,
  frameBleed: 5,
  frameWidth: 150,
  frameHeight: 218,
  hand: Object.freeze({ x: 228, y: 540, width: 942, height: 354 }),
  deckAnchor: Object.freeze({ x: 1311, y: 603 }),
  targetAnchor: Object.freeze({ x: 786, y: 390 }),
  liftDurationMs: 100,
  dealDurationMs: 900,
  preferredDealStaggerMs: 180,
  minimumDealStaggerMs: 150,
  flightDurationMs: 300,
  discardDurationMs: 420,
  discardSpinDurationMs: 420,
  handReflowDurationMs: 260,
  drawReflowDurationMs: 360,
  impactHoldMs: 1200,
  responseDurationMs: 240,
});

export const RHETORIC_PHASE_DURATION_MS: Readonly<Record<string, number>> = Object.freeze({
  camera: 900,
  'reveal-intent': 1500,
  'deal-opening-hand': 1800,
  'card-lift': 140,
  'card-flight': 360,
  impact: 1200,
  'opponent-response': 240,
  'round-end': 1200,
  'enemy-intent': 260,
  'enemy-impact': 1500,
  'focus-refresh': 1200,
  'deal-new-cards': 1800,
  'victory-impact': 1500,
  'portrait-resolve': 1200,
  'failure-impact': 1500,
  'portrait-dominates': 1200,
});

const REDUCED_MOTION_HOLDS = new Set([
  'reveal-intent', 'impact', 'round-end',
  'enemy-impact', 'focus-refresh', 'victory-impact', 'portrait-resolve',
  'failure-impact', 'portrait-dominates',
]);

/** Render-only clock budget. Reduced motion removes travel, never the readable text hold. */
export function rhetoricDurationFor(phase: string, reducedMotion: boolean): number {
  const duration = RHETORIC_PHASE_DURATION_MS[phase] ?? 1000;
  if (!reducedMotion || REDUCED_MOTION_HOLDS.has(phase)) return duration;
  return phase === 'camera' ? 1 : 120;
}

export const RHETORIC_PRESENTATION_TIMING_MS = Object.freeze({
  lift: RHETORIC_CARD_VISUAL_SPEC.liftDurationMs,
  liftPhase: RHETORIC_CARD_LIFT_FRAMES * RHETORIC_FRAME_MS,
  dealSingle: RHETORIC_CARD_VISUAL_SPEC.dealDurationMs,
  dealStagger: RHETORIC_CARD_VISUAL_SPEC.preferredDealStaggerMs,
  dealFiveTotal: RHETORIC_CARD_VISUAL_SPEC.dealDurationMs + 4 * RHETORIC_CARD_VISUAL_SPEC.preferredDealStaggerMs,
  dealPhase: RHETORIC_DEAL_PHASE_FRAMES * RHETORIC_FRAME_MS,
  flight: RHETORIC_CARD_VISUAL_SPEC.flightDurationMs,
  flightPhase: RHETORIC_CARD_FLIGHT_FRAMES * RHETORIC_FRAME_MS,
  impactHold: RHETORIC_CARD_VISUAL_SPEC.impactHoldMs,
  response: RHETORIC_CARD_VISUAL_SPEC.responseDurationMs,
});

export function rhetoricViewportScale(width: number, height: number): number {
  return Math.min(width / RHETORIC_VIEWPORT_SPEC.width, height / RHETORIC_VIEWPORT_SPEC.height);
}

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
