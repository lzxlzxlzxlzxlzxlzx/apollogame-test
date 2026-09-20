import { describe, it, expect } from 'vitest';
import { createFixture, observe, UNIT, read, HARD_CONTROL } from './s2-round2.fixture.js';

// Post-tick table fixed before execution: start s -> W(s,s+1), A(s+2), R(s+3,s+4), Ready(s+5).
// Timer reset at start Commit; eligible again at s+8. Initial cd=3 expires at tick3.
const expectedPhase = (t: number, start: number) => {
  if (t < start) return 'Ready';
  return ['Windup', 'Windup', 'Active', 'Recovery', 'Recovery', 'Ready', 'Ready', 'Ready'][(t - start) % 8];
};
describe('S2 round2 A: repeated lifecycle with committed target', () => {
  it('two identical templates complete three timing cycles with one marker at each Active', () => {
    const original = JSON.stringify(UNIT), w = createFixture();
    const trajectory = [];
    for (let t = 1; t <= 24; t++) {
      w.tick();
      const rows = observe(w, t); trajectory.push(...rows);
      for (const [i, r] of rows.entries()) {
        const start = i === 0 ? 1 : 3;
        expect(r.phase, JSON.stringify(r)).toBe(expectedPhase(t, start));
        expect(r.cooldown, JSON.stringify(r)).toBe(t < start ? 3 - t : 8 - ((t - start) % 8));
        expect(r.effects, JSON.stringify(r)).toBe(t < start + 2 ? 0 : Math.floor((t - start - 2) / 8) + 1);
        expect(r.castOrdinal).toBe(t < start ? 0 : Math.floor((t - start) / 8) + 1);
      }
    }
    expect(observe(w, 24).map(r => r.effects)).toEqual([3, 3]);
    expect(JSON.stringify(UNIT)).toBe(original);
    console.log('ROUND2_STATIC_TRACE', JSON.stringify(trajectory));
  });
  it('pursuit can change during Windup without replacing the committed target', () => {
    const w = createFixture(true), trajectory = [];
    for (let t = 1; t <= 3; t++) { w.tick(); trajectory.push(observe(w, t)[0]); }
    expect(trajectory[0].pursuit).toBe('a-original');
    expect(trajectory[1].pursuit).toBe('a-alternative');
    expect(trajectory[2].phase).toBe('Active');
    expect(trajectory[2].lockedTarget).toBe('a-original');
    expect(trajectory[2].effectX).toEqual([31]);
    console.log('ROUND2_LOCKED_MOVEMENT_TRACE', JSON.stringify(trajectory));
  });
  it('Windup target death cancels without substitute effect or cooldown refund', () => {
    const w = createFixture();
    w.tick();
    expect(observe(w, 1)[0].pursuit).toBe('a-original');
    // Permitted external damage input, not a direct stage/target/death mutation.
    w.addComponent('a-original', { type: 'ResourceModify', resourceId: 'hp', amount: -100, scope: 'local' } as any);
    w.tick();
    expect(read(w, 'a-original', 'Transform')).toBeUndefined();
    w.tick();
    const row = observe(w, 3)[0];
    expect(row.phase).toBe('Recovery');
    expect(row.effects).toBe(0);
    expect(row.lockedTarget).toBeNull();
    expect(row.cooldown).toBe(6);
    console.log('ROUND2_DEATH_CANCEL_TRACE', JSON.stringify(row));
  });
  it('hard control in Windup cancels the pending effect and keeps the started cooldown', () => {
    const w = createFixture();
    w.tick();
    read(w, 'unit#0:body', 'Status').flags = HARD_CONTROL;
    w.tick();
    const row = observe(w, 2)[0];
    expect(row.phase).toBe('Recovery');
    expect(row.effects).toBe(0);
    expect(row.lockedTarget).toBeNull();
    expect(row.cooldown).toBe(7);
    console.log('ROUND2_INTERRUPT_CANCEL_TRACE', JSON.stringify(row));
  });
  it('repeated cancellation input produces no delayed effect or stale committed target', () => {
    const w = createFixture();
    w.tick();
    read(w, 'unit#0:body', 'Status').flags = HARD_CONTROL;
    for (let tick = 2; tick <= 6; tick++) w.tick();
    expect(read(w, 'unit#0:body', 'GameFlow').targetSnapshot).toBeUndefined();
    expect(w.query('PrefabOrigin').filter(([entity]) => read(w, entity, 'PrefabOrigin')?.source === 'unit#0:body')).toHaveLength(0);
    expect(read(w, 'unit#0:body', 'Timer').elapsed).toBe(5); // cancelled start never refunds its cooldown
  });
  it('source death cascades skill bindings and prevents later effects', () => {
    const w = createFixture();
    w.tick();
    w.addComponent('unit#0:body', { type: 'DestroyRequest', entityId: 'unit#0:body' } as any);
    w.tick();
    expect(read(w, 'unit#0:body', 'GameFlow')).toBeUndefined();
    expect(read(w, 'unit#0:active', 'Caster')).toBeUndefined();
    w.tick();
    expect(w.query('PrefabOrigin').filter(([entity]) => read(w, entity, 'PrefabOrigin')?.sourceId === 'unit#0:body')).toHaveLength(0);
  });
  it('a recreated world starts without prior targets, timers, statuses, or effects', () => {
    const first = createFixture();
    first.tick();
    read(first, 'unit#0:body', 'Status').flags = HARD_CONTROL;
    first.tick();
    const second = createFixture();
    expect(read(second, 'unit#0:body', 'GameFlow').targetSnapshot).toBeUndefined();
    expect(read(second, 'unit#0:body', 'Timer').elapsed).toBe(8);
    expect(read(second, 'unit#0:body', 'Status').flags).toBe(0);
    expect(second.query('PrefabOrigin').filter(([entity]) => read(second, entity, 'PrefabOrigin')?.source === 'unit#0:body')).toHaveLength(0);
  });
});
