import { describe, expect, it } from 'vitest';
import graph from '../../docs/design/galgame/drafts/manor-escape/graph.json';
import routes from '../../docs/design/galgame/drafts/manor-escape/routes.json';
import { layoutStoryGraph, storyGraphLabels } from './gal-story-graph-view.js';

describe('story graph picture', () => {
  it('draws the manor story from the hall to both endings', () => {
    const picture = layoutStoryGraph(graph, storyGraphLabels(routes));
    expect(picture).not.toBeNull();
    expect(picture!.boxes.map((box) => box.key)).toContain('c-hall/n-meet');
    expect(picture!.boxes[0]?.key).toBe('c-hall/n-meet');
    expect(picture!.boxes.filter((box) => box.kind === 'ending').every((box) => box.title.startsWith('机械师和囚徒'))).toBe(true);
    const choice = picture!.boxes.find((box) => box.kind === 'choice');
    const branches = picture!.links.filter((link) => link.from === choice?.key);
    expect(branches).toHaveLength(2);
    const leave = picture!.boxes.find((box) => box.key === 'c-leave/n-walk');
    const stay = picture!.boxes.find((box) => box.key === 'c-stay/n-remain');
    expect(leave?.subtitle.startsWith('机械师选择')).toBe(true);
    expect(stay?.subtitle.startsWith('机械师选择')).toBe(true);
    const hall = picture!.boxes[0]!;
    const next = picture!.boxes[1]!;
    expect(next.y).toBeGreaterThan(hall.y);
    expect(next.x).toBe(hall.x);
    expect(leave && stay && leave.x !== stay.x).toBe(true);
    expect(picture!.boxes).toHaveLength(10);
  });

  it('stops when a node points back at itself', () => {
    const picture = layoutStoryGraph({
      entry: { chapterId: 'c', nodeId: 'n' },
      chapters: { c: { title: '环', start: 'n', nodes: { n: { kind: 'line-slot', next: { chapterId: 'c', nodeId: 'n' } } } } },
      sceneSlots: [],
    });
    expect(picture?.boxes).toHaveLength(1);
    expect(picture?.links).toHaveLength(1);
  });

  it('returns nothing for a draft that is not a graph', () => {
    expect(layoutStoryGraph({ title: '简报' })).toBeNull();
  });
});
