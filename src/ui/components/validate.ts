// UI 数据校验器（owner 2026-06-26·配 catalog.ts）：拿自描述目录验任意 LayoutNode 树。
// 弱模型产废数据时挡住、给具体反馈（未知组件 / 缺必填 / 错枚举 / children 规则 / 缺 id）。
// 这是「约束式数据合成」的 validate 环——和 catalog（喂 schema）+ sample（给范例）合成那台让弱模型也产对数据的机器。
//
// 纪律：lenient on 未列字段（目录字段表可增量补全，不误报未列的合法字段）；只验目录明确声明的 schema。

import type { LayoutNode } from './types.js';
import { catalogSpec } from './catalog.js';
import { safeColor } from './render.js';
import { safeButtonIconUrl } from './button-icon.js';

export interface UiIssue {
  path: string;   // 节点路径（如 root/children[2]/bubble），定位用
  type: string;   // 组件 type
  kind: 'unknown-type' | 'missing-required' | 'bad-enum' | 'children-rule' | 'missing-id' | 'bad-wheel-binding'
    | 'naked-fill' | 'unsafe-style' | 'bad-repeat' | 'bad-transform' | 'bad-signal-emission' | 'bad-custom-color' | 'bad-skin-layer' | 'bad-layout-placement' | 'flatten-3d' | 'bad-skin-border-width' | 'bad-panel-border' | 'bad-button-state-colors' | 'bad-toggle-visual' | 'bad-modal-visual' | 'bad-skin-feedback' | 'bad-cue' | 'bad-typewriter-signal'; // ↑硬错 · ↓软建议（lintLayoutNode 专属·非阻塞）
  detail: string;
  severity?: 'error' | 'warn'; // 缺省=error（validateLayoutNode 全是硬错）；lint 的建议=warn（不进零 issue 门）
}

// 视觉特效合集（layout.fx）闭集：kind/color 枚举·防拼错与注入（与 types.ts EffectKind/EffectColor 同源）。
const FX_KINDS = new Set(['pulse', 'cue', 'float', 'shake', 'pop', 'glow', 'sheen', 'sheen-hover', 'flash', 'fade', 'holo', 'ripple', 'wobble']);
const FX_COLORS = new Set(['danger', 'gold', 'jade', 'warn', 'ok', 'white']);
const BUTTON_STATE_KEYS = ['default', 'hover', 'pressed', 'disabled'] as const;
const BUTTON_BACKGROUND_TOKENS = new Set(['panel', 'raised', 'sunken', 'jade', 'gold', 'ok', 'warn', 'danger', 'ink', 'transparent']);
const isOpaqueHex = (value: unknown): value is string => typeof value === 'string' && /^#(?:[\da-fA-F]{3}|[\da-fA-F]{6})$/.test(value);
const isTranslucentHex = (value: unknown): value is string => typeof value === 'string' && /^#(?:[\da-fA-F]{4}|[\da-fA-F]{8})$/.test(value)
  && ![0, 255].includes(parseInt(value.length === 5 ? value.slice(-1).repeat(2) : value.slice(-2), 16));

/** The palette's custom escape is deliberately narrower than legacy Panel.bg: one real CSS color, not a gradient/URL. */
function isButtonColorCustom(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const custom = value as Record<string, unknown>;
  if (Object.keys(custom).length !== 1 || typeof custom.custom !== 'string') return false;
  const raw = custom.custom;
  if (safeColor(raw) !== raw) return false;
  if (/^#(?:[\da-fA-F]{3,4}|[\da-fA-F]{6}|[\da-fA-F]{8})$/.test(raw)) return true;
  const match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?))?\s*\)$/.exec(raw);
  return !!match && (raw.startsWith('rgba(') === (match[4] !== undefined)) && match.slice(1, 4).every((n) => Number(n) <= 255);
}

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
  if (['Label', 'dialog'].includes(t) && props.typewriterSignal !== undefined) {
    const signal = props.typewriterSignal;
    const s = signal && typeof signal === 'object' && !Array.isArray(signal) ? signal as Record<string, unknown> : null;
    if (typeof props.typewriter !== 'number' || !Number.isFinite(props.typewriter) || props.typewriter < 0 || props.typewriter > 1000
      || (t === 'Label' && (props.spans !== undefined || props.tween !== undefined))
      || !s || Object.keys(s).length !== 2 || typeof s.token !== 'string' || s.token.length < 1 || s.token.length > 256
      || typeof s.action !== 'string' || !/^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/.test(s.action)) {
      issues.push({ path, type: t, kind: 'bad-typewriter-signal', detail: 'typewriterSignal 须配 0..1000ms typewriter、不可与 spans/tween 混用，并仅含非空≤256 token 与具名 action' });
    }
  }
  if (t === 'Label') {
    if (props.lineHeight !== undefined && (typeof props.lineHeight !== 'number' || !Number.isFinite(props.lineHeight) || props.lineHeight < 8 || props.lineHeight > 120)) {
      issues.push({ path, type: t, kind: 'bad-enum', detail: 'Label.lineHeight 须为 8..120 有限 px' });
    }
    if (props.weight !== undefined && ![400, 600, 700, 900].includes(props.weight as number)) {
      issues.push({ path, type: t, kind: 'bad-enum', detail: 'Label.weight 仅允许 400|600|700|900 数字' });
    }
  }
  if (t === 'Panel' && props.border !== undefined) {
    const b = props.border;
    const colorTokens = new Set(catalogSpec('Label')?.props.find((p) => p.name === 'color')?.values ?? []);
    const color = b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>).color : undefined;
    const custom = color && typeof color === 'object' && !Array.isArray(color) ? color as Record<string, unknown> : undefined;
    if (props.bare === true || props.skin !== undefined || !b || typeof b !== 'object' || Array.isArray(b)
      || Object.keys(b).length !== 2
      || typeof (b as Record<string, unknown>).width !== 'number' || !Number.isFinite((b as { width: number }).width)
      || (b as { width: number }).width < 0 || (b as { width: number }).width > 24
      || !(typeof color === 'string' && colorTokens.has(color)
        || custom && Object.keys(custom).length === 1 && isOpaqueHex(custom.custom))) {
      issues.push({ path, type: t, kind: 'bad-panel-border', detail: 'Panel.border 仅非bare无skin可用，须恰有 width:0..24 与语义色或不透明 {custom:#hex}' });
    }
  }
  if (t === 'Modal' && props.visual !== undefined) {
    const bad = (detail: string) => issues.push({ path, type: t, kind: 'bad-modal-visual', detail });
    const visual = props.visual;
    const allowed = ['width', 'minHeight', 'padding', 'radius', 'fill', 'border', 'outerRing', 'enter', 'titleSize', 'titleAlign', 'contentAlign'];
    if (!visual || typeof visual !== 'object' || Array.isArray(visual) || Object.keys(visual).length === 0 || Object.keys(visual).some((key) => !allowed.includes(key))) {
      bad('visual 须为非空对象，仅含 width/minHeight/padding/radius/fill/border/titleSize/titleAlign/contentAlign');
    } else {
      const v = visual as Record<string, unknown>;
      for (const [key, min, max] of [['width', 280, 1200], ['minHeight', 120, 800], ['radius', 0, 64], ['titleSize', 10, 48]] as const) {
        if (v[key] !== undefined && (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || v[key] < min || v[key] > max)) bad(`visual.${key} 须为 ${min}..${max} 有限 px`);
      }
      if (v.padding !== undefined) {
        if (typeof v.padding === 'number') {
          if (!Number.isFinite(v.padding) || v.padding < 0 || v.padding > 80) bad('visual.padding 须为 0..80 有限 px');
        } else if (v.padding && typeof v.padding === 'object' && !Array.isArray(v.padding)) {
          const pad = v.padding as Record<string, unknown>;
          const sides = ['top', 'right', 'bottom', 'left'];
          if (Object.keys(pad).length !== 4 || !sides.every((side) => typeof pad[side] === 'number' && Number.isFinite(pad[side]) && (pad[side] as number) >= 0 && (pad[side] as number) <= 80)) bad('visual.padding 须恰有 top/right/bottom/left 四边 0..80 有限 px');
        } else bad('visual.padding 须为 0..80 有限 px 或四边对象');
      }
      if (v.fill !== undefined) {
        const fill = v.fill;
        if (!fill || typeof fill !== 'object' || Array.isArray(fill)) bad('visual.fill 须为安全不透明单色或固定 145° 双端渐变');
        else {
          const f = fill as Record<string, unknown>;
          if (Object.keys(f).length === 1 && Object.hasOwn(f, 'color')) {
            if (!isOpaqueHex(f.color)) bad('visual.fill.color 须为不透明 #RGB 或 #RRGGBB');
          } else if (Object.keys(f).length === 1 && f.gradient && typeof f.gradient === 'object' && !Array.isArray(f.gradient)) {
            const gradient = f.gradient as Record<string, unknown>;
            if (Object.keys(gradient).length !== 2 || !isOpaqueHex(gradient.from) || !isOpaqueHex(gradient.to)) bad('visual.fill.gradient 须恰有安全不透明 from/to 两色');
          } else bad('visual.fill 仅允许 {color} 或 {gradient:{from,to}}');
        }
      }
      if (v.border !== undefined) {
        const border = v.border;
        if (!border || typeof border !== 'object' || Array.isArray(border)) bad('visual.border 须为 {width,color}');
        else {
          const b = border as Record<string, unknown>;
          if (Object.keys(b).length !== 2 || typeof b.width !== 'number' || !Number.isFinite(b.width) || b.width < 0 || b.width > 24 || !isOpaqueHex(b.color)) bad('visual.border 须恰有 0..24px width 与不透明 #RGB/#RRGGBB color');
        }
      }
      if (v.outerRing !== undefined) {
        const ring = v.outerRing;
        if (!ring || typeof ring !== 'object' || Array.isArray(ring) || Object.keys(ring).length !== 2
          || typeof (ring as Record<string, unknown>).width !== 'number' || !Number.isFinite((ring as { width: number }).width)
          || (ring as { width: number }).width < 1 || (ring as { width: number }).width > 24
          || !isTranslucentHex((ring as Record<string, unknown>).color)) bad('visual.outerRing 须为 width:1..24 与半透明 #RGBA/#RRGGBBAA');
      }
      if (v.enter !== undefined && v.enter !== 'lift-240' && v.enter !== 'lift-600') bad('visual.enter 仅允许 lift-240|lift-600');
      if (props.skin && (v.fill !== undefined || v.border !== undefined)) bad('visual.fill/border 不可与 skin 共用');
      for (const key of ['titleAlign', 'contentAlign']) {
        if (v[key] !== undefined && v[key] !== 'left' && v[key] !== 'center') bad(`visual.${key} 只允许 left|center`);
      }
    }
  }
  if (t === 'Modal' && props.scrim !== undefined) {
    const scrim = props.scrim;
    if (!scrim || typeof scrim !== 'object' || Array.isArray(scrim) || Object.keys(scrim).length !== 1 || !Object.hasOwn(scrim, 'blur') || typeof (scrim as { blur: unknown }).blur !== 'number' || !Number.isFinite((scrim as { blur: number }).blur) || (scrim as { blur: number }).blur < 0 || (scrim as { blur: number }).blur > 12) {
      issues.push({ path, type: t, kind: 'bad-modal-visual', detail: 'scrim 仅允许 {blur:0..12}；opacity 固定 0.9' });
    }
  }
  if (t === 'Image' && props.position !== undefined && props.position !== 'center' && props.position !== 'top') {
    issues.push({ path, type: t, kind: 'bad-enum', detail: 'Image.position 仅允许 center|top' });
  }
  if (t === 'Button') {
    if (props.iconOnly !== undefined) {
      const mode = props.iconOnly as Record<string, unknown> | null;
      if (!mode || typeof mode !== 'object' || Array.isArray(mode) || Object.keys(mode).length !== 1
        || typeof mode.size !== 'number' || !Number.isFinite(mode.size) || mode.size < 24 || mode.size > 64) {
        issues.push({ path, type: t, kind: 'bad-enum', detail: 'Button.iconOnly 须恰为 {size:24..64 有限 px}' });
      }
      if (typeof props.label !== 'string' || !props.label.trim()) {
        issues.push({ path, type: t, kind: 'missing-required', detail: 'Button.iconOnly 必须保留非空 label 作为可访问名称与缺图回退' });
      }
      if (props.icon !== undefined && props.icon !== '' && !safeButtonIconUrl(props.icon)) {
        issues.push({ path, type: t, kind: 'bad-enum', detail: 'Button.iconOnly.icon 只接受安全本地图片路径或栅格 data URL' });
      }
      if (props.focusRing === false) issues.push({ path, type: t, kind: 'bad-enum', detail: 'Button.iconOnly 必须保留可见键盘焦点环' });
      if (props.sub !== undefined || props.shape !== undefined) issues.push({ path, type: t, kind: 'bad-enum', detail: 'Button.iconOnly 不接受副标或非圆形 shape' });
    }
    if (props.iconFeedback !== undefined) {
      const feedback = props.iconFeedback as Record<string, unknown> | null;
      const objectWithKeys = (value: unknown, keys: string[]): value is Record<string, unknown> =>
        !!value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
      const finiteRange = (value: unknown, min: number, max: number): boolean =>
        typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
      const hover = feedback?.hover;
      const pressed = feedback?.pressed;
      const disabled = feedback?.disabled;
      const colors = new Set(catalogSpec('Button')?.props.find((p) => p.name === 'labelColor')?.values ?? []);
      const glowColor = objectWithKeys(hover, ['translateY', 'brightness', 'glowRadius', 'glowColor']) ? hover.glowColor : undefined;
      const validColor = typeof glowColor === 'string' ? colors.has(glowColor) : isButtonColorCustom(glowColor);
      if (props.iconOnly === undefined || props.skinFeedback !== undefined
        || !objectWithKeys(feedback, ['hover', 'pressed', 'disabled', 'transitionMs'])
        || !objectWithKeys(hover, ['translateY', 'brightness', 'glowRadius', 'glowColor'])
        || !objectWithKeys(pressed, ['translateY', 'brightness'])
        || !objectWithKeys(disabled, ['opacity', 'grayscale'])
        || !finiteRange(hover.translateY, -8, 0) || !finiteRange(hover.brightness, 0.5, 2)
        || !finiteRange(hover.glowRadius, 0, 16) || !validColor
        || !finiteRange(pressed.translateY, 0, 8) || !finiteRange(pressed.brightness, 0.5, 2)
        || !finiteRange(disabled.opacity, 0.1, 1) || !finiteRange(disabled.grayscale, 0, 1)
        || !finiteRange(feedback.transitionMs, 0, 500)) {
        issues.push({ path, type: t, kind: 'bad-enum', detail: 'Button.iconFeedback 须为 iconOnly 专属的四态有限闭集，不允许自由 CSS/额外字段' });
      }
    }
    if (props.labelSize !== undefined && (typeof props.labelSize !== 'number' || !Number.isFinite(props.labelSize) || props.labelSize < 10 || props.labelSize > 32)) issues.push({ path, type: t, kind: 'bad-enum', detail: 'Button.labelSize 须为 10..32 有限 px' });
    if (props.labelWeight !== undefined && props.labelWeight !== 400 && props.labelWeight !== 600 && props.labelWeight !== 700) issues.push({ path, type: t, kind: 'bad-enum', detail: 'Button.labelWeight 仅允许 400|600|700' });
    if (props.borderWidth !== undefined && (typeof props.borderWidth !== 'number' || !Number.isFinite(props.borderWidth) || props.borderWidth < 0 || props.borderWidth > 8 || (typeof props.skin === 'string' && props.skin.length > 0) || props.skinSlice !== undefined)) issues.push({ path, type: t, kind: 'bad-enum', detail: 'Button.borderWidth 仅无皮按钮可用，须为 0..8 有限 px' });
    if (props.focusRingVisual !== undefined) {
      const ring = props.focusRingVisual;
      const colors = new Set(catalogSpec('Label')?.props.find((p) => p.name === 'color')?.values ?? []);
      const color = ring && typeof ring === 'object' && !Array.isArray(ring) ? (ring as Record<string, unknown>).color : undefined;
      const custom = color && typeof color === 'object' && !Array.isArray(color) ? color as Record<string, unknown> : undefined;
      if (props.focusRing === false || !ring || typeof ring !== 'object' || Array.isArray(ring) || Object.keys(ring).length !== 3
        || !(typeof color === 'string' && colors.has(color) || custom && Object.keys(custom).length === 1 && isOpaqueHex(custom.custom))
        || typeof (ring as Record<string, unknown>).width !== 'number' || !Number.isFinite((ring as { width: number }).width) || (ring as { width: number }).width < 1 || (ring as { width: number }).width > 8
        || typeof (ring as Record<string, unknown>).offset !== 'number' || !Number.isFinite((ring as { offset: number }).offset) || (ring as { offset: number }).offset < -8 || (ring as { offset: number }).offset > 8) issues.push({ path, type: t, kind: 'bad-enum', detail: 'Button.focusRingVisual 须保持可见并恰有安全色、width:1..8、offset:-8..8' });
    }
  }
  if (t === 'Button' && props.skinFeedback !== undefined) {
    const bad = (detail: string) => issues.push({ path, type: t, kind: 'bad-skin-feedback', detail });
    const feedback = props.skinFeedback;
    const fields = ['hoverBrightness', 'pressedBrightness', 'glowRadius', 'glowColor', 'transitionMs'];
    if (props.skin === '' || props.stateColors !== undefined) bad('skinFeedback 只用于贴图皮 Button，不可与空 skin 或 stateColors 共用');
    if (!feedback || typeof feedback !== 'object' || Array.isArray(feedback) || Object.keys(feedback).length !== fields.length || !fields.every((key) => Object.hasOwn(feedback, key))) {
      bad('skinFeedback 须恰有 hoverBrightness/pressedBrightness/glowRadius/glowColor/transitionMs');
    } else {
      const f = feedback as Record<string, unknown>;
      for (const [key, min, max] of [['hoverBrightness', 0.5, 2], ['pressedBrightness', 0.5, 2], ['glowRadius', 0, 32], ['transitionMs', 0, 500]] as const) {
        if (typeof f[key] !== 'number' || !Number.isFinite(f[key]) || f[key] < min || f[key] > max) bad(`skinFeedback.${key} 须为 ${min}..${max} 有限数字`);
      }
      const colorTokens = new Set(catalogSpec('Button')?.props.find((p) => p.name === 'labelColor')?.values ?? []);
      if (!((typeof f.glowColor === 'string' && colorTokens.has(f.glowColor)) || isButtonColorCustom(f.glowColor))) bad('skinFeedback.glowColor 须为文字色令牌或安全 {custom:#hex|rgb|rgba}');
    }
  }
  if (t === 'Toggle' && props.visual !== undefined) {
    const bad = (detail: string) => issues.push({ path, type: t, kind: 'bad-toggle-visual', detail });
    const value = props.visual;
    const fields = ['width', 'height', 'knobSize', 'knobOffLeft', 'knobOnLeft', 'knobTop', 'offBackground', 'onBackground', 'border', 'offKnob', 'onKnob'];
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => ![...fields, 'showLabel'].includes(key)) || !fields.every((key) => Object.hasOwn(value, key))) {
      bad(`visual 必须恰有 ${fields.join('/')} 字段，另可选 showLabel:boolean`);
    } else {
      const v = value as Record<string, unknown>;
      if (v.showLabel !== undefined && typeof v.showLabel !== 'boolean') bad('visual.showLabel 须为 boolean');
      if (v.showLabel === false && (typeof props.label !== 'string' || props.label.trim().length === 0)) bad('visual.showLabel:false 时 props.label 须为非空可访问名称');
      const px = (key: string, min: number, max: number): number | undefined => {
        const n = v[key];
        if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
          bad(`visual.${key} 须为 ${min}..${max} 的有限 px 数字`);
          return undefined;
        }
        return n;
      };
      const width = px('width', 20, 160);
      const height = px('height', 16, 80);
      const knob = px('knobSize', 4, 80);
      const off = px('knobOffLeft', 0, 160);
      const on = px('knobOnLeft', 0, 160);
      const top = px('knobTop', 0, 80);
      if (width !== undefined && knob !== undefined && off !== undefined && on !== undefined && (off + knob > width || on + knob > width || on <= off)) bad('visual 滑块须置于轨道内且 knobOnLeft > knobOffLeft');
      if (height !== undefined && knob !== undefined && top !== undefined && top + knob > height) bad('visual 滑块纵向须置于轨道内');
      const colorTokens = new Set(catalogSpec('Button')?.props.find((p) => p.name === 'labelColor')?.values ?? []);
      for (const key of ['offBackground', 'onBackground']) {
        if (!((typeof v[key] === 'string' && BUTTON_BACKGROUND_TOKENS.has(v[key])) || isButtonColorCustom(v[key]))) bad(`visual.${key} 须为面色令牌或安全 {custom:'#hex|rgb|rgba'}`);
      }
      for (const key of ['border', 'offKnob', 'onKnob']) {
        if (!((typeof v[key] === 'string' && colorTokens.has(v[key])) || isButtonColorCustom(v[key]))) bad(`visual.${key} 须为文字色令牌或安全 {custom:'#hex|rgb|rgba'}`);
      }
    }
  }
  if (t === 'Button' && props.stateColors !== undefined) {
    const bad = (detail: string) => issues.push({ path, type: t, kind: 'bad-button-state-colors', detail });
    const palette = props.stateColors;
    const colorTokens = new Set(catalogSpec('Button')?.props.find((p) => p.name === 'labelColor')?.values ?? []);
    if ((typeof props.skin === 'string' && props.skin.length > 0) || props.skinSlice !== undefined) bad('stateColors 不可与非空 skin 或 skinSlice 共用');
    if (!palette || typeof palette !== 'object' || Array.isArray(palette) || Object.keys(palette).length !== 4 || !BUTTON_STATE_KEYS.every((k) => Object.hasOwn(palette, k))) {
      bad('stateColors 必须恰有 default/hover/pressed/disabled 四态');
    } else {
      for (const state of BUTTON_STATE_KEYS) {
        const entry = (palette as Record<string, unknown>)[state];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)
          || Object.keys(entry).some((k) => !['background', 'border', 'text'].includes(k))
          || !Object.hasOwn(entry, 'background') || !Object.hasOwn(entry, 'border')) {
          bad(`stateColors.${state} 必须仅含 background/border/可选 text`);
          continue;
        }
        const values = entry as Record<string, unknown>;
        if (!((typeof values.background === 'string' && BUTTON_BACKGROUND_TOKENS.has(values.background)) || isButtonColorCustom(values.background))) bad(`stateColors.${state}.background 须为面色令牌或安全 {custom:'#hex|rgb|rgba'}`);
        for (const field of ['border', 'text'] as const) {
          if (field === 'text' && values[field] === undefined) continue;
          if (!((typeof values[field] === 'string' && colorTokens.has(values[field])) || isButtonColorCustom(values[field]))) bad(`stateColors.${state}.${field} 须为文字色令牌或安全 {custom:'#hex|rgb|rgba'}`);
        }
      }
    }
  }
  if (['Panel', 'Button', 'Modal', 'dialog'].includes(t) && props.skinBorderWidth !== undefined) {
    if (typeof props.skinBorderWidth !== 'number' || !Number.isFinite(props.skinBorderWidth) || props.skinBorderWidth <= 0 || props.skinSlice === undefined || typeof props.skin !== 'string' || !props.skin) {
      issues.push({ path, type: t, kind: 'bad-skin-border-width', detail: 'props.skinBorderWidth 须为正的有限数字，且只能与非空 props.skin 和 props.skinSlice 同时使用' });
    }
  }
  if (['Panel', 'Button'].includes(t) && (props.skinSize !== undefined || props.skinPosition !== undefined || props.skinOutset !== undefined)) {
    const bad = (detail: string) => issues.push({ path, type: t, kind: 'bad-skin-layer', detail });
    if (typeof props.skin !== 'string' || !props.skin || props.skinSlice !== undefined) bad('skinSize/skinPosition/skinOutset 只可与非空无九宫格 props.skin 同用');
    const size = props.skinSize as Record<string, unknown> | undefined;
    if (!size || typeof size !== 'object' || Array.isArray(size) || Object.keys(size).length !== 2 || !['x', 'y'].every((key) => typeof size[key] === 'number' && Number.isFinite(size[key]) && (size[key] as number) > 0 && (size[key] as number) <= 400)) bad('props.skinSize 须为 {x,y}，两值均为 0–400 内的有限正百分比');
    if (props.skinPosition !== undefined && props.skinPosition !== 'center') bad("props.skinPosition 仅允许 'center'");
    if (props.skinOutset !== undefined) {
      const outset = props.skinOutset as Record<string, unknown> | undefined;
      if (!outset || typeof outset !== 'object' || Array.isArray(outset) || Object.keys(outset).length !== 2 || !['x', 'y'].every((key) => typeof outset[key] === 'number' && Number.isFinite(outset[key]) && (outset[key] as number) >= 0 && (outset[key] as number) <= 64)) bad('props.skinOutset 须为 {x,y}，两值均为 0–64 内的有限非负 px');
    }
  }
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
    if (ps.type === 'enum-or-custom-color' && v !== undefined && ps.values) {
      const isToken = typeof v === 'string' && ps.values.includes(v);
      const custom = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
      const raw = custom?.custom;
      const isSafeCustom = !!custom && Object.keys(custom).length === 1 && typeof raw === 'string' && raw.trim().length > 0 && safeColor(raw) === raw;
      if (!isToken && !isSafeCustom) {
        issues.push({
          path, type: t, kind: custom ? 'bad-custom-color' : 'bad-enum',
          detail: custom ? `props.${ps.name}.custom 须是非空安全色串（禁止样式分隔符/属性逃逸）` : `props.${ps.name}='${String(v)}' 非法·合法值: ${ps.values.join(' | ')} 或显式 {custom:'#hex'}`,
        });
      }
    }
  }

  if (t === 'Panel' && props.wheel !== undefined) {
    const wheel = props.wheel as { upAction?: unknown; downAction?: unknown } | null;
    const validAction = (v: unknown): boolean => v === undefined || (typeof v === 'string' && v.length > 0);
    if (!wheel || typeof wheel !== 'object' || !validAction(wheel.upAction) || !validAction(wheel.downAction)
      || (wheel.upAction === undefined && wheel.downAction === undefined)) {
      issues.push({ path, type: t, kind: 'bad-wheel-binding', detail: 'props.wheel 须含非空 upAction 和/或 downAction 字符串（只声明具名 ActionSink 动作）' });
    }
  }

  // Signal emission is deliberately a nested closed enum (rather than a
  // collection of booleans).  Validate it here because catalog prop schemas
  // only describe the outer tint object.
  if (t === 'Image' && props.tint !== undefined) {
    const tint = props.tint as { kind?: unknown; emission?: unknown } | null;
    if (!tint || typeof tint !== 'object' || tint.kind !== 'signal') {
      issues.push({ path, type: t, kind: 'bad-signal-emission', detail: "props.tint 须为 {kind:'signal',progress,…}" });
    } else if (tint.emission !== undefined && !['off', 'steady', 'once', 'loop'].includes(String(tint.emission))) {
      issues.push({ path, type: t, kind: 'bad-signal-emission', detail: `props.tint.emission='${String(tint.emission)}' 非法·合法值: off | steady | once | loop` });
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
      if (e?.kind === 'cue') {
        const cue = e as Record<string, unknown>;
        if (Object.keys(cue).some((key) => !['kind', 'ms', 'once'].includes(key))
          || (cue.ms !== undefined && (typeof cue.ms !== 'number' || !Number.isFinite(cue.ms) || cue.ms < 100 || cue.ms > 5000))
          || (cue.once !== undefined && typeof cue.once !== 'boolean')) {
          issues.push({ path, type: t, kind: 'bad-cue', detail: `layout.fx[${i}] cue 仅支持 ms:100..5000 与 once:boolean` });
        }
      }
    });
  }

  // transformFrom 是 LayoutNode 的闭集状态变换：起点只能是四个有限
  // 数值，终点由普通 layout 读取。及早拒绝坏数据，不让 render 静默降级。
  const layout = node.layout as Record<string, unknown> | undefined;
  if (layout?.transformFrom !== undefined) {
    const pose = layout.transformFrom;
    if (!pose || typeof pose !== 'object' || Array.isArray(pose)) {
      issues.push({ path, type: t, kind: 'bad-transform', detail: 'layout.transformFrom 须是 {x?,y?,rotate?,scale?} 姿态对象' });
    } else {
      for (const key of ['x', 'y', 'rotate', 'scale'] as const) {
        const value = (pose as Record<string, unknown>)[key];
        if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
          issues.push({ path, type: t, kind: 'bad-transform', detail: `layout.transformFrom.${key} 须是有限数字` });
        }
      }
    }
    if (layout.transformMotionMs !== undefined && (typeof layout.transformMotionMs !== 'number' || !Number.isFinite(layout.transformMotionMs))) {
      issues.push({ path, type: t, kind: 'bad-transform', detail: 'layout.transformMotionMs 须是有限数字' });
    }
    if (layout.transformMotionEasing !== undefined && !['linear', 'ease-out', 'ease-in-out'].includes(String(layout.transformMotionEasing))) {
      issues.push({ path, type: t, kind: 'bad-transform', detail: 'layout.transformMotionEasing 非法·合法值: linear | ease-out | ease-in-out' });
    }
  }
  if (layout?.transformTransition !== undefined) {
    const transition = layout.transformTransition;
    if (!transition || typeof transition !== 'object' || Array.isArray(transition)) {
      issues.push({ path, type: t, kind: 'bad-transform', detail: 'layout.transformTransition 须是 {ms?,easing?} 对象' });
    } else {
      const ms = (transition as Record<string, unknown>).ms;
      const easing = (transition as Record<string, unknown>).easing;
      if (ms !== undefined && (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > 2000)) {
        issues.push({ path, type: t, kind: 'bad-transform', detail: 'layout.transformTransition.ms 须是 0..2000 的有限数字' });
      }
      if (easing !== undefined && !['linear', 'ease-out', 'ease-in-out'].includes(String(easing))) {
        issues.push({ path, type: t, kind: 'bad-transform', detail: 'layout.transformTransition.easing 非法·合法值: linear | ease-out | ease-in-out' });
      }
    }
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
const LAYOUT_ONLY = new Set(['fx', 'anim', 'animMs', 'animDelay', 'animFrom', 'animDist', 'transformFrom', 'transformMotionMs', 'transformMotionEasing', 'transformTransition', 'rotate', 'rotateX', 'rotateY', 'z', 'scale', 'tilt3d', 'perspective', 'chamfer', 'sheen']);
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
