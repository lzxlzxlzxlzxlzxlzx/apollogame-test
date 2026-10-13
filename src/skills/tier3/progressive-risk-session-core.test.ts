import { describe, expect, it } from 'vitest';
import type { ProgressiveRiskSession } from '@engine/protocol/components.js';
import {
  initializeProgressiveRiskRuntime,
  progressiveChanceBp,
  progressiveRiskRuntimeProblem,
} from './progressive-risk-session-core.js';

describe('progressive-risk-session-core', () => {
  it('概率成长仅用整数基点并钳制上限', () => {
    expect(progressiveChanceBp(910, 2, 1_500, 9_500)).toBe(1_183);
    expect(progressiveChanceBp(9_000, 10, 10_000, 9_500)).toBe(9_500);
  });

  it('初始化后运行态自洽', () => {
    const session = {
      type: 'ProgressiveRiskSession', id: 'run', targets: [{ id: 'a', initialChanceBp: 5_000 }],
      riskRateBpPerSecond: 60, ticksPerSecond: 60, riskLimitBp: 10_000, qteMissRiskBp: 1_000,
      qteCycleTicks: 10, qteWindowStartTick: 2, qteWindowEndTick: 4, qteDirection: 'contract',
      growthFactorBp: 1_500, maxRollChanceBp: 9_500,
    } as ProgressiveRiskSession;
    initializeProgressiveRiskRuntime(session);
    expect(progressiveRiskRuntimeProblem(session)).toBeUndefined();
  });
});
