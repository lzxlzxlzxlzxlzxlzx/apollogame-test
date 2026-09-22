import type { ComponentCategory, ComponentSchema } from './define-capability.js';
import { legacyField, sig, t, type Schema, type Issue } from './schema.js';

// ═══════════════════════════════════════════════════════════════
//  defineComponent —— 组件契约的单一真相（P1c）
//
//  一份 `defineComponent('X', { 字段: schema… }, { category, describe, sim?, singleton? })` 同时给出：
//   · `provides` 里的旧 `ComponentSchema` 形状（category/describe/fields）——现有消费者（catalog/studio/
//     derive-asset-index/validate 标量档）零改动；
//   · `schema`：递归组合子（validate-manifest 见到它就走嵌套校验）；
//   · `sim`：是否进确定性域（false = 纯表现·须在 NON_DETERMINISTIC；determinism.test 对账）；
//   · `singleton`：黑板单例（world.singleton 契约）；
//   · 进程级注册表 `COMPONENT_DEFS`（同名重复定义且形状不同 → 抛·防两处漂移）。
//  迁移渐进：未迁移的组件仍用手写 fields；迁完一个域再让 component-map / universe 由本注册表生成（P1c 后续）。
// ═══════════════════════════════════════════════════════════════

export interface ComponentMeta {
  category: ComponentCategory;
  describe: string;
  /** 进确定性域（缺省 true）。false = 纯表现，不进 hash（须同步在 NON_DETERMINISTIC 名单·测试对账）。 */
  sim?: boolean;
  /** 黑板单例：每个世界至多一份（world.singleton 契约·严格模式多份即抛）。 */
  singleton?: boolean;
  /** 字段间约束（组合子表达不了的「kind=X 时 Y 必填」类）：返回 issue 列表（path 相对组件根）。 */
  refine?: (value: Record<string, unknown>) => Issue[];
}

export interface ComponentDef extends ComponentSchema {
  readonly type: string;
  readonly schema: Extract<Schema, { k: 'obj' }>;
  readonly sim: boolean;
  readonly singleton: boolean;
  /** 一个字段签名串（目录/文档用）。 */
  readonly signature: string;
  readonly refine?: (value: Record<string, unknown>) => Issue[];
}

export const COMPONENT_DEFS: ReadonlyMap<string, ComponentDef> = new Map<string, ComponentDef>();

export function defineComponent<const P extends Readonly<Record<string, Schema>>>(
  type: string,
  props: P,
  meta: ComponentMeta,
): ComponentDef {
  const schema = t.obj(props);
  const fields: ComponentSchema['fields'] = {};
  for (const [k, s] of Object.entries(props)) fields[k] = legacyField(s);
  const def: ComponentDef = {
    type,
    category: meta.category,
    describe: meta.describe,
    fields,
    schema,
    sim: meta.sim ?? true,
    singleton: meta.singleton ?? false,
    signature: sig(schema),
    ...(meta.refine ? { refine: meta.refine } : {}),
  };
  const prev = COMPONENT_DEFS.get(type);
  if (prev) {
    // 共用组件允许（多个能力 provides 同一组件），但形状必须一致（与 capability-registry 的共用组件守卫同口径）。
    if (prev.signature !== def.signature || prev.sim !== def.sim || prev.singleton !== def.singleton) {
      throw new Error(`defineComponent("${type}") 与既有定义形状不一致：\n  旧 ${prev.signature}\n  新 ${def.signature}`);
    }
    return prev;
  }
  (COMPONENT_DEFS as Map<string, ComponentDef>).set(type, def);
  return def;
}
