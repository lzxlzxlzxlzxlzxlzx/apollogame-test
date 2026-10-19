import type { EntityBlueprint, WorldBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import { randomCapability } from '@zerocraft/engine/atom-skills/index.js';
import { riskRevealWheelCapability } from '@zerocraft/engine/skills/tier3/index.js';
import {
  DEFAULT_THEFT_CONFIG,
  THEFT_INNER_SLOTS,
  THEFT_OUTER_SLOTS,
  THEFT_QTE_CYCLE_TICKS,
  THEFT_QTE_IDEAL_TICK,
  THEFT_QTE_MAX_PENALTY_BP,
  THEFT_QTE_PERFECT_RADIUS_TICKS,
  THEFT_RISK_LIMIT_BP,
  THEFT_SLOT_COUNT,
  THEFT_TICKS_PER_SECOND,
  validateTheftConfig,
  type TheftGameConfig,
} from './config.js';

export const THEFT_SESSION_ENTITY = 'theft-session';
export const THEFT_RANDOM_ENTITY = 'theft-random';

/** 只装配数据；布局、风险、QTE 精准度、翻格与回执全部由通用 capability 解释。 */
export function buildTheftBlueprint(config: TheftGameConfig = DEFAULT_THEFT_CONFIG): WorldBlueprint {
  const issues = validateTheftConfig(config);
  if (issues.length > 0) throw new Error(`Invalid game-theft config: ${issues.join('; ')}`);
  const session: EntityBlueprint = {
    RiskRevealWheel: {
      id: config.sessionId,
      slotCount: THEFT_SLOT_COUNT,
      ringSizes: [THEFT_INNER_SLOTS, THEFT_OUTER_SLOTS],
      targets: config.items.map((item) => ({ id: item.entryId })),
      blackSlotCount: config.difficulty.blackSlotCount,
      riskRateBpPerSecond: config.difficulty.exposureRateBpPerSecond,
      ticksPerSecond: THEFT_TICKS_PER_SECOND,
      riskLimitBp: THEFT_RISK_LIMIT_BP,
      qteCycleTicks: THEFT_QTE_CYCLE_TICKS,
      qteIdealTick: THEFT_QTE_IDEAL_TICK,
      qtePerfectRadiusTicks: THEFT_QTE_PERFECT_RADIUS_TICKS,
      qteMaxPenaltyBp: THEFT_QTE_MAX_PENALTY_BP,
      revealRule: 'bank-perfect-during-qte',
      qteTargetRule: 'reshuffle-on-perfect',
      qteTimeoutRule: 'reset-no-penalty',
      qtePressRule: 'continue-from-press',
      qtePressPauseTicks: THEFT_TICKS_PER_SECOND / 2,
    },
  };
  return {
    meta: { tickRate: THEFT_TICKS_PER_SECOND },
    capabilities: [randomCapability, riskRevealWheelCapability],
    entities: {
      [THEFT_RANDOM_ENTITY]: { RandomSeed: { seed: config.seed, sequence: 0 } },
      [THEFT_SESSION_ENTITY]: session,
    },
  };
}
