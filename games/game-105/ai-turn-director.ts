import { BLOCK_LENGTH } from './tower-blueprint.js';
import type { LocalAIObservation } from './local-ai-observation.js';
import type { TowerActionExecutor } from './tower-action-executor.js';

export type AIStyle = 'careful' | 'natural' | 'thrill';

const STYLE = {
  careful: { observeFrames: 42, targetDistance: BLOCK_LENGTH * 1.12, pullStep: BLOCK_LENGTH * 0.035, holdFrames: 300, prefer: 'high' },
  natural: { observeFrames: 24, targetDistance: BLOCK_LENGTH * 1.12, pullStep: BLOCK_LENGTH * 0.05, holdFrames: 300, prefer: 'high' },
  thrill: { observeFrames: 12, targetDistance: BLOCK_LENGTH * 1.12, pullStep: BLOCK_LENGTH * 0.07, holdFrames: 360, prefer: 'low' },
} as const;

type DirectorStep = 'idle' | 'observe' | 'hover' | 'grab' | 'pull' | 'release';

/** Deterministic, visible local AI. It only consumes LocalAIObservation and sends closed actions. */
export class AITurnDirector {
  private step: DirectorStep = 'idle';
  private frames = 0;
  private targetId: string | null = null;
  private pulled = 0;

  constructor(private readonly executor: TowerActionExecutor, readonly style: AIStyle = 'natural') {}

  get pending(): boolean { return this.step !== 'idle'; }

  cancel(): void {
    // Never cancel the shared executor while the player owns its joint.
    if (this.pending || this.executor.grabbedBy === 'ai') this.executor.execute('ai', { type: 'cancel' });
    this.step = 'idle'; this.frames = 0; this.targetId = null; this.pulled = 0;
  }

  tick(observation: LocalAIObservation): void {
    if (observation.turn !== 'ai' || observation.phase === 'collapse-locked') { this.cancel(); return; }
    if (observation.phase !== 'ai-observe' && observation.phase !== 'ai-pulling') return;
    const config = STYLE[this.style];
    if (this.step === 'idle') {
      this.targetId = this.selectTarget(observation);
      if (!this.targetId) return;
      this.step = 'observe';
    }
    if (this.step === 'observe') {
      this.executor.execute('ai', { type: 'observe', yaw: 0.008, pitch: this.frames % 16 < 8 ? 0.001 : -0.001 });
      if (++this.frames >= config.observeFrames) { this.step = 'hover'; this.frames = 0; }
      return;
    }
    if (this.step === 'hover') { this.executor.execute('ai', { type: 'hover', blockId: this.targetId }); this.step = 'grab'; return; }
    if (this.step === 'grab') {
      if (!this.targetId || !this.executor.execute('ai', { type: 'grab', blockId: this.targetId })) { this.cancel(); return; }
      this.step = 'pull';
      return;
    }
    if (this.step === 'pull') {
      if (observation.consumedSignals.some((item) => item.signal === 'g105-toppled')) { this.step = 'release'; return; }
      const delta = Math.min(config.pullStep, Math.max(0, config.targetDistance - this.pulled));
      if (delta > 0) { if (!this.executor.execute('ai', { type: 'pull', delta })) { this.cancel(); return; } this.pulled += delta; }
      // The hand remains attached until the real body clears 92%, an instability signal arrives, or the documented timeout expires.
      if (this.executor.actualPullDistance >= BLOCK_LENGTH * .92 || ++this.frames >= config.holdFrames) this.step = 'release';
      return;
    }
    if (this.step === 'release') { this.executor.execute('ai', { type: 'release' }); this.step = 'idle'; this.targetId = null; this.pulled = 0; }
  }

  private selectTarget(observation: LocalAIObservation): string | null {
    const available = observation.candidates.filter((block) => !observation.retiredIds.includes(block.id));
    if (!available.length) return null;
    const ordered = [...available].sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id));
    if (STYLE[this.style].prefer === 'high') return ordered.at(-1)!.id;
    if (STYLE[this.style].prefer === 'low') return ordered[0]!.id;
    return ordered[Math.floor(ordered.length / 2)]!.id;
  }
}
