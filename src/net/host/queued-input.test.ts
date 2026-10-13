import { describe, it, expect, vi } from 'vitest';
import { World } from '@engine/core/world.js';
import type { InputQueue, RawInputData } from '@engine/protocol/components.js';
import { QueuedInputSource, PointerInputSource, canvasPointerToScreen } from './index.js';
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

describe('PointerInputSource — 连续指针 opt-in', () => {
  it('缩放后先逆投影，鼠标/触控共用路径；第二触点拒收，取消清握持', () => {
    expect(canvasPointerToScreen(380, 211.5, { left: 0, top: 0, width: 720, height: 450 }, 1440, 900)).toEqual({ x: 760, y: 423 });
    const listeners = new Map<string, (event: PointerEvent) => void>();
    const canvas = {
      width: 1440, height: 900,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 450 }),
      addEventListener: (name: string, handler: EventListener) => listeners.set(name, handler as (event: PointerEvent) => void),
      removeEventListener: (name: string) => listeners.delete(name),
      setPointerCapture: (_id: number) => {},
    } as unknown as HTMLCanvasElement;
    const source = new PointerInputSource('player', canvas, { move: true, worldFromScreen: (x, y) => ({ x, y }) });
    const fire = (type: string, pointerId: number, clientX: number, clientY: number) => listeners.get(type)!({ type, pointerId, clientX, clientY } as PointerEvent);
    fire('pointerdown', 7, 380, 211.5);
    fire('pointerdown', 8, 390, 220);
    fire('pointermove', 7, 385, 215);
    const first = source.commandsForTick(1)[0]!.actions!;
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ phase: 'down', pointerId: 7, x: 760, y: 423 });
    expect(first[1]).toMatchObject({ phase: 'move', pointerId: 7, x: 770, y: 430 });
    fire('pointercancel', 7, 385, 215);
    expect(source.commandsForTick(2)[0]!.actions![0]).toMatchObject({ phase: 'cancel', pointerId: 7 });
    fire('pointerdown', 8, 390, 220);
    expect(source.commandsForTick(3)[0]!.actions![0]).toMatchObject({ phase: 'down', pointerId: 8 });
    source.dispose();
    expect(listeners.size).toBe(0);
  });

  it('连续手势在入 Command 前量化世界坐标，未启用时不改旧坐标', () => {
    const listeners = new Map<string, (event: PointerEvent) => void>();
    const canvas = {
      width: 100, height: 100,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      addEventListener: (name: string, handler: EventListener) => listeners.set(name, handler as (event: PointerEvent) => void),
      removeEventListener: (name: string) => listeners.delete(name),
      setPointerCapture: (_id: number) => {},
    } as unknown as HTMLCanvasElement;
    const emit = () => listeners.get('pointerdown')!({ type: 'pointerdown', pointerId: 3, clientX: 1, clientY: 2 } as PointerEvent);
    const projected = { x: 1.123456, y: 2.654321 };
    const gesture = new PointerInputSource('p', canvas, { move: true, worldFromScreen: () => projected });
    emit();
    expect(gesture.commandsForTick(1)[0]!.actions![0]).toMatchObject({ x: Math.round(projected.x * 256) / 256, y: Math.round(projected.y * 256) / 256 });
    gesture.dispose();
    const legacy = new PointerInputSource('p', canvas, { worldFromScreen: () => projected });
    emit();
    expect(legacy.commandsForTick(1)[0]!.actions![0]).toMatchObject(projected);
    legacy.dispose();
  });

  it('预览回调收到与权威 Command 同一采样；回调故障不吞权威输入', () => {
    const listeners = new Map<string, (event: PointerEvent) => void>();
    const canvas = {
      width: 100, height: 100,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      addEventListener: (name: string, handler: EventListener) => listeners.set(name, handler as (event: PointerEvent) => void),
      removeEventListener: (name: string) => listeners.delete(name),
      setPointerCapture: (_id: number) => {},
    } as unknown as HTMLCanvasElement;
    const seen: RawInputData[] = [];
    const source = new PointerInputSource('p', canvas, { move: true, dragThreshold: 3, onPointerSample: (sample) => seen.push(sample) });
    const fire = (type: string, x: number, y: number) => listeners.get(type)!({ type, pointerId: 5, clientX: x, clientY: y } as PointerEvent);
    fire('pointerdown', 1, 2); fire('pointermove', 8, 9); fire('pointerup', 8, 9);
    const authority = source.commandsForTick(1)[0]!.actions!;
    expect(seen).toEqual(authority);
    expect(seen.map((sample) => sample.phase)).toEqual(['down', 'move', 'drag']);
    source.dispose();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = new PointerInputSource('p', canvas, { move: true, onPointerSample: () => { throw new Error('preview only'); } });
    fire('pointerdown', 1, 2);
    expect(broken.commandsForTick(2)[0]!.actions![0].phase).toBe('down');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore(); broken.dispose();
  });

  it('DPR=2 与 CSS 缩放时，触控样本和预览回调仍是同一量化世界坐标', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2, addEventListener: () => {}, removeEventListener: () => {} });
    try {
      const listeners = new Map<string, (event: PointerEvent) => void>();
      const canvas = {
        width: 2880, height: 1800,
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 720, height: 450 }),
        addEventListener: (name: string, handler: EventListener) => listeners.set(name, handler as (event: PointerEvent) => void),
        removeEventListener: (name: string) => listeners.delete(name),
        setPointerCapture: (_id: number) => {},
      } as unknown as HTMLCanvasElement;
      const seen: RawInputData[] = [];
      const source = new PointerInputSource('touch', canvas, { move: true, worldFromScreen: (x, y) => ({ x: x / 2 + 0.1234, y: y / 2 + 0.5678 }), onPointerSample: (a) => seen.push(a) });
      listeners.get('pointerdown')!({ type: 'pointerdown', pointerId: 11, pointerType: 'touch', clientX: 390, clientY: 231.5 } as PointerEvent);
      const authority = source.commandsForTick(1)[0]!.actions![0];
      expect(authority).toMatchObject({ source: 'touch', pointerId: 11, phase: 'down', x: Math.round(380.1234 * 256) / 256, y: Math.round((211.5 + 0.5678) * 256) / 256 });
      expect(seen).toEqual([authority]);
      source.dispose();
    } finally { vi.unstubAllGlobals(); }
  });
});
