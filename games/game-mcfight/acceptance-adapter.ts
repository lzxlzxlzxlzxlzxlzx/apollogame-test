import { S4Session, createS4Battle, type S4Config } from './s4-session.js';
import { S4_PROJECTIONS, S4_TICK_RATE } from './content/s4-balance.js';

/** Thin production-session bridge. Scenario-owned data is never rewritten or cached here. */
export function createWorld(seed: number, config: S4Config = {}) {
  const session = new S4Session(seed, createS4Battle, config);
  return {
    session,
    tick: () => session.tick(),
    getAllEntities: () => [...session.world.getAllEntities(), ...Object.values(S4_PROJECTIONS).flat().map(id => `acceptance:${id}`)],
    getComponent(id: string, type: string): unknown {
      if (!id.startsWith('acceptance:')) return session.world.getComponent(id, type);
      const key = id.slice('acceptance:'.length);
      const strings: Record<string, string> = { phase: session.phase, 'selected-unit': session.selectedUnitId, outcome: session.outcome };
      const resources: Record<string, number> = { gold: session.gold, round: session.round, 'owned-count': session.roster.length, 'deployed-count': session.deployed.length, 'player-alive': session.unitsInBattle(1).length, 'enemy-alive': session.unitsInBattle(2).length, 'battle-seconds': session.battleTicks / S4_TICK_RATE, 'player-damage': session.playerDamage, 'enemy-damage': session.enemyDamage, 'player-healing': session.playerHealing, 'enemy-healing': session.enemyHealing };
      const flags: Record<string, boolean> = { 'can-enter-deploy': session.canEnterDeploy, 'can-start-battle': session.canStartBattle, 'battle-settled': session.phase === 'result' };
      if (type === 'StringVar' && key in strings) return { id: key, value: strings[key] };
      if (type === 'Resource' && key in resources) return { id: key, current: resources[key] };
      if (type === 'Flag' && key in flags) return { id: key, active: flags[key] };
      return undefined;
    },
  };
}
type AcceptanceWorld = ReturnType<typeof createWorld>;
export function applySignal(world: AcceptanceWorld, signal: string, args: Record<string, unknown> = {}): void { world.session.command(signal, args); }
export function readWorld(world: AcceptanceWorld): AcceptanceWorld { return world; }
