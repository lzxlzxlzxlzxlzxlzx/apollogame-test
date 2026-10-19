// GCI-S6-UI-02 paper Modal fixture. The UI remains LayoutNode data; no game manifest or art is touched.
import { mountUI } from '../../src/ui/components/index.js';
import type { LayoutNode, UITheme } from '../../src/ui/components/types.js';
import { SHELL } from '../../src/ui/shell-theme.js';

const image = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22702%22 height=%22468%22 viewBox=%220 0 702 468%22%3E%3Crect width=%22702%22 height=%22468%22 fill=%22%237a6345%22/%3E%3Crect x=%2224%22 y=%2224%22 width=%22654%22 height=%22420%22 fill=%22%23ddc99a%22/%3E%3C/svg%3E';
const ink = { custom: '#251B11' } as const;
const buttonColors = {
  default: { background: { custom: '#E3B765' }, border: { custom: '#5D452E' }, text: ink },
  hover: { background: { custom: '#F0C980' }, border: { custom: '#5D452E' }, text: ink },
  pressed: { background: { custom: '#D4A856' }, border: { custom: '#5D452E' }, text: ink },
  disabled: { background: { custom: '#DDC99A' }, border: { custom: '#5D452E' }, text: ink },
} as const;
const node: LayoutNode = { type: 'Modal', id: 'gci-paper-modal', props: {
  title: '证据收录', titleColor: ink, size: 'xl', closable: false, closeAction: 'close',
  visual: { width: 820, radius: 0, padding: { top: 26, right: 40, bottom: 26, left: 40 },
    fill: { gradient: { from: '#E7DDC2', to: '#BBA875' } }, border: { width: 12, color: '#5D452E' } },
  scrim: { blur: 3 },
}, children: [
  { type: 'Image', id: 'gci-paper-image', props: { src: image, alt: '测试用证据图', fit: 'cover', position: 'top' }, layout: { width: 702, height: 260 } },
  { type: 'Label', id: 'gci-paper-copy', props: { text: '这是一条可读、可收录的线索。', color: ink, size: 16 }, layout: { margin: 12 } },
  { type: 'Button', id: 'gci-paper-button', props: { label: '收录证据', kind: 'ghost', labelSize: 16, labelWeight: 700, stateColors: buttonColors, action: 'collect' }, layout: { width: 180, height: 44 } },
] };

export const daylight: UITheme = { ...SHELL,
  bg0: '#dde4ee', bg1: '#f4f7fc', bg2: '#ffffff', bg3: '#e7edf6',
  line: 'rgba(28,48,80,0.16)', text: '#1b2434', sub: '#46546a', dim: '#8893a6',
};
export function mountGciS6Audit(theme: UITheme = SHELL): void {
  mountUI(document.getElementById('root')!, node, {}, theme);
}

mountGciS6Audit();
