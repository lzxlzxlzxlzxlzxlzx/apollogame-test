// File-only Chromium fixture; no launcher, service, account, or persistent profile.
import { mountUI } from './index.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode, ToggleVisual, UITheme } from './types.js';

const daylight: UITheme = { ...SHELL,
  bg0: '#dde4ee', bg1: '#f4f7fc', bg2: '#ffffff', bg3: '#e7edf6',
  line: 'rgba(28,48,80,0.16)', text: '#1b2434', sub: '#46546a', dim: '#8893a6',
  jade: '#138a76', jadeWash: 'rgba(19,138,118,0.12)', jadeLine: 'rgba(19,138,118,0.42)',
  gold: '#b07d22', ok: '#2e9b5b', okWash: 'rgba(46,155,91,0.14)',
  warn: '#c2871c', warnWash: 'rgba(194,135,28,0.14)', danger: '#cf513c',
};
const visual: ToggleVisual = {
  width: 75, height: 31, knobSize: 22, knobOffLeft: 4, knobOnLeft: 46, knobTop: 3,
  offBackground: { custom: '#1b2445' }, onBackground: { custom: '#5b679e' }, border: { custom: '#d8c389' },
  offKnob: { custom: '#8b9ac3' }, onKnob: { custom: '#eff1ff' },
};
const makeTree = (on: boolean): LayoutNode => ({ type: 'Panel', id: 'toggle-stage', props: { bg: 'panel' },
  layout: { direction: 'column', gap: 20, padding: 24 }, children: [
    { type: 'Label', id: 'title', props: { text: 'Toggle.visual · measured opt-in', size: 'xl', bold: true } },
    { type: 'Panel', id: 'row', props: { bare: true }, layout: { direction: 'row', gap: 40, align: 'center' }, children: [
      { type: 'Label', id: 'measured-row-name', props: { text: '自动语音', color: 'sub' } },
      { type: 'Toggle', id: 'measured', props: { label: '自动语音', checked: on, action: 'toggle.voice', visual: { ...visual, showLabel: false } } },
      { type: 'Label', id: 'disabled-row-name', props: { text: '禁用', color: 'sub' } },
      { type: 'Toggle', id: 'disabled', props: { label: '禁用', checked: true, disabled: true, action: 'toggle.voice', visual: { ...visual, showLabel: false } } },
      { type: 'Toggle', id: 'legacy', props: { label: '旧缺省', checked: false, action: 'toggle.legacy' } },
    ] },
  ] });
const auditWindow = window as typeof window & { __toggleActions?: string[] };
auditWindow.__toggleActions = [];
let checked = false;
const mounted = mountUI(document.getElementById('root')!, makeTree(checked), {}, location.hash === '#light' ? daylight : SHELL, {
  enqueueAction: (name, payload) => {
    auditWindow.__toggleActions?.push(`${name}:${payload?.arg}`);
    if (name === 'toggle.voice') { checked = payload?.arg === 'true'; mounted.update(makeTree(checked)); }
  },
});
