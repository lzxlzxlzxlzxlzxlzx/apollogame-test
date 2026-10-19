// ═══════════════════════════════════════════════════════════════
//  schema.ts —— 组件 schema 组合子（P1c · engine-architecture-review-2026-09-02 §5 P1c · D5）
//
//  病：组件「有哪些字段、什么形状」此前有五份手维护真相（protocol 接口 / provides.fields ×102 / component-map /
//  NON_DETERMINISTIC / validate-references 手编语义），而 `FieldType` 只有标量——`event-when` 把 ConditionExpr 声明成
//  `type:'string'`（schema 在说谎），validate-manifest 自认只查 number/boolean → 真正承载玩法的嵌套数据零结构校验。
//
//  本文件 = 一份约 200 行、零依赖的组合子：一个 schema 对象同时推导
//    · TS 类型（`Infer<S>`）              · 递归校验器（`validate`·嵌套/枚举/标签联合/可选）
//    · 目录签名（`sig`·给 LLM 看的短形状）  · 旧 `provides.fields` 形态（`legacyField`·现有消费者零改）
//    · sim/singleton 元数据（→ NON_DETERMINISTIC 对账 / 单例契约）
//  迁移是渐进的：`defineComponent` 产出的对象**就是**旧 `ComponentSchema` 形状（多带 `schema`），旧消费者不感知；
//  validate-manifest 见到 `schema` 才走递归校验，没有则照旧只查标量。
//
//  严格度口径（与 validate-manifest 既有政策一致·零误报优先）：类型不符/枚举外/标签联合无一匹配/必填缺席 = error；
//  闭合对象里多出的未知字段 = warning（疑似拼错·不阻断）。
// ═══════════════════════════════════════════════════════════════

export type Schema =
  | { readonly k: 'num'; readonly d?: string }
  | { readonly k: 'str'; readonly d?: string }
  | { readonly k: 'bool'; readonly d?: string }
  | { readonly k: 'entity'; readonly d?: string }
  | { readonly k: 'asset'; readonly assetType?: string; readonly d?: string }
  | { readonly k: 'lit'; readonly v: string | number | boolean; readonly d?: string }
  | { readonly k: 'enum'; readonly vs: readonly (string | number)[]; readonly d?: string }
  | { readonly k: 'arr'; readonly of: Schema; readonly d?: string }
  | { readonly k: 'obj'; readonly props: Readonly<Record<string, Schema>>; readonly open?: boolean; readonly d?: string }
  | { readonly k: 'rec'; readonly of: Schema; readonly d?: string }
  | { readonly k: 'union'; readonly of: readonly Schema[]; readonly tag?: string; readonly d?: string }
  | { readonly k: 'opt'; readonly of: Schema; readonly d?: string }
  | { readonly k: 'lazy'; readonly get: () => Schema; readonly name: string; readonly d?: string }
  | { readonly k: 'named'; readonly name: string; readonly of: Schema; readonly d?: string }
  | { readonly k: 'any'; readonly d?: string };

// ── 类型推导 ──
export type Infer<S> =
  S extends { k: 'num' } ? number :
  S extends { k: 'str' } ? string :
  S extends { k: 'bool' } ? boolean :
  S extends { k: 'entity' } ? string :
  S extends { k: 'asset' } ? string :
  S extends { k: 'lit'; v: infer V } ? V :
  S extends { k: 'enum'; vs: readonly (infer V)[] } ? V :
  S extends { k: 'arr'; of: infer O } ? Infer<O>[] :
  S extends { k: 'rec'; of: infer O } ? Record<string, Infer<O>> :
  S extends { k: 'union'; of: readonly (infer O)[] } ? Infer<O> :
  S extends { k: 'opt'; of: infer O } ? Infer<O> | undefined :
  S extends { k: 'named'; of: infer O } ? Infer<O> :
  S extends { k: 'lazy'; get: () => infer O } ? Infer<O> :
  S extends { k: 'obj'; props: infer P } ? InferObj<P> :
  S extends { k: 'any' } ? unknown :
  never;
type OptKeys<P> = { [K in keyof P]: P[K] extends { k: 'opt' } ? K : never }[keyof P];
type InferObj<P> = { [K in Exclude<keyof P, OptKeys<P>>]: Infer<P[K]> } & { [K in OptKeys<P>]?: Infer<P[K]> };

// ── 组合子 ──
export const t = {
  num: (d?: string) => ({ k: 'num', d }) as const,
  str: (d?: string) => ({ k: 'str', d }) as const,
  bool: (d?: string) => ({ k: 'bool', d }) as const,
  entity: (d?: string) => ({ k: 'entity', d }) as const,
  asset: (assetType?: string, d?: string) => ({ k: 'asset', assetType, d }) as const,
  lit: <const V extends string | number | boolean>(v: V, d?: string) => ({ k: 'lit', v, d }) as const,
  enum: <const V extends readonly (string | number)[]>(vs: V, d?: string) => ({ k: 'enum', vs, d }) as const,
  arr: <const O extends Schema>(of: O, d?: string) => ({ k: 'arr', of, d }) as const,
  obj: <const P extends Readonly<Record<string, Schema>>>(props: P, d?: string) => ({ k: 'obj', props, d }) as const,
  /** 开放对象：未知字段不告警（自由 payload 表·如 Record<string, number> 之外的混合形状）。 */
  openObj: <const P extends Readonly<Record<string, Schema>>>(props: P, d?: string) => ({ k: 'obj', props, open: true, d }) as const,
  rec: <const O extends Schema>(of: O, d?: string) => ({ k: 'rec', of, d }) as const,
  /** 联合；给 tag（判别字段名）则按该字段的 lit 值挑分支（错误点名到分支内部）。 */
  union: <const O extends readonly Schema[]>(of: O, tag?: string, d?: string) => ({ k: 'union', of, tag, d }) as const,
  opt: <const O extends Schema>(of: O, d?: string) => ({ k: 'opt', of, d }) as const,
  /** 递归引用（自身或互引）：get 惰性求值；name 进目录签名。 */
  lazy: <O extends Schema>(name: string, get: () => O, d?: string) => ({ k: 'lazy', get, name, d }) as const,
  /** 具名子 schema：目录签名只打名字（不展开），校验照常展开。 */
  named: <const O extends Schema>(name: string, of: O, d?: string) => ({ k: 'named', name, of, d }) as const,
  any: (d?: string) => ({ k: 'any', d }) as const,
};

// ── 校验 ──
export interface Issue {
  readonly path: string; // 'when.of[1].id'
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

function typeName(v: unknown): string {
  return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
}

/** 递归校验。`path` 为根前缀（组件名等）。 */
export function validate(schema: Schema, value: unknown, path = ''): Issue[] {
  const out: Issue[] = [];
  walk(schema, value, path, out);
  return out;
}

function walk(s: Schema, v: unknown, path: string, out: Issue[]): void {
  const err = (message: string) => out.push({ path, message, severity: 'error' });
  switch (s.k) {
    case 'any': return;
    case 'num': if (typeof v !== 'number' || Number.isNaN(v)) err(`应为 number，实为 ${typeName(v)}`); return;
    case 'str': case 'entity': case 'asset': if (typeof v !== 'string') err(`应为 string，实为 ${typeName(v)}`); return;
    case 'bool': if (typeof v !== 'boolean') err(`应为 boolean，实为 ${typeName(v)}`); return;
    case 'lit': if (v !== s.v) err(`应为 ${JSON.stringify(s.v)}，实为 ${JSON.stringify(v)}`); return;
    case 'enum': if (!(s.vs as readonly unknown[]).includes(v)) err(`应为 ${s.vs.map((x) => JSON.stringify(x)).join('|')} 之一，实为 ${JSON.stringify(v)}`); return;
    case 'opt': if (v !== undefined) walk(s.of, v, path, out); return;
    case 'named': walk(s.of, v, path, out); return;
    case 'lazy': walk(s.get(), v, path, out); return;
    case 'arr':
      if (!Array.isArray(v)) { err(`应为数组，实为 ${typeName(v)}`); return; }
      v.forEach((x, i) => walk(s.of, x, `${path}[${i}]`, out));
      return;
    case 'rec':
      if (typeof v !== 'object' || v === null || Array.isArray(v)) { err(`应为对象，实为 ${typeName(v)}`); return; }
      for (const [k, x] of Object.entries(v)) walk(s.of, x, path ? `${path}.${k}` : k, out);
      return;
    case 'obj': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) { err(`应为对象，实为 ${typeName(v)}`); return; }
      const o = v as Record<string, unknown>;
      for (const [k, ps] of Object.entries(s.props)) {
        const sub = path ? `${path}.${k}` : k;
        if (o[k] === undefined) {
          if (ps.k !== 'opt' && ps.k !== 'any') out.push({ path: sub, message: `缺必填字段 "${k}"`, severity: 'error' });
          continue;
        }
        walk(ps, o[k], sub, out);
      }
      if (!s.open) {
        for (const k of Object.keys(o)) {
          if (!(k in s.props)) out.push({ path: path ? `${path}.${k}` : k, message: `未知字段 "${k}"（疑似拼错；已知：${Object.keys(s.props).join('/')}）`, severity: 'warning' });
        }
      }
      return;
    }
    case 'union': {
      if (s.tag && typeof v === 'object' && v !== null) {
        const tagVal = (v as Record<string, unknown>)[s.tag];
        const branch = s.of.find((b) => {
          const r = resolve(b);
          return r.k === 'obj' && r.props[s.tag!]?.k === 'lit' && (r.props[s.tag!] as { v: unknown }).v === tagVal;
        });
        if (branch) { walk(branch, v, path, out); return; }
        const tags = s.of.map((b) => { const r = resolve(b); return r.k === 'obj' ? JSON.stringify((r.props[s.tag!] as { v?: unknown } | undefined)?.v) : '?'; });
        err(`"${s.tag}" 应为 ${tags.join('|')} 之一，实为 ${JSON.stringify(tagVal)}`);
        return;
      }
      // 无标签：任一分支零 error 即通过；全不通过 → 一条汇总 error。
      for (const b of s.of) {
        const tmp: Issue[] = [];
        walk(b, v, path, tmp);
        if (!tmp.some((i) => i.severity === 'error')) { out.push(...tmp); return; }
      }
      err(`不匹配任一分支（${s.of.map(sig).join(' | ')}），实为 ${JSON.stringify(v)?.slice(0, 60)}`);
      return;
    }
  }
}

function resolve(s: Schema): Schema {
  let cur = s;
  for (let i = 0; i < 8; i++) {
    if (cur.k === 'lazy') cur = cur.get();
    else if (cur.k === 'named') cur = cur.of;
    else break;
  }
  return cur;
}

// ── 目录签名（给 LLM 看·具名不展开·对象只展一层） ──
export function sig(s: Schema, depth = 0): string {
  switch (s.k) {
    case 'num': return 'number';
    case 'str': return 'string';
    case 'bool': return 'boolean';
    case 'entity': return 'EntityId';
    case 'asset': return 'assetKey';
    case 'lit': return JSON.stringify(s.v);
    case 'enum': return s.vs.map((v) => JSON.stringify(v)).join('|');
    case 'arr': return `${sig(s.of, depth)}[]`;
    case 'rec': return `Record<string, ${sig(s.of, depth)}>`;
    case 'opt': return `${sig(s.of, depth)}?`;
    case 'named': case 'lazy': return s.name;
    case 'union': return s.of.map((b) => sig(b, depth)).join('|');
    case 'any': return 'any';
    case 'obj':
      if (depth >= 1) return '{…}';
      return `{${Object.entries(s.props).map(([k, ps]) => `${k}:${sig(ps, depth + 1)}`).join(', ')}}`;
  }
}

// ── 旧 provides.fields 形态（现有消费者：catalog / studio / derive-asset-index / validate 标量档） ──
export type LegacyFieldType = 'number' | 'string' | 'boolean' | 'EntityId' | 'string[]' | 'number[]' | 'assetKey';
export interface LegacyField { type: LegacyFieldType; describe: string; assetType?: string }

export function legacyField(s: Schema): LegacyField {
  const inner = s.k === 'opt' ? s.of : s;
  const d = s.d ?? inner.d ?? sig(inner);
  const r = resolve(inner);
  switch (r.k) {
    case 'num': return { type: 'number', describe: d };
    case 'bool': return { type: 'boolean', describe: d };
    case 'entity': return { type: 'EntityId', describe: d };
    case 'asset': return r.assetType ? { type: 'assetKey', describe: d, assetType: r.assetType } : { type: 'assetKey', describe: d };
    case 'arr': {
      const e = resolve(r.of);
      if (e.k === 'num') return { type: 'number[]', describe: d };
      if (e.k === 'str' || e.k === 'enum' || e.k === 'entity') return { type: 'string[]', describe: d };
      return { type: 'string', describe: `${d}（形状：${sig(r)}）` }; // 旧口径：复杂字段用 string 占位
    }
    default: return { type: 'string', describe: r.k === 'str' || r.k === 'enum' || r.k === 'lit' ? d : `${d}（形状：${sig(r)}）` };
  }
}
