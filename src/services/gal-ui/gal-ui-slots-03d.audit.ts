import { mountUI } from '@ui/components/server.js';
import { apolloOnyx } from '@ui/components/apollo-kit.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { auditState } from './gal-ui-slice-audit-fixture.js';
import { slot03dModel } from './gal-ui-slots-03d-fixture.js';

mountUI(document.getElementById('root')!, buildGalSliceTree(slot03dModel, auditState('slots')), {}, apolloOnyx);
