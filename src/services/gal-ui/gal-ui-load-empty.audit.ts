import { mountUI } from '@ui/components/server.js';
import { apolloOnyx } from '@ui/components/apollo-kit.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';

// Empty slot NO.03 is selected in load mode: the commit button must be disabled.
mountUI(document.getElementById('root')!, buildGalSliceTree(auditModel,
  { ...auditState('slots'), slotMode: 'load', selectedSlot: 3 }), {}, apolloOnyx);
