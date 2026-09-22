// UI 数据校验器（owner 2026-06-26·配 catalog.ts）：拿自描述目录验任意 LayoutNode 树。
// 弱模型产废数据时挡住、给具体反馈（未知组件 / 缺必填 / 错枚举 / children 规则 / 缺 id）。
// 这是「约束式数据合成」的 validate 环——和 catalog（喂 schema）+ sample（给范例）合成那台让弱模型也产对数据的机器。
//
// 纪律：lenient on 未列字段（目录字段表可增量补全，不误报未列的合法字段）；只验目录明确声明的 schema。

import type { LayoutNode } from './types.js';
import { catalogSpec } from './catalog.js';

export interface UiIssue {
  path: string;   // 节点路径（如 root/children[2]/bubble），定位用
  type: string;   // 组件 type
  kind: 'unknown-type' | 'missing-required' | 'bad-enum' | 'children-rule' | 'missing-id'
    | 'naked-fill' | 'unsafe-style' | 'bad-repeat' | 'bad-layout-placement' | 'flatten-3d'; // ↑硬错 · ↓软建议（lintLayoutNode 专属·非阻塞）
  detail: string;
  severity?: 'error' | 'warn'; // 缺省=error（validateLayoutNode 全是硬错）；lint 的建议=warn（不进零 issue 门）
}

// 视觉特效合集（layout.fx）闭集：kind/color 枚举·防拼错与注入（与 types.ts EffectKind/EffectColor 同源）。
const FX_KINDS = new Set(['pulse', 'float', 'shake', 'pop', 'glow', 'sheen', 'sheen-hover', 'flash', 'fade', 'holo', 'ripple', 'wobble']);
const FX_COLORS = new Set(['danger', 'gold', 'jade', 'warn', 'ok', 'white']);

/** 验一棵 LayoutNode 树（递归 children + node 型 props），返回全部 issue（空=合法）。 */
export function validateLayoutNode(node: LayoutNode, path = 'root'): UiIssue[] {
  const issues: UiIssue[] = [];
  if (!node || typeof node !== 'object') {
    issues.push({ path, type: String((node as { type?: string } | null)?.type), kind: 'unknown-type', detail: '节点非对象' });
    return issues;
  }
  const t = node.type as string;
  if (!node.id) issues.push({ path, type: t, kind: 'missing-id', detail: '缺 id（mountUI diff / 引导锚点都需要每节点有 id）' });
  // P2b：样式逃生口 `{custom}` / 裸色串只许 CSS 色与渐变/url 字符，出现 ; " < > \\ 或 expression( / javascript: 即硬错
  //（render 侧另有 safeFill 兜底净化；这里在数据层就拒收，让弱模型的坏数据在校验环被点名而不是被静默改写）。
  for (const [k, v] of Object.entries((node.props ?? {}) as Record<string, unknown>)) {
    const raw = v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { custom?: unknown }).custom === 'string'
      ? (v as { custom: string }).custom
      : (k === 'bg' || k === 'color' || k === 'fillColor') && typeof v === 'string' ? v : undefined;
    if (raw !== undefined && /[;<>"\\]|expression\s*\(|javascript:/i.test(raw.replace(/url\(\s*'[^']*'\s*\)/g, ''))) {
      issues.push({ path, type: t, kind: 'unsafe-style', detail: `props.${k} 含可逃出 style 的字符（; < > " \\ expression( javascript:）：只许 CSS 色/渐变/url('…')` });
    }
  }
  // P2b：repeat 容器——source 必填、template 本身须是合法节点（递归验·路径标 repeat.template）。
  if (node.repeat) {
    const rp = node.repeat as { source?: unknown; template?: LayoutNode; empty?: LayoutNode };
    if (typeof rp.source !== 'string' || !rp.source) issues.push({ path, type: t, kind: 'bad-repeat', detail: 'repeat.source 须是列表 id 字符串' });
    if (!rp.template || typeof rp.template !== 'object') issues.push({ path, type: t, kind: 'bad-repeat', detail: 'repeat.template 须是 LayoutNode' });
    else issues.push(...validateLayoutNode(rp.template, `${path}/repeat.template`));
    if (rp.empty) issues.push(...validateLayoutNode(rp.empty, `${path}/repeat.empty`));
  }

  const spec = catalogSpec(t);
  if (!spec) {
    issues.push({ path, type: t, kind: 'unknown-type', detail: `未知组件 type:'${t}'（不在 UI_CATALOG·拼写错或该组件没建）` });
    return issues; // 类型未知 → 后续字段无从验
  }

  const props = (node.props ?? {}) as Record<string, unknown>;
  for (const ps of spec.props) {
    const v = props[ps.name];
    if (ps.required && (v === undefined || v === null)) {
      issues.push({ path, type: t, kind: 'missing-required', detail: `缺必填 props.${ps.name}（${ps.describe}）` });
    }
    if (ps.type === 'enum' && v !== undefined && ps.values && !ps.values.includes(String(v))) {
      issues.push({ path, type: t, kind: 'bad-enum', detail: `props.${ps.name}='${String(v)}' 非法·合法值: ${ps.values.join(' | ')}` });
    }
    // enum-or-number：数字直接放行（裸 px 精确档）；非数字仍须命中具名闭集（拦令牌拼写错）。
    if (ps.type === 'enum-or-number' && v !== undefined && typeof v !== 'number' && ps.values && !ps.values.includes(String(v))) {
      issues.push({ path, type: t, kind: 'bad-enum', detail: `props.${ps.name}='${String(v)}' 非法·合法值: ${ps.values.join(' | ')} 或裸 px 数字` });
    }
  }

  // layout.fx 闭集校验（视觉特效合集·kind/color 枚举·受控合成防拼错/注入）
  const fx = (node.layout as { fx?: Array<{ kind?: string; color?: string }> } | undefined)?.fx;
  if (Array.isArray(fx)) {
    fx.forEach((e, i) => {
      if (!e || !FX_KINDS.has(String(e.kind))) {
        issues.push({ path, type: t, kind: 'bad-enum', detail: `layout.fx[${i}].kind='${String(e?.kind)}' 非法·合法值: ${[...FX_KINDS].join(' | ')}` });
      }
      if (e?.color !== undefined && !FX_COLORS.has(String(e.color))) {
        issues.push({ path, type: t, kind: 'bad-enum', detail: `layout.fx[${i}].color='${String(e.color)}' 非法·合法值: ${[...FX_COLORS].join(' | ')}` });
      }
    });
  }

  // children 规则
  const kids = node.children;
  if (spec.children === 'none' && kids && kids.length > 0) {
    issues.push({ path, type: t, kind: 'children-rule', detail: `${t} 不收 children（内容应放 props）` });
  }
  if (spec.children === 'required' && (!kids || kids.length === 0)) {
    issues.push({ path, type: t, kind: 'children-rule', detail: `${t} 必须有 children（Tabs 每页 / Tooltip·ContextMenu 的触发元素）` });
  }

  // 递归：子节点 + node 型 props（backFace / bubble）
  kids?.forEach((ch, i) => issues.push(...validateLayoutNode(ch, `${path}/children[${i}]`)));
  for (const ps of spec.props) {
    if (ps.type === 'node') {
      const sub = props[ps.name] as LayoutNode | undefined;
      if (sub && typeof sub === 'object' && (sub as LayoutNode).type) {
        issues.push(...validateLayoutNode(sub, `${path}/${ps.name}`));
      }
    }
  }
  return issues;
}

/** 便捷：树是否合法（零 issue）。 */
export function isValidLayoutNode(node: LayoutNode): boolean {
  return validateLayoutNode(node).length === 0;
}

// ── 软建议（lintLayoutNode·REQ-UI-积木接口完备性批·P3D 复核 Gemini review 采纳）──────────────
// validateLayoutNode 是硬门（挡弱模型产废）；lint 是**非阻塞建议**（接口稳健性·不进零 issue 门·/check-ui 选择性用）。
// 与 render.ts 单一真相镜像（漂移低·闭集小）：面色令牌/预设名、3D layout 词。
const SURFACE_TOKENS = new Set(['panel', 'raised', 'sunken', 'jade', 'gold', 'ok', 'warn', 'danger', 'ink']);
const FILL_PRESETS = new Set(['jade-sheen', 'gold-sheen', 'ink-deep', 'steel', 'blood', 'frost', 'ember', 'void']);
// 只属 layout 的词（绝不是任何控件的合法 prop·误写进 props 静默失效）。**排除 radius**（Image/ProgressBar 真 prop·防误报）。
const LAYOUT_ONLY = new Set(['fx', 'anim', 'animMs', 'animDelay', 'animFrom', 'animDist', 'rotate', 'rotateX', 'rotateY', 'z', 'scale', 'tilt3d', 'perspective', 'chamfer', 'sheen']);
const has3dLayout = (l: unknown): boolean => {
  const c = l as { z?: unknown; rotateX?: unknown; rotateY?: unknown } | undefined;
  return !!c && (c.z !== undefined || c.rotateX !== undefined || c.rotateY !== undefined);
};

/** 非阻塞软建议扫描（接口稳健性）：① bg 裸串疑似拼错令牌 ② layout 专用词误塞 props ③ scroll 祖先下的 3D 变换会被拍平失效。
 *  返回全 severity:'warn'；与 validateLayoutNode 分离——不影响硬门/零 issue 断言。 */
export function lintLayoutNode(node: LayoutNode, path = 'root', inScroll = false): UiIssue[] {
  const out: UiIssue[] = [];
  if (!node || typeof node !== 'object') return out;
  const t = node.type as string;
  const props = (node.props ?? {}) as Record<string, unknown>;

  // ② bg 裸串：非 {custom} 对象、非已知令牌/预设、又非 raw CSS 色形（#/rgb/hsl/gradient/var/url）→ 极可能拼错令牌 → 静默 fallback。
  const bg = props.bg;
  if (typeof bg === 'string' && bg && !SURFACE_TOKENS.has(bg) && !FILL_PRESETS.has(bg)) {
    if (!/^(#|rgb|hsl|linear-gradient|radial-gradient|conic-gradient|var\(|url\()/.test(bg)) {
      out.push({ path, type: t, kind: 'naked-fill', severity: 'warn',
        detail: `props.bg='${bg}' 既非色库令牌/预设、也非 {custom}、也非 CSS 色形——疑似拼错令牌（会静默回退底色）。用 SurfaceToken/FillPreset，特别指定色用 {custom:'…'}` });
    }
  }

  // ③ layout 专用词误塞 props（fx/anim/rotate/z/… 写进 props 静默失效·应移入 layout）。
  for (const k of Object.keys(props)) {
    if (LAYOUT_ONLY.has(k)) {
      out.push({ path, type: t, kind: 'bad-layout-placement', severity: 'warn',
        detail: `props.${k} 应放 layout 里（'${k}' 只在 node.layout 生效·写进 props 静默无效）` });
    }
  }

  // ① scroll 祖先拍平 3D：祖先 overflow≠visible（Panel scroll:true）会把 transform-style 算成 flat → 子树 z/rotateX/rotateY 失效。
  if (inScroll && has3dLayout(node.layout)) {
    out.push({ path, type: t, kind: 'flatten-3d', severity: 'warn',
      detail: '3D layout(z/rotateX/rotateY) 在 scroll 祖先内会被 overflow 拍平（transform-style→flat）失效。3D 层别放可滚容器里，或去掉祖先 scroll' });
  }
  const nowInScroll = inScroll || props.scroll === true;

  node.children?.forEach((ch, i) => out.push(...lintLayoutNode(ch, `${path}/children[${i}]`, nowInScroll)));
  const spec = catalogSpec(t);
  if (spec) for (const ps of spec.props) {
    if (ps.type === 'node') { const sub = props[ps.name] as LayoutNode | undefined; if (sub?.type) out.push(...lintLayoutNode(sub, `${path}/${ps.name}`, nowInScroll)); }
  }
  return out;
}
