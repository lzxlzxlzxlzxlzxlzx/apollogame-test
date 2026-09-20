import { s4Units, s4Skills, type S4UnitId, type S4SkillId } from './runtime-selection.js';
export type { S4UnitId, S4SkillId };
/** S4 §3–7 authoring values. All durations remain seconds here.
 * Absent phase values intentionally remain absent: assembly uses named template
 * defaults, never pretends an unspecified value was supplied by the designer. */
export const S4_TICK_RATE = 20;
export function secondsToTicks(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid seconds');
  return Math.ceil(seconds * S4_TICK_RATE - 1e-9);
}
export function speedPerTick(speed: number): number {
  if (!Number.isFinite(speed) || speed < 0) throw new Error('Invalid speed');
  return speed / S4_TICK_RATE;
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
export const S4_BALANCE_V1 = frozen({
  economy: { initialGold: 30, rosterCap: 6, refund: 1, rewards: { victory: 10, defeat: 5, draw: 7 } },
  battlefield: { width: 40, height: 24, player: { minX: -18, maxX: -2, minY: -10, maxY: 10 }, enemy: { minX: 2, maxX: 18, minY: -10, maxY: 10 }, timeoutSeconds: 180 },
  units: s4Units,
  skills: s4Skills,
});
export const S4_UNIT_IDS = Object.freeze(Object.keys(S4_BALANCE_V1.units) as S4UnitId[]);

/** One vocabulary for UI, production command input and the thin adapter. */
export const S4_ACTIONS = Object.freeze({
  select: 'shop.unit.select', buy: 'shop.unit.buy', sell: 'roster.unit.sell', deploy: 'shop.continue',
  place: 'deployment.unit.place', move: 'deployment.unit.move', withdraw: 'deployment.unit.return',
  back: 'deployment.back', start: 'deployment.start', continue: 'result.continue',
});
export const S4_PROJECTIONS = Object.freeze({
  strings: ['phase', 'selected-unit', 'outcome'],
  resources: ['gold', 'round', 'owned-count', 'deployed-count', 'player-alive', 'enemy-alive', 'battle-seconds', 'player-damage', 'enemy-damage'],
  flags: ['can-enter-deploy', 'can-start-battle', 'battle-settled'],
});
export const S4_ENEMY_PRESETS = frozen({
  'standard-round1': ['vindicator', 'vindicator', 'skeleton', 'vex'],
  'standard-later': ['vindicator', 'skeleton', 'vex', 'elephant'],
  'single-vindicator': ['vindicator'],
  'elephant-trio': ['elephant', 'elephant', 'elephant'],
} satisfies Record<string, S4UnitId[]>);
