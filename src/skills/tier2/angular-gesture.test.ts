import { describe, expect, it } from 'vitest';
import { World } from '@engine/core/world.js';
import type { AngularGesture, DebugTrace, InputQueue, KeyBinding, OrderedActionSession, RawInputData, Signal, Transform } from '@engine/protocol/components.js';
import { hashSnapshot } from '@net/determinism.js';
import { expectDeterministic, expectRestoreContinues } from '../../test-fixtures/test-kit.js';
import { angularGestureCapability, angleOfEllipsePoint, pointOnEllipse, validateAngularGesture } from './angular-gesture.js';
import { orderedActionSessionCapability } from './ordered-action-session.js';
import { keybindCapability } from './keybind.js';
import { parseManifest } from '../../assembly/manifest.js';

const cx = 760, cy = 423, rx = 105, ry = 43;
const config = (overrides: Partial<AngularGesture> = {}): AngularGesture => ({
  type: 'AngularGesture', id: 'rod', centerX: cx, centerY: cy, radiusX: rx, radiusY: ry,
  angleMilliDegrees: 322758, grabTolerance: 0.2, centerDeadZone: 0.16,
  maxJumpMilliDegrees: 129600, jitterMilliDegrees: 500, fullTurnMilliDegrees: 330000,
  clockwiseSignal: 'brew.stir.clockwise', counterclockwiseSignal: 'brew.stir.counterclockwise', ...overrides,
});
function make(withSession = false, withTrace = false): World {
  const world = new World({ strict: true });
  world.addSystem(angularGestureCapability.systems[0]!);
  if (withSession) world.addSystem(orderedActionSessionCapability.systems[0]!);
  world.createEntity('input'); world.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
  world.createEntity('rod');
  world.addComponent('rod', config(withSession ? { sessionEntity: 'cauldron' } : {}));
  world.addComponent<Transform>('rod', { type: 'Transform', x: cx, y: cy, rotation: 0, scaleX: 1, scaleY: 1 });
  if (withSession) {
    world.createEntity('cauldron');
    world.addComponent<OrderedActionSession>('cauldron', {
      type: 'OrderedActionSession', id: 'brew', acceptedActions: ['brew.stir.clockwise', 'brew.stir.counterclockwise', 'brew.add.silver'],
      steps: [{ expectedAction: 'brew.stir.clockwise', requiredCount: 2 }, { expectedAction: 'brew.add.silver', requiredCount: 1 }],
      successSignal: 'brew.success', failureSignal: 'brew.failure',
    });
  }
  if (withTrace) { world.createEntity('trace'); world.addComponent<DebugTrace>('trace', { type: 'DebugTrace', events: [], max: 100 }); }
  world.tick();
  return world;
}
function send(world: World, action: RawInputData): void {
  world.getComponent<InputQueue>('input', 'InputQueue')!.actions = [action];
  world.tick();
}
function at(degrees: number): { x: number; y: number } {
  const rad = degrees * Math.PI / 180;
  return { x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad) };
}
function event(phase: string, degrees: number, pointerId = 7): RawInputData { return { source: 'player', phase, pointerId, ...at(degrees) }; }
function turn(world: World, clockwise = true): void {
  for (let step = 1; step <= 8; step++) send(world, event('move', (clockwise ? 1 : -1) * step * 45));
}
function signals(world: World, name: string): Signal[] {
  return world.query('Signal').map(([id]) => world.getComponent<Signal>(id, 'Signal')!).filter((signal) => signal.name === name);
}

describe('t2-angular-gesture', () => {
  it('CORDIC 椭圆角/位置在四象限与跨零点保持约 0.01° 精度', () => {
    for (const angle of [0, 45, 90, 135, 180, 225, 270, 315, 359]) {
      const p = at(angle);
      expect(angleOfEllipsePoint((p.x - cx) / rx, (p.y - cy) / ry)).toBeCloseTo(angle * 1000, -1);
      const projected = pointOnEllipse(cx, cy, rx, ry, angle * 1000);
      expect(projected.x).toBeCloseTo(p.x, 1);
      expect(projected.y).toBeCloseTo(p.y, 1);
    }
  });

  it('锅口抓棒、跨 0° 顺时针满 330° 发一次；单角度派生位置', () => {
    const world = make();
    send(world, event('down', 0)); turn(world);
    expect(signals(world, 'brew.stir.clockwise')).toHaveLength(1);
    const gesture = world.getComponent<AngularGesture>('rod', 'AngularGesture')!;
    const transform = world.getComponent<Transform>('rod', 'Transform')!;
    expect(gesture.angleMilliDegrees).toBeGreaterThanOrEqual(0);
    expect(transform.x).toBeCloseTo(pointOnEllipse(cx, cy, rx, ry, gesture.angleMilliDegrees).x, 6);
    expect(transform.y).toBeCloseTo(pointOnEllipse(cx, cy, rx, ry, gesture.angleMilliDegrees).y, 6);
    send(world, event('drag', 0)); expect(gesture.heldSource).toBeUndefined();
  });

  it('握持只允许锅口椭圆环带，中心附近与外圈之外均拒收', () => {
    const world = make(false, true);
    const gesture = world.getComponent<AngularGesture>('rod', 'AngularGesture')!;
    send(world, { source: 'player', phase: 'down', pointerId: 7, x: cx + rx * 0.2, y: cy });
    expect(gesture.heldSource).toBeUndefined();
    send(world, { source: 'player', phase: 'down', pointerId: 7, x: cx + rx * 1.21, y: cy });
    expect(gesture.heldSource).toBeUndefined();
    send(world, { source: 'player', phase: 'down', pointerId: 7, x: cx + rx * 0.8, y: cy });
    expect(gesture.heldSource).toBe('player');
    const trace = world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events;
    expect(trace.filter((item) => item.what.includes('握持拒收'))).toHaveLength(2);
  });

  it('可选棒身胶囊允许棒头、中段与入水端起握，环外误点仍拒收且起握不瞬移', () => {
    for (const ratio of [0, 0.5, 1]) {
      const world = make();
      const gesture = world.getComponent<AngularGesture>('rod', 'AngularGesture')!;
      gesture.angleMilliDegrees = 0;
      gesture.grabSegment = { startX: 47, startY: -188, endX: 2, endY: -12, radius: 21 };
      world.tick();
      const position = world.getComponent<Transform>('rod', 'Transform')!;
      const x = position.x + 47 + (2 - 47) * ratio;
      const y = position.y - 188 + (-12 + 188) * ratio;
      send(world, { source: 'player', phase: 'down', pointerId: 7, x, y });
      expect(gesture.heldSource).toBe('player');
      expect(gesture.angleMilliDegrees).toBe(0);
      expect(position.x).toBe(cx + rx);
      send(world, { source: 'player', phase: 'up', pointerId: 7, x, y });
      expect(gesture.heldSource).toBeUndefined();
      send(world, { source: 'player', phase: 'down', pointerId: 8, x: x + 55, y });
      expect(gesture.heldSource).toBeUndefined();
    }
  });

  it('棒头起握后仍按原轨道累计完整顺时针圈，不因起点远离锅口而跳角', () => {
    const world = make();
    const gesture = world.getComponent<AngularGesture>('rod', 'AngularGesture')!;
    gesture.angleMilliDegrees = 0;
    gesture.grabSegment = { startX: 47, startY: -188, endX: 2, endY: -12, radius: 21 };
    world.tick();
    send(world, { source: 'player', phase: 'down', pointerId: 7, x: cx + rx + 47, y: cy - 188 });
    let completed = 0;
    for (const degrees of [0, 45, 90, 135, 180, 225, 270, 315, 360]) {
      send(world, event('move', degrees));
      completed += signals(world, 'brew.stir.clockwise').length;
    }
    expect(completed).toBe(1);
  });

  it('松手帧的最终坐标也计入满圈，不丢最后一段', () => {
    const world = make(); send(world, event('down', 0));
    for (let step = 1; step <= 7; step++) send(world, event('move', step * 45));
    expect(signals(world, 'brew.stir.clockwise')).toHaveLength(0);
    send(world, { source: 'player', phase: 'drag', pointerId: 7, x: cx + rx, y: cy, values: [cx + rx, cy] });
    expect(signals(world, 'brew.stir.clockwise')).toHaveLength(1);
    expect(world.getComponent<AngularGesture>('rod', 'AngularGesture')!.heldSource).toBeUndefined();
  });

  it('逆时针满圈发反向信号；短弧、中心死区、抖动与异常跳变不提交', () => {
    const reverse = make(); send(reverse, event('down', 0)); turn(reverse, false);
    expect(signals(reverse, 'brew.stir.counterclockwise')).toHaveLength(1);
    const short = make(); send(short, event('down', 0)); send(short, event('move', 45));
    send(short, { source: 'player', phase: 'up', pointerId: 7, ...at(45) });
    expect(signals(short, 'brew.stir.clockwise')).toHaveLength(0);
    const ignored = make(); send(ignored, event('down', 0));
    send(ignored, { source: 'player', phase: 'move', pointerId: 7, x: cx, y: cy });
    expect(ignored.getComponent<AngularGesture>('rod', 'AngularGesture')!.accumulatedMilliDegrees).toBe(0);
    send(ignored, event('move', 170));
    expect(ignored.getComponent<AngularGesture>('rod', 'AngularGesture')!.accumulatedMilliDegrees).toBe(0);
    send(ignored, event('move', 170.2));
    expect(ignored.getComponent<AngularGesture>('rod', 'AngularGesture')!.accumulatedMilliDegrees).toBe(0);
  });

  it('反向移动抵消累计；第二指针拒收，取消后可重新握持', () => {
    const world = make(true, true); send(world, event('down', 0));
    send(world, event('move', 90)); send(world, event('move', 0));
    expect(Math.abs(world.getComponent<AngularGesture>('rod', 'AngularGesture')!.accumulatedMilliDegrees!)).toBeLessThan(100);
    send(world, event('down', 90, 8));
    expect(world.getComponent<AngularGesture>('rod', 'AngularGesture')!.heldPointerId).toBe(7);
    send(world, { source: 'player', phase: 'cancel', pointerId: 7 });
    expect(world.getComponent<AngularGesture>('rod', 'AngularGesture')!.heldSource).toBeUndefined();
    send(world, event('down', 90, 8));
    expect(world.getComponent<AngularGesture>('rod', 'AngularGesture')!.heldPointerId).toBe(8);
    const trace = world.getComponent<DebugTrace>('trace', 'DebugTrace')!.events;
    expect(trace.some((item) => item.what.includes('多指针拒收'))).toBe(true);
  });

  it('同一握持连续两圈可满足 G1；步骤推进后额外采样不误落下一步', () => {
    const world = make(true); send(world, event('down', 0)); turn(world);
    expect(world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession')!.confirmedCount).toBe(1);
    turn(world);
    const session = world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession')!;
    expect(session.stepIndex).toBe(1);
    expect(session.status).toBe('active');
    turn(world);
    expect(session.stepIndex).toBe(1);
    expect(session.status).toBe('active');
    expect(signals(world, 'brew.failure')).toHaveLength(0);
  });

  it('没有会话步骤门时，同一握持连续三圈逐圈提交', () => {
    const world = make(); send(world, event('down', 0));
    for (let lap = 1; lap <= 3; lap++) {
      turn(world);
      expect(signals(world, 'brew.stir.clockwise')).toHaveLength(1);
      expect(world.getComponent<AngularGesture>('rod', 'AngularGesture')!.emittedTurns).toBe(lap);
    }
  });

  it('默认锅口与可选棒身在满圈前快照恢复后仍产生相同世界 hash', () => {
    expectRestoreContinues(() => make(), (world) => { send(world, event('down', 0)); send(world, event('move', 45)); },
      (world) => { for (let step = 2; step <= 8; step++) send(world, event('move', step * 45)); });
    const makeShaft = () => {
      const world = make();
      const gesture = world.getComponent<AngularGesture>('rod', 'AngularGesture')!;
      gesture.angleMilliDegrees = 0;
      gesture.grabSegment = { startX: 47, startY: -188, endX: 2, endY: -12, radius: 21 };
      world.tick();
      return world;
    };
    expectRestoreContinues(makeShaft,
      (world) => { send(world, { source: 'player', phase: 'down', pointerId: 7, x: cx + rx + 47, y: cy - 188 }); send(world, event('move', 0)); },
      (world) => { for (let step = 1; step <= 8; step++) send(world, event('move', step * 45)); });
  });

  it('Q/E 键由既有 KeyBinding 发相同语义信号，不伪造指针轨迹', () => {
    const world = new World({ strict: true });
    world.addSystem(keybindCapability.systems[0]!);
    world.addSystem(orderedActionSessionCapability.systems[0]!);
    world.createEntity('input'); world.addComponent<InputQueue>('input', { type: 'InputQueue', actions: [] });
    world.createEntity('cauldron'); world.addComponent<OrderedActionSession>('cauldron', {
      type: 'OrderedActionSession', id: 'brew', acceptedActions: ['brew.stir.clockwise', 'brew.stir.counterclockwise'],
      steps: [{ expectedAction: 'brew.stir.clockwise', requiredCount: 1 }], successSignal: 'brew.success', failureSignal: 'brew.failure',
    });
    world.createEntity('e-key'); world.addComponent<KeyBinding>('e-key', { type: 'KeyBinding', key: 'e', signal: 'brew.stir.clockwise', phase: 'down', source: 'rod' });
    world.createEntity('q-key'); world.addComponent<KeyBinding>('q-key', { type: 'KeyBinding', key: 'q', signal: 'brew.stir.counterclockwise', phase: 'down', source: 'rod' });
    send(world, { source: 'player', key: 'e', phase: 'down' });
    expect(world.getComponent<OrderedActionSession>('cauldron', 'OrderedActionSession')!.status).toBe('success');
    expect(signals(world, 'brew.success')).toHaveLength(1);
  });

  it('配置装载拒坏轴/阈值；中途快照恢复、同输入同 hash，trace 不参与 hash', () => {
    expect(validateAngularGesture(config({ radiusX: 0 }))).toContain('半轴');
    expect(validateAngularGesture(config({ maxJumpMilliDegrees: 180000 }))).toContain('maxJump');
    const manifest = { capabilities: ['t2-angular-gesture'], entities: { rod: { AngularGesture: config({ radiusY: 0 }) } } };
    expect(() => parseManifest(manifest)).toThrow(/半轴/);
    expectDeterministic(() => make(), (world) => { send(world, event('down', 0)); send(world, event('move', 45)); });
    expectRestoreContinues(() => make(), (world) => { send(world, event('down', 0)); send(world, event('move', 90)); },
      (world) => { send(world, event('move', 180)); send(world, event('move', 270)); });
    expect(hashSnapshot(make(false, true).snapshot())).toBe(hashSnapshot(make().snapshot()));
  });
});
