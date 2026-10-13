import type { LifeHostDescriptorV1, LifeHostLabelKey } from '../../authoring/life-host-descriptor.js';
import type { LayoutNode } from '../../ui/components/index.js';
import { humanizeLifeId, type LifeHostViewModel } from './life-presenter.js';

export type LifeHostHudConfig = LifeHostDescriptorV1['hud'];
const DEFAULT_LABELS: Readonly<Record<LifeHostLabelKey, string>> = Object.freeze({
  date: '日期', 'time-slot': '时段', place: '地点', inventory: '背包', interaction: '互动', objective: '目标', 'advance-time': 'T：消磨时光', 'advance-day': 'N：休息至明日', relationships: '关系', 'selected-item': '物品', 'selected-target': '目标',
});

export function resolveLifeHostLabel(config: LifeHostHudConfig, key: LifeHostLabelKey): string {
  return config.labels?.[key] ?? DEFAULT_LABELS[key];
}

export function buildLifeStandardHud(view: LifeHostViewModel, config: LifeHostHudConfig): LayoutNode {
  const label = (key: LifeHostLabelKey): string => resolveLifeHostLabel(config, key);
  const bag = view.inventory.map((stack) => `${humanizeLifeId(stack.itemId)} ×${stack.count}`).join(' · ') || '—';
  return { type: 'Panel', id: 'life-host-top-hud', props: { bg: 'raised', edge: 'gold' }, layout: { height: 50, direction: 'row', justify: 'between', align: 'center', gap: 12, padding: 8, radius: 8 }, children: [
    { type: 'Panel', id: 'life-host-title', props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 10 }, children: [
      { type: 'Label', id: 'life-host-name', props: { text: config.title ?? 'Life', size: 'lg', bold: true, color: 'text' } },
      { type: 'Label', id: 'life-host-objective', props: { text: `${label('objective')}：${view.objective}`, size: 'sm', color: 'jade', bold: true } },
    ] },
    { type: 'Panel', id: 'life-host-stats', props: { bare: true }, layout: { direction: 'row', align: 'center', gap: 10 }, children: [
      { type: 'Label', id: 'life-host-date', props: { text: `${label('date')} ${view.date}`, color: 'text', size: 'sm', bold: true } },
      { type: 'Badge', id: 'life-host-place', props: { text: `${label('place')} ${view.placeLabel}`, tone: 'accent' } },
      { type: 'Badge', id: 'life-host-slot', props: { text: `${label('time-slot')} ${view.slot}`, tone: 'accent' } },
      ...view.relationships.map((entry): LayoutNode => ({ type: 'Badge', id: `life-host-relationship-${entry.npcId}`, props: { text: `${humanizeLifeId(entry.npcId)} ${entry.levelTitle || humanizeLifeId(entry.levelId)} ${entry.value}`, tone: 'accent' } })),
      { type: 'Label', id: 'life-host-bag', props: { text: `${label('inventory')} ${bag}`, color: 'text', size: 'sm', bold: true } },
      { type: 'Panel', id: 'life-host-advance-time', props: { bare: true, action: 'life.advance-time' }, layout: { press3d: true }, children: [{ type: 'Label', id: 'life-host-advance-time-label', props: { text: label('advance-time'), color: 'text', size: 'sm', bold: true } }] },
      { type: 'Panel', id: 'life-host-advance-day', props: { bare: true, action: 'life.advance-day' }, layout: { press3d: true }, children: [{ type: 'Label', id: 'life-host-advance-day-label', props: { text: label('advance-day'), color: 'text', size: 'sm', bold: true } }] },
    ] },
  ] };
}

export function buildLifeStandardUi(view: LifeHostViewModel, config: LifeHostHudConfig, worldInteraction?: LayoutNode | null): LayoutNode {
  return { type: 'Panel', id: 'life-host-audit-root', props: { bare: true }, layout: { direction: 'column', gap: 8 }, children: [buildLifeStandardHud(view, config), ...(worldInteraction ? [worldInteraction] : [])] };
}
