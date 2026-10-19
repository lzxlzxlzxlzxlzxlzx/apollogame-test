// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { GalPackage } from '@engine/protocol/galgame.js';
import type { InputQueue } from '@engine/protocol/components.js';
import { World } from '@engine/core/world.js';
import { hashWithOrder } from '@net/determinism.js';
import { createStoryRuntime, narrativeDirectorCapability, readNarrativeEvents, storyRefKey,
  type StoryRuntime } from '@skills/tier3/narrative-director.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import { MemorySavePort } from '../save/memory-save-port.js';
import { MemoryStoragePort } from '../storage/memory-storage.js';
import { MemoryGalSavePreviewPort, type GalPreviewCaptureFrame } from '../gal-save/gal-save-preview.js';
import { loadGalProfile, persistGalConfirmation, saveGalProfile, unlock } from '../gal-profile/gal-profile.js';
import { GalSliceHost } from './gal-ui-slice-host.js';
import type { GalPlaybackClock } from './gal-playback-scheduler.js';
import { GalReplaySession } from './gal-replay-session.js';

const L = (value: string) => ({ 'zh-CN': value });
const ref = (nodeId: string) => ({ chapterId: 'a', nodeId });
function pkg(): GalPackage { return {
  schemaVersion: 1, id: 'gal-ui-slice-test', title: L('月影书简'), defaultLocale: 'zh-CN', locales: ['zh-CN'],
  entry: ref('intro'), ui: { template: 'gal-template' }, characters: {}, scenes: {},
  preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only',
    bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
  media: { backgrounds: {}, cg: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [
    `cg-${index + 1}`, { image: `private/cg-${index + 1}`, title: L(`第 ${index + 1} 张月影`), unlock: { kind: 'explicit' as const } },
  ])), audio: { bgm: {}, sfx: {}, voice: {} }, video: {} },
  gallery: { memories: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [
    `memory-${index + 1}`, { title: L(`回想 ${index + 1}`), entry: ref('intro'), unlock: { kind: 'explicit' as const } },
  ])), music: {} }, endings: { yes: { title: L('好') }, no: { title: L('坏') } },
  chapters: { a: { id: 'a', title: L('序章'), start: 'intro', nodes: {
    intro: { kind: 'line', text: L('月色静静落下。'), next: ref('choice') },
    choice: { kind: 'choice', prompt: L('打开哪封信？'), options: [
      { id: 'yes', text: L('第一封'), next: ref('yes') },
      { id: 'no', text: L('第二封'), next: ref('no') },
    ] },
    yes: { kind: 'ending', ending: 'yes', text: L('好结局') },
    no: { kind: 'ending', ending: 'no', text: L('坏结局') },
  } } },
}; }
function world(p: GalPackage): World {
  const w = new World();
  for (const system of narrativeDirectorCapability.systems) w.addSystem(system);
  w.createEntity('story'); w.addComponent('story', { type: 'NarrativePackage', package: p });
  w.addComponent('story', createStoryRuntime(p));
  w.createEntity('input'); w.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
  w.tick(); return w;
}
function at(w: World): string { return storyRefKey(w.peek<StoryRuntime>('story', 'StoryRuntime')!.current); }
async function fixture(playbackClock?: GalPlaybackClock) {
  const p = pkg(), w = world(p), profile = new MemorySavePort(), manual = new MemoryStoragePort();
  const host = await GalSliceHost.create(p, w, 'story', { profile, manual, savedAt: () => 1000, playbackClock });
  return { p, w, profile, manual, host };
}

class PlaybackFakeClock implements GalPlaybackClock {
  time = 0;
  tasks: { due: number; fire: () => void; cancelled: boolean }[] = [];
  now = () => this.time;
  schedule = (delayMs: number, fire: () => void) => {
    const task = { due: this.time + delayMs, fire, cancelled: false };
    this.tasks.push(task); return () => { task.cancelled = true; };
  };
  tick(ms: number): void {
    this.time += ms;
    for (const task of this.tasks.filter(item => !item.cancelled && item.due <= this.time)) {
      task.cancelled = true; task.fire();
    }
  }
}
const settlePlayback = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

describe('GAL-UI-03A structural vertical slice', () => {
  it('persists work reduced-motion, scopes it to this mount, and clears it on detach', async () => {
    const { p, profile, host } = await fixture();
    const first = document.createElement('div'), second = document.createElement('div');
    document.body.append(first, second);
    const detach = host.attach(first);
    try {
      expect(first.hasAttribute('data-apollo-reduced-motion')).toBe(false);
      await host.dispatch('gal.settings.open'); await host.dispatch('gal.settings.tab', 'display');
      await host.dispatch('gal.settings.reduced-motion', 'true');
      expect((await loadGalProfile(profile, p)).preferences.reducedMotion).toBe(true);
      expect(first.hasAttribute('data-apollo-reduced-motion')).toBe(true);
      expect(second.hasAttribute('data-apollo-reduced-motion')).toBe(false);
      await host.dispatch('gal.settings.reduced-motion', 'false');
      expect(first.hasAttribute('data-apollo-reduced-motion')).toBe(false);
    } finally { detach(); expect(first.hasAttribute('data-apollo-reduced-motion')).toBe(false); expect(second.hasAttribute('data-apollo-reduced-motion')).toBe(false); first.remove(); second.remove(); }
  });
  it('keeps browser preview exit inside the exitGame policy and never mutates gameplay or saves', async () => {
    const p = pkg(), w = world(p), profile = new MemorySavePort(), manual = new MemoryStoragePort();
    const host = await GalSliceHost.create(p, w, 'story', {
      profile, manual, savedAt: () => 1000, previewExitFeedback: true,
    });
    const beforeHash = hashWithOrder(w.snapshot(), w.snapshotOrder());
    const beforeProfile = await loadGalProfile(profile, p);
    expect(JSON.stringify(host.tree)).toContain('gal.home.exit');
    await host.dispatch('gal.home.exit');
    expect(host.uiState.confirm).toBe('exit-game');
    await host.dispatch('gal.confirm.cancel');
    expect(host.uiState.confirm).toBeNull();
    expect(host.uiState.feedback).toBeNull();
    await host.dispatch('gal.home.exit');
    await host.dispatch('gal.confirm.accept');
    expect(host.uiState).toMatchObject({ page: 'home', confirm: null,
      feedback: '浏览器预览不会关闭窗口，桌面版由宿主处理退出' });
    expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(beforeHash);
    expect(await loadGalProfile(profile, p)).toEqual(beforeProfile);

    await persistGalConfirmation(profile, p, 'exitGame', false, 2);
    await host.refreshView();
    await host.dispatch('gal.home.exit');
    expect(host.uiState).toMatchObject({ page: 'home', confirm: null,
      feedback: '浏览器预览不会关闭窗口，桌面版由宿主处理退出' });
    expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(beforeHash);
  });

  it('fails closed for exit when the explicit browser preview capability was not composed', async () => {
    const { host } = await fixture();
    expect(JSON.stringify(host.tree)).toContain('"disabled":true');
    await host.dispatch('gal.home.exit');
    expect(host.uiState).toMatchObject({ page: 'home', confirm: null, feedback: null });
  });

  it('sends desktop exit once through the injected host and leaves the story untouched when rejected', async () => {
    const p = pkg(), w = world(p), profile = new MemorySavePort(), manual = new MemoryStoragePort();
    const requestExit = vi.fn(() => 'rejected' as const);
    const host = await GalSliceHost.create(p, w, 'story', {
      profile, manual, savedAt: () => 1000, hostExit: { requestExit },
    });
    const beforeHash = hashWithOrder(w.snapshot(), w.snapshotOrder());
    await host.dispatch('gal.home.exit');
    expect(host.uiState.confirm).toBe('exit-game');
    expect(JSON.stringify(host.tree)).toContain('将关闭这个游戏窗口');
    await host.dispatch('gal.confirm.accept');
    expect(requestExit).toHaveBeenCalledTimes(1);
    expect(host.uiState).toMatchObject({ page: 'home', confirm: null, feedback: '退出没有被接受，游戏仍在运行' });
    expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(beforeHash);
    requestExit.mockReturnValue('accepted');
    await host.dispatch('gal.home.exit');
    await host.dispatch('gal.confirm.accept');
    expect(requestExit).toHaveBeenCalledTimes(2);
    expect(host.uiState.feedback).toBeNull();
    expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(beforeHash);
  });

  it('keeps story CG shot switches, hide, rollback and manual load on the Director projection', async () => {
    const base = pkg();
    const p: GalPackage = { ...base,
      media: { ...base.media, backgrounds: { room: { image: 'demo/bg' } } },
      scenes: { room: { id: 'room', background: 'room' } },
      chapters: { a: { ...base.chapters.a, scene: 'room', nodes: {
        intro: { kind: 'line', text: L('第一分镜'), presentation: { cg: { show: 'cg-1' } }, next: ref('choice') },
        choice: { kind: 'choice', prompt: L('第二分镜'), presentation: { cg: { show: 'cg-2' } }, options: [
          { id: 'yes', text: L('结束'), next: ref('yes') },
        ] },
        yes: { kind: 'ending', ending: 'yes', text: L('回到场景'), presentation: { cg: { hide: true } } },
      } } },
    };
    const captured: GalPreviewCaptureFrame[] = [];
    const w = world(p), host = await GalSliceHost.create(p, w, 'story', {
      profile: new MemorySavePort(), manual: new MemoryStoragePort(), savedAt: () => 1000,
      contentUrls: { 'demo/bg': '/bg.png', 'private/cg-1': '/shot-1.png', 'private/cg-2': '/shot-2.png' },
      savePreview: new MemoryGalSavePreviewPort(),
      previewCapture: { capture: async frame => { captured.push(frame); return null; } },
    });
    const image = () => JSON.stringify(host.tree);
    await host.dispatch('gal.home.start');
    expect(host.view.story.cgAssetKey).toBe('private/cg-1');
    expect(image()).toContain('/shot-1.png');
    expect(image()).not.toContain('/bg.png');
    await host.dispatch('narrative.advance');
    expect(host.view.story.cgAssetKey).toBe('private/cg-2');
    expect(image()).toContain('/shot-2.png');
    expect(image()).not.toContain('/shot-1.png');
    await host.dispatch('gal.story.save');
    await host.dispatch('gal.slot.select', '2');
    await host.dispatch('gal.slot.commit');
    await host.dispatch('gal.confirm.accept');
    expect(captured).toMatchObject([{ cgAssetKey: 'private/cg-2', cgUrl: '/shot-2.png',
      backgroundAssetKey: 'demo/bg', backgroundUrl: '/bg.png' }]);
    await host.dispatch('gal.slot.back');
    await host.dispatch('narrative.choose', 'yes');
    expect(host.view.story.cgAssetKey).toBeUndefined();
    expect(image()).toContain('/bg.png');
    expect(image()).not.toContain('/shot-2.png');
    await host.wheel(-1);
    expect(host.view.story.cgAssetKey).toBe('private/cg-2');
    expect(image()).toContain('/shot-2.png');
    await host.dispatch('gal.story.load');
    await host.dispatch('gal.slot.select', '2');
    await host.dispatch('gal.slot.commit');
    await host.dispatch('gal.confirm.accept');
    expect(at(w)).toBe(storyRefKey(ref('choice')));
    expect(host.view.story.cgAssetKey).toBe('private/cg-2');
    expect(image()).toContain('/shot-2.png');
    expect(validateLayoutNode(host.tree)).toEqual([]);
  });

  it('GAL-UI-03E clicks the V2 dialogue surface, then chooses and rechooses after rollback', async () => {
    const { w, host } = await fixture();
    const element = document.createElement('div'); document.body.appendChild(element);
    const detach = host.attach(element);
    const until = async (key: string) => {
      for (let attempt = 0; attempt < 30 && at(w) !== key; attempt++)
        await new Promise(resolve => setTimeout(resolve, 0));
      expect(at(w)).toBe(key);
    };
    try {
      await host.dispatch('gal.home.start');
      (element.querySelector('#gal-story-dialogue') as HTMLElement).click();
      (element.querySelector('#gal-story-dialogue') as HTMLElement).click();
      await until(storyRefKey(ref('choice')));
      expect(element.querySelector('#gal-story-dialogue')?.hasAttribute('data-action')).toBe(false);
      (element.querySelector('[data-action="narrative.choose"][data-arg="yes"]') as HTMLElement).click();
      (element.querySelector('[data-action="narrative.choose"][data-arg="yes"]') as HTMLElement).click();
      await until(storyRefKey(ref('yes')));
      element.querySelector('#gal-story-dialogue')!.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: -120,
      }));
      await until(storyRefKey(ref('choice')));
      await new Promise(resolve => setTimeout(resolve, 0));
      (element.querySelector('[data-action="narrative.choose"][data-arg="no"]') as HTMLElement).click();
      (element.querySelector('[data-action="narrative.choose"][data-arg="no"]') as HTMLElement).click();
      await until(storyRefKey(ref('no')));
    } finally { detach(); element.remove(); }
  });

  it('routes mounted WheelEvent through Panel.wheel to rollback and advance, including rechoice', async () => {
    const { w, host } = await fixture();
    const element = document.createElement('div'); document.body.appendChild(element);
    const detach = host.attach(element);
    const until = async (key: string) => {
      for (let attempt = 0; attempt < 30 && at(w) !== key; attempt++)
        await new Promise(resolve => setTimeout(resolve, 0));
      expect(at(w)).toBe(key);
    };
    const wheel = (deltaY: number) => {
      const target = element.querySelector('#gal-story-dialogue');
      expect(target).not.toBeNull();
      target!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY }));
    };
    try {
      await host.dispatch('gal.home.start');
      wheel(120); wheel(120); await until(storyRefKey(ref('choice')));
      await host.dispatch('narrative.choose', 'yes');
      await host.dispatch('narrative.choose', 'yes');
      expect(at(w)).toBe(storyRefKey(ref('yes')));
      wheel(-120); await until(storyRefKey(ref('choice')));
      await settlePlayback();
      await host.dispatch('narrative.choose', 'no');
      await settlePlayback();
      await host.dispatch('narrative.choose', 'no');
      expect(at(w)).toBe(storyRefKey(ref('no')));
      wheel(-120); await until(storyRefKey(ref('choice')));
      wheel(-120); await until(storyRefKey(ref('intro')));
      wheel(120); wheel(120); await until(storyRefKey(ref('choice')));
      await host.dispatch('gal.story.home');
      expect(host.uiState.confirm).toBe('return-title');
      expect(validateLayoutNode(host.tree)).toEqual([]);
      await host.dispatch('gal.confirm.accept');
      element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120 }));
      expect(at(w)).toBe(storyRefKey(ref('choice')));
    } finally { detach(); element.remove(); }
  });

  it('marks a line read only after the PUI completion signal, not at mount', async () => {
    const { p, profile, host } = await fixture();
    const element = document.createElement('div');
    document.body.appendChild(element);
    const detach = host.attach(element);
    try {
      expect((await loadGalProfile(profile, p)).readNodeIds).toEqual([]);
      (element.querySelector('#starter-act-0') as HTMLElement | null)?.click();
      for (let attempt = 0; attempt < 10 && host.uiState.page !== 'story'; attempt++)
        await new Promise(resolve => setTimeout(resolve, 0));
      expect(host.uiState.page).toBe('story');
      expect((await loadGalProfile(profile, p)).readNodeIds).toEqual([]);
      const text = element.querySelector('#gal-story-text') as HTMLElement;
      const token = text.dataset.typewriterToken;
      expect(token).toBeTruthy();
      await host.dispatch('gal.story.presented', token);
      expect((await loadGalProfile(profile, p)).readNodeIds).toContain(storyRefKey(ref('intro')));
    } finally { detach(); element.remove(); }
  });

  it('rejects a stale opaque completion after the StoryRef has changed', async () => {
    const { p, profile, w, host } = await fixture();
    await host.dispatch('gal.home.start');
    const find = (id: string, node = host.tree): typeof node | undefined => node.id === id ? node :
      node.children?.map(child => find(id, child)).find(Boolean);
    const stale = (find('gal-story-text')?.props as { typewriterSignal?: { token: string } })
      .typewriterSignal?.token;
    expect(stale).toBeTruthy();
    await host.dispatch('narrative.advance');
    expect(at(w)).toBe(storyRefKey(ref('choice')));
    await host.dispatch('gal.story.presented', stale);
    expect((await loadGalProfile(profile, p)).readNodeIds).toEqual([]);
    const current = (find('gal-story-text')?.props as { typewriterSignal?: { token: string } })
      .typewriterSignal?.token;
    await host.dispatch('gal.story.presented', current);
    expect((await loadGalProfile(profile, p)).readNodeIds).toEqual([storyRefKey(ref('choice'))]);
  });

  it('rejects a delayed old PUI token while mounted after the next StoryRef was rendered', async () => {
    const { p, profile, w, host } = await fixture();
    const element = document.createElement('div'); document.body.appendChild(element);
    const detach = host.attach(element);
    try {
      await host.dispatch('gal.home.start');
      const oldToken = element.querySelector<HTMLElement>('#gal-story-text')?.dataset.typewriterToken;
      expect(oldToken).toBeTruthy();
      await host.dispatch('gal.story.presented', oldToken);
      await host.dispatch('narrative.advance');
      expect(at(w)).toBe(storyRefKey(ref('choice')));
      const newToken = element.querySelector<HTMLElement>('#gal-story-text')?.dataset.typewriterToken;
      expect(newToken).toBeTruthy();
      expect(newToken).not.toBe(oldToken);
      await host.dispatch('gal.story.presented', oldToken);
      expect((await loadGalProfile(profile, p)).readNodeIds).toEqual([storyRefKey(ref('intro'))]);
      await host.dispatch('gal.story.presented', newToken);
      expect((await loadGalProfile(profile, p)).readNodeIds).toEqual(expect.arrayContaining([
        storyRefKey(ref('intro')), storyRefKey(ref('choice')),
      ]));
    } finally { detach(); element.remove(); }
  });

  it('renders valid LayoutNode for home/story/12-slot grid/confirmation, and defaults dangerous prompts on', async () => {
    const { host } = await fixture();
    expect(validateLayoutNode(host.tree)).toEqual([]);
    expect(host.view.manual.slots).toHaveLength(12);
    expect(host.view.manual.pageCount).toBe(2);
    await host.dispatch('gal.home.start');
    expect(host.uiState.page).toBe('story');
    expect(validateLayoutNode(host.tree)).toEqual([]);
    await host.dispatch('gal.story.save');
    expect(host.uiState.page).toBe('slots');
    expect(validateLayoutNode(host.tree)).toEqual([]);
    await host.dispatch('gal.slot.mode', 'load');
    await host.dispatch('gal.slot.select', '3');
    expect(validateLayoutNode(host.tree)).toEqual([]);
    await host.dispatch('gal.slot.commit');
    expect(host.uiState.confirm).toBeNull();
    await host.dispatch('gal.slot.mode', 'save');
    await host.dispatch('gal.slot.select', '2');
    await host.dispatch('gal.slot.commit');
    expect(host.uiState.confirm).toBe('save-empty');
    expect(validateLayoutNode(host.tree)).toEqual([]);
  });

  it('runs home → presented/read → choice by stable ID → wheel rollback/rechoice → slot 2 save/load; Profile never rewinds', async () => {
    const { p, w, profile, host } = await fixture();
    await host.dispatch('gal.home.start');
    const token = host.presentationToken()!;
    expect((await loadGalProfile(profile, p)).readNodeIds).toEqual([]);
    expect((await host.fullyPresented(token)).status).toBe('queued');
    expect((await loadGalProfile(profile, p)).readNodeIds).toContain(storyRefKey(ref('intro')));
    await host.wheel(1);
    expect(at(w)).toBe(storyRefKey(ref('choice')));
    expect(host.view.story.choices.map(choice => choice.id)).toEqual(['yes', 'no']);
    await host.dispatch('narrative.choose', 'yes');
    expect(at(w)).toBe(storyRefKey(ref('yes')));
    await host.wheel(-1);
    expect(at(w)).toBe(storyRefKey(ref('choice')));
    await host.dispatch('narrative.choose', 'no');
    expect(at(w)).toBe(storyRefKey(ref('no')));
    await host.dispatch('gal.story.save');
    await host.dispatch('gal.slot.select', '2');
    await host.dispatch('gal.slot.commit');
    expect(host.uiState.confirm).toBe('save-empty');
    await host.dispatch('gal.confirm.accept');
    expect(host.view.manual.slots[1]?.filled).toBe(true);
    const savedHash = hashWithOrder(w.snapshot(), w.snapshotOrder());
    await host.dispatch('gal.slot.back');
    await host.wheel(-1);
    expect(at(w)).toBe(storyRefKey(ref('choice')));
    await host.dispatch('gal.story.load');
    await host.dispatch('gal.slot.select', '2');
    await host.dispatch('gal.slot.commit');
    expect(host.uiState.confirm).toBe('load');
    await host.dispatch('gal.confirm.accept');
    expect(at(w)).toBe(storyRefKey(ref('no')));
    expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(savedHash);
    expect((await loadGalProfile(profile, p)).readNodeIds).toContain(storyRefKey(ref('intro')));
    expect(host.uiState.page).toBe('story');
    await host.dispatch('gal.story.home');
    expect(host.uiState.confirm).toBe('return-title');
    await host.dispatch('gal.confirm.accept');
    await host.dispatch('gal.home.start');
    expect(host.uiState.confirm).toBe('new-game');
  });

  it('bypasses only disabled prompts while preserving save/load legality and return-title intent', async () => {
    const { p, profile, host } = await fixture();
    for (const key of ['saveEmpty', 'overwrite', 'load', 'newGame', 'returnTitle'] as const)
      await persistGalConfirmation(profile, p, key, false, 20);
    await host.refreshView();
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.story.save');
    await host.dispatch('gal.slot.select', '2');
    await host.dispatch('gal.slot.commit');
    expect(host.uiState.confirm).toBeNull();
    expect(host.view.manual.slots[1]?.filled).toBe(true);
    await host.dispatch('gal.slot.commit'); // filled slot: overwrite, independently disabled.
    expect(host.uiState.confirm).toBeNull();
    await host.dispatch('gal.slot.mode', 'load');
    await host.dispatch('gal.slot.select', '1');
    await host.dispatch('gal.slot.commit'); // empty load remains illegal even with prompt disabled.
    expect(host.uiState.page).toBe('slots');
    await host.dispatch('gal.slot.select', '2');
    await host.dispatch('gal.slot.commit');
    expect(host.uiState.page).toBe('story');
    expect(host.uiState.confirm).toBeNull();
    await host.dispatch('gal.story.home');
    expect(host.uiState.page).toBe('home');
    expect(host.uiState.confirm).toBeNull();
    await host.dispatch('gal.home.start'); // progress exists; newGame switch alone disables its prompt.
    expect(host.uiState.page).toBe('story');
    expect(host.uiState.confirm).toBeNull();
  });

  it('does not report a saved slot when a disabled prompt reaches a failing storage port', async () => {
    const p = pkg(), w = world(p), profile = new MemorySavePort();
    const error = new Error('manual storage offline');
    class FailingManual extends MemoryStoragePort {
      override async save(): Promise<void> { throw error; }
    }
    await persistGalConfirmation(profile, p, 'saveEmpty', false, 10);
    const host = await GalSliceHost.create(p, w, 'story', { profile, manual: new FailingManual(), savedAt: () => 1000 });
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.story.save');
    await host.dispatch('gal.slot.select', '2');
    await expect(host.dispatch('gal.slot.commit')).rejects.toBe(error);
    expect(host.uiState.confirm).toBeNull();
    expect(host.view.manual.slots[1]?.filled).toBe(false);
    expect(host.uiState.feedback).toBeNull();
  });
});

describe('GAL-ENG-06A playback host integration', () => {
  it('waits for real presentation, uses one task, and reaches the same World as manual advance', async () => {
    const clock = new PlaybackFakeClock(), automated = await fixture(clock), manual = await fixture();
    await automated.host.dispatch('gal.home.start'); await manual.host.dispatch('gal.home.start');
    await automated.host.dispatch('gal.playback.auto');
    expect(clock.tasks).toHaveLength(0);
    await automated.host.fullyPresented(automated.host.presentationToken()!);
    await manual.host.fullyPresented(manual.host.presentationToken()!);
    expect(clock.tasks.filter(task => !task.cancelled)).toHaveLength(1);
    const before = hashWithOrder(automated.w.snapshot(), automated.w.snapshotOrder());
    clock.tick(499); await settlePlayback(); expect(at(automated.w)).toBe(storyRefKey(ref('intro')));
    expect(hashWithOrder(automated.w.snapshot(), automated.w.snapshotOrder())).toBe(before);
    clock.tick(1); await settlePlayback();
    await manual.host.dispatch('narrative.advance');
    expect(at(automated.w)).toBe(storyRefKey(ref('choice')));
    expect(hashWithOrder(automated.w.snapshot(), automated.w.snapshotOrder()))
      .toBe(hashWithOrder(manual.w.snapshot(), manual.w.snapshotOrder()));
    expect(automated.host.uiState.playbackMode).toBe('off');
  });

  it('honors read-only skip, cancels on modal/manual rollback and rejects a late task', async () => {
    const clock = new PlaybackFakeClock(), { p, profile, w, host } = await fixture(clock);
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.playback.skip');
    expect(host.uiState.feedback).toContain('未读');
    await host.fullyPresented(host.presentationToken()!);
    expect((await loadGalProfile(profile, p)).readNodeIds).toContain(storyRefKey(ref('intro')));
    await host.dispatch('gal.playback.skip'); const late = clock.tasks.at(-1)!;
    await host.dispatch('gal.history.open'); expect(late.cancelled).toBe(true);
    late.fire(); await settlePlayback(); expect(at(w)).toBe(storyRefKey(ref('intro')));
    await host.dispatch('gal.history.close');
    await host.dispatch('gal.playback.skip'); clock.tick(16); await settlePlayback();
    expect(at(w)).toBe(storyRefKey(ref('choice')));
    await host.dispatch('narrative.choose', 'yes');
    await host.dispatch('gal.playback.auto'); expect(host.uiState.playbackMode).toBe('off');
    await host.wheel(-1); expect(at(w)).toBe(storyRefKey(ref('choice')));
  });

  it('shows mounted feedback as a 2200ms generic Toast and clears it on detach', async () => {
    const clock = new PlaybackFakeClock(), { host } = await fixture(clock);
    const element = document.createElement('div'); document.body.appendChild(element);
    const detach = host.attach(element);
    vi.useFakeTimers();
    try {
      await host.dispatch('gal.home.start');
      await host.dispatch('gal.playback.skip');
      expect(host.uiState.feedback).toContain('未读');
      expect(element.querySelector('#gal-slice-feedback')).toBeNull();
      expect(element.querySelector('[data-toast-stack]')?.textContent).toContain('未读');
      vi.advanceTimersByTime(2199);
      expect(element.querySelector('[data-toast-stack]')).not.toBeNull();
      vi.advanceTimersByTime(1);
      expect(element.querySelector('[data-toast-stack]')).toBeNull();
      await host.dispatch('gal.playback.skip');
      expect(element.querySelector('[data-toast-stack]')?.textContent).toContain('未读');
      vi.advanceTimersByTime(2200);
      expect(element.querySelector('[data-toast-stack]')).toBeNull();
    } finally { detach(); element.remove(); vi.useRealTimers(); }
  });

  it('uses the V2 demo 2700ms auto interval when that preference is selected', async () => {
    const clock = new PlaybackFakeClock(), { w, host } = await fixture(clock);
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.auto-delay', '2700');
    await host.dispatch('gal.settings.back');
    expect(host.view.preferences.autoDelayMs).toBe(2700);
    await host.dispatch('gal.playback.auto');
    await host.fullyPresented(host.presentationToken()!);
    clock.tick(2699); await settlePlayback();
    expect(at(w)).toBe(storyRefKey(ref('intro')));
    clock.tick(1); await settlePlayback();
    expect(at(w)).toBe(storyRefKey(ref('choice')));
  });

  it('persists only wired playback settings, cancels on settings/load, and keeps invalid values unchanged', async () => {
    const clock = new PlaybackFakeClock(), { p, profile, host } = await fixture(clock);
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.text-speed', '70');
    await host.dispatch('gal.settings.auto-delay', '750');
    await host.dispatch('gal.settings.skip-unread', 'true');
    expect((await loadGalProfile(profile, p)).preferences).toMatchObject({ textSpeedMsPerChar: 70,
      autoDelayMs: 750, skipMode: 'all' });
    await host.dispatch('gal.settings.auto-delay', 'NaN');
    expect(host.view.preferences.autoDelayMs).toBe(750);
    const textTree = JSON.stringify(host.tree);
    expect(textTree).toContain('"action":"gal.settings.text-speed"');
    expect(textTree).toContain('"action":"gal.settings.auto-delay"');
    expect(textTree).toContain('"action":"gal.settings.skip-unread"');
    await host.dispatch('gal.settings.back'); await host.dispatch('gal.home.start');
    await host.dispatch('gal.playback.skip');
    expect(clock.tasks.filter(task => !task.cancelled)).toHaveLength(1);
    await host.dispatch('gal.story.load');
    expect(clock.tasks.every(task => task.cancelled)).toBe(true);
    expect(host.uiState.playbackMode).toBe('off');
    const reopened = await GalSliceHost.create(p, world(p), 'story', { profile, manual: new MemoryStoragePort(),
      savedAt: () => 1000, playbackClock: new PlaybackFakeClock() });
    expect(reopened.view.preferences).toMatchObject({ textSpeedMsPerChar: 70, autoDelayMs: 750, skipMode: 'all' });
  });

  it('persists the read-skip switch without changing unread policy and rejects skip on read lines when off', async () => {
    const clock = new PlaybackFakeClock(), { p, profile, host } = await fixture(clock);
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.skip-unread', 'true');
    await host.dispatch('gal.settings.skip-read', 'false');
    await host.dispatch('gal.settings.skip-read', 'invalid');
    expect((await loadGalProfile(profile, p)).preferences).toMatchObject({ skipMode: 'all',
      readSkipEnabled: false });
    expect(JSON.stringify(host.tree)).toContain('"action":"gal.settings.skip-read"');
    await host.dispatch('gal.settings.back'); await host.dispatch('gal.home.start');
    await host.fullyPresented(host.presentationToken()!);
    await host.dispatch('gal.playback.skip');
    expect(host.uiState.playbackMode).toBe('off');
    expect(clock.tasks.filter(task => !task.cancelled)).toHaveLength(0);
    const reopened = await GalSliceHost.create(p, world(p), 'story', { profile,
      manual: new MemoryStoragePort(), savedAt: () => 1000, playbackClock: new PlaybackFakeClock() });
    expect(reopened.view.preferences).toMatchObject({ skipMode: 'all', readSkipEnabled: false });
  });

  it('persists wheel guards and applies dialogue opacity only to the backdrop, not story text', async () => {
    const { p, profile, w, host } = await fixture();
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.wheel-next', 'false');
    await host.dispatch('gal.settings.wheel-back', 'false');
    await host.dispatch('gal.settings.tab', 'display');
    await host.dispatch('gal.settings.dialogue-opacity', '60');
    await host.dispatch('gal.settings.dialogue-opacity', '101');
    expect((await loadGalProfile(profile, p)).preferences).toMatchObject({ wheelAdvance: false,
      wheelRollback: false, dialogueOpacity: 0.6 });
    await host.dispatch('gal.settings.back'); await host.dispatch('gal.home.start');
    const find = (id: string, node = host.tree): typeof node | undefined => node.id === id ? node :
      node.children?.map(child => find(id, child)).find(Boolean);
    expect(find('gal-story-dialogue-backdrop')?.layout?.opacity).toBe(0.6);
    expect(find('gal-story-text')?.layout).not.toHaveProperty('opacity');
    const element = document.createElement('div'); document.body.appendChild(element);
    const detach = host.attach(element);
    try {
      element.querySelector('#gal-story-dialogue')!.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: 120 }));
      await settlePlayback(); expect(at(w)).toBe(storyRefKey(ref('intro')));
      await host.dispatch('narrative.advance');
      await host.dispatch('narrative.advance');
      element.querySelector('#gal-story-dialogue')!.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: -120 }));
      await settlePlayback(); expect(at(w)).toBe(storyRefKey(ref('choice')));
    } finally { detach(); element.remove(); }
    const reopened = await GalSliceHost.create(p, world(p), 'story', { profile,
      manual: new MemoryStoragePort(), savedAt: () => 1000 });
    expect(reopened.view.preferences.dialogueOpacity).toBe(0.6);
  });

  it('resumes auto after a choice only when the preference is on and the next node is a line', async () => {
    const base = pkg();
    const p: GalPackage = { ...base, chapters: { a: { ...base.chapters.a, nodes: {
      ...base.chapters.a.nodes,
      yes: { kind: 'line', text: L('选择后的台词'), next: ref('no') },
    } } } };
    const clock = new PlaybackFakeClock(), profile = new MemorySavePort(), w = world(p);
    const host = await GalSliceHost.create(p, w, 'story', { profile, manual: new MemoryStoragePort(),
      savedAt: () => 1000, playbackClock: clock });
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.auto-continue', 'true');
    await host.dispatch('gal.settings.back'); await host.dispatch('gal.home.start');
    await host.fullyPresented(host.presentationToken()!);
    await host.dispatch('gal.playback.auto');
    clock.tick(500); await settlePlayback();
    expect(at(w)).toBe(storyRefKey(ref('choice')));
    expect(host.uiState.playbackMode).toBe('off');
    await host.dispatch('narrative.choose', 'yes');
    expect(at(w)).toBe(storyRefKey(ref('yes')));
    expect(host.uiState.playbackMode).toBe('auto');
    await host.fullyPresented(host.presentationToken()!);
    expect(clock.tasks.some(task => !task.cancelled)).toBe(true);
  });

  it('does not resume auto for a disabled preference, invalid choice, non-line target, or manual arrival', async () => {
    const base = pkg();
    const p: GalPackage = { ...base, chapters: { a: { ...base.chapters.a, nodes: {
      ...base.chapters.a.nodes,
      yes: { kind: 'line', text: L('选择后的台词'), next: ref('no') },
    } } } };
    for (const scenario of ['disabled', 'invalid-choice', 'ending', 'manual-arrival'] as const) {
      const clock = new PlaybackFakeClock(), w = world(p);
      const host = await GalSliceHost.create(p, w, 'story', { profile: new MemorySavePort(),
        manual: new MemoryStoragePort(), savedAt: () => 1000, playbackClock: clock });
      if (scenario !== 'disabled') {
        await host.dispatch('gal.settings.open');
        await host.dispatch('gal.settings.auto-continue', 'true');
        await host.dispatch('gal.settings.back');
      }
      await host.dispatch('gal.home.start');
      if (scenario === 'manual-arrival') await host.dispatch('narrative.advance');
      else {
        await host.fullyPresented(host.presentationToken()!);
        await host.dispatch('gal.playback.auto');
        clock.tick(500); await settlePlayback();
      }
      expect(at(w)).toBe(storyRefKey(ref('choice')));
      expect(host.uiState.playbackMode).toBe('off');
      if (scenario === 'invalid-choice') {
        await host.dispatch('narrative.choose', 'missing');
        expect(at(w)).toBe(storyRefKey(ref('choice')));
      } else await host.dispatch('narrative.choose', scenario === 'ending' ? 'no' : 'yes');
      expect(host.uiState.playbackMode).toBe('off');
      expect(clock.tasks.every(task => task.cancelled)).toBe(true);
      if (scenario === 'ending') expect(at(w)).toBe(storyRefKey(ref('no')));
      if (scenario === 'disabled' || scenario === 'manual-arrival')
        expect(at(w)).toBe(storyRefKey(ref('yes')));
    }
  });

  it('allows explicit all-skip from unread, but manual wheel takes priority over a late task', async () => {
    const clock = new PlaybackFakeClock(), { p, profile, w, host } = await fixture(clock);
    const current = await loadGalProfile(profile, p);
    await saveGalProfile(profile, p, { ...current,
      preferences: { ...current.preferences, skipMode: 'all' } }, 1000);
    await host.refreshView();
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.playback.skip');
    expect(validateLayoutNode(host.tree)).toEqual([]);
    const late = clock.tasks.at(-1)!;
    expect(late.cancelled).toBe(false);
    await host.wheel(1);
    expect(late.cancelled).toBe(true);
    expect(at(w)).toBe(storyRefKey(ref('choice')));
    late.fire(); await settlePlayback();
    expect(at(w)).toBe(storyRefKey(ref('choice')));
    expect(host.uiState.playbackMode).toBe('off');
  });

  it('pauses on focus loss, rejects old work after return and validates wired settings layout', async () => {
    const clock = new PlaybackFakeClock(), { w, host } = await fixture(clock);
    const element = document.createElement('div'); document.body.appendChild(element);
    const detach = host.attach(element);
    try {
      await host.dispatch('gal.home.start');
      for (let attempt = 0; attempt < 20 && !host.presentationToken(); attempt++) await Promise.resolve();
      await host.fullyPresented(host.presentationToken()!);
      await host.dispatch('gal.playback.auto');
      const late = clock.tasks.at(-1)!;
      window.dispatchEvent(new Event('blur'));
      expect(late.cancelled).toBe(true);
      expect(host.uiState.playbackMode).toBe('off');
      late.fire(); await settlePlayback();
      expect(at(w)).toBe(storyRefKey(ref('intro')));
      await host.dispatch('gal.settings.open');
      expect(validateLayoutNode(host.tree)).toEqual([]);
      const settings = JSON.stringify(host.tree);
      expect(settings).toContain('"action":"gal.settings.auto-delay"');
      expect(settings).toContain('"action":"gal.settings.skip-unread"');
    } finally { detach(); element.remove(); }
  });

  it('cancels a pending auto task across a real slot load and preserves the loaded World hash', async () => {
    const clock = new PlaybackFakeClock(), { w, host } = await fixture(clock);
    await host.dispatch('gal.home.start');
    await host.fullyPresented(host.presentationToken()!);
    await host.dispatch('narrative.advance');
    await host.dispatch('gal.story.save');
    await host.dispatch('gal.slot.select', '2');
    await host.dispatch('gal.slot.commit');
    await host.dispatch('gal.confirm.accept');
    await host.dispatch('gal.slot.back');
    const saved = hashWithOrder(w.snapshot(), w.snapshotOrder());
    await host.wheel(-1);
    expect(at(w)).toBe(storyRefKey(ref('intro')));
    await host.fullyPresented(host.presentationToken()!);
    await host.dispatch('gal.playback.auto');
    const late = clock.tasks.at(-1)!;
    await host.dispatch('gal.story.load');
    expect(late.cancelled).toBe(true);
    await host.dispatch('gal.slot.select', '2');
    await host.dispatch('gal.slot.commit');
    await host.dispatch('gal.confirm.accept');
    expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(saved);
    late.fire(); await settlePlayback();
    expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(saved);
    expect(host.uiState.playbackMode).toBe('off');
  });
});

describe('GAL-UI-03B history and CG structural slice', () => {
  it('reads bounded current history only; opening, scrolling and closing never mutate World or Profile', async () => {
    const { p, w, profile, host } = await fixture();
    await host.dispatch('gal.home.start');
    expect(host.view.history.rows).toHaveLength(1);
    await host.dispatch('narrative.advance');
    await host.dispatch('narrative.choose', 'yes');
    expect(host.view.history.rows.map(row => row.text)).toContain('好结局');
    await host.dispatch('narrative.back');
    await host.dispatch('narrative.choose', 'no');
    expect(host.view.history.rows.map(row => row.text)).toContain('坏结局');
    expect(host.view.history.rows.map(row => row.text)).not.toContain('好结局');
    await host.fullyPresented(host.presentationToken()!);
    const snapshot = JSON.stringify(w.snapshot());
    const profileBefore = JSON.stringify(await loadGalProfile(profile, p));
    const element = document.createElement('div'); document.body.appendChild(element);
    const detach = host.attach(element);
    try {
      await host.dispatch('gal.history.open');
      expect(host.uiState.historyOpen).toBe(true);
      expect(validateLayoutNode(host.tree)).toEqual([]);
      const scroll = element.querySelector('#gal-history-scroll');
      expect(scroll).not.toBeNull();
      scroll!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }));
      await host.dispatch('narrative.back');
      expect(at(w)).toBe(storyRefKey(ref('no')));
      await host.dispatch('gal.history.close');
      expect(host.uiState.historyOpen).toBe(false);
      expect(host.uiState.page).toBe('story');
      expect(JSON.stringify(w.snapshot())).toBe(snapshot);
      expect(JSON.stringify(await loadGalProfile(profile, p))).toBe(profileBefore);
    } finally { detach(); element.remove(); }
  });

  it('keeps locked CG key secret, refreshes Profile, opens only unlocked CG and preserves gallery page', async () => {
    const { p, profile, host } = await fixture();
    await host.dispatch('gal.home.gallery');
    expect(host.uiState.page).toBe('gallery');
    await host.dispatch('gal.gallery.tab', 'cg');
    expect(host.view.gallery.cg).toHaveLength(7);
    expect(host.view.gallery.cg[0]).toMatchObject({ id: 'cg-1', title: '未解锁', unlocked: false, preview: 'locked' });
    expect(JSON.stringify(host.tree)).not.toContain('private/cg-1');
    await host.dispatch('gal.gallery.open-cg', 'cg-1');
    expect(host.uiState.expandedCgId).toBeNull();
    const current = await loadGalProfile(profile, p);
    await saveGalProfile(profile, p, unlock(current, p, 'cg', 'cg-7'), 1);
    await host.refreshView();
    expect(host.view.gallery.cg[6]).toMatchObject({ id: 'cg-7', title: '第 7 张月影', unlocked: true });
    await host.dispatch('gal.gallery.page', '2');
    expect(host.uiState.galleryPage).toBe(2);
    await host.dispatch('gal.gallery.open-cg', 'cg-7');
    expect(host.uiState.expandedCgId).toBe('cg-7');
    expect(validateLayoutNode(host.tree)).toEqual([]);
    await host.dispatch('gal.gallery.close-cg');
    expect(host.uiState.galleryPage).toBe(2);
    expect(host.uiState.expandedCgId).toBeNull();
    expect((await loadGalProfile(profile, p)).unlockedCgIds).toEqual(['cg-7']);
    await host.dispatch('gal.gallery.back');
    expect(host.uiState.page).toBe('home');
  });
});

describe('GAL-ENG-06C isolated memory replay', () => {
  it('keeps active world, slots and global Profile byte-identical across both branches, rollback and completion', async () => {
    const { p, w, profile, manual, host } = await fixture();
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.story.save');
    await host.dispatch('gal.slot.select', '2');
    await host.dispatch('gal.slot.commit');
    await host.dispatch('gal.confirm.accept');
    await host.dispatch('gal.slot.back');
    const stalePresentation = host.presentationToken();
    expect(stalePresentation).toBeDefined();
    const current = await loadGalProfile(profile, p);
    await saveGalProfile(profile, p, unlock(current, p, 'memory', 'memory-1'), 2);
    await host.refreshView();
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.nav', 'gallery');
    expect(host.uiState.page).toBe('gallery');
    const beforeWorld = hashWithOrder(w.snapshot(), w.snapshotOrder());
    const beforeSlots = JSON.stringify(await manual.list());
    const beforeProfile = JSON.stringify(await loadGalProfile(profile, p));
    const element = document.createElement('div'); document.body.appendChild(element);
    const detach = host.attach(element);
    try {
      const play = element.querySelector<HTMLElement>('#gal-memory-play-memory-1');
      expect(play).not.toBeNull(); play!.focus();
      await host.dispatch('gal.gallery.play-memory', 'memory-1');
      expect(host.uiState).toMatchObject({ page: 'story', replayMemoryId: 'memory-1' });
      expect(validateLayoutNode(host.tree)).toEqual([]);
      expect(host.view.story.refKey).toBe(storyRefKey(ref('intro')));
      expect(await host.fullyPresented(stalePresentation!)).toEqual({ status: 'ignored', reason: 'stale' });
      expect(element.querySelector('#gal-story-save')).toBeNull();
      await host.dispatch('narrative.advance');
      await host.dispatch('narrative.choose', 'yes');
      expect(host.view.story.refKey).toBe(storyRefKey(ref('yes')));
      await host.dispatch('narrative.back');
      expect(host.view.story.refKey).toBe(storyRefKey(ref('choice')));
      await host.dispatch('narrative.choose', 'no');
      expect(host.view.story.refKey).toBe(storyRefKey(ref('no')));
      expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(beforeWorld);
      expect(JSON.stringify(await manual.list())).toBe(beforeSlots);
      expect(JSON.stringify(await loadGalProfile(profile, p))).toBe(beforeProfile);
      await host.dispatch('narrative.advance');
      expect(host.uiState.page).toBe('gallery');
      expect(host.uiState.replayMemoryId).toBeUndefined();
      expect(document.activeElement?.id).toBe(play!.id);
      expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(beforeWorld);
      expect(JSON.stringify(await manual.list())).toBe(beforeSlots);
      expect(JSON.stringify(await loadGalProfile(profile, p))).toBe(beforeProfile);
      expect(host.uiState.galleryTab).toBe('memories');
      await host.dispatch('gal.gallery.back');
      expect(host.uiState.page).toBe('story');
      expect(at(w)).toBe(storyRefKey(ref('intro')));
    } finally { detach(); element.remove(); }
  });

  it('rejects locked, bad and cross-package entries and cleans duplicate/exceptional sessions', async () => {
    const { p, w, profile, host } = await fixture();
    await host.dispatch('gal.home.gallery');
    const baseline = hashWithOrder(w.snapshot(), w.snapshotOrder());
    expect(GalReplaySession.open(p, await loadGalProfile(profile, p), 'memory-1', w))
      .toMatchObject({ status: 'rejected', reason: 'locked' });
    await host.dispatch('gal.gallery.play-memory', 'memory-1');
    expect(host.uiState.page).toBe('gallery');
    const current = await loadGalProfile(profile, p);
    await saveGalProfile(profile, p, unlock(current, p, 'memory', 'memory-1'), 2);
    await host.refreshView();
    const foreign = { ...p, id: 'other-package' };
    expect(GalReplaySession.open(foreign, await loadGalProfile(profile, p), 'memory-1', w))
      .toMatchObject({ status: 'rejected', reason: 'package-mismatch' });
    const broken = { ...p, chapters: {} };
    expect(GalReplaySession.open(broken, await loadGalProfile(profile, p), 'memory-1', w))
      .toMatchObject({ status: 'rejected', reason: 'bad-entry' });
    await host.dispatch('gal.gallery.play-memory', 'memory-1');
    await host.dispatch('gal.gallery.play-memory', 'memory-1');
    expect(host.uiState.feedback).toContain('不能重复开启');
    await host.dispatch('gal.story.save');
    expect(host.uiState.page).toBe('story');
    await host.dispatch('narrative.back');
    expect(host.uiState.feedback).toContain('回想起点');
    await host.dispatch('gal.replay.exit');
    expect(host.uiState.page).toBe('gallery');
    expect(host.uiState.replayMemoryId).toBeUndefined();
    expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(baseline);
    await host.dispatch('gal.gallery.play-memory', 'memory-1');
    await host.dispatch('narrative.advance');
    await host.dispatch('narrative.choose', 'yes');
    await host.dispatch('narrative.back');
    await host.dispatch('gal.replay.exit');
    expect(host.uiState.page).toBe('gallery');
    expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(baseline);
  });

  it('closes a replay on a missing deterministic check resource without touching the active session', async () => {
    const original = pkg();
    const chapter = original.chapters.a!;
    const changed: GalPackage = { ...original, chapters: { a: { ...chapter, nodes: {
      ...chapter.nodes,
      intro: { kind: 'check', check: { attribute: 'missing-attribute', difficulty: 10 },
        pass: { next: ref('yes') }, fail: { next: ref('no') } },
    } } } };
    const w = world(changed), profile = new MemorySavePort(), manual = new MemoryStoragePort();
    const host = await GalSliceHost.create(changed, w, 'story', { profile, manual, savedAt: () => 1000 });
    const current = await loadGalProfile(profile, changed);
    await saveGalProfile(profile, changed, unlock(current, changed, 'memory', 'memory-1'), 2);
    await host.refreshView();
    await host.dispatch('gal.home.gallery');
    const before = hashWithOrder(w.snapshot(), w.snapshotOrder());
    const element = document.createElement('div'); document.body.appendChild(element);
    const detach = host.attach(element);
    try {
      element.querySelector<HTMLElement>('#gal-memory-play-memory-1')!.focus();
      await host.dispatch('gal.gallery.play-memory', 'memory-1');
      expect(host.uiState.page).toBe('story');
      await host.dispatch('narrative.advance');
      expect(host.uiState.page).toBe('gallery');
      expect(host.uiState.feedback).toContain('missing-seed');
      expect(document.activeElement?.id).toBe('gal-memory-play-memory-1');
      expect(hashWithOrder(w.snapshot(), w.snapshotOrder())).toBe(before);
      await host.dispatch('gal.gallery.play-memory', 'memory-1');
      expect(host.uiState.page).toBe('story');
      await host.dispatch('gal.replay.exit');
    } finally { detach(); element.remove(); }
  });

  it('acknowledges milestones only inside the private World, never through the Profile port', async () => {
    const { p, w, profile } = await fixture();
    const current = await loadGalProfile(profile, p);
    await saveGalProfile(profile, p, unlock(current, p, 'memory', 'memory-1'), 2);
    const before = JSON.stringify(await loadGalProfile(profile, p));
    const opened = GalReplaySession.open(p, await loadGalProfile(profile, p), 'memory-1', w);
    expect(opened.status).toBe('opened');
    if (opened.status !== 'opened') return;
    const replay = opened.session;
    expect(readNarrativeEvents(replay.world, replay.entity)).toEqual([]);
    expect(replay.step('narrative.advance')).toMatchObject({ status: 'applied' });
    expect(replay.step('narrative.choose', 'yes')).toMatchObject({ status: 'applied' });
    expect(readNarrativeEvents(replay.world, replay.entity)).toEqual([]);
    expect(JSON.stringify(await loadGalProfile(profile, p))).toBe(before);
    replay.close();
  });

  it('rejects a second open racing on an in-flight active Profile flush', async () => {
    const p = pkg(), w = world(p);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    class DelayedProfile extends MemorySavePort {
      hold = false;
      override async read(slot: string) {
        if (this.hold) await gate;
        return super.read(slot);
      }
    }
    const profile = new DelayedProfile(), manual = new MemoryStoragePort();
    const host = await GalSliceHost.create(p, w, 'story', { profile, manual, savedAt: () => 1000 });
    const unlocked = unlock(unlock(await loadGalProfile(profile, p), p, 'memory', 'memory-1'), p, 'memory', 'memory-2');
    await saveGalProfile(profile, p, unlocked, 2);
    await host.refreshView();
    await host.dispatch('gal.home.gallery');
    expect(readNarrativeEvents(w, 'story').length).toBeGreaterThan(0);
    profile.hold = true;
    const draining = host.flush();
    const first = host.dispatch('gal.gallery.play-memory', 'memory-1');
    const second = host.dispatch('gal.gallery.play-memory', 'memory-2');
    release();
    await Promise.all([draining, first, second]);
    expect(host.uiState.replayMemoryId).toBe('memory-1');
    expect(host.uiState.feedback).toContain('不能重复开启');
    await host.dispatch('gal.replay.exit');
    expect(host.uiState.page).toBe('gallery');
  });
});

describe('GAL-UI-04A partial settings structure and six real confirmations', () => {
  it('navigates four tabs and returns to the exact source without writing World or Profile', async () => {
    const { p, w, profile, host } = await fixture();
    const beforeWorld = JSON.stringify(w.snapshot());
    const beforeProfile = JSON.stringify(await loadGalProfile(profile, p));
    await host.dispatch('gal.settings.open');
    expect(host.uiState.page).toBe('settings');
    for (const tab of ['text', 'audio', 'display', 'confirm'] as const) {
      await host.dispatch('gal.settings.tab', tab);
      expect(host.uiState.settingsTab).toBe(tab);
      expect(validateLayoutNode(host.tree)).toEqual([]);
    }
    expect(JSON.stringify(w.snapshot())).toBe(beforeWorld);
    expect(JSON.stringify(await loadGalProfile(profile, p))).toBe(beforeProfile);
    await host.dispatch('gal.settings.back');
    expect(host.uiState.page).toBe('home');
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.story.save');
    await host.dispatch('gal.slot.page', '2');
    await host.dispatch('gal.slot.select', '13');
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.back');
    expect(host.uiState).toMatchObject({ page: 'slots', selectedSlot: 13 });
    expect(host.view.manual.page).toBe(2);
    await host.dispatch('gal.slot.back');
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.back');
    expect(host.uiState.page).toBe('story');
    const gallery = (await fixture()).host;
    await gallery.dispatch('gal.home.gallery');
    await gallery.dispatch('gal.gallery.tab', 'cg');
    await gallery.dispatch('gal.gallery.page', '2');
    await gallery.dispatch('gal.settings.open');
    await gallery.dispatch('gal.settings.back');
    expect(gallery.uiState).toMatchObject({ page: 'gallery', galleryTab: 'cg', galleryPage: 2 });
  });

  it('persists six independent Toggle actions and keeps inert controls actually disabled', async () => {
    const { p, profile, host } = await fixture();
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.tab', 'confirm');
    const keys = ['saveEmpty', 'overwrite', 'load', 'newGame', 'returnTitle', 'exitGame'] as const;
    for (const key of keys) {
      await host.dispatch(`gal.settings.confirm.${key}`, 'false');
      expect(host.view.preferences.confirmations[key]).toBe(false);
      expect((await loadGalProfile(profile, p)).preferences.confirmations[key]).toBe(false);
    }
    expect(Object.values(host.view.preferences.confirmations)).toEqual(Array(6).fill(false));
    await host.dispatch('gal.settings.confirm.saveEmpty', 'true');
    expect(host.view.preferences.confirmations).toMatchObject({ saveEmpty: true, overwrite: false });
    await host.dispatch('gal.settings.tab', 'text');
    const tree = JSON.stringify(host.tree);
    expect(tree).toContain('"id":"gal-setting-speed-control"');
    expect(tree).toContain('"id":"gal-setting-read-skip-control"');
    expect(tree).toContain('"disabled":true');
    expect(tree).toContain('恢复默认（待完整设置接入）');
    expect(tree).toContain('"id":"gal-settings-reset"');
    const beforeReset = JSON.stringify(await loadGalProfile(profile, p));
    await host.dispatch('gal.settings.reset'); // Disabled UI action must not write when invoked directly.
    expect(JSON.stringify(await loadGalProfile(profile, p))).toBe(beforeReset);
    await host.dispatch('gal.settings.confirm.load', 'true'); // hidden-tab action must not write.
    expect(host.view.preferences.confirmations.load).toBe(false);
    const reopened = await GalSliceHost.create(p, world(p), 'story',
      { profile, manual: new MemoryStoragePort(), savedAt: () => 1001 });
    expect(reopened.view.preferences.confirmations).toMatchObject({
      saveEmpty: true, overwrite: false, load: false, newGame: false, returnTitle: false, exitGame: false,
    });
  });

  it('does not bypass return-title policy through settings navigation from a story source', async () => {
    const { p, profile, host } = await fixture();
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.nav', 'home');
    expect(host.uiState).toMatchObject({ page: 'settings', confirm: 'return-title' });
    await host.dispatch('gal.confirm.cancel');
    expect(host.uiState.page).toBe('settings');
    await persistGalConfirmation(profile, p, 'returnTitle', false, 2);
    await host.refreshView();
    await host.dispatch('gal.settings.nav', 'home');
    expect(host.uiState).toMatchObject({ page: 'home', confirm: null });
  });

  it('routes V2 slot navigation through the source page and return-title policy', async () => {
    const { p, profile, host } = await fixture();
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.story.load');
    expect(host.uiState.page).toBe('slots');
    await host.dispatch('gal.slot.nav', 'gallery');
    expect(host.uiState.page).toBe('gallery');
    await host.dispatch('gal.gallery.back');
    expect(host.uiState.page).toBe('story');
    await host.dispatch('gal.story.load');
    await host.dispatch('gal.slot.nav', 'home');
    expect(host.uiState).toMatchObject({ page: 'slots', confirm: 'return-title' });
    await host.dispatch('gal.confirm.cancel');
    await host.dispatch('gal.slot.nav', 'story');
    expect(host.uiState.page).toBe('story');
    await persistGalConfirmation(profile, p, 'returnTitle', false, 2);
    await host.refreshView();
    await host.dispatch('gal.story.load');
    await host.dispatch('gal.slot.nav', 'home');
    expect(host.uiState).toMatchObject({ page: 'home', confirm: null });
    await host.dispatch('gal.slot.nav', 'story');
    expect(host.uiState.page).toBe('home');
  });

  it('routes V2 gallery top navigation without bypassing story availability or return-title policy', async () => {
    const { p, profile, host } = await fixture();
    await host.dispatch('gal.home.gallery');
    expect(host.uiState.page).toBe('gallery');
    await host.dispatch('gal.gallery.nav', 'story');
    expect(host.uiState.page).toBe('gallery');
    await host.dispatch('gal.gallery.nav', 'settings');
    expect(host.uiState.page).toBe('settings');
    await host.dispatch('gal.settings.back');
    expect(host.uiState.page).toBe('gallery');
    await host.dispatch('gal.gallery.nav', 'slots');
    expect(host.uiState).toMatchObject({ page: 'slots', slotMode: 'save' });
    await host.dispatch('gal.slot.back');
    expect(host.uiState.page).toBe('home');
    await host.dispatch('gal.home.start');
    await host.dispatch('gal.story.load');
    await host.dispatch('gal.slot.nav', 'gallery');
    await host.dispatch('gal.gallery.nav', 'home');
    expect(host.uiState).toMatchObject({ page: 'gallery', confirm: 'return-title' });
    await host.dispatch('gal.confirm.cancel');
    await host.dispatch('gal.gallery.nav', 'story');
    expect(host.uiState.page).toBe('story');
    await host.dispatch('gal.story.load');
    await host.dispatch('gal.slot.nav', 'gallery');
    await persistGalConfirmation(profile, p, 'returnTitle', false, 2);
    await host.refreshView();
    await host.dispatch('gal.gallery.nav', 'home');
    expect(host.uiState).toMatchObject({ page: 'home', confirm: null });
    await host.dispatch('gal.gallery.nav', 'slots');
    expect(host.uiState.page).toBe('home');
  });

  it('keeps old checked state on persistence failure and never accepts invalid host timestamps', async () => {
    const p = pkg(), w = world(p), profile = new MemorySavePort(), manual = new MemoryStoragePort();
    let fail = true;
    class FailingProfile extends MemorySavePort {
      override async write(slot: string, envelope: Parameters<MemorySavePort['write']>[1]): Promise<void> {
        if (fail) throw new Error('offline');
        await super.write(slot, envelope);
      }
    }
    const failing = new FailingProfile();
    const host = await GalSliceHost.create(p, w, 'story', { profile: failing, manual, savedAt: () => 1000 });
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.tab', 'confirm');
    await host.dispatch('gal.settings.confirm.load', 'false');
    expect(host.view.preferences.confirmations.load).toBe(true);
    expect(host.uiState.feedback).toContain('设置保存失败');
    expect((await loadGalProfile(failing, p)).preferences.confirmations.load).toBe(true);
    fail = false;
    await host.dispatch('gal.settings.confirm.load', 'false');
    expect(host.view.preferences.confirmations.load).toBe(false);
    const invalid = await GalSliceHost.create(p, w, 'story', { profile, manual, savedAt: () => Number.NaN });
    await invalid.dispatch('gal.settings.open');
    await invalid.dispatch('gal.settings.tab', 'confirm');
    await invalid.dispatch('gal.settings.confirm.load', 'false');
    expect(invalid.view.preferences.confirmations.load).toBe(true);
    expect(invalid.uiState.feedback).toContain('savedAt');
  });
});

describe('GAL-UI-04C approved settings geometry', () => {
  it('keeps top navigation outside the system frame and preserves all four page anchors', async () => {
    const { host } = await fixture();
    await host.dispatch('gal.settings.open');
    for (const tab of ['text', 'audio', 'display', 'confirm'] as const) {
      await host.dispatch('gal.settings.tab', tab);
      const tree = host.tree;
      expect(validateLayoutNode(tree)).toEqual([]);
      const bar = tree.children?.find(node => node.id === 'gal-settings-system-bar');
      const shell = tree.children?.find(node => node.id === 'gal-settings-shell');
      expect(bar?.layout).toMatchObject({ x: 31, y: 14, width: 1378, height: 42 });
      expect(bar?.children?.find(node => node.id === 'gal-settings-nav')?.layout).toMatchObject({
        width: 329, height: 39,
      });
      expect(shell?.layout).toMatchObject({ x: 18, y: 61, height: 692, padding: 65 });
      expect(shell?.children?.map(node => node.id)).not.toContain('gal-settings-nav');
      expect(shell?.children?.find(node => node.id === 'gal-settings-heading')?.layout?.height).toBe(61);
      expect(shell?.children?.find(node => node.id === 'gal-settings-tabs')?.layout?.height).toBe(44);
      expect(shell?.children?.find(node => node.id === 'gal-settings-footer')?.layout?.height).toBe(51);
      expect(shell?.children?.find(node => node.id === 'gal-settings-grid')?.children).toHaveLength(2);
    }
  });
});
