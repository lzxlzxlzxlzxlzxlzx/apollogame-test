import type { GalUiReadModel } from './gal-ui-read-model.js';
import { auditModel } from './gal-ui-slice-audit-fixture.js';

// Four representative states share one 4×3 page; this image is a test-color placeholder.
const previewSrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
export const slot03dModel: GalUiReadModel = { ...auditModel, manual: { ...auditModel.manual,
  slots: auditModel.manual.slots.map(slot => slot.number === 3 ? {
    ...slot, filled: true, canLoad: true, label: '测试色块占位', preview: 'ready', previewSrc,
  } : slot.number === 4 ? {
    ...slot, filled: true, canLoad: true, label: '预览损坏但档可读', preview: 'damaged',
  } : slot),
} };
