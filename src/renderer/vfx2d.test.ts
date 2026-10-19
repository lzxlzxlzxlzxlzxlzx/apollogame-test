import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { Vfx2DLayer, lerpColor } from './vfx2d.js';
import type { Vfx2D } from '@atom-skills/vfx2d/index.js';
import type { Transform, Signal } from '@engine/protocol/components.js';
import { NON_DETERMINISTIC } from '@net/determinism.js';

// renderer/vfx2d：纯表现粒子层——触发/门控/寿命回收/上限/实体消失清池/确定性；Vfx2D 不进 hash。

function emitterWorld(v: Partial<Vfx2D> & { kind: Vfx2D['kind'] }): World {
  const w = new World();
  w.createEntity('fx');
  w.addComponent<Transform>('fx', { type: 'Transform', x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 });
  w.addComponent<Vfx2D>('fx', { type: 'Vfx2D', ...v } as Vfx2D);
  return w;
}
const fire = (w: World, name: string) => w.addComponent<Signal>('fx', { type: 'Signal', name, source: 'fx' });
const quiet = (w: World) => w.removeComponent('fx', 'Signal');

describe('renderer/vfx2d', () => {
  it('burst：只在同实体 Signal 命中的帧放 count 颗；寿命到期回收', () => {
    const w = emitterWorld({ kind: 'burst', trigger: 'hit', count: 8, life: 0.5, lifeVar: 0 });
    const L = new Vfx2DLayer();
    expect(L.step(w, 1 / 60)).toBe(false);
    fire(w, 'hit'); expect(L.step(w, 1 / 60)).toBe(true); expect(L.liveCount).toBe(8);
    fire(w, 'other'); L.step(w, 1 / 60); expect(L.liveCount).toBe(8);
    quiet(w); for (let i = 0; i < 40; i++) L.step(w, 1 / 60);
    expect(L.liveCount).toBe(0);
  });

  it('pop：首次看见放一次；之后不再放', () => {
    const w = emitterWorld({ kind: 'pop', count: 5, life: 1 });
    const L = new Vfx2DLayer();
    L.step(w, 0.01); L.step(w, 0.01);
    expect(L.liveCount).toBe(5);
  });

  it('stream：每秒 count 颗按 dt 累积；trigger 门控——无信号不喷且清累积；max 封顶', () => {
    const w = emitterWorld({ kind: 'stream', trigger: 'thrust', count: 60, life: 10, max: 20 });
    const L = new Vfx2DLayer();
    L.step(w, 0.1); expect(L.liveCount).toBe(0);
    fire(w, 'thrust'); L.step(w, 0.1); expect(L.liveCount).toBe(6);
    L.step(w, 0.5); expect(L.liveCount).toBe(20);
    const free = emitterWorld({ kind: 'trail', count: 30, life: 10 });
    const L2 = new Vfx2DLayer(); L2.step(free, 0.1); expect(L2.liveCount).toBe(3);
  });

  it('ring：一颗 ring 粒子（半径 = age·speed）', () => {
    const w = emitterWorld({ kind: 'ring', trigger: 'land', speed: 100, life: 1, lifeVar: 0 });
    const L = new Vfx2DLayer(); fire(w, 'land'); L.step(w, 0.25);
    expect(L.liveCount).toBe(1);
  });

  it('实体消失 → 发射器连粒子一起清；确定性：同 id 同输入 → 同粒子态', () => {
    const a = emitterWorld({ kind: 'burst', trigger: 'hit', count: 6 });
    const b = emitterWorld({ kind: 'burst', trigger: 'hit', count: 6 });
    const La = new Vfx2DLayer(), Lb = new Vfx2DLayer();
    fire(a, 'hit'); fire(b, 'hit'); La.step(a, 0.02); Lb.step(b, 0.02);
    const snap = (L: Vfx2DLayer) => JSON.stringify((L as unknown as { emitters: Map<string, { particles: unknown[] }> }).emitters.get('fx')!.particles);
    expect(snap(La)).toBe(snap(Lb));
    a.destroyEntity('fx'); expect(La.step(a, 0.02)).toBe(false); expect(La.liveCount).toBe(0);
  });

  it('draw：按粒子调用 canvas 原语并复位 alpha/blend；Vfx2D 在 NON_DETERMINISTIC', () => {
    const w = emitterWorld({ kind: 'burst', trigger: 'hit', count: 3, shape: 'square', color: 0xff0000, colorEnd: 0x0000ff });
    const L = new Vfx2DLayer(); fire(w, 'hit'); L.step(w, 0.1);
    const calls: string[] = [];
    const ctx = new Proxy({ globalAlpha: 1, globalCompositeOperation: 'source-over' } as Record<string, unknown>, {
      get: (o, k: string) => (k in o ? o[k] : (...a: unknown[]) => { calls.push(k); return a; }),
      set: (o, k: string, val) => { o[k] = val; return true; },
    }) as unknown as CanvasRenderingContext2D;
    L.draw(ctx, w);
    expect(calls.filter((c) => c === 'fillRect')).toHaveLength(3);
    expect(ctx.globalAlpha).toBe(1); expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(lerpColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
    expect(NON_DETERMINISTIC.has('Vfx2D')).toBe(true);
  });
});
