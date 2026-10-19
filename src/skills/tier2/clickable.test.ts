import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Transform, Shape, Sprite, Signal, InputQueue, Clickable, RawInputData, DebugTrace, KeyBinding } from '@engine/protocol/components.js';
import { clickableCapability } from './clickable.js';
import { keybindCapability } from './keybind.js';

function worldWithClickable(strict = false): World {
  const w = new World({ strict });
  for (const s of clickableCapability.systems) w.addSystem(s);
  return w;
}

function setInput(w: World, actions: RawInputData[]): void {
  const e = 'input';
  if (!w.hasComponent(e, 'InputQueue')) w.createEntity(e);
  w.addComponent(e, { type: 'InputQueue', actions } as InputQueue);
}

function box(w: World, eid: string, x: number, y: number, width: number, height: number, action: string, opts: { phase?: string; z?: number; scaleX?: number } = {}): void {
  if (!w.hasComponent(eid, 'Transform')) w.createEntity(eid);
  w.addComponent(eid, { type: 'Transform', x, y, rotation: 0, scaleX: opts.scaleX ?? 1, scaleY: 1 } as Transform);
  w.addComponent(eid, { type: 'Shape', kind: 'box', width, height } as Shape);
  w.addComponent(eid, { type: 'Clickable', action, phase: opts.phase } as Clickable);
  if (opts.z !== undefined) w.addComponent(eid, { type: 'Sprite', textureKey: '', anchorX: 0.5, anchorY: 0.5, zOrder: opts.z } as Sprite);
}

function down(x: number, y: number): RawInputData {
  return { source: 'p1', x, y, phase: 'down' };
}

function sig(w: World, eid: string): string | undefined {
  return w.getComponent<Signal>(eid, 'Signal')?.name;
}

describe('T2 clickable — metadata', () => {
  it('id / 读 Clickable+几何+输入 / 写 Signal / 排在 event-when 后', () => {
    expect(clickableCapability.id).toBe('t2-clickable');
    expect(clickableCapability.components.writes).toEqual(['Signal']);
    expect(clickableCapability.components.reads).toContain('InputQueue');
    expect(clickableCapability.systems[0].runsAfter).toContain('event-when');
  });
});

describe('T2 clickable — 无相机：屏幕即世界', () => {
  it('命中 → 在命中实体上产出 Signal{name:action,source:自身}', () => {
    const w = worldWithClickable();
    box(w, 'btn', 100, 100, 80, 40, 'craft_sword');
    setInput(w, [down(100, 100)]);
    w.tick();
    expect(sig(w, 'btn')).toBe('craft_sword');
    expect(w.getComponent<Signal>('btn', 'Signal')?.source).toBe('btn');
  });

  it('未命中（点在框外）→ 无 Signal', () => {
    const w = worldWithClickable();
    box(w, 'btn', 100, 100, 80, 40, 'craft_sword');
    setInput(w, [down(500, 500)]);
    w.tick();
    expect(w.hasComponent('btn', 'Signal')).toBe(false);
  });
});

describe('T2 clickable — 世界坐标盲信（逆投影上移采集层，sim 不读相机 → lockstep 安全）', () => {
  it('输入 x/y 直接当世界坐标命中（不在 sim 内逆投影）', () => {
    const w = worldWithClickable();
    box(w, 'cell', 50, 0, 20, 20, 'cell');
    setInput(w, [down(50, 0)]); // 世界坐标（PointerInputSource 已在采集期换算好）
    w.tick();
    expect(sig(w, 'cell')).toBe('cell');
  });

  it('sim 不读 Camera（避免本地相机/视口进 hash → 防多端同令异坐标 desync，Gemini 致命级修正）', () => {
    expect(clickableCapability.components.reads).not.toContain('Camera');
  });
});

describe('T2 clickable — 相位 / 最上层 / 信号清扫', () => {
  it('phase 不匹配不触发；匹配才触发', () => {
    const w = worldWithClickable();
    box(w, 'btn', 0, 0, 100, 100, 'release', { phase: 'up' });
    setInput(w, [down(0, 0)]); // down ≠ up
    w.tick();
    expect(w.hasComponent('btn', 'Signal')).toBe(false);
    setInput(w, [{ source: 'p1', x: 0, y: 0, phase: 'up' }]);
    w.tick();
    expect(sig(w, 'btn')).toBe('release');
  });

  it('重叠命中只触发最上层（zOrder 最大）', () => {
    const w = worldWithClickable();
    box(w, 'low', 0, 0, 100, 100, 'low', { z: 0 });
    box(w, 'high', 0, 0, 100, 100, 'high', { z: 10 });
    setInput(w, [down(0, 0)]);
    w.tick();
    expect(sig(w, 'high')).toBe('high');
    expect(w.hasComponent('low', 'Signal')).toBe(false);
  });

  it('下一帧无输入 → 上帧 Signal 被清', () => {
    const w = worldWithClickable();
    box(w, 'btn', 0, 0, 100, 100, 'go');
    setInput(w, [down(0, 0)]);
    w.tick();
    expect(sig(w, 'btn')).toBe('go');
    setInput(w, []);
    w.tick();
    expect(w.hasComponent('btn', 'Signal')).toBe(false);
  });
});

function maskedBox(w: World, eid: string, opts: { z?: number; fit?: 'cover' | 'contain'; scaleX?: number; mask?: Clickable['hitMask'] } = {}): void {
  box(w, eid, 10, 20, 4, 2, eid, { z: opts.z ?? 0, scaleX: opts.scaleX ?? 1 });
  w.addComponent(eid, {
    type: 'Sprite', textureKey: 'suspect.png', anchorX: 0.5, anchorY: 0.5, zOrder: opts.z ?? 0,
    ...(opts.fit ? { width: 8, height: 8, fit: opts.fit } : {}),
  } as Sprite);
  w.addComponent(eid, {
    type: 'Clickable', action: eid, hitMaskKey: 'suspect.mask',
    hitMask: opts.mask ?? { version: 1, width: 4, height: 2, threshold: 127, sourceTextureKey: 'suspect.png', rows: ['1001', '0110'] },
  } as Clickable);
}

describe('T2 clickable — 预烘焙 alpha hit-mask', () => {
  it('实心接收、透明拒收；相同世界坐标的 mouse/touch 路径等价', () => {
    const w = worldWithClickable();
    maskedBox(w, 'mask');
    setInput(w, [{ ...down(8.5, 19.5), source: 'mouse' }]);
    w.tick();
    expect(sig(w, 'mask')).toBe('mask');
    setInput(w, [{ ...down(9.5, 19.5), source: 'touch' }]);
    w.tick();
    expect(sig(w, 'mask')).toBeUndefined();
    setInput(w, [{ ...down(8.5, 19.5), source: 'touch' }]);
    w.tick();
    expect(sig(w, 'mask')).toBe('mask');
  });

  it('contain 透明留白不命中；缩放后按相同像素映射；上层透明时下层可中', () => {
    const w = worldWithClickable();
    maskedBox(w, 'top', { z: 10, fit: 'contain', scaleX: 2 });
    box(w, 'bottom', 10, 20, 30, 30, 'bottom', { z: 0 });
    setInput(w, [down(10, 16.5)]); // 目标框上侧留白
    w.tick();
    expect(sig(w, 'top')).toBeUndefined();
    expect(sig(w, 'bottom')).toBe('bottom');
    setInput(w, [down(3, 19)]); // 缩放后左上实心位
    w.tick();
    expect(sig(w, 'top')).toBe('top');
  });

  it('缺/坏/版本不符/贴图不匹配 fail-closed，trace 记录 reject', () => {
    const badMasks: Array<Clickable['hitMask']> = [undefined,
      { version: 2, width: 4, height: 2, threshold: 127, sourceTextureKey: 'suspect.png', rows: ['1111', '1111'] } as unknown as Clickable['hitMask'],
      { version: 1, width: 4, height: 2, threshold: 127, sourceTextureKey: 'other.png', rows: ['1111', '1111'] },
      { version: 1, width: 4, height: 2, threshold: 127, sourceTextureKey: 'suspect.png', rows: ['111', '1111'] },
    ];
    for (const mask of badMasks) {
      const w = worldWithClickable(true);
      maskedBox(w, 'mask');
      w.addComponent('mask', { type: 'Clickable', action: 'mask', hitMaskKey: 'suspect.mask', hitMask: mask } as Clickable);
      w.createEntity('trace');
      w.addComponent('trace', { type: 'DebugTrace', events: [] } as DebugTrace);
      setInput(w, [down(8.5, 19.5)]);
      w.tick();
      expect(sig(w, 'mask')).toBeUndefined();
      expect(w.getComponent<DebugTrace>('trace', 'DebugTrace')?.events).toEqual([
        expect.objectContaining({ system: 'clickable', kind: 'reject', what: 'mask', why: 'invalid-mask' }),
      ]);
    }
  });

  it('非零旋转 fail-closed，不把跨平台三角函数引入模拟', () => {
    const w = worldWithClickable();
    maskedBox(w, 'mask');
    w.addComponent('mask', { type: 'Transform', x: 10, y: 20, rotation: Math.PI / 2, scaleX: 1, scaleY: 1 } as Transform);
    setInput(w, [down(8.5, 19.5)]);
    w.tick();
    expect(sig(w, 'mask')).toBeUndefined();
  });

  it('键位映射与鼠标/触控命中共用具名 Signal；重复快照回放同 hash', () => {
    const build = () => {
      const w = worldWithClickable();
      for (const s of keybindCapability.systems) w.addSystem(s);
      maskedBox(w, 'inspect');
      w.createEntity('keyboard');
      w.addComponent('keyboard', { type: 'KeyBinding', key: 'inspect', signal: 'inspect' } as KeyBinding);
      return w;
    };
    const a = build();
    const b = build();
    for (const [source, event] of [
      ['mouse', down(8.5, 19.5)],
      ['touch', down(8.5, 19.5)],
      ['keyboard', { source: 'keyboard', key: 'inspect', phase: 'down' }],
    ] as const) {
      const input = { ...event, source };
      setInput(a, [input]);
      setInput(b, [input]);
      a.tick();
      b.tick();
      expect(a.snapshot()).toEqual(b.snapshot());
      expect(source === 'keyboard' ? sig(a, 'keyboard') : sig(a, 'inspect')).toBe('inspect');
    }
  });
});
