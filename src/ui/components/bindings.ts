// 世界绑定解析 —— 收编 GameShell 的 stat/bar/image-bind 入统一 LayoutNode 底座。
//
// 思路：渲染器 renderNode 保持**纯函数·世界无关**；世界数据在渲染**前**由 resolveBindings()
// 用注入的 UIDataSource 读出、填成字面值，再交 renderNode。于是「世界绑定」既进了统一节点 schema，
// 又不让 ECS 细节污染组件库（UIDataSource 由游戏/引擎注入·DI 解耦）。
//
// 红线不变（守 GameShell 同款不变量）：
//   · 绑定 = resourceId **字符串**（最弱 LLM 能填），绝不收自由取值表达式；
//   · 只读世界（显示）；写世界(按钮信号)走 action + HandlerMap(enqueue sim)，两端分明。

import type { LayoutNode, LabelProps, ProgressBarProps, ImageProps, DialogProps, ChoiceListProps, PortraitProps } from './types.js';

/** 列表项：标量字段表（`{{item.字段}}` 代入源）。`id` 约定为条目唯一键（世界投影时 = 实体 id）。 */
export type UIListItem = Readonly<Record<string, string | number | boolean>>;

/** 注入式世界数据源（游戏/引擎提供一份·解耦 ECS）：resource 读数值资源，value 读字符串变量，flag 读布尔旗标，list 读集合。 */
export interface UIDataSource {
  resource?(id: string): { current: number; max?: number } | undefined;
  value?(id: string): string | undefined;
  /** 读布尔旗标（通常映射世界 Flag 组件）：LayoutNode.visibleWhen 条件显隐求值用。游戏/引擎注入。 */
  flag?(id: string): boolean | undefined;
  /** 读集合（P2b·LayoutNode.repeat 的数据源）：按列表 id 给出条目数组（顺序即渲染序·须确定）。 */
  list?(id: string): ReadonlyArray<UIListItem> | undefined;
}

// ── repeat 展开（P2b）────────────────────────────────────────────────────────────────
const PLACEHOLDER = /\{\{\s*(item\.([A-Za-z0-9_-]+)|index|count)\s*\}\}/g;
const WHOLE = /^\{\{\s*(item\.([A-Za-z0-9_-]+)|index|count)\s*\}\}$/;

function lookupPlaceholder(name: string, field: string | undefined, item: UIListItem, index: number, count: number): string | number | boolean | undefined {
  if (name === 'index') return index;
  if (name === 'count') return count;
  return field !== undefined ? item[field] : undefined;
}

/** 深代入：字符串整串恰为一个占位符 → 按原类型代入；含占位符 → 拼接（缺字段 → 空串）；对象/数组递归；其余原样。 */
function substitute(v: unknown, item: UIListItem, index: number, count: number): unknown {
  if (typeof v === 'string') {
    const whole = WHOLE.exec(v);
    if (whole) {
      const r = lookupPlaceholder(whole[1].startsWith('item.') ? 'item' : whole[1], whole[2], item, index, count);
      return r === undefined ? '' : r;
    }
    return v.replace(PLACEHOLDER, (_m, name: string, field?: string) => {
      const r = lookupPlaceholder(name.startsWith('item.') ? 'item' : name, field, item, index, count);
      return r === undefined ? '' : String(r);
    });
  }
  if (Array.isArray(v)) return v.map((x) => substitute(x, item, index, count));
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = substitute(x, item, index, count);
    return out;
  }
  return v;
}

/** 按列表把 template 克隆 N 份（id 带 `#key` 后缀·全树代入占位符）。 */
function expandRepeat(node: LayoutNode, ds: UIDataSource): LayoutNode[] {
  const rp = node.repeat!;
  const items = ds.list?.(rp.source);
  if (!items) return [];
  const slice = rp.limit !== undefined ? items.slice(0, Math.max(0, rp.limit)) : items;
  if (slice.length === 0) return rp.empty ? [rp.empty] : [];
  const count = slice.length;
  return slice.map((item, index) => {
    const keyRaw = rp.key !== undefined ? item[rp.key] : undefined;
    const key = keyRaw === undefined ? String(index) : String(keyRaw);
    const clone = substitute(rp.template, item, index, count) as LayoutNode;
    return suffixIds(clone, `#${key}`);
  });
}

/** 给克隆子树的每个 id 加后缀（保 mountUI diff / 引导锚点的唯一性）。 */
function suffixIds(node: LayoutNode, suffix: string): LayoutNode {
  const out: LayoutNode = { ...node, id: `${node.id}${suffix}` };
  if (node.children) out.children = node.children.map((c) => suffixIds(c, suffix));
  if (node.repeat) out.repeat = { ...node.repeat, template: suffixIds(node.repeat.template, suffix) };
  return out;
}

/**
 * 求 LayoutNode.visibleWhen：flag id（可选 `!` 前缀取反）经 ds.flag 读布尔。
 * 安全默认（与 bind 无 reader 即不解析同构）：无 visibleWhen / 无 ds.flag / 空 id → 恒可见（绝不误删节点）。
 */
export function isVisible(node: LayoutNode, ds: UIDataSource): boolean {
  const vw = node.visibleWhen;
  if (!vw || !ds.flag) return true;
  const neg = vw[0] === '!';
  const id = neg ? vw.slice(1) : vw;
  if (!id) return true; // 空 flag id（如裸 "!"）→ 视为无条件，不误删
  const v = ds.flag(id);
  return neg ? !v : !!v;
}

/**
 * 把树里带 bind(resourceId) 的节点用 ds 读世界、填成字面值，返回**新树**（纯函数·不改原树）。
 * 未命中/无 bind 的节点原样透传。用法：renderNode(resolveBindings(tree, ds), theme)。
 * 活 HUD 每次世界变更重跑本函数 + 重挂即可（与组件库「静态 UI·变更重挂」模型一致）。
 */
export function resolveBindings(node: LayoutNode, ds: UIDataSource): LayoutNode {
  let props = node.props;

  if (node.type === 'Label') {
    const p = node.props as LabelProps;
    if (p.bind && ds.resource) {
      const r = ds.resource(p.bind);
      if (r) props = { ...p, text: `${p.text ?? ''}${r.current}` }; // text 作前缀/标签，接 current
    }
  } else if (node.type === 'ProgressBar') {
    const p = node.props as ProgressBarProps;
    if (p.bind && ds.resource) {
      const r = ds.resource(p.bind);
      if (r) props = { ...p, value: r.current, ...(r.max !== undefined ? { max: r.max } : {}) };
    }
  } else if (node.type === 'Image') {
    const p = node.props as ImageProps;
    if (p.bind && ds.value) {
      const s = ds.value(p.bind);
      if (s !== undefined) props = { ...p, src: s };
    }
  }

  // repeat（P2b）：本节点是容器 → 静态 children ++ 按列表克隆的 template；克隆后的节点与静态节点同等对待
  //（visibleWhen 剔除 → 递归解析绑定），故模板里 `visibleWhen:'{{item.flag}}'`/`bind:'{{item.res}}'` 代入后照常生效。
  const staticKids = node.children ?? [];
  const kids = node.repeat ? [...staticKids, ...expandRepeat(node, ds)] : staticKids;
  // visibleWhen 不满足的子节点先从 children 里剔除（连同子树·替代游戏用代码 if/else 重建树），再递归解析绑定。
  const children = (node.children || node.repeat) ? kids.filter((ch) => isVisible(ch, ds)).map((ch) => resolveBindings(ch, ds)) : undefined;
  if (node.repeat) {
    const { repeat: _r, ...rest } = node; // 展开后的树不再带 repeat（渲染/校验只见字面节点）
    return children ? { ...rest, props, children } : { ...rest, props };
  }
  return children ? { ...node, props, children } : { ...node, props };
}

// ── 剧情 / VN 投影（REQ-DIALOGUE M1·结构投影器·独立于标量 UIDataSource）─────────────────────────────
// 为什么另起一个投影器而非扩 UIDataSource：VN 投影是**结构性**的——当前对话节点 →
// {speaker, text, emotion, **变长** options[] + 逐项 optionAvailable}。标量 resource/value/flag 表达不了
// 「把当前 choice 节点展开成一列可选性门控的选项」。故沿 resolveBindings 同款 DI 思路（接口注入·ui 不碰 ECS/@skills）
// 另立 DialogueSource + resolveDialogue：游戏/引擎侧提供一份读世界实现（读 t3-dialogue 的 DialogueScript+State），
// ui/components 只认接口。活 HUD：resolveDialogue(tree, dsrc) 后（需要时再 resolveBindings）→ renderNode。

/** 当前对话节点的投影视图（读世界结果·纯数据）。options 仅 choice 节点有。 */
export interface DialogueView {
  kind: 'line' | 'choice' | 'check';
  speaker?: string;
  text?: string;
  emotion?: string;
  /** 当前节点立绘 URL（可选·**源侧已解析**：游戏 DialogueSource 经 M2 emotionArtResolver 按 emotion 出图·已含分级降级）。
   *  给了则 resolveDialogue 填 portrait.art（立绘随节点情绪换脸）；不给则 portrait 用字面 art / 名首字剪影占位。 */
  art?: string;
  options?: Array<{ label: string; available: boolean }>;
}
/** 注入式对话数据源（游戏/引擎提供·解耦 ECS/@skills）：按对话实体 id 读当前节点视图。 */
export interface DialogueSource {
  current(entityId: string): DialogueView | undefined;
}

/**
 * 把树里带 bind(对话实体 id) 的 dialog/choiceList/portrait 用 dsrc 投影成字面 props，返回**新树**（纯函数·不改原树）。
 * 未命中/无 bind 的节点原样透传。用法：renderNode(resolveDialogue(tree, dsrc), theme)（如还需资源绑定，再套 resolveBindings）。
 */
export function resolveDialogue(node: LayoutNode, dsrc: DialogueSource): LayoutNode {
  let props = node.props;
  const bind = (node.props as { bind?: string }).bind;
  if (bind && (node.type === 'dialog' || node.type === 'choiceList' || node.type === 'portrait')) {
    const v = dsrc.current(bind);
    if (v) {
      if (node.type === 'dialog') {
        const p = node.props as DialogProps;
        props = { ...p, speaker: v.speaker ?? p.speaker, text: v.text ?? p.text, emotion: v.emotion ?? p.emotion, kind: v.kind };
      } else if (node.type === 'choiceList') {
        // 选项恒随世界当前节点：choice 节点=投影其选项 + 逐项可选性；非 choice 节点=空（对话行/检定时不显选项）。
        const p = node.props as ChoiceListProps;
        props = { ...p, options: (v.options ?? []).map((o) => ({ label: o.label, available: o.available })) };
      } else {
        // 立绘随节点：名=speaker·emotion=当前情绪·art=源侧 M2 已解析图（给了才覆盖·否则留字面 art/占位）。
        const p = node.props as PortraitProps;
        props = { ...p, name: v.speaker ?? p.name, emotion: v.emotion ?? p.emotion, ...(v.art !== undefined ? { art: v.art } : {}) };
      }
    }
  }
  const children = node.children?.map((ch) => resolveDialogue(ch, dsrc));
  return children ? { ...node, props, children } : { ...node, props };
}
