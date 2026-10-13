// Browser-only S4 acceptance fixture: real GAL World + in-memory ports + mountUI.
import { World } from '@engine/core/world.js';
import type { InputQueue } from '@engine/protocol/components.js';
import type { GalPackage } from '@engine/protocol/galgame.js';
import { createStoryRuntime, narrativeDirectorCapability, storyRefKey,
  type StoryRuntime } from '@skills/tier3/narrative-director.js';
import { hashWithOrder } from '@net/determinism.js';
import { MemorySavePort } from '../save/memory-save-port.js';
import { MemoryStoragePort } from '../storage/memory-storage.js';
import { loadGalProfile, saveGalProfile, unlock, type GalConfirmationKey } from '../gal-profile/gal-profile.js';
import { GalSliceHost } from './gal-ui-slice-host.js';

const L = (value: string) => ({ 'zh-CN': value });
const ref = (nodeId: string) => ({ chapterId: 'a', nodeId });
const pkg: GalPackage = {
  schemaVersion: 1, id: 'gal-ui-browser-03a', title: L('月影书简'), defaultLocale: 'zh-CN', locales: ['zh-CN'],
  entry: ref('intro'), ui: { template: 'gal-template' }, characters: {}, scenes: {},
  preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only',
    bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
  media: { backgrounds: {}, cg: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [
    `cg-${index + 1}`, { image: `private/cg-${index + 1}`, title: L(`第 ${index + 1} 张月影`), unlock: { kind: 'explicit' as const } },
  ])), audio: { bgm: {}, sfx: {}, voice: {} }, video: {} },
  gallery: { memories: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [
    `memory-${index + 1}`, { title: L(`回想 ${index + 1}`), entry: ref('intro'), unlock: { kind: 'explicit' as const } },
  ])), music: {} }, endings: { yes: { title: L('初见') }, no: { title: L('别离') } },
  chapters: { a: { id: 'a', title: L('序章'), start: 'intro', nodes: {
    intro: { kind: 'line', text: L('月色静静落下。'), next: ref('choice') },
    choice: { kind: 'choice', prompt: L('打开哪一封信？'), options: [
      { id: 'yes', text: L('第一封信'), next: ref('yes') },
      { id: 'no', text: L('第二封信'), next: ref('no') },
    ] },
    yes: { kind: 'ending', ending: 'yes', text: L('初见') },
    no: { kind: 'ending', ending: 'no', text: L('别离') },
  } } },
};

async function mount(): Promise<void> {
  const world = new World();
  for (const system of narrativeDirectorCapability.systems) world.addSystem(system);
  world.createEntity('story'); world.addComponent('story', { type: 'NarrativePackage', package: pkg });
  world.addComponent('story', createStoryRuntime(pkg));
  world.createEntity('input'); world.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
  world.tick();
  let failProfileWrite = false;
  class AuditedProfilePort extends MemorySavePort {
    override async write(slot: string, envelope: Parameters<MemorySavePort['write']>[1]): Promise<void> {
      if (failProfileWrite) throw new Error('GAL 04A simulated Profile write failure');
      await super.write(slot, envelope);
    }
  }
  const profilePort = new AuditedProfilePort(), manualPort = new MemoryStoragePort();
  const host = await GalSliceHost.create(pkg, world, 'story', { profile: profilePort, manual: manualPort,
    savedAt: () => 1000, playbackClock: {
      now: () => performance.now(),
      schedule: (delayMs, fire) => { const id = window.setTimeout(fire, delayMs); return () => window.clearTimeout(id); },
    } });
  host.attach(document.getElementById('root')!);
  Object.assign(window, { __galAudit: {
    ref: () => storyRefKey(world.peek<StoryRuntime>('story', 'StoryRuntime')!.current),
    activeHash: () => hashWithOrder(world.snapshot(), world.snapshotOrder()),
    replayMemoryId: () => host.uiState.replayMemoryId ?? null,
    visibleRef: () => host.view.story.refKey,
    profileJson: async () => JSON.stringify(await loadGalProfile(profilePort, pkg)),
    slotsJson: async () => JSON.stringify(await manualPort.list()),
    page: () => host.uiState.page,
    playbackMode: () => host.uiState.playbackMode,
    settingsTab: () => host.uiState.settingsTab,
    confirmation: (key: GalConfirmationKey) => host.view.preferences.confirmations[key],
    failProfileWrite: (value: boolean) => { failProfileWrite = value; },
    confirm: () => host.uiState.confirm,
    slot2: () => host.view.manual.slots[1]?.filled ?? false,
    historyCount: () => host.view.history.rows.length,
    unlockCg: async (id: string) => {
      const current = await loadGalProfile(profilePort, pkg);
      await saveGalProfile(profilePort, pkg, unlock(current, pkg, 'cg', id), world.getVersion());
      await host.refreshView();
    },
    unlockMemory: async (id: string) => {
      const current = await loadGalProfile(profilePort, pkg);
      await saveGalProfile(profilePort, pkg, unlock(current, pkg, 'memory', id), world.getVersion());
      await host.refreshView();
    },
    readIntro: async () => (await loadGalProfile(profilePort, pkg)).readNodeIds.includes(storyRefKey(ref('intro'))),
  } });
}
void mount();
