import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { Resource, Flag, State, Timer, StringVar, Tag } from '@engine/protocol/components.js';
import { buildIdLookup, ctxOf, selfCtx, evalCondition, evalValue, applyWrite, compare, countByTag, writeTargetOf } from './index.js';

// P2a · 规则内核（engine-architecture-review-2026-09-02 §5 P2a）
// 钉三件：① 寻址两作用域（global 按 id 首份 / self 读自身·id 空串通配）与既有 condition/self-rule 语义逐字一致
// ② 求值：缺失引用 → 条件 false / 数值 undefined；vsResource 动态阈值；③ applyWrite 唯一 clamp：add/mul/set、
// 非有限值拒写、缺目标不动、flag 'true' 字符串也算真、state/str 字符串化。

function world(): World {
  const w = new World({ strict: false });
  w.createEntity('p');
  w.addComponent<Resource>('p', { type: 'Resource', id: 'hp', current: 50, min: 0, max: 100 });
  w.addComponent<Flag>('p', { type: 'Flag', id: 'dead', active: false });
  w.addComponent<State>('p', { type: 'State', fsmId: 'story', current: 'intro', previous: '' });
  w.addComponent<Timer>('p', { type: 'Timer', id: 't', elapsed: 30, duration: 60, loop: false } as unknown as Timer);
  w.addComponent<StringVar>('p', { type: 'StringVar', id: 'name', value: 'A' });
  w.createEntity('q');
  w.addComponent<Resource>('q', { type: 'Resource', id: 'hp', current: 5, min: 0, max: 10 }); // 同 id 第二份（global 取首份=p）
  w.addComponent<Resource>('q', { type: 'Resource', id: 'blind', current: 60, min: 0, max: 999 } as Resource); // 覆盖 q 的 Resource（一实体一组件）
  w.createEntity('tag1'); w.addComponent<Tag>('tag1', { type: 'Tag', flags: 0b011 });
  w.createEntity('tag2'); w.addComponent<Tag>('tag2', { type: 'Tag', flags: 0b100 });
  return w;
}

describe('寻址 · global 与 self', () => {
  it('global：按 id 全局路由·同 id 多份取创建序首份；缺失 → undefined', () => {
    const w = world();
    const lk = buildIdLookup(w);
    expect(lk.resource('hp')?.current).toBe(50);
    expect(lk.resource('blind')?.current).toBe(60);
    expect(lk.resource('nope')).toBeUndefined();
    expect(lk.state('story')?.current).toBe('intro');
  });

  it('self：只读自身那一份；id 不匹配 → 缺失；id 空串 = 通配（self-rule 既有语义）', () => {
    const w = world();
    const c = selfCtx(w, 'q');
    expect(evalCondition(c, { kind: 'resource', id: 'blind', cmp: 'gte', value: 60 })).toBe(true);
    expect(evalCondition(c, { kind: 'resource', id: 'hp', cmp: 'gte', value: 0 })).toBe(false); // q 的 Resource 是 blind
    expect(evalCondition(c, { kind: 'resource', id: '', cmp: 'eq', value: 60 })).toBe(true); // 通配
    expect(evalCondition(selfCtx(w, 'p'), { kind: 'flag', id: '' })).toBe(false); // dead=false → equals 缺省 true 不成立
    expect(evalCondition(selfCtx(w, 'tag1'), { kind: 'flag', id: 'dead' })).toBe(false); // 无 Flag → 不成立
  });
});

describe('求值', () => {
  it('条件树：and/or/not/五种叶子；vsResource 动态阈值（global）·self 下忽略 vsResource', () => {
    const w = world();
    const g = ctxOf(w);
    expect(evalCondition(g, { kind: 'and', of: [{ kind: 'resource', id: 'hp', cmp: 'lt', value: 60 }, { kind: 'not', of: { kind: 'flag', id: 'dead' } }] })).toBe(true);
    expect(evalCondition(g, { kind: 'or', of: [{ kind: 'state', fsmId: 'story', equals: 'end' }, { kind: 'timer', id: 't', cmp: 'gte', value: 30 }] })).toBe(true);
    expect(evalCondition(g, { kind: 'string', id: 'name', equals: 'A' })).toBe(true);
    expect(evalCondition(g, { kind: 'resource', id: 'hp', cmp: 'lt', value: 0, vsResource: 'blind' })).toBe(true); // 50 < 60
    expect(evalCondition(g, { kind: 'resource', id: 'hp', cmp: 'lt', value: 0, vsResource: 'missing' })).toBe(false); // 缺 → 退回 value 0
    expect(evalCondition(selfCtx(w, 'p'), { kind: 'resource', id: 'hp', cmp: 'lt', value: 0, vsResource: 'blind' })).toBe(false); // self 用静态 value
    expect(evalCondition(g, { kind: 'always' })).toBe(true);
  });

  it('数值表达式：常量/引用/乘/加/计数；缺引用 → undefined 传染；count 0 合法', () => {
    const w = world();
    const g = ctxOf(w);
    expect(evalValue(g, { mul: [{ res: 'hp' }, 2] })).toBe(100);
    expect(evalValue(g, { add: [{ res: 'hp' }, { res: 'blind' }] })).toBe(110);
    expect(evalValue(g, { mul: [{ res: 'nope' }, 2] })).toBeUndefined();
    expect(evalValue(g, { count: 0b001 })).toBe(1);
    expect(evalValue(g, { count: 0b111 })).toBe(2);
    expect(evalValue(g, { count: 0b1000 })).toBe(0);
    expect(countByTag(w, NaN)).toBe(0);
    expect(compare(1, 'ne', 2)).toBe(true);
  });
});

describe('applyWrite · 唯一的一份 clamp', () => {
  it('resource：add/mul/set 后钳 [min,max]；返回本步量与写后值；缺目标不动；非有限值拒写', () => {
    const w = world();
    const g = ctxOf(w);
    expect(applyWrite(g, { to: { res: 'hp' }, value: 80 })).toEqual({ ok: true, v: 80, after: 100 }); // add 钳到 max
    expect(applyWrite(g, { to: { res: 'hp' }, op: 'mul', value: 0.25 })).toEqual({ ok: true, v: 0.25, after: 25 });
    expect(applyWrite(g, { to: { res: 'hp' }, op: 'set', value: -7 })).toEqual({ ok: true, v: -7, after: 0 });
    expect(applyWrite(g, { to: { res: 'nope' }, value: 1 })).toEqual({ ok: false, reason: 'missing-target' });
    expect(applyWrite(g, { to: { res: 'hp' }, value: undefined })).toEqual({ ok: false, reason: 'invalid-value' });
    expect(applyWrite(g, { to: { res: 'hp' }, value: 'abc' })).toEqual({ ok: false, reason: 'invalid-value' });
    expect(w.getComponent<Resource>('p', 'Resource')!.current).toBe(0); // 无效步没动
    expect(applyWrite(g, { to: { res: 'hp' }, value: '3' })).toEqual({ ok: true, v: 3, after: 3 }); // 字符串数值可转
  });

  it("flag：true/'true' 为真，其余为假；state/str 字符串化；self 作用域写自身", () => {
    const w = world();
    const g = ctxOf(w);
    applyWrite(g, { to: { flag: 'dead' }, value: 'true' });
    expect(w.getComponent<Flag>('p', 'Flag')!.active).toBe(true);
    applyWrite(g, { to: { flag: 'dead' }, value: 'false' });
    expect(w.getComponent<Flag>('p', 'Flag')!.active).toBe(false);
    applyWrite(g, { to: { state: 'story' }, value: 7 });
    expect(w.getComponent<State>('p', 'State')!.current).toBe('7');
    applyWrite(g, { to: { str: 'name' }, value: true });
    expect(w.getComponent<StringVar>('p', 'StringVar')!.value).toBe('true');
    // self：q 只有 blind 资源；写 {res:''} 通配即改 blind
    expect(applyWrite(selfCtx(w, 'q'), { to: writeTargetOf('modify-resource', ''), value: -100 })).toEqual({ ok: true, v: -100, after: 0 });
    expect(applyWrite(selfCtx(w, 'q'), { to: writeTargetOf('set-flag', ''), value: true })).toEqual({ ok: false, reason: 'missing-target' });
  });
});
