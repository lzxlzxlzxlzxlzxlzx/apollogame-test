import type { TowerAxis, TowerBlock } from './tower-blueprint.js';

export const LOCAL_AI_OBSERVATION_VERSION = 1;
export type LocalAIPhase = 'boot' | 'player-ready' | 'player-pulling' | 'resolving' | 'player-interaction' | 'ai-observe' | 'ai-pulling' | 'ai-response' | 'collapse-locked';
export type LocalAIPhysicsSignal = 'g105-settled' | 'g105-toppled';

export interface LocalAIBlock {
  id: string;
  axis: TowerAxis;
  layer: number;
}

export interface LocalAIObservation {
  version: typeof LOCAL_AI_OBSERVATION_VERSION;
  phase: LocalAIPhase;
  turn: 'player' | 'ai';
  candidates: readonly LocalAIBlock[];
  extractedIds: readonly string[];
  retiredIds: readonly string[];
  settledExtractionHistory: readonly string[];
  selectedBlockId: string | null;
  consumedSignals: readonly { signal: LocalAIPhysicsSignal; blockId: string }[];
}

export interface LocalAIObservationInput {
  phase: string;
  turn: string;
  layout: readonly TowerBlock[];
  extractedIds: Iterable<string>;
  retiredIds?: Iterable<string>;
  settledExtractionHistory: readonly string[];
  selectedBlockId: string | null;
  consumedSignals: readonly { signal: string; blockId: string }[];
}

const PHASES = new Set<LocalAIPhase>(['boot', 'player-ready', 'player-pulling', 'resolving', 'player-interaction', 'ai-observe', 'ai-pulling', 'ai-response', 'collapse-locked']);
const SIGNALS = new Set<LocalAIPhysicsSignal>(['g105-settled', 'g105-toppled']);

/** Builds the only data surface available to the local AI. No runtime pose enters this object. */
export function createLocalAIObservation(input: LocalAIObservationInput): LocalAIObservation {
  if (!PHASES.has(input.phase as LocalAIPhase)) throw new Error(`LocalAIObservation: illegal phase "${input.phase}"`);
  if (input.turn !== 'player' && input.turn !== 'ai') throw new Error(`LocalAIObservation: illegal turn "${input.turn}"`);
  const blocks = new Map(input.layout.map((block) => [block.id, block]));
  const validateBlockId = (id: string, field: string): void => {
    if (!blocks.has(id)) throw new Error(`LocalAIObservation: ${field} has unknown block "${id}"`);
  };
  for (const id of input.extractedIds) validateBlockId(id, 'extractedIds');
  for (const id of input.retiredIds ?? []) validateBlockId(id, 'retiredIds');
  for (const id of input.settledExtractionHistory) validateBlockId(id, 'settledExtractionHistory');
  if (input.selectedBlockId) validateBlockId(input.selectedBlockId, 'selectedBlockId');
  for (const item of input.consumedSignals) {
    if (!SIGNALS.has(item.signal as LocalAIPhysicsSignal)) throw new Error(`LocalAIObservation: illegal signal "${item.signal}"`);
    validateBlockId(item.blockId, 'consumedSignals');
  }
  return {
    version: LOCAL_AI_OBSERVATION_VERSION,
    phase: input.phase as LocalAIPhase,
    turn: input.turn,
    candidates: input.layout.map(({ id, axis, layer }) => ({ id, axis, layer })),
    extractedIds: [...input.extractedIds].sort(),
    retiredIds: [...(input.retiredIds ?? [])].sort(),
    settledExtractionHistory: [...input.settledExtractionHistory],
    selectedBlockId: input.selectedBlockId,
    consumedSignals: input.consumedSignals.map((item) => ({ signal: item.signal as LocalAIPhysicsSignal, blockId: item.blockId })),
  };
}
