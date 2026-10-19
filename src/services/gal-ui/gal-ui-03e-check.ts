import type { LayoutNode } from '@ui/components/types.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import { renderNode } from '@ui/components/render.js';
import { apolloOnyx } from '@ui/components/apollo-kit.js';
import { buildGalSliceTree } from './gal-ui-structure.js';
import { auditModel, auditState } from './gal-ui-slice-audit-fixture.js';

const find = (node: LayoutNode, id: string): LayoutNode | undefined =>
  node.id === id ? node : node.children?.map(child => find(child, id)).find(Boolean);
const equal = (name: string, value: unknown, expected: unknown) => {
  if (JSON.stringify(value) !== JSON.stringify(expected))
    throw new Error(`${name}: ${JSON.stringify(value)} != ${JSON.stringify(expected)}`);
};
for (const variant of ['normal', 'choice', 'rechoice', 'long'] as const) {
  const choice = variant === 'choice' || variant === 'rechoice';
  const model = { ...auditModel, story: { ...auditModel.story,
    kind: choice ? 'choice' as const : 'line' as const,
    text: variant === 'long' ? '温室的灯仍然亮着。'.repeat(25) : auditModel.story.text,
    choices: choice ? auditModel.story.choices : [], read: variant === 'rechoice' } };
  const tree = buildGalSliceTree(model, auditState('story'));
  equal(`${variant} validate`, validateLayoutNode(tree), []);
  equal(`${variant} dialogue`, find(tree, 'gal-story-dialogue')?.layout,
    { x: 20, y: 555, width: 1398, height: 343, padding: 0, allowOverlap: true });
  equal(`${variant} portrait`, find(tree, 'gal-story-portrait-placeholder')?.layout,
    { x: 675, y: 38, width: 561, height: 843, padding: 0,
      align: 'center', justify: 'center', allowOverlap: true });
  equal(`${variant} text`, find(tree, 'gal-story-text')?.layout, { x: 105, y: 142, width: 1156 });
  const dialogue = find(tree, 'gal-story-dialogue');
  if (!dialogue) throw new Error('Missing dialogue');
  const html = renderNode(dialogue, apolloOnyx);
  if (!html.includes('data-wheel') && !find(tree, 'gal-story-wheel-region'))
    throw new Error('Missing wheel action region');
  if (choice) {
    equal(`${variant} options`, find(tree, 'gal-story-options')?.layout,
      { x: 365, y: 296, width: 710, direction: 'column', gap: 15, align: 'stretch' });
    if (html.includes('data-action="narrative.advance"')) throw new Error('Choice dialogue advances');
  } else if (!html.includes('data-action="narrative.advance"')) {
    throw new Error('Line dialogue cannot advance');
  }
}
console.log('GAL-UI-03E structural/layout validation: PASS (normal, choice, rechoice, long)');
