import type { EntityBlueprint } from './demo.assembly.js';
import type { LayoutNode } from '@ui/components/types.js';
import type { UIListSpec } from '@engine/host/ui-data-source.js';
import { validateLayoutNode } from '@ui/components/validate.js';
import { catalogSpec } from '@ui/components/catalog.js';

/** Optional, render-only cartridge presentation. It is never copied into WorldBlueprint. */
export interface CartPresentation {
  viewport: { width: number; height: number };
  theme: 'apolloOnyx' | 'apolloBrocade' | 'apolloToon';
  /** Host-local installed font slot; never loads a URL or enters World. */
  font?: 'system-yahei';
  ui: LayoutNode;
  flags?: Record<string, { kind: 'resource-equals'; id: string; value: number } | { kind: 'flow-is'; id: string; value: string }>;
  lists?: Record<string, UIListSpec>;
  /** Ordered contextual hotkeys. Enter/Space use native focused LayoutNode buttons instead. */
  shortcuts?: Array<{ key: string; action: string; when?: string; unless?: string }>;
  /** Keyboard mirrors of Canvas Clickable entities; visually disclosed only while focused. */
  focusTargets?: Array<{ entity: string; label: string; action: string; when?: string;
    labelPlacement?: 'center' | 'above'; labelGap?: number; labelSize?: number; tone?: 'cyan' | 'gold' | 'jade' }>;
  /** Opt-in render-local silhouette feedback for focusTargets; no World/signal state. */
  pointerFeedback?: { tone: 'cyan' | 'gold' | 'jade'; pressedMs: number; visual?: {
    colors?: Partial<Record<'cyan' | 'gold' | 'jade', string>>;
    hoverAlpha?: number; pressedAlpha?: number; hoverGlowBlur?: number; pressedGlowBlur?: number; pressedBrightness?: number;
  } };
}

const IDENT = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const own = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const keys = (v: Record<string, unknown>, allowed: readonly string[], path: string): void => {
  for (const k of Object.keys(v)) if (!allowed.includes(k)) throw new Error(`manifest: presentation.${path} 未知字段 ${k}`);
};
const id = (v: unknown, path: string): string => {
  if (typeof v !== 'string' || !IDENT.test(v) || ['constructor', 'prototype', '__proto__'].includes(v)) throw new Error(`manifest: presentation.${path} 必须是安全的非空 id`);
  return v;
};

function assertData(value: unknown, path: string, depth = 0): void {
  if (depth > 32) throw new Error(`manifest: presentation.${path} 嵌套过深`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertData(item, `${path}[${i}]`, depth + 1));
    return;
  }
  if (!own(value)) throw new Error(`manifest: presentation.${path} 只接受 JSON 数据`);
  for (const [k, v] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(k) || /^on[A-Z]|^(style|css|html|innerHTML|dangerouslySetInnerHTML)$/.test(k)) throw new Error(`manifest: presentation.${path}.${k} 不接受原型/DOM/CSS 逃生口`);
    assertData(v, `${path}.${k}`, depth + 1);
  }
}

function collectActions(value: unknown, path: string, actions: Set<string>): void {
  if (Array.isArray(value)) return value.forEach((item, i) => collectActions(item, `${path}[${i}]`, actions));
  if (!own(value)) return;
  for (const [k, v] of Object.entries(value)) {
    if (k === 'action' || /Action$/.test(k)) actions.add(id(v, `${path}.${k}`));
    else collectActions(v, `${path}.${k}`, actions);
  }
}

function validateTree(node: unknown, path: string, counts: { nodes: number; ids: Set<string> }, actions: Set<string>, binds: Array<{ kind: string; id: string }>, repeats: string[], nestedProp = false): void {
  if (!own(node)) throw new Error(`manifest: presentation.${path} 必须是 LayoutNode 对象`);
  if (++counts.nodes > 512) throw new Error('manifest: presentation.ui 最多 512 个节点');
  keys(node, ['type', 'id', 'props', 'layout', 'children', 'visibleWhen', 'repeat'], path);
  const nodeId = id(node.id, `${path}.id`);
  if (counts.ids.has(nodeId)) throw new Error(`manifest: presentation.ui 重复节点 id ${nodeId}`);
  counts.ids.add(nodeId);
  if (!own(node.props)) throw new Error(`manifest: presentation.${path}.props 必须是对象`);
  // resolveBindings only projects children/repeat. A node-valued prop may render a
  // static subtree, but dynamic bindings there would silently show stale data.
  if (nestedProp && (node.props.bind !== undefined || node.visibleWhen !== undefined || node.repeat !== undefined)) {
    throw new Error(`manifest: presentation.${path} node 型 props 暂不支持 bind/visibleWhen/repeat`);
  }
  collectActions(node.props, `${path}.props`, actions);
  if (node.props.bind !== undefined) binds.push({ kind: node.type as string, id: id(node.props.bind, `${path}.props.bind`) });
  if (node.visibleWhen !== undefined) {
    if (path === 'ui') throw new Error('manifest: presentation.ui 根节点 visibleWhen 不会被求值；请放在子节点');
    if (typeof node.visibleWhen !== 'string') throw new Error(`manifest: presentation.${path}.visibleWhen 必须是 flag id`);
    binds.push({ kind: 'flag', id: id(node.visibleWhen.replace(/^!/, ''), `${path}.visibleWhen`) });
  }
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) throw new Error(`manifest: presentation.${path}.children 必须是数组`);
    node.children.forEach((child, i) => validateTree(child, `${path}.children[${i}]`, counts, actions, binds, repeats, nestedProp));
  }
  if (node.repeat !== undefined) {
    if (!own(node.repeat)) throw new Error(`manifest: presentation.${path}.repeat 必须是对象`);
    keys(node.repeat, ['source', 'template', 'key', 'empty', 'limit'], `${path}.repeat`);
    repeats.push(id(node.repeat.source, `${path}.repeat.source`));
    validateTree(node.repeat.template, `${path}.repeat.template`, counts, actions, binds, repeats, nestedProp);
    if (node.repeat.empty !== undefined) validateTree(node.repeat.empty, `${path}.repeat.empty`, counts, actions, binds, repeats, nestedProp);
  }
  for (const spec of catalogSpec(node.type as string)?.props ?? []) {
    if (spec.type !== 'node' || node.props[spec.name] === undefined) continue;
    validateTree(node.props[spec.name], `${path}.props.${spec.name}`, counts, actions, binds, repeats, true);
  }
}

/** Shared by synchronous and lazy manifest loaders; rejects malformed opt-in data before Engine.load. */
export function parseCartPresentation(raw: unknown, entities: Record<string, EntityBlueprint>): CartPresentation | undefined {
  if (raw === undefined) return undefined;
  assertData(raw, '');
  if (!own(raw)) throw new Error('manifest: presentation 必须是对象');
  keys(raw, ['viewport', 'theme', 'font', 'ui', 'flags', 'lists', 'shortcuts', 'focusTargets', 'pointerFeedback'], '');
  if (!own(raw.viewport)) throw new Error('manifest: presentation.viewport 必须是对象');
  keys(raw.viewport, ['width', 'height'], 'viewport');
  const { width, height } = raw.viewport;
  if (![width, height].every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 320 && n <= 4096)) {
    throw new Error('manifest: presentation.viewport 宽高必须是 320..4096 的整数');
  }
  if (!['apolloOnyx', 'apolloBrocade', 'apolloToon'].includes(raw.theme as string)) {
    throw new Error('manifest: presentation.theme 必须是 house 主题名');
  }
  if (raw.font !== undefined && raw.font !== 'system-yahei') throw new Error('manifest: presentation.font 仅允许 system-yahei');
  const actions = new Set<string>();
  const binds: Array<{ kind: string; id: string }> = [];
  const repeats: string[] = [];
  validateTree(raw.ui, 'ui', { nodes: 0, ids: new Set() }, actions, binds, repeats);
  const issues = validateLayoutNode(raw.ui as unknown as LayoutNode);
  if (issues.length) throw new Error(`manifest: presentation.ui 无效：${issues[0].path} ${issues[0].detail}`);

  const byType = (type: string, semanticId: string): boolean => Object.values(entities).some((comps) => {
    const c = (comps as Record<string, unknown>)[type];
    return own(c) && c.id === semanticId;
  });
  const actionKeys = new Set(Object.values(entities).flatMap((comps) => {
    const c = (comps as Record<string, unknown>).KeyBinding;
    return own(c) && c.phase === 'action' && typeof c.key === 'string' ? [c.key] : [];
  }));
  for (const action of actions) if (!actionKeys.has(action)) throw new Error(`manifest: presentation.ui action ${action} 没有 phase=action 的 KeyBinding`);

  const flags: NonNullable<CartPresentation['flags']> = {};
  if (raw.flags !== undefined) {
    if (!own(raw.flags)) throw new Error('manifest: presentation.flags 必须是对象');
    for (const [name, spec] of Object.entries(raw.flags)) {
      id(name, `flags.${name}`);
      if (!own(spec)) throw new Error(`manifest: presentation.flags.${name} 必须是对象`);
      keys(spec, ['kind', 'id', 'value'], `flags.${name}`);
      const sourceId = id(spec.id, `flags.${name}.id`);
      if (spec.kind === 'resource-equals') {
        if (!Number.isFinite(spec.value) || typeof spec.value !== 'number' || !byType('Resource', sourceId)) throw new Error(`manifest: presentation.flags.${name} Resource 不存在或比较值无效`);
        flags[name] = { kind: 'resource-equals', id: sourceId, value: spec.value };
      } else if (spec.kind === 'flow-is') {
        if (typeof spec.value !== 'string' || !spec.value || !byType('GameFlow', sourceId)) throw new Error(`manifest: presentation.flags.${name} GameFlow 不存在或比较值无效`);
        flags[name] = { kind: 'flow-is', id: sourceId, value: spec.value };
      } else throw new Error(`manifest: presentation.flags.${name}.kind 未知`);
    }
  }
  const lists: NonNullable<CartPresentation['lists']> = {};
  if (raw.lists !== undefined) {
    if (!own(raw.lists)) throw new Error('manifest: presentation.lists 必须是对象');
    for (const [name, spec] of Object.entries(raw.lists)) {
      id(name, `lists.${name}`);
      if (!own(spec)) throw new Error(`manifest: presentation.lists.${name} 必须是对象`);
      keys(spec, ['query', 'tag', 'fields', 'sortBy', 'desc'], `lists.${name}`);
      if (!Array.isArray(spec.query) || spec.query.length === 0 || spec.query.length > 8 || !spec.query.every((x) => typeof x === 'string' && IDENT.test(x)) || !own(spec.fields)) throw new Error(`manifest: presentation.lists.${name} query/fields 无效`);
      const fields: Record<string, { comp: string; key: string }> = {};
      for (const [field, src] of Object.entries(spec.fields)) {
        id(field, `lists.${name}.fields.${field}`);
        if (!own(src)) throw new Error(`manifest: presentation.lists.${name}.fields.${field} 无效`);
        keys(src, ['comp', 'key'], `lists.${name}.fields.${field}`);
        fields[field] = { comp: id(src.comp, `lists.${name}.fields.${field}.comp`), key: id(src.key, `lists.${name}.fields.${field}.key`) };
      }
      if (spec.tag !== undefined && (!Number.isInteger(spec.tag) || typeof spec.tag !== 'number' || spec.tag < 0)) throw new Error(`manifest: presentation.lists.${name}.tag 无效`);
      if (spec.sortBy !== undefined && (typeof spec.sortBy !== 'string' || !(spec.sortBy in fields) && spec.sortBy !== 'id')) throw new Error(`manifest: presentation.lists.${name}.sortBy 未声明字段`);
      if (spec.desc !== undefined && typeof spec.desc !== 'boolean') throw new Error(`manifest: presentation.lists.${name}.desc 必须是布尔`);
      lists[name] = { query: spec.query as string[], fields, ...(spec.tag !== undefined ? { tag: spec.tag as number } : {}), ...(spec.sortBy !== undefined ? { sortBy: spec.sortBy as string } : {}), ...(spec.desc !== undefined ? { desc: spec.desc as boolean } : {}) };
    }
  }
  for (const source of repeats) if (!lists[source]) throw new Error(`manifest: presentation.ui repeat.source ${source} 无列表规格`);
  const shortcuts: NonNullable<CartPresentation['shortcuts']> = [];
  if (raw.shortcuts !== undefined) {
    if (!Array.isArray(raw.shortcuts) || raw.shortcuts.length > 32) throw new Error('manifest: presentation.shortcuts 必须是最多 32 项的数组');
    const seen = new Set<string>();
    for (const [i, item] of raw.shortcuts.entries()) {
      if (!own(item)) throw new Error(`manifest: presentation.shortcuts[${i}] 必须是对象`);
      keys(item, ['key', 'action', 'when', 'unless'], `shortcuts[${i}]`);
      if (typeof item.key !== 'string' || !/^(Escape|Key[A-Z]|Digit[0-9])$/.test(item.key)) throw new Error(`manifest: presentation.shortcuts[${i}].key 不在热键闭集`);
      const action = id(item.action, `shortcuts[${i}].action`);
      if (!actionKeys.has(action)) throw new Error(`manifest: presentation.shortcuts[${i}] action ${action} 没有 phase=action 的 KeyBinding`);
      const when = item.when === undefined ? undefined : id(item.when, `shortcuts[${i}].when`);
      const unless = item.unless === undefined ? undefined : id(item.unless, `shortcuts[${i}].unless`);
      for (const flag of [when, unless]) if (flag && !byType('Flag', flag) && !flags[flag]) throw new Error(`manifest: presentation.shortcuts[${i}] 条件 ${flag} 无 Flag/投影`);
      const signature = `${item.key}|${when ?? ''}|${unless ?? ''}`;
      if (seen.has(signature)) throw new Error(`manifest: presentation.shortcuts[${i}] 重复热键条件`);
      seen.add(signature);
      shortcuts.push({ key: item.key, action, ...(when ? { when } : {}), ...(unless ? { unless } : {}) });
    }
  }
  const focusTargets: NonNullable<CartPresentation['focusTargets']> = [];
  if (raw.focusTargets !== undefined) {
    if (!Array.isArray(raw.focusTargets) || raw.focusTargets.length > 64) throw new Error('manifest: presentation.focusTargets 必须是最多 64 项的数组');
    const seen = new Set<string>();
    for (const [i, item] of raw.focusTargets.entries()) {
      if (!own(item)) throw new Error(`manifest: presentation.focusTargets[${i}] 必须是对象`);
      keys(item, ['entity', 'label', 'action', 'when', 'labelPlacement', 'labelGap', 'labelSize', 'tone'], `focusTargets[${i}]`);
      const entity = id(item.entity, `focusTargets[${i}].entity`);
      const action = id(item.action, `focusTargets[${i}].action`);
      if (seen.has(entity)) throw new Error(`manifest: presentation.focusTargets[${i}] 重复实体 ${entity}`);
      seen.add(entity);
      const comps = entities[entity] as Record<string, unknown> | undefined;
      if (!comps?.Transform || !comps.Clickable) throw new Error(`manifest: presentation.focusTargets[${i}] 实体 ${entity} 缺 Transform/Clickable`);
      if ((comps.Clickable as Record<string, unknown>).action !== action) throw new Error(`manifest: presentation.focusTargets[${i}] action 与 ${entity}.Clickable.action 不同，键盘不能冒充等价热点`);
      if (!actionKeys.has(action)) throw new Error(`manifest: presentation.focusTargets[${i}] action ${action} 没有 phase=action 的 KeyBinding`);
      if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 80) throw new Error(`manifest: presentation.focusTargets[${i}].label 必须是 1..80 字符`);
      if (item.labelPlacement !== undefined && item.labelPlacement !== 'center' && item.labelPlacement !== 'above') throw new Error(`manifest: presentation.focusTargets[${i}].labelPlacement 仅允许 center|above`);
      if (item.labelGap !== undefined && (item.labelPlacement !== 'above' || typeof item.labelGap !== 'number' || !Number.isFinite(item.labelGap) || item.labelGap < 0 || item.labelGap > 64)) throw new Error(`manifest: presentation.focusTargets[${i}].labelGap 仅 above 可用且须为 0..64 有限 px`);
      if (item.labelSize !== undefined && (typeof item.labelSize !== 'number' || !Number.isFinite(item.labelSize) || item.labelSize < 10 || item.labelSize > 32)) throw new Error(`manifest: presentation.focusTargets[${i}].labelSize 须为 10..32 有限 px`);
      if (item.tone !== undefined && !['cyan', 'gold', 'jade'].includes(item.tone as string)) throw new Error(`manifest: presentation.focusTargets[${i}].tone 不在语义色闭集`);
      const when = item.when === undefined ? undefined : id(item.when, `focusTargets[${i}].when`);
      if (when && !byType('Flag', when) && !flags[when]) throw new Error(`manifest: presentation.focusTargets[${i}].when ${when} 无 Flag/投影`);
      focusTargets.push({ entity, label: item.label, action, ...(when ? { when } : {}),
        ...(item.labelPlacement !== undefined ? { labelPlacement: item.labelPlacement } : {}),
        ...(item.labelGap !== undefined ? { labelGap: item.labelGap } : {}),
        ...(item.labelSize !== undefined ? { labelSize: item.labelSize } : {}),
        ...(item.tone !== undefined ? { tone: item.tone as 'cyan' | 'gold' | 'jade' } : {}) });
    }
  }
  let pointerFeedback: CartPresentation['pointerFeedback'];
  if (raw.pointerFeedback !== undefined) {
    if (!own(raw.pointerFeedback)) throw new Error('manifest: presentation.pointerFeedback 必须是对象');
    keys(raw.pointerFeedback, ['tone', 'pressedMs', 'visual'], 'pointerFeedback');
    if (!['cyan', 'gold', 'jade'].includes(raw.pointerFeedback.tone as string)) throw new Error('manifest: presentation.pointerFeedback.tone 不在语义色闭集');
    if (!Number.isInteger(raw.pointerFeedback.pressedMs) || typeof raw.pointerFeedback.pressedMs !== 'number'
      || raw.pointerFeedback.pressedMs < 1 || raw.pointerFeedback.pressedMs > 300) throw new Error('manifest: presentation.pointerFeedback.pressedMs 必须是 1..300 整数');
    if (!focusTargets.length) throw new Error('manifest: presentation.pointerFeedback 需要至少一个 focusTargets');
    let visual: NonNullable<NonNullable<CartPresentation['pointerFeedback']>['visual']> | undefined;
    if (raw.pointerFeedback.visual !== undefined) {
      const v = raw.pointerFeedback.visual;
      if (!own(v) || Object.keys(v).length === 0) throw new Error('manifest: presentation.pointerFeedback.visual 须为非空对象');
      keys(v, ['colors', 'hoverAlpha', 'pressedAlpha', 'hoverGlowBlur', 'pressedGlowBlur', 'pressedBrightness'], 'pointerFeedback.visual');
      const colors: NonNullable<NonNullable<NonNullable<CartPresentation['pointerFeedback']>['visual']>['colors']> = {};
      if (v.colors !== undefined) {
        if (!own(v.colors) || Object.keys(v.colors).length === 0) throw new Error('manifest: presentation.pointerFeedback.visual.colors 须为非空对象');
        keys(v.colors, ['cyan', 'gold', 'jade'], 'pointerFeedback.visual.colors');
        for (const [tone, color] of Object.entries(v.colors)) {
          if (typeof color !== 'string' || !/^#[\da-fA-F]{6}$/.test(color)) throw new Error(`manifest: presentation.pointerFeedback.visual.colors.${tone} 须为不透明 #RRGGBB`);
          colors[tone as keyof typeof colors] = color;
        }
      }
      for (const [field, min, max] of [['hoverAlpha', 0, 1], ['pressedAlpha', 0, 1], ['hoverGlowBlur', 0, 32], ['pressedGlowBlur', 0, 32], ['pressedBrightness', 1, 2]] as const) {
        if (v[field] !== undefined && (typeof v[field] !== 'number' || !Number.isFinite(v[field]) || v[field] < min || v[field] > max)) throw new Error(`manifest: presentation.pointerFeedback.visual.${field} 须为 ${min}..${max} 有限数`);
      }
      visual = { ...(v.colors ? { colors } : {}),
        ...(v.hoverAlpha !== undefined ? { hoverAlpha: v.hoverAlpha as number } : {}),
        ...(v.pressedAlpha !== undefined ? { pressedAlpha: v.pressedAlpha as number } : {}),
        ...(v.hoverGlowBlur !== undefined ? { hoverGlowBlur: v.hoverGlowBlur as number } : {}),
        ...(v.pressedGlowBlur !== undefined ? { pressedGlowBlur: v.pressedGlowBlur as number } : {}),
        ...(v.pressedBrightness !== undefined ? { pressedBrightness: v.pressedBrightness as number } : {}) };
    }
    pointerFeedback = { tone: raw.pointerFeedback.tone as NonNullable<CartPresentation['pointerFeedback']>['tone'], pressedMs: raw.pointerFeedback.pressedMs, ...(visual ? { visual } : {}) };
  }
  for (const bind of binds) {
    if (bind.kind === 'flag') {
      if (!byType('Flag', bind.id) && !flags[bind.id]) throw new Error(`manifest: presentation.ui visibleWhen ${bind.id} 无 Flag/投影`);
    } else if (bind.kind === 'Label' || bind.kind === 'ProgressBar') {
      if (!byType('Resource', bind.id)) throw new Error(`manifest: presentation.ui bind ${bind.id} 无 Resource`);
    } else if (bind.kind === 'Image' && !byType('StringVar', bind.id)) throw new Error(`manifest: presentation.ui bind ${bind.id} 无 StringVar`);
  }
  return { viewport: { width: width as number, height: height as number }, theme: raw.theme as CartPresentation['theme'], ...(raw.font ? { font: 'system-yahei' } : {}), ui: raw.ui as unknown as LayoutNode, ...(raw.flags ? { flags } : {}), ...(raw.lists ? { lists } : {}), ...(raw.shortcuts ? { shortcuts } : {}), ...(raw.focusTargets ? { focusTargets } : {}), ...(pointerFeedback ? { pointerFeedback } : {}) };
}
