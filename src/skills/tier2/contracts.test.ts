import { describe, it } from 'vitest';
import type { World } from '@engine/core/world.js';
import { worldWith, button, press, tickN, expectDeterministic, expectRestoreContinues, expectQuiescent } from '../../test-fixtures/test-kit.js';
import { eventWhenCapability } from './event-when.js';
import { turnOrderCapability, type TurnOrder } from './turn-order.js';
import { cooldownCapability, type Cooldowns } from './cooldown.js';
import { conveyorQueueCapability, type ConveyorQueue } from './conveyor-queue.js';
import { gaugeCapability } from './gauge.js';
import { overTimeCapability } from './over-time.js';
import { prefabCapability } from '@skills/tier3/prefab.js';
import { timerCapability } from '@atom-skills/timer/index.js';
import { resourceCapability } from '@atom-skills/resource/index.js';
import { lifetimeCapability } from '@skills/tier1/lifetime.js';
import { destroyCapability } from '@atom-skills/destroy/index.js';
import type { Flag, PrefabLibrary, Resource, Gauge, Hierarchy, Shape, OverTime } from '@engine/protocol/components.js';

// 契约三件套（test-kit）：带运行态的 capability 都要过——确定性 / 存档续跑 / 静止零写入。
// 语义测试各自在 *.test.ts；这里只钉「跨 capability 一致的底线」，新 capability 往下加一段即可。

const turnTable = (): World => {
  const w = worldWith(eventWhenCapability, turnOrderCapability);
  for (const p of ['p1', 'p2', 'p3']) { w.createEntity(p); w.addComponent<Flag>(p, { type: 'Flag', id: 'out', active: p === 'p2' }); }
  w.createEntity('table');
  w.addComponent<TurnOrder>('table', { type: 'TurnOrder', id: 'table', order: ['p1', 'p2', 'p3'], current: 0, round: 1, direction: 1, advanceSignal: 'end', changedSignal: 'turn', roundSignal: 'round', skipFlag: 'out' });
  button(w, 'btn', 'end');
  return w;
};

const cdWorld = (): World => {
  const w = worldWith(eventWhenCapability, cooldownCapability);
  w.createEntity('hero');
  w.addComponent<Cooldowns>('hero', { type: 'Cooldowns', slots: [{ id: 'a', duration: 2, remaining: 0 }, { id: 'b', duration: 4, remaining: 0 }], startOn: [{ signal: 'a', id: 'a' }, { signal: 'b', id: 'b' }], readySignal: 'ready', blockedSignal: 'blocked' });
  button(w, 'ba', 'a'); button(w, 'bb', 'b');
  return w;
};

const belt = (): World => {
  const w = worldWith(eventWhenCapability, prefabCapability, timerCapability, lifetimeCapability, destroyCapability, conveyorQueueCapability);
  w.createEntity('lib');
  w.addComponent<PrefabLibrary>('lib', { type: 'PrefabLibrary', seq: 0, templates: { cannon: { entities: { c: { Transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } } } } } } as unknown as PrefabLibrary);
  w.createEntity('belt');
  w.addComponent<ConveyorQueue>('belt', { type: 'ConveyorQueue', id: 'belt', template: 'cannon', enqueueSignal: 'tap', capacity: 3, popSignal: 'fire', fullSignal: 'full', originX: 0, originY: 0, stepX: 10, stepY: 0, members: [], inFlight: 0, rejected: 0, seq: 0 });
  for (const b of ['t1', 't2', 't3', 't4']) button(w, b, 'tap');
  button(w, 'fireBtn', 'fire');
  return w;
};

const gaugeBar = (): World => {
  const w = worldWith(gaugeCapability);
  w.createEntity('owner');
  w.addComponent<Resource>('owner', { type: 'Resource', id: 'hp', current: 60, min: 0, max: 100 });
  w.createEntity('bar');
  w.addComponent<Hierarchy>('bar', { type: 'Hierarchy', parentId: 'owner', localX: 0, localY: 0, localRotation: 0, localScaleX: 1, localScaleY: 1 });
  w.addComponent<Shape>('bar', { type: 'Shape', kind: 'box', width: 40, height: 4 });
  w.addComponent<Gauge>('bar', { type: 'Gauge', resourceId: 'hp', fromParent: true, width: 40 });
  return w;
};

const dotWorld = (): World => {
  const w = worldWith(overTimeCapability, resourceCapability);
  w.createEntity('mob');
  w.addComponent<Resource>('mob', { type: 'Resource', id: 'hp', current: 100, min: 0, max: 100 });
  w.addComponent<OverTime>('mob', { type: 'OverTime', effects: [{ id: 'poison', resource: 'hp', amountPerTick: -5, period: 2, duration: 6, elapsed: 0 }] });
  return w;
};

describe('契约三件套', () => {
  it('t2-turn-order', () => {
    const drive = (w: World) => { press(w, 'btn'); press(w, 'btn'); tickN(w, 1); press(w, 'btn'); };
    expectDeterministic(turnTable, drive);
    expectRestoreContinues(turnTable, (w) => press(w, 'btn'), (w) => { press(w, 'btn'); press(w, 'btn'); });
    const w = turnTable(); press(w, 'btn'); expectQuiescent(w, 4, 1);
  });

  it('t2-cooldown', () => {
    const drive = (w: World) => { press(w, 'ba', 'bb'); press(w, 'ba'); tickN(w, 3); press(w, 'bb'); };
    expectDeterministic(cdWorld, drive);
    // 存档点落在「一个槽冷却中、一个刚被阻塞」的中途拍
    expectRestoreContinues(cdWorld, (w) => { press(w, 'ba', 'bb'); press(w, 'ba'); }, (w) => tickN(w, 5));
    const w = cdWorld(); press(w, 'bb'); expectQuiescent(w, 4, 5);
  });

  it('t2-conveyor-queue（载体实体 + prefab 展开 + lifetime 回收全链）', () => {
    const drive = (w: World) => { press(w, 't1', 't2', 't3', 't4'); tickN(w, 2); press(w, 'fireBtn'); tickN(w, 4); press(w, 't1'); tickN(w, 4); };
    expectDeterministic(belt, drive);
    // 存档点落在「载体已发、prefab 尚未展开」的最脆弱一拍
    expectRestoreContinues(belt, (w) => press(w, 't1', 't2'), (w) => { tickN(w, 3); press(w, 'fireBtn'); tickN(w, 4); });
    const w = belt(); press(w, 't1', 't2'); expectQuiescent(w, 4, 6);
  });

  it('t2-gauge（资源改变后的投影可重放；无输入时宽度与锚位不漂移）', () => {
    const drive = (w: World) => {
      tickN(w, 1);
      w.getComponent<Resource>('owner', 'Resource')!.current = 25;
      tickN(w, 2);
    };
    expectDeterministic(gaugeBar, drive);
    expectRestoreContinues(gaugeBar, (w) => tickN(w, 1), (w) => {
      w.getComponent<Resource>('owner', 'Resource')!.current = 25;
      tickN(w, 2);
    });
    expectQuiescent(gaugeBar(), 4, 1);
  });

  it('t2-over-time（周期中途存档仍按原拍结算；到期后世界静止）', () => {
    expectDeterministic(dotWorld, (w) => tickN(w, 8));
    expectRestoreContinues(dotWorld, (w) => tickN(w, 3), (w) => tickN(w, 5));
    expectQuiescent(dotWorld(), 4, 6);
  });
});
