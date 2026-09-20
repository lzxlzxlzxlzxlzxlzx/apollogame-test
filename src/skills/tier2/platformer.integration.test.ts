import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform, Velocity, Acceleration, Shape, Action } from '@engine/protocol/components.js';
import { accelApplyCapability, motionApplyCapability } from '../tier1/index.js';
import { overlapDetectCapability } from '@atom-skills/index.js';
import { collisionResolveCapability, groundSenseCapability, jumpCapability, JUMP_SPEED } from './index.js';

// 乱序注册全部 6 个各自独立的原子，靠 phase + 组件拓扑自动定序成一条平台跳跃管线。
function platformerWorld(withJumpInput: boolean): World {
  const w = new World();
  for (const cap of [jumpCapability, collisionResolveCapability, groundSenseCapability, overlapDetectCapability, motionApplyCapability, accelApplyCapability]) {
    for (const s of cap.systems) w.addSystem(s);
  }
  // 玩家：动态方块 20×20，起步贴在地面静止处 y=180；重力 ay=2。
  w.createEntity('player');
  w.addComponent('player', { type: 'Transform', x: 100, y: 180, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent('player', { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
  w.addComponent('player', { type: 'Acceleration', ax: 0, ay: 2 } as Acceleration);
  w.addComponent('player', { type: 'Shape', kind: 'box', width: 20, height: 20 } as Shape);
  if (withJumpInput) w.addComponent('player', { type: 'Action', name: 'jump', value: 1 } as Action);
  // 地面：静态方块 200×20，中心 y=200（顶边 190）。无 Velocity → 静态。
  w.createEntity('ground');
  w.addComponent('ground', { type: 'Transform', x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
  w.addComponent('ground', { type: 'Shape', kind: 'box', width: 200, height: 20 } as Shape);
  return w;
}

interface Frame {
  y: number;
  vy: number;
  grounded: boolean;
}
function trace(w: World, ticks: number): Frame[] {
  const frames: Frame[] = [];
  for (let i = 0; i < ticks; i++) {
    w.tick();
    frames.push({
      y: w.getComponent<Transform>('player', 'Transform')!.y,
      vy: w.getComponent<Velocity>('player', 'Velocity')!.vy,
      grounded: w.hasComponent('player', 'Grounded'),
    });
  }
  return frames;
}

describe('T2 涌现：6 原子组合 = 平台跳跃（重力⊕运动⊕检测⊕落地感知⊕碰撞解算⊕跳跃）', () => {
  it('管线自动定序：Update(accel→motion) → Resolve(overlap→ground-sense→collision) → Commit(jump)', () => {
    const order = platformerWorld(false).getSortedSystems().map((s) => s.id);
    expect(order.indexOf('overlap-detect')).toBeLessThan(order.indexOf('ground-sense'));
    expect(order.indexOf('ground-sense')).toBeLessThan(order.indexOf('collision-resolve'));
    expect(order.indexOf('collision-resolve')).toBeLessThan(order.indexOf('jump'));
    expect(order[order.length - 1]).toBe('jump'); // Commit 阶段最后
  });

  it('有 jump 输入 → 起跳腾空（升到远高于静止线），随后落回', () => {
    const frames = trace(platformerWorld(true), 25);
    const minY = Math.min(...frames.map((f) => f.y));
    expect(minY).toBeLessThan(160); // 从静止线 y=180 明显跃起（实测约 138）
    expect(frames.some((f) => f.vy === -JUMP_SPEED)).toBe(true); // 起跳冲量确实出现过
    expect(frames.some((f, i) => i > 3 && f.grounded && f.y === 180)).toBe(true); // 腾空后又落回地面
  });

  it('Grounded 是闸门：腾空时不着地 → 不会二段跳', () => {
    const frames = trace(platformerWorld(true), 25);
    expect(frames.some((f) => f.y < 160 && !f.grounded)).toBe(true); // 离地后 ground-sense 收回 Grounded
    const ascend = frames.filter((f) => !f.grounded && f.vy < 0); // 腾空上升帧
    expect(ascend.length).toBeGreaterThan(1);
    // 上升途中速度按重力递增（-12→-10…），从未被重新踢成满速 → 没有二段跳
    expect(ascend.filter((f) => f.vy === -JUMP_SPEED).length).toBeLessThanOrEqual(1);
  });

  it('无 jump 输入（对照）→ 一直贴在地面，不会自己起跳', () => {
    const frames = trace(platformerWorld(false), 25);
    expect(Math.min(...frames.map((f) => f.y))).toBe(180); // 从不离开静止线
    expect(frames[frames.length - 1].y).toBe(180);
  });
});
