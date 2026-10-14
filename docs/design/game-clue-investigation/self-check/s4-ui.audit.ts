// check-ui 结构审计入口：S4 idle 纯数据界面，局部 UI 工具只量布局与对比度。
import manifest from '../../../../library/game-clue-investigation/manifest.json';
import { mountUI, apolloOnyx } from '@ui/components/index.js';
import type { LayoutNode } from '@ui/components/types.js';

const idleFlags = new Set(['flow.idle']);
function idleOnly(node: LayoutNode): LayoutNode | null {
  const condition = (node as LayoutNode & { visibleWhen?: string }).visibleWhen;
  if (condition && (condition.startsWith('!') ? idleFlags.has(condition.slice(1)) : !idleFlags.has(condition))) return null;
  const children = node.children?.map(idleOnly).filter((child): child is LayoutNode => child !== null);
  return { ...node, ...(children ? { children } : {}) };
}

const root = idleOnly(manifest.presentation.ui as LayoutNode);
if (!root) throw new Error('S4 idle UI 为空');
mountUI(document.getElementById('root')!, root, {}, apolloOnyx);
