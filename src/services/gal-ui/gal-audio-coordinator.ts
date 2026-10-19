import type { GalPackage } from '@engine/protocol/galgame.js';
import type { NarrativeProjection } from '@skills/tier3/narrative-director.js';
import type { AudioPort } from '../audio/audio-port.js';
import { WebAudioPort } from '../audio/web-audio.js';
import { SynthAudioPort, type SfxSpec } from '../audio/synth-audio.js';
import type { GalProfilePreferences } from '../gal-profile/gal-profile.js';

/** Separate ports preserve channel volume even when two channels reference the same file. */
export interface GalAudioPorts {
  readonly bgm: AudioPort;
  readonly voice: AudioPort;
  readonly sfx: AudioPort;
  readonly synthSfx?: AudioPort;
}
export interface GalAudioStatus {
  /** ready means the presentation frame was accepted, not a guarantee from an audio device. */
  readonly status: 'ready' | 'suspended' | 'rejected';
  readonly unavailable: readonly string[];
  readonly error?: string;
}
export interface GalAudioFrame {
  readonly projection: NarrativeProjection;
  /** Host-only entry generation: load/new game/replay and applied narrative inputs increment it. */
  readonly entry: number;
  readonly hasSession: boolean;
  readonly storyVisible: boolean;
  /** Browser focus/visibility is presentation state; never part of the World. */
  readonly focused?: boolean;
  readonly previewVisible?: boolean;
  readonly preferences: GalProfilePreferences;
}

/** Compose existing file and synthesis backends; never creates playback before a player action. */
export function createGalBrowserAudioPorts(pkg: GalPackage, urls: Readonly<Record<string, string>>): GalAudioPorts {
  const fileUrls = (rows: Readonly<Record<string, { readonly asset?: string }>>) =>
    Object.fromEntries(Object.entries(rows).flatMap(([id, row]) =>
      row.asset && typeof urls[row.asset] === 'string' && urls[row.asset].trim() ? [[id, urls[row.asset]]] : []));
  const specs = Object.fromEntries(Object.entries(pkg.media.audio.sfx)
    .flatMap(([id, row]) => row.synth ? [[id, row.synth]] : [])) as Record<string, SfxSpec>;
  return { bgm: new WebAudioPort(fileUrls(pkg.media.audio.bgm)),
    voice: new WebAudioPort(fileUrls(pkg.media.audio.voice)),
    sfx: new WebAudioPort(fileUrls(pkg.media.audio.sfx)),
    ...(Object.keys(specs).length ? { synthSfx: new SynthAudioPort(specs) } : {}) };
}

/** Presentation-only consumer. No World, clock, persistence or simulated input is owned here. */
export class GalAudioCoordinator {
  private bgmId?: string;
  private bgmGain = 1;
  private entered?: string;
  private entryUnavailable: string[] = [];
  private oneShots = false;
  private previewing = false;
  private synthVolume?: number;
  private value: GalAudioStatus = { status: 'suspended', unavailable: [] };
  private diagnosticKey = '';

  constructor(private readonly pkg: GalPackage, private readonly urls: Readonly<Record<string, string>>,
    private readonly ports: GalAudioPorts, private readonly diagnostic?: (status: GalAudioStatus) => void) {
    const channels = [ports.bgm, ports.voice, ports.sfx, ...(ports.synthSfx ? [ports.synthSfx] : [])];
    if (new Set(channels).size !== channels.length) throw new TypeError('GAL audio channels require independent ports');
  }
  get status(): GalAudioStatus { return { ...this.value, unavailable: [...this.value.unavailable] }; }
  private available(asset: string | undefined): boolean {
    return !!asset && Object.hasOwn(this.urls, asset) && typeof this.urls[asset] === 'string' && !!this.urls[asset].trim();
  }
  private report(value: GalAudioStatus): GalAudioStatus {
    this.value = value;
    const key = JSON.stringify(value);
    if (key !== this.diagnosticKey) {
      this.diagnosticKey = key;
      try { this.diagnostic?.(this.status); } catch { /* Diagnostics cannot veto presentation. */ }
    }
    return this.status;
  }
  /** Safe teardown also covers injected backends that reject a stop call. */
  reset(): void {
    for (const port of [this.ports.bgm, this.ports.voice, this.ports.sfx, this.ports.synthSfx])
      try { port?.stopAll(); } catch { /* Other channels must still stop. */ }
    this.bgmId = undefined; this.bgmGain = 1; this.entered = undefined; this.entryUnavailable = []; this.oneShots = false; this.previewing = false;
    this.report({ status: 'suspended', unavailable: [] });
  }
  stopOneShots(): void {
    if (!this.oneShots) return;
    for (const port of [this.ports.voice, this.ports.sfx, this.ports.synthSfx])
      try { port?.stopAll(); } catch { /* Other channels must still stop. */ }
    this.oneShots = false;
    this.previewing = false;
  }
  private gains(p: GalProfilePreferences, focused = true): void {
    const master = p.muted || (p.focusMute && !focused) ? 0 : p.masterVolume;
    this.ports.bgm.setMasterVolume(master * p.bgmVolume * this.bgmGain);
    this.ports.voice.setMasterVolume(master * p.voiceVolume);
    this.ports.sfx.setMasterVolume(master * p.sfxVolume);
    const gain = master * p.sfxVolume;
    // Existing synthesis has no live gain handle: stop the short cue before changing its gain.
    if (this.synthVolume !== undefined && this.synthVolume !== gain) this.ports.synthSfx?.stopAll();
    this.ports.synthSfx?.setMasterVolume(gain); this.synthVolume = gain;
  }
  private playSfx(id: string): boolean {
    const row = Object.hasOwn(this.pkg.media.audio.sfx, id) ? this.pkg.media.audio.sfx[id] : undefined;
    if (row?.asset && this.available(row.asset)) { this.ports.sfx.play(id); return true; }
    if (row?.synth && this.ports.synthSfx) { this.ports.synthSfx.play(id); return true; }
    return false;
  }
  get canPreview(): boolean {
    return Object.keys(this.pkg.media.audio.sfx).some(id => {
      const row = this.pkg.media.audio.sfx[id];
      return this.available(row.asset) || !!(row.synth && this.ports.synthSfx);
    });
  }
  preview(p: GalProfilePreferences): boolean {
    try {
      this.gains(p); this.stopOneShots();
      for (const id of Object.keys(this.pkg.media.audio.sfx).sort())
        if (this.playSfx(id)) { this.oneShots = true; this.previewing = true; return true; }
      return false;
    } catch (error) {
      this.reset(); this.report({ status: 'rejected', unavailable: [], error: String(error) }); return false;
    }
  }
  canReplayVoice(frame: GalAudioFrame): boolean {
    const view = frame.projection;
    const node = this.pkg.chapters[view.chapterId]?.nodes[view.nodeId];
    if (!frame.hasSession || !frame.storyVisible || view.packageId !== this.pkg.id ||
        node?.kind !== 'line' || node.kind !== view.kind || !node.voice ||
        this.entered !== JSON.stringify([frame.entry, view.chapterId, view.nodeId])) return false;
    const voice = this.pkg.media.audio.voice[node.voice];
    return !!voice && view.voiceId === node.voice && voice.asset === view.voiceAssetKey && this.available(voice.asset);
  }
  /** Explicit player replay is tied to the currently presented line and never advances/read-marks it. */
  replayVoice(frame: GalAudioFrame): boolean {
    if (!this.canReplayVoice(frame)) return false;
    const node = this.pkg.chapters[frame.projection.chapterId]?.nodes[frame.projection.nodeId];
    if (node?.kind !== 'line' || !node.voice) return false;
    try {
      this.gains(frame.preferences, frame.focused ?? true);
      this.ports.voice.stopAll();
      this.ports.voice.play(node.voice);
      this.oneShots = true;
      return true;
    } catch (error) {
      this.report({ status: 'rejected', unavailable: [], error: String(error) });
      return false;
    }
  }
  sync(frame: GalAudioFrame): GalAudioStatus {
    const { projection: view, preferences: p } = frame;
    const node = this.pkg.chapters[view.chapterId]?.nodes[view.nodeId];
    if (view.packageId !== this.pkg.id || !node || node.kind !== view.kind ||
        !Number.isSafeInteger(frame.entry) || frame.entry < 0) {
      this.reset(); return this.report({ status: 'rejected', unavailable: [], error: 'invalid-audio-frame' });
    }
    if (!frame.hasSession && !(frame.previewVisible && this.previewing)) { this.reset(); return this.status; }
    const unavailable: string[] = [];
    try {
      const bgm = view.bgmId && Object.hasOwn(this.pkg.media.audio.bgm, view.bgmId)
        ? this.pkg.media.audio.bgm[view.bgmId] : undefined;
      const ambience = view.sceneId ? this.pkg.scenes[view.sceneId]?.ambience : undefined;
      this.bgmGain = bgm ? (ambience && ambience.bgm === view.bgmId ? ambience.volume : undefined) ?? bgm.defaultVolume ?? 1 : 1;
      this.gains(p, frame.focused ?? true);
      const desired = frame.hasSession && bgm && bgm.asset === view.bgmAssetKey && this.available(bgm.asset)
        ? view.bgmId : undefined;
      if (frame.hasSession && view.bgmId && !desired) unavailable.push(`bgm:${view.bgmId}`);
      if (desired !== this.bgmId) {
        this.ports.bgm.stopAll();
        this.bgmId = desired;
        if (desired && bgm) this.ports.bgm.play(desired, { loop: bgm.loop });
      }
      if ((node.presentation?.bgm?.fadeTicks ?? 0) > 0) unavailable.push(`bgm-fade:${view.nodeId}`);
      if (!frame.storyVisible) {
        if (!(frame.previewVisible && this.previewing)) this.stopOneShots();
        return this.report({ status: 'ready', unavailable });
      }
      const entry = JSON.stringify([frame.entry, view.chapterId, view.nodeId]);
      if (entry !== this.entered) {
        this.stopOneShots(); this.entered = entry; this.entryUnavailable = [];
        if (node.kind === 'line' && node.voice && p.voiceAuto) {
          const voice = this.pkg.media.audio.voice[node.voice];
          if (voice && view.voiceId === node.voice && voice.asset === view.voiceAssetKey && this.available(voice.asset)) {
            this.ports.voice.play(node.voice); this.oneShots = true;
          } else this.entryUnavailable.push(`voice:${node.voice}`);
        }
        // The scene projection inherits sfxIds. Only this node's explicit cue may trigger playback.
        for (const id of node.presentation?.sfx ?? []) {
          if (this.playSfx(id)) this.oneShots = true;
          else this.entryUnavailable.push(`sfx:${id}`);
        }
      }
      return this.report({ status: 'ready', unavailable: [...unavailable, ...this.entryUnavailable] });
    } catch (error) {
      this.reset(); return this.report({ status: 'rejected', unavailable, error: String(error) });
    }
  }
}
