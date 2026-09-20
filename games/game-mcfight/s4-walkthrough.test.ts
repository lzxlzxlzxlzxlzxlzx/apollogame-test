import { expect, it } from 'vitest';
import { S4Session } from './s4-session.js';
import { S4_ACTIONS as A } from './content/s4-balance.js';
import { hashSnapshot } from '@net/determinism.js';

function journey(seed: number) {
  const s = new S4Session(seed, undefined, { enemyPreset: 'single-vindicator' });
  s.command(A.buy, { unitId: 'earthshaker' });
  expect(s.gold).toBe(18);
  s.command(A.deploy);
  s.command(A.place, { instanceId: 'player-earthshaker-1', x: -8, y: 0 });
  expect(s.canStartBattle).toBe(true);
  s.command(A.start);
  const trace: object[] = [];
  while (s.phase === 'battle' && s.battleTicks < 3600) {
    s.tick();
    if (s.battleTicks % 20 === 0 || s.phase !== 'battle') trace.push({ tick: s.battleTicks, hash: hashSnapshot(s.world.snapshot()), playerDamage: s.playerDamage, enemyDamage: s.enemyDamage });
  }
  expect(s.phase).toBe('result'); expect(s.outcome).toBe('victory'); expect(s.gold).toBe(28);
  expect(s.playerDamage).toBeGreaterThan(0); expect(s.enemyDamage).toBeGreaterThan(0);
  const terminal = hashSnapshot(s.world.snapshot());
  for (let i = 0; i < 20; i++) s.tick();
  expect(hashSnapshot(s.world.snapshot())).toBe(terminal);
  const result = { ...s.results[0] };
  s.command(A.continue);
  expect(s.phase).toBe('shop'); expect(s.round).toBe(2); expect(s.gold).toBe(28);
  expect(s.roster).toHaveLength(0); expect(s.world.query('GameFlow')).toHaveLength(0);
  expect(s.world.query('Hitbox')).toHaveLength(0); expect(s.world.query('SpawnRequest')).toHaveLength(0);
  expect(s.world.query('CommittedContact')).toHaveLength(0);
  s.command(A.buy, { unitId: 'skeleton' }); expect(s.gold).toBe(22);
  s.dispose();
  return { trace, result };
}
it('formal production journey purchases, deploys, fights, freezes result and buys next round deterministically', () => {
  const a = journey(1), b = journey(1), c = journey(1);
  expect(b).toEqual(a); expect(c).toEqual(a);
  console.log('S4_THREE_REPLAYS', JSON.stringify(a));
});
