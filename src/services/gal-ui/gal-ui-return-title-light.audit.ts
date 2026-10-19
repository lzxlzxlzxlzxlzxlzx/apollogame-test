import { mountUI } from '@ui/components/server.js';
import { apolloToon } from '@ui/apollo-toon-theme.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';

const tree = buildGalSliceTree(auditModel, { ...auditState('story'), confirm: 'return-title' });
if (tree.type !== 'Screen') throw new Error('GAL audit fixture must be a Screen');
const modal = tree.children?.find(node => node.id === 'gal-confirm');
if (!modal) throw new Error('GAL return-title modal missing');
mountUI(document.getElementById('root')!,
  { type: 'Screen', id: 'gal-confirm-light-audit', props: { fill: true, bg: 'ink-deep' }, children: [modal] },
  {}, apolloToon);
