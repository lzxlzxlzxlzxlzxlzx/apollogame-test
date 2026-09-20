import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Resource, Tag } from '@engine/protocol/components.js';
import { S4Session, type S4BattleFactory } from './s4-session.js';
import { S4_ACTIONS as A, S4_BALANCE_V1 as B } from './content/s4-balance.js';
import { renderS4, readS4View } from './s4-render.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import { s4TeamMask } from './s4-world.js';

// Session unit tests use a passive world, not evidence of actual combat. Production walkthrough is separate.
const passive: S4BattleFactory = units => {
  const world = new World(); for (const u of units) { world.createEntity(u.instanceId); world.addComponent(u.instanceId, { type: 'Resource', id: 'hp', current: B.units[u.unitId].hp, max: B.units[u.unitId].hp, min: 0 } as Resource); world.addComponent(u.instanceId, { type: 'Tag', flags: s4TeamMask(u.team) } as Tag); }
  return { world, tick: () => world.tick(), dispose: () => world.getAllEntities().forEach(id => world.destroyEntity(id)), bodyId: id => id };
};
describe('S4 production session', () => {
  it('selection is free; price, capacity, duplicate IDs and phase guards are atomic', () => {
    const s = new S4Session(1, passive); s.command(A.select, { unitId: 'witch' }); expect(s.gold).toBe(30); expect(s.selectedUnitId).toBe('witch');
    for (let i = 0; i < 7; i++) s.command(A.buy, { unitId: 'vindicator' });
    expect(s.roster).toHaveLength(6); expect(s.gold).toBe(0); expect(new Set(s.roster.map(r => r.instanceId)).size).toBe(6);
    s.command(A.sell, { instanceId: s.roster[0]!.instanceId }); expect(s.gold).toBe(5); expect(s.roster).toHaveLength(5);
    s.command(A.deploy); s.command(A.buy, { unitId: 'vindicator' }); expect(s.gold).toBe(5);
  });
  it('real drag-place rejects enemy, overlap and full-circle overflow; returns and back preserve positions', () => {
    const s = new S4Session(1, passive); for (const unitId of ['vindicator', 'skeleton']) s.command(A.buy, { unitId }); s.command(A.deploy);
    const id = s.roster[0]!.instanceId, other = s.roster[1]!.instanceId;
    s.command(A.place, { instanceId: id, x: 8, y: 0 }); expect(s.deployed).toHaveLength(0);
    s.command(A.place, { instanceId: id, x: -10, y: 0 }); expect(s.deployed).toHaveLength(1);
    s.command(A.place, { instanceId: other, x: -10, y: 0 }); expect(s.deployed).toHaveLength(1);
    s.command(A.move, { instanceId: id, x: -2.1, y: 0 }); expect(s.placement(id)!.x).toBe(-10);
    s.command(A.back); s.command(A.deploy); expect(s.placement(id)!.x).toBe(-10);
    s.command(A.withdraw, { instanceId: id }); expect(s.deployed).toHaveLength(0); expect(s.roster).toHaveLength(2); expect(s.gold).toBe(19);
  });
  it('start blocks an active gesture; result freezes complete ticks and continuation clears the whole round', () => {
    const s = new S4Session(1, passive, { enemyPreset: 'single-vindicator' }); s.command(A.buy, { unitId: 'vindicator' }); s.command(A.deploy);
    s.command(A.place, { instanceId: s.roster[0]!.instanceId, x: -8, y: 0 }); s.dragging = s.roster[0]!.instanceId; s.command(A.start); expect(s.phase).toBe('deploy');
    s.dragging = null; s.command(A.start); expect(s.phase).toBe('battle');
    for (const u of s.unitsInBattle(2)) s.world.getComponent<Resource>(u.id, 'Resource')!.current = 0;
    s.tick(); expect(s.outcome).toBe('victory'); expect(s.gold).toBe(35); const version = s.world.getVersion();
    for (let i = 0; i < 5; i++) { s.tick(); s.command(A.sell, { instanceId: s.roster[0]!.instanceId }); }
    expect(s.world.getVersion()).toBe(version); expect(s.gold).toBe(35);
    const old = s.world; s.command(A.continue); expect(old.getAllEntities()).toHaveLength(0); expect(s.round).toBe(2); expect(s.roster).toHaveLength(0); expect(s.gold).toBe(35);
  });
  it('equal living HP ratios and equal counts draw on timeout', () => {
    const s = new S4Session(2, passive, { enemyPreset: 'single-vindicator' }); s.command(A.buy, { unitId: 'vindicator' }); s.command(A.deploy); s.command(A.place, { instanceId: s.roster[0]!.instanceId, x: -8, y: 0 }); s.command(A.start);
    s.battleTicks = 3599; s.tick(); expect(s.outcome).toBe('draw'); expect(s.gold).toBe(32);
  });
  it('timeout prefers a higher living HP ratio over the opponent larger army, then count when ratios tie', () => {
    for (const tie of [false, true]) {
      const s = new S4Session(2, passive, { enemyPreset: 'elephant-trio' });
      s.command(A.buy, { unitId: 'vindicator' }); s.command(A.deploy); s.command(A.place, { instanceId: s.roster[0]!.instanceId, x: -8, y: 0 }); s.command(A.start);
      const p = s.unitsInBattle(1), e = s.unitsInBattle(2); expect(p).toHaveLength(1); expect(e).toHaveLength(3);
      s.world.getComponent<Resource>(p[0]!.id, 'Resource')!.current = tie ? 30 : 60;
      for (const u of e) s.world.getComponent<Resource>(u.id, 'Resource')!.current = 55;
      s.battleTicks = 3599; s.tick();
      expect(s.outcome).toBe(tie ? 'defeat' : 'victory'); expect(s.gold).toBe(tie ? 30 : 35);
    }
  });
  it('both armies at zero at the same completed tick draw without timeout, reward once and retain history', () => {
    const s = new S4Session(2, passive, { enemyPreset: 'single-vindicator' });
    s.command(A.buy, { unitId: 'vindicator' }); s.command(A.deploy); s.command(A.place, { instanceId: s.roster[0]!.instanceId, x: -8, y: 0 }); s.command(A.start);
    for (const u of [...s.unitsInBattle(1), ...s.unitsInBattle(2)]) s.world.getComponent<Resource>(u.id, 'Resource')!.current = 0;
    s.tick(); expect(s.outcome).toBe('draw'); expect(s.battleTicks).toBe(1); expect(s.gold).toBe(32);
    s.tick(); expect(s.results).toHaveLength(1); expect(s.gold).toBe(32);
    s.command(A.continue); expect(s.results[0]).toMatchObject({ outcome: 'draw', playerAlive: 0, enemyAlive: 0, ticks: 1 });
  });
  it('shop LayoutNode data validates for all six selections', () => {
    const s = new S4Session(1, passive); for (const unitId of Object.keys(B.units)) { s.command(A.select, { unitId }); expect(validateLayoutNode(renderS4(readS4View(s)))).toEqual([]); }
  });
});
