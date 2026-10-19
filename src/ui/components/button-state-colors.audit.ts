// Isolated PUI visual fixture: file:// only, no ZeroCraft service or persistent browser profile.
import { mountUI } from './index.js';
import { SHELL } from '../shell-theme.js';
import type { ButtonStateColors, LayoutNode, UITheme } from './types.js';

// Test-only daylight variant stays in the PUI fixture so src never imports a game.
const daylight: UITheme = { ...SHELL,
  bg0: '#dde4ee', bg1: '#f4f7fc', bg2: '#ffffff', bg3: '#e7edf6',
  line: 'rgba(28,48,80,0.16)', text: '#1b2434', sub: '#46546a', dim: '#8893a6',
  jade: '#138a76', jadeWash: 'rgba(19,138,118,0.12)', jadeLine: 'rgba(19,138,118,0.42)',
  gold: '#b07d22', ok: '#2e9b5b', okWash: 'rgba(46,155,91,0.14)',
  warn: '#c2871c', warnWash: 'rgba(194,135,28,0.14)', danger: '#cf513c',
};

const palette: ButtonStateColors = {
  default: { background: { custom: '#101A36' }, border: { custom: '#D7BD80' }, text: { custom: '#F4EEFF' } },
  hover: { background: { custom: '#535C91' }, border: { custom: '#E4D6AA' }, text: { custom: '#FFFFFF' } },
  pressed: { background: { custom: '#293359' }, border: { custom: '#F1D691' }, text: { custom: '#FFFFFF' } },
  disabled: { background: { custom: '#30384B' }, border: { custom: '#8690A3' }, text: { custom: '#D8DEEB' } },
};

const tree: LayoutNode = { type: 'Panel', id: 'state-stage', props: { bg: 'panel' }, layout: { direction: 'column', gap: 18, padding: 24 }, children: [
  { type: 'Label', id: 'state-title', props: { text: 'Button.stateColors · four native states', size: 'xl', bold: true, color: 'text' } },
  { type: 'Panel', id: 'state-row', props: { bare: true }, layout: { direction: 'row', gap: 18 }, children: [
    { type: 'Button', id: 'state-enabled', props: { label: '胶囊 · 可点击', kind: 'ghost', shape: 'pill', stateColors: palette, action: 'demo.click' }, layout: { width: 208, height: 44 } },
    { type: 'Button', id: 'state-disabled', props: { label: '胶囊 · 禁用', kind: 'ghost', shape: 'pill', stateColors: palette, disabled: true, action: 'demo.click' }, layout: { width: 208, height: 44 } },
  ] },
] };

const auditWindow = window as typeof window & { __stateActions?: number };
auditWindow.__stateActions = 0;
mountUI(document.getElementById('root')!, tree, {}, location.hash === '#light' ? daylight : SHELL, {
  enqueueAction: () => { auditWindow.__stateActions = (auditWindow.__stateActions ?? 0) + 1; },
});
