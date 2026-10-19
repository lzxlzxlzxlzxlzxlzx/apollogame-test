import { describe, expect, it } from 'vitest';
import type { LayoutNode } from '@ui/components/types.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import type { GalUiReadModel } from './gal-ui-read-model.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';

const find = (node: LayoutNode, id: string): LayoutNode | undefined =>
  node.id === id ? node : node.children?.map(child => find(child, id)).find(Boolean);

describe('GAL-UI-03D four-state 4×3 slot geometry', () => {
  it('uses separate 12px column and 8px row gaps without changing card or footer size', () => {
    const model: GalUiReadModel = { ...auditModel, manual: { ...auditModel.manual,
      slots: auditModel.manual.slots.map(slot => slot.number === 3 ? {
        ...slot, filled: true, canLoad: true, preview: 'ready', previewSrc: 'data:image/png;base64,test',
      } : slot.number === 4 ? { ...slot, filled: true, canLoad: true, preview: 'damaged' } : slot),
    } };
    const tree = buildGalSliceTree(model, auditState('slots'));
    expect(validateLayoutNode(tree)).toEqual([]);
    const grid = find(tree, 'gal-slots-grid');
    expect(grid?.layout).toMatchObject({ direction: 'column', gap: 8 });
    expect(grid?.children).toHaveLength(3);
    for (const [rowIndex, row] of (grid?.children ?? []).entries()) {
      expect(row.layout).toMatchObject({ direction: 'row', gap: 12 });
      expect(row.children?.map(child => child.id)).toEqual(
        Array.from({ length: 4 }, (_, column) => `gal-slot-${rowIndex * 4 + column + 1}`));
      for (const card of row.children ?? []) expect(card.layout).toMatchObject({ height: 142, flex: 1, padding: 10 });
    }
    expect(find(tree, 'gal-slots-toolbar')?.layout?.height).toBe(32);
    expect(find(tree, 'gal-slots-footer')?.layout).toMatchObject({ x: 65, y: 721, width: 1272, height: 51 });
    expect(find(tree, 'gal-slot-1-preview-text')).toMatchObject({ type: 'Label', props: { text: '空存档位' } });
    expect(find(tree, 'gal-slot-2-preview-text')).toMatchObject({ type: 'Label', props: { text: '暂无预览' } });
    expect(find(tree, 'gal-slot-3-preview-image')?.type).toBe('Image');
    expect(find(tree, 'gal-slot-4-preview-text')).toMatchObject({ type: 'Label', props: { text: '预览损坏 · 可读取' } });
    expect(find(tree, 'gal-slot-4-preview-image')).toBeUndefined();
  });
});
