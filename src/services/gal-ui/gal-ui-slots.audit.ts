/** Synchronous V2 slot audit entry for the generic overlap/contrast checker. */
import { mountUI } from '@ui/components/server.js';
import { apolloOnyx } from '@ui/components/apollo-kit.js';
import { GAL_UI_ART_KEYS, resolveGalUiArt } from './gal-ui-art.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';
import { buildGalSliceTree } from './gal-ui-structure.js';

const localArt = (name: string): string =>
  new URL(`../public/games/gal-template/art/textures/ui/${name}`, location.href).href;
const art = resolveGalUiArt({
  [GAL_UI_ART_KEYS.systemFrame]: localArt('panel-frame-v1.png'),
  [GAL_UI_ART_KEYS.button]: localArt('button-default-v1.png'),
  [GAL_UI_ART_KEYS.slot]: localArt('save-slot-compact-v2.png'),
});
const tree = buildGalSliceTree(auditModel, { ...auditState('slots'), slotMode: 'load' }, art);
mountUI(document.getElementById('root')!, tree, {}, apolloOnyx,
  { enqueueAction: () => undefined });
