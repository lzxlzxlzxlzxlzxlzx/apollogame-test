import { createGameResult } from '@dokiworld/app-sdk/game-result';

const ATOMIC_TYPES = new Set(['string', 'number', 'boolean']);

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function relationshipSignal(session) {
  if (session.heartDelta >= 8) return 'memory-unlocked';
  if ((session.roundResponses?.length ?? 0) >= 2) return 'brave';
  if (session.completedInteractions >= 2) return 'trust';
  return 'playful';
}

function winnerOf(session) {
  if (session.loser === 'ai') return 'player';
  if (session.loser === 'player') return 'ai';
  return 'none';
}

function memorySummaryOf(session, winner) {
  const winnerLine = winner === 'player'
    ? '这一局是你更稳。'
    : winner === 'ai'
      ? '这一局是TA更稳。'
      : '这一局以平手收住。';
  return `第 ${session.round} 轮后落局，完成 ${session.completedInteractions} 次互动，心动值增加 ${session.heartDelta}。${winnerLine}`;
}

export function buildHeartTowerGameResult(session, { replyMode = 'template' } = {}) {
  const winner = winnerOf(session);
  const memoryCandidate = session.heartDelta >= 8;
  const metrics = {
    winner,
    rounds: session.round,
    playerDraws: session.playerDraws,
    aiDraws: session.aiDraws,
    completedInteractions: session.completedInteractions,
    linkedExtractions: session.linkedExtractions,
    heartDelta: session.heartDelta,
    relationshipSignal: relationshipSignal(session),
    memoryCandidate,
    memorySummary: memorySummaryOf(session, winner),
    replyMode,
    aiPenaltyCompleted: Boolean(session.aiPenaltyCompleted),
  };
  const normalizedScore = clampScore(
    session.heartDelta * 8
    + session.completedInteractions * 10
    + (winner === 'player' ? 18 : winner === 'ai' ? 10 : 14),
  );
  return createGameResult({
    normalizedScore,
    outcome: 'completed',
    metrics: Object.fromEntries(
      Object.entries(metrics).filter(([, value]) => ATOMIC_TYPES.has(typeof value)),
    ),
  });
}
