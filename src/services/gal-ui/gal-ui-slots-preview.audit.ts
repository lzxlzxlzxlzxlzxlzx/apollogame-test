import { mountUI } from '@ui/components/server.js';
import { apolloOnyx } from '@ui/components/apollo-kit.js';
import type { GalUiReadModel } from './gal-ui-read-model.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';

const previewModel: GalUiReadModel = { ...auditModel, manual: { ...auditModel.manual,
  slots: auditModel.manual.slots.map(slot => slot.number === 2 ? {
    ...slot, preview: 'ready',
    previewSrc: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  } : slot),
} };
mountUI(document.getElementById('root')!, buildGalSliceTree(previewModel, auditState('slots')), {}, apolloOnyx);
