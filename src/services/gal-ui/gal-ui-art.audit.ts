import { mountUI } from '@ui/components/server.js';
import { apolloOnyx } from '@ui/components/apollo-kit.js';
import { apolloToon } from '@ui/apollo-toon-theme.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';
import { loadGalContentUrls, loadGalUiArt } from './gal-ui-art.js';
import { buildGalSliceTree, type GalConfirmKind } from './gal-ui-structure.js';
import type { GalSettingsTab } from './gal-ui-settings.js';

const fixture = globalThis as typeof globalThis & { __GAL_ART_URLS__?: Record<string, string>;
  __GAL_CONTENT_URLS__?: Record<string, string> };
const [pageName, themeName] = location.hash.slice(1).split(':');
const pageKey = pageName?.replace('-fail', '') ?? 'home';
const page = pageKey.startsWith('story') ? 'story' : pageKey.startsWith('slots') ? 'slots' :
  pageKey.startsWith('settings') ? 'settings' : pageKey.startsWith('gallery') ? 'gallery' : 'home';
const settingsTab = pageKey.startsWith('settings-') ? pageKey.slice('settings-'.length) : 'text';
const state = { ...auditState(page),
  settingsTab: (['text', 'audio', 'display', 'confirm'].includes(settingsTab) ? settingsTab : 'text') as GalSettingsTab,
  galleryTab: pageKey === 'gallery-memories' ? 'memories' as const : 'cg' as const,
  slotMode: pageKey === 'slots-load' ? 'load' as const : 'save' as const,
  confirm: pageKey.startsWith('confirm-') ? pageKey.slice('confirm-'.length) as GalConfirmKind : null };
const artUrls = { ...fixture.__GAL_ART_URLS__ };
if (pageName?.endsWith('-fail')) artUrls['tex/gal-save-slot'] = 'file:///missing-gal-slot.png';
const model = { ...auditModel,
  story: { ...auditModel.story,
    ...(pageKey === 'story-normal' ? { kind: 'line' as const, choices: [] } : {}),
    backgroundAssetKey: 'tex/gal-demo-backdrop',
    portraitAssetKey: 'tex/gal-demo-portrait' },
  gallery: { ...auditModel.gallery, cg: auditModel.gallery.cg.map((card, index) =>
    index === 0 ? { ...card, assetKey: 'tex/gal-demo-cg' } : card) } };
void Promise.all([loadGalUiArt(artUrls), loadGalContentUrls(fixture.__GAL_CONTENT_URLS__ ?? {})])
  .then(([art, contentUrls]) => {
  const tree = buildGalSliceTree(model, state, art, contentUrls);
  const actions: string[] = [];
  mountUI(document.getElementById('root')!, tree, {}, themeName === 'light' ? apolloToon : apolloOnyx,
    { enqueueAction: name => { actions.push(name); } });
  Object.assign(globalThis, { __GAL_ART_ACTIONS__: actions });
  document.documentElement.dataset.galArtReady = 'true';
  document.documentElement.dataset.galArtCount = String(Object.keys(art).length);
});
