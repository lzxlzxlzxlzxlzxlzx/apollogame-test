import { describe, expect, it } from 'vitest';
import { collectLifeVisualReferences } from './lib/life-visual-references.js';

describe('Life visual asset closure', () => {
  it('collects both initial placement and completed construction skins with exact consumer pointers', () => {
    const refs = collectLifeVisualReferences({
      scenes: [{ placements: [{ skinKey: 'art:bridge:broken' }] }],
      constructionProjects: [{ completedSkinKey: 'art:bridge:complete' }],
    });
    expect(refs).toEqual([
      { key: 'art:bridge:complete', pointer: '/constructionProjects/0/completedSkinKey' },
      { key: 'art:bridge:broken', pointer: '/scenes/0/placements/0/skinKey' },
    ]);
  });
});
