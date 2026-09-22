import { describe, it, expect } from 'vitest';
import { t, validate, sig, legacyField, type Infer } from './schema.js';
import { defineComponent, COMPONENT_DEFS } from './define-component.js';
import { ConditionExprSchema, FlowStateSchema } from '@engine/protocol/schemas/logic.js';

// P1c · schema 组合子（engine-architecture-review-2026-09-02 §5 P1c）
// ① 校验：标量/枚举/标签联合/递归/可选/必填/未知字段（warning）② 推导类型（编译期）③ 目录签名 ④ 旧 fields 适配
// ⑤ defineComponent 注册表：同名同形复用·同名异形抛。

describe('validate · 标量与容器', () => {
  it('类型不符 = error（含 NaN）；可选缺席不报；必填缺席 = error；未知字段 = warning', () => {
    const S = t.obj({ a: t.num(), b: t.opt(t.str()), c: t.bool() });
    expect(validate(S, { a: 1, c: true })).toEqual([]);
    expect(validate(S, { a: 'x', c: true }).map((i) => [i.path, i.severity])).toEqual([['a', 'error']]);
    expect(validate(S, { a: NaN, c: true })[0].message).toMatch(/number/);
    expect(validate(S, { a: 1 }).map((i) => i.message)).toEqual(['缺必填字段 "c"']);
    const w = validate(S, { a: 1, c: false, zz: 1 });
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe('warning');
    expect(w[0].message).toMatch(/未知字段 "zz"/);
    expect(validate(t.openObj({ a: t.num() }), { a: 1, zz: 1 })).toEqual([]); // 开放对象不报未知
  });

  it('enum / lit / arr / rec 的错误点名到路径', () => {
    expect(validate(t.enum(['edge', 'level'] as const), 'edgy')[0].message).toMatch(/"edge"\|"level"/);
    expect(validate(t.arr(t.num()), [1, 'x', 3])[0].path).toBe('[1]');
    expect(validate(t.rec(t.bool()), { a: true, b: 'no' })[0].path).toBe('b');
    expect(validate(t.obj({ k: t.lit('x') }), { k: 'y' })[0].message).toMatch(/应为 "x"/);
  });
});

describe('validate · 递归标签联合（ConditionExpr 就是它）', () => {
  it('合法条件树零 issue；错 kind 点名到嵌套路径；分支内字段错点名', () => {
    const ok = { kind: 'and', of: [{ kind: 'resource', id: 'hp', cmp: 'lte', value: 0 }, { kind: 'not', of: { kind: 'flag', id: 'dead' } }] };
    expect(validate(ConditionExprSchema, ok, 'when')).toEqual([]);
    const bad = { kind: 'and', of: [{ kind: 'resorce', id: 'hp', cmp: 'lte', value: 0 }] };
    const is = validate(ConditionExprSchema, bad, 'when');
    expect(is).toHaveLength(1);
    expect(is[0].path).toBe('when.of[0]');
    expect(is[0].message).toMatch(/"kind" 应为 "always"\|"and"/);
    const bad2 = { kind: 'resource', id: 'hp', cmp: 'less', value: 0 };
    expect(validate(ConditionExprSchema, bad2, 'when')[0].path).toBe('when.cmp');
  });

  it('FlowState：嵌套 transitions[].when 的错误一路点名到底', () => {
    const st = { id: 'menu', transitions: [{ to: 'play', when: { kind: 'timer', id: 't', cmp: 'gte', value: 'ten' } }] };
    const is = validate(FlowStateSchema, st, 'states[0]');
    expect(is.map((i) => i.path)).toEqual(['states[0].transitions[0].when.value']);
  });

  it('无标签联合：任一分支通过即过，全不过一条汇总', () => {
    const S = t.union([t.num(), t.bool()]);
    expect(validate(S, 1)).toEqual([]);
    expect(validate(S, 'x')[0].message).toMatch(/不匹配任一分支/);
  });
});

describe('Infer · 编译期类型推导（tsc 门）', () => {
  it('对象/可选/枚举/数组推得出正确类型', () => {
    const S = t.obj({ id: t.str(), n: t.opt(t.num()), mode: t.enum(['a', 'b'] as const), xs: t.arr(t.bool()) });
    const v: Infer<typeof S> = { id: 'x', mode: 'a', xs: [true] };
    // @ts-expect-error mode 只能是 'a'|'b'
    const bad: Infer<typeof S> = { id: 'x', mode: 'c', xs: [] };
    expect(v.mode).toBe('a');
    expect(bad).toBeDefined();
  });
});

describe('sig / legacyField · 目录签名与旧 fields 适配', () => {
  it('签名：具名不展开·对象只展一层·枚举打值', () => {
    expect(sig(ConditionExprSchema)).toBe('ConditionExpr');
    expect(sig(t.obj({ kind: t.enum(['x', 'y'] as const), inner: t.obj({ a: t.num() }) }))).toBe('{kind:"x"|"y", inner:{…}}');
    expect(sig(t.arr(t.opt(t.entity())))).toBe('EntityId?[]');
  });

  it('旧 fields：标量映射不变·复杂字段用 string 占位并把形状写进 describe（现有 catalog/studio 零改）', () => {
    expect(legacyField(t.num('血量'))).toEqual({ type: 'number', describe: '血量' });
    expect(legacyField(t.opt(t.bool('可选')))).toEqual({ type: 'boolean', describe: '可选' });
    expect(legacyField(t.asset('texture', '贴图'))).toEqual({ type: 'assetKey', describe: '贴图', assetType: 'texture' });
    expect(legacyField(t.arr(t.str()))).toMatchObject({ type: 'string[]' });
    expect(legacyField(ConditionExprSchema)).toMatchObject({ type: 'string' });
    expect(legacyField(ConditionExprSchema).describe).toMatch(/ConditionExpr/);
  });
});

describe('defineComponent · 注册表', () => {
  it('产出旧 ComponentSchema 形状 + schema/sim/singleton；同名同形复用、同名异形抛', () => {
    const A = defineComponent('__ProbeA', { x: t.num('x'), tag: t.opt(t.str()) }, { category: 'resource', describe: 'probe', sim: false, singleton: true });
    expect(A.fields).toEqual({ x: { type: 'number', describe: 'x' }, tag: { type: 'string', describe: 'string' } });
    expect(A.sim).toBe(false);
    expect(A.singleton).toBe(true);
    expect(A.signature).toBe('{x:number, tag:string?}');
    expect(COMPONENT_DEFS.get('__ProbeA')).toBe(A);
    expect(defineComponent('__ProbeA', { x: t.num('x'), tag: t.opt(t.str()) }, { category: 'resource', describe: 'probe', sim: false, singleton: true })).toBe(A);
    expect(() => defineComponent('__ProbeA', { x: t.str() }, { category: 'resource', describe: 'probe' })).toThrow(/形状不一致/);
  });
});
