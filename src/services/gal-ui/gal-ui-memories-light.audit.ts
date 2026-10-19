import { mountUI } from '@ui/components/server.js';
import { apolloToon } from '@ui/apollo-toon-theme.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';

mountUI(document.getElementById('root')!, buildGalSliceTree(auditModel,
  { ...auditState('gallery'), galleryTab: 'memories' }), {}, apolloToon);
