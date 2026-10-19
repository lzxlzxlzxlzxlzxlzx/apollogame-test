// Browser-only integration fixture: real LayoutNode host, browser encoder, ephemeral ports.
import { World } from '@engine/core/world.js';
import type { GalPackage } from '@engine/protocol/galgame.js';
import { createStoryRuntime, narrativeDirectorCapability } from '@skills/tier3/narrative-director.js';
import { MemorySavePort } from '../save/memory-save-port.js';
import { MemoryStoragePort } from '../storage/memory-storage.js';
import { GalManualSaveController } from '../gal-save/gal-manual-save.js';
import { BrowserGalPreviewCapturePort } from '../gal-save/gal-browser-preview-capture.js';
import { GalSavePreviewController, MemoryGalSavePreviewPort } from '../gal-save/gal-save-preview.js';
import { GalSliceHost } from './gal-ui-slice-host.js';

const backgroundKey = 'tex/gal-demo-backdrop';
const portraitKey = 'tex/gal-demo-portrait';
const L = (value: string) => ({ 'zh-CN': value });
const pkg: GalPackage = {
  schemaVersion: 1, id: 'gal-preview-browser-audit', title: L('月影书简'),
  defaultLocale: 'zh-CN', locales: ['zh-CN'], entry: { chapterId: 'a', nodeId: 'intro' },
  ui: { template: 'gal-template' },
  characters: { mio: { id: 'mio', name: L('澪'), portraits: { neutral: portraitKey,
    expressions: {}, fallback: 'neutral' } } },
  scenes: { moonlit: { id: 'moonlit', background: 'moonlit-bg', cast: { mio: { visible: true } } } },
  preferences: { textSpeedMsPerChar: 30, autoDelayMs: 500, skipMode: 'read-only',
    bgmVolume: 1, sfxVolume: 1, voiceVolume: 1, muted: false },
  media: { backgrounds: { 'moonlit-bg': { image: backgroundKey } }, cg: {},
    audio: { bgm: {}, sfx: {}, voice: {} }, video: {} },
  gallery: { memories: {}, music: {} }, endings: { done: { title: L('结束') } },
  chapters: { a: { id: 'a', title: L('序章'), start: 'intro', scene: 'moonlit', nodes: {
    intro: { kind: 'line', speaker: 'mio', text: L('今晚的月色，适合留一张照片。'),
      next: { chapterId: 'a', nodeId: 'done' } },
    done: { kind: 'ending', ending: 'done', text: L('留在心中的月光。') },
  } } },
};

async function mount(): Promise<void> {
  const noPreviewPort = (window as typeof window & { __galPreviewAuditNoPort?: boolean })
    .__galPreviewAuditNoPort === true;
  const contentUrls = (window as typeof window & { __galPreviewAuditAssets?: Record<string, string> })
    .__galPreviewAuditAssets;
  if (!contentUrls?.[backgroundKey] || !contentUrls[portraitKey])
    throw new Error('GAL 06H missing indexed demo asset URLs');
  const world = new World();
  for (const system of narrativeDirectorCapability.systems) world.addSystem(system);
  world.createEntity('story'); world.addComponent('story', { type: 'NarrativePackage', package: pkg });
  world.addComponent('story', createStoryRuntime(pkg));
  world.createEntity('input'); world.addComponent('input', { type: 'InputQueue', actions: [] });
  world.tick();
  const manualPort = new MemoryStoragePort(), sidecarPort = new MemoryGalSavePreviewPort();
  const manual = new GalManualSaveController(pkg, manualPort);
  const sidecar = new GalSavePreviewController(pkg, manual, sidecarPort);
  const host = await GalSliceHost.create(pkg, world, 'story', { profile: new MemorySavePort(),
    manual: manualPort, ...(noPreviewPort ? {} : { savePreview: sidecarPort,
      previewCapture: new BrowserGalPreviewCapturePort() }), contentUrls, savedAt: () => 1000 });
  host.attach(document.getElementById('root')!);
  Object.assign(window, { __galPreviewAudit: {
    page: () => host.uiState.page,
    feedback: () => host.uiState.feedback,
    confirm: () => host.uiState.confirm,
    slot2: () => host.view.manual.slots[1],
    currentHash: async () => (await manual.inspect(2))?.hash ?? null,
    preview: () => sidecar.resolve(2),
    visibleRef: () => host.view.story.refKey,
  } });
}
void mount().catch(error => { Object.assign(window, { __galPreviewAuditError: String(error) }); });
