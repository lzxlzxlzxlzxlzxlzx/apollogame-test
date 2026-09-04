import { describe, expect, it } from 'vitest';
import type { LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { TOWER_BLOCKS } from './tower-blueprint.js';
import { hud } from './game-105.js';
import { TowerGameSession } from './tower-session.js';

type StructureNode = { id: string; parent: string | null; index: number; x?: number; y?: number; width?: number; height?: number; action?: string; arg?: string };

// S4 structure contract: visual props are deliberately excluded from this projection.
function project(node: LayoutNode, parent: string | null = null, index = 0, out: StructureNode[] = []): StructureNode[] {
  const layout = node.layout ?? {};
  const props = node.props as { action?: string; actionArg?: string } | undefined;
  out.push({ id: node.id, parent, index, x: layout.x, y: layout.y, width: layout.width, height: layout.height, action: props?.action, arg: props?.actionArg });
  node.children?.forEach((child, childIndex) => project(child, node.id, childIndex, out));
  return out;
}

const settle = (s: TowerGameSession) => { for (let i = 0; i < 30; i++) s.observePhysics(true); };
const ids = (s: TowerGameSession) => project(hud(s, 0)).map((node) => node.id);
const actions = (s: TowerGameSession) => project(hud(s, 0)).flatMap((node) => node.action ? [`${node.action}:${node.arg ?? ''}`] : []);

describe('S5 structure guard against the owner-blessed S4 layout', () => {
  it('keeps the opening HUD anchors, order, and restart action unchanged', () => {
    const s = new TowerGameSession(); settle(s);
    const nodes = project(hud(s, 0));
    expect(nodes.filter((node) => node.parent === 'g105-probe-hud')).toEqual([
      { id: 'g105-companion-card', parent: 'g105-probe-hud', index: 0, x: 20, y: 18, width: 300, height: undefined, action: undefined, arg: undefined },
      { id: 'g105-ledger', parent: 'g105-probe-hud', index: 1, x: 956, y: 18, width: 304, height: undefined, action: undefined, arg: undefined },
      { id: 'g105-controls', parent: 'g105-probe-hud', index: 2, x: 356, y: 632, width: 568, height: undefined, action: undefined, arg: undefined },
      { id: 'g105-restart-slot', parent: 'g105-probe-hud', index: 3, x: 20, y: 215, width: 164, height: undefined, action: undefined, arg: undefined },
    ]);
    expect(ids(s)).toEqual(['g105-probe-hud', 'g105-companion-card', 'g105-title', 'g105-companion-name', 'g105-status', 'g105-ledger', 'g105-ledger-title', 'g105-heart', 'g105-heart-slots', 'g105-ledger-detail', 'g105-controls', 'g105-note', 'g105-restart-slot', 'g105-restart']);
    expect(actions(s)).toEqual(['tower.restart:']);
  });

  it('keeps every player-card control and its order', () => {
    const s = new TowerGameSession(); settle(s); s.beginPull(TOWER_BLOCKS[0]!, 'player'); s.release(2.1 * .93); settle(s);
    expect(ids(s)).toEqual(['g105-probe-hud', 'g105-companion-card', 'g105-title', 'g105-companion-name', 'g105-status', 'g105-ledger', 'g105-ledger-title', 'g105-heart', 'g105-heart-slots', 'g105-ledger-detail', 'g105-controls', 'g105-note', 'g105-interaction-card', 'g105-card-title', 'g105-card-kicker', 'g105-card-text', 'g105-response-input', 'g105-quick-replies', 'g105-quick-one', 'g105-quick-two', 'g105-quick-three', 'g105-card-actions', 'g105-interaction-complete', 'g105-interaction-swap', 'g105-interaction-skip', 'g105-card-safety', 'g105-restart-slot', 'g105-restart']);
    expect(actions(s)).toEqual(['tower.response.draft:', 'tower.response.quick:我记住了。', 'tower.response.quick:谢谢你愿意分享。', 'tower.response.quick:我们可以慢慢来。', 'tower.interaction.submit:', 'tower.interaction.swap:', 'tower.interaction.skip:', 'tower.restart:']);
  });

  it('keeps the aftershock fact in the same card region without adding controls', () => {
    const s = new TowerGameSession(); const linked = TOWER_BLOCKS.slice(1, 5); settle(s); s.beginPull(TOWER_BLOCKS[0]!, 'player');
    s.observeTowerBlockDistances([TOWER_BLOCKS[0]!, ...linked].map((block) => ({ block, distance: 2.1 * .93 }))); s.release(2.1 * .93); settle(s);
    const nodes = project(hud(s, 0));
    expect(nodes.find((node) => node.id === 'g105-interaction-card')).toMatchObject({ parent: 'g105-probe-hud', index: 3, x: 20, y: 430, width: 484 });
    expect(ids(s)).toContain('g105-aftershock-summary');
    expect(actions(s)).toHaveLength(8);
  });

  it('keeps player and AI wrap-up actions in the fixed wrap-card anchor', () => {
    const player = new TowerGameSession(); settle(player); player.beginPull(TOWER_BLOCKS[0]!, 'player'); player.observePhysics(false, TOWER_BLOCKS.slice(0, 3).map((block) => block.id));
    const playerNodes = project(hud(player, 0));
    expect(playerNodes.find((node) => node.id === 'g105-wrap-card')).toMatchObject({ parent: 'g105-probe-hud', index: 3, x: 410, y: 330, width: 460 });
    expect(actions(player)).toEqual(['tower.response.draft:', 'tower.wrap.submit:', 'tower.response.quick:慢慢来也可以。', 'tower.wrap.skip:', 'tower.restart:']);

    const ai = new TowerGameSession(); settle(ai); ai.turn = 'ai'; ai.phase = 'ai-observe'; ai.beginPull(TOWER_BLOCKS[0]!, 'ai'); ai.observePhysics(false, TOWER_BLOCKS.slice(0, 3).map((block) => block.id));
    expect(actions(ai)).toEqual(['tower.restart:']);
    ai.finishAIPenaltyReply();
    expect(actions(ai)).toEqual(['tower.wrap.continue:', 'tower.restart:']);
  });
});
