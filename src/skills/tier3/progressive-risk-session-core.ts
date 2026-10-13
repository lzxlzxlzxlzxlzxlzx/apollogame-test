import type {
  ProgressiveRiskReceipt,
  ProgressiveRiskSession,
  ProgressiveRiskTerminal,
  Signal,
} from '@engine/protocol/components.js';
import type { IWorld } from '@engine/core/types.js';

const BP = 10_000;
export type ProgressiveRiskTraceWriter = (
  kind: 'decision' | 'transition' | 'reject' | 'commit', what: string, why?: string,
) => void;
function integerIn(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

export function progressiveChanceBp(
  initialChanceBp: number, failedRolls: number, growthFactorBp: number, maxRollChanceBp: number,
): number {
  if (![initialChanceBp, failedRolls, growthFactorBp, maxRollChanceBp].every(Number.isSafeInteger)) return 0;
  if (initialChanceBp < 0 || failedRolls < 0 || growthFactorBp < 0 || maxRollChanceBp < 0) return 0;
  const scaled = BigInt(initialChanceBp) * (BigInt(BP) + BigInt(failedRolls) * BigInt(growthFactorBp)) / BigInt(BP);
  return Math.min(maxRollChanceBp, Number(scaled));
}

export function validateProgressiveRiskConfig(session: ProgressiveRiskSession): string | undefined {
  if (!session.id) return 'id 为空';
  if (!Array.isArray(session.targets) || session.targets.length === 0) return 'targets 为空';
  const ids = new Set<string>();
  for (const target of session.targets) {
    if (!target || typeof target.id !== 'string' || !target.id) return 'target.id 为空';
    if (ids.has(target.id)) return `target.id 重复:${target.id}`;
    ids.add(target.id);
    if (!integerIn(target.initialChanceBp, 0, BP)) return `target.initialChanceBp 越界:${target.id}`;
  }
  if (!integerIn(session.riskRateBpPerSecond, 1, BP)) return 'riskRateBpPerSecond 越界';
  if (!integerIn(session.ticksPerSecond, 1, BP)) return 'ticksPerSecond 越界';
  if (!integerIn(session.riskLimitBp, 1, BP)) return 'riskLimitBp 越界';
  if (!integerIn(session.qteMissRiskBp, 0, BP)) return 'qteMissRiskBp 越界';
  if (!integerIn(session.qteCycleTicks, 2, BP)) return 'qteCycleTicks 越界';
  if (!integerIn(session.qteWindowStartTick, 0, session.qteCycleTicks - 1)) return 'qteWindowStartTick 越界';
  if (!integerIn(session.qteWindowEndTick, session.qteWindowStartTick, session.qteCycleTicks - 1)) return 'qteWindowEndTick 越界';
  if (session.qteDirection !== 'contract' && session.qteDirection !== 'expand') return 'qteDirection 非法';
  if (!integerIn(session.growthFactorBp, 0, BP)) return 'growthFactorBp 越界';
  if (!integerIn(session.maxRollChanceBp, 0, BP)) return 'maxRollChanceBp 越界';
  return undefined;
}

export function initializeProgressiveRiskRuntime(session: ProgressiveRiskSession): void {
  if (session.phase !== undefined) return;
  session.phase = 'idle'; session.riskBp = 0; session.riskRemainder = 0; session.elapsedTicks = 0;
  session.targetIndex = 0; session.failedRollsByTarget = session.targets.map(() => 0); session.acquiredIds = [];
  session.qteAttempts = 0; session.qteHits = 0; session.qteMisses = 0; session.qteTick = 0;
  session.qteResolved = false; session.lootRolls = 0; session.lastInputSeq = -1;
  session.signalSeq = 0; session.emittedSignalIds = []; delete session.terminal;
}

export function progressiveRiskRuntimeProblem(session: ProgressiveRiskSession): string | undefined {
  if (!['idle', 'active', 'awaiting-continue', 'terminal'].includes(session.phase ?? '')) return 'phase 非法';
  if (!integerIn(session.riskBp ?? -1, 0, session.riskLimitBp)) return 'riskBp 非法';
  if (!integerIn(session.riskRemainder ?? -1, 0, session.ticksPerSecond - 1)) return 'riskRemainder 非法';
  if (!Number.isSafeInteger(session.elapsedTicks) || (session.elapsedTicks ?? -1) < 0) return 'elapsedTicks 非法';
  if (!Number.isSafeInteger(session.targetIndex) || (session.targetIndex ?? -1) < 0 || (session.targetIndex ?? 0) >= session.targets.length) return 'targetIndex 非法';
  if (!Array.isArray(session.failedRollsByTarget) || session.failedRollsByTarget.length !== session.targets.length || session.failedRollsByTarget.some((n) => !Number.isSafeInteger(n) || n < 0)) return 'failedRollsByTarget 非法';
  if (!Array.isArray(session.acquiredIds)) return 'acquiredIds 非法';
  if (session.acquiredIds.some((id, i) => id !== session.targets[i]?.id)) return 'acquiredIds 不是 targets 前缀';
  for (const n of [session.qteAttempts, session.qteHits, session.qteMisses, session.lootRolls]) {
    if (!Number.isSafeInteger(n) || (n ?? -1) < 0) return 'QTE 统计非法';
  }
  if (!integerIn(session.qteTick ?? -1, 0, session.qteCycleTicks - 1)) return 'qteTick 非法';
  if (typeof session.qteResolved !== 'boolean') return 'qteResolved 非法';
  if (!Number.isSafeInteger(session.lastInputSeq) || (session.lastInputSeq ?? -2) < -1) return 'lastInputSeq 非法';
  if (!Number.isSafeInteger(session.signalSeq) || (session.signalSeq ?? -1) < 0) return 'signalSeq 非法';
  if (!Array.isArray(session.emittedSignalIds)) return 'emittedSignalIds 非法';
  if (session.phase === 'terminal' && !['withdrew', 'exposed', 'cleared', 'aborted'].includes(session.terminal ?? '')) return 'terminal 非法';
  return undefined;
}

export function progressiveRiskReceipt(session: ProgressiveRiskSession, status: ProgressiveRiskTerminal): ProgressiveRiskReceipt {
  return {
    type: 'ProgressiveRiskReceipt', sessionId: session.id, status,
    acquiredIds: [...session.acquiredIds!], riskBp: session.riskBp!, elapsedTicks: session.elapsedTicks!,
    targetIndex: session.targetIndex!, qteAttempts: session.qteAttempts!, qteHits: session.qteHits!,
    qteMisses: session.qteMisses!, lootRolls: session.lootRolls!,
  };
}

export function emitProgressiveRiskSignal(
  world: IWorld, occupied: Set<string>, owner: string, session: ProgressiveRiskSession,
  name: string, arg?: string,
): void {
  let id: string;
  do { id = `progressive-risk:signal:${owner}:${session.signalSeq!++}`; } while (occupied.has(id));
  occupied.add(id);
  world.createEntity(id);
  world.addComponent(id, {
    type: 'Signal', name: `progressive-risk:${name}`, source: owner,
    ...(arg === undefined ? {} : { arg }),
  } as Signal);
  session.emittedSignalIds!.push(id);
}

export function finalizeProgressiveRisk(
  world: IWorld, occupied: Set<string>, owner: string, session: ProgressiveRiskSession,
  status: ProgressiveRiskTerminal, trace: ProgressiveRiskTraceWriter,
): void {
  const from = session.phase!;
  session.phase = 'terminal';
  session.terminal = status;
  const receipt = progressiveRiskReceipt(session, status);
  const current = world.getComponent<ProgressiveRiskReceipt>(owner, 'ProgressiveRiskReceipt');
  if (current) Object.assign(current, receipt);
  else world.addComponent(owner, receipt);
  emitProgressiveRiskSignal(world, occupied, owner, session, 'terminal', status);
  trace('transition', `${session.id}:${from}→terminal`, status);
  trace('commit', `${session.id}:terminal=${status}`, `acquired=${session.acquiredIds!.length},risk=${session.riskBp}`);
}

export function applyProgressivePassiveRisk(session: ProgressiveRiskSession): void {
  const total = session.riskRemainder! + session.riskRateBpPerSecond;
  const add = Math.floor(total / session.ticksPerSecond);
  session.riskRemainder = total % session.ticksPerSecond;
  session.riskBp = Math.min(session.riskLimitBp, session.riskBp! + add);
  session.elapsedTicks!++;
}

export function applyProgressiveQteMiss(
  world: IWorld, occupied: Set<string>, owner: string, session: ProgressiveRiskSession,
  reason: 'press-miss' | 'timeout', trace: ProgressiveRiskTraceWriter,
): void {
  session.qteAttempts!++;
  session.qteMisses!++;
  session.riskBp = Math.min(session.riskLimitBp, session.riskBp! + session.qteMissRiskBp);
  emitProgressiveRiskSignal(world, occupied, owner, session, 'qte', reason);
  trace('decision', `${session.id}:qte=${reason}`, `tick=${session.qteTick},risk+${session.qteMissRiskBp}`);
  if (session.riskBp >= session.riskLimitBp) {
    finalizeProgressiveRisk(world, occupied, owner, session, 'exposed', trace);
  }
}
