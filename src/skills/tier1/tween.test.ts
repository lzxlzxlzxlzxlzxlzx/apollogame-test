import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Tween, Color, Transform } from '@engine/protocol/components.js';
import { tweenCapability } from './tween.js';

function worldWithTween(): World {
  const w = new World();
  for (const s of tweenCapability.systems) w.addSystem(s);
  return w;
}
function addTween(w: World, eid: string, t: Partial<Tween> & Pick<Tween, 'target' | 'from' | 'to' | 'duration'>): void {
  w.addComponent(eid, {
    type: 'Tween',
    elapsed: 0,
    easing: 'linear',
    done: false,
    ...t,
  } as Tween);
}

describe('T1 tween — metadata', () => {
  it('id / 读 Tween / 只写 Transform+Color（逻辑数值不走 tween，Gemini Q6）', () => {
    expect(tweenCapability.id).toBe('t1-tween');
    expect(tweenCapability.components.reads).toEqual(['Tween']);
    expect(tweenCapability.components.writes).toEqual(['Transform', 'Color', 'Tween']); // P1a 严格模式补齐：推进 elapsed / 播完摘掉 = 写自身
  });
});

describe('T1 tween — 线性插值与收尾', () => {
  it('Color.alpha 从 0 线性插到 1（duration=4），逐帧推进并在终点 done', () => {
    const w = worldWithTween();
    w.createEntity('portrait');
    w.addComponent('portrait', { type: 'Color', tint: 0xffffff, alpha: 0 } as Color);
    addTween(w, 'portrait', { target: 'Color.alpha', from: 0, to: 1, duration: 4, easing: 'linear' });

    const alpha = () => w.getComponent<Color>('portrait', 'Color')!.alpha;
    w.tick();
    expect(alpha()).toBeCloseTo(0.25);
    w.tick();
    expect(alpha()).toBeCloseTo(0.5);
    w.tick();
    w.tick();
    expect(alpha()).toBeCloseTo(1);
    // 完成即移除 Tween（防僵尸空赋值，Reviewer #2）。
    expect(w.hasComponent('portrait', 'Tween')).toBe(false);
  });

  it('完成后 Tween 被移除，终值精确锁定且后续 tick 不再变', () => {
    const w = worldWithTween();
    w.createEntity('p');
    w.addComponent('p', { type: 'Color', tint: 0, alpha: 0 } as Color);
    addTween(w, 'p', { target: 'Color.alpha', from: 0, to: 1, duration: 2, easing: 'linear' });
    w.tick();
    w.tick(); // 到点：写终值 + 移除
    expect(w.hasComponent('p', 'Tween')).toBe(false);
    expect(w.getComponent<Color>('p', 'Color')!.alpha).toBeCloseTo(1);
    w.tick(); // 无 Tween，不再变
    expect(w.getComponent<Color>('p', 'Color')!.alpha).toBeCloseTo(1);
  });

  it('duration<=0 立即到 to', () => {
    const w = worldWithTween();
    w.createEntity('p');
    w.addComponent('p', { type: 'Transform', x: -100, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    addTween(w, 'p', { target: 'Transform.x', from: -100, to: 0, duration: 0, easing: 'linear' });
    w.tick();
    expect(w.getComponent<Transform>('p', 'Transform')!.x).toBeCloseTo(0);
  });
});

describe('T1 tween — 缓动曲线', () => {
  it('easeIn(quad) 在中点低于线性', () => {
    const w = worldWithTween();
    w.createEntity('p');
    w.addComponent('p', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    addTween(w, 'p', { target: 'Transform.x', from: 0, to: 100, duration: 2, easing: 'easeIn' });
    w.tick(); // t=0.5 → easeIn = 0.25 → 25
    expect(w.getComponent<Transform>('p', 'Transform')!.x).toBeCloseTo(25);
  });

  it('easeOut(quad) 在中点高于线性', () => {
    const w = worldWithTween();
    w.createEntity('p');
    w.addComponent('p', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    addTween(w, 'p', { target: 'Transform.x', from: 0, to: 100, duration: 2, easing: 'easeOut' });
    w.tick(); // t=0.5 → easeOut = 0.75 → 75
    expect(w.getComponent<Transform>('p', 'Transform')!.x).toBeCloseTo(75);
  });
});

describe('T1 tween — loop / pingpong（REQ-004，连续往复）', () => {
  const x = (w: World) => w.getComponent<Transform>('p', 'Transform')!.x;
  function movingPlatform(loop: 'restart' | 'pingpong', loops?: number): World {
    const w = worldWithTween();
    w.createEntity('p');
    w.addComponent('p', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    addTween(w, 'p', { target: 'Transform.x', from: 0, to: 10, duration: 2, easing: 'linear', loop, loops });
    return w;
  }

  it('restart：到点写终值后归零重跑（不移除）', () => {
    const w = movingPlatform('restart');
    w.tick(); // t=0.5 → 5
    expect(x(w)).toBeCloseTo(5);
    w.tick(); // 到点 → 写 to(10)，归零
    expect(x(w)).toBeCloseTo(10);
    expect(w.hasComponent('p', 'Tween')).toBe(true); // 仍在循环
    w.tick(); // 重跑 t=0.5 → 又回到 5
    expect(x(w)).toBeCloseTo(5);
  });

  it('pingpong：来回往复（0→10→0→10）', () => {
    const w = movingPlatform('pingpong');
    w.tick(); // 5
    w.tick(); // 到点 → 10，交换 from/to（now 10→0）
    expect(x(w)).toBeCloseTo(10);
    w.tick(); // 10→0 的 t=0.5 → 5
    expect(x(w)).toBeCloseTo(5);
    w.tick(); // 到点 → 0，再交换（0→10）
    expect(x(w)).toBeCloseTo(0);
    expect(w.hasComponent('p', 'Tween')).toBe(true); // 持续往复
  });

  it('loops：跑满程数后停在终值并移除', () => {
    const w = movingPlatform('restart', 2);
    w.tick(); // 5
    w.tick(); // 第 1 程到点 → 10，loops 2→1，归零
    expect(w.hasComponent('p', 'Tween')).toBe(true);
    w.tick(); // 5
    w.tick(); // 第 2 程到点 → loops<=1 → 写终值、done、移除
    expect(x(w)).toBeCloseTo(10);
    expect(w.hasComponent('p', 'Tween')).toBe(false);
  });
});


describe('T1 tween — BUG-005：duration<=0 不抖动', () => {
  it('duration=0 + loop pingpong（无限）→ 即时到终值、done、移除（不每帧抖动）', () => {
    const w = worldWithTween();
    w.createEntity('e');
    w.addComponent('e', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    addTween(w, 'e', { target: 'Transform.x', from: 0, to: 10, duration: 0, loop: 'pingpong' });
    w.tick();
    expect(w.getComponent<Transform>('e', 'Transform')!.x).toBe(10); // 即时终值
    expect(w.hasComponent('e', 'Tween')).toBe(false); // 已结束移除，不再每帧交换 from/to 抖动
  });
});

// ── A2 遗留缺口腿：无效 target（「什么都没发生」分支·实测钉现状）──
describe('T1 tween — 无效 target 不崩不误写', () => {
  it("target 不在闭集（'Nope.x'）→ 不崩、零写入，计时照走、到点正常收尾移除（实测）", () => {
    const w = worldWithTween();
    w.createEntity('e');
    w.addComponent('e', { type: 'Transform', x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } as Transform);
    w.addComponent('e', { type: 'Color', tint: 0xffffff, alpha: 0.5 } as Color);
    addTween(w, 'e', { target: 'Nope.x' as Tween['target'], from: 0, to: 100, duration: 3 });
    expect(() => { for (let i = 0; i < 5; i++) w.tick(); }).not.toThrow();
    // 不误写别的组件：Transform/Color 逐字段原值（writeField 的 switch 对表外 target 是 no-op）。
    expect(w.getComponent<Transform>('e', 'Transform')).toMatchObject({ x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(w.getComponent<Color>('e', 'Color')).toMatchObject({ tint: 0xffffff, alpha: 0.5 });
    // 收尾语义（实测钉现状）：计时不因 target 无效而停 → duration 到点按缺省 loop:none 移除组件，
    // 不残留僵尸 Tween（静默拒收而非硬抛——与「未知 templateId 静默跳过」同口径）。
    expect(w.hasComponent('e', 'Tween')).toBe(false);
  });
});

// ── REQ-F-057：keep 重放保留 ──
import { World as WK } from '@engine/core/world.js';
import { tweenCapability as twCapK } from './tween.js';
describe('tween · keep 重放保留（REQ-F-057）', () => {
  it('keep:true 到点不移除：停终值置 done、每帧零写；倒带（elapsed=0/done=false）即重播', () => {
    const w = new WK();
    for (const s of twCapK.systems) w.addSystem(s);
    w.createEntity('e');
    w.addComponent('e', { type: 'Transform', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 2, } as never);
    w.addComponent('e', { type: 'Tween', target: 'Transform.scaleY', from: 2, to: 1, elapsed: 0, duration: 4, easing: 'linear', done: false, keep: true } as never);
    for (let i = 0; i < 6; i++) w.tick();
    const tw = w.getComponent('e', 'Tween') as unknown as { done: boolean; elapsed: number; from: number };
    expect(tw).toBeTruthy(); // keep：组件保留（缺省语义=到点移除）
    expect(tw.done).toBe(true);
    expect((w.getComponent('e', 'Transform') as unknown as { scaleY: number }).scaleY).toBe(1); // 锁终值
    tw.done = false; (tw as unknown as { elapsed: number }).elapsed = 0; // 倒带（drag-place 落子钩子同款）
    w.tick();
    expect((w.getComponent('e', 'Transform') as unknown as { scaleY: number }).scaleY).toBeGreaterThan(1); // 重播中（从 from 落回）
  });
});
