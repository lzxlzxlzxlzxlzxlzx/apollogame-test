import { expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Component } from '@engine/core/types.js';
import type { Flag } from '@engine/protocol/components.js';
import { zoneOccupancyCapability } from '@skills/tier2/zone-occupancy.js';
import { overlapDetectCapability } from '@skills/atoms/overlap-detect/index.js';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { QueuedInputSource } from '@net/queued-input.js';
import { assembleS4World, spawnS4Unit } from './s4-world.js';
import type { Resource, State, GameFlow, Status, Transform, Timer } from '@engine/protocol/components.js';
import { ZONE_FLAG } from '@skills/tier2/trigger-zone.js';
import { analyzeSystemGraph } from '@assembly/system-graph.js';
import { s4Capabilities } from './s4-world.js';
import { ALL_CAPABILITIES } from '@assembly/capability-registry.js';

function add(w: World, id: string, components: Record<string, object>) {
  w.createEntity(id);
  for (const [type, data] of Object.entries(components)) w.addComponent(id, { type, ...data } as Component);
}
const at = (x: number, y = 0, rotation = 0) => ({ x, y, rotation, scaleX: 1, scaleY: 1 });

// Characterization counterexamples: passing means the gap was reproduced,
// not that the S4 mechanism meets acceptance.
it('S4 gap: hierarchy-positioned Zone still checks its fixed world rectangle', () => {
  const w = new World();
  zoneOccupancyCapability.systems.forEach(s => w.addSystem(s));
  add(w, 'witch', { Transform: at(10) });
  add(w, 'sensor', { Transform: at(10), Hierarchy: { parentId: 'witch', localX: 0, localY: 0 },
    Zone: { outFlag: 'unsafe', minX: -3, maxX: 3, minY: -3, maxY: 3, requiredTag: 2, count: 1 } });
  add(w, 'flag', { Flag: { id: 'unsafe', active: false } });
  add(w, 'enemy', { Transform: at(11), Tag: { flags: 2 } });
  w.tick();
  expect(w.getComponent<Flag>('flag', 'Flag')!.active).toBe(false);
  console.log('S4_SAFE_HEAL_GAP', JSON.stringify({ witchX: 10, enemyX: 11, actualUnsafe: false, requiredUnsafe: true }));
});

it('S4 gap: rotated box remains axis aligned, so a diagonal beam misses its centerline', () => {
  const w = new World();
  overlapDetectCapability.systems.forEach(s => w.addSystem(s));
  add(w, 'beam', { Transform: at(0, 0, Math.PI / 4), Shape: { kind: 'box', width: 10, height: .6 } });
  add(w, 'enemy', { Transform: at(2, 2), Shape: { kind: 'circle', radius: .5 } });
  w.tick();
  expect(w.query('Overlap')).toHaveLength(0);
  console.log('S4_BEAM_GAP', JSON.stringify({ target: [2, 2], actualContacts: 0, requiredContacts: 1 }));
});

it.each(['vindicator', 'skeleton', 'vex', 'elephant', 'earthshaker', 'witch'] as const)('S4 expressible subset: %s runs a real attack chain', unit => {
  const engine = new Engine({ tickRate: 20, input: new QueuedInputSource('s4-test') });
  assembleS4World(engine);
  const source = spawnS4Unit(engine.world, unit, 'player', 1, -4, 0);
  const target = spawnS4Unit(engine.world, 'vindicator', 'enemy', 2, 4, 0);
  engine.world.getComponent<State>('session', 'State')!.current = 'battle';
  let observedDamage = false;
  const releases = new Set<string>();
  for (let tick = 1; tick <= 300; tick++) {
    engine.world.tick();
    const hp = engine.world.getComponent<Resource>(target, 'Resource');
    if (!hp || hp.current < 60) observedDamage = true;
    for (const [id] of engine.world.query('GameFlow')) {
      const f = engine.world.getComponent<GameFlow>(id, 'GameFlow')!;
      if (id.startsWith('player#') && f.current === 'Active') releases.add(f.id);
    }
    if (observedDamage) break;
  }
  console.log('S4_PARTIAL_COMBAT', JSON.stringify({ unit, source, observedDamage, releases: [...releases] }));
  expect(observedDamage).toBe(true);
  expect(releases.size).toBeGreaterThan(0);
});

it('S4 area eligibility uses the real ground-window mask, including airborne exclusion', () => {
  const engine = new Engine({ tickRate: 20, input: new QueuedInputSource('s4-area') });
  assembleS4World(engine);
  add(engine.world, 'area', { Transform: at(0), Shape: { kind: 'circle', radius: 2.2 }, Tag: { flags: ZONE_FLAG },
    Hitbox: { resource: 'hp', amount: 20, targetMask: 2, requireMask: 8, consumeOnHit: true } });
  for (const [id, flags, y] of [['ground', 8, -1], ['air', 4, 1]] as const) add(engine.world, id, {
    Transform: at(0, y), Shape: { kind: 'circle', radius: .5 }, Tag: { flags: 2 }, Status: { flags }, Resource: { id: 'hp', current: 50, min: 0, max: 50 },
  });
  engine.world.tick();
  expect(engine.world.getComponent<Resource>('ground', 'Resource')!.current).toBe(30);
  expect(engine.world.getComponent<Resource>('air', 'Resource')!.current).toBe(50);
  expect(engine.world.hasComponent('area', 'Hitbox')).toBe(false);
});

it('S4 three elephants resolve actual enemy damage against a single melee unit', () => {
  const engine = new Engine({ tickRate: 20, input: new QueuedInputSource('s4-enemy') });
  assembleS4World(engine);
  const target = spawnS4Unit(engine.world, 'vindicator', 'player', 1, -8, 0);
  for (let i = 0; i < 3; i++) spawnS4Unit(engine.world, 'elephant', `enemy${i}`, 2, 8, (i - 1) * 3);
  engine.world.getComponent<State>('session', 'State')!.current = 'battle';
  const trace = [];
  for (let tick = 1; tick <= 300; tick++) {
    engine.world.tick();
    if (tick % 30 === 0) trace.push({ tick, hp: engine.world.getComponent<Resource>(target, 'Resource')?.current,
      skills: engine.world.query('GameFlow').map(([id]) => ({ id, phase: engine.world.getComponent<GameFlow>(id, 'GameFlow')!.current, target: engine.world.getComponent<GameFlow>(id, 'GameFlow')!.targetSnapshot?.targetId })) });
  }
  console.log('S4_ENEMY_TRACE', JSON.stringify(trace));
  expect(engine.world.getComponent<Resource>(target, 'Resource')?.current ?? 0).toBeLessThan(60);
});

it('S4 two real dives complete three offset 9/7/9-tick cycles with synchronous movement and windows', () => {
  const engine = new Engine({ tickRate: 20, input: new QueuedInputSource('s4-dive-cycles') });
  assembleS4World(engine);
  for (const [name, y] of [['alpha', -10], ['beta', 10]] as const) {
    spawnS4Unit(engine.world, 'vex', name, 1, -2.4, y);
    add(engine.world, `${name}-target`, { Transform: at(0, y), Shape: { kind: 'circle', radius: .7 }, Tag: { flags: 4 }, Status: { flags: 8 }, Resource: { id: 'hp', current: 1000, min: 0, max: 1000 } });
  }
  engine.world.getComponent<Timer>('beta#0:dive', 'Timer')!.elapsed -= 8; // initial offset only
  engine.world.getComponent<State>('session', 'State')!.current = 'battle';
  const trace: Array<{ tick: number; id: string; phase: string; x: number; ground: boolean; hp: number; cd: number }> = [];
  for (let tick = 1; tick <= 135; tick++) {
    engine.world.tick();
    for (const id of ['alpha', 'beta']) trace.push({ tick, id,
      phase: engine.world.getComponent<GameFlow>(`${id}#0:dive`, 'GameFlow')!.current,
      x: engine.world.getComponent<Transform>(`${id}#0:body`, 'Transform')!.x,
      ground: !!(engine.world.getComponent<Status>(`${id}#0:body`, 'Status')!.flags & 8),
      hp: engine.world.getComponent<Resource>(`${id}-target`, 'Resource')!.current,
      cd: engine.world.getComponent<Timer>(`${id}#0:dive`, 'Timer')!.elapsed,
    });
  }
  console.log('S4_DIVE_CYCLES', JSON.stringify(trace));
  for (const id of ['alpha', 'beta']) {
    const frames = trace.filter(r => r.id === id);
    const starts = frames.filter((r, i) => r.phase === 'Prepare' && frames[i - 1]?.phase !== 'Prepare').map(r => r.tick);
    expect(starts).toHaveLength(3);
    for (const start of starts) {
      const row = (offset: number) => frames.find(r => r.tick === start + offset)!;
      expect(row(0)).toMatchObject({ phase: 'Prepare', ground: false, cd: 0 });
      expect(row(1)).toMatchObject({ phase: 'Windup', ground: true });
      expect(row(10)).toMatchObject({ phase: 'Active', ground: true });
      expect(row(17)).toMatchObject({ phase: 'Recovery', ground: true });
      expect(row(25)).toMatchObject({ phase: 'ClosePrepare', ground: true });
      expect(row(26)).toMatchObject({ phase: 'Ready', ground: false });
      expect(row(17).x).toBeCloseTo(row(24).x, 10); // no ground displacement during rise
    }
    if (id === 'alpha') expect(frames[1]!.x - frames[0]!.x).toBeCloseTo(.2, 10);
    expect(frames.at(-1)!.hp).toBe(958);
    expect(frames.filter((r, i) => i > 0 && r.hp < frames[i - 1]!.hp)).toHaveLength(3);
  }
  expect(trace.find(r => r.id === 'alpha' && r.tick === 2)!.ground).toBe(true);
  expect(trace.find(r => r.id === 'beta' && r.tick === 2)!.ground).toBe(false);
});

it('S4 melee retains the S2 commitment after target Flow closes its window and real motion retreats', () => {
  const engine = new Engine({ tickRate: 20, input: new QueuedInputSource('s4-commitment') });
  assembleS4World(engine);
  const source = spawnS4Unit(engine.world, 'vindicator', 'player', 1, 0, 0);
  add(engine.world, 'retreating', { Transform: at(1), Velocity: { vx: 2, vy: 0 }, Shape: { kind: 'circle', radius: .7 }, Tag: { flags: 4 },
    Status: { flags: 8 }, Resource: { id: 'hp', current: 100, max: 100, min: 0 },
    // Exactly the production Flow/window pattern used by the S2 commitment probe.
    GameFlow: { id: 'rise', current: 'Rise', entered: false, states: [{ id: 'Rise', onEnter: [
      { kind: 'set-status', targetEntity: 'retreating', targetId: '4', value: true },
      { kind: 'set-status', targetEntity: 'retreating', targetId: '8', value: false },
    ] }] } });
  add(engine.world, 'alternate', { Transform: at(1, 1), Shape: { kind: 'circle', radius: .7 }, Tag: { flags: 4 }, Status: { flags: 8 }, Resource: { id: 'hp', current: 100, max: 100, min: 0 } });
  engine.world.getComponent<State>('session', 'State')!.current = 'battle';
  const trace = [];
  for (let tick = 1; tick <= 36; tick++) {
    engine.world.tick();
    trace.push({ tick, phase: engine.world.getComponent<GameFlow>('player#0:slash', 'GameFlow')!.current,
      captured: engine.world.getComponent<GameFlow>('player#0:slash', 'GameFlow')!.targetSnapshot?.targetId,
      sourceX: engine.world.getComponent<Transform>(source, 'Transform')!.x,
      targetX: engine.world.getComponent<Transform>('retreating', 'Transform')!.x,
      ground: !!(engine.world.getComponent<Status>('retreating', 'Status')!.flags & 8),
      hp: engine.world.getComponent<Resource>('retreating', 'Resource')!.current,
      alternateHP: engine.world.getComponent<Resource>('alternate', 'Resource')!.current,
    });
  }
  console.log('S4_COMMITTED_RETREAT', JSON.stringify(trace));
  expect(trace[0]).toMatchObject({ phase: 'Windup', captured: 'retreating' });
  expect(trace[1]!.ground).toBe(false);
  expect(trace[7]).toMatchObject({ phase: 'Active', hp: 100 }); // region generated, not yet contact
  expect(trace[8]!.hp).toBe(88); // next real collision with the committed moving target
  expect(trace[8]!.targetX - trace[8]!.sourceX).toBeGreaterThan(1.3);
  expect(trace.at(-1)!.hp).toBe(88);
  expect(trace.at(-1)!.alternateHP).toBe(88);
});

it('S4 two independent melee instances preserve first start, CD and three complete cycles', () => {
  const engine = new Engine({ tickRate: 20, input: new QueuedInputSource('s4-melee-cycles') });
  assembleS4World(engine);
  for (const [name, y] of [['alpha', -10], ['beta', 10]] as const) {
    spawnS4Unit(engine.world, 'vindicator', name, 1, 0, y);
    add(engine.world, `${name}-target`, { Transform: at(1, y), Shape: { kind: 'circle', radius: .7 }, Tag: { flags: 4 }, Status: { flags: 8 }, Resource: { id: 'hp', current: 1000, min: 0, max: 1000 } });
  }
  engine.world.getComponent<Timer>('beta#0:slash', 'Timer')!.elapsed -= 4;
  engine.world.getComponent<State>('session', 'State')!.current = 'battle';
  const traces = { alpha: [] as Array<{ tick: number; phase: string; hp: number; cd: number }>, beta: [] as Array<{ tick: number; phase: string; hp: number; cd: number }> };
  for (let tick = 1; tick <= 72; tick++) {
    engine.world.tick();
    for (const id of ['alpha', 'beta'] as const) traces[id].push({ tick,
      phase: engine.world.getComponent<GameFlow>(`${id}#0:slash`, 'GameFlow')!.current,
      hp: engine.world.getComponent<Resource>(`${id}-target`, 'Resource')!.current,
      cd: engine.world.getComponent<Timer>(`${id}#0:slash`, 'Timer')!.elapsed,
    });
  }
  console.log('S4_MELEE_CYCLES', JSON.stringify(traces));
  for (const id of ['alpha', 'beta'] as const) {
    const frames = traces[id], starts = frames.filter((r, i) => r.phase === 'Windup' && frames[i - 1]?.phase !== 'Windup');
    expect(starts.map(r => r.tick)).toEqual(id === 'alpha' ? [1, 25, 49] : [4, 28, 52]);
    expect(starts.every(r => r.cd === 0)).toBe(true);
    expect(frames.filter((r, i) => i > 0 && r.hp < frames[i - 1]!.hp).map(r => r.tick)).toEqual(id === 'alpha' ? [9, 33, 57] : [12, 36, 60]);
    expect(frames.at(-1)).toMatchObject({ phase: 'Ready', hp: 964 });
  }
});

it.each(['control', 'source-death', 'target-death'] as const)('S4 production incoming contact cancels pending melee: %s', mode => {
  const engine = new Engine({ tickRate: 20, input: new QueuedInputSource('s4-cancel') });
  assembleS4World(engine);
  const source = spawnS4Unit(engine.world, 'vindicator', 'player', 1, 0, 0);
  add(engine.world, 'target', { Transform: at(1), Shape: { kind: 'circle', radius: .7 }, Tag: { flags: 4 }, Status: { flags: 8 },
    Resource: { id: 'hp', current: 100, min: 0, max: 100 }, Mortal: { resource: 'hp', atOrBelow: 0 } });
  add(engine.world, 'incoming', { Transform: at(mode === 'target-death' ? -3 : -4), Velocity: { vx: 1, vy: 0 }, Shape: { kind: 'circle', radius: .1 }, Tag: { flags: ZONE_FLAG },
    Hitbox: { resource: 'hp', amount: mode === 'control' ? 0 : 100, targetMask: mode === 'target-death' ? 4 : 2,
      ...(mode === 'control' ? { setMask: 16 } : {}), consumeOnHit: true } });
  engine.world.getComponent<State>('session', 'State')!.current = 'battle';
  const trace = [];
  for (let tick = 1; tick <= 36; tick++) {
    engine.world.tick();
    trace.push({ tick, phase: engine.world.getComponent<GameFlow>('player#0:slash', 'GameFlow')?.current,
      captured: engine.world.getComponent<GameFlow>('player#0:slash', 'GameFlow')?.targetSnapshot?.targetId,
      hp: engine.world.getComponent<Resource>('target', 'Resource')?.current,
      cd: engine.world.getComponent<Timer>('player#0:slash', 'Timer')?.elapsed,
      effects: engine.world.query('PrefabOrigin').filter(([id]) => id.startsWith('s4-1-slash#')).length });
  }
  console.log('S4_PENDING_CANCEL', mode, JSON.stringify(trace));
  expect(trace.every(r => r.effects === 0)).toBe(true);
  if (mode !== 'target-death') expect(trace.at(-1)!.hp).toBe(100);
  if (mode === 'source-death') expect(engine.world.hasComponent(source, 'Resource')).toBe(false);
  else {
    expect(trace[4]!.captured).toBeUndefined();
    expect(trace[4]!.cd).toBe(4); // start at Tick1 remains paid
    expect(trace.at(-1)!.phase).toBe('Ready');
  }
});

it('S4 complete current composition remains acyclic and records its actual release phases', () => {
  const graph = analyzeSystemGraph(s4Capabilities);
  expect(graph.sccs).toEqual([]);
  expect(graph.duplicateIds).toEqual([]);
  const globalIds = new Set(ALL_CAPABILITIES.flatMap(c => c.systems.map(s => s.id)));
  expect(graph.danglingEdges.filter(e => !globalIds.has(e.ref))).toEqual([]);
  const engine = new Engine({ tickRate: 20, input: new QueuedInputSource('s4-order') });
  assembleS4World(engine);
  const order = engine.world.getSortedSystems().map(s => s.id);
  expect(graph.systemCount).toBe(order.length);
  // B3 adds relation-orbit, mobility-lock and in-place form-change to the
  // shared production composition.  Keep this literal as a composition guard:
  // removing one of those systems must not silently make the S4 world pass.
  expect(graph.systemCount).toBe(35);
  expect(order).toEqual(expect.arrayContaining(['relation-orbit','mcfight-mobility-lock','form-change','over-time']));
  console.log('S4_COMBAT_ORDER', JSON.stringify({ capabilities: s4Capabilities.map(c => c.id), order, graph }));
  expect(order.indexOf('caster')).toBeLessThan(order.indexOf('hitbox'));
  expect(order.indexOf('hitbox')).toBeLessThan(order.indexOf('targeted-caster'));
  expect(order.indexOf('resource-apply')).toBeLessThan(order.indexOf('targeted-caster'));
  expect(order.indexOf('stat-bind')).toBeGreaterThan(order.indexOf('flow'));
});

it('S4 committed single-target melee does not damage a second overlapping enemy', () => {
  const engine = new Engine({ tickRate: 20, input: new QueuedInputSource('s4-single-target-gap') });
  assembleS4World(engine);
  spawnS4Unit(engine.world, 'vindicator', 'player', 1, 0, 0);
  for (const id of ['a-target', 'b-neighbor']) add(engine.world, id, {
    Transform: at(1), Shape: { kind: 'circle', radius: .7 }, Tag: { flags: 4 }, Status: { flags: 8 }, Resource: { id: 'hp', current: 100, min: 0, max: 100 },
  });
  engine.world.getComponent<State>('session', 'State')!.current = 'battle';
  for (let tick = 1; tick <= 9; tick++) engine.world.tick();
  const captured = engine.world.getComponent<GameFlow>('player#0:slash', 'GameFlow')!.targetSnapshot?.targetId;
  const neighborHP = engine.world.getComponent<Resource>('b-neighbor', 'Resource')!.current;
  expect(captured).toBe('a-target');
  expect(engine.world.getComponent<Resource>('a-target', 'Resource')!.current).toBe(88);
  expect(neighborHP).toBe(100); // REQ-006 fix: historical 88HP failure retained in single-target-gap.log
  console.log('S4_SINGLE_TARGET_GAP', JSON.stringify({ captured, neighborHP, requiredNeighborHP: 100 }));
});
