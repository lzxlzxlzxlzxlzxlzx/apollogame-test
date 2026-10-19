import { mountUI } from '@ui/components/server.js';
import { apolloOnyx } from '@ui/components/apollo-kit.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';
mountUI(document.getElementById('root')!, buildGalSliceTree(auditModel,
  { ...auditState('slots'), slotMode: 'load', confirm: 'load' }), {}, apolloOnyx);
