// File-only PUI fixture: no launcher, account, database, or persistent browser profile.
import { mountUI } from './index.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode, UITheme } from './types.js';

const daylight: UITheme = { ...SHELL,
  bg0: '#dde4ee', bg1: '#f4f7fc', bg2: '#ffffff', bg3: '#e7edf6',
  line: 'rgba(28,48,80,0.16)', text: '#1b2434', sub: '#46546a', dim: '#8893a6',
  jade: '#138a76', jadeWash: 'rgba(19,138,118,0.12)', jadeLine: 'rgba(19,138,118,0.42)',
  gold: '#b07d22', ok: '#2e9b5b', okWash: 'rgba(46,155,91,0.14)',
  warn: '#c2871c', warnWash: 'rgba(194,135,28,0.14)', danger: '#cf513c',
};
const feedback = { hoverBrightness: 1.32, pressedBrightness: 0.85, glowRadius: 8,
  glowColor: { custom: '#a7b2ff99' }, transitionMs: 160 } as const;
const tree = (open: boolean): LayoutNode => ({ type: 'Panel', id: 'stage', props: { bg: 'panel' },
  layout: { direction: 'column', gap: 16, padding: 24 }, children: [
    { type: 'Label', id: 'page-title', props: { text: 'PUI V2 visual slots', size: 'xl', bold: true } },
    { type: 'Label', id: 'cue', props: { text: 'Story cue', color: 'gold' }, layout: { fx: [{ kind: 'cue', ms: 1300 }] } },
    { type: 'Button', id: 'skin-button', props: { label: '继续', skin: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%2272%22%3E%3Crect width=%22200%22 height=%2272%22 rx=%2212%22 fill=%22%233b4592%22/%3E%3C/svg%3E', skinFeedback: feedback, action: 'skin.start' }, layout: { width: 200, height: 72 } },
    { type: 'Button', id: 'disabled-button', props: { label: '禁用', skin: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%2272%22%3E%3Crect width=%22200%22 height=%2272%22 fill=%22%233b4592%22/%3E%3C/svg%3E', skinFeedback: feedback, action: 'skin.disabled', disabled: true }, layout: { width: 200, height: 72 } },
    { type: 'Button', id: 'legacy-button', props: { label: '缺省', skin: '/art/old.png', action: 'legacy' } },
    { type: 'Button', id: 'open-button', props: { label: '打开 Modal', action: 'modal.open' } },
    ...(open ? [{ type: 'Modal', id: 'modal', props: { title: '系统设置', size: 'xl', closeAction: 'modal.close', visual: { minHeight: 310, padding: 22, titleSize: 30, titleAlign: 'center', contentAlign: 'center' } },
      children: [{ type: 'Label', id: 'modal-body', props: { text: '可访问的设置内容', color: 'sub' } },
        { type: 'Button', id: 'modal-ok', props: { label: '确认', action: 'modal.close' } }] } as LayoutNode] : []),
  ] });

const auditWindow = window as typeof window & { __v2Actions?: string[] };
auditWindow.__v2Actions = [];
let open = location.hash !== '#closed';
const mounted = mountUI(document.getElementById('root')!, tree(open), {}, location.search === '?light' ? daylight : SHELL, {
  enqueueAction: (name) => {
    auditWindow.__v2Actions?.push(name);
    if (name === 'modal.close' || name === 'modal.open') {
      open = name === 'modal.open';
      mounted.update(tree(open));
    }
  },
});
