import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHeartTowerGameResult } from '../src/game-result.js';

function fakeSession(overrides = {}) {
  return {
    loser: 'ai',
    round: 3,
    playerDraws: 2,
    aiDraws: 1,
    completedInteractions: 2,
    linkedExtractions: 1,
    heartDelta: 9,
    roundResponses: ['好呀', '慢一点'],
    ...overrides,
  };
}

test('heart tower result uses the storyteller whitelist metrics only', () => {
  const output = buildHeartTowerGameResult(fakeSession(), { replyMode: 'mixed' });

  assert.equal(output.contract, 'doki.game.result');
  assert.equal(output.version, 1);
  assert.equal(output.data.outcome, 'completed');
  assert.equal(output.data.metrics.winner, 'player');
  assert.equal(output.data.metrics.memoryCandidate, true);
  assert.equal(output.data.metrics.replyMode, 'mixed');
  assert.equal(output.data.metrics.aiPenaltyCompleted, false);
  assert.match(output.data.metrics.memorySummary, /心动值增加 9/);
});

test('heart tower result maps loser=player to winner=ai and clamps score', () => {
  const output = buildHeartTowerGameResult(fakeSession({
    loser: 'player',
    heartDelta: 0,
    completedInteractions: 0,
    roundResponses: [],
  }), { replyMode: 'template' });

  assert.equal(output.data.metrics.winner, 'ai');
  assert.equal(output.data.metrics.relationshipSignal, 'playful');
  assert.ok(output.data.normalizedScore >= 0 && output.data.normalizedScore <= 100);
});
