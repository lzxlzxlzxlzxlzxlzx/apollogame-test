import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { KeyBinding, InputQueue, Signal, RawInputData } from '@engine/protocol/components.js';
import { validateComponentData } from '../../assembly/validate-manifest.js';
import type { EntityBlueprint } from '../../assembly/demo.assembly.js';
import { keybindCapability } from './keybind.js';

const sig = (w: World, e: string): Signal | undefined => w.getComponent<Signal>(e, 'Signal');

function world(): World {
  const w = new World();
  for (const s of keybindCapability.systems) w.addSystem(s);
  return w;
}
function input(w: World, actions: RawInputData[]): void {
  w.createEntity('global-input');
  w.addComponent('global-input', { type: 'InputQueue', actions } as InputQueue);
}
function bind(w: World, id: string, kb: Omit<KeyBinding, 'type'>): void {
  w.createEntity(id);
  w.addComponent(id, { type: 'KeyBinding', ...kb } as KeyBinding);
}

describe('keybind — 元数据 / 定序', () => {
  it('id 正确 + runsAfter event-when（信号不被全局清扫误删）', () => {
    expect(keybindCapability.id).toBe('t2-keybind');
    expect(keybindCapability.systems[0].runsAfter).toContain('event-when');
  });
});

describe('keybind — 具名动作 → Signal', () => {
  it('key 命中 → 产出 Signal{name:signal}', () => {
    const w = world();
    bind(w, 'b1', { key: '1', signal: 'cast_nova' });
    input(w, [{ source: 'p1', key: '1', phase: 'down' }]);
    w.tick();
    expect(sig(w, 'b1')).toMatchObject({ name: 'cast_nova', source: 'b1' });
  });

  it('key 不命中 → 不产出', () => {
    const w = world();
    bind(w, 'b1', { key: '1', signal: 'cast_nova' });
    input(w, [{ source: 'p1', key: '2', phase: 'down' }]);
    w.tick();
    expect(sig(w, 'b1')).toBeUndefined();
  });

  it('phase 过滤：相位不符不触发', () => {
    const w = world();
    bind(w, 'b1', { key: 'q', signal: 'dash', phase: 'down' });
    input(w, [{ source: 'p1', key: 'q', phase: 'up' }]);
    w.tick();
    expect(sig(w, 'b1')).toBeUndefined();
    // 相位匹配则触发。
    w.getComponent<InputQueue>('global-input', 'InputQueue')!.actions = [{ source: 'p1', key: 'q', phase: 'down' }];
    w.tick();
    expect(sig(w, 'b1')).toMatchObject({ name: 'dash' });
  });

  it('多绑定各自匹配；上一帧 Signal 每帧先清后标', () => {
    const w = world();
    bind(w, 'b1', { key: '1', signal: 'cast_nova' });
    bind(w, 'b2', { key: '2', signal: 'cast_smash' });
    input(w, [{ source: 'p1', key: '2', phase: 'action' }]);
    w.tick();
    expect(sig(w, 'b1')).toBeUndefined();
    expect(sig(w, 'b2')).toMatchObject({ name: 'cast_smash' });
    // 下一帧无输入 → 旧 Signal 清掉。
    w.getComponent<InputQueue>('global-input', 'InputQueue')!.actions = [];
    w.tick();
    expect(sig(w, 'b2')).toBeUndefined();
  });

  it('arg 透传：动作带 arg → Signal{name,arg}（带参 UI 动作通道·UI 发「买哪件」）', () => {
    const w = world();
    bind(w, 'b1', { key: 'buy', signal: 'buy' });
    input(w, [{ source: 'p1', key: 'buy', phase: 'action', arg: 'card_42' }]);
    w.tick();
    expect(sig(w, 'b1')).toMatchObject({ name: 'buy', source: 'b1', arg: 'card_42' });
  });

  it('无 arg 的动作 → Signal 不挂 arg 字段（旧内容形状/hash 不变）', () => {
    const w = world();
    bind(w, 'b1', { key: '1', signal: 'cast' });
    input(w, [{ source: 'p1', key: '1', phase: 'down' }]);
    w.tick();
    expect('arg' in sig(w, 'b1')!).toBe(false); // 不写 arg:undefined
  });
});

// ── 代发 source（REQ-108-ENG-04·owner 2026-08-07 判 A）────────────────────────
describe('keybind — 代发 Signal.source（REQ-108-ENG-04）', () => {
  it('填了 source → Signal.source = 该实体（信号组件仍挂在 KeyBinding 实体上）', () => {
    const w = world();
    bind(w, 'kb:throw:rock', { key: 'throw.rock', signal: 'throw.rock', source: 'p1' });
    input(w, [{ source: 'p1', key: 'throw.rock', phase: 'down' }]);
    w.tick();
    // 认人的是 source 字段，不是挂载实体——这正是接缝要的那一位。
    expect(sig(w, 'kb:throw:rock')).toMatchObject({ name: 'throw.rock', source: 'p1' });
    // 生命周期不变：信号仍挂在 kb 实体（清扫逻辑①按 KeyBinding 实体清）。
    expect(sig(w, 'p1')).toBeUndefined();
  });

  it('不填 source → 零回归：仍是挂载实体自己', () => {
    const w = world();
    bind(w, 'kb1', { key: 'q', signal: 'dash' });
    input(w, [{ source: 'p1', key: 'q', phase: 'down' }]);
    w.tick();
    expect(sig(w, 'kb1')!.source).toBe('kb1');
  });

  it('代发照样透传 arg（带参代发：谁 + 干了什么 两件都在）', () => {
    const w = world();
    bind(w, 'kb2', { key: 'buy', signal: 'buy', source: 'p1' });
    input(w, [{ source: 'p1', key: 'buy', phase: 'down', arg: 'card_42' }]);
    w.tick();
    expect(sig(w, 'kb2')).toMatchObject({ name: 'buy', source: 'p1', arg: 'card_42' });
  });

  it('多绑定各自代发到不同主体（双人同屏：同一动作名按主体分流）', () => {
    const w = world();
    bind(w, 'kb:p1:rock', { key: 'throw.rock', signal: 'throw', source: 'p1' });
    bind(w, 'kb:p2:rock', { key: 'p2.throw.rock', signal: 'throw', source: 'p2' });
    input(w, [{ source: 'x', key: 'throw.rock', phase: 'down' }, { source: 'x', key: 'p2.throw.rock', phase: 'down' }]);
    w.tick();
    expect(sig(w, 'kb:p1:rock')!.source).toBe('p1');
    expect(sig(w, 'kb:p2:rock')!.source).toBe('p2');
  });

  it('source 空串 = 数据错 → 点名硬抛（不静默退回本实体）', () => {
    const w = world();
    bind(w, 'kb-bad', { key: 'x', signal: 's', source: '' });
    input(w, [{ source: 'p1', key: 'x', phase: 'down' }]);
    expect(() => w.tick()).toThrow(/KeyBinding\.source 是空串/);
  });
});

describe('keybind — 声明式条件门（CAPGAP-RHETORIC-003）', () => {
  const validateWhen = (when: unknown) => validateComponentData(
    [keybindCapability],
    { binding: { KeyBinding: { key: 'end-turn', signal: 'end-turn', when } } } as unknown as Record<string, EntityBlueprint>,
  );

  it('manifest 落盘门接受合法嵌套条件，拒绝未知 kind、缺字段与非法比较符', () => {
    expect(validateWhen({ kind: 'and', of: [
      { kind: 'flag', id: 'can-play', equals: true },
      { kind: 'resource', id: 'focus', cmp: 'gte', value: 1 },
    ] }).errors).toHaveLength(0);

    for (const invalid of [
      { kind: 'not-a-condition' },
      { kind: 'flag', equals: true },
      { kind: 'resource', id: 'focus', cmp: 'approximately', value: 1 },
    ]) {
      expect(validateWhen(invalid).errors, JSON.stringify(invalid)).not.toHaveLength(0);
    }
  });

  it('门开产 Signal；门关 fail-closed 并写聚合 reject trace；缺省 when 保持旧行为', () => {
    const w = world();
    w.createEntity('gate'); w.addComponent('gate', { type: 'Flag', id: 'can-play', active: false } as any);
    w.createEntity('trace'); w.addComponent('trace', { type: 'DebugTrace', events: [] } as any);
    bind(w, 'guarded', { key: 'end-turn', signal: 'end-turn', when: { kind: 'flag', id: 'can-play', equals: true } });
    bind(w, 'legacy', { key: 'inspect', signal: 'inspect' });
    input(w, [{ source: 'ui', key: 'end-turn', phase: 'action' }, { source: 'ui', key: 'inspect', phase: 'action' }]);
    w.tick();
    expect(sig(w, 'guarded')).toBeUndefined();
    expect(sig(w, 'legacy')?.name).toBe('inspect');
    expect(w.getComponent<any>('trace', 'DebugTrace').events).toEqual(expect.arrayContaining([expect.objectContaining({ system: 'keybind', kind: 'reject', what: expect.stringContaining('条件门关闭') })]));
    w.getComponent<any>('gate', 'Flag').active = true;
    w.getComponent<any>('global-input', 'InputQueue').actions = [{ source: 'ui', key: 'end-turn', phase: 'action' }];
    w.tick();
    expect(sig(w, 'guarded')?.name).toBe('end-turn');
  });
});
