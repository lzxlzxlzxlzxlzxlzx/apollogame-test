import type { LifeHostDescriptorV1, LifeHostUiSkinDescriptor } from '../../authoring/life-host-descriptor-core.js';
import type { LayoutNode } from '../../ui/components/index.js';
import type { LabelColor, LabelProps, PanelProps, DrawerProps, ButtonProps, BadgeProps, ProgressBarProps, ButtonStateColors } from '../../ui/components/types.js';
import type { LifeHostViewModel } from './life-presenter.js';
import { clamp } from '../../engine/math/scalar.js';

export interface LifeHudViewport { readonly width: number; readonly height: number }
export interface LifeHudLocalState {
  readonly inspectedItemId?: string;
  readonly trackingRevision?: number;
  readonly questFilter?: 'active' | 'completed' | 'other';
  readonly inventoryFilter?: 'all' | 'seed' | 'resource';
  readonly profileTab?: 'character' | 'relationships' | 'attributes';
}
type Resolver = (key: string) => string | undefined;
type Frame = { skin: string; skinSlice?: number; skinBorderWidth?: number };

// Approved overlay palette. Explicit custom colors keep text readable on parchment
// and the dark ribbon in both house themes; no CSS or artwork URLs are authored here.
const INK = { custom: '#382b43' } as const;
const PAPER = { custom: '#f6e7c8' } as const;
const NIGHT = { custom: '#192238' } as const;
const LIGHT = { custom: '#fff0c5' } as const;
const BUTTON_COLORS: ButtonStateColors = {
  default: { background: { custom: '#604775' }, border: INK, text: LIGHT },
  hover: { background: { custom: '#78538e' }, border: INK, text: LIGHT },
  pressed: { background: { custom: '#453153' }, border: INK, text: LIGHT },
  disabled: { background: { custom: '#d9c8a6' }, border: INK, text: { custom: '#564b52' } },
};

function text(id: string, value: string, size: number, color: LabelColor = INK): LayoutNode {
  return { type: 'Label', id, props: { text: value, size, color, bold: true, lineHeight: size * 1.4 } };
}
function frame(skin: LifeHostUiSkinDescriptor, slot: 'trackedQuestFrame' | 'panelFrame' | 'worldStatusRibbon' | 'hudChrome', resolve: Resolver): Frame | undefined {
  const key = skin.slots[slot];
  const url = key && resolve(key);
  if (!url) return undefined;
  const slice = slot === 'trackedQuestFrame' || slot === 'panelFrame' ? skin.slices?.[slot] : undefined;
  return { skin: url, ...(slice ? { skinSlice: slice.source, ...(slice.display === undefined ? {} : { skinBorderWidth: slice.display }) } : {}) };
}

/** Shared, render-only projection. A missing skin preserves the legacy tree exactly.
 * Positions use the host's measured viewport, never camera/world coordinates. */
export function buildLifeHudOverlay(
  legacy: LayoutNode, view: LifeHostViewModel, hud: LifeHostDescriptorV1['hud'],
  skin: LifeHostUiSkinDescriptor | undefined, resolve: Resolver,
  viewport: LifeHudViewport = { width: 1440, height: 900 },
  localState: LifeHudLocalState = {},
): LayoutNode {
  if (!skin) return legacy;
  const trackerFrame = frame(skin, 'trackedQuestFrame', resolve);
  const ribbon = frame(skin, 'worldStatusRibbon', resolve);
  const panelFrame = frame(skin, 'panelFrame', resolve);
  const chrome = frame(skin, 'hudChrome', resolve);
  if (!trackerFrame && !ribbon && !panelFrame && !chrome) return legacy;
  const width = Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : 1440;
  const height = Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : 900;
  const narrow = width <= 760;
  const compact = width <= 560;
  const stacked = width <= 1320;
  const edge = narrow ? 12 : 24;
  const trackerWidth = compact ? width - edge * 2 : narrow ? Math.floor((width - 34) * .52) : stacked ? 320 : clamp(width * .22, 284, 352);
  const ribbonWidth = narrow ? width - edge * 2 : stacked ? 600 : clamp(width * .38, 520, 680);
  const statusLeft = compact ? 48 : 82;
  const statusContentWidth = ribbonWidth - statusLeft - (compact ? 18 : narrow ? 24 : 32);
  const statusLine = `${view.placeLabel} · ${view.date || '—'} · ${view.slot || '—'}`;
  // A single Label guarantees one font and numeric baseline. Conservative CJK
  // units fit long authored names without translating or dropping live values.
  const statusUnits = Array.from(statusLine).reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) > 255 ? 1 : .62), 0);
  const statusSize = Math.min(narrow ? 16 : 18, Math.max(8, Math.floor(statusContentWidth / Math.max(1, statusUnits))));
  const trackerY = compact ? 254 : narrow ? 119 : stacked ? 135 : 24;
  const tracked = view.questItems.find((q) => q.tracked);
  const tracker: LayoutNode = { type: 'Panel', id: 'life-host-tracked-quest',
    props: { bg: PAPER, edge: 'gold', ...trackerFrame, ...(trackerFrame && !trackerFrame.skinSlice ? { skinSize: { x: 100, y: 100 }, skinPosition: 'center' } : {}) },
    layout: { x: edge, y: trackerY, width: trackerWidth, padding: narrow ? 10 : 16, direction: 'row', gap: narrow ? 7 : 12, radius: 12 }, children: [
      { type: 'Panel', id: 'life-host-tracked-emblem-space', props: { bare: true }, layout: { width: narrow ? 52 : 42, height: 104 } },
      { type: 'Panel', id: `life-host-tracked-paper-${localState.trackingRevision ?? 0}`, props: { bg: PAPER, border: { width: 0, color: INK } },
        layout: { flex: 1, padding: 0, gap: 9, ...((localState.trackingRevision ?? 0) > 0 ? { fx: [{ kind: 'flash' as const, color: 'gold' as const, ms: 320, once: true }] } : {}) }, children: [
      text('life-host-tracked-quest-kicker', tracked ? `当前追踪 · ${tracked.chapterTitle}` : '任务追踪', narrow ? 11 : 13),
      text('life-host-tracked-quest-title', tracked?.title ?? '当前没有追踪任务', narrow ? 17 : 22),
      text('life-host-tracked-quest-objective', tracked?.nextObjective ?? '打开任务日志以选择任务', narrow ? 13 : 16),
      ...(!narrow ? [text('life-host-tracked-quest-help', '在任务日志中切换追踪项', 12)] : []),
    ] }] };
  const status: LayoutNode = { type: 'Panel', id: 'life-host-world-status',
    props: { bg: NIGHT, edge: 'gold', ...ribbon, ...(ribbon ? { skinSize: { x: 100, y: 100 }, skinPosition: 'center' } : {}) },
    layout: { x: (width - ribbonWidth) / 2, y: narrow ? 14 : stacked ? 15 : 24, width: ribbonWidth, height: narrow ? 92 : 104,
      direction: 'row', align: 'center', justify: 'center', gap: 0, padding: 0, radius: 12 }, children: [
      { type: 'Panel', id: 'life-host-status-ink', props: { bare: true },
        layout: { x: statusLeft, y: 0, width: statusContentWidth, height: narrow ? 92 : 104, direction: 'row', align: 'center', justify: 'center', gap: 0, padding: 0 }, children: [
      text('life-host-status-line', statusLine, statusSize, LIGHT),
    ] }] };
  const resourceWidths: number[] = [];
  const resources = (view.profile?.attributes ?? []).filter((a) => a.surfaces.includes('hud')).map((a, index): LayoutNode => {
    const resourceWidth = Math.max(narrow ? 48 : 70, Math.ceil(String(a.value).length * (narrow ? 9 : 12) + (narrow ? 35 : 48)));
    resourceWidths.push(resourceWidth);
    const src = resolve(a.iconSkinKey);
    const icon: LayoutNode = src
      ? { type: 'Image', id: `life-host-resource-icon-${index}`, props: { src, alt: a.title, fit: 'contain' }, layout: { width: narrow ? 20 : 28, height: narrow ? 20 : 28 } }
      : text(`life-host-resource-icon-placeholder-${index}`, '◆', narrow ? 15 : 19, LIGHT);
    return { type: 'Tooltip', id: `life-host-resource-tip-${index}`, props: { content: a.title, placement: 'bottom' }, children: [
      { type: 'Panel', id: `life-host-resource-${index}`, props: { bg: NIGHT, edge: 'gold', shape: 'pill' },
        layout: { width: resourceWidth, height: narrow ? 34 : 42, direction: 'row', align: 'center', gap: narrow ? 4 : 8, padding: narrow ? 5 : 7, radius: 24 }, children: [
          icon, text(`life-host-resource-value-${index}`, String(a.value), narrow ? 14 : 19, LIGHT),
        ] },
    ] };
  });
  // Reuse the existing actions and labels; do not invent World input or UI state.
  const legacyHud = legacy.children?.[0];
  const find = (root: LayoutNode | undefined, id: string): LayoutNode | undefined => {
    if (root?.id === id) return root;
    for (const child of root?.children ?? []) { const result = find(child, id); if (result) return result; }
    return undefined;
  };
  const entries: LayoutNode[] = [];
  for (const [kind, key, iconSlot] of [['quest', 'J', 'questIcon'], ['inventory', 'I', 'inventoryIcon'], ['profile', 'C', 'profileIcon']] as const) {
    const button = find(legacyHud, `life-host-${kind}-open`);
    if (!button) continue;
    const iconKey = skin.slots[iconSlot];
    const icon = iconKey ? resolve(iconKey) : undefined;
    const entrySize = narrow ? 50 : 60; // PUI inner image = size-8: approved prototype faces are 42/52px.
    const entryLabel = (button.props as ButtonProps).label.replace(/^[JIC] · /u, '');
    const face: LayoutNode = { ...button, props: { ...button.props as ButtonProps, label: entryLabel,
      ...(icon ? { icon, iconOnly: { size: entrySize } } : {}), kind: 'quiet', skin: '', borderWidth: 0,
      focusRingVisual: { color: { custom: '#9ce2e7' }, width: 3, offset: 4 } },
      layout: { width: icon ? entrySize : (narrow ? 58 : 86), height: icon ? entrySize : (narrow ? 44 : 60), radius: 0, padding: icon ? 0 : 6 } };
    const entry: LayoutNode = { type: 'Panel', id: `life-host-${kind}-entry`, props: { bare: true }, layout: { width: icon ? entrySize : (narrow ? 58 : 86), align: 'center', gap: 7 }, children: [
      // PUI owns image-load/failure lifecycle and the native accessible name.
      // Missing resolver results retain a conventional visible text button.
      face,
      { type: 'Panel', id: `life-host-${kind}-key-frame`, props: { bg: NIGHT, edge: 'gold' }, layout: { width: narrow ? 22 : 25, height: narrow ? 20 : 24, padding: 0, radius: 5, align: 'center', justify: 'center' }, children: [text(`life-host-${kind}-key`, key, narrow ? 11 : 13, LIGHT)] },
    ] };
    entries.push(icon ? { type: 'Tooltip', id: `life-host-${kind}-entry-tip`, props: { content: entryLabel, placement: 'bottom' }, children: [entry] } : entry);
  }
  const entryWidths = entries.map((entry) => (entry.type === 'Tooltip' ? entry.children?.[0] : entry)?.layout?.width ?? 0);
  const entriesWidth = entryWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, entries.length - 1) * (narrow ? 4 : 10);
  const resourcesWidth = resourceWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, resources.length - 1) * (narrow ? 4 : 8);
  const rightGap = narrow ? 8 : 16;
  const naturalWidth = resourcesWidth + entriesWidth + rightGap;
  const rightWidth = compact ? width - edge * 2 : naturalWidth;
  const right: LayoutNode = { type: 'Panel', id: 'life-host-resource-actions', props: { bare: true, ...(compact ? { scroll: true } : {}) },
    layout: { x: width - edge - rightWidth, y: stacked ? (narrow ? 122 : 135) : 24, width: rightWidth,
      ...(compact ? { height: 122, padding: 8 } : {}), direction: 'row', align: 'start', gap: rightGap }, children: [
      { type: 'Panel', id: 'life-host-resources', props: { bare: !chrome, ...(chrome ? { bg: NIGHT, ...chrome } : {}) }, layout: { width: resourcesWidth, height: narrow ? 50 : 60, direction: 'row', align: 'center', gap: narrow ? 4 : 8, padding: 0 }, children: resources },
      { type: 'Panel', id: 'life-host-panel-entries', props: { bare: true }, layout: { width: entriesWidth, direction: 'row', gap: narrow ? 4 : 10, align: 'start' }, children: entries },
    ] };
  // Reuse the authoritative inventory/quest/profile content builders. Only its
  // presentation changes: no full-screen scrim, no new actions or persistent state.
  const drawers = (legacy.children ?? []).filter((node) => node.type === 'Drawer').map((drawer): LayoutNode => {
    const kind = drawer.id.replace('life-host-', '').replace('-drawer', '');
    const oldFrame = drawer.children?.[0];
    const contents = oldFrame?.id === `life-host-${kind}-frame` ? oldFrame.children ?? [] : drawer.children ?? [];
    const actions = contents.find((node) => node.id === `life-host-${kind}-actions`);
    const close = actions?.children?.[0];
    const sideWidth = Math.min(510, width - edge * 2);
    const sideTop = compact ? 420 : stacked ? 310 : 216;
    const sideHeight = Math.max(160, height - sideTop - 26);
    const recolor = (node: LayoutNode): LayoutNode => {
      const children = node.children?.map(recolor);
      if (node.type === 'Label') return { ...node, props: { ...node.props as LabelProps, color: INK, size: node.id.includes('title-') ? 17 : 14 }, children };
      if (node.type === 'Badge') return text(node.id, (node.props as BadgeProps).text, 14);
      if (node.type === 'Button') return { ...node, props: { ...node.props as ButtonProps, skin: '', stateColors: BUTTON_COLORS }, children };
      if (node.type === 'ProgressBar') {
        const props = node.props as ProgressBarProps;
        return { type: 'Panel', id: `${node.id}-group`, props: { bare: true }, children: [
          ...(props.label ? [text(`${node.id}-caption`, props.label, 13)] : []),
          { ...node, props: { ...props, label: undefined }, children },
        ] };
      }
      if (node.type === 'Panel' && !(node.props as PanelProps).bare) return { ...node, props: { ...node.props as PanelProps, bg: PAPER }, children };
      return { ...node, children };
    };
    const tabs = (options: readonly (readonly [string, string])[], selected: string): LayoutNode => ({
      type: 'Panel', id: `life-host-${kind}-tabs`, props: { bare: true }, layout: { direction: 'row', gap: 7 }, children: options.map(([id, label]): LayoutNode => ({
        type: 'Button', id: `life-host-${kind}-tab-${id}`, props: { label: label + (id === selected ? ' ✓' : ''), kind: 'quiet', skin: '',
          stateColors: id === selected ? BUTTON_COLORS : { ...BUTTON_COLORS, default: { background: PAPER, border: INK, text: INK } },
          action: 'life.host.tab', actionArg: `${kind}:${id}` }, layout: { press3d: true },
      })),
    });
    let body = contents.filter((node) => node !== actions).map(recolor);
    if (kind === 'quest') {
      const selected = localState.questFilter ?? 'active';
      const rows = view.questItems.flatMap((quest, index) => {
        const group = quest.state === 'active' ? 'active' : quest.state === 'completed' ? 'completed' : 'other';
        const node = body.find((n) => n.id === `life-host-quest-item-${index}`);
        return group === selected && node ? [node] : [];
      });
      body = [tabs([['active', '进行中'], ['completed', '已完成'], ['other', '其他']], selected),
        ...(rows.length ? rows : [text('life-host-quest-empty-label', selected === 'completed' ? '暂无已完成任务' : selected === 'other' ? '暂无其他任务' : '当前没有进行中的任务', 16)])];
    }
    if (kind === 'inventory') {
      const selected = localState.inventoryFilter ?? 'all';
      const items = view.inventoryItems.filter((item) => selected === 'all' || item.kind === selected);
      const inspect = view.inventoryItems.find((item) => item.id === localState.inspectedItemId) ?? items[0];
      const grid = body.find((node) => node.id === 'life-host-inventory-grid')!;
      const cells = items.flatMap((item) => {
        const cell = grid.children?.find((node) => node.id === `life-host-inventory-item-${item.id}`);
        if (!cell) return [];
        return [{ ...cell, props: { ...cell.props as PanelProps, edge: item.id === inspect?.id ? 'jade' as const : 'gold' as const },
          children: cell.children?.map((child) => child.id === `life-host-inventory-title-${item.id}`
            ? { type: 'Button' as const, id: child.id, props: { label: item.title, kind: 'quiet' as const, skin: '', stateColors: BUTTON_COLORS, action: 'life.host.inventory.inspect', actionArg: item.id }, layout: { press3d: true } }
            : child),
        }];
      });
      body = [tabs([['all', '全部'], ['seed', '种子'], ['resource', '材料']], selected),
        ...body.filter((node) => node !== grid), { ...grid, children: cells.length ? cells : [text('life-host-inventory-empty-label', '当前分类没有物品', 16)] },
        ...(inspect ? [{ type: 'Panel', id: 'life-host-inventory-detail', props: { bg: PAPER, edge: 'gold' }, layout: { padding: 12, gap: 8 }, children: [
          text('life-host-inventory-detail-title', inspect.title, 17), text('life-host-inventory-detail-count', `数量 ×${inspect.count}`, 14),
        ] } satisfies LayoutNode] : []),
      ];
    }
    if (kind === 'profile') {
      const selected = localState.profileTab ?? 'character';
      const summary = body.filter((node) => node.id === 'life-host-profile-summary');
      const rows = (view.profile?.attributes ?? []).flatMap((attribute, index) => {
        const relationship = attribute.levelId !== undefined;
        const visible = selected === 'attributes' || (selected === 'relationships' ? relationship : !relationship);
        const node = body.find((n) => n.id === `life-host-profile-row-${index}`);
        return visible && node ? [node] : [];
      });
      body = [...summary, tabs([['character', '人物'], ['relationships', '关系'], ['attributes', '属性']], selected),
        ...(rows.length ? rows : [text('life-host-profile-empty-label', '暂无档案属性', 16)])];
    }
    return { type: 'Panel', id: drawer.id, props: { bare: true }, layout: { x: width - edge - sideWidth, y: sideTop, width: sideWidth }, children: [
      { type: 'Panel', id: `life-host-${kind}-frame`, props: { bg: PAPER, edge: 'gold', ...panelFrame },
        layout: { height: sideHeight, padding: narrow ? 6 : 10, gap: 0, radius: 22, anim: 'flyIn', animMs: 200, animFrom: 'right', animDist: 22 }, children: [
          { type: 'Panel', id: `life-host-${kind}-paper`, props: { bg: PAPER, border: { width: 0, color: INK } },
            layout: { flex: 1, padding: narrow ? 6 : 10, gap: 14, radius: 6 }, children: [
          { type: 'Panel', id: `life-host-${kind}-header`, props: { bare: true }, layout: { direction: 'row', align: 'center', justify: 'between', gap: 12 }, children: [
            text(`life-host-${kind}-heading`, (drawer.props as DrawerProps).title ?? hud.title ?? 'Life', narrow ? 21 : 25),
            ...(close ? [recolor(close)] : []),
          ] },
          { type: 'Panel', id: `life-host-${kind}-body`, props: { bg: PAPER, scroll: true, border: { width: 0, color: INK } }, layout: { height: Math.max(70, sideHeight - 210), padding: 0, gap: 10, radius: 0 }, children: [
            ...body,
          ] },
          text(`life-host-${kind}-footer`, '向下滚动查看更多 · Esc 关闭', 12),
          ] },
        ] },
    ] };
  });
  return { ...legacy, layout: { height: 0, gap: 0 }, children: [
    { type: 'Panel', id: 'life-host-top-hud', props: { bare: true }, layout: { height: 0 }, children: [tracker, status, right] },
    ...(legacy.children ?? []).filter((node) => node !== legacyHud && node.type !== 'Drawer'), ...drawers,
  ] };
}
