import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform, Camera, Bounds, CameraTarget, DebugTrace } from '@engine/protocol/components.js';
import { hashSnapshot } from '@net/determinism.js';
import { cameraFollowCapability } from './camera-follow.js';

function worldWithCamera(): World {
  const w = new World();
  for (const s of cameraFollowCapability.systems) w.addSystem(s);
  return w;
}
function target(w: World, id: string, x: number, y: number): void {
  if (!w.hasComponent(id, 'Transform')) w.createEntity(id);
  w.addComponent(id, { type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent(id, { type: 'CameraTarget' } as CameraTarget);
}
function camera(w: World, vw = 640, vh = 400): void {
  w.createEntity('cam');
  w.addComponent('cam', { type: 'Camera', zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, viewportW: vw, viewportH: vh } as Camera);
}
function cam(w: World): Camera {
  return w.getComponent<Camera>('cam', 'Camera')!;
}
function deadZone(w: World, inset = 0.25): void {
  cam(w).followDeadZone = { left: inset, right: inset, top: inset, bottom: inset };
}

describe('T2 camera-follow — metadata', () => {
  it('id / 读 CameraTarget+Transform+Bounds / 写 Camera', () => {
    expect(cameraFollowCapability.id).toBe('t2-camera-follow');
    expect(cameraFollowCapability.components.reads).toEqual(['CameraTarget', 'Transform', 'Bounds']);
    expect(cameraFollowCapability.components.writes).toEqual(['Camera']);
  });
});

describe('T2 camera-follow — 跟随与缩放', () => {
  it('单目标 → 相机中心对准它', () => {
    const w = worldWithCamera();
    camera(w);
    target(w, 'hero', 100, 50);
    w.tick();
    expect(cam(w).offsetX).toBe(100);
    expect(cam(w).offsetY).toBe(50);
  });

  it('双目标 → 相机取中点', () => {
    const w = worldWithCamera();
    camera(w);
    target(w, 'a', 0, 0);
    target(w, 'b', 200, 100);
    w.tick();
    expect(cam(w).offsetX).toBe(100);
    expect(cam(w).offsetY).toBe(50);
  });

  it('目标拉远 → zoom 变小以装进视口；最大不超过 1', () => {
    const w = worldWithCamera();
    camera(w, 640, 400);
    target(w, 'a', 0, 0);
    target(w, 'b', 50, 50); // 跨度小 → fit>1 → 钳到 1
    w.tick();
    expect(cam(w).zoom).toBe(1);

    target(w, 'b', 2000, 0); // 跨度大 → zoom<1
    w.tick();
    expect(cam(w).zoom).toBeLessThan(1);
    expect(cam(w).zoom).toBeGreaterThanOrEqual(0.25);
  });

  it('omitted follow tuning preserves margin=80 and zoom=[0.25,1] exactly', () => {
    const w = worldWithCamera(); camera(w, 640, 400); target(w, 'a', 0, 0); target(w, 'b', 1200, 0);
    w.tick(); expect(cam(w).zoom).toBe(0.5); // 640 / (1200 + 80)
    target(w, 'b', 10_000, 0); w.tick(); expect(cam(w).zoom).toBe(0.25);
  });

  it('uses optional grid-unit tuning and target anchor while Bounds clamp the viewport', () => {
    const w = worldWithCamera(); camera(w, 28, 19);
    Object.assign(cam(w), { followMargin: 0, followMinZoom: 1, followMaxZoom: 1, followOffsetX: 0.5, followOffsetY: 1 });
    w.addComponent('cam', { type: 'Bounds', minX: 0, minY: 0, maxX: 36, maxY: 26 } as Bounds);
    target(w, 'hero', 20, 10); w.tick(); expect(cam(w)).toMatchObject({ zoom: 1, offsetX: 20.5, offsetY: 11 });
    target(w, 'hero', 0, 0); w.tick(); expect(cam(w)).toMatchObject({ offsetX: 14, offsetY: 9.5 });
  });

  it('omitting the dead zone preserves exact centered follow behavior', () => {
    const w = worldWithCamera(); camera(w, 100, 100); cam(w).offsetX = -40; cam(w).offsetY = 70;
    target(w, 'hero', 12.5, -8.25); w.tick();
    expect(cam(w)).toMatchObject({ offsetX: 12.5, offsetY: -8.25 });
    expect(cam(w).followDeadZone).toBeUndefined();
  });

  it.each([
    ['left', -30, 0, -5, 0], ['right', 30, 0, 5, 0],
    ['top', 0, -30, 0, -5], ['bottom', 0, 30, 0, 5],
  ] as const)('%s edge moves only the exceeded axis and lands focus on that safe edge', (_edge, x, y, expectedX, expectedY) => {
    const w = worldWithCamera(); camera(w, 100, 100); deadZone(w); target(w, 'hero', x, y); w.tick();
    expect(cam(w)).toMatchObject({ offsetX: expectedX, offsetY: expectedY });
  });

  it('holds inside the zone and resolves diagonal overflow independently per axis', () => {
    const w = worldWithCamera(); camera(w, 100, 100); deadZone(w);
    target(w, 'hero', 20, -10); w.tick(); expect(cam(w)).toMatchObject({ offsetX: 0, offsetY: 0 });
    target(w, 'hero', 40, -35); w.tick(); expect(cam(w)).toMatchObject({ offsetX: 15, offsetY: -10 });
    target(w, 'hero', 20, -40); w.tick(); expect(cam(w)).toMatchObject({ offsetX: 15, offsetY: -15 });
  });

  it('keeps multi-target AABB focus, followOffset and fit zoom before applying the dead zone', () => {
    const w = worldWithCamera(); camera(w, 100, 100);
    Object.assign(cam(w), {
      followMargin: 0, followMinZoom: 0.25, followMaxZoom: 1,
      followOffsetX: 10, followOffsetY: -5,
      followDeadZone: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25 },
    });
    target(w, 'a', 0, 0); target(w, 'b', 200, 40); w.tick();
    expect(cam(w).zoom).toBe(0.5);
    expect(cam(w).offsetX).toBe(60); // focus 110 lands on right edge: 60 + (100/0.5)*(0.5-0.25)
    expect(cam(w).offsetY).toBe(0); // focus 15 remains inside the vertical safe zone
  });

  it('无目标 → 相机不动', () => {
    const w = worldWithCamera();
    camera(w);
    cam(w).offsetX = 7;
    w.tick();
    expect(cam(w).offsetX).toBe(7);
  });
});

describe('T2 camera-follow — Bounds 钳关卡内', () => {
  it('目标在关卡左边缘 → 相机被钳住不露界外', () => {
    const w = worldWithCamera();
    camera(w, 640, 400);
    // 关卡 [0,2000]x[0,400]，视口宽 640、zoom=1 → halfW=320，相机 X 最小 320。
    w.addComponent('cam', { type: 'Bounds', minX: 0, minY: 0, maxX: 2000, maxY: 400 } as Bounds);
    target(w, 'hero', 10, 200); // 想把相机拉到 10，但会被钳到 320
    w.tick();
    expect(cam(w).offsetX).toBe(320);
  });

  it('applies Bounds after dead-zone correction so map edges win without pulling the target', () => {
    const w = worldWithCamera(); camera(w, 20, 20); deadZone(w);
    Object.assign(cam(w), { offsetX: 50, offsetY: 50, followMargin: 0, followMinZoom: 1, followMaxZoom: 1 });
    w.addComponent('cam', { type: 'Bounds', minX: 0, minY: 0, maxX: 100, maxY: 100 } as Bounds);
    target(w, 'hero', 100, 0); w.tick();
    expect(cam(w)).toMatchObject({ offsetX: 90, offsetY: 10 });
    expect(w.getComponent<Transform>('hero', 'Transform')).toMatchObject({ x: 100, y: 0 });
  });

  it('centers an undersized map after dead-zone correction on both axes', () => {
    const w = worldWithCamera(); camera(w, 100, 80); deadZone(w);
    Object.assign(cam(w), { offsetX: 100, offsetY: -100, followMargin: 0, followMinZoom: 1, followMaxZoom: 1 });
    w.addComponent('cam', { type: 'Bounds', minX: 10, minY: 20, maxX: 50, maxY: 60 } as Bounds);
    target(w, 'hero', 999, 999); w.tick();
    expect(cam(w)).toMatchObject({ offsetX: 30, offsetY: 40 });
  });
});

describe('T2 camera-follow — debug trace and hash boundary', () => {
  it('reconstructs hold, overflow and Bounds clamp while trace remains outside deterministic hash', () => {
    const w = worldWithCamera(); camera(w, 20, 20); deadZone(w);
    Object.assign(cam(w), { offsetX: 50, offsetY: 50, followMargin: 0, followMinZoom: 1, followMaxZoom: 1 });
    w.addComponent('cam', { type: 'Bounds', minX: 0, minY: 0, maxX: 100, maxY: 100 } as Bounds);
    w.createEntity('debug'); w.addComponent('debug', { type: 'DebugTrace', tick: 7, max: 20, events: [] } as DebugTrace);
    target(w, 'hero', 100, 50); const beforeHash = hashSnapshot(w.snapshot()); w.tick();
    const events = w.getComponent<DebugTrace>('debug', 'DebugTrace')!.events;
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ tick: 7, system: 'camera-follow', kind: 'decision', what: 'cam dead-zone x=right y=hold', why: 'focus=100,50; bounds=x' });
    expect(events[1]).toMatchObject({ kind: 'commit', what: 'cam Camera=90,50@1' });
    expect(hashSnapshot(w.snapshot())).toBe(beforeHash);
  });

  it('records a meaningful inside-zone hold once and emits no stationary heartbeat', () => {
    const w = worldWithCamera(); camera(w, 100, 100); deadZone(w);
    w.createEntity('debug'); w.addComponent('debug', { type: 'DebugTrace', tick: 2, max: 20, events: [] } as DebugTrace);
    target(w, 'hero', 5, 0); w.tick(); w.tick(); w.tick();
    const trace = w.getComponent<DebugTrace>('debug', 'DebugTrace')!;
    expect(trace.events).toEqual([expect.objectContaining({
      kind: 'reject', what: 'cam camera movement held', why: 'focus=5,0 remains inside dead-zone',
    })]);
    target(w, 'hero', 6, 0); w.tick();
    expect(trace.events).toHaveLength(2);
    expect(trace.events[1]).toMatchObject({ kind: 'reject', why: 'focus=6,0 remains inside dead-zone' });
    target(w, 'hero', 0, 0); w.tick(); w.tick();
    expect(trace.events).toHaveLength(2); // centered and unchanged is not a decision or heartbeat.
  });

  it('deduplicates stationary hold traces independently for multiple cameras', () => {
    const w = worldWithCamera(); camera(w, 100, 100); deadZone(w);
    w.createEntity('cam-2');
    w.addComponent('cam-2', {
      type: 'Camera', zoom: 1, offsetX: 10, offsetY: 0, rotation: 0, viewportW: 100, viewportH: 100,
      followDeadZone: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25 },
    } as Camera);
    w.createEntity('debug'); w.addComponent('debug', { type: 'DebugTrace', tick: 3, max: 20, events: [] } as DebugTrace);
    target(w, 'hero', 5, 0); w.tick(); w.tick(); w.tick();
    const events = w.getComponent<DebugTrace>('debug', 'DebugTrace')!.events;
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.what)).toEqual(['cam camera movement held', 'cam-2 camera movement held']);
  });

  it('does not allocate trace state when DebugTrace is absent', () => {
    const w = worldWithCamera(); camera(w, 100, 100); deadZone(w); target(w, 'hero', 0, 0);
    const before = w.snapshot(); w.tick();
    expect(Object.values(w.snapshot()).some((components) => 'DebugTrace' in components)).toBe(false);
    expect(cam(w)).toMatchObject({ offsetX: 0, offsetY: 0 });
    expect(before.debug).toBeUndefined();
  });
});
