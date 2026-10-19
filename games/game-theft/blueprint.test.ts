import { describe, expect, it } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import type { RandomSeed, RiskRevealWheel } from '@zerocraft/engine/engine/protocol/components.js';
import { buildTheftBlueprint, THEFT_RANDOM_ENTITY, THEFT_SESSION_ENTITY } from './blueprint.js';

describe('game-theft 风险翻格蓝图', () => {
  it('只消费随机与风险翻格能力，并声明 4+12 双环', () => {
    const blueprint = buildTheftBlueprint();
    expect(blueprint.capabilities.map((cap) => cap.id)).toEqual(['w1-random', 't3-risk-reveal-wheel']);
    const engine = new Engine(); engine.load(blueprint); engine.world.tick();
    const session = engine.world.getComponent<RiskRevealWheel>(THEFT_SESSION_ENTITY, 'RiskRevealWheel')!;
    expect(session).toMatchObject({
      phase: 'idle', slotCount: 16, ringSizes: [4, 12], blackSlotCount: 6,
      qteIdealTick: 0, revealRule: 'bank-perfect-during-qte', qteTargetRule: 'reshuffle-on-perfect', qteTimeoutRule: 'reset-no-penalty', qtePressRule: 'continue-from-press', qtePressPauseTicks: 30,
    });
    expect(session.targets.map((target) => target.id)).toEqual(['guard-key', 'silver-watch', 'sealed-letter']);
    expect(engine.world.getComponent<RandomSeed>(THEFT_RANDOM_ENTITY, 'RandomSeed')).toMatchObject({ sequence: 0 });
  });
});
