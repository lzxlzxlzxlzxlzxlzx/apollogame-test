import { describe, expect, it } from 'vitest';
import type { LayoutNode } from '@ui/components/types.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import { auditModel } from './gal-ui-slice-audit-fixture.js';
import { galSettingsTree } from './gal-ui-settings.js';

function find(nodes: readonly LayoutNode[], id: string): LayoutNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = find(node.children ?? [], id);
    if (nested) return nested;
  }
  return undefined;
}

describe('GAL settings preview uses current package data', () => {
  it('shows localized story text after an active resume point', () => {
    const tree = galSettingsTree(auditModel, 'display');
    expect(find(tree, 'gal-settings-preview-line')?.props).toMatchObject({
      text: '预览 · 澪 「打开哪一封信？月光还停在窗沿。」',
    });
    expect(tree.flatMap(node => validateLayoutNode(node))).toEqual([]);
  });

  it('does not reveal the story before there is an active resume point', () => {
    const model = { ...auditModel, home: { ...auditModel.home, canContinue: false } };
    const tree = galSettingsTree(model, 'display');
    expect(find(tree, 'gal-settings-preview-line')?.props).toMatchObject({
      text: '预览 · 当前作品的文字显示效果',
    });
    expect(JSON.stringify(tree)).not.toContain(auditModel.story.text);
    expect(tree.flatMap(node => validateLayoutNode(node))).toEqual([]);
  });

  it('bounds multiline and long story text inside the fixed preview row', () => {
    const model = { ...auditModel, story: { ...auditModel.story,
      speaker: '一二三四五六七八九十甲乙丙丁', text: `首行\n${'字'.repeat(70)}` } };
    const tree = galSettingsTree(model, 'display');
    const preview = find(tree, 'gal-settings-preview-line')?.props as { text: string };
    expect(preview.text).toBe(`预览 · 一二三四五六七八九十甲乙 「首行 ${'字'.repeat(37)}…」`);
    expect(preview.text).not.toContain('\n');
    expect(tree.flatMap(node => validateLayoutNode(node))).toEqual([]);
  });
});
