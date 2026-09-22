import type { CapabilityDefinition } from '@engine/core/define-capability.js';
import type { WorldBlueprint, EntityBlueprint } from './demo.assembly.js';
import { inferCapabilityIdsWith, type CapabilityIndex } from './capability-index.js';
import { validateComponentData, validateAssetRefs, formatIssues, coerceDurations, coerceTags } from './validate-manifest.js';
import { validateReferences } from './validate-references.js';

// ═══════════════════════════════════════════════════════════════
//  Manifest 加载器 —— studio「导出 manifest」的逆运算
//
//  规范 manifest(单一数据格式)= { capabilities: string[](能力id), entities: {id:{Comp:data}} }，
//  正是 studio exportManifest 产出的形状。parseManifest 把它泡发回可被 engine.load 的 WorldBlueprint：
//  id → 能力对象(注册表)，entities 原样(纯数据)。导出能再导入 = 对称闭环。
//  这就是「游戏=数据」的临门一脚：AI / 预设 / 手改 产出的同一种数据，引擎直接跑。
//
//  P2e 拆成两半（本文件不 import 任何能力对象·只依赖「组件 → 能力」索引元数据）：
//    prepareManifest(raw, index)  结构校验 + 模板展开 + 定 capability id 列表（显式 / 按索引推断）
//    finishManifest(prep, caps)   拿到能力对象后：时长糖 / 字段 schema / 引用链接 / 资产 key
//  中间那一步「id → 能力对象」由两条路各自提供：manifest.ts（同步·静态注册表·工具/创作台/测试）与
//  manifest-async.ts（`await import()`·懒注册表·卡带外壳——rollup 按 manifest 子集摇树）。
// ═══════════════════════════════════════════════════════════════

export interface Manifest {
  /** manifest 格式版本（P1c）。缺省 1。装载时 < 当前版本按 MANIFEST_MIGRATIONS 逐级升；> 当前版本拒收（引擎太旧）。 */
  schema?: number;
  capabilities?: string[];
  /** 蓝图元数据（P2d）：`tickRate`（Hz·缺省 60）。时长单位糖（"2s"/"500ms"/"1.5min"）按它换算成 tick。 */
  meta?: { tickRate?: number };
  /** Tag 名字表（B-8）：名字 → 位值（非负整数）。数字字段可写 "enemy|boss"，装载期折成位或；未知名字拒收。 */
  tags?: Record<string, number>;
  /**
   * 实体模板（P2b · 评审 §1.4「蓝图是 TS 不是 JSON」的 JSON 等价物）：名字 → { 组件名: 数据 }，字符串值里可写 `{{param}}`
   * 占位（整串恰为一个占位符 → 按参数原类型代入·数值不变字符串）。实体用 `$template` 引用、`$params` 传参、其余键作组件级覆盖。
   */
  templates?: Record<string, Record<string, unknown>>;
  /**
   * entities 里每一项还可带 `$repeat`：`{ count: N }` 或 `{ items: [ {...}, ... ] }` → 该项展开成 N 个实体，
   * 实体 id 与参数里的 `{{i}}`（下标）/ `{{item.字段}}` 逐项代入（`slot-{{i}}` → slot-0 … slot-N-1）。
   * 这两件（模板 + 展开）就是 `buildBlueprint()` 里 for 循环与工厂函数的数据形态。
   */
  entities: Record<string, Record<string, unknown>>;
}

// ── P2b：模板与展开（在校验前跑·输出仍是普通 { 实体id: { 组件名: 数据 } }）────────────────────────
const TPL_WHOLE = /^\{\{\s*(i|item\.([A-Za-z0-9_-]+)|([A-Za-z0-9_-]+))\s*\}\}$/;
const TPL_ANY = /\{\{\s*(i|item\.([A-Za-z0-9_-]+)|([A-Za-z0-9_-]+))\s*\}\}/g;

type Scalar = string | number | boolean;
interface Subst { params: Record<string, unknown>; i?: number; item?: Record<string, unknown> }

function lookupTpl(name: string, itemField: string | undefined, paramName: string | undefined, sb: Subst): unknown {
  if (name === 'i') return sb.i;
  if (itemField !== undefined) return sb.item?.[itemField];
  return paramName !== undefined ? sb.params[paramName] : undefined;
}

/** 深代入 `{{…}}`：整串恰为一个占位符 → 原类型；含占位符 → 拼接（缺 → 空串）；对象/数组递归。 */
export function substituteTemplate(v: unknown, sb: Subst): unknown {
  if (typeof v === 'string') {
    const w = TPL_WHOLE.exec(v);
    if (w) { const r = lookupTpl(w[1], w[2], w[3], sb); return r === undefined ? '' : r; }
    return v.replace(TPL_ANY, (_m, name: string, itemField?: string, paramName?: string) => {
      const r = lookupTpl(name, itemField, paramName, sb);
      return r === undefined ? '' : String(r as Scalar);
    });
  }
  if (Array.isArray(v)) return v.map((x) => substituteTemplate(x, sb));
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = substituteTemplate(x, sb);
    return out;
  }
  return v;
}

/** 一个实体条目（可能带 $template/$params）→ 组件表：模板代入后，条目自带的组件键做**组件级**覆盖（同名组件整体替换）。 */
function materialize(entry: Record<string, unknown>, templates: Record<string, Record<string, unknown>>, sb: Subst, eid: string): Record<string, unknown> {
  const { $template, $params, $repeat: _r, ...overrides } = entry as { $template?: unknown; $params?: unknown; $repeat?: unknown } & Record<string, unknown>;
  let comps: Record<string, unknown> = {};
  if ($template !== undefined) {
    if (typeof $template !== 'string') fail(`实体 "${eid}" 的 $template 须是模板名字符串`);
    const tpl = templates[$template];
    if (!tpl) fail(`实体 "${eid}" 引用了不存在的模板 "${$template}"（已定义：${Object.keys(templates).join(', ') || '无'}）`);
    const params = { ...sb.params, ...(typeof $params === 'object' && $params !== null ? ($params as Record<string, unknown>) : {}) };
    comps = substituteTemplate(tpl, { ...sb, params: substituteTemplate(params, sb) as Record<string, unknown> }) as Record<string, unknown>;
  }
  for (const [k, v] of Object.entries(overrides)) comps[k] = substituteTemplate(v, sb);
  return comps;
}

/** 展开 templates / $template / $params / $repeat → 普通 entities。无这些键时逐字原样返回（零回归）。 */
export function expandEntities(raw: Record<string, unknown>): Record<string, unknown> {
  const templates = (typeof raw.templates === 'object' && raw.templates !== null ? raw.templates : {}) as Record<string, Record<string, unknown>>;
  const src = raw.entities as Record<string, unknown>;
  // 无原型的累积对象：`__proto__` 这类保留名会照常成为**自有属性**（普通对象上是改原型 → 条目静默蒸发），
  // 留给下游的 isUnsafeKey 检查大声拒收（fail-closed 不变）。
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [eidPat, entry] of Object.entries(src)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) { out[eidPat] = entry; continue; }
    const e = entry as Record<string, unknown>;
    const rep = e.$repeat as { count?: unknown; items?: unknown } | undefined;
    if (rep === undefined) {
      if (!('$template' in e)) { out[eidPat] = entry; continue; } // 普通实体：不动
      out[eidPat] = materialize(e, templates, { params: {} }, eidPat);
      continue;
    }
    const items: Array<Record<string, unknown>> = Array.isArray(rep.items)
      ? (rep.items as Array<Record<string, unknown>>)
      : typeof rep.count === 'number' && rep.count >= 0 ? Array.from({ length: rep.count }, () => ({})) : fail(`实体 "${eidPat}" 的 $repeat 须是 { count: N } 或 { items: [...] }`);
    items.forEach((item, i) => {
      const sb: Subst = { params: {}, i, item };
      const eid = String(substituteTemplate(eidPat, sb));
      if (eid in out) fail(`$repeat 展开出重复实体 id "${eid}"（模式 "${eidPat}" 请含 {{i}} 或 {{item.字段}}）`);
      out[eid] = materialize(e, templates, sb, eid);
    });
  }
  return out;
}

/** 当前 manifest 格式版本。改组件字段名/形状时 +1 并在 MANIFEST_MIGRATIONS 登记 N→N+1 的升级函数。 */
export const MANIFEST_SCHEMA = 1;

/** 版本迁移链：键 = 源版本，函数 = 把该版本的 raw 升到下一版（纯函数·可单测）。目前无历史版本。 */
export const MANIFEST_MIGRATIONS: Readonly<Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>> = {};

/** 把 raw manifest 升到当前版本（缺 schema 视为 1）。返回 [升级后的 raw, 走过的版本号列表]。 */
export function migrateManifest(raw: Record<string, unknown>): [Record<string, unknown>, number[]] {
  let v = typeof raw.schema === 'number' ? raw.schema : 1;
  if (v > MANIFEST_SCHEMA) fail(`schema ${v} 比本引擎支持的 ${MANIFEST_SCHEMA} 新——升级引擎，或用旧版工具导出`);
  const steps: number[] = [];
  let cur = raw;
  while (v < MANIFEST_SCHEMA) {
    const m = MANIFEST_MIGRATIONS[v];
    if (!m) fail(`schema ${v} → ${v + 1} 无迁移函数（引擎漏登记）`);
    cur = { ...m(cur), schema: v + 1 };
    steps.push(v);
    v++;
  }
  return [cur, steps];
}

export interface ParseResult {
  blueprint: WorldBlueprint;
  inferredCapabilities: boolean;
  warnings: string[];
}

// 原型链保留名：manifest 用普通对象累积实体/组件（`entities[eid] = …`），若 key 是这些名字，
// 赋值不会产生自有属性，而是去改写原型 → 条目**静默蒸发**（fail-open：游戏少了个实体却零报错，
// 极难定位），同时是原型污染入口（卡带可来自工坊/用户库，不是可信输入）。
// 故 fail-closed：加载期直接报错要求改名——manifest 是 LLM 产出的数据，叫 `__proto__` 必是笔误而非本意，
// 大声拒绝远好过静默吞掉。（engine-review-2026-08-04 §3.3 · P2）
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function isUnsafeKey(k: string): boolean {
  return UNSAFE_KEYS.has(k);
}

function fail(msg: string): never {
  throw new Error(`manifest: ${msg}`);
}

export interface ParseOptions {
  /** 资产清单里所有已注册的 key（AssetIndex.assets[].id 等）。提供则对 `assetKey` 字段加载期硬校验（R9 增益 A）。 */
  assetKeys?: ReadonlySet<string>;
}

/** prepareManifest 的产物：能力尚未装载，只有 id 列表。 */
export interface PreparedManifest {
  entities: Record<string, EntityBlueprint>;
  capIds: string[];
  inferredCapabilities: boolean;
  warnings: string[];
  meta?: { tickRate?: number };
  tags?: Record<string, number>;
}

/** 前半：结构校验 + 模板展开 + 定 capability id 列表（显式声明或按 index 推断）。不装载任何能力。 */
export function prepareManifest(raw: unknown, index: CapabilityIndex): PreparedManifest {
  if (typeof raw !== 'object' || raw === null) fail('根必须是对象');
  if ('schema' in (raw as object) && typeof (raw as Record<string, unknown>).schema !== 'number') fail('schema 必须是数字（manifest 格式版本）');
  const [obj, migrated] = migrateManifest(raw as Record<string, unknown>);

  const ent = obj.entities;
  if (Array.isArray(ent)) fail('entities 是数组——疑似旧生成格式，需先转成 { 实体id: { 组件名: 数据 } } 对象');
  if (typeof ent !== 'object' || ent === null) fail('entities 必须是 { 实体id: { 组件名: 数据 } } 对象');
  if (obj.templates !== undefined && (typeof obj.templates !== 'object' || obj.templates === null || Array.isArray(obj.templates))) fail('templates 必须是 { 模板名: { 组件名: 数据 } } 对象');

  const srcEntities = expandEntities(obj); // P2b：模板 + $repeat 展开（无则原样）
  const entities: Record<string, EntityBlueprint> = {};
  for (const [eid, comps] of Object.entries(srcEntities)) {
    if (isUnsafeKey(eid)) fail(`实体 id "${eid}" 是原型链保留名——请改名（禁用：${[...UNSAFE_KEYS].join(' / ')}）`);
    if (typeof comps !== 'object' || comps === null || Array.isArray(comps)) {
      fail(`实体 "${eid}" 必须是 { 组件名: 数据 } 对象`);
    }
    const cleaned: Record<string, unknown> = {};
    for (const [ctype, data] of Object.entries(comps as Record<string, unknown>)) {
      if (isUnsafeKey(ctype)) fail(`实体 "${eid}" 的组件名 "${ctype}" 是原型链保留名——请改名（禁用：${[...UNSAFE_KEYS].join(' / ')}）`);
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        fail(`实体 "${eid}" 的组件 "${ctype}" 必须是对象`);
      }
      // 组件数据里的 type 字段冗余(类型由键决定)，剥掉以免与引擎内部表示打架。
      const { type: _drop, ...rest } = data as Record<string, unknown>;
      cleaned[ctype] = rest;
    }
    entities[eid] = cleaned as EntityBlueprint;
  }

  const warnings: string[] = [];
  if (migrated.length) warnings.push(`manifest 已从 schema ${migrated[0]} 逐级升到 ${MANIFEST_SCHEMA}（走过 ${migrated.join('→')}）`);
  let inferred = false;
  let capIds: string[];
  const rawCaps = obj.capabilities;
  if (rawCaps !== undefined && !Array.isArray(rawCaps)) fail('capabilities 必须是 capability id 字符串数组');
  if (Array.isArray(rawCaps) && rawCaps.length > 0) {
    if (!rawCaps.every((c) => typeof c === 'string')) fail('capabilities 必须全是字符串 id');
    capIds = rawCaps as string[];
  } else {
    capIds = inferCapabilityIdsWith(index, entities as Record<string, Record<string, unknown>>);
    inferred = true;
    warnings.push(
      `未声明 capabilities，已据组件类型推断 ${capIds.length} 个；仅含"提供组件"的能力，行为类系统(如运动/碰撞)可能需显式补全`,
    );
    // 共用组件（多个能力都提供）→ 推断**刻意不猜**（见 capability-registry AMBIGUOUS_COMPONENTS）。
    // 旧行为是静默判给注册序靠前者，实测能把方块放置游戏装成三消解释器且零报错。
    // 这里逐个点名告警：作者必须显式写 capabilities 才能确定用哪个解释器。
    const used = new Set<string>();
    for (const comps of Object.values(entities)) for (const t of Object.keys(comps)) used.add(t);
    for (const [ctype, providers] of index.ambiguous) {
      if (!used.has(ctype)) continue;
      warnings.push(
        `组件 "${ctype}" 被多个能力共同提供（${providers.join(' / ')}）——无法从数据反推该用哪个，`
        + `已跳过它的推断。请在 manifest 的 capabilities 里显式声明你要的那个，否则该组件不会被解释。`,
      );
    }
  }

  // P2d：meta.tickRate 校验（时长糖要等能力装载后按 schema 换算·见 finishManifest）。数字字段里写 "2s" / "500ms" / "1.5min" → 按 tickRate 换算成整数 tick；
  // 能力内部仍只认 tick（sim 唯一时钟），单位只存在于数据入口。
  let meta: { tickRate?: number } | undefined;
  if (obj.meta !== undefined) {
    if (typeof obj.meta !== 'object' || obj.meta === null || Array.isArray(obj.meta)) fail('meta 必须是对象');
    const m = obj.meta as Record<string, unknown>;
    if (m.tickRate !== undefined && (typeof m.tickRate !== 'number' || !Number.isFinite(m.tickRate) || m.tickRate <= 0)) fail('meta.tickRate 必须是正数（Hz）');
    meta = m.tickRate !== undefined ? { tickRate: m.tickRate as number } : {};
  }
  // B-8：tags 名字表校验（名字 → 非负整数位值）。
  let tags: Record<string, number> | undefined;
  if (obj.tags !== undefined) {
    if (typeof obj.tags !== 'object' || obj.tags === null || Array.isArray(obj.tags)) fail('tags 必须是 { 名字: 位值 } 对象');
    for (const [k, v] of Object.entries(obj.tags as Record<string, unknown>)) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 0x7fffffff) fail(`tags.${k} 必须是 0..2^31-1 的整数位值`);
    }
    tags = obj.tags as Record<string, number>;
  }
  return { entities, capIds, inferredCapabilities: inferred, warnings, ...(meta ? { meta } : {}), ...(tags ? { tags } : {}) };
}

/** 后半：能力对象到手后的全部校验（时长糖 / 字段 schema / 引用链接 / 资产 key）→ 可运行蓝图。 */
export function finishManifest(prep: PreparedManifest, capabilities: CapabilityDefinition[], opts: ParseOptions = {}): ParseResult {
  const { entities, meta } = prep;
  const warnings = [...prep.warnings];
  const tickRate = meta?.tickRate ?? 60;
  // 时长单位糖：数字字段里写 "2s" / "500ms" / "1.5min" → 按 tickRate 换算成整数 tick；
  // 能力内部仍只认 tick（sim 唯一时钟），单位只存在于数据入口。
  const coerced = coerceDurations(capabilities, entities, tickRate);
  if (coerced.length) warnings.push(`时长单位糖已按 ${tickRate}Hz 换算成 tick：${coerced.join(', ')}`);
  if (prep.tags) {
    const folded = coerceTags(capabilities, entities, prep.tags);
    if (folded.length) warnings.push(`Tag 名字已折成位掩码：${folded.join(', ')}`);
  }

  // 体检：用了某组件却无任何 capability 提供它 → 该组件大概率不被解释（渲染/行为缺失）。
  const provided = new Set<string>();
  for (const c of capabilities) for (const t of Object.keys(c.components?.provides ?? {})) provided.add(t);
  const missing = new Set<string>();
  for (const comps of Object.values(entities)) {
    for (const t of Object.keys(comps)) if (!provided.has(t)) missing.add(t);
  }
  if (missing.size) {
    warnings.push(`这些组件无对应 provider capability（可能不被解释）：${[...missing].join(', ')}`);
  }

  // R12：用各能力声明的 fields 校验组件数据——字段拼错（warning）/ 基元类型不符（error，拒绝加载）。
  const schema = validateComponentData(capabilities, entities);
  for (const w of schema.warnings) warnings.push(formatIssues([w]));
  if (schema.errors.length) fail(`组件数据类型错误（${schema.errors.length} 处）—— ${formatIssues(schema.errors)}`);

  // P0 引用链接器：id 交叉引用体检（信号链 / 全局 id / 模板 / 图内跳转）。全部 warning——
  // id 可在运行时合法出现（prefab 展开 / 代码侧注入），链接器是体检报告，不是闸门。
  for (const w of validateReferences(entities)) warnings.push(formatIssues([w]));

  // R9 增益 A：资产 key 硬校验（opt-in——仅当提供 assetKeys 集合时才查，未知 key 拒绝加载，防 AI 编造）。
  if (opts.assetKeys) {
    const assetErrors = validateAssetRefs(capabilities, entities, opts.assetKeys);
    if (assetErrors.length) fail(`资产引用错误（${assetErrors.length} 处）—— ${formatIssues(assetErrors)}`);
  }

  return { blueprint: { capabilities, entities, ...(meta ? { meta } : {}) }, inferredCapabilities: prep.inferredCapabilities, warnings };
}
