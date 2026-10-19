import type { RandomSeed, RiskRevealWheel } from '@engine/protocol/components.js';
import { randomInt } from '@atom-skills/index.js';

const BP = 10_000;
function integerIn(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

export function validateRiskRevealConfig(session: RiskRevealWheel): string | undefined {
  if (!session.id) return 'id 为空';
  if (!integerIn(session.slotCount, 1, 64)) return 'slotCount 越界';
  if (!Array.isArray(session.ringSizes) || session.ringSizes.length === 0
    || session.ringSizes.some((n) => !integerIn(n, 1, session.slotCount))
    || session.ringSizes.reduce((sum, n) => sum + n, 0) !== session.slotCount) return 'ringSizes 与 slotCount 不一致';
  if (!Array.isArray(session.targets) || session.targets.length === 0) return 'targets 为空';
  const ids = new Set<string>();
  for (const target of session.targets) {
    if (!target || typeof target.id !== 'string' || !target.id) return 'target.id 为空';
    if (ids.has(target.id)) return `target.id 重复:${target.id}`;
    ids.add(target.id);
  }
  if (!integerIn(session.blackSlotCount, 0, session.slotCount - 1)) return 'blackSlotCount 越界';
  if (session.blackSlotCount + session.targets.length > session.slotCount) return '封锁位与目标总数超过槽位';
  if (!integerIn(session.riskRateBpPerSecond, 1, BP)) return 'riskRateBpPerSecond 越界';
  if (!integerIn(session.ticksPerSecond, 1, BP)) return 'ticksPerSecond 越界';
  if (!integerIn(session.riskLimitBp, 1, BP)) return 'riskLimitBp 越界';
  if (!integerIn(session.qteCycleTicks, 2, BP)) return 'qteCycleTicks 越界';
  if (!integerIn(session.qteIdealTick, 0, session.qteCycleTicks - 1)) return 'qteIdealTick 越界';
  const maxOffset = Math.max(session.qteIdealTick, session.qteCycleTicks - 1 - session.qteIdealTick);
  if (!integerIn(session.qtePerfectRadiusTicks, 0, maxOffset)) return 'qtePerfectRadiusTicks 越界';
  if (!integerIn(session.qteMaxPenaltyBp, 0, BP)) return 'qteMaxPenaltyBp 越界';
  if (session.revealRule !== undefined && session.revealRule !== 'phase-after-qte'
    && session.revealRule !== 'bank-perfect-during-qte') return 'revealRule 非法';
  if (session.qteTargetRule !== undefined && session.qteTargetRule !== 'fixed'
    && session.qteTargetRule !== 'reshuffle-on-perfect') return 'qteTargetRule 非法';
  if (session.qteTimeoutRule !== undefined && session.qteTimeoutRule !== 'penalize'
    && session.qteTimeoutRule !== 'reset-no-penalty') return 'qteTimeoutRule 非法';
  if (session.qtePressRule !== undefined && session.qtePressRule !== 'reset-to-start'
    && session.qtePressRule !== 'continue-from-press') return 'qtePressRule 非法';
  if (session.qtePressPauseTicks !== undefined
    && !integerIn(session.qtePressPauseTicks, 0, session.qteCycleTicks)) return 'qtePressPauseTicks 越界';
  return undefined;
}

export function riskRevealQtePenaltyBp(session: Pick<RiskRevealWheel,
  'qteCycleTicks' | 'qteIdealTick' | 'qtePerfectRadiusTicks' | 'qteMaxPenaltyBp'>, tick: number): number {
  if (!integerIn(tick, 0, session.qteCycleTicks - 1)) return session.qteMaxPenaltyBp;
  const offset = Math.abs(tick - session.qteIdealTick);
  if (offset <= session.qtePerfectRadiusTicks) return 0;
  const maxOffset = Math.max(session.qteIdealTick, session.qteCycleTicks - 1 - session.qteIdealTick);
  const span = Math.max(1, maxOffset - session.qtePerfectRadiusTicks);
  return Math.min(session.qteMaxPenaltyBp,
    Math.floor(session.qteMaxPenaltyBp * (offset - session.qtePerfectRadiusTicks) / span));
}

function uniqueIntegerSlots(values: number[] | undefined, slotCount: number): boolean {
  return Array.isArray(values) && new Set(values).size === values.length
    && values.every((n) => integerIn(n, 0, slotCount - 1));
}

export function riskRevealRuntimeProblem(session: RiskRevealWheel): string | undefined {
  if (!['idle', 'qte', 'reveal', 'terminal'].includes(session.phase ?? '')) return 'phase 非法';
  if (!integerIn(session.riskBp ?? -1, 0, session.riskLimitBp)) return 'riskBp 非法';
  if (!integerIn(session.riskRemainder ?? -1, 0, session.ticksPerSecond - 1)) return 'riskRemainder 非法';
  if (!Number.isSafeInteger(session.elapsedTicks) || session.elapsedTicks! < 0) return 'elapsedTicks 非法';
  if (!integerIn(session.qteTick ?? -1, 0, session.qteCycleTicks - 1)) return 'qteTick 非法';
  if (!integerIn(session.qtePauseTicks ?? -1, 0, session.qtePressPauseTicks ?? 0)) return 'qtePauseTicks 非法';
  if (!Number.isSafeInteger(session.qteAttempts) || session.qteAttempts! < 0) return 'qteAttempts 非法';
  if (!Number.isSafeInteger(session.perfectQtes) || session.perfectQtes! < 0 || session.perfectQtes! > session.qteAttempts!) return 'perfectQtes 非法';
  if (!integerIn(session.lastQteOffsetTicks ?? -1, 0, session.qteCycleTicks - 1)) return 'lastQteOffsetTicks 非法';
  if (!integerIn(session.lastQtePenaltyBp ?? -1, 0, session.qteMaxPenaltyBp)) return 'lastQtePenaltyBp 非法';
  const creditMax = session.revealRule === 'bank-perfect-during-qte' ? Number.MAX_SAFE_INTEGER : 1;
  if (!integerIn(session.revealCredits ?? -1, 0, creditMax)) return 'revealCredits 非法';
  if (!Number.isSafeInteger(session.lastInputSeq) || session.lastInputSeq! < -1) return 'lastInputSeq 非法';
  if (!Number.isSafeInteger(session.signalSeq) || session.signalSeq! < 0 || !Array.isArray(session.emittedSignalIds)) return 'Signal 运行态非法';
  if (session.phase === 'idle') return undefined;
  if (!uniqueIntegerSlots(session.blackSlots, session.slotCount) || session.blackSlots!.length !== session.blackSlotCount) return 'blackSlots 非法';
  if (!uniqueIntegerSlots(session.revealedSlots, session.slotCount)) return 'revealedSlots 非法';
  if (session.revealedSlots!.some((slot) => session.blackSlots!.includes(slot))) return '封锁位不可翻开';
  if (!Array.isArray(session.slotTargetIds) || session.slotTargetIds.length !== session.slotCount) return 'slotTargetIds 非法';
  const targetIds = new Set(session.targets.map((target) => target.id));
  const placed = session.slotTargetIds.filter((id): id is string => typeof id === 'string');
  if (placed.length !== session.targets.length || new Set(placed).size !== placed.length || placed.some((id) => !targetIds.has(id))) return '目标布局非法';
  if (session.blackSlots!.some((slot) => session.slotTargetIds![slot] !== null)) return '封锁位包含目标';
  if (!Array.isArray(session.acquiredIds) || new Set(session.acquiredIds).size !== session.acquiredIds.length
    || session.acquiredIds.some((id) => !targetIds.has(id))) return 'acquiredIds 非法';
  if (session.revealRule === 'bank-perfect-during-qte' && session.phase === 'reveal') return '持续 QTE 模式不可进入 reveal 相位';
  if (session.phase === 'terminal' && !['withdrew', 'exposed', 'cleared', 'aborted'].includes(session.terminal ?? '')) return 'terminal 非法';
  return undefined;
}

export function placeRiskRevealSlots(session: RiskRevealWheel, rng: RandomSeed): void {
  const order = Array.from({ length: session.slotCount }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  session.blackSlots = order.slice(0, session.blackSlotCount).sort((a, b) => a - b);
  session.slotTargetIds = Array.from({ length: session.slotCount }, () => null);
  session.targets.forEach((target, index) => {
    session.slotTargetIds![order[session.blackSlotCount + index]!] = target.id;
  });
}
