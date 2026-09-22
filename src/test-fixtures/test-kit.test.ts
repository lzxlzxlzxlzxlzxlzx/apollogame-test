import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import { worldWith, button, press, tickN, expectDeterministic, expectRestoreContinues, expectQuiescent } from './test-kit.js';
import { eventWhenCapability } from '@skills/tier2/event-when.js';
import { cooldownCapability, type Cooldowns } from '@skills/tier2/cooldown.js';
import type { Signal } from '@engine/protocol/components.js';

// test-kit 自检：按钮真产信号；三条契约断言「能绿也能红」（红的一侧用一个故意藏状态的 system 触发）。

function cdWorld(): World {
  const w = worldWith(eventWhenCapability, cooldownCapability);
  w.createEntity('hero');
  w.addComponent<Cooldowns>('hero', { type: 'Cooldowns', slots: [{ id: 'dash', duration: 3, remaining: 0 }], startOn: [{ signal: 'dash', id: 'dash' }], readySignal: 'ready' });
  button(w, 'btn', 'dash');
  return w;
}

describe('test-kit', () => {
  it('button/press：按住一拍产出 Signal，下一拍自动清', () => {
    const w = cdWorld();
    press(w, 'btn');
    expect(w.getComponent<Signal>('btn', 'Signal')?.name).toBe('dash');
    w.tick();
    expect(w.getComponent<Signal>('btn', 'Signal')).toBeUndefined();
  });

  it('三契约在合规能力上全绿', () => {
    expectDeterministic(cdWorld, (w) => { press(w, 'btn'); tickN(w, 2); press(w, 'btn'); });
    expectRestoreContinues(cdWorld, (w) => press(w, 'btn'), (w) => tickN(w, 3));
    const w = cdWorld(); press(w, 'btn');
    expectQuiescent(w, 4, 4);
  });

  it('撤修验红：把状态藏在闭包里的 system → 存档契约转红；每拍自激的 system → 静止契约转红', () => {
    const leaky = (): World => {
      const w = new World();
      let hidden = 0; // 运行态不在组件里
      w.addSystem({ id: 'leaky', phase: 0, reads: [], writes: ['Resource'], consumes: [], execute(world) {
        hidden += 1;
        const r = world.getComponent<{ type: 'Resource'; id: string; current: number; min: number; max: number }>('x', 'Resource');
        if (r) r.current = hidden;
      } });
      w.createEntity('x');
      w.addComponent('x', { type: 'Resource', id: 'n', current: 0, min: 0, max: 99 });
      return w;
    };
    expect(() => expectRestoreContinues(leaky, (w) => tickN(w, 2), (w) => tickN(w, 1))).toThrow();
    expect(() => expectQuiescent(leaky(), 2)).toThrow();
    expectDeterministic(leaky, (w) => tickN(w, 3)); // 确定性契约对它仍绿——三条契约各抓各的
  });
});
