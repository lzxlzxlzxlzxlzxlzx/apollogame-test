import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { InputQueue } from '@engine/protocol/components.js';
import { QueuedInputSource } from './index.js';
import { applyCommands, INPUT_QUEUE_ENTITY } from '../index.js';

describe('QueuedInputSource — 异步事件按 tick 确定性释放', () => {
  it('enqueue 的事件在下一 commandsForTick 释放后清空', () => {
    const src = new QueuedInputSource('p1');
    expect(src.commandsForTick(1)).toEqual([]); // 空队列 → 无命令

    src.enqueueAction('choice:2', { x: 100, y: 50 });
    const cmds = src.commandsForTick(2);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].actions?.[0]).toMatchObject({ source: 'p1', key: 'choice:2', x: 100, y: 50, phase: 'action' });

    expect(src.commandsForTick(3)).toEqual([]); // 已清空
  });

  it('enqueueAction 带 arg → RawInputData.arg（带参 UI 动作进确定性命令流·透传至 Signal.arg）', () => {
    const src = new QueuedInputSource('p1');
    src.enqueueAction('buy', { arg: 'card_42' });
    const cmds = src.commandsForTick(5);
    expect(cmds[0].actions?.[0]).toMatchObject({ source: 'p1', key: 'buy', phase: 'action', arg: 'card_42' });
  });
});

describe('applyCommands — actions 落成单例 InputQueue（零实体增删，Q3）', () => {
  const queue = (w: World) => w.getComponent<InputQueue>(INPUT_QUEUE_ENTITY, 'InputQueue')!;

  it('actions 写进 InputQueue.actions；下一 tick 无 actions 则覆写为空', () => {
    const w = new World();
    const src = new QueuedInputSource('p1');
    src.enqueueAction('choice:1', { x: 10, y: 20 });

    applyCommands(w, src.commandsForTick(1));
    expect(queue(w).actions).toHaveLength(1);
    expect(queue(w).actions[0]).toMatchObject({ key: 'choice:1', x: 10, y: 20, source: 'p1' });

    // 下一 tick 无输入 → 整体覆写为空（不新建/销毁实体）
    applyCommands(w, src.commandsForTick(2));
    expect(queue(w).actions).toHaveLength(0);
    // 仍是同一个单例实体
    expect(w.queryEntities('InputQueue')).toEqual([INPUT_QUEUE_ENTITY]);
  });
});
