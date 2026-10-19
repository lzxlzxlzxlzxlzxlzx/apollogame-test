/** Host-only time source. The deterministic World never owns a timer or wall-clock value. */
export interface GalPlaybackClock {
  readonly now: () => number;
  readonly schedule: (delayMs: number, fire: () => void) => () => void;
}

export type GalPlaybackMode = 'off' | 'auto' | 'skip';
export type GalPlaybackStopReason = 'boundary' | 'hidden' | 'unread' | 'disabled' | 'stale' | 'busy' | 'clock';
export interface GalPlaybackFrame {
  readonly packageId: string;
  readonly refKey: string;
  readonly kind: 'line' | 'choice' | 'check' | 'ending' | 'jump';
  readonly visible: boolean;
  readonly fullyPresented: boolean;
  readonly read: boolean;
  readonly readSkipEnabled: boolean;
  readonly skipMode: 'read-only' | 'all';
  readonly autoDelayMs: number;
}

/** Exactly one cancellable advance invitation, guarded again when even a cancelled callback arrives late. */
export class GalPlaybackScheduler {
  private modeValue: GalPlaybackMode = 'off';
  private epochValue = 0;
  private pending?: { cancel: () => void; packageId: string; refKey: string; epoch: number };
  constructor(private readonly clock: GalPlaybackClock,
    private readonly current: () => GalPlaybackFrame,
    private readonly advance: (packageId: string, refKey: string, epoch: number) => Promise<boolean>,
    private readonly stopped: (reason: GalPlaybackStopReason) => void) {}

  get mode(): GalPlaybackMode { return this.modeValue; }
  get epoch(): number { return this.epochValue; }
  get hasPending(): boolean { return !!this.pending; }

  setMode(mode: GalPlaybackMode): void {
    this.cancel();
    this.modeValue = mode;
    this.reconcile();
  }

  cancel(): void {
    this.epochValue++;
    this.pending?.cancel();
    this.pending = undefined;
  }

  stop(reason: GalPlaybackStopReason): void {
    this.cancel();
    this.modeValue = 'off';
    this.stopped(reason);
  }

  reconcile(): void {
    if (this.modeValue === 'off') { this.cancelPending(); return; }
    const frame = this.current();
    if (!frame.visible) { this.stop('hidden'); return; }
    if (frame.kind !== 'line') { this.stop('boundary'); return; }
    if (this.modeValue === 'auto' && !frame.fullyPresented) { this.cancelPending(); return; }
    if (this.modeValue === 'skip' && !(frame.read ? frame.readSkipEnabled : frame.skipMode === 'all')) {
      this.stop(frame.read ? 'disabled' : 'unread'); return;
    }
    if (this.pending?.packageId === frame.packageId && this.pending.refKey === frame.refKey &&
        this.pending.epoch === this.epochValue) return;
    this.cancelPending();
    const delay = this.modeValue === 'auto' ? frame.autoDelayMs : 16;
    let now: number;
    try { now = this.clock.now(); }
    catch { this.stop('clock'); return; }
    if (!Number.isFinite(now) || !Number.isSafeInteger(delay) || delay < 0 || delay > 10_000) {
      this.stop('clock'); return;
    }
    const epoch = this.epochValue, { packageId, refKey } = frame;
    let armed = false, firedEarly = false;
    let cancel: () => void;
    try { cancel = this.clock.schedule(delay, () => {
      if (!armed) { firedEarly = true; return; }
      const task = this.pending;
      if (!task || task.epoch !== epoch || task.packageId !== packageId || task.refKey !== refKey) return;
      this.pending = undefined;
      const latest = this.current();
      if (this.epochValue !== epoch || latest.packageId !== packageId || latest.refKey !== refKey ||
          !latest.visible || latest.kind !== 'line' ||
          (this.modeValue === 'auto' && !latest.fullyPresented) ||
          (this.modeValue === 'skip' && !(latest.read ? latest.readSkipEnabled : latest.skipMode === 'all'))) {
        this.stop('stale'); return;
      }
      void this.advance(packageId, refKey, epoch).then(applied => {
        if (this.epochValue !== epoch || this.modeValue === 'off') return;
        if (!applied) this.stop('busy');
        else this.reconcile();
      }, () => { if (this.epochValue === epoch) this.stop('busy'); });
    }); } catch { this.stop('clock'); return; }
    if (firedEarly || this.epochValue !== epoch) {
      cancel();
      if (firedEarly) this.stop('clock');
      return;
    }
    this.pending = { cancel, packageId, refKey, epoch };
    armed = true;
  }

  private cancelPending(): void {
    if (!this.pending) return;
    this.epochValue++;
    this.pending.cancel(); this.pending = undefined;
  }
}
