import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAudioPort } from './web-audio.js';

class FakeAudio {
  static instances: FakeAudio[] = [];
  readonly listeners = new Map<string, (() => void)[]>();
  volume = 1;
  loop = false;
  currentTime = 0;
  played = 0;
  paused = 0;
  clone = false;

  constructor(readonly src: string) { FakeAudio.instances.push(this); }
  cloneNode(): FakeAudio {
    const copy = new FakeAudio(this.src);
    copy.clone = true;
    copy.loop = this.loop;
    return copy;
  }
  play(): Promise<void> { this.played++; return Promise.resolve(); }
  pause(): void { this.paused++; }
  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  emit(name: string): void { for (const listener of this.listeners.get(name) ?? []) listener(); }
}

describe('WebAudioPort stoppable file playback', () => {
  beforeEach(() => { FakeAudio.instances = []; vi.stubGlobal('Audio', FakeAudio); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('stops every active one-shot clone for a clip without stopping another clip', () => {
    const port = new WebAudioPort({ voice: '/voice.ogg', sfx: '/sfx.ogg' });
    port.play('voice'); port.play('voice'); port.play('sfx');
    const voices = FakeAudio.instances.filter(item => item.src === '/voice.ogg' && item.clone);
    const sfx = FakeAudio.instances.find(item => item.src === '/sfx.ogg' && item.clone)!;
    expect(voices).toHaveLength(2);
    expect(voices.map(item => item.played)).toEqual([1, 1]);
    port.stop('voice');
    expect(voices.map(item => item.paused)).toEqual([1, 1]);
    expect(sfx.paused).toBe(0);
    port.stopAll();
    expect(sfx.paused).toBe(1);
  });

  it('preserves each playing clip gain across master-volume changes', () => {
    const port = new WebAudioPort({ bgm: '/bgm.ogg', voice: '/voice.ogg' });
    port.play('bgm', { loop: true, volume: 0.4 });
    port.play('voice', { volume: 0.25 });
    const bgm = FakeAudio.instances.find(item => item.src === '/bgm.ogg')!;
    const voice = FakeAudio.instances.find(item => item.src === '/voice.ogg' && item.clone)!;
    expect(bgm.volume).toBe(0.4);
    expect(voice.volume).toBe(0.25);
    port.setMasterVolume(0.5);
    expect(bgm.volume).toBe(0.2);
    expect(voice.volume).toBe(0.125);
    port.setMasterVolume(0);
    expect(bgm.volume).toBe(0);
    expect(voice.volume).toBe(0);
    port.setMasterVolume(2);
    expect(bgm.volume).toBe(0.4);
    expect(voice.volume).toBe(0.25);
    port.stop('bgm');
    expect(bgm.paused).toBe(1);
  });

  it('releases naturally ended clones and silently handles unavailable browser audio', () => {
    const port = new WebAudioPort({ voice: '/voice.ogg' });
    port.play('voice');
    const voice = FakeAudio.instances.find(item => item.clone)!;
    voice.emit('ended');
    port.stop('voice');
    expect(voice.paused).toBe(0);
    vi.stubGlobal('Audio', undefined);
    expect(() => port.play('missing')).not.toThrow();
    expect(() => new WebAudioPort({ voice: '/voice.ogg' }).play('voice')).not.toThrow();
  });

  it('does not inherit loop mode when the same clip changes from BGM to a one-shot', () => {
    const port = new WebAudioPort({ cue: '/cue.ogg' });
    port.play('cue', { loop: true });
    port.play('cue');
    const oneShot = FakeAudio.instances.find(item => item.clone)!;
    expect(oneShot.loop).toBe(false);
    port.stop('cue');
    expect(oneShot.paused).toBe(1);
  });

  it('degrades silently when the browser Audio constructor throws', () => {
    vi.stubGlobal('Audio', class { constructor() { throw new Error('audio unavailable'); } });
    const port = new WebAudioPort({ voice: '/voice.ogg' });
    expect(() => port.play('voice')).not.toThrow();
    expect(() => port.play('voice', { loop: true })).not.toThrow();
    expect(() => port.stopAll()).not.toThrow();
  });
});
