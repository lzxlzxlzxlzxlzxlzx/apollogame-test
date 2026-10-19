import { mountUI } from '@ui/components/server.js';
import { apolloToon } from '@ui/apollo-toon-theme.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { resolveGalUiArt } from './gal-ui-art.js';

const art = resolveGalUiArt({
  'tex/gal-system-frame': '/games/gal-template/art/system-frame.png',
  'tex/gal-button-default': '/games/gal-template/art/button-default.png',
});
const memories = auditModel.gallery.memories.map((card, index) => index === 0 ?
  { ...card, assetKey: 'tex/gal-demo-backdrop' } : index === 3 ?
  { ...card, lockedAssetKey: 'tex/gal-system-frame' } : card);

mountUI(document.getElementById('root')!, buildGalSliceTree({ ...auditModel,
  gallery: { ...auditModel.gallery, memories } },
{ ...auditState('gallery'), galleryTab: 'memories' }, art,
{ 'tex/gal-demo-backdrop': '/games/gal-template/art/textures/demo/moonlit-backdrop-v2.png',
  'tex/gal-system-frame': '/games/gal-template/art/textures/ui/panel-frame-v1.png' }), {}, apolloToon);
