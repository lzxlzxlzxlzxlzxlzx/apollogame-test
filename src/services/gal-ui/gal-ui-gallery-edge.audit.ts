import { mountUI } from '@ui/components/server.js';
import { apolloOnyx } from '@ui/components/apollo-kit.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';
import type { GalUiReadModel } from './gal-ui-read-model.js';

const edgeCase = new URLSearchParams(location.search).get('case');
const gallery = edgeCase === 'empty'
  ? { cg: [], memories: [] }
  : { ...auditModel.gallery, cg: [...auditModel.gallery.cg,
    { id: 'cg-7', title: '第七张月影', unlocked: true, preview: 'no-asset' as const }] };
const model: GalUiReadModel = { ...auditModel, gallery };
mountUI(document.getElementById('root')!, buildGalSliceTree(model,
  { ...auditState('gallery'), galleryTab: 'cg', galleryPage: edgeCase === 'page2' ? 2 : 1 }), {}, apolloOnyx);
