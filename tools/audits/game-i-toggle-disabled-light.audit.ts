// GAL-PUI-04A：亮色主题下 Toggle.disabled 活范例的浏览器布局/对比审计。
import { mountUI } from '../../src/ui/components/index.js';
import { THEMES } from '../../games/game-i/themes.js';

mountUI(document.getElementById('root')!, {
  type: 'Panel', id: 'toggle-disabled-light-fixture', props: { title: 'Toggle.disabled · 亮色主题', bg: 'raised' }, layout: { direction: 'column', gap: 14, padding: 18 }, children: [
    { type: 'Toggle', id: 'toggle-disabled-light-on', props: { label: '音效（待接入）', checked: true, action: 'toggle.sound', disabled: true } },
    { type: 'Toggle', id: 'toggle-disabled-light-off', props: { label: '自动播放（待接入）', checked: false, action: 'toggle.auto', disabled: true } },
  ],
}, {}, THEMES.daylight!);
