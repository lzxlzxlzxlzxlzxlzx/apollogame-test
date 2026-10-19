import { mountUI } from './index.js';
import { SHELL } from '../shell-theme.js';

const host = document.querySelector<HTMLElement>('#root')!;
mountUI(host, {
  type: 'Screen', id: 'access-audit-screen', props: { center: true }, children: [
    { type: 'Panel', id: 'access-audit-card', props: { title: 'ACCESSIBILITY' }, layout: { direction: 'column', gap: 16, padding: 28, width: 420 }, children: [
      { type: 'Label', id: 'access-audit-title', props: { text: '高对比与缩放', size: 'xl', color: 'text', bold: true } },
      { type: 'Label', id: 'access-audit-copy', props: { text: '语义文字与键盘焦点保持清晰。', color: 'sub' } },
      { type: 'Button', id: 'access-audit-button', props: { label: '继续', kind: 'primary', action: 'continue' } },
    ] },
  ],
}, {}, SHELL, undefined, undefined, { highContrast: true, scale: '110' });
