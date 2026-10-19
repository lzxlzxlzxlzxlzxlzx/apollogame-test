// S5 证物态 LayoutNode 对比/重叠审计入口；只过滤可见条件，不写世界。
import formalManifest from '../../../../library/game-clue-investigation/manifest.json';
import candidateManifest from './S6-ui02.candidate.json';
import { mountUI, apolloOnyx } from '@ui/components/index.js';
import type { LayoutNode } from '@ui/components/types.js';
import { parseAssetIndex } from '@zerocraft/engine/assets/asset-index.js';
import { resolveCartSkins } from '@zerocraft/engine/assets/cart-art.js';
import type { CartPresentation } from '@zerocraft/engine/assembly/cart-presentation.js';
import rawIndex from '../../../../library/game-clue-investigation/art/index.json';
import { daylight } from '../../../../games/game-i/themes.js';

const state = import.meta.env.VITE_GCI_AUDIT_STATE || 'reveal';
const manifest = import.meta.env.VITE_GCI_UI02_CANDIDATE ? candidateManifest : formalManifest;
const visible = new Set([`flow.${state}`, state === 'flavor' ? 'selected.cup' : 'selected.lock', ...(state === 'flavor' ? [] : ['records-open'])]);
function project(node: LayoutNode): LayoutNode | null {
  const when = (node as LayoutNode & { visibleWhen?: string }).visibleWhen;
  if (when && (when.startsWith('!') ? visible.has(when.slice(1)) : !visible.has(when))) return null;
  const children = node.children?.map(project).filter((child): child is LayoutNode => child !== null);
  return { ...node, ...(children ? { children } : {}) };
}

const resolved = resolveCartSkins(manifest.presentation as CartPresentation, parseAssetIndex(rawIndex));
const ui = project(resolved!.ui as LayoutNode);
if (!ui) throw new Error('S5 reveal UI 为空');
mountUI(document.getElementById('root')!, ui, {}, import.meta.env.VITE_GCI_AUDIT_LIGHT ? daylight : apolloOnyx);
