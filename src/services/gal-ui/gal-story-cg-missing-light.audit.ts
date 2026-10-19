import { mountUI } from '@ui/components/server.js';
import { apolloToon } from '@ui/apollo-toon-theme.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';
import { buildGalSliceTree } from './gal-ui-structure.js';

mountUI(document.getElementById('root')!, buildGalSliceTree({ ...auditModel,
  story: { ...auditModel.story, backgroundAssetKey: 'bg/hidden', portraitAssetKey: 'portrait/hidden',
    cgAssetKey: 'cg/missing' } }, auditState('story'), {}, {
  'bg/hidden': '/hidden-background.png', 'portrait/hidden': '/hidden-portrait.png',
}), {}, apolloToon);
