import { mountUI } from '@ui/components/server.js';
import { apolloToon } from '@ui/apollo-toon-theme.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { resolveGalUiArt } from './gal-ui-art.js';

const art = resolveGalUiArt({
  'tex/gal-system-frame': '/games/gal-template/art/system-frame.png',
  'tex/gal-button-default': '/games/gal-template/art/button-default.png',
});

mountUI(document.getElementById('root')!, buildGalSliceTree(auditModel,
  { ...auditState('gallery'), galleryTab: 'memories' }, art), {}, apolloToon);
