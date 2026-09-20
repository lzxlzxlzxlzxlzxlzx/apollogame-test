import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { SystemPhase } from '@engine/core/types.js';
import type { AnimState, AnimClip, Frame, Velocity, State, Relation } from '@engine/protocol/components.js';
import { animStateCapability } from './anim-state.js';

const WALK: AnimClip = { from: 0, count: 4, fps: 2, loop: true };
const IDLE: AnimClip = { from: 0, count: 1, fps: 1, loop: false };
const ATTACK: AnimClip = { from: 4, count: 3, fps: 2, loop: false };

const fi = (w: World, e: string): number => w.getComponent<Frame>(e, 'Frame')!.index;
const cur = (w: World, e: string): string => w.getComponent<AnimState>(e, 'AnimState')!.current;

function world(): World {
  const w = new World();
  for (const s of animStateCapability.systems) w.addSystem(s);
  return w;
}
function actor(w: World, id: string, opts: { vx?: number; current?: string; fsmId?: string; state?: string }): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'Frame', index: 0, total: 4 } as Frame);
  w.addComponent(id, { type: 'Velocity', vx: opts.vx ?? 0, vy: 0, angular: 0 } as Velocity);
  if (opts.fsmId && opts.state) w.addComponent(id, { type: 'State', fsmId: opts.fsmId, current: opts.state, previous: '' } as State);
  w.addComponent(id, {
    type: 'AnimState',
    clips: { walk: WALK, idle: IDLE, attack: ATTACK },
    fsmId: opts.fsmId,
    moveClip: 'walk',
    idleClip: 'idle',
    current: opts.current ?? 'idle',
    elapsed: 0,
  } as AnimState);
}

describe('anim-state — 元数据 / 定序', () => {
  it('id + Commit 相位（读最终速度）', () => {
    expect(animStateCapability.id).toBe('t2-anim-state');
    expect(animStateCapability.systems[0].phase).toBe(SystemPhase.Commit);
  });
});

describe('anim-state — 自动 走/站', () => {
  it('移动 → 播 walk，在 [0,4) 内每 fps tick 推一帧、循环', () => {
    const w = world();
    actor(w, 'm', { vx: 5, current: 'walk' }); // 初始即 walk，免切换
    w.tick(); // elapsed1
    expect(fi(w, 'm')).toBe(0);
    w.tick(); // elapsed2 → index1
    expect(fi(w, 'm')).toBe(1);
    for (let i = 0; i < 2; i++) w.tick(); // → index2
    expect(fi(w, 'm')).toBe(2);
    for (let i = 0; i < 4; i++) w.tick(); // index3 → 循环回 0
    expect(fi(w, 'm')).toBe(0);
  });

  it('静止 → 切 idle（单帧，不推进）', () => {
    const w = world();
    actor(w, 'm', { vx: 0, current: 'walk' });
    w.tick();
    expect(cur(w, 'm')).toBe('idle');
    expect(fi(w, 'm')).toBe(0);
  });

  it('切 clip → 复位到 clip.from', () => {
    const w = world();
    actor(w, 'm', { vx: 5, current: 'walk' });
    for (let i = 0; i < 3; i++) w.tick(); // 推到 index1+
    expect(fi(w, 'm')).toBeGreaterThan(0);
    w.getComponent<Velocity>('m', 'Velocity')!.vx = 0; // 停下
    w.tick();
    expect(cur(w, 'm')).toBe('idle');
    expect(fi(w, 'm')).toBe(0); // 复位
  });
});

describe('anim-state — attackClip（站定+有目标→攻击）', () => {
  it('站定且有 Relation(target) → 播 attack；无目标 → idle', () => {
    const w = world();
    w.createEntity('m');
    w.addComponent('m', { type: 'Frame', index: 0, total: 7 } as Frame);
    w.addComponent('m', { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
    w.addComponent('m', {
      type: 'AnimState',
      clips: { walk: WALK, idle: IDLE, attack: ATTACK },
      moveClip: 'walk',
      idleClip: 'idle',
      attackClip: 'attack',
      current: 'idle',
      elapsed: 0,
    } as AnimState);
    // 无 Relation → idle
    w.tick();
    expect(cur(w, 'm')).toBe('idle');
    // 加锁定目标 → 站定即攻击
    w.addComponent('m', { type: 'Relation', kind: 'target', targetId: 'hero' } as unknown as Relation);
    w.tick();
    expect(cur(w, 'm')).toBe('attack');
    // 动起来 → 走（攻击让位移动）
    w.getComponent<Velocity>('m', 'Velocity')!.vx = 5;
    w.tick();
    expect(cur(w, 'm')).toBe('walk');
  });
});

describe('anim-state — fsmId 驱动 + 非循环', () => {
  it('State{fsmId}.current 选 clip；loop=false 播到末帧停', () => {
    const w = world();
    actor(w, 'm', { vx: 0, fsmId: 'anim', state: 'attack', current: 'attack' }); // attack {4,3,fps2,no loop}
    expect(fi(w, 'm')).toBe(0);
    w.getComponent<Frame>('m', 'Frame')!.index = 4; // 从 clip 起点
    for (let i = 0; i < 12; i++) w.tick(); // 推到末帧停（4→5→6 停）
    expect(fi(w, 'm')).toBe(6); // from+count-1 = 4+3-1
  });
});

describe('anim-state — 确定性', () => {
  it('同初值重跑一致', () => {
    const run = (): string => {
      const w = world();
      actor(w, 'a', { vx: 3, current: 'walk' });
      actor(w, 'b', { vx: 0, current: 'idle' });
      for (let i = 0; i < 20; i++) w.tick();
      return JSON.stringify(w.snapshot());
    };
    expect(run()).toBe(run());
  });
});

describe('anim-state — settled status interruption', () => {
  it('overrides only presentation and preserves gameplay State', () => {
    const w = world();
    actor(w, 'm', { fsmId: 'cast', state: 'attack', current: 'idle' });
    const anim=w.getComponent<AnimState>('m','AnimState')!;
    anim.clips={idle:IDLE,attack:ATTACK,recover:{from:8,count:1,fps:1,loop:false}};
    anim.interruptStatusMask=32;anim.interruptClip='recover';
    w.addComponent('m',{type:'Status',flags:32} as any);
    w.tick();
    expect(cur(w,'m')).toBe('recover');expect(fi(w,'m')).toBe(8);
    expect(w.getComponent<State>('m','State')!.current).toBe('attack');
  });
  it('unrelated status does not interrupt a valid attack', () => {
    const w = world();
    actor(w, 'm', { fsmId:'cast',state:'attack',current:'idle' });
    const anim=w.getComponent<AnimState>('m','AnimState')!;
    anim.clips={idle:IDLE,attack:ATTACK,recover:IDLE};
    anim.interruptStatusMask=32;anim.interruptClip='recover';
    w.addComponent('m',{type:'Status',flags:16} as any);
    w.tick();expect(cur(w,'m')).toBe('attack');expect(fi(w,'m')).toBe(4);
  });
});
