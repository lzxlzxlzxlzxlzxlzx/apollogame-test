/** Synchronous, no-asset settings audit entry so the generic UI auditor cannot sample an unmounted page. */
import { mountUI } from '@ui/components/server.js';
import { apolloOnyx } from '@ui/components/apollo-kit.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';
import { buildGalSliceTree } from './gal-ui-structure.js';

const tree = buildGalSliceTree(auditModel,
  { ...auditState('settings'), storyAvailable: true, settingsTab: 'text' }, {}, {});
mountUI(document.getElementById('root')!, tree, {}, apolloOnyx,
  { enqueueAction: () => undefined });
