import { describe, expect, it } from 'vitest';
import type { LayoutNode } from '@ui/components/types.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';

const find = (node: LayoutNode, id: string): LayoutNode | undefined =>
  node.id === id ? node : node.children?.map(child => find(child, id)).find(Boolean);

describe('GAL-UI-03E V2 story geometry', () => {
  for (const variant of ['normal', 'choice', 'rechoice', 'long'] as const) {
    it(`${variant}: keeps V2 anchors and valid action tree`, () => {
      const choice = variant === 'choice' || variant === 'rechoice';
      const tree = buildGalSliceTree({ ...auditModel, story: { ...auditModel.story,
        kind: choice ? 'choice' : 'line', choices: choice ? auditModel.story.choices : [],
        read: variant === 'rechoice',
        text: variant === 'long' ? '温室的灯仍然亮着。'.repeat(25) : auditModel.story.text,
      } }, auditState('story'));
      expect(validateLayoutNode(tree)).toEqual([]);
      expect(find(tree, 'gal-story-dialogue')?.layout).toMatchObject({ x: 20, y: 555, width: 1398,
        height: 343, padding: 0 });
      expect(find(tree, 'gal-story-portrait-placeholder')?.layout).toMatchObject({ x: 675, y: 38,
        width: 561, height: 843, padding: 0 });
      expect(find(tree, 'gal-story-speaker')?.layout).toMatchObject({ x: 101, y: 69 });
      expect(find(tree, 'gal-story-text')?.layout).toMatchObject({ x: 105, y: 142, width: 1156 });
      expect(find(tree, 'gal-story-hint')?.layout).toMatchObject({ x: 39, y: 311 });
      expect(find(tree, 'gal-story-wheel-region')?.props).toMatchObject({
        wheel: { upAction: 'narrative.back', downAction: 'narrative.advance' },
      });
      if (choice) {
        expect(find(tree, 'gal-story-options')?.layout).toMatchObject({ x: 365, y: 296, width: 710,
          gap: 15 });
        expect(find(tree, 'gal-story-choice-note')?.layout).toMatchObject({ x: 365, y: 265,
          width: 710 });
        expect(find(tree, 'gal-story-dialogue')?.props).not.toHaveProperty('action');
        expect(find(tree, 'gal-story-advance')).toBeUndefined();
      } else {
        expect(find(tree, 'gal-story-options')).toBeUndefined();
        expect(find(tree, 'gal-story-dialogue')?.props).toMatchObject({ action: 'narrative.advance' });
        expect(find(tree, 'gal-story-advance')?.props).toMatchObject({ action: 'narrative.advance' });
      }
    });
  }
});
