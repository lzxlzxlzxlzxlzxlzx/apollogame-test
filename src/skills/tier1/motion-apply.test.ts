import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform, Velocity } from '@engine/protocol/components.js';
import { motionApplyCapability } from './motion-apply.js';

function worldWithMotion(): World {
  const w = new World();
  for (const sys of motionApplyCapability.systems) w.addSystem(sys);
  return w;
}

describe('T1 motion-apply — capability metadata（契约钉死）', () => {
  it('id / version 正确', () => {
    expect(motionApplyCapability.id).toBe('t1-motion-apply');
    expect(motionApplyCapability.version).toBe('1.0.0');
  });

  it('移动能力仅供运动；快照由实际决策依赖装配（snapshot-provider固定回归）', () => {
    expect(motionApplyCapability.systems).toHaveLength(1);
    expect(motionApplyCapability.components.provides).toEqual({});
    expect(motionApplyCapability.components.reads).toEqual(['Transform', 'Velocity']);
    expect(motionApplyCapability.components.writes).toEqual(['Transform']);
    expect(motionApplyCapability.components.consumes).toEqual([]);
  });
});

describe('T1 motion-apply — behavior', () => {
  it('每 tick 把 velocity 累加进 position', () => {
    const w = worldWithMotion();
    w.createEntity('e');
    const t: Transform = { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    const v: Velocity = { type: 'Velocity', vx: 3, vy: -2, angular: 0 };
    w.addComponent('e', t);
    w.addComponent('e', v);

    w.tick();
    let tr = w.getComponent<Transform>('e', 'Transform')!;
    expect([tr.x, tr.y]).toEqual([3, -2]);

    w.tick();
    tr = w.getComponent<Transform>('e', 'Transform')!;
    expect([tr.x, tr.y]).toEqual([6, -4]); // 线性累加
  });

  it('只动 x/y，不碰 rotation —— angular 超出本系统职责（属 rotation-apply）', () => {
    const w = worldWithMotion();
    w.createEntity('e');
    const t: Transform = { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    const v: Velocity = { type: 'Velocity', vx: 0, vy: 0, angular: 5 };
    w.addComponent('e', t);
    w.addComponent('e', v);

    w.tick();
    expect(w.getComponent<Transform>('e', 'Transform')!.rotation).toBe(0);
  });

  it('没有 Velocity 的实体不动（query 不命中）', () => {
    const w = worldWithMotion();
    w.createEntity('static');
    const t: Transform = { type: 'Transform', x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 };
    w.addComponent('static', t);

    w.tick();
    const tr = w.getComponent<Transform>('static', 'Transform')!;
    expect([tr.x, tr.y]).toEqual([10, 20]);
  });

  it('一 tick 内多个实体各自独立移动', () => {
    const w = worldWithMotion();
    w.createEntity('a');
    w.addComponent('a', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('a', { type: 'Velocity', vx: 1, vy: 0, angular: 0 } as Velocity);
    w.createEntity('b');
    w.addComponent('b', { type: 'Transform', x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('b', { type: 'Velocity', vx: -4, vy: 0, angular: 0 } as Velocity);

    w.tick();
    expect(w.getComponent<Transform>('a', 'Transform')!.x).toBe(1);
    expect(w.getComponent<Transform>('b', 'Transform')!.x).toBe(96);
  });
});
