// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { GalPackage } from '@engine/protocol/galgame.js';
import type { InputQueue } from '@engine/protocol/components.js';
import { World } from '@engine/core/world.js';
import { hashWithOrder } from '@net/determinism.js';
import { createStoryRuntime, narrativeDirectorCapability, readNarrativeEvents, storyRefKey,
  type StoryRuntime } from '@skills/tier3/narrative-director.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import { MemorySavePort } from '../save/memory-save-port.js';
import { MemoryStoragePort } from '../storage/memory-storage.js';
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
      await until(storyRefKey(ref('choice')));
      expect(element.querySelector('#gal-story-dialogue')?.hasAttribute('data-action')).toBe(false);
      (element.querySelector('[data-action="narrative.choose"][data-arg="yes"]') as HTMLElement).click();
      await until(storyRefKey(ref('yes')));
      element.querySelector('#gal-story-dialogue')!.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: -120,
      }));
      await until(storyRefKey(ref('choice')));
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
      wheel(120); await until(storyRefKey(ref('choice')));
      await host.dispatch('narrative.choose', 'yes');
      expect(at(w)).toBe(storyRefKey(ref('yes')));
      wheel(-120); await until(storyRefKey(ref('choice')));
      await host.dispatch('narrative.choose', 'no');
      expect(at(w)).toBe(storyRefKey(ref('no')));
      wheel(-120); await until(storyRefKey(ref('choice')));
      wheel(-120); await until(storyRefKey(ref('intro')));
      wheel(120); await until(storyRefKey(ref('choice')));
      await host.dispatch('gal.story.home');
      expect(host.uiState.confirm).toBe('return-title');
      expect(validateLayoutNode(host.tree)).toEqual([]);
      await host.dispatch('gal.confirm.accept');
      element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120 }));
      expect(at(w)).toBe(storyRefKey(ref('choice')));
    } finally { detach(); element.remove(); }
  });

  it('marks the fully visible synchronous Label read after a real mount, not before presentation', async () => {
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
      for (let attempt = 0; attempt < 10; attempt++) {
        if ((await loadGalProfile(profile, p)).readNodeIds.includes(storyRefKey(ref('intro')))) break;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      expect((await loadGalProfile(profile, p)).readNodeIds).toContain(storyRefKey(ref('intro')));
      expect(element.querySelector('#gal-story-text')?.textContent).toContain('月色静静落下');
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

  it('persists only wired playback settings, cancels on settings/load, and keeps invalid values unchanged', async () => {
    const clock = new PlaybackFakeClock(), { p, profile, host } = await fixture(clock);
    await host.dispatch('gal.settings.open');
    await host.dispatch('gal.settings.auto-delay', '750');
    await host.dispatch('gal.settings.skip-unread', 'true');
    expect((await loadGalProfile(profile, p)).preferences).toMatchObject({ autoDelayMs: 750, skipMode: 'all' });
    await host.dispatch('gal.settings.auto-delay', 'NaN');
    expect(host.view.preferences.autoDelayMs).toBe(750);
    const textTree = JSON.stringify(host.tree);
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
    expect(reopened.view.preferences).toMatchObject({ autoDelayMs: 750, skipMode: 'all' });
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
    expect(tree).toContain('恢复默认（待接入）');
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
