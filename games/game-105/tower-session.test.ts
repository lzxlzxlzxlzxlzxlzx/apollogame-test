import { describe, expect, it } from 'vitest';
import { TOWER_BLOCKS } from './tower-blueprint.js';
import { TowerGameSession } from './tower-session.js';

const pink = TOWER_BLOCKS[0]!;
const settle = (s: TowerGameSession) => { for (let i = 0; i < 30; i++) s.observePhysics(true); };

describe('Local AI M1 tower session', () => {
  it('opens a player turn only after the stable window', () => {
    const s = new TowerGameSession(); for (let i = 0; i < 29; i++) s.observePhysics(true);
    expect(s.phase).toBe('boot'); s.observePhysics(true); expect(s.phase).toBe('player-ready'); expect(s.turn).toBe('player');
  });
  it('queues player interaction, then turns over to AI only after acknowledgement', () => {
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player'); s.release(2.1 * .93); settle(s);
    expect(s.phase).toBe('player-interaction'); expect(s.heartDelta).toBe(0); expect(s.loot).toHaveLength(0);
    expect(s.pendingLootIds).toEqual(new Set([pink.id])); s.observeSleepingExtractions(new Set([pink.id])); expect(s.loot).toHaveLength(1);
    expect(s.resolveInteraction(true)).toBe(true); expect(s.heartDelta).toBe(pink.score); expect(s.phase).toBe('ai-observe'); expect(s.turn).toBe('ai');
  });
  it('collects linked physical departures in selected-first then departure order', () => {
    const linked = TOWER_BLOCKS[1]!;
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player');
    s.observeTowerBlockDistances([{ block: linked, distance: 2.1 * .93 }, { block: pink, distance: 2.1 * .93 }]);
    s.release(2.1 * .93); settle(s);
    expect(s.settledExtractionHistory).toEqual([pink.id, linked.id]);
    expect(s.interactionQueue.map((card) => card.block.id)).toEqual([pink.id, linked.id]);
    s.observeSleepingExtractions(new Set([linked.id])); expect(s.loot.map((block) => block.id)).toEqual([linked.id]);
    s.observeSleepingExtractions(new Set([pink.id])); expect(s.loot.map((block) => block.id)).toEqual([linked.id, pink.id]);
  });
  it('returns a pulled block to the tower when it comes back under the extraction distance', () => {
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player');
    s.observeTowerBlockDistances([{ block: pink, distance: 2.1 * .93 }]); expect(s.extractedBlocks.has(pink.id)).toBe(true);
    s.observeTowerBlockDistances([{ block: pink, distance: 2.1 * .5 }]); s.release(2.1 * .5); settle(s);
    expect(s.extractedBlocks.has(pink.id)).toBe(false); expect(s.pendingExtractionIds.size).toBe(0); expect(s.phase).toBe('player-ready');
  });
  it('retires a fully extracted released block until the session is restarted', () => {
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player'); s.release(2.1 * .93);
    expect(s.retiredBlocks.has(pink.id)).toBe(true); settle(s); expect(s.beginPull(pink, 'player')).toBe(false);
    s.restart(); settle(s); expect(s.beginPull(pink, 'player')).toBe(true);
  });
  it('retires a non-held block that physics confirms has fallen out of the tower', () => {
    const fallen = TOWER_BLOCKS[1]!;
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player');
    s.observePhysicalFalls([fallen]);
    expect(s.retiredBlocks.has(fallen.id)).toBe(true); expect(s.extractedBlocks.has(fallen.id)).toBe(true);
    s.release(0); settle(s); expect(s.beginPull(fallen, 'player')).toBe(false);
    s.restart(); settle(s); expect(s.beginPull(fallen, 'player')).toBe(true);
  });
  it('keeps card replies local, limits them to 140 characters, and permits one replacement', () => {
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player'); s.release(2.1 * .93); settle(s);
    const before = s.interactionQueue[0]!.text; expect(s.swapInteraction()).toBe(true); expect(s.swapsRemaining).toBe(0);
    expect(s.swapInteraction()).toBe(false); expect(s.interactionQueue[0]!.text).not.toBe(before);
    s.setDraftResponse('x'.repeat(141)); expect(s.draftResponse).toHaveLength(140); expect(s.submitInteraction()).toBe(true);
    expect(s.roundResponses).toHaveLength(1); s.restart(); expect(s.roundResponses).toHaveLength(0); expect(s.draftResponse).toBe('');
  });
  it('uses an unseen same-channel replacement and resolves overflow aftershocks as individual facts', () => {
    const linked = TOWER_BLOCKS.slice(1, 5);
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player');
    s.observeTowerBlockDistances([pink, ...linked].map((block) => ({ block, distance: 2.1 * .93 })));
    s.release(2.1 * .93); settle(s);
    const original = s.interactionQueue[0]!.text;
    expect(s.swapInteraction()).toBe(true); expect(s.interactionQueue[0]!.text).not.toBe(original);
    expect(s.interactionQueue).toHaveLength(3); expect(s.aftershockSummary).toBe(2);
    s.resolveInteraction(true); s.resolveInteraction(false); s.resolveInteraction(true);
    expect(s.interactionQueue[0]).toMatchObject({ kind: 'summary', sequence: 1, total: 2 });
    s.resolveInteraction(true); expect(s.interactionQueue[0]).toMatchObject({ kind: 'summary', sequence: 2, total: 2 });
    s.resolveInteraction(false); expect(s.phase).toBe('ai-observe'); expect(s.heartDelta).toBe(pink.score + linked[1]!.score + linked[2]!.score);
  });
  it('keeps player turn and no effects after a partial release', () => {
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player'); s.release(2.1 * .5); settle(s);
    expect(s.phase).toBe('player-ready'); expect(s.turn).toBe('player'); expect(s.heartDelta).toBe(0); expect(s.loot).toHaveLength(0);
  });
  it('does not reopen a released tower before 30 consecutive sleeping frames', () => {
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player'); s.release(2.1 * .93);
    for (let frame = 0; frame < 29; frame++) s.observePhysics(true);
    expect(s.phase).toBe('resolving'); s.observePhysics(true); expect(s.phase).toBe('player-interaction');
  });
  it('locks immediately on three unique residual topple signals and resets cleanly', () => {
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player'); s.observePhysics(false, [pink.id, pink.id, TOWER_BLOCKS[1]!.id, TOWER_BLOCKS[2]!.id]);
    expect(s.phase).toBe('collapse-locked'); expect(s.loser).toBe('player'); s.restart(); expect(s.phase).toBe('boot'); expect(s.loot).toHaveLength(0);
  });
  it('keeps a player wrap-up local and accepts a safe skip after a collapse', () => {
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player');
    s.observePhysics(false, [pink.id, TOWER_BLOCKS[1]!.id, TOWER_BLOCKS[2]!.id]);
    s.setDraftResponse('这一局慢慢来。'); expect(s.submitWrapUp()).toBe(true); expect(s.roundResponses.at(-1)).toBe('这一局慢慢来。');
    expect(s.skipWrapUp()).toBe(true); expect(s.wrapUpText).toContain('跳过');
  });
  it('shows one acknowledgeable local AI wrap-up and resets match facts on restart', () => {
    const s = new TowerGameSession(); settle(s); s.turn = 'ai'; s.phase = 'ai-observe'; expect(s.beginPull(pink, 'ai')).toBe(true);
    s.observePhysics(false, [pink.id, TOWER_BLOCKS[1]!.id, TOWER_BLOCKS[2]!.id]);
    expect(s.loser).toBe('ai'); expect(s.acknowledgeAIWrap()).toBe(false); s.finishAIPenaltyReply();
    expect(s.acknowledgeAIWrap()).toBe(true); expect(s.acknowledgeAIWrap()).toBe(false);
    s.restart(); expect(s.aiWrapAcknowledged).toBe(false); expect(s.playerDraws).toBe(0); expect(s.round).toBe(1);
  });
  it('queues AI main and aftershock cards in physical departure order, showing each reply once', () => {
    const first = TOWER_BLOCKS[0]!, second = TOWER_BLOCKS[1]!;
    const s = new TowerGameSession(); settle(s); s.turn = 'ai'; s.phase = 'ai-observe'; s.beginPull(first, 'ai');
    s.observeTowerBlockDistances([{ block: second, distance: 2.1 * .93 }, { block: first, distance: 2.1 * .93 }]); s.release(2.1 * .93); settle(s);
    expect(s.phase).toBe('ai-response');
    expect(s.aiInteractionQueue.map((card) => [card.block.id, card.kind, card.sequence])).toEqual([[first.id, 'main', 1], [second.id, 'aftershock', 2]]);
    s.templateReply = '第一张回应。'; s.finishAIResponse(); expect(s.aiReplyVisible).toBe(true);
    s.advanceAIResponse(); expect(s.aiInteractionQueue).toHaveLength(1); expect(s.aiReplyVisible).toBe(false);
    s.templateReply = '第二张回应。'; s.finishAIResponse(); s.advanceAIResponse();
    expect(s.phase).toBe('player-ready'); expect(s.turn).toBe('player');
  });
  it('uses a seeded deterministic AI penalty card and requires its reply before acknowledgement', () => {
    const collapse = (seed: number) => {
      const s = new TowerGameSession(seed); settle(s); s.turn = 'ai'; s.phase = 'ai-observe'; s.beginPull(pink, 'ai');
      s.observePhysics(false, [pink.id, TOWER_BLOCKS[1]!.id, TOWER_BLOCKS[2]!.id]); return s;
    };
    const a = collapse(105), b = collapse(105);
    expect(a.aiPenaltyCard).toMatchObject({ effectId: 'g105-ai-penalty-1-0' }); expect(a.aiPenaltyCard?.id).toBe(b.aiPenaltyCard?.id);
    expect(a.acknowledgeAIWrap()).toBe(false); a.finishAIPenaltyReply();
    expect(a.aiPenaltyCompleted).toBe(true); expect(a.acknowledgeAIWrap()).toBe(true);
  });
  it('does not count repeated topple signals from one residual block toward the three-block loss rule', () => {
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player');
    s.observePhysics(false, [pink.id, pink.id]); expect(s.phase).toBe('player-pulling');
    s.observePhysics(false, [TOWER_BLOCKS[1]!.id]); expect(s.phase).toBe('player-pulling');
  });
  it('locks a released tower after the 900-frame continuous-instability fallback', () => {
    const s = new TowerGameSession(); settle(s); s.beginPull(pink, 'player'); s.release(0);
    for (let frame = 0; frame < 899; frame++) s.observePhysics(false);
    expect(s.phase).toBe('resolving'); s.observePhysics(false); expect(s.phase).toBe('collapse-locked');
  });
});
