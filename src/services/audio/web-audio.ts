import type { AudioPort, PlayOptions } from './audio-port.js';

// 浏览器音频后端 —— 每个 clipId 一个 HTMLAudioElement。clipId→url 由清单提供
// （可来自 assets/index.json 的 sound 条目）。仅浏览器可用；headless/测试用 NullAudioPort。
export class WebAudioPort implements AudioPort {
  private readonly elements = new Map<string, HTMLAudioElement>();
  private readonly loops = new Map<string, number>();
  private readonly oneShots = new Map<string, Set<{ element: HTMLAudioElement; volume: number }>>();
  private master = 1;

  constructor(private readonly urls: Readonly<Record<string, string>>, private readonly baseUrl = '') {}

  private element(clipId: string): HTMLAudioElement | null {
    const url = this.urls[clipId];
    if (!url || typeof Audio === 'undefined') return null;
    let el = this.elements.get(clipId);
    if (!el) {
      try {
        el = new Audio(this.baseUrl + url);
        this.elements.set(clipId, el);
      } catch { return null; }
    }
    return el;
  }

  private static volume(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  }

  private releaseOneShot(clipId: string, entry: { element: HTMLAudioElement; volume: number }): void {
    const active = this.oneShots.get(clipId);
    active?.delete(entry);
    if (active?.size === 0) this.oneShots.delete(clipId);
  }

  play(clipId: string, opts?: PlayOptions): void {
    const base = this.element(clipId);
    if (!base) return;
    const volume = WebAudioPort.volume(opts?.volume ?? 1);
    if (opts?.loop) {
      // 循环(BGM)：用稳定缓存实例，可被 stop()/setMasterVolume 控制。
      base.loop = true;
      base.volume = volume * this.master;
      base.currentTime = 0;
      this.loops.set(clipId, volume);
      try { void base.play().catch(() => {}); } catch { /* headless/autoplay failure degrades silently */ }
    } else {
      // 一次性(SFX)：克隆节点播放，允许同源多重并发，避免把上一声 currentTime=0 暴力掐断
      // 克隆必须登记，回滚/读档/失焦时 stop(clipId) 才能打断真正发声的实例。
      // 长远应转 Web Audio API(AudioContext) 彻底解决并发与精准时序。
      let entry: { element: HTMLAudioElement; volume: number } | undefined;
      try {
        const clone = base.cloneNode() as HTMLAudioElement;
        const current = { element: clone, volume };
        entry = current;
        const active = this.oneShots.get(clipId) ?? new Set<typeof current>();
        active.add(current); this.oneShots.set(clipId, active);
        const release = () => this.releaseOneShot(clipId, current);
        clone.addEventListener('ended', release, { once: true });
        clone.addEventListener('error', release, { once: true });
        clone.loop = false;
        clone.volume = volume * this.master;
        void clone.play().catch(release);
      } catch {
        if (entry) this.releaseOneShot(clipId, entry);
        // Missing browser audio capability degrades silently.
      }
    }
  }
  stop(clipId: string): void {
    const el = this.elements.get(clipId);
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    this.loops.delete(clipId);
    const active = this.oneShots.get(clipId);
    if (active) {
      this.oneShots.delete(clipId);
      for (const { element } of active) { element.pause(); element.currentTime = 0; }
    }
  }
  stopAll(): void {
    for (const id of this.elements.keys()) this.stop(id);
  }
  setMasterVolume(v: number): void {
    this.master = WebAudioPort.volume(v);
    for (const [id, volume] of this.loops) {
      const el = this.elements.get(id);
      if (el) el.volume = volume * this.master;
    }
    for (const active of this.oneShots.values())
      for (const entry of active) entry.element.volume = entry.volume * this.master;
  }
}
