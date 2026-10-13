import { World } from '@engine/core/world.js';
import type { InputQueue } from '@engine/protocol/components.js';
import type { GalPackage } from '@engine/protocol/galgame.js';
import { NARRATIVE_ADVANCE, NARRATIVE_BACK, NARRATIVE_CHOOSE,
  readNarrativeHistory, type NarrativeProjection, type StoryRuntime } from '@skills/tier3/narrative-director.js';
import type { ActionSink, LayoutNode } from '@ui/components/types.js';
import { mountUI, type MountHandle } from '@ui/components/server.js';
import { apolloOnyx } from '@ui/components/apollo-kit.js';
import { GalManualSaveController, type GalManualSlot } from '../gal-save/gal-manual-save.js';
import { GalSavePreviewController, type GalPreviewCaptureFrame, type GalPreviewCapturePort,
  type GalPreviewResult, type GalSavePreviewPort } from '../gal-save/gal-save-preview.js';
import { GalNarrativeProfileBridge } from '../gal-profile/narrative-profile-bridge.js';
import { loadGalProfile, persistGalConfirmation, persistGalPlaybackPreferences, persistGalAudioVolume, persistGalFocusMute,
  persistGalVoiceAuto,
  type GalConfirmationKey, type GalProfile, type GalAudioVolumeKey } from '../gal-profile/gal-profile.js';
import { requiresGalConfirmation } from '../gal-profile/gal-confirmation-policy.js';
import type { SavePort } from '../save/save-port.js';
import type { StoragePort } from '../storage/storage-port.js';
import { buildGalUiReadModel, type GalUiReadModel } from './gal-ui-read-model.js';
import { buildGalSliceTree, type GalConfirmKind, type GalSliceUiState, type GalSlotMode } from './gal-ui-structure.js';
import { PresentationReadGate, type PresentedStoryToken, type ReadGateResult } from './presentation-read-gate.js';
import { GalPlaybackScheduler, type GalPlaybackClock, type GalPlaybackFrame,
  type GalPlaybackMode, type GalPlaybackStopReason } from './gal-playback-scheduler.js';
import { GalReplaySession } from './gal-replay-session.js';
import type { GalUiArt } from './gal-ui-art.js';
import { GalAudioCoordinator, type GalAudioPorts, type GalAudioStatus, type GalAudioFrame } from './gal-audio-coordinator.js';

export interface GalSlicePorts {
  readonly profile: SavePort;
  readonly manual: StoragePort;
  /** App-host wall-clock source; never read a clock from LayoutNode or deterministic World. */
  readonly savedAt: () => number;
  /** Supplied by the app host; no timer or wall-clock is stored in World. */
  readonly playbackClock?: GalPlaybackClock;
  /** Optional non-authoritative sidecar; no real storage backend is created by this host. */
  readonly savePreview?: GalSavePreviewPort;
  /** Optional app-host image encoder. It sees a detached story frame, never a World or LayoutNode. */
  readonly previewCapture?: GalPreviewCapturePort;
  /** Resolved, prevalidated UI asset URLs; omitted or missing parts fall back to procedural chrome. */
  readonly uiArt?: GalUiArt;
  /** Explicit package content asset keys → resolved URLs; never a default GAL theme. */
  readonly contentUrls?: Readonly<Record<string, string>>;
  /** Independent presentation-only BGM/voice/SFX backends, explicitly composed by the product host. */
  readonly audio?: GalAudioPorts;
  readonly audioDiagnostic?: (status: GalAudioStatus) => void;
}

const CONFIRM_ACTIONS: Readonly<Record<string, GalConfirmationKey>> = {
  'gal.settings.confirm.saveEmpty': 'saveEmpty',
  'gal.settings.confirm.overwrite': 'overwrite',
  'gal.settings.confirm.load': 'load',
  'gal.settings.confirm.newGame': 'newGame',
  'gal.settings.confirm.returnTitle': 'returnTitle',
  'gal.settings.confirm.exitGame': 'exitGame',
};
const AUDIO_ACTIONS: Readonly<Record<string, GalAudioVolumeKey>> = {
  'gal.settings.master-volume': 'masterVolume',
  'gal.settings.bgm-volume': 'bgmVolume', 'gal.settings.voice-volume': 'voiceVolume',
  'gal.settings.sfx-volume': 'sfxVolume',
};

/** One action sink is the only UI-to-host seam; narrative writes still enter InputQueue. */
export class GalSliceHost implements ActionSink {
  private readonly saves: GalManualSaveController;
  private readonly savePreviews?: GalSavePreviewController;
  private readonly bridge: GalNarrativeProfileBridge;
  private readonly readGate = new PresentationReadGate();
  private readonly playback?: GalPlaybackScheduler;
  private readonly audio?: GalAudioCoordinator;
  private audioEntry = 0;
  private audioFocused = true;
  private audioVisible = true;
  private detached = false;
  private presentedToken?: PresentedStoryToken;
  private readonly initial: ReturnType<World['snapshot']>;
  private readonly initialOrder: ReturnType<World['snapshotOrder']>;
  private profile!: GalProfile;
  private slots: GalManualSlot[] = [];
  private previews = new Map<number, GalPreviewResult>();
  private previewEpoch = 0;
  private mount?: MountHandle;
  private mountElement?: HTMLElement;
  private replay?: GalReplaySession;
  private replayReturn?: { state: GalSliceUiState; focusId: string | null };
  private activeFlush?: Promise<void>;
  private activeResume = false;
  private pending: GalConfirmKind | null = null;
  private state: GalSliceUiState = { page: 'home', slotMode: 'save', selectedSlot: null, confirm: null, feedback: null,
    historyOpen: false, galleryTab: 'memories', galleryPage: 1, expandedCgId: null,
    settingsTab: 'text', settingsRenderRevision: 0, playbackMode: 'off', playbackAvailable: false };
  private pageNumber = 1;
  private returnPage: 'home' | 'story' = 'story';
  private galleryReturnPage: 'home' | 'story' = 'home';
  private settingsReturnPage: 'home' | 'story' | 'slots' | 'gallery' = 'home';

  private constructor(readonly pkg: GalPackage, readonly world: World, readonly entity: string,
    private readonly ports: GalSlicePorts, private readonly locale: string) {
    this.saves = new GalManualSaveController(pkg, ports.manual);
    if (ports.savePreview) this.savePreviews = new GalSavePreviewController(pkg, this.saves, ports.savePreview);
    this.bridge = new GalNarrativeProfileBridge(pkg, ports.profile);
    if (ports.audio) {
      this.audio = new GalAudioCoordinator(pkg, ports.contentUrls ?? {}, ports.audio, ports.audioDiagnostic);
      this.state = { ...this.state, audioAvailable: true, audioPreviewAvailable: this.audio.canPreview };
    }
    if (ports.playbackClock) {
      this.playback = new GalPlaybackScheduler(ports.playbackClock, () => this.playbackFrame(),
        (packageId, refKey, epoch) => this.playbackAdvance(packageId, refKey, epoch),
        reason => this.playbackStopped(reason));
      this.state = { ...this.state, playbackAvailable: true };
    }
    this.initial = world.snapshot();
    this.initialOrder = world.snapshotOrder();
  }

  static async create(pkg: GalPackage, world: World, entity: string, ports: GalSlicePorts,
    locale = pkg.defaultLocale): Promise<GalSliceHost> {
    const host = new GalSliceHost(pkg, world, entity, ports, locale);
    await host.refresh();
    return host;
  }

  get uiState(): GalSliceUiState { return { ...this.state }; }
  get audioStatus(): GalAudioStatus | undefined { return this.audio?.status; }
  get view(): GalUiReadModel {
    const visibleWorld = this.replay?.world ?? this.world;
    const visibleEntity = this.replay?.entity ?? this.entity;
    const projection = visibleWorld.peek<NarrativeProjection>(visibleEntity, 'NarrativeProjection');
    if (!projection) throw new Error('GAL 结构宿主缺少 NarrativeProjection');
    return buildGalUiReadModel({ pkg: this.pkg, projection, profile: this.profile,
      locale: this.locale, manualSlots: this.slots, page: this.pageNumber, hasActiveResume: this.activeResume,
      previews: this.previews,
      history: readNarrativeHistory(visibleWorld, visibleEntity) });
  }
  get tree(): LayoutNode {
    const frame = this.audioFrame();
    return buildGalSliceTree(this.view, { ...this.state,
      voiceReplayAvailable: !!this.audio && !!frame && this.audio.canReplayVoice(frame) },
      this.ports.uiArt, this.ports.contentUrls);
  }

  attach(element: HTMLElement): () => void {
    this.detached = false;
    this.audioFocused = typeof document.hasFocus !== 'function' || document.hasFocus();
    this.audioVisible = !document.hidden;
    this.mountElement = element;
    this.mount = mountUI(element, this.tree, {}, apolloOnyx, this);
    const blur = () => { this.audioFocused = false; this.pausePlayback(); this.redraw(); };
    const focus = () => { this.audioFocused = true; this.redraw(); };
    const hidden = () => { this.audioVisible = !document.hidden; if (!this.audioVisible) this.pausePlayback(); this.redraw(); };
    window.addEventListener('blur', blur); window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', hidden);
    this.completeVisibleText();
    this.syncAudio();
    return () => { this.detached = true; this.pausePlayback(); window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', hidden); this.mount?.(); this.mount = undefined;
      this.mountElement = undefined; this.exitReplay(); this.audio?.reset(); };
  }
  enqueueAction(name: string, value?: { arg?: string }): void {
    void this.dispatch(name, value?.arg).catch(error => {
      if (this.replay) this.exitReplay(`回想异常退出：${String(error)}`);
      else this.set({ feedback: `操作失败：${String(error)}` });
    });
  }

  presentationToken(): PresentedStoryToken | undefined {
    return this.state.page === 'story' && !this.replay ? this.readGate.begin(this.world, this.entity) : undefined;
  }
  async fullyPresented(token: PresentedStoryToken): Promise<ReadGateResult> {
    if (this.replay) return { status: 'ignored', reason: 'stale' };
    const result = this.readGate.fullyPresented(this.world, token);
    if (result.status === 'queued' || (result.status === 'ignored' && result.reason === 'already-queued'))
      this.presentedToken = token;
    if (result.status === 'queued') await this.flush();
    this.playback?.reconcile();
    return result;
  }

  /** App-host pause seam for focus loss, scene suspension and explicit user interruption. */
  pausePlayback(): void {
    this.audio?.stopOneShots();
    if (this.playback?.mode !== 'off') this.playback?.stop('hidden');
  }

  /** Wheel up is rollback; wheel down is advance. Never infers read completion. */
  async wheel(deltaY: number): Promise<void> {
    if (this.state.page !== 'story' || this.state.confirm || this.state.historyOpen ||
        !Number.isFinite(deltaY) || deltaY === 0) return;
    await this.dispatch(deltaY < 0 ? NARRATIVE_BACK : NARRATIVE_ADVANCE);
  }

  async dispatch(name: string, arg?: string): Promise<void> {
    if (this.replay) {
      if (name === 'gal.replay.exit') { this.exitReplay(); return; }
      if (name === 'gal.gallery.play-memory') { this.set({ feedback: '回想已在播放，不能重复开启' }); return; }
      if (name !== NARRATIVE_ADVANCE && name !== NARRATIVE_BACK && name !== NARRATIVE_CHOOSE &&
          name !== 'gal.story.voice-replay' &&
          name !== 'gal.history.open' && name !== 'gal.history.close') return;
    }
    if (this.state.confirm && name !== 'gal.confirm.accept' && name !== 'gal.confirm.cancel') return;
    if (this.state.historyOpen && name !== 'gal.history.close') return;
    if (this.state.expandedCgId && name !== 'gal.gallery.close-cg') return;
    if (name === 'gal.playback.auto' || name === 'gal.playback.skip' || name === 'gal.playback.off') {
      if (this.state.page !== 'story' || !this.playback) return;
      const mode: GalPlaybackMode = name === 'gal.playback.off' ? 'off' : name === 'gal.playback.auto' ? 'auto' : 'skip';
      this.state = { ...this.state, playbackMode: mode, feedback: null };
      this.playback.setMode(mode); this.redraw(); return;
    }
    if (name === 'gal.settings.auto-delay' || name === 'gal.settings.skip-unread') {
      if (this.state.page !== 'settings' || this.state.settingsTab !== 'text' || !this.playback) return;
      const change = name === 'gal.settings.auto-delay' && arg !== undefined && /^(0|[1-9]\d{0,4})$/.test(arg) &&
        Number(arg) <= 10000 ? { autoDelayMs: Number(arg) } :
        name === 'gal.settings.skip-unread' && (arg === 'true' || arg === 'false') ?
          { skipMode: arg === 'true' ? 'all' as const : 'read-only' as const } : undefined;
      if (!change) return;
      try {
        this.profile = await persistGalPlaybackPreferences(this.ports.profile, this.pkg, change, this.ports.savedAt());
        this.set({ feedback: null });
      } catch (error) { this.set({ feedback: `设置保存失败：${String(error)}`,
        settingsRenderRevision: this.state.settingsRenderRevision + 1 }); }
      return;
    }
    const audioKey = Object.hasOwn(AUDIO_ACTIONS, name) ? AUDIO_ACTIONS[name] : undefined;
    if (audioKey) {
      if (!this.audio || this.state.page !== 'settings' || this.state.settingsTab !== 'audio' ||
          arg === undefined || !/^(0|[1-9]\d{0,2})$/.test(arg) || Number(arg) > 100) return;
      try {
        this.profile = await persistGalAudioVolume(this.ports.profile, this.pkg, audioKey, Number(arg) / 100,
          this.ports.savedAt());
        this.set({ feedback: null });
      } catch (error) { this.set({ feedback: `设置保存失败：${String(error)}`,
        settingsRenderRevision: this.state.settingsRenderRevision + 1 }); }
      return;
    }
    if (name === 'gal.settings.focus-mute') {
      if (!this.audio || this.state.page !== 'settings' || this.state.settingsTab !== 'audio' ||
          (arg !== 'true' && arg !== 'false')) return;
      try {
        this.profile = await persistGalFocusMute(this.ports.profile, this.pkg, arg === 'true', this.ports.savedAt());
        this.set({ feedback: null });
      } catch (error) { this.set({ feedback: `设置保存失败：${String(error)}`,
        settingsRenderRevision: this.state.settingsRenderRevision + 1 }); }
      return;
    }
    if (name === 'gal.settings.voice-auto') {
      if (!this.audio || this.state.page !== 'settings' || this.state.settingsTab !== 'audio' ||
          (arg !== 'true' && arg !== 'false')) return;
      try {
        this.profile = await persistGalVoiceAuto(this.ports.profile, this.pkg, arg === 'true', this.ports.savedAt());
        this.set({ feedback: null });
      } catch (error) { this.set({ feedback: `设置保存失败：${String(error)}`,
        settingsRenderRevision: this.state.settingsRenderRevision + 1 }); }
      return;
    }
    const confirmationKey = Object.hasOwn(CONFIRM_ACTIONS, name) ? CONFIRM_ACTIONS[name] : undefined;
    if (confirmationKey) {
      if (this.state.page !== 'settings' || this.state.settingsTab !== 'confirm' ||
          (arg !== 'true' && arg !== 'false')) return;
      try {
        const profile = await persistGalConfirmation(this.ports.profile, this.pkg,
          confirmationKey, arg === 'true', this.ports.savedAt());
        this.profile = profile;
        this.set({ feedback: null });
      } catch (error) { this.set({ feedback: `设置保存失败：${String(error)}`,
        settingsRenderRevision: this.state.settingsRenderRevision + 1 }); }
      return;
    }
    switch (name) {
      case 'gal.story.voice-replay': {
        if (this.state.page !== 'story') return;
        const frame = this.audioFrame();
        this.set({ feedback: this.audio && frame && this.audio.replayVoice(frame) ?
          '已重播当前台词语音' : '当前台词没有可播放语音' });
        return;
      }
      case 'gal.settings.audio-preview':
        if (this.state.page === 'settings' && this.state.settingsTab === 'audio' && this.audio)
          this.set({ feedback: this.audio.preview(this.profile.preferences) ? '正在试听作品音效' : '暂无可播放音效' });
        return;
      case 'gal.settings.open':
        if (this.state.page === 'settings') return;
        this.settingsReturnPage = this.state.page;
        this.set({ page: 'settings', settingsTab: 'text', feedback: null });
        return;
      case 'gal.settings.back':
        if (this.state.page === 'settings') this.set({ page: this.settingsReturnPage, feedback: null });
        return;
      case 'gal.settings.tab':
        if (this.state.page === 'settings' && (arg === 'text' || arg === 'audio' || arg === 'display' || arg === 'confirm'))
          this.set({ settingsTab: arg, feedback: null });
        return;
      case 'gal.settings.nav': {
        if (this.state.page !== 'settings') return;
        const source = this.settingsReturnPage === 'slots' ? this.returnPage :
          this.settingsReturnPage === 'gallery' ? this.galleryReturnPage : this.settingsReturnPage;
        if (arg === 'home') {
          if (source === 'story' && requiresGalConfirmation('returnTitle', this.profile.preferences)) this.ask('return-title');
          else this.set({ page: 'home', feedback: null });
        } else if (arg === 'story' && this.activeResume) this.set({ page: 'story', feedback: null });
        else if (arg === 'slots') this.openSlots('save', source);
        else if (arg === 'gallery' && (this.view.gallery.cg.length || this.view.gallery.memories.length)) this.openGallery(source);
        return;
      }
      case 'gal.home.start':
        if (requiresGalConfirmation('newGame', this.profile.preferences, { hasProgress: this.activeResume })) this.ask('new-game');
        else this.startNew();
        return;
      case 'gal.home.continue':
        if (this.activeResume) this.set({ page: 'story' });
        else if (this.slots.length) this.openSlots('load', 'home');
        return;
      case 'gal.home.load': if (this.slots.length) this.openSlots('load', 'home'); return;
      case 'gal.home.gallery':
        if (this.view.gallery.cg.length || this.view.gallery.memories.length) this.openGallery('home');
        return;
      case 'gal.history.open':
        if (this.state.page === 'story') this.set({ historyOpen: true });
        return;
      case 'gal.history.close': this.set({ historyOpen: false }); return;
      case 'gal.gallery.tab':
        if (this.state.page === 'gallery' && (arg === 'cg' || arg === 'memories'))
          this.set({ galleryTab: arg, galleryPage: 1 });
        return;
      case 'gal.gallery.page': {
        if (this.state.page !== 'gallery' || !arg || !Number.isSafeInteger(Number(arg))) return;
        const total = this.state.galleryTab === 'cg' ? this.view.gallery.cg.length : this.view.gallery.memories.length;
        if (Number(arg) >= 1 && Number(arg) <= Math.max(1, Math.ceil(total / 6)))
          this.set({ galleryPage: Number(arg) });
        return;
      }
      case 'gal.gallery.open-cg':
        if (this.state.page === 'gallery' && arg && this.view.gallery.cg.some(card => card.id === arg && card.unlocked))
          this.set({ expandedCgId: arg });
        return;
      case 'gal.gallery.play-memory': {
        if (this.state.page !== 'gallery' || this.state.galleryTab !== 'memories' || !arg) return;
        try { while (this.activeFlush) await this.activeFlush; }
        catch (error) { this.set({ feedback: `回想无法开启：活动剧情尚未同步（${String(error)}）` }); return; }
        if (this.replay) { this.set({ feedback: '回想已在播放，不能重复开启' }); return; }
        if (this.state.page !== 'gallery' || this.state.galleryTab !== 'memories') return;
        if (this.world.query('InputQueue').some(([id]) =>
          (this.world.peek<InputQueue>(id, 'InputQueue')?.actions.length ?? 0) > 0)) {
          this.set({ feedback: '回想无法开启：活动剧情输入忙' }); return;
        }
        const result = GalReplaySession.open(this.pkg, this.profile, arg, this.world);
        if (result.status === 'rejected') { this.set({ feedback: `回想无法开启：${result.reason}` }); return; }
        const focus = this.mountElement?.ownerDocument.activeElement;
        this.replayReturn = { state: { ...this.state }, focusId: focus instanceof HTMLElement ? focus.id : null };
        this.replay = result.session;
        this.audio?.reset(); this.audioEntry++;
        this.playback?.stop('stale');
        this.set({ page: 'story', historyOpen: false, replayMemoryId: arg, playbackMode: 'off', feedback: null });
        return;
      }
      case 'gal.gallery.close-cg': this.set({ expandedCgId: null }); return;
      case 'gal.gallery.back': this.set({ page: this.galleryReturnPage, galleryPage: 1 }); return;
      case 'gal.story.save': this.openSlots('save', 'story'); return;
      case 'gal.story.load': this.openSlots('load', 'story'); return;
      case 'gal.story.home':
        if (this.state.page !== 'story') return;
        if (requiresGalConfirmation('returnTitle', this.profile.preferences)) this.ask('return-title');
        else this.set({ page: 'home' });
        return;
      case 'gal.slot.back': this.set({ page: this.returnPage, selectedSlot: null }); return;
      case 'gal.slot.mode':
        if (arg === 'save' || arg === 'load') this.set({ slotMode: arg, selectedSlot: null });
        return;
      case 'gal.slot.page':
        if (arg && Number.isSafeInteger(Number(arg)) && Number(arg) >= 1 && Number(arg) <= this.view.manual.pageCount) {
          this.pageNumber = Number(arg); this.previews = new Map(); this.set({ selectedSlot: null });
          this.refreshPreviews();
        }
        return;
      case 'gal.slot.select':
        if (arg && this.view.manual.slots.some(slot => slot.number === Number(arg)))
          this.set({ selectedSlot: Number(arg) });
        return;
      case 'gal.slot.commit': {
        const slot = this.view.manual.slots.find(item => item.number === this.state.selectedSlot);
        if (!slot || (this.state.slotMode === 'load' && !slot.canLoad)) return;
        const kind: GalConfirmKind = this.state.slotMode === 'load' ? 'load' : slot.filled ? 'overwrite' : 'save-empty';
        const policyKind = kind === 'save-empty' ? 'saveEmpty' : kind;
        if (requiresGalConfirmation(policyKind, this.profile.preferences,
          { slotFilled: slot.filled, slotReadable: slot.canLoad })) this.ask(kind);
        else await this.run(kind, slot.number);
        return;
      }
      case 'gal.confirm.cancel': this.pending = null; this.set({ confirm: null }); return;
      case 'gal.confirm.accept': await this.accept(); return;
      case NARRATIVE_ADVANCE:
      case NARRATIVE_BACK:
      case NARRATIVE_CHOOSE:
        if (this.state.page !== 'story' || this.state.historyOpen) return;
        if (this.playback?.mode !== 'off') this.playback?.stop('stale');
        if (name === NARRATIVE_CHOOSE && !this.view.story.choices.some(choice => choice.id === arg && !choice.disabled)) return;
        if (name === NARRATIVE_ADVANCE && this.view.story.kind === 'choice') return;
        if (this.replay) {
          const result = this.replay.step(name, arg);
          if (result.status === 'complete') this.exitReplay();
          else if (result.status === 'rejected') {
            if (result.reason === 'no-history') this.set({ feedback: '已到回想起点' });
            else this.exitReplay(`回想异常退出：${result.reason}`);
          } else { this.audioEntry++; this.redraw(); }
          return;
        }
        if (!this.queue(name, arg)) return;
        this.audio?.stopOneShots();
        await this.flush(); this.activeResume = true; this.redraw(); return;
    }
  }

  private set(next: Partial<GalSliceUiState>): void {
    this.state = { ...this.state, ...next }; this.playback?.reconcile(); this.redraw();
  }
  private redraw(): void {
    this.syncAudio();
    if (!this.mount) return;
    this.mount.update(this.tree, apolloOnyx);
    this.completeVisibleText();
  }
  private syncAudio(): void {
    if (!this.audio || !this.profile) return;
    const frame = this.audioFrame();
    if (!frame) { this.audio.reset(); return; }
    this.audio.sync(frame);
  }
  private audioFrame(): GalAudioFrame | undefined {
    if (!this.profile) return undefined;
    const visibleWorld = this.replay?.world ?? this.world;
    const projection = visibleWorld.peek<NarrativeProjection>(this.replay?.entity ?? this.entity, 'NarrativeProjection');
    if (!projection) return undefined;
    return { projection, entry: this.audioEntry, preferences: this.profile.preferences,
      focused: this.audioFocused && this.audioVisible,
      hasSession: !this.detached && this.state.page !== 'home' && (!!this.replay || this.activeResume),
      storyVisible: this.state.page === 'story' && !this.state.historyOpen && !this.state.confirm,
      previewVisible: !this.detached && this.state.page === 'settings' && this.state.settingsTab === 'audio' };
  }
  private completeVisibleText(): void {
    // S4 Label renders the complete text synchronously. Future typewriter must call
    // fullyPresented at its own final-character callback instead of this seam.
    const token = this.replay || this.state.historyOpen || this.state.confirm ? undefined : this.presentationToken();
    if (token) void this.fullyPresented(token).catch(error => {
      const message = `已读写入失败：${String(error)}`;
      if (this.state.feedback !== message) this.set({ feedback: message });
    });
  }
  private ask(kind: GalConfirmKind): void { this.pending = kind; this.set({ confirm: kind }); }
  private openSlots(mode: GalSlotMode, back: 'home' | 'story'): void {
    this.returnPage = back; this.pageNumber = 1; this.previews = new Map();
    this.set({ page: 'slots', slotMode: mode, selectedSlot: null, feedback: null });
    this.refreshPreviews();
  }
  private openGallery(back: 'home' | 'story'): void {
    this.galleryReturnPage = back;
    this.set({ page: 'gallery', galleryTab: this.view.gallery.memories.length ? 'memories' : 'cg',
      galleryPage: 1, expandedCgId: null, feedback: null });
  }
  private exitReplay(feedback: string | null = null): void {
    const target = this.replayReturn;
    if (!this.replay || !target) return;
    this.audio?.reset(); this.audioEntry++;
    this.replay.close(); this.replay = undefined; this.replayReturn = undefined;
    this.state = { ...target.state, feedback };
    this.redraw();
    if (target.focusId && this.mountElement) {
      const node = Array.from(this.mountElement.querySelectorAll<HTMLElement>('[id]'))
        .find(item => item.id === target.focusId);
      node?.focus();
    }
  }
  /** Read-only refresh after an external Profile update; never writes World or Profile. */
  async refreshView(): Promise<void> {
    try {
      await this.refresh();
      if (this.replay && !this.profile.unlockedMemoryIds.includes(this.replay.memoryId))
        this.exitReplay('回想已失效：解锁状态变化');
      else this.redraw();
    } catch (error) {
      if (this.replay) this.exitReplay(`回想异常退出：${String(error)}`);
      throw error;
    }
  }
  private startNew(): void {
    this.audio?.reset(); this.audioEntry++;
    this.world.restore(this.initial, this.initialOrder);
    this.world.clearEvents();
    this.activeResume = true;
    this.set({ page: 'story', confirm: null, feedback: null });
  }
  private async accept(): Promise<void> {
    const kind = this.pending, number = this.state.selectedSlot;
    this.pending = null; this.set({ confirm: null });
    if (kind) await this.run(kind, number);
  }
  private async run(kind: GalConfirmKind, number: number | null): Promise<void> {
    if (kind === 'new-game') { this.startNew(); return; }
    if (kind === 'return-title') { this.set({ page: 'home' }); return; }
    if (number === null) return;
    if (kind === 'load') {
      const result = await this.saves.load(number, this.world);
      if (result.status !== 'loaded') { this.set({ feedback: '该槽位没有可读取存档' }); return; }
      this.audio?.reset(); this.audioEntry++;
      this.activeResume = true;
      await this.refresh();
      this.set({ page: 'story', feedback: `已读取 NO. ${number}` });
    } else {
      const frame = this.previewFrame();
      const meta = await this.saves.save(number, this.world);
      await this.refresh();
      this.set({ feedback: `已保存至 NO. ${number}` });
      if (frame) void this.captureSavePreview(number, meta.hash, frame);
    }
  }
  private previewFrame(): GalPreviewCaptureFrame | undefined {
    if (!this.savePreviews || !this.ports.previewCapture || this.replay) return undefined;
    try {
      const story = this.view.story;
      const urls = this.ports.contentUrls;
      return { packageId: this.pkg.id, refKey: story.refKey,
        speaker: story.speaker, text: story.text,
        ...(story.backgroundAssetKey ? { backgroundAssetKey: story.backgroundAssetKey,
          ...(urls?.[story.backgroundAssetKey] ? { backgroundUrl: urls[story.backgroundAssetKey] } : {}) } : {}),
        ...(story.portraitAssetKey ? { portraitAssetKey: story.portraitAssetKey,
          ...(urls?.[story.portraitAssetKey] ? { portraitUrl: urls[story.portraitAssetKey] } : {}) } : {}) };
    } catch { return undefined; } // preview extraction cannot veto an authoritative save
  }
  private async captureSavePreview(number: number, saveHash: string, frame: GalPreviewCaptureFrame): Promise<void> {
    try {
      const image = await this.ports.previewCapture!.capture(frame);
      if (!image) return;
      if (await this.savePreviews!.write(number, saveHash, image) !== 'stored') return;
      if (this.state.page === 'slots' &&
          this.slots.find(slot => slot.number === number)?.meta.hash === saveHash) this.refreshPreviews();
    } catch { /* capture and sidecar are optional; authoritative save/load remain usable */ }
  }
  private queue(key: string, arg?: string): boolean {
    const entries = this.world.query('InputQueue');
    if (entries.length !== 1) return false;
    const [entity] = entries[0];
    const current = this.world.peek<InputQueue>(entity, 'InputQueue');
    if (!current || current.actions.length) return false;
    this.world.addComponent<InputQueue>(entity, { type: 'InputQueue', actions: [
      { source: 'gal-ui-slice', phase: 'action', key, ...(arg === undefined ? {} : { arg }) },
    ] });
    return true;
  }
  async flush(): Promise<void> {
    if (this.replay) return;
    if (this.activeFlush) {
      await this.activeFlush;
      if (this.world.query('InputQueue').some(([id]) =>
        (this.world.peek<InputQueue>(id, 'InputQueue')?.actions.length ?? 0) > 0)) await this.flush();
      return;
    }
    const run = (async () => {
      const entries = this.world.query('InputQueue');
      if (entries.length === 1 && (this.world.peek<InputQueue>(entries[0][0], 'InputQueue')?.actions.length ?? 0)) {
        const narrativeInput = this.world.peek<InputQueue>(entries[0][0], 'InputQueue')!.actions
          .some(action => [NARRATIVE_ADVANCE, NARRATIVE_BACK, NARRATIVE_CHOOSE].includes(action.key ?? ''));
        this.world.tick();
        if (narrativeInput && this.world.peek<StoryRuntime>(this.entity, 'StoryRuntime')?.lastReceipt?.status === 'applied')
          this.audioEntry++;
        this.world.addComponent<InputQueue>(entries[0][0], { type: 'InputQueue', actions: [] });
      }
      const result = await this.bridge.drain(this.world, this.entity, this.world.getVersion());
      if (result.status === 'failed') throw result.error;
      if (result.status === 'ack-queued') {
        const [inputEntity] = this.world.query('InputQueue')[0] ?? [];
        if (inputEntity) {
          this.world.tick();
          this.world.addComponent<InputQueue>(inputEntity, { type: 'InputQueue', actions: [] });
        }
      }
      await this.refresh();
      this.redraw();
    })();
    this.activeFlush = run;
    try { await run; }
    finally { if (this.activeFlush === run) this.activeFlush = undefined; }
  }
  private async refresh(): Promise<void> {
    this.profile = await loadGalProfile(this.ports.profile, this.pkg);
    this.slots = await this.saves.list();
    this.previews = new Map();
    this.refreshPreviews();
    this.playback?.reconcile();
  }

  /** Sidecar reads never sit on the authoritative save/load response path. */
  private refreshPreviews(): void {
    const epoch = ++this.previewEpoch;
    if (!this.savePreviews || this.state.page !== 'slots') return;
    const first = (this.pageNumber - 1) * 12 + 1;
    for (const slot of this.slots.filter(item => item.number >= first && item.number < first + 12)) {
      void this.savePreviews.resolve(slot.number, slot.meta.hash).then(result => {
        if (epoch !== this.previewEpoch || this.state.page !== 'slots' ||
            this.slots.find(item => item.number === slot.number)?.meta.hash !== slot.meta.hash) return;
        this.previews.set(slot.number, result);
        this.redraw();
      }, () => {
        if (epoch !== this.previewEpoch || this.state.page !== 'slots') return;
        this.previews.set(slot.number, { status: 'unavailable' });
        this.redraw();
      });
    }
  }

  private playbackFrame(): GalPlaybackFrame {
    const projection = this.world.peek<NarrativeProjection>(this.entity, 'NarrativeProjection');
    const runtime = this.world.peek<StoryRuntime>(this.entity, 'StoryRuntime');
    const token = this.presentationToken();
    return { packageId: projection?.packageId ?? '',
      refKey: projection ? JSON.stringify([projection.chapterId, projection.nodeId]) : '',
      kind: projection?.kind ?? 'jump',
      visible: this.state.page === 'story' && !this.state.confirm && !this.state.historyOpen &&
        !this.replay && !this.state.expandedCgId && !!projection && projection.packageId === this.pkg.id &&
        runtime?.packageId === this.pkg.id && runtime.lastReceipt?.status !== 'rejected',
      fullyPresented: !!token && token === this.presentedToken,
      read: !!projection && this.profile.readNodeIds.includes(JSON.stringify([projection.chapterId, projection.nodeId])),
      skipMode: this.profile.preferences.skipMode, autoDelayMs: this.profile.preferences.autoDelayMs };
  }

  private async playbackAdvance(packageId: string, refKey: string, epoch: number): Promise<boolean> {
    const frame = this.playbackFrame();
    if (this.playback?.epoch !== epoch || frame.packageId !== packageId || frame.refKey !== refKey ||
        !frame.visible || frame.kind !== 'line') return false;
    if (!this.queue(NARRATIVE_ADVANCE)) return false;
    this.audio?.stopOneShots();
    await this.flush(); this.activeResume = true; this.redraw();
    return this.playback?.epoch === epoch;
  }

  private playbackStopped(reason: GalPlaybackStopReason): void {
    const feedback = reason === 'unread' ? '已停在未读台词' : reason === 'busy' ? '输入忙，自动播放已暂停' :
      reason === 'clock' ? '调度时钟无效，自动播放已暂停' : null;
    this.state = { ...this.state, playbackMode: 'off', ...(feedback ? { feedback } : {}) };
    this.redraw();
  }
}
