// UI-03 shared field fixture; no GCI manifest or asset writes.
import { mountUI } from '../../src/ui/components/index.js';
import type { LayoutNode, UITheme } from '../../src/ui/components/types.js';
import { SHELL } from '../../src/ui/shell-theme.js';

const ink = { custom: '#253333' } as const;
const tree: LayoutNode = { type: 'Panel', id: 'ui03-paper', props: { bg: { custom: '#F3E9D4' } },
  layout: { direction: 'column', gap: 24, padding: 28, width: 480 }, children: [
    { type: 'Label', id: 'ui03-copy', props: { text: '多行证据叙述\n第二行仍按基线排列', size: 19, lineHeight: 30.4, color: ink } },
    { type: 'Panel', id: 'ui03-stamp', props: { bg: 'transparent', border: { width: 5, color: { custom: '#8B3131' } } },
      layout: { radius: 0, padding: 12, width: 150 }, children: [
        { type: 'Label', id: 'ui03-stamp-copy', props: { text: '已收录', size: 20, weight: 900, color: ink } },
      ] },
  ] };

export function mountGciUi03Audit(theme: UITheme = SHELL): void {
  mountUI(document.getElementById('root')!, tree, {}, theme);
}
mountGciUi03Audit();
