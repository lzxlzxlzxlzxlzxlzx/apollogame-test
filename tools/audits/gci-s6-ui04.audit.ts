// UI-04 field fixture only; no GCI manifest, user data, or art writes.
import { mountUI } from '../../src/ui/components/index.js';
import type { LayoutNode, UITheme } from '../../src/ui/components/types.js';
import { SHELL } from '../../src/ui/shell-theme.js';

const ink = { custom: '#251B11' } as const;
const buttonColors = {
  default: { background: { custom: '#E3B765' }, border: ink, text: ink },
  hover: { background: { custom: '#F0C980' }, border: ink, text: ink },
  pressed: { background: { custom: '#D4A856' }, border: ink, text: ink },
  disabled: { background: { custom: '#DDC99A' }, border: ink, text: ink },
} as const;
const tree: LayoutNode = { type: 'Modal', id: 'ui04-complete', props: {
  title: '调查完成', titleColor: ink, size: 'xl', closable: false,
  visual: { width: 690, minHeight: 350, radius: 0,
    fill: { gradient: { from: '#E7DDC2', to: '#BBA875' } }, border: { width: 12, color: '#5D452E' },
    outerRing: { width: 12, color: '#d2a54c22' }, enter: 'lift-600' },
}, children: [
  { type: 'Label', id: 'ui04-copy', props: { text: '三件线索已归档', color: ink, size: 19, lineHeight: 30 } },
  { type: 'Button', id: 'ui04-restart', props: { label: '重新开始', kind: 'ghost', stateColors: buttonColors,
    borderWidth: 2, focusRingVisual: { color: { custom: '#2EAFBE' }, width: 3, offset: 3 }, action: 'restart' },
    layout: { width: 180, height: 48, margin: 20 } },
] };

export function mountGciUi04Audit(theme: UITheme = SHELL): void {
  mountUI(document.getElementById('root')!, tree, {}, { ...theme, fontUi: "'Microsoft YaHei', '微软雅黑', sans-serif" });
}
mountGciUi04Audit();
