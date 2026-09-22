import type { CapabilityDefinition, ComponentSchema } from '@engine/core/define-capability.js';
import { validate as validateSchema } from '@engine/core/schema.js';
import type { EntityBlueprint } from './demo.assembly.js';

// ═══════════════════════════════════════════════════════════════
//  组件数据 schema 校验（R12）—— AI/预设/手改产出的蓝图数据的护城河。
//
//  动机：EntityBlueprint 是 string 索引，组件名打错（"Resorce"）或字段拼错（"currrent"）tsc 不报。
//  parseManifest 装 AI 产的 manifest 时，这层静态校验最值钱——把"最弱 LLM 也能产对数据"变成可强制。
//
//  关键：**复用各 capability 已声明的 components.provides[Type].fields 当 schema，绝不另造一份**。
//  那份 fields 本就是组件的字段契约（type + describe），校验器只是拿它交叉比对蓝图数据。
//
//  严格度（刻意保守，零误报优先）：
//   - error（会坏模拟的真错，调用方应拒绝加载）：声明 number/boolean 的字段给了别的基元类型。
//   - warning（疑似拼错，不阻断）：数据里的字段不在组件声明字段中。降级因 schema 完整性不保证，
//     且告警本身能反向暴露"未声明完整字段"的组件。
//   - **只严格查 number/boolean**：本引擎里 string 被复杂字段当占位用（如 dialogue.nodes 实为对象图、
//     shape.kind 是枚举），严格查 string/数组会误报，故跳过。
//   - **P1c**：组件若由 defineComponent 定义（带 `schema`），改走递归组合子校验（嵌套/枚举/标签联合/必填），
//     error/warning 口径同上（类型不符 = error·未知字段 = warning）。此前 ConditionExpr/FlowState 等被声明成
//     'string' 零结构校验；现在 `kind:'resorce'` 这类错在装载期点名到 `when.of[1].kind`。
// ═══════════════════════════════════════════════════════════════

export interface SchemaIssue {
  entity: string;
  component: string;
  field?: string;
  message: string;
}

export interface SchemaReport {
  errors: SchemaIssue[];
  warnings: SchemaIssue[];
}

// 从一组（已解析的）能力聚出 组件类型 → 字段 schema 表。
function collectFieldSchemas(capabilities: readonly CapabilityDefinition[]): Map<string, Record<string, { type: string }>> {
  const out = new Map<string, Record<string, { type: string }>>();
  for (const [ctype, schema] of collectComponentSchemas(capabilities)) out.set(ctype, schema.fields ?? {});
  return out;
}
function collectComponentSchemas(capabilities: readonly CapabilityDefinition[]): Map<string, ComponentSchema> {
  // 先登记者胜（**刻意与 capability-registry 的 COMPONENT_PROVIDERS 同向**）。
  // 旧实现无条件 set = 后登记者胜，与注册表的先登记者胜**规则相反** → 共用组件会出现
  // 「按 A 的字段规格校验、却把 B 的解释器装给你」（engine-review-2026-08-04 §3.3）。
  // 共用组件（如 BoardCell 被 match3-board / block-grid 共用）本身允许，但前提是**各提供者
  // 声明的字段结构必须完全一致**——该不变量由 capability-registry.test 的守卫钉死，
  // 一旦有人让它们分叉就会转红；故此处取谁都等价，只需两边规则同向、结果确定。
  const out = new Map<string, ComponentSchema>();
  for (const cap of capabilities) {
    for (const [ctype, schema] of Object.entries(cap.components?.provides ?? {})) {
      if (!out.has(ctype)) out.set(ctype, schema);
    }
  }
  return out;
}

/**
 * 用各能力声明的 fields 交叉校验蓝图实体的组件数据。
 * 无 provider 的组件（schema 未知）跳过字段校验——parseManifest 另有"无 provider"告警覆盖它。
 */
export function validateComponentData(
  capabilities: readonly CapabilityDefinition[],
  entities: Record<string, EntityBlueprint>,
): SchemaReport {
  const schemas = collectComponentSchemas(capabilities);
  const errors: SchemaIssue[] = [];
  const warnings: SchemaIssue[] = [];

  for (const [eid, comps] of Object.entries(entities)) {
    for (const [ctype, data] of Object.entries(comps as Record<string, unknown>)) {
      const cs = schemas.get(ctype);
      if (!cs) continue; // 无 provider：字段无 schema 可比，跳过（结构层另有告警）。
      if (typeof data !== 'object' || data === null) continue;

      // P1c：带组合子 schema 的组件走递归校验（去掉判别式键 type 再校）。
      if (cs.schema) {
        const { type: _t, ...rest } = data as Record<string, unknown>;
        const issues = validateSchema(cs.schema, rest, '');
        if (cs.refine && !issues.some((i) => i.severity === 'error')) issues.push(...cs.refine(rest));
        for (const is of issues) {
          const field = is.path.split(/[.[]/)[0] || undefined;
          const issue: SchemaIssue = { entity: eid, component: ctype, field, message: `${ctype}.${is.path}：${is.message}` };
          (is.severity === 'error' ? errors : warnings).push(issue);
        }
        continue;
      }
      const fields = cs.fields ?? {};

      for (const [fname, fval] of Object.entries(data as Record<string, unknown>)) {
        if (fname === 'type') continue; // 判别式键，非数据字段。
        const fschema = fields[fname];
        if (!fschema) {
          const declared = Object.keys(fields).join('/') || '（无声明字段）';
          warnings.push({
            entity: eid,
            component: ctype,
            field: fname,
            message: `字段 "${fname}" 不在 ${ctype} 的声明字段中（疑似拼错；声明字段：${declared}）`,
          });
          continue;
        }
        if (fschema.type === 'number' && typeof fval !== 'number') {
          errors.push({ entity: eid, component: ctype, field: fname, message: `${ctype}.${fname} 应为 number，实为 ${typeof fval}` });
        } else if (fschema.type === 'boolean' && typeof fval !== 'boolean') {
          errors.push({ entity: eid, component: ctype, field: fname, message: `${ctype}.${fname} 应为 boolean，实为 ${typeof fval}` });
        }
      }
    }
  }
  return { errors, warnings };
}

/**
 * 资产引用硬校验（R9 增益 A，护城河）：凡声明为 `assetKey` 类型的组件字段，其值必须是
 * 资产清单（AssetIndex/Manifest）里已注册的 key——否则 AI 可编造、运行期静默不画/不响。
 * 把 §五.2 的 prompt 软约束升级成加载期硬校验（与 R12 同源）。未知 key = error（拒绝加载）。
 * 仅当调用方提供了 assetKeys 集合时才校验；不提供则跳过（opt-in，不影响未接资产索引的路径）。
 */
export function validateAssetRefs(
  capabilities: readonly CapabilityDefinition[],
  entities: Record<string, EntityBlueprint>,
  assetKeys: ReadonlySet<string>,
): SchemaIssue[] {
  const schemas = collectFieldSchemas(capabilities);
  const errors: SchemaIssue[] = [];
  for (const [eid, comps] of Object.entries(entities)) {
    for (const [ctype, data] of Object.entries(comps as Record<string, unknown>)) {
      const fields = schemas.get(ctype);
      if (!fields || typeof data !== 'object' || data === null) continue;
      for (const [fname, fval] of Object.entries(data as Record<string, unknown>)) {
        if (fields[fname]?.type !== 'assetKey') continue;
        if (typeof fval === 'string' && fval.length > 0 && !assetKeys.has(fval)) {
          errors.push({ entity: eid, component: ctype, field: fname, message: `${ctype}.${fname} 引用了清单中不存在的资产 key "${fval}"（防 AI 编造）` });
        }
      }
    }
  }
  return errors;
}

/** 把若干 issue 拼成一行可读消息（用于告警/抛错）。 */
export function formatIssues(issues: readonly SchemaIssue[]): string {
  return issues
    .map((i) => `${i.entity}.${i.component}${i.field ? `.${i.field}` : ''} —— ${i.message}`)
    .join('；');
}

// ── P2d · 时长单位糖 ────────────────────────────────────────────────────────────────
// 能力全按 tick 计时（sim 唯一时钟·整数 tick 是 lockstep/回放的正确选择），但把 "2 秒" 写成 120 是把 60Hz 烤进数据。
// 数据入口允许数字字段写 "2s" / "500ms" / "1.5min"，装载期按 meta.tickRate 换算成整数 tick（四舍五入）。
// 只认「声明为 number 的顶层字段」（旧 fields.type==='number' 或组合子 num/opt(num)）；别的字段原样。
const DURATION = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|min)\s*$/;
const UNIT_SECONDS: Record<string, number> = { ms: 0.001, s: 1, min: 60 };

function isNumberField(cs: ComponentSchema, field: string): boolean {
  const sc = cs.schema;
  if (sc && sc.k === 'obj') {
    let f = sc.props[field];
    if (!f) return false;
    if (f.k === 'opt') f = f.of;
    return f.k === 'num';
  }
  return cs.fields?.[field]?.type === 'number';
}

/** 就地把数字字段里的时长串换算成 tick。返回换算记录（"实体.组件.字段: 2s→120"）。 */
export function coerceDurations(
  capabilities: readonly CapabilityDefinition[],
  entities: Record<string, EntityBlueprint>,
  tickRate: number,
): string[] {
  const schemas = collectComponentSchemas(capabilities);
  const log: string[] = [];
  for (const [eid, comps] of Object.entries(entities)) {
    for (const [ctype, data] of Object.entries(comps as Record<string, unknown>)) {
      const cs = schemas.get(ctype);
      if (!cs || typeof data !== 'object' || data === null) continue;
      const rec = data as Record<string, unknown>;
      for (const [f, v] of Object.entries(rec)) {
        if (typeof v !== 'string' || !isNumberField(cs, f)) continue;
        const m = DURATION.exec(v);
        if (!m) continue;
        const ticks = Math.round(Number(m[1]) * UNIT_SECONDS[m[2]] * tickRate);
        rec[f] = ticks;
        log.push(`${eid}.${ctype}.${f}: ${v.trim()}→${ticks}`);
      }
    }
  }
  return log;
}

// ── B-8 · Tag 名字糖（engine-base-tier-review-2026-09-06 §3.2）────────────────────────────────────────
// Tag/targetMask/requiredTag 一类字段是 32 位掩码；让 LLM 写 `1<<5|1<<2` 是在制造 bug。manifest 顶层可给
// `tags: { enemy: 1, boss: 2, player: 4 }`（名字 → 位值），数字字段里写 "enemy|boss" 装载期折成 3。
// 只认「声明为 number 的顶层字段」里的**标识符串**；名字不在表里 → 硬错点名（拼错 = 静默 0 掩码 = 什么都不匹配）。
const TAG_LIST = /^\s*[A-Za-z_][A-Za-z0-9_-]*(?:\s*\|\s*[A-Za-z_][A-Za-z0-9_-]*)*\s*$/;

/** 就地把数字字段里的 "a|b" 名字串折成位或。返回换算记录；未知名字 → 抛（fail-closed）。 */
export function coerceTags(
  capabilities: readonly CapabilityDefinition[],
  entities: Record<string, EntityBlueprint>,
  tags: Readonly<Record<string, number>>,
): string[] {
  const schemas = collectComponentSchemas(capabilities);
  const log: string[] = [];
  for (const [eid, comps] of Object.entries(entities)) {
    for (const [ctype, data] of Object.entries(comps as Record<string, unknown>)) {
      const cs = schemas.get(ctype);
      if (!cs || typeof data !== 'object' || data === null) continue;
      const rec = data as Record<string, unknown>;
      for (const [f, v] of Object.entries(rec)) {
        if (typeof v !== 'string' || !isNumberField(cs, f) || !TAG_LIST.test(v)) continue;
        let mask = 0;
        for (const name of v.split('|').map((n) => n.trim())) {
          const bit = tags[name];
          if (bit === undefined) {
            throw new Error(`manifest: ${eid}.${ctype}.${f} 引用了未声明的 tag 名 "${name}"（tags 表里有：${Object.keys(tags).join(', ') || '无'}）`);
          }
          mask |= bit;
        }
        rec[f] = mask;
        log.push(`${eid}.${ctype}.${f}: ${v.trim()}→${mask}`);
      }
    }
  }
  return log;
}
