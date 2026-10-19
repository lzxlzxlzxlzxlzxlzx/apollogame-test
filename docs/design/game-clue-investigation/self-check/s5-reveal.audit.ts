// S5 证物态 LayoutNode 对比/重叠审计入口；只过滤可见条件，不写世界。
import manifest from '../../../../library/game-clue-investigation/manifest.json';
import { mountUI, apolloOnyx } from '@ui/components/index.js';
import type { LayoutNode } from '@ui/components/types.js';
import { daylight } from '../../../../games/game-i/themes.js';

const state = import.meta.env.VITE_GCI_AUDIT_STATE || 'reveal';
const visible = new Set([`flow.${state}`, state === 'flavor' ? 'selected.cup' : 'selected.lock', ...(state === 'flavor' ? [] : ['records-open'])]);
function project(node: LayoutNode): LayoutNode | null {
  const when = (node as LayoutNode & { visibleWhen?: string }).visibleWhen;
  if (when && (when.startsWith('!') ? visible.has(when.slice(1)) : !visible.has(when))) return null;
  const children = node.children?.map(project).filter((child): child is LayoutNode => child !== null);
  return { ...node, ...(children ? { children } : {}) };
}

const ui = project(manifest.presentation.ui as LayoutNode);
if (!ui) throw new Error('S5 reveal UI 为空');
mountUI(document.getElementById('root')!, ui, {}, import.meta.env.VITE_GCI_AUDIT_LIGHT ? daylight : apolloOnyx);
