import { describe, expect, it } from 'vitest';
import type { RiskRevealWheel } from '@engine/protocol/components.js';
import { riskRevealQtePenaltyBp, validateRiskRevealConfig } from './risk-reveal-wheel-core.js';

function config(): RiskRevealWheel {
  return {
    type: 'RiskRevealWheel', id: 'run', slotCount: 16, ringSizes: [4, 12], targets: [{ id: 'a' }],
    blackSlotCount: 6, riskRateBpPerSecond: 60, ticksPerSecond: 60, riskLimitBp: 10_000,
    qteCycleTicks: 10, qteIdealTick: 5, qtePerfectRadiusTicks: 1, qteMaxPenaltyBp: 1_000,
  };
}

describe('risk-reveal-wheel-core', () => {
  it('黑位与目标占位超容量时拒收', () => {
    expect(validateRiskRevealConfig({
      ...config(), blackSlotCount: 15, targets: [{ id: 'a' }, { id: 'b' }],
    })).toContain('超过槽位');
  });

  it('持续 QTE 规则是闭集字段', () => {
    expect(validateRiskRevealConfig({ ...config(), revealRule: 'bank-perfect-during-qte' })).toBeUndefined();
    expect(validateRiskRevealConfig({ ...config(), revealRule: 'elsewhere' as never })).toContain('revealRule');
    expect(validateRiskRevealConfig({ ...config(), qteTargetRule: 'reshuffle-on-perfect' })).toBeUndefined();
    expect(validateRiskRevealConfig({ ...config(), qteTargetRule: 'elsewhere' as never })).toContain('qteTargetRule');
    expect(validateRiskRevealConfig({ ...config(), qteTimeoutRule: 'reset-no-penalty' })).toBeUndefined();
    expect(validateRiskRevealConfig({ ...config(), qteTimeoutRule: 'elsewhere' as never })).toContain('qteTimeoutRule');
    expect(validateRiskRevealConfig({ ...config(), qtePressPauseTicks: 3 })).toBeUndefined();
    expect(validateRiskRevealConfig({ ...config(), qtePressPauseTicks: -1 })).toContain('qtePressPauseTicks');
  });

  it('精准区零惩罚，区外单调增长', () => {
    const session = config();
    expect(riskRevealQtePenaltyBp(session, 5)).toBe(0);
    expect(riskRevealQtePenaltyBp(session, 8)).toBeGreaterThan(riskRevealQtePenaltyBp(session, 7));
  });
});
